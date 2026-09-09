// tests/integration/job-heartbeat.itest.mjs
//
// State §0.98, handoff item 32 (per site since §0.100, item 34) — the heartbeat
// wrapper and job-status against the REAL test database (DATABASE_URL_TEST;
// db/apply-site-job-heartbeats.mjs --test first). The rows are site-wide by
// design, so this suite owns its own job names (itest_hb_*) instead of an org
// namespace (guide §18b25's intent) and deletes them before and after. The
// site is what the process's URL says, so the suite names two sites of its
// own and proves one never reads the other's row.
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
const { siteJobHeartbeats } = await import('../../db/schema.js');
const { and, eq, like, sql } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

// Two deployments of this suite's own. The wrapper and job-status read the
// site from process.env.URL and the flag from process.env.JOBS_ENABLED at call
// time (item 36), so a test sets both around each call and puts back whatever
// the shell had. Both suite sites are ENABLED unless a test says otherwise.
const SITE_A_URL = 'https://itest-hb-a.example.com', SITE_A = 'itest-hb-a.example.com';
const SITE_B_URL = 'https://itest-hb-b.example.com', SITE_B = 'itest-hb-b.example.com';
const onSite = async (url, fn, { enabled = true } = {}) => {
    const prev = process.env.URL, prevFlag = process.env.JOBS_ENABLED;
    process.env.URL = url;
    if (enabled) process.env.JOBS_ENABLED = 'true'; else delete process.env.JOBS_ENABLED;
    try { return await fn(); }
    finally {
        if (prev === undefined) delete process.env.URL; else process.env.URL = prev;
        if (prevFlag === undefined) delete process.env.JOBS_ENABLED; else process.env.JOBS_ENABLED = prevFlag;
    }
};

// The driver hands a `timestamp without time zone` back as a Date parsed in
// LOCAL time on this machine (state §0.91's trap); ordering between two such
// Dates holds, an absolute comparison does not. For "stamped now" the column
// is read as text and parsed as the UTC it was written in.
const ms = (v) => (v instanceof Date ? v.getTime() : Date.parse(v));
const finishedUtcMs = async (site, job) => {
    const r = await db.execute(sql`select last_finished_at::text as t from site_job_heartbeats where site = ${site} and job = ${job}`);
    const t = (r.rows || r)[0]?.t;
    return t ? Date.parse(t.replace(' ', 'T') + 'Z') : null;
};

const JOB_OK = 'itest_hb_ok', JOB_500 = 'itest_hb_500', JOB_THROW = 'itest_hb_throw';
const rowOf = async (site, job) => (await db.select().from(siteJobHeartbeats).where(and(eq(siteJobHeartbeats.site, site), eq(siteJobHeartbeats.job, job))))[0];
const cleanup = async () => { await db.delete(siteJobHeartbeats).where(like(siteJobHeartbeats.job, 'itest_hb_%')); };
const status = (org, role) => jobStatus({ httpMethod: 'GET', headers: org ? { 'x-test-org': org, ...(role ? { 'x-test-role': role } : {}) } : {} });

before(async () => { await assertTestSchema(db); await cleanup(); });
after(async () => { await cleanup(); });

test('an ok run stamps start and finish for THIS site, keeps the handler\'s counts, and returns the handler\'s own result', async () => {
    const wrapped = withHeartbeat(JOB_OK, async () => ({ statusCode: 200, body: JSON.stringify({ sent: 2, skipped: 1 }) }));
    const before1 = Date.now();
    const res = await onSite(SITE_A_URL, () => wrapped({}, {}));
    assert.deepEqual(res, { statusCode: 200, body: JSON.stringify({ sent: 2, skipped: 1 }) }, 'returned exactly');
    const row = await rowOf(SITE_A, JOB_OK);
    assert.ok(row, 'the row exists, keyed by the site the process belongs to');
    assert.equal(row.site, SITE_A);
    assert.equal(row.lastStatus, 'ok');
    assert.equal(row.okCount, 1);
    assert.equal(row.errorCount, 0);
    assert.equal(row.lastError, null);
    assert.deepEqual(row.lastSummary, { sent: 2, skipped: 1 });
    assert.ok(row.lastStartedAt && row.lastFinishedAt, 'both stamps');
    assert.ok(ms(row.lastFinishedAt) >= ms(row.lastStartedAt) - 1000, 'finished after started');
    const finishedUtc = await finishedUtcMs(SITE_A, JOB_OK);
    assert.ok(finishedUtc != null && Math.abs(finishedUtc - before1) < 60000, `stamped now, in UTC (stored ${finishedUtc}, now ${before1})`);
    await onSite(SITE_A_URL, () => wrapped({}, {}));
    assert.equal((await rowOf(SITE_A, JOB_OK)).okCount, 2, 'the count is incremented in the database');
});

