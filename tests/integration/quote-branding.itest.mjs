// tests/integration/quote-branding.itest.mjs
// A customer's document names the org that sent it, never the app (state §0.234; guide §18b117;
// docs/design/quote-branding) — against the real test database. Proves:
//   IDENTITY  orgIdentityFor reads each org's own Company profile; with no display name, the org's name in Clerk
//             (asked only then); Clerk failing, no name and no refusal; org A never reads org B's
//   PDF       quote-pdf.mjs, rendered and read back: the caller's org's name, address and contact — a body naming
//             another org's profile changes nothing; the Clerk name when the profile has none; no app name anywhere
//   EMAIL     quote-email.mjs end to end, Resend's request captured: sent as the org (the From name), the reply to
//             the sending rep, the org's name and contact in the email, no app name and no link into the app; a rep
//             with no usable address — no reply-to and no reply asked for
//   LAYOUT    the dispatch customer emails in the org's own layout: no app name, no "account on", no preferences
//             link; asking for a reply only when one reaches the org; the members' layout untouched
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate and predicates; Clerk's organization read is
// mocked (no network); Resend's fetch is captured, every other fetch (the database's) passes through.
//
// Run:  npm run test:int   (needs DATABASE_URL_TEST)
if (!process.env.DATABASE_URL_TEST) {
    throw new Error('DATABASE_URL_TEST is not set — refusing to run integration tests against a non-test database.');
}
process.env.NETLIFY_DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.RESEND_API_KEY = 'itest_resend_key';
process.env.MAIL_FROM = 'Sales Pipeline <noreply@itest-brand.example>';
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || 'sk_test_itest_brand';

