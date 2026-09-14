// tests/integration/dispatch-automations.itest.mjs
// The rules engine against the real (test) database — state §0.124. What the
// unit scans cannot prove: a rule in org A fires for A's event and creates a
// task IN A, owned by A's "Karen Rep" (not B's user of the same name); B's
// rule on the same trigger never runs; a condition mismatch is a skipped run;
// update_field cannot move a deal to another org; an unknown trigger fires
// nothing; the run counter moves in A alone.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST — see TESTING.md)

if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database. See TESTING.md.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

// The engine imports the mailer; stub it so the suite makes no outbound calls
// and so a send_email action can be observed.
const sent = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async (msg) => { sent.push(msg); },
        emailTemplates: new Proxy({}, { get: () => () => ({ subject: '', html: '' }) }),
    },
});
// The engine posts to Slack through the org-aware sender (§0.127); stub it too.
// The Block Kit template (§0.132) is the real pure helper, wrapped as the real
// module wraps it — so the shape the engine hands the sender is the real shape.
const slackPosts = [];
const { automationSlackMessage } = await import('../../src/utils/automationEvents.js');
mock.module(new URL('../../netlify/functions/send-slack.mjs', import.meta.url).href, {
    namedExports: {
        sendSlackToOrg: async (orgId, msg, alertType) => { slackPosts.push({ orgId, msg, alertType }); return true; },
        slackTemplates: { automation: (p) => automationSlackMessage({ ...p, appUrl: 'https://itest.local' }) },
    },
});

const { dispatchAutomations } = await import('../../netlify/functions/dispatch-automations.mjs');
const { dealEventData } = await import('../../src/utils/automationEvents.js');
const { isoLocal } = await import('../../src/utils/dateLocal.js');
const { db } = await import('../../db/index.js');
const { automations, automationRuns, tasks, users, opportunities } = await import('../../db/schema.js');
const { eq, and } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_auto_*' and ONLY this file writes to it (guide §18b25).
const A = 'itest_auto_A', B = 'itest_auto_B';
const KAREN_A = 'usr_itest_auto_karen_a', KAREN_B = 'usr_itest_auto_karen_b';
const OPP_A = 'opp_itest_auto_1';

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(tasks).where(eq(tasks.orgId, o));
        await db.delete(automationRuns).where(eq(automationRuns.orgId, o));
        await db.delete(automations).where(eq(automations.orgId, o));
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
    invalidateRoster(A); invalidateRoster(B);
};

const tasksIn   = (org) => db.select().from(tasks).where(eq(tasks.orgId, org));
const runsFor   = (org, ruleId) => db.select().from(automationRuns).where(and(eq(automationRuns.orgId, org), eq(automationRuns.automationId, ruleId)));
const ruleRow   = (id) => db.select().from(automations).where(eq(automations.id, id)).then(r => r[0]);
const oppRow    = () => db.select().from(opportunities).where(eq(opportunities.id, OPP_A)).then(r => r[0]);

