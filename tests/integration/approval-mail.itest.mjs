// tests/integration/approval-mail.itest.mjs
// Batch (E2) — the approval emails (state §0.158; Jeff, 2 Oct, each answer a) —
// against the real test database, mail captured, never sent. Proves, on quotes.mjs
// and quote-reminders.mjs:
//   SUBMIT    a submission tells the tier's named approver (by person), the role's
//             holders (by role), every Manager (an org that has not chosen) — never
//             the submitter, never a reader who switched the notice off; a failed send
//             never undoes the save
//   DECIDE    an approval or a send-back tells the person who submitted it (from the
//             record), with the approver's note — never the approver; a reader's
//             switch off sends nothing
//   REMIND    a quote waiting past its tier's SLA reminds the backup once, and the
//             record says so; a fresh submission or a tier without an SLA is not
//             due; another org's quotes are not touched
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate and predicates;
// the templates are stubs that record what they were handed (their escaping is
// pinned by tests/approval-notices.test.mjs).
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
            const userRole = event.headers?.['x-test-role'] || 'Admin';
            const userId = event.headers?.['x-test-user'] || 'clerk_itest_amail_nobody';
            return { userId, orgId, userRole, managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
const mails = [];
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: {
        sendEmail: async (o) => {
            if (String(o.to).includes('boom')) throw new Error('mailbox on fire');
            mails.push(o);
            return { success: true };
        },
        emailTemplates: {
            quoteWaiting: (d) => ({ subject: `${d.reminder ? 'REMINDER' : 'WAITING'} ${d.name}`, html: JSON.stringify(d) }),
            quoteDecided: (d) => ({ subject: `DECIDED ${d.decision} ${d.name}`, html: JSON.stringify(d) }),
        },
    },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});

const { handler: quotesFn } = await import('../../netlify/functions/quotes.mjs');
const { runQuoteReminders } = await import('../../netlify/functions/quote-reminders.mjs');
const { db } = await import('../../db/index.js');
const { users, opportunities, quotes, auditLog, settings } = await import('../../db/schema.js');
const { eq, and } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');

// ORG NAMESPACE: this file owns 'itest_amail_*', and only this file writes to it.
const ORG = { P: 'itest_amail_P', R: 'itest_amail_R', L: 'itest_amail_L', B: 'itest_amail_B' };
const PEOPLE = [
    // [key, org, role, extra]
    ['adminP', 'P', 'Admin'], ['bob', 'P', 'Manager'], ['jane', 'P', 'Manager'], ['karen', 'P', 'User'],
    ['adminR', 'R', 'Admin'], ['mgrR1', 'R', 'Manager'], ['mgrR2', 'R', 'Manager', { profile: { notificationPrefs: { quotePending: { enabled: false } } } }], ['repR', 'R', 'User'],
    ['adminL', 'L', 'Admin'], ['mgrL', 'L', 'Manager'], ['boomL', 'L', 'Manager', { email: 'boom@itest.local' }], ['repL', 'L', 'User'],
    ['mgrB', 'B', 'Manager'], ['repB', 'B', 'User'],
];
const CLERK = Object.fromEntries(PEOPLE.map(([k]) => [k, `clerk_itest_amail_${k}`]));
const USR = Object.fromEntries(PEOPLE.map(([k]) => [k, `usr_itest-amail-${k}`]));
const NAME = (k) => `Itest Amail ${k}`;
const ROLE = Object.fromEntries(PEOPLE.map(([k, , r]) => [k, r]));
const Q = {
    pSub: 'q_itest_amail_p_sub', pDec: 'q_itest_amail_p_dec', pBack: 'q_itest_amail_p_back', pBack2: 'q_itest_amail_p_back2',
    pRemind: 'q_itest_amail_p_remind', pFresh: 'q_itest_amail_p_fresh', pNoSla: 'q_itest_amail_p_nosla',
    rSub: 'q_itest_amail_r_sub', lSub: 'q_itest_amail_l_sub', bRemind: 'q_itest_amail_b_remind',
};
const H = 3600000, D = 24 * H;
const lines = (disc) => [{ productId: 'p_itest_amail', productName: 'Itest Platform', productType: 'recurring', unit: 'month', listPrice: 100, quantity: 2, discountPct: disc }];

const ev = (org, role, user, method = 'GET', body) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    queryStringParameters: {},
});
const parse = (r) => ({ status: r.statusCode, body: (() => { try { return JSON.parse(r.body || '{}'); } catch { return {}; } })() });
const orgOf = Object.fromEntries(PEOPLE.map(([k, o]) => [k, ORG[o]]));
const as = (k, body) => quotesFn(ev(orgOf[k], ROLE[k], CLERK[k], 'PUT', body)).then(parse);
const row = async (id) => (await db.select().from(quotes).where(eq(quotes.id, id)))[0];
const to = () => mails.map(m => m.to).sort();
const email = (k) => `amail-${k}@itest.local`;

