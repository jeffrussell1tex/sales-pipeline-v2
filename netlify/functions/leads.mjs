import { db } from '../../db/index.js';
import { leads, users } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth, canSeeAll, isReadOnly, requireRole } from './auth.mjs';
import { dispatchWebhook } from './webhooks.mjs';
import { dispatchAutomations } from './dispatch-automations.mjs';
import { serverErrorBody, writeAudit, getCallerName } from './_lib.mjs';
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
    if (isReadOnly(userRole) && ['POST', 'PUT', 'DELETE'].includes(event.httpMethod)) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: read-only role' }) };
    }

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
                // assignedTo is stored as a display name, not a Clerk userId — look up the current user's name
                let repDisplayName = null;
                try {
                    const [repRow] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
                    repDisplayName = repRow?.name || null;
                } catch (e) {
                    console.warn('Could not look up rep display name for leads filtering:', e.message);
                }
                results = results.filter(l => !l.assignedTo || l.assignedTo === repDisplayName);
            }
            return { statusCode: 200, headers, body: JSON.stringify({ leads: results }) };
        }
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
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
            // Object-level authorization: reps may only edit their own or unassigned leads
            if (existing && !canSeeAll(userRole)) {
                const callerName = await getCallerName(userId);
                if (existing.assignedTo && existing.assignedTo !== callerName) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: you can only modify your own or unassigned records' }) };
                }
            }
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
            // Object-level authorization: reps may only delete their own or unassigned leads
            if (!canSeeAll(userRole)) {
                const [target] = await db.select({ owner: leads.assignedTo }).from(leads).where(and(eq(leads.id, id), eq(leads.orgId, orgId)));
                const callerName = await getCallerName(userId);
                if (target?.owner && target.owner !== callerName) {
                    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: you can only modify your own or unassigned records' }) };
                }
            }
            await db.delete(leads).where(and(eq(leads.id, id), eq(leads.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Leads error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'leads') };
    }
};
