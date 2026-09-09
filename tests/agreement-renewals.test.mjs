// tests/agreement-renewals.test.mjs
//
// The wiring around planVisits.js (state §0.110): the hourly job's renewal
// pass and its preference, the Slack switch, the report's blind spot for the
// dedupe rows, the recipient's toggle, the dispatch tab reading the recorded
// exceptions and stamping the grid date, the plans endpoint carrying
// renewalLeadDays, and the exceptions endpoint refusing another org's customer.
// Behaviour that spans Clerk-authed functions and React is pinned by source
// scan (§18b23); the arithmetic runs in plan-visits.test.mjs and the endpoint
// against the real test database in dispatch-plan-visits.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLACK_HOURLY_KEYS, slackAlertEnabled } from '../src/utils/slackAlerts.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('pipeline-alerts: a renewal pass per org — recipients are that org\'s Admins and Managers, emailed behind their preference, Slack under the company switch, deduped on the customer', () => {
    const s = code(read('netlify/functions/pipeline-alerts.mjs'));
    assert.ok(s.includes("import { buildRenewalQueue }                          from '../../src/utils/planVisits.js';"), 'one arithmetic with the queue');
    assert.ok(s.includes('    agreementRenewal: { enabled: true  },'), 'the preference defaults on');
    assert.ok(s.includes("u.orgId === orgId && u.active && u.email && (u.role === 'Admin' || u.role === 'Manager'));"), 'recipients are the org\'s Admins and Managers');
    assert.ok(s.includes("if (wantsAlert(resolvedProfile, 'agreementRenewal')) {"), 'the email is behind the recipient\'s preference');
    assert.ok(s.includes("if (await wasRecentlyAlerted(orgId, u.name, cust.id, 'renewal')) { skipped++; continue; }"), 'one email per recipient per customer per DEDUP_DAYS');
    assert.ok(s.includes("sendSlackToOrg(orgId, slackTemplates.agreementRenewal(detail), 'agreementRenewal');"), 'the post carries its type, so the company switch applies');
    assert.ok(s.includes("wasRecentlyAlerted(orgId, '__org__', cust.id, 'renewal-slack')"), 'one post per customer per DEDUP_DAYS');
    assert.ok(s.indexOf('let renewalsSent = 0;') > s.indexOf('} // end for loop'), 'runs after the deal loop, so a failure there cannot stop the deal signals');
    assert.ok(s.indexOf("console.error('pipeline-alerts: agreement renewals failed:', err.message);") > s.indexOf('let renewalsSent = 0;'), 'and its own failure is caught, not the run\'s');
});

test('slackAlerts: agreementRenewal is an hourly type the company can switch off', () => {
    assert.ok(SLACK_HOURLY_KEYS.includes('agreementRenewal'));
    assert.equal(slackAlertEnabled({ alerts: { agreementRenewal: false } }, 'agreementRenewal'), false);
    assert.equal(slackAlertEnabled({ alerts: {} }, 'agreementRenewal'), true, 'absent is on');
});

test('templates: the email and the Slack post exist and say when', () => {
    const e = code(read('netlify/functions/send-email.mjs'));
    assert.ok(e.includes('agreementRenewal({ recipientName, customerName, customerNumber, planName, expiry, daysLeft, expired }) {'));
    assert.ok(e.includes("const when = expired ? `expired ${n} day${n === 1 ? '' : 's'} ago`"));
    const k = code(read('netlify/functions/send-slack.mjs'));
    assert.ok(k.includes('agreementRenewal: ({ customerName, customerNumber, planName, expiry, daysLeft, expired }) => {'));
    assert.ok(k.includes("url: APP_URL, action_id: 'view_dispatch'"));
});

test('recommendation-log: the report never lists the renewal dedupe rows', () => {
    const s = code(read('netlify/functions/recommendation-log.mjs'));
    assert.ok(s.includes("import { eq, and, desc, gte, notLike } from 'drizzle-orm';"));
    assert.ok(s.includes("notLike(recommendationLog.actionType, 'renewal%'),"), 'both the per-rep and the org-wide read exclude them');
});

test('AppHeader: the recipient\'s toggle exists, is labelled, and shows only to Admins and Managers', () => {
    const s = code(read('src/components/layout/AppHeader.jsx'));
    assert.ok(s.includes("        agreementRenewal:   { enabled: true,  mode: 'instant' },"));
    assert.ok(s.includes("        agreementRenewal: 'Maintenance agreement expiring (Dispatch)',"));
    assert.ok(s.includes("if (alertType === 'agreementRenewal' && !isManager && !isAdmin) return null;"));
});

