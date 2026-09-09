// tests/plan-visits.test.mjs
//
// The service-plan recurrence and agreement-renewal arithmetic (state §0.110),
// run directly. planVisitState/buildVisitQueue used to live inside DispatchTab
// and were reachable only by eye; the two new exceptions — a SKIPPED occurrence
// retires without a job, a DEFERRED one keeps its grid date but falls due later
// — and the renewal window are the behaviours that pay here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    planVisitState, buildVisitQueue, renewalState, buildRenewalQueue, renewedExpiry,
    addDaysStr, addMonthsStr, daysBetween, isYmd, DEFAULT_RENEWAL_LEAD_DAYS,
} from '../src/utils/planVisits.js';

const TODAY = '2026-09-09';
const plan = (over = {}) => ({ id: 'plan_q', name: 'Gold PM — Quarterly', intervalDays: 91, leadDays: 14, anchorMode: 'fixed', active: true, ...over });
const cust = (over = {}) => ({ id: 'cust_1', name: 'Acme Plant', servicePlanId: 'plan_q', planStartDate: '2026-01-01', ...over });
const done = (planDueDate, scheduledDate = planDueDate) => ({ customerId: 'cust_1', servicePlanId: 'plan_q', status: 'completed', planDueDate, scheduledDate });
const open = (planDueDate) => ({ id: 'job_open', customerId: 'cust_1', servicePlanId: 'plan_q', status: 'scheduled', planDueDate, scheduledDate: TODAY });
const skip  = (dueDate) => ({ customerId: 'cust_1', planId: 'plan_q', dueDate, action: 'skipped' });
const defer = (dueDate, deferredTo) => ({ customerId: 'cust_1', planId: 'plan_q', dueDate, action: 'deferred', deferredTo });

// ── dates ────────────────────────────────────────────────────────────────────

