// tests/merge-place.test.mjs — a merge's place in the hierarchy (state §0.219; batch 3d of OPEN_ITEMS §1 item 1; guide
// §18b109). Jeff, 29 Oct: Q7 "Refuse, name the chain", Q8 "Refuse it"; 31 Oct: Q19 "Judge live rows only", Q20 "Keep
// the lift allowed", Q21 "Only what the move changes", Q22 "Warn, keep Merge". Runs accountParent.js mergePlacement and
// pairHierarchy, mergeWindow.js mergeWarning and mergeUndo.js dealsByNameOn on made-up rows (UKG-shaped: an account, its
// unit, the unit's site), and pins the server branches the harness grades (the unit runner reaches no database; the
// integration suite, tests/integration/merge-undo.itest.mjs, runs them on the test database).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergePlacement, pairHierarchy, namesApart, levelName } from '../src/utils/accountParent.js';
import { mergeWarning } from '../src/utils/mergeWindow.js';
import { dealsByNameOn, survivorRestore, undoPlaces } from '../src/utils/mergeUndo.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, `anchor not found: ${a}`); const j = s.indexOf(b, i + a.length); assert.ok(j > i, `end not found: ${b}`); return s.slice(i, j); };
const A = (id, name, parentAccountId, accountTier, mergeArchived = false) => ({ id, name, parentAccountId, accountTier, mergeArchived });
const place = (rows, survivorId, archivedId) => mergePlacement(rows, { survivorId, archivedId });

test('Q7 (state §0.219): a survivor two or more levels under the record merged away is refused, its chain named — "Refuse, name the chain"; one straight under it goes up (the lift), and the other way round merges', () => {
    const rows = [A('x', 'Shell', null, 'account'), A('u', 'Shell Unit', 'x', 'business_unit'), A('y', 'Port Allen', 'u', 'site')];
    assert.deepEqual(place(rows, 'y', 'x'), { problem: 'chain', names: ['Port Allen', 'Shell Unit', 'Shell'], error: '“Port Allen” stands under “Shell Unit”, which stands under “Shell” — move “Port Allen” first.', named: ['y', 'u', 'x'] },
        'REGRESSION: the merge closed a loop — X\'s unit moved under its own site');
    assert.equal(place(rows, 'u', 'x'), null, 'straight under it: the survivor goes up (H6), nothing refused');
    assert.equal(place(rows, 'x', 'y'), null, 'the grandparent as the survivor: the site merged into it');
    const deep = [...rows.slice(0, 2), A('m', 'Mid', 'u', 'business_unit'), A('y', 'Port Allen', 'm', 'site')];
    assert.equal(place(deep, 'y', 'x').error, '“Port Allen” stands under “Mid”, which stands under “Shell Unit”, which stands under “Shell” — move “Port Allen” first.');
    // the chain walks every row, a merged-away one too: the loop forms whatever the marks
    assert.equal(place([A('x', 'X', null, 'account'), A('h', 'Hidden', 'x', 'business_unit', true), A('y', 'Y', 'h', 'site')], 'y', 'x').problem, 'chain');
});

test('Q8 (state §0.219): a sub-account moved under a site, or whose own accounts would sit below one, or whose tier would have to change, refuses the merge naming it — "Refuse it"; one that keeps its tier moves', () => {
    const x = A('x', 'Old Co', null, 'account');
    // the survivor a site: nothing can stand under it
    const site = [x, A('y', 'Dock', null, 'site'), A('a', 'Plant', 'x', 'business_unit'), A('b', 'Yard', 'x', 'site')];
    assert.deepEqual(place(site, 'y', 'x'), { problem: 'place', names: ['Plant', 'Yard'], error: '“Dock” is a site — a site can\'t have accounts under it, and “Plant” and “Yard” stand under “Old Co”. Move them first.', named: ['y', 'x', 'a', 'b'] });
    // a business unit survivor: a site child keeps its tier; a unit child would have to become a site
    const unit = [x, A('y', 'Unit', null, 'business_unit'), A('s', 'Site', 'x', 'site')];
    assert.equal(place(unit, 'y', 'x'), null, 'a site under a business unit: as stored, nothing changes');
    assert.equal(place([...unit, A('b', 'Unit Two', 'x', 'business_unit')], 'y', 'x').error, '“Unit Two” is a business unit and would have to become a site under “Unit” — move it first.',
        'REGRESSION: moved and re-fitted to a site unlogged — an Undo cannot put the tier back');
    // a unit with sites under it, moved under a unit: it would have to become a site (its sites with it)
    assert.equal(place([...unit, A('b', 'Unit Two', 'x', 'business_unit'), A('bs', 'Its Site', 'b', 'site')], 'y', 'x').error, '“Unit Two” is a business unit and would have to become a site under “Unit” — move it first.');
    // an account survivor takes units and sites as they are
    assert.equal(place([x, A('y', 'New Co', null, 'account'), A('a', 'Plant', 'x', 'business_unit'), A('s', 'Dock', 'a', 'site')], 'y', 'x'), null);
});

