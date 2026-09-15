/**
 * report-deliveries.mjs — a saved report, run and sent on its schedule
 * (state §0.135; Jeff: "Saved reports: sharing, scheduled email or Slack
 * delivery, pin to dashboard").
 *
 * Runs every five minutes (netlify.toml; hourly until §0.140, when the time
 * became any minute), wrapped in the heartbeat like every other scheduled
 * function — so only the site whose JOBS_ENABLED is "true" runs it, and the
 * Jobs tile says when it last did. For every saved report whose
 * config.delivery is enabled and DUE at this run in its own timezone
 * (src/utils/reportDelivery.js decides: from the scheduled minute for a short
 * window; a send inside the cadence's window is never repeated), the report
 * is RUN on the server with the same pure engine
 * the Reports tab uses (src/utils/reportQuery.js) over the OWNER's read of the
 * org — the whole org when the owner's role can see all (the server's rule for
 * a Manager, CLAUDE.md), else the owner's own rows — and sent: by email to the
 * roster members the schedule names (their addresses read from THIS org's
 * roster, never from the schedule), and/or to the workspace's Slack webhook.
 * The outcome is stamped back onto the schedule (lastDeliveredAt, lastError).
 *
 * `deliverReport` is also what the endpoint's "Send now" calls (saved-reports
 * ?action=deliver) — one path for both, like train-lead-model and the batch.
 *
 * Tenant safety: every row carries its org; the owner, the recipients, the
 * data and the settings are read BY THAT ROW'S ORG; the stamp is written by id
 * AND org.
 */
import { db } from '../../db/index.js';
import { savedReports, users, settings as settingsTable, opportunities, accounts, leads, activities } from '../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { canSeeAll } from './auth.mjs';
import { sendEmail, emailTemplates } from './send-email.mjs';
import { sendSlackToOrg } from './send-slack.mjs';
import { withHeartbeat } from './_heartbeat.mjs';
import { runReport } from '../../src/utils/reportQuery.js';
import {
    cleanDelivery, deliveryDue, deliveryHasChannel, deliveryTable, deliveryHtmlTable, slackBlocksForReport, periodLabel,
} from '../../src/utils/reportDelivery.js';

const siteUrl = () => (process.env.APP_URL || process.env.URL || 'https://salespipelinetracker.com').replace(/\/$/, '');
const isPlaceholder = (email) => !email || String(email).endsWith('@placeholder.local');

/** The report's owner on ITS org's roster — role, app id, name, address. Null when they are gone. */
async function ownerOf(row) {
    const [u] = await db.select().from(users)
        .where(and(eq(users.orgId, row.orgId), eq(users.clerkUserId, row.ownerId)));
    return u || null;
}

/** The recipients: the schedule's roster ids resolved in THIS org, active, with a real address. */
async function recipientsOf(orgId, ids) {
    if (!ids.length) return [];
    const rows = await db.select({ id: users.id, email: users.email, active: users.active, name: users.name }).from(users)
        .where(and(eq(users.orgId, orgId), inArray(users.id, ids)));
    return rows.filter(u => u.active !== false && !isPlaceholder(u.email));
}

/**
 * The owner's read of the org, in the shapes the engine reads (the drizzle
 * rows carry the same camelCase fields the endpoints hand the tab).
 */
export async function loadReportData(orgId, owner) {
    const all = canSeeAll(owner?.role);
    const scoped = (table) => (all
        ? db.select().from(table).where(eq(table.orgId, orgId))
        : db.select().from(table).where(and(eq(table.orgId, orgId), eq(table.ownerId, owner.id))));
    const [opps, accts, lds, acts, srows] = await Promise.all([
        scoped(opportunities), scoped(accounts), scoped(leads), scoped(activities),
        db.select().from(settingsTable).where(eq(settingsTable.orgId, orgId)),
    ]);
    const srow = srows[0] || null;
    return {
        opportunities: opps, accounts: accts, leads: lds, activities: acts,
        settings: { ...(srow?.extra || {}), fiscalYearStart: srow?.fiscalYearStart || '' },
        fiscalStart: parseInt(srow?.fiscalYearStart) || 10,
    };
}

/**
 * Run one saved report and send it where its schedule says.
 * → { ok, sent: { email: [addresses], slack: bool }, errors: [], rows }
 */
