// tests/customer-notifications.test.mjs
//
// Customer-facing notifications (state §0.111). The pure module decides what a
// job change means and how it reads; it is run here. The wiring — the org's
// switches in both halves of settings.mjs, the three write paths in
// dispatch-jobs.mjs, the notifier's token and its trail, the public status page's
// token-only read and escaping, the redirect's order, the panel — is pinned by
// source scan (§18b23) and the whole path is proven against the real test
// database in tests/integration/customer-notify.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    CUSTOMER_NOTIFICATION_DEFAULTS, cleanCustomerNotifications, notificationPlan, channelsFor,
    whenText, smsText, esc, publicStatusPath, customerStatusLabel, to12h,
} from '../src/utils/customerNotifications.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

const ON = { enabled: true };
const job = (over = {}) => ({ id: 'job_1', status: 'scheduled', scheduledDate: '2026-09-15', scheduledStart: '08:00', scheduledEnd: '10:00', timeSlot: 'exact', title: 'Furnace tune-up', ...over });

// ── the switches ─────────────────────────────────────────────────────────────

test('the defaults are OFF at the master switch and on for every channel beneath it; garbage cleans to the defaults', () => {
    assert.equal(CUSTOMER_NOTIFICATION_DEFAULTS.enabled, false, 'a new workspace never emails a customer until an Admin turns it on');
    assert.deepEqual(cleanCustomerNotifications(undefined), CUSTOMER_NOTIFICATION_DEFAULTS);
    assert.deepEqual(cleanCustomerNotifications('yes'), CUSTOMER_NOTIFICATION_DEFAULTS);
    assert.deepEqual(cleanCustomerNotifications({ enabled: 'true', confirmationSms: false, bogus: 1 }),
        { ...CUSTOMER_NOTIFICATION_DEFAULTS, confirmationSms: false }, 'only booleans count; unknown keys drop');
});

// ── what a change means ──────────────────────────────────────────────────────

test('nothing is planned while the org is off, whatever changed', () => {
    assert.deepEqual(notificationPlan({ before: null, after: job(), cfg: { enabled: false } }), []);
    assert.deepEqual(notificationPlan({ before: job({ status: 'scheduled' }), after: job({ status: 'en_route' }), cfg: undefined }), []);
});

test('a job scheduled with a date is confirmed — on create, and when its date or time changes; not when nothing about the appointment changed', () => {
    assert.deepEqual(notificationPlan({ before: null, after: job(), cfg: ON }), ['confirmation']);
    assert.deepEqual(notificationPlan({ before: job({ status: 'unscheduled', scheduledDate: null }), after: job(), cfg: ON }), ['confirmation']);
    assert.deepEqual(notificationPlan({ before: job(), after: job({ scheduledDate: '2026-09-16' }), cfg: ON }), ['confirmation'], 'a new date');
    assert.deepEqual(notificationPlan({ before: job(), after: job({ scheduledStart: '13:00' }), cfg: ON }), ['confirmation'], 'a new time');
    assert.deepEqual(notificationPlan({ before: job(), after: job({ techNotes: 'gate code 1234' }), cfg: ON }), [], 'an unrelated edit says nothing');
    assert.deepEqual(notificationPlan({ before: job(), after: job(), cfg: ON }), [], 'a no-op save says nothing');
    assert.deepEqual(notificationPlan({ before: null, after: job({ scheduledDate: null }), cfg: ON }), [], 'scheduled without a date is not an appointment yet');
    assert.deepEqual(notificationPlan({ before: null, after: job(), cfg: { enabled: true, confirmationEmail: false, confirmationSms: false } }), [], 'both confirmation channels off');
});

test('en_route announces the technician, once', () => {
    assert.deepEqual(notificationPlan({ before: job(), after: job({ status: 'en_route' }), cfg: ON }), ['on_the_way']);
    assert.deepEqual(notificationPlan({ before: job({ status: 'en_route' }), after: job({ status: 'en_route' }), cfg: ON }), []);
    assert.deepEqual(notificationPlan({ before: job({ status: 'en_route' }), after: job({ status: 'on_site' }), cfg: ON }), [], 'arriving is not announced');
    assert.deepEqual(notificationPlan({ before: job(), after: job({ status: 'en_route' }), cfg: { enabled: true, onTheWayEmail: false, onTheWaySms: false } }), []);
});

test('channelsFor reads the two switches of each type', () => {
    assert.deepEqual(channelsFor('confirmation', { enabled: true, confirmationSms: false }), { email: true, sms: false });
    assert.deepEqual(channelsFor('on_the_way', { enabled: true, onTheWayEmail: false }), { email: false, sms: true });
    assert.deepEqual(channelsFor('other', ON), { email: false, sms: false });
});

