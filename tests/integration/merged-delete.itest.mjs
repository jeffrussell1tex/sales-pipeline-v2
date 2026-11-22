// tests/integration/merged-delete.itest.mjs
// §0.282 against the real test database (OPEN_ITEMS §4.8, §0.273's found (2); Jeff, 21 Nov: "Refuse it" — reversing
// Q4's "deleting stays as it is" for merged-away records only): a tab loaded before a merge still listed the record
// merged away, and its Delete removed it (200) — the merge's Undo then refused for good. Now a Delete of a merged-away
// contact or account is refused 409 'merged' in words naming the record it lives on in, nothing deleted, and the merge
// stays undoable; a merge landing between the Delete's check and its write is caught in the write's own SQL (contacts)
// or by the batch's claim (accounts). Real merges through merge.mjs; real Deletes through contacts.mjs and accounts.mjs.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');
mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers['x-test-user'], orgId, userRole: event.headers['x-test-role'] || 'Admin', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
// A merge landing between the Delete's check and its write, staged: once, when armed, the moment the check answers
// "not merged" — the record archived as a merge archives it.
let armed = null;
const merged = await import('../../netlify/functions/_mergedDelete.mjs');
mock.module(new URL('../../netlify/functions/_mergedDelete.mjs', import.meta.url).href, {
    namedExports: { ...merged, mergedDeleteRefusal: async (...a) => { const r = await merged.mergedDeleteRefusal(...a); const h = armed; armed = null; if (h) await h(); return r; } },
});

const { handler: mergeFn } = await import('../../netlify/functions/merge.mjs');
const { handler: contactsFn } = await import('../../netlify/functions/contacts.mjs');
const { handler: accountsFn } = await import('../../netlify/functions/accounts.mjs');
const { db } = await import('../../db/index.js');
const { accounts, contacts, mergeLog, auditLog, users } = await import('../../db/schema.js');
const { eq, and } = await import('drizzle-orm');
const lib = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_mdel_*', and only this file writes to it.
const A = 'itest_mdel_A';
const ID = (s) => 'itest_mdel_' + s;
const CLERK = { admin: 'clerk_itest_mdel_admin', rep: 'clerk_itest_mdel_rep' };
const USR = { admin: 'usr_itest-mdel-admin', rep: 'usr_itest-mdel-rep' };

const ev = (method, { body, query = {}, role = 'Admin', user = CLERK.admin } = {}) => ({
    httpMethod: method,
    headers: { 'x-test-org': A, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, queryStringParameters: query,
});
const answer = (r) => ({ status: r.statusCode, body: JSON.parse(r.body || '{}') });
const doMerge = async (entityType, survivorId, archivedId) => {
    const r = answer(await mergeFn(ev('POST', { body: { entityType, survivorId, archivedId, performedBy: 'Itest Admin' } })));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.mergeLogId;
};
const undo = async (mergeLogId) => answer(await mergeFn(ev('POST', { body: { reverse: true, mergeLogId } })));
const delContact = (id, as = {}) => contactsFn(ev('DELETE', { query: { id }, ...as })).then(answer);
const delAccount = (id) => accountsFn(ev('DELETE', { query: { id } })).then(answer);
const one = async (table, id) => (await db.select().from(table).where(and(eq(table.id, id), eq(table.orgId, A))))[0];

const cleanup = async () => {
    for (const t of [contacts, accounts, mergeLog, auditLog, users]) await db.delete(t).where(eq(t.orgId, A));
};
before(async () => {
    await cleanup();
    await db.insert(users).values([
        { id: USR.admin, clerkUserId: CLERK.admin, orgId: A, name: 'Itest Admin', email: 'mdel-admin@itest.local', role: 'Admin' },
        { id: USR.rep,   clerkUserId: CLERK.rep,   orgId: A, name: 'Itest Rep',   email: 'mdel-rep@itest.local',   role: 'User' },
    ]);
    lib.invalidateRoster();
});
after(async () => { armed = null; await cleanup(); });

test("§0.282 a Delete of a contact merged away is refused — 409 'merged' naming the contact it lives on in, nothing deleted; the merge still undoes", async () => {
    await db.insert(contacts).values([
        { id: ID('c_keep'), orgId: A, firstName: 'Dana', lastName: 'Kept', ownerId: USR.admin },
        { id: ID('c_old'),  orgId: A, firstName: 'Dana', lastName: 'Old',  ownerId: USR.admin },
    ]);
    const log = await doMerge('contact', ID('c_keep'), ID('c_old'));
    const res = await delContact(ID('c_old'));   // a tab loaded before the merge
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.code, 'merged');
    assert.equal(res.body.error, '“Dana Old” was merged into “Dana Kept” — nothing was deleted. It is part of “Dana Kept” now; to remove it, undo the merge first.');
    assert.equal(res.body.mergedIntoId, ID('c_keep'));
    const row = await one(contacts, ID('c_old'));
    assert.deepEqual([row?.mergeArchived, row?.mergedIntoId], [true, ID('c_keep')], 'still merged away, as the merge left it');
    assert.equal((await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.action, 'contact.deleted')))).length, 0, 'no deletion recorded');
    const u = await undo(log);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.equal((await one(contacts, ID('c_old'))).mergeArchived, false, 'the merge undone — the record its own again');
    // Its own again, it deletes as any live contact.
    assert.equal((await delContact(ID('c_old'))).status, 200);
});

