// _approvalMail.mjs — the approval notices a quote's save sends (state §0.158 —
// Jeff, 2 Oct, each answer a): a submission tells the tier's approver(s); an
// approval or a send-back tells the person who submitted it. Who, and whether, is
// src/utils/approvalNotices.js (each reader's own switch; instant, never digested).
//
// Org-scoped: the roster, the submitter and the deal are read in THIS org only.
// Best-effort: quotes.mjs calls it after the save and its audit row, so a failed
// send never undoes the change it reports — it is logged, and the save stands.
import { db } from '../../db/index.js';
import { users, auditLog, opportunities } from '../../db/schema.js';
import { and, eq, desc } from 'drizzle-orm';
import { sendEmail, emailTemplates } from './send-email.mjs';
import { quoteDiscountPct } from '../../src/utils/quoteRules.js';
import { APPROVAL_NOTICE_KEYS, wantsNotice, waitingRecipients, reachable, quoteLink } from '../../src/utils/approvalNotices.js';

export const appUrl = () => process.env.APP_URL || 'https://salespipelinetracker.com';

// kind: 'submitted' | 'approved' | 'sentBack'. `actorId` is the caller's app id,
// `actorName` their roster name; `note` a send-back's note.
export async function sendApprovalNotices({ orgId, kind, quote, tier, actorId, actorName, note = null }) {
    const roster = await db.select().from(users).where(eq(users.orgId, orgId));
    const [deal] = await db.select({ account: opportunities.account, opportunityName: opportunities.opportunityName, ownerId: opportunities.ownerId })
        .from(opportunities).where(and(eq(opportunities.id, quote.opportunityId), eq(opportunities.orgId, orgId))).limit(1);
    const common = { quoteNumber: quote.quoteNumber, account: deal?.account || '', dealName: deal?.opportunityName || '', url: quoteLink(appUrl(), quote.id) };

    let sends = [];
    if (kind === 'submitted') {
        const to = waitingRecipients(tier, roster, { excludeId: actorId }).filter(u => wantsNotice(u, APPROVAL_NOTICE_KEYS.waiting));
        sends = to.map(u => ({ u, mail: emailTemplates.quoteWaiting({
            ...common, name: u.name, discountPct: Math.round(quoteDiscountPct(quote.lineItems, quote.dealDiscount)),
            value: quote.totalValue, tierLabel: tier?.label || '', submittedBy: actorName || 'A rep',
        }) }));
    } else {
        // The person who submitted it: the record's latest submission (its actor's
        // Clerk id, matched in THIS org's roster), else the deal's owner.
        const [sub] = await db.select({ userId: auditLog.userId }).from(auditLog)
            .where(and(eq(auditLog.orgId, orgId), eq(auditLog.entityType, 'quote'), eq(auditLog.entityId, quote.id), eq(auditLog.action, 'quote.submitted')))
            .orderBy(desc(auditLog.timestamp)).limit(1);
        const submitter = (sub?.userId && roster.find(u => u.clerkUserId === sub.userId)) || roster.find(u => u.id === deal?.ownerId) || null;
        const key = kind === 'approved' ? APPROVAL_NOTICE_KEYS.approved : APPROVAL_NOTICE_KEYS.sentBack;
        if (submitter && submitter.id !== actorId && reachable(submitter) && wantsNotice(submitter, key)) {
            sends = [{ u: submitter, mail: emailTemplates.quoteDecided({ ...common, name: submitter.name, decision: kind, decidedBy: actorName || 'An approver', note }) }];
        }
    }

    const results = await Promise.allSettled(sends.map(({ u, mail }) => sendEmail({ to: u.email, ...mail })));
    results.forEach((r, i) => { if (r.status === 'rejected') console.error(`approval notice (${kind}) to ${sends[i].u.id} failed:`, r.reason?.message); });
    return { sent: results.filter(r => r.status === 'fulfilled').length, to: sends.map(s => s.u.id) };
}
