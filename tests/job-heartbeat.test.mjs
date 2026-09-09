// tests/job-heartbeat.test.mjs
//
// State §0.98, handoff item 32. pipeline-alerts answered 500 every hour for
// five months (§0.95) and nothing the app shows said so. Now every scheduled
// function runs through withHeartbeat(), which stamps a site_job_heartbeats row
// (one per SITE and job since §0.100, item 34 — dev and prod share the database;
// no tenant data) at start and finish; job-status.mjs (Admin-only) returns its
// own site's rows; jobHealth() turns them into a verdict for the
// Settings health tile and the Slack card. The pure module is exercised here;
// the wrapper against the real database is tests/integration/job-heartbeat.itest.mjs;
// the source scans pin the wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
    SCHEDULED_JOBS, HEARTBEAT_GRACE_MS, stallAfterMs, jobHealth, agoLabel, jobLine, jobsCheck, finishValues, siteKey, jobsEnabled,
} from '../src/utils/jobHealth.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const H = 3600000, MIN = 60000;
const NOW = Date.parse('2026-09-08T22:00:00Z');
const at = (msAgo) => new Date(NOW - msAgo).toISOString();

// ── the pure module ──────────────────────────────────────────────────────────

test('the four scheduled jobs are the four in netlify.toml, with the same crons', () => {
    const toml = read('netlify.toml');
    assert.equal(SCHEDULED_JOBS.length, 4);
    for (const j of SCHEDULED_JOBS) {
        assert.match(toml, new RegExp(`\\[functions\\."${j.job}"\\]\\r?\\nschedule = "${j.cron.replace(/\*/g, '\\*')}"`), `${j.job} is scheduled ${j.cron} in netlify.toml`);
        assert.ok(existsSync(new URL(`../netlify/functions/${j.job}.mjs`, import.meta.url)), `${j.job}.mjs exists`);
    }
    assert.equal(stallAfterMs(H), 2 * H + HEARTBEAT_GRACE_MS, 'two missed runs plus grace');
    assert.equal(stallAfterMs(undefined), 2 * H + HEARTBEAT_GRACE_MS, 'unknown cadence: hourly');
});

test('jobHealth: never / ok / stalled / error, per job, against the given clock', () => {
    const none = jobHealth([], NOW);
    assert.deepEqual(none.map(j => [j.job, j.status, j.ok]), [['pipeline-alerts', 'never', false], ['digest', 'never', false], ['task-reminders', 'never', false], ['score-leads-batch', 'never', false]]);
    const rows = [
        { job: 'pipeline-alerts',   lastStartedAt: at(5 * MIN), lastFinishedAt: at(4 * MIN), lastStatus: 'ok', okCount: 3, errorCount: 0 },
        { job: 'digest',            lastStartedAt: at(3 * H),   lastFinishedAt: at(3 * H),   lastStatus: 'ok', okCount: '7', errorCount: 1 },
        { job: 'task-reminders',    lastStartedAt: at(MIN),     lastFinishedAt: at(MIN),     lastStatus: 'error', lastError: 'boom', okCount: 0, errorCount: 2 },
        { job: 'score-leads-batch', lastStartedAt: at(20 * H),  lastFinishedAt: at(20 * H),  lastStatus: 'ok' },
        { job: 'not-a-job',         lastFinishedAt: at(0), lastStatus: 'ok' },
    ];
    const h = jobHealth(rows, NOW);
    const by = Object.fromEntries(h.map(j => [j.job, j]));
    assert.equal(by['pipeline-alerts'].status, 'ok');
    assert.equal(by['pipeline-alerts'].okCount, 3);
    assert.equal(by['digest'].status, 'stalled', 'REGRESSION: an hourly job last finished 3h ago reads ok');
    assert.equal(by['digest'].okCount, 7, 'a string count is a number');
    assert.equal(by['task-reminders'].status, 'error');
    assert.equal(by['task-reminders'].lastError, 'boom');
    assert.equal(by['score-leads-batch'].status, 'ok', 'a daily job 20h old is on time');
    assert.equal(h.length, 4, 'an unknown row is ignored');
    assert.equal(by['pipeline-alerts'].ageMs, 4 * MIN);
    // Boundaries for the hourly window: 2h10m.
    assert.equal(jobHealth([{ job: 'digest', lastFinishedAt: at(2 * H + 9 * MIN), lastStatus: 'ok' }], NOW)[1].status, 'ok');
    assert.equal(jobHealth([{ job: 'digest', lastFinishedAt: at(2 * H + 11 * MIN), lastStatus: 'ok' }], NOW)[1].status, 'stalled');
    // Started and never finished: recent is "never" (still running or died mid-run once), old is stalled.
    assert.equal(jobHealth([{ job: 'pipeline-alerts', lastStartedAt: at(2 * MIN), lastStatus: 'running' }], NOW)[0].status, 'never');
    assert.equal(jobHealth([{ job: 'pipeline-alerts', lastStartedAt: at(5 * H), lastStatus: 'running' }], NOW)[0].status, 'stalled');
    assert.equal(jobHealth(null, NOW).length, 4, 'garbage rows: four verdicts, all never');
    assert.equal(jobHealth([{ job: 'digest', lastFinishedAt: 'not a date', lastStatus: 'ok' }], NOW)[1].status, 'never', 'an unreadable date is no finish');
});

