import { db } from '../../db/index.js';
import { accounts } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

// ── Matching ──────────────────────────────────────────────────────────────────
// Mirrors the client-side checkDuplicate() in AccountRail.jsx (normalize +
// exact/substring/Levenshtein<=2) so the on-create warning and this org-wide scan
// stay consistent. Adds exact-domain matching as a strong signal and returns a
// 0-100 score so scan results can be ranked.
const normalize = (s) => (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

const domainOf = (url) => {
    if (!url) return '';
    let h = String(url).trim().toLowerCase();
    h = h.replace(/^https?:\/\//, '').replace(/^www\./, '');
    h = h.split('/')[0].split('?')[0].split('#')[0];
    return h;
};

const levWithin = (a, b, max) => {
    if (Math.abs(a.length - b.length) > max) return false;
    let dp = Array.from({ length: a.length + 1 }, (_, i) => i);
    for (let j = 1; j <= b.length; j++) {
        let prev = j;
        for (let i = 1; i <= a.length; i++) {
            const val = a[i - 1] === b[j - 1] ? dp[i - 1] : 1 + Math.min(dp[i - 1], dp[i], prev);
            dp[i - 1] = prev; prev = val;
        }
        dp[a.length] = prev;
    }
    return dp[a.length] <= max;
};

// Returns { score, reasons } if a and b look like duplicates, else null.
const scorePair = (a, b) => {
    const an = normalize(a.name), bn = normalize(b.name);
    const reasons = [];
    let score = 0;
    if (an && bn) {
        if (an === bn) { score = Math.max(score, 100); reasons.push('identical name'); }
        else if (an.includes(bn) || bn.includes(an)) { score = Math.max(score, 85); reasons.push('name contains the other'); }
        else if (Math.max(an.length, bn.length) > 6 && levWithin(an, bn, 2)) { score = Math.max(score, 80); reasons.push('near-identical name'); }
    }
    const ad = domainOf(a.website), bd = domainOf(b.website);
    if (ad && bd && ad === bd) { score = Math.max(score, 95); reasons.push('same website domain'); }

    return score > 0 ? { score, reasons } : null;
};

const slim = (a) => ({
    id: a.id, name: a.name, website: a.website, phone: a.phone,
    industry: a.industry, accountOwner: a.accountOwner, assignedRep: a.assignedRep,
    city: a.city, state: a.state, createdAt: a.createdAt, updatedAt: a.updatedAt,
});

export const handler = async (event) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId } = auth;

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const q = event.queryStringParameters || {};
        const entityType = q.entityType || 'account';
        if (entityType !== 'account') {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Only account duplicate detection is enabled in this phase.' }) };
        }

        // Active (non-archived) accounts for this org.
        const rows = (await db.select().from(accounts).where(eq(accounts.orgId, orgId)))
            .filter(a => !a.mergeArchived);

        // ── On-create lookup ───────────────────────────────────────────────────
        if (q.mode === 'create') {
            const probe = { name: q.name || '', website: q.website || '' };
            const excludeId = q.excludeId || null;
            const matches = [];
            for (const a of rows) {
                if (excludeId && a.id === excludeId) continue;
                const m = scorePair(probe, a);
                if (m) matches.push({ ...slim(a), score: m.score, reasons: m.reasons });
            }
            matches.sort((x, y) => y.score - x.score);
            return { statusCode: 200, headers, body: JSON.stringify({ matches }) };
        }

        // ── Org-wide scan (default) ──────────────────────────────────────────────
        // Pairwise O(n^2). Fine for typical org sizes; capped to keep the payload sane.
        const MAX_PAIRS = Number(q.limit) > 0 ? Math.min(Number(q.limit), 500) : 200;
        const pairs = [];
        for (let i = 0; i < rows.length; i++) {
            for (let j = i + 1; j < rows.length; j++) {
                const m = scorePair(rows[i], rows[j]);
                if (m) {
                    pairs.push({
                        score: m.score,
                        reasons: m.reasons,
                        a: slim(rows[i]),
                        b: slim(rows[j]),
                    });
                }
            }
        }
        pairs.sort((x, y) => y.score - x.score);
        const truncated = pairs.length > MAX_PAIRS;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ pairs: pairs.slice(0, MAX_PAIRS), total: pairs.length, scanned: rows.length, truncated }),
        };
    } catch (err) {
        console.error('Duplicates error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
