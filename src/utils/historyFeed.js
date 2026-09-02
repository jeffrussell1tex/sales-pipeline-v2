// Activity History feed helpers — pure, testable (0.68 tier 2, batch 7).
//
// The History tab read fields no writer sets (`t.completedAt`, `t.notes`,
// `a.companyName`, `c.engagement`, `c.lastTouch`, `account.status`) and
// linked activities and tasks to an account or contact by NAME fields that do
// not exist on those rows, so anything logged on an account with no deal never
// appeared. These helpers read the columns that exist (`completedDate`,
// `description`, `accountId`, `contactId`, `contactIds`, `contacts`) and
// derive what the UI used to invent.
import { dayOf } from './reportPeriod.js';
import { todayLocal, parseLocalDate } from './dateLocal.js';

/** Text into HTML: everything user-typed that is interpolated into markup. */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** The day a task belongs to on a timeline: done → completedDate, else due, else created. */
export function taskDay(t) {
    return t?.completedDate || t?.dueDate || t?.createdAt || '';
}

const oppLinked = (row, oppIds) => !!row?.opportunityId && !!oppIds && oppIds.has(row.opportunityId);

/** An activity or task belongs to an account through one of its deals or its own accountId. */
export function linkedToAccount(row, account, oppIds) {
    if (!row) return false;
    if (oppLinked(row, oppIds)) return true;
    return !!account?.id && row.accountId === account.id;
}

/**
 * An activity or task belongs to a contact through one of the contact's deals,
 * its contactId, its contactIds list, or (tasks) its contacts list — entries
 * there are ids or {id} objects.
 */
export function linkedToContact(row, contactId, oppIds) {
    if (!row || !contactId) return false;
    if (oppLinked(row, oppIds)) return true;
    if (row.contactId === contactId) return true;
    if (Array.isArray(row.contactIds) && row.contactIds.includes(contactId)) return true;
    if (Array.isArray(row.contacts) && row.contacts.some(c => c === contactId || c?.id === contactId)) return true;
    return false;
}

const daysBetween = (fromDay, toDay) => {
    const a = parseLocalDate(fromDay), b = parseLocalDate(toDay);
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
};

/**
 * What the contacts table used to read off `c.lastTouch` / `c.activities` /
 * `c.engagement` (none of which exist): the last activity day, the count,
 * and a recency tier — hot ≤ 7 days, warm ≤ 30, cool ≤ 90, stale beyond,
 * none when nothing was ever logged.
 */
export function contactTouch(activities, contactId, today = todayLocal()) {
    const mine = (activities || []).filter(a => a.contactId === contactId
        || (Array.isArray(a.contactIds) && a.contactIds.includes(contactId)));
    const days = mine.map(a => dayOf(a.date || a.createdAt)).filter(Boolean).sort();
    const lastTouch = days.length ? days[days.length - 1] : '';
    const since = lastTouch ? daysBetween(lastTouch, today) : null;
    const tier = since === null ? 'none' : since <= 7 ? 'hot' : since <= 30 ? 'warm' : since <= 90 ? 'cool' : 'stale';
    return { lastTouch, count: mine.length, tier };
}

/**
 * Months the "/ mo avg" divides by. A fixed period is its own length; "all
 * time" is the span from the earliest event to today (it used to divide
 * all-time activity by 12 whatever the account's age). Never below 1.
 */
export function monthsSpanned(events, period, today = todayLocal()) {
    if (period === '1month') return 1;
    if (period === '6months') return 6;
    if (period === '1year') return 12;
    const days = (events || []).map(e => dayOf(e.date)).filter(Boolean).sort();
    if (!days.length) return 1;
    const span = daysBetween(days[0], today);
    return Math.max(1, Math.round((span ?? 0) / 30.44));
}