test('agoLabel, jobLine and jobsCheck say it in words', () => {
    assert.equal(agoLabel(null), 'never');
    assert.equal(agoLabel(20 * 1000), 'just now');
    assert.equal(agoLabel(12 * MIN), '12m ago');
    assert.equal(agoLabel(3 * H), '3h ago');
    assert.equal(agoLabel(72 * H), '3d ago');
    assert.equal(jobLine({ status: 'never' }), 'Has not run yet');
    assert.equal(jobLine({ status: 'ok', ageMs: 12 * MIN }), 'Last ran 12m ago · ok');
    assert.equal(jobLine({ status: 'error', ageMs: 3 * H, lastError: 'profile is not defined' }), 'Last run failed 3h ago — profile is not defined');
    assert.equal(jobLine({ status: 'stalled', ageMs: 72 * H }), 'Stalled — last finished 3d ago');
    assert.equal(jobLine(null), '');
    assert.equal(jobsCheck([]), null, 'nothing to check until the rows are read');
    assert.deepEqual(jobsCheck([{ label: 'A', ok: true, status: 'ok' }]), { id: 'jobs', label: 'Scheduled jobs running', ok: true });
    assert.deepEqual(jobsCheck([{ label: 'Pipeline alerts', ok: false, status: 'error' }, { label: 'Daily digest', ok: false, status: 'never' }, { label: 'X', ok: true, status: 'ok' }]),
        { id: 'jobs', label: 'Scheduled jobs: Pipeline alerts error, Daily digest has not run', ok: false });
});

test('siteKey names the deployment from its URL, then SITE_NAME, then "local" — never the same for two sites', () => {
    assert.equal(siteKey({ URL: 'https://accelerep.netlify.app' }), 'accelerep.netlify.app');
    assert.equal(siteKey({ URL: 'https://salespipelinetracker.com', SITE_NAME: 'ignored' }), 'salespipelinetracker.com', 'URL wins');
    assert.equal(siteKey({ URL: 'http://localhost:8888' }), 'localhost:8888', 'netlify dev keeps its port');
    assert.equal(siteKey({ URL: ' https://a.example.com/ ' }), 'a.example.com', 'trimmed, path dropped');
    assert.equal(siteKey({ URL: 'not a url', SITE_NAME: 'accelerep' }), 'accelerep', 'an unreadable URL falls to SITE_NAME');
    assert.equal(siteKey({ SITE_NAME: 'accelerep' }), 'accelerep');
    assert.equal(siteKey({ URL: '', SITE_NAME: ' ' }), 'local');
    assert.equal(siteKey({}), 'local');
    assert.equal(siteKey(undefined), 'local');
    assert.notEqual(siteKey({ URL: 'https://accelerep.netlify.app' }), siteKey({ URL: 'https://salespipelinetracker.com' }), 'REGRESSION (item 34): dev and prod must never share a row');
});

// ── item 36 (§0.103): one site runs the jobs ─────────────────────────────────

