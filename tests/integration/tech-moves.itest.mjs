// tests/integration/tech-moves.itest.mjs
// §0.281 against the real test database (OPEN_ITEMS §4.8, §0.278's found (b); Jeff, 21 Nov: "Next race finding"): a
// technician's status move was checked by where it went, never where it came from — a request completed a cancelled
// job, started travel on an unscheduled one, skipped a step; and the job card, its jobs read once, offered its old
// moves after a dispatcher's change and sent the same one again after a 409. Now a move is one the field makes from
// where the job stands, else refused with the job as stored.
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

const { db } = await import('../../db/index.js');
const { handler: jobsFn } = await import('../../netlify/functions/dispatch-jobs.mjs');
const schema = await import('../../db/schema.js');
const { settings, dispatchJobs, dispatchJobStatusHistory, dispatchTechnicians, auditLog } = schema;
const { eq, and } = await import('drizzle-orm');

// ORG NAMESPACE: this file owns 'itest_tech_moves_*', and only this file writes to it.
const A = 'itest_tech_moves_A';
const CLERK = { lead: 'clerk_itest_tech_moves_lead', co: 'clerk_itest_tech_moves_co' };
const TECH = { lead: 'tech_itest_tech_moves_lead', co: 'tech_itest_tech_moves_co' };

const ev = (body, user = CLERK.lead) => ({
    httpMethod: 'PUT',
    headers: { 'x-test-org': A, 'x-test-role': 'Technician', 'x-test-user': user, 'content-type': 'application/json' },
    body: JSON.stringify(body), queryStringParameters: { id: body.id },
});
const jobOf = async (id) => (await db.select().from(dispatchJobs).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, A))))[0];
const historyOf = async (id) => db.select().from(dispatchJobStatusHistory).where(and(eq(dispatchJobStatusHistory.jobId, id), eq(dispatchJobStatusHistory.orgId, A)));
const seed = async (tag, status) => {
    const id = `itest_tech_moves_job_${tag}`;
    await db.delete(dispatchJobStatusHistory).where(and(eq(dispatchJobStatusHistory.jobId, id), eq(dispatchJobStatusHistory.orgId, A)));
    await db.delete(dispatchJobs).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, A)));
    await db.insert(dispatchJobs).values({ id, orgId: A, jobNumber: 'JOB-MOVE-' + tag, customerId: 'cust_itest_tech_moves', title: 'Job ' + tag,
        status, scheduledDate: '2026-11-22', assignedTechId: TECH.lead, coTechIds: JSON.stringify([TECH.co]), techNotes: 'as filed' });
    return id;
};
const body = (res) => JSON.parse(res.body);

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
        { id: TECH.lead, orgId: A, firstName: 'Itest', lastName: 'Moves', userId: CLERK.lead },
        { id: TECH.co,   orgId: A, firstName: 'Itest', lastName: 'Co',    userId: CLERK.co },
    ]);
});
after(cleanup);

test("§0.281 a technician's move the field does not make from where the job stands writes nothing — 409 in words with the job as stored; no history, the job as it was", async () => {
    for (const [from, to, words] of [
        ['cancelled', 'completed', 'This job is cancelled — it cannot be marked completed from the field. Nothing was saved.'],
        ['unscheduled', 'en_route', 'This job is unscheduled — it cannot be marked en route from the field. Nothing was saved.'],
        ['scheduled', 'completed', 'This job is scheduled — it cannot be marked completed from the field. Nothing was saved.'],
        ['scheduled', 'on_site', 'This job is scheduled — it cannot be marked on site from the field. Nothing was saved.'],
        ['en_route', 'paused', 'This job is en route — it cannot be marked paused from the field. Nothing was saved.'],
        ['paused', 'completed', 'This job is paused — it cannot be marked completed from the field. Nothing was saved.'],
        ['completed', 'on_site', 'This job is completed — it cannot be marked on site from the field. Nothing was saved.'],
    ]) {
        const id = await seed(`${from}_${to}`, from);
        const res = await jobsFn(ev({ id, status: to, completionNotes: 'all done' }));
        assert.equal(res.statusCode, 409, `${from} → ${to}: ${res.body}`);
        assert.equal(body(res).error, words);
        assert.equal(body(res).code, 'stale');
        assert.equal(body(res).job.status, from, 'the job as stored, for the card');
        const job = await jobOf(id);
        assert.equal(job.status, from);
        assert.equal(job.completionNotes, null, 'nothing of the body written');
        assert.equal((await historyOf(id)).length, 0);
    }
    assert.equal(mails.length, 0);
});