test('Q21 (state §0.219): a row stored before the rule (UKG\'s 12 accounts under an account) is refused when the merge moves it — its tier would change — but one deeper in a moved branch, whose fit the move does not change, is not judged — "Only what the move changes"', () => {
    const rows = [A('x', 'Old Co', null, 'account'), A('y', 'New Co', null, 'account'), A('l', 'Legacy', 'x', 'account')];
    assert.equal(place(rows, 'y', 'x').error, '“Legacy” is an account and would have to become a business unit under “New Co” — move it first.');
    const deeper = [A('x', 'Old Co', null, 'account'), A('y', 'New Co', null, 'account'), A('u', 'Unit', 'x', 'business_unit'), A('l', 'Legacy', 'u', 'account')];
    assert.equal(place(deeper, 'y', 'x'), null, 'the unit keeps its tier; the legacy row under it keeps its parent: nothing of it changes');
    // the review of §0.219: a legacy row deeper still — a unit over a legacy account over a site, or a site over a legacy
    // site — moved from one account to another keeps every level: never refused (REGRESSION: a height test refused it)
    assert.equal(place([A('x', 'Old Co', null, 'account'), A('y', 'New Co', null, 'account'), A('c', 'C', 'x', 'business_unit'), A('d', 'D', 'c', 'account'), A('e', 'E', 'd', 'site')], 'y', 'x'), null);
    assert.equal(place([A('x', 'Old Co', null, 'account'), A('y', 'New Co', null, 'account'), A('c', 'C', 'x', 'site'), A('d', 'D', 'c', 'site')], 'y', 'x'), null);
    // a row stored with no tier reads as an account, as the rule reads one
    assert.equal(place([A('x', 'Old Co', null, 'account'), A('y', 'New Co', null, 'account'), A('n', 'No Tier', 'x', null)], 'y', 'x').error, '“No Tier” is an account and would have to become a business unit under “New Co” — move it first.');
});

test('Q19, Q20 (state §0.219): only live accounts are judged — a sub-account merged away before still moves, never refusing a merge over a record no screen shows; the survivor\'s own lift is not judged, its sub-accounts judged against the tier it has after it', () => {
    const x = A('x', 'Old Co', null, 'account');
    assert.equal(place([x, A('y', 'Dock', null, 'site'), A('h', 'Hidden', 'x', 'business_unit', true)], 'y', 'x'), null, 'Q19: a hidden child under a site survivor refuses nothing');
    assert.equal(place([x, A('y', 'New Co', null, 'account'), A('u', 'Unit', 'x', 'business_unit'), A('h', 'Hidden Site', 'u', 'site', true), A('h2', 'Deeper', 'h', 'site', true)], 'y', 'x'), null,
        "Q19: a merged-away row raises no branch's height");
    // H6: a top-level account merged into its own site — the site goes up and is an account; the unit beside it fits
    const h6 = [x, A('y', 'Dock', 'x', 'site'), A('u', 'Plant', 'x', 'business_unit')];
    assert.equal(place(h6, 'y', 'x'), null, 'Q20: the lift allowed, and the unit judged against an account (REGRESSION: judged against the site it was)');
    // lifted under a parent, the survivor keeps its stored tier: what moves is judged against that
    const under = [A('p', 'Parent', null, 'account'), A('x', 'Unit', 'p', 'business_unit'), A('y', 'Site', 'x', 'site'), A('s2', 'Other Site', 'x', 'site')];
    assert.equal(place(under, 'y', 'x').names[0], 'Other Site', 'a site survivor lifted under its parent is still a site');
    assert.equal(place([x, A('y', 'Y', null, 'account')], 'nope', 'x'), null, 'a record not in the rows: the server has said so already (404)');
    assert.equal(place([x], 'x', 'x'), null);
});

