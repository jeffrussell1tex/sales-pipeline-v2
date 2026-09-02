// reportPeriod.js — the Reports tab's period and comparison windows.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// ReportsTab carried four copies of a fiscal-quarter builder: three identical
// ones for deals, activities and leads, and a fourth for the comparison
// baseline — written to the OPPOSITE year convention. The first three put a
// quarter in `baseYear − 1` whenever its start month was >= the fiscal start,
// which under the app default (January) is every quarter: "FY 2026" and
// Q1–Q4 returned 2025 data. The fourth named years by when they start, so
// "vs previous quarter" compared mismatched years, and "All time" was compared
// against a 90-day window as if that meant something (0.68, tier 1 items 1–2).
//
// src/utils/quarters.js already fixes the convention for the Pipeline list and
// the Home greeting — a fiscal year is named by the calendar year it ENDS in —
// and its own header says it is meant to be the last implementation. This
// module builds on it and nothing here does date arithmetic of its own.
//
// Days vs instants: a deal's forecastedCloseDate / createdDate and an
// activity's date are wall-calendar days (yyyy-mm-dd). createdAt is an instant.
// `.slice(0, 10)` on an instant is the UTC day, one day late west of Greenwich
// after ~7pm; dayOf() reads an instant on the local clock instead (18b26).
import { quarterOf, quarterStartDate, quarterEndDate } from './quarters.js';
import { isoLocal, parseLocalDate } from './dateLocal.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A yyyy-mm-dd day for a day string or an instant; '' when unreadable. */
export function dayOf(value) {
    if (value == null) return '';
    const s = String(value).trim();
    if (DAY_RE.test(s)) return s;
    const d = parseLocalDate(s);
    return d ? isoLocal(d) : '';
}

/** Is `day` (yyyy-mm-dd) inside the range? Empty bounds are open; an empty day is never inside. */
export function inRange(day, range) {
    if (!day || !range) return false;
    if (range.from && day < range.from) return false;
    if (range.to && day > range.to) return false;
    return true;
}

/** The fiscal year `today` falls in, by the house convention. */
export function currentFiscalYear(fiscalStart, today = new Date()) {
    return quarterOf(isoLocal(today), fiscalStart).fiscalYear;
}

/** { from, to } (yyyy-mm-dd, inclusive) for 'Q1'..'Q4' or 'FY' of a fiscal year. */
export function fiscalRange(fiscalYear, key, fiscalStart) {
    const q = key === 'FY' ? null : Number(String(key).replace('Q', ''));
    if (key !== 'FY' && !(q >= 1 && q <= 4)) return null;
    const start = quarterStartDate(fiscalYear, key === 'FY' ? 1 : q, fiscalStart);
    const end   = quarterEndDate(fiscalYear, key === 'FY' ? 4 : q, fiscalStart);
    return { from: isoLocal(start), to: isoLocal(end) };
}

/**
 * The selected period as a range, or null for 'all' (no filter).
 * 'custom' returns the user's bounds as given; either may be '' (open).
 */
export function periodRange(period, fiscalStart, { today = new Date(), from = '', to = '' } = {}) {
    if (!period || period === 'all') return null;
    if (period === 'custom') return { from: from || '', to: to || '' };
    return fiscalRange(currentFiscalYear(fiscalStart, today), period, fiscalStart);
}

const shiftDays = (day, n) => {
    const d = parseLocalDate(day);
    if (!d) return '';
    d.setDate(d.getDate() + n);
    return isoLocal(d);
};
const shiftYears = (day, n) => {
    const d = parseLocalDate(day);
    if (!d) return '';
    d.setFullYear(d.getFullYear() + n);
    return isoLocal(d);
};

/**
 * The comparison window for a period, or null when there is nothing honest to
 * compare against: compareTo 'none', period 'all' (all time has no "previous"),
 * or a custom range with an open end.
 *   previous_quarter: Qn → Q(n−1) of the same fiscal year, Q1 → Q4 of the year
 *                     before; FY → the fiscal year before; custom → the window
 *                     of equal length ending the day before `from`.
 *   previous_year:    Qn / FY → the same key one fiscal year earlier; custom →
 *                     the same bounds one calendar year earlier.
 */
export function priorRange(period, compareTo, fiscalStart, { today = new Date(), from = '', to = '' } = {}) {
    if (!compareTo || compareTo === 'none') return null;
    if (!period || period === 'all') return null;
    const fy = currentFiscalYear(fiscalStart, today);

    if (period === 'custom') {
        if (!from || !to || to < from) return null;
        if (compareTo === 'previous_year') return { from: shiftYears(from, -1), to: shiftYears(to, -1) };
        const days = Math.round((parseLocalDate(to) - parseLocalDate(from)) / 86400000) + 1;
        const priorTo = shiftDays(from, -1);
        return { from: shiftDays(priorTo, -(days - 1)), to: priorTo };
    }

    if (compareTo === 'previous_year') return fiscalRange(fy - 1, period, fiscalStart);

    if (compareTo === 'previous_quarter') {
        if (period === 'FY') return fiscalRange(fy - 1, 'FY', fiscalStart);
        const q = Number(String(period).replace('Q', ''));
        if (!(q >= 1 && q <= 4)) return null;
        return q === 1 ? fiscalRange(fy - 1, 'Q4', fiscalStart) : fiscalRange(fy, `Q${q - 1}`, fiscalStart);
    }
    return null;
}
