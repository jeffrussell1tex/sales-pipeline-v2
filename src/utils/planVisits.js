// planVisits.js — service-plan recurrence and agreement renewals, pure.
//
// Lifted out of DispatchTab (state §0.110) so the SAME arithmetic runs in three
// places: the Service Due queue, the customer list's overdue counts, and the
// hourly pipeline-alerts job that emails and posts agreement renewals. No React,
// no db, no imports — reachable by `node --test` and importable from a Netlify
// function the way forecastCall.js is.
//
// Visits are COMPUTED, not generated. Nothing is written until a dispatcher acts
// on a due visit, so a plan running for years costs one pass over that
// customer's plan jobs rather than a table full of speculative future rows.
// Two things a dispatcher may record about ONE occurrence live in
// dispatch_plan_visits (§0.110):
//   skipped  — the occurrence is retired without a job (the customer declined,
//              the unit was replaced); it no longer counts as due or missed.
//   deferred — the occurrence keeps its place on the grid (a job created for it
//              still stamps the ORIGINAL date as planDueDate) but falls due on
//              `deferredTo` instead.

// ── Dates ────────────────────────────────────────────────────────────────────
// 'YYYY-MM-DD' strings throughout; the Date is built at local noon so a DST
// boundary can never move a day.
const pad2 = (n) => String(n).padStart(2, '0');
export const fromYmd = (s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 12);
};
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && ymd(fromYmd(s)) === s;
export const addDaysStr = (s, n) => { const d = fromYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const daysBetween = (fromStr, toStr) =>
    Math.round((fromYmd(toStr).getTime() - fromYmd(fromStr).getTime()) / 86400000);
// Calendar months, clamped to the target month's last day (Jan 31 + 1 → Feb 28).
export const addMonthsStr = (s, n) => {
    const d = fromYmd(s);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return ymd(d);
};

// ── Plan visits ──────────────────────────────────────────────────────────────
export const MAX_OCCURRENCES = 400;   // guard against a pathological interval, not a real limit
export const DEFAULT_LEAD_DAYS = 14;

// The recorded actions for one customer+plan, indexed by occurrence date.
const visitIndex = (visits, customerId, planId) => {
    const skipped = new Set();
    const deferred = new Map();
    for (const v of Array.isArray(visits) ? visits : []) {
        if (!v || v.customerId !== customerId || v.planId !== planId || !v.dueDate) continue;
        if (v.action === 'skipped') skipped.add(v.dueDate);
        else if (v.action === 'deferred' && v.deferredTo) deferred.set(v.dueDate, v.deferredTo);
    }
    return { skipped, deferred };
};

/**
 * Where one customer stands on their plan today.
 * → { state, due, occurrence, deferredFrom, job, daysUntil, missed }
 *   state: none | inactive | blocked | unconfigured | upToDate | ended |
 *          scheduled | overdue | due | upcoming
 *   occurrence: the grid date a job for this visit stamps as planDueDate
 *   due:        when it actually falls due (the deferral date when deferred)
 */
export const planVisitState = (customer, plan, jobs, todayStr, visits = []) => {
    if (!plan)                 return { state: 'none' };
    if (plan.active === false) return { state: 'inactive' };
    if (customer.doNotService) return { state: 'blocked', reason: 'Customer is marked do-not-service' };

    const interval = parseInt(plan.intervalDays, 10);
    if (!Number.isFinite(interval) || interval <= 0)
        return { state: 'unconfigured', reason: 'This plan has no visit interval' };
    if (!customer.planStartDate)
        return { state: 'unconfigured', reason: 'No plan start date on this customer' };

    const mine = (jobs || []).filter(j =>
        j.customerId === customer.id && j.servicePlanId === plan.id && j.status !== 'cancelled');
    const { skipped, deferred } = visitIndex(visits, customer.id, plan.id);

    // Only a COMPLETED job — or a recorded skip — retires an occurrence. A
    // scheduled one means the visit is in hand but still outstanding — retiring it
    // would advance the pointer and hide the very visit that is about to happen.
    const doneOn = new Set([
        ...mine.filter(j => j.status === 'completed').map(j => j.planDueDate).filter(Boolean),
        ...skipped,
    ]);
    const openOn = new Map();
    mine.filter(j => j.status !== 'completed' && j.planDueDate).forEach(j => {
        if (!openOn.has(j.planDueDate)) openOn.set(j.planDueDate, j);
    });

    const coverageEnd = customer.agreementExpiry || null;
    const effective = (occ) => deferred.get(occ) || occ;
    let occurrence;
    let missed = 0;

    if (plan.anchorMode === 'rolling') {
        // Interval runs from when the unit was actually serviced, so a late visit
        // pushes everything after it. Only ever one outstanding occurrence. A
        // skipped occurrence counts as serviced on its date.
        const completed = mine.filter(j => j.status === 'completed' && j.scheduledDate)
            .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));
        const last = completed[completed.length - 1];
        occurrence = last ? addDaysStr(last.scheduledDate, interval) : customer.planStartDate;
        for (let i = 0; i < MAX_OCCURRENCES && skipped.has(occurrence); i++) occurrence = addDaysStr(occurrence, interval);
    } else {
        // Fixed contract grid: occurrences sit on planStart + n x interval whatever
        // actually happened, so four visits a contract year stay four. Missed ones
        // accumulate and are counted rather than silently skipped. A deferral moves
        // WHEN one falls due, not where it sits on the grid.
        let cur = customer.planStartDate;
        const outstanding = [];
        for (let i = 0; i < MAX_OCCURRENCES; i++) {
            if (!doneOn.has(cur)) {
                outstanding.push(cur);
                if (cur > todayStr) break;
            }
            if (coverageEnd && cur > coverageEnd) break;
            cur = addDaysStr(cur, interval);
        }
        if (!outstanding.length) return { state: 'upToDate' };
        // The one that falls due FIRST by its effective date leads; a deferral
        // can push an earlier grid date behind a later one.
        outstanding.sort((a, b) => effective(a).localeCompare(effective(b)) || a.localeCompare(b));
        occurrence = outstanding[0];
        missed = Math.max(0, outstanding.filter(o => effective(o) < todayStr).length - 1);
    }

    if (coverageEnd && occurrence > coverageEnd) return { state: 'ended', due: occurrence, occurrence, coverageEnd };

    const due = effective(occurrence);
    const deferredFrom = due !== occurrence ? occurrence : null;
    const open = openOn.get(occurrence);
    if (open) return { state: 'scheduled', due, occurrence, deferredFrom, job: open, missed };

    const lead = Number.isFinite(parseInt(plan.leadDays, 10)) ? parseInt(plan.leadDays, 10) : DEFAULT_LEAD_DAYS;
    const daysUntil = daysBetween(todayStr, due);
    if (daysUntil < 0)     return { state: 'overdue',  due, occurrence, deferredFrom, daysUntil, missed };
    if (daysUntil <= lead) return { state: 'due',      due, occurrence, deferredFrom, daysUntil, missed };
    return { state: 'upcoming', due, occurrence, deferredFrom, daysUntil, missed };
};

