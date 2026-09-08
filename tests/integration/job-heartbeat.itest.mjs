// tests/integration/job-heartbeat.itest.mjs
//
// State §0.98, handoff item 32 — the heartbeat wrapper and job-status against
// the REAL test database (DATABASE_URL_TEST; db/apply-job-heartbeats.mjs --test
// first). The rows are site-wide by design, so this suite owns its own job
// names (itest_hb_*) instead of an org namespace (guide §18b25's intent) and
// deletes them before and after.
import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            return { userId: 'clerk_' + orgId, orgId, userRole, managedReps: [], error: null };
        },
        requireRole: (auth, allowedRoles, headers) => (
            allowedRoles.includes(auth?.userRole) ? null
                : { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) }
        ),
    },
});

const { withHeartbeat } = await import('../../netlify/functions/_heartbeat.mjs');
const { handler: jobStatus } = await import('../../netlify/functions/job-status.mjs');
const { db } = await import('../../db/index.js');
const { jobHeartbeats } = await import('../../db/schema.js');
const { eq, like, sql } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// The driver hands a `timestamp without time zone` back as a Date parsed in
// LOCAL time on this machine (state §0.91's trap); ordering between two such
// Dates holds, an absolute comparison does not. For "stamped now" the column
// is read as text and parsed as the UTC it was written in.
const ms = (v) => (v instanceof Date ? v.getTime() : Date.parse(v));
const finishedUtcMs = async (job) => {
    const r = await db.execute(sql`select last_finished_at::text as t from job_heartbeats where job = ${job}`);
    const t = (r.rows || r)[0]?.t;
    return t ? Date.parse(t.replace(' ', 'T') + 'Z') : null;
};

const JOB_OK = 'itest_hb_ok', JOB_500 = 'itest_hb_500', JOB_THROW = 'itest_hb_throw';
const rowOf = async (job) => (await db.select().from(jobHeartbeats).where(eq(jobHeartbeats.job, job)))[0];
const cleanup = async () => { await db.delete(jobHeartbeats).where(like(jobHeartbeats.job, 'itest_hb_%')); };
const status = (org, role) => jobStatus({ httpMethod: 'GET', headers: org ? { 'x-test-org': org, ...(role ? { 'x-test-role': role } : {}) } : {} });

before(async () => { await assertTestSchema(db); await cleanup(); });
after(async () => { await cleanup(); });

test('an ok run stamps start and finish, keeps the handler\'s counts, and returns the handler\'s own result', async () => {
    const wrapped = withHeartbeat(JOB_OK, async () => ({ statusCode: 200, body: JSON.stringify({ sent: 2, skipped: 1 }) }));
    const before1 = Date.now();
    const res = await wrapped({}, {});
    assert.deepEqual(res, { statusCode: 200, body: JSON.stringify({ sent: 2, skipped: 1 }) }, 'returned exactly');
    const row = await rowOf(JOB_OK);
    assert.ok(row, 'the row exists');
    assert.equal(row.lastStatus, 'ok');
    assert.equal(row.okCount, 1);
    assert.equal(row.errorCount, 0);
    assert.equal(row.lastError, null);
    assert.deepEqual(row.lastSummary, { sent: 2, skipped: 1 });
    assert.ok(row.lastStartedAt && row.lastFinishedAt, 'both stamps');
    assert.ok(ms(row.lastFinishedAt) >= ms(row.lastStartedAt) - 1000, 'finished after started');
    const finishedUtc = await finishedUtcMs(JOB_OK);
    assert.ok(finishedUtc != null && Math.abs(finishedUtc - before1) < 60000, `stamped now, in UTC (stored ${finishedUtc}, now ${before1})`);
    await wrapped({}, {});
    assert.equal((await rowOf(JOB_OK)).okCount, 2, 'the count is incremented in the database');
});

test('a run that answers 500 is on record as an error, with the body as the reason', async () => {
    const wrapped = withHeartbeat(JOB_500, async () => ({ statusCode: 500, body: 'profile is not defined' }));
    const res = await wrapped({}, {});
    assert.equal(res.statusCode, 500, 'the result is unchanged');
    const row = await rowOf(JOB_500);
    assert.equal(row.lastStatus, 'error');
    assert.equal(row.lastError, 'profile is not defined', 'REGRESSION: the April failure would have been visible from the first hour');
    assert.equal(row.errorCount, 1);
    assert.equal(row.okCount, 0);
});

test('a run that throws is stamped as an error and STILL throws', async () => {
    const wrapped = withHeartbeat(JOB_THROW, async () => { throw new Error('kaboom'); });
    await assert.rejects(() => wrapped({}, {}), /kaboom/);
    const row = await rowOf(JOB_THROW);
    assert.equal(row.lastStatus, 'error');
    assert.equal(row.lastError, 'kaboom');
    assert.equal(row.errorCount, 1);
});

test('job-status: an Admin reads every row; a User is 403; no session is 401; the response carries the server clock', async () => {
    const ok = await status('itest_hb_org');
    assert.equal(ok.statusCode, 200);
    const body = JSON.parse(ok.body);
    assert.ok(typeof body.now === 'string' && !Number.isNaN(Date.parse(body.now)));
    const jobs = body.jobs.map(j => j.job);
    for (const j of [JOB_OK, JOB_500, JOB_THROW]) assert.ok(jobs.includes(j), j);
    const byJob = Object.fromEntries(body.jobs.map(j => [j.job, j]));
    assert.equal(byJob[JOB_500].lastStatus, 'error');
    assert.equal((await status('itest_hb_org', 'User')).statusCode, 403);
    assert.equal((await status('itest_hb_org', 'Manager')).statusCode, 403);
    assert.equal((await status(null)).statusCode, 401);
});
