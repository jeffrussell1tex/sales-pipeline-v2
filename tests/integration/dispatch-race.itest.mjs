// tests/integration/dispatch-race.itest.mjs
// §0.285 against the real test database (OPEN_ITEMS §4.8, §0.278's found (a); Jeff, 22 Nov: "Next race finding"): the
// office's job update read the job, then wrote it with only its id and org in the filter, and recorded the status move,
// told the customer and wrote its audit from the job it READ. A move another member made between — a second dispatcher,
// a technician's Start travel — and the history held a move from a status the job no longer held (or missed one), and the
// customer was told twice. Now the write locks and reads the job in its own transaction (officeWrite) and decides on the
// job it replaced; the save still lands. And the customer notice (_customerNotify.mjs): its status link minted only where
// the job holds none, its trail appended as stored — two notices at once kept the second's link and the later's entries.
// Staged where it happens: the other member's move run the moment the PUT's own read answers, before the handler sees it.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.URL = 'https://itest-dispatch-race.example.com';
delete process.env.APP_URL;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers['x-test-user'] || 'clerk_itest_dispatch_race', orgId, userRole: event.headers['x-test-role'] || 'Dispatcher', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
// The customer's email, recorded (the org's notices are on); no SMS credentials, so a text is recorded as not sent.
const mails = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async (o) => { mails.push(o); return { success: true, id: 'test' }; },
        emailTemplates: {
            customerAppointmentConfirmed: (d) => ({ subject: `CONFIRM ${d.jobTitle}`, html: `<p>${d.statusUrl || ''}</p>` }),
            customerTechOnTheWay:         (d) => ({ subject: `ONTHEWAY ${d.jobTitle}`, html: `<p>${d.statusUrl || ''}</p>` }),
        },
    },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});
for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']) delete process.env[k];

// The other member's move, staged at the PUT's own read (tech-race.itest.mjs's seam): once, when armed, the moment the read
// with the job's last edit as text answers, before the handler sees it. The move writes by execute(), never through the
// then it holds; the office's write rides a batch, which no then here touches.
let armedAtRead = null;
let ranAtRead = false;
const { QueryPromise } = await import('drizzle-orm');
const realThen = QueryPromise.prototype.then;
QueryPromise.prototype.then = function (ok, bad) {
    if (armedAtRead && typeof this.toSQL === 'function' && /^select /.test(this.toSQL().sql) && this.toSQL().sql.includes('"updated_at"::text')) {
        const h = armedAtRead; armedAtRead = null;
        return realThen.call(this, async (rows) => { await h(); ranAtRead = true; return rows; }).then(ok, bad);
    }
    return realThen.call(this, ok, bad);
};
const { db } = await import('../../db/index.js');
const { handler: jobsFn } = await import('../../netlify/functions/dispatch-jobs.mjs');
const { notifyCustomer } = await import('../../netlify/functions/_customerNotify.mjs');
const { settings, dispatchJobs, dispatchJobStatusHistory, dispatchCustomers, auditLog } = await import('../../db/schema.js');
const { eq, and, sql } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_dispatch_race_*', and only this file writes to it.
const A = 'itest_dispatch_race_A';
const B = 'itest_dispatch_race_B';
const CUST = { [A]: 'dcust_itest_dispatch_race_a', [B]: 'dcust_itest_dispatch_race_b' };

const put = (org, body, role = 'Dispatcher') => jobsFn({
    httpMethod: 'PUT',
    headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': 'clerk_itest_dispatch_race_office', 'content-type': 'application/json' },
    body: JSON.stringify(body), queryStringParameters: { id: body.id },
});
const jobOf = async (id, org = A) => (await db.select().from(dispatchJobs).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, org))))[0];
const movesOf = async (id, org = A) => (await db.select().from(dispatchJobStatusHistory)
    .where(and(eq(dispatchJobStatusHistory.jobId, id), eq(dispatchJobStatusHistory.orgId, org)))).map((h) => `${h.fromStatus}->${h.toStatus}`).sort();
