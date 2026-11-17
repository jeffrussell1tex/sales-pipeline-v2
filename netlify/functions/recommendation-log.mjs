import { db } from '../../db/index.js';
import { recommendationLog, opportunities, activities, tasks } from '../../db/schema.js';
import { eq, and, desc, gte, lte, notLike } from 'drizzle-orm';
import { verifyAuth, requireWrite, canSeeAll } from './auth.mjs';
import { serverErrorBody, auditAs, getCallerName } from './_lib.mjs';
// A next step's window, an alert's wait, a stage day within a window (AI scoring batch 3 — src/utils/nextSteps.js).
import { NEXT_STEP_DAYS, ALERT_WAIT_DAYS, stageMovedWithin } from '../../src/utils/nextSteps.js';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── Whose log a call reads or writes (state §0.191) ─────────────────────────
// An Admin or Manager names any rep (or none: the whole org); everyone else is
// held to their own. The log's rows name their rep (repName, the deal's
// salesRep) and carry no owner id, so "their own" is the caller's roster name.
// Before this, `?rep=` read any teammate's log, and a POST could write a row in
// a teammate's name — which pipeline-alerts reads as "already alerted", and
// stays quiet on that deal. Returns { repName } (null: every rep) or { none }
// when the caller has no roster name: they own no row, so they read and write
// none (fail closed, guide 18b19).
async function repScopeOf(auth, requested) {
    if (canSeeAll(auth.userRole)) return { repName: requested || null };
    const own = await getCallerName(auth.userId, auth.orgId);
    return own ? { repName: own } : { none: true };
}

// ── Resolution check per action type ─────────────────────────────────────────
// Returns true if the underlying signal has been resolved since dismissedAt
async function checkResolved(log, orgId) {
    const since = log.dismissedAt;
    const oppId = log.opportunityId;

    try {
        switch (log.actionType) {
            case 'stale': {
                // Resolved if a new activity was logged on this deal since dismissal
                if (!oppId) return false;
                const acts = await db.select({ id: activities.id })
                    .from(activities)
                    .where(and(eq(activities.opportunityId, oppId), eq(activities.orgId, orgId), gte(activities.createdAt, since)))
                    .limit(1);
                return acts.length > 0;
            }
            case 'stuck': {
                // Resolved if stage changed since dismissal
                if (!oppId) return false;
                const [opp] = await db.select({ stageChangedDate: opportunities.stageChangedDate })
                    .from(opportunities)
                    .where(and(eq(opportunities.id, oppId), eq(opportunities.orgId, orgId)));
                if (!opp?.stageChangedDate) return false;
                return new Date(opp.stageChangedDate + 'T12:00:00') >= new Date(since);
            }
            case 'lapsed': {
                // Resolved if close date updated since dismissal, or deal closed
                if (!oppId) return false;
                const [opp] = await db.select({ stage: opportunities.stage, updatedAt: opportunities.updatedAt })
                    .from(opportunities)
                    .where(and(eq(opportunities.id, oppId), eq(opportunities.orgId, orgId)));
                if (!opp) return false;
                const isClosedOrUpdated = ['Closed Won','Closed Lost'].includes(opp.stage) || new Date(opp.updatedAt) >= new Date(since);
                return isClosedOrUpdated;
            }
            case 'coverage': {
                // Resolved if any activity was logged on the deal since dismissal (no writer logs a 'coverage' row; Home's Missing stakeholder card is client-side)
                if (!oppId) return false;
                const acts = await db.select({ id: activities.id })
                    .from(activities)
                    .where(and(eq(activities.opportunityId, oppId), eq(activities.orgId, orgId), gte(activities.createdAt, since)))
                    .limit(1);
                return acts.length > 0;
            }
            case 'velocity': {
                // Resolved if a task was created or stage advanced since dismissal
                if (!oppId) return false;
                const [opp] = await db.select({ stageChangedDate: opportunities.stageChangedDate })
                    .from(opportunities)
                    .where(and(eq(opportunities.id, oppId), eq(opportunities.orgId, orgId)));
                return opp?.stageChangedDate && new Date(opp.stageChangedDate + 'T12:00:00') >= new Date(since);
            }
            case 'next_step': {
                // Claude's next action (AI scoring batch 3 — Jeff, 17 Nov, Q2): acted on when an activity is logged on the
                // deal, or its stage moves, within NEXT_STEP_DAYS of it. Nothing for the rep to press.
                if (!oppId) return false;
                const until = new Date(new Date(since).getTime() + NEXT_STEP_DAYS * 86400000);
                const acts = await db.select({ id: activities.id })
                    .from(activities)
                    .where(and(eq(activities.opportunityId, oppId), eq(activities.orgId, orgId), gte(activities.createdAt, since), lte(activities.createdAt, until)))
                    .limit(1);
                if (acts.length) return true;
                const [opp] = await db.select({ stageChangedDate: opportunities.stageChangedDate })
                    .from(opportunities)
                    .where(and(eq(opportunities.id, oppId), eq(opportunities.orgId, orgId)));
                return stageMovedWithin(opp?.stageChangedDate, since, until);
            }
            case 'scoreDrop': {
                // The win chance's fall into Critical (AI scoring batch 2C): resolved once the deal is out of Critical or closed.
                if (!oppId) return false;
                const [opp] = await db.select({ stage: opportunities.stage, win: opportunities.dealScore })
                    .from(opportunities)
                    .where(and(eq(opportunities.id, oppId), eq(opportunities.orgId, orgId)));
                if (!opp) return false;
                return ['Closed Won', 'Closed Lost'].includes(opp.stage) || (!!opp.win?.status && opp.win.status !== 'Critical');
            }
            case 'task': {
                // Resolved if the task is now completed
                const taskId = log.opportunityId; // we store taskId in opportunityId for task actions
                if (!taskId) return false;
                const [task] = await db.select({ completed: tasks.completed, status: tasks.status })
                    .from(tasks)
                    .where(and(eq(tasks.id, taskId), eq(tasks.orgId, orgId)));
                return task?.completed || task?.status === 'Completed';
            }
            default:
                return false;
        }
    } catch (err) {
        console.error('checkResolved error:', err.message);
        return false;
    }
}

