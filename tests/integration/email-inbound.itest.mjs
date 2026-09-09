// tests/integration/email-inbound.itest.mjs
// The BCC email dropbox against the real database (state §0.91 — Jeff: "option
// 1 … I also like the from address attribution"). Proves: the GET hands the
// caller the org address and THEIR personal address; an email through the org
// address from a roster member is owned by that member, from a stranger is
// unowned; an email through a personal address is owned by that user whoever
// sent it, and may land on any contact in the org; a forged personal
// signature, a deactivated user's address, and an org signature replayed as a
// user's are all refused; a personal address never reaches another org's
// contacts; a replayed Message-ID is deduplicated.
//
// The POST path is exercised through INBOUND_SHARED_SECRET (the non-Resend
// provider branch); RESEND_API_KEY is unset so the flat payload is used as-is.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.BCC_SECRET = 'itest-bcc-secret';
process.env.INBOUND_DOMAIN = 'inbound.itest.test';
process.env.INBOUND_SHARED_SECRET = 'itest-shared';
delete process.env.RESEND_API_KEY;
delete process.env.RESEND_INBOUND_SECRET;

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'User';
            const userId = event.headers?.['x-test-user'] || 'clerk_' + orgId;
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        canSeeAll:    (role) => role === 'Admin' || role === 'Manager',
        isReadOnly:   (role) => role === 'ReadOnly',
        isTechnician: (role) => role === 'Technician',
        requireRole:  () => null,
        requireWrite: () => null,
    },
});

const { handler } = await import('../../netlify/functions/email-inbound.mjs');
const { db } = await import('../../db/index.js');
const { users, contacts, activities } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const ORG_A = 'itest_bcc_A';
const ORG_B = 'itest_bcc_B';
const ADA  = { id: 'usr_00000000-0000-4000-8000-00000000bcc1', orgId: ORG_A, clerkUserId: 'clerk_ada',  name: 'Ada Rep',   email: 'ada@alpha.test',  role: 'User',  active: true };
const IAN  = { id: 'usr_00000000-0000-4000-8000-00000000bcc2', orgId: ORG_A, clerkUserId: 'clerk_ian',  name: 'Ian Gone',  email: 'ian@alpha.test',  role: 'User',  active: false };
const BEA  = { id: 'usr_00000000-0000-4000-8000-00000000bcc3', orgId: ORG_B, clerkUserId: 'clerk_bea',  name: 'Bea Other', email: 'bea@beta.test',   role: 'User',  active: true };
const CARL = { id: 'ct_itest_bcc_carl', orgId: ORG_A, firstName: 'Carl', lastName: 'Client', email: 'carl@client.test' };
const DORA = { id: 'ct_itest_bcc_dora', orgId: ORG_B, firstName: 'Dora', lastName: 'Elsewhere', email: 'dora@other.test' };

const sig16 = (s) => crypto.createHmac('sha256', process.env.BCC_SECRET).update(s).digest('hex').slice(0, 16);
const orgAddr  = (org) => `log-${org}-${sig16(org)}@${process.env.INBOUND_DOMAIN}`;
const userAddr = (id)  => `me-${id}-${sig16('user:' + id)}@${process.env.INBOUND_DOMAIN}`;

const get = (org, user) => handler({ httpMethod: 'GET', headers: { 'x-test-org': org, 'x-test-user': user }, queryStringParameters: {} });
let seq = 0;
const post = (dropbox, { from, to = ['carl@client.test'], subject = 'Hello', text = 'Body', message_id, attachments } = {}) => handler({
    httpMethod: 'POST', headers: {},
    queryStringParameters: { secret: process.env.INBOUND_SHARED_SECRET },
    body: JSON.stringify({ from, to: [dropbox], cc: to, subject, text, message_id: message_id || `<m${++seq}@itest>`, ...(attachments ? { attachments } : {}) }),
});
const parse = (r) => ({ status: r.statusCode, body: JSON.parse(r.body || '{}') });
const activitiesOf = (org) => db.select().from(activities).where(eq(activities.orgId, org));

