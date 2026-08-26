import { db } from '../../db/index.js';
import { leads } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth, canSeeAll, isReadOnly, requireRole, requireWrite } from './auth.mjs';
import { dispatchWebhook } from './webhooks.mjs';
import { dispatchAutomations } from './dispatch-automations.mjs';
import { serverErrorBody, writeAudit, getCallerName, bulkInsert, assertOwnership } from './_lib.mjs';
import { deletionAudit } from './_audit.mjs';
import { settings as settingsTable, activities as activitiesTable } from '../../db/schema.js';
import { scoreLead, DEFAULT_LEAD_SCORING } from './score-lead.mjs';

async function getLeadScoring(orgId) {
    try {
        const [row] = await db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId));
        return row?.extra?.leadScoring || DEFAULT_LEAD_SCORING;
    } catch (e) { return DEFAULT_LEAD_SCORING; }
}

async function scoreColumns(orgId, lead, cfg) {
    let events = [];
    if (lead.id) {
        try {
            const acts = await db.select().from(activitiesTable).where(and(eq(activitiesTable.orgId, orgId), eq(activitiesTable.leadId, lead.id)));
            events = acts.map(a => ({ type: a.type, at: a.date || a.createdAt }));
        } catch (e) { /* no events */ }
    }
    const sc = scoreLead(lead, cfg, Date.now(), events);
    return sc ? { ...sc, scoreUpdatedAt: new Date() } : {};
}

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole } = auth;

    // Server-side role enforcement: ReadOnly can never mutate, regardless of
    // what the client UI allows. Runs before any handler logic.
    // Shared write gate. Denies ReadOnly AND Technician: a technician's only
    // write capability is the field whitelist in dispatch-jobs.mjs, so they must
    // not be able to mutate CRM records. Previously this checked isReadOnly
    // alone, which would have granted a new role full write access by default.
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    const sanitize = (d) => ({
        id:             d.id,
        firstName:      d.firstName    || null,
        lastName:       d.lastName     || null,
        company:        d.company      || null,
        title:          d.title        || null,
        email:          d.email        || null,
        phone:          d.phone        || null,
        source:         d.source       || null,
        status:         d.status       || 'New',
        score:          d.score        ?? 50,
        estimatedARR:   d.estimatedARR ?? null,
        assignedTo:     d.assignedTo   || null,
        notes:          d.notes        || null,
        convertedAt:    d.convertedAt  || null,
        firstTouchDate: d.firstTouchDate || null,
    });

    try {
        if (event.httpMethod === 'GET') {
            let results = await db.select().from(leads).where(eq(leads.orgId, orgId)).orderBy(asc(leads.createdAt));
            if (!canSeeAll(userRole)) {
                // assignedTo stores a display name, so the caller's name is what
                // this filters on.
                //
                // THIS WAS BROKEN BY THE IDENTITY SPLIT, identically to the
                // opportunities GET. It matched `users.id` against the CLERK id,
                // which stopped resolving when users.id became usr_<uuid>. The
                // lookup returned no row, repDisplayName fell to null, and every
                // rep saw ONLY unassigned leads -- silently, because an empty
                // result is not an error and the catch never fired. It was also
                // unscoped across orgs.
                //
                // A caller getCallerName cannot resolve stays null and sees only
                // unassigned leads: the same fail-closed direction mayMutate()
                // takes on the write path.
                const repDisplayName = await getCallerName(userId, orgId);
                results = results.filter(l => !l.assignedTo || l.assignedTo === repDisplayName);
            }
            return { statusCode: 200, headers, body: JSON.stringify({ leads: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);

            // Bulk insert — body is an array. The CSV importer has always sent
            // one, and this branch did not exist: an array has no `.id`, so
            // every leads import fell into the single-insert guard below and
            // returned 400 'id is required' before touching the database. The
            // import had therefore never worked. Mirrors the accounts and
            // contacts POST branches (18b8).
            if (Array.isArray(data)) {
                if (data.length === 0) return { statusCode: 200, headers, body: JSON.stringify({ leads: [], inserted: 0, failed: [] }) };
                if (data.some(d => !d.id)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'every row requires an id' }) };

                // Config read ONCE for the batch, not once per row.
                const cfgBulk = await getLeadScoring(orgId);
                const nowIso = new Date().toISOString();
                const rows = data.map(d => {
                    const clean = sanitize(d);
                    // scoreColumns() queries activities by leadId to fold
                    // engagement into the score. These ids are freshly minted by
                    // the client, so that query can only ever return zero rows —
                    // scoring inline with no events skips one DB round-trip per
                    // lead, which at 400 rows a chunk is the difference between
                    // finishing and hitting the function timeout.
                    const sc = scoreLead({ ...clean, createdAt: nowIso }, cfgBulk, Date.now(), []);
                    return { ...clean, ...(sc ? { ...sc, scoreUpdatedAt: new Date() } : {}) };
                });

                // Chunked with per-row isolation by bisection — see bulkInsert
                // in _bulk.mjs (18b8). One malformed row no longer discards the
                // whole import.
                const result = await bulkInsert({ table: leads, rows, orgId });

                // Deliberately no lead.created webhook or automation dispatch on
                // this path: firing N of them inline would exceed the same time
                // budget bulkInsert is bounded by. The single-insert branch below
                // still dispatches. Bulk-import notification is a separate job —
                // see the note in ACCELEREP_CURRENT_STATE.
                return { statusCode: 201, headers, body: JSON.stringify(result) };
            }

            // Single insert
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };
            const cleanPost = sanitize(data);
            const cfgPost = await getLeadScoring(orgId);
            const scoredPost = await scoreColumns(orgId, { ...cleanPost, createdAt: new Date().toISOString() }, cfgPost);
            const [inserted] = await db.insert(leads).values({ ...cleanPost, ...scoredPost, orgId }).returning();

            // Webhook: lead.created
            await dispatchWebhook(orgId, 'lead.created', {
                id:            inserted.id,
                first_name:    inserted.firstName,
                last_name:     inserted.lastName,
                company:       inserted.company,
                email:         inserted.email,
                source:        inserted.source,
                status:        inserted.status,
                score:         inserted.score,
                estimated_arr: inserted.estimatedARR ? Number(inserted.estimatedARR) : null,
                assigned_to:   inserted.assignedTo,
            });
            dispatchAutomations(orgId, 'lead.created', {
                id: inserted.id, first_name: inserted.firstName, last_name: inserted.lastName,
                company: inserted.company, email: inserted.email, assigned_to: inserted.assignedTo,
            }).catch(e => console.warn('auto error:', e.message));

            return { statusCode: 201, headers, body: JSON.stringify({ lead: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };

            // Fetch existing so we can detect first-time conversion and first touch
            const [existing] = await db.select().from(leads).where(and(eq(leads.id, data.id), eq(leads.orgId, orgId)));
            // PUT is strictly an update: unknown ids 404 instead of silently creating.
            if (!existing) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Lead not found' }) };
            }
            // Object-level authorization: reps may only edit their own or
            // unassigned leads. `existing` is the full row, already loaded above,
            // so no second query is issued.
            const forbiddenPut = await assertOwnership({
                table: leads, entity: 'lead', id: data.id, orgId, userId, userRole, headers, row: existing,
            });
            if (forbiddenPut) return forbiddenPut;
            const wasConverted = existing?.status === 'Converted';

            const clean = sanitize(data);
            const today = new Date().toISOString().slice(0, 10);

            // Auto-set convertedAt the first time status flips to Converted
            if (!wasConverted && clean.status === 'Converted' && !clean.convertedAt) {
                clean.convertedAt = today;
            }

            // Auto-set firstTouchDate once — when the lead is first assigned or
            // status moves beyond New for the first time. Never overwrite once set.
            if (!existing?.firstTouchDate && !clean.firstTouchDate) {
                const isNowTouched = clean.assignedTo || (clean.status && clean.status !== 'New');
                if (isNowTouched) {
                    clean.firstTouchDate = today;
                }
            } else if (existing?.firstTouchDate && !clean.firstTouchDate) {
                // Preserve existing value — sanitize may have nulled it if not in payload
                clean.firstTouchDate = existing.firstTouchDate;
            }

            const cfgPut = await getLeadScoring(orgId);
            Object.assign(clean, await scoreColumns(orgId, clean, cfgPut));

            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(leads).values({ ...clean, orgId })
                .onConflictDoUpdate({ target: leads.id, setWhere: eq(leads.orgId, orgId), set: { ...updateData, updatedAt: new Date() } })
                .returning();

            // Org-scoped upsert returns nothing if the row isn't in this org
            // (e.g. a cross-tenant id) — treat as not-found instead of crashing.
            if (!upserted) {
                return { statusCode: 404, headers, body: JSON.stringify({ error: 'Lead not found in your organization' }) };
            }

            // Webhook: lead.converted — only fires the first time status flips to Converted
            if (!wasConverted && upserted.status === 'Converted') {
                await dispatchWebhook(orgId, 'lead.converted', {
                    id:            upserted.id,
                    first_name:    upserted.firstName,
                    last_name:     upserted.lastName,
                    company:       upserted.company,
                    email:         upserted.email,
                    assigned_to:   upserted.assignedTo,
                    converted_at:  upserted.convertedAt,
                });
                dispatchAutomations(orgId, 'lead.converted', {
                    id: upserted.id, first_name: upserted.firstName, last_name: upserted.lastName,
                    company: upserted.company, email: upserted.email, assigned_to: upserted.assignedTo,
                }).catch(e => console.warn('auto error:', e.message));
            }

            return { statusCode: 200, headers, body: JSON.stringify({ lead: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            if (event.queryStringParameters?.clear === 'true') {
                // Org-wide wipe — Admin only.
                const forbidden = requireRole(auth, ['Admin'], headers);
                if (forbidden) return forbidden;
                const deleted = await db.delete(leads).where(eq(leads.orgId, orgId)).returning({ id: leads.id });
                await writeAudit(orgId, {
                    action: 'lead.cleared', entityType: 'lead', entityId: 'ALL',
                    entityName: 'All leads', detail: `Cleared ${deleted.length} leads via clear=true`, userId,
                });
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true, count: deleted.length }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            // Object-level authorization: reps may only delete their own or
            // unassigned leads.
            //
            // ORDERING IS LOAD-BEARING: this must stay ABOVE the Admin role gate.
            // Both refusals are 403 and only the body distinguishes them, so a
            // non-owner gets the ownership message and an owner gets the role
            // message. The delete gate asserts that split.
            const forbiddenOwn = await assertOwnership({
                table: leads, entity: 'lead', id, orgId, userId, userRole, headers,
            });
            if (forbiddenOwn) return forbiddenOwn;
            // Admin only. Reps close deals Won or Lost rather than deleting them,
            // and that rule was DESIGN INTENT ONLY -- this branch was ownership-
            // checked, so canSeeAll being false for a rep still let them delete
            // their own records through the API. The clear=true branch above has
            // always been gated; this one never was.
            const forbiddenDelete = requireRole(auth, ['Admin'], headers);
            if (forbiddenDelete) return forbiddenDelete;
            // .returning() rather than a bare delete: a hard delete destroys the
            // audit trail's subject, so the row has to be captured in the same
            // statement that removes it. An id alone cannot be resolved back to a
            // name once the record is gone.
            const [deletedRow] = await db.delete(leads).where(and(eq(leads.id, id), eq(leads.orgId, orgId))).returning();
            // An unknown id used to return success:true. It deleted nothing.
            if (!deletedRow) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
            await writeAudit(orgId, deletionAudit('lead', deletedRow, { userId, byRole: 'Admin' }));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Leads error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'leads') };
    }
};
