// tests/integration/merge-undo.itest.mjs
//
// A merge's Undo (state §0.207; guide §18b100), against the test database: merge.mjs's Undo and its new GET (Past
// merges). Jeff, 17 Oct: Q1 "Past merges on each page"; Q2 "No limit, safety checks decide"; Q3 "Keep later edits" —
// a deal's account id and account name always move together; Q4 "Undo refuses and explains" — deleting stays as it is.
//
// Before: the reverse answered 200 over a record merged away and deleted since (its links moved back to an id that is
// gone — OPEN_ITEMS §4.7), over a survivor deleted or merged into another record since (that merge's rows pulled
// back), and over one made live again; it wrote every link and the survivor's fields back over the edits made since;
// two sent together both wrote, two audit rows; a contact merge's Undo had never been run here; and there was no GET.
//
// Proves (each test fails on the code before this batch, on its own rule — but I12, isolation, which held and is
// proved again on the new code; I9 and I13 read the new exports inside them, so the others load there):
//   I1  Past merges: newest first, by kind, who merged (the roster's name by id, else the name sent), dates as UTC
//       text, why a row can no longer be undone; another org's never; Admins and Managers alone
//   I2  nothing changed since: everything back, the record merged away live, the log undone, one audit row
//   I3  changed since: what still holds the merge's value comes back, the rest kept and counted; a deal's id and name
//       together — the survivor renamed since, the survivor's rename put back (cascaded by account id), the record
//       merged away renamed while merged
//   I4-I7  refused, nothing written: the record merged away deleted, the survivor deleted, the survivor merged
//       into another (that merge undone first, then this one), the record merged away made live
//   I8  two Undos at once: one 200, one 409 "already been undone", one audit row — the end state (the claim's assert
//       itself: I9; the log's status read again after its records is T9's text pin — the interleaving it is for, the
//       loser's log read before the winner commits and its records after, is not forced here)
//   I9  the batch's own refusal, built from a log read as merged and run after the records changed under it — the
//       abort's code read as undoBatch reads it (open question 3)
//   I10 a contact merge and its Undo (the first run here): ids, deals' committees, a colleague's managers, the
//       survivor's org chart and phone back; a committee changed since kept
//   I11 D22: a deal moved up and moved by hand since kept; the other back under its account's name as it stands
//   I12 isolation: org B — every row named as A's — as seeded throughout; B's Undo of A's merge 404, nothing written
//   I13 survivorRestore (the Undo's model of what the merge wrote) equals the merge's real write, after the merges
//       of I2, I3, I10 and I11 and an H6 merge of its own
// The review (17 Oct, b13/wf-reviews.json):
//   I14 the house parent rule: what goes back under the record merged away goes back only where a delete's Undo would
//       put it back, the rest kept and counted — an account added under a lifted site since, the record merged away
//       moved under the survivor or made a site since; and in the batch itself, an account added under the survivor or
//       the record merged away moved after the Undo read them
//   I15 a deal on the survivor by id that already carried the merged-away name (twins, a deal moved before §0.198):
//       no change kept; a deal moved since still kept; (d) a deal by name alone moved up by a merge into a site, moved
//       by hand onto the survivor since: kept — on this batch's log and on one written before it
//   I16 the survivor's name cascade, the survivor deleted: writes nothing; org B still as seeded
// The re-check (17 Oct, b13/recheck):
//   I17 a contact's company put back by name only while the contact is not linked to the survivor by id — linked
//       since: kept, counted; the other twin's: back; the survivor's own at the merge: no change kept
//   I18 D22: a deal moved up, moved by hand onto the survivor once it stopped being a site: kept, counted — never
//       moved back by its id — also when the survivor's name comes back and is cascaded over it
//   I19 a row whose own tier changed since the merge: under the record merged away only where it ranks above it; a
//       legacy shape as stored goes back by the merge's logged tier
//   I20 a deal or contact by name alone linked to the survivor since: kept, counted — the merge logs which stood on the
//       survivor by id; org B still as seeded
// A log written before this batch (loggedBefore) has neither of the two new log fields: I15(d), I17, I19 and I20 run
// it too, and say what it cannot tell.
// Jeff's second set (18 Oct, b13/jeff-answers.md — "Leave such deals and count them"):
//   I21 an Undo never puts a deal on a site: a survivor that would go back a site while a deal stands on it by id keeps
//       its place, the rest of its fields back, each such deal counted — one linked to the lifted survivor since, its
//       own from before the merge (its name cascaded back over it), a tier a merge was sent reversed; no deal goes back
//       to the record merged away made a site since, by its id or its lift — each stays, counted; and in the batch
//       itself, a deal linked to the survivor after the Undo read its deals keeps it where it stands, and the record
//       merged away read a site, then made an account again, takes its deal back, never counted kept.
// The last fix round (18 Oct, b13/recheck5):
//   I22 a deal by name alone never goes back to the record merged away while that is a site, as by its id: both stay
//       on the survivor, counted, and the audit row says what the Undo left; one whose name the merge left as it was
//       (twins) no change; the survivor's own, renamed when the merge gave it the merged-away name, back to its name.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST — see TESTING.md)

if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// The caller: the test org and role from the headers; the Clerk id 'u_' + org (deal-account.itest.mjs's stub).
mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            return { userId: 'u_' + orgId, orgId, userRole, managedReps: [], error: null };
        },
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isManager:    (role) => role === 'Manager',
        isReadOnly:   (role) => role === 'ReadOnly',
        isTechnician: (role) => role === 'Technician',
    },
});

const { handler: mergeFn } = await import('../../netlify/functions/merge.mjs');
const { db } = await import('../../db/index.js');
const { accounts, contacts, opportunities, tasks, activities, mergeLog, auditLog, users } = await import('../../db/schema.js');
const { eq, and, inArray, sql, getTableColumns } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_mundo_*' — its two orgs, and every id it writes (ids are global keys) — and
// ONLY this file writes to it (guide §18b25).
const A = 'itest_mundo_A', B = 'itest_mundo_B';
const ID = (s) => 'itest_mundo_' + s;
const ADMIN_NAME = 'Mundo Admin';   // A's roster row for the stub's caller

const ev = (org, method, { body, role = 'Admin', query } = {}) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-role': role, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: query || {},
});
const call = async (org, body, role) => {
    const r = await mergeFn(ev(org, 'POST', { body, role }));
    return { status: r.statusCode, body: JSON.parse(r.body || '{}') };
};
const merge = async (survivorId, archivedId, extra = {}, entityType = 'account') => {
    const r = await call(A, { entityType, survivorId, archivedId, performedBy: 'Sent Name', ...extra });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body.mergeLogId;
};
const undo = (mergeLogId, org = A) => call(org, { reverse: true, mergeLogId });
const past = async (org, entityType, role) => {
    const r = await mergeFn(ev(org, 'GET', { role, query: { entityType } }));
    return { status: r.statusCode, body: JSON.parse(r.body || '{}') };
};
const one = async (table, id) => (await db.select().from(table).where(eq(table.id, id)))[0];
const deal = async (id) => { const r = await one(opportunities, id); return [r.accountId, r.account, r.site]; };
const logOf = (id) => one(mergeLog, id);
const undoneRows = async (logId) => (await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), inArray(auditLog.action, ['account.merge_undone', 'contact.merge_undone']))))
    .filter((r) => String(r.detail || '').includes(logId));
const live = (row) => [row.mergeArchived, row.mergedIntoId ?? null, row.archivedAt ?? null];

// Rows, as the screens create them.
const acct = (id, name, extra = {}) => ({ id, name, orgId: A, ...extra });
const opp = (id, accountId, account, extra = {}) => ({ id, opportunityName: id, account, accountId, pipelineId: 'default', stage: 'Discovery', orgId: A, ...extra });
const task = (id, extra) => ({ id, title: id, orgId: A, ...extra });
const person = (id, firstName, lastName, extra = {}) => ({ id, firstName, lastName, orgId: A, ...extra });

// Each A account name, given to org B too — a merge or an Undo that reached past its org would rename or move B's.
const NAMES = ['I1 First Old', 'I1 First New', 'I2 Old Co', 'I2 New Co', 'I3 Old Co', 'I3 New Co', 'I3b Old Co', 'I3b New Co',
    'I3c Brand', 'I3c Old Name', 'I3d Old', 'I3d New', 'I4 Old', 'I5 Old', 'I6 Old', 'I6 New', 'I7 Old', 'I8 Old', 'I10 Co',
    'I11 Unit', 'I11 Site', 'I12 Old Co', 'I12 New Co', 'I13 Plant', 'I14A Plant', 'I14B Plant', 'I14C Plant', 'I14D Plant', 'I14E Plant',
    'I15 Shell - Port Allen', 'I15b Old Co', 'I15b New Co', 'I15c Old Co', 'I15c New Co', 'I16 Brand', 'I16 Old Name',
    'I15D Old Co', 'I15D Site', 'I15E Old Co', 'I15E Site', 'I17 Old', 'I17 New', 'I17C Old', 'I17C New', 'I17b Shell PA', 'I17b Shell',
    'I18 Old', 'I18 Site', 'I18B Old', 'I18B Site', 'I19 Unit', 'I19 Other', 'I19b Unit', 'I19b Dock', 'I19C Unit', 'I19C Other',
    'I19D Unit', 'I19D Other', 'I20 Old Co', 'I20 New Co', 'I20C Old Co', 'I20C New Co', 'I20b Brand', 'I20b Old Name',
    'I21A Plant', 'I21A Dock', 'I21B Plant', 'I21B Dock', 'I21C Co', 'I21C Dock', 'I21H Co', 'I21H Dock', 'I21D Co', 'I21D Dock',
    'I21E Old', 'I21E Site', 'I21F Plant', 'I21F Dock', 'I21G Co', 'I21G Dock',
    'I22A Top', 'I22A Old', 'I22A New', 'I22B Top', 'I22B Twin', 'I22C Top', 'I22C Old', 'I22C New'];
const bRows = async () => {
    const out = {};
    for (const [k, t] of Object.entries({ accounts, contacts, opportunities, tasks, activities, mergeLog })) {
        out[k] = JSON.stringify((await db.select().from(t).where(eq(t.orgId, B))).sort((x, y) => (x.id < y.id ? -1 : 1)));
    }
    return out;
};
let B_SEEDED = null;

// I13: the survivor as each merge left it, read right after the merge — survivorRestore is held to it in I13.
const AFTER_MERGE = [];
const capture = async (label, kind, logId) => {
    const log = await logOf(logId);
    const table = kind === 'contact' ? contacts : accounts;
    AFTER_MERGE.push({ label, kind, log, now: await one(table, log.survivorId) });
};

const cleanup = async () => {
    for (const o of [A, B]) {
        for (const t of [tasks, activities, opportunities, contacts, accounts, mergeLog, auditLog, users]) await db.delete(t).where(eq(t.orgId, o));
    }
    invalidateRoster(A); invalidateRoster(B);
};

