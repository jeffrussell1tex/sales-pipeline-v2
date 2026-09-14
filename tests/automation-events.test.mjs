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
    taskFromAction, TASK_PRIORITIES, UPDATABLE_OPPORTUNITY_FIELDS, UPDATABLE_FIELD_OPTIONS, updateFieldPatch,
} from '../src/utils/automationEvents.js';
import { assigneeOptions, assigneeParams, automationSlackMessage } from '../src/utils/automationEvents.js';
import { isoLocal } from '../src/utils/dateLocal.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── the vocabulary ───────────────────────────────────────────────────────────

test('one vocabulary: thirteen triggers in four groups; the five deal-health signals and task.overdue are hourly (§0.132: the job computes it now)', () => {
    assert.equal(AUTOMATION_TRIGGERS.length, 13);
    assert.deepEqual(TRIGGER_GROUPS, ['Pipeline', 'Deal health', 'Leads', 'Tasks']);
    for (const t of AUTOMATION_TRIGGERS) {
        assert.ok(TRIGGER_GROUPS.includes(t.group), `${t.value} is in a known group`);
        assert.ok(Array.isArray(EVENT_FIELDS[t.value]) && EVENT_FIELDS[t.value].length > 0, `${t.value} carries fields`);
        assert.ok(['event', 'hourly'].includes(t.kind));
    }
    assert.deepEqual(HOURLY_TRIGGERS, ['opportunity.silent', 'opportunity.stuck', 'opportunity.close_lapsed', 'opportunity.momentum', 'opportunity.score_drop', 'task.overdue']);
    assert.equal(triggerOf('task.overdue').kind, 'hourly', 'task.overdue is computed by the hourly job, never fired from a save — a rule on it must not expect a save to trip it');
    assert.equal(triggerOf('task.overdue').group, 'Tasks');
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
    assert.ok(keys('opportunity.momentum').includes('stage_count') && keys('opportunity.momentum').includes('days_since_created'), '§0.127');
    assert.ok(keys('opportunity.score_drop').includes('score') && keys('opportunity.score_drop').includes('verdict'), '§0.127');
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
    assert.ok(s.includes("import { resolveOwnerId, rosterUserById } from './_lib.mjs';"));
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
    assert.ok(s.includes("import { dealEventData, taskEventData }               from '../../src/utils/automationEvents.js';"));
    const pairs = [
        ["'dealSilent');",  "                        await dispatchAutomations(orgId, 'opportunity.silent', dealEventData(opp, { days_silent: daysSilent }));"],
        ["'dealStuck');",   "                        await dispatchAutomations(orgId, 'opportunity.stuck', dealEventData(opp, { days_in_stage: daysInStage, avg_days_in_stage: avgForStage }));"],
        ["'closeLapsed');", "                        await dispatchAutomations(orgId, 'opportunity.close_lapsed', dealEventData(opp, { days_lapsed: daysLapsed }));"],
        ["'dealMomentum');",   "                        await dispatchAutomations(orgId, 'opportunity.momentum', dealEventData(opp, { stage_count: stageCount, days_since_created: createdDays }));"],
        ["'scoreDropAlert');", "                        await dispatchAutomations(orgId, 'opportunity.score_drop', dealEventData(opp, { score: opp.aiScore.score, verdict: verdictLabel }));"],
    ];
    for (const [slackTail, dispatch] of pairs) {
        const slack = s.indexOf(slackTail);
        const fire  = s.indexOf(dispatch);
        assert.ok(slack > 0 && fire > slack, `${slackTail} then the dispatch`);
        assert.ok(fire - slack < 120, `${slackTail}: the dispatch is the next statement`);
        const catchAfter = s.indexOf('} catch (err) {', slack);
        assert.ok(fire < catchAfter, `${slackTail}: inside the same try — inside the !alerted block`);
    }
    assert.equal((s.match(/await dispatchAutomations\(orgId, 'opportunity\./g) || []).length, 5, 'five signals fire — momentum and score drop since §0.127');
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
    assert.ok(s.includes("import { AUTOMATION_TRIGGERS, TRIGGER_GROUPS, HOURLY_TRIGGERS, UPDATABLE_FIELD_OPTIONS, conditionFields, triggerOf, assigneeOptions, assigneeParams } from '../../../utils/automationEvents.js';"));
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
    assert.ok(s.includes('const ActionEditor = ({ action, idx, actions, setAction, setAssignee, delAction, fields, roster }) => {'));
    assert.ok(s.includes('fields={conditionFields(trigger)}/>)}'));
    assert.ok(s.includes('placeholder="e.g. Follow up with {{account}}"'), 'the placeholder promises what the engine renders');
    assert.ok(s.includes("<textarea value={action.params.notes||''} onChange={e => setAction(idx,'notes',e.target.value)}"), 'notes reach the task\'s description');
    assert.ok(s.includes("const defaultParams = (type) => type === 'create_task' ? { title:'', dueOffsetDays:1, priority:'Medium' }"), 'switching to create_task keeps the defaults the inputs show');
    assert.ok(s.includes("    const triggerLabel = (ev) => triggerOf(ev)?.label || ev;"));
    assert.ok(s.includes("{triggerLabel(rule.triggerEvent)}{triggerOf(rule.triggerEvent) ? '' : ' (never fires)'}"), 'a rule saved under a retired trigger says so');
    assert.ok(s.includes('deal gone silent, stuck in a stage, close date lapsed, gaining momentum, AI score dropped (checked hourly, once per deal per week)'));
    assert.ok(!s.includes('task overdue/completed'), 'the old footer is gone');
});

// ── the Assign-to picker (state §0.126) ──────────────────────────────────────

test('assigneeOptions / assigneeParams: the default, a roster id, a saved name matched to one user, a legacy or ambiguous name kept "by name"', () => {
    const roster = [{ id: 'usr_b', name: 'Bob Rep', active: true }, { id: 'usr_a', name: 'Ann Rep' }, { id: 'usr_x', name: 'Gone Rep', active: false }, { id: 'usr_d1', name: 'Dup Rep' }, { id: 'usr_d2', name: 'dup rep' }];
    const o = assigneeOptions(roster, {});
    assert.deepEqual(o.options.map(x => x.value), ['', 'usr_a', 'usr_b', 'usr_d1', 'usr_d2'], 'active users by name; the default first; an inactive user is not offered');
    assert.equal(o.value, '');
    assert.equal(assigneeOptions(roster, { assignedToId: 'usr_b', assignedTo: 'Old Name' }).value, 'usr_b', 'the id wins over a stale name');
    assert.equal(assigneeOptions(roster, { assignedTo: 'ann rep' }).value, 'usr_a', 'a saved name matched to ONE user, case-insensitively');
    const legacy = assigneeOptions(roster, { assignedTo: 'Nobody Here' });
    assert.equal(legacy.value, 'name:Nobody Here');
    assert.equal(legacy.options.at(-1).label, 'Nobody Here (by name — not in the roster)', 'a saved rule is never blanked');
    const dup = assigneeOptions(roster, { assignedTo: 'Dup Rep' });
    assert.equal(dup.value, 'name:Dup Rep'); assert.match(dup.options.at(-1).label, /more than one user/);
    assert.equal(assigneeOptions(roster, { assignedToId: 'usr_other_org', assignedTo: 'Bob Rep' }).value, 'usr_b', 'an id not in this roster falls back to the name');
    assert.deepEqual(assigneeParams('', roster), { assignedTo: '', assignedToId: '' });
    assert.deepEqual(assigneeParams('usr_a', roster), { assignedTo: 'Ann Rep', assignedToId: 'usr_a' }, 'both keys, always');
    assert.deepEqual(assigneeParams('name:Nobody Here', roster), { assignedTo: 'Nobody Here', assignedToId: '' });
    assert.deepEqual(assigneeParams('usr_not_here', roster), { assignedTo: '', assignedToId: '' }, 'an unknown id is never stored');
    assert.deepEqual(assigneeOptions(null, null).options, [{ value: '', label: "The deal's rep (default)" }]);
});

test('the panel picks the assignee from the roster and stores both keys; the engine owns by id in THIS org first, then by name', () => {
    const s = code(read('src/Tabs/settings/integrations/AutomationsDetail.jsx'));
    assert.ok(s.includes("    const roster = useApp().settings?.users || [];"), 'the org roster the Admin already holds');
    assert.ok(s.includes("    const setAssignee = (i, v) => setActs(p => p.map((a,j) => j===i ? { ...a, params:{ ...a.params, ...assigneeParams(v, roster) } } : a));"));
    assert.ok(s.includes("<select value={assignee.value} onChange={e => setAssignee(idx, e.target.value)} style={sel}>"), 'a SELECT, not a typed name');
    assert.ok(s.includes('{assignee.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}'));
    assert.ok(!s.includes('placeholder="leave blank = use deal rep"'), 'the typed input is gone');
    assert.ok(s.includes('setAssignee={setAssignee} roster={roster} fields={conditionFields(trigger)}/>)}'));
    assert.ok(s.includes("{a.type==='create_task' && a.params?.assignedTo && <span style={{ fontSize:12, color:T.inkMuted }}>→ {a.params.assignedTo}</span>}"), 'the review names the assignee');
    const e = code(read('netlify/functions/dispatch-automations.mjs'));
    assert.ok(e.includes("import { resolveOwnerId, rosterUserById } from './_lib.mjs';"));
    assert.ok(e.includes('            const byId = action.params?.assignedToId ? await rosterUserById(action.params.assignedToId, orgId) : null;'), 'the id is looked up in the EVENT\'S org');
    assert.ok(e.includes('            if (byId) { ownerId = byId.id; row.assignedTo = byId.name; }'), 'owned by id, the name refreshed from the roster');
    assert.ok(e.includes('            else if (row.assignedTo) {'), 'the name path is the fallback');
    const l = code(read('netlify/functions/_lib.mjs'));
    assert.ok(l.includes('export async function rosterUserById(id, orgId) {'));
    assert.ok(l.includes('    return (await orgRoster(orgId)).find((u) => u.id === wanted) || null;'), 'this org\'s roster only');
    assert.ok(l.includes("    if (!orgId) throw new Error('_lib.rosterUserById: orgId is required.');"));
});

// ── Post to Slack (state §0.127) ─────────────────────────────────────────────

test('send_slack: the engine posts the rendered message through the org-aware sender with NO alert type (the rule is the switch); the panel offers it, requires a message, names it in the review', () => {
    const e = code(read('netlify/functions/dispatch-automations.mjs'));
    assert.ok(e.includes("import { sendSlackToOrg, slackTemplates } from './send-slack.mjs';"));
    assert.ok(e.includes("        case 'send_slack': {"));
    assert.ok(e.includes("            const message = renderMerge(String(p.message || '').trim() || `Automation: ${eventSubject(data) || triggerEvent}`, data);"), 'merge fields render; a blank message still says what fired');
    assert.ok(e.includes('            const posted = await sendSlackToOrg(orgId, slackTemplates.automation({ message, ruleName: rule.name, triggerLabel: triggerOf(triggerEvent)?.label || triggerEvent, subject: eventSubject(data) }));'), 'no alert type: not gated by a pipeline-alert switch the Admin may have off; the webhook and the master switch still gate (Block Kit since §0.132)');
    assert.ok(e.includes("            return posted ? { type: 'send_slack', status: 'ok' } : { type: 'send_slack', status: 'skipped', reason: 'Slack is not connected for this workspace' };"), 'an unconnected Slack is a skip that says why');
    const s = code(read('src/Tabs/settings/integrations/AutomationsDetail.jsx'));
    assert.ok(s.includes("    { value:'send_slack',   label:'Post to Slack',     icon:'💬' },"));
    assert.ok(s.includes("<textarea value={action.params.message||''} onChange={e => setAction(idx,'message',e.target.value)}"), 'the message reaches the params');
    assert.ok(s.includes("        : type === 'send_slack' ? { message:'' }"), 'a type switch stores what the input shows');
    assert.ok(s.includes("        if (actions.some(a => a.type === 'send_slack' && !a.params?.message?.trim())) { setError('Post to Slack: a message is required'); return; }"));
    assert.ok(s.includes('{a.type===\'send_slack\'  && a.params?.message && <span style={{ fontSize:12, color:T.inkMuted }}>→ Slack: "{a.params.message}"</span>}'), 'the review names it');
    assert.ok(s.includes('send email, post to Slack, fire webhook, update field'), 'the footer lists it');
});

test('every integration panel\'s row menu is ONE fixed popover hook at the button\'s viewport rect — the overflow:hidden cards clipped the absolute ones (Jeff, 13 Sep)', () => {
    const sh = code(read('src/Tabs/settings/integrations/shared.jsx'));
    assert.ok(sh.includes('export const menuPlacement = (r) => {'));
    assert.ok(sh.includes('        ? { top: r.bottom + 4, right }') && sh.includes('        : { bottom: window.innerHeight - r.top + 4, right };'), 'below when it fits, above otherwise');
    assert.ok(sh.includes('export function useRowMenu(btnPrefix, menuPrefix) {'));
    assert.ok(sh.includes('        setMenuAt(menuPlacement(e.currentTarget.getBoundingClientRect()));'), 'anchored to the button\'s rect on open');
    assert.ok(sh.includes("window.addEventListener('scroll', dismiss, true);") && sh.includes("window.addEventListener('resize', dismiss);"), 'a fixed menu closes when the page moves');
    for (const [file, prefixes] of [['AutomationsDetail', "'auto-btn-', 'auto-menu-'"], ['WebhooksDetail', "'wh-btn-', 'wh-menu-'"], ['ApiKeysDetail', "'key-btn-', 'key-menu-'"]]) {
        const s = code(read(`src/Tabs/settings/integrations/${file}.jsx`));
        assert.ok(s.includes(`useRowMenu(${prefixes})`), `${file}: the shared hook`);
        assert.ok(s.includes("style={{ position:'fixed', ...(menuAt || {}), zIndex:100"), `${file}: position: fixed`);
        assert.ok(!s.includes('...(i >= '), `${file}: REGRESSION — an absolute menu flipped by row index inside the overflow:hidden card`);
        assert.ok(!s.includes("top:-6, right:10"), `${file}: no arrow that assumes a direction`);
        assert.ok(!/React\.useEffect\(\(\) => \{\s*if \(!activeMenu\) return;/.test(s), `${file}: no local outside-click effect — the hook owns it`);
    }
});

test('the run history names the record a run was triggered by, from the lists the app holds; a missing record falls back to the id', () => {
    const s = code(read('src/Tabs/settings/integrations/AutomationsDetail.jsx'));
    assert.ok(s.includes("import { useApp } from '../../../AppContext';"));
    assert.ok(s.includes('const recordName = (run, lists) => {'), 'module scope');
    assert.ok(s.includes("    if (ev.startsWith('opportunity.')) { const o = (lists?.opportunities || []).find(x => x.id === id); return o ? (o.opportunityName || o.account || id) : id; }"));
    assert.ok(s.includes("    if (ev.startsWith('lead.'))") && s.includes("    if (ev.startsWith('task.'))"));
    assert.ok(s.includes('    const lists = useApp();'));
    assert.ok(s.includes('<div title={run.triggeredBy} style={{ fontSize:11, color:T.inkMuted, marginTop:1 }}>Triggered by: {recordName(run, lists)}</div>'), 'the name, the id on hover');
    assert.ok(!s.includes('Triggered by: {run.triggeredBy}'), 'REGRESSION: the raw id');
});

test('the Update field action saves what it shows — a select over the allowlist, defaults stored on type switch, no field refused at Create (Jeff, 13 Sep: "it did not change it to commit")', () => {
    assert.deepEqual(UPDATABLE_FIELD_OPTIONS.map(f => f.key), Object.keys(UPDATABLE_OPPORTUNITY_FIELDS), 'the picker IS the allowlist');
    assert.deepEqual(updateFieldPatch({ field: 'forecastCategory', value: 'Commit' }), { ok: true, field: 'forecastCategory', value: 'Commit' }, 'a rule saved without an entity means opportunity');
    assert.equal(updateFieldPatch({ entity: 'opportunity' }).ok, false, 'but no field is still refused');
    const s = code(read('src/Tabs/settings/integrations/AutomationsDetail.jsx'));
    assert.ok(s.includes('UPDATABLE_FIELD_OPTIONS, conditionFields, triggerOf, assigneeOptions, assigneeParams }'));
    assert.ok(s.includes('                            {UPDATABLE_FIELD_OPTIONS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}'), 'the field is chosen, not typed');
    assert.ok(!s.includes('placeholder="forecastCategory"'), 'REGRESSION: a typed column name');
    assert.ok(s.includes("        : type === 'update_field' ? { entity:'opportunity', field:'', value:'' }"), 'the entity the select shows is stored');
    assert.ok(s.includes("        if (actions.some(a => a.type === 'update_field' && !a.params?.field)) { setError('Update field: choose the field to set'); return; }"));
    assert.ok(s.includes("        if (actions.some(a => a.type === 'webhook' && !a.params?.url?.trim())) { setError('Fire webhook: an endpoint URL is required'); return; }"));
    assert.ok(s.includes("'— no field chosen'"), 'the review says so too');
});

test('an existing automation can be EDITED — the same modal seeded from the rule, saved through PUT with its id, the list updated in place (Jeff, 13 Sep)', () => {
    const s = code(read('src/Tabs/settings/integrations/AutomationsDetail.jsx'));
    assert.ok(s.includes('const AutomationModal = ({ rule, onClose, onSaved }) => {') && !s.includes('NewAutomationModal'), 'one modal for both');
    assert.ok(s.includes("    const [name,    setName]    = React.useState(rule?.name || '');"));
    assert.ok(s.includes("    const [trigger, setTrigger] = React.useState(rule?.triggerEvent || 'opportunity.stage_changed');"));
    assert.ok(s.includes('    const [conditions, setConds] = React.useState(Array.isArray(rule?.conditions) ? rule.conditions : []);'));
    assert.ok(s.includes('    const [actions,    setActs]  = React.useState(Array.isArray(rule?.actions) && rule.actions.length ? rule.actions : ['));
    assert.ok(s.includes("                method: editing ? 'PUT' : 'POST',"), 'an edit is an update, never a second rule');
    assert.ok(s.includes('body: JSON.stringify({ ...(editing ? { id: rule.id } : {}), name: name.trim(), triggerEvent: trigger, conditions, actions }),'), 'the id rides only on an edit');
    assert.ok(s.includes("title={editing ? 'Edit automation' : 'New automation'}"));
    assert.ok(s.includes("label={saving?'Saving…':editing?'Save changes':'Create automation'}"));
    assert.ok(s.includes('onClick={() => (done || editing) && setStep(n)}'), 'editing opens any step directly');
    assert.ok(s.includes("{ icon:'✏️', label:'Edit', fn:() => { setActiveMenu(null); setEditingRule(rule); setShowModal(true); } },"), 'the ⋯ menu offers Edit');
    assert.ok(s.includes('onSaved={saved => setAutomationList(prev => prev.some(r => r.id === saved.id) ? prev.map(r => r.id === saved.id ? saved : r) : [saved, ...prev])}'), 'an edited rule replaces its row; a new one is prepended');
    assert.ok(s.includes("onClose={() => { setShowModal(false); setEditingRule(null); }}"), 'closing forgets the rule being edited');
    // the endpoint's PUT already takes every field the modal sends
    const fn = code(read('netlify/functions/automations.mjs'));
    for (const k of ['name', 'triggerEvent', 'conditions', 'actions']) assert.ok(fn.includes(`if (data.${k}`), `PUT applies ${k}`);
    assert.ok(fn.includes('.where(and(eq(automations.id, data.id), eq(automations.orgId, orgId)))'), 'org-scoped');
});

// ── §0.132: task.overdue, Slack blocks ───────────────────────────────────────

test('task.overdue: the payload carries the due date, the priority and the day count; the condition builder offers them', () => {
    const keys = conditionFields('task.overdue').map(f => f.key);
    for (const k of ['title', 'type', 'priority', 'assigned_to', 'due_date', 'opportunity_id', 'days_overdue']) assert.ok(keys.includes(k), k);
    assert.ok(conditionFields('task.completed').map(f => f.key).includes('due_date'), 'a completed task carries its due date too');
    const t = taskEventData({ id: 't1', title: 'Call', priority: 'High', assignedTo: 'Karen Rep', dueDate: '2026-09-10', opportunityId: 'o1' }, { days_overdue: 4 });
    assert.equal(t.due_date, '2026-09-10'); assert.equal(t.priority, 'High'); assert.equal(t.days_overdue, 4);
    for (const f of conditionFields('task.overdue')) assert.ok(f.key in t, f.key);
    assert.equal(renderMerge('{{title}} is {{days_overdue}}d overdue (due {{due_date}})', t), 'Call is 4d overdue (due 2026-09-10)');
    const follow = taskFromAction({ params: { title: 'Chase {{title}}' } }, 'task.overdue', t, { now: new Date('2026-09-14T15:00:00Z') });
    assert.equal(follow.opportunityId, 'o1', 'a task created from an overdue task links the same deal');
    assert.equal(follow.assignedTo, 'Karen Rep', 'and goes to the same assignee by default');
});

test('the hourly job scans overdue tasks for orgs that have a rule, at the assignee\'s alert hour, once per task per week — and nothing else fires for it', () => {
    const s = code(read('netlify/functions/pipeline-alerts.mjs'));
    assert.ok(s.includes('dispatchServicePlans, tasks, automations } from'), 'the tasks and automations tables are read');
    const gate = s.indexOf("                .where(and(eq(automations.triggerEvent, 'task.overdue'), eq(automations.active, true)));");
    assert.ok(gate > 0, 'only orgs with an active task.overdue rule are scanned');
    assert.ok(s.includes('                    if (!orgsWithRule.has(task.orgId)) continue;'));
    assert.ok(s.includes("                    if (task.completed || task.status === 'Completed') continue;"), 'open tasks only');
    assert.ok(s.includes('                    if (!task.dueDate || task.dueDate >= todayStr) continue;'), 'past the due date only');
    assert.ok(s.includes('                    if (assignee.orgId !== task.orgId) continue;'), 'cross-tenant: the assignee is THIS org\'s user');
    assert.ok(s.includes('                    if (localHourToUtc(aAlertHour, aTz) !== nowHour) continue;'), 'at the assignee\'s alert hour');
    const dedup = s.indexOf("                    if (await wasRecentlyAlerted(task.orgId, assignee.name, task.id, 'taskOverdue')) { skipped++; continue; }");
    const log   = s.indexOf("                        await logAlert(task.orgId, assignee.name, 'taskOverdue',");
    const fire  = s.indexOf("                        await dispatchAutomations(task.orgId, 'task.overdue', taskEventData(task, { days_overdue: daysOverdue }));");
    assert.ok(gate < dedup && dedup < log && log < fire, 'gate → dedup → ledger → the rule');
    assert.ok(s.includes('                    const daysOverdue = daysBetween(task.dueDate, todayStr);'), 'days overdue = today minus the due date');
    const section = s.slice(gate, s.indexOf('        let renewalsSent = 0;', gate));   // comments are stripped: end at the renewals' first code line
    assert.ok(section.length > 500 && section.length < 4000, 'the task section is bounded');
    assert.ok(!/sendEmail|sendSms|trySendSms|sendSlackToOrg/.test(section), 'no email, SMS or Slack of its own — the rule is the switch');
    assert.equal((s.match(/'task\.overdue'/g) || []).length, 2, 'the rule read and the fire, nothing else');
});

test('automationSlackMessage: the rendered message is the section, the context names the rule / trigger / record, the button opens the app; text stays the plain message; mrkdwn is escaped', () => {
    const m = automationSlackMessage({ message: 'Acme <b> & Co has been silent 16 days', ruleName: 'Silent → flag', triggerLabel: 'Deal gone silent (no activity for 14 days)', subject: 'Acme — HVAC', appUrl: 'https://app.example' });
    assert.equal(m.text, 'Acme <b> & Co has been silent 16 days', 'the notification preview is the plain message');
    assert.equal(m.blocks.length, 3);
    assert.deepEqual(m.blocks[0], { type: 'section', text: { type: 'mrkdwn', text: 'Acme &lt;b&gt; &amp; Co has been silent 16 days' } });
    assert.equal(m.blocks[1].type, 'context');
    assert.equal(m.blocks[1].elements[0].text, 'Automation: *Silent → flag* · Deal gone silent (no activity for 14 days) · Acme — HVAC');
    assert.equal(m.blocks[2].type, 'actions');
    assert.equal(m.blocks[2].elements[0].url, 'https://app.example');
    const bare = automationSlackMessage({ message: '' });
    assert.equal(bare.text, 'Automation fired');
    assert.equal(bare.blocks.length, 2, 'no app url, no button');
    assert.equal(bare.blocks[1].elements[0].text, 'Automation');
});

test('the engine posts the Block Kit shape through the send-slack template, with the rule\'s name and the trigger\'s label; the panel says how Tasks triggers fire', () => {
    const s = code(read('netlify/functions/dispatch-automations.mjs'));
    assert.ok(s.includes("import { sendSlackToOrg, slackTemplates } from './send-slack.mjs';"));
    assert.ok(s.includes('const executeAction = async (action, orgId, triggerEvent, data, rule = {}) => {'), 'the rule reaches the action');
    assert.ok(s.includes('                        const result = await executeAction(action, orgId, triggerEvent, payload, rule);'));
    assert.ok(s.includes('            const posted = await sendSlackToOrg(orgId, slackTemplates.automation({ message, ruleName: rule.name, triggerLabel: triggerOf(triggerEvent)?.label || triggerEvent, subject: eventSubject(data) }));'), 'one line: the rule\'s name, the trigger\'s label, the record — and NO third argument (an alert type would gate it)');
    assert.ok(!s.includes('await sendSlackToOrg(orgId, { text });'), 'REGRESSION: the plain-text post is gone');
    const slack = code(read('netlify/functions/send-slack.mjs'));
    assert.ok(slack.includes("import { automationSlackMessage } from '../../src/utils/automationEvents.js';"));
    assert.ok(slack.includes('        automationSlackMessage({ message, ruleName, triggerLabel, subject, appUrl: APP_URL }),'), 'the template delegates to the pure helper with the app url');
    const panel = code(read('src/Tabs/settings/integrations/AutomationsDetail.jsx'));
    assert.ok(panel.includes("                            {group === 'Tasks' && ("), 'the Tasks group says how its triggers fire');
    assert.ok(panel.includes('Task overdue is checked every hour: a rule fires once per task per week, at the assignee\'s alert hour, for an open task whose due date has passed.'));
});
