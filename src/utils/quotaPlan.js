// quotaPlan.js — a Sales Rep's quota plan for each fiscal year (state §0.203, guide §18b96).
//
// Jeff, 15 Oct 2026: "A rep has an annual quota that is broken down into 4 quarters. If their annual quota is
// $1 million it does not necessarily mean 4 equal 250k quarters. It may ramp up into the year. the 4 quarters of
// quota do need to add up to their annual quota number", and "some companies may do monthly quotas that add up to
// an annual number"; then "Per-year plans now" — each fiscal year has its own plan, and a quarter is measured
// against its own year's plan, never another year's.
//
// A member's plans live in one profile key (sanitize rebuilds the profile from listed keys, so a key per year
// would be dropped by every save):
//
//     quotaPlans: { "2026": { annual: 500000, quarters: [100000, 100000, 125000, 175000], months: null } }
//
// The year is named as quarters.js names it — by the calendar year the fiscal year ends in. months is null or 12
// figures, months[0] being fiscal month 1, so quarter k is months 3k-3..3k-1 whatever the start month; quarters are
// always stored (a months plan stores each quarter as its three months' sum), so every reader reads quarters.
// The old keys (annualQuota, q1Quota..q4Quota, quotaType) carry no year and are never read here.
//
// Pure, no imports: the screens, the reports and the members endpoint share it.

export const QUOTA_PERIODS = Object.freeze(['quarters', 'months']);
/** A company's breakdown: 'months' only when it says exactly that. */
export const cleanQuotaPeriods = (v) => (v === 'months' ? 'months' : 'quarters');

/** The highest figure a save takes — a sanity bound, not a business rule. */
export const QUOTA_MAX = 1e12;

const figureOf = (v) => {
    const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
};
const cents = (n) => Math.round(n * 100);
const sumOf = (list) => list.reduce((s, x) => s + x, 0);
const monthsFit = (months, quarters) =>
    [0, 1, 2, 3].every((k) => cents(months[3 * k] + months[3 * k + 1] + months[3 * k + 2]) === cents(quarters[k]));
const YEAR_KEY = /^\d{4}$/;

/** One year's plan as stored, or null: a yearly figure and four quarters; months only when they fit the quarters. */
export function cleanQuotaPlan(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const annual = figureOf(p.annual);
    if (annual === null || !Array.isArray(p.quarters) || p.quarters.length !== 4) return null;
    const quarters = p.quarters.map(figureOf);
    if (quarters.some((x) => x === null)) return null;
    let months = null;
    if (Array.isArray(p.months) && p.months.length === 12) {
        const m = p.months.map(figureOf);
        if (!m.some((x) => x === null) && monthsFit(m, quarters)) months = m;
    }
    return { annual, quarters, months };
}

/** Every year's plan, cleaned; a malformed year or plan is dropped; nothing left is null. */
export function cleanQuotaPlans(x) {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return null;
    const out = {};
    for (const [year, plan] of Object.entries(x)) {
        if (!YEAR_KEY.test(year)) continue;
        const clean = cleanQuotaPlan(plan);
        if (clean) out[year] = clean;
    }
    return Object.keys(out).length ? out : null;
}

/** The profile keys only the quota save writes; every other save keeps them as stored (users.mjs's merge). */
export const QUOTA_KEYS = Object.freeze(['quotaPlans', 'annualQuota', 'q1Quota', 'q2Quota', 'q3Quota', 'q4Quota', 'quotaType']);
/** Every quota key as stored — set even where absent, so a body's key can never win over a row that lacks it. */
export const storedQuota = (profile) => Object.fromEntries(QUOTA_KEYS.map((k) => [k, profile?.[k] ?? null]));

/** A member's plan for fiscal year `fy`: set false (and zeros) when there is none — never another year's. */
export function quotaPlanOf(member, fy) {
    const plan = Number.isInteger(fy) ? cleanQuotaPlans(member?.quotaPlans)?.[String(fy)] : null;
    if (!plan) return { set: false, annual: 0, quarters: [0, 0, 0, 0], months: null, unallocated: 0, balanced: true };
    const unallocated = (cents(plan.annual) - cents(sumOf(plan.quarters))) / 100;
    return { set: true, ...plan, unallocated, balanced: unallocated === 0 };
}

/** Whole dollars, the remainder on the last period. */
export function splitEvenly(total, n) {
    const t = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
    const each = Math.floor(t / n);
    return Array.from({ length: n }, (_, i) => (i === n - 1 ? t - each * (n - 1) : each));
}

const wholeDollars = (v) => Number.isInteger(v) && v >= 0 && v <= QUOTA_MAX;

/**
 * The save rule, the board's and the server's alike: 4 periods for a quarters company or 12 for months, every
 * figure whole dollars from 0 to QUOTA_MAX, and the periods adding up to the year exactly. null when it holds.
 */
export function checkQuotaSave({ breakdown, annual, periods }) {
    const count = cleanQuotaPeriods(breakdown) === 'months' ? 12 : 4;
    if (!Array.isArray(periods) || periods.length !== count) return { kind: 'count', count };
    if (!wholeDollars(annual) || !periods.every(wholeDollars)) return { kind: 'figure' };
    const sum = sumOf(periods);
    return sum === annual ? null : { kind: 'sum', annual, sum, gap: annual - sum };
}

const usd = (n) => '$' + Math.abs(n).toLocaleString('en-US');

