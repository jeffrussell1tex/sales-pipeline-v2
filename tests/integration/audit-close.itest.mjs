// tests/integration/audit-close.itest.mjs
// Finishing the cross-org audit's list (state §0.172 — Jeff: "go with your
// recommendation"), against the real test database:
//   - the mention text is the server's: sent to the record's OWNER by id (a
//     namesake gets nothing), signed with the caller's roster name, worded from
//     the stored record, refused to a read-only member and to a member who could
//     not have saved the record, never answering with a phone number;
//   - the public API's activities and tasks carry their own columns, and the
//     activities `rep` filter works;
//   - the duplicate scan is an Admin's or a Manager's; the on-create probe looks
//     only where the caller may read; a Technician is refused;
//   - a Technician reads only the vehicles, equipment, service plans and plan
//     visits their jobs reach — and one with no technician row, nothing;
//   - a finished visit's status link expires; a malformed one is a 404, not a crash;
//   - a job's createdBy is the caller's and survives a re-POST; no body sets it;
//   - an automation's update_field on a task event writes the task's deal.
// Org B's rows reach no one in A.
//
// The auth mock fakes the SIGN-IN only (in-org.itest.mjs's pattern); the senders
// are stand-ins that record. Every handler, gate and query is the real one.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const roles = await import('../../src/utils/roles.js');
const roleGate = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            const userId = event.headers?.['x-test-user'] || `clerk_itest_aclose_${userRole}_${orgId}`;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: roleGate.requireWrite, requireRole: roleGate.requireRole,
    },
});
// The senders record what they are handed; the templates say what they were given.
const texts = [];
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: {
        sendSms: async (msg) => { texts.push(msg); return { success: true }; },
        normalizePhone: (p) => (p ? String(p) : null),
        smsTemplates: {
            dealAssigned:  (d) => `ASSIGNED ${JSON.stringify(d)}`,
            stageChanged:  (d) => `MOVED ${JSON.stringify(d)}`,
            dealClosedWon: (d) => `WON ${JSON.stringify(d)}`,
            taskReminder:  () => 'REMINDER',
        },
    },
});
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: new Proxy({}, { get: () => () => ({ subject: '', html: '' }) }) },
});
mock.module(new URL('../../netlify/functions/send-slack.mjs', import.meta.url).href, {
    namedExports: {
        sendSlack: async () => true, sendSlackToOrg: async () => true,
        postDealEvents: async () => {}, postBulkStageMove: async () => {},
        slackTemplates: new Proxy({}, { get: () => () => ({ text: '' }) }),
    },
});

const FN = {};
for (const name of ['mention-sms', 'public-api', 'duplicates', 'dispatch-equipment', 'dispatch-vehicles', 'dispatch-service-plans',
                    'dispatch-plan-visits', 'dispatch-status', 'dispatch-jobs']) {
    FN[name] = (await import(`../../netlify/functions/${name}.mjs`)).handler;
}
const { dispatchAutomations } = await import('../../netlify/functions/dispatch-automations.mjs');
const { taskEventData } = await import('../../src/utils/automationEvents.js');
const { db } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');
const { settings, users, opportunities, tasks, activities, accounts, contacts, apiKeys, automations, automationRuns,
        dispatchTechnicians, dispatchCustomers, dispatchJobs, dispatchJobStatusHistory, dispatchVehicles, dispatchEquipment,
        dispatchServicePlans, dispatchPlanVisits, auditLog } = schema;
const { eq, inArray } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// ORG NAMESPACE: this file owns 'itest_aclose_*'.
const A = 'itest_aclose_A';
const B = 'itest_aclose_B';
const ORGS = [A, B];

