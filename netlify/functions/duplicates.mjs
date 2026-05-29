import { db } from '../../db/index.js';
import { accounts } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

// ── Matching ──────────────────────────────────────────────────────────────────
// Shares the normalize + Levenshtein<=2 spirit of the client-side checkDuplicate()
// in AccountRail.jsx, but is TIGHTER for the org-wide scan: the bare substring rule
// (which inflated the scan to ~600 noisy pairs) now requires a contained token of
// >=6 chars, and only reaches the "strong" tier with a corroborating signal
// (same domain / phone / city). The rail's create-time check is intentionally left
// looser and unchanged — one new name vs. the list is fine to be generous about.
//
// Score tiers (used by the scan view to default-show strong, toggle to reveal rest):
//   100 identical name · 95 same domain · 90 same phone · 88 near-identical name
//   85 substring + corroborating detail · 70 substring only (possible)
const normalize = (s) => (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
const digits = (s) => (s || '').replace(/\D/g, '');

// Robust host extraction — tolerates markdown links "[text](href)", any scheme,
// www. prefixes, and trailing paths/queries. Returns '' for non-domain values.
const domainOf = (url) => {
    if (!url) return '';
    let s = String(url).trim().toLowerCase();
    const md = s.match(/\]\(([^)]+)\)/);          // markdown [text](href) -> href
    if (md) s = md[1].trim();
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');  // strip any scheme://
    s = s.replace(/^www\./, '');
    s = s.split(/[/?#]/)[0];                        // drop path/query/hash
    s = s.replace(/^www\./, '');
    const host = s.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)+/); // require at least one dot
    return host ? host[0] : '';
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
    const ad = domainOf(a.website), bd = domainOf(b.website);
    const ap = digits(a.phone), bp = digits(b.phone);
    const reasons = [];
    let score = 0;

    const sameDomain = !!(ad && bd && ad === bd);
    const samePhone = ap.length >= 10 && ap === bp;
    const aCity = normalize(a.city), bCity = normalize(b.city);
    const sameCity = !!(aCity && aCity === bCity && normalize(a.state) === normalize(b.state));

    // Strong standalone signals
    if (an && bn && an === bn) { score = Math.max(score, 100); reasons.push('identical name'); }
    if (sameDomain) { score = Math.max(score, 95); reasons.push('same website domain'); }
    if (samePhone) { score = Math.max(score, 90); reasons.push('same phone'); }

    // Near-identical name (typo distance) on longer names
    if (an && bn && an !== bn && Math.max(an.length, bn.length) > 6 && levWithin(an, bn, 2)) {
        score = Math.max(score, 88); reasons.push('near-identical name');
    }

    // Substring containment — the noisy rule. Require the *contained* token to be
    // >=6 chars; only reach the strong tier with a corroborating detail.
    if (an && bn && an !== bn && (an.includes(bn) || bn.includes(an))) {
        const shorter = an.length <= bn.length ? an : bn;
        if (shorter.length >= 6) {
            if (sameDomain || samePhone || sameCity) {
                score = Math.max(score, 85); reasons.push('one name contains the other (+ shared detail)');
            } else {
                score = Math.max(score, 70); reasons.push('one name contains the other');
            }
        }
    }

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

        // minScore lets the scan view request just the strong tier (>=85) by default
        // and drop to >=70 when the user toggles "show possible matches".
        const minScore = Number(q.minScore) > 0 ? Number(q.minScore) : 70;

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
                if (m && m.score >= minScore) matches.push({ ...slim(a), score: m.score, reasons: m.reasons });
            }
            matches.sort((x, y) => y.score - x.score);
            return { statusCode: 200, headers, body: JSON.stringify({ matches }) };
        }

        // ── Org-wide scan (default) ──────────────────────────────────────────────
        // Pairwise O(n^2). Fine for typical org sizes; capped to keep payloads sane.
        const MAX_PAIRS = Number(q.limit) > 0 ? Math.min(Number(q.limit), 500) : 200;
        const pairs = [];
        for (let i = 0; i < rows.length; i++) {
            for (let j = i + 1; j < rows.length; j++) {
                const m = scorePair(rows[i], rows[j]);
                if (m && m.score >= minScore) {
                    pairs.push({ score: m.score, reasons: m.reasons, a: slim(rows[i]), b: slim(rows[j]) });
                }
            }
        }
        pairs.sort((x, y) => y.score - x.score);
        const truncated = pairs.length > MAX_PAIRS;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ pairs: pairs.slice(0, MAX_PAIRS), total: pairs.length, scanned: rows.length, minScore, truncated }),
        };
    } catch (err) {
        console.error('Duplicates error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
