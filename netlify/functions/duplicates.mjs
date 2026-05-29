import { db } from '../../db/index.js';
import { accounts } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

// ── Duplicate detection for a site-based account model ─────────────────────────
// Accelerep customers model accounts per site/location: a parent company (e.g.
// "Mosaic") owns many sub-accounts ("Mosaic - Esterhazy K1/K2/K3", etc.) that
// legitimately share a domain, a phone, and a name prefix. So domain/phone/prefix
// similarity means "same parent", NOT "duplicate". We split detection into two
// tiers with very different safety levels:
//
//   tier 'duplicate' (default scan, the ONLY tier pre-staged for one-click merge):
//     exact name match after stripping case, punctuation, and legal suffixes.
//     Includes same-named siblings (a genuine double-entry of one sub-account).
//
//   tier 'related' (opt-in "possibly related" view, never pre-staged):
//     near-identical name / shared domain / shared phone / substring. Surfaced
//     for human review only. Pairs already in a parent/child or shared-parent
//     hierarchy are excluded entirely — the system already knows they're distinct
//     sites, so they are not duplicates and not noise worth showing.
//
// The rail's create-time checkDuplicate() is intentionally left looser/unchanged.

const LEGAL = new Set([
    'inc', 'incorporated', 'llc', 'llp', 'lp', 'ltd', 'limited', 'corp',
    'corporation', 'co', 'company', 'plc', 'gmbh', 'ag', 'sa', 'nv', 'bv',
    'pllc', 'pc',
]);

// Strict identity key: lowercase, &->and, strip punctuation, drop a leading "the"
// and trailing legal suffixes, then join. "Acme, Inc." and "The Acme Co" -> "acme".
const normalizeName = (s) => {
    if (!s) return '';
    let toks = String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    while (toks.length > 1 && toks[0] === 'the') toks.shift();
    while (toks.length > 1 && LEGAL.has(toks[toks.length - 1])) toks.pop();
    return toks.join('');
};

