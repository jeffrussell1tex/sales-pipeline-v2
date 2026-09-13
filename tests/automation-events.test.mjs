// tests/automation-events.test.mjs
//
// Light workflow automation (state §0.124; the enhancement Claude recommended:
// "when deal enters Proposal, create task X; alert if silent 14 days — your
// stalled-deal cards show you already compute the signals, they just don't
// act"). The pure module is RUN; the engine, the hourly job, the call sites
// and the Settings panel are source scans (§18b23) — the engine's behaviour
// against the real database, org isolation included, is
// tests/integration/dispatch-automations.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    AUTOMATION_TRIGGERS, TRIGGER_GROUPS, TRIGGER_VALUES, HOURLY_TRIGGERS, triggerOf, isAutomationTrigger,
    EVENT_FIELDS, conditionFields, dealEventData, leadEventData, taskEventData, renderMerge, eventSubject,
    taskFromAction, TASK_PRIORITIES, UPDATABLE_OPPORTUNITY_FIELDS, updateFieldPatch,
} from '../src/utils/automationEvents.js';
import { isoLocal } from '../src/utils/dateLocal.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── the vocabulary ───────────────────────────────────────────────────────────

test('one vocabulary: ten triggers in four groups; the three stalled-deal signals are hourly; task.overdue is gone (nothing computes it)', () => {
    assert.equal(AUTOMATION_TRIGGERS.length, 10);
    assert.deepEqual(TRIGGER_GROUPS, ['Pipeline', 'Deal health', 'Leads', 'Tasks']);
    for (const t of AUTOMATION_TRIGGERS) {
        assert.ok(TRIGGER_GROUPS.includes(t.group), `${t.value} is in a known group`);
        assert.ok(Array.isArray(EVENT_FIELDS[t.value]) && EVENT_FIELDS[t.value].length > 0, `${t.value} carries fields`);
        assert.ok(['event', 'hourly'].includes(t.kind));
    }
    assert.deepEqual(HOURLY_TRIGGERS, ['opportunity.silent', 'opportunity.stuck', 'opportunity.close_lapsed']);
    assert.ok(!TRIGGER_VALUES.includes('task.overdue'), 'nothing fires task.overdue — it is not offered');
    assert.ok(TRIGGER_VALUES.includes('task.completed'), 'tasks.mjs fires task.completed');
    assert.equal(triggerOf('opportunity.silent').label, 'Deal gone silent (no activity for 14 days)');
    assert.equal(triggerOf('nope'), null);
    assert.equal(isAutomationTrigger('opportunity.stage_changed'), true);
    assert.equal(isAutomationTrigger('opportunity.stage-changed'), false, 'a near miss is not a trigger (fail closed)');
    assert.equal(isAutomationTrigger(undefined), false);
});

test('conditionFields: the fields an event actually carries — a move has from/to, a signal its day count, an unknown trigger nothing', () => {
    const keys = (t) => conditionFields(t).map(f => f.key);
    assert.ok(keys('opportunity.stage_changed').includes('from_stage') && keys('opportunity.stage_changed').includes('to_stage'));
    assert.ok(!keys('opportunity.created').includes('from_stage'), 'a create has no previous stage');
    assert.ok(keys('opportunity.silent').includes('days_silent'));
    assert.ok(keys('opportunity.stuck').includes('days_in_stage') && keys('opportunity.stuck').includes('avg_days_in_stage'));
    assert.ok(keys('opportunity.close_lapsed').includes('days_lapsed'));
    assert.ok(keys('lead.created').includes('source') && keys('lead.created').includes('score'));
    assert.ok(keys('task.completed').includes('opportunity_id'));
    assert.deepEqual(conditionFields('nope'), []);
    for (const t of TRIGGER_VALUES) for (const f of conditionFields(t)) assert.ok(f.key && f.label, `${t}: ${f.key} is labelled`);
});

// ── the payloads ─────────────────────────────────────────────────────────────

