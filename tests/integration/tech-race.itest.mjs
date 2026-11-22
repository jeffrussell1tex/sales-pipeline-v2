// tests/integration/tech-race.itest.mjs
// §0.278 against the real test database (OPEN_ITEMS §4.8, §0.275's found (3); Jeff, 20 Nov: "Next race finding"): a
// technician's job update checked that they were on the job on a read (techOnJob), then wrote the job with only its
// id and org in the filter, recorded the status move from the status it read and told the customer by comparing the
// job it read. A dispatcher who took them off the job, cancelled or moved it between, and the write went on: a
// cancelled job marked complete, a job no longer theirs moved by them, a history entry from a status the job no longer
// held. Staged where it happens: the real _techJobs.mjs with techOnJob wrapped to make the dispatcher's move — once,
// when armed — the moment the check answers.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            return { userId: event.headers['x-test-user'], orgId, userRole: event.headers['x-test-role'] || 'Technician', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
// The job endpoint pulls the senders in; the org's customer notices are off, so nothing sends — recorded if it did.
const mails = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async (o) => { mails.push(o); return { success: true }; }, emailTemplates: new Proxy({}, { get: () => () => ({ subject: '', html: '' }) }) },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async (o) => { mails.push(o); return { success: true }; }, smsTemplates: {}, normalizePhone: (p) => p },
});
// The dispatcher's move, staged: once, when armed, the moment the technician check answers.
let armed = null;
const techJobs = await import('../../netlify/functions/_techJobs.mjs');
mock.module(new URL('../../netlify/functions/_techJobs.mjs', import.meta.url).href, {
    namedExports: { ...techJobs, techOnJob: (...a) => { const r = techJobs.techOnJob(...a); const h = armed; armed = null; if (h) pending.push(h()); return r; } },
});
// techOnJob is synchronous and the handler awaits nothing between it and the write, so the move it starts is run to
// its end before the next statement is sent: every drizzle query's then waits for it (the move
// sends its own statement by execute(), never through the then it holds).
const pending = [];
// The office's save asks no technician check, so its move is staged at the PUT's own read instead (the review: a test of
// the office's path that ran no move proved nothing) — once, when armed, the moment the read with the job's last edit as
// text answers, before the handler sees it.
let armedAtRead = null;
let ranAtRead = false;
const { QueryPromise } = await import('drizzle-orm');
const realThen = QueryPromise.prototype.then;
QueryPromise.prototype.then = function (ok, bad) {
    if (armedAtRead && typeof this.toSQL === 'function' && /^select /.test(this.toSQL().sql) && this.toSQL().sql.includes('"updated_at"::text')) {
        const h = armedAtRead; armedAtRead = null;
        return realThen.call(this, async (rows) => { await h(); ranAtRead = true; return rows; }).then(ok, bad);
    }
    if (!pending.length) return realThen.call(this, ok, bad);
    return Promise.all(pending.splice(0)).then(() => realThen.call(this, ok, bad), bad);
};
const { db } = await import('../../db/index.js');

const { handler: jobsFn } = await import('../../netlify/functions/dispatch-jobs.mjs');
const schema = await import('../../db/schema.js');
const { settings, dispatchJobs, dispatchJobStatusHistory, dispatchTechnicians, auditLog } = schema;
const { eq, and } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_tech_race_*', and only this file writes to it.
const A = 'itest_tech_race_A';
const CLERK = { lead: 'clerk_itest_tech_race_lead', co: 'clerk_itest_tech_race_co' };
const TECH = { lead: 'tech_itest_tech_race_lead', co: 'tech_itest_tech_race_co', other: 'tech_itest_tech_race_other' };

const ev = (user, body, role = 'Technician') => ({
    httpMethod: 'PUT',
    headers: { 'x-test-org': A, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: JSON.stringify(body), queryStringParameters: { id: body.id },
});
const jobOf = async (id) => (await db.select().from(dispatchJobs).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, A))))[0];
const historyOf = async (id) => db.select().from(dispatchJobStatusHistory).where(and(eq(dispatchJobStatusHistory.jobId, id), eq(dispatchJobStatusHistory.orgId, A)));
const seed = async (tag, status) => {
    const id = `itest_tech_race_job_${tag}`;
    await db.delete(dispatchJobStatusHistory).where(and(eq(dispatchJobStatusHistory.jobId, id), eq(dispatchJobStatusHistory.orgId, A)));
    await db.delete(dispatchJobs).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, A)));
    // The co-tech list as the app writes it: JSON text in the jsonb column (_techJobs.mjs coTechIdsOf).
    await db.insert(dispatchJobs).values({ id, orgId: A, jobNumber: 'JOB-RACE-' + tag, customerId: 'cust_itest_tech_race', title: 'Job ' + tag,
        status, scheduledDate: '2026-11-21', assignedTechId: TECH.lead, coTechIds: JSON.stringify([TECH.co]), techNotes: 'as filed' });
    return id;
};
// What a dispatcher's save writes — its own edit stamped, as every dispatch-jobs PUT stamps it.
const dispatcher = (id, set) => async () => { await db.update(dispatchJobs).set({ ...set, updatedAt: new Date() }).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, A))).execute(); };
const said = (res) => JSON.parse(res.body).error;

