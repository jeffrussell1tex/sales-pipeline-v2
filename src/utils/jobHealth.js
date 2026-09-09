// jobHealth.js — is each scheduled job alive? (state §0.98, handoff item 32)
//
// Origin: pipeline-alerts answered 500 every hour for five months (§0.95) and
// nothing the app shows said so. Now every scheduled function stamps a
// site_job_heartbeats row through _heartbeat.mjs (one per site AND job — dev
// and prod share the database, item 34), job-status.mjs (Admin-only) returns
// its own site's rows, and this module — pure, shared by the server wrapper (for
// the cron it records) and the client (for the Settings health tile and the
// Slack card) — turns rows into a verdict.
//
// A job is HEALTHY when its last finished run was ok and finished within two
// cadences plus a grace period. It is STALLED when it has never finished, or
// its last finish is older than that window (Netlify stopped invoking it, or
// it hangs). It is FAILING when its last run errored. A job with no row yet
// has never run since the table existed: "not yet" — reported, not failing.

export const SCHEDULED_JOBS = Object.freeze([
    Object.freeze({ job: 'pipeline-alerts',   label: 'Pipeline alerts',  cron: '0 * * * *', cadenceMs: 3600000 }),
    Object.freeze({ job: 'digest',            label: 'Daily digest',     cron: '0 * * * *', cadenceMs: 3600000 }),
    Object.freeze({ job: 'task-reminders',    label: 'Task reminders',   cron: '* * * * *', cadenceMs: 60000 }),
    Object.freeze({ job: 'score-leads-batch', label: 'Lead scoring',     cron: '0 6 * * *', cadenceMs: 86400000 }),
]);

export const HEARTBEAT_GRACE_MS = 10 * 60 * 1000;   // a run may be slow, and Netlify's cron is not to the second

/**
 * Which deployment this process is (item 34): the host of Netlify's `URL` —
 * "accelerep.netlify.app", "salespipelinetracker.com" — else `SITE_NAME`, else
 * "local". Dev and prod share one database, so a heartbeat row is keyed by this
 * AND the job; job-status returns only its own site's rows. Pure over the env
 * it is handed (the callers pass process.env), so a test can name a site.
 */
export function siteKey(env) {
    const url = typeof env?.URL === 'string' ? env.URL.trim() : '';
    if (url) {
        try { const h = new URL(url).host; if (h) return h; } catch { /* not a URL: fall through */ }
    }
    const name = typeof env?.SITE_NAME === 'string' ? env.SITE_NAME.trim() : '';
    return name || 'local';
}

/**
 * Does THIS deployment run its scheduled jobs? (state §0.103, handoff item 36)
 * Dev and prod share one database, so with both sites running every job a
 * qualifying alert or digest went out twice — one email, one SMS, one Slack
 * post per site. A job now runs only where JOBS_ENABLED is exactly "true" — a
 * per-site Netlify env var, set on production alone; anywhere else the wrapper
 * answers "skipped" without a stamp, and job-status says enabled:false so the
 * tile can say so. Unset means OFF: a new site never double-sends by default.
 * Pure over the env it is handed.
 */
export function jobsEnabled(env) {
    const v = env?.JOBS_ENABLED;
    return typeof v === 'string' && v.trim().toLowerCase() === 'true';
}

const toMs = (v) => {
    if (!v) return null;
    const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
    return Number.isFinite(t) ? t : null;
};

/** The stall window for a cadence: two missed runs plus grace. */
export function stallAfterMs(cadenceMs) {
    return (Number.isFinite(cadenceMs) && cadenceMs > 0 ? cadenceMs * 2 : 3600000 * 2) + HEARTBEAT_GRACE_MS;
}

/**
 * One verdict per declared job. `rows` are job_heartbeats rows (any subset,
 * any order); unknown rows are ignored; `now` is a ms timestamp; `enabled`
 * is job-status's word on whether this site runs its jobs at all (item 36) —
 * false makes every verdict 'disabled' whatever the rows say, since old rows
 * from before the flag would otherwise read as stalled.
 * → [{ job, label, cron, status: 'ok'|'error'|'stalled'|'never'|'disabled', ok, lastFinishedAt, lastStartedAt,
 *      lastError, lastSummary, okCount, errorCount, ageMs }]
 */
