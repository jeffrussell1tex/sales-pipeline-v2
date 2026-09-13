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
 * write carry orgId, and the assignee's ownerId is resolved in THIS org's
 * roster — never taken from the payload.
 */

import { db }          from '../../db/index.js';
import { automations, automationRuns, tasks, opportunities, users } from '../../db/schema.js';
import { eq, and }     from 'drizzle-orm';
import { sendEmail }   from './send-email.mjs';
import { resolveOwnerId } from './_lib.mjs';
import {
    isAutomationTrigger, renderMerge, taskFromAction, updateFieldPatch, eventSubject,
} from '../../src/utils/automationEvents.js';

// ── Condition evaluation ──────────────────────────────────────────────────────
// Each condition: { field, operator, value }
// Operators: eq | neq | contains | gt | lt | gte | lte | exists
const evalCondition = (cond, data) => {
    const raw = data[cond.field];
    const val = cond.value;
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

// The email of the org's user with this display name — THIS org's roster only,
// one active match; two people sharing a name, or nobody, resolve to null (the
// resolveOwnerId rule: report, never guess).
async function repEmail(orgId, name) {
    const wanted = String(name ?? '').trim().toLowerCase();
    if (!wanted || !orgId) return null;
    const rows = await db.select({ name: users.name, email: users.email, active: users.active })
        .from(users).where(eq(users.orgId, orgId));
    const matches = rows.filter(u => u.active !== false && String(u.name ?? '').trim().toLowerCase() === wanted && u.email);
    return matches.length === 1 ? matches[0].email : null;
}

// ── Action execution ──────────────────────────────────────────────────────────
const executeAction = async (action, orgId, triggerEvent, data) => {
    switch (action.type) {

        case 'create_task': {
            // params: { title, notes, dueOffsetDays, assignedTo, priority, type }
            // The row is built by the pure module (rendered title, due date,
            // the deal link); ownership is stamped HERE from the org's roster.
            const row = taskFromAction(action, triggerEvent, data);
            let ownerId = null;
            let note = null;
            if (row.assignedTo) {
                try {
                    ownerId = await resolveOwnerId(row.assignedTo, orgId);
                    if (ownerId === null) note = `no user named "${row.assignedTo}" — task left unassigned`;
                } catch (e) {
                    if (!e?.ambiguous) throw e;
                    note = `"${row.assignedTo}" is ambiguous in this workspace — task left unowned`;
                }
            }
            await db.insert(tasks).values({ ...row, ownerId, orgId, createdAt: new Date(), updatedAt: new Date() });
            return { type: 'create_task', status: 'ok', taskId: row.id, note };
        }

        case 'send_email': {
            // params: { to, subject, body } — a blank "to" goes to the record's
            // own email (a lead) or to the deal's rep, resolved in this org.
            const p = action.params || {};
            const to = String(p.to || '').trim()
                || data.email
                || await repEmail(orgId, data.sales_rep || data.assigned_to);
            if (!to) return { type: 'send_email', status: 'skipped', reason: 'no recipient' };
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

        case 'update_field': {
            // params: { entity, field, value } — opportunities only, and only
            // the columns UPDATABLE_OPPORTUNITY_FIELDS names (18b34). The first
            // cut wrote whatever column the rule named: an Admin's own rule
            // could set orgId and hand a deal to another tenant.
            const p = action.params || {};
            const entityId = data.id || data.opportunity_id;
            if (!entityId) return { type: 'update_field', status: 'skipped', reason: 'no record id' };
            const patch = updateFieldPatch(p);
            if (!patch.ok) return { type: 'update_field', status: 'skipped', reason: patch.reason };
            await db.update(opportunities)
                .set({ [patch.field]: patch.value, updatedAt: new Date() })
                .where(and(eq(opportunities.id, entityId), eq(opportunities.orgId, orgId)));
            return { type: 'update_field', status: 'ok' };
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
                        const result = await executeAction(action, orgId, triggerEvent, payload);
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