test('date helpers: strings in, strings out, month-end clamped', () => {
    assert.equal(addDaysStr('2026-01-01', 91), '2026-04-02');
    assert.equal(daysBetween('2026-09-09', '2026-10-15'), 36);
    assert.equal(daysBetween('2026-09-09', '2026-09-01'), -8);
    assert.equal(addMonthsStr('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonthsStr('2026-10-15', 12), '2027-10-15');
    assert.equal(isYmd('2026-02-30'), false, 'a date that does not exist is not a date');
    assert.equal(isYmd('2026-2-3'), false);
    assert.equal(isYmd('2026-09-09'), true);
});

// ── the fixed grid, without and with exceptions ──────────────────────────────

test('fixed grid: the first unretired occurrence leads and the later past ones count as missed', () => {
    // Jan 1, Apr 2, Jul 2 outstanding and past; Oct 1 is next.
    const st = planVisitState(cust(), plan(), [], TODAY);
    assert.equal(st.state, 'overdue');
    assert.equal(st.occurrence, '2026-01-01');
    assert.equal(st.due, '2026-01-01');
    assert.equal(st.missed, 2);
    assert.equal(st.deferredFrom, null);
});

test('a skipped occurrence is retired: it neither leads nor counts as missed', () => {
    const st = planVisitState(cust(), plan(), [], TODAY, [skip('2026-01-01')]);
    assert.equal(st.state, 'overdue');
    assert.equal(st.occurrence, '2026-04-02');
    assert.equal(st.missed, 1);
    // Everything past skipped or completed: the next one is 22 days out, beyond a 14-day lead.
    const up = planVisitState(cust(), plan(), [done('2026-04-02'), done('2026-07-02')], TODAY, [skip('2026-01-01')]);
    assert.equal(up.state, 'upcoming');
    assert.equal(up.occurrence, '2026-10-01');
    // Widen the lead and the same visit is due.
    assert.equal(planVisitState(cust(), plan({ leadDays: 30 }), [done('2026-04-02'), done('2026-07-02')], TODAY, [skip('2026-01-01')]).state, 'due');
});

test('a deferred occurrence keeps its grid date but falls due on the deferral date', () => {
    const visits = [defer('2026-01-01', '2026-09-20')];
    // With Apr and Jul still open they lead, because they fall due first.
    const st = planVisitState(cust(), plan(), [], TODAY, visits);
    assert.equal(st.occurrence, '2026-04-02');
    assert.equal(st.missed, 1, 'the deferred Jan visit is not "missed" — it is not due yet');
    // Complete them and the deferred visit leads: due on the new date, stamped with the old.
    const led = planVisitState(cust(), plan(), [done('2026-04-02'), done('2026-07-02')], TODAY, visits);
    assert.equal(led.state, 'due');
    assert.equal(led.occurrence, '2026-01-01', 'a job for it stamps the grid date as planDueDate');
    assert.equal(led.due, '2026-09-20');
    assert.equal(led.deferredFrom, '2026-01-01');
    assert.equal(led.daysUntil, 11);
});

test('a job created for a deferred occurrence is found by the grid date, and completing it retires the occurrence', () => {
    const visits = [defer('2026-01-01', '2026-09-20')];
    const jobs = [done('2026-04-02'), done('2026-07-02'), open('2026-01-01')];
    const st = planVisitState(cust(), plan(), jobs, TODAY, visits);
    assert.equal(st.state, 'scheduled');
    assert.equal(st.job.id, 'job_open');
    assert.equal(st.due, '2026-09-20');
    const after = planVisitState(cust(), plan(), [done('2026-04-02'), done('2026-07-02'), done('2026-01-01', '2026-09-20')], TODAY, visits);
    assert.equal(after.occurrence, '2026-10-01', 'the deferred occurrence is retired by its planDueDate');
});

test('exceptions belong to one customer and one plan', () => {
    const foreign = [{ customerId: 'cust_other', planId: 'plan_q', dueDate: '2026-01-01', action: 'skipped' },
                     { customerId: 'cust_1', planId: 'plan_other', dueDate: '2026-01-01', action: 'skipped' }];
    assert.equal(planVisitState(cust(), plan(), [], TODAY, foreign).occurrence, '2026-01-01', 'another customer\'s or plan\'s skip changes nothing here');
});

test('rolling anchor: the interval runs from the last completed visit, and a skipped occurrence counts as serviced on its date', () => {
    const rolling = plan({ anchorMode: 'rolling' });
    const st = planVisitState(cust(), rolling, [done('2026-03-01', '2026-06-01')], TODAY);
    assert.equal(st.occurrence, '2026-08-31');
    assert.equal(st.state, 'overdue');
    const skipped = planVisitState(cust(), rolling, [done('2026-03-01', '2026-06-01')], TODAY, [skip('2026-08-31')]);
    assert.equal(skipped.occurrence, '2026-11-30');
    assert.equal(skipped.state, 'upcoming');
    const deferred = planVisitState(cust(), rolling, [done('2026-03-01', '2026-06-01')], TODAY, [defer('2026-08-31', '2026-09-15')]);
    assert.equal(deferred.due, '2026-09-15');
    assert.equal(deferred.occurrence, '2026-08-31');
    assert.equal(deferred.state, 'due');
});

test('buildVisitQueue: only overdue, due and scheduled rows, honouring the exceptions, sorted by when they fall due', () => {
    const c2 = cust({ id: 'cust_2', name: 'Beta Works', planStartDate: '2026-09-15' });   // due Sep 15: 6 days out → due
    const rows = buildVisitQueue([cust(), c2], [plan()], [done('2026-04-02'), done('2026-07-02')], TODAY,
        [{ customerId: 'cust_1', planId: 'plan_q', dueDate: '2026-01-01', action: 'skipped' }]);
    assert.deepEqual(rows.map(r => [r.customer.id, r.state]), [['cust_2', 'due']], 'cust_1 is now upcoming (Oct 1) and drops out');
});

// ── renewals ─────────────────────────────────────────────────────────────────

test('renewalState: the plan\'s renewalLeadDays opens the window; null reads as the default', () => {
    const c = cust({ agreementExpiry: '2026-10-15' });   // 36 days out
    assert.equal(DEFAULT_RENEWAL_LEAD_DAYS, 60);
    assert.deepEqual(renewalState(c, plan(), TODAY), { state: 'expiring', expiry: '2026-10-15', daysLeft: 36, leadDays: 60 });
    assert.equal(renewalState(c, plan({ renewalLeadDays: 30 }), TODAY).state, 'upcoming');
    assert.equal(renewalState(c, plan({ renewalLeadDays: 36 }), TODAY).state, 'expiring', 'the boundary day is inside the window');
    assert.equal(renewalState(cust({ agreementExpiry: '2026-09-01' }), plan(), TODAY).state, 'expired');
    assert.equal(renewalState(cust({ agreementExpiry: '2026-09-01' }), plan(), TODAY).daysLeft, -8);
});

test('renewalState: no agreement end, not covered, a malformed date, or do-not-service → none', () => {
    assert.equal(renewalState(cust(), plan(), TODAY).state, 'none');
    assert.equal(renewalState(cust({ servicePlanId: null, serviceAgreement: 'none', agreementExpiry: '2026-09-20' }), null, TODAY).state, 'none');
    assert.equal(renewalState(cust({ agreementExpiry: 'soon' }), plan(), TODAY).state, 'none');
    assert.equal(renewalState(cust({ agreementExpiry: '2026-09-20', doNotService: true }), plan(), TODAY).state, 'none');
    // A legacy free-text agreement with no plan row still renews, on the default lead.
    assert.equal(renewalState(cust({ servicePlanId: null, serviceAgreement: 'gold', agreementExpiry: '2026-10-15' }), null, TODAY).state, 'expiring');
});

test('buildRenewalQueue: expiring and expired only, earliest end date first', () => {
    const rows = buildRenewalQueue([
        cust({ id: 'a', name: 'A', agreementExpiry: '2026-10-15' }),
        cust({ id: 'b', name: 'B', agreementExpiry: '2027-03-01' }),     // upcoming
        cust({ id: 'c', name: 'C', agreementExpiry: '2026-08-30' }),     // expired
        cust({ id: 'd', name: 'D' }),                                     // no end date
    ], [plan()], TODAY);
    assert.deepEqual(rows.map(r => [r.customer.id, r.state]), [['c', 'expired'], ['a', 'expiring']]);
});

test('renewedExpiry keeps the anniversary; an expired agreement renews from today', () => {
    assert.equal(renewedExpiry(cust({ agreementExpiry: '2026-10-15' }), TODAY), '2027-10-15');
    assert.equal(renewedExpiry(cust({ agreementExpiry: '2026-09-01' }), TODAY), '2027-09-09');
    assert.equal(renewedExpiry(cust(), TODAY), '2027-09-09');
    assert.equal(renewedExpiry(cust({ agreementExpiry: '2026-10-15' }), TODAY, 6), '2027-04-15');
});