test('§0.282 two contacts of one name told apart in the words; a rep\'s stale Delete of their own merged-away contact refused the same', async () => {
    await db.insert(contacts).values([
        { id: ID('c_twin1'), orgId: A, firstName: 'Sam', lastName: 'Twin', ownerId: USR.rep },
        { id: ID('c_twin2'), orgId: A, firstName: 'Sam', lastName: 'Twin', ownerId: USR.rep },
    ]);
    await doMerge('contact', ID('c_twin1'), ID('c_twin2'));
    const res = await delContact(ID('c_twin2'), { role: 'User', user: CLERK.rep });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.code, 'merged');
    assert.equal(res.body.error, 'This contact was merged into another contact also named “Sam Twin” — nothing was deleted. It is part of that contact now; to remove it, undo the merge first.');
    assert.ok(await one(contacts, ID('c_twin2')), 'not deleted');
});

test("§0.282 a Delete of an account merged away is refused — 409 'merged', nothing deleted or lifted; the merge still undoes; deleting a live account (the survivor too) is unchanged", async () => {
    await db.insert(accounts).values([
        { id: ID('a_keep'), orgId: A, name: 'Acme Kept', ownerId: USR.admin },
        { id: ID('a_old'),  orgId: A, name: 'Acme Old',  ownerId: USR.admin },
    ]);
    const log = await doMerge('account', ID('a_keep'), ID('a_old'));
    const res = await delAccount(ID('a_old'));
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.code, 'merged');
    assert.equal(res.body.error, '“Acme Old” was merged into “Acme Kept” — nothing was deleted. It is part of “Acme Kept” now; to remove it, undo the merge first.');
    assert.equal((await one(accounts, ID('a_old'))).mergeArchived, true);
    const u = await undo(log);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    // A live account, and a survivor, delete as before.
    await db.insert(accounts).values([{ id: ID('a_s'), orgId: A, name: 'Beta Kept' }, { id: ID('a_m'), orgId: A, name: 'Beta Old' }]);
    await doMerge('account', ID('a_s'), ID('a_m'));
    const surv = await delAccount(ID('a_s'));
    assert.equal(surv.status, 200, JSON.stringify(surv.body));
    assert.equal(await one(accounts, ID('a_s')), undefined, 'the survivor deleted, as before (Q4)');
});

test('§0.282 a merge landing between the Delete\'s check and its write — the contact\'s delete takes nothing, refused as merged; the account\'s batch aborts at its claim, nothing lifted', async () => {
    await db.insert(contacts).values([
        { id: ID('c_rk'), orgId: A, firstName: 'Race', lastName: 'Keep', ownerId: USR.admin },
        { id: ID('c_rm'), orgId: A, firstName: 'Race', lastName: 'Gone', ownerId: USR.admin },
    ]);
    armed = async () => { await db.update(contacts).set({ mergeArchived: true, mergedIntoId: ID('c_rk'), updatedAt: new Date() }).where(and(eq(contacts.id, ID('c_rm')), eq(contacts.orgId, A))); };
    const c = await delContact(ID('c_rm'));
    assert.equal(armed, null, 'the merge ran');
    assert.equal(c.status, 409, JSON.stringify(c.body));
    assert.equal(c.body.code, 'merged');
    assert.ok(await one(contacts, ID('c_rm')), 'not deleted');

    await db.insert(accounts).values([
        { id: ID('a_rk'), orgId: A, name: 'Race Co Keep' },
        { id: ID('a_rm'), orgId: A, name: 'Race Co Gone' },
        { id: ID('a_rsub'), orgId: A, name: 'Race Co Site', parentAccountId: ID('a_rm'), accountTier: 'site' },
    ]);
    armed = async () => { await db.update(accounts).set({ mergeArchived: true, mergedIntoId: ID('a_rk'), updatedAt: new Date() }).where(and(eq(accounts.id, ID('a_rm')), eq(accounts.orgId, A))); };
    const a = await delAccount(ID('a_rm'));
    assert.equal(armed, null, 'the merge ran');
    assert.equal(a.status, 409, JSON.stringify(a.body));
    assert.equal(a.body.code, 'merged');
    assert.ok(await one(accounts, ID('a_rm')), 'not deleted');
    const sub = await one(accounts, ID('a_rsub'));
    assert.deepEqual([sub.parentAccountId, sub.accountTier], [ID('a_rm'), 'site'], 'nothing lifted — the batch aborted whole');
});