before(async () => {
    await cleanup();
    // the stub's caller is a member of A (its Clerk id), so Past merges names them by the server's own id (B11)
    await db.insert(users).values({ id: ID('usr_admin'), clerkUserId: 'u_' + A, name: ADMIN_NAME, email: 'mundo-admin@itest.invalid', role: 'Admin', orgId: A });
    invalidateRoster(A);
    // org B: every name A merges — an account, a contact at a company of the name, a deal of the name by id and one
    // with none, a task — a same-named pair of contacts with an org chart, and a merge of its own in its log
    const b = NAMES.map((name, i) => ({ name, acct: ID(`b_acct_${i}`), i }));
    await db.insert(accounts).values(b.map(({ name, acct: id }) => ({ id, name, orgId: B })));
    await db.insert(contacts).values([
        ...b.map(({ name, i }) => ({ id: ID(`b_con_${i}`), firstName: 'Bea', lastName: `Bee ${i}`, company: name, orgId: B })),
        { id: ID('b_ina1'), firstName: 'Ina', lastName: 'Tenmerge', orgId: B, directReports: [{ id: ID('b_kit'), name: 'Kit Colleague' }] },
        { id: ID('b_ina2'), firstName: 'Ina', lastName: 'Tenmerge', orgId: B },
        { id: ID('b_kit'), firstName: 'Kit', lastName: 'Colleague', orgId: B, managers: [{ id: ID('b_ina1'), name: 'Ina Tenmerge' }] },
    ]);
    await db.insert(opportunities).values([
        ...b.map(({ name, acct: id, i }) => ({ id: ID(`b_dealid_${i}`), opportunityName: `B ${i}`, account: name, accountId: id, contactIds: [ID('b_ina1')], pipelineId: 'default', stage: 'Discovery', orgId: B })),
        ...b.map(({ name, i }) => ({ id: ID(`b_dealname_${i}`), opportunityName: `B by name ${i}`, account: name, accountId: null, pipelineId: 'default', stage: 'Discovery', orgId: B })),
    ]);
    await db.insert(tasks).values(b.map(({ acct: id, i }) => ({ id: ID(`b_task_${i}`), title: `B task ${i}`, accountId: id, contactId: ID('b_ina1'), orgId: B })));
    await db.insert(mergeLog).values({ id: ID('b_log'), orgId: B, entityType: 'account', survivorId: ID('b_acct_1'), survivorName: 'I1 First New', archivedId: ID('b_acct_0'), archivedName: 'I1 First Old', rewrites: [], status: 'merged', performedBy: 'B Admin', performedById: 'u_' + B });
    B_SEEDED = await bRows();
});
after(cleanup);

test("I1 — Past merges (GET /merge, Q1): this org's merges of one kind, newest first, each with its names, who merged — the member's roster name by the server's own id, else the name the merge was sent with — its status, and why it can no longer be undone; contact merges listed apart; dates as UTC text; another org's never; Admins and Managers alone", async () => {
    const [X1, Y1, X2, Y2, K1, K2] = ['i1_x1', 'i1_y1', 'i1_x2', 'i1_y2', 'i1_k1', 'i1_k2'].map(ID);
    await db.insert(accounts).values([acct(X1, 'I1 First Old'), acct(Y1, 'I1 First New'), acct(X2, 'I1 Second Old'), acct(Y2, 'I1 Second New')]);
    await db.insert(contacts).values([person(K1, 'Kay', 'Ione'), person(K2, 'Kay', 'Ione')]);
    const L1 = await merge(Y1, X1);
    const L2 = await merge(Y2, X2);
    const LC = await merge(K1, K2, {}, 'contact');
    // an older merge whose performer has no roster row here (B11): its log row as the merge writes one
    const OLD = ID('i1_old');
    await db.insert(mergeLog).values({ id: OLD, orgId: A, entityType: 'account', survivorId: ID('i1_gone_y'), survivorName: 'I1 Gone New', archivedId: ID('i1_gone_x'), archivedName: 'I1 Gone Old',
        rewrites: [], status: 'merged', performedBy: 'Old Performer', performedById: 'u_nobody', createdAt: new Date(Date.now() - 3_600_000) });
    const r = await past(A, 'account');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body.merges.map((m) => m.id), [L2, L1, OLD], 'newest first; the contact merge not among them');
    const [m2, m1, old] = r.body.merges;
    const { createdAt, ...rest } = m1;
    assert.deepEqual(rest, { id: L1, status: 'merged', survivorId: Y1, survivorName: 'I1 First New', archivedId: X1, archivedName: 'I1 First Old', by: ADMIN_NAME, reversedAt: null, refusal: null },
        "who merged: the member's roster name by the server's own id, not the name the merge was sent with");
    assert.equal(m2.by, ADMIN_NAME);
    assert.equal(old.by, 'Old Performer', 'no roster row for its performer: the name it was sent with');
    assert.equal(old.refusal, '“I1 Gone Old” was deleted after this merge, so the merge can no longer be undone.', "why it has no Undo, by the Undo's own rule");
    for (const m of [m1, m2]) {
        assert.match(m.createdAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/, 'UTC text, never through the driver\'s local reading');
        assert.ok(Math.abs(Date.parse(m.createdAt) - Date.now()) < 120_000, `stored as UTC wall time (open question 2): ${m.createdAt} against ${new Date().toISOString()}`);
    }
    assert.equal(r.body.more, false);
    const c = await past(A, 'contact');
    assert.deepEqual(c.body.merges.map((m) => [m.id, m.archivedName, m.survivorName, m.by, m.refusal]), [[LC, 'Kay Ione', 'Kay Ione', ADMIN_NAME, null]], 'contact merges apart');
    const b = await past(B, 'account');
    assert.equal(b.status, 200);
    assert.deepEqual(b.body.merges.map((m) => m.id), [ID('b_log')], "org B: its own merge alone — none of A's");
    assert.deepEqual((await past(B, 'contact')).body.merges, []);
    for (const role of ['User', 'ReadOnly']) assert.equal((await past(A, 'account', role)).status, 403, `${role}: refused`);
    assert.deepEqual((await past(A, 'account', 'Manager')).body.merges.map((m) => m.id), [L2, L1, OLD], 'a Manager: the same list');
    assert.equal((await undo(L1)).status, 200);
    const undone = (await past(A, 'account')).body.merges.find((m) => m.id === L1);
    assert.deepEqual([undone.status, undone.refusal], ['reversed', null]);
    assert.match(undone.reversedAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
    assert.ok(Math.abs(Date.parse(undone.reversedAt) - Date.now()) < 120_000, `undone just now: ${undone.reversedAt}`);
});

test("I2 — an Undo with nothing changed since puts every link back — tasks, activities, deals by id and by name, contacts' company, a sub-account — and the survivor's fields with its owner id; the record merged away is live; the log reads undone, one audit row; the answer names the record and that nothing was kept", async () => {
    const [X, Y, CH, T1, A1, DX, DN, CX] = ['i2_x', 'i2_y', 'i2_child', 'i2_t', 'i2_a', 'i2_dx', 'i2_dn', 'i2_cx'].map(ID);
    await db.insert(accounts).values([
        acct(X, 'I2 Old Co', { phone: '555-0202', accountOwner: 'X Owner', ownerId: ID('usr_x') }),
        acct(Y, 'I2 New Co', { phone: null, accountOwner: 'Y Owner', ownerId: ID('usr_y') }),
        acct(CH, 'I2 Child', { parentAccountId: X }),
    ]);
    await db.insert(tasks).values(task(T1, { accountId: X }));
    await db.insert(activities).values({ id: A1, subject: 'I2 call', accountId: X, orgId: A });
    await db.insert(opportunities).values([opp(DX, X, 'I2 Old Co'), opp(DN, null, 'I2 Old Co')]);
    await db.insert(contacts).values(person(CX, 'Cy', 'Exe', { company: 'I2 Old Co' }));
    const L = await merge(Y, X, { resolvedFields: { phone: '555-0202', accountOwner: 'X Owner' } });
    assert.deepEqual(await deal(DX), [Y, 'I2 New Co', null], 'merged: the deal on the survivor');
    const merged = await one(accounts, Y);
    assert.deepEqual([merged.phone, merged.accountOwner, merged.ownerId], ['555-0202', 'X Owner', ID('usr_x')]);
    await capture('I2', 'account', L);
    const u = await undo(L);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.deepEqual(u.body, { success: true, reversed: L, restoredId: X, restoredName: 'I2 Old Co', keptLinks: 0, keptFields: [] });
    assert.equal((await one(tasks, T1)).accountId, X);
    assert.equal((await one(activities, A1)).accountId, X);
    assert.deepEqual(await deal(DX), [X, 'I2 Old Co', null], 'by id: its account and its name');
    assert.deepEqual(await deal(DN), [null, 'I2 Old Co', null], 'by name');
    assert.equal((await one(contacts, CX)).company, 'I2 Old Co');
    assert.equal((await one(accounts, CH)).parentAccountId, X, 'the sub-account back under it');
    const y = await one(accounts, Y);
    assert.deepEqual([y.name, y.phone, y.accountOwner, y.ownerId], ['I2 New Co', null, 'Y Owner', ID('usr_y')], "the survivor's fields and its owner id, as they were");
    assert.deepEqual(live(await one(accounts, X)), [false, null, null], 'the record merged away, live');
    const log = await logOf(L);
    assert.equal(log.status, 'reversed');
    assert.ok(log.reversedAt);
    const rows = await undoneRows(L);
    assert.deepEqual(rows.map((r) => [r.action, r.detail, r.userName]), [['account.merge_undone', `I2 Old Co restored · undo of ${L}`, ADMIN_NAME]], 'one audit row, named');
});