test('jobsEnabled: exactly "true" (trimmed, any case) and nothing else — unset is OFF, so a new site never double-sends', () => {
    assert.equal(jobsEnabled({ JOBS_ENABLED: 'true' }), true);
    assert.equal(jobsEnabled({ JOBS_ENABLED: ' TRUE ' }), true, 'trimmed, case-insensitive');
    assert.equal(jobsEnabled({ JOBS_ENABLED: 'false' }), false);
    assert.equal(jobsEnabled({ JOBS_ENABLED: '1' }), false, '"1" is not the word');
    assert.equal(jobsEnabled({ JOBS_ENABLED: 'yes' }), false);
    assert.equal(jobsEnabled({ JOBS_ENABLED: '' }), false);
    assert.equal(jobsEnabled({ JOBS_ENABLED: true }), false, 'a boolean is not an env string');
    assert.equal(jobsEnabled({}), false, 'REGRESSION (item 36): unset means OFF');
    assert.equal(jobsEnabled(undefined), false);
    assert.equal(jobsEnabled({ URL: 'https://salespipelinetracker.com' }), false, 'the host alone does not enable anything — only the flag does');
});

test('jobHealth with enabled:false is "disabled" for every job whatever the rows say; the tile check is NOT ok; the card line says so', () => {
    const fresh = [
        { job: 'pipeline-alerts',   lastStartedAt: at(5 * MIN), lastFinishedAt: at(4 * MIN), lastStatus: 'ok', okCount: 3, errorCount: 0 },
        { job: 'task-reminders',    lastStartedAt: at(MIN),     lastFinishedAt: at(MIN),     lastStatus: 'ok', okCount: 9, errorCount: 0 },
    ];
    const h = jobHealth(fresh, NOW, { enabled: false });
    assert.equal(h.length, 4);
    assert.ok(h.every(j => j.status === 'disabled' && j.ok === false), 'REGRESSION (item 36): old rows would otherwise read ok or stalled on a site that no longer runs anything');
    assert.equal(h[0].okCount, 3, 'the row\'s counts still ride along');
    assert.deepEqual(jobsCheck(h), { id: 'jobs', label: 'Scheduled jobs not enabled on this site (JOBS_ENABLED)', ok: false }, 'REGRESSION: a forgotten flag on prod must never read as healthy');
    assert.equal(jobLine(h[0]), 'Not enabled on this site (JOBS_ENABLED)');
    assert.equal(jobHealth(fresh, NOW, { enabled: true })[0].status, 'ok', 'enabled:true is the ordinary verdict');
    assert.equal(jobHealth(fresh, NOW)[0].status, 'ok', 'the option defaults to enabled (an older server that does not say)');
    assert.equal(jobHealth(fresh, NOW, {})[0].status, 'ok');
});

test('finishValues: a throw or a 400+ is an error, the body is the summary, parsed when JSON', () => {
    assert.deepEqual(finishValues({ statusCode: 200, body: JSON.stringify({ emailsSent: 2, smsSent: 0, skipped: 5 }) }), { ok: true, error: null, summary: { emailsSent: 2, smsSent: 0, skipped: 5 } });
    assert.deepEqual(finishValues({ statusCode: 200, body: 'Digest complete' }), { ok: true, error: null, summary: { body: 'Digest complete' } });
    assert.deepEqual(finishValues({ statusCode: 500, body: 'profile is not defined' }), { ok: false, error: 'profile is not defined', summary: { body: 'profile is not defined' } }, 'REGRESSION: the April failure, on record');
    assert.deepEqual(finishValues({ statusCode: 500, body: JSON.stringify({ error: 'batch failed' }) }), { ok: false, error: 'batch failed', summary: { error: 'batch failed' } });
    assert.deepEqual(finishValues(undefined, new Error('kaboom')), { ok: false, error: 'kaboom', summary: null });
    assert.deepEqual(finishValues(undefined, 'a string throw'), { ok: false, error: 'a string throw', summary: null });
    assert.deepEqual(finishValues({ statusCode: 200 }), { ok: true, error: null, summary: null });
    assert.deepEqual(finishValues(undefined), { ok: true, error: null, summary: null }, 'a handler that returns nothing did not fail');
    assert.equal(finishValues({ statusCode: 503 }).error, 'status 503');
});

// ── source scans: the wiring ─────────────────────────────────────────────────

test('every scheduled function runs through withHeartbeat, exported as `handler`', () => {
    for (const j of SCHEDULED_JOBS) {
        const s = code(read(`netlify/functions/${j.job}.mjs`));
        assert.ok(s.includes("import { withHeartbeat } from './_heartbeat.mjs';") || s.includes("import { withHeartbeat }                              from './_heartbeat.mjs';"), `${j.job} imports the wrapper`);
        assert.ok(s.includes('const run = async () => {'), `${j.job}: the run is a plain function`);
        assert.ok(s.includes(`export const handler = withHeartbeat('${j.job}', run);`), `${j.job}: handler is the wrapped run`);
        assert.ok(!s.includes('export const handler = async'), `${j.job}: no unwrapped handler export`);
    }
});