const seed = async (tag, status, org = A) => {
    const id = `itest_dispatch_race_job_${tag}`;
    await db.delete(dispatchJobStatusHistory).where(and(eq(dispatchJobStatusHistory.jobId, id), eq(dispatchJobStatusHistory.orgId, org)));
    await db.delete(dispatchJobs).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, org)));
    await db.insert(dispatchJobs).values({ id, orgId: org, jobNumber: 'JOB-DRACE-' + tag, customerId: CUST[org], title: 'Job ' + tag,
        status, scheduledDate: '2026-11-26', scheduledStart: '08:00', scheduledEnd: '10:00', timeSlot: 'exact' });
    return id;
};
// Another member's write — stamped, as every dispatch-jobs write stamps it — and nothing else (its own history and notice
// are its own request's; what this file asks is what THIS save records and sends).
const otherMove = (id, set) => async () => { await db.update(dispatchJobs).set({ ...set, updatedAt: new Date() }).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, A))).execute(); };
const onTheWay = () => mails.filter((m) => m.subject.startsWith('ONTHEWAY')).length;
const confirms = () => mails.filter((m) => m.subject.startsWith('CONFIRM')).length;

const cleanup = async () => {
    for (const o of [A, B]) {
        await db.delete(dispatchJobStatusHistory).where(eq(dispatchJobStatusHistory.orgId, o));
        await db.delete(dispatchJobs).where(eq(dispatchJobs.orgId, o));
        await db.delete(dispatchCustomers).where(eq(dispatchCustomers.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
    }
};
before(async () => {
    await cleanup();
    await db.insert(settings).values([
        { id: 'settings_' + A, orgId: A, companyName: 'Itest Race Co', extra: { dispatchEnabled: true, customerNotifications: { enabled: true, statusLink: true } } },
        { id: 'settings_' + B, orgId: B, companyName: 'Itest Other Co', extra: { dispatchEnabled: true, customerNotifications: { enabled: true, statusLink: true } } },
    ]);
    await db.insert(dispatchCustomers).values([
        { id: CUST[A], orgId: A, name: 'Itest Race Customer', contactEmail: 'race@itest-dispatch-race.local', customerType: 'commercial' },
        { id: CUST[B], orgId: B, name: 'Itest Other Customer', contactEmail: 'other@itest-dispatch-race.local', customerType: 'commercial' },
    ]);
});
after(async () => { armedAtRead = null; QueryPromise.prototype.then = realThen; await cleanup(); });

test("§0.285 an office move to en route over a job another member put en route after its read records no move and tells the customer nothing — the job they were told about", async () => {
    const id = await seed('twice', 'scheduled');
    mails.length = 0; ranAtRead = false;
    armedAtRead = otherMove(id, { status: 'en_route' });
    const res = await put(A, { id, status: 'en_route' });
    assert.equal(ranAtRead, true, 'the move ran between the read and the write');
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await jobOf(id)).status, 'en_route');
    assert.deepEqual(await movesOf(id), [], 'REGRESSION: a move from scheduled recorded over a job already en route');
    assert.equal(onTheWay(), 0, 'REGRESSION: the customer told a second time their technician is on the way');
});

test('§0.285 an office move records its move from where the job stood when it was written, not where the PUT read it', async () => {
    const id = await seed('from', 'scheduled');
    ranAtRead = false;
    armedAtRead = otherMove(id, { status: 'on_site' });   // the technician arrived after the office's read
    const res = await put(A, { id, status: 'completed' });
    assert.equal(ranAtRead, true);
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(await movesOf(id), ['on_site->completed'], 'REGRESSION: a move recorded from scheduled — a status the job no longer held');
    const [audit] = await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.entityId, id)));
    assert.ok(audit && audit.detail.startsWith('on_site → completed'), 'the audit names the move made: ' + audit?.detail);

    // A move back to where the PUT read it — the job moved meanwhile — is a move, recorded (it was missed: read = sent).
    const id2 = await seed('back', 'scheduled');
    ranAtRead = false;
    armedAtRead = otherMove(id2, { status: 'en_route' });
    const res2 = await put(A, { id: id2, status: 'scheduled' });
    assert.equal(ranAtRead, true);
    assert.equal(res2.statusCode, 200, res2.body);
    assert.deepEqual(await movesOf(id2), ['en_route->scheduled'], 'REGRESSION: a move back to scheduled went unrecorded');
});

