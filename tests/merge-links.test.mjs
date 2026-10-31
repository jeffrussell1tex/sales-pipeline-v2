// tests/merge-links.test.mjs — a merge writes by link (state §0.218; batch 3c of OPEN_ITEMS §1 item 1; guide §18b108).
// Jeff, 30 Oct: Q15 "Still on survivor", Q16 "Skip if shared", Q17 "Show it to pick", Q18 (the audit's double count,
// two merges at once); 29 Oct: Q12 "Fold it in". Runs src/utils/mergeLinks.js on made-up rows (UKG-shaped twins), and
// pins merge.mjs's server branches the harness grades (the unit runner reaches no database; the integration suite,
// tests/integration/merge-undo.itest.mjs, runs them on the test database).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { idlessNamesOf, ofMerge, claimRenames, recordsTouched, contactPairOf, PAIR_NOT_OURS, companyGone } from '../src/utils/mergeLinks.js';
import { survivorRestore } from '../src/utils/mergeUndo.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, `anchor not found: ${a}`); const j = s.indexOf(b, i + a.length); assert.ok(j > i, `end not found: ${b}`); return s.slice(i, j); };

const X = 'acct_x', Y = 'acct_y';   // X merged into Y

test('Q16 (state §0.218): a record with no account id is renamed by an old name only where no live account outside the pair has it — "Skip if shared"', () => {
    const named = [{ id: X, name: 'Shell - Port Allen' }, { id: Y, name: 'Shell PA' }, { id: 'acct_twin', name: 'Shell - Port Allen' }];
    assert.deepEqual(idlessNamesOf(['Shell - Port Allen', 'Shell PA'], named, [X, Y]), ['Shell PA'], "UKG's twin shares the merged-away name: no id-less record renamed by it (REGRESSION: all were)");
    assert.deepEqual(idlessNamesOf(['Acme'], [{ id: X, name: 'Acme' }], [X, Y]), ['Acme'], 'only the pair has it: renamed');
    assert.deepEqual(idlessNamesOf(['Acme', null], [], [X, Y]), ['Acme'], 'no name read: none skipped; a null name is none');
    assert.equal(ofMerge(Y, 'anything', [X, Y], []), true, 'by id: on the pair');
    assert.equal(ofMerge('acct_other', 'Acme', [X, Y], ['Acme']), false, "another account's by id, whatever its text");
    assert.equal(ofMerge(null, 'Acme', [X, Y], ['Acme']), true);
    assert.equal(ofMerge(null, 'Acme', [X, Y], []), false, 'no id under a shared name: left');
});

test('Q12 (state §0.218): a SPIFF claim is renamed to the name its deal will carry — a deal of the merge the survivor\'s, a deal the D22 lift moves the account above\'s; one with no live deal by name, only where no third account has it; another account\'s claim never', () => {
    const deals = new Map([
        ['d_x', { id: 'd_x', accountId: X, account: 'Old X' }],
        ['d_y', { id: 'd_y', accountId: Y, account: 'Y' }],
        ['d_lift', { id: 'd_lift', accountId: X, account: 'Old X' }],
        ['d_idless', { id: 'd_idless', accountId: null, account: 'Old X' }],
        ['d_other', { id: 'd_other', accountId: 'acct_twin', account: 'Old X' }],
    ]);
    const claims = [
        { id: 'c1', account: 'Old X', opportunityId: 'd_x' },
        { id: 'c2', account: 'Old X', opportunityId: 'd_lift' },
        { id: 'c3', account: 'Old X', opportunityId: 'd_other' },
        { id: 'c4', account: 'Old X', opportunityId: null },
        { id: 'c5', account: 'Old X', opportunityId: 'd_gone' },
        { id: 'c6', account: 'Old X', opportunityId: 'd_idless' },
        { id: 'c7', account: 'Y', opportunityId: 'd_y' },
    ];
    const opts = { pair: [X, Y], idlessNames: ['Old X'], lifted: new Set(['d_lift']), survName: 'Y', upName: 'Shell' };
    assert.deepEqual(claimRenames(claims, deals, opts), [
        { oldValue: 'Old X', newValue: 'Y', ids: ['c1', 'c4', 'c5', 'c6'] },
        { oldValue: 'Old X', newValue: 'Shell', ids: ['c2'] },
    ], "the twin's claim (c3) left — REGRESSION: renamed org-wide by name; a claim already under the new name (c7) not written");
    assert.deepEqual(claimRenames(claims, deals, { ...opts, idlessNames: [] }).map((w) => [w.newValue, w.ids]), [['Y', ['c1']], ['Shell', ['c2']]],
        'a third account shares the name: claims with no live deal, or on a deal with no id, left (Q16)');
    assert.deepEqual(claimRenames([], deals, opts), []);
});

