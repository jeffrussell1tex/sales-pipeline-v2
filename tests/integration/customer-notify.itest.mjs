// tests/integration/customer-notify.itest.mjs
// Customer-facing notifications (state §0.111) against the real test database,
// with the two senders mocked so nothing leaves the process. Proves: scheduling
// a job through the jobs function confirms the appointment by email AND text,
// issues the public token, and records both on the job; a save that changes
// nothing about the appointment sends nothing; en_route announces the technician
// once; without Twilio credentials the SMS attempt is recorded as "not
// configured", not attempted; an org with the switch off gets no message and no
// token; the public status page renders by token only, escaped, no-store, and
// 404s a malformed or unknown token; another org's customer is never read.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST; db/apply-customer-notifications.mjs --test first)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.URL = 'https://itest-notify.example.com';
delete process.env.APP_URL;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'User';
            return { userId: 'clerk_' + orgId, orgId, userRole, managedReps: [], error: null };
        },
        isAppRole:    (r) => ['Admin', 'Manager', 'User', 'ReadOnly', 'Technician'].includes(r),
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isReadOnly:   (role) => role === 'ReadOnly',
        isTechnician: (role) => role === 'Technician',
        requireRole: (auth, allowedRoles, headers) => (
            allowedRoles.includes(auth?.userRole) ? null
                : { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: insufficient role' }) }
        ),
        requireWrite: (auth, event, headers) => {
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(event?.httpMethod)) return null;
            if (['ReadOnly', 'Technician'].includes(auth?.userRole)) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: read-only access' }) };
            return null;
        },
    },
});

// The senders record instead of sending. The templates are the real shapes'
// contract: { subject, html } from the detail the notifier builds.
const mails = [], texts = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async (opts) => { mails.push(opts); return { success: true, id: 'test' }; },
        emailTemplates: {
            customerAppointmentConfirmed: (d) => ({ subject: `CONFIRM ${d.jobTitle} ${d.when}`, html: `<p>${d.statusUrl || ''}</p>` }),
            customerTechOnTheWay:         (d) => ({ subject: `ONTHEWAY ${d.techFirstName || ''}`, html: `<p>${d.statusUrl || ''}</p>` }),
        },
    },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: {
        sendSms: async (opts) => { texts.push(opts); return { success: true, sid: 'SMtest' }; },
        smsTemplates: {},
        normalizePhone: (p) => p,
    },
});

const { handler: jobs } = await import('../../netlify/functions/dispatch-jobs.mjs');
const { handler: statusPage } = await import('../../netlify/functions/dispatch-status.mjs');
const { db } = await import('../../db/index.js');
const { dispatchJobs, dispatchCustomers, dispatchTechnicians, dispatchJobStatusHistory, settings } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const ORG_A = 'itest_notify_A', ORG_B = 'itest_notify_B';
const CUST_A = 'dcust_itest_notify_a', CUST_B = 'dcust_itest_notify_b';
const TECH_A = 'tech_itest_notify_a';
const JOB_A = 'job_itest_notify_a', JOB_B = 'job_itest_notify_b';

const call = (method, org, { body, params } = {}) => jobs({
    httpMethod: method, queryStringParameters: params || {},
    headers: { 'x-test-org': org }, body: body ? JSON.stringify(body) : undefined,
});
const parse = (r) => ({ status: r.statusCode, body: JSON.parse(r.body || '{}') });
const rowOf = async (id) => (await db.select().from(dispatchJobs).where(eq(dispatchJobs.id, id)))[0];
const withTwilio = async (fn) => {
    const prev = [process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN, process.env.TWILIO_FROM_NUMBER];
    process.env.TWILIO_ACCOUNT_SID = 'ACtest'; process.env.TWILIO_AUTH_TOKEN = 'tok'; process.env.TWILIO_FROM_NUMBER = '+15550000000';
    try { return await fn(); } finally {
        [process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN, process.env.TWILIO_FROM_NUMBER] = prev;
        for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER']) if (process.env[k] === undefined) delete process.env[k];
    }
};
const withoutTwilio = async (fn) => {
    const prev = [process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN, process.env.TWILIO_FROM_NUMBER];
    delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_FROM_NUMBER;
    try { return await fn(); } finally {
        if (prev[0] !== undefined) process.env.TWILIO_ACCOUNT_SID = prev[0];
        if (prev[1] !== undefined) process.env.TWILIO_AUTH_TOKEN = prev[1];
        if (prev[2] !== undefined) process.env.TWILIO_FROM_NUMBER = prev[2];
    }
};