test("I3 — changed since (Q3: \"Keep later edits\"): what still holds the merge's value comes back, the rest is kept and counted — a task moved on, a contact's company edited, a deal's name edited, the survivor's phone edited; a deal's account id and name move together: the survivor renamed since, the merge's rename of the survivor put back (its deals and contacts by account id take it, as the accounts PUT's rename does), the record merged away renamed while merged", async () => {
    // (a) the rows named (B4): t1, cx, dn kept; t2, dx, cy back; the phone kept
    const [X, Y, W, T1, T2, DX, DN, CX, CY] = ['i3_x', 'i3_y', 'i3_w', 'i3_t1', 'i3_t2', 'i3_dx', 'i3_dn', 'i3_cx', 'i3_cy'].map(ID);
    await db.insert(accounts).values([acct(X, 'I3 Old Co', { phone: '555-0303' }), acct(Y, 'I3 New Co'), acct(W, 'I3 Other')]);
    await db.insert(tasks).values([task(T1, { accountId: X }), task(T2, { accountId: X })]);
    await db.insert(opportunities).values([opp(DX, X, 'I3 Old Co'), opp(DN, null, 'I3 Old Co')]);
    await db.insert(contacts).values([person(CX, 'Cee', 'Ex', { company: 'I3 Old Co' }), person(CY, 'Cee', 'Wy', { company: 'I3 Old Co' })]);
    const L = await merge(Y, X, { resolvedFields: { phone: '555-0303' } });
    await capture('I3', 'account', L);
    await db.update(tasks).set({ accountId: W }).where(eq(tasks.id, T1));
    await db.update(contacts).set({ company: 'Elsewhere' }).where(eq(contacts.id, CX));
    await db.update(opportunities).set({ account: 'I3 Renamed' }).where(eq(opportunities.id, DN));
    await db.update(accounts).set({ phone: '555-9999' }).where(eq(accounts.id, Y));
    const u = await undo(L);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.deepEqual([u.body.keptLinks, u.body.keptFields], [3, ['phone']], 'kept: t1, cx and dn — and the phone');
    assert.deepEqual([(await one(tasks, T1)).accountId, (await one(tasks, T2)).accountId], [W, X], 'the task moved on stays; the other comes back');
    assert.deepEqual(await deal(DX), [X, 'I3 Old Co', null]);
    assert.deepEqual(await deal(DN), [null, 'I3 Renamed', null], 'its name edited since: kept');
    assert.deepEqual([(await one(contacts, CX)).company, (await one(contacts, CY)).company], ['Elsewhere', 'I3 Old Co']);
    assert.equal((await one(accounts, Y)).phone, '555-9999', "the survivor's phone edited since: kept");
    assert.deepEqual(live(await one(accounts, X)), [false, null, null]);

    // (b) the survivor renamed since — its PUT renamed its deals by id (accounts.mjs): the deal merged away comes
    // back on its account under that account's name; the survivor's own deal keeps the survivor's new name
    const [XB, YB, DXB, DYB] = ['i3b_x', 'i3b_y', 'i3b_dx', 'i3b_dy'].map(ID);
    await db.insert(accounts).values([acct(XB, 'I3b Old Co'), acct(YB, 'I3b New Co')]);
    await db.insert(opportunities).values([opp(DXB, XB, 'I3b Old Co'), opp(DYB, YB, 'I3b New Co')]);
    const LB = await merge(YB, XB);
    await db.update(accounts).set({ name: 'I3b Renamed Co' }).where(eq(accounts.id, YB));
    await db.update(opportunities).set({ account: 'I3b Renamed Co' }).where(eq(opportunities.accountId, YB));
    assert.equal((await undo(LB)).status, 200);
    assert.deepEqual(await deal(DXB), [XB, 'I3b Old Co', null]);
    assert.deepEqual(await deal(DYB), [YB, 'I3b Renamed Co', null]);
    assert.equal((await one(accounts, YB)).name, 'I3b Renamed Co', 'REGRESSION: the survivor\'s rename since put back over — its deals then under another name than their account\'s');

    // (c) the merge renamed the survivor to the name of the record merged away: put back, it is the name of every deal
    // and contact linked to the survivor by id — one linked since the merge too
    const [XC, YC, DYC, KYC, DNEW] = ['i3c_x', 'i3c_y', 'i3c_dy', 'i3c_ky', 'i3c_dnew'].map(ID);
    await db.insert(accounts).values([acct(XC, 'I3c Brand'), acct(YC, 'I3c Old Name')]);
    await db.insert(opportunities).values(opp(DYC, YC, 'I3c Old Name'));
    await db.insert(contacts).values(person(KYC, 'Kai', 'Wy', { accountId: YC, company: 'I3c Old Name' }));
    const LC = await merge(YC, XC, { resolvedFields: { name: 'I3c Brand' } });
    assert.equal((await one(accounts, YC)).name, 'I3c Brand');
    await db.insert(opportunities).values(opp(DNEW, YC, 'I3c Brand'));
    const uc = await undo(LC);
    assert.equal(uc.status, 200, JSON.stringify(uc.body));
    assert.deepEqual([uc.body.keptLinks, uc.body.keptFields], [0, []]);
    assert.equal((await one(accounts, YC)).name, 'I3c Old Name');
    assert.deepEqual(await deal(DYC), [YC, 'I3c Old Name', null]);
    assert.deepEqual(await deal(DNEW), [YC, 'I3c Old Name', null], 'REGRESSION: a deal linked since keeps the merged name — its name split from its account\'s (no cascade)');
    assert.equal((await one(contacts, KYC)).company, 'I3c Old Name');

    // (d) the record merged away renamed while merged: its deal comes back under its name as it stands
    const [XD, YD, DXD] = ['i3d_x', 'i3d_y', 'i3d_dx'].map(ID);
    await db.insert(accounts).values([acct(XD, 'I3d Old'), acct(YD, 'I3d New')]);
    await db.insert(opportunities).values(opp(DXD, XD, 'I3d Old'));
    const LD = await merge(YD, XD);
    await db.update(accounts).set({ name: 'I3d Renamed' }).where(eq(accounts.id, XD));
    assert.equal((await undo(LD)).status, 200);
    assert.deepEqual(await deal(DXD), [XD, 'I3d Renamed', null], 'REGRESSION: a deal moved back by its id under the account\'s old name (C2)');
});

// A merge of X into Y with a task on X: what I4-I8 refuse or race over.
const pair = async (tag) => {
    const [X, Y, T] = [`${tag}_x`, `${tag}_y`, `${tag}_t`].map(ID);
    const n = tag.toUpperCase();
    await db.insert(accounts).values([acct(X, `${n} Old`), acct(Y, `${n} New`)]);
    await db.insert(tasks).values(task(T, { accountId: X }));
    return { X, Y, T, L: await merge(Y, X) };
};
const nothingWritten = async ({ Y, T, L }, why) => {
    assert.equal((await one(tasks, T)).accountId, Y, `${why}: the task where the merge put it`);
    assert.equal((await logOf(L)).status, 'merged', `${why}: the log still reads merged`);
    assert.deepEqual(await undoneRows(L), [], `${why}: no merge_undone row`);
};

test('I4 — the record merged away deleted since (Q4): 409 in words, nothing written — deleting stays as it is (the reverse answered 200 and moved its links back to the deleted id, OPEN_ITEMS §4.7)', async () => {
    const m = await pair('i4');
    await db.delete(accounts).where(eq(accounts.id, m.X));
    const u = await undo(m.L);
    assert.equal(u.status, 409, JSON.stringify(u.body));
    assert.equal(u.body.error, '“I4 Old” was deleted after this merge, so the merge can no longer be undone.');
    await nothingWritten(m, 'refused');
});

test('I5 — the survivor deleted since: 409 in words, nothing written — the record merged away stays merged', async () => {
    const m = await pair('i5');
    await db.delete(accounts).where(eq(accounts.id, m.Y));
    const u = await undo(m.L);
    assert.equal(u.status, 409, JSON.stringify(u.body));
    assert.equal(u.body.error, '“I5 New” was deleted after this merge, so the merge can no longer be undone.');
    await nothingWritten(m, 'refused');
    assert.deepEqual(live(await one(accounts, m.X)).slice(0, 2), [true, m.Y], 'still merged into it');
});

test('I6 — the survivor merged into another record since: 409 naming it — undo that merge first; once it is undone, this Undo goes through and puts its own links back', async () => {
    const m = await pair('i6');
    const Z = ID('i6_z');
    await db.insert(accounts).values(acct(Z, 'I6 Holding'));
    const L2 = await merge(Z, m.Y);
    const u = await undo(m.L);
    assert.equal(u.status, 409, JSON.stringify(u.body));
    assert.equal(u.body.error, '“I6 New” was merged into “I6 Holding” after this merge — undo that merge first.');
    assert.equal((await one(tasks, m.T)).accountId, Z, 'nothing written: the task on the record the survivor was merged into');
    assert.equal((await undo(L2)).status, 200);
    assert.equal((await one(tasks, m.T)).accountId, m.Y);
    const again = await undo(m.L);
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal((await one(tasks, m.T)).accountId, m.X);
    assert.deepEqual(live(await one(accounts, m.X)), [false, null, null]);
});

test("I7 — the record merged away made live since (a delete's Undo re-sends it without its merge): 409 in words, nothing written", async () => {
    const m = await pair('i7');
    await db.update(accounts).set({ mergeArchived: false, mergedIntoId: null, archivedAt: null }).where(eq(accounts.id, m.X));
    const u = await undo(m.L);
    assert.equal(u.status, 409, JSON.stringify(u.body));
    assert.equal(u.body.error, '“I7 Old” is no longer merged into “I7 New”, so this merge can no longer be undone.');
    await nothingWritten(m, 'refused');
});

test('I8 — two Undos of one merge sent together: one 200, one 409 "already been undone", one audit row; the end state as one Undo leaves it (the end state only — the claim\'s own assert is I9); an Undo sent after it: "already been undone"', async () => {
    const m = await pair('i8');
    const both = await Promise.all([undo(m.L), undo(m.L)]);
    assert.deepEqual(both.map((r) => r.status).sort(), [200, 409], JSON.stringify(both.map((r) => r.body)));
    // The loser's words (the review, 17 Oct): stopped by the claim, the log read again — "already been undone", never
    // the record the winner made live read as "no longer merged into". Its log read before the winner committed and its
    // two records after is the interleaving the status re-read is for (T9's text pin); this run does not force it.
    assert.equal(both.find((r) => r.status === 409).body.error, 'This merge has already been undone.', JSON.stringify(both.map((r) => r.body)));
    assert.equal((await undoneRows(m.L)).length, 1, 'one audit row');
    const third = await undo(m.L);
    assert.deepEqual([third.status, third.body.error], [409, 'This merge has already been undone.']);
    assert.equal((await one(tasks, m.T)).accountId, m.X);
    assert.deepEqual(live(await one(accounts, m.X)), [false, null, null]);
    assert.equal((await logOf(m.L)).status, 'reversed');
});

// The Undo's two records as undoRowsOf reads them — the survivor with its last-edited time as text — the org's
// accounts as undoMergeLog reads them for the parent rule (treeOf), and the survivor's deals by id (dealsOn — Jeff,
// 18 Oct: an Undo never puts a deal on a site).
const rowsOf = async (log) => {
    const rows = await db.select({ ...getTableColumns(accounts), updatedAtText: sql`${accounts.updatedAt}::text` }).from(accounts)
        .where(and(eq(accounts.orgId, A), inArray(accounts.id, [log.archivedId, log.survivorId])));
    const tree = await db.select({ id: accounts.id, name: accounts.name, parentAccountId: accounts.parentAccountId, accountTier: accounts.accountTier, mergeArchived: accounts.mergeArchived })
        .from(accounts).where(eq(accounts.orgId, A));
    const deals = (await db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.orgId, A), eq(opportunities.accountId, log.survivorId)))).map((d) => d.id);
    return { archived: rows.find((r) => r.id === log.archivedId), survivor: rows.find((r) => r.id === log.survivorId), tree, deals };
};