test('Q18 (state §0.218): a merge counts each record once — a deal moved by id and renamed, a deal moved up, a contact in two org charts', () => {
    const rewrites = [
        { table: 'opportunities', column: 'accountId', kind: 'id', ids: ['d1', 'd2'] },
        { table: 'opportunities', column: 'account', kind: 'name', ids: ['d1', 'd3'] },
        { table: 'opportunities', column: 'accountId', kind: 'lift', ids: ['d2'], rows: [{ id: 'd2' }] },
        { table: 'contacts', column: 'managers', kind: 'jsonbObjArray', rows: [{ id: 'c1' }, { id: 'c2' }] },
        { table: 'contacts', column: 'directReports', kind: 'jsonbObjArray', rows: [{ id: 'c1' }] },
    ];
    assert.deepEqual(recordsTouched(rewrites, (r) => r.table), { opportunities: 3, contacts: 2 }, 'REGRESSION: 5 deals and 3 contacts');
    assert.deepEqual(recordsTouched(rewrites, (r) => `${r.table}.${r.column}`), { 'opportunities.accountId': 2, 'opportunities.account': 1, 'contacts.managers': 2 });
    assert.deepEqual(recordsTouched(undefined, (r) => r.table), {});
});

test('Q17 (state §0.218): a contact merge keeps one Company pair — the survivor\'s, or the record merged away\'s with its link; a link or text neither contact holds is refused', () => {
    const surv = { accountId: 'acc_shell_unit', company: 'Shell - Port Allen' };
    const arch = { accountId: 'acc_shell_site', company: 'Shell - Port Allen' };
    assert.equal(contactPairOf({}, surv, arch), null, 'nothing sent: the survivor\'s pair stands');
    assert.deepEqual(contactPairOf({ accountId: 'acc_shell_site' }, surv, arch), { from: 'archived', accountId: 'acc_shell_site', company: 'Shell - Port Allen' }, 'twins of one text, the other link picked (REGRESSION: the text alone written, the survivor kept its link)');
    assert.deepEqual(contactPairOf({ accountId: 'acc_shell_unit', company: 'Shell - Port Allen' }, surv, arch), { from: 'survivor' });
    assert.deepEqual(contactPairOf({ accountId: 'acc_elsewhere' }, surv, arch), { error: PAIR_NOT_OURS }, 'a link neither holds');
    // A fill: the survivor has no link.
    const bare = { accountId: null, company: 'Acme' };
    assert.deepEqual(contactPairOf({ accountId: 'acc_acme', company: 'Acme, Inc.' }, bare, { accountId: 'acc_acme', company: 'Acme, Inc.' }), { from: 'archived', accountId: 'acc_acme', company: 'Acme, Inc.' });
    assert.deepEqual(contactPairOf({ accountId: null }, bare, { accountId: 'acc_acme', company: 'Acme, Inc.' }), { from: 'survivor' }, 'the survivor\'s (none) picked');
    // Neither linked: by the text picked.
    const t1 = { accountId: null, company: 'Acme' }, t2 = { accountId: null, company: 'ACME Corp' };
    assert.deepEqual(contactPairOf({ accountId: null, company: 'ACME Corp' }, t1, t2), { from: 'archived', accountId: null, company: 'ACME Corp' }, 'both unlinked: the text picked (REGRESSION: an id-only rule kept the survivor\'s)');
    assert.deepEqual(contactPairOf({ company: 'Acme' }, t1, t2), { from: 'survivor' });
    assert.deepEqual(contactPairOf({ company: 'Neither' }, t1, t2), { error: PAIR_NOT_OURS });
    // An older window: the text alone, the archived text picked — its link travels with it.
    assert.deepEqual(contactPairOf({ company: 'Old Co' }, { accountId: 'a1', company: 'New Co' }, { accountId: 'a2', company: 'Old Co' }), { from: 'archived', accountId: 'a2', company: 'Old Co' });
    assert.deepEqual(contactPairOf({ accountId: 'a1', company: 'Old Co' }, { accountId: 'a1', company: 'New Co' }, { accountId: 'a1', company: 'Old Co' }), { from: 'archived', accountId: 'a1', company: 'Old Co' }, 'one link, another text picked');
    assert.deepEqual(contactPairOf({ accountId: 'a1' }, { accountId: 'a1', company: 'New Co' }, { accountId: 'a1', company: 'Old Co' }), { from: 'survivor' }, 'one link, no text: the survivor\'s pair');
    assert.equal(companyGone('Acme'), '“Acme” no longer exists — keep the survivor\'s Company, or link the contact to an account first.');
    assert.equal(companyGone(''), 'That account no longer exists — keep the survivor\'s Company, or link the contact to an account first.');
});

