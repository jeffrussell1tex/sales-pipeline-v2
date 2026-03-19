import { db } from '../../db/index.js';
import { recommendationLog, opportunities, activities, tasks } from '../../db/schema.js';
import { eq, and, desc, gte } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';

const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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
                // Resolved if a new activity with a contactName was logged since dismissal
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

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    const { orgId } = auth;

    try {
        // ── GET: fetch logs + summary stats for a rep ─────────────────────────
        if (event.httpMethod === 'GET') {
            const repName = event.queryStringParameters?.rep;
            const days    = parseInt(event.queryStringParameters?.days || '90');
            const since   = new Date(); since.setDate(since.getDate() - days);

            const query = repName
                ? db.select().from(recommendationLog).where(and(eq(recommendationLog.orgId, orgId), eq(recommendationLog.repName, repName), gte(recommendationLog.dismissedAt, since))).orderBy(desc(recommendationLog.dismissedAt))
                : db.select().from(recommendationLog).where(and(eq(recommendationLog.orgId, orgId), gte(recommendationLog.dismissedAt, since))).orderBy(desc(recommendationLog.dismissedAt));

            const logs = await query;

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
            const [inserted] = await db.insert(recommendationLog).values({
                id:            data.id,
                orgId,
                repName:       data.repName,
                actionType:    data.actionType,
                opportunityId: data.opportunityId || null,
                dealName:      data.dealName      || null,
                arrAtRisk:     data.arrAtRisk      ?? null,
                stage:         data.stage         || null,
                signal:        data.signal        || null,
                outcome:       'pending',
                dismissedAt:   new Date(),
            }).returning();
            return { statusCode: 201, headers, body: JSON.stringify({ log: inserted }) };
        }

        // ── PUT: evaluate pending items and mark resolved/ignored ─────────────
        // Called on home tab load — evaluates items older than 3 days that are still pending
        if (event.httpMethod === 'PUT') {
            const repName = event.queryStringParameters?.rep;
            const threeDaysAgo = new Date(); threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

            const pendingQuery = repName
                ? db.select().from(recommendationLog).where(and(
                    eq(recommendationLog.orgId, orgId),
                    eq(recommendationLog.repName, repName),
                    eq(recommendationLog.outcome, 'pending'),
                    gte(recommendationLog.dismissedAt, new Date(Date.now() - 30 * 86400000)) // last 30 days only
                  ))
                : db.select().from(recommendationLog).where(and(
                    eq(recommendationLog.orgId, orgId),
                    eq(recommendationLog.outcome, 'pending'),
                    gte(recommendationLog.dismissedAt, new Date(Date.now() - 30 * 86400000))
                  ));

            const pending = await pendingQuery;
            // Only evaluate items that have been pending for at least 3 days
            const evaluatable = pending.filter(l => new Date(l.dismissedAt) <= threeDaysAgo);

            const updates = await Promise.allSettled(evaluatable.map(async (log) => {
                const resolved = await checkResolved(log, orgId);
                const daysToResolve = resolved
                    ? Math.floor((Date.now() - new Date(log.dismissedAt).getTime()) / 86400000)
                    : null;
                const outcome = resolved ? 'resolved' : 'ignored';
                await db.update(recommendationLog)
                    .set({ outcome, resolvedAt: resolved ? new Date() : null, daysToResolve })
                    .where(eq(recommendationLog.id, log.id));
                return { id: log.id, outcome };
            }));

            const evaluated = updates.filter(r => r.status === 'fulfilled').map(r => r.value);
            return { statusCode: 200, headers, body: JSON.stringify({ evaluated }) };
        }

        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

    } catch (err) {
        console.error('Recommendation-log error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