test('the scan\'s mark (state §0.219; DESIGN "Duplicate scan"): pairHierarchy — one under the other, two or more levels apart, siblings, one top account, or none', () => {
    const rows = [A('x', 'Shell', null, 'account'), A('u', 'Shell', 'x', 'business_unit'), A('s', 'Shell', 'u', 'site'), A('k', 'Kid', 'x', 'business_unit'), A('ks', 'Kid Site', 'k', 'site'), A('t', 'Shell', null, 'account')];
    const byId = new Map(rows.map((a) => [a.id, a]));
    const at = (a, b) => pairHierarchy(byId.get(a), byId.get(b), byId);
    assert.deepEqual([at('u', 'x'), at('x', 'u'), at('s', 'x'), at('u', 'k'), at('s', 'ks'), at('t', 'x'), at('t', 's')],
        ['parent-child', 'parent-child', 'ancestor', 'siblings', 'same-tree', null, null]);
    assert.equal(pairHierarchy(null, byId.get('x'), byId), null);
});

test('Q22 (state §0.219): the window warns before Merge with the server\'s own words, and names the record that would merge as the survivor — "Warn, keep Merge"; nothing in the way, no warning', () => {
    // the app's whole list: a site merged away under the record merged away refuses nothing (Q19)
    const rows = [A('x', 'Shell', null, 'account'), A('u', 'Shell Unit', 'x', 'business_unit'), A('y', 'Port Allen', 'u', 'site'), { id: 'old', name: 'Merged', parentAccountId: 'x', accountTier: 'site', mergeArchived: true }];
    const byId = new Map(rows.map((a) => [a.id, a]));
    assert.deepEqual(mergeWarning(rows, byId.get('y'), byId.get('x')), { words: '“Port Allen” stands under “Shell Unit”, which stands under “Shell” — move “Port Allen” first.', swap: '“Shell”' },
        'the grandchild kept refuses; the grandparent kept merges');
    assert.equal(mergeWarning(rows, byId.get('x'), byId.get('y')), null);
    // both ways refused: no swap offered
    const both = [A('a', 'A', null, 'business_unit'), A('b', 'B', null, 'business_unit'), A('a1', 'A1', 'a', 'business_unit'), A('b1', 'B1', 'b', 'business_unit')];
    const bb = new Map(both.map((r) => [r.id, r]));
    assert.equal(mergeWarning(both, bb.get('a'), bb.get('b')).swap, null);
    assert.equal(mergeWarning(rows, null, byId.get('x')), null);
});

// The Undo — OPEN_ITEMS §4.7's first shape: a lifted survivor went back a site with a deal saved since with no account id
// naming it, uncounted (run through the real deals POST). The H6 log: the top-level "Plant" merged into its own site
// "Dock", which went up and became an account.
const h6Log = (over = {}) => ({
    archivedId: 'X', survivorId: 'Y', archivedName: 'Plant', survivorName: 'Dock',
    survivorSnapshot: { id: 'Y', name: 'Dock', parentAccountId: 'X', accountTier: 'site' },
    archivedSnapshot: { id: 'X', name: 'Plant', parentAccountId: null, accountTier: 'account' },
    resolvedFields: {}, rewrites: [], ...over,
});
const h6Tree = (extra = []) => [A('X', 'Plant', null, 'account', true), A('Y', 'Dock', null, 'account'), ...extra];
const now = (over = {}) => ({ id: 'Y', name: 'Dock', parentAccountId: null, accountTier: 'account', ...over });
const D = (id, account, accountId = null) => ({ id, account, accountId });

