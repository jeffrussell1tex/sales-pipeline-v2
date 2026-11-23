// maker-deals.test.mjs — who made a deal is the server's (state §0.250; OPEN_ITEMS §4.6, the maker items; guide §18b125
// rule 2; Jeff, 14 Nov: "Start the maker items", all Recommended).
//
// A create stamps the caller's member NAME (getCallerName, in the caller's org; none when they are no member there) —
// the single POST and the CSV import's new deals alike, never a body's or a row's; no save writes it (sanitize names
// none, so neither the merged single PUT nor the import's Overwrite through partialRows can), so the stored one stands —
// and the single PUT's upsert, should it land as an insert (the deal deleted between its read and its write), keeps the
// maker it read.
// The screens send none: the deal window's create and the import's create row.
//
// The rules RUN here where they can: the endpoint's own sanitize (read from the file, evaluated alone) through the
// merged PUT's overlay and through the real partialRows; the two stamps, each evaluated from the file's own lines with a
// stub roster. The integration half is tests/integration/five-findings.itest.mjs (MAKER).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { partialRows } from '../netlify/functions/_sanitize.mjs';
import { buildOpportunityRow } from '../src/utils/importRows.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, from, to) => {
    const a = s.indexOf(from);
    assert.ok(a >= 0, `missing: ${from.slice(0, 80)}`);
    const b = s.indexOf(to, a + from.length);
    assert.ok(b >= 0, `missing after it: ${to.slice(0, 80)}`);
    return s.slice(a + from.length, b);
};
const once = (s, t) => assert.equal(s.split(t).length - 1, 1, `exactly once: ${t.slice(0, 90)}`);
const AsyncFunction = (async () => {}).constructor;

const DEALS = 'netlify/functions/opportunities.mjs';
const raw = read(DEALS);   // the slices: their anchors are comment lines
const src = code(raw);     // the scans: comments out

// The endpoint's own sanitize, evaluated alone (it reads only its argument).
const sanitizeSrc = () => {
    const start = src.indexOf('const sanitize = (data) => ({');
    assert.ok(start >= 0, 'the deals sanitize');
    const end = src.indexOf('\n});\n', start);
    return src.slice(start, end + 4);
};
const sanitize = new Function(`${sanitizeSrc()}\nreturn sanitize;`)();

const STORED = { id: 'opp_1', stage: 'Proposal', nextSteps: 'old', createdBy: 'Seeded maker', createdDate: '2026-09-01' };

// ── the saves ────────────────────────────────────────────────────────────────

test('RULE: sanitize names no maker — a body\'s is never built into a row', () => {
    for (const forged of ['Mallory', '', null, 'usr_forged']) {
        assert.equal('createdBy' in sanitize({ id: 'd', createdBy: forged }), false, `REGRESSION (§0.250): sanitize built the body's maker (${forged})`);
    }
    assert.ok(!/\bcreatedBy\b/.test(sanitizeSrc()), 'sanitize names no createdBy at all');
});

test('RULE: the merged single PUT writes no maker — the stored one stands, a body naming one or none alike', () => {
    for (const forged of ['Mallory', null, '']) {
        const clean = sanitize({ ...STORED, createdBy: 'Seeded maker', ...{ id: 'opp_1', createdBy: forged, nextSteps: 'new' } });
        const { id: _id, comments: _notes, stageHistory: _history, ...updateData } = clean;
        assert.equal('createdBy' in updateData, false, `REGRESSION (§0.250): the save's update names the maker (${forged})`);
        assert.equal('createdBy' in clean, false, 'nor does the merged row (the insert values add the stored one, below)');
        assert.equal(updateData.nextSteps, 'new', 'the rest of the save is written');
    }
    // the file's own PUT still builds through this sanitize, merged over the stored row
    once(src, 'const clean = sanitize({ ...existing, ...data });');
    assert.ok(!/\b(data|clean|updateData)\.createdBy\b/.test(src), 'no save reads or sets a body\'s maker');
});