test('the wrapper stamps start and finish, never breaks the job, and returns or rethrows exactly', () => {
    const s = code(read('netlify/functions/_heartbeat.mjs'));
    assert.ok(s.includes("import { SCHEDULED_JOBS, finishValues, jobsEnabled, siteKey } from '../../src/utils/jobHealth.js';"), 'the classifier, the site key and the flag are the shared pure ones');
    // Item 36: the flag is the first thing after the site — before any stamp, before the run.
    assert.ok(s.includes('        if (!jobsEnabled(process.env)) {'), 'REGRESSION (item 36): the wrapper gates on JOBS_ENABLED, or both sites run every job against the one database');
    assert.ok(s.includes("            return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'JOBS_ENABLED is not \"true\" on this site' }) };"), 'a disabled site answers 200 and says why');
    assert.ok(s.indexOf('if (!jobsEnabled(process.env))') < s.indexOf('const startedAt = new Date();'), 'the gate is before the start stamp — a disabled site leaves no row');
    assert.ok(s.indexOf('if (!jobsEnabled(process.env))') < s.indexOf('await run(event, context)'), 'and before the run');
    // The org-scoping scan exempts this file (tests/org-scoping.test.mjs SKIP) because
    // it writes only the site-scoped site_job_heartbeats table. Keep that true.
    assert.ok(s.includes("import { siteJobHeartbeats } from '../../db/schema.js';"), 'the one table it may touch');
    assert.ok(!s.includes('jobHeartbeats }') && !s.includes("'job_heartbeats'"), 'the legacy shared-row table is not written');
    assert.equal((s.match(/from '\.\.\/\.\.\/db\/schema\.js'/g) || []).length, 1, 'no other schema import');
    assert.ok(!/\b(users|accounts|contacts|opportunities|tasks|activities|leads|settings)\b/.test(s), 'no tenant table is named anywhere in the wrapper');
    const scan = read('tests/org-scoping.test.mjs');
    assert.ok(scan.includes("'_heartbeat.mjs']"), 'the exemption is declared beside its reason');
    assert.ok(s.includes('        const site = siteKey(process.env);'), 'the site is read per run, from the env the process runs in');
    assert.ok(s.includes("try { await stampStart(site, job, startedAt); } catch (e) { console.error(`heartbeat(${job}@${site}): start stamp failed:`, e.message); }"), 'a failed start stamp is logged, not thrown');
    assert.ok(s.includes('        try { res = await run(event, context); }'));
    assert.ok(s.includes('        catch (err) { thrown = err; }'));
    assert.ok(s.includes('        const fin = finishValues(res, thrown);'));
    assert.ok(s.includes("try { await stampFinish(site, job, new Date(), fin); } catch (e) { console.error(`heartbeat(${job}@${site}): finish stamp failed:`, e.message); }"));
    assert.ok(s.includes('        if (thrown) throw thrown;'), 'a throw is still a throw');
    assert.ok(s.includes('        return res;'), 'the result is the handler\'s own');
    assert.ok(s.includes('.onConflictDoUpdate({ target: [siteJobHeartbeats.site, siteJobHeartbeats.job],'), 'one row per site AND job');
    assert.ok(s.includes('        .where(and(eq(siteJobHeartbeats.site, site), eq(siteJobHeartbeats.job, job)));'), 'REGRESSION (item 34): the finish stamp is keyed by site too, or one site\'s finish rewrites every site\'s row');
    assert.ok(s.includes('okCount:    ok ? sql`${siteJobHeartbeats.okCount} + 1` : siteJobHeartbeats.okCount,'), 'counts are incremented in the database, not read-modify-written');
});