const cleanup = async () => {
    for (const o of Object.values(ORG)) {
        await db.delete(quotes).where(eq(quotes.orgId, o));
        await db.delete(opportunities).where(eq(opportunities.orgId, o));
        await db.delete(auditLog).where(eq(auditLog.orgId, o));
        await db.delete(settings).where(eq(settings.orgId, o));
        await db.delete(users).where(eq(users.orgId, o));
    }
};

before(async () => {
    await cleanup();
    await db.insert(users).values(PEOPLE.map(([k, o, role, extra = {}]) => ({
        id: USR[k], clerkUserId: CLERK[k], orgId: ORG[o], name: NAME(k), email: email(k), role, ...extra,
    })));
    invalidateRoster();
    await db.insert(settings).values([
        { id: ORG.P, orgId: ORG.P, extra: { approvalRouting: 'person', approvalTiers: [
            { id: 'rep', label: 'Rep', maxDiscount: 0.1 },
            { id: 'mgr', label: 'Mgr approval', maxDiscount: 0.2, approverUserId: USR.bob, backupUserId: USR.jane, sla: '24h' },
            { id: 'top', label: 'Top approval', maxDiscount: 1, approverUserId: USR.bob, sla: null },
        ] } },
        { id: ORG.R, orgId: ORG.R, extra: { approvalRouting: 'role', approvalTiers: [
            { id: 'rep', label: 'Rep', maxDiscount: 0.1 },
            { id: 'all', label: 'Approval', maxDiscount: 1, approverRole: 'Manager', backupRole: 'Admin', sla: '8h' },
        ] } },
        { id: ORG.B, orgId: ORG.B, extra: { approvalRouting: 'role', approvalTiers: [
            { id: 'rep', label: 'Rep', maxDiscount: 0.1 }, { id: 'all', label: 'Approval', maxDiscount: 1, approverRole: 'Manager', sla: '1h' },
        ] } },
    ]);
    const owner = { P: 'karen', R: 'repR', L: 'repL', B: 'repB' };
    await db.insert(opportunities).values(Object.entries(ORG).map(([k, o]) => ({
        id: `opp_itest_amail_${k}`, orgId: o, ownerId: USR[owner[k]], salesRep: NAME(owner[k]), opportunityName: `Deal ${k}`, account: `Account ${k}`, pipelineId: 'default', stage: 'Proposal', arr: '1000.00',
    })));
    const q = (id, o, status, disc) => ({
        id, orgId: ORG[o], opportunityId: `opp_itest_amail_${o}`, quoteNumber: 'Q-2026-6' + (10 + Object.values(Q).indexOf(id)),
        version: 1, name: id, status, lineItems: lines(disc), createdBy: NAME(owner[o]), totalValue: '170.00',
    });
    await db.insert(quotes).values([
        q(Q.pSub, 'P', 'Draft', 15), q(Q.pDec, 'P', 'Pending Approval', 15), q(Q.pBack, 'P', 'Pending Approval', 15), q(Q.pBack2, 'P', 'Pending Approval', 15),
        q(Q.pRemind, 'P', 'Pending Approval', 15), q(Q.pFresh, 'P', 'Pending Approval', 15), q(Q.pNoSla, 'P', 'Pending Approval', 25),
        q(Q.rSub, 'R', 'Draft', 25), q(Q.lSub, 'L', 'Draft', 25), q(Q.bRemind, 'B', 'Pending Approval', 25),
    ]);
    // The record: who submitted what, and when — what a decision's notice and the reminder read.
    const submitted = (quoteId, o, by, msAgo) => ({ id: `audit_itest_amail_${quoteId}`, orgId: ORG[o], action: 'quote.submitted', entityType: 'quote',
        entityId: quoteId, entityName: quoteId, detail: null, userId: CLERK[by], userName: NAME(by), timestamp: new Date(Date.now() - msAgo) });
    await db.insert(auditLog).values([
        submitted(Q.pDec, 'P', 'karen', 2 * H), submitted(Q.pBack, 'P', 'karen', 2 * H), submitted(Q.pBack2, 'P', 'karen', 2 * H),
        submitted(Q.pRemind, 'P', 'karen', 3 * D), submitted(Q.pFresh, 'P', 'karen', 1 * H), submitted(Q.pNoSla, 'P', 'karen', 3 * D),
        submitted(Q.bRemind, 'B', 'repB', 3 * D),
    ]);
});
after(cleanup);

