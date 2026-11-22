// tests/merged-delete.test.mjs — THE GUARD for state §0.282 (OPEN_ITEMS §4.8, §0.273's found (2); Jeff, 21 Nov: "Refuse
// it" — reversing Q4's "deleting stays as it is" for merged-away records only). A tab loaded before a merge still listed
// the record merged away; its Delete removed it (200) and the merge could never be undone. Now the contacts and accounts
// DELETEs refuse a merged-away record 409 'merged' in words naming the record it lives on in — asked before the write,
// in the write's own SQL (the contact) or the batch's claim (the account), and again on a miss — and the screens read
// their list again rather than put the stale row back. Staged in tests/integration/merged-delete.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergedDeleteWords } from '../src/utils/mergedDelete.js';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').split('\r\n').join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j >= 0, b); return s.slice(i, j); };
const order = (s, ...lines) => lines.forEach((l, i) => { assert.ok(s.includes(l), `missing: ${l}`); if (i) assert.ok(s.indexOf(l) > s.indexOf(lines[i - 1]), `in order: ${l}`); });

test('mergedDeleteWords: the record it lives on in named; two of one name told apart; none known said plainly', () => {
    assert.equal(mergedDeleteWords('contact', 'Dana Old', 'Dana Kept'), '“Dana Old” was merged into “Dana Kept” — nothing was deleted. It is part of “Dana Kept” now; to remove it, undo the merge first.');
    assert.equal(mergedDeleteWords('account', 'Acme', 'Acme'), 'This account was merged into another account also named “Acme” — nothing was deleted. It is part of that account now; to remove it, undo the merge first.');
    assert.equal(mergedDeleteWords('contact', '', 'Dana Kept'), 'This contact was merged into another contact also named “Dana Kept” — nothing was deleted. It is part of that contact now; to remove it, undo the merge first.');
    assert.equal(mergedDeleteWords('account', 'Acme', ''), 'This account was merged into another account — nothing was deleted. To remove it, undo the merge first.');
    assert.equal(mergedDeleteWords('contact', ' Dana ', ' Dana '), mergedDeleteWords('contact', 'Dana', 'Dana'), 'names trimmed');
    // The review: the survivor merged away since — that later merge undone first, said.
    assert.equal(mergedDeleteWords('contact', 'X', 'Y', { chained: true }), '“X” was merged into “Y” — nothing was deleted. It is part of “Y” now; to remove it, undo the later merge of that contact, then this one.');
    assert.equal(mergedDeleteWords('account', 'X', '', { chained: true }), 'This account was merged into another account — nothing was deleted. To remove it, undo the later merge of that account, then this one.');
});

test('THE GUARD: _mergedDelete reads one record by id in the org and refuses only one merged away; its condition is `is not true`', () => {
    const src = read('netlify/functions/_mergedDelete.mjs');
    // The review: not merged — none reads as not merged — or merged into a record no longer of the org (that merge can never
    // be undone: refusing would only strand the record); the survivor read in the same org.
    assert.ok(src.includes('export const notMerged = (table) => sql`(${table.mergeArchived} is not true or not exists (select 1 from ${table} s where s.id = ${table.mergedIntoId} and s.org_id = ${table.orgId}))`;'));
    assert.ok(src.includes('? db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, orgId)))') && src.includes(': db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.orgId, orgId))));'), 'by id, in this org');
    order(src, 'const [row] = await rowOf(kind, id, orgId);', 'if (!row || row.mergeArchived !== true) return null;',
        'const [into] = row.mergedIntoId ? await rowOf(kind, row.mergedIntoId, orgId) : [];',
        'if (!into) return null;',   // the review: its survivor gone, it deletes as before
        'const shown = nameable(into);',
        "error: mergedDeleteWords(kind, nameOf(kind, row), shown ? nameOf(kind, into) : '', { chained: into.mergeArchived === true }), code: 'merged', mergedIntoId: shown ? row.mergedIntoId : null");
    assert.ok(src.includes('export async function mergedDeleteRefusal({ kind, id, orgId, headers, nameable = () => true }) {'));
});

