// tests/integration/owner-race.itest.mjs
// §0.275 against the real test database (OPEN_ITEMS §4.8, §0.273's found (1); Jeff, 20 Nov: "Delete ownership race",
// then "Whole class"): a rep's write checked by a read, then run with no owner in its own filter, landed on a row an
// Admin or Manager reassigned between the two. The race is staged where it happens — inside the ownership check, after
// it has passed: _lib.mjs is the real module with assertOwnership (and bulkUpsert's read) wrapped to move the row to
// another rep (or delete it) the moment the check says yes. Each of the thirteen writes a rep reaches then writes
// nothing to a row reassigned: 403, the bulk overwrite counting it forbidden — the row read back as the other rep's,
// unchanged. A row deleted since the check: the three DELETEs answer 404 `gone` and the accounts PUT 404 (its claim);
// the other single PUTs and the bulk path are upserts and write it again — as they did before §0.275 (OPEN_ITEMS
// §4.8, §0.273's found (3)), pinned below so a change to it is seen. An Admin's write, not checked, still lands; a
// rep's own, unassigned and blank-owned rows still save.
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
            return { userId: event.headers['x-test-user'], orgId, userRole: event.headers['x-test-role'] || 'User', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, { namedExports: { dispatchWebhook: async () => {} } });
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, { namedExports: { dispatchAutomations: async () => {} } });
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: new Proxy({}, { get: () => () => ({}) }) },
});

// The race, staged: the real _lib.mjs, its ownership check and the bulk path's read each followed — once, when armed —
// by the move another session makes between the check and the write.
const lib = await import('../../netlify/functions/_lib.mjs');
let armed = null;   // async ({ table, id }) => void — fired once, then cleared
const fire = async (args) => { const a = armed; armed = null; if (a) await a(args); };
mock.module(new URL('../../netlify/functions/_lib.mjs', import.meta.url).href, {
    namedExports: {
        ...lib,
        assertOwnership: async (args) => { const r = await lib.assertOwnership(args); if (!r) await fire(args); return r; },
        bulkUpsert: (args) => lib.bulkUpsert({
            ...args,
            client: {
                select: (p) => ({ from: (tb) => ({ where: async (w) => { const rows = await db.select(p).from(tb).where(w); await fire({ table: args.table, id: args.rows[0]?.id }); return rows; } }) }),
                insert: (tb) => db.insert(tb),
            },
        }),
    },
});

const FN = {};
for (const f of ['accounts', 'contacts', 'tasks', 'activities', 'leads', 'opportunities']) FN[f] = (await import(`../../netlify/functions/${f}.mjs`)).handler;
const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');
const { users } = schema;
const { eq, and } = await import('drizzle-orm');
const { OWNERSHIP_FORBIDDEN } = await import('../../netlify/functions/_ownership.mjs');

// ORG NAMESPACE: this file owns 'itest_race_*', and only this file writes to it.
const A = 'itest_race_A';
const CLERK = { rep: 'clerk_itest_race_rep', other: 'clerk_itest_race_other', admin: 'clerk_itest_race_admin' };
const USR = { rep: 'usr_itest-race-rep', other: 'usr_itest-race-other', admin: 'usr_itest-race-admin' };

// entity → [endpoint, the table, the minimal row, an edit (the field and the value the PUT sends)]
const ENTITIES = {
    contact:     ['contacts',      schema.contacts,      (id) => ({ firstName: 'Con', lastName: id }), ['lastName', 'Edited']],
    activity:    ['activities',    schema.activities,    (id) => ({ type: 'Call', notes: 'Act ' + id, date: '2026-11-20' }), ['notes', 'Edited']],
    task:        ['tasks',         schema.tasks,         (id) => ({ title: 'Task ' + id }), ['title', 'Edited']],
    lead:        ['leads',         schema.leads,         (id) => ({ firstName: 'Lead', lastName: id }), ['lastName', 'Edited']],
    opportunity: ['opportunities', schema.opportunities, (id) => ({ opportunityName: 'Opp ' + id, account: 'Acct', pipelineId: 'default', stage: 'Qualification' }), ['notes', 'Edited']],
    // Not the name: the bulk path refuses a rename (BULK_RENAME), and a save's rename cascades to the deals and contacts.
    account:     ['accounts',      schema.accounts,      (id) => ({ name: 'Acct ' + id }), ['phone', '555-0275']],
};
const REP_DELETES = ['contact', 'activity', 'task'];