test("§0.281 the field's own moves land, each recorded from the status it left: travel, arrive, pause, resume, complete", async () => {
    const id = await seed('day', 'scheduled');
    const steps = [['scheduled', 'en_route'], ['en_route', 'on_site'], ['on_site', 'paused'], ['paused', 'on_site'], ['on_site', 'completed']];
    for (const [, to] of steps) {
        const res = await jobsFn(ev({ id, status: to }));
        assert.equal(res.statusCode, 200, `→ ${to}: ${res.body}`);
        assert.equal(body(res).job.status, to);
    }
    const moves = (await historyOf(id)).map((h) => [h.fromStatus, h.toStatus]).sort((a, b) => steps.findIndex((s) => s[1] === a[1] && s[0] === a[0]) - steps.findIndex((s) => s[1] === b[1] && s[0] === b[0]));
    assert.deepEqual(moves, steps);
});

test("§0.281 review: a status the job already holds — a press sent again holding everything it names is done ('already'); a co-technician's stale Complete over the lead's completion writes nothing, the lead's notes kept", async () => {
    const id = await seed('kept', 'on_site');
    const lead = await jobsFn(ev({ id, status: 'completed', completionNotes: 'Replaced compressor, tested OK', techNotes: 'lead' }));
    assert.equal(lead.statusCode, 200, lead.body);
    // The lead's answer lost, pressed again: done.
    const again = await jobsFn(ev({ id, status: 'completed', completionNotes: 'Replaced compressor, tested OK', techNotes: 'lead' }));
    assert.equal(again.statusCode, 409, again.body);
    assert.equal(body(again).code, 'already');
    assert.equal(body(again).error, 'This job is completed already.');
    // The co-technician's card still shows on site, its boxes empty: refused, the completion as the lead wrote it.
    const co = await jobsFn(ev({ id, status: 'completed', completionNotes: '', techNotes: 'as filed' }, CLERK.co));
    assert.equal(co.statusCode, 409, co.body);
    assert.equal(body(co).code, 'stale');
    assert.equal(body(co).error, 'This job is completed already — it changed since you opened it. Nothing was saved.');
    assert.equal(body(co).job.completionNotes, 'Replaced compressor, tested OK', 'the job as stored, for the card');
    const job = await jobOf(id);
    assert.equal(job.completionNotes, 'Replaced compressor, tested OK');
    assert.equal(job.techNotes, 'lead');
    assert.deepEqual((await historyOf(id)).map((h) => [h.fromStatus, h.toStatus]), [['on_site', 'completed']], 'one move recorded');
    // A co-technician's Start travel after the lead's: the job holds it — done, nothing written.
    const t = await seed('travel', 'scheduled');
    assert.equal((await jobsFn(ev({ id: t, status: 'en_route' }))).statusCode, 200);
    const coTravel = await jobsFn(ev({ id: t, status: 'en_route' }, CLERK.co));
    assert.equal(body(coTravel).code, 'already');
    assert.equal((await historyOf(t)).length, 1);
});

test('§0.281 a save naming no status lands on any job of theirs, a cancelled one too', async () => {
    const gone = await seed('notes', 'cancelled');
    const notes = await jobsFn(ev({ id: gone, techNotes: 'left the gate code' }));
    assert.equal(notes.statusCode, 200, notes.body);
    assert.equal((await jobOf(gone)).techNotes, 'left the gate code');
});

test("§0.281 a card that had not seen a dispatcher's change — its Complete over a job the dispatcher moved back to scheduled — is refused with the job as stored, and its next press from what it now shows lands", async () => {
    const id = await seed('card', 'on_site');
    await db.update(dispatchJobs).set({ status: 'scheduled', updatedAt: new Date() }).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, A)));
    const res = await jobsFn(ev({ id, status: 'completed' }));
    assert.equal(res.statusCode, 409, res.body);
    const shown = body(res).job;
    assert.equal(shown.status, 'scheduled');
    // The card now offers what the job as stored offers: Start travel.
    const next = await jobsFn(ev({ id, status: 'en_route' }));
    assert.equal(next.statusCode, 200, next.body);
    assert.deepEqual((await historyOf(id)).map((h) => [h.fromStatus, h.toStatus]), [['scheduled', 'en_route']]);
});