// The single PUT's write is an upsert: its insert half runs only when the deal was deleted between the PUT's read and
// its write. That insert keeps the maker the PUT read (state §0.250); its update half (set) never names one.
test('RULE: the single PUT\'s upsert — the insert values carry the stored maker, the set none; a body\'s never', () => {
    const write = between(raw, '            const [upserted] = await db.insert(opportunities)\n', '                .returning();');
    const valuesExpr = between(write, '                .values(', ')\n                .onConflictDoUpdate({');
    once(write, '                .values({ ...clean, createdBy: existing.createdBy ?? null, orgId })\n');
    const valuesOf = new Function('clean', 'existing', 'orgId', `return (${valuesExpr});`);
    for (const [stored, want] of [['Seeded maker', 'Seeded maker'], [null, null], [undefined, null], ['', '']]) {
        const existing = { ...STORED, createdBy: stored };
        const clean = sanitize({ ...existing, id: 'opp_1', createdBy: 'Mallory', nextSteps: 'new' });
        const values = valuesOf(clean, existing, 'org_A');
        assert.equal(values.createdBy, want, `REGRESSION (§0.250): the save's insert half stored ${JSON.stringify(values.createdBy)} over a stored ${JSON.stringify(stored)}`);
        assert.equal(values.orgId, 'org_A', 'in the caller\'s org');
        assert.equal(values.nextSteps, 'new', 'the save itself');
    }
    const set = between(write, '                    set: {\n', '                        updatedAt: new Date(),\n');
    assert.ok(set.includes('                        ...updateData,\n'), 'the set is the update the RUN above proves maker-free');
    assert.ok(!/\bcreatedBy\b/.test(set), 'REGRESSION (§0.250): the save\'s update half names the maker');
    // the stored maker is read in exactly one place: this insert's values
    assert.deepEqual(src.match(/\b\w+\s*\.\s*createdBy\b/g) || [], ['existing.createdBy'], 'REGRESSION (§0.250): a maker read from a body or a row');
});

test('RULE: the import\'s Overwrite (partialRows over the stored rows) writes no maker, whatever a row names', () => {
    const priors = new Map([['opp_1', STORED], ['opp_2', { ...STORED, id: 'opp_2', createdBy: null }]]);
    const rows = partialRows([
        { id: 'opp_1', createdBy: 'Mallory', nextSteps: 'b' },
        { id: 'opp_2', createdBy: 'Mallory' },
        { id: 'opp_3', nextSteps: 'c' },
    ], sanitize, priors);
    for (const r of rows) assert.equal('createdBy' in r, false, `REGRESSION (§0.250): an import row ${r.id} writes the maker`);
    assert.equal(rows[0].nextSteps, 'b', 'the row\'s own cells land');
    // the file's bulk PUT builds its rows so
    assert.ok(src.includes("const keyed = await rekeyBulkOwners(partialRows(staged.rows, sanitize, priors), 'opportunity', { table: opportunities, orgId });"));
});

// ── the creates ──────────────────────────────────────────────────────────────

// A stub roster: the caller's member name in the caller's org only, none otherwise.
const roster = (asked) => async (clerkUserId, orgId) => {
    asked.push([clerkUserId, orgId]);
    return clerkUserId === 'clerk_bob' && orgId === 'org_A' ? 'Bob Member' : null;
};

test('RULE: the single create stamps the caller\'s member name, read in the caller\'s org before the insert — never the body\'s; none for no member', async () => {
    const stamp = between(raw,
        "            const newRow = await stampOwnerId(sanitize(link.id ? { ...dated, account: link.name, accountId: link.id } : dated), 'opportunity', { clerkUserId: userId, orgId });\n",
        '            const [inserted] = await db.insert(opportunities)');
    const run = new AsyncFunction('newRow', 'data', 'getCallerName', 'userId', 'orgId', `${stamp}\nreturn { newRow, creatorName };`);
    for (const [userId, want] of [['clerk_bob', 'Bob Member'], ['clerk_ghost', null]]) {
        const asked = [];
        const data = { id: 'd', createdBy: 'Mallory' };
        const out = await run({ ...sanitize(data), ownerId: 'usr_x' }, data, roster(asked), userId, 'org_A');
        assert.equal(out.newRow.createdBy, want, `REGRESSION (§0.250): the create stored ${JSON.stringify(out.newRow.createdBy)} for ${userId}`);
        assert.equal(out.creatorName, want ?? null, 'the email reads the same name');
        assert.deepEqual(asked, [[userId, 'org_A']], 'read once, for the caller, in the caller\'s org');
    }
});

