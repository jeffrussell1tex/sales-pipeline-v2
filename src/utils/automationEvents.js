// automationEvents.js — what an automation rule can listen for, what each event
// carries, and how an action reads it (state §0.124). Pure: no React, no db;
// shared by the rules engine (netlify/functions/dispatch-automations.mjs), the
// functions that fire events (opportunities, leads, lead-intake, tasks, the
// hourly pipeline-alerts job) and the Settings → Automations panel.
//
// THE MODEL. The engine had six triggers fired from deal and lead saves, and
// the Settings panel offered two more (task.overdue, task.completed) that
// nothing ever fired. The hourly job computed the stalled-deal signals — silent,
// stuck, close date lapsed — and emailed, texted and posted them, but they
// never reached a rule, so "when a deal goes silent, create a task for the
// rep" was not expressible. Now:
//
//   - ONE vocabulary. The panel renders AUTOMATION_TRIGGERS; the engine refuses
//     a trigger that is not in it (fail closed — a typo at a call site fires
//     nothing, the slackAlertEnabled precedent). task.overdue is gone from the
//     picker: nothing computes it. task.completed is fired by tasks.mjs.
//   - The hourly job fires opportunity.silent / .stuck / .close_lapsed at the
//     same point it posts to Slack: once per deal per signal per week (the
//     recommendation-log dedup), at the rep's alert hour, for a deal whose rep
//     is an active user with an email — exactly the conditions under which the
//     signal itself is raised.
//   - Every event is built here, so the condition builder can offer the fields
//     an event actually carries instead of a free-text name a typo turns into
//     "never matches", and a merge field ({{account}}) in a task title or an
//     email is rendered from the same keys.
//   - A created task is LINKED to the deal (opportunityId / relatedTo) and
//     OWNED by the rep it is assigned to (ownerId resolved in the org's roster
//     by the engine — the name column alone authorizes nothing, 18b22).
//   - update_field takes an ALLOWLIST (18b34): the first cut wrote whatever
//     column name the rule named, so an Admin's own rule could set orgId and
//     move a deal into another tenant's workspace.

import { isoLocal } from './dateLocal.js';

const str = (v, max = 500) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, max);
const num = (v) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

// ── The vocabulary ────────────────────────────────────────────────────────────
// kind: 'event' fires from the save itself; 'hourly' from the pipeline-alerts
// job. entity names the payload shape (see EVENT_FIELDS).
export const AUTOMATION_TRIGGERS = Object.freeze([
    Object.freeze({ value: 'opportunity.created',       label: 'Opportunity created',                          group: 'Pipeline',    kind: 'event',  entity: 'opportunity' }),
    Object.freeze({ value: 'opportunity.stage_changed', label: 'Stage changed',                                group: 'Pipeline',    kind: 'event',  entity: 'opportunity' }),
    Object.freeze({ value: 'opportunity.won',           label: 'Deal won',                                     group: 'Pipeline',    kind: 'event',  entity: 'opportunity' }),
    Object.freeze({ value: 'opportunity.lost',          label: 'Deal lost',                                    group: 'Pipeline',    kind: 'event',  entity: 'opportunity' }),
    Object.freeze({ value: 'opportunity.silent',        label: 'Deal gone silent (no activity for 14 days)',   group: 'Deal health', kind: 'hourly', entity: 'opportunity' }),
    Object.freeze({ value: 'opportunity.stuck',         label: 'Deal stuck in a stage past the average',       group: 'Deal health', kind: 'hourly', entity: 'opportunity' }),
    Object.freeze({ value: 'opportunity.close_lapsed',  label: 'Close date lapsed',                            group: 'Deal health', kind: 'hourly', entity: 'opportunity' }),
    Object.freeze({ value: 'opportunity.momentum',      label: 'Deal gaining momentum (2+ stages in 14 days)', group: 'Deal health', kind: 'hourly', entity: 'opportunity' }),
    Object.freeze({ value: 'opportunity.score_drop',    label: 'AI score dropped below 40',                    group: 'Deal health', kind: 'hourly', entity: 'opportunity' }),
    Object.freeze({ value: 'lead.created',              label: 'Lead created',                                 group: 'Leads',       kind: 'event',  entity: 'lead' }),
    Object.freeze({ value: 'lead.converted',            label: 'Lead converted',                               group: 'Leads',       kind: 'event',  entity: 'lead' }),
    Object.freeze({ value: 'task.completed',            label: 'Task completed',                               group: 'Tasks',       kind: 'event',  entity: 'task' }),
]);
export const TRIGGER_GROUPS  = Object.freeze(['Pipeline', 'Deal health', 'Leads', 'Tasks']);
export const TRIGGER_VALUES  = Object.freeze(AUTOMATION_TRIGGERS.map(t => t.value));
export const HOURLY_TRIGGERS = Object.freeze(AUTOMATION_TRIGGERS.filter(t => t.kind === 'hourly').map(t => t.value));

