// tests/integration/leads.itest.mjs
// Org-isolation for leads — including the regression guard for the clear-delete
// bug we fixed: org A clearing its leads must NOT wipe org B's leads.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST — see TESTING.md)

if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        // mock.module REPLACES the module wholesale, so this stub must export
        // every name the endpoint imports. It exported only verifyAuth and
        // canSeeAll, while the endpoints had since grown imports of isReadOnly,
        // requireRole and requireWrite -- so both integration files died at
        // import with "does not provide an export named 'isReadOnly'" and no
        // test in either had run since. A partial stub fails loudly, but only
        // when someone runs the suite; it is not part of `npm test`.
        //
        // The gates are reimplemented here rather than stubbed open. A stub that
        // always allows would make every authorization test in this file a
        // tautology -- and the delete gate is precisely what needs covering.
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            // x-test-role lets a test act as a rep. Defaults to Admin so every
            // pre-existing test in this file behaves exactly as before.
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            return { userId: 'u_' + orgId, orgId, userRole, managedReps: [], error: null };
        },
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isReadOnly:   (role) => role === 'ReadOnly',
        isTechnician: (role) => role === 'Technician',
        requireRole: (auth, allowedRoles, headers) => (
            allowedRoles.includes(auth?.userRole)
                ? null
                : { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) }
        ),
        requireWrite: (auth, event, headers, opts = {}) => {
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event?.httpMethod)) return null;
            if (auth?.userRole === 'ReadOnly') {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: read-only access' }) };
            }
            if (auth?.userRole === 'Technician' && !opts.allowTechnician) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: technicians may only update their own assigned jobs' }) };
            }
            return null;
        },
    },
});
// Webhooks / automations fire on lead create; stub them so the test makes no
// outbound calls and stays focused on org isolation.
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, {
    namedExports: { dispatchWebhook: async () => {} },
});
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, {
    namedExports: { dispatchAutomations: async () => {} },
});

const { handler } = await import('../../netlify/functions/leads.mjs');
const { db } = await import('../../db/index.js');
const { leads, users, settings: settingsTable } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
// _lib is NOT mocked — getCallerId runs real against the test DB, which is the
// point: the rep tests below exercise the true clerkUserId -> users.id
// resolution rather than a stub of it.
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_leads_*', and ONLY this file writes to
// it. The integration files run as CONCURRENT processes against one shared
// test database, and this suite seeds the users table — so sharing org ids
// with another suite means sharing users_org_clerk_uq: this file's seed of
// (itest_org_A, u_itest_org_A) collided with the identical pair the accounts
// suite re-seeds per test, killing accounts' hooks with duplicate-key errors
// and leaving org A's caller resolving to whichever suite's row was standing
// when the 30s caller cache first filled. Per-file org ids remove every
// variant of that race. If a new suite ever seeds users, it takes its own
// prefix too.
const A = 'itest_leads_A', B = 'itest_leads_B';

// The rep identity. The auth mock above returns userId 'u_' + orgId for every
// caller in an org, so linking that clerkUserId to a roster row makes org A's
// caller resolvable (usr_…) while org B's caller — no roster row — resolves
// null, which is exactly the unresolvable-caller path the toggle tests need.
const REP_A = 'usr_itest-rep-a-0001';   // org A's caller, once linked below
const OTHER = 'usr_itest-other-0002';   // a second org A rep; never the caller