export async function deliverReport(row, { now = new Date(), trigger = 'schedule' } = {}) {
    const d = cleanDelivery(row?.config?.delivery);
    if (!d) return { ok: false, sent: { email: [], slack: false }, errors: ['This report has no delivery schedule.'], rows: 0 };
    if (!deliveryHasChannel(d)) return { ok: false, sent: { email: [], slack: false }, errors: ['The schedule has no recipients — pick people for the email, or turn Slack on.'], rows: 0 };
    const owner = await ownerOf(row);
    if (!owner) return { ok: false, sent: { email: [], slack: false }, errors: ['The report’s owner is not on this workspace’s roster.'], rows: 0 };

    const data = await loadReportData(row.orgId, owner);
    const period = row.filters?.period || 'all';
    // The whole saved definition runs — the period, its custom bounds and the
    // row filters (§0.139) — so the table sent is the picture the builder showed.
    const result = runReport(
        { source: row.source, dims: Array.isArray(row.dims) ? row.dims : [], metrics: Array.isArray(row.metrics) ? row.metrics : [], period, from: row.filters?.from || '', to: row.filters?.to || '', where: row.filters?.where || [], limit: 200 },
        data, { fiscalStart: data.fiscalStart, today: now });
    const table = deliveryTable(result);
    const url = siteUrl();
    const sent = { email: [], slack: false };
    const errors = [];

    const recipients = await recipientsOf(row.orgId, d.emailTo);
    if (d.emailTo.length && !recipients.length) errors.push('None of the chosen recipients is an active member with an email address.');
    for (const r of recipients) {
        try {
            const tpl = emailTemplates.reportDelivery({
                name: row.name, source: row.source, period: periodLabel(period), ownerName: owner.name,
                tableHtml: deliveryHtmlTable(table), count: table.count, url, cadence: d.cadence, trigger,
            });
            await sendEmail({ to: r.email, ...tpl });
            sent.email.push(r.email);
        } catch (e) { errors.push(`email to ${r.email}: ${String(e.message || e).slice(0, 120)}`); }
    }
    if (d.slack) {
        const posted = await sendSlackToOrg(row.orgId, slackBlocksForReport({ name: row.name, source: row.source, period, ownerName: owner.name, table, url }));
        if (posted) sent.slack = true;
        else errors.push('Slack: this workspace has no Slack webhook connected, or the post failed.');
    }

    const delivered = sent.email.length > 0 || sent.slack;
    const stamped = { ...d, lastDeliveredAt: delivered ? now.toISOString() : d.lastDeliveredAt, lastError: errors.length ? errors.join(' | ').slice(0, 300) : null };
    await db.update(savedReports)
        .set({ config: { ...(row.config || {}), delivery: stamped }, updatedAt: new Date() })
        .where(and(eq(savedReports.id, row.id), eq(savedReports.orgId, row.orgId)));
    return { ok: errors.length === 0, sent, errors, rows: table.count, delivery: stamped };
}

// The run itself; `handler` is this wrapped in the heartbeat.
const run = async () => {
    const now = new Date();
    // Every org's reports in one read — the job is the one reader across
    // tenants, like the digest; each row is then handled BY ITS OWN ORG.
    const rows = await db.select().from(savedReports);
    let due = 0, sent = 0, failed = 0;
    for (const row of rows) {
        const d = row.config?.delivery;
        if (!d || d.enabled !== true) continue;
        const { due: isDue } = deliveryDue(d, now);
        if (!isDue) continue;
        due++;
        try {
            const r = await deliverReport(row, { now, trigger: 'schedule' });
            if (r.ok) sent++; else { failed++; console.warn(`report-deliveries: ${row.id} (${row.orgId}) — ${r.errors.join(' | ')}`); }
        } catch (e) {
            failed++;
            console.error(`report-deliveries: ${row.id} (${row.orgId}) threw:`, e.message);
        }
    }
    console.log(`report-deliveries: ${rows.length} reports read, ${due} due, ${sent} sent, ${failed} failed at ${now.toISOString()}`);
    return { statusCode: 200, body: JSON.stringify({ reports: rows.length, due, sent, failed, at: now.toISOString() }) };
};

export const handler = withHeartbeat('report-deliveries', run);
