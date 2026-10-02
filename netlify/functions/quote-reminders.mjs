// quote-reminders.mjs — the SLA reminder (state §0.158 — Jeff, 2 Oct, answer 3a): a
// quote waiting for approval longer than its tier's SLA reminds the tier's backup,
// and with no backup its approver again — once per submission. Hourly
// (netlify.toml), on the one site whose JOBS_ENABLED is "true" (withHeartbeat).
//
// Per org with quotes waiting — and only that org's rows: its tiers (settings), its
// roster, its record (the audit log's 'quote.submitted' and 'quote.reminded' for
// those quotes). A reminder writes 'quote.reminded' — the record that it went, so
// the next hour does not send it again, and what the quote's history shows. It is
// written even when every reader has the notice switched off: nothing retries.
import { db } from '../../db/index.js';
import { quotes, users, auditLog, opportunities, settings as settingsTable } from '../../db/schema.js';
import { and, eq, inArray } from 'drizzle-orm';
import { sendEmail, emailTemplates } from './send-email.mjs';
import { withHeartbeat } from './_heartbeat.mjs';
import { writeAudit } from './_lib.mjs';
import { appUrl } from './_approvalMail.mjs';
import { approvalTierFor, quoteDiscountPct, DEFAULT_QUOTE_APPROVAL_TIERS, slaHours } from '../../src/utils/quoteRules.js';
import { APPROVAL_NOTICE_KEYS, wantsNotice, reminderRecipients, reminderDue, quoteLink } from '../../src/utils/approvalNotices.js';

const latestAt = (events, quoteId, action) => events
    .filter(e => e.entityId === quoteId && e.action === action)
    .map(e => e.at)
    .sort((a, b) => new Date(b) - new Date(a))[0] || null;

// One pass. `orgId` limits it to one org (a test, or a check by hand); `now` is the
// clock the SLA is read against.
export async function runQuoteReminders({ orgId = null, now = Date.now() } = {}) {
    const waiting = await db.select().from(quotes)
        .where(orgId ? and(eq(quotes.status, 'Pending Approval'), eq(quotes.orgId, orgId)) : eq(quotes.status, 'Pending Approval'));
    const byOrg = new Map();
    for (const q of waiting) byOrg.set(q.orgId, [...(byOrg.get(q.orgId) || []), q]);

    let reminded = 0, emails = 0, notDue = 0;
    for (const [org, list] of byOrg) {
        const [s] = await db.select({ extra: settingsTable.extra }).from(settingsTable).where(eq(settingsTable.orgId, org)).limit(1);
        const tiers = s?.extra?.approvalTiers?.length ? s.extra.approvalTiers : DEFAULT_QUOTE_APPROVAL_TIERS;
        const events = await db.select({ entityId: auditLog.entityId, action: auditLog.action, at: auditLog.timestamp }).from(auditLog)
            .where(and(eq(auditLog.orgId, org), eq(auditLog.entityType, 'quote'),
                inArray(auditLog.entityId, list.map(q => q.id)), inArray(auditLog.action, ['quote.submitted', 'quote.reminded'])));
        let roster = null, deals = null;
        for (const q of list) {
            const tier = approvalTierFor(quoteDiscountPct(q.lineItems, q.dealDiscount), tiers);
            const submittedAt = latestAt(events, q.id, 'quote.submitted');
            if (!reminderDue({ status: q.status, submittedAt, remindedAt: latestAt(events, q.id, 'quote.reminded'), sla: tier?.sla, now })) { notDue++; continue; }
            roster = roster || await db.select().from(users).where(eq(users.orgId, org));
            deals = deals || new Map((await db.select({ id: opportunities.id, account: opportunities.account, opportunityName: opportunities.opportunityName })
                .from(opportunities).where(eq(opportunities.orgId, org))).map(d => [d.id, d]));
            const to = reminderRecipients(tier, roster).filter(u => wantsNotice(u, APPROVAL_NOTICE_KEYS.waiting));
            const deal = deals.get(q.opportunityId);
            const waitedHours = Math.floor((now - new Date(submittedAt).getTime()) / 3600000);
            const results = await Promise.allSettled(to.map(u => sendEmail({ to: u.email, ...emailTemplates.quoteWaiting({
                name: u.name, quoteNumber: q.quoteNumber, account: deal?.account || '', dealName: deal?.opportunityName || '',
                discountPct: Math.round(quoteDiscountPct(q.lineItems, q.dealDiscount)), value: q.totalValue, tierLabel: tier?.label || '',
                url: quoteLink(appUrl(), q.id), reminder: true, waitedHours,
            }) })));
            results.forEach((r, i) => { if (r.status === 'rejected') console.error(`quote-reminders: to ${to[i].id} failed:`, r.reason?.message); });
            emails += results.filter(r => r.status === 'fulfilled').length;
            await writeAudit(org, {
                action: 'quote.reminded', entityType: 'quote', entityId: q.id, entityName: q.name || q.quoteNumber,
                detail: `${q.quoteNumber} v${q.version} · waited past ${slaHours(tier?.sla)}h · to ${to.map(u => u.name).join(', ') || 'no one (the notice is switched off)'}`,
                userId: null, userName: 'Approval reminders',
            });
            reminded++;
        }
    }
    return { statusCode: 200, body: JSON.stringify({ orgs: byOrg.size, waiting: waiting.length, reminded, emails, notDue }) };
}

const run = async () => {
    return runQuoteReminders();
};
export const handler = withHeartbeat('quote-reminders', run);