test('THE GUARD: the contacts DELETE refuses a merged-away contact — after the ownership check, before the open-deal check and the write; the write\'s own SQL says not merged; a miss is asked as merged first', () => {
    const del = between(read('netlify/functions/contacts.mjs'), "if (event.httpMethod === 'DELETE') {", 'return { statusCode: 405');
    const byId = del.slice(del.indexOf("const id = event.queryStringParameters?.id;"));
    order(byId,
        'if (forbiddenDel) return forbiddenDel;',
        // The review: a rep is told the contact it lives on in only where they may read it.
        'const delCaller = canSeeAll(userRole) ? null : await getCallerId(userId, orgId);',
        'const nameable = canSeeAll(userRole) ? undefined : (r) => !r.ownerId || (!!delCaller && r.ownerId === delCaller);',
        "const mergedAway = await mergedDeleteRefusal({ kind: 'contact', id, orgId, headers, nameable });",
        'if (mergedAway) return mergedAway;',
        'if (target && await openDealNamingContact(orgId, target)) {',
        'const [deletedRow] = await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.orgId, orgId), mine, notMerged(contacts))).returning();',
        "if (!deletedRow) return (await mergedDeleteRefusal({ kind: 'contact', id, orgId, headers, nameable })) || await missedWrite({ table: contacts, id, orgId, headers,",
        "await writeAudit(orgId, deletionAudit('contact', deletedRow, { userId }));");
});

test('THE GUARD: the accounts DELETE refuses a merged-away account — after the Admin gate, before the open-deal check; its batch opens with a claim on it not merged (the lift with it), and a refused claim is asked as merged, else gone', () => {
    const del = between(read('netlify/functions/accounts.mjs'), "if (event.httpMethod === 'DELETE') {", 'return { statusCode: 405');
    order(del,
        'if (forbiddenDelete) return forbiddenDelete;',
        "const mergedAway = await mergedDeleteRefusal({ kind: 'account', id, orgId, headers });",
        'if (mergedAway) return mergedAway;',
        'const holding = target ? await openDealOfAccount(orgId, target) : null;',
        'const claim = ownerClaim(accounts, id, orgId, notMerged(accounts));',
        'batched = await db.batch([...claim,',
        'db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.orgId, orgId), notMerged(accounts))).returning(),',
        '} catch (e) {',
        'if (!claimRefused(e)) throw e;',
        "return (await mergedDeleteRefusal({ kind: 'account', id, orgId, headers })) || { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found', code: 'gone' }) };",
        'const [storedKids, gone, ...written] = batched.slice(claim.length);');
});

test('THE GUARD: dbWrite hands on the refusal\'s code; each delete hook reads its list again on a merged refusal and never puts the stale row back', () => {
    const w = read('src/utils/storage.js');
    assert.ok(w.includes('return { ok: false, status: res.status, code: body?.code ?? null, error: refusalFrom(res, body), unknown: !heardRefusal(res.status, body), landed: landedBefore(res.status, body) };'));
    for (const [file, v, load, ns] of [['src/hooks/useContacts.js', 'c', 'loadContacts', 'contacts'], ['src/hooks/useAccounts.js', 'a', 'loadAccounts', 'accounts']]) {
        const src = read(file);
        assert.ok(src.includes(`if (!r.ok) failed.push({ ${v}, error: r.error, unknown: r.unknown, merged: r.code === 'merged' });`), `${file}: the refusal marked as merged`);
        assert.ok(src.includes(`return [...prev, ...refused.filter(f => !f.merged).map(f => f.${v}).filter(${v} => !have.has(${v}.id))];`), `${file}: a merged refusal never put back as live`);
        assert.ok(src.includes(`if (failed.some(f => f.merged)) ${load}(() => {});`), `${file}: the ${ns} read again`);
        assert.ok(src.indexOf(`if (failed.some(f => f.merged)) ${load}(() => {});`) > src.indexOf('refused.filter(f => !f.merged)'));
    }
});