test('DispatchTab: the queue reads the recorded exceptions, a deferred visit stamps its grid date, the renewals and actions are wired', () => {
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(s.includes("import { planVisitState, buildVisitQueue, buildRenewalQueue, renewedExpiry } from '../utils/planVisits.js';"));
    assert.ok(!/^const planVisitState = /m.test(s) && !/^const buildVisitQueue = /m.test(s), 'the local copies are gone — one arithmetic');
    assert.ok(s.includes("dbFetch('/.netlify/functions/dispatch-plan-visits'),"), 'the exceptions load with the rest of dispatch');
    assert.ok(s.includes("['service plans', plansRes], ['plan visits', visitsRes],"), 'a failed load is reported, not an empty list');
    assert.ok(s.includes('() => buildVisitQueue(customers, servicePlans, jobs, todayYmd, planVisits),'), 'the queue honours skips and deferrals');
    assert.ok(s.includes('const st = planVisitState(c, plan, jobs, todayStr, planVisits);'), 'so do the customer list\'s overdue counts');
    assert.ok(s.includes('            planDueDate:   row.occurrence || row.due,'), 'a job for a deferred occurrence stamps the grid date');
    assert.ok(s.includes('() => buildRenewalQueue(customers, servicePlans, todayYmd),'));
    assert.ok(s.includes('<ServiceDueView rows={visitQueue} renewals={renewalQueue} exceptions={exceptionVisits} today={todayYmd}'));
    // Jeff deferred the test visit three weeks out and it "became unviewable": a
    // deferral past the lead window is 'upcoming', which the queue excludes by
    // design — so every exception the queue does not show is listed under it, with undo.
    assert.ok(s.includes("const hidden = (exceptions || []).filter(e => e.visit.action === 'skipped' || !queued.has(exceptionKey(e)));"),
        'skips and out-of-window deferrals are listed under the queue');
    assert.ok(s.includes("{deferred ? 'Undo deferral' : 'Undo skip'}"), 'each can be undone from the list');
    assert.ok(s.includes('onSkip={skipVisit} onDefer={deferVisit} onUndo={undoVisit} onRenew={renewAgreement}'));
    // Each action writes first and adopts the server's row; a refusal is shown above the queue.
    assert.ok(s.includes("setVisitActionError(data.error || `The visit was not ${action} (HTTP ${res.status}).`);"));
    assert.ok(s.includes("setVisitActionError(data.error || `The agreement was not renewed (HTTP ${res.status}).`);"));
    assert.ok(s.includes('const next = renewedExpiry(row.customer, todayYmd, 12);'), 'renewal keeps the anniversary');
    assert.ok(s.includes('planVisits={planVisits}'), 'the customer list receives the exceptions');
});

test('service plans: renewalLeadDays is read, created and updated; the panel offers it', () => {
    const f = code(read('netlify/functions/dispatch-service-plans.mjs'));
    assert.ok(f.includes('renewalLeadDays: row.renewalLeadDays ?? row.renewal_lead_days ?? null,'));
    assert.ok(f.includes('renewalLeadDays: Number.isFinite(parseInt(data.renewalLeadDays, 10)) ? Math.max(0, parseInt(data.renewalLeadDays, 10)) : null,'));
    assert.ok(f.includes("if ('renewalLeadDays' in data) {"));
    const p = code(read('src/Tabs/settings/dispatch/DispatchServicePlansDetail.jsx'));
    assert.ok(p.includes('<Field label="Renewal reminder"'));
    assert.ok(p.includes("onChange={e => set('renewalLeadDays', e.target.value)}"));
    assert.ok(p.includes("renewalLeadDays: 60, anchorMode: 'fixed' })"), 'a new plan starts at the default');
    const schema = code(read('db/schema.ts'));
    assert.ok(schema.includes("renewalLeadDays:  integer('renewal_lead_days'),"));
    assert.ok(schema.includes("export const dispatchPlanVisits = pgTable('dispatch_plan_visits', {"));
    assert.ok(schema.includes("uniqueIndex('dispatch_plan_visits_occurrence_uq').on(t.orgId, t.customerId, t.planId, t.dueDate),"));
});

test('dispatch-plan-visits: one row per occurrence, the customer must be this org\'s, dates are validated, writes are role-gated', () => {
    const s = code(read('netlify/functions/dispatch-plan-visits.mjs'));
    assert.ok(s.includes("import { verifyAuth, requireWrite } from './auth.mjs';"));
    assert.ok(s.includes('const forbidden = requireWrite(auth, event, headers);'));
    assert.ok(s.includes("if (!cust) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Customer not found' }) };"), 'another org\'s customer is a 404, never a row');
    assert.ok(s.includes('.where(and(eq(dispatchCustomers.id, data.customerId), eq(dispatchCustomers.orgId, orgId)));'), 'the customer lookup is org-scoped');
    assert.ok(s.includes('target: [dispatchPlanVisits.orgId, dispatchPlanVisits.customerId, dispatchPlanVisits.planId, dispatchPlanVisits.dueDate],'), 'a second decision about the same occurrence replaces the first');
    assert.ok(s.includes("if (!isYmd(data.dueDate)) return { statusCode: 400,"));
    assert.ok(s.includes("if (data.action === 'deferred' && (!isYmd(deferredTo) || deferredTo === data.dueDate)) {"));
    assert.ok(s.includes('.where(and(eq(dispatchPlanVisits.id, id), eq(dispatchPlanVisits.orgId, orgId)))'), 'DELETE is org-scoped');
});