test('job-status is Admin-only and returns THIS site\'s rows as stored', () => {
    const s = code(read('netlify/functions/job-status.mjs'));
    assert.ok(s.includes("import { verifyAuth, requireRole } from './auth.mjs';"));
    assert.ok(s.includes("    const forbidden = requireRole(auth, ['Admin'], HEADERS);"));
    assert.ok(s.includes('    if (forbidden) return forbidden;'));
    assert.ok(s.includes("import { jobsEnabled, siteKey } from '../../src/utils/jobHealth.js';"));
    assert.ok(s.includes('        const site = siteKey(process.env);'));
    assert.ok(s.includes('        const rows = await db.select().from(siteJobHeartbeats).where(eq(siteJobHeartbeats.site, site));'), 'REGRESSION (item 34): only this deployment\'s rows — dev and prod share the database');
    assert.ok(s.includes("body: JSON.stringify({ now: new Date().toISOString(), site, enabled: jobsEnabled(process.env), jobs: rows })"), 'the server clock, the site and the flag ride along for the verdict (item 36)');
    assert.ok(!s.includes('orgId'), 'site-wide: no org filter, no org data');
});

test('the schema, its apply script, and the test-schema guard all carry site_job_heartbeats, keyed by site and job', () => {
    const schema = read('db/schema.ts');
    assert.ok(schema.includes("export const siteJobHeartbeats = pgTable('site_job_heartbeats', {"));
    assert.ok(schema.includes("    site:           text('site').notNull(),"));
    assert.ok(schema.includes("    primaryKey({ name: 'site_job_heartbeats_pk', columns: [t.site, t.job] }),"), 'the key is (site, job)');
    assert.ok(schema.includes("export const jobHeartbeats = pgTable('job_heartbeats', {"), 'the legacy table stays declared until it is dropped by hand');
    for (const col of ['site', 'job', 'schedule', 'last_started_at', 'last_finished_at', 'last_status', 'last_error', 'last_summary', 'ok_count', 'error_count', 'updated_at']) {
        assert.ok(schema.includes(`'${col}'`), `schema column ${col}`);
    }
    const apply = read('db/apply-site-job-heartbeats.mjs');
    assert.ok(apply.includes('CREATE TABLE IF NOT EXISTS "site_job_heartbeats"'));
    assert.ok(apply.includes('CONSTRAINT "site_job_heartbeats_pk" PRIMARY KEY ("site", "job")'));
    assert.ok(!/\b(DROP|ALTER|TRUNCATE|DELETE)\b/.test(code(apply)), 'additive only — a key change on the live table is not (guide §18c)');
    assert.ok(apply.includes("if (cols.length !== 11) throw new Error"), 'reads back what it wrote');
    assert.ok(apply.includes("pk[0].def !== 'PRIMARY KEY (site, job)'"), 'reads back the key too');
    const guard = read('tests/integration/_schema-guard.mjs');
    assert.ok(guard.includes("['site_job_heartbeats', 'site'],"));
});

test('the health tile counts the jobs check once the rows are read; Settings fetches them; the Slack card says when alerts last ran', () => {
    const cards = code(read('src/utils/settingsCards.js'));
    assert.ok(cards.includes("import { jobsCheck } from './jobHealth.js';"));
    assert.ok(cards.includes("    if (liveCounts.jobs && !isHidden('jobs')) {"));
    assert.ok(cards.includes('        const c = jobsCheck(liveCounts.jobs);'));
    assert.ok(cards.includes('        if (c) checks.push(c);'));
    const av = code(read('src/Tabs/AdminView.jsx'));
    assert.ok(av.includes("import { jobHealth } from '../utils/jobHealth.js';"));
    assert.ok(av.includes("                    dbFetch('/.netlify/functions/job-status'),"));
    assert.ok(av.includes("                if (jobsRes.status === 'fulfilled' && jobsRes.value.ok) {"), 'a 403 or a 500 leaves the check out of the denominator');
    assert.ok(av.includes('counts.jobs = jobHealth(d.jobs, d.now ? new Date(d.now).getTime() : Date.now(), { enabled: d.enabled !== false });'), 'item 36: the tile hears whether this site runs its jobs');
    const ca = code(read('src/Tabs/settings/integrations/ConnectedAppsDetail.jsx'));
    assert.ok(ca.includes("import { jobHealth, jobLine } from '../../../utils/jobHealth.js';"));
    assert.ok(ca.includes('setJobs(jobHealth(data.jobs, data.now ? new Date(data.now).getTime() : Date.now(), { enabled: data.enabled !== false }));'), 'item 36: so does the Slack card');
    assert.ok(ca.includes("const alertsJob = jobs ? jobs.find(j => j.job === 'pipeline-alerts') || null : null;"));
    assert.ok(ca.includes('Alerts job: {jobLine(alertsJob)}'));
});
