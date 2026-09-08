// _heartbeat.mjs — every scheduled function stamps its run (state §0.98,
// handoff item 32).
//
// Origin: pipeline-alerts threw on its first deal and answered 500 every hour
// for five months (§0.95); the only record was Netlify's function log, which
// nothing in the app reads. Now a scheduled handler is wrapped:
//
//     export const handler = withHeartbeat('pipeline-alerts', run);
//
// and the job_heartbeats row for that job says when it last started, when it
// last finished, whether that was ok or an error (a thrown error, or a status
// of 400+), the error text, and the counts the handler returned. Stamping
// never breaks the job: a failed stamp is logged and the run continues; the
// wrapper returns exactly what the handler returned, and rethrows exactly what
// it threw. Site-wide by design — see the schema note.
import { db } from '../../db/index.js';
import { jobHeartbeats } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { SCHEDULED_JOBS, finishValues } from '../../src/utils/jobHealth.js';

const cronOf = (job) => SCHEDULED_JOBS.find(j => j.job === job)?.cron || null;

async function stampStart(job, at) {
    await db.insert(jobHeartbeats)
        .values({ job, schedule: cronOf(job), lastStartedAt: at, lastStatus: 'running', updatedAt: at })
        .onConflictDoUpdate({ target: jobHeartbeats.job, set: { schedule: cronOf(job), lastStartedAt: at, lastStatus: 'running', updatedAt: at } });
}

async function stampFinish(job, at, { ok, error, summary }) {
    await db.update(jobHeartbeats)
        .set({
            lastFinishedAt: at,
            lastStatus: ok ? 'ok' : 'error',
            lastError: error,
            lastSummary: summary,
            okCount:    ok ? sql`${jobHeartbeats.okCount} + 1` : jobHeartbeats.okCount,
            errorCount: ok ? jobHeartbeats.errorCount : sql`${jobHeartbeats.errorCount} + 1`,
            updatedAt: at,
        })
        .where(eq(jobHeartbeats.job, job));
}

export function withHeartbeat(job, run) {
    if (typeof job !== 'string' || !job) throw new Error('withHeartbeat: a job name is required');
    if (typeof run !== 'function') throw new Error('withHeartbeat: a handler is required');
    return async (event, context) => {
        const startedAt = new Date();
        try { await stampStart(job, startedAt); } catch (e) { console.error(`heartbeat(${job}): start stamp failed:`, e.message); }
        let res, thrown = null;
        try { res = await run(event, context); }
        catch (err) { thrown = err; }
        const fin = finishValues(res, thrown);
        try { await stampFinish(job, new Date(), fin); } catch (e) { console.error(`heartbeat(${job}): finish stamp failed:`, e.message); }
        if (thrown) throw thrown;
        return res;
    };
}
