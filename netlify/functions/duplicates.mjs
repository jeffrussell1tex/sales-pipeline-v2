import { db } from '../../db/index.js';
import { accounts, contacts } from '../../db/schema.js';
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

    // different-location is a DEMOTING LABEL, not a surfacing signal. "Koch - Enid"
    // vs "Koch - Fertilizer" are obviously distinct sites and must not fill the
    // review list on their own — so this only tags / down-weights a pair that ALSO
    // has a real signal below (e.g. "same phone, but looks like a different location").
    if (sharedPrefixDiffSuffix) relationship = 'different-location';

    if (ln && rn && ln !== rn && Math.max(ln.length, rn.length) > 6 && levWithin(ln, rn, 2)) {
        reasons.push('near-identical name');
        score = Math.max(score, sharedPrefixDiffSuffix ? 55 : 80);
    }
    if (sameDomain) { reasons.push('same website domain'); score = Math.max(score, sharedPrefixDiffSuffix ? 50 : 72); }
    if (samePhone) { reasons.push('same phone'); score = Math.max(score, sharedPrefixDiffSuffix ? 48 : 68); }
    // Note: a standalone "one name contains the other" rule was removed deliberately.
    // In a site-based account model it just re-flags the naming convention
    // ("Syensqo Cytec - Winder" contains "Syensqo"), which is noise, not a duplicate.
    // The genuinely useful contained-name case (Acme vs Acme Corp) is already caught
    // by normalizeName collapsing legal suffixes into the 'duplicate' tier.

    if (reasons.length === 0) return null;
    return { tier: 'related', score, reasons, relationship };
};

const slim = (a) => ({
    id: a.id, name: a.name, website: a.website, phone: a.phone,
    industry: a.industry, accountOwner: a.accountOwner, assignedRep: a.assignedRep,
    city: a.city, state: a.state, parentAccountId: a.parentAccountId || null,
    accountTier: a.accountTier, createdAt: a.createdAt, updatedAt: a.updatedAt,
});

// ── Contact duplicate detection ────────────────────────────────────────────────
// Email is a near-unique key, so it (or full-name + same company) gets the merge
// button. Name-only, near-name, and shared phone are review-only — phone is NOT a
// merge signal because per-site contacts often share one main line.
const normEmail = (s) => (s || '').toLowerCase().trim();
const nameKey   = (c) => normalize([c.firstName, c.lastName].filter(Boolean).join(''));
const phonesOf  = (c) => [digits(c.phone), digits(c.mobile)].filter(p => p.length >= 10);

const classifyContactPair = (a, b) => {
    const ea = normEmail(a.email), eb = normEmail(b.email);
    const na = nameKey(a), nb = nameKey(b);
    const ca = normalize(a.company), cb = normalize(b.company);
    const la = normalize(a.lastName), lb = normalize(b.lastName);

    // Tier 1 — duplicate (merge button): same email, OR same full name + same company.
    if (ea && eb && ea === eb) {
        const sameSurname = !!(la && lb && la === lb);
        const closeName = !!(na && nb && (na === nb || (Math.max(na.length, nb.length) > 5 && levWithin(na, nb, 2))));
        if (sameSurname || closeName) return { tier: 'duplicate', score: 100, reasons: ['same email'], relationship: null };
        // Same email, clearly different person — likely a data-entry error. Review only.
        return { tier: 'related', score: 90, reasons: ['same email \u00b7 different name'], relationship: 'email-mismatch' };
    }
    if (na && nb && na === nb && ca && cb && ca === cb) return { tier: 'duplicate', score: 95, reasons: ['same name & company'], relationship: null };

    // Tier 2 — related (review only).
    const reasons = []; let score = 0;
    if (na && nb && na === nb) { reasons.push('same name'); score = Math.max(score, 70); }
    else if (na && nb && Math.max(na.length, nb.length) > 6 && levWithin(na, nb, 2)) { reasons.push('near-identical name'); score = Math.max(score, 60); }
    const pa = phonesOf(a), pb = phonesOf(b);
    if (pa.some(p => pb.includes(p))) { reasons.push('same phone'); score = Math.max(score, 50); }

    if (reasons.length === 0) return null;
    return { tier: 'related', score, reasons, relationship: null };
};

const slimContact = (c) => ({
    id: c.id,
    name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || c.email || '(no name)',
    firstName: c.firstName, lastName: c.lastName,
    email: c.email, phone: c.phone, mobile: c.mobile,
    company: c.company, title: c.title, assignedRep: c.assignedRep,
    city: c.city, state: c.state, createdAt: c.createdAt, updatedAt: c.updatedAt,
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
        if (entityType === 'contact') {
            const rows = (await db.select().from(contacts).where(eq(contacts.orgId, orgId))).filter(c => !c.mergeArchived);

            if (q.mode === 'create') {
                const probe = { firstName: q.firstName || '', lastName: q.lastName || '', email: q.email || '', company: q.company || '', phone: q.phone || '', mobile: q.mobile || '', id: '__probe__' };
                const excludeId = q.excludeId || null;
                const duplicates = [], related = [];
                for (const c of rows) {
                    if (excludeId && c.id === excludeId) continue;
                    const m = classifyContactPair(probe, c);
                    if (!m) continue;
                    (m.tier === 'duplicate' ? duplicates : related).push({ ...slimContact(c), score: m.score, reasons: m.reasons, relationship: m.relationship });
                }
                duplicates.sort((x, y) => y.score - x.score);
                related.sort((x, y) => y.score - x.score);
                return { statusCode: 200, headers, body: JSON.stringify({ duplicates, related }) };
            }

            const tier = q.tier === 'related' ? 'related' : 'duplicate';
            const MAX_PAIRS = Number(q.limit) > 0 ? Math.min(Number(q.limit), 500) : 200;
            const buckets = { duplicate: [], related: [] };
            for (let i = 0; i < rows.length; i++) {
                for (let j = i + 1; j < rows.length; j++) {
                    const m = classifyContactPair(rows[i], rows[j]);
                    if (!m) continue;
                    buckets[m.tier].push({ score: m.score, reasons: m.reasons, relationship: m.relationship, a: slimContact(rows[i]), b: slimContact(rows[j]) });
                }
            }
            buckets.duplicate.sort((x, y) => y.score - x.score);
            buckets.related.sort((x, y) => y.score - x.score);
            const selected = buckets[tier];
            return { statusCode: 200, headers, body: JSON.stringify({ tier, pairs: selected.slice(0, MAX_PAIRS), counts: { duplicate: buckets.duplicate.length, related: buckets.related.length }, scanned: rows.length, truncated: selected.length > MAX_PAIRS }) };
        }
        if (entityType !== 'account') {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unsupported entityType.' }) };
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
