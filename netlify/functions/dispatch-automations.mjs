/**
 * dispatch-automations.mjs
 *
 * Automation rules engine — called fire-and-forget by other Netlify functions
 * when CRM events occur (opportunity saved, lead created, a task completed,
 * and — since state §0.124 — the hourly pipeline-alerts job's stalled-deal
 * signals: opportunity.silent / .stuck / .close_lapsed).
 *
 * Usage:
 *   import { dispatchAutomations } from './dispatch-automations.mjs';
 *   await dispatchAutomations(orgId, 'opportunity.stage_changed', dealEventData(row, { from_stage, to_stage }));
 *
 * The vocabulary, the payload builders and the action builders live in
 * src/utils/automationEvents.js (pure) — shared with the Settings panel so the
 * condition builder offers the fields an event actually carries. A trigger
 * not in that vocabulary fires NOTHING (fail closed; a typo at a call site
 * must not silently match a rule saved under another name).
 *
 * Org scoping: the rules are read by orgId, the run log and every action
 * write carry orgId, and the assignee's ownerId is resolved in THIS org. A blank
 * To is a lead's own address, else the record's owner; a blank assignee is the
 * record's owner while an active member here (state §0.305): the payload's
 * owner_id — built by the server from the stored row — read again by id in THIS
 * org, so another org's id is a miss. A picked assignee, or the member a typed
 * name finds, is read again by id too and owns the task only while active here;
 * one who is not hands it to the record's owner by that same rule, else it is
 * unassigned — said on the run either way (state §0.308; Jeff, 26 Nov: "B").
 */

import { db }          from '../../db/index.js';
import { automations, automationRuns, tasks, opportunities, users } from '../../db/schema.js';
import { eq, and }     from 'drizzle-orm';
import { sendEmail }   from './send-email.mjs';
import { sendSlackToOrg, slackTemplates } from './send-slack.mjs';
import { resolveOwnerId } from './_lib.mjs';
// Who an automation's email with no To reaches: the record's owner, by app id (state §0.305; the deal emails' rule, §0.304).
import { ownerToMail } from './_dealMail.mjs';
import {
    isAutomationTrigger, renderMerge, taskFromAction, updateFieldPatch, conditionText, eventSubject, triggerOf, dealIdOfEvent, mailRecipient,
} from '../../src/utils/automationEvents.js';

// ── Condition evaluation ──────────────────────────────────────────────────────
// Each condition: { field, operator, value }
// Operators: eq | neq | contains | gt | lt | gte | lte | exists
const evalCondition = (cond, data) => {
    const raw = conditionText(cond.field, data[cond.field]);
    const val = conditionText(cond.field, cond.value);
    switch (cond.operator) {
        case 'eq':       return String(raw).toLowerCase() === String(val).toLowerCase();
        case 'neq':      return String(raw).toLowerCase() !== String(val).toLowerCase();
        case 'contains': return String(raw || '').toLowerCase().includes(String(val).toLowerCase());
        case 'gt':       return Number(raw) >  Number(val);
        case 'lt':       return Number(raw) <  Number(val);
        case 'gte':      return Number(raw) >= Number(val);
        case 'lte':      return Number(raw) <= Number(val);
        case 'exists':   return raw !== null && raw !== undefined && raw !== '';
        default:         return true;
    }
};

