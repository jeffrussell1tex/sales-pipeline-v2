/**
 * dispatch-automations.mjs
 *
 * Automation rules engine — called fire-and-forget by other Netlify functions
 * when CRM events occur (opportunity saved, lead created, etc.).
 *
 * Usage:
 *   import { dispatchAutomations } from './dispatch-automations.mjs';
 *   await dispatchAutomations(orgId, 'opportunity.stage_changed', data, context);
 *
 * context (optional): { userId, userToken } — used when actions need to call
 *   other Netlify functions (e.g. create_task).
 */

import { db }          from '../../db/index.js';
import { automations, automationRuns, tasks } from '../../db/schema.js';
import { eq, and }     from 'drizzle-orm';
import { sendEmail }   from './send-email.mjs';
import { dispatchWebhook } from './webhooks.mjs';

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

// ── Action execution ──────────────────────────────────────────────────────────
const executeAction = async (action, orgId, triggerEvent, data) => {
    switch (action.type) {

        case 'create_task': {
            // params: { title, dueOffsetDays, assignedTo, priority, notes }
            const p = action.params || {};
            const dueDate = p.dueOffsetDays != null
                ? new Date(Date.now() + Number(p.dueOffsetDays) * 86400000)
                      .toISOString().slice(0, 10)
                : null;
            await db.insert(tasks).values({
                id:          'task_auto_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                orgId,
                title:       p.title       || `Follow up — ${triggerEvent}`,
                type:        p.type        || 'Follow-up',
                status:      'Open',
                priority:    p.priority    || 'Medium',
                assignedTo:  p.assignedTo  || data.sales_rep || data.assigned_to || null,
                account:     data.account  || data.company   || null,
                dueDate,
                notes:       p.notes       || null,
                createdAt:   new Date(),
                updatedAt:   new Date(),
            });
            return { type: 'create_task', status: 'ok' };
        }

        case 'send_email': {
            // params: { to, subject, body }
            const p = action.params || {};
            const to = p.to || data.email || null;
            if (!to) return { type: 'send_email', status: 'skipped', reason: 'no recipient' };
            await sendEmail({
                to,
                subject: p.subject || `Automation triggered: ${triggerEvent}`,
                html: `<p>${p.body || `Event: ${triggerEvent}`}</p>`,
            });
            return { type: 'send_email', status: 'ok' };
        }

        case 'webhook': {
            // params: { url, secret? } — fires an ad-hoc webhook to a specific URL
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
            // params: { entity, field, value }
            // Only supports opportunities for now — extend as needed
            const p = action.params || {};
            const entityId = data.id || data.opportunity_id;
            if (!entityId || !p.field || !p.entity) return { type: 'update_field', status: 'skipped', reason: 'missing params' };
            // Dynamic import to avoid circular deps
            const { db: d, opportunities } = await import('../../db/schema.js').then(m => ({ db, opportunities: m.opportunities }));
            if (p.entity === 'opportunity') {
                await db.update(opportunities)
                    .set({ [p.field]: p.value, updatedAt: new Date() })
                    .where(and(eq(opportunities.id, entityId), eq(opportunities.orgId, orgId)));
                return { type: 'update_field', status: 'ok' };
            }
            return { type: 'update_field', status: 'skipped', reason: 'unsupported entity' };
        }

        default:
            return { type: action.type, status: 'skipped', reason: 'unknown action type' };
    }
};

// ── Main export ───────────────────────────────────────────────────────────────
export const dispatchAutomations = async (orgId, triggerEvent, data) => {
    try {
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

            try {
                // Check conditions
                const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
                if (!evalConditions(conditions, data)) {
                    // Conditions not met — log as skipped
                    await db.insert(automationRuns).values({
                        id:               runId,
                        orgId,
                        automationId:     rule.id,
                        automationName:   rule.name,
                        triggerEvent,
                        triggeredBy:      data.id || null,
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
                        await executeAction(action, orgId, triggerEvent, data);
                        actionsExecuted++;
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

            // Write run log and bump runCount
            await Promise.allSettled([
                db.insert(automationRuns).values({
                    id:               runId,
                    orgId,
                    automationId:     rule.id,
                    automationName:   rule.name,
                    triggerEvent,
                    triggeredBy:      data.id || null,
                    status,
                    actionsExecuted,
                    error:            errorMsg,
                    createdAt:        new Date(),
                }),
                db.update(automations)
                    .set({ runCount: (rule.runCount || 0) + 1, lastRunAt: new Date(), updatedAt: new Date() })
                    .where(eq(automations.id, rule.id)),
            ]);
        }));
    } catch (e) {
        // Never throw — automations must not break the calling function
        console.error('dispatchAutomations fatal error:', e.message);
    }
};