export const triggerOf = (value) => AUTOMATION_TRIGGERS.find(t => t.value === value) || null;
export const isAutomationTrigger = (value) => TRIGGER_VALUES.includes(value);

// ── What each event carries ───────────────────────────────────────────────────
// The keys are the payload's keys (snake_case, the webhook convention) and
// double as merge fields: {{account}} in a task title reads data.account.
const F = (key, label) => Object.freeze({ key, label });
const DEAL_FIELDS = [
    F('opportunity_name',     'Deal name'),
    F('account',              'Account'),
    F('sales_rep',            'Sales rep'),
    F('stage',                'Stage'),
    F('arr',                  'ARR'),
    F('forecasted_close_date','Forecasted close date'),
    F('probability',          'Probability'),
    F('forecast_category',    'Forecast category'),
    F('vertical',             'Vertical'),
    F('territory',            'Territory'),
];
const STAGE_MOVE_FIELDS = [F('from_stage', 'Previous stage'), F('to_stage', 'New stage')];
const LEAD_FIELDS = [
    F('first_name',  'First name'),
    F('last_name',   'Last name'),
    F('company',     'Company'),
    F('email',       'Email'),
    F('phone',       'Phone'),
    F('source',      'Source'),
    F('status',      'Status'),
    F('score',       'Lead score'),
    F('assigned_to', 'Assigned to'),
];
const TASK_FIELDS = [
    F('title',          'Task title'),
    F('type',           'Task type'),
    F('assigned_to',    'Assigned to'),
    F('opportunity_id', 'Deal id'),
    F('completed_date', 'Completed on'),
];

export const EVENT_FIELDS = Object.freeze({
    'opportunity.created':       Object.freeze([...DEAL_FIELDS]),
    'opportunity.stage_changed': Object.freeze([...DEAL_FIELDS, ...STAGE_MOVE_FIELDS]),
    'opportunity.won':           Object.freeze([...DEAL_FIELDS, ...STAGE_MOVE_FIELDS]),
    'opportunity.lost':          Object.freeze([...DEAL_FIELDS, ...STAGE_MOVE_FIELDS]),
    'opportunity.silent':        Object.freeze([...DEAL_FIELDS, F('days_silent', 'Days since last activity')]),
    'opportunity.stuck':         Object.freeze([...DEAL_FIELDS, F('days_in_stage', 'Days in stage'), F('avg_days_in_stage', 'Average days in this stage')]),
    'opportunity.close_lapsed':  Object.freeze([...DEAL_FIELDS, F('days_lapsed', 'Days past the close date')]),
    'opportunity.momentum':      Object.freeze([...DEAL_FIELDS, F('stage_count', 'Stages advanced'), F('days_since_created', 'Days since created')]),
    'opportunity.score_drop':    Object.freeze([...DEAL_FIELDS, F('score', 'AI score'), F('verdict', 'AI verdict')]),
    'lead.created':              Object.freeze([...LEAD_FIELDS]),
    'lead.converted':            Object.freeze([...LEAD_FIELDS]),
    'task.completed':            Object.freeze([...TASK_FIELDS]),
});

/** The fields a condition or a merge field can name for this trigger ([] for an unknown one). */
export const conditionFields = (trigger) => EVENT_FIELDS[trigger] || [];

// ── Building an event from a row ──────────────────────────────────────────────
// Each builder reads the STORED row (drizzle camelCase) and emits the payload.
// `extra` rides on top: from_stage/to_stage on a move, the day counts on an
// hourly signal.
export function dealEventData(opp, extra = {}) {
    const o = opp || {};
    return {
        id:                    o.id ?? null,
        opportunity_name:      o.opportunityName ?? null,
        account:               o.account ?? null,
        sales_rep:             o.salesRep ?? null,
        stage:                 o.stage ?? null,
        arr:                   num(o.arr),
        forecasted_close_date: o.forecastedCloseDate ?? null,
        probability:           num(o.probability),
        forecast_category:     o.forecastCategory ?? null,
        vertical:              o.vertical ?? null,
        territory:             o.territory ?? null,
        owner_id:              o.ownerId ?? null,
        ...extra,
    };
}

