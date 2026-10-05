// tests/integration/in-org.itest.mjs
// The in-org audit (state §0.169), against the real test database: what one
// member of an org could do to another member's work, or read of it.
//
// Proves, inside org A: a partial PUT to an account, a contact, an activity and
// a SPIFF claim changes what it names and keeps the rest; a rep's claim is filed
// in their roster name, pending, whatever the body says, and a rep edits only
// their own pending claim, never its approval or payment, while a manager's
// status change keeps the approval; export, its runs, its schedules and the
// GDPR request queue are an Admin's; AI scoring refuses roles that write no CRM record and a deal that is
// not the caller's, before the key, the switch or a cached score; the Slack
// webhook URL reaches only an Admin; automations are read by Admin and Manager
// alone; a Technician reads the customers and locations of their own jobs —
// lead or co-tech, the co-tech list stored as jsonb TEXT as dispatch-jobs writes
// it — those jobs' line items and history, and their own time off. Org B's rows
// reach no one in A.
//
// The auth mock fakes the SIGN-IN only (dispatch-access.itest.mjs's pattern),
// with an x-test-user header so two reps of one org are two people; every
// handler, gate and query is the real one.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
// No site key, and no org key is seeded: a caller past the scoring gates gets the
// 503 that comes before any call to the model — nothing here reaches Anthropic.
process.env.ANTHROPIC_API_KEY = '';

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const roleGate = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            const userId = event.headers?.['x-test-user'] || `clerk_itest_inorg_${userRole}_${orgId}`;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});
// The job endpoint pulls the senders in; nothing here is scheduled, so nothing sends.
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: {} },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});

const FN = {};
for (const name of ['accounts', 'contacts', 'activities', 'spiff-claims', 'export-runs', 'export-schedules', 'export-dsr', 'ai-score',
                    'settings', 'automations', 'dispatch-customers', 'dispatch-jobs', 'dispatch-schedule-blocks']) {
    FN[name] = (await import(`../../netlify/functions/${name}.mjs`)).handler;
}
const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');
const { settings, users, accounts, contacts, activities, opportunities, spiffClaims, exportRuns, exportSchedules, dsrQueue,
        automations, automationRuns, dispatchTechnicians, dispatchCustomers, dispatchServiceLocations, dispatchJobs,
        dispatchJobLineItems, dispatchJobStatusHistory, dispatchScheduleBlocks, auditLog } = schema;
const { eq, and, inArray } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_inorg_*' (rows, ids, Clerk ids, emails).
const A = 'itest_inorg_A';
const B = 'itest_inorg_B';
const ORGS = [A, B];

// Who signs in (x-test-user), and as what (x-test-role).
const WHO = {
    admin:   { user: 'clerk_itest_inorg_admin', role: 'Admin' },
    manager: { user: 'clerk_itest_inorg_mgr',   role: 'Manager' },
    karen:   { user: 'clerk_itest_inorg_rep1',  role: 'User' },
    ravi:    { user: 'clerk_itest_inorg_rep2',  role: 'User' },
    reader:  { user: 'clerk_itest_inorg_ro',    role: 'ReadOnly' },
    tess:    { user: 'clerk_itest_inorg_tech',  role: 'Technician' },   // a technician row is linked
    nobody:  { user: 'clerk_itest_inorg_tech2', role: 'Technician' },   // none is
};