before(async () => {
    await cleanup();
    // The same display name in both orgs: the assignee must resolve in THE
    // EVENT'S org, never across.
    await db.insert(users).values([
        { id: KAREN_A, clerkUserId: 'clerk_' + KAREN_A, name: 'Karen Rep', email: 'karen-a@itest.local', role: 'User', orgId: A },
        { id: KAREN_B, clerkUserId: 'clerk_' + KAREN_B, name: 'Karen Rep', email: 'karen-b@itest.local', role: 'User', orgId: B },
    ]);
    invalidateRoster(A); invalidateRoster(B);
    await db.insert(opportunities).values({
        id: OPP_A, pipelineId: 'pipe_itest_auto', opportunityName: 'Acme — HVAC', account: 'Acme', salesRep: 'Karen Rep',
        stage: 'Proposal', forecastCategory: 'Commit', orgId: A, ownerId: KAREN_A,
    });
    await db.insert(automations).values([
        {   // A: when a deal enters Proposal, create a task for the rep
            id: 'auto_itest_A_proposal', orgId: A, name: 'Proposal → task', triggerEvent: 'opportunity.stage_changed',
            conditions: [{ field: 'to_stage', operator: 'eq', value: 'Proposal' }],
            actions: [{ type: 'create_task', params: { title: 'Send proposal to {{account}}', notes: '{{opportunity_name}}: {{from_stage}} → {{to_stage}}; {{nope}} stays', dueOffsetDays: 2, priority: 'High' } }],
            active: true, runCount: 0,
        },
        {   // B: same trigger, no conditions — must never see A's event
            id: 'auto_itest_B_any', orgId: B, name: 'B task', triggerEvent: 'opportunity.stage_changed',
            conditions: [], actions: [{ type: 'create_task', params: { title: 'B task' } }], active: true, runCount: 0,
        },
        {   // A: a silent deal — an update_field that tries to change the org, then a legitimate one, then an email to the rep
            id: 'auto_itest_A_silent', orgId: A, name: 'Silent → flag', triggerEvent: 'opportunity.silent',
            conditions: [{ field: 'days_silent', operator: 'gte', value: 14 }],
            actions: [
                { type: 'update_field', params: { entity: 'opportunity', field: 'orgId', value: B } },
                { type: 'update_field', params: { entity: 'opportunity', field: 'forecastCategory', value: 'At risk' } },
                { type: 'send_email',   params: { subject: '{{opportunity_name}} silent {{days_silent}}d', body: 'Hi {{sales_rep}} <b>' } },
                { type: 'send_slack',   params: { message: '{{opportunity_name}} has been silent {{days_silent}} days' } },
            ],
            active: true, runCount: 0,
        },
        {   // A: paused — never runs
            id: 'auto_itest_A_paused', orgId: A, name: 'Paused', triggerEvent: 'opportunity.stage_changed',
            conditions: [], actions: [{ type: 'create_task', params: { title: 'never' } }], active: false, runCount: 0,
        },
    ]);
});
after(cleanup);

test('a stage move into Proposal in A creates ONE task in A — rendered, linked to the deal, owned by A\'s Karen; B sees nothing and B\'s rule never ran', async () => {
    const opp = await oppRow();
    await dispatchAutomations(A, 'opportunity.stage_changed', dealEventData(opp, { from_stage: 'Discovery', to_stage: 'Proposal' }));

    const inA = await tasksIn(A);
    assert.equal(inA.length, 1, 'one task in A');
    const t = inA[0];
    assert.equal(t.title, 'Send proposal to Acme');
    assert.equal(t.description, 'Acme — HVAC: Discovery → Proposal; {{nope}} stays');
    assert.equal(t.opportunityId, OPP_A); assert.equal(t.relatedTo, OPP_A);
    assert.equal(t.assignedTo, 'Karen Rep');
    assert.equal(t.ownerId, KAREN_A, 'owned by A\'s Karen — resolved in A\'s roster');
    assert.notEqual(t.ownerId, KAREN_B);
    assert.equal(t.priority, 'High'); assert.equal(t.status, 'Open'); assert.equal(t.completed, false);
    assert.equal(t.dueDate, isoLocal(new Date(Date.now() + 2 * 86400000)));
    assert.equal(t.orgId, A);

    assert.equal((await tasksIn(B)).length, 0, 'B has no task');
    assert.equal((await runsFor(B, 'auto_itest_B_any')).length, 0, 'B\'s rule did not run for A\'s event');
    assert.equal((await runsFor(A, 'auto_itest_A_paused')).length, 0, 'a paused rule does not run');

    const runs = await runsFor(A, 'auto_itest_A_proposal');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'success'); assert.equal(runs[0].actionsExecuted, 1); assert.equal(runs[0].triggeredBy, OPP_A);
    assert.equal(runs[0].error, null);
    assert.equal((await ruleRow('auto_itest_A_proposal')).runCount, 1);
    assert.equal((await ruleRow('auto_itest_B_any')).runCount, 0, 'the counter moved in A alone');
});

test('a move to another stage is a skipped run — no task', async () => {
    const opp = await oppRow();
    await dispatchAutomations(A, 'opportunity.stage_changed', dealEventData(opp, { from_stage: 'Proposal', to_stage: 'Negotiation/Review' }));
    assert.equal((await tasksIn(A)).length, 1, 'still the one task');
    const runs = await runsFor(A, 'auto_itest_A_proposal');
    assert.equal(runs.length, 2);
    assert.equal(runs.filter(r => r.status === 'skipped').length, 1);
});

