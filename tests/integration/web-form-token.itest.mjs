// tests/integration/web-form-token.itest.mjs
// State §0.161 — the cross-org audit's second CRITICAL (2 Oct 2026): an Admin of any org
// could save another org's public web-form token into their own settings, and the public
// intake answered for whichever row carrying it came first. Against the real test database:
//   SAVE      an Admin who saves another org's token is given their OWN; the owner's form
//             still lands in the owner's org, and nowhere else
//   RESTORE   a backup restore's settings row is the restoring org's — never another org's
//             id, never a form token, never an Anthropic key; an org that has its row is
//             unchanged; the owner's row is untouched and its form still answers
//   UNIQUE    the database refuses a second settings row for an org, and a second org for a
//             token (db/apply-settings-uniqueness.mjs, applied to the test database)
//   INBOUND   with BCC_SECRET unset the inbound POST answers 503 — no dropbox address is
//             computable under an empty key
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST, with the uniqueness indexes applied:
//       node --env-file=.env db/apply-settings-uniqueness.mjs --test --apply)
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
            return { userId: event.headers?.['x-test-user'] || 'clerk_itest_wft_nobody', orgId, userRole: event.headers?.['x-test-role'] || 'Admin', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
// The intake's side effects are not this file's subject.
mock.module(new URL('../../netlify/functions/send-slack.mjs', import.meta.url).href, {
    namedExports: { sendSlackToOrg: async () => true, slackTemplates: { webLead: () => ({ text: 'web lead' }) } },
});
mock.module(new URL('../../netlify/functions/webhooks.mjs', import.meta.url).href, { namedExports: { dispatchWebhook: async () => {} } });
mock.module(new URL('../../netlify/functions/dispatch-automations.mjs', import.meta.url).href, { namedExports: { dispatchAutomations: async () => {} } });
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: new Proxy({}, { get: () => () => ({}) }) },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});

const { handler: settingsFn } = await import('../../netlify/functions/settings.mjs');
const { handler: backupFn }   = await import('../../netlify/functions/backup.mjs');
const { handler: intakeFn }   = await import('../../netlify/functions/lead-intake.mjs');
const { handler: inboundFn }  = await import('../../netlify/functions/email-inbound.mjs');
const { db } = await import('../../db/index.js');
const { settings, leads, auditLog, backups } = await import('../../db/schema.js');
const { eq, inArray, sql } = await import('drizzle-orm');
const { TOKEN_RE } = await import('../../src/utils/webToLead.js');

// ORG NAMESPACE: this file owns 'itest_wft_*'.
const A = 'itest_wft_A', B = 'itest_wft_B', C = 'itest_wft_C', D = 'itest_wft_D';
const ORGS = [A, B, C, D];
const TA = 'itestWftTokenAAAAAAAAAAAAAAAAA01';   // 32 base64url chars — org A's public token

const ev = (org, method, body) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-role': 'Admin', 'x-test-user': `clerk_itest_wft_${org}` },
    queryStringParameters: {},
    body: body === undefined ? undefined : JSON.stringify(body),
});
const rowOf = async (org) => (await db.select().from(settings).where(eq(settings.orgId, org)))[0] || null;
const leadsOf = (org) => db.select().from(leads).where(eq(leads.orgId, org));
const submit = (token) => intakeFn({
    httpMethod: 'POST', path: '/.netlify/functions/lead-intake',
    headers: { 'content-type': 'application/json' }, queryStringParameters: { t: token },
    body: JSON.stringify({ firstName: 'Pat', email: 'pat@itest.local', message: 'Hello' }),
});
const pgSays = (re) => (e) => re.test(`${e?.message || ''} ${e?.cause?.message || ''}`);

async function cleanup() {
    await db.delete(leads).where(inArray(leads.orgId, ORGS));
    await db.delete(auditLog).where(inArray(auditLog.orgId, ORGS));
    await db.delete(backups).where(inArray(backups.orgId, ORGS));
    await db.delete(settings).where(inArray(settings.orgId, ORGS));
}

before(async () => {
    await cleanup();
    await db.insert(settings).values([
        { id: A, orgId: A, companyName: 'Alpha Co', extra: { webToLead: { enabled: true, token: TA, source: 'Website' }, companyDisplayName: 'Alpha Company' } },
        { id: B, orgId: B, companyName: 'Beta Co', extra: {} },
    ]);
});
after(cleanup);