test('the Undo\'s deals by name (state §0.219; OPEN_ITEMS §4.7\'s first shape): a deal with no account id under the name the survivor carries once the Undo is done keeps it from going back a site, counted — where no other live account has the name; the record merged away counted live', () => {
    const log = h6Log();
    const restored = survivorRestore('account', log, now());
    const found = dealsByNameOn(log, h6Tree(), restored, [D('d1', 'Dock'), D('d2', 'Elsewhere')]);
    assert.deepEqual(found, { ids: ['d1'], name: 'Dock' });
    const placed = undoPlaces(log, h6Tree(), restored, [], found.ids);
    assert.ok(!('accountTier' in placed.set) && placed.keptFields.includes('accountTier') && placed.held.includes('d1'),
        'REGRESSION (§4.7): the Dock went back a site with the deal on it by its name, uncounted');
    assert.ok('accountTier' in undoPlaces(log, h6Tree(), restored, []).set, 'with none, it goes back a site');
    // another live account has the name: the deal is not the survivor's by name (UKG's twins)
    assert.deepEqual(dealsByNameOn(log, h6Tree([A('T', 'Dock', null, 'account')]), restored, [D('d1', 'Dock')]), { ids: [], name: null });
    // one merged away before has it: not live — the deal is the survivor's
    assert.deepEqual(dealsByNameOn(log, h6Tree([A('T', 'Dock', null, 'account', true)]), restored, [D('d1', 'Dock')]).ids, ['d1']);
    // the record merged away has the name (the twins merged): live after the Undo, so neither's by name
    assert.deepEqual(dealsByNameOn(h6Log({ archivedName: 'Dock' }), [A('X', 'Dock', null, 'account', true), A('Y', 'Dock', null, 'account')], restored, [D('d1', 'Dock')]).ids, []);
    // the review of §0.219: a deal the merge moved by id, its id cleared since and its text the survivor's name — it stays
    // whatever the deal id restore does (that restore moves only a deal on the survivor by id), so it holds, counted
    const byIdLog = h6Log({ rewrites: [{ table: 'opportunities', column: 'accountId', kind: 'id', ids: ['d1'], oldValue: 'X', newValue: 'Y' }] });
    const byIdPlaced = undoPlaces(byIdLog, h6Tree(), survivorRestore('account', byIdLog, now()), [], ['d1']);
    assert.ok(!('accountTier' in byIdPlaced.set) && byIdPlaced.held.includes('d1'),
        "REGRESSION: let go with the deal id restore — the survivor sent back a site while the batch's own ask found the deal, every field kept");
    // a deal with an account id is the by-id read's, never this one's
    assert.deepEqual(dealsByNameOn(log, h6Tree(), restored, [D('d1', 'Dock', 'Q')]).ids, []);
    assert.deepEqual(dealsByNameOn(log, h6Tree(), restored, null), { ids: [], name: null }, 'not read: none');
});

test('the Undo\'s deals by name: the name the survivor carries AFTER the Undo — its name put back, else as it stands — and each deal\'s name after the name restores; the second shape (a deal by the name of the record merged away) left as filed', () => {
    // the merge renamed the survivor "I21B Dock" to "I21B Plant"; the Undo puts "I21B Dock" back
    const log = h6Log({ survivorName: 'I21B Plant', survivorSnapshot: { id: 'Y', name: 'I21B Dock', parentAccountId: 'X', accountTier: 'site' }, archivedName: 'I21B Plant',
        rewrites: [{ table: 'opportunities', column: 'account', kind: 'name', ids: ['own'], oldValue: 'I21B Dock', newValue: 'I21B Plant' },
            { table: 'opportunities', column: 'account', kind: 'name', ids: ['fromX'], oldValue: 'I21B Plant', newValue: 'I21B Plant' }] });
    const tree = [A('X', 'I21B Plant', null, 'account', true), A('Y', 'I21B Plant', null, 'account')];
    const restored = survivorRestore('account', log, now({ name: 'I21B Plant' }));
    assert.equal(restored.set.name, 'I21B Dock');
    const named = [D('since', 'I21B Dock'), D('own', 'I21B Plant'), D('fromX', 'I21B Plant'), D('loose', 'I21B Plant')];
    assert.deepEqual(dealsByNameOn(log, tree, restored, named), { ids: ['since', 'own'], name: 'I21B Dock' },
        "a deal saved since under the name put back, and the survivor's own put back with it; never one under the merge's name the record merged away will carry (REGRESSION: read by the name as it stands)");
    // the name kept (edited since): the survivor keeps its current name, and a deal by it is its
    const kept = survivorRestore('account', log, now({ name: 'Renamed' }));
    assert.deepEqual(dealsByNameOn(log, [A('X', 'I21B Plant', null, 'account', true), A('Y', 'Renamed', null, 'account')], kept, [D('r', 'Renamed'), D('since', 'I21B Dock')]).ids, ['r']);
});