test("§0.285 with nothing moved, the office's save lands and records its move from the job as read — and a save naming only its own field over another member's move lands beside it", async () => {
    const id = await seed('lands', 'scheduled');
    mails.length = 0;
    const res = await put(A, { id, status: 'en_route' });
    assert.equal(res.statusCode, 200, res.body);
    assert.deepEqual(await movesOf(id), ['scheduled->en_route']);
    assert.equal(onTheWay(), 1, 'told once');
    // The save still lands (as tech-race.itest.mjs pins): a move made since the read stands beside the field it names.
    const id2 = await seed('beside', 'scheduled');
    ranAtRead = false;
    armedAtRead = otherMove(id2, { techNotes: 'the field' });
    const res2 = await put(A, { id: id2, scheduledDate: '2026-11-27' });
    assert.equal(ranAtRead, true);
    assert.equal(res2.statusCode, 200, res2.body);
    const job = await jobOf(id2);
    assert.deepEqual([job.scheduledDate, job.techNotes], ['2026-11-27', 'the field']);
});

test('§0.285 two office moves sent at once to en route: one move recorded, the customer told once (two live requests; the lock itself is proven below)', async () => {
    const id = await seed('both', 'scheduled');
    mails.length = 0;
    const [r1, r2] = await Promise.all([put(A, { id, status: 'en_route' }), put(A, { id, status: 'en_route' })]);
    assert.deepEqual([r1.statusCode, r2.statusCode], [200, 200], r1.body + r2.body);
    assert.deepEqual(await movesOf(id), ['scheduled->en_route'], 'REGRESSION: the move recorded twice');
    assert.equal(onTheWay(), 1, 'REGRESSION: the customer told twice');
});

// The lock itself (the proof run: with the select in the batch unlocked, every staged case above still passed — they read
// the job in the write's transaction either way, and two live requests rarely meet). Here another member's write holds the
// row in an open transaction (a websocket session) while the office's save is sent; it commits only once the database
// shows the save waiting on that lock — no clock, the database's own word. Locked, the save's read waits and reads the
// committed move; unlocked, its read took the job as it was and only its update waited — a move from scheduled recorded
// over a job already en route, and the customer told again.
test('§0.285 an office save sent while another write holds the job waits for it and decides on the job it wrote (the lock, proven by the database)', async () => {
    const id = await seed('locked', 'scheduled');
    mails.length = 0;
    const { Pool, neonConfig } = await import('@neondatabase/serverless');
    neonConfig.webSocketConstructor = globalThis.WebSocket;
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
    const holder = await pool.connect();
    let pending = null, waiting = 0;
    try {
        await holder.query('begin');
        await holder.query(`update dispatch_jobs set status = 'en_route', updated_at = now() where id = $1 and org_id = $2`, [id, A]);
        pending = put(A, { id, status: 'en_route' });
        for (let i = 0; i < 400 && !waiting; i++) {
            // A session blocked by THIS one's lock, never another suite's wait (the suites run side by side; the pooler shows
            // its own reset as a waiting session's query, so the text cannot tell them apart).
            const { rows } = await holder.query(`select count(*)::int as n from pg_stat_activity where pg_backend_pid() = any(pg_blocking_pids(pid))`);
            waiting = rows[0].n;
        }
        await holder.query('commit');
    } finally {
        holder.release();
        await pool.end();
    }
    // The save settled before anything is judged: a case that failed must not leave its request to land in the next one's.
    const res = await pending;
    assert.ok(waiting > 0, 'the save reached the lock (the database shows it waiting)');
    assert.equal(res.statusCode, 200, res.body);
    assert.equal((await jobOf(id)).status, 'en_route');
    assert.deepEqual(await movesOf(id), [], 'REGRESSION: the save read the job before the other write landed — a move from scheduled recorded over a job en route');
    assert.equal(onTheWay(), 0, 'REGRESSION: the customer told again that their technician is on the way');
});