test("I9 — the batch refuses by itself (C14, B5): an Undo's batch built from a log read as merged, run after the records changed under it, writes nothing and answers 409 in words — the record merged away made live, deleted, or the merge undone and made again (that new merge intact); the abort's code is 22012 where undoBatch reads it (open question 3)", async () => {
    const { undoOps, undoBatch } = await import('../../netlify/functions/merge.mjs');
    assert.equal(typeof undoOps, 'function', 'undoOps exported for this suite');
    assert.equal(typeof undoBatch, 'function', 'undoBatch exported for this suite');
    const built = async (L) => { const log = await logOf(L); return { log, ops: undoOps('account', log, await rowsOf(log), A, new Date()).ops }; };
    const run = ({ log, ops }) => undoBatch(ops, { log, table: accounts, orgId: A, headers: {} });

    // (a) made live after the Undo read it — and (d) the raw abort
    const a = await pair('i9a');
    const ba = await built(a.L), bd = await built(a.L);
    await db.update(accounts).set({ mergeArchived: false, mergedIntoId: null }).where(eq(accounts.id, a.X));
    const code = await db.batch(bd.ops).then(() => 'committed', (e) => String(e?.cause?.code || e?.code || ''));
    assert.equal(code, '22012', 'the un-archive wrote no row: 1 / 0 aborts the batch, and the code is where undoBatch reads it');
    const ra = await run(ba);
    assert.deepEqual([ra.refused?.statusCode, JSON.parse(ra.refused?.body || '{}').error], [409, '“I9A Old” is no longer merged into “I9A New”, so this merge can no longer be undone.']);
    await nothingWritten(a, '(a)');

    // (b) deleted after the Undo read it
    const b = await pair('i9b');
    const bb = await built(b.L);
    await db.delete(accounts).where(eq(accounts.id, b.X));
    const rb = await run(bb);
    assert.deepEqual([rb.refused?.statusCode, JSON.parse(rb.refused?.body || '{}').error], [409, '“I9B Old” was deleted after this merge, so the merge can no longer be undone.']);
    await nothingWritten(b, '(b)');

    // (c) a stale Undo — a list read before the merge was undone and made again (C6): the claim takes no merge already undone
    const c = await pair('i9c');
    const bc = await built(c.L);
    assert.equal((await undo(c.L)).status, 200);
    const L2 = await merge(c.Y, c.X);
    const rc = await run(bc);
    assert.deepEqual([rc.refused?.statusCode, JSON.parse(rc.refused?.body || '{}').error], [409, 'This merge has already been undone.']);
    assert.deepEqual(live(await one(accounts, c.X)).slice(0, 2), [true, c.Y], 'the new merge intact: the record still merged away');
    assert.equal((await one(tasks, c.T)).accountId, c.Y, 'its task still on the survivor');
    assert.equal((await logOf(L2)).status, 'merged');
});

test("I10 — a contact merge and its Undo (the first run here): the task's and the activity's contact, a deal's committee, a colleague's managers, the survivor's direct reports and phone, all back; a deal whose committee changed since is kept and counted", async () => {
    const [C1, C2, K, C8, C9, D1, D2, T1, A1] = ['i10_c1', 'i10_c2', 'i10_kit', 'i10_c8', 'i10_c9', 'i10_d1', 'i10_d2', 'i10_t', 'i10_a'].map(ID);
    await db.insert(contacts).values([
        person(C1, 'Ina', 'Tenmerge', { company: 'I10 Co', phone: null }),
        person(C2, 'Ina', 'Tenmerge', { company: 'I10 Co', phone: '555-1010', directReports: [{ id: K, name: 'Kit Colleague' }] }),
        person(K, 'Kit', 'Colleague', { company: 'I10 Co', managers: [{ id: C2, name: 'Ina Tenmerge' }] }),
    ]);
    await db.insert(opportunities).values([opp(D1, null, 'I10 Co', { contactIds: [C2, C9] }), opp(D2, null, 'I10 Co', { contactIds: [C2] })]);
    await db.insert(tasks).values(task(T1, { contactId: C2 }));
    await db.insert(activities).values({ id: A1, subject: 'I10 call', contactId: C2, orgId: A });
    const L = await merge(C1, C2, { resolvedFields: { phone: '555-1010' } }, 'contact');
    assert.deepEqual((await one(opportunities, D1)).contactIds, [C1, C9], 'merged');
    assert.deepEqual((await one(contacts, K)).managers, [{ id: C1, name: 'Ina Tenmerge' }]);
    await capture('I10', 'contact', L);
    await db.update(opportunities).set({ contactIds: [C1, C8] }).where(eq(opportunities.id, D2));
    const u = await undo(L);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.deepEqual(u.body, { success: true, reversed: L, restoredId: C2, restoredName: 'Ina Tenmerge', keptLinks: 1, keptFields: [] });
    assert.deepEqual((await one(opportunities, D1)).contactIds, [C2, C9]);
    assert.deepEqual((await one(opportunities, D2)).contactIds, [C1, C8], 'its committee changed since: kept');
    assert.deepEqual((await one(contacts, K)).managers, [{ id: C2, name: 'Ina Tenmerge' }]);
    const c1 = await one(contacts, C1);
    assert.deepEqual([c1.phone, c1.directReports, c1.managers], [null, [], []], "the survivor's phone and org chart as they were");
    assert.equal((await one(tasks, T1)).contactId, C2);
    assert.equal((await one(activities, A1)).contactId, C2);
    assert.deepEqual(live(await one(contacts, C2)), [false, null, null]);
    assert.deepEqual((await undoneRows(L)).map((r) => r.action), ['contact.merge_undone']);
});

test("I11 — D22: of two deals a merge into a site moved up, one moved by hand since is kept; the other comes back to the account merged away, under that account's name as it stands, Site Name as it was", async () => {
    const [P, S, X, W, D1, D2] = ['i11_top', 'i11_site', 'i11_unit', 'i11_w', 'i11_d1', 'i11_d2'].map(ID);
    await db.insert(accounts).values([
        acct(P, 'I11 Top'), acct(S, 'I11 Site', { accountTier: 'site', parentAccountId: P }),
        acct(X, 'I11 Unit', { accountTier: 'business_unit', parentAccountId: P }), acct(W, 'I11 Elsewhere'),
    ]);
    await db.insert(opportunities).values([opp(D1, X, 'I11 Unit'), opp(D2, X, 'I11 Unit')]);
    const L = await merge(S, X);
    assert.deepEqual([await deal(D1), await deal(D2)], [[P, 'I11 Top', 'I11 Site'], [P, 'I11 Top', 'I11 Site']], 'moved up');
    await capture('I11', 'account', L);
    await db.update(opportunities).set({ accountId: W, account: 'I11 Elsewhere', site: null }).where(eq(opportunities.id, D1));
    await db.update(accounts).set({ name: 'I11 Unit Renamed' }).where(eq(accounts.id, X));
    const u = await undo(L);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.equal(u.body.keptLinks, 1);
    assert.deepEqual(await deal(D1), [W, 'I11 Elsewhere', null], 'REGRESSION: a deal moved up, and moved since, is moved back over the change');
    assert.deepEqual(await deal(D2), [X, 'I11 Unit Renamed', null], "back on its account, under the account's name as it stands");
});

test("I12 — isolation: org B, holding every name A merged, as seeded throughout — no merge or Undo in A renamed, moved or wrote any B row; B's Undo of A's merge is 404 and writes nothing", async () => {
    const [X, Y, T] = ['i12_x', 'i12_y', 'i12_t'].map(ID);
    await db.insert(accounts).values([acct(X, 'I12 Old Co'), acct(Y, 'I12 New Co')]);
    await db.insert(tasks).values(task(T, { accountId: X }));
    const L = await merge(Y, X);
    const fromB = await undo(L, B);
    assert.equal(fromB.status, 404, JSON.stringify(fromB.body));
    assert.equal(fromB.body.error, 'Merge record not found.');
    assert.equal((await logOf(L)).status, 'merged', "B's Undo wrote nothing");
    assert.equal((await one(tasks, T)).accountId, Y);
    assert.equal((await undo(L)).status, 200);
    const now = await bRows();
    for (const k of Object.keys(B_SEEDED)) assert.equal(now[k], B_SEEDED[k], `org B's ${k}: as seeded`);
});

test("I13 — the Undo's model holds the merge's write (B3): for each merge of I2, I3, I10, I11 and an H6 merge (a top-level account merged into its own site), survivorRestore names exactly the survivor's columns the merge changed — the owner id with its name — so an Undo puts back what the merge wrote, and nothing it did not", async () => {
    const { survivorRestore } = await import('../../src/utils/mergeUndo.js');
    const [P, D, DL] = ['i13_plant', 'i13_dock', 'i13_deal'].map(ID);
    await db.insert(accounts).values([acct(P, 'I13 Plant'), acct(D, 'I13 Dock', { accountTier: 'site', parentAccountId: P })]);
    await db.insert(opportunities).values(opp(DL, P, 'I13 Plant'));
    const L = await merge(D, P);
    await capture('I13 (H6)', 'account', L);
    assert.deepEqual(AFTER_MERGE.map((c) => c.label), ['I2', 'I3', 'I10', 'I11', 'I13 (H6)'], 'each merge read right after it');
    const norm = (v) => (v == null ? null : v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v));
    for (const { label, kind, log, now } of AFTER_MERGE) {
        const snap = log.survivorSnapshot;
        const changed = [...new Set([...Object.keys(snap), ...Object.keys(now)])]
            .filter((k) => k !== 'updatedAt' && k !== 'ownerId' && norm(snap[k]) !== norm(now[k])).sort();
        const { set, keptFields } = survivorRestore(kind, log, now);
        assert.deepEqual(keptFields, [], `${label}: read right after the merge, nothing kept`);
        assert.deepEqual(Object.keys(set).filter((k) => k !== 'ownerId').sort(), changed, `${label}: the model names the columns the merge changed`);
        const ownerKey = kind === 'contact' ? 'assignedRep' : 'accountOwner';
        assert.equal('ownerId' in set, ownerKey in set && 'ownerId' in snap, `${label}: the owner id with its name`);
    }
    assert.ok(AFTER_MERGE.some(({ log, now }) => norm(log.survivorSnapshot.ownerId) !== norm(now.ownerId)), 'an owner id the merge moved (I2) among them');
    // H6's Undo: under the plant, a site again; its deal back
    assert.equal((await undo(L)).status, 200);
    const dock = await one(accounts, D);
    assert.deepEqual([dock.parentAccountId, dock.accountTier], [P, 'site']);
    assert.deepEqual(await deal(DL), [P, 'I13 Plant', null]);
});

// ── the review (17 Oct, b13/wf-reviews.json): I14-I16 ─────────────────────────────────────────────────────────────
// An account's parent and tier, as stored.
const place = async (id) => { const r = await one(accounts, id); return [r.parentAccountId ?? null, r.accountTier]; };
// A top-level account merged into its own site (H6): the site lifted to the top, an account; the plant's other
// sub-account moved under it.
const h6 = async (tag, sub = 'business_unit') => {
    const [P, D, S] = [`${tag}_plant`, `${tag}_dock`, `${tag}_sub`].map(ID);
    const n = tag.toUpperCase();
    await db.insert(accounts).values([acct(P, `${n} Plant`), acct(D, `${n} Dock`, { accountTier: 'site', parentAccountId: P }), acct(S, `${n} Sub`, { accountTier: sub, parentAccountId: P })]);
    const L = await merge(D, P);
    assert.deepEqual([await place(D), await place(S)], [[null, 'account'], [D, sub]], `${tag}: merged — the site lifted to the top, an account; the sub-account under it`);
    return { P, D, S, L };
};
// A log as every merge wrote it before this batch (the re-check, 17 Oct): no onSurvivor on its name rewrites, no tiers
// on its children — what an Undo of a merge made before this batch ships reads.
const loggedBefore = async (L) => {
    const log = await logOf(L);
    await db.update(mergeLog).set({ rewrites: log.rewrites.map(({ onSurvivor: _on, tiers: _tiers, ...rw }) => rw) }).where(and(eq(mergeLog.id, L), eq(mergeLog.orgId, A)));
    assert.ok((await logOf(L)).rewrites.every((rw) => !('onSurvivor' in rw) && !('tiers' in rw)), 'the log as written before this batch');
};

