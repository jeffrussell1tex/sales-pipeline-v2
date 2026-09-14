// reportDelivery.js — a saved report's scheduled delivery, and how a report
// result reads outside the app (state §0.135; Jeff: "Saved reports: sharing,
// scheduled email or Slack delivery, pin to dashboard"). Pure: no React, no
// db. Shared by the saved-reports endpoint (validates what a member may store),
// the hourly report-deliveries job (decides what is due, renders what is sent),
// the library card (says what a schedule means) and the tests.
//
// The schedule lives at saved_reports.config.delivery — no new column — and is
// an ALLOWLISTED shape (guide §18b37: configuration that drives a write is a
// request): cadence, hour, weekday, day-of-month, timezone, the roster ids the
// email goes to, whether Slack posts. Nothing else is stored, whatever arrives.
import { chartData, formatMetric, formatKey, REPORT_PERIODS } from './reportQuery.js';

export const DELIVERY_CADENCES = Object.freeze([
    Object.freeze({ id: 'daily',   label: 'Every day' }),
    Object.freeze({ id: 'weekly',  label: 'Every week' }),
    Object.freeze({ id: 'monthly', label: 'Every month' }),
]);
export const WEEKDAYS = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
export const MAX_DELIVERY_ROWS = 25;   // what a Slack message and an email table carry; the app has the rest

const intIn = (v, lo, hi, dflt) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : dflt; };

/** Is this an IANA zone Intl knows? ('UTC' is always fine.) */
export function isTimezone(tz) {
    if (typeof tz !== 'string' || !tz) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/**
 * The stored shape, from whatever the client sent. `null` when there is no
 * delivery at all (the key absent, or not an object). The result is what the
 * endpoint writes and what the job reads — never the raw body.
 */
export function cleanDelivery(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const cadence = DELIVERY_CADENCES.some(c => c.id === raw.cadence) ? raw.cadence : 'weekly';
    const emailTo = Array.isArray(raw.emailTo) ? [...new Set(raw.emailTo.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim()))].slice(0, 50) : [];
    return {
        enabled:    raw.enabled === true,
        cadence,
        hour:       intIn(raw.hour, 0, 23, 8),
        weekday:    intIn(raw.weekday, 0, 6, 1),
        dayOfMonth: intIn(raw.dayOfMonth, 1, 28, 1),
        timezone:   isTimezone(raw.timezone) ? raw.timezone : 'UTC',
        emailTo,
        slack:      raw.slack === true,
        // Stamped by the job, never by the client: kept when present, else null.
        lastDeliveredAt: typeof raw.lastDeliveredAt === 'string' ? raw.lastDeliveredAt : null,
        lastError:       typeof raw.lastError === 'string' ? raw.lastError.slice(0, 300) : null,
    };
}

/** A schedule with nothing to send to is not a schedule. */
export function deliveryHasChannel(d) {
    return !!d && (d.slack === true || (Array.isArray(d.emailTo) && d.emailTo.length > 0));
}

/** The local wall clock in a zone: { hour, weekday (0 = Sunday), day }. Falls back to UTC. */
export function localClock(now, timezone) {
    const d = now instanceof Date ? now : new Date(now);
    const tz = isTimezone(timezone) ? timezone : 'UTC';
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false, weekday: 'short', day: 'numeric' }).formatToParts(d);
    const get = (t) => parts.find(p => p.type === t)?.value;
    const rawHour = parseInt(get('hour'), 10);
    const hour = rawHour === 24 ? 0 : (Number.isFinite(rawHour) ? rawHour : d.getUTCHours());
    const weekday = Math.max(0, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday')));
    const day = parseInt(get('day'), 10) || d.getUTCDate();
    return { hour, weekday, day };
}

// The gap under which a second send in the same window is the same send: the
// job runs hourly and Netlify's cron is not to the second, so "not within the
// last 20 hours" is what "once a day" means here.
const MIN_GAP_MS = { daily: 20 * 3600e3, weekly: 6 * 86400e3, monthly: 27 * 86400e3 };

/**
 * Whether a delivery fires at this run. Pure: the schedule, the clock, and
 * when it last went out. → { due, reason }
 */
export function deliveryDue(delivery, now = new Date(), lastDeliveredAt = delivery?.lastDeliveredAt) {
    const d = cleanDelivery(delivery);
    if (!d) return { due: false, reason: 'no delivery' };
    if (!d.enabled) return { due: false, reason: 'off' };
    if (!deliveryHasChannel(d)) return { due: false, reason: 'no recipients' };
    const clock = localClock(now, d.timezone);
    if (clock.hour !== d.hour) return { due: false, reason: `not the hour (${clock.hour} in ${d.timezone}, wants ${d.hour})` };
    if (d.cadence === 'weekly' && clock.weekday !== d.weekday) return { due: false, reason: `not the day (${WEEKDAYS[clock.weekday]}, wants ${WEEKDAYS[d.weekday]})` };
    if (d.cadence === 'monthly' && clock.day !== d.dayOfMonth) return { due: false, reason: `not the day of month (${clock.day}, wants ${d.dayOfMonth})` };
    const last = lastDeliveredAt ? Date.parse(lastDeliveredAt) : NaN;
    const nowMs = (now instanceof Date ? now : new Date(now)).getTime();
    if (Number.isFinite(last) && nowMs - last < MIN_GAP_MS[d.cadence]) return { due: false, reason: 'already delivered this window' };
    return { due: true, reason: 'due' };
}