test('dealEventData: the stored row (camelCase) becomes the payload (snake_case); numbers are numbers; extra rides on top; nothing is undefined', () => {
    const d = dealEventData({ id: 'o1', opportunityName: 'Acme — HVAC', account: 'Acme', salesRep: 'Karen Rep', stage: 'Proposal', arr: '12000.50', forecastedCloseDate: '2026-10-01', probability: '60', forecastCategory: 'Commit', ownerId: 'usr_k' }, { from_stage: 'Discovery', to_stage: 'Proposal' });
    assert.equal(d.opportunity_name, 'Acme — HVAC');
    assert.equal(d.sales_rep, 'Karen Rep');
    assert.equal(d.arr, 12000.5);
    assert.equal(d.probability, 60);
    assert.equal(d.forecasted_close_date, '2026-10-01');
    assert.equal(d.from_stage, 'Discovery');
    assert.equal(d.owner_id, 'usr_k');
    assert.equal(d.vertical, null, 'an absent column is null, not undefined');
    for (const [k, v] of Object.entries(dealEventData({}))) assert.notEqual(v, undefined, k);
    assert.equal(dealEventData({ arr: '' }).arr, null, 'a blank ARR is null, not 0');
    // every deal field the condition builder offers is a key of the payload
    for (const f of conditionFields('opportunity.stuck')) if (!['days_in_stage', 'avg_days_in_stage'].includes(f.key)) assert.ok(f.key in d, f.key);
});

test('leadEventData / taskEventData: same rule; every offered field is a payload key', () => {
    const l = leadEventData({ id: 'l1', firstName: 'Ada', lastName: 'Lovelace', company: 'Analytical', email: 'ada@x.io', phone: '555', source: 'Web Form', status: 'New', score: '72', assignedTo: null, ownerId: null });
    assert.equal(l.first_name, 'Ada'); assert.equal(l.score, 72); assert.equal(l.assigned_to, null);
    for (const f of conditionFields('lead.created')) assert.ok(f.key in l, f.key);
    const t = taskEventData({ id: 't1', title: 'Call', type: 'Call', assignedTo: 'Karen Rep', opportunityId: 'o1', completedDate: '2026-09-13', ownerId: 'usr_k' });
    assert.equal(t.opportunity_id, 'o1'); assert.equal(t.completed_date, '2026-09-13');
    for (const f of conditionFields('task.completed')) assert.ok(f.key in t, f.key);
});

// ── merge fields ─────────────────────────────────────────────────────────────

test('renderMerge: {{key}} reads the payload; an unknown or empty key STAYS VISIBLE; spaces tolerated; a non-string template is a string', () => {
    const d = { account: 'Acme', stage: 'Proposal', days_silent: 16, vertical: null };
    assert.equal(renderMerge('Follow up with {{account}} in {{ stage }} — {{days_silent}}d', d), 'Follow up with Acme in Proposal — 16d');
    assert.equal(renderMerge('Hi {{acount}}', d), 'Hi {{acount}}', 'a typo stays visible, never vanishes');
    assert.equal(renderMerge('{{vertical}}', d), '{{vertical}}', 'a null value stays visible too');
    assert.equal(renderMerge(null, d), '');
    assert.equal(renderMerge('{{account}}', null), '{{account}}');
    assert.equal(eventSubject({ opportunity_name: 'X', account: 'Y' }), 'X');
    assert.equal(eventSubject({ account: 'Y' }), 'Y');
    assert.equal(eventSubject({ first_name: 'Ada', last_name: 'L' }), 'Ada L');
    assert.equal(eventSubject({ title: 'A task' }), 'A task');
    assert.equal(eventSubject({}), null);
});

// ── the create_task action ───────────────────────────────────────────────────

