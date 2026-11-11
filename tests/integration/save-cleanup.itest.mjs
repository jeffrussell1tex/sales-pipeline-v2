// tests/integration/save-cleanup.itest.mjs
// The save cleanup batch's server half (state §0.242, guide §18b125; docs/design/save-cleanup Parts 1-3, Jeff's
// answers 10 Nov) — against the real test database, with the real handlers. Proves:
//   PRODUCTS   a PUT is an update of the keys it names: a partial save keeps the name and the minimum price; an id
//              the org does not hold (none, or another org's) is a 404 and nothing is written (Q1); a list price none
//              is refused unless the product is custom-priced, which stores 0 and comes back ticked (Q2); a POST of an
//              id in use is a 409; who made a product is the caller's name, never the body's
//   PRICE BOOK the bodies the screen builds (src/utils/productChanges.js) through the real handler: an edit writes only
//              what changed — the minimum price kept, no '' over a none — and Custom / Variable Price round-trips
//   EXPORTS    the export schedule and GDPR request PUTs merge over the stored row in the org: a partial save keeps
//              the rest and the maker; an unknown id or another org's is a 404; a request's completed time follows
//              its status in and out of 'completed'; its SLA deadline is never counted again
//   BACKUP     the schedule save keeps each field the body leaves out — the failure address above all; '' clears it
//   PERCENTS   a deal discount, a line's discount, the org's default tax rate and a service plan's discount named out
//              of range is a 400 naming the field and nothing is written — an Approved quote's deal keeps its arr;
//              the value the row already holds, re-sent, stands (Q3)
//   ORG B      its rows of every table above, byte for byte
//
// The auth mock fakes the SIGN-IN only and re-exports the REAL gate and predicates; mail and SMS are stubbed.
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
            return { userId: event.headers?.['x-test-user'] || 'clerk_itest_save_nobody', orgId, userRole: event.headers?.['x-test-role'] || 'Admin', managedReps: [], error: null };
        },
        APP_ROLES: roles.APP_ROLES, isAppRole: roles.isAppRole,
        isAdmin: roles.isAdmin, isManager: roles.isManager, canSeeAll: roles.canSeeAll,
        isReadOnly: roles.isReadOnly, isTechnician: roles.isTechnician, isDispatcher: roles.isDispatcher,
        requireWrite: gate.requireWrite, requireRole: gate.requireRole,
    },
});
mock.module(new URL('../../netlify/functions/send-email.mjs', import.meta.url).href, {
    namedExports: { sendEmail: async () => ({ success: true }), emailTemplates: new Proxy({}, { get: () => () => ({}) }) },
});
mock.module(new URL('../../netlify/functions/send-sms.mjs', import.meta.url).href, {
    namedExports: { sendSms: async () => ({ success: true }), smsTemplates: {}, normalizePhone: (p) => p },
});

const { handler: productsFn }  = await import('../../netlify/functions/products.mjs');
const { handler: quotesFn }    = await import('../../netlify/functions/quotes.mjs');
const { handler: settingsFn }  = await import('../../netlify/functions/settings.mjs');
const { handler: schedulesFn } = await import('../../netlify/functions/export-schedules.mjs');
const { handler: dsrFn }       = await import('../../netlify/functions/export-dsr.mjs');
const { handler: backupFn }    = await import('../../netlify/functions/backup.mjs');
const { handler: plansFn }     = await import('../../netlify/functions/dispatch-service-plans.mjs');
const { db } = await import('../../db/index.js');
const { users, opportunities, quotes, auditLog, settings, products, exportSchedules, dsrQueue, backupSchedule, dispatchServicePlans } = await import('../../db/schema.js');
const { eq, sql, and } = await import('drizzle-orm');
const { invalidateRoster } = await import('../../netlify/functions/_lib.mjs');
const { assertTestSchema } = await import('./_schema-guard.mjs');
// The Price Book's bodies (state §0.242, Part 1d): what the screen sends, run through the real handler.
const { productForm, productChanges } = await import('../../src/utils/productChanges.js');