/** One line for the card: "Every week · Monday 08:00 America/Chicago · email to 2 · Slack". */
export function deliverySummary(delivery) {
    const d = cleanDelivery(delivery);
    if (!d) return 'Not scheduled';
    const cadence = DELIVERY_CADENCES.find(c => c.id === d.cadence)?.label || d.cadence;
    const when = d.cadence === 'weekly' ? `${WEEKDAYS[d.weekday]} ` : d.cadence === 'monthly' ? `day ${d.dayOfMonth} ` : '';
    const hour = `${String(d.hour).padStart(2, '0')}:00`;
    const to = [];
    if (d.emailTo.length) to.push(`email to ${d.emailTo.length}`);
    if (d.slack) to.push('Slack');
    const base = `${cadence} · ${when}${hour} ${d.timezone}`;
    if (!d.enabled) return `${base} · off`;
    return `${base} · ${to.length ? to.join(' · ') : 'no recipients'}`;
}

/**
 * A report result as a plain table: the dimension labels then the metric
 * labels as the header; one row per group, formatted; a total row when the
 * engine gave one. Capped at MAX_DELIVERY_ROWS with `more` saying how many the
 * app still has.
 */
export function deliveryTable(result) {
    const dims = Array.isArray(result?.dims) ? result.dims : [];
    const metrics = Array.isArray(result?.metrics) ? result.metrics : [];
    const rows = Array.isArray(result?.rows) ? result.rows : [];
    const header = [...dims.map(d => d.label), ...metrics.map(m => m.label)];
    const body = rows.slice(0, MAX_DELIVERY_ROWS).map(r => [
        ...dims.map((d, i) => formatKey(d, r.keys?.[i])),
        ...metrics.map(m => formatMetric(r.values?.[m.id], m.format)),
    ]);
    const totals = result?.totals && metrics.length
        ? [...dims.map((_, i) => (i === 0 ? 'Total' : '')), ...metrics.map(m => formatMetric(result.totals[m.id], m.format))]
        : null;
    return { header, body, totals, more: Math.max(0, rows.length - body.length), count: result?.count ?? rows.length };
}

const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);

/** The table as monospace text (Slack's code block, the email's text part). */
export function deliveryText(table) {
    if (!table?.header?.length) return 'Nothing in this period.';
    const cols = table.header.map((h, i) => Math.min(28, Math.max(String(h).length, ...table.body.map(r => String(r[i] ?? '').length), ...(table.totals ? [String(table.totals[i] ?? '').length] : []))));
    const line = (cells) => cells.map((c, i) => pad(c, cols[i])).join('  ').trimEnd();
    const out = [line(table.header), line(cols.map(n => '-'.repeat(n)))];
    for (const r of table.body) out.push(line(r));
    if (table.totals) out.push(line(table.totals));
    if (table.more > 0) out.push(`… ${table.more} more row${table.more === 1 ? '' : 's'} in the app`);
    return out.join('\n');
}

/** The period's label, from the engine's own list. */
export function periodLabel(period) {
    return REPORT_PERIODS.find(p => p.value === (period || 'all'))?.label || 'All time';
}

/**
 * Slack Block Kit for a delivered report: a header, a context line, the table
 * in a code block (Slack has no tables), a button to the app.
 */
export function slackBlocksForReport({ name, source, period, ownerName, table, url }) {
    const text = deliveryText(table);
    const blocks = [
        { type: 'header', text: { type: 'plain_text', text: String(name || 'Report').slice(0, 150), emoji: false } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `${source || 'Opportunities'} · ${periodLabel(period)}${ownerName ? ` · saved by ${ownerName}` : ''} · ${table?.count ?? 0} row${table?.count === 1 ? '' : 's'} in the period` }] },
        { type: 'section', text: { type: 'mrkdwn', text: '```' + text.slice(0, 2900) + '```' } },
    ];
    if (url) blocks.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'Open in Accelerep', emoji: false }, url }] });
    return { text: `${name || 'Report'} — ${source || 'Opportunities'} · ${periodLabel(period)}`, blocks };
}

const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** The table as an HTML fragment for the email (every cell escaped). */
export function deliveryHtmlTable(table) {
    if (!table?.header?.length) return '<p>Nothing in this period.</p>';
    const th = table.header.map(h => `<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #e5e7eb;font-size:12px;color:#4a4a6a">${escHtml(h)}</th>`).join('');
    const tr = (cells, bold = false) => `<tr>${cells.map(c => `<td style="padding:6px 10px;border-bottom:1px solid #e5e7eb;font-size:13px;${bold ? 'font-weight:700;' : ''}color:#1a1a2e">${escHtml(c)}</td>`).join('')}</tr>`;
    const rows = table.body.map(r => tr(r)).join('');
    const totals = table.totals ? tr(table.totals, true) : '';
    const more = table.more > 0 ? `<p style="font-size:12px;color:#4a4a6a">… ${table.more} more row${table.more === 1 ? '' : 's'} in the app.</p>` : '';
    return `<table style="border-collapse:collapse;width:100%"><thead><tr>${th}</tr></thead><tbody>${rows}${totals}</tbody></table>${more}`;
}

// Re-exported so a caller that has a result but not the engine can still chart it.
export { chartData };