// ── how it reads ─────────────────────────────────────────────────────────────

test('whenText: an exact window, a slot, a bare date, no date', () => {
    assert.equal(whenText(job()), 'Tuesday, September 15, 2026 between 8:00 AM and 10:00 AM');
    assert.equal(whenText(job({ scheduledEnd: null })), 'Tuesday, September 15, 2026 at 8:00 AM');
    assert.equal(whenText(job({ timeSlot: 'morning' })), 'Tuesday, September 15, 2026 in the morning');
    assert.equal(whenText(job({ timeSlot: 'anytime', scheduledStart: null })), 'Tuesday, September 15, 2026 during the day');
    assert.equal(whenText(job({ scheduledDate: null })), 'Date to be confirmed');
    assert.equal(to12h('00:05'), '12:05 AM');
    assert.equal(to12h('25:00'), null);
});

test('smsText: the company first, the link last, the technician when known; esc escapes the five', () => {
    const d = { companyName: 'Acme HVAC', jobTitle: 'Furnace tune-up', when: 'Tuesday at 8:00 AM', techFirstName: 'Sam', statusUrl: 'https://x.test/status/abc' };
    assert.equal(smsText('confirmation', d), 'Acme HVAC: your Furnace tune-up visit is scheduled for Tuesday at 8:00 AM. Details: https://x.test/status/abc');
    assert.equal(smsText('on_the_way', d), 'Acme HVAC: Sam is on the way for your Furnace tune-up visit. Details: https://x.test/status/abc');
    assert.equal(smsText('on_the_way', { ...d, techFirstName: null, statusUrl: null }), 'Acme HVAC: Your technician is on the way for your Furnace tune-up visit.');
    assert.equal(esc(`<a href="x">Tom & Jerry's</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
    assert.equal(publicStatusPath('a b/c'), '/status/a%20b%2Fc');
    assert.equal(customerStatusLabel('en_route'), 'Your technician is on the way');
    assert.equal(customerStatusLabel('nonsense'), 'Scheduled');
});

// ── the wiring ───────────────────────────────────────────────────────────────

test('settings.mjs: customerNotifications is in BOTH halves, normalised by the shared module', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes("import { cleanCustomerNotifications } from '../../src/utils/customerNotifications.js';"));
    assert.ok(s.includes('customerNotifications: cleanCustomerNotifications(row.extra?.customerNotifications),'), 'the GET');
    assert.ok(s.includes("customerNotifications: 'customerNotifications' in data ? cleanCustomerNotifications(data.customerNotifications) : existingExtra.customerNotifications || {},"), 'the PUT read-then-merge');
});

test('dispatch-jobs: every write that can schedule or start travel tells the customer AFTER the row is written, and the row carries the token and the trail', () => {
    const s = code(read('netlify/functions/dispatch-jobs.mjs'));
    assert.ok(s.includes("import { notifyCustomer } from './_customerNotify.mjs';"));
    assert.equal((s.match(/await notifyCustomer\(\{ orgId, before: /g) || []).length, 3, 'create, the technician path, the dispatcher path');
    assert.ok(s.includes('await notifyCustomer({ orgId, before: priorJob || null, after: written, actorName: await getCallerName(userId, orgId) });'), 'create — an upsert may be a re-schedule, so the prior row is the whole row');
    assert.ok(s.includes('            const [priorJob] = await db.select()\n                .from(dispatchJobs)'), 'the prior row is selected whole');
    assert.equal((s.match(/await notifyCustomer\(\{ orgId, before: current, after: written, actorName: await getCallerName\(userId, orgId\) \}\);/g) || []).length, 2, 'both update paths');
    assert.ok(s.includes('publicToken:      row.publicToken       ?? row.public_token       ?? null,'));
    assert.ok(s.includes('customerNotifications: Array.isArray(row.customerNotifications ?? row.customer_notifications) ? (row.customerNotifications ?? row.customer_notifications) : [],'));
});

test('_customerNotify: the token is random and issued once, SMS without credentials is recorded not attempted, every read is by the job\'s org, nothing throws', () => {
    const s = code(read('netlify/functions/_customerNotify.mjs'));
    assert.ok(s.includes("export const newPublicToken = () => randomBytes(24).toString('base64url');"));
    assert.ok(s.includes('if (cfg.statusLink && !token) {\n            token = newPublicToken();'), 'issued only when missing, only when the link is on');
    assert.ok(s.includes("else if (!smsConfigured()) entry(type, 'sms', to, false, { error: 'SMS not configured on this site' });"));
    assert.ok(s.includes('.where(and(eq(dispatchCustomers.id, after.customerId), eq(dispatchCustomers.orgId, orgId)));'), 'the customer by org');
    assert.ok(s.includes('.where(and(eq(dispatchTechnicians.id, after.assignedTechId), eq(dispatchTechnicians.orgId, orgId)))'), 'the technician by org');
    assert.ok(s.includes("console.error('customer-notify:', err.message);"), 'a failure is logged and the dispatcher\'s save still succeeds');
    assert.ok(!s.includes('throw '), 'never throws');
});

test('dispatch-status: token-only, no-store, noindex, escaped, and every secondary read by the job\'s own org', () => {
    const s = code(read('netlify/functions/dispatch-status.mjs'));
    assert.ok(s.includes('export const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;'));
    assert.ok(s.includes("const token = String(event.queryStringParameters?.t || (fromPath ? decodeURIComponent(fromPath[1]) : '')).trim();"), 'the token — from the path segment or ?t= — is the only input');
    assert.ok(s.includes('if (!TOKEN_RE.test(token)) return notFound();'));
    assert.ok(s.includes('const [job] = await db.select().from(dispatchJobs).where(eq(dispatchJobs.publicToken, token));'), 'found by token, never by id');
    assert.ok(!/queryStringParameters\?\.(id|jobId|orgId)/.test(s), 'no id is accepted');
    assert.ok(s.includes("'Cache-Control':   'no-store',") && s.includes("'X-Robots-Tag':    'noindex, nofollow',"));
    assert.ok(s.includes('<p class="co">${esc(company)}</p>') && s.includes("<h1>${esc(job.title || 'Service visit')}</h1>"), 'company and title are escaped');
    assert.ok(s.includes('.where(and(eq(dispatchCustomers.id, job.customerId), eq(dispatchCustomers.orgId, job.orgId)));'));
    assert.ok(!s.includes('job.id') || !s.includes('${esc(job.id)}'), 'the job id is not rendered');
});

test('netlify.toml: /status/:token is rewritten to the function BEFORE the SPA catch-all', () => {
    const t = read('netlify.toml');
    const status = t.indexOf('from = "/status/:token"');
    // A PATH segment, not a query string: Netlify substitutes :token into a path only
    // (`?t=:token` reached the function as the literal ":token" on the first dev probe).
    const fn = t.indexOf('to = "/.netlify/functions/dispatch-status/:token"');
    const spa = t.indexOf('from = "/*"');
    assert.ok(status > 0 && fn > status && spa > fn, 'order: status rule, its target, then the catch-all');
    assert.ok(!t.includes('dispatch-status?t=:token'), 'the query-string form must not return');
    const s = code(read('netlify/functions/dispatch-status.mjs'));
    // A rewritten request carries the BROWSER'S path (/status/<token>); a direct call carries /dispatch-status/<token>.
    assert.ok(s.includes("const fromPath = String(event.path || '').match(/\\/(?:status|dispatch-status)\\/([^/?#]+)/);"), 'the function reads the path segment of either path');
});

test('the panel, the catalogue and the routing exist; the dispatch tab shows the trail and adopts the server\'s row after scheduling', () => {
    const p = code(read('src/Tabs/settings/dispatch/DispatchCustomerNotificationsDetail.jsx'));
    assert.ok(p.includes("import { cleanCustomerNotifications } from '../../../utils/customerNotifications.js';"), 'one normaliser on both sides');
    assert.ok(p.includes('const payload = { customerNotifications: cleanCustomerNotifications(cfg) };'));
    assert.ok(p.includes('await putSettings(payload);'), 'the shared save (§18b1)');
    assert.ok(code(read('src/Tabs/settings/catalogue.js')).includes("id:'dsp-customer-notify'"));
    const av = code(read('src/Tabs/AdminView.jsx'));
    assert.ok(av.includes("if (id === 'dsp-customer-notify') return <DispatchCustomerNotificationsDetail"));
    const d = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(/^const CustomerNotifyTrail = \(\{ job \}\) => \{/m.test(d), 'module scope, not inside the detail pane');
    assert.ok(d.includes('<CustomerNotifyTrail job={selectedJob}/>'));
    assert.ok(d.includes('publicToken:    j.publicToken || null,'));
    assert.ok(d.includes('serverJob: data.job || null,'), 'the schedule handler hands the server row up');
    assert.ok(d.includes('publicToken: serverJob?.publicToken ?? j.publicToken ?? null,'), 'and the parent adopts the token and trail');
});