// ORG NAMESPACE: this file owns 'itest_save_*', and only this file writes to it.
const A = 'itest_save_A', B = 'itest_save_B';
const ORGS = [A, B];
const CLERK = { rep: 'clerk_itest_save_rep', admin: 'clerk_itest_save_admin', adminB: 'clerk_itest_save_admin_b' };
const USR = { rep: 'usr_itest-save-rep', admin: 'usr_itest-save-admin', adminB: 'usr_itest-save-admin-b' };
const P = { min: 'p_itest_save_min', plain: 'p_itest_save_plain', b: 'p_itest_save_b' };
const OPP = { a: 'opp_itest_save_a', b: 'opp_itest_save_b' };
const Q = { appr: 'q_itest_save_appr', draft: 'q_itest_save_draft', held: 'q_itest_save_held', b: 'q_itest_save_b' };
const ES = { a: 'es_itest_save_a', b: 'es_itest_save_b' };
const DSR = { a: 'dsr_itest_save_a', b: 'dsr_itest_save_b' };
const SP = { a: 'sp_itest_save_a', held: 'sp_itest_save_held', b: 'sp_itest_save_b' };
const SLA = new Date('2026-12-01T12:00:00Z');

const ev = (org, role, user, method = 'GET', body, qs) => ({
    httpMethod: method,
    headers: { 'x-test-org': org, 'x-test-role': role, 'x-test-user': user, 'content-type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    queryStringParameters: qs || {},
});
const parse = (r) => ({ status: r.statusCode, body: (() => { try { return JSON.parse(r.body || '{}'); } catch { return {}; } })() });
const admin = (fn, m, b, qs) => fn(ev(A, 'Admin', CLERK.admin, m, b, qs)).then(parse);
const rep = (m, b) => quotesFn(ev(A, 'User', CLERK.rep, m, b)).then(parse);
// A row as the database holds it, as text — every column compared, no driver parsing in between.
const rowText = async (table, id) => (await db.select({ t: sql`row_to_json(${table})::text` }).from(table).where(eq(table.id, id)))[0]?.t ?? null;
const one = async (table, id) => (await db.select().from(table).where(eq(table.id, id)))[0];
const auditsFor = async (entityId) => (await db.select().from(auditLog).where(and(eq(auditLog.orgId, A), eq(auditLog.entityId, entityId)))).length;
const dealArr = async (id) => (await db.select({ arr: opportunities.arr }).from(opportunities).where(eq(opportunities.id, id)))[0].arr;
const extraText = async (org) => (await db.select({ t: sql`${settings.extra}::text` }).from(settings).where(eq(settings.orgId, org)))[0]?.t ?? null;

const line = (productId, listPrice, extra = {}) => ({ productId, productName: 'Itest Save thing', productType: 'one_time', unit: 'flat', listPrice, quantity: 1, discountPct: 0, ...extra });
const TABLES = [quotes, products, opportunities, exportSchedules, dsrQueue, backupSchedule, dispatchServicePlans, auditLog, settings, users];

const cleanup = async () => {
    for (const o of ORGS) for (const t of TABLES) await db.delete(t).where(eq(t.orgId, o));
};
const bState = async () => {
    const out = {};
    for (const t of TABLES) {
        if (t === auditLog) continue;
        out[t[Symbol.for('drizzle:Name')] || String(TABLES.indexOf(t))] = (await db.select({ id: t.id, t: sql`row_to_json(${t})::text` }).from(t).where(eq(t.orgId, B)))
            .sort((x, y) => String(x.id).localeCompare(String(y.id)));
    }
    return JSON.stringify(out);
};

let bBefore;
before(async () => {
    await assertTestSchema(db);
    await cleanup();
    const u = (key, role, org = A) => ({ id: USR[key], clerkUserId: CLERK[key], orgId: org, name: `Itest Save ${key}`, email: `save-${key}@itest.local`, role });
    await db.insert(users).values([u('rep', 'User'), u('admin', 'Admin'), u('adminB', 'Admin', B)]);
    invalidateRoster();
    // A settings row's id is its org's (settings.mjs writes by id: orgId).
    await db.insert(settings).values([
        { id: A, orgId: A, extra: { quoteDefaults: { validity: '30 days', taxRate: 8.25 }, dispatchEnabled: true } },
        { id: B, orgId: B, extra: { quoteDefaults: { validity: '30 days', taxRate: 5 }, dispatchEnabled: true } },
    ]);
    await db.insert(products).values([
        { id: P.min, orgId: A, name: 'Itest Save floor', productType: 'one_time', unit: 'flat', listPrice: '100.00', minPrice: '40.00', description: 'kept', createdBy: 'Seeded maker' },
        { id: P.plain, orgId: A, name: 'Itest Save plain', productType: 'one_time', unit: 'flat', listPrice: '20.00' },
        { id: P.b, orgId: B, name: 'Itest Save B', productType: 'one_time', unit: 'flat', listPrice: '10.00', minPrice: '5.00' },
    ]);
    const opp = (id, org) => ({ id, orgId: org, ownerId: org === A ? USR.rep : null, salesRep: org === A ? 'Itest Save rep' : '',
        opportunityName: id, account: 'Itest Save Co', pipelineId: 'default', stage: 'Proposal', arr: '1.00' });
    await db.insert(opportunities).values([opp(OPP.a, A), opp(OPP.b, B)]);
    const quote = (id, org, status, lineItems, extra = {}) => ({ id, orgId: org, opportunityId: org === A ? OPP.a : OPP.b, quoteNumber: 'Q-2026-8' + id.slice(-2),
        version: 1, name: id, status, lineItems, subtotal: '100.00', dealDiscount: '0.00', totalValue: '100.00', recurringValue: '0.00', oneTimeValue: '100.00',
        createdBy: 'Itest Save rep', approvalTier: 'Rep', ...extra });
    await db.insert(quotes).values([
        quote(Q.appr, A, 'Approved', [line(P.min, 100)], { approvedBy: 'Itest Save mgr', approvedAt: new Date() }),
        quote(Q.draft, A, 'Draft', [line(P.min, 100, { discountPct: 10 })], { subtotal: '90.00', totalValue: '90.00', oneTimeValue: '90.00' }),
        // Held before the rule (as a restore could land it): a line at 150% and a deal discount of -5.
        quote(Q.held, A, 'Draft', [line(P.min, 100, { discountPct: 150 })], { dealDiscount: '-5.00' }),
        quote(Q.b, B, 'Draft', [line(P.b, 10)], { createdBy: 'B' }),
    ]);
    await db.insert(exportSchedules).values([
        { id: ES.a, orgId: A, name: 'Itest Save weekly', scope: 'accounts', cadence: 'weekly', destination: 'download', createdBy: 'clerk_itest_save_maker' },
        { id: ES.b, orgId: B, name: 'Itest Save B weekly', scope: 'contacts', cadence: 'weekly', createdBy: 'clerk_itest_save_maker_b' },
    ]);
    await db.insert(dsrQueue).values([
        { id: DSR.a, orgId: A, subject: 'subject-a@itest.local', type: 'access', status: 'in-progress', notes: 'kept', slaDeadline: SLA, createdBy: 'clerk_itest_save_maker' },
        { id: DSR.b, orgId: B, subject: 'subject-b@itest.local', type: 'erasure', status: 'in-progress', slaDeadline: SLA, createdBy: 'clerk_itest_save_maker_b' },
    ]);
    await db.insert(backupSchedule).values([
        { id: `sched_${A}`, orgId: A, frequency: 'Daily', timeUtc: '04:00', retentionDays: 14, notifyOnFailure: 'ops-a@itest.local' },
        { id: `sched_${B}`, orgId: B, frequency: 'Daily', timeUtc: '05:00', retentionDays: 7, notifyOnFailure: 'ops-b@itest.local' },
    ]);
    await db.insert(dispatchServicePlans).values([
        { id: SP.a, orgId: A, name: 'Itest Save plan', discountPercent: '10.00' },
        { id: SP.held, orgId: A, name: 'Itest Save held plan', discountPercent: '150.00' },
        { id: SP.b, orgId: B, name: 'Itest Save B plan', discountPercent: '20.00' },
    ]);
    bBefore = await bState();
});
after(cleanup);

// ── PRODUCTS ─────────────────────────────────────────────────────────────────

test('PRODUCTS: a partial save writes only what it names — the name, list price, minimum price and maker kept', async () => {
    const before = await one(products, P.min);
    const res = await admin(productsFn, 'PUT', { id: P.min, active: false });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const r = await one(products, P.min);
    assert.equal(r.active, false);
    assert.equal(r.name, 'Itest Save floor', 'the name kept — the old upsert\'s insert refused a body without it (a 500)');
    assert.equal(r.minPrice, '40.00', 'REGRESSION: every Price Book edit wiped the minimum price');
    assert.equal(r.listPrice, '100.00');
    assert.equal(r.description, 'kept');
    assert.equal(r.createdBy, 'Seeded maker', 'who made it is the stored one');
    assert.equal(r.createdAt.getTime(), before.createdAt.getTime());
    assert.equal(await auditsFor(P.min), 1, 'one audit row for the real update');
    // The minimum price is written when named: blank is none; a number is kept to the column.
    assert.equal((await admin(productsFn, 'PUT', { id: P.min, minPrice: 45, active: true })).status, 200);
    assert.equal((await one(products, P.min)).minPrice, '45.00');
    assert.equal((await admin(productsFn, 'PUT', { id: P.min, minPrice: '' })).status, 200);
    assert.equal((await one(products, P.min)).minPrice, null);
    // The body's maker is never taken.
    assert.equal((await admin(productsFn, 'PUT', { id: P.min, createdBy: 'Mallory', minPrice: 40 })).status, 200);
    assert.equal((await one(products, P.min)).createdBy, 'Seeded maker');
});

test('PRODUCTS: an id this org does not hold is a 404 and nothing is written — none, or another org\'s (Q1)', async () => {
    const res = await admin(productsFn, 'PUT', { id: 'p_itest_save_nope', name: 'Made by a PUT', listPrice: 5 });
    assert.equal(res.status, 404, JSON.stringify(res.body));
    assert.equal(await one(products, 'p_itest_save_nope'), undefined, 'REGRESSION: a PUT made a product');
    assert.equal(await auditsFor('p_itest_save_nope'), 0, 'no audit row for a write that did not happen');
    const bBeforeRow = await rowText(products, P.b);
    const other = await admin(productsFn, 'PUT', { id: P.b, name: 'Mallory', active: false });
    assert.equal(other.status, 404);
    assert.equal(await rowText(products, P.b), bBeforeRow, 'org B\'s product byte for byte');
});

test('PRODUCTS: a list price none is refused unless the product is custom-priced; junk is refused naming the field; nothing written', async () => {
    const before = await rowText(products, P.plain);
    for (const [body, field] of [
        [{ listPrice: null }, 'listPrice'], [{ listPrice: '' }, 'listPrice'], [{ listPrice: 'abc' }, 'listPrice'], [{ listPrice: true }, 'listPrice'],
        [{ name: '   ' }, 'name'], [{ minPrice: 'x' }, 'minPrice'], [{ customPrice: 'yes' }, 'customPrice'],
    ]) {
        const res = await admin(productsFn, 'PUT', { id: P.plain, ...body });
        assert.equal(res.status, 400, `${JSON.stringify(body)}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.field, field, JSON.stringify(body));
        assert.equal(await rowText(products, P.plain), before, `${JSON.stringify(body)}: nothing written`);
    }
    const post = await admin(productsFn, 'POST', { id: 'p_itest_save_noprice', name: 'No price', listPrice: null });
    assert.equal(post.status, 400);
    assert.equal(post.body.field, 'listPrice');
    assert.equal(await one(products, 'p_itest_save_noprice'), undefined);
    const junk = await admin(productsFn, 'POST', { id: 'p_itest_save_junk', name: 'Junk price', listPrice: 'abc' });
    assert.equal(junk.status, 400);
    assert.equal(await one(products, 'p_itest_save_junk'), undefined);
});

test('PRODUCTS: a custom-price product saves with a list price of 0 and comes back ticked (Q2); the maker is the caller\'s name', async () => {
    const made = await admin(productsFn, 'POST', { id: 'p_itest_save_custom', name: 'Itest Save custom', productType: 'one_time', unit: 'flat', listPrice: null, customPrice: true, createdBy: 'Mallory' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    let r = await one(products, 'p_itest_save_custom');
    assert.equal(r.listPrice, '0.00');
    assert.equal(r.customPrice, true);
    assert.equal(r.createdBy, 'Itest Save admin', 'the caller\'s roster name — never the body\'s');
    assert.equal(made.body.product.customPrice, true, 'the answer carries it');
    // An edit switched to custom (the Price Book's form sends listPrice null).
    const sw = await admin(productsFn, 'PUT', { id: P.plain, customPrice: true, listPrice: null });
    assert.equal(sw.status, 200, JSON.stringify(sw.body));
    r = await one(products, P.plain);
    assert.equal(r.listPrice, '0.00');
    assert.equal(r.customPrice, true);
    // And back, with a price.
    assert.equal((await admin(productsFn, 'PUT', { id: P.plain, customPrice: false, listPrice: 75 })).status, 200);
    r = await one(products, P.plain);
    assert.equal(r.listPrice, '75.00');
    assert.equal(r.customPrice, false);
    // A stored custom product's list price none is not refused.
    assert.equal((await admin(productsFn, 'PUT', { id: 'p_itest_save_custom', listPrice: null, name: 'Itest Save custom, renamed' })).status, 200);
    assert.equal((await one(products, 'p_itest_save_custom')).listPrice, '0.00');
});

test('THE PRICE BOOK: the bodies productChanges builds, through the real handler — only what changed is written, the switch round-trips', async () => {
    const PB = 'p_itest_save_pb';
    await db.insert(products).values({ id: PB, orgId: A, name: 'Itest Save book', productType: 'one_time', unit: 'flat', listPrice: '60.00', minPrice: '25.00', sku: 'SKU-PB' });
    const stored = async () => one(products, PB);
    const save = async (form) => {
        const s = await stored();
        const body = productChanges(s, form);
        if (!Object.keys(body).length) return null;          // the screen sends nothing
        return admin(productsFn, 'PUT', { ...body, id: s.id });
    };
    // Unchanged: nothing sent. The form's blank Category and Description are the stored none.
    assert.equal(await save(productForm(await stored())), null);
    // Active switched off: one key; the minimum price, SKU, category and description kept as stored (none stays none).
    let res = await save({ ...productForm(await stored()), active: false });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    let r = await stored();
    assert.equal(r.active, false);
    assert.equal(r.minPrice, '25.00', 'REGRESSION: a Price Book edit wiped the minimum price');
    assert.equal(r.sku, 'SKU-PB');
    assert.equal(r.category, null, "REGRESSION: '' written over a stored none");
    assert.equal(r.description, null);
    // Custom / Variable Price ticked: saved, list price 0, and the form opens ticked (Q2).
    res = await save({ ...productForm(r), customPrice: true, listPrice: '' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    r = await stored();
    assert.equal(r.customPrice, true);
    assert.equal(r.listPrice, '0.00');
    assert.equal(productForm(r).customPrice, true, 'comes back ticked');
    assert.equal(productForm(r).listPrice, '', 'its stored 0 is no price on the form');
    // A rename of a custom product sends no price, and the server keeps it custom.
    res = await save({ ...productForm(r), name: 'Itest Save book, renamed' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await stored()).customPrice, true);
    // Unticked with a price: the price the form typed.
    res = await save({ ...productForm(await stored()), customPrice: false, listPrice: '33' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    r = await stored();
    assert.equal(r.customPrice, false);
    assert.equal(r.listPrice, '33.00');
    assert.equal(r.minPrice, '25.00');
    // A new custom product: the whole form, POSTed.
    const made = await admin(productsFn, 'POST', { ...productChanges(null, { name: 'Itest Save new custom', category: '', productType: 'one_time', listPrice: '', unit: 'flat', description: '', active: true, customPrice: true, taxable: true }), id: 'p_itest_save_pb_new' });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    r = await one(products, 'p_itest_save_pb_new');
    assert.equal(r.customPrice, true);
    assert.equal(r.listPrice, '0.00');
    assert.equal(r.category, null);
});

test('PRODUCTS: a POST of an id in use is a 409 and writes nothing — this org\'s or another\'s', async () => {
    const before = await rowText(products, P.min);
    const mine = await admin(productsFn, 'POST', { id: P.min, name: 'Again', listPrice: 1 });
    assert.equal(mine.status, 409, JSON.stringify(mine.body));
    assert.equal(await rowText(products, P.min), before);
    const bRow = await rowText(products, P.b);
    const theirs = await admin(productsFn, 'POST', { id: P.b, name: 'Mallory', listPrice: 1 });
    assert.equal(theirs.status, 409, 'REGRESSION: a primary-key 500');
    assert.equal(await rowText(products, P.b), bRow);
});

// ── EXPORTS ──────────────────────────────────────────────────────────────────

test('EXPORTS: a schedule\'s partial save keeps the rest and its maker; an id the org does not hold is a 404, nothing written', async () => {
    const res = await admin(schedulesFn, 'PUT', { id: ES.a, enabled: false });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    let r = await one(exportSchedules, ES.a);
    assert.equal(r.enabled, false);
    assert.equal(r.name, 'Itest Save weekly', 'REGRESSION: a toggle wrote the name as none');
    assert.equal(r.scope, 'accounts');
    assert.equal(r.cadence, 'weekly');
    assert.equal(r.createdBy, 'clerk_itest_save_maker', 'REGRESSION: a save wrote the maker as none');
    assert.equal((await admin(schedulesFn, 'PUT', { id: ES.a, name: 'Itest Save renamed', createdBy: 'Mallory' })).status, 200);
    r = await one(exportSchedules, ES.a);
    assert.equal(r.name, 'Itest Save renamed');
    assert.equal(r.createdBy, 'clerk_itest_save_maker', 'the body\'s maker never taken');
    assert.equal(r.enabled, false, 'the earlier toggle kept');
    const nope = await admin(schedulesFn, 'PUT', { id: 'es_itest_save_nope', name: 'Made by a PUT', scope: 'accounts', cadence: 'daily' });
    assert.equal(nope.status, 404);
    assert.equal(await one(exportSchedules, 'es_itest_save_nope'), undefined, 'REGRESSION: a PUT made a schedule');
    const bRow = await rowText(exportSchedules, ES.b);
    assert.equal((await admin(schedulesFn, 'PUT', { id: ES.b, enabled: false })).status, 404);
    assert.equal(await rowText(exportSchedules, ES.b), bRow);
});

test('EXPORTS: a GDPR request\'s save keeps the rest; its completed time follows the status in and out; its SLA never counted again', async () => {
    const slaText = async () => (await db.select({ t: sql`${dsrQueue.slaDeadline}::text` }).from(dsrQueue).where(eq(dsrQueue.id, DSR.a)))[0].t;
    const doneText = async () => (await db.select({ t: sql`${dsrQueue.completedAt}::text` }).from(dsrQueue).where(eq(dsrQueue.id, DSR.a)))[0].t;
    const sla = await slaText();
    const res = await admin(dsrFn, 'PUT', { id: DSR.a, status: 'completed' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    let r = await one(dsrQueue, DSR.a);
    assert.equal(r.status, 'completed');
    assert.equal(r.subject, 'subject-a@itest.local', 'REGRESSION: a status change wrote the subject as none');
    assert.equal(r.notes, 'kept');
    assert.equal(r.createdBy, 'clerk_itest_save_maker');
    const done = await doneText();
    assert.ok(done, 'stamped as it moves into completed');
    assert.equal(await slaText(), sla, 'the SLA deadline is the create\'s');
    // A save that stays completed keeps the stamp; one that moves out clears it.
    assert.equal((await admin(dsrFn, 'PUT', { id: DSR.a, notes: 'more' })).status, 200);
    assert.equal(await doneText(), done);
    assert.equal((await admin(dsrFn, 'PUT', { id: DSR.a, status: 'in-progress', slaDeadline: '2030-01-01' })).status, 200);
    r = await one(dsrQueue, DSR.a);
    assert.equal(r.completedAt, null, 'cleared as it moves out of completed');
    assert.equal(r.notes, 'more');
    assert.equal(await slaText(), sla, 'a body\'s deadline never taken');
    assert.equal((await admin(dsrFn, 'PUT', { id: 'dsr_itest_save_nope', subject: 'x', status: 'completed' })).status, 404);
    assert.equal(await one(dsrQueue, 'dsr_itest_save_nope'), undefined);
    const bRow = await rowText(dsrQueue, DSR.b);
    assert.equal((await admin(dsrFn, 'PUT', { id: DSR.b, status: 'completed' })).status, 404);
    assert.equal(await rowText(dsrQueue, DSR.b), bRow);
});

// ── BACKUP ───────────────────────────────────────────────────────────────────

test('BACKUP: the schedule save keeps each field the body leaves out — the failure address above all; an explicit blank clears it', async () => {
    const res = await admin(backupFn, 'PUT', { frequency: 'Weekly' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    let r = await one(backupSchedule, `sched_${A}`);
    assert.equal(r.frequency, 'Weekly');
    assert.equal(r.notifyOnFailure, 'ops-a@itest.local', 'REGRESSION: a save without the address blanked it');
    assert.equal(r.timeUtc, '04:00');
    assert.equal(r.retentionDays, 14);
    assert.equal((await admin(backupFn, 'PUT', { notifyOnFailure: '' })).status, 200);
    r = await one(backupSchedule, `sched_${A}`);
    assert.equal(r.notifyOnFailure, '', 'an explicit blank clears it');
    assert.equal(r.frequency, 'Weekly', 'the earlier save kept');
});

// ── PERCENTS ─────────────────────────────────────────────────────────────────

test('PERCENTS: a deal discount out of range on an Approved quote writes nothing — the quote and the deal\'s arr as they were', async () => {
    const before = await rowText(quotes, Q.appr);
    for (const body of [{ dealDiscount: -50 }, { dealDiscount: -50, status: 'Accepted' }, { dealDiscount: 1e6 }, { dealDiscount: 'abc' }, { dealDiscount: true }]) {
        const res = await rep('PUT', { id: Q.appr, ...body });
        assert.equal(res.status, 400, `${JSON.stringify(body)}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.field, 'dealDiscount');
        assert.equal(await rowText(quotes, Q.appr), before, `${JSON.stringify(body)}: nothing written — still Approved`);
        assert.equal(await dealArr(OPP.a), '1.00', `${JSON.stringify(body)}: the deal's arr untouched`);
    }
    const post = await rep('POST', { id: 'q_itest_save_new', opportunityId: OPP.a, lineItems: [line(P.min, 100)], dealDiscount: 150 });
    assert.equal(post.status, 400);
    assert.equal(post.body.field, 'dealDiscount');
    assert.equal(await one(quotes, 'q_itest_save_new'), undefined);
});

test('PERCENTS: a line\'s discount outside 0-100 is refused naming the line; nothing written', async () => {
    const before = await rowText(quotes, Q.draft);
    const res = await rep('PUT', { id: Q.draft, lineItems: [line(P.min, 100, { discountPct: 10 }), line(P.min, 50, { discountPct: 150 })] });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.field, 'lineItems');
    assert.equal(res.body.error, 'Line 2: discount must be a number from 0 to 100.');
    assert.equal(await rowText(quotes, Q.draft), before);
    const post = await rep('POST', { id: 'q_itest_save_line', opportunityId: OPP.a, lineItems: [line(P.min, 100, { discountPct: -1 })] });
    assert.equal(post.status, 400);
    assert.equal(post.body.field, 'lineItems');
    assert.equal(await one(quotes, 'q_itest_save_line'), undefined);
});