test('the Undo\'s deals by name: a deal the name restore sends back to the record merged away leaves the survivor — but not while that is a site (notASite), when it stays, under the name it has', () => {
    // the survivor kept its name (the merge renamed nothing of it); a deal by the merged-away name renamed to the survivor's
    const log = h6Log({ rewrites: [{ table: 'opportunities', column: 'account', kind: 'name', ids: ['back'], oldValue: 'Plant', newValue: 'Dock' }] });
    const restored = survivorRestore('account', log, now());
    assert.deepEqual(dealsByNameOn(log, h6Tree(), restored, [D('back', 'Dock')]).ids, [], 'back to "Plant": not the survivor\'s');
    assert.deepEqual(dealsByNameOn(log, [A('X', 'Plant', null, 'site', true), A('Y', 'Dock', null, 'account')], restored, [D('back', 'Dock')]).ids, ['back'], 'the record merged away a site: it stays, the survivor\'s by name');
});

test('THE SERVER (state §0.219): the merge reads its place before anything is built and refuses it (409, nothing written); moves the sub-accounts by the ids read, asserting no live one stands there but as read; resolves no tier; D22\'s namesakes live only', () => {
    const g = read('netlify/functions/merge.mjs');
    assert.ok(g.includes("import { rankOf, mergePlacement } from '../../src/utils/accountParent.js';"));
    const merge = between(g, '        // Resolve the surviving field values (whitelist only).', '        // ── Build the atomic batch');
    const at = merge.indexOf('const placement = mergePlacement(tree, { survivorId, archivedId });');
    assert.ok(merge.includes('        const tree = await treeOf(orgId);\n        const placement = mergePlacement(tree, { survivorId, archivedId });'));
    assert.ok(at > merge.indexOf('if (owner?.error) return') && at < merge.indexOf('const rewrites = [];'), 'read in this org (treeOf), before the snapshot reads');
    assert.ok(merge.includes('if (placement) return { statusCode: 409, headers, body: JSON.stringify({ error: placement.error }) };'), 'REGRESSION: a merge that closes a loop, or leaves a sub-account under a site or at a tier the rule would not give it, lands');
    assert.ok(merge.includes('const kids = tree.filter((a) => a.parentAccountId === archivedId).map((a) => ({ id: a.id, accountTier: a.accountTier, mergeArchived: a.mergeArchived }));'),
        'the rows the placement judged (the review: a second read let a child added, moved under it or re-tiered in between pass both checks)');
    assert.ok(!/'accountTier'/.test(between(g, 'const ACCOUNT_FIELDS = [', '];')), 'REGRESSION: a tier sent written unchecked');
    assert.ok(g.includes('const survTier = surv.accountTier;'));
    assert.ok(g.includes('const byName = idlessNames.includes(archName);'), "D22's namesakes: live accounts only (REGRESSION: one merged away before held the deals on the site)");
    const batch = between(g, '        const ops = [\n            writesItsRow(db.update(accounts)', "        // Contacts on the record merged away, by the ids read");
    assert.ok(batch.includes('const liveKids = kids.filter((k) => k.mergeArchived !== true);'));
    assert.ok(batch.includes('const liveKids = kids.filter((k) => k.mergeArchived !== true);\n        ops.push(db.select({ ok: sql`1 / (case when exists'), 'pushed every time, straight after the live ones are taken (the harness: the whole assert skipped survived)');
    assert.ok(batch.includes('ops.push(db.select({ ok: sql`1 / (case when exists (select 1 from ${accounts} where ${accounts.parentAccountId} = ${archivedId} and ${accounts.orgId} = ${orgId} and ${accounts.mergeArchived} is not true${liveKids.length ? sql` and not (${or(...liveKids.map((k) => and(eq(accounts.id, k.id), asRead(accounts.accountTier, k.accountTier ?? null))))})` : sql``}) then 0 else 1 end)` }).from(accounts).where(and(eq(accounts.id, survivorId), eq(accounts.orgId, orgId))));'),
        'REGRESSION: a sub-account added under the record merged away, or re-tiered, after the placement read lands unplaced');
    assert.ok(batch.includes('if (childIds.length) ops.push(db.update(accounts).set({ parentAccountId: survivorId, updatedAt: now }).where(and(inArray(accounts.id, childIds), eq(accounts.parentAccountId, archivedId), eq(accounts.orgId, orgId))));'),
        'by the ids read, each still under it (REGRESSION: by its parent at batch time, whatever stood there)');
    assert.ok(batch.indexOf('const liveKids') < batch.indexOf('if (childIds.length) ops.push(db.update(accounts)'), 'asked before the move');
    assert.ok(!g.includes('ops.push(db.update(accounts).set({ parentAccountId: survivorId, updatedAt: now }).where(and(eq(accounts.parentAccountId, archivedId), eq(accounts.orgId, orgId))));'));
});