const cleanup = async () => {
    await db.delete(dispatchJobStatusHistory).where(eq(dispatchJobStatusHistory.orgId, A));
    await db.delete(dispatchJobs).where(eq(dispatchJobs.orgId, A));
    await db.delete(dispatchTechnicians).where(eq(dispatchTechnicians.orgId, A));
    await db.delete(settings).where(eq(settings.orgId, A));
    await db.delete(auditLog).where(eq(auditLog.orgId, A));
};
before(async () => {
    await cleanup();
    await db.insert(settings).values({ id: 'settings_' + A, orgId: A, extra: { dispatchEnabled: true } });
    await db.insert(dispatchTechnicians).values([
        { id: TECH.lead,  orgId: A, firstName: 'Itest', lastName: 'Lead',  userId: CLERK.lead },
        { id: TECH.co,    orgId: A, firstName: 'Itest', lastName: 'Co',    userId: CLERK.co },
        { id: TECH.other, orgId: A, firstName: 'Itest', lastName: 'Other', userId: 'clerk_itest_tech_race_other' },
    ]);
});
after(async () => { armed = null; armedAtRead = null; QueryPromise.prototype.then = realThen; await cleanup(); });

test("§0.278 a technician's Start travel on a job a dispatcher took them off after the check passed writes nothing — 404 in words; the job, its crew and its history as the dispatcher left them", async () => {
    const id = await seed('reassigned', 'scheduled');
    armed = dispatcher(id, { assignedTechId: TECH.other, coTechIds: JSON.stringify([]) });
    const res = await jobsFn(ev(CLERK.lead, { id, status: 'en_route' }));
    assert.equal(armed, null, 'the move ran');
    assert.equal(res.statusCode, 404, res.body);
    assert.equal(said(res), 'This job is no longer assigned to you. Nothing was saved; reload to see your jobs.');
    const job = await jobOf(id);
    assert.equal(job.status, 'scheduled');
    assert.equal(job.assignedTechId, TECH.other);
    assert.equal((await historyOf(id)).length, 0, 'no status move recorded');
});

test("§0.278 a technician's Complete on a job a dispatcher cancelled after the check passed writes nothing — 409 naming what it is now; still cancelled, the completion notes never written", async () => {
    const id = await seed('cancelled', 'on_site');
    armed = dispatcher(id, { status: 'cancelled' });
    const res = await jobsFn(ev(CLERK.lead, { id, status: 'completed', completionNotes: 'all done', techNotes: 'as filed' }));
    assert.equal(res.statusCode, 409, res.body);
    // Moved in §0.281: with the job as stored, for the card to show — no "reload to see it".
    assert.equal(said(res), 'This job changed since you opened it — it is cancelled now. Nothing was saved.');
    assert.equal(JSON.parse(res.body).code, 'stale');
    assert.equal(JSON.parse(res.body).job.status, 'cancelled');
    const job = await jobOf(id);
    assert.equal(job.status, 'cancelled');
    assert.equal(job.completionNotes, null);
    assert.equal((await historyOf(id)).length, 0);
});

test("§0.278 a co-technician's notes over a job a dispatcher moved to another day after the check passed write nothing — 409; the move stands, the notes as they were", async () => {
    const id = await seed('moved', 'scheduled');
    armed = dispatcher(id, { scheduledDate: '2026-11-24' });
    const res = await jobsFn(ev(CLERK.co, { id, techNotes: 'gate code 1234' }));
    assert.equal(res.statusCode, 409, res.body);
    assert.equal(said(res), 'This job changed since you opened it — it is scheduled now. Nothing was saved.');   // moved in §0.281
    assert.equal(JSON.parse(res.body).job.scheduledDate, '2026-11-24', 'the job as stored');
    const job = await jobOf(id);
    assert.equal(job.scheduledDate, '2026-11-24');
    assert.equal(job.techNotes, 'as filed');
});