// One row's verdict now: 'resolved' | 'ignored', or null when it is not yet time to judge. A next step is resolved the
// moment the deal moves and ignored only when its window has passed; an alert is judged once it is ALERT_WAIT_DAYS old.
export async function verdictOf(log, orgId, now = new Date()) {
    const ageDays = (now.getTime() - new Date(log.dismissedAt).getTime()) / 86400000;
    if (log.actionType === 'next_step') {
        if (await checkResolved(log, orgId)) return 'resolved';
        return ageDays >= NEXT_STEP_DAYS ? 'ignored' : null;
    }
    if (ageDays < ALERT_WAIT_DAYS) return null;
    return (await checkResolved(log, orgId)) ? 'resolved' : 'ignored';
}

// Judge the org's pending rows of the last 30 days — one rep's, or every rep's — and keep each verdict. The renewal
// ledger's rows are not recommendations (the GET leaves them out) and are left as they are. → [{ id, outcome }]
export async function judgePending(orgId, repName = null, now = new Date()) {
    const pending = await db.select().from(recommendationLog).where(and(
        eq(recommendationLog.orgId, orgId),
        ...(repName ? [eq(recommendationLog.repName, repName)] : []),
        eq(recommendationLog.outcome, 'pending'),
        notLike(recommendationLog.actionType, 'renewal%'),
        gte(recommendationLog.dismissedAt, new Date(now.getTime() - 30 * 86400000)),
    ));
    const updates = await Promise.allSettled(pending.map(async (log) => {
        const outcome = await verdictOf(log, orgId, now);
        if (!outcome) return null;
        const resolved = outcome === 'resolved';
        const daysToResolve = resolved ? Math.floor((now.getTime() - new Date(log.dismissedAt).getTime()) / 86400000) : null;
        await db.update(recommendationLog)
            .set({ outcome, resolvedAt: resolved ? now : null, daysToResolve })
            .where(and(eq(recommendationLog.id, log.id), eq(recommendationLog.orgId, orgId)));
        return { id: log.id, outcome };
    }));
    return updates.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
}

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId } = auth;

    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;

    try {
        // ── GET: fetch logs + summary stats for a rep ─────────────────────────
        if (event.httpMethod === 'GET') {
            const scope   = await repScopeOf(auth, event.queryStringParameters?.rep);
            const repName = scope.repName;
            const days    = parseInt(event.queryStringParameters?.days || '90');
            const since   = new Date(); since.setDate(since.getDate() - days);

            // Agreement-renewal alerts (state §0.110) dedupe through this ledger
            // too, keyed on a dispatch customer rather than a deal. They are not
            // recommendations and never resolve, so the report never sees them.
            const base = [
                eq(recommendationLog.orgId, orgId),
                gte(recommendationLog.dismissedAt, since),
                notLike(recommendationLog.actionType, 'renewal%'),
            ];
            const query = db.select().from(recommendationLog)
                .where(and(...base, ...(repName ? [eq(recommendationLog.repName, repName)] : [])))
                .orderBy(desc(recommendationLog.dismissedAt));

            const logs = scope.none ? [] : await query;

            // Summary stats
            const total      = logs.length;
            const resolved   = logs.filter(l => l.outcome === 'resolved').length;
            const ignored    = logs.filter(l => l.outcome === 'ignored').length;
            const pending    = logs.filter(l => l.outcome === 'pending').length;
            const resolveRate = total > 0 ? Math.round((resolved / total) * 100) : null;
            const avgDays    = resolved > 0
                ? Math.round(logs.filter(l => l.daysToResolve != null).reduce((s,l) => s + l.daysToResolve, 0) / resolved)
                : null;

            // Per-type breakdown
            const byType = {};
            logs.forEach(l => {
                if (!byType[l.actionType]) byType[l.actionType] = { total: 0, resolved: 0 };
                byType[l.actionType].total++;
                if (l.outcome === 'resolved') byType[l.actionType].resolved++;
            });

            return { statusCode: 200, headers, body: JSON.stringify({
                logs,
                summary: { total, resolved, ignored, pending, resolveRate, avgDays, byType }
            })};
        }

        // ── POST: log a dismissed recommendation ──────────────────────────────
        if (event.httpMethod === 'POST') {
            const data = JSON.parse(event.body);
            if (!data.id || !data.repName || !data.actionType) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'id, repName, actionType required' }) };
            }
            const scope = await repScopeOf(auth, data.repName);
            if (scope.none) {
                return { statusCode: 403, headers, body: JSON.stringify({ error: "Your account is not in this organization's roster." }) };
            }
            const [inserted] = await db.insert(recommendationLog).values({
                id:            data.id,
                orgId,
                repName:       scope.repName,
                actionType:    data.actionType,
                opportunityId: data.opportunityId || null,
                dealName:      data.dealName      || null,
                arrAtRisk:     data.arrAtRisk      ?? null,
                stage:         data.stage         || null,
                signal:        data.signal        || null,
                outcome:       'pending',
                dismissedAt:   new Date(),
            }).returning();
            await auditAs(orgId, auth.userId, { action: 'recommendation.dismissed', entityType: 'recommendation', entityId: inserted.id, entityName: inserted.dealName || inserted.actionType, detail: `${inserted.actionType}${inserted.signal ? ' · ' + inserted.signal : ''}${inserted.stage ? ' · ' + inserted.stage : ''}` });
            return { statusCode: 201, headers, body: JSON.stringify({ log: inserted }) };
        }

        // ── PUT: evaluate pending items and mark resolved/ignored ─────────────
        // Called on home tab load — evaluates items older than 3 days that are still pending
        if (event.httpMethod === 'PUT') {
            const scope   = await repScopeOf(auth, event.queryStringParameters?.rep);
            if (scope.none) return { statusCode: 200, headers, body: JSON.stringify({ evaluated: [] }) };
            const repName = scope.repName;
            // The pass (judgePending, above) — the same the nightly deal-scoring pass runs for each org (AI scoring batch 3, Q5).
            const evaluated = await judgePending(orgId, repName);
            return { statusCode: 200, headers, body: JSON.stringify({ evaluated }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('Recommendation-log error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'recommendation-log') };
    }
};