test('THE SERVER (state §0.219): the Undo reads the survivor\'s deals with no account id by its names, in this org, and asks the name again in its statement only when the read found it alone', () => {
    const g = read('netlify/functions/merge.mjs');
    assert.ok(g.includes("import { UNDO_CHANGED, undoRefusal, upIdOf, orgChartUnion, survivorRestore, undoPlaces, dealsByIdOf, dealsByNameOn, survivorRowsOf, undoKept, undoDetail } from '../../src/utils/mergeUndo.js';"));
    const dn = between(g, 'const dealsNamed = async (names, orgId) => {', '\n};\n');
    assert.ok(dn.includes('.where(and(isNull(opportunities.accountId), inArray(opportunities.account, of), eq(opportunities.orgId, orgId))) : [];'), "in this org, with no account id (REGRESSION: another org's deal of the name)");
    assert.ok(g.includes("const named = kind === 'account' ? await dealsNamed([rows.survivor?.name, log.survivorSnapshot?.name], orgId) : null;"), 'its name as it stands and as it was');
    assert.ok(g.includes("const byName = kind === 'account' ? dealsByNameOn(log, rows.tree, restored, rows.named) : null;"));
    assert.ok(g.includes("const placed = kind === 'account' ? undoPlaces(log, rows.tree, restored, rows.deals, byName.ids) : null;"), 'REGRESSION (§4.7): by id alone — or the by-name deals run through the deal id restore\'s filter');
    assert.ok(g.includes("...(set.accountTier === 'site' ? [noDealOn(log.survivorId, orgId, byName?.name ?? null)] : []),"));
    assert.ok(g.includes('const noDealOn = (id, orgId, name = null) => sql`not exists (select 1 from ${opportunities} where (${opportunities.accountId} = ${id}${name != null ? sql` or (${opportunities.accountId} is null and ${opportunities.account} = ${name})` : sql``}) and ${opportunities.orgId} = ${orgId})`;'),
        'REGRESSION: a deal saved with no id under the name while the Undo ran is left on a site');
});

test('THE SCAN (state §0.219): the org-wide scan marks a same-name pair in one hierarchy and names each record\'s parent — never the on-create probe (a rep\'s own list); the page shows each record\'s level and parent, the marks in words, the outlined button for a marked pair, and no longer says "safe to merge"', () => {
    const d = read('netlify/functions/duplicates.mjs');
    assert.ok(d.includes("import { pairHierarchy } from '../../src/utils/accountParent.js';"));
    const scan = between(d, '        // ── Org-wide scan', '        buckets.duplicate.sort(');
    assert.ok(scan.includes('const byId = new Map(rows.map((a) => [a.id, a]));'));
    assert.ok(scan.includes("const withParent = (a) => ({ ...slim(a), parentName: a.parentAccountId ? byId.get(a.parentAccountId)?.name ?? null : null });"));
    assert.ok(scan.includes("const relationship = m.tier === 'duplicate' ? pairHierarchy(rows[i], rows[j], byId) : m.relationship;"), 'REGRESSION: an account and its own site of one name offered as a plain duplicate');
    assert.ok(scan.includes('buckets[m.tier].push({ score: m.score, reasons: m.reasons, relationship, a: withParent(rows[i]), b: withParent(rows[j]) });'));
    const probe = between(d, '        // ── On-create lookup', '        // ── Org-wide scan');
    assert.ok(!/pairHierarchy|parentName|withParent/.test(probe), "the probe reads a rep's own list: no parent named from it");
    assert.ok(!/safe to pre-stage|Siblings included on purpose/.test(d));
    const v = read('src/Tabs/DuplicateScanView.jsx');
    for (const k of ["'parent-child': 'One is under the other',", "'ancestor': 'One is two or more levels under the other',", "'siblings': 'Under the same parent',", "'same-tree': 'In the same hierarchy',"]) assert.ok(v.includes(k), k);
    assert.ok(v.includes("const IN_HIERARCHY = new Set(['parent-child', 'ancestor', 'siblings', 'same-tree']);"), 'every mark has its words: no raw key on screen');
    assert.ok(v.includes("const LEVEL = { account: 'Account', business_unit: 'Business unit', site: 'Site' };"));
    assert.ok(v.includes("        ['Level', LEVEL[a.accountTier] || ''],\n        ['Parent', a.parentName || ''],"));
    assert.ok(v.includes("const vetted = tier === 'duplicate' && !IN_HIERARCHY.has(pair.relationship);") && v.includes('                {vetted ? ('));
    assert.ok(!v.includes('These are safe to merge.'), 'REGRESSION: a pair in one hierarchy called safe to merge');
    assert.ok(v.includes('A pair marked as in one hierarchy may be an account and its own sub-account or site — review it in the merge window before confirming.'));
});