const evalConditions = (conditions, data) => {
    if (!Array.isArray(conditions) || conditions.length === 0) return true;
    return conditions.every(c => evalCondition(c, data));
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const escapeHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A member by app id, in THIS org, read fresh — the record's owner (state §0.305), a rule's picked assignee or the member a typed
// name finds (state §0.308): whatever their status, which the caller asks; none for an id of no member here. A failed read
// throws: the action is an error on the run, nothing sent or made in its place. Until §0.305 a blank To
// went to the member bearing the record's rep NAME: after a rename, to nobody or to whoever took the old name.
async function ownerRowOf(ownerId, orgId) {
    const [row] = await db.select({ id: users.id, orgId: users.orgId, name: users.name, email: users.email, active: users.active })
        .from(users).where(and(eq(users.id, ownerId), eq(users.orgId, orgId)));
    return row || null;
}

// ── Action execution ──────────────────────────────────────────────────────────
const executeAction = async (action, orgId, triggerEvent, data, rule = {}) => {
    switch (action.type) {

        case 'create_task': {
            // params: { title, notes, dueOffsetDays, assignedTo, priority, type }
            // The row is built by the pure module (rendered title, due date,
            // the deal link); ownership is stamped HERE from the org's roster.
            const row = taskFromAction(action, triggerEvent, data);
            let ownerId = null;
            let note = null;
            // The picker's id first (state §0.126): owned by that member when the id
            // is a member of THIS org — rename-proof, never ambiguous; an id from
            // any other org is a miss and the name path below decides. Read again by
            // id, fresh: a picked member, or one a typed name finds, owns the task
            // only while active here (state §0.308).
            const pickedId = String(action.params?.assignedToId ?? '').trim();
            const byId = pickedId ? await ownerRowOf(pickedId, orgId) : null;
            let gone = null;   // why the assignee the rule names cannot take it
            if (byId && byId.active !== false) { ownerId = byId.id; row.assignedTo = byId.name; }
            else if (byId) gone = 'the rule\'s assignee is not an active member here';
            else if (row.assignedTo) {
                try {
                    const named = await resolveOwnerId(row.assignedTo, orgId);
                    const member = named ? await ownerRowOf(named, orgId) : null;
                    if (named === null) note = `no user named "${row.assignedTo}" — task left unassigned`;
                    else if (member && member.active !== false) ownerId = member.id;
                    else gone = `"${row.assignedTo}" is not an active member here`;
                } catch (e) {
                    if (!e?.ambiguous) throw e;
                    note = `"${row.assignedTo}" is ambiguous in this workspace — task left unowned`;
                }
            }
            // No assignee named — or the one named is not an active member here (state §0.308; Jeff, 26 Nov: "B"): the record's
            // owner, by app id, while an active member here (state §0.305); else unassigned. Said on the run either way.
            if (gone || (!byId && !row.assignedTo)) {
                row.assignedTo = null;
                const member = data.owner_id ? await ownerRowOf(data.owner_id, orgId) : null;
                if (member && member.active !== false) {
                    ownerId = member.id; row.assignedTo = member.name;
                    if (gone) note = `${gone} — task given to the record's owner`;
                }
                else if (!data.owner_id) note = gone ? `${gone}, and the record has no owner — task left unassigned` : 'the record has no owner — task left unassigned';
                else note = gone ? `${gone}, nor is the record's owner — task left unassigned` : 'the record\'s owner is not an active member here — task left unassigned';
            }
            await db.insert(tasks).values({ ...row, ownerId, orgId, createdAt: new Date(), updatedAt: new Date() });
            return { type: 'create_task', status: 'ok', taskId: row.id, note };
        }

        case 'send_email': {
            // params: { to, subject, body } — a blank "to" goes to a lead's own
            // address, else the record's owner by app id (state §0.305).
            const p = action.params || {};
            const who = mailRecipient(triggerEvent, p, data);
            if (who.skip) return { type: 'send_email', status: 'skipped', reason: who.skip };
            const member = who.to ? null : await ownerRowOf(who.ownerId, orgId);
            const to = who.to || ownerToMail({ ownerId: who.ownerId }, member, orgId)?.email;
            if (!to) return { type: 'send_email', status: 'skipped', reason: !member ? 'the record\'s owner is not a member here' : member.active === false ? 'the record\'s owner is not an active member here' : 'the record\'s owner has no address to send to' };
            const subject = renderMerge(p.subject || `Automation: ${eventSubject(data) || triggerEvent}`, data);
            const body    = renderMerge(p.body || `Event: ${triggerEvent}`, data);
            await sendEmail({
                to,
                subject,
                html: `<p>${escapeHtml(body).replace(/\r?\n/g, '<br>')}</p>`,
                text: body,
            });
            return { type: 'send_email', status: 'ok' };
        }

        case 'webhook': {
            // params: { url } — fires an ad-hoc webhook to a specific URL
            const p = action.params || {};
            if (!p.url) return { type: 'webhook', status: 'skipped', reason: 'no url' };
            const payload = JSON.stringify({ event: triggerEvent, org_id: orgId, data });
            try {
                await fetch(p.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-SPT-Event': triggerEvent, 'User-Agent': 'Accelerep-Automations/1.0' },
                    body: payload,
                    signal: AbortSignal.timeout(10000),
                });
                return { type: 'webhook', status: 'ok' };
            } catch (e) {
                return { type: 'webhook', status: 'error', reason: e.message };
            }
        }

        case 'send_slack': {
            // params: { message } — the workspace's Slack webhook (Settings →
            // Connected apps), rendered with the event's merge fields. No alert
            // type: the rule IS the switch; the org's webhook and its master
            // switch still gate the post, and an unconnected Slack is a skip.
            // Block Kit since §0.132: the rendered message is the section, a
            // context line names the rule, the trigger and the record, and a
            // button opens the app — the shape every other alert posts.
            const p = action.params || {};
            const message = renderMerge(String(p.message || '').trim() || `Automation: ${eventSubject(data) || triggerEvent}`, data);
            const posted = await sendSlackToOrg(orgId, slackTemplates.automation({ message, ruleName: rule.name, triggerLabel: triggerOf(triggerEvent)?.label || triggerEvent, subject: eventSubject(data) }));
            return posted ? { type: 'send_slack', status: 'ok' } : { type: 'send_slack', status: 'skipped', reason: 'Slack is not connected for this workspace' };
        }

        case 'update_field': {
            // params: { entity, field, value } — opportunities only, and only
            // the columns UPDATABLE_OPPORTUNITY_FIELDS names (18b34). The first
            // cut wrote whatever column the rule named: an Admin's own rule
            // could set orgId and hand a deal to another tenant.
            const p = action.params || {};
            // The event's DEAL (dealIdOfEvent, state §0.172) — on a task or lead
            // event, its deal; never the task's or the lead's own id, which wrote
            // no row and still said ok.
            const dealId = dealIdOfEvent(triggerEvent, data);
            if (!dealId) return { type: 'update_field', status: 'skipped', reason: 'no deal on this event' };
            const patch = updateFieldPatch(p);
            if (!patch.ok) return { type: 'update_field', status: 'skipped', reason: patch.reason };
            const written = await db.update(opportunities)
                .set({ [patch.field]: patch.value, updatedAt: new Date() })
                .where(and(eq(opportunities.id, dealId), eq(opportunities.orgId, orgId)))
                .returning({ id: opportunities.id });
            return written.length
                ? { type: 'update_field', status: 'ok' }
                : { type: 'update_field', status: 'skipped', reason: 'the deal is not in this workspace' };
        }

        default:
            return { type: action.type, status: 'skipped', reason: 'unknown action type' };
    }
};