/** The refusal's words, naming the member and the year. */
export function quotaRefusal(name, fy, check, breakdown) {
    const who = name || 'A rep';
    const unit = cleanQuotaPeriods(breakdown) === 'months' ? 'months' : 'quarters';
    if (check?.kind === 'count') return `${who}: FY${fy}'s quota needs ${check.count} ${unit}.`;
    if (check?.kind === 'figure') return `${who}: quotas are whole dollars, 0 or more.`;
    return `${who}'s FY${fy} ${unit} add up to ${usd(check.sum)} — ${usd(check.gap)} ${check.gap > 0 ? 'short of' : 'over'} the ${usd(check.annual)} yearly quota.`;
}

/**
 * The plan a checked save stores. Months: the months, and each quarter their sum. Quarters: the quarters, and the
 * stored months kept only while each quarter's three still add up to it (a switch back and forth loses nothing).
 */
export function planFromSave(breakdown, annual, periods, stored) {
    if (cleanQuotaPeriods(breakdown) === 'months') {
        const quarters = [0, 1, 2, 3].map((k) => periods[3 * k] + periods[3 * k + 1] + periods[3 * k + 2]);
        return { annual, quarters, months: [...periods] };
    }
    const quarters = [...periods];
    const months = stored?.months && monthsFit(stored.months, quarters) ? [...stored.months] : null;
    return { annual, quarters, months };
}

/** Two plans alike, figure for figure. */
export const samePlan = (a, b) => JSON.stringify(cleanQuotaPlan(a)) === JSON.stringify(cleanQuotaPlan(b));

// A typed figure: a blank counts as 0; anything that is not a number is NaN (the save check refuses it).
const typedNumber = (t) => {
    const s = String(t ?? '').trim();
    if (s === '') return 0;
    const v = Number(s);
    return Number.isFinite(v) ? v : NaN;
};

/**
 * The board's row for a member and a year: the draft's text where typed, else the saved plan (a months company's
 * rep with no saved months shows each quarter split three ways). Numbers alongside the text; `unallocated` is the
 * year less the periods, null while any figure is not a number.
 */
export function quotaDraftRow(member, fy, breakdown, draft) {
    const count = cleanQuotaPeriods(breakdown) === 'months' ? 12 : 4;
    const plan = quotaPlanOf(member, fy);
    const planPeriods = count === 12 ? (plan.months || plan.quarters.flatMap((q) => splitEvenly(q, 3))) : plan.quarters;
    const annualText = typeof draft?.annual === 'string' ? draft.annual : (plan.set ? String(plan.annual) : '');
    const periodTexts = Array.isArray(draft?.periods) && draft.periods.length === count
        ? draft.periods
        : (plan.set ? planPeriods.map(String) : Array(count).fill(''));
    const annual = typedNumber(annualText);
    const periods = periodTexts.map(typedNumber);
    const numbers = Number.isFinite(annual) && periods.every(Number.isFinite);
    return { set: plan.set, monthsSaved: !!plan.months, annualText, periodTexts, annual, periods, unallocated: numbers ? annual - sumOf(periods) : null };
}

/**
 * One change on the board: the yearly figure ({ annual }), a period ({ period, text }) or an even split
 * ({ split: true }). Typing the yearly figure splits it evenly only while the member has no plan for the year and
 * no period has been typed; after that the periods stay and the row shows what is left. A draft that comes back to
 * the saved plan is no draft (null).
 */
export function editQuotaDraft(member, fy, breakdown, draft, change) {
    const count = cleanQuotaPeriods(breakdown) === 'months' ? 12 : 4;
    const row = quotaDraftRow(member, fy, breakdown, draft);
    const typed = !!draft?.typed;
    let next;
    if (change && 'annual' in change) {
        const fill = !row.set && !typed;
        const annual = String(change.annual ?? '');
        next = { annual, periods: fill ? splitEvenly(typedNumber(annual), count).map(String) : [...row.periodTexts], typed };
    } else if (change && 'period' in change) {
        const periods = [...row.periodTexts];
        periods[change.period] = String(change.text ?? '');
        next = { annual: row.annualText, periods, typed: true };
    } else {
        next = { annual: row.annualText, periods: splitEvenly(row.annual, count).map(String), typed: true };
    }
    const shown = quotaDraftRow(member, fy, breakdown, next);
    const saved = quotaDraftRow(member, fy, breakdown, null);
    const same = shown.annual === saved.annual && shown.periods.every((p, i) => p === saved.periods[i]);
    return same ? null : next;
}

/** The years the board offers: last year, this year and next. */
export const quotaYearsOffered = (current) => [current - 1, current, current + 1];
/** The years a save may name: within two of the company's current fiscal year (a browser's "today" can be a day off). */
export const quotaYearAllowed = (fy, current) => Number.isInteger(fy) && Number.isInteger(current) && Math.abs(fy - current) <= 2;

/**
 * The member list with the caller's own plans on their own row. A rep's list is the directory — names only — so
 * their own quota read $0 on Home and in Reports; their own row (users?me) holds it. Only a row with no quotaPlans
 * key is filled: a full row (an Admin's or a Manager's list) is never touched.
 */
export function withOwnPlans(users, me) {
    const list = Array.isArray(users) ? users : [];
    if (!me?.id) return list;
    return list.map((u) => (u && u.id === me.id && !('quotaPlans' in u) ? { ...u, quotaPlans: me.quotaPlans ?? null } : u));
}