test("I14 — the house parent rule (the review, 17 Oct; restorePlace — D3 \"No self, no loops, no sites\", D21): what an Undo puts back under the record merged away goes back only where a delete's Undo would put it back, the rest kept and counted (Q3: \"Keep later edits\") — (a) a business unit added under the lifted site since: the site stays a top-level account; (b) the record merged away moved under the survivor since: no loop, and a site of its own goes back under it; (c) the record merged away made a site since: nothing goes under a site; (d) in the batch itself: an account added under the survivor after the Undo read the accounts keeps the survivor where it stands, and the record merged away moved after it writes nothing", async () => {
    // (a) S1: a business unit added under the Dock since
    const a = await h6('i14a');
    const NEW = ID('i14a_new');
    await db.insert(accounts).values(acct(NEW, 'I14a New Unit', { accountTier: 'business_unit', parentAccountId: a.D }));
    const ua = await undo(a.L);
    assert.equal(ua.status, 200, JSON.stringify(ua.body));
    assert.deepEqual([ua.body.keptLinks, ua.body.keptFields], [0, ['parentAccountId', 'accountTier']], 'the survivor\'s parent and tier kept, and said');
    assert.deepEqual([await place(a.D), await place(NEW), await place(a.S)], [[null, 'account'], [a.D, 'business_unit'], [a.P, 'business_unit']],
        'REGRESSION (S1): the Dock put back a site under the Plant with the business unit added since under it — nothing sits under a site');
    assert.deepEqual(live(await one(accounts, a.P)), [false, null, null], 'the record merged away, live');

    // (b) S0a: the Plant moved under the Dock since (as the accounts PUT would place it: a business unit there); its
    // sub-account a site
    const b = await h6('i14b', 'site');
    await db.update(accounts).set({ parentAccountId: b.D, accountTier: 'business_unit' }).where(eq(accounts.id, b.P));
    const ub = await undo(b.L);
    assert.equal(ub.status, 200, JSON.stringify(ub.body));
    assert.deepEqual([ub.body.keptLinks, ub.body.keptFields], [0, ['parentAccountId', 'accountTier']]);
    assert.deepEqual([await place(b.D), await place(b.P), await place(b.S)], [[null, 'account'], [b.D, 'business_unit'], [b.P, 'site']],
        'REGRESSION (S0a): the Dock put back under the Plant moved under it since — a loop, both listed nowhere; the site goes back under the Plant (it ranks above a business unit)');

    // (c) S0c: the Plant made a site since (moved under a business unit)
    const c = await h6('i14c');
    const [TOP, BU] = ['i14c_top', 'i14c_bu'].map(ID);
    await db.insert(accounts).values([acct(TOP, 'I14c Top'), acct(BU, 'I14c Unit Above', { accountTier: 'business_unit', parentAccountId: TOP })]);
    await db.update(accounts).set({ parentAccountId: BU, accountTier: 'site' }).where(eq(accounts.id, c.P));
    const uc = await undo(c.L);
    assert.equal(uc.status, 200, JSON.stringify(uc.body));
    assert.deepEqual([uc.body.keptLinks, uc.body.keptFields], [1, ['parentAccountId', 'accountTier']], 'the sub-account and the survivor\'s place kept, and said');
    assert.deepEqual([await place(c.D), await place(c.S), await place(c.P)], [[null, 'account'], [c.D, 'business_unit'], [BU, 'site']],
        'REGRESSION (S0c): the Dock and the sub-account put back under the Plant, made a site since — accounts under a site');
    assert.deepEqual(live(await one(accounts, c.P)), [false, null, null]);

    // (d) the batch's own asks, on a batch built from what the Undo read
    const { undoOps, undoBatch } = await import('../../netlify/functions/merge.mjs');
    const { undoKept } = await import('../../src/utils/mergeUndo.js');
    const built = async (L) => { const log = await logOf(L); return { log, b: undoOps('account', log, await rowsOf(log), A, new Date()) }; };
    // (d1) a business unit added under the Dock after the Undo read the accounts: the Dock's restore writes nothing
    const d1 = await h6('i14d');
    const b1 = await built(d1.L);
    const LATE = ID('i14d_late');
    await db.insert(accounts).values(acct(LATE, 'I14d Late Unit', { accountTier: 'business_unit', parentAccountId: d1.D }));
    const r1 = await undoBatch(b1.b.ops, { log: b1.log, table: accounts, orgId: A, headers: {} });
    assert.ok(r1.results, JSON.stringify(r1.refused));
    assert.deepEqual(undoKept(b1.b, r1.results).keptFields, ['parentAccountId', 'accountTier'], 'the survivor\'s restore wrote nothing: its fields said kept');
    assert.deepEqual([await place(d1.D), await place(LATE), await place(d1.S)], [[null, 'account'], [d1.D, 'business_unit'], [d1.P, 'business_unit']],
        'REGRESSION (S1, a race): an account added under the Dock while the Undo ran — the Dock put back a site over it');
    // (d2) the Plant moved under the Dock after the Undo read the accounts: nothing written, "changed while … undone"
    const d2 = await h6('i14e');
    const b2 = await built(d2.L);
    await db.update(accounts).set({ parentAccountId: d2.D, accountTier: 'business_unit' }).where(eq(accounts.id, d2.P));
    const r2 = await undoBatch(b2.b.ops, { log: b2.log, table: accounts, orgId: A, headers: {} });
    assert.deepEqual([r2.refused?.statusCode, JSON.parse(r2.refused?.body || '{}').error], [409, 'One of these records changed while the merge was being undone. Please try again.'],
        'REGRESSION (a race): the record merged away moved under the survivor while the Undo ran — the batch answers done, its sub-account put back under it at a tier it does not rank above (a business unit under a business unit); where the merge lifted no tier, a loop');
    assert.equal((await logOf(d2.L)).status, 'merged', 'nothing written: the log still reads merged');
    assert.deepEqual([await place(d2.D), await place(d2.S)], [[null, 'account'], [d2.D, 'business_unit']], 'nothing written: the survivor and the sub-account where the merge left them');
    assert.equal((await one(accounts, d2.P)).mergeArchived, true, 'nothing written: still merged away');
});

test("I15 — a deal that already carried the name of the record merged away and stands on the survivor by id is no change made since (the review, 17 Oct): (a) UKG's \"Shell - Port Allen\" twins, merged and undone with nothing changed: none kept; (b) a deal moved before §0.198, on the survivor by id under the other account's name: none kept; (c) a deal of the record merged away moved by hand since: still kept; (d) a deal by name alone that a merge into a site moved up, moved by hand onto the survivor once it stopped being a site: still kept — on this batch's log and on one written before it (the re-check)", async () => {
    // (a) twins: two accounts of one name, two deals on the survivor by id, one on the record merged away
    const [X, Y, DY1, DY2, DX] = ['i15_x', 'i15_y', 'i15_dy1', 'i15_dy2', 'i15_dx'].map(ID);
    await db.insert(accounts).values([acct(X, 'I15 Shell - Port Allen'), acct(Y, 'I15 Shell - Port Allen')]);
    await db.insert(opportunities).values([opp(DY1, Y, 'I15 Shell - Port Allen'), opp(DY2, Y, 'I15 Shell - Port Allen'), opp(DX, X, 'I15 Shell - Port Allen')]);
    const ua = await undo(await merge(Y, X));
    assert.equal(ua.status, 200, JSON.stringify(ua.body));
    assert.deepEqual([ua.body.keptLinks, ua.body.keptFields], [0, []], 'REGRESSION (S3): twins merged and undone with nothing changed — "2 records were left as they are now."');
    assert.deepEqual([await deal(DY1), await deal(DY2), await deal(DX)], [[Y, 'I15 Shell - Port Allen', null], [Y, 'I15 Shell - Port Allen', null], [X, 'I15 Shell - Port Allen', null]]);
    // (b) a deal moved before §0.198: on the survivor by id under the other account's name
    const [XB, YB, DB] = ['i15b_x', 'i15b_y', 'i15b_d'].map(ID);
    await db.insert(accounts).values([acct(XB, 'I15b Old Co'), acct(YB, 'I15b New Co')]);
    await db.insert(opportunities).values(opp(DB, YB, 'I15b Old Co'));
    const LB = await merge(YB, XB);
    assert.deepEqual(await deal(DB), [YB, 'I15b New Co', null], 'merged: its name with its id');
    const ub = await undo(LB);
    assert.deepEqual([ub.status, ub.body.keptLinks, ub.body.keptFields], [200, 0, []], 'REGRESSION (S3): a deal moved before §0.198 — "1 record was left as it is now."');
    assert.deepEqual(await deal(DB), [YB, 'I15b New Co', null], 'its name stays with its id');
    // (c) a deal of the record merged away, moved by hand since
    const [XC, YC, WC, DC] = ['i15c_x', 'i15c_y', 'i15c_w', 'i15c_d'].map(ID);
    await db.insert(accounts).values([acct(XC, 'I15c Old Co'), acct(YC, 'I15c New Co'), acct(WC, 'I15c Other')]);
    await db.insert(opportunities).values(opp(DC, XC, 'I15c Old Co'));
    const LC = await merge(YC, XC);
    await db.update(opportunities).set({ accountId: WC, account: 'I15c Other' }).where(eq(opportunities.id, DC));
    const uc = await undo(LC);
    assert.deepEqual([uc.status, uc.body.keptLinks], [200, 1], 'a deal moved since: kept, and counted');
    assert.deepEqual(await deal(DC), [WC, 'I15c Other', null]);
    // (d) a deal by name alone, moved up by a merge into a site (D22) — its lift names it, so it is never read last as on
    // the survivor; since, the survivor moved to the top (an account) and the deal moved by hand onto it (the re-check)
    for (const [tag, before04] of [['i15d', false], ['i15e', true]]) {
        const [P, S, XD, N] = [`${tag}_top`, `${tag}_site`, `${tag}_x`, `${tag}_n`].map(ID);
        const n = tag.toUpperCase();
        await db.insert(accounts).values([acct(P, `${n} Top`), acct(S, `${n} Site`, { accountTier: 'site', parentAccountId: P }), acct(XD, `${n} Old Co`)]);
        await db.insert(opportunities).values(opp(N, null, `${n} Old Co`));
        const LD = await merge(S, XD);
        assert.deepEqual(await deal(N), [P, `${n} Top`, `${n} Site`], `${tag}: moved up`);
        if (before04) await loggedBefore(LD);
        await db.update(accounts).set({ parentAccountId: null, accountTier: 'account' }).where(eq(accounts.id, S));
        await db.update(opportunities).set({ accountId: S, account: `${n} Site`, site: null }).where(eq(opportunities.id, N));
        const ud = await undo(LD);
        assert.deepEqual([ud.status, ud.body.keptLinks], [200, 1],
            `REGRESSION (${before04 ? 'a log written before this batch' : "this batch's log"}): a deal a merge into a site moved up by its name alone, moved since onto the survivor, read again as put back — counted as no change`);
        assert.deepEqual(await deal(N), [S, `${n} Site`, null], `${tag}: it stays where it was moved`);
    }
});