export function jobHealth(rows, now = Date.now(), { enabled = true } = {}) {
    const byJob = new Map();
    for (const r of Array.isArray(rows) ? rows : []) if (r && typeof r.job === 'string') byJob.set(r.job, r);
    return SCHEDULED_JOBS.map(def => {
        const r = byJob.get(def.job);
        const finished = toMs(r?.lastFinishedAt);
        const started  = toMs(r?.lastStartedAt);
        const ageMs = finished == null ? null : Math.max(0, now - finished);
        let status;
        if (enabled === false) status = 'disabled';
        else if (!r) status = 'never';
        else if (r.lastStatus === 'error') status = 'error';
        else if (finished == null) status = started != null && now - started > stallAfterMs(def.cadenceMs) ? 'stalled' : 'never';
        else if (ageMs > stallAfterMs(def.cadenceMs)) status = 'stalled';
        else status = 'ok';
        return {
            job: def.job, label: def.label, cron: def.cron,
            status, ok: status === 'ok',
            lastFinishedAt: finished == null ? null : new Date(finished).toISOString(),
            lastStartedAt:  started  == null ? null : new Date(started).toISOString(),
            lastError: r?.lastError || null,
            lastSummary: r?.lastSummary ?? null,
            okCount: Number(r?.okCount) || 0,
            errorCount: Number(r?.errorCount) || 0,
            ageMs,
        };
    });
}

/** "2h ago", "just now", "never". */
export function agoLabel(ageMs) {
    if (ageMs == null) return 'never';
    const m = Math.round(ageMs / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
}

/** One line for a card: "Last ran 12m ago · ok" / "Last run failed 3h ago — <error>" / "Stalled — last finished 3d ago" / "Has not run yet". */
export function jobLine(j) {
    if (!j) return '';
    if (j.status === 'disabled') return 'Not enabled on this site (JOBS_ENABLED)';
    if (j.status === 'never') return 'Has not run yet';
    if (j.status === 'error') return `Last run failed ${agoLabel(j.ageMs)}${j.lastError ? ' — ' + j.lastError : ''}`;
    if (j.status === 'stalled') return `Stalled — last finished ${agoLabel(j.ageMs)}`;
    return `Last ran ${agoLabel(j.ageMs)} · ok`;
}

/**
 * What the finish stamp records for a handler's result (used by
 * netlify/functions/_heartbeat.mjs; here so `node --test` reaches it without
 * a database). A thrown error, or a status of 400+, is an error; the body is
 * kept as the summary — parsed when it is JSON, wrapped when it is text.
 */
export function finishValues(res, thrown) {
    if (thrown) return { ok: false, error: String(thrown?.message || thrown).slice(0, 2000), summary: null };
    const status = Number(res?.statusCode);
    const ok = !Number.isFinite(status) || status < 400;
    let summary = null;
    if (typeof res?.body === 'string' && res.body) {
        try { const p = JSON.parse(res.body); summary = p && typeof p === 'object' ? p : { body: res.body }; }
        catch { summary = { body: res.body.slice(0, 500) }; }
    }
    const error = ok ? null : (summary?.error || (typeof res?.body === 'string' && res.body ? res.body.slice(0, 2000) : `status ${status}`));
    return { ok, error, summary };
}

/** The health-tile check: ok only when every job is ok; the label names what is not. */
export function jobsCheck(health) {
    const list = Array.isArray(health) ? health : [];
    const bad = list.filter(j => !j.ok);
    if (!list.length) return null;
    // Deliberately NOT ok: on dev it is the truth, and on prod a forgotten flag
    // must never read as healthy — that silence is the §0.95 class again.
    if (list.every(j => j.status === 'disabled')) return { id: 'jobs', label: 'Scheduled jobs not enabled on this site (JOBS_ENABLED)', ok: false };
    if (!bad.length) return { id: 'jobs', label: 'Scheduled jobs running', ok: true };
    const words = bad.map(j => `${j.label} ${j.status === 'never' ? 'has not run' : j.status}`);
    return { id: 'jobs', label: `Scheduled jobs: ${words.join(', ')}`, ok: false };
}