test('taskFromAction: a rendered, deal-linked, rep-assigned task with a due date counted in whole days from now', () => {
    const now = new Date('2026-09-13T15:00:00Z');
    const data = dealEventData({ id: 'o1', opportunityName: 'Acme — HVAC', account: 'Acme', salesRep: 'Karen Rep', stage: 'Proposal' });
    const row = taskFromAction({ type: 'create_task', params: { title: 'Send proposal to {{account}}', notes: 'Deal {{opportunity_name}} moved to {{stage}}', dueOffsetDays: 2, priority: 'High' } }, 'opportunity.stage_changed', data, { now, id: 'task_x' });
    assert.equal(row.id, 'task_x');
    assert.equal(row.title, 'Send proposal to Acme');
    assert.equal(row.description, 'Deal Acme — HVAC moved to Proposal');
    assert.equal(row.dueDate, isoLocal(new Date(now.getTime() + 2 * 86400000)));
    assert.equal(row.priority, 'High');
    assert.equal(row.assignedTo, 'Karen Rep', 'blank assignee → the deal\'s rep');
    assert.equal(row.opportunityId, 'o1', 'LINKED to the deal');
    assert.equal(row.relatedTo, 'o1', 'the rail reads relatedTo too');
    assert.equal(row.status, 'Open'); assert.equal(row.completed, false); assert.equal(row.type, 'Follow-up');
    assert.ok(!('ownerId' in row) && !('orgId' in row), 'ownership and the org are stamped by the engine, never here');
});

test('taskFromAction: defaults and guards — title from the deal, today for 0, no date for blank or negative, the rule\'s assignee wins, a bad priority is Medium, a task event links its own deal', () => {
    const now = new Date('2026-09-13T15:00:00Z');
    const deal = dealEventData({ id: 'o1', account: 'Acme', salesRep: 'Karen Rep' });
    assert.equal(taskFromAction({ params: {} }, 'opportunity.silent', deal, { now }).title, 'Follow up — Acme');
    assert.equal(taskFromAction({ params: { dueOffsetDays: 0 } }, 'opportunity.silent', deal, { now }).dueDate, isoLocal(now));
    assert.equal(taskFromAction({ params: { dueOffsetDays: '' } }, 'opportunity.silent', deal, { now }).dueDate, null);
    assert.equal(taskFromAction({ params: { dueOffsetDays: -3 } }, 'opportunity.silent', deal, { now }).dueDate, null, 'never a due date in the past');
    assert.equal(taskFromAction({ params: { dueOffsetDays: 'abc' } }, 'opportunity.silent', deal, { now }).dueDate, null);
    assert.equal(taskFromAction({ params: { assignedTo: ' Manager Mike ' } }, 'opportunity.silent', deal, { now }).assignedTo, 'Manager Mike');
    assert.equal(taskFromAction({ params: { priority: 'Urgent' } }, 'opportunity.silent', deal, { now }).priority, 'Medium');
    assert.deepEqual(TASK_PRIORITIES, ['Low', 'Medium', 'High']);
    const lead = leadEventData({ id: 'l1', firstName: 'Ada', lastName: 'L', assignedTo: 'Karen Rep' });
    const fromLead = taskFromAction({ params: {} }, 'lead.created', lead, { now });
    assert.equal(fromLead.opportunityId, null, 'a lead is not a deal');
    assert.equal(fromLead.assignedTo, 'Karen Rep'); assert.equal(fromLead.title, 'Follow up — Ada L');
    const fromTask = taskFromAction({ params: {} }, 'task.completed', taskEventData({ id: 't1', title: 'Call', opportunityId: 'o9' }), { now });
    assert.equal(fromTask.opportunityId, 'o9', 'the completed task\'s deal carries over');
    assert.equal(taskFromAction(null, 'opportunity.silent', null, { now }).status, 'Open', 'garbage in, a task out');
    assert.match(taskFromAction({ params: {} }, 'opportunity.silent', deal, { now }).id, /^task_auto_/);
});

// ── the update_field action ──────────────────────────────────────────────────