test("I16 — the survivor's name cascade writes nothing once the survivor is gone (the review, 17 Oct): a merge that renamed the survivor, its Undo's batch built while the survivor stood, the survivor deleted, then the cascade's two statements run — its closed deal keeps its account's name and its contact its company, never none; and org B, holding every name A merged, still as seeded", async () => {
    const { undoOps } = await import('../../netlify/functions/merge.mjs');
    const [X, Y, DY, KY] = ['i16_x', 'i16_y', 'i16_dy', 'i16_ky'].map(ID);
    await db.insert(accounts).values([acct(X, 'I16 Brand'), acct(Y, 'I16 Old Name')]);
    await db.insert(opportunities).values(opp(DY, Y, 'I16 Old Name', { stage: 'Closed Won' }));
    await db.insert(contacts).values(person(KY, 'Kay', 'Wy', { accountId: Y, company: 'I16 Old Name' }));
    const L = await merge(Y, X, { resolvedFields: { name: 'I16 Brand' } });
    assert.deepEqual([(await deal(DY))[1], (await one(contacts, KY)).company], ['I16 Brand', 'I16 Brand'], 'merged: renamed');
    const log = await logOf(L);
    const built = undoOps('account', log, await rowsOf(log), A, new Date());
    assert.equal(built.cascades.length, 2, "the survivor's name comes back: its cascade built");
    await db.delete(accounts).where(eq(accounts.id, Y));
    const results = await db.batch(built.cascades.map((c) => built.ops[c.at]));
    assert.deepEqual(results.map((r) => r.length), [0, 0], 'REGRESSION (S2): a survivor deleted while the Undo ran — its name cascade wrote none over its deals and contacts');
    assert.deepEqual([(await deal(DY))[1], (await one(contacts, KY)).company], ['I16 Brand', 'I16 Brand'], 'its closed deal and its contact keep their names');
    const now = await bRows();
    for (const k of Object.keys(B_SEEDED)) assert.equal(now[k], B_SEEDED[k], `org B's ${k}: as seeded, after I14-I16`);
});

// ── the re-check (17 Oct, b13/recheck): I17-I20 ───────────────────────────────────────────────────────────────────
// A contact as linked: its account id and its company.
const linkOf = async (id) => { const r = await one(contacts, id); return [r.accountId ?? null, r.company]; };

test("I17 — a contact's company is put back by name only while the contact is not linked to the survivor by id (the re-check, 17 Oct): (a) a contact by name alone and one on the record merged away by id, each linked to the survivor since on the contact rail: both keep the survivor's name with its id, counted kept; one untouched comes back; (b) one of two same-named accounts merged (UKG's twins), nothing changed since: the other twin's contact, linked to it by id, comes back; the survivor's own, under the merged-away name at the merge, keeps its id's name — nothing counted kept; (c) (a) on a log written before this batch, which cannot tell: the same rows, counted put back (listed back)", async () => {
    for (const [tag, before04] of [['i17', false], ['i17c', true]]) {
        const [X, Y, K, K2, K3] = [`${tag}_x`, `${tag}_y`, `${tag}_k`, `${tag}_k2`, `${tag}_k3`].map(ID);
        const n = tag.toUpperCase();
        await db.insert(accounts).values([acct(X, `${n} Old`), acct(Y, `${n} New`)]);
        await db.insert(contacts).values([person(K, 'Kay', 'Zero', { company: `${n} Old` }), person(K2, 'Kit', 'Zero', { company: `${n} Old`, accountId: X }),
            person(K3, 'Kim', 'Zero', { company: `${n} Old` })]);
        const L = await merge(Y, X);
        assert.deepEqual([await linkOf(K), await linkOf(K2), await linkOf(K3)], [[null, `${n} New`], [X, `${n} New`], [null, `${n} New`]],
            `${tag}: merged — renamed by name; the merge moves no contact's id`);
        if (before04) await loggedBefore(L);
        // since: K and K2 linked to the survivor on the contact rail — its id with its own name (contactCompany)
        await db.update(contacts).set({ accountId: Y, company: `${n} New` }).where(inArray(contacts.id, [K, K2]));
        const u = await undo(L);
        assert.equal(u.status, 200, JSON.stringify(u.body));
        assert.deepEqual([await linkOf(K), await linkOf(K2), await linkOf(K3)], [[Y, `${n} New`], [Y, `${n} New`], [null, `${n} Old`]],
            'REGRESSION: a contact linked to the survivor by id since is put back under the merged-away name — its company split from its id');
        if (before04) assert.deepEqual([u.body.keptLinks, u.body.keptFields], [0, []], 'a log written before this batch cannot tell a contact linked since from one on the survivor at the merge: counted put back (listed back)');
        else assert.deepEqual([u.body.keptLinks, u.body.keptFields], [2, []], 'REGRESSION: two contacts linked to the survivor since counted as put back — no change kept said over two kept');
    }
    // (b) the twins: X and Z share a name; Y's own contact carried that name at the merge
    const [X, Z, Y, KX, KZ, KY, KL] = ['i17b_x', 'i17b_z', 'i17b_y', 'i17b_kx', 'i17b_kz', 'i17b_ky', 'i17b_kl'].map(ID);
    await db.insert(accounts).values([acct(X, 'I17b Shell PA'), acct(Z, 'I17b Shell PA'), acct(Y, 'I17b Shell')]);
    await db.insert(contacts).values([
        person(KX, 'Xen', 'Gee', { company: 'I17b Shell PA', accountId: X }), person(KZ, 'Zed', 'Gee', { company: 'I17b Shell PA', accountId: Z }),
        person(KY, 'Yan', 'Gee', { company: 'I17b Shell PA', accountId: Y }), person(KL, 'Lou', 'Gee', { company: 'I17b Shell PA' }),
    ]);
    const L = await merge(Y, X);
    assert.deepEqual([await linkOf(KZ), await linkOf(KY)], [[Z, 'I17b Shell'], [Y, 'I17b Shell']], "merged: every contact of the name renamed, the other twin's too (the merge renames contacts by name)");
    const u = await undo(L);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.deepEqual([u.body.keptLinks, u.body.keptFields], [0, []], "REGRESSION: twins merged and undone with nothing changed — the survivor's own contact counted kept");
    assert.deepEqual([await linkOf(KX), await linkOf(KZ), await linkOf(KY), await linkOf(KL)], [[X, 'I17b Shell PA'], [Z, 'I17b Shell PA'], [Y, 'I17b Shell'], [null, 'I17b Shell PA']],
        "REGRESSION: the other twin's contact left under the survivor's name, or the survivor's own renamed apart from its id");
});

test("I18 — D22 (the re-check, 17 Oct): of two deals a merge into a site moved up, one moved by hand onto the survivor once it stopped being a site stays there, kept and counted — never moved back by the deal id restore, whose move the lift overwrote in the merge's own batch; the other comes back by its lift; (b) the merge renamed the survivor, so its name comes back and is cascaded over its deals by id: the deal moved onto it takes it with its id, still counted kept", async () => {
    for (const [tag, rename] of [['i18', false], ['i18b', true]]) {
        const [P, Y, X, D, W] = [`${tag}_top`, `${tag}_site`, `${tag}_x`, `${tag}_d`, `${tag}_w`].map(ID);
        const n = tag.toUpperCase();
        await db.insert(accounts).values([acct(P, `${n} Top`), acct(Y, `${n} Site`, { accountTier: 'site', parentAccountId: P }), acct(X, `${n} Old`)]);
        await db.insert(opportunities).values([opp(D, X, `${n} Old`), opp(W, X, `${n} Old`)]);
        const L = await merge(Y, X, rename ? { resolvedFields: { name: `${n} Old` } } : {});
        const site = rename ? `${n} Old` : `${n} Site`;   // the survivor's name once merged: the deals' Site Name
        assert.deepEqual([await deal(D), await deal(W)], [[P, `${n} Top`, site], [P, `${n} Top`, site]], `${tag}: moved up`);
        // since: the survivor moved to the top (an account), and D moved by hand onto it, under its name
        await db.update(accounts).set({ parentAccountId: null, accountTier: 'account' }).where(eq(accounts.id, Y));
        await db.update(opportunities).set({ accountId: Y, account: site, site: null }).where(eq(opportunities.id, D));
        const u = await undo(L);
        assert.equal(u.status, 200, JSON.stringify(u.body));
        assert.deepEqual(await deal(D), [Y, `${n} Site`, null], `REGRESSION (${tag}): a deal moved up, moved by hand onto the survivor since, moved back to the record merged away by its id — over the change`);
        assert.deepEqual(await deal(W), [X, `${n} Old`, null], `${tag}: the other, where the lift put it — back, under its account's name`);
        assert.equal(u.body.keptLinks, 1, `REGRESSION (${tag}): a deal moved up, moved by hand onto the survivor since, counted as put back`);
    }
});

test("I19 — a row whose own tier changed since the merge goes back under the record merged away, as the merge found it, only where it ranks above it (the re-check, 17 Oct; D21): (a) a site the merge moved under the survivor, moved to the top and back since — a business unit now: it stays under the survivor, counted kept; (b) H6 under a parent: the survivor, lifted under the account above, moved to the top and back since — a business unit now — with a site added under it: its place kept, and said; (c) a legacy shape as stored at the merge — a business unit under the business unit merged away — goes back as it stood, by the merge's logged tier; on a log written before this batch, which names none, it stays, counted kept (listed back)", async () => {
    // (a)
    const [P, X, C, Y] = ['i19_top', 'i19_unit', 'i19_site', 'i19_other'].map(ID);
    await db.insert(accounts).values([acct(P, 'I19 Top'), acct(X, 'I19 Unit', { accountTier: 'business_unit', parentAccountId: P }),
        acct(C, 'I19 Site', { accountTier: 'site', parentAccountId: X }), acct(Y, 'I19 Other')]);
    const L = await merge(Y, X);
    assert.deepEqual(await place(C), [Y, 'site'], 'merged: the site under the survivor');
    // since: moved to the top (an account), then back under the survivor — a business unit there, as the accounts PUT fits it
    await db.update(accounts).set({ parentAccountId: null, accountTier: 'account' }).where(eq(accounts.id, C));
    await db.update(accounts).set({ parentAccountId: Y, accountTier: 'business_unit' }).where(eq(accounts.id, C));
    const u = await undo(L);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.deepEqual([await place(C), await place(X)], [[Y, 'business_unit'], [P, 'business_unit']],
        'REGRESSION: a row whose own tier changed since put back under the record merged away whatever its rank — a business unit under a business unit');
    assert.deepEqual([u.body.keptLinks, u.body.keptFields], [1, []], 'REGRESSION: a row the rule kept under the survivor said put back');
    assert.deepEqual(live(await one(accounts, X)), [false, null, null], 'the record merged away, live');
    // (b)
    const [P2, X2, Y2, S2] = ['i19b_top', 'i19b_unit', 'i19b_dock', 'i19b_gate'].map(ID);
    await db.insert(accounts).values([acct(P2, 'I19b Top'), acct(X2, 'I19b Unit', { accountTier: 'business_unit', parentAccountId: P2 }),
        acct(Y2, 'I19b Dock', { accountTier: 'site', parentAccountId: X2 })]);
    const L2 = await merge(Y2, X2);
    assert.deepEqual(await place(Y2), [P2, 'site'], 'merged: the Dock lifted under the Top, still a site');
    await db.update(accounts).set({ parentAccountId: null, accountTier: 'account' }).where(eq(accounts.id, Y2));
    await db.update(accounts).set({ parentAccountId: P2, accountTier: 'business_unit' }).where(eq(accounts.id, Y2));
    await db.insert(accounts).values(acct(S2, 'I19b Gate', { accountTier: 'site', parentAccountId: Y2 }));
    const u2 = await undo(L2);
    assert.equal(u2.status, 200, JSON.stringify(u2.body));
    assert.deepEqual([await place(Y2), await place(S2), await place(X2)], [[P2, 'business_unit'], [Y2, 'site'], [P2, 'business_unit']],
        'REGRESSION: the survivor, its own tier changed since, put back under the record merged away whatever its rank — a business unit under a business unit');
    assert.deepEqual([u2.body.keptLinks, u2.body.keptFields], [0, ['parentAccountId']], "the survivor's place kept, and said");
    // (c) a business unit under a business unit, stored before the rule — on this batch's log, then on one written before it
    for (const [tag, before04] of [['i19c', false], ['i19d', true]]) {
        const [Pc, Xc, Cc, Yc] = [`${tag}_top`, `${tag}_unit`, `${tag}_sub`, `${tag}_other`].map(ID);
        const n = tag.toUpperCase();
        await db.insert(accounts).values([acct(Pc, `${n} Top`), acct(Xc, `${n} Unit`, { accountTier: 'business_unit', parentAccountId: Pc }),
            acct(Cc, `${n} Sub`, { accountTier: 'business_unit', parentAccountId: Xc }), acct(Yc, `${n} Other`)]);
        const Lc = await merge(Yc, Xc);
        if (before04) await loggedBefore(Lc);
        const uc = await undo(Lc);
        assert.equal(uc.status, 200, JSON.stringify(uc.body));
        if (before04) assert.deepEqual([uc.body.keptLinks, await place(Cc)], [1, [Yc, 'business_unit']], 'a log written before this batch names no tier: by rank alone — kept under the survivor, and counted (listed back)');
        else assert.deepEqual([uc.body.keptLinks, await place(Cc)], [0, [Xc, 'business_unit']], "REGRESSION: a legacy shape as stored at the merge kept under the survivor — the merge's logged tier not read, or not logged");
    }
});

