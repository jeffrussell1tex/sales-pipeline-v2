import { db } from '../../db/index.js';
import { leads, users } from '../../db/schema.js';
import { eq, asc, and } from 'drizzle-orm';
import { verifyAuth, canSeeAll } from './auth.mjs';
import { dispatchWebhook } from './webhooks.mjs';

export const handler = async (event) => {
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { userId, orgId, userRole } = auth;

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
            const [inserted] = await db.insert(leads).values({ ...sanitize(data), orgId }).returning();

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

            return { statusCode: 201, headers, body: JSON.stringify({ lead: inserted }) };
        }
        if (event.httpMethod === 'PUT') {
            const data = JSON.parse(event.body);
            if (!data.id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id is required' }) };

            // Fetch existing so we can detect first-time conversion and first touch
            const [existing] = await db.select().from(leads).where(and(eq(leads.id, data.id), eq(leads.orgId, orgId)));
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

            const { id, ...updateData } = clean;
            const [upserted] = await db.insert(leads).values({ ...clean, orgId })
                .onConflictDoUpdate({ target: leads.id, set: { ...updateData, updatedAt: new Date() } })
                .returning();

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
            }

            return { statusCode: 200, headers, body: JSON.stringify({ lead: upserted }) };
        }
        if (event.httpMethod === 'DELETE') {
            if (event.queryStringParameters?.clear === 'true') {
                await db.delete(leads);
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, cleared: true }) };
            }
            const id = event.queryStringParameters?.id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'id or clear=true is required' }) };
            await db.delete(leads).where(and(eq(leads.id, id), eq(leads.orgId, orgId)));
            return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    } catch (err) {
        console.error('Leads error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