test("§0.278 a press beaten by one in flight that made the same change is done — 409 code 'already' with the job as stored; one that made only part of it is refused, never 'already'", async () => {
    const id = await seed('twice', 'scheduled');
    armed = dispatcher(id, { status: 'en_route' });
    const res = await jobsFn(ev(CLERK.lead, { id, status: 'en_route' }));
    assert.equal(res.statusCode, 409, res.body);
    const body = JSON.parse(res.body);
    assert.equal(body.code, 'already');
    assert.equal(body.error, 'This job is en route already.');
    assert.equal(body.job.id, id);
    assert.equal(body.job.status, 'en_route');

    const id2 = await seed('part', 'on_site');
    armed = dispatcher(id2, { status: 'completed' });
    const res2 = await jobsFn(ev(CLERK.lead, { id: id2, status: 'completed', completionNotes: 'mine' }));
    assert.equal(res2.statusCode, 409, res2.body);
    // Moved in §0.281: refused as changed, code 'stale' with the job as stored — never 'already'.
    assert.equal(JSON.parse(res2.body).code, 'stale', 'the notes never landed: not done');
    // The review: the stamp's miss, never the move rule — its own words (the move check answers the same code).
    assert.equal(JSON.parse(res2.body).error, 'This job changed since you opened it — it is completed now. Nothing was saved.');
    assert.equal((await jobOf(id2)).completionNotes, null);

    // The review: compared against the job as stored, never its normalised copy — a signature stored NULL and a false
    // sent over it are not the same, so a raced press that wrote nothing is never told it is done.
    const id3 = await seed('unsigned', 'on_site');
    await db.update(dispatchJobs).set({ customerSignature: null, photosCount: null }).where(and(eq(dispatchJobs.id, id3), eq(dispatchJobs.orgId, A)));
    armed = dispatcher(id3, { techNotes: 'the office' });
    const res3 = await jobsFn(ev(CLERK.lead, { id: id3, customerSignature: false, photosCount: 0 }));
    assert.equal(res3.statusCode, 409, res3.body);
    assert.equal(JSON.parse(res3.body).code, 'stale', 'none stored is not false sent: not done');   // moved in §0.281: refused as changed, never 'already'
    const row3 = await jobOf(id3);
    assert.deepEqual([row3.customerSignature, row3.photosCount], [null, null], 'nothing written');
});

test('§0.278 with nothing moved, the lead and a co-technician (the list held as JSON text) both land — the status move recorded from the status read', async () => {
    const id = await seed('lands', 'scheduled');
    const res = await jobsFn(ev(CLERK.co, { id, status: 'en_route' }));
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(JSON.parse(res.body).job.status, 'en_route');
    const res2 = await jobsFn(ev(CLERK.lead, { id, status: 'on_site', techNotes: 'arrived' }));
    assert.equal(res2.statusCode, 200, res2.body);
    const job = await jobOf(id);
    assert.equal(job.status, 'on_site');
    assert.equal(job.techNotes, 'arrived');
    const moves = (await historyOf(id)).map((h) => `${h.fromStatus}->${h.toStatus}`).sort();
    assert.deepEqual(moves, ['en_route->on_site', 'scheduled->en_route']);
    assert.equal(mails.length, 0, "the org's customer notices are off");
});

test("§0.278 a dispatcher's save is not held to a technician's claim — it lands over a move made after its read, as before (its own decisions on a read are filed, not this batch's)", async () => {
    const id = await seed('office', 'scheduled');
    // The move staged at the PUT's read (the review: one armed on techOnJob never fired here, so nothing moved).
    ranAtRead = false;
    armedAtRead = dispatcher(id, { techNotes: 'the field' });
    const res = await jobsFn(ev('clerk_itest_tech_race_dispatcher', { id, scheduledDate: '2026-11-25' }, 'Dispatcher'));
    assert.equal(armedAtRead, null, 'the read answered');
    assert.equal(ranAtRead, true, 'the move ran between the read and the write');
    assert.equal(res.statusCode, 200, res.body);
    const job = await jobOf(id);
    assert.deepEqual([job.scheduledDate, job.techNotes], ['2026-11-25', 'the field'], "the office's save landed; the move made since its read stands (it names only its own field)");
});