const ev = (org, method, body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const asRep = (e) => ({ ...e, headers: { ...e.headers, 'x-test-role': 'User' } });
const get      = async (org) => JSON.parse((await handler(ev(org, 'GET'))).body).leads || [];
const getAsRep = async (org) => JSON.parse((await handler(asRep(ev(org, 'GET')))).body).leads || [];

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(leads).where(eq(leads.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
        await db.delete(settingsTable).where(eq(settingsTable.orgId, o));
    }
};

before(async () => {
    await cleanup();
    await db.insert(users).values([
        { id: REP_A, clerkUserId: 'u_' + A, name: 'Itest Rep A', email: 'rep-a@itest.local', role: 'User', orgId: A },
        { id: OTHER, clerkUserId: null,     name: 'Itest Other', email: 'other@itest.local', role: 'User', orgId: A },
    ]);
    // BOTH users-table caches, cleared together (see invalidateRoster's
    // comment in _lib): the caller cache stores a MISS as { id: null } for
    // 30s, so any resolution racing this seed would leave org A's caller
    // owning nothing for the rest of the run — every rep test failing closed
    // with no error anywhere.
    invalidateRoster();
});
after(cleanup);

test('read isolation — A cannot see B leads', async () => {
    await handler(ev(A, 'POST', { id: 'lead_A1', firstName: 'A', source: 'Referral', status: 'New' }));
    await handler(ev(B, 'POST', { id: 'lead_B1', firstName: 'B', source: 'Referral', status: 'New' }));
    const ids = (await get(A)).map(l => l.id);
    assert.ok(ids.includes('lead_A1') && !ids.includes('lead_B1'), 'A sees only its own leads');
});

test('REGRESSION — A clearing its leads must NOT delete B\'s leads', async () => {
    await handler(ev(A, 'POST', { id: 'lead_A2', firstName: 'A2', status: 'New' }));
    await handler(ev(B, 'POST', { id: 'lead_B2', firstName: 'B2', status: 'New' }));
    await handler(ev(A, 'DELETE', null, { clear: 'true' }));   // the previously-unscoped path
    const bLeads = await get(B);
    assert.ok(bLeads.some(l => l.id === 'lead_B2'), 'org B\'s leads MUST survive org A\'s clear');
});

test('cross-tenant write — A cannot overwrite B\'s lead via upsert with B\'s id', async () => {
    await handler(ev(B, 'POST', { id: 'lead_B3', firstName: 'B Original', status: 'New' }));
    await handler(ev(A, 'PUT', { id: 'lead_B3', firstName: 'HACKED', status: 'Working' }));
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_B3'));
    assert.equal(row.firstName, 'B Original', 'B\'s lead must be unchanged by A');
    assert.equal(row.orgId, B);
});

// ── Partial-update merge (the leads overwrite path, closed) ──────────────────
// saveLead has always sent { id, ...patch } — two keys for a status change —
// while sanitize() rebuilt the whole row, nulling every absent column. The
// client's local merge masked it on screen; the wipe showed on reload. These
// pin the read-then-merge: a key sent is applied, a key omitted keeps its
// stored value. Org A only; the org-B exact-count test below depends on its
// fixtures and must not be preceded by owned B rows.

test('REGRESSION — a partial PUT updates its fields and preserves the rest', async () => {
    await handler(ev(A, 'POST', {
        id: 'lead_A_merge1', firstName: 'Keep', lastName: 'Me', company: 'Acme',
        email: 'keep@itest.local', phone: '555-0100', source: 'Referral',
        status: 'New', estimatedARR: 12000, assignedTo: 'Itest Rep A', notes: 'precious',
    }));
    const res = await handler(ev(A, 'PUT', { id: 'lead_A_merge1', status: 'Working' }));
    assert.equal(res.statusCode, 200);
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_A_merge1'));
    assert.equal(row.status,     'Working',      'the sent field must be applied');
    assert.equal(row.firstName,  'Keep',         'an omitted field must survive a partial PUT');
    assert.equal(row.lastName,   'Me',           'an omitted field must survive a partial PUT');
    assert.equal(row.company,    'Acme',         'an omitted field must survive a partial PUT');
    assert.equal(row.email,      'keep@itest.local', 'an omitted field must survive a partial PUT');
    assert.equal(row.source,     'Referral',     'an omitted field must survive a partial PUT');
    assert.equal(row.assignedTo, 'Itest Rep A',  'assignment must survive a status-only PUT');
    assert.equal(row.notes,      'precious',     'notes must survive a status-only PUT');
    assert.equal(Number(row.estimatedARR), 12000, 'ARR must survive a status-only PUT');
});

test('an explicit null still clears — field-present semantics, not field-protection', async () => {
    const res = await handler(ev(A, 'PUT', { id: 'lead_A_merge1', notes: null }));
    assert.equal(res.statusCode, 200);
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_A_merge1'));
    assert.equal(row.notes, null,           'a key sent as null must clear the column');
    assert.equal(row.firstName, 'Keep',     'other fields still survive');
    assert.equal(row.assignedTo, 'Itest Rep A', 'assignment untouched by an unrelated clear');
});

// ── Bulk insert (the CSV importer's path) ────────────────────────────────────
// These cover 0.23. The importer has always POSTed an ARRAY, and this endpoint
// had no Array.isArray branch, so every leads CSV import returned
// 400 'id is required' before touching the database. Nothing caught it: the
// unit suites each import a single module, and this file only ever POSTed one
// lead at a time. Both halves were internally coherent; the contract between
// them was not tested.

test('REGRESSION — an ARRAY body inserts every row instead of returning 400', async () => {
    const batch = [
        { id: 'lead_A_bulk1', firstName: 'Bulk', lastName: 'One',   status: 'New',       source: 'Referral', assignedTo: 'Rep One' },
        { id: 'lead_A_bulk2', firstName: 'Bulk', lastName: 'Two',   status: 'Contacted', source: 'Web Form', assignedTo: 'Rep One' },
        { id: 'lead_A_bulk3', firstName: 'Bulk', lastName: 'Three', status: 'New',       source: 'Referral', assignedTo: '' },
    ];
    const res = await handler(ev(A, 'POST', batch));
    assert.equal(res.statusCode, 201, 'an array body must be accepted, not rejected as a single row');

    const body = JSON.parse(res.body);
    assert.equal(body.inserted, 3, 'every row in the batch should land');

    // bulkClient.postNew partitions landed-vs-failed by insertedIds. Without it
    // the client falls back to a count and reports rows as saved by position,
    // so this key is part of the contract, not an implementation detail.
    assert.ok(Array.isArray(body.insertedIds), 'the response must carry insertedIds');
    assert.deepEqual([...body.insertedIds].sort(), batch.map(b => b.id).sort());

    const ids = (await get(A)).map(l => l.id);
    for (const b of batch) assert.ok(ids.includes(b.id), b.id + ' should be readable after import');
});

test('REGRESSION — a blank assignedTo stays unassigned, never filled with the importer', async () => {
    // The opportunities importer does `salesRep || currentUser`, which makes an
    // unassigned deal impossible to create from a CSV. Leads must not acquire
    // the same behaviour: rep scoping treats null assignedTo as visible-to-all,
    // and the delete-gate fixture depends on genuinely unowned rows existing.
    await handler(ev(A, 'POST', [{ id: 'lead_A_bulk4', firstName: 'Unowned', status: 'New', assignedTo: '' }]));
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_A_bulk4'));
    assert.ok(!row.assignedTo, 'a blank Assigned To must remain blank, not become the caller');
});

test('a bulk row without an id is refused for the whole batch, not silently dropped', async () => {
    const res = await handler(ev(A, 'POST', [
        { id: 'lead_A_bulk5', firstName: 'Has Id', status: 'New' },
        { firstName: 'No Id', status: 'New' },
    ]));
    assert.equal(res.statusCode, 400, 'a batch containing an id-less row must be refused');
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_A_bulk5'));
    assert.ok(!row, 'nothing from a refused batch may be written');
});

test('an empty array is a no-op, not an error', async () => {
    const res = await handler(ev(A, 'POST', []));
    assert.equal(res.statusCode, 200);
    assert.equal(JSON.parse(res.body).inserted, 0);
});

test('bulk insert is org-scoped — B cannot see rows A imported', async () => {
    await handler(ev(A, 'POST', [{ id: 'lead_A_bulk6', firstName: 'Scoped', status: 'New' }]));
    const ids = (await get(B)).map(l => l.id);
    assert.ok(!ids.includes('lead_A_bulk6'), 'a bulk-imported row must not leak across orgs');
});

// ── Rep-role read scoping + the unassigned-visibility toggle ─────────────────
// The first rep-role coverage this endpoint has ever had (the §0.33/§0.50 test
// debt): until now the GET scoping's only runtime evidence was a browser check.
//
// Rows are seeded with db.insert rather than the handler so ownership is the
// test's input, not a side effect of stamping. The toggle is written straight
// into the settings row the same way — this suite tests leads.mjs, not
// settings.mjs (the both-halves pairing has its own guard in
// tests/ownership-registry.test.mjs).
//
// ORDER MATTERS in this block: the org B test asserts an exact row count and
// depends on every earlier B row being unassigned (org B has no roster, so
// nothing can have stamped an owner there). Keep any future owned-B fixtures
// AFTER it.

const setLeadVisibility = async (org, value) => {
    await db.delete(settingsTable).where(eq(settingsTable.orgId, org));
    await db.insert(settingsTable).values({ id: org, orgId: org, extra: { unassignedLeadsVisibleToReps: value } });
};

test('rep scoping — own + unassigned arrive; another rep\'s lead never does (toggle unset)', async () => {
    await db.delete(settingsTable).where(eq(settingsTable.orgId, A));   // absent key = the standing policy
    await db.insert(leads).values([
        { id: 'lead_vis_mine',  firstName: 'Mine',  status: 'New', ownerId: REP_A, orgId: A },
        { id: 'lead_vis_other', firstName: 'Other', status: 'New', ownerId: OTHER, orgId: A },
        { id: 'lead_vis_none',  firstName: 'None',  status: 'New', ownerId: null,  orgId: A },
    ]);
    const ids = (await getAsRep(A)).map(l => l.id);
    assert.ok(ids.includes('lead_vis_mine'),   'a rep must receive their own lead');
    assert.ok(ids.includes('lead_vis_none'),   'default policy: unassigned is visible to reps');
    assert.ok(!ids.includes('lead_vis_other'), 'another rep\'s lead must never be sent to a rep');
});

test('toggle OFF — a rep receives ONLY their own leads; unassigned disappears', async () => {
    await setLeadVisibility(A, false);
    const ids = (await getAsRep(A)).map(l => l.id);
    assert.ok(ids.includes('lead_vis_mine'),   'the rep\'s own lead survives the strict policy');
    assert.ok(!ids.includes('lead_vis_none'),  'unassigned must be hidden when the toggle is off');
    assert.ok(!ids.includes('lead_vis_other'), 'another rep\'s lead stays hidden');
});

test('toggle OFF — Admin is untouched (canSeeAll bypasses before the filter)', async () => {
    const ids = (await get(A)).map(l => l.id);   // ev() defaults to Admin
    for (const id of ['lead_vis_mine', 'lead_vis_other', 'lead_vis_none']) {
        assert.ok(ids.includes(id), `Admin must still receive ${id} with the toggle off`);
    }
});

test('toggle OFF + unresolvable caller — NOTHING arrives, not the unassigned rows (18b22)', async () => {
    // Org B's caller has no roster row, so getCallerId resolves null. A bare
    // `l.ownerId === callerId` would match null === null and hand this caller
    // exactly the unassigned rows the toggle exists to hide. The `!!l.ownerId`
    // guard in the strict branch means they receive nothing: an unknown caller
    // owns nothing, and a hidden unassigned row stays hidden — both rules
    // failing closed at once. This test is what catches the guard's removal.
    await setLeadVisibility(B, false);
    await db.insert(leads).values([
        { id: 'lead_vis_b_none',  firstName: 'BNone',  status: 'New', ownerId: null,  orgId: B },
        { id: 'lead_vis_b_owned', firstName: 'BOwned', status: 'New', ownerId: OTHER, orgId: B },
    ]);
    const rows = await getAsRep(B);
    const ids = rows.map(l => l.id);
    assert.ok(!ids.includes('lead_vis_b_none'),  'unassigned must be hidden');
    assert.ok(!ids.includes('lead_vis_b_owned'), 'an owned row must be refused to a null caller');
    // Every org B row in this suite is unassigned by construction (no roster ->
    // nothing ever stamped an owner) except lead_vis_b_owned above, so the
    // strict policy leaves an unresolvable caller with exactly zero rows.
    assert.equal(rows.length, 0, 'an unresolvable caller under the strict policy sees nothing at all');
});

test('toggle stored TRUE — identical to the absent-key default', async () => {
    await setLeadVisibility(A, true);
    const ids = (await getAsRep(A)).map(l => l.id);
    assert.ok(ids.includes('lead_vis_mine') && ids.includes('lead_vis_none'),
        'stored true must reproduce the default policy exactly');
    assert.ok(!ids.includes('lead_vis_other'), 'another rep\'s lead stays hidden either way');
});

// ── Assignment is a MANAGED action (§0.58, 2 Sep) ────────────────────────────
// Only Admin/Manager may change a lead's owner. This retired the
// reps-claim-by-editing-unassigned-rows rule for the OWNERSHIP field: a rep's
// PUT may still edit an unassigned row (assertOwnership is unchanged), but any
// payload whose assignedTo would CHANGE the resolved owner id OR the stored
// display-name string is 403'd before the merge. Rows are seeded with
// db.insert so ownership is the test's input, per this suite's pattern.

test('rep cannot claim an unassigned lead by writing assignedTo', async () => {
    await db.insert(leads).values({ id: 'lead_mg_claim', firstName: 'Pool', status: 'New', ownerId: null, orgId: A });
    const res = await handler(asRep(ev(A, 'PUT', { id: 'lead_mg_claim', assignedTo: 'Itest Rep A', assignee: 'Itest Rep A' })));
    assert.equal(res.statusCode, 403, 'self-claim by direct write must be refused');
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_mg_claim'));
    assert.equal(row.ownerId, null,    'the pool row must remain unassigned');
    assert.equal(row.assignedTo, null, 'no display name may be written by a refused claim');
});

test('rep cannot assign an unassigned lead to another rep', async () => {
    const res = await handler(asRep(ev(A, 'PUT', { id: 'lead_mg_claim', assignedTo: 'Itest Other' })));
    assert.equal(res.statusCode, 403, 'assigning to a colleague is a managed action');
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_mg_claim'));
    assert.equal(row.ownerId, null, 'the row must remain unassigned');
});

test('rep cannot spoof the display name — an unresolvable assignedTo on an unassigned row is refused', async () => {
    // Owner-id comparison alone passes here (null === null): the name resolves
    // to nobody, so only the string half of the gate can catch the label that
    // makes a lead LOOK assigned while ownerId stays null.
    const res = await handler(asRep(ev(A, 'PUT', { id: 'lead_mg_claim', assignedTo: 'Nobody Real' })));
    assert.equal(res.statusCode, 403, 'writing a label that resolves to nobody must be refused');
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_mg_claim'));
    assert.equal(row.assignedTo, null, 'the spoof label must not be written');
});

test('rep cannot give away or clear their OWN lead', async () => {
    await db.insert(leads).values({ id: 'lead_mg_own', firstName: 'Held', status: 'Working', ownerId: REP_A, assignedTo: 'Itest Rep A', orgId: A });
    const cleared = await handler(asRep(ev(A, 'PUT', { id: 'lead_mg_own', assignedTo: '' })));
    assert.equal(cleared.statusCode, 403, 'clearing an assignment is a managed action even for the owner');
    const given = await handler(asRep(ev(A, 'PUT', { id: 'lead_mg_own', assignedTo: 'Itest Other' })));
    assert.equal(given.statusCode, 403, 'handing a lead to a colleague is a managed action');
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_mg_own'));
    assert.equal(row.ownerId, REP_A, 'ownership must be untouched by refused writes');
});

test('rep edit that spreads an UNCHANGED assignedTo still works — LeadForm\'s shape', async () => {
    const res = await handler(asRep(ev(A, 'PUT', { id: 'lead_mg_own', status: 'Qualified', assignedTo: 'Itest Rep A' })));
    assert.equal(res.statusCode, 200, 'an unchanged assignment must not block an ordinary edit');
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_mg_own'));
    assert.equal(row.status, 'Qualified', 'the edit must be applied');
    assert.equal(row.ownerId, REP_A,      'ownership unchanged');
});

test('rep partial PUT that never mentions assignedTo is untouched by the gate', async () => {
    const res = await handler(asRep(ev(A, 'PUT', { id: 'lead_mg_own', notes: 'called twice' })));
    assert.equal(res.statusCode, 200);
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_mg_own'));
    assert.equal(row.notes, 'called twice');
    assert.equal(row.ownerId, REP_A);
});

test('Admin assignment still works — the gate is role-scoped, not global', async () => {
    const res = await handler(ev(A, 'PUT', { id: 'lead_mg_claim', assignedTo: 'Itest Rep A' }));
    assert.equal(res.statusCode, 200, 'Admin must still assign');
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_mg_claim'));
    assert.equal(row.ownerId, REP_A, 'the resolved owner id must be stamped');
});

// ── §0.58 on CREATE — naming someone else is assigning ───────────────────────
// The single POST path only; the bulk/import branch is deliberately ungated
// (recorded open question). A rep creates blank (→ caller-owned, the standing
// ownerIdForWrite rule) or names themselves; a canSeeAll caller gains the
// explicit-blank pool seed, while an ABSENT key keeps caller-owns.

test('rep POST naming a colleague is refused — creating is not assigning', async () => {
    const res = await handler(asRep(ev(A, 'POST', { id: 'lead_post_colleague', firstName: 'Given', status: 'New', assignedTo: 'Itest Other' })));
    assert.equal(res.statusCode, 403);
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_post_colleague'));
    assert.ok(!row, 'the refused create must write nothing');
});

test('rep POST naming THEMSELVES is allowed and self-owned', async () => {
    const res = await handler(asRep(ev(A, 'POST', { id: 'lead_post_self', firstName: 'Mine', status: 'New', assignedTo: 'Itest Rep A' })));
    assert.equal(res.statusCode, 201);
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_post_self'));
    assert.equal(row.ownerId, REP_A);
});

test('rep POST with a blank assignment stays caller-owned — the standing create rule', async () => {
    const res = await handler(asRep(ev(A, 'POST', { id: 'lead_post_blank', firstName: 'Blank', status: 'New', assignedTo: '' })));
    assert.equal(res.statusCode, 201);
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_post_blank'));
    assert.equal(row.ownerId, REP_A, 'a rep\'s blank create is theirs, never unassigned');
});

test('Admin POST with an EXPLICIT blank creates an UNASSIGNED pool lead', async () => {
    const res = await handler(ev(A, 'POST', { id: 'lead_post_pool', firstName: 'Pool', status: 'New', assignedTo: '' }));
    assert.equal(res.statusCode, 201);
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_post_pool'));
    assert.equal(row.ownerId, null,    'an explicit blank from canSeeAll seeds the pool');
    assert.equal(row.assignedTo, null, 'no display name either — the §0.58 spoof shape in reverse');
});

test('Admin POST with the key ABSENT keeps caller-owns-what-they-create', async () => {
    const res = await handler(ev(A, 'POST', { id: 'lead_post_absent', firstName: 'Absent', status: 'New' }));
    assert.equal(res.statusCode, 201);
    const [row] = await db.select().from(leads).where(eq(leads.id, 'lead_post_absent'));
    // The suite's Admin caller shares REP_A's clerkUserId, so caller-owned
    // resolves to REP_A here — the point is it is NOT null.
    assert.equal(row.ownerId, REP_A, 'an absent key must not become the pool seed — API callers are unchanged');
});