test("§0.285 two notices at once on one job keep one status link and both trail entries; the trail stays JSON text, read back as the list", async () => {
    const id = await seed('notice', 'unscheduled');
    // The job as both callers' writes answered it: no link yet, no trail — each notice decided on this same row.
    const written = await jobOf(id);
    const scheduled = { ...written, status: 'scheduled' };
    await db.update(dispatchJobs).set({ status: 'scheduled' }).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, A)));
    mails.length = 0;
    const [n1, n2] = await Promise.all([
        notifyCustomer({ orgId: A, before: written, after: scheduled, actorName: 'One' }),
        notifyCustomer({ orgId: A, before: written, after: scheduled, actorName: 'Two' }),
    ]);
    assert.equal(confirms(), 2, 'both callers sent (each decided on its own before)');
    const job = await jobOf(id);
    assert.ok(job.publicToken, 'a link issued');
    assert.equal(n1.token, job.publicToken, 'REGRESSION: a message carried a link the job does not hold');
    assert.equal(n2.token, job.publicToken, 'REGRESSION: a message carried a link the job does not hold');
    assert.ok(mails.every((m) => m.html.includes('/status/' + job.publicToken)), 'every message carries the link the job holds');
    assert.ok(Array.isArray(job.customerNotifications), 'read back as the list');
    assert.deepEqual(job.customerNotifications.map((e) => e.by).sort(), ['One', 'One', 'Two', 'Two'], 'REGRESSION: one notice\'s entries lost from the trail (email and text each)');
    const [{ t }] = (await db.execute(sql`select jsonb_typeof(customer_notifications) as t from dispatch_jobs where id = ${id} and org_id = ${A}`)).rows;
    assert.equal(t, 'string', 'kept as the app stores it: JSON text in the jsonb column');
    // A later notice appends to it, the earlier entries kept.
    await notifyCustomer({ orgId: A, before: { ...scheduled, status: 'scheduled' }, after: { ...scheduled, status: 'en_route', publicToken: job.publicToken }, actorName: 'Three' });
    const job2 = await jobOf(id);
    assert.deepEqual(job2.customerNotifications.map((e) => e.by), [...job.customerNotifications.map((e) => e.by), 'Three', 'Three']);
    assert.equal(job2.publicToken, job.publicToken, 'the link kept for the life of the job');
});

// The review: a trail stored as JSON text that is no list (a restored file's) made the append's cast throw, and every later
// notice's record was lost; the read-and-write it replaced started the list afresh. So does the append.
test('§0.285 a trail stored as text that is no list starts afresh with the notice — never a lost record, never a junk entry', async () => {
    for (const [tag, stored] of [['garbage', sql`to_jsonb('garbage'::text)`], ['object', sql`to_jsonb('{}'::text)`], ['null', sql`to_jsonb('null'::text)`], ['jsonnull', sql`'null'::jsonb`]]) {
        const id = await seed('trail_' + tag, 'unscheduled');
        await db.update(dispatchJobs).set({ customerNotifications: stored }).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, A)));
        const before = await jobOf(id);
        await notifyCustomer({ orgId: A, before, after: { ...before, status: 'scheduled' }, actorName: 'Fresh' });
        const job = await jobOf(id);
        assert.ok(Array.isArray(job.customerNotifications), `${tag}: read back as the list`);
        assert.ok(job.customerNotifications.length > 0 && job.customerNotifications.every((e) => e && e.by === 'Fresh'), `REGRESSION (${tag}): the record lost, or a junk entry kept — ${JSON.stringify(job.customerNotifications)}`);
    }
});

test("§0.285 the other org sees nothing: an office move from org B over org A's job is a 404, nothing written, no move, no notice; org B's own move stays in org B", async () => {
    const id = await seed('isolated', 'scheduled');
    const idB = await seed('isolated_b', 'scheduled', B);   // org B's own job (a job id is one row, whichever org holds it)
    mails.length = 0;
    const res = await put(B, { id, status: 'cancelled' });
    assert.equal(res.statusCode, 404, res.body);
    assert.equal((await jobOf(id)).status, 'scheduled', "org A's job untouched");
    assert.deepEqual(await movesOf(id), [], 'no move recorded in org A');
    assert.deepEqual(await movesOf(id, B), [], 'nor in org B');
    assert.equal(mails.length, 0, "org A's customer told nothing");
    const resB = await put(B, { id: idB, status: 'en_route' });
    assert.equal(resB.statusCode, 200, resB.body);
    assert.equal((await jobOf(id)).status, 'scheduled', "org B's move never touches org A's job");
    assert.deepEqual(await movesOf(idB, B), ['scheduled->en_route'], "org B's own move, in org B");
    assert.ok(mails.length === 1 && mails[0].to === 'other@itest-dispatch-race.local', "only org B's customer told");
});