test("I20 — a deal or contact by name alone at the merge, linked to the survivor by id since, stays there and is counted kept (the re-check, 17 Oct): the merge logs which renamed rows stood on the survivor by id — (a) the survivor keeping its name: the deal's name restore leaves it; its twin, untouched, comes back; (b) the merge renamed the survivor, so its name comes back and is cascaded over its deals and contacts by id: the deal and the contact linked since take it with their id, still counted kept; (c) (a) on a log written before this batch, which cannot tell: the same rows, counted put back (listed back); and org B, holding every name A merged, still as seeded", async () => {
    for (const [tag, before04] of [['i20', false], ['i20c', true]]) {
        const [X, Y, N, N2] = [`${tag}_x`, `${tag}_y`, `${tag}_n`, `${tag}_n2`].map(ID);
        const n = tag.toUpperCase();
        await db.insert(accounts).values([acct(X, `${n} Old Co`), acct(Y, `${n} New Co`)]);
        await db.insert(opportunities).values([opp(N, null, `${n} Old Co`), opp(N2, null, `${n} Old Co`)]);
        const L = await merge(Y, X);
        assert.deepEqual([await deal(N), await deal(N2)], [[null, `${n} New Co`, null], [null, `${n} New Co`, null]], `${tag}: merged — renamed by name`);
        if (before04) await loggedBefore(L);
        await db.update(opportunities).set({ accountId: Y }).where(eq(opportunities.id, N));   // the deal window links it, under the name it shows
        const u = await undo(L);
        assert.equal(u.status, 200, JSON.stringify(u.body));
        assert.deepEqual([await deal(N), await deal(N2)], [[Y, `${n} New Co`, null], [null, `${n} Old Co`, null]], `${tag}: the deal linked since stays with its id and its name; the other comes back`);
        if (before04) assert.equal(u.body.keptLinks, 0, 'a log written before this batch cannot tell a deal linked since from one on the survivor at the merge: counted put back (listed back)');
        else assert.equal(u.body.keptLinks, 1, 'REGRESSION: a deal by name alone linked to the survivor since, read again as put back — counted as no change');
    }
    // (b) the survivor renamed by the merge: its name back, cascaded by account id
    const [X, Y, N, K] = ['i20b_x', 'i20b_y', 'i20b_n', 'i20b_k'].map(ID);
    await db.insert(accounts).values([acct(X, 'I20b Brand'), acct(Y, 'I20b Old Name')]);
    await db.insert(opportunities).values(opp(N, null, 'I20b Brand'));
    await db.insert(contacts).values(person(K, 'Kai', 'Bee', { company: 'I20b Brand' }));
    const L = await merge(Y, X, { resolvedFields: { name: 'I20b Brand' } });
    await db.update(opportunities).set({ accountId: Y }).where(eq(opportunities.id, N));
    await db.update(contacts).set({ accountId: Y }).where(eq(contacts.id, K));
    const u = await undo(L);
    assert.equal(u.status, 200, JSON.stringify(u.body));
    assert.equal((await one(accounts, Y)).name, 'I20b Old Name', "the survivor's name back");
    assert.deepEqual([await deal(N), await linkOf(K)], [[Y, 'I20b Old Name', null], [Y, 'I20b Old Name']], "linked since: the survivor's name with its id, as the accounts PUT's rename gives it");
    assert.deepEqual([u.body.keptLinks, u.body.keptFields], [2, []],
        "REGRESSION: a deal and a contact by name alone linked to the survivor since, the survivor's name cascaded over them, counted as put back — no change kept said over two kept");
    const now = await bRows();
    for (const k of Object.keys(B_SEEDED)) assert.equal(now[k], B_SEEDED[k], `org B's ${k}: as seeded, after I14-I20`);
});

// ── Jeff's second set (18 Oct, b13/jeff-answers.md): I21 ──────────────────────────────────────────────────────────
// A tier a merge was sent (the API takes accountTier; no screen sends it): "<n> Dock", a site under "<n> Top", merged
// with "<n> Co" — its deal moved to the Dock by id — taking the business-unit tier and Co's phone; no lift (a business
// unit). extra: more resolved fields.
const retier = async (tag, extra = {}) => {
    const [TOP, D, X, DX] = [`${tag}_top`, `${tag}_dock`, `${tag}_co`, `${tag}_dx`].map(ID);
    const n = tag.toUpperCase();
    await db.insert(accounts).values([acct(TOP, `${n} Top`), acct(D, `${n} Dock`, { accountTier: 'site', parentAccountId: TOP }), acct(X, `${n} Co`, { phone: '555-0121' })]);
    await db.insert(opportunities).values(opp(DX, X, `${n} Co`));
    const L = await merge(D, X, { resolvedFields: { accountTier: 'business_unit', phone: '555-0121', ...extra } });
    assert.deepEqual([await place(D), await deal(DX)], [[TOP, 'business_unit'], [D, extra.name || `${n} Dock`, null]], `${tag}: merged — the Dock a business unit, Co's deal on it by id`);
    return { TOP, D, X, DX, L, n };
};
// The record merged away made a site since (as I14(c)): moved under a business unit of its own top account.
const madeASite = async (tag, X, TOP) => {
    const BU = ID(`${tag}_bu`);
    await db.insert(accounts).values(acct(BU, `${tag.toUpperCase()} Unit Above`, { accountTier: 'business_unit', parentAccountId: TOP }));
    await db.update(accounts).set({ parentAccountId: BU, accountTier: 'site' }).where(eq(accounts.id, X));
    return BU;
};