// ── Main export ───────────────────────────────────────────────────────────────
export const dispatchAutomations = async (orgId, triggerEvent, data) => {
    try {
        if (!orgId) { console.warn('dispatchAutomations: no orgId — nothing fired'); return; }
        if (!isAutomationTrigger(triggerEvent)) {
            console.warn(`dispatchAutomations: "${triggerEvent}" is not an automation trigger — nothing fired`);
            return;
        }
        const payload = data && typeof data === 'object' ? data : {};

        // Load all active automations for this org that subscribe to this event
        const rules = await db
            .select()
            .from(automations)
            .where(and(
                eq(automations.orgId, orgId),
                eq(automations.active, true),
                eq(automations.triggerEvent, triggerEvent),
            ));

        if (rules.length === 0) return;

        // Evaluate and execute each matching rule in parallel
        await Promise.allSettled(rules.map(async (rule) => {
            const runId = 'run_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
            let status = 'success';
            let actionsExecuted = 0;
            let errorMsg = null;
            const notes = [];

            try {
                // Check conditions
                const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
                if (!evalConditions(conditions, payload)) {
                    // Conditions not met — log as skipped
                    await db.insert(automationRuns).values({
                        id:               runId,
                        orgId,
                        automationId:     rule.id,
                        automationName:   rule.name,
                        triggerEvent,
                        triggeredBy:      payload.id || null,
                        status:           'skipped',
                        actionsExecuted:  0,
                        createdAt:        new Date(),
                    });
                    return;
                }

                // Execute actions in sequence
                const actions = Array.isArray(rule.actions) ? rule.actions : [];
                for (const action of actions) {
                    try {
                        const result = await executeAction(action, orgId, triggerEvent, payload, rule);
                        if (result?.status === 'ok') actionsExecuted++;
                        if (result?.status === 'skipped') notes.push(`${result.type}: skipped — ${result.reason}`);
                        if (result?.status === 'error')   notes.push(`${result.type}: ${result.reason}`);
                        if (result?.note)                 notes.push(`${result.type}: ${result.note}`);
                    } catch (e) {
                        console.error(`Automation ${rule.id} action ${action.type} failed:`, e.message);
                        errorMsg = e.message;
                        status = 'error';
                    }
                }
            } catch (e) {
                status = 'error';
                errorMsg = e.message;
                console.error(`Automation ${rule.id} evaluation error:`, e.message);
            }

            // Write run log and bump runCount — both in THIS org.
            const detail = [errorMsg, ...notes].filter(Boolean).join(' · ') || null;
            await Promise.allSettled([
                db.insert(automationRuns).values({
                    id:               runId,
                    orgId,
                    automationId:     rule.id,
                    automationName:   rule.name,
                    triggerEvent,
                    triggeredBy:      payload.id || null,
                    status,
                    actionsExecuted,
                    error:            detail,
                    createdAt:        new Date(),
                }),
                db.update(automations)
                    .set({ runCount: (rule.runCount || 0) + 1, lastRunAt: new Date(), updatedAt: new Date() })
                    .where(and(eq(automations.id, rule.id), eq(automations.orgId, orgId))),
            ]);
        }));
    } catch (e) {
        // Never throw — automations must not break the calling function
        console.error('dispatchAutomations fatal error:', e.message);
    }
};
