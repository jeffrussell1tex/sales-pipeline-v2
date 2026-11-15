// tests/maker-quotes.test.mjs — who made a quote is the server's (state §0.250, guide §18b125 rule 2; OPEN_ITEMS §4.6,
// the maker items — Jeff, 14 Nov: "Start the maker items", all Recommended).
// A create stamps the caller's member name from this org's roster (getCallerName), none when it names none — never a
// body's; a New version is a create, so its maker is whoever made that version; a save keeps the stored one; the
// allowlist leaves the maker out; the screens send none; the API page says the server sets it.
// RUN (§18b23 — quotes.mjs imports db/index.js and cannot load under `npm test`): the allowlist and sanitize, the
// create's basePayload and the save's merged row and payload are lifted out of quotes.mjs AS WRITTEN and run on a
// forged body. WIRING by scan: the POST's exact stamp, no body's maker read anywhere in the file, the screens' two
// creates, the API page. The handler against a real database: tests/integration/quotes-access.itest.mjs (MAKER).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, b); return s.slice(i, j); };
const inner = (s, a, b) => between(s, a, b).slice(a.length);
const count = (s, needle) => s.split(needle).length - 1;
const order = (s, ...needles) => {
    let at = -1;
    for (const n of needles) { const i = s.indexOf(n, at + 1); assert.ok(i > at, `in order: ${n}`); at = i; }
};
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

