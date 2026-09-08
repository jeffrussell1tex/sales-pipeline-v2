// _heartbeat.mjs — every scheduled function stamps its run (state §0.98,
// handoff item 32; per site since §0.100, handoff item 34).
//
// Origin: pipeline-alerts threw on its first deal and answered 500 every hour
// for five months (§0.95); the only record was Netlify's function log, which
// nothing in the app reads. Now a scheduled handler is wrapped:
//
//     export const handler = withHeartbeat('pipeline-alerts', run);
//
// and the site_job_heartbeats row for (this site, that job) says when it last
// started, when it last finished, whether that was ok or an error (a thrown
// error, or a status of 400+), the error text, and the counts the handler
// returned. `site` is the deployment that ran it — siteKey(process.env), the
// host of Netlify's URL — because dev and prod share one database and a row
// keyed by job alone said the job ran SOMEWHERE (item 34). Stamping never
// breaks the job: a failed stamp is logged and the run continues; the wrapper
// returns exactly what the handler returned, and rethrows exactly what it
// threw. Site-scoped, never org-scoped, by design — see the schema note.
import { db } from '../../db/index.js';
import { siteJobHeartbeats } from '../../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { SCHEDULED_JOBS, finishValues, siteKey } from '../../src/utils/jobHealth.js';

const cronOf = (job) => SCHEDULED_JOBS.find(j => j.job === job)?.cron || null;

async function stampStart(site, job, at) {
    await db.insert(siteJobHeartbeats)
        .values({ site, job, schedule: cronOf(job), lastStartedAt: at, lastStatus: 'running', updatedAt: at })
        .onConflictDoUpdate({ target: [siteJobHeartbeats.site, siteJobHeartbeats.job], set: { schedule: cronOf(job), lastStartedAt: at, lastStatus: 'running', updatedAt: at } });
}

async function stampFinish(site, job, at, { ok, error, summary }) {
    await db.update(siteJobHeartbeats)
        .set({
            lastFinishedAt: at,
            lastStatus: ok ? 'ok' : 'error',
            lastError: error,
            lastSummary: summary,
            okCount:    ok ? sql`${siteJobHeartbeats.okCount} + 1` : siteJobHeartbeats.okCount,
            errorCount: ok ? siteJobHeartbeats.errorCount : sql`${siteJobHeartbeats.errorCount} + 1`,
            updatedAt: at,
        })
        .where(and(eq(siteJobHeartbeats.site, site), eq(siteJobHeartbeats.job, job)));
}

export function withHeartbeat(job, run) {
    if (typeof job !== 'string' || !job) throw new Error('withHeartbeat: a job name is required');
    if (typeof run !== 'function') throw new Error('withHeartbeat: a handler is required');
    return async (event, context) => {
        const site = siteKey(process.env);   // read per run: the deployment this process belongs to
        const startedAt = new Date();
        try { await stampStart(site, job, startedAt); } catch (e) { console.error(`heartbeat(${job}@${site}): start stamp failed:`, e.message); }
        let res, thrown = null;
        try { res = await run(event, context); }
        catch (err) { thrown = err; }
        const fin = finishValues(res, thrown);
        try { await stampFinish(site, job, new Date(), fin); } catch (e) { console.error(`heartbeat(${job}@${site}): finish stamp failed:`, e.message); }
        if (thrown) throw thrown;
        return res;
    };
}