test('Q17 (state §0.218): a contact merge\'s Undo puts the Company and account id back together while both hold what the merge wrote — kept together when either was edited since', () => {
    const log = {
        survivorId: 'c_s', archivedId: 'c_a',
        survivorSnapshot: { company: 'Shell - Port Allen', accountId: 'acc_unit', firstName: 'Pat', lastName: 'Lee' },
        archivedSnapshot: {},
        resolvedFields: { company: 'Shell - Port Allen (site)', accountId: 'acc_site' },
    };
    const asWritten = { company: 'Shell - Port Allen (site)', accountId: 'acc_site', firstName: 'Pat', lastName: 'Lee' };
    assert.deepEqual(survivorRestore('contact', log, asWritten).set, { company: 'Shell - Port Allen', accountId: 'acc_unit' }, 'both back');
    const relinked = survivorRestore('contact', log, { ...asWritten, accountId: 'acc_other' });
    assert.ok(!('company' in relinked.set) && !('accountId' in relinked.set), 'the link edited since: the text kept with it (REGRESSION: the text alone went back beside another link)');
    assert.deepEqual(relinked.keptFields.sort(), ['accountId', 'company']);
    const retyped = survivorRestore('contact', log, { ...asWritten, company: 'Typed since' });
    assert.ok(!('accountId' in retyped.set), 'the text edited since: the link kept with it');
});