const WHO = {
    admin:  { user: 'clerk_itest_aclose_admin',  role: 'Admin' },
    pat:    { user: 'clerk_itest_aclose_pat',    role: 'User' },
    twin:   { user: 'clerk_itest_aclose_twin',   role: 'User' },   // another "Pat Close"
    reader: { user: 'clerk_itest_aclose_reader', role: 'ReadOnly' },
    tess:   { user: 'clerk_itest_aclose_tess',   role: 'Technician' },
    nobody: { user: 'clerk_itest_aclose_nobody', role: 'Technician' },   // no technician row
};
const call = async (name, who, method, body, qs, extraHeaders = {}) => {
    const res = await FN[name]({
        httpMethod: method,
        headers: { 'x-test-org': A, 'x-test-role': who.role, 'x-test-user': who.user, 'content-type': 'application/json', ...extraHeaders },
        body: body === undefined ? undefined : JSON.stringify(body),
        queryStringParameters: qs || {},
    });
    let parsed = {};
    try { parsed = JSON.parse(res.body || '{}'); } catch { /* HTML */ }
    return { status: res.statusCode, body: parsed, raw: res.body };
};
const ids = (rows) => (rows || []).map((r) => r.id).sort();

const API_KEY = 'spt_live_' + 'ab'.repeat(32);
const TECH_ME = 'dtech_itest_aclose_me', TECH_OTHER = 'dtech_itest_aclose_other';
const DAY = 86400000;