// Loose key for fuzzy comparisons (alphanumeric only).
const normalize = (s) => (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
const digits = (s) => (s || '').replace(/\D/g, '');

// Split "Company - Location" style names on SPACED separators only, so hyphenated
// words ("Coca-Cola") are not split.
const splitSegments = (s) => String(s || '').split(/\s+[-–—|/]\s+/).map(x => x.trim()).filter(Boolean);

// Robust host extraction — tolerates markdown links, any scheme, www., and paths.
const domainOf = (url) => {
    if (!url) return '';
    let s = String(url).trim().toLowerCase();
    const md = s.match(/\]\(([^)]+)\)/);
    if (md) s = md[1].trim();
    s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
    s = s.replace(/^www\./, '');
    s = s.split(/[/?#]/)[0];
    s = s.replace(/^www\./, '');
    const host = s.match(/[a-z0-9-]+(?:\.[a-z0-9-]+)+/);
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

const inHierarchy = (a, b) =>
    a.parentAccountId === b.id ||
    b.parentAccountId === a.id ||
    (!!a.parentAccountId && a.parentAccountId === b.parentAccountId);

// Classify a pair -> { tier:'duplicate'|'related', score, reasons, relationship } | null
const classifyPair = (a, b) => {
    const coreA = normalizeName(a.name), coreB = normalizeName(b.name);

    // Tier 1 — exact identity (safe to pre-stage). Siblings included on purpose.
    if (coreA && coreA === coreB) {
        return { tier: 'duplicate', score: 100, reasons: ['identical name'], relationship: null };
    }

    // Deliberate hierarchy => distinct sites, not duplicates; keep them out of the
    // "related" noise entirely.
    if (inHierarchy(a, b)) return null;

    // Tier 2 — related signals (review only).
    const ln = normalize(a.name), rn = normalize(b.name);
    const ad = domainOf(a.website), bd = domainOf(b.website);
    const ap = digits(a.phone), bp = digits(b.phone);
    const sameDomain = !!(ad && bd && ad === bd);
    const samePhone = ap.length >= 10 && ap === bp;

    const segA = splitSegments(a.name), segB = splitSegments(b.name);
    const sharedPrefixDiffSuffix = segA.length > 1 && segB.length > 1 &&
        normalize(segA[0]) === normalize(segB[0]) &&
        normalize(segA.slice(1).join(' ')) !== normalize(segB.slice(1).join(' '));

    const reasons = [];
    let score = 0;
    let relationship = null;

    if (sharedPrefixDiffSuffix) {
        relationship = 'different-location';
        reasons.push('same company name, different location');
        score = Math.max(score, 45);
    }
    if (ln && rn && ln !== rn && Math.max(ln.length, rn.length) > 6 && levWithin(ln, rn, 2)) {
        reasons.push('near-identical name');
        score = Math.max(score, sharedPrefixDiffSuffix ? 55 : 80);
    }
    if (sameDomain) { reasons.push('same website domain'); score = Math.max(score, sharedPrefixDiffSuffix ? 50 : 72); }
    if (samePhone) { reasons.push('same phone'); score = Math.max(score, sharedPrefixDiffSuffix ? 48 : 68); }
    if (ln && rn && ln !== rn && (ln.includes(rn) || rn.includes(ln))) {
        const shorter = ln.length <= rn.length ? ln : rn;
        if (shorter.length >= 6) { reasons.push('one name contains the other'); score = Math.max(score, 60); }
    }

    if (reasons.length === 0) return null;
    return { tier: 'related', score, reasons, relationship };
};

const slim = (a) => ({
    id: a.id, name: a.name, website: a.website, phone: a.phone,
    industry: a.industry, accountOwner: a.accountOwner, assignedRep: a.assignedRep,
    city: a.city, state: a.state, parentAccountId: a.parentAccountId || null,
    accountTier: a.accountTier, createdAt: a.createdAt, updatedAt: a.updatedAt,
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

        const rows = (await db.select().from(accounts).where(eq(accounts.orgId, orgId)))
            .filter(a => !a.mergeArchived);

        // ── On-create lookup — returns both tiers split out ──────────────────────
        if (q.mode === 'create') {
            const probe = { name: q.name || '', website: q.website || '', phone: q.phone || '', parentAccountId: q.parentAccountId || null, id: '__probe__' };
            const excludeId = q.excludeId || null;
            const duplicates = [], related = [];
            for (const a of rows) {
                if (excludeId && a.id === excludeId) continue;
                const m = classifyPair(probe, a);
                if (!m) continue;
                (m.tier === 'duplicate' ? duplicates : related).push({ ...slim(a), score: m.score, reasons: m.reasons, relationship: m.relationship });
            }
            duplicates.sort((x, y) => y.score - x.score);
            related.sort((x, y) => y.score - x.score);
            return { statusCode: 200, headers, body: JSON.stringify({ duplicates, related }) };
        }

        // ── Org-wide scan ────────────────────────────────────────────────────────
        const tier = q.tier === 'related' ? 'related' : 'duplicate';
        const MAX_PAIRS = Number(q.limit) > 0 ? Math.min(Number(q.limit), 500) : 200;

        const buckets = { duplicate: [], related: [] };
        for (let i = 0; i < rows.length; i++) {
            for (let j = i + 1; j < rows.length; j++) {
                const m = classifyPair(rows[i], rows[j]);
                if (!m) continue;
                buckets[m.tier].push({ score: m.score, reasons: m.reasons, relationship: m.relationship, a: slim(rows[i]), b: slim(rows[j]) });
            }
        }
        buckets.duplicate.sort((x, y) => y.score - x.score);
        buckets.related.sort((x, y) => y.score - x.score);

        const selected = buckets[tier];
        const truncated = selected.length > MAX_PAIRS;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                tier,
                pairs: selected.slice(0, MAX_PAIRS),
                counts: { duplicate: buckets.duplicate.length, related: buckets.related.length },
                scanned: rows.length,
                truncated,
            }),
        };
    } catch (err) {
        console.error('Duplicates error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