const SRC = read('netlify/functions/quotes.mjs');
const POST = between(SRC, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
const PUT = between(SRC, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
const STAMP = 'createdBy: (await getCallerName(auth.userId, orgId)) || null,';

// The file's own allowlist and sanitize, run.
const sanitizeOf = () => {
    const list = between(SRC, 'const ALLOWED_FIELDS = [', '];') + '];';
    const fn = between(SRC, 'function sanitize(data) {', '\n}\n') + '\n}';
    return new Function(`${list}\n${fn}\nreturn sanitize;`)();
};
const FORGED = Object.freeze({ id: 'q_1', opportunityId: 'opp_1', name: 'Q v1', createdBy: 'Mallory', notes: 'n' });

// ── the allowlist, RUN ───────────────────────────────────────────────────────

test('the allowlist leaves the maker out: sanitize drops a body\'s createdBy and keeps what a quote writes', () => {
    const sanitize = sanitizeOf();
    const out = sanitize({ ...FORGED });
    assert.ok(!('createdBy' in out), 'REGRESSION: the body names the maker');
    assert.deepEqual(out, { id: 'q_1', opportunityId: 'opp_1', name: 'Q v1', notes: 'n' });
    const allowed = code(between(SRC, 'const ALLOWED_FIELDS = [', '];'));
    assert.ok(!allowed.includes("'createdBy'"), 'who made a quote is never the body\'s');
    assert.ok(allowed.includes("'notes', 'approvalNote', 'approvalTier', 'approvalReason',"), 'the line it left');
    assert.ok(SRC.includes("    // createdBy is NOT here (guide §18b125 rule 2): who made a quote is the server's, stamped by the POST."));
});

// ── the create, RUN ──────────────────────────────────────────────────────────

const basePayloadOf = () => {
    const body = inner(POST, 'const basePayload = {', '\n            };');
    return new AsyncFunction('sanitize', 'data', 'orgId', 'access', 'lineItems', 'totals', 'taxRate', 'taxExempt', 'dealDiscount', 'getCallerName', 'auth',
        `return {${body}\n};`);
};
const runCreate = async (rosterName, data = { ...FORGED }) => {
    const asked = [];
    const getCallerName = async (clerkUserId, orgId) => { asked.push([clerkUserId, orgId]); return rosterName; };
    const payload = await basePayloadOf()(sanitizeOf(), data, 'org_A', { deal: { id: 'opp_1' } }, [], {}, null, null, 0, getCallerName, { userId: 'clerk_caller' });
    return { payload, asked };
};

test('a create stamps the caller\'s member name from this org\'s roster — never the body\'s, none when the roster names none', async () => {
    const named = await runCreate('Rep Person');
    assert.equal(named.payload.createdBy, 'Rep Person', 'the roster\'s name');
    assert.deepEqual(named.asked, [['clerk_caller', 'org_A']], 'asked once, by the caller\'s Clerk id in THIS org');
    const none = await runCreate(null);
    assert.equal(none.payload.createdBy, null, 'REGRESSION: the create takes the body\'s maker when the roster names none');
    const blank = await runCreate('');
    assert.equal(blank.payload.createdBy, null, 'a blank name is none');
    const v2 = await runCreate('Manager Person', { ...FORGED, version: 2, quoteNumber: 'Q-2026-001', createdBy: 'Rep Person' });
    assert.equal(v2.payload.createdBy, 'Manager Person', 'a New version is a create: its maker is whoever made it, not the copy\'s');
});

test('the create\'s stamp by scan: the exact line, after the body\'s spread, before the insert; the body\'s maker never read', () => {
    const post = code(POST);
    assert.equal(count(post, STAMP), 1);
    order(post,
        'const basePayload = {',
        '...sanitize(data),',
        STAMP,
        'return db.insert(quotes).values({ ...basePayload, quoteNumber }).onConflictDoNothing({ target: quotes.id }).returning();');
    assert.ok(!/data\.createdBy|data\[['"]createdBy['"]\]/.test(code(SRC)), 'REGRESSION: quotes.mjs reads a body\'s maker');
});

// ── the save, RUN ────────────────────────────────────────────────────────────

test('a save keeps the stored maker: the merged row names the stored one and the update never names the column', () => {
    const sanitize = sanitizeOf();
    const mergedBody = inner(PUT, 'const merged = {', '\n            };');
    const existing = { id: 'q_1', orgId: 'org_A', opportunityId: 'opp_1', version: 1, createdBy: 'Rep Person', approvalTier: null, approvalReason: null, approvalNote: null, notes: 'old' };
    const data = { id: 'q_1', createdBy: 'Mallory', notes: 'new' };
    const merged = new Function('existing', 'sanitize', 'data', `return {${mergedBody}\n};`)(existing, sanitize, data);
    assert.equal(merged.createdBy, 'Rep Person', 'the merge holds the stored maker');
    assert.equal(merged.notes, 'new');
    const fields = between(PUT, 'const { id: _id, ...fields } = sanitize(merged);', 'const [updated]');
    const payloadBody = inner(fields, 'const payload = {', '\n            };');
    const { id: _id, ...named } = sanitize(merged);
    const payload = new Function('fields', 'lineItems', 'totals', 'merged', 'to', 'stamps', 'data',
        `return {${payloadBody}\n};`)(named, [], {}, merged, 'Draft', {}, data);
    assert.ok(!('createdBy' in payload), 'REGRESSION: a save writes a maker (the stored row\'s one stands untouched)');
    assert.equal(payload.notes, 'new');
});

test('the save by scan: merged over the stored row with the stored maker; the update is by id and org; no insert', () => {
    const put = code(PUT);
    assert.ok(put.includes('id: existing.id, opportunityId: existing.opportunityId, version: existing.version, createdBy: existing.createdBy,'));
    order(put,
        'const merged = {',
        '...existing, ...sanitize(data),',
        'createdBy: existing.createdBy,',
        'const { id: _id, ...fields } = sanitize(merged);',
        'const [updated] = await db.update(quotes).set(payload)',
        '.where(and(eq(quotes.id, existing.id), eq(quotes.orgId, orgId)))');
    assert.ok(!/\.insert\(quotes\)|onConflictDoUpdate/.test(put), 'a save never creates');
    assert.ok(!/createdBy:(?!\s*existing\.createdBy,)/.test(put), 'no other maker in the save');
});

// ── the screens ──────────────────────────────────────────────────────────────

test('the Quotes tab sends no maker: New quote and New version leave it to the server; the Approvals card reads the stored one', () => {
    const tab = code(read('src/Tabs/QuotesTab.jsx'));
    const newQuote = between(tab, 'const handleNewQuoteForOpp = async (oppId, template = null) => {', 'const saved = await handleSaveQuote(payload, null);');
    const newVersion = between(tab, 'const handleNewVersion = async () => {', 'const saved = await handleSaveQuote(payload, null);');
    for (const [name, block] of [['New quote', newQuote], ['New version', newVersion]]) {
        assert.ok(block.includes('const payload = {') && block.includes("status: 'Draft',"), `${name}: its payload`);
        assert.ok(!/createdBy/.test(block), `REGRESSION: ${name} sends a maker`);
        // The two creates only: the viewer's name was read here only to send it as the maker (elsewhere in the tab a
        // read of it is no maker's business).
        assert.ok(!/\bcurrentUser\b/.test(block), `${name}: the viewer's name is not read (it was only sent as the maker)`);
    }
    assert.ok(!/\bcreatedBy\s*:/.test(tab), 'no screen in the tab names a maker');
    assert.ok(tab.includes("{q.createdBy || '—'}"), 'the Approvals card shows the stored maker, never the viewer');
    const raw = read('src/Tabs/QuotesTab.jsx');
    assert.ok(raw.includes("                // No createdBy: who made it is the server's (guide §18b125 rule 2)."));
    assert.ok(raw.includes('                // No createdBy: the server stamps whoever makes this version (guide §18b125 rule 2).'));
});

test('the API page: createdBy is set by the server, and the create\'s example sends none', () => {
    const docs = read('public/api-docs.html');
    const object = between(docs, '<h3>The quote object</h3>', '<h3>Line item object</h3>');
    assert.ok(object.includes('<tr><td>createdBy</td><td>string | null</td><td>Set by the server: the member name of whoever created the quote'), 'the field');
    assert.ok(object.includes('A value sent in a request is ignored.'));
    assert.ok(!object.includes('Rep display name who created the quote.'), 'the old words');
    // null is any create getCallerName names no one for: no roster row, a row with no name, or a lookup that failed
    // (_lib.mjs resolveCaller answers none then).
    assert.ok(object.includes('or <code>null</code> when no member name was found for the creator: they have no member name in the organization, or the name lookup failed when the quote was made.'), 'what null means');
    const post = between(docs, '<div class="endpoint" id="quote-post">', '<div class="endpoint" id="quote-put">');
    assert.ok(post.includes('"opportunityId": "opp_abc123",'), 'the example');
    assert.ok(!post.includes('createdBy'), 'REGRESSION: the API page\'s create sends a maker');
    // The number is the server's (resolveQuoteNumber): a version 1 example sends none; a new version's is a reference.
    assert.ok(!post.includes('"quoteNumber":'), 'the version 1 example sends no quote number');
    assert.ok(post.includes('<p>The server issues <code>quoteNumber</code>. A new version (<code>version</code> above 1) names the number of the quote it revises'));
    // The PUT updates; it never creates (quotes.mjs: a quote the org does not hold is a 404).
    const put = between(docs, '<div class="endpoint" id="quote-put">', '<div class="endpoint" id="quote-delete">');
    assert.ok(put.includes('<p>Updates the quote with this <code>id</code>. A quote this organization does not hold is a <code>404</code>: a PUT never creates a quote (create one with POST).'));
    assert.ok(!put.includes('Upserts'), 'the quote PUT is no upsert');
});