const cleanup = async () => {
    for (const t of [automationRuns, automations, dispatchJobStatusHistory, dispatchPlanVisits, dispatchServicePlans, dispatchEquipment,
                     dispatchVehicles, dispatchJobs, dispatchCustomers, dispatchTechnicians, apiKeys, activities, tasks, contacts,
                     accounts, opportunities, users, auditLog, settings]) {
        await db.delete(t).where(inArray(t.orgId, ORGS));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    const now = new Date();
    await db.insert(settings).values([
        { id: A, orgId: A, extra: { dispatchEnabled: true } },
        { id: B, orgId: B, extra: { dispatchEnabled: true } },
    ]);
    const sms = { enabled: true, mentions: true };
    await db.insert(users).values([
        { id: 'usr_itest_aclose_admin',  orgId: A, clerkUserId: WHO.admin.user,  name: 'Ada Close', email: 'ada@itest-aclose.local',  role: 'Admin' },
        // The deal's owner, RENAMED since the deal and the task were written — they
        // still say "Pat Close", the name the twin bears. A lookup by the name on
        // the record can find only the twin, whatever order the rows come back in.
        { id: 'usr_itest_aclose_pat',    orgId: A, clerkUserId: WHO.pat.user,    name: 'Patricia Close', email: 'pat@itest-aclose.local',  role: 'User', profile: { smsNotifications: sms, mobile: '+15550000001' } },
        { id: 'usr_itest_aclose_twin',   orgId: A, clerkUserId: WHO.twin.user,   name: 'Pat Close', email: 'twin@itest-aclose.local', role: 'User', profile: { smsNotifications: sms, mobile: '+15550000002' } },
        { id: 'usr_itest_aclose_reader', orgId: A, clerkUserId: WHO.reader.user, name: 'Rea Close', email: 'rea@itest-aclose.local',  role: 'ReadOnly' },
        { id: 'usr_itest_aclose_tess',   orgId: A, clerkUserId: WHO.tess.user,   name: 'Tess Close', email: 'tess@itest-aclose.local', role: 'Technician' },
        { id: 'usr_itest_aclose_b',      orgId: B, clerkUserId: 'clerk_itest_aclose_b', name: 'Bee Close', email: 'bee@itest-aclose.local', role: 'Admin' },
    ]);
    await db.insert(opportunities).values([
        { id: 'opp_itest_aclose_pat', orgId: A, pipelineId: 'default', stage: 'Proposal', opportunityName: 'Pat Renewal', account: 'Close Co',
          arr: '5000', salesRep: 'Pat Close', ownerId: 'usr_itest_aclose_pat',
          stageHistory: [{ stage: 'Proposal', prevStage: 'Discovery', date: '2026-10-01' }] },
        { id: 'opp_itest_aclose_twin', orgId: A, pipelineId: 'default', stage: 'Closed Won', opportunityName: 'Twin Win', salesRep: 'Pat Close', ownerId: 'usr_itest_aclose_twin' },
        // Unassigned: ownership lets any member save it, so only the role gate
        // refuses a read-only member.
        { id: 'opp_itest_aclose_free', orgId: A, pipelineId: 'default', stage: 'Proposal', opportunityName: 'Open Deal', ownerId: null,
          stageHistory: [{ stage: 'Proposal', prevStage: 'Discovery', date: '2026-10-01' }] },
        // Its last recorded move is into Proposal; it is in Negotiation now.
        { id: 'opp_itest_aclose_stale', orgId: A, pipelineId: 'default', stage: 'Negotiation', opportunityName: 'Stale Move', salesRep: 'Pat Close', ownerId: 'usr_itest_aclose_pat',
          stageHistory: [{ stage: 'Proposal', prevStage: 'Discovery', date: '2026-09-01' }] },
        { id: 'opp_itest_aclose_b', orgId: B, pipelineId: 'default', stage: 'Proposal', opportunityName: 'B Deal', ownerId: 'usr_itest_aclose_b' },
    ]);
    await db.insert(tasks).values([
        { id: 'task_itest_aclose_pat', orgId: A, title: 'Call the buyer', description: 'Bring the quote', assignedTo: 'Pat Close', ownerId: 'usr_itest_aclose_pat',
          accountId: 'acct_itest_aclose_pat', status: 'Open', completedDate: '2026-10-03', dueDate: '2026-10-04', dueTime: '09:00' },
    ]);
    await db.insert(activities).values([
        { id: 'act_itest_aclose_1', orgId: A, type: 'Call', date: '2026-10-01', subject: 'Intro', notes: 'talked pricing', author: 'Pat Close',
          accountId: 'acct_itest_aclose_pat', duration: 15, outcome: 'good', leadId: null },
        { id: 'act_itest_aclose_2', orgId: A, type: 'Email', date: '2026-10-02', subject: 'Follow', notes: 'sent', author: 'Ada Close' },
    ]);
    await db.insert(apiKeys).values({ id: 'key_itest_aclose', orgId: A, name: 'itest', keyHash: createHash('sha256').update(API_KEY).digest('hex'), keyPrefix: 'spt_live_abab' });
    await db.insert(accounts).values([
        { id: 'acct_itest_aclose_pat',  orgId: A, name: 'Close Co',          ownerId: 'usr_itest_aclose_pat' },
        { id: 'acct_itest_aclose_twin', orgId: A, name: 'Hidden Holdings',   ownerId: 'usr_itest_aclose_twin' },
        { id: 'acct_itest_aclose_free', orgId: A, name: 'Open Field Supply', ownerId: null },
        { id: 'acct_itest_aclose_b',    orgId: B, name: 'Hidden Holdings',   ownerId: 'usr_itest_aclose_b' },
    ]);
    await db.insert(contacts).values([
        { id: 'cont_itest_aclose_twin', orgId: A, firstName: 'Quinn', lastName: 'Secret', email: 'quinn@hidden.example', ownerId: 'usr_itest_aclose_twin' },
    ]);

    // ── Dispatch: Tess's job carries a vehicle, a reserved unit (as JSON text, the
    // way dispatch-jobs writes it), a KIND of equipment it needs and a plan;
    // another tech's job carries others.
    await db.insert(dispatchTechnicians).values([
        { id: TECH_ME,    orgId: A, firstName: 'Tess', lastName: 'Close', userId: WHO.tess.user },
        { id: TECH_OTHER, orgId: A, firstName: 'Otto', lastName: 'Close' },
    ]);
    await db.insert(dispatchCustomers).values([
        { id: 'dcust_itest_aclose_me',    orgId: A, name: 'Tess Customer' },
        { id: 'dcust_itest_aclose_other', orgId: A, name: 'Other Customer' },
    ]);
    await db.insert(dispatchServicePlans).values([
        { id: 'plan_itest_aclose_me',    orgId: A, name: 'Gold' },
        { id: 'plan_itest_aclose_other', orgId: A, name: 'Platinum' },
    ]);
    await db.insert(dispatchJobs).values([
        { id: 'djob_itest_aclose_me', orgId: A, customerId: 'dcust_itest_aclose_me', title: 'Tess job', assignedTechId: TECH_ME, coTechIds: [],
          assignedVehicleId: 'veh_itest_aclose_job', equipmentIds: JSON.stringify(['Lift', 'eq_itest_aclose_legacy']),
          assignedEquipmentIds: JSON.stringify(['eq_itest_aclose_reserved']), servicePlanId: 'plan_itest_aclose_me', status: 'scheduled' },
        { id: 'djob_itest_aclose_other', orgId: A, customerId: 'dcust_itest_aclose_other', title: 'Other job', assignedTechId: TECH_OTHER, coTechIds: [],
          assignedVehicleId: 'veh_itest_aclose_other', assignedEquipmentIds: JSON.stringify(['eq_itest_aclose_other']), servicePlanId: 'plan_itest_aclose_other', status: 'scheduled' },
        // Status links: finished three weeks ago, two days ago, and an open visit.
        { id: 'djob_itest_aclose_old', orgId: A, customerId: 'dcust_itest_aclose_other', title: 'Old visit', status: 'completed',
          actualEnd: new Date(now.getTime() - 21 * DAY), publicToken: 'itestAcloseOldToken0123456789abcd' },
        { id: 'djob_itest_aclose_new', orgId: A, customerId: 'dcust_itest_aclose_other', title: 'Recent visit', status: 'completed',
          actualEnd: new Date(now.getTime() - 2 * DAY), publicToken: 'itestAcloseNewToken0123456789abcd' },
        { id: 'djob_itest_aclose_open', orgId: A, customerId: 'dcust_itest_aclose_other', title: 'Open visit', status: 'scheduled',
          publicToken: 'itestAcloseOpenToken123456789abcd', updatedAt: new Date(now.getTime() - 30 * DAY) },
    ]);
    await db.insert(dispatchVehicles).values([
        { id: 'veh_itest_aclose_mine',  orgId: A, name: 'Tess van', type: 'van', assignedTechId: TECH_ME },
        { id: 'veh_itest_aclose_job',   orgId: A, name: 'Job truck', type: 'truck' },
        { id: 'veh_itest_aclose_other', orgId: A, name: 'Other truck', type: 'truck', assignedTechId: TECH_OTHER },
    ]);
    await db.insert(dispatchEquipment).values([
        { id: 'eq_itest_aclose_out_me',   orgId: A, name: 'Meter', checkedOutToId: TECH_ME, status: 'checked_out' },
        { id: 'eq_itest_aclose_out_job',  orgId: A, name: 'Ladder', checkedOutJobId: 'djob_itest_aclose_me', status: 'checked_out' },
        { id: 'eq_itest_aclose_kind',     orgId: A, name: 'Lift 2', category: 'Lift' },
        { id: 'eq_itest_aclose_legacy',   orgId: A, name: 'Old unit' },
        { id: 'eq_itest_aclose_reserved', orgId: A, name: 'Camera' },
        { id: 'eq_itest_aclose_other',    orgId: A, name: 'Other tool' },
    ]);
    await db.insert(dispatchPlanVisits).values([
        { id: 'pv_itest_aclose_me',    orgId: A, customerId: 'dcust_itest_aclose_me',    planId: 'plan_itest_aclose_me',    dueDate: '2026-11-01', action: 'skipped' },
        { id: 'pv_itest_aclose_other', orgId: A, customerId: 'dcust_itest_aclose_other', planId: 'plan_itest_aclose_other', dueDate: '2026-11-01', action: 'skipped' },
    ]);
    await db.insert(automations).values({
        id: 'auto_itest_aclose_task', orgId: A, name: 'Task done → Commit', triggerEvent: 'task.completed', conditions: [],
        actions: [{ type: 'update_field', params: { entity: 'opportunity', field: 'forecastCategory', value: 'Commit' } }], active: true, runCount: 0,
    });
});
after(cleanup);