test('updateFieldPatch: an allowlist (18b34) — never orgId, ownerId, stage or the rep; probability is a whole 0–100; a blank string clears', () => {
    assert.deepEqual(Object.keys(UPDATABLE_OPPORTUNITY_FIELDS).sort(), ['forecastCategory', 'nextSteps', 'probability', 'team', 'territory', 'vertical']);
    assert.deepEqual(updateFieldPatch({ entity: 'opportunity', field: 'forecastCategory', value: ' Commit ' }), { ok: true, field: 'forecastCategory', value: 'Commit' });
    assert.deepEqual(updateFieldPatch({ entity: 'opportunity', field: 'nextSteps', value: '' }), { ok: true, field: 'nextSteps', value: null });
    assert.deepEqual(updateFieldPatch({ entity: 'opportunity', field: 'probability', value: '75.4' }), { ok: true, field: 'probability', value: 75 });
    for (const bad of ['orgId', 'org_id', 'ownerId', 'salesRep', 'stage', 'arr', 'id', 'stageHistory', '', undefined]) {
        const r = updateFieldPatch({ entity: 'opportunity', field: bad, value: 'x' });
        assert.equal(r.ok, false, `${bad} is refused`);
        assert.match(r.reason, /cannot be set by a rule/);
    }
    assert.equal(updateFieldPatch({ entity: 'opportunity', field: 'probability', value: 150 }).ok, false);
    assert.equal(updateFieldPatch({ entity: 'opportunity', field: 'probability', value: 'high' }).ok, false);
    assert.equal(updateFieldPatch({ entity: 'lead', field: 'status', value: 'Dead' }).ok, false, 'opportunities only');
    assert.equal(updateFieldPatch(null).ok, false);
});

// ── the engine (scans) ───────────────────────────────────────────────────────

test('the engine refuses an unknown trigger, builds the task from the shared module, stamps ownership from THIS org\'s roster, and scopes every write', () => {
    const s = code(read('netlify/functions/dispatch-automations.mjs'));
    assert.ok(s.includes("import { resolveOwnerId } from './_lib.mjs';"));
    assert.ok(s.includes("} from '../../src/utils/automationEvents.js';"));
    assert.ok(s.includes('        if (!isAutomationTrigger(triggerEvent)) {'), 'fail closed on a trigger outside the vocabulary');
    assert.ok(s.indexOf('if (!isAutomationTrigger(triggerEvent))') < s.indexOf('.from(automations)'), 'before any read');
    // create_task
    assert.ok(s.includes('            const row = taskFromAction(action, triggerEvent, data);'));
    assert.ok(s.includes('                    ownerId = await resolveOwnerId(row.assignedTo, orgId);'), 'the assignee\'s id from the org roster');
    assert.ok(s.includes("                    if (!e?.ambiguous) throw e;"), 'an ambiguous name is reported, not guessed');
    assert.ok(s.includes('            await db.insert(tasks).values({ ...row, ownerId, orgId, createdAt: new Date(), updatedAt: new Date() });'));
    assert.ok(!/account:\s+data\.account/.test(s) && !/notes:\s+p\.notes/.test(s), 'the two keys tasks has no column for are gone');
    // send_email
    assert.ok(s.includes('                || await repEmail(orgId, data.sales_rep || data.assigned_to);'), 'a blank To reaches the deal\'s rep');
    assert.ok(s.includes('        .from(users).where(eq(users.orgId, orgId));'), 'the roster read is org-scoped');
    assert.ok(s.includes("    return matches.length === 1 ? matches[0].email : null;"), 'exactly one match or nothing');
    assert.ok(s.includes("                html: `<p>${escapeHtml(body).replace(/\\r?\\n/g, '<br>')}</p>`,"), 'the body is escaped');
    assert.ok(s.includes('const subject = renderMerge(p.subject ||') && s.includes('const body    = renderMerge(p.body ||'), 'merge fields in subject and body');
    // update_field
    assert.ok(s.includes('            const patch = updateFieldPatch(p);'));
    assert.ok(s.includes("            if (!patch.ok) return { type: 'update_field', status: 'skipped', reason: patch.reason };"));
    assert.ok(s.includes('                .set({ [patch.field]: patch.value, updatedAt: new Date() })'), 'only the allowlisted field, coerced');
    assert.ok(s.includes('                .where(and(eq(opportunities.id, entityId), eq(opportunities.orgId, orgId)));'));
    assert.ok(!s.includes('[p.field]: p.value'), 'REGRESSION: the column name from the rule is never written');
    assert.ok(!s.includes("await import('../../db/schema.js')"), 'no dynamic import');
    // the run counter is org-scoped
    assert.ok(s.includes('                    .where(and(eq(automations.id, rule.id), eq(automations.orgId, orgId))),'));
    assert.ok(!/db\.update\(automations\)[\s\S]{0,200}\.where\(eq\(automations\.id, rule\.id\)\)/.test(s));
});