test('the same job on another site is its own row — a run there touches nothing of the first site\'s', async () => {
    const wrapped = withHeartbeat(JOB_OK, async () => ({ statusCode: 200, body: JSON.stringify({ sent: 9 }) }));
    await onSite(SITE_B_URL, () => wrapped({}, {}));
    const b = await rowOf(SITE_B, JOB_OK);
    assert.ok(b, 'site B has its own row');
    assert.equal(b.okCount, 1);
    assert.deepEqual(b.lastSummary, { sent: 9 });
    const a = await rowOf(SITE_A, JOB_OK);
    assert.equal(a.okCount, 2, 'REGRESSION (item 34): site A\'s count is untouched by site B\'s run');
    assert.deepEqual(a.lastSummary, { sent: 2, skipped: 1 }, 'site A\'s summary is its own last run');
});

test('a run that answers 500 is on record as an error, with the body as the reason', async () => {
    const wrapped = withHeartbeat(JOB_500, async () => ({ statusCode: 500, body: 'profile is not defined' }));
    const res = await onSite(SITE_A_URL, () => wrapped({}, {}));
    assert.equal(res.statusCode, 500, 'the result is unchanged');
    const row = await rowOf(SITE_A, JOB_500);
    assert.equal(row.lastStatus, 'error');
    assert.equal(row.lastError, 'profile is not defined', 'REGRESSION: the April failure would have been visible from the first hour');
    assert.equal(row.errorCount, 1);
    assert.equal(row.okCount, 0);
});

test('a run that throws is stamped as an error and STILL throws', async () => {
    const wrapped = withHeartbeat(JOB_THROW, async () => { throw new Error('kaboom'); });
    await assert.rejects(() => onSite(SITE_A_URL, () => wrapped({}, {})), /kaboom/);
    const row = await rowOf(SITE_A, JOB_THROW);
    assert.equal(row.lastStatus, 'error');
    assert.equal(row.lastError, 'kaboom');
    assert.equal(row.errorCount, 1);
});

test('REGRESSION (item 36): a site whose JOBS_ENABLED is not "true" does not call the handler and stamps nothing — and job-status says enabled:false there', async () => {
    let called = 0;
    const wrapped = withHeartbeat('itest_hb_disabled', async () => { called++; return { statusCode: 200, body: 'ran' }; });
    const res = await onSite(SITE_B_URL, () => wrapped({}, {}), { enabled: false });
    assert.equal(called, 0, 'the handler never ran');
    assert.deepEqual(res, { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'JOBS_ENABLED is not "true" on this site' }) }, 'a 200 that says why');
    assert.equal(await rowOf(SITE_B, 'itest_hb_disabled'), undefined, 'no row — a disabled site leaves no heartbeat');
    const off = JSON.parse((await onSite(SITE_B_URL, () => status('itest_hb_org'), { enabled: false })).body);
    assert.equal(off.enabled, false, 'job-status reports the flag');
    assert.equal(off.site, SITE_B);
    const onAgain = await onSite(SITE_B_URL, () => wrapped({}, {}));
    assert.equal(called, 1, 'with the flag on, the same wrapper runs');
    assert.equal(onAgain.body, 'ran');
    assert.equal((await rowOf(SITE_B, 'itest_hb_disabled')).okCount, 1);
});

test('job-status: an Admin reads every row OF THIS SITE and none of another\'s; a User is 403; no session is 401; the response names the site, the flag and the server clock', async () => {
    const ok = await onSite(SITE_A_URL, () => status('itest_hb_org'));
    assert.equal(ok.statusCode, 200);
    const body = JSON.parse(ok.body);
    assert.ok(typeof body.now === 'string' && !Number.isNaN(Date.parse(body.now)));
    assert.equal(body.site, SITE_A, 'the response says which deployment it describes');
    assert.equal(body.enabled, true, 'and whether it runs its jobs (item 36)');
    const jobs = body.jobs.map(j => j.job);
    for (const j of [JOB_OK, JOB_500, JOB_THROW]) assert.ok(jobs.includes(j), j);
    assert.equal(jobs.filter(j => j === JOB_OK).length, 1, 'REGRESSION (item 34): site B\'s row for the same job is not in site A\'s answer');
    const byJob = Object.fromEntries(body.jobs.map(j => [j.job, j]));
    assert.equal(byJob[JOB_OK].okCount, 2, 'site A\'s own count, not B\'s');
    assert.equal(byJob[JOB_500].lastStatus, 'error');
    assert.ok(body.jobs.every(j => j.site === SITE_A), 'every row is this site\'s');
    const onB = JSON.parse((await onSite(SITE_B_URL, () => status('itest_hb_org'))).body);
    assert.equal(onB.site, SITE_B);
    const bJobs = onB.jobs.filter(j => j.job.startsWith('itest_hb_')).sort((x, y) => x.job.localeCompare(y.job));
    assert.deepEqual(bJobs.map(j => [j.job, j.okCount]), [['itest_hb_disabled', 1], [JOB_OK, 1]], 'site B sees its two rows (its ok run, and the flag test\'s enabled run) and nothing of site A\'s');
    assert.equal((await onSite(SITE_A_URL, () => status('itest_hb_org', 'User'))).statusCode, 403);
    assert.equal((await onSite(SITE_A_URL, () => status('itest_hb_org', 'Manager'))).statusCode, 403);
    assert.equal((await onSite(SITE_A_URL, () => status(null))).statusCode, 401);
});