test("THE WINDOW (state §0.219; Q22): the account merge window warns before Merge in the refusal's words, names the other record where keeping it would merge, and leaves Merge pressable", () => {
    const w = read('src/components/modals/MergeReviewModal.jsx');
    assert.ok(w.includes('const warning = mergeWarning(accounts, survivor, archived);'));
    assert.ok(w.includes('<b style={{ fontWeight: 700 }}>This merge will be refused as it stands.</b> {warning.words}'));
    assert.ok(w.includes('{warning.swap ? <> Keeping {warning.swap} as the survivor instead would merge them — pick its card above.</> : null}'), 'the swap in quotes from mergeWarning, with its level where the two read alike (state §0.220)');
    assert.ok(w.includes('<button onClick={onMerge} disabled={mergeSaving}'), 'Merge stays pressable: the server decides');
    assert.ok(!/#9c3a2e|T\.danger/.test(between(w, '{warning && (', ')}')), 'red is for deletes only: the warning in the warm warning colours');
});

test('SAME NAMES (state §0.220 — Jeff, 1 Nov: "do that"; its review): where another record a refusal names reads alike, the two merged are named by their cards\' tags, any other by its level, else its place; as before where none does; the window names the swap from the records the words name, shows each card\'s level, and says the server\'s refusal in the warm colours', () => {
    // the browser check's chain (Accelerep QA, 31 Oct): two "TEST3d Chain", an account and its site, the unit between
    const chain = [A('c', 'TEST3d Chain', null, 'account'), A('m', 'TEST3d Mid', 'c', 'business_unit'), A('s', 'TEST3d Chain', 'm', 'site')];
    assert.deepEqual(place(chain, 's', 'c'), { problem: 'chain', names: ['TEST3d Chain', 'TEST3d Mid', 'TEST3d Chain'],
        error: '“TEST3d Chain” (survivor) stands under “TEST3d Mid”, which stands under “TEST3d Chain” (archive) — move “TEST3d Chain” (survivor) first.', named: ['s', 'm', 'c'] },
        'REGRESSION: one name said twice — which record to move unsaid');
    const byC = new Map(chain.map((a) => [a.id, a]));
    assert.deepEqual(mergeWarning(chain, byC.get('s'), byC.get('c')), { words: place(chain, 's', 'c').error, swap: '“TEST3d Chain” (archive)' }, 'the swap named as its card is tagged');
    // the commonest pair (the review): two top-level accounts of one name and one level — a level or a place would say both alike
    const tops = [A('y', 'Shell', null, 'account'), A('x', ' shell', null, 'account'), A('c', 'Sub', 'x', 'account')];
    assert.deepEqual(mergeWarning(tops, tops[0], tops[1]), { words: '“Sub” is an account and would have to become a business unit under “Shell” (survivor) — move it first.', swap: '“shell” (archive)' },
        'REGRESSION: “Shell” (top level) said of both — alike by case and spaces too');
    // a record between, of the survivor's name: by its level (REGRESSION: the chain's records left out of the list)
    assert.equal(place([A('x', 'Shell', null, 'account'), A('m', 'Port', 'x', 'business_unit'), A('y', 'Port', 'm', 'site')], 'y', 'x').error,
        '“Port” (survivor) stands under “Port” (business unit), which stands under “Shell” — move “Port” (survivor) first.');
    // the record merged away, of a sub-account's name, in a place refusal — and the swap from the same records
    const kid = [A('y', 'Dock', null, 'site'), A('x', 'Kid', null, 'account'), A('a', 'Kid', 'x', 'business_unit')];
    assert.deepEqual(mergeWarning(kid, kid[0], kid[1]), { words: '“Dock” is a site — a site can\'t have accounts under it, and “Kid” (business unit) stands under “Kid” (archive). Move it first.', swap: '“Kid” (archive)' },
        'REGRESSION: “Kid” stands under “Kid”; and one record named two ways in one box');
    // a level a namesake shares, another not: its place, its parent quoted (REGRESSION: some read as every)
    assert.equal(place([A('x', 'Plant', null, 'account'), A('m1', 'Plant', 'x', 'business_unit'), A('u', 'Mid', 'm1', 'business_unit'), A('m2', 'Plant', 'u', 'business_unit'), A('y', 'S', 'm2', 'site')], 'y', 'x').error,
        '“S” stands under “Plant” (unit of “Mid”), which stands under “Mid”, which stands under “Plant” (unit of “Plant”), which stands under “Plant” (archive) — move “S” first.');
    // the records the words name, only: a twin elsewhere in the org reads as before
    const twins = [A('a', 'Port', null, 'account'), A('b', 'Port', null, 'account'), A('q', 'Q', 'b', 'business_unit'), A('z', 'Z', 'a', 'site')];
    assert.equal(place(twins, 'z', 'b').error, '“Z” is a site — a site can\'t have accounts under it, and “Q” stands under “Port”. Move it first.');
    assert.equal(mergeWarning([A('n', 'North', null, 'account'), A('nu', 'NU', 'n', 'business_unit'), A('ns', 'NS', 'nu', 'site')], A('ns', 'NS', 'nu', 'site'), A('n', 'North', null, 'account')).swap, '“North”', 'none alike: bare');
    // a record merged away of no name: still offered
    const blank = [A('y', 'Dock', null, 'site'), A('x', '', null, 'account'), A('a', 'Kid', 'x', 'business_unit')];
    assert.equal(mergeWarning(blank, blank[0], blank[1]).swap, 'the other record');
    // namesApart: top level only with no parent; a parent the rows lack, or of no name, its level; no tier reads as an account
    const byP = new Map([A('p', 'Top', null, 'account'), A('q', ' ', null, 'account')].map((a) => [a.id, a]));
    const rows = [A('n', 'Q', null, null), A('m', 'Q', 'p', 'account'), A('g', 'Q', 'gone', 'account'), A('b', 'Q', 'q', 'account')];
    assert.deepEqual(rows.map(namesApart(rows, byP)), ['“Q” (top level)', '“Q” (in “Top”)', '“Q” (account)', '“Q” (account)']);
    assert.equal(namesApart([A('e', '  ', null, 'site')], byP)(A('e', '  ', null, 'site')), null);
    assert.deepEqual([levelName('account'), levelName('business_unit'), levelName('site'), levelName(null), levelName('bogus')], ['Account', 'Business unit', 'Site', 'Account', 'Account']);
    // the window: each card names its level, as the words do; the server's refusal in the warm colours (red is for deletes)
    const w = read('src/components/modals/MergeReviewModal.jsx');
    assert.ok(w.includes("import { levelName } from '../../utils/accountParent.js';"));
    assert.ok(w.includes("<div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{levelName(acc.accountTier)} · {(acc.accountOwner || acc.assignedRep || 'Unassigned')}"), 'REGRESSION: two cards of one name told apart by nothing');
    for (const f of ['src/components/modals/MergeReviewModal.jsx', 'src/components/modals/ContactMergeReviewModal.jsx']) {
        const box = between(read(f), '{mergeError && (', '{mergeError}');
        assert.ok(box.includes("background: C.warnBg, border: `1px solid ${C.warn}`") && box.includes("color: '#7a5a2c'"), f + ': the warm colours');
        assert.ok(!/#9c3a2e|T\.danger/.test(box), f + ': REGRESSION: a refusal, which writes nothing, in the delete red');
    }
});
