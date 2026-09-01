import { db } from '../../db/index.js';
import { leads } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth, canSeeAll, isReadOnly, requireRole, requireWrite } from './auth.mjs';
import { dispatchWebhook } from './webhooks.mjs';
import { dispatchAutomations } from './dispatch-automations.mjs';
import {
    serverErrorBody, writeAudit, getCallerId, bulkInsert, assertOwnership,
    stampOwnerId, stampOwnerIds, ownerIdForUpdate, resolveOwnerId, ambiguousOwnerResponse,
} from './_lib.mjs';
import { deletionAudit } from './_audit.mjs';
import { settings as settingsTable, activities as activitiesTable } from '../../db/schema.js';
import { scoreLead, DEFAULT_LEAD_SCORING } from './score-lead.mjs';

async function getLeadScoring(orgId) {
    try {
        const [row] = await db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId));
        return row?.extra?.leadScoring || DEFAULT_LEAD_SCORING;
    } catch (e) { return DEFAULT_LEAD_SCORING; }
}

// Read-side policy: may reps see unassigned leads? Admin-set, org-wide,
// default TRUE — an absent key means "never configured" and must reproduce the
// standing policy (unassigned visible to everyone), so flipping this on deploy
// changes nothing for any existing org.
//
// Deliberately NOT the getLeadScoring shape. That helper swallows errors and
// returns a default, which is fine for scoring — a failed read costs a stale
// score. This flag decides what a rep is SHOWN, so a failed read must not
// silently pick a fail direction in either sense; it throws to the handler's
// outer catch and the request 500s instead of guessing.
async function getUnassignedLeadsVisible(orgId) {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId));
    return row?.extra?.unassignedLeadsVisibleToReps ?? true;
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
                // Visibility keys on the OWNER ID now. The display-name
                // comparison this replaces was the same string equality the
                // write path used, so a renamed user disappeared from their own
                // list and two users sharing a name saw each other's records.
                //
                // A caller who cannot be resolved stays null and sees only
                // unassigned rows — the same fail-closed direction mayMutate()
                // takes on writes.
                const callerId = await getCallerId(userId, orgId);
                // Whether the unassigned rows are visible at all is an admin
                // policy (settings.extra.unassignedLeadsVisibleToReps). The
                // strict branch guards the OWNER side with `!!l.ownerId`
                // because a bare `l.ownerId === callerId` matches null === null:
                // an unresolvable caller would receive exactly the unassigned
                // rows the toggle hides — two absences comparing equal in the
                // permissive direction, the 18b22 shape. With the guard, a null
                // caller under the strict policy sees NOTHING, which is the
                // fail-closed reading of both rules at once.
                const unassignedVisible = await getUnassignedLeadsVisible(orgId);
                results = unassignedVisible
                    ? results.filter(l => !l.ownerId || l.ownerId === callerId)
                    : results.filter(l => !!l.ownerId && l.ownerId === callerId);
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
                const owned = await stampOwnerIds(rows, 'lead', { clerkUserId: userId, orgId });
                const result = await bulkInsert({ table: leads, rows: owned.rows, orgId });
                result.ambiguousOwners = owned.ambiguousOwners;
                result.unmatchedOwners = owned.unmatchedOwners;

                // Deliberately no lead.created webhook or automation dispatch on
                // this path: firing N of them inline would exceed the same time
                // budget bulkInsert is bounded by. The single-insert branch below
                // still dispatches. Bulk-import notification is a separate job —
                // see the note in ACCELEREP_CURRENT_STATE.
                return { statusCode: 201, headers, body: JSON.stringify(result) };
            }

            // Single insert
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };

            // §0.58 on CREATE. Creating is not assigning — but NAMING someone
            // else on create is. A non-canSeeAll caller may create leads that
            // are blank (→ caller-owned, the standing ownerIdForWrite rule) or
            // that name THEMSELVES; any other name is refused, closing the
            // rep-POSTs-a-lead-pre-assigned-to-a-colleague hole the §0.58
            // entry recorded as open. (The bulk/import branch above is NOT
            // gated — reps importing rosters with owner columns is a separate
            // recorded question.)
            const suppliedNamePost = String(data.assignedTo ?? '').trim();
            if (!canSeeAll(userRole) && suppliedNamePost) {
                const selfId = await getCallerId(userId, orgId);
                const suppliedId = await resolveOwnerId(suppliedNamePost, orgId);
                if (!selfId || suppliedId !== selfId) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only managers and admins can assign leads to someone else. Leave the assignment blank to own the lead yourself.' }) };
                }
            }
            // A canSeeAll caller whose payload MENTIONS assignedTo and leaves
            // it blank means deliberately UNASSIGNED — the request-flow pool
            // seed. An ABSENT key keeps caller-owns-what-they-create, so API
            // callers that never mention assignment are unchanged. Mention
            // detection mirrors 18b13's rule on the update path.
            const explicitlyUnassigned = canSeeAll(userRole) && ('assignedTo' in data) && !suppliedNamePost;

            const cleanPost = sanitize(data);
            const cfgPost = await getLeadScoring(orgId);
            const scoredPost = await scoreColumns(orgId, { ...cleanPost, createdAt: new Date().toISOString() }, cfgPost);
            const newRow = explicitlyUnassigned
                ? { ...cleanPost, ...scoredPost, assignedTo: null, ownerId: null }
                : await stampOwnerId({ ...cleanPost, ...scoredPost }, 'lead', { clerkUserId: userId, orgId });
            const [inserted] = await db.insert(leads).values({ ...newRow, orgId }).returning();

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

            // ── Partial-update merge (the users.mjs mergeForUpdate pattern, minus
            // the blob flatten: lead rows are flat). sanitize() below REBUILDS the
            // whole row from its input and the upsert writes it with
            // set: { ...updateData } — no column-level merge anywhere. So a PUT
            // carrying a partial payload did not update those fields, it REPLACED
            // THE ROW: the client's saveLead sends { id, ...patch } (two keys for
            // a status change), which sanitized to null for firstName, lastName,
            // company, email, phone, source, notes, estimatedARR and assignedTo.
            // Overlaying the payload on the stored row gives field-present
            // semantics: a key sent is applied (including an explicit null or '',
            // which is how an assignment is cleared), a key omitted keeps its
            // stored value. This also fixes scoring on partial PUTs, which was
            // recomputing from a mostly-null row.
            //
            // ownerIdForUpdate below still receives the RAW body on purpose: its
            // 18b13 change-detection keys on whether the REQUEST mentioned
            // assignedTo, and merging first would make every PUT look like a
            // reassignment.
            const clean = sanitize({ ...existing, ...data });
            // Reassigning a lead re-keys its ownership; a PUT that never
            // mentioned assignedTo leaves it alone (18b13). Applied to `clean`
            // AFTER sanitize, which would otherwise not carry the column.
            const ownPut = await ownerIdForUpdate({ payload: data, entity: 'lead', orgId });
            // Assignment is a MANAGED action (§0.58, Jeff's call 2 Sep): only
            // Admin/Manager may change who owns a lead. Reps claim through the
            // request flow (lead-requests.mjs), never by writing the owner —
            // this retires the reps-claim-by-editing-unassigned-rows rule for
            // the ownership field specifically. assertOwnership above still
            // governs which ROWS a rep may edit; this governs one FIELD on them.
            //
            // Denied only on an actual CHANGE, not on any mention of the key:
            // LeadForm spreads the stored row, so a rep's ordinary edit carries
            // an UNCHANGED assignedTo and must keep working. Both halves are
            // compared — the resolved owner id AND the display-name string —
            // because they can disagree exactly once: a name that resolves to
            // nobody on an unassigned row is null === null on the id side while
            // writing a label that makes the lead LOOK assigned. Fail closed on
            // either differing.
            if (ownPut.change && !canSeeAll(userRole)) {
                const sameOwner = (ownPut.ownerId ?? null) === (existing.ownerId ?? null);
                const sameName  = String(data.assignedTo ?? '').trim() === String(existing.assignedTo ?? '').trim();
                if (!sameOwner || !sameName) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Only managers and admins can change lead assignment. You can request an unassigned lead instead.' }) };
                }
            }
            if (ownPut.change) clean.ownerId = ownPut.ownerId;
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
        const amb = ambiguousOwnerResponse(err, headers);
        if (amb) return amb;
        console.error('Leads error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'leads') };
    }
};