test('org-scoping scans the engine now (it was on the skip list); tasks.itest stubs it like every other suite', () => {
    const scan = code(read('tests/org-scoping.test.mjs'));
    assert.ok(!scan.includes("'dispatch-automations.mjs'"), 'no longer exempt');
    const itest = code(read('tests/integration/tasks.itest.mjs'));
    assert.ok(itest.includes("mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, {"));
});

// ── the hourly job and the call sites (scans) ────────────────────────────────

test('the hourly job fires opportunity.silent / .stuck / .close_lapsed right after each Slack post — inside the dedup block, on the signal alone', () => {
    const s = code(read('netlify/functions/pipeline-alerts.mjs'));
    assert.ok(s.includes("import { dispatchAutomations }                        from './dispatch-automations.mjs';"));
    assert.ok(s.includes("import { dealEventData }                              from '../../src/utils/automationEvents.js';"));
    const pairs = [
        ["'dealSilent');",  "                        await dispatchAutomations(orgId, 'opportunity.silent', dealEventData(opp, { days_silent: daysSilent }));"],
        ["'dealStuck');",   "                        await dispatchAutomations(orgId, 'opportunity.stuck', dealEventData(opp, { days_in_stage: daysInStage, avg_days_in_stage: avgForStage }));"],
        ["'closeLapsed');", "                        await dispatchAutomations(orgId, 'opportunity.close_lapsed', dealEventData(opp, { days_lapsed: daysLapsed }));"],
    ];
    for (const [slackTail, dispatch] of pairs) {
        const slack = s.indexOf(slackTail);
        const fire  = s.indexOf(dispatch);
        assert.ok(slack > 0 && fire > slack, `${slackTail} then the dispatch`);
        assert.ok(fire - slack < 120, `${slackTail}: the dispatch is the next statement`);
        const catchAfter = s.indexOf('} catch (err) {', slack);
        assert.ok(fire < catchAfter, `${slackTail}: inside the same try — inside the !alerted block`);
    }
    assert.equal((s.match(/await dispatchAutomations\(orgId, 'opportunity\./g) || []).length, 3, 'three signals fire; momentum and score drop do not (flagged, not done)');
    for (const t of HOURLY_TRIGGERS) assert.ok(s.includes(`'${t}'`), `${t} is fired by the job`);
});

test('every call site hands the engine the shared payload: deals, leads (both endpoints), and task.completed behind its first-flip gate', () => {
    const opps = code(read('netlify/functions/opportunities.mjs'));
    assert.ok(opps.includes("import { dealEventData } from '../../src/utils/automationEvents.js';"));
    assert.ok(opps.includes("            dispatchAutomations(orgId, 'opportunity.created', dealEventData(inserted)).catch(e => console.warn('auto error:', e.message));"));
    assert.ok(opps.includes("                dispatchAutomations(orgId, autoEvt, dealEventData(upserted, { from_stage: previousStage, to_stage: upserted.stage })).catch(e => console.warn('auto error:', e.message));"));
    assert.ok(opps.includes("const autoEvt = upserted.stage === 'Closed Won' ? 'opportunity.won' : upserted.stage === 'Closed Lost' ? 'opportunity.lost' : 'opportunity.stage_changed';"));
    const leads = code(read('netlify/functions/leads.mjs'));
    assert.ok(leads.includes("            dispatchAutomations(orgId, 'lead.created', leadEventData(inserted)).catch(e => console.warn('auto error:', e.message));"));
    assert.ok(leads.includes("                dispatchAutomations(orgId, 'lead.converted', leadEventData(upserted)).catch(e => console.warn('auto error:', e.message));"));
    const intake = code(read('netlify/functions/lead-intake.mjs'));
    assert.ok(intake.includes("        dispatchAutomations(org.orgId, 'lead.created', leadEventData(inserted)).catch(e => console.warn('lead-intake automations:', e.message));"));
    const tasks = code(read('netlify/functions/tasks.mjs'));
    assert.ok(tasks.includes("import { dispatchAutomations } from './dispatch-automations.mjs';"));
    const gate = tasks.indexOf('if (!wasCompleted && upserted.completed) {');
    const fire = tasks.indexOf("                dispatchAutomations(orgId, 'task.completed', taskEventData(upserted)).catch(e => console.warn('auto error:', e.message));");
    const ret  = tasks.indexOf("return { statusCode: 200, headers, body: JSON.stringify({ task: upserted }) };");
    assert.ok(gate > 0 && fire > gate && fire < ret, 'task.completed fires once, on the first flip, beside the webhook');
});

// ── the Settings panel (scans) ───────────────────────────────────────────────

test('the panel renders the shared vocabulary — no local trigger list, a field SELECT in the condition builder, merge-field hints, notes on a task', () => {
    const s = code(read('src/Tabs/settings/integrations/AutomationsDetail.jsx'));
    assert.ok(s.includes("import { AUTOMATION_TRIGGERS, TRIGGER_GROUPS, HOURLY_TRIGGERS, conditionFields, triggerOf } from '../../../utils/automationEvents.js';"));
    assert.ok(!s.includes('const TRIGGER_EVENTS'), 'REGRESSION: a local copy of the vocabulary drifts (task.overdue was offered for months and never fired)');
    assert.ok(!s.includes("'task.overdue'"));
    assert.ok(s.includes('                    {TRIGGER_GROUPS.map(group => ('));
    assert.ok(s.includes('                                {AUTOMATION_TRIGGERS.filter(e => e.group===group).map(ev => ('));
    assert.ok(s.includes("                            {group === 'Deal health' && ("), 'the hourly group says how it fires');
    assert.ok(s.includes('A rule fires once per deal per signal per week, at the deal rep\'s alert hour'));
    assert.ok(s.includes("                            <select value={c.field} onChange={e => setCond(i,'field',e.target.value)} style={sel}>"), 'the field is chosen, not typed');
    assert.ok(s.includes('                                {conditionFields(trigger).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}'));
    assert.ok(!s.includes('placeholder="Field (e.g. stage, arr)"'), 'REGRESSION: a typed field name a typo turns into "never matches"');
    assert.ok(s.includes("    const addCond = () => setConds(p => [...p, { field: conditionFields(trigger)[0]?.key || '', operator:'eq', value:'' }]);"));
    assert.ok(s.includes('const MergeHint = ({ fields }) => ('), 'module scope (§16)');
    assert.ok(s.includes('const ActionEditor = ({ action, idx, actions, setAction, delAction, fields }) => ('));
    assert.ok(s.includes('fields={conditionFields(trigger)}/>)}'));
    assert.ok(s.includes('placeholder="e.g. Follow up with {{account}}"'), 'the placeholder promises what the engine renders');
    assert.ok(s.includes("<textarea value={action.params.notes||''} onChange={e => setAction(idx,'notes',e.target.value)}"), 'notes reach the task\'s description');
    assert.ok(s.includes("params: v==='create_task' ? { title:'', dueOffsetDays:1, priority:'Medium' } : {}"), 'switching to create_task keeps the defaults the inputs show');
    assert.ok(s.includes("    const triggerLabel = (ev) => triggerOf(ev)?.label || ev;"));
    assert.ok(s.includes("{triggerLabel(rule.triggerEvent)}{triggerOf(rule.triggerEvent) ? '' : ' (never fires)'}"), 'a rule saved under a retired trigger says so');
    assert.ok(s.includes('deal gone silent, stuck in a stage, close date lapsed (checked hourly, once per deal per week)'));
    assert.ok(!s.includes('task overdue/completed'), 'the old footer is gone');
});