test('a silent deal: update_field cannot hand the deal to another org, the allowlisted field is written, the rep is emailed with merge fields rendered and HTML escaped', async () => {
    sent.length = 0;
    const opp = await oppRow();
    await dispatchAutomations(A, 'opportunity.silent', dealEventData(opp, { days_silent: 16 }));

    const after = await oppRow();
    assert.equal(after.orgId, A, 'REGRESSION: the org write is refused');
    assert.equal(after.forecastCategory, 'At risk', 'the allowlisted write landed');

    const runs = await runsFor(A, 'auto_itest_A_silent');
    assert.equal(runs.length, 1);
    assert.equal(runs[0].status, 'success');
    assert.equal(runs[0].actionsExecuted, 3, 'the refused write does not count; the write, the email and the Slack post do');
    assert.match(runs[0].error, /field "orgId" cannot be set by a rule/, 'the refusal is on the run record');

    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'karen-a@itest.local', 'the deal\'s rep, resolved in A');
    assert.equal(sent[0].subject, 'Acme — HVAC silent 16d');
    assert.equal(sent[0].html, '<p>Hi Karen Rep &lt;b&gt;</p>');
    assert.equal(sent[0].text, 'Hi Karen Rep <b>');
    assert.equal(slackPosts.length, 1, 'one Slack post (§0.127)');
    assert.equal(slackPosts[0].orgId, A, 'to A\'s Slack');
    assert.equal(slackPosts[0].msg.text, 'Acme — HVAC has been silent 16 days', 'merge fields rendered');
    assert.equal(slackPosts[0].alertType, undefined, 'no alert type — the rule is the switch');
    // §0.132: Block Kit — the message as the section, the rule / trigger / deal as the context, the app button
    const blocks = slackPosts[0].msg.blocks;
    assert.equal(blocks.length, 3);
    assert.equal(blocks[0].text.text, 'Acme — HVAC has been silent 16 days');
    assert.equal(blocks[1].elements[0].text, 'Automation: *Silent → flag* · Deal gone silent (no activity for 14 days) · Acme — HVAC');
    assert.equal(blocks[2].elements[0].url, 'https://itest.local');
});

test('a trigger outside the vocabulary fires nothing — no run, no task, no write', async () => {
    const before = (await db.select().from(automationRuns).where(eq(automationRuns.orgId, A))).length;
    await dispatchAutomations(A, 'opportunity.stage-changed', dealEventData(await oppRow(), { to_stage: 'Proposal' }));
    await dispatchAutomations(A, 'task.snoozed', { id: 'x' });   // (task.overdue joined the vocabulary in §0.132)
    assert.equal((await db.select().from(automationRuns).where(eq(automationRuns.orgId, A))).length, before);
    assert.equal((await tasksIn(A)).length, 1);
});

test('an assignee with no roster row in this org leaves the task unowned and says so; an org with no rules is a no-op', async () => {
    await db.insert(automations).values({
        id: 'auto_itest_A_ghost', orgId: A, name: 'Ghost assignee', triggerEvent: 'lead.created',
        conditions: [], actions: [{ type: 'create_task', params: { title: 'Call {{first_name}}', assignedTo: 'Nobody Here', dueOffsetDays: 0 } }], active: true, runCount: 0,
    });
    await dispatchAutomations(A, 'lead.created', { id: 'lead_itest_auto_1', first_name: 'Ada', last_name: 'L', company: 'Analytical' });
    const t = (await tasksIn(A)).find(r => r.title === 'Call Ada');
    assert.ok(t, 'the task exists');
    assert.equal(t.assignedTo, 'Nobody Here'); assert.equal(t.ownerId, null, 'unowned — never guessed');
    assert.equal(t.opportunityId, null, 'a lead is not a deal');
    assert.equal(t.dueDate, isoLocal(new Date()));
    const [run] = await runsFor(A, 'auto_itest_A_ghost');
    assert.match(run.error, /no user named "Nobody Here"/);
    await dispatchAutomations(B, 'lead.created', { id: 'lead_itest_auto_2', first_name: 'Bee' });
    assert.equal((await tasksIn(B)).length, 0);
});