test('WIRING: the single create — the stamp before the insert, the pinned lines intact, the email reading the name read there', () => {
    const post = between(raw, '            // Single insert', '            // Webhook: opportunity.created');
    const at = (t) => { const i = post.indexOf(t); assert.ok(i >= 0, `missing: ${t.slice(0, 90)}`); return i; };
    const order = [
        'const named = { ...data, ...people.set };',
        'const dated = { ...named, createdDate: createdDayOf(named) };',
        "const newRow = await stampOwnerId(sanitize(link.id ? { ...dated, account: link.name, accountId: link.id } : dated), 'opportunity', { clerkUserId: userId, orgId });",
        '            const creatorName = await getCallerName(userId, orgId);\n',
        '            Object.assign(newRow, { createdBy: creatorName || null });\n',
        'const [inserted] = await db.insert(opportunities).values({ ...newRow, orgId }).onConflictDoNothing({ target: opportunities.id }).returning();',
        '            if (inserted.salesRep && inserted.salesRep !== creatorName) {',
        "createdBy:     creatorName || 'Someone',",
    ].map(at);
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'in order: stamped before the insert; the email after, on the same name');
    once(src, 'const creatorName = await getCallerName(userId, orgId);');
});

test('RULE: the import\'s new deals each carry the importer\'s member name, never the row\'s own; none for no member', async () => {
    const stamp = between(raw, '                owned.rows = importer.stamp(owned.rows);\n', '                const result = await bulkInsert({ table: opportunities, rows: owned.rows, orgId });');
    const run = new AsyncFunction('owned', 'getCallerName', 'userId', 'orgId', `${stamp}\nreturn owned;`);
    for (const [userId, want] of [['clerk_bob', 'Bob Member'], ['clerk_ghost', null]]) {
        const asked = [];
        const owned = { rows: [{ id: 'a', createdBy: 'Mallory' }, { id: 'b', createdBy: '' }, { id: 'c' }] };
        const out = await run(owned, roster(asked), userId, 'org_A');
        assert.deepEqual(out.rows.map((r) => [r.id, r.createdBy]), [['a', want], ['b', want], ['c', want]], `REGRESSION (§0.250): an import row's maker for ${userId}`);
        assert.deepEqual(asked, [[userId, 'org_A']], 'read once for the batch, in the caller\'s org');
    }
    const post = between(raw, '// Bulk insert — body is an array', '// Single insert');
    assert.ok(post.includes('owned.rows = importer.stamp(owned.rows);') && post.indexOf('owned.rows = importer.stamp(owned.rows);') < post.indexOf('owned.rows = owned.rows.map(r => ({ ...r, createdBy: maker || null }));')
        && post.indexOf('owned.rows = owned.rows.map(r => ({ ...r, createdBy: maker || null }));') < post.indexOf('const result = await bulkInsert('), 'stamped after the owners, before the insert');
});

test('THE GUARD: every maker slot in the deals endpoint is the server\'s — the two stamps, the email and the PUT insert\'s stored one, nothing else', () => {
    const slots = src.match(/\bcreatedBy\b[^\n]*/g) || [];
    assert.deepEqual(slots, [
        'createdBy: maker || null }));',
        'createdBy: creatorName || null });',
        "createdBy:     creatorName || 'Someone',   // a member's name, never the Clerk id (state §0.240, finding 3)",
        'createdBy: existing.createdBy ?? null, orgId })',   // the single PUT's insert half: the maker it read (§0.250)
    ], 'REGRESSION (§0.250): a new maker slot — name it here with its reason');
    assert.deepEqual(src.match(/\.\s*createdBy\b/g) || [], ['.createdBy'], 'no maker read from a body or a row — only the stored copy, in the PUT insert');
});

// ── the screens ──────────────────────────────────────────────────────────────

test('RULE: the import\'s create row names no maker (the server stamps the importer); an overwrite none either', () => {
    const plain = buildOpportunityRow({ account: 'Acme' }, { currentUser: 'Jeff', today: '2026-11-14', newId: () => 'n1' });
    assert.equal('createdBy' in plain, false, 'REGRESSION (§0.250): the import sent the importer\'s screen name as the maker');
    assert.equal('createdBy' in buildOpportunityRow({ account: 'Acme' }, { existingId: 'opp_1', currentUser: 'Jeff' }), false);
    assert.ok(!/\bcreatedBy\b/.test(code(read('src/utils/importRows.js'))), 'importRows.js names no maker');
});

test('WIRING: the deal window\'s create sends no maker', () => {
    const h = code(read('src/hooks/useOpportunities.js'));
    // The lead a convert names is kept out of it (state §0.253).
    assert.ok(h.includes('            const { fromLeadId, ...enrichedNew } = enrichedData;\n            const newOpp = { ...enrichedNew, id: newId, pipelineId: activePipeline.id };'), 'the create body');
    assert.ok(!/\bcreatedBy\b/.test(h), 'REGRESSION (§0.250): the deal window sent its screen name as the maker');
});
