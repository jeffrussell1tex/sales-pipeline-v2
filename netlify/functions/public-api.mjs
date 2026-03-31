/**
 * Public REST API — authenticated by API key (not Clerk JWT)
 *
 * Base path: /.netlify/functions/public-api
 *
 * Routes (read-only):
 *   GET /public-api?resource=opportunities[&page=1&limit=50&stage=X&rep=X]
 *   GET /public-api?resource=accounts[&page=1&limit=50]
 *   GET /public-api?resource=contacts[&page=1&limit=50]
 *   GET /public-api?resource=activities[&page=1&limit=50]
 *   GET /public-api?resource=leads[&page=1&limit=50&status=X]
 *   GET /public-api?resource=tasks[&page=1&limit=50&status=X]
 *
 * Auth header: Authorization: Bearer spt_live_<key>
 *
 * Rate limit: 300 requests / 15 minutes per API key (tracked in-memory per function instance).
 * For production, move to Redis/Upstash.
 */

import { db } from '../../db/index.js';
import { apiKeys, opportunities, accounts, contacts, activities, leads, tasks } from '../../db/schema.js';
import { eq, and, isNull } from 'drizzle-orm';
import { createHash } from 'crypto';

// ── In-memory rate limiter (resets on cold start — good enough for now) ───────
const rateLimitMap = new Map(); // keyId → { count, windowStart }
const RATE_LIMIT    = 300;
const WINDOW_MS     = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(keyId) {
    const now    = Date.now();
    const entry  = rateLimitMap.get(keyId) || { count: 0, windowStart: now };
    if (now - entry.windowStart > WINDOW_MS) {
        // Window expired — reset
        rateLimitMap.set(keyId, { count: 1, windowStart: now });
        return { allowed: true, remaining: RATE_LIMIT - 1 };
    }
    if (entry.count >= RATE_LIMIT) {
        return { allowed: false, remaining: 0, resetAt: entry.windowStart + WINDOW_MS };
    }
    entry.count++;
    rateLimitMap.set(keyId, entry);
    return { allowed: true, remaining: RATE_LIMIT - entry.count };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const sha256 = (str) => createHash('sha256').update(str).digest('hex');

const parsePagination = (params) => {
    const page  = Math.max(1, parseInt(params?.page  || '1',  10));
    const limit = Math.min(200, Math.max(1, parseInt(params?.limit || '50', 10)));
    return { page, limit, offset: (page - 1) * limit };
};

const paginatedResponse = (data, page, limit, total) => ({
    data,
    meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
    },
});