test("I21 — an Undo never puts a deal on a site (Jeff, 18 Oct: \"Leave such deals and count them\" — the account keeps its current level, the deal stays where it is, and it is counted): (a) a deal linked to a lifted site since: the site stays a top-level account, its other fields back, the deal counted; (b) the site's own deal from before the merge, the survivor's name back and cascaded over it: still counted; (c) a tier a merge was sent reversed over a deal linked since: the business unit stays one; nothing since: a site again; (d) the record merged away made a site since: its deal stays on the survivor, which keeps its level, counted — also once the survivor's name comes back over it; (e) ... and a deal its lift moved up stays where the lift put it, counted; in the batch itself: (f) a deal linked to the survivor after the Undo read its deals keeps it where it stands, every field kept; (g) the record merged away read a site, then made an account again: its deal goes back, never counted kept; and org B, holding every name A merged, still as seeded", async () => {
    // (a) H6 (I14's shape), the Plant's phone taken; since, a deal linked to the Dock — a top-level account
    const [P, D, DP, N] = ['i21a_plant', 'i21a_dock', 'i21a_dp', 'i21a_new'].map(ID);
    await db.insert(accounts).values([acct(P, 'I21A Plant', { phone: '555-0121' }), acct(D, 'I21A Dock', { accountTier: 'site', parentAccountId: P })]);
    await db.insert(opportunities).values(opp(DP, P, 'I21A Plant'));
    const LA = await merge(D, P, { resolvedFields: { phone: '555-0121' } });
    assert.deepEqual([await place(D), await deal(DP)], [[null, 'account'], [D, 'I21A Dock', null]], 'merged: the Dock lifted to the top, an account; the Plant\'s deal on it by id');
    await db.insert(opportunities).values(opp(N, D, 'I21A Dock'));
    const ua = await undo(LA);
    assert.equal(ua.status, 200, JSON.stringify(ua.body));
    assert.deepEqual([await place(D), await deal(N)], [[null, 'account'], [D, 'I21A Dock', null]],
        'REGRESSION: the Dock put back a site under the Plant with the deal linked to it since on it — a deal on a site');
    assert.deepEqual([await deal(DP), (await one(accounts, D)).phone], [[P, 'I21A Plant', null], null], "the Plant's deal back to it; the Dock's other fields back — only its place kept");
    assert.deepEqual([ua.body.keptLinks, ua.body.keptFields], [1, ['parentAccountId', 'accountTier']],
        'REGRESSION: the deal that keeps the Dock at its level not counted — "the deal stays where it is, and it is counted"');
    assert.deepEqual(live(await one(accounts, P)), [false, null, null], 'the record merged away, live');

    // (b) the Dock's own deal, on the site by its id before the merge (as UKG's 6 stand); the merge renamed the Dock
    const [P2, D2, OWN] = ['i21b_plant', 'i21b_dock', 'i21b_own'].map(ID);
    await db.insert(accounts).values([acct(P2, 'I21B Plant'), acct(D2, 'I21B Dock', { accountTier: 'site', parentAccountId: P2 })]);
    await db.insert(opportunities).values(opp(OWN, D2, 'I21B Dock'));
    const LB = await merge(D2, P2, { resolvedFields: { name: 'I21B Plant' } });
    assert.deepEqual([await place(D2), await deal(OWN)], [[null, 'account'], [D2, 'I21B Plant', null]], 'merged: lifted and renamed, its own deal with it');
    const ub = await undo(LB);
    assert.equal(ub.status, 200, JSON.stringify(ub.body));
    assert.deepEqual([await place(D2), (await one(accounts, D2)).name, await deal(OWN)], [[null, 'account'], 'I21B Dock', [D2, 'I21B Dock', null]],
        "REGRESSION: the Dock put back a site with its own deal on it — or its name not back, cascaded over the deal by its id");
    assert.deepEqual([ub.body.keptLinks, ub.body.keptFields], [1, ['parentAccountId', 'accountTier']],
        "REGRESSION: the Dock's own deal, read again under the Dock's name by its name cascade and the twins' read, counted as put back — not counted");

    // (c) a tier a merge was sent reversed: over a deal linked since, the Dock stays a business unit; nothing since, a site
    for (const [tag, since] of [['i21c', true], ['i21h', false]]) {
        const m = await retier(tag);
        const NC = ID(`${tag}_new`);
        if (since) await db.insert(opportunities).values(opp(NC, m.D, `${m.n} Dock`));
        const u = await undo(m.L);
        assert.equal(u.status, 200, JSON.stringify(u.body));
        assert.deepEqual([await deal(m.DX), (await one(accounts, m.D)).phone], [[m.X, `${m.n} Co`, null], null], `${tag}: Co's deal back to it; the phone back`);
        if (since) {
            assert.deepEqual([await place(m.D), await deal(NC)], [[m.TOP, 'business_unit'], [m.D, `${m.n} Dock`, null]],
                'REGRESSION: a tier a merge was sent reversed over a deal linked since — the business unit made a site with the deal on it');
            assert.deepEqual([u.body.keptLinks, u.body.keptFields], [1, ['accountTier']], 'its tier kept, the deal counted');
        } else {
            assert.deepEqual([await place(m.D), u.body.keptLinks, u.body.keptFields], [[m.TOP, 'site'], 0, []], 'nothing on it: a site again, nothing kept');
        }
    }

    // (d) the record merged away made a site since; the merge renamed the Dock after it, so the Dock's name comes back
    const d = await retier('i21d', { name: 'I21D Co' });
    const BU = await madeASite('i21d', d.X, d.TOP);
    const ud = await undo(d.L);
    assert.equal(ud.status, 200, JSON.stringify(ud.body));
    assert.deepEqual([await deal(d.DX), await place(d.X)], [[d.D, 'I21D Dock', null], [BU, 'site']],
        "REGRESSION: Co, made a site since, takes its deal back by its id — a deal on a site; or the Dock's own restore stopped by its deal ask, its name not back over Co's deal");
    assert.deepEqual([await place(d.D), (await one(accounts, d.D)).name, (await one(accounts, d.D)).phone], [[d.TOP, 'business_unit'], 'I21D Dock', null],
        "REGRESSION: the Dock made a site again with Co's deal left on it — or every field of its kept, its name and phone too");
    assert.deepEqual([ud.body.keptLinks, ud.body.keptFields], [1, ['accountTier']],
        "REGRESSION: Co's deal, left on the Dock, counted as put back by the Dock's name cascade");
    assert.deepEqual(live(await one(accounts, d.X)), [false, null, null], 'Co, live');

    // (e) a merge into a site moved the merged-away account's deal up (D22); since, that account made a site
    const [PE, YE, XE, DL] = ['i21e_top', 'i21e_site', 'i21e_old', 'i21e_dl'].map(ID);
    await db.insert(accounts).values([acct(PE, 'I21E Top'), acct(YE, 'I21E Site', { accountTier: 'site', parentAccountId: PE }), acct(XE, 'I21E Old')]);
    await db.insert(opportunities).values(opp(DL, XE, 'I21E Old'));
    const LE = await merge(YE, XE);
    assert.deepEqual(await deal(DL), [PE, 'I21E Top', 'I21E Site'], 'merged: moved up');
    const BUE = await madeASite('i21e', XE, PE);
    const ue = await undo(LE);
    assert.equal(ue.status, 200, JSON.stringify(ue.body));
    assert.deepEqual([await deal(DL), await place(XE)], [[PE, 'I21E Top', 'I21E Site'], [BUE, 'site']],
        'REGRESSION: a deal moved up, put back by its lift onto the account merged away, a site since — a deal on a site');
    assert.equal(ue.body.keptLinks, 1, 'REGRESSION: the deal its lift left where it stands not counted');

    // in the batch itself, on a batch built from what the Undo read
    const { undoOps, undoBatch } = await import('../../netlify/functions/merge.mjs');
    const { undoKept } = await import('../../src/utils/mergeUndo.js');
    const built = async (L) => { const log = await logOf(L); return { log, b: undoOps('account', log, await rowsOf(log), A, new Date()) }; };
    const run = ({ log, b }) => undoBatch(b.ops, { log, table: accounts, orgId: A, headers: {} });
    // (f) H6, nothing on the Dock when the Undo read its deals; then a deal linked to it
    const [PF, DF, NF] = ['i21f_plant', 'i21f_dock', 'i21f_new'].map(ID);
    await db.insert(accounts).values([acct(PF, 'I21F Plant', { phone: '555-0121' }), acct(DF, 'I21F Dock', { accountTier: 'site', parentAccountId: PF })]);
    const LF = await merge(DF, PF, { resolvedFields: { phone: '555-0121' } });
    const bf = await built(LF);
    await db.insert(opportunities).values(opp(NF, DF, 'I21F Dock'));
    const rf = await run(bf);
    assert.ok(rf.results, JSON.stringify(rf.refused));
    assert.deepEqual([await place(DF), await deal(NF), (await one(accounts, DF)).phone], [[null, 'account'], [DF, 'I21F Dock', null], '555-0121'],
        'REGRESSION (a race): a deal linked to the Dock while the Undo ran — the Dock put back a site with it on it');
    assert.deepEqual(undoKept(bf.b, rf.results).keptFields, ['phone', 'parentAccountId', 'accountTier'], "the Dock's restore wrote nothing: every field said kept");
    // (g) Co read a site when the Undo read the accounts — the Dock kept a business unit; then made an account again
    const g = await retier('i21g');
    await madeASite('i21g', g.X, g.TOP);
    const bg = await built(g.L);
    await db.update(accounts).set({ parentAccountId: null, accountTier: 'account' }).where(eq(accounts.id, g.X));
    const rg = await run(bg);
    assert.ok(rg.results, JSON.stringify(rg.refused));
    assert.deepEqual([await deal(g.DX), await place(g.D)], [[g.X, 'I21G Co', null], [g.TOP, 'business_unit']], "Co, no site when the batch ran, takes its deal back; the Dock kept where the read left it");
    assert.deepEqual(undoKept(bg.b, rg.results), { keptLinks: 0, keptFields: ['accountTier'] },
        "REGRESSION: Co's deal, read as staying on the Dock, counted kept over a batch that put it back");

    const now = await bRows();
    for (const k of Object.keys(B_SEEDED)) assert.equal(now[k], B_SEEDED[k], `org B's ${k}: as seeded, after I21`);
});

// ── the last fix round (18 Oct, b13/recheck5): I22 ───────────────────────────────────────────────────────────────────
test("I22 — a deal by name alone never goes back to the record merged away while that is a site, as by its id and its lift (Jeff, 18 Oct: \"Leave such deals and count them\"; the re-check, 18 Oct): (a) the record merged away a site at the merge, its deal by id and its deal by name alone: both stay on the survivor, counted, and the audit row says what the Undo left as it is now — never \"changed since\"; (b) twins, the merge leaving the name as it was: the deal by name alone is no change, never counted kept; (c) the merge gave the survivor the merged-away name: the survivor's own deal by name alone goes back to its name as it was; and org B, holding every name A merged, still as seeded", async () => {
    // (a) "I22A Old", a site under "I22A Top", merged into "I22A New", an account (no lift)
    const [TA, XA, YA, DI, DN] = ['i22a_top', 'i22a_old', 'i22a_new', 'i22a_di', 'i22a_dn'].map(ID);
    await db.insert(accounts).values([acct(TA, 'I22A Top'), acct(XA, 'I22A Old', { accountTier: 'site', parentAccountId: TA }), acct(YA, 'I22A New')]);
    await db.insert(opportunities).values([opp(DI, XA, 'I22A Old'), opp(DN, null, 'I22A Old')]);
    const LA = await merge(YA, XA);
    assert.deepEqual([await deal(DI), await deal(DN)], [[YA, 'I22A New', null], [null, 'I22A New', null]], 'merged: both on the survivor — by its id, and by its name');
    const ua = await undo(LA);
    assert.equal(ua.status, 200, JSON.stringify(ua.body));
    assert.deepEqual([await deal(DN), await place(XA)], [[null, 'I22A New', null], [TA, 'site']],
        'REGRESSION (the re-check, 18 Oct): the deal by name alone put back under the name of the record merged away, a site — a deal on a site by its name');
    assert.deepEqual(await deal(DI), [YA, 'I22A New', null], 'REGRESSION: its deal by id put back on the record merged away, a site — a deal on a site (as I21(d))');
    assert.deepEqual([ua.body.keptLinks, ua.body.keptFields], [2, []], 'REGRESSION: the deals left on the survivor not counted — "the deal stays where it is, and it is counted"');
    assert.deepEqual(live(await one(accounts, XA)), [false, null, null], 'the record merged away, live');
    assert.deepEqual((await undoneRows(LA)).map((r) => r.detail), [`I22A Old restored · undo of ${LA} · 2 linked records were left as they are now`],
        'REGRESSION (the re-check, 18 Oct): the audit row says the two deals "changed since, kept" — nobody changed them; or two linked records said as one');

    // (b) twins: "I22B Twin", a site under "I22B Top", merged into its namesake, an account — the merge's rename leaves
    // the name as it was
    const [TB, XB, YB, DB] = ['i22b_top', 'i22b_x', 'i22b_y', 'i22b_dn'].map(ID);
    await db.insert(accounts).values([acct(TB, 'I22B Top'), acct(XB, 'I22B Twin', { accountTier: 'site', parentAccountId: TB }), acct(YB, 'I22B Twin')]);
    await db.insert(opportunities).values(opp(DB, null, 'I22B Twin'));
    const LB = await merge(YB, XB);
    assert.deepEqual(await deal(DB), [null, 'I22B Twin', null], 'merged: its name as it was');
    const ub = await undo(LB);
    assert.equal(ub.status, 200, JSON.stringify(ub.body));
    assert.deepEqual([await deal(DB), ub.body.keptLinks, ub.body.keptFields], [[null, 'I22B Twin', null], 0, []],
        'REGRESSION: a deal by name alone whose name the merge left as it was (twins) asked whether the record merged away is a site — counted kept though nothing moved it: "1 record was left as it is now." over no change');

    // (c) "I22C Old", a site under "I22C Top", merged into "I22C New", which takes its name: the survivor's own deal by
    // name alone, renamed with it
    const [TC, XC, YC, DY] = ['i22c_top', 'i22c_old', 'i22c_new', 'i22c_dy'].map(ID);
    await db.insert(accounts).values([acct(TC, 'I22C Top'), acct(XC, 'I22C Old', { accountTier: 'site', parentAccountId: TC }), acct(YC, 'I22C New')]);
    await db.insert(opportunities).values(opp(DY, null, 'I22C New'));
    const LC = await merge(YC, XC, { resolvedFields: { name: 'I22C Old' } });
    assert.deepEqual(await deal(DY), [null, 'I22C Old', null], 'merged: renamed with the survivor');
    const uc = await undo(LC);
    assert.equal(uc.status, 200, JSON.stringify(uc.body));
    assert.deepEqual([(await one(accounts, YC)).name, await deal(DY), uc.body.keptLinks], ['I22C New', [null, 'I22C New', null], 0],
        "REGRESSION: the survivor's own deal by name alone kept off its name as it was — asked whether the record merged away is a site, though that restore never moves a deal to it");

    const now = await bRows();
    for (const k of Object.keys(B_SEEDED)) assert.equal(now[k], B_SEEDED[k], `org B's ${k}: as seeded, after I22`);
});