test('SUBMIT: by person, the named approver — not the backup, not the submitter', async () => {
    mails.length = 0;
    const res = await as('karen', { id: Q.pSub, status: 'Pending Approval' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(to(), [email('bob')]);
    const d = JSON.parse(mails[0].html);
    assert.equal(mails[0].subject, `WAITING ${NAME('bob')}`);
    assert.equal(d.submittedBy, NAME('karen'), 'by the roster\'s name');
    assert.equal(d.account, 'Account P');
    assert.equal(d.tierLabel, 'Mgr approval');
    assert.equal(d.discountPct, 15);
    assert.ok(d.url.endsWith(`/?quote=${Q.pSub}`), 'the link opens the quote');
});

test('SUBMIT: by role, every holder whose switch is on; an org that has not chosen, every Manager — and a failed send never undoes the save', async () => {
    mails.length = 0;
    assert.equal((await as('repR', { id: Q.rSub, status: 'Pending Approval' })).status, 200);
    assert.deepEqual(to(), [email('mgrR1')], 'mgrR2 switched the notice off; the Admin is the backup, not the approver');
    mails.length = 0;
    const res = await as('repL', { id: Q.lSub, status: 'Pending Approval' });
    assert.equal(res.status, 200, 'the boom Manager\'s mailbox throws — the save stands');
    assert.equal((await row(Q.lSub)).status, 'Pending Approval');
    assert.deepEqual(to(), [email('mgrL')], 'every Manager (the one whose send failed is not here); not the Admin');
});

test('DECIDE: an approval or a send-back tells the person who submitted it, with the note; never the approver; a switch off sends nothing', async () => {
    mails.length = 0;
    assert.equal((await as('bob', { id: Q.pDec, status: 'Approved' })).status, 200);
    assert.deepEqual(to(), [email('karen')]);
    assert.equal(mails[0].subject, `DECIDED approved ${NAME('karen')}`);
    assert.equal(JSON.parse(mails[0].html).decidedBy, NAME('bob'));
    mails.length = 0;
    assert.equal((await as('jane', { id: Q.pBack, status: 'Draft', sendBack: true, sendBackNote: 'Under 20% <b>please</b>' })).status, 200, 'the backup decides');
    assert.deepEqual(to(), [email('karen')]);
    const d = JSON.parse(mails[0].html);
    assert.equal(d.decision, 'sentBack');
    assert.equal(d.note, 'Under 20% <b>please</b>', 'the note as typed — the template escapes it');
    mails.length = 0;
    await db.update(users).set({ profile: { notificationPrefs: { quoteRejected: { enabled: false } } } }).where(eq(users.id, USR.karen));
    invalidateRoster();
    assert.equal((await as('bob', { id: Q.pBack2, status: 'Draft', sendBack: true, sendBackNote: 'again' })).status, 200);
    assert.deepEqual(mails, [], 'karen switched "Quote sent back" off');
});

test('REMIND: a quote waiting past its SLA reminds the backup once, on the record; fresh or SLA-less quotes are not due; another org is untouched', async () => {
    mails.length = 0;
    const first = parse(await runQuoteReminders({ orgId: ORG.P }));
    assert.equal(first.status, 200);
    assert.equal(first.body.reminded, 1, JSON.stringify(first.body));
    assert.deepEqual(to(), [email('jane')], 'the backup');
    assert.equal(mails[0].subject, `REMINDER ${NAME('jane')}`);
    assert.ok(JSON.parse(mails[0].html).waitedHours >= 24);
    const [rec] = await db.select().from(auditLog).where(and(eq(auditLog.orgId, ORG.P), eq(auditLog.entityId, Q.pRemind), eq(auditLog.action, 'quote.reminded')));
    assert.ok(rec, 'the reminder is on the record');
    assert.equal(rec.userName, 'Approval reminders');
    assert.match(rec.detail, new RegExp(`· to ${NAME('jane')}$`));
    mails.length = 0;
    const second = parse(await runQuoteReminders({ orgId: ORG.P }));
    assert.equal(second.body.reminded, 0, 'once per submission');
    assert.deepEqual(mails, []);
    for (const id of [Q.pFresh, Q.pNoSla]) {
        assert.equal((await db.select().from(auditLog).where(and(eq(auditLog.entityId, id), eq(auditLog.action, 'quote.reminded')))).length, 0, `${id} not due`);
    }
    assert.equal((await db.select().from(auditLog).where(and(eq(auditLog.orgId, ORG.B), eq(auditLog.action, 'quote.reminded')))).length, 0, 'org B, overdue, untouched by org P\'s pass');
});