import { test, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

const roles = await import('../../src/utils/roles.js');
const gate  = await import('../../netlify/functions/_roleGate.mjs');

mock.module(new URL('../../netlify/functions/auth.mjs', import.meta.url).href, {
    namedExports: {
        verifyAuth: async (event) => {
            const orgId = event.headers?.['x-test-org'];
            if (!orgId) return { error: 'no test org', status: 401 };
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            const userId = event.headers?.['x-test-user'] || 'clerk_itest_brand_nobody';
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});

// ORG NAMESPACE: this file owns 'itest_brand_*', and only this file writes to it.
const A = 'itest_brand_A', B = 'itest_brand_B', C = 'itest_brand_C', D = 'itest_brand_D';

// Clerk's org read: a name for C, a failure for D; every ask recorded.
const clerkAsked = [];
mock.module('@clerk/backend', {
    namedExports: {
        createClerkClient: () => ({ organizations: { getOrganization: async ({ organizationId }) => {
            clerkAsked.push(organizationId);
            if (organizationId === D) throw new Error('Clerk is down');
            return { id: organizationId, name: 'Clerk Name ' + organizationId };
        } } }),
        verifyToken: async () => { throw new Error('not used'); },
    },
});

// Resend's request captured; the database's own fetches pass through.
const resend = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.resend.com/')) {
        resend.push(JSON.parse(init.body));
        return new Response(JSON.stringify({ id: 'itest_mail' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return realFetch(url, init);
};

const { handler: pdfFn }   = await import('../../netlify/functions/quote-pdf.mjs');
const { handler: emailFn } = await import('../../netlify/functions/quote-email.mjs');
const { orgIdentityFor }   = await import('../../netlify/functions/_orgIdentity.mjs');
const { emailTemplates }   = await import('../../netlify/functions/send-email.mjs');
const { db } = await import('../../db/index.js');
const { users, opportunities, quotes, auditLog, settings } = await import('../../db/schema.js');
const { eq } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { assertTestSchema } = await import('./_schema-guard.mjs');

const PROFILE_A = {
    companyDisplayName: 'Alpha Quotes & Co', companyAddress: '1 Alpha Way', companyCity: 'Austin', companyState: 'TX',
    companyZip: '78701', companyPhone: '512-555-0101', companySupportEmail: 'help@alpha.itest',
};
const PROFILE_B = {
    companyDisplayName: 'Bravo Rival Ltd', companyAddress: '9 Bravo Road', companyCity: 'Boston', companyState: 'MA',
    companyZip: '02110', companyPhone: '617-555-0909', companySupportEmail: 'help@bravo.itest',
};
const B_WORDS = ['Bravo', '9 Bravo Road', '617-555-0909', 'help@bravo.itest'];
const APP_WORDS = /accelerep|market street|san francisco|netlify\.app/i;

const CLERK_REP = 'clerk_itest_brand_rep', CLERK_NOREP = 'clerk_itest_brand_norep';
const OPP_A = 'opp_itest_brand_a';
const Q_MAIL = 'q_itest_brand_mail', Q_NOREPLY = 'q_itest_brand_noreply';

const ev = (org, body, user = CLERK_REP, role = 'Admin') => ({
    httpMethod: 'POST',
    headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: JSON.stringify(body),
});

// The PDF's text, read back: each content stream inflated, each TJ's hex pieces joined; and the Author string.
const pdfText = (b64) => {
    const raw = Buffer.from(b64, 'base64').toString('latin1');
    const lines = [];
    for (const m of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
        let s;
        try { s = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch { s = m[1]; }
        for (const t of s.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
            lines.push([...t[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => Buffer.from(h[1], 'hex').toString('latin1')).join(''));
        }
    }
    const ref = raw.match(/\/Author (\d+) 0 R/);
    let author = null;
    if (ref) {
        const obj = raw.match(new RegExp(`\\n${ref[1]} 0 obj\\s*([\\s\\S]*?)\\s*endobj`))?.[1] || '';
        const hex = obj.match(/^<([0-9a-fA-F]*)>$/)?.[1];
        if (!hex) author = obj.replace(/^\(|\)$/g, '');
        else if (hex.toUpperCase().startsWith('FEFF')) author = Buffer.from(hex.slice(4), 'hex').swap16().toString('utf16le');   // UTF-16BE, BOM
        else author = Buffer.from(hex, 'hex').toString('latin1');
    }
    return { lines, all: lines.join('\n'), raw, author };
};

const QUOTE_BODY = { id: 'q_body', name: 'Itest Brand Quote', quoteNumber: 'Q-ITEST-1', version: 1, status: 'Draft', lineItems: [] };

const cleanup = async () => {
    for (const o of [A, B, C, D]) {
        await db.delete(quotes).where(eq(quotes.orgId, o));
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await assertTestSchema(db);
    await cleanup();
    // C and D hold a settings row with no profile; nothing else differs.
    await db.insert(settings).values([
        { id: 'settings_' + A, orgId: A, extra: PROFILE_A },
        { id: 'settings_' + B, orgId: B, extra: PROFILE_B },
        { id: 'settings_' + C, orgId: C, extra: {} },
        { id: 'settings_' + D, orgId: D, extra: {} },
    ]);
    await db.insert(users).values([
        { id: 'usr_itest-brand-rep', clerkUserId: CLERK_REP, orgId: A, name: 'Itest Brand Rep', email: 'rep@alpha.itest', role: 'Admin' },
        { id: 'usr_itest-brand-norep', clerkUserId: CLERK_NOREP, orgId: A, name: 'Itest Brand NoRep', email: 'not-an-address', role: 'Admin' },
    ]);
    invalidateRoster();
    await db.insert(opportunities).values({ id: OPP_A, orgId: A, ownerId: 'usr_itest-brand-rep', salesRep: 'Itest Brand Rep', opportunityName: OPP_A, account: 'Itest Customer Co', pipelineId: 'default', stage: 'Proposal', arr: '1000.00' });
    const q = (id) => ({ id, orgId: A, opportunityId: OPP_A, quoteNumber: 'Q-ITEST-' + id.slice(-4), version: 1, name: id, status: 'Approved',
        approvedBy: 'Itest Brand Rep', approvedAt: new Date('2026-11-01T12:00:00Z'),
        lineItems: [{ productName: 'Itest Widget', productType: 'one_time', listPrice: 100, quantity: 1, discountPct: 0 }],
        billingContact: 'Pat Buyer <pat@customer.itest>', createdBy: 'Itest Brand Rep' });
    await db.insert(quotes).values([q(Q_MAIL), q(Q_NOREPLY)]);
});
after(async () => { await cleanup(); globalThis.fetch = realFetch; });

// ── IDENTITY ─────────────────────────────────────────────────────────────────

test('IDENTITY: each org reads its own Company profile; no display name — its Clerk name, asked only then; Clerk down — no name, no refusal', async () => {
    clerkAsked.length = 0;
    assert.deepEqual(await orgIdentityFor(A), { name: 'Alpha Quotes & Co', addressLines: ['1 Alpha Way', 'Austin, TX 78701'], phone: '512-555-0101', email: 'help@alpha.itest' });
    assert.equal((await orgIdentityFor(B)).name, 'Bravo Rival Ltd', 'org B its own');
    assert.deepEqual(clerkAsked, [], 'REGRESSION: Clerk asked for an org whose profile names it');
    assert.deepEqual(await orgIdentityFor(C), { name: 'Clerk Name ' + C, addressLines: [], phone: '', email: '' }, 'REGRESSION (Q1): no display name — not the org\'s Clerk name');
    assert.deepEqual(await orgIdentityFor(D), { name: '', addressLines: [], phone: '', email: '' }, 'REGRESSION: Clerk failing refuses, or names someone');
    assert.deepEqual(clerkAsked, [C, D], 'Clerk asked for C and D, by their own ids');
});

// ── PDF ──────────────────────────────────────────────────────────────────────

test('PDF: the caller\'s org\'s name, address and contact — a body naming another org\'s profile changes nothing; no app name anywhere', async () => {
    const r = await pdfFn(ev(A, { quote: QUOTE_BODY, opportunity: null, lines: [], companyProfile: { address: '9 Bravo Road', phone: '617-555-0909', notes: 'Bravo notes' } }));
    assert.equal(r.statusCode, 200, r.body);
    const pdf = pdfText(r.body);
    for (const want of ['ALPHA QUOTES & CO', '1 Alpha Way', 'Austin, TX 78701', '512-555-0101 · help@alpha.itest']) {
        assert.ok(pdf.lines.includes(want), `REGRESSION (§0.234): the PDF lacks "${want}" — got ${JSON.stringify(pdf.lines.slice(0, 8))}`);
    }
    assert.ok(pdf.lines.some((l) => l.startsWith('Alpha Quotes & Co · ')), 'the footer names the org');
    assert.equal(pdf.author, 'Alpha Quotes & Co', 'the PDF\'s Author is the org');
    for (const w of B_WORDS) assert.ok(!pdf.all.includes(w), `REGRESSION (R2): the body's profile reached the PDF — "${w}"`);
    assert.ok(!APP_WORDS.test(pdf.all) && !APP_WORDS.test(pdf.raw), 'REGRESSION (§0.234): the app\'s name or address on a customer\'s PDF');
    // Through the handler, one page: until §0.235 the quote number made a second page on every quote (dev, 9 Nov).
    assert.equal(pdf.raw.match(/\/Type \/Pages\s*\/Count (\d+)/)?.[1], '1', 'REGRESSION (§0.235): a short quote is more than one page');
});

test('PDF: no display name — the org\'s Clerk name; Clerk down — no name line and still a PDF; never the app\'s', async () => {
    const c = pdfText((await pdfFn(ev(C, { quote: QUOTE_BODY, lines: [] }))).body);
    assert.ok(c.lines.includes(('Clerk Name ' + C).toUpperCase()), 'REGRESSION (Q1): the Clerk name not printed');
    const d = await pdfFn(ev(D, { quote: QUOTE_BODY, lines: [] }));
    assert.equal(d.statusCode, 200, 'a quote still renders when Clerk is down');
    const dt = pdfText(d.body);
    assert.equal(dt.lines[0], 'Itest Brand Quote', 'no name: the quote name heads the page');
    assert.equal(dt.author, null, 'no name, no Author');
    assert.ok(!APP_WORDS.test(dt.all) && !APP_WORDS.test(dt.raw), 'REGRESSION: the app\'s name stands in for a missing one');
});

// ── EMAIL ────────────────────────────────────────────────────────────────────

test('EMAIL: sent as the org — the From name, the reply to the sending rep, the org\'s name and contact; no app name, no link into the app', async () => {
    resend.length = 0;
    const r = await emailFn(ev(A, { quoteId: Q_MAIL }));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(resend.length, 1);
    const [m] = resend;
    assert.deepEqual(m.to, ['pat@customer.itest']);
    assert.equal(m.from, '"Alpha Quotes & Co" <noreply@itest-brand.example>', 'REGRESSION (Q3): not sent as the org, or off the verified address');
    assert.equal(m.reply_to, 'rep@alpha.itest', 'REGRESSION (Q3): the customer\'s reply does not reach the rep who sent it');
    assert.ok(m.html.includes('>Alpha Quotes &amp; Co</p>'), 'the org\'s name heads it, escaped');
    assert.ok(m.html.includes('Alpha Quotes &amp; Co · 512-555-0101 · help@alpha.itest'), 'the org\'s name and contact close it');
    assert.ok(m.html.includes('Please reply to this email with any questions.'), 'a reply is asked for — it reaches the rep');
    assert.ok(!APP_WORDS.test(m.html), 'REGRESSION (§0.234): the app\'s name or a link into the app in a customer\'s email');
    for (const w of B_WORDS) assert.ok(!m.html.includes(w), `REGRESSION: another org's "${w}" in org A's email`);
});

test('EMAIL: a rep with no usable address — no reply-to, and no reply asked for', async () => {
    resend.length = 0;
    const r = await emailFn(ev(A, { quoteId: Q_NOREPLY }, CLERK_NOREP));
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(resend.length, 1);
    assert.ok(!('reply_to' in resend[0]), 'REGRESSION: a malformed reply address sent — Resend refuses it and the quote never goes out');
    assert.ok(!resend[0].html.includes('Please reply to this email'), 'REGRESSION: a reply asked for that reaches no one at the org');
    assert.equal(resend[0].from, '"Alpha Quotes & Co" <noreply@itest-brand.example>');
});

// ── LAYOUT ───────────────────────────────────────────────────────────────────

test('LAYOUT: the dispatch customer emails in the org\'s layout — no app name, no account, no preferences link; a reply asked only when it reaches the org', () => {
    const d = { companyName: 'Acme <HVAC>', contactLine: '555-0100 · help@acme.itest', customerName: 'Pat', jobTitle: 'Tune-up', when: 'Tuesday', techFirstName: 'Sam', statusUrl: null };
    for (const [name, html] of [
        ['confirmed', emailTemplates.customerAppointmentConfirmed({ ...d, canReply: true }).html],
        ['on the way', emailTemplates.customerTechOnTheWay(d).html],
    ]) {
        assert.ok(html.includes('<p class="header-title">Acme &lt;HVAC&gt;</p>'), `${name}: the org heads it, escaped`);
        assert.ok(html.includes('Acme &lt;HVAC&gt; · 555-0100 · help@acme.itest'), `${name}: the org's name and contact close it`);
        assert.ok(!APP_WORDS.test(html), `REGRESSION (§0.234): ${name} — the app's name to a customer`);
        assert.ok(!html.includes('account on') && !html.includes('/settings') && !html.includes('Manage notification preferences'),
            `REGRESSION (§0.234): ${name} — "an account on" the app, or a link into it`);
    }
    assert.ok(emailTemplates.customerAppointmentConfirmed({ ...d, canReply: true }).html.includes('Reply to this email or call'));
    assert.ok(!emailTemplates.customerAppointmentConfirmed({ ...d, canReply: false }).html.includes('Reply to this email'),
        'REGRESSION (Q3): a reply asked for with no support email to receive it');
    const none = emailTemplates.customerTechOnTheWay({ ...d, companyName: '', contactLine: '' }).html;
    assert.ok(!none.includes('class="header"') && !none.includes('class="footer"') && !APP_WORDS.test(none), 'no name: no header or footer, never the app\'s');
    assert.ok(emailTemplates.dealAssigned({ repName: 'R', dealName: 'D', assignedBy: 'A', opportunityId: 'o' }).html.includes('<p class="header-title">Accelerep</p>'),
        'the members\' layout is the app\'s, untouched');
});