test('UNIQUE: the database holds both indexes, valid — a second row for an org, or a second org for a token, is refused', async () => {
    const res = await db.execute(sql`SELECT c.relname AS name, i.indisunique AS u, i.indisvalid AS v FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE i.indrelid = 'settings'::regclass`);
    const idx = Object.fromEntries((res.rows || res).map(r => [r.name, r]));
    for (const name of ['settings_org_id_uniq', 'settings_web_to_lead_token_uq']) {
        assert.ok(idx[name], `${name} is applied to the test database (db/apply-settings-uniqueness.mjs --test --apply)`);
        assert.equal(idx[name].u && idx[name].v, true, `${name} unique and valid`);
    }
    await assert.rejects(db.insert(settings).values({ id: 'itest_wft_A_second', orgId: A, extra: {} }), pgSays(/settings_org_id_uniq|duplicate key/), 'a second settings row for org A');
    await assert.rejects(db.insert(settings).values({ id: D, orgId: D, extra: { webToLead: { enabled: true, token: TA } } }), pgSays(/settings_web_to_lead_token_uq|duplicate key/), "org D carrying org A's token");
    assert.equal((await db.select().from(settings).where(eq(settings.orgId, A))).length, 1);
    assert.equal(await rowOf(D), null);
});

test("SAVE: an Admin who saves another org's token is given their own; the owner's form still lands in the owner's org, and nowhere else", async () => {
    const r = await settingsFn(ev(B, 'PUT', { webToLead: { enabled: true, token: TA, source: 'Copied' } }));
    assert.equal(r.statusCode, 200, r.body);
    const b = await rowOf(B);
    assert.match(b.extra.webToLead.token, TOKEN_RE);
    assert.notEqual(b.extra.webToLead.token, TA, "REGRESSION: another org's token, saved as given");
    assert.equal((await rowOf(A)).extra.webToLead.token, TA, "the owner's row untouched");
    const res = await submit(TA);
    assert.equal(res.statusCode, 201, res.body);
    assert.equal((await leadsOf(A)).length, 1, "the lead lands in the owner's org");
    assert.equal((await leadsOf(B)).length, 0, 'and nowhere else');
});

test("RESTORE: a settings row from a file is the restoring org's — never another org's id, token or key; an org that has its row is unchanged", async () => {
    const file = { entities: { settings: [{ id: A, orgId: A, companyName: 'Restored Co', extra: { webToLead: { enabled: true, token: TA }, anthropicApiKey: 'aa:bb:cc', companyDisplayName: 'Restored Company' } }] } };
    const r = await backupFn(ev(C, 'PATCH', file));
    assert.equal(r.statusCode, 200, r.body);
    const c = await rowOf(C);
    assert.ok(c, 'C, which had no settings, has its row');
    assert.equal(c.id, C, "REGRESSION: the id is the org's, never the file's");
    assert.deepEqual([c.extra.webToLead.token, c.extra.webToLead.enabled], [null, false], 'no form token — the form comes back off');
    assert.equal('anthropicApiKey' in c.extra, false, 'no stored key');
    assert.equal(c.extra.companyDisplayName, 'Restored Company', 'the rest of the row is restored');
    const a = await rowOf(A);
    assert.deepEqual([a.id, a.extra.webToLead.token, a.companyName], [A, TA, 'Alpha Co'], "the owner's row untouched");
    const bBefore = await rowOf(B);
    const r2 = await backupFn(ev(B, 'PATCH', file));
    assert.notEqual(r2.statusCode, 403, r2.body);
    assert.deepEqual(await rowOf(B), bBefore, 'an org that has its row: unchanged');
    assert.equal((await submit(TA)).statusCode, 201, "the owner's form still answers");
    assert.equal((await leadsOf(C)).length, 0);
});

test('INBOUND: with BCC_SECRET unset the inbound POST answers 503 — no dropbox address is computable under an empty key', async () => {
    const saved = { bcc: process.env.BCC_SECRET, shared: process.env.INBOUND_SHARED_SECRET };
    process.env.INBOUND_SHARED_SECRET = 'itest-wft-inbound-shared';
    delete process.env.BCC_SECRET;
    try {
        const r = await inboundFn({
            httpMethod: 'POST', headers: { 'content-type': 'application/json' },
            queryStringParameters: { secret: 'itest-wft-inbound-shared' },
            body: JSON.stringify({ from: 'someone@itest.local', to: ['log-itest_wft_A-0000000000000000@in.itest.local'], subject: 'forged', text: 'forged' }),
        });
        assert.equal(r.statusCode, 503, r.body);
    } finally {
        if (saved.bcc === undefined) delete process.env.BCC_SECRET; else process.env.BCC_SECRET = saved.bcc;
        if (saved.shared === undefined) delete process.env.INBOUND_SHARED_SECRET; else process.env.INBOUND_SHARED_SECRET = saved.shared;
    }
});