// ── the mention text ─────────────────────────────────────────────────────────

test('the mention text goes to the record\'s OWNER by id — not their namesake — worded from the record, signed by the caller', async () => {
    texts.length = 0;
    const r = await call('mention-sms', WHO.admin, 'POST', { type: 'dealAssigned', recordId: 'opp_itest_aclose_pat' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.success, true);
    assert.ok(!('to' in r.body) && !r.raw.includes('+1555'), 'the answer carries no phone number');
    assert.equal(texts.length, 1);
    assert.equal(texts[0].to, '+15550000001', 'the deal\'s owner, by id — not the member who bears the name the deal carries');
    const sent = JSON.parse(texts[0].body.replace(/^ASSIGNED /, ''));
    assert.deepEqual(sent, { repName: 'Patricia Close', dealName: 'Pat Renewal', account: 'Close Co', assignedBy: 'Ada Close' }, 'every word the server\'s — the owner\'s roster name');
});

test('the mention text: a stage change is the deal\'s own last move; a win must be a won deal; a task goes to its owner', async () => {
    texts.length = 0;
    const moved = await call('mention-sms', WHO.admin, 'POST', { type: 'stageChanged', recordId: 'opp_itest_aclose_pat' });
    assert.equal(moved.status, 200);
    assert.deepEqual(JSON.parse(texts[0].body.replace(/^MOVED /, '')), { dealName: 'Pat Renewal', fromStage: 'Discovery', toStage: 'Proposal', changedBy: 'Ada Close' });
    const notWon = await call('mention-sms', WHO.admin, 'POST', { type: 'dealClosedWon', recordId: 'opp_itest_aclose_pat' });
    assert.equal(notWon.body.skipped, 'not_won', 'a deal in Proposal is no win to announce');
    const stale = await call('mention-sms', WHO.admin, 'POST', { type: 'stageChanged', recordId: 'opp_itest_aclose_stale' });
    assert.equal(stale.body.skipped, 'no_stage_change', 'its last recorded move is not into the stage it is in');
    const task = await call('mention-sms', WHO.pat, 'POST', { type: 'taskAssigned', recordId: 'task_itest_aclose_pat' });
    assert.equal(task.status, 200);
    assert.equal(texts.at(-1).to, '+15550000001');
    assert.ok(texts.at(-1).body.includes('Patricia Close assigned you a task — "Call the buyer"'), 'signed with the caller\'s roster name, the stored title');
    assert.equal(texts.length, 2);
});

test('the mention text is refused to a read-only member, to one who could not have saved the record, and for another org\'s record', async () => {
    texts.length = 0;
    assert.equal((await call('mention-sms', WHO.reader, 'POST', { type: 'dealAssigned', recordId: 'opp_itest_aclose_pat' })).status, 403);
    assert.equal((await call('mention-sms', WHO.reader, 'POST', { type: 'dealAssigned', recordId: 'opp_itest_aclose_free' })).status, 403,
        'refused by role — an unassigned deal is one ownership lets anyone save');
    const free = await call('mention-sms', WHO.admin, 'POST', { type: 'dealAssigned', recordId: 'opp_itest_aclose_free' });
    assert.equal(free.body.skipped, 'unassigned', 'an unassigned deal texts no one');
    assert.equal((await call('mention-sms', WHO.twin, 'POST', { type: 'dealAssigned', recordId: 'opp_itest_aclose_pat' })).status, 403, 'not their deal');
    assert.equal((await call('mention-sms', WHO.admin, 'POST', { type: 'dealAssigned', recordId: 'opp_itest_aclose_b' })).status, 404, 'org B\'s deal');
    assert.equal((await call('mention-sms', WHO.admin, 'POST', { type: 'nonsense', recordId: 'opp_itest_aclose_pat' })).status, 400);
    assert.equal(texts.length, 0, 'nothing sent');
});

// ── the public API ───────────────────────────────────────────────────────────

test('the public API: activities and tasks carry their own columns, and the activities rep filter works', async () => {
    const api = (qs) => FN['public-api']({ httpMethod: 'GET', headers: { authorization: 'Bearer ' + API_KEY }, queryStringParameters: qs });
    const acts = await api({ resource: 'activities' });
    assert.equal(acts.statusCode, 200, acts.body);
    const a1 = JSON.parse(acts.body).data.find((a) => a.id === 'act_itest_aclose_1');
    assert.equal(a1.notes, 'talked pricing');
    assert.equal(a1.rep, 'Pat Close');
    assert.equal(a1.account_id, 'acct_itest_aclose_pat');
    assert.equal(a1.duration_minutes, 15);
    const byRep = await api({ resource: 'activities', rep: 'Pat Close' });
    assert.equal(byRep.statusCode, 200, 'the filter ran on a column that does not exist');
    assert.deepEqual(JSON.parse(byRep.body).data.map((a) => a.id), ['act_itest_aclose_1']);
    const t = JSON.parse((await api({ resource: 'tasks' })).body).data.find((x) => x.id === 'task_itest_aclose_pat');
    assert.equal(t.description, 'Bring the quote');
    assert.equal(t.account_id, 'acct_itest_aclose_pat');
    assert.equal(t.completed_date, '2026-10-03');
    assert.equal(t.due_time, '09:00');
});

// ── duplicates ───────────────────────────────────────────────────────────────

test('duplicates: the scan is an Admin\'s or a Manager\'s; the on-create probe looks only where the caller may read', async () => {
    assert.equal((await call('duplicates', WHO.pat, 'GET', undefined, {})).status, 403, 'a rep runs no org-wide scan');
    assert.equal((await call('duplicates', WHO.admin, 'GET', undefined, {})).status, 200);
    const probe = (who) => call('duplicates', who, 'GET', undefined, { mode: 'create', name: 'Hidden Holdings' });
    const asPat = await probe(WHO.pat);
    assert.equal(asPat.status, 200);
    assert.deepEqual(asPat.body.duplicates, [], 'another rep\'s account is not shown to Pat');
    const asAdmin = await probe(WHO.admin);
    assert.deepEqual(asAdmin.body.duplicates.map((d) => d.id), ['acct_itest_aclose_twin'], 'the Admin sees it — and nothing of org B');
    const contact = await call('duplicates', WHO.pat, 'GET', undefined, { entityType: 'contact', mode: 'create', firstName: 'Quinn', lastName: 'Secret', email: 'quinn@hidden.example' });
    assert.deepEqual([...contact.body.duplicates, ...contact.body.related], [], 'nor another rep\'s contact');
    assert.equal((await probe(WHO.tess)).status, 403, 'a Technician reads no CRM record');
});

// ── a Technician's dispatch reads ────────────────────────────────────────────

test('a Technician reads only the vehicles, equipment, plans and plan visits their own jobs reach; an Admin reads them all', async () => {
    const vehicles = await call('dispatch-vehicles', WHO.tess, 'GET');
    assert.equal(vehicles.status, 200);
    assert.deepEqual(ids(vehicles.body.vehicles), ['veh_itest_aclose_job', 'veh_itest_aclose_mine']);
    const equipment = await call('dispatch-equipment', WHO.tess, 'GET');
    assert.deepEqual(ids(equipment.body.equipment), ['eq_itest_aclose_out_job', 'eq_itest_aclose_out_me', 'eq_itest_aclose_reserved'],
        'checked out to them or to their job, or reserved for it — the reservation stored as JSON text reads too; a unit of a KIND the job needs is not theirs, nor one an old requirement names');
    const plans = await call('dispatch-service-plans', WHO.tess, 'GET');
    assert.deepEqual(ids(plans.body.plans), ['plan_itest_aclose_me']);
    const visits = await call('dispatch-plan-visits', WHO.tess, 'GET');
    assert.deepEqual(ids(visits.body.visits), ['pv_itest_aclose_me']);

    assert.equal((await call('dispatch-vehicles', WHO.admin, 'GET')).body.vehicles.length, 3);
    assert.equal((await call('dispatch-equipment', WHO.admin, 'GET')).body.equipment.length, 6);
    assert.equal((await call('dispatch-service-plans', WHO.admin, 'GET')).body.plans.length, 2);
    assert.equal((await call('dispatch-plan-visits', WHO.admin, 'GET')).body.visits.length, 2);
    for (const fn of ['dispatch-vehicles', 'dispatch-equipment', 'dispatch-service-plans', 'dispatch-plan-visits']) {
        assert.equal((await call(fn, WHO.nobody, 'GET')).status, 403, `${fn}: no technician row, nothing`);
    }
});

// ── the customer's status link ───────────────────────────────────────────────

test('a finished visit\'s status link expires two weeks after it finished; an open one answers; a malformed one is a 404', async () => {
    const page = (path) => FN['dispatch-status']({ httpMethod: 'GET', path, queryStringParameters: {} });
    assert.equal((await page('/status/itestAcloseOldToken0123456789abcd')).statusCode, 404, 'three weeks after it was completed');
    assert.equal((await page('/status/itestAcloseNewToken0123456789abcd')).statusCode, 200);
    assert.equal((await page('/status/itestAcloseOpenToken123456789abcd')).statusCode, 200, 'an open visit, untouched for a month, keeps its link');
    const bad = await page('/status/%E0%A4%A');
    assert.equal(bad.statusCode, 404, 'a malformed % sequence threw outside the try');
});

// ── a job's attribution ──────────────────────────────────────────────────────

test('a job\'s createdBy is the caller\'s and survives a re-POST; no body sets createdBy or dispatchedBy', async () => {
    const job = { id: 'djob_itest_aclose_new1', customerId: 'dcust_itest_aclose_me', title: 'Fresh', createdBy: 'usr_forged', dispatchedBy: 'usr_forged' };
    assert.equal((await call('dispatch-jobs', WHO.admin, 'POST', job)).status, 201);
    const [first] = await db.select().from(dispatchJobs).where(eq(dispatchJobs.id, job.id));
    assert.equal(first.createdBy, WHO.admin.user, 'the caller, not the body');
    assert.equal(first.dispatchedBy, null);
    const other = { ...WHO.admin, user: 'clerk_itest_aclose_admin2' };
    await call('dispatch-jobs', other, 'POST', { ...job, title: 'Fresh again' });
    const [again] = await db.select().from(dispatchJobs).where(eq(dispatchJobs.id, job.id));
    assert.equal(again.title, 'Fresh again');
    assert.equal(again.createdBy, WHO.admin.user, 'a re-POST keeps who created it');
    await call('dispatch-jobs', WHO.admin, 'PUT', { createdBy: 'usr_forged', dispatchedBy: 'usr_forged', title: 'Edited' }, { id: job.id });
    const [edited] = await db.select().from(dispatchJobs).where(eq(dispatchJobs.id, job.id));
    assert.equal(edited.title, 'Edited');
    assert.equal(edited.createdBy, WHO.admin.user);
    assert.equal(edited.dispatchedBy, null);
});

// ── an automation's update_field ─────────────────────────────────────────────

test('update_field on a task event writes the task\'s deal; a task with no deal is a skipped action, not an ok one', async () => {
    await dispatchAutomations(A, 'task.completed', taskEventData({ id: 'task_itest_aclose_x', title: 'Done', opportunityId: 'opp_itest_aclose_pat' }));
    const [deal] = await db.select().from(opportunities).where(eq(opportunities.id, 'opp_itest_aclose_pat'));
    assert.equal(deal.forecastCategory, 'Commit', 'the task\'s deal — the action wrote a deal with the TASK\'s id, i.e. none');
    await dispatchAutomations(A, 'task.completed', taskEventData({ id: 'task_itest_aclose_y', title: 'No deal' }));
    const runs = await db.select().from(automationRuns).where(eq(automationRuns.orgId, A));
    const lone = runs.find((r) => r.triggeredBy === 'task_itest_aclose_y');
    assert.equal(lone.actionsExecuted, 0);
    assert.match(lone.error || '', /update_field: skipped — no deal on this event/);
    await dispatchAutomations(A, 'task.completed', taskEventData({ id: 'task_itest_aclose_z', title: 'Another org\'s deal', opportunityId: 'opp_itest_aclose_b' }));
    const [bDeal] = await db.select().from(opportunities).where(eq(opportunities.id, 'opp_itest_aclose_b'));
    assert.notEqual(bDeal.forecastCategory, 'Commit', 'org B\'s deal is untouched');
    const crossed = (await db.select().from(automationRuns).where(eq(automationRuns.orgId, A))).find((r) => r.triggeredBy === 'task_itest_aclose_z');
    assert.equal(crossed.actionsExecuted, 0, 'no row written is not ok');
    assert.match(crossed.error || '', /update_field: skipped — the deal is not in this workspace/);
});