export function leadEventData(lead, extra = {}) {
    const l = lead || {};
    return {
        id:          l.id ?? null,
        first_name:  l.firstName ?? null,
        last_name:   l.lastName ?? null,
        company:     l.company ?? null,
        email:       l.email ?? null,
        phone:       l.phone ?? null,
        source:      l.source ?? null,
        status:      l.status ?? null,
        score:       num(l.score),
        assigned_to: l.assignedTo ?? null,
        owner_id:    l.ownerId ?? null,
        ...extra,
    };
}

export function taskEventData(task, extra = {}) {
    const t = task || {};
    return {
        id:             t.id ?? null,
        title:          t.title ?? null,
        type:           t.type ?? null,
        assigned_to:    t.assignedTo ?? null,
        opportunity_id: t.opportunityId ?? null,
        completed_date: t.completedDate ?? null,
        owner_id:       t.ownerId ?? null,
        ...extra,
    };
}

// ── Merge fields ──────────────────────────────────────────────────────────────
/**
 * {{key}} → data[key]. An unknown key, or one the event does not carry, STAYS
 * VISIBLE (the emailTemplates rule): "Follow up with {{acount}}" in a task
 * title tells the Admin what went wrong; an empty string hides it.
 */
export function renderMerge(template, data) {
    const d = data && typeof data === 'object' ? data : {};
    return String(template ?? '').replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, key) =>
        (Object.prototype.hasOwnProperty.call(d, key) && d[key] !== null && d[key] !== undefined ? String(d[key]) : m));
}

/** The deal or lead an event is about, for a default title. */
export const eventSubject = (data) => {
    const d = data || {};
    return d.opportunity_name || d.account
        || [d.first_name, d.last_name].filter(Boolean).join(' ') || d.company
        || d.title || null;
};

// ── The create_task action ────────────────────────────────────────────────────
export const TASK_PRIORITIES = Object.freeze(['Low', 'Medium', 'High']);
// A due date is a day on a wall calendar (the dateLocal rule) — formatted
// locally, which on the server that runs the engine is UTC.
const isoDate = (d) => isoLocal(new Date(d));

/**
 * The task row a create_task action produces for this event — everything but
 * orgId and ownerId, which the engine stamps (ownerId from the org's roster,
 * by the assignee's name; never from the payload).
 *   - title / notes are rendered with the event's merge fields
 *   - dueOffsetDays: whole days from now (0 = today); blank or negative → no due date
 *   - assignedTo: the rule's name, else the deal's rep / the lead's assignee
 *   - a deal event links the task to the deal (opportunityId AND relatedTo —
 *     the rail reads both); a task event carries the deal id it already had
 */