// Only these reach the queue. 'upcoming' is deliberately excluded — that is the
// whole point of leadDays; surfacing everything would make the queue a customer
// list rather than a work list.
export const ACTIONABLE_VISIT_STATES = Object.freeze(['overdue', 'due']);

export const buildVisitQueue = (customers, plans, jobs, todayStr, visits = []) =>
    (customers || [])
        .map(c => {
            const plan = (plans || []).find(p => p.id === c.servicePlanId);
            if (!plan) return null;
            const st = planVisitState(c, plan, jobs, todayStr, visits);
            return { customer: c, plan, ...st };
        })
        .filter(r => r && (ACTIONABLE_VISIT_STATES.includes(r.state) || r.state === 'scheduled'))
        .sort((a, b) => (a.due || '').localeCompare(b.due || ''));

// ── Agreement renewals ───────────────────────────────────────────────────────
// An agreement is the customer's coverage window: planStartDate to
// agreementExpiry. The plan says how early its renewal should surface
// (renewalLeadDays; null → 60). A customer on a legacy free-text agreement with
// no plan row still renews, on the default lead.
export const DEFAULT_RENEWAL_LEAD_DAYS = 60;

export const renewalLeadDaysOf = (plan) => {
    const n = parseInt(plan?.renewalLeadDays, 10);
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_RENEWAL_LEAD_DAYS;
};

/**
 * → { state, expiry, daysLeft, leadDays }
 *   state: none (no agreement end, or not covered, or do-not-service) |
 *          upcoming (outside the lead window) | expiring | expired
 */
export const renewalState = (customer, plan, todayStr) => {
    const covered = !!customer?.servicePlanId || (customer?.serviceAgreement && customer.serviceAgreement !== 'none');
    if (!covered || !isYmd(customer.agreementExpiry) || customer.doNotService) return { state: 'none' };
    const leadDays = renewalLeadDaysOf(plan);
    const daysLeft = daysBetween(todayStr, customer.agreementExpiry);
    const state = daysLeft < 0 ? 'expired' : daysLeft <= leadDays ? 'expiring' : 'upcoming';
    return { state, expiry: customer.agreementExpiry, daysLeft, leadDays };
};

export const RENEWAL_QUEUE_STATES = Object.freeze(['expiring', 'expired']);

export const buildRenewalQueue = (customers, plans, todayStr) =>
    (customers || [])
        .map(c => {
            const plan = (plans || []).find(p => p.id === c.servicePlanId) || null;
            const st = renewalState(c, plan, todayStr);
            return RENEWAL_QUEUE_STATES.includes(st.state) ? { customer: c, plan, ...st } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.expiry.localeCompare(b.expiry) || (a.customer.name || '').localeCompare(b.customer.name || ''));

// A one-year renewal keeps the anniversary: the new expiry is twelve months
// after the OLD expiry, not after today, so renewing early never shortens the
// term. An agreement already expired renews from today.
export const renewedExpiry = (customer, todayStr, months = 12) => {
    const from = isYmd(customer?.agreementExpiry) && customer.agreementExpiry >= todayStr ? customer.agreementExpiry : todayStr;
    return addMonthsStr(from, months);
};