test('the picker\'s id owns the task in THIS org and refreshes the name; an id from another org is a miss and the name decides (§0.126)', async () => {
    await db.insert(automations).values([
        {   // A's Karen by id with a stale name: owned by id, the name refreshed from the roster
            id: 'auto_itest_A_byid', orgId: A, name: 'By id', triggerEvent: 'lead.created',
            conditions: [], actions: [{ type: 'create_task', params: { title: 'Id {{first_name}}', assignedToId: KAREN_A, assignedTo: 'Old Name', dueOffsetDays: 0 } }], active: true, runCount: 0,
        },
        {   // B's Karen by id in A's rule: a miss in A; the name resolves in A
            id: 'auto_itest_A_crossid', orgId: A, name: 'Cross-org id', triggerEvent: 'lead.created',
            conditions: [], actions: [{ type: 'create_task', params: { title: 'Cross {{first_name}}', assignedToId: KAREN_B, assignedTo: 'Karen Rep', dueOffsetDays: 0 } }], active: true, runCount: 0,
        },
    ]);
    await dispatchAutomations(A, 'lead.created', { id: 'lead_itest_auto_3', first_name: 'Cy' });
    const byId = (await tasksIn(A)).find(r => r.title === 'Id Cy');
    assert.ok(byId, 'the by-id task exists');
    assert.equal(byId.ownerId, KAREN_A, 'owned by the id');
    assert.equal(byId.assignedTo, 'Karen Rep', 'the roster name, not the stale one');
    const cross = (await tasksIn(A)).find(r => r.title === 'Cross Cy');
    assert.ok(cross, 'the cross-org task exists');
    assert.equal(cross.ownerId, KAREN_A, 'B\'s id never resolves in A; the name did, in A');
    assert.notEqual(cross.ownerId, KAREN_B);
    assert.equal((await tasksIn(B)).length, 0, 'B still has no task');
});

test('task.overdue (§0.132): a rule on it creates a follow-up linked to the overdue task\'s deal, owned by the assignee resolved in A; the run names the task; B never sees it', async () => {
    const { taskEventData } = await import('../../src/utils/automationEvents.js');
    await db.insert(automations).values({
        id: 'auto_itest_A_overdue', orgId: A, name: 'Overdue → chase', triggerEvent: 'task.overdue',
        conditions: [{ field: 'days_overdue', operator: 'gte', value: 3 }],
        actions: [{ type: 'create_task', params: { title: 'Chase: {{title}} ({{days_overdue}}d late)', dueOffsetDays: 0 } }], active: true, runCount: 0,
    });
    const overdue = { id: 'task_itest_auto_overdue', title: 'Send SOW', type: 'Follow-up', priority: 'High', assignedTo: 'Karen Rep', dueDate: '2026-09-10', opportunityId: OPP_A, orgId: A };
    // 2 days late: the condition refuses → a skipped run, no task
    await dispatchAutomations(A, 'task.overdue', taskEventData(overdue, { days_overdue: 2 }));
    assert.equal((await tasksIn(A)).filter(r => r.title.startsWith('Chase:')).length, 0);
    // 5 days late: the follow-up is created, linked and owned
    await dispatchAutomations(A, 'task.overdue', taskEventData(overdue, { days_overdue: 5 }));
    const chase = (await tasksIn(A)).find(r => r.title === 'Chase: Send SOW (5d late)');
    assert.ok(chase, 'the follow-up exists');
    assert.equal(chase.opportunityId, OPP_A, 'linked to the overdue task\'s deal');
    assert.equal(chase.assignedTo, 'Karen Rep', 'the same assignee by default');
    assert.equal(chase.ownerId, KAREN_A, 'owned by A\'s Karen');
    const runs = await runsFor(A, 'auto_itest_A_overdue');
    assert.equal(runs.length, 2);
    assert.deepEqual(runs.map(r => r.status).sort(), ['skipped', 'success']);
    assert.ok(runs.every(r => r.triggeredBy === 'task_itest_auto_overdue'), 'the run names the task it fired for');
    assert.equal((await tasksIn(B)).length, 0, 'B still has no task');
});