test('THE SERVER (state §0.218): an account merge moves the record merged away\'s contacts by id, each logged with its own company; renames by name only within the pair (Q16); claims by their deal (Q12); opens its batch with a claim on both records (Q18); counts each record once; the Undo puts each moved contact back while it stands on the survivor (Q15)', () => {
    const g = read('netlify/functions/merge.mjs');
    assert.ok(g.includes("const moving = await db.select({ id: contacts.id, company: contacts.company }).from(contacts).where(and(eq(contacts.accountId, archivedId), eq(contacts.orgId, orgId)));"), 'read in this org, by the merged-away id');
    assert.ok(g.includes("if (moving.length) rewrites.push({ table: 'contacts', column: 'accountId', kind: 'idPair', ids: moving.map((c) => c.id), oldValue: archivedId, newValue: survivorId, rows: moving.map((c) => ({ id: c.id, old: { company: c.company ?? null } })) });"), 'each with its own company');
    assert.ok(g.includes("const named = await db.select({ id: accounts.id, name: accounts.name }).from(accounts).where(and(inArray(accounts.name, nameOldValues), eq(accounts.orgId, orgId), or(isNull(accounts.mergeArchived), eq(accounts.mergeArchived, false))));"), 'the live accounts of the old names, in this org');
    assert.ok(g.includes('const contactsOfMerge = ofMergeBy(contacts, contacts.company, [survivorId]);'), "a contact on the record merged away is moved by id, never renamed too");
    assert.ok(g.includes("{ name: 'contacts', table: contacts, column: 'company', col: contacts.company, scope: contactsOfMerge },"));
    assert.ok(!/name: 'spiffClaims', table: spiffClaims, column: 'account', col: spiffClaims.account \}/.test(g), 'claims no longer by name org-wide');
    const claims = between(g, '// SPIFF claims, each to the name its deal will carry', '// ── Build the atomic batch');
    assert.ok(claims.includes('.from(spiffClaims).where(and(inArray(spiffClaims.account, nameOldValues), eq(spiffClaims.orgId, orgId)));'), 'claims read in this org');
    assert.ok(claims.includes('.from(opportunities).where(and(inArray(opportunities.id, claimDealIds), eq(opportunities.orgId, orgId)))'), "their deals read in this org: another org's deal is none");
    assert.ok(claims.includes("const claimWrites = claimRenames(claims, new Map(claimDeals.map((d) => [d.id, d])), { pair: [archivedId, survivorId], idlessNames, lifted: new Set(lifted.map((d) => d.id)), survName, upName: up?.name ?? survName });"));
    assert.ok(claims.includes("for (const w of claimWrites) rewrites.push({ table: 'spiffClaims', column: 'account', kind: 'name', ids: w.ids, oldValue: w.oldValue, newValue: w.newValue });"), 'logged as a name, so the Undo puts each back');
    assert.ok(g.includes('for (const w of claimWrites) ops.push(db.update(spiffClaims).set({ account: w.newValue, updatedAt: now }).where(and(inArray(spiffClaims.id, w.ids), eq(spiffClaims.account, w.oldValue), eq(spiffClaims.orgId, orgId))));'), 'by the ids read, each still under the name read');
    const batch = between(g, '        const ops = [\n            writesItsRow(db.update(accounts)', "ops.push(db.update(tasks)");
    assert.ok(batch.includes(".where(and(eq(accounts.id, archivedId), eq(accounts.orgId, orgId), or(isNull(accounts.mergeArchived), eq(accounts.mergeArchived, false)), asStamped(accounts, archRead)))"), 'the record merged away archived only while live and as read (the review: a stale second merge)');
    assert.ok(batch.includes(".where(and(eq(accounts.id, survivorId), eq(accounts.orgId, orgId), or(isNull(accounts.mergeArchived), eq(accounts.mergeArchived, false)), asStamped(accounts, survRead)))"), 'the survivor held only while live and as read — two merges into one survivor, the second from a stale read (the review)');
    assert.equal((batch.match(/writesItsRow\(/g) || []).length, 2, 'each aborts the batch unless it wrote its row');
    assert.ok(!g.includes("ops.push(db.update(accounts).set({ mergeArchived: true, mergedIntoId: survivorId, archivedAt: now, updatedAt: now })"), 'archived once, by the claim');
    assert.ok(g.includes('const refused = await mergeBatch(ops, { table: accounts, survivorId, archivedId, orgId, headers });') && g.includes('const refused = await mergeBatch(ops, { table: contacts, survivorId, archivedId, orgId, headers });'));
    const mb = between(g, 'async function mergeBatch(', '\n}\n');
    assert.ok(mb.includes("if (!['22012', '40001', '40P01'].includes(String(e?.cause?.code || e?.code || ''))) throw e;"), 'only an abort read again as a refusal');
    assert.ok(mb.includes('.where(and(eq(table.orgId, orgId), inArray(table.id, [survivorId, archivedId])));'), 'read again in this org');
    assert.ok(mb.includes("const error = now(archivedId)?.mergeArchived === true ? 'That record has already been merged.'") && mb.includes('return { statusCode: 409, headers, body: JSON.stringify({ error }) };'));
    assert.ok(g.includes('const summary = recordsTouched(rewrites, (r) => r.table);') && g.includes("const summary = recordsTouched(rewrites, (r) => r.table + '.' + r.column);"), 'each record counted once (Q18)');
    const pair = between(g, "        if (rw.kind === 'idPair') {", '        // Each row the merge moved, back where it still holds what the merge wrote.');
    assert.ok(pair.includes('ops.push(db.update(table).set({ [rw.column]: rw.oldValue, company, updatedAt: now })'), 'back with its own company');
    assert.ok(pair.includes('.where(and(inArray(table.id, ids), eq(table.orgId, orgId), eq(table[rw.column], rw.newValue)))'), 'while it stands on the survivor, whatever its company now (Q15)');
    assert.ok(pair.includes('restores.push({ table: rw.table, ids, at: ops.length });') && pair.includes('.returning({ id: table.id }));'), 'counted');
});