// ── Handler ───────────────────────────────────────────────────────────────────
export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed. Public API is read-only.' }) };
    }

    // ── 1. Extract & validate API key ─────────────────────────────────────────
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const match      = authHeader.match(/^Bearer\s+(spt_live_[a-f0-9]{64})$/);
    if (!match) {
        return {
            statusCode: 401,
            headers,
            body: JSON.stringify({ error: 'Missing or malformed API key. Use: Authorization: Bearer spt_live_<key>' }),
        };
    }

    const plaintextKey = match[1];
    const keyHash      = sha256(plaintextKey);

    // Look up the key in DB
    const [keyRow] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, keyHash));

    if (!keyRow) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid API key.' }) };
    }
    if (keyRow.revokedAt) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'API key has been revoked.' }) };
    }

    const orgId = keyRow.orgId;

    // ── 2. Rate limit ─────────────────────────────────────────────────────────
    const rl = checkRateLimit(keyRow.id);
    const rlHeaders = {
        ...headers,
        'X-RateLimit-Limit':     String(RATE_LIMIT),
        'X-RateLimit-Remaining': String(rl.remaining),
    };
    if (!rl.allowed) {
        return {
            statusCode: 429,
            headers: { ...rlHeaders, 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
            body: JSON.stringify({ error: 'Rate limit exceeded. Try again in 15 minutes.' }),
        };
    }

    // ── 3. Update lastUsedAt (fire and forget — don't await, keep response fast)
    db.update(apiKeys)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(apiKeys.id, keyRow.id))
      .catch(err => console.error('lastUsedAt update failed:', err.message));

    // ── 4. Route by resource ──────────────────────────────────────────────────
    const params   = event.queryStringParameters || {};
    const resource = params.resource;
    const { page, limit, offset } = parsePagination(params);

    try {
        // ── opportunities ────────────────────────────────────────────────────
        if (resource === 'opportunities') {
            const rows = await db
                .select()
                .from(opportunities)
                .where(eq(opportunities.orgId, orgId));

            // Optional filters
            let filtered = rows;
            if (params.stage) filtered = filtered.filter(r => r.stage === params.stage);
            if (params.rep)   filtered = filtered.filter(r => r.salesRep === params.rep);
            if (params.pipeline_id) filtered = filtered.filter(r => r.pipelineId === params.pipeline_id);

            const total   = filtered.length;
            const paged   = filtered.slice(offset, offset + limit);

            // Shape output — omit internal fields like aiScore internals
            const shaped = paged.map(r => ({
                id:                  r.id,
                opportunity_name:    r.opportunityName,
                account:             r.account,
                site:                r.site,
                sales_rep:           r.salesRep,
                stage:               r.stage,
                arr:                 r.arr ? Number(r.arr) : null,
                implementation_cost: r.implementationCost ? Number(r.implementationCost) : null,
                forecasted_close_date: r.forecastedCloseDate,
                close_quarter:       r.closeQuarter,
                products:            r.products,
                probability:         r.probability,
                forecast_category:   r.forecastCategory,
                vertical:            r.vertical,
                territory:           r.territory,
                team:                r.team,
                pipeline_id:         r.pipelineId,
                stage_changed_date:  r.stageChangedDate,
                created_date:        r.createdDate,
                won_date:            r.wonDate,
                lost_date:           r.lostDate,
                lost_reason:         r.lostReason,
                lost_category:       r.lostCategory,
                notes:               r.notes,
                next_steps:          r.nextSteps,
                ai_score:            r.aiScore ? { score: r.aiScore.score, verdict: r.aiScore.verdict } : null,
                created_at:          r.createdAt,
                updated_at:          r.updatedAt,
            }));

            return {
                statusCode: 200,
                headers: rlHeaders,
                body: JSON.stringify(paginatedResponse(shaped, page, limit, total)),
            };
        }

        // ── accounts ─────────────────────────────────────────────────────────
        if (resource === 'accounts') {
            const rows = await db
                .select()
                .from(accounts)
                .where(eq(accounts.orgId, orgId));

            let filtered = rows;
            if (params.tier) filtered = filtered.filter(r => r.accountTier === params.tier);

            const total = filtered.length;
            const paged = filtered.slice(offset, offset + limit);

            const shaped = paged.map(r => ({
                id:                  r.id,
                name:                r.name,
                vertical_market:     r.verticalMarket,
                industry:            r.industry,
                address:             r.address,
                city:                r.city,
                state:               r.state,
                zip:                 r.zip,
                country:             r.country,
                website:             r.website,
                phone:               r.phone,
                account_owner:       r.accountOwner,
                assigned_rep:        r.assignedRep,
                assigned_territory:  r.assignedTerritory,
                parent_account_id:   r.parentAccountId,
                account_tier:        r.accountTier,
                notes:               r.notes,
                created_at:          r.createdAt,
                updated_at:          r.updatedAt,
            }));

            return {
                statusCode: 200,
                headers: rlHeaders,
                body: JSON.stringify(paginatedResponse(shaped, page, limit, total)),
            };
        }

        // ── contacts ─────────────────────────────────────────────────────────
        if (resource === 'contacts') {
            const rows = await db
                .select()
                .from(contacts)
                .where(eq(contacts.orgId, orgId));

            let filtered = rows;
            if (params.company) filtered = filtered.filter(r => r.company === params.company);

            const total = filtered.length;
            const paged = filtered.slice(offset, offset + limit);

            const shaped = paged.map(r => ({
                id:                r.id,
                first_name:        r.firstName,
                last_name:         r.lastName,
                full_name:         [r.firstName, r.lastName].filter(Boolean).join(' '),
                title:             r.title,
                company:           r.company,
                department:        r.department,
                email:             r.email,
                phone:             r.phone,
                mobile:            r.mobile,
                city:              r.city,
                state:             r.state,
                country:           r.country,
                assigned_rep:      r.assignedRep,
                assigned_territory: r.assignedTerritory,
                notes:             r.notes,
                created_at:        r.createdAt,
                updated_at:        r.updatedAt,
            }));

            return {
                statusCode: 200,
                headers: rlHeaders,
                body: JSON.stringify(paginatedResponse(shaped, page, limit, total)),
            };
        }

        // ── activities ───────────────────────────────────────────────────────
        if (resource === 'activities') {
            const rows = await db
                .select()
                .from(activities)
                .where(eq(activities.orgId, orgId));

            let filtered = rows;
            if (params.type)    filtered = filtered.filter(r => r.type === params.type);
            if (params.rep)     filtered = filtered.filter(r => r.rep === params.rep);

            const total = filtered.length;
            const paged = filtered.slice(offset, offset + limit);

            const shaped = paged.map(r => ({
                id:               r.id,
                type:             r.type,
                subject:          r.subject,
                description:      r.description,
                rep:              r.rep,
                account:          r.account,
                opportunity_id:   r.opportunityId,
                contact_id:       r.contactId,
                date:             r.date,
                duration_minutes: r.durationMinutes,
                outcome:          r.outcome,
                created_at:       r.createdAt,
                updated_at:       r.updatedAt,
            }));

            return {
                statusCode: 200,
                headers: rlHeaders,
                body: JSON.stringify(paginatedResponse(shaped, page, limit, total)),
            };
        }

        // ── leads ────────────────────────────────────────────────────────────
        if (resource === 'leads') {
            const rows = await db
                .select()
                .from(leads)
                .where(eq(leads.orgId, orgId));

            let filtered = rows;
            if (params.status)      filtered = filtered.filter(r => r.status === params.status);
            if (params.assigned_to) filtered = filtered.filter(r => r.assignedTo === params.assigned_to);

            const total = filtered.length;
            const paged = filtered.slice(offset, offset + limit);

            const shaped = paged.map(r => ({
                id:            r.id,
                first_name:    r.firstName,
                last_name:     r.lastName,
                full_name:     [r.firstName, r.lastName].filter(Boolean).join(' '),
                company:       r.company,
                title:         r.title,
                email:         r.email,
                phone:         r.phone,
                source:        r.source,
                status:        r.status,
                score:         r.score,
                estimated_arr: r.estimatedARR ? Number(r.estimatedARR) : null,
                assigned_to:   r.assignedTo,
                converted_at:  r.convertedAt,
                created_at:    r.createdAt,
                updated_at:    r.updatedAt,
            }));

            return {
                statusCode: 200,
                headers: rlHeaders,
                body: JSON.stringify(paginatedResponse(shaped, page, limit, total)),
            };
        }

        // ── tasks ────────────────────────────────────────────────────────────
        if (resource === 'tasks') {
            const rows = await db
                .select()
                .from(tasks)
                .where(eq(tasks.orgId, orgId));

            let filtered = rows;
            if (params.status)  filtered = filtered.filter(r => r.status === params.status);
            if (params.rep)     filtered = filtered.filter(r => r.assignedTo === params.rep);

            const total = filtered.length;
            const paged = filtered.slice(offset, offset + limit);

            const shaped = paged.map(r => ({
                id:              r.id,
                title:           r.title,
                type:            r.type,
                status:          r.status,
                priority:        r.priority,
                due_date:        r.dueDate,
                assigned_to:     r.assignedTo,
                opportunity_id:  r.opportunityId,
                account:         r.account,
                notes:           r.notes,
                completed_at:    r.completedAt,
                created_at:      r.createdAt,
                updated_at:      r.updatedAt,
            }));

            return {
                statusCode: 200,
                headers: rlHeaders,
                body: JSON.stringify(paginatedResponse(shaped, page, limit, total)),
            };
        }

        // ── unknown resource ─────────────────────────────────────────────────
        return {
            statusCode: 400,
            headers: rlHeaders,
            body: JSON.stringify({
                error: `Unknown resource: "${resource}". Valid values: opportunities, accounts, contacts, activities, leads, tasks`,
            }),
        };

    } catch (err) {
        console.error('public-api error:', err.message);
        return { statusCode: 500, headers: rlHeaders, body: JSON.stringify({ error: 'Internal server error.' }) };
    }
};