export function taskFromAction(action, triggerEvent, data, { now = new Date(), id } = {}) {
    const p = (action && action.params && typeof action.params === 'object') ? action.params : {};
    const d = data && typeof data === 'object' ? data : {};
    const trig = triggerOf(triggerEvent);
    const subject = eventSubject(d);
    const title = str(p.title, 500) || `Follow up — ${subject || triggerEvent}`;
    const offset = num(p.dueOffsetDays);
    const dueDate = offset !== null && offset >= 0 ? isoDate(now.getTime() + Math.floor(offset) * 86400000) : null;
    const assignedTo = str(p.assignedTo, 255) || str(d.sales_rep, 255) || str(d.assigned_to, 255) || null;
    const priority = TASK_PRIORITIES.includes(p.priority) ? p.priority : 'Medium';
    const dealId = trig?.entity === 'opportunity' ? (d.id || null) : (d.opportunity_id || null);
    return {
        id:            id || `task_auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title:         renderMerge(title, d),
        description:   p.notes ? renderMerge(str(p.notes, 5000), d) : null,
        type:          str(p.type, 100) || 'Follow-up',
        status:        'Open',
        completed:     false,
        priority,
        assignedTo,
        dueDate,
        opportunityId: dealId,
        relatedTo:     dealId,
    };
}

// ── The update_field action ───────────────────────────────────────────────────
// What a rule may write on an opportunity. NOT stage (a stage move must go
// through the endpoint: stage history, the stage clock, the Slack events),
// NOT the org, the owner or the rep (ownership is stamped from the roster,
// 18b22), NOT the money. Additive by design — add a column here, not at the
// call site.
export const UPDATABLE_OPPORTUNITY_FIELDS = Object.freeze({
    forecastCategory: 'string',
    probability:      'int',
    nextSteps:        'string',
    vertical:         'string',
    territory:        'string',
    team:             'string',
});
// What the panel offers — a SELECT over the allowlist, so a rule can never
// name a column the engine refuses (the first update_field rule saved on dev
// carried params {} — a typed field, or none, and nothing was written).
export const UPDATABLE_FIELD_OPTIONS = Object.freeze([
    Object.freeze({ key: 'forecastCategory', label: 'Forecast category' }),
    Object.freeze({ key: 'probability',      label: 'Probability (0–100)' }),
    Object.freeze({ key: 'nextSteps',        label: 'Next steps' }),
    Object.freeze({ key: 'vertical',         label: 'Vertical' }),
    Object.freeze({ key: 'territory',        label: 'Territory' }),
    Object.freeze({ key: 'team',             label: 'Team' }),
]);

/**
 * → { ok: true, field, value } for an allowlisted field with a value the
 * column can hold; { ok: false, reason } otherwise. Never a column name the
 * rule made up.
 */
export function updateFieldPatch(params) {
    const p = params && typeof params === 'object' ? params : {};
    // Opportunities are the only entity; a rule saved without naming one means it.
    if ((p.entity || 'opportunity') !== 'opportunity') return { ok: false, reason: 'unsupported entity' };
    const field = str(p.field, 64);
    const kind = Object.prototype.hasOwnProperty.call(UPDATABLE_OPPORTUNITY_FIELDS, field) ? UPDATABLE_OPPORTUNITY_FIELDS[field] : null;
    if (!kind) return { ok: false, reason: `field "${field || '(blank)'}" cannot be set by a rule` };
    if (kind === 'int') {
        const n = num(p.value);
        if (n === null || n < 0 || n > 100) return { ok: false, reason: `${field} must be a whole number from 0 to 100` };
        return { ok: true, field, value: Math.round(n) };
    }
    const value = str(p.value, 500);
    return { ok: true, field, value: value || null };
}

// ── The task action's assignee (state §0.126) ────────────────────────────────
// The panel picks the assignee from the org's roster and stores BOTH the
// user's id and their name: the engine owns the task by the id when that id
// is in the EVENT'S org (rename-proof, never ambiguous) and falls back to the
// name — the §0.124 contract — otherwise, so a rule saved before the picker,
// or one whose user has left, behaves as it did.

/** A saved name with no single roster match is kept as a `name:` value so the select never blanks a rule. */
const nameValue = (name) => 'name:' + name;

/**
 * → { value, options } for the Assign-to select: '' is the default (the deal's
 * rep or the lead's assignee), a roster id picks that user, and a saved name
 * that matches no single active user is offered as itself, "by name".
 */
export function assigneeOptions(roster, params) {
    const rows = (Array.isArray(roster) ? roster : [])
        .filter(u => u && u.id && u.name && u.active !== false)
        .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id)));
    const options = [{ value: '', label: "The deal's rep (default)" }, ...rows.map(u => ({ value: u.id, label: String(u.name) }))];
    const p = params && typeof params === 'object' ? params : {};
    const id = str(p.assignedToId, 64);
    const name = str(p.assignedTo, 255);
    let value = '';
    if (id && rows.some(u => u.id === id)) value = id;
    else if (name) {
        const byName = rows.filter(u => String(u.name).trim().toLowerCase() === name.toLowerCase());
        if (byName.length === 1) value = byName[0].id;
        else { value = nameValue(name); options.push({ value, label: `${name} (by name — ${byName.length ? 'more than one user' : 'not in the roster'})` }); }
    }
    return { value, options };
}

/** The params a chosen select value stores: both keys, always, so a stale pair never survives a change. */
export function assigneeParams(value, roster) {
    const v = String(value ?? '');
    if (!v) return { assignedTo: '', assignedToId: '' };
    if (v.startsWith('name:')) return { assignedTo: v.slice(5), assignedToId: '' };
    const u = (Array.isArray(roster) ? roster : []).find(r => r && r.id === v);
    return u ? { assignedTo: String(u.name), assignedToId: u.id } : { assignedTo: '', assignedToId: '' };
}