test('PERCENTS: the values a quote already holds, re-sent, stand; a value named anew is cleaned to two places, blank is 0', async () => {
    const held = await one(quotes, Q.held);
    const res = await rep('PUT', { id: Q.held, lineItems: held.lineItems, dealDiscount: -5, notes: 're-sent' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const r = await one(quotes, Q.held);
    assert.equal(r.notes, 're-sent');
    assert.equal(r.dealDiscount, '-5.00', 'the stored value kept — never asked again');
    assert.equal(r.lineItems[0].discountPct, 150);
    assert.equal((await rep('PUT', { id: Q.draft, dealDiscount: 12.345 })).status, 200);
    assert.equal((await one(quotes, Q.draft)).dealDiscount, '12.35');
    assert.equal((await rep('PUT', { id: Q.draft, dealDiscount: '' })).status, 200);
    assert.equal((await one(quotes, Q.draft)).dealDiscount, '0.00');
});

test('PERCENTS: a New version copies what its source holds — held, never asked again (the review); a value no version holds is still refused', async () => {
    const held = await one(quotes, Q.held);
    // As QuotesTab's handleNewVersion sends it: the source's number, the next version, its lines and deal discount.
    const body = { id: 'q_itest_save_held_v2', quoteNumber: held.quoteNumber, version: 2, name: 'held v2', opportunityId: OPP.a,
        lineItems: held.lineItems.map((li) => ({ ...li })), dealDiscount: held.dealDiscount, status: 'Draft' };
    const res = await rep('POST', body);
    assert.equal(res.status, 201, `REGRESSION: a version of a quote holding -5 / 150 refused: ${JSON.stringify(res.body)}`);
    const v2 = await one(quotes, 'q_itest_save_held_v2');
    assert.equal(v2.quoteNumber, held.quoteNumber);
    assert.equal(v2.dealDiscount, '-5.00', 'the held deal discount copied as it stands');
    assert.equal(v2.lineItems[0].discountPct, 150);
    // A value no version holds is asked: -6 on a version, a line at 151.
    const anew = await rep('POST', { ...body, id: 'q_itest_save_held_v3', version: 3, dealDiscount: -6 });
    assert.equal(anew.status, 400);
    assert.equal(anew.body.field, 'dealDiscount');
    const line151 = await rep('POST', { ...body, id: 'q_itest_save_held_v4', version: 4, lineItems: [{ ...held.lineItems[0], discountPct: 151 }] });
    assert.equal(line151.status, 400);
    assert.equal(line151.body.field, 'lineItems');
    // A first version (or a number this deal does not hold) holds nothing: the same values are asked as new.
    const fresh = await rep('POST', { ...body, id: 'q_itest_save_held_v1', version: 1 });
    assert.equal(fresh.status, 400);
    assert.equal(await one(quotes, 'q_itest_save_held_v3'), undefined, 'nothing written on a refusal');
});

test('PERCENTS: the org\'s default tax rate named out of range is refused naming quoteDefaults, nothing written; the stored rate re-sent stands', async () => {
    const before = await extraText(A);
    for (const taxRate of [150, -1, 'abc', true]) {
        const res = await admin(settingsFn, 'PUT', { quoteDefaults: { validity: '30 days', taxRate } });
        assert.equal(res.status, 400, `${JSON.stringify(taxRate)}: ${JSON.stringify(res.body)}`);
        assert.equal(res.body.field, 'quoteDefaults');
        assert.equal(await extraText(A), before, `${JSON.stringify(taxRate)}: nothing written`);
    }
    const blank = await admin(settingsFn, 'PUT', { quoteDefaults: { validity: '30 days', taxRate: '' } });
    assert.equal(blank.status, 200, JSON.stringify(blank.body));
    // Stored before the rule (as sent): re-sent with another field changed, it stands.
    await db.update(settings).set({ extra: sql`jsonb_set(${settings.extra}, '{quoteDefaults,taxRate}', '150'::jsonb)` }).where(eq(settings.orgId, A));
    const again = await admin(settingsFn, 'PUT', { quoteDefaults: { validity: '60 days', taxRate: 150 } });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(JSON.parse(await extraText(A)).quoteDefaults.validity, '60 days');
});

test('PERCENTS: a service plan\'s discount named out of range is refused naming the field, nothing written; blank is none; the stored value re-sent stands', async () => {
    const before = await rowText(dispatchServicePlans, SP.a);
    const res = await admin(plansFn, 'PUT', { discountPercent: 150 }, { id: SP.a });
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.field, 'discountPercent');
    assert.equal(await rowText(dispatchServicePlans, SP.a), before);
    const post = await admin(plansFn, 'POST', { id: 'sp_itest_save_new', name: 'New plan', discountPercent: -1 });
    assert.equal(post.status, 400);
    assert.equal(await one(dispatchServicePlans, 'sp_itest_save_new'), undefined);
    assert.equal((await admin(plansFn, 'PUT', { discountPercent: 150, name: 'Itest Save held, renamed' }, { id: SP.held })).status, 200, 'the stored 150 re-sent stands');
    assert.equal((await one(dispatchServicePlans, SP.held)).name, 'Itest Save held, renamed');
    assert.equal((await admin(plansFn, 'PUT', { discountPercent: '' }, { id: SP.a })).status, 200, 'REGRESSION: a blank discount was a 500 on the numeric column');
    assert.equal((await one(dispatchServicePlans, SP.a)).discountPercent, null);
    assert.equal((await admin(plansFn, 'PUT', { discountPercent: 12.5 }, { id: SP.a })).status, 200);
    assert.equal((await one(dispatchServicePlans, SP.a)).discountPercent, '12.50');
});

// ── ORG B ────────────────────────────────────────────────────────────────────

test('ORG B: its products, quotes, deals, schedules, requests, backup schedule, plans, settings and members byte for byte', async () => {
    assert.equal(await bState(), bBefore);
});