const cleanup = async () => {
    for (const o of [ORG_A, ORG_B]) {
        await db.delete(activities).where(eq(activities.orgId, o));
        await db.delete(contacts).where(eq(contacts.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    await db.insert(users).values([ADA, IAN, BEA]);
    await db.insert(contacts).values([CARL, DORA]);
});
after(cleanup);

test('GET: the org address for the workspace and the caller\'s own personal address', async () => {
    const { status, body } = parse(await get(ORG_A, 'clerk_ada'));
    assert.equal(status, 200);
    assert.equal(body.configured, true);
    assert.equal(body.address, orgAddr(ORG_A));
    assert.equal(body.myAddress, userAddr(ADA.id), 'resolved through users.clerk_user_id, org-scoped');
    const stranger = parse(await get(ORG_A, 'clerk_nobody'));
    assert.equal(stranger.body.address, orgAddr(ORG_A));
    assert.equal(stranger.body.myAddress, null, 'no roster row, no personal address');
});

test('org address, sender on the roster: the activity is OWNED by the sender and authored with their name', async () => {
    const { status, body } = parse(await post(orgAddr(ORG_A), { from: 'Ada Rep <Ada@Alpha.test>' }));
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.matched, true);
    assert.equal(body.ownerId, ADA.id);
    const [a] = (await activitiesOf(ORG_A)).filter(x => x.id === body.activityId);
    assert.equal(a.ownerId, ADA.id);
    assert.equal(a.author, 'Ada Rep');
    assert.equal(a.contactId, CARL.id);
    assert.equal(a.type, 'Email');
});

test('org address, sender not on the roster: unowned, attributed to the raw sender', async () => {
    const { body } = parse(await post(orgAddr(ORG_A), { from: 'someone@else.test' }));
    assert.equal(body.matched, true);
    assert.equal(body.ownerId, null);
    const [a] = (await activitiesOf(ORG_A)).filter(x => x.id === body.activityId);
    assert.equal(a.ownerId, null);
    assert.equal(a.author, 'someone@else.test');
});

test('org address, sender is a DEACTIVATED roster member: unowned', async () => {
    const { body } = parse(await post(orgAddr(ORG_A), { from: 'ian@alpha.test' }));
    assert.equal(body.matched, true);
    assert.equal(body.ownerId, null);
});

test('personal address: owned by that user whoever sent it, on any contact in the org (option 1)', async () => {
    const { body } = parse(await post(userAddr(ADA.id), { from: 'ada.personal@gmail.test' }));
    assert.equal(body.matched, true, JSON.stringify(body));
    assert.equal(body.ownerId, ADA.id, 'the address names the owner; the From address does not matter');
    const [a] = (await activitiesOf(ORG_A)).filter(x => x.id === body.activityId);
    assert.equal(a.ownerId, ADA.id);
    assert.equal(a.author, 'Ada Rep');
    assert.equal(a.orgId, ORG_A, 'the org came from the user row');
});

test('personal address: a forged signature, a deactivated user, and an org signature replayed as a user\'s are all refused', async () => {
    const countBefore = (await activitiesOf(ORG_A)).length;
    const forged = `me-${ADA.id}-${'0'.repeat(16)}@${process.env.INBOUND_DOMAIN}`;
    assert.equal(parse(await post(forged, { from: 'x@y.test' })).body.matched, false);
    assert.equal(parse(await post(userAddr(IAN.id), { from: 'ian@alpha.test' })).body.matched, false, 'deactivated');
    const replay = `me-${ADA.id}-${sig16(ADA.id)}@${process.env.INBOUND_DOMAIN}`;   // the org-namespace HMAC of the id
    assert.equal(parse(await post(replay, { from: 'x@y.test' })).body.matched, false, 'namespace confusion');
    assert.equal((await activitiesOf(ORG_A)).length, countBefore, 'nothing was logged');
});

test('personal address: never reaches another org\'s contacts', async () => {
    // Bea's address (org B) on an email to Carl (org A): org B has no Carl.
    const { body } = parse(await post(userAddr(BEA.id), { from: 'bea@beta.test', to: ['carl@client.test'] }));
    assert.equal(body.matched, false);
    assert.equal(body.reason, 'no contact matched participants');
    assert.equal((await activitiesOf(ORG_B)).length, 0);
    // And on an email to Dora (org B): owned by Bea, in org B.
    const ok = parse(await post(userAddr(BEA.id), { from: 'bea@beta.test', to: ['dora@other.test'] }));
    assert.equal(ok.body.matched, true);
    assert.equal(ok.body.ownerId, BEA.id);
    assert.equal((await activitiesOf(ORG_B))[0].orgId, ORG_B);
});

test('a replayed Message-ID is deduplicated, not logged twice', async () => {
    const first = parse(await post(orgAddr(ORG_A), { from: 'ada@alpha.test', message_id: '<dup-1@itest>' }));
    const again = parse(await post(orgAddr(ORG_A), { from: 'ada@alpha.test', message_id: '<dup-1@itest>' }));
    assert.equal(first.body.matched, true);
    assert.equal(again.body.deduped, true);
    assert.equal(again.body.activityId, first.body.activityId);
});

test("the body keeps its line breaks and the attachment names are recorded (§0.93, Jeff's steps 7 and 9)", async () => {
    const text = 'Jeff\r\n\r\nThis is a test email with an attachment\r\nIt is for your use only\r\n\r\nThanks,\r\nKaren';
    const { body } = parse(await post(orgAddr(ORG_A), { from: 'ada@alpha.test', subject: 'Test email #4', text, attachments: [{ filename: 'quote.pdf', size: 12 }, { name: 'sheet.xlsx' }] }));
    assert.equal(body.matched, true);
    const [a] = (await activitiesOf(ORG_A)).filter(x => x.id === body.activityId);
    assert.equal(a.notes, 'Test email #4 — Jeff\n\nThis is a test email with an attachment\nIt is for your use only\n\nThanks,\nKaren\n\nAttachments: quote.pdf, sheet.xlsx');
    assert.equal(a.subject, 'Test email #4');
});

test('a one-line body with no attachments stores exactly as before (the §0.91 shape)', async () => {
    const { body } = parse(await post(orgAddr(ORG_A), { from: 'ada@alpha.test', subject: 'Test email', text: 'Test email for logging' }));
    const [a] = (await activitiesOf(ORG_A)).filter(x => x.id === body.activityId);
    assert.equal(a.notes, 'Test email — Test email for logging');
});

test('the envelope is on the row: From, To, Cc and the Message-ID (item 27, state §0.105); an email without a Message-ID stores null there', async () => {
    const { body } = parse(await post(orgAddr(ORG_A), { from: 'ada@alpha.test', subject: 'Envelope', text: 'Body', message_id: '<env-1@itest>' }));
    assert.equal(body.matched, true);
    const [a] = (await activitiesOf(ORG_A)).filter(x => x.id === body.activityId);
    assert.equal(a.emailFrom, 'ada@alpha.test', 'From as the payload gave it');
    assert.deepEqual(a.emailTo, [orgAddr(ORG_A).toLowerCase()], 'the flat payload\'s To is the dropbox itself — stored as given (Resend\'s header To replaces it when the message is fetched)');
    assert.deepEqual(a.emailCc, ['carl@client.test'], 'Cc');
    assert.equal(a.emailMessageId, '<env-1@itest>', 'REGRESSION: the Message-ID is on the row, not only hashed into its id');
    // Without a Message-ID the id is random and the column is null — not '' and not undefined.
    const r2 = handler({
        httpMethod: 'POST', headers: {}, queryStringParameters: { secret: process.env.INBOUND_SHARED_SECRET },
        body: JSON.stringify({ from: 'ada@alpha.test', to: [orgAddr(ORG_A)], cc: ['carl@client.test'], subject: 'No id', text: 'Body' }),
    });
    const { body: b2 } = parse(await r2);
    const [a2] = (await activitiesOf(ORG_A)).filter(x => x.id === b2.activityId);
    assert.equal(a2.emailMessageId, null);
    assert.equal(a2.emailFrom, 'ada@alpha.test');
});