const ev = (role, user, method, body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': A, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const rowOf = async (table, id) => (await db.select().from(table).where(and(eq(table.id, id), eq(table.orgId, A))))[0];
const seed = async (ent, tag, ownerId) => {
    const [, table, base] = ENTITIES[ent];
    const id = `itest_race_${ent}_${tag}`;
    await db.delete(table).where(and(eq(table.id, id), eq(table.orgId, A)));
    await db.insert(table).values({ id, orgId: A, ownerId, ...base(id) });
    return id;
};
const reassign = async ({ table, id }) => { await db.update(table).set({ ownerId: USR.other }).where(and(eq(table.id, id), eq(table.orgId, A))); };
const remove = async ({ table, id }) => { await db.delete(table).where(and(eq(table.id, id), eq(table.orgId, A))); };
const refused = (res, what) => {
    assert.equal(res.statusCode, 403, `${what}: ${res.body}`);
    assert.equal(JSON.parse(res.body).error, OWNERSHIP_FORBIDDEN, what);
};

const cleanup = async () => {
    for (const [, table] of Object.values(ENTITIES)) await db.delete(table).where(eq(table.orgId, A));
    await db.delete(users).where(eq(users.orgId, A));
    await db.delete(schema.auditLog).where(eq(schema.auditLog.orgId, A));
};
before(async () => {
    await cleanup();
    await db.insert(users).values([
        { id: USR.rep,   clerkUserId: CLERK.rep,   orgId: A, name: 'Itest Race Rep',   email: 'race-rep@itest.local',   role: 'User' },
        { id: USR.other, clerkUserId: CLERK.other, orgId: A, name: 'Itest Race Other', email: 'race-other@itest.local', role: 'User' },
        { id: USR.admin, clerkUserId: CLERK.admin, orgId: A, name: 'Itest Race Admin', email: 'race-admin@itest.local', role: 'Admin' },
    ]);
    lib.invalidateRoster();
});
after(async () => { armed = null; await cleanup(); });

test("§0.275 a rep's DELETE of a contact, activity or task reassigned to another rep after the check passed deletes nothing — 403, the row the other rep's", async () => {
    for (const ent of REP_DELETES) {
        const [fn, table] = ENTITIES[ent];
        const id = await seed(ent, 'del', USR.rep);
        armed = reassign;
        const res = await FN[fn](ev('User', CLERK.rep, 'DELETE', null, { id }));
        assert.equal(armed, null, `${ent}: the race ran`);
        refused(res, `${ent} DELETE`);
        const back = await rowOf(table, id);
        assert.ok(back, `${ent}: still there`);
        assert.equal(back.ownerId, USR.other);
    }
});

test("§0.275 a rep's DELETE of a row deleted after the check passed answers 404 `gone` — as a Delete after one that landed (§0.273)", async () => {
    for (const ent of REP_DELETES) {
        const [fn] = ENTITIES[ent];
        const id = await seed(ent, 'delgone', USR.rep);
        armed = remove;
        const res = await FN[fn](ev('User', CLERK.rep, 'DELETE', null, { id }));
        assert.equal(res.statusCode, 404, `${ent}: ${res.body}`);
        assert.deepEqual(JSON.parse(res.body), { error: 'Not found', code: 'gone' });
    }
});

test("§0.275 a rep's save of any of the six, reassigned after the check passed, writes nothing — 403, the field as stored, the row the other rep's", async () => {
    for (const [ent, [fn, table, , [field, value]]] of Object.entries(ENTITIES)) {
        const id = await seed(ent, 'put', USR.rep);
        const before = await rowOf(table, id);
        armed = reassign;
        const res = await FN[fn](ev('User', CLERK.rep, 'PUT', { id, [field]: value }));
        assert.equal(armed, null, `${ent}: the race ran`);
        refused(res, `${ent} PUT`);
        const back = await rowOf(table, id);
        assert.equal(back[field], before[field], `${ent}: ${field} not written`);
        assert.equal(back.ownerId, USR.other, `${ent}: the reassignment stands`);
    }
});

test("§0.275 an unassigned row assigned to another rep after the check passed is not saved over either — 403", async () => {
    for (const [ent, [fn, table, , [field, value]]] of Object.entries(ENTITIES)) {
        const id = await seed(ent, 'none', null);
        const before = await rowOf(table, id);
        armed = reassign;
        refused(await FN[fn](ev('User', CLERK.rep, 'PUT', { id, [field]: value })), `${ent} PUT of an unassigned row`);
        assert.equal((await rowOf(table, id))[field], before[field], ent);
    }
});

test("§0.275 a deal's team note posted by a rep on a deal reassigned after the check passed is not written — 403, no note", async () => {
    const id = await seed('opportunity', 'note', USR.rep);
    armed = reassign;
    const res = await FN.opportunities(ev('User', CLERK.rep, 'PUT', { id, note: { op: 'add', text: 'TEST race note' } }));
    refused(res, 'note');
    const back = await rowOf(schema.opportunities, id);
    assert.deepEqual(back.comments || [], []);
    assert.equal(back.ownerId, USR.other);
});

test("§0.275 a rep's account save reassigned after the check passed aborts its whole batch — 403; one deleted after the check is a 404, not made again", async () => {
    const id = await seed('account', 'batch', USR.rep);
    armed = reassign;
    refused(await FN.accounts(ev('User', CLERK.rep, 'PUT', { id, phone: '555-0001' })), 'account PUT');
    assert.equal((await rowOf(schema.accounts, id)).phone, null);
    const gone = await seed('account', 'batchgone', USR.rep);
    armed = remove;
    const res = await FN.accounts(ev('User', CLERK.rep, 'PUT', { id: gone, phone: '555-0002' }));
    assert.equal(res.statusCode, 404, res.body);
    assert.equal(await rowOf(schema.accounts, gone), undefined, 'the claim refused it: no insert made it again');
});

test("§0.275 as before §0.275 (OPEN_ITEMS §4.8, §0.273's found (3)): a single PUT on a row deleted after the check passed writes it again — an upsert's insert arm meets no conflict; only the accounts claim refuses it", async () => {
    for (const ent of ['contact', 'activity', 'task', 'lead', 'opportunity']) {
        const [fn, table, , [field, value]] = ENTITIES[ent];
        const id = await seed(ent, 'putgone', USR.rep);
        armed = remove;
        const res = await FN[fn](ev('User', CLERK.rep, 'PUT', { id, [field]: value }));
        assert.equal(armed, null, `${ent}: the race ran`);
        assert.equal(res.statusCode, 200, `${ent}: ${res.body}`);
        assert.equal((await rowOf(table, id))?.[field], value, `${ent}: written again — the filed finding, not this batch's`);
    }
});

test("§0.275 a rep's bulk overwrite (contacts, deals, accounts) skips a row reassigned after its read — counted forbidden, the row unchanged", async () => {
    for (const ent of ['contact', 'opportunity', 'account']) {
        const [fn, table, , [field, value]] = ENTITIES[ent];
        const id = await seed(ent, 'bulk', USR.rep);
        const before = await rowOf(table, id);
        armed = reassign;
        const res = await FN[fn](ev('User', CLERK.rep, 'PUT', [{ id, [field]: value }]));
        assert.equal(res.statusCode, 200, `${ent}: ${res.body}`);
        const body = JSON.parse(res.body);
        assert.equal(body.updated, 0, ent);
        assert.deepEqual(body.forbidden, [id], ent);
        const back = await rowOf(table, id);
        assert.equal(back[field], before[field], ent);
        assert.equal(back.ownerId, USR.other, ent);
    }
});

test('§0.275 an Admin is not checked, so the same move does not stop their write — the save and the delete land', async () => {
    for (const [ent, [fn, table, , [field, value]]] of Object.entries(ENTITIES)) {
        const id = await seed(ent, 'admin', USR.rep);
        armed = reassign;
        const res = await FN[fn](ev('Admin', CLERK.admin, 'PUT', { id, [field]: value }));
        assert.equal(res.statusCode, 200, `${ent}: ${res.body}`);
        assert.equal((await rowOf(table, id))[field], value, ent);
        armed = null;
    }
    for (const ent of REP_DELETES) {
        const [fn, table] = ENTITIES[ent];
        const id = await seed(ent, 'admindel', USR.rep);
        const res = await FN[fn](ev('Admin', CLERK.admin, 'DELETE', null, { id }));
        assert.equal(res.statusCode, 200, `${ent}: ${res.body}`);
        assert.equal(await rowOf(table, id), undefined, ent);
    }
});

test("§0.275 with no move, a rep's write still lands on a row of theirs, an unassigned one and a blank-owned one (spaces only) — and on their own id with spaces around it, as mayMutate reads it", async () => {
    for (const [ent, [fn, table, , [field, value]]] of Object.entries(ENTITIES)) {
        for (const [tag, owner] of [['own', USR.rep], ['open', null], ['blank', '   '], ['padded', ` ${USR.rep} `]]) {
            const id = await seed(ent, tag, owner);
            const res = await FN[fn](ev('User', CLERK.rep, 'PUT', { id, [field]: value }));
            assert.equal(res.statusCode, 200, `${ent} ${tag}: ${res.body}`);
            assert.equal((await rowOf(table, id))[field], value, `${ent} ${tag}`);
        }
    }
    for (const ent of REP_DELETES) {
        const [fn, table] = ENTITIES[ent];
        const id = await seed(ent, 'owndel', USR.rep);
        assert.equal((await FN[fn](ev('User', CLERK.rep, 'DELETE', null, { id }))).statusCode, 200, ent);
        assert.equal(await rowOf(table, id), undefined, ent);
    }
});