test("§0.282 review: once the record it was merged into is gone, the merge can never be undone — the record merged away deletes as before (a contact, an account); never stranded", async () => {
    await db.insert(contacts).values([
        { id: ID('c_sv'), orgId: A, firstName: 'Lone', lastName: 'Survivor', ownerId: USR.admin },
        { id: ID('c_mg'), orgId: A, firstName: 'Lone', lastName: 'Merged',   ownerId: USR.admin },
    ]);
    await doMerge('contact', ID('c_sv'), ID('c_mg'));
    assert.equal((await delContact(ID('c_sv'))).status, 200, 'the survivor deleted (unchanged)');
    const c = await delContact(ID('c_mg'));
    assert.equal(c.status, 200, JSON.stringify(c.body));
    assert.equal(await one(contacts, ID('c_mg')), undefined, 'deleted — its merge could no longer be undone');
    await db.insert(accounts).values([{ id: ID('a_sv'), orgId: A, name: 'Lone Co' }, { id: ID('a_mg'), orgId: A, name: 'Lone Co Old' }]);
    await doMerge('account', ID('a_sv'), ID('a_mg'));
    assert.equal((await delAccount(ID('a_sv'))).status, 200);
    const a = await delAccount(ID('a_mg'));
    assert.equal(a.status, 200, JSON.stringify(a.body));
    assert.equal(await one(accounts, ID('a_mg')), undefined);
});

test('§0.282 review: a record merged into one merged away since — the later merge is named to undo first', async () => {
    await db.insert(contacts).values([
        { id: ID('c_x'), orgId: A, firstName: 'Chain', lastName: 'X' },
        { id: ID('c_y'), orgId: A, firstName: 'Chain', lastName: 'Y' },
        { id: ID('c_z'), orgId: A, firstName: 'Chain', lastName: 'Z' },
    ]);
    await doMerge('contact', ID('c_y'), ID('c_x'));
    await doMerge('contact', ID('c_z'), ID('c_y'));
    const res = await delContact(ID('c_x'));
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.error, '“Chain X” was merged into “Chain Y” — nothing was deleted. It is part of “Chain Y” now; to remove it, undo the later merge of that contact, then this one.');
});

test("§0.282 review: a rep's refusal names the contact it lives on in only where the rep may read it — another rep's survivor: no name, no id", async () => {
    await db.insert(users).values({ id: ID('usr_other'), clerkUserId: 'clerk_itest_mdel_other', orgId: A, name: 'Itest Other', email: 'mdel-other@itest.local', role: 'User' });
    lib.invalidateRoster();
    await db.insert(contacts).values([
        { id: ID('c_theirs'), orgId: A, firstName: 'Hidden', lastName: 'Survivor', ownerId: ID('usr_other') },
        { id: ID('c_open'),   orgId: A, firstName: 'Open',   lastName: 'Merged' },   // nobody's: the rep may delete it
    ]);
    await doMerge('contact', ID('c_theirs'), ID('c_open'));
    const res = await delContact(ID('c_open'), { role: 'User', user: CLERK.rep });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.code, 'merged');
    assert.equal(res.body.error, 'This contact was merged into another contact — nothing was deleted. To remove it, undo the merge first.');
    assert.equal(res.body.mergedIntoId, null, 'not the survivor\'s id either');
    assert.ok(!JSON.stringify(res.body).includes('Hidden'), 'never the name');
    // An Admin is told it.
    assert.equal((await delContact(ID('c_open'))).body.mergedIntoId, ID('c_theirs'));
});


test('§0.282 a Delete of an id this org does not hold is still the 404 gone — for a contact and an account', async () => {
    assert.deepEqual([(await delContact(ID('nope'))).body.code, (await delAccount(ID('nope'))).body.code], ['gone', 'gone']);
});