const cleanup = async () => {
    for (const o of [ORG_A, ORG_B]) {
        await db.delete(dispatchJobStatusHistory).where(eq(dispatchJobStatusHistory.orgId, o));
        await db.delete(dispatchJobs).where(eq(dispatchJobs.orgId, o));
        await db.delete(dispatchCustomers).where(eq(dispatchCustomers.orgId, o));
        await db.delete(dispatchTechnicians).where(eq(dispatchTechnicians.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(settings).values([
        { id: 'settings_' + ORG_A, orgId: ORG_A, companyName: 'Acme <HVAC> & Sons', extra: { customerNotifications: { enabled: true } } },
        { id: 'settings_' + ORG_B, orgId: ORG_B, companyName: 'Beta Plumbing', extra: { customerNotifications: { enabled: false } } },
    ]);
    await db.insert(dispatchCustomers).values([
        { id: CUST_A, orgId: ORG_A, name: 'Itest Customer A', contactName: 'Pat', contactEmail: 'pat@itest-notify.local', contactPhone: '+15551234567', customerType: 'commercial', serviceAddress: '1 Main St', serviceCity: 'Austin', serviceState: 'TX' },
        { id: CUST_B, orgId: ORG_B, name: 'Itest Customer B', contactEmail: 'b@itest-notify.local', contactPhone: '+15557654321', customerType: 'commercial' },
    ]);
    await db.insert(dispatchTechnicians).values([
        { id: TECH_A, orgId: ORG_A, firstName: 'Sam', lastName: 'Tech' },
    ]);
    await db.insert(dispatchJobs).values([
        { id: JOB_A, orgId: ORG_A, customerId: CUST_A, title: 'Furnace <tune-up>', status: 'unscheduled' },
        { id: JOB_B, orgId: ORG_B, customerId: CUST_B, title: 'Drain clean', status: 'unscheduled' },
    ]);
});

after(async () => { await cleanup(); });

let token = null;

test('scheduling confirms by email and text, issues the token, and records both on the job', async () => {
    const r = await withTwilio(() => call('PUT', ORG_A, { params: { id: JOB_A }, body: {
        id: JOB_A, status: 'scheduled', assignedTechId: TECH_A, scheduledDate: '2026-09-15', scheduledStart: '08:00', scheduledEnd: '10:00', timeSlot: 'exact',
    } }));
    const p = parse(r);
    assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.equal(mails.length, 1);
    assert.equal(mails[0].to, 'pat@itest-notify.local');
    assert.ok(mails[0].subject.startsWith('CONFIRM Furnace <tune-up> Tuesday, September 15, 2026 between 8:00 AM and 10:00 AM'), mails[0].subject);
    assert.equal(texts.length, 1);
    assert.equal(texts[0].to, '+15551234567');
    assert.ok(texts[0].body.startsWith('Acme <HVAC> & Sons: your Furnace <tune-up> visit is scheduled for Tuesday, September 15, 2026'), texts[0].body);
    token = p.body.job.publicToken;
    assert.ok(typeof token === 'string' && /^[A-Za-z0-9_-]{32}$/.test(token), 'a 24-byte base64url token: ' + token);
    assert.ok(texts[0].body.endsWith(` Details: https://itest-notify.example.com/status/${token}`), 'the link rides in the text');
    assert.ok(mails[0].html.includes(`/status/${token}`), 'and in the email');
    const trail = p.body.job.customerNotifications;
    assert.deepEqual(trail.map(t => [t.type, t.channel, t.ok]), [['confirmation', 'email', true], ['confirmation', 'sms', true]]);
    assert.equal(trail[0].to, 'pat@itest-notify.local');
    const row = await rowOf(JOB_A);
    assert.equal(row.publicToken, token);
    assert.equal(row.customerNotifications.length, 2);
});

test('a save that changes nothing about the appointment sends nothing and keeps the token', async () => {
    const p = parse(await withTwilio(() => call('PUT', ORG_A, { params: { id: JOB_A }, body: { id: JOB_A, techNotes: 'gate code 4321' } })));
    assert.equal(p.status, 200);
    assert.equal(mails.length, 1);
    assert.equal(texts.length, 1);
    assert.equal(p.body.job.publicToken, token);
    assert.equal(p.body.job.customerNotifications.length, 2);
});

test('without Twilio credentials the text is recorded as not configured, not attempted; the email still goes', async () => {
    const p = parse(await withoutTwilio(() => call('PUT', ORG_A, { params: { id: JOB_A }, body: { id: JOB_A, scheduledDate: '2026-09-16' } })));
    assert.equal(p.status, 200);
    assert.equal(mails.length, 2, 'a new date is a new confirmation');
    assert.equal(texts.length, 1, 'no SMS attempt');
    const last = p.body.job.customerNotifications.slice(-2);
    assert.deepEqual(last.map(t => [t.type, t.channel, t.ok]), [['confirmation', 'email', true], ['confirmation', 'sms', false]]);
    assert.equal(last[1].error, 'SMS not configured on this site');
    assert.equal(p.body.job.publicToken, token, 'the token is issued once');
});

test('en_route announces the technician once, by name', async () => {
    const p = parse(await withTwilio(() => call('PUT', ORG_A, { params: { id: JOB_A }, body: { id: JOB_A, status: 'en_route' } })));
    assert.equal(p.status, 200);
    assert.equal(mails.length, 3);
    assert.equal(mails[2].subject, 'ONTHEWAY Sam');
    assert.equal(texts.length, 2);
    assert.ok(texts[1].body.startsWith('Acme <HVAC> & Sons: Sam is on the way for your Furnace <tune-up> visit.'), texts[1].body);
    const again = parse(await withTwilio(() => call('PUT', ORG_A, { params: { id: JOB_A }, body: { id: JOB_A, status: 'on_site' } })));
    assert.equal(again.status, 200);
    assert.equal(mails.length, 3, 'arriving says nothing');
    assert.equal(texts.length, 2);
});

test('an org with the switch off: no message, no token, an empty trail', async () => {
    const p = parse(await withTwilio(() => call('PUT', ORG_B, { params: { id: JOB_B }, body: { id: JOB_B, status: 'scheduled', scheduledDate: '2026-09-15', timeSlot: 'morning' } })));
    assert.equal(p.status, 200, JSON.stringify(p.body));
    assert.equal(mails.length, 3);
    assert.equal(texts.length, 2);
    assert.equal(p.body.job.publicToken, null);
    assert.deepEqual(p.body.job.customerNotifications, []);
});

test('the public status page renders by token only, escaped and no-store; malformed and unknown tokens are the same 404', async () => {
    const ok = await statusPage({ httpMethod: 'GET', queryStringParameters: { t: token } });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.headers['Cache-Control'], 'no-store');
    assert.equal(ok.headers['X-Robots-Tag'], 'noindex, nofollow');
    assert.ok(ok.body.includes('Acme &lt;HVAC&gt; &amp; Sons'), 'the company name is escaped');
    assert.ok(ok.body.includes('Furnace &lt;tune-up&gt;'), 'the title is escaped');
    assert.ok(!ok.body.includes('<HVAC>') && !ok.body.includes('<tune-up>'), 'raw angle brackets never reach the page');
    assert.ok(ok.body.includes('Your technician is on site'), 'the customer-facing status, not the internal one');
    assert.ok(!ok.body.includes('on_site'), 'internal vocabulary stays internal');
    assert.ok(ok.body.includes('Wednesday, September 16, 2026'), 'the current appointment');
    assert.ok(ok.body.includes('>Sam<'), 'the technician\'s first name only');
    assert.ok(!ok.body.includes('Tech<'), 'no surname');
    assert.ok(ok.body.includes('1 Main St, Austin, TX'));
    assert.ok(!ok.body.includes(JOB_A) && !ok.body.includes(ORG_A) && !ok.body.includes(CUST_A), 'no id of any kind on the page');
    assert.ok(!ok.body.includes('pat@itest-notify.local') && !ok.body.includes('5551234567'), 'no contact details on the page');

    // The pretty path rewrites to /.netlify/functions/dispatch-status/<token>:
    // the token arrives as the last path segment, with no query string at all.
    const byPath = await statusPage({ httpMethod: 'GET', path: `/.netlify/functions/dispatch-status/${token}`, queryStringParameters: {} });
    assert.equal(byPath.statusCode, 200, 'found by the path segment of a direct call');
    assert.ok(byPath.body.includes('Furnace &lt;tune-up&gt;'));
    // A 200 rewrite hands the function the BROWSER'S path, not the rewritten target.
    const byPretty = await statusPage({ httpMethod: 'GET', path: `/status/${token}`, queryStringParameters: {} });
    assert.equal(byPretty.statusCode, 200, 'found by the path segment of the rewritten request');
    const literal = await statusPage({ httpMethod: 'GET', path: '/.netlify/functions/dispatch-status/:token', queryStringParameters: {} });
    assert.equal(literal.statusCode, 404, 'the unsubstituted placeholder is not a token');

    const bad = await statusPage({ httpMethod: 'GET', queryStringParameters: { t: 'short' } });
    const unknown = await statusPage({ httpMethod: 'GET', queryStringParameters: { t: 'x'.repeat(32) } });
    const byId = await statusPage({ httpMethod: 'GET', queryStringParameters: { t: JOB_A } });
    assert.equal(bad.statusCode, 404);
    assert.equal(unknown.statusCode, 404);
    assert.equal(byId.statusCode, 404, 'a job id is not a token');
    assert.equal(bad.body, unknown.body, 'the two 404s are indistinguishable');
    assert.equal((await statusPage({ httpMethod: 'POST', queryStringParameters: { t: token } })).statusCode, 405);
});