test('THE SERVER (state §0.218): a contact merge carries the Company and account id as one pair — a link neither contact holds refused, the record merged away\'s checked in this org and followed, a dead one refusing the merge (Q17)', () => {
    const g = read('netlify/functions/merge.mjs');
    const mc = between(g, 'async function mergeContacts(', '    const nameOf = (c) =>');
    assert.ok(mc.includes('const pair = contactPairOf(resolvedFields, surv, arch);'));
    assert.ok(mc.includes('if (pair?.error) return { statusCode: 400, headers, body: JSON.stringify({ error: pair.error }) };'));
    assert.ok(mc.includes('delete resolved.company;'), 'the text never written alone');
    assert.ok(mc.includes('const live = pair.accountId ? await liveAccountOf(pair.accountId, orgId) : null;'));
    assert.ok(mc.includes('if (pair.accountId && !live) return { statusCode: 409, headers, body: JSON.stringify({ error: companyGone(pair.company) }) };'), 'a dead link refuses the merge, nothing written');
    assert.ok(mc.includes('resolved.accountId = live ? live.id : null;') && mc.includes('resolved.company = live ? live.name : pair.company;'), "the followed account's id with its name as it stands");
    const la = between(g, 'async function liveAccountOf(id, orgId) {', '\n}\n');
    assert.ok(la.includes('for (let hop = 0; at && hop <= MERGE_HOPS; hop += 1) {') && la.includes('.from(accounts).where(and(eq(accounts.id, at), eq(accounts.orgId, orgId)));'), 'in this org, the merge followed');
    assert.ok(la.includes('if (row.mergeArchived !== true) return row;') && la.includes('at = row.mergedIntoId;'));
    const cb = between(g, '    // The claim (Q18), as the account merge\'s', '    // 1) scalar id FK rewrites');
    assert.equal((cb.match(/writesItsRow\(/g) || []).length, 2);
    assert.ok(cb.includes(".where(and(eq(contacts.id, archivedId), eq(contacts.orgId, orgId), or(isNull(contacts.mergeArchived), eq(contacts.mergeArchived, false)), asStamped(contacts, archRead)))") && cb.includes("asStamped(contacts, survRead)"));
    assert.ok(!g.includes('ops.push(db.update(contacts).set({ mergeArchived: true, mergedIntoId: survivorId, archivedAt: now, updatedAt: now })'), 'archived once, by the claim');
    assert.ok(!/no account FK/.test(g), 'the stale comment gone');
});

test("THE REVIEW (state §0.218): each record read with its stamp, the claim asserting it, the log keeping the row without it (stamped / unstamped / asStamped, run as written); a claim's Undo by name only with its deal", () => {
    const g = read('netlify/functions/merge.mjs');
    const line = (start) => { const i = g.indexOf(start); assert.ok(i >= 0, `not found: ${start}`); return g.slice(i, g.indexOf('\n', i)); };
    const sql = (strings, ...values) => ({ strings: [...strings], values });
    const getTableColumns = (t) => ({ id: t.id, updatedAt: t.updatedAt });
    const [stamped, unstamped, asStamped] = new Function('sql', 'getTableColumns',
        `${line('const stamped = ')}\n${line('const unstamped = ')}\n${line('const asStamped = ')}\nreturn [stamped, unstamped, asStamped];`)(sql, getTableColumns);
    const t = { id: 'ID', updatedAt: 'UPDATED' };
    assert.deepEqual(stamped(t).stamp, { strings: ['', '::text'], values: ['UPDATED'] }, 'the stamp read as text, never a Date');
    assert.deepEqual(asStamped(t, { stamp: '2026-10-30 12:00:00.123' }), { strings: ['', '::text = ', ''], values: ['UPDATED', '2026-10-30 12:00:00.123'] },
        'REGRESSION (the review): the claim asserts no record as read — a second merge from a stale read lands, the survivor written back over the first');
    assert.deepEqual(unstamped({ id: 'a', name: 'A', stamp: 's' }), { id: 'a', name: 'A' }, 'the log keeps the row without its stamp');
    assert.equal(unstamped(undefined), undefined, 'no row read: still none (the 404)');
    for (const indent of ['        ', '    ']) {
        assert.ok(g.includes(`\n${indent}const surv = unstamped(survRead), arch = unstamped(archRead);\n${indent}if (!surv)`),
            `REGRESSION (the review): the ${indent.length === 8 ? 'account' : 'contact'} merge's log keeps the stamp in its snapshot`);
    }
    assert.ok(g.includes("const claimName = rw.table === 'spiffClaims' && rw.column === 'account';"));
    assert.ok(g.includes('...(claimName ? [sql`(${table.opportunityId} is null or not exists (select 1 from ${opportunities} where ${opportunities.id} = ${table.opportunityId} and ${opportunities.orgId} = ${orgId}) or exists (select 1 from ${opportunities} where ${opportunities.id} = ${table.opportunityId} and ${opportunities.orgId} = ${orgId} and ${opportunities.account} = ${rw.oldValue}))`] : [])))'),
        "REGRESSION (the review): a claim's Undo by name, its deal moved since — the claim and its deal part");
});