const call = async (name, who, method, body, qs, org = A) => {
    const res = await FN[name]({
        httpMethod: method,
        headers: { 'x-test-org': org, 'x-test-role': who.role, 'x-test-user': who.user, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        queryStringParameters: qs || {},
    });
    let parsed = {};
    try { parsed = JSON.parse(res.body || '{}'); } catch { /* not JSON */ }
    return { status: res.statusCode, body: parsed };
};
const one = async (table, id) => (await db.select().from(table).where(eq(table.id, id)))[0];
const ids = (rows) => (rows || []).map((r) => r.id).sort();

const TECH_ME = 'dtech_itest_inorg_me', TECH_OTHER = 'dtech_itest_inorg_other', TECH_B = 'dtech_itest_inorg_b';
const SLACK_URL = 'https://hooks.slack.com/services/TITEST/BINORG/secretpart';

const cleanup = async () => {
    for (const t of [dispatchJobStatusHistory, dispatchJobLineItems, dispatchJobs, dispatchServiceLocations, dispatchCustomers,
                     dispatchScheduleBlocks, dispatchTechnicians, automationRuns, automations, exportRuns, exportSchedules, dsrQueue,
                     spiffClaims, activities, contacts, accounts, opportunities, users, auditLog, settings]) {
        await db.delete(t).where(inArray(t.orgId, ORGS));
    }
};

before(async () => {
    await cleanup();
    const now = new Date();
    await db.insert(settings).values([
        { id: 'settings_' + A, orgId: A, extra: { dispatchEnabled: true, slackConfig: { webhookUrl: SLACK_URL, channel: '#wins', enabled: true } } },
        { id: 'settings_' + B, orgId: B, extra: { dispatchEnabled: true } },
    ]);
    await db.insert(users).values([
        { id: 'usr_itest_inorg_admin', orgId: A, clerkUserId: WHO.admin.user,   name: 'Ada Inorg',   email: 'ada@itest-inorg.local',   role: 'Admin' },
        { id: 'usr_itest_inorg_mgr',   orgId: A, clerkUserId: WHO.manager.user, name: 'Max Inorg',   email: 'max@itest-inorg.local',   role: 'Manager' },
        { id: 'usr_itest_inorg_rep1',  orgId: A, clerkUserId: WHO.karen.user,   name: 'Karen Inorg', email: 'karen@itest-inorg.local', role: 'User' },
        { id: 'usr_itest_inorg_rep2',  orgId: A, clerkUserId: WHO.ravi.user,    name: 'Ravi Inorg',  email: 'ravi@itest-inorg.local',  role: 'User' },
        { id: 'usr_itest_inorg_tech',  orgId: A, clerkUserId: WHO.tess.user,    name: 'Tess Inorg',  email: 'tess@itest-inorg.local',  role: 'Technician' },
    ]);

    // ── CRM rows for the merges ──
    await db.insert(accounts).values({ id: 'acct_itest_inorg', orgId: A, name: 'Inorg Industries', industry: 'Manufacturing', city: 'Tulsa',
        assignedTerritory: 'East', phone: '555-0100', notes: 'first notes' });
    await db.insert(contacts).values({ id: 'cont_itest_inorg', orgId: A, firstName: 'Pat', lastName: 'Inorg', email: 'pat@inorg.example',
        phone: '555-0101', company: 'Inorg Industries', accountId: 'acct_itest_inorg' });
    await db.insert(activities).values({ id: 'act_itest_inorg', orgId: A, type: 'Call', date: '2026-10-01', notes: 'talked pricing',
        opportunityId: 'opp_itest_inorg_karen', contactId: 'cont_itest_inorg', contactIds: ['cont_itest_inorg', 'cont_itest_inorg_2'] });

    // ── Deals for scoring ──
    await db.insert(opportunities).values([
        { id: 'opp_itest_inorg_karen', orgId: A, pipelineId: 'default', stage: 'Discovery', opportunityName: 'Karen deal', ownerId: 'usr_itest_inorg_rep1' },
        { id: 'opp_itest_inorg_ravi',  orgId: A, pipelineId: 'default', stage: 'Discovery', opportunityName: 'Ravi deal',  ownerId: 'usr_itest_inorg_rep2',
          aiScore: { score: 77, verdict: 'On Track', headline: 'Ravi’s cached score', signals: [], recommendation: '', scoredAt: now.toISOString() } },
        { id: 'opp_itest_inorg_open',  orgId: A, pipelineId: 'default', stage: 'Discovery', opportunityName: 'Unassigned deal', ownerId: null },
    ]);

    // ── SPIFF claims ──
    const claim = (id, repName, extra = {}) => ({ id, orgId: A, spiffId: 'spiff_itest_inorg', spiffName: 'Q4 push', repName,
        amount: 500, opportunityId: 'opp_itest_inorg_karen', account: 'Inorg Industries', status: 'pending', claimedAt: now, ...extra });
    await db.insert(spiffClaims).values([
        claim('claim_itest_inorg_k_pending',  ' karen inorg '),                       // her own — stored in another spelling
        claim('claim_itest_inorg_k_approved', 'Karen Inorg', { status: 'approved', approvedBy: 'Max Inorg', approvedAt: now }),
        claim('claim_itest_inorg_r_pending',  'Ravi Inorg'),
    ]);

    // ── Export and automations ──
    await db.insert(dsrQueue).values({ id: 'dsr_itest_inorg', orgId: A, subject: 'subject@inorg.example', type: 'erasure', notes: 'asked by phone', slaDeadline: new Date(now.getTime() + 30 * 86400000) });
    await db.insert(exportSchedules).values({ id: 'xsched_itest_inorg', orgId: A, name: 'Nightly accounts', scope: 'accounts', cadence: 'daily', destination: 'sftp://exports.inorg.example' });
    await db.insert(automations).values([
        { id: 'auto_itest_inorg_a', orgId: A, name: 'Won → email the VP', triggerEvent: 'deal.won', conditions: [], actions: [{ type: 'email', to: 'vp@inorg.example' }] },
        { id: 'auto_itest_inorg_b', orgId: B, name: 'B rule', triggerEvent: 'deal.won', conditions: [], actions: [] },
    ]);
    await db.insert(automationRuns).values({ id: 'arun_itest_inorg_a', orgId: A, automationId: 'auto_itest_inorg_a' });

    // ── Dispatch ──
    await db.insert(dispatchTechnicians).values([
        { id: TECH_ME,    orgId: A, firstName: 'Tess', lastName: 'Inorg', userId: WHO.tess.user },
        { id: TECH_OTHER, orgId: A, firstName: 'Otto', lastName: 'Inorg' },
        { id: TECH_B,     orgId: B, firstName: 'Bea',  lastName: 'Inorg' },
    ]);
    await db.insert(dispatchCustomers).values([
        { id: 'dcust_itest_inorg_lead',  orgId: A, name: 'Lead Co' },     // Tess leads its job
        { id: 'dcust_itest_inorg_co',    orgId: A, name: 'Co Co' },       // Tess is a co-tech on its job
        { id: 'dcust_itest_inorg_other', orgId: A, name: 'Other Co' },    // another technician's job
        { id: 'dcust_itest_inorg_none',  orgId: A, name: 'No Job Co' },   // no job at all
        { id: 'dcust_itest_inorg_b',     orgId: B, name: 'B Co' },
    ]);
    await db.insert(dispatchServiceLocations).values([
        { id: 'dloc_itest_inorg_lead',  orgId: A, customerId: 'dcust_itest_inorg_lead',  name: 'Lead site',  address: '1 Lead St',  city: 'Tulsa' },
        { id: 'dloc_itest_inorg_co',    orgId: A, customerId: 'dcust_itest_inorg_co',    name: 'Co site',    address: '2 Co St',    city: 'Tulsa' },
        { id: 'dloc_itest_inorg_other', orgId: A, customerId: 'dcust_itest_inorg_other', name: 'Other site', address: '3 Other St', city: 'Tulsa' },
    ]);
    await db.insert(dispatchJobs).values([
        { id: 'djob_itest_inorg_lead',  orgId: A, customerId: 'dcust_itest_inorg_lead',  locationId: 'dloc_itest_inorg_lead',  title: 'Lead job',  assignedTechId: TECH_ME,    coTechIds: [] },
        // jsonb TEXT, as dispatch-jobs writes it: JSON.stringify of the list.
        { id: 'djob_itest_inorg_co',    orgId: A, customerId: 'dcust_itest_inorg_co',    locationId: 'dloc_itest_inorg_co',    title: 'Co job',    assignedTechId: TECH_OTHER, coTechIds: JSON.stringify([TECH_ME]) },
        { id: 'djob_itest_inorg_other', orgId: A, customerId: 'dcust_itest_inorg_other', locationId: 'dloc_itest_inorg_other', title: 'Other job', assignedTechId: TECH_OTHER, coTechIds: JSON.stringify([]) },
    ]);
    await db.insert(dispatchJobLineItems).values([
        { id: 'dli_itest_inorg_lead',  orgId: A, jobId: 'djob_itest_inorg_lead',  description: 'Filter', unitPrice: '10', totalPrice: '10' },
        { id: 'dli_itest_inorg_other', orgId: A, jobId: 'djob_itest_inorg_other', description: 'Motor',  unitPrice: '900', totalPrice: '900' },
    ]);
    await db.insert(dispatchJobStatusHistory).values([
        { id: 'dhist_itest_inorg_co',    orgId: A, jobId: 'djob_itest_inorg_co',    toStatus: 'scheduled' },
        { id: 'dhist_itest_inorg_other', orgId: A, jobId: 'djob_itest_inorg_other', toStatus: 'scheduled' },
    ]);
    await db.insert(dispatchScheduleBlocks).values([
        { id: 'dblk_itest_inorg_me',    orgId: A, techId: TECH_ME,    startDate: '2026-10-10', endDate: '2026-10-11', title: 'Dentist' },
        { id: 'dblk_itest_inorg_other', orgId: A, techId: TECH_OTHER, startDate: '2026-10-12', endDate: '2026-10-12', title: 'Out', notes: 'medical leave' },
        { id: 'dblk_itest_inorg_b',     orgId: B, techId: TECH_B,     startDate: '2026-10-12', endDate: '2026-10-12', title: 'B leave' },
    ]);
});

after(async () => { await cleanup(); });

// ── 1. A partial PUT keeps what it does not name ─────────────────────────────

test('a partial PUT to an account changes what it names and keeps the rest — the territory too', async () => {
    const r = await call('accounts', WHO.admin, 'PUT', { id: 'acct_itest_inorg', notes: 'second notes' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await one(accounts, 'acct_itest_inorg');
    assert.equal(row.notes, 'second notes');
    assert.equal(row.name, 'Inorg Industries', 'was reset to "Unnamed Account"');
    assert.equal(row.industry, 'Manufacturing');
    assert.equal(row.city, 'Tulsa');
    assert.equal(row.phone, '555-0100');
    assert.equal(row.assignedTerritory, 'East');
    assert.equal(r.body.renamed, false, 'no rename — so no cascade over the deals and contacts');
});

test('a partial PUT to a contact changes what it names and keeps the rest', async () => {
    const r = await call('contacts', WHO.admin, 'PUT', { id: 'cont_itest_inorg', title: 'CFO' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await one(contacts, 'cont_itest_inorg');
    assert.equal(row.title, 'CFO');
    for (const [k, v] of [['firstName', 'Pat'], ['lastName', 'Inorg'], ['email', 'pat@inorg.example'], ['phone', '555-0101'], ['accountId', 'acct_itest_inorg']]) {
        assert.equal(row[k], v, k);
    }
});

test('a partial PUT to an activity keeps its linked contacts; a legacy contactId alone means that contact', async () => {
    let r = await call('activities', WHO.admin, 'PUT', { id: 'act_itest_inorg', outcome: 'Connected' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    let row = await one(activities, 'act_itest_inorg');
    assert.equal(row.outcome, 'Connected');
    assert.equal(row.notes, 'talked pricing');
    assert.equal(row.type, 'Call');
    assert.equal(row.opportunityId, 'opp_itest_inorg_karen');
    assert.deepEqual(row.contactIds, ['cont_itest_inorg', 'cont_itest_inorg_2'], 'the linked contacts were emptied');
    r = await call('activities', WHO.admin, 'PUT', { id: 'act_itest_inorg', contactId: 'cont_itest_inorg_9' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    row = await one(activities, 'act_itest_inorg');
    assert.deepEqual(row.contactIds, ['cont_itest_inorg_9'], 'the body named one contact — the stored list does not override it');
    assert.equal(row.contactId, 'cont_itest_inorg_9');
    assert.equal(row.outcome, 'Connected', 'and the rest stays');
});

// ── 2. SPIFF claims ──────────────────────────────────────────────────────────

test('a rep’s claim is filed in their roster name, pending — whatever rep, status, approval and payment the body names', async () => {
    const r = await call('spiff-claims', WHO.karen, 'POST', {
        id: 'claim_itest_inorg_new', spiffId: 'spiff_itest_inorg', spiffName: 'Q4 push', repName: 'Ravi Inorg',
        amount: 250, status: 'approved', approvedBy: 'Karen Inorg', approvedAt: '2026-10-01', paidAt: '2026-10-02',
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const row = await one(spiffClaims, 'claim_itest_inorg_new');
    assert.equal(row.repName, 'Karen Inorg', 'the caller’s roster name, not the body’s');
    assert.equal(row.status, 'pending');
    assert.equal(row.approvedBy, null);
    assert.equal(row.approvedAt, null);
    assert.equal(row.paidAt, null);
    assert.equal(Number(row.amount), 250, 'what she claims is still hers to say');
});

test('a manager files a claim for the deal’s rep, as sent', async () => {
    const r = await call('spiff-claims', WHO.manager, 'POST', { id: 'claim_itest_inorg_mgr', spiffId: 'spiff_itest_inorg', repName: 'Ravi Inorg', amount: 100 });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal((await one(spiffClaims, 'claim_itest_inorg_mgr')).repName, 'Ravi Inorg');
});

test('a rep edits only their own claim, only while pending; an unknown claim is a 404', async () => {
    const theirs = await call('spiff-claims', WHO.karen, 'PUT', { id: 'claim_itest_inorg_r_pending', note: 'mine now' });
    assert.equal(theirs.status, 403, JSON.stringify(theirs.body));
    assert.match(theirs.body.error, /only edit your own claims/);
    assert.equal((await one(spiffClaims, 'claim_itest_inorg_r_pending')).note, null, 'Ravi’s claim never changed');

    const approved = await call('spiff-claims', WHO.karen, 'PUT', { id: 'claim_itest_inorg_k_approved', note: 'after approval' });
    assert.equal(approved.status, 403, JSON.stringify(approved.body));
    assert.match(approved.body.error, /only be edited while it is pending/);
    assert.equal((await one(spiffClaims, 'claim_itest_inorg_k_approved')).note, null);

    const unknown = await call('spiff-claims', WHO.karen, 'PUT', { id: 'claim_itest_inorg_nowhere', note: 'x' });
    assert.equal(unknown.status, 404, JSON.stringify(unknown.body));
    assert.equal(await one(spiffClaims, 'claim_itest_inorg_nowhere'), undefined, 'a rep’s PUT creates nothing');
});

test('a rep’s own pending claim: what she names changes; its approval, payment and rep are not hers to set', async () => {
    const r = await call('spiff-claims', WHO.karen, 'PUT', {
        id: 'claim_itest_inorg_k_pending', note: 'more detail', status: 'pending',
        approvedBy: 'Karen Inorg', approvedAt: '2026-10-01', paidAt: '2026-10-02', repName: 'Ravi Inorg',
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const row = await one(spiffClaims, 'claim_itest_inorg_k_pending');
    assert.equal(row.note, 'more detail');
    assert.equal(row.approvedBy, null);
    assert.equal(row.approvedAt, null);
    assert.equal(row.paidAt, null);
    assert.equal(row.repName, ' karen inorg ', 'matched trimmed and in any case — and left as stored');
    assert.equal(row.status, 'pending');
    assert.equal(row.spiffName, 'Q4 push', 'the merge kept what the body did not name');
    assert.equal(Number(row.amount), 500);
});

test('a rep still cannot approve; a manager’s status change keeps the approval it does not name', async () => {
    const rep = await call('spiff-claims', WHO.karen, 'PUT', { id: 'claim_itest_inorg_k_pending', status: 'approved' });
    assert.equal(rep.status, 403, JSON.stringify(rep.body));
    assert.equal((await one(spiffClaims, 'claim_itest_inorg_k_pending')).status, 'pending');

    // Naming the claim's SPIFF and rep: built from the body alone, the approval was blanked.
    const mgr = await call('spiff-claims', WHO.manager, 'PUT', { id: 'claim_itest_inorg_k_approved', spiffId: 'spiff_itest_inorg', repName: 'Karen Inorg', status: 'paid', paidAt: '2026-10-03' });
    assert.equal(mgr.status, 200, JSON.stringify(mgr.body));
    let row = await one(spiffClaims, 'claim_itest_inorg_k_approved');
    assert.equal(row.status, 'paid');
    assert.ok(row.paidAt, 'paid when the manager said');
    assert.equal(row.approvedBy, 'Max Inorg', 'the approval stayed');
    assert.ok(row.approvedAt, 'and its date');
    assert.equal(Number(row.amount), 500);
    // Naming neither: built from the body alone, the insert's NOT NULL check failed — a 500.
    const note = await call('spiff-claims', WHO.manager, 'PUT', { id: 'claim_itest_inorg_k_approved', note: 'paid in the October run' });
    assert.equal(note.status, 200, JSON.stringify(note.body));
    row = await one(spiffClaims, 'claim_itest_inorg_k_approved');
    assert.equal(row.note, 'paid in the October run');
    assert.equal(row.status, 'paid', 'a body without a status leaves it');
    assert.equal(row.approvedBy, 'Max Inorg');
    assert.equal(row.repName, 'Karen Inorg');
});

// ── 3. Export ────────────────────────────────────────────────────────────────

test('export is an Admin’s: a rep and a Manager can neither run one nor read the runs, the schedules or the GDPR queue', async () => {
    for (const who of [WHO.karen, WHO.manager]) {
        const run = await call('export-runs', who, 'POST', { id: `xrun_itest_inorg_${who.role}`, scope: 'accounts' });
        assert.equal(run.status, 403, `${who.role} POST: ${JSON.stringify(run.body)}`);
        assert.equal(run.body.download, undefined, 'no file');
        assert.equal(await one(exportRuns, `xrun_itest_inorg_${who.role}`), undefined, 'no run recorded');
        assert.equal((await call('export-runs', who, 'GET')).status, 403, `${who.role}: the run list`);
        assert.equal((await call('export-schedules', who, 'GET')).status, 403, `${who.role}: the schedules`);
        const dsr = await call('export-dsr', who, 'GET');
        assert.equal(dsr.status, 403, `${who.role}: the GDPR queue`);
        assert.ok(!JSON.stringify(dsr.body).includes('subject@inorg.example'), `${who.role}: whose data, nowhere in the answer`);
    }
    const run = await call('export-runs', WHO.admin, 'POST', { id: 'xrun_itest_inorg_admin', scope: 'accounts' });
    assert.equal(run.status, 200, JSON.stringify(run.body));
    assert.equal(run.body.download.rowCount, 1, 'org A’s one account');
    const runs = await call('export-runs', WHO.admin, 'GET');
    assert.equal(runs.status, 200);
    assert.deepEqual(ids(runs.body.runs), ['xrun_itest_inorg_admin']);
    const sched = await call('export-schedules', WHO.admin, 'GET');
    assert.equal(sched.status, 200);
    assert.deepEqual(ids(sched.body.schedules), ['xsched_itest_inorg']);
    const dsr = await call('export-dsr', WHO.admin, 'GET');
    assert.equal(dsr.status, 200, JSON.stringify(dsr.body));
    assert.deepEqual(ids(dsr.body.dsrQueue), ['dsr_itest_inorg']);
});

// ── 4. AI scoring ────────────────────────────────────────────────────────────

test('AI scoring refuses roles that write no CRM record', async () => {
    const tech = await call('ai-score', WHO.tess, 'POST', { opportunityId: 'opp_itest_inorg_karen' });
    assert.equal(tech.status, 403, JSON.stringify(tech.body));
    const reader = await call('ai-score', WHO.reader, 'POST', { opportunityId: 'opp_itest_inorg_karen' });
    assert.equal(reader.status, 403, JSON.stringify(reader.body));
    assert.match(reader.body.error, /read-only/);
});

test('AI scoring: another rep’s deal is refused — its cached score never returned', async () => {
    const r = await call('ai-score', WHO.karen, 'POST', { opportunityId: 'opp_itest_inorg_ravi' });
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.match(r.body.error, /only modify your own or unassigned records/);
    assert.equal(r.body.score, undefined);
    assert.equal(r.body.headline, undefined);
});

test('AI scoring: her own deal, an unassigned deal, and a Manager on any deal pass the gates — to the key check', async () => {
    for (const [who, opp] of [[WHO.karen, 'opp_itest_inorg_karen'], [WHO.karen, 'opp_itest_inorg_open'], [WHO.manager, 'opp_itest_inorg_ravi']]) {
        const r = await call('ai-score', who, 'POST', { opportunityId: opp });
        assert.equal(r.status, 503, `${who.role} → ${opp}: ${JSON.stringify(r.body)}`);
        assert.match(r.body.error, /No Anthropic API key configured/);
    }
    assert.equal((await call('ai-score', WHO.karen, 'POST', { opportunityId: 'opp_itest_inorg_missing' })).status, 404);
});

// ── 5. The Slack webhook ─────────────────────────────────────────────────────

test('settings: the Slack webhook URL reaches only an Admin; the rest of the config reaches everyone', async () => {
    for (const who of [WHO.karen, WHO.manager, WHO.reader]) {
        const r = await call('settings', who, 'GET');
        assert.equal(r.status, 200, JSON.stringify(r.body));
        const cfg = r.body.settings.slackConfig;
        assert.equal('webhookUrl' in cfg, false, `${who.role} reads no webhook URL`);
        assert.equal(cfg.channel, '#wins');
        assert.equal(cfg.enabled, true);
        assert.ok(!JSON.stringify(r.body).includes('secretpart'), `${who.role}: the URL is nowhere in the response`);
    }
    const admin = await call('settings', WHO.admin, 'GET');
    assert.equal(admin.body.settings.slackConfig.webhookUrl, SLACK_URL);
});

// ── 6. Automations ───────────────────────────────────────────────────────────

test('automations: read by Admin and Manager alone — the rules and the runs', async () => {
    for (const who of [WHO.karen, WHO.reader, WHO.tess]) {
        assert.equal((await call('automations', who, 'GET')).status, 403, `${who.role}: the rules`);
        assert.equal((await call('automations', who, 'GET', undefined, { runs: 'auto_itest_inorg_a' })).status, 403, `${who.role}: the runs`);
    }
    for (const who of [WHO.admin, WHO.manager]) {
        const r = await call('automations', who, 'GET');
        assert.equal(r.status, 200, JSON.stringify(r.body));
        assert.deepEqual(ids(r.body.automations), ['auto_itest_inorg_a'], 'org A’s rule, never B’s');
        const runs = await call('automations', who, 'GET', undefined, { runs: 'auto_itest_inorg_a' });
        assert.deepEqual(ids(runs.body.runs), ['arun_itest_inorg_a']);
    }
});

// ── 7. A Technician ──────────────────────────────────────────────────────────

test('a Technician reads the customers and locations of their own jobs — lead or co-tech — and no others', async () => {
    const custs = await call('dispatch-customers', WHO.tess, 'GET');
    assert.equal(custs.status, 200, JSON.stringify(custs.body));
    assert.deepEqual(ids(custs.body.customers), ['dcust_itest_inorg_co', 'dcust_itest_inorg_lead'], 'the co-tech job’s customer counts');
    const locs = await call('dispatch-customers', WHO.tess, 'GET', undefined, { resource: 'locations' });
    assert.equal(locs.status, 200, JSON.stringify(locs.body));
    assert.deepEqual(ids(locs.body.locations), ['dloc_itest_inorg_co', 'dloc_itest_inorg_lead']);
    const named = await call('dispatch-customers', WHO.tess, 'GET', undefined, { resource: 'locations', customerId: 'dcust_itest_inorg_other' });
    assert.deepEqual(named.body.locations, [], 'naming another job’s customer reads nothing');
    // The control: an Admin reads the org's — and only the org's.
    const all = await call('dispatch-customers', WHO.admin, 'GET');
    assert.deepEqual(ids(all.body.customers), ['dcust_itest_inorg_co', 'dcust_itest_inorg_lead', 'dcust_itest_inorg_none', 'dcust_itest_inorg_other']);
});

test('a Technician with no technician record reads no customers', async () => {
    const r = await call('dispatch-customers', WHO.nobody, 'GET');
    assert.equal(r.status, 403, JSON.stringify(r.body));
    assert.match(r.body.error, /No technician record/);
});

test('a Technician reads line items and history only for a job they are on; their list holds their co-tech job', async () => {
    const items = await call('dispatch-jobs', WHO.tess, 'GET', undefined, { resource: 'lineitems', jobId: 'djob_itest_inorg_lead' });
    assert.equal(items.status, 200, JSON.stringify(items.body));
    const other = await call('dispatch-jobs', WHO.tess, 'GET', undefined, { resource: 'lineitems', jobId: 'djob_itest_inorg_other' });
    assert.equal(other.status, 404, JSON.stringify(other.body));
    assert.ok(!JSON.stringify(other.body).includes('Motor'));
    const hist = await call('dispatch-jobs', WHO.tess, 'GET', undefined, { resource: 'history', jobId: 'djob_itest_inorg_co' });
    assert.equal(hist.status, 200, `a co-tech, the list stored as text: ${JSON.stringify(hist.body)}`);
    const otherHist = await call('dispatch-jobs', WHO.tess, 'GET', undefined, { resource: 'history', jobId: 'djob_itest_inorg_other' });
    assert.equal(otherHist.status, 404, JSON.stringify(otherHist.body));
    const list = await call('dispatch-jobs', WHO.tess, 'GET');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.deepEqual(ids(list.body.jobs), ['djob_itest_inorg_co', 'djob_itest_inorg_lead'], 'the co-tech job was missing from her list');
    // The control: an Admin reads any job's.
    assert.equal((await call('dispatch-jobs', WHO.admin, 'GET', undefined, { resource: 'lineitems', jobId: 'djob_itest_inorg_other' })).status, 200);
});

test('a Technician reads their own time off — naming another technician reads nothing', async () => {
    const mine = await call('dispatch-schedule-blocks', WHO.tess, 'GET');
    assert.equal(mine.status, 200, JSON.stringify(mine.body));
    assert.deepEqual(ids(mine.body.blocks), ['dblk_itest_inorg_me']);
    const named = await call('dispatch-schedule-blocks', WHO.tess, 'GET', undefined, { techId: TECH_OTHER });
    assert.deepEqual(named.body.blocks, []);
    assert.ok(!JSON.stringify(named.body).includes('medical leave'));
    assert.equal((await call('dispatch-schedule-blocks', WHO.nobody, 'GET')).status, 403);
    const all = await call('dispatch-schedule-blocks', WHO.admin, 'GET');
    assert.deepEqual(ids(all.body.blocks), ['dblk_itest_inorg_me', 'dblk_itest_inorg_other'], 'org A’s — never B’s');
});
