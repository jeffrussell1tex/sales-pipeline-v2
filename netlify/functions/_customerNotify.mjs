// _customerNotify.mjs — tell the customer (state §0.111). Called by
// dispatch-jobs.mjs after a create or update has been written; never throws,
// never changes the response the dispatcher gets. Reads the org's switches
// (settings.extra.customerNotifications, off by default), decides what the
// change means (customerNotifications.js notificationPlan), sends by email
// (Resend) and by SMS (Twilio, only when the site has credentials), issues the
// job's public status token on first use, and appends every attempt — sent or
// not, and why not — to the job's customer_notifications trail.
//
// Tenant safety: the customer, the technician and the settings row are all
// read BY THIS JOB'S ORG; nothing here takes an id from a request body.
import { db } from '../../db/index.js';
import { dispatchJobs, dispatchCustomers, dispatchTechnicians, settings } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { sendEmail, emailTemplates } from './send-email.mjs';
import { sendSms } from './send-sms.mjs';
import {
    cleanCustomerNotifications, notificationPlan, channelsFor, whenText, smsText, publicStatusPath,
} from '../../src/utils/customerNotifications.js';

const siteUrl = () => (process.env.APP_URL || process.env.URL || 'https://salespipelinetracker.com').replace(/\/$/, '');
export const smsConfigured = () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
// 24 random bytes, URL-safe: the status link's whole authority. Never an id.
export const newPublicToken = () => randomBytes(24).toString('base64url');

const companyNameOf = (srow) => srow?.extra?.companyDisplayName || srow?.companyName || 'Your service provider';

/**
 * @param {{ orgId: string, before: object|null, after: object, actorName?: string|null }} p
 *   before/after are dispatch_jobs rows (drizzle camelCase); before is null on create.
 * → { sent: trailEntry[], token: string|null }  (sent = the entries appended by this call)
 */
export async function notifyCustomer({ orgId, before, after, actorName = null }) {
    try {
        if (!orgId || !after?.id) return { sent: [], token: after?.publicToken || null };
        const [srow] = await db.select().from(settings).where(eq(settings.orgId, orgId));
        const cfg = cleanCustomerNotifications(srow?.extra?.customerNotifications);
        const types = notificationPlan({ before, after, cfg });
        if (!types.length) return { sent: [], token: after.publicToken || null };

        const [cust] = await db.select().from(dispatchCustomers)
            .where(and(eq(dispatchCustomers.id, after.customerId), eq(dispatchCustomers.orgId, orgId)));
        if (!cust) return { sent: [], token: after.publicToken || null };
        const [tech] = after.assignedTechId
            ? await db.select().from(dispatchTechnicians)
                .where(and(eq(dispatchTechnicians.id, after.assignedTechId), eq(dispatchTechnicians.orgId, orgId)))
            : [];

        // The status link: issued once, kept for the life of the job.
        let token = after.publicToken || null;
        if (cfg.statusLink && !token) {
            token = newPublicToken();
            await db.update(dispatchJobs).set({ publicToken: token })
                .where(and(eq(dispatchJobs.id, after.id), eq(dispatchJobs.orgId, orgId)));
        }
        const statusUrl = cfg.statusLink && token ? `${siteUrl()}${publicStatusPath(token)}` : null;

        const detail = {
            companyName:   companyNameOf(srow),
            customerName:  cust.contactName || cust.name,
            jobTitle:      after.title,
            when:          whenText(after),
            techFirstName: tech?.firstName || null,
            statusUrl,
        };

        const prior = Array.isArray(after.customerNotifications) ? after.customerNotifications : [];
        const added = [];
        const at = new Date().toISOString();
        const entry = (type, channel, to, ok, extra = {}) => added.push({ type, channel, to: to || null, at, ok, by: actorName || null, ...extra });

        for (const type of types) {
            const ch = channelsFor(type, cfg);
            if (ch.email) {
                const to = String(cust.contactEmail || '').trim();
                if (!to) entry(type, 'email', null, false, { error: 'no customer email on file' });
                else {
                    try {
                        const tpl = type === 'on_the_way'
                            ? emailTemplates.customerTechOnTheWay(detail)
                            : emailTemplates.customerAppointmentConfirmed(detail);
                        await sendEmail({ to, ...tpl });
                        entry(type, 'email', to, true);
                    } catch (e) { entry(type, 'email', to, false, { error: String(e.message || e).slice(0, 200) }); }
                }
            }
            if (ch.sms) {
                const to = String(cust.contactPhone || '').trim();
                if (!to) entry(type, 'sms', null, false, { error: 'no customer phone on file' });
                else if (!smsConfigured()) entry(type, 'sms', to, false, { error: 'SMS not configured on this site' });
                else {
                    try {
                        const r = await sendSms({ to, body: smsText(type, detail) });
                        if (r && r.success === false) entry(type, 'sms', to, false, { error: r.reason || 'not sent' });
                        else entry(type, 'sms', to, true);
                    } catch (e) { entry(type, 'sms', to, false, { error: String(e.message || e).slice(0, 200) }); }
                }
            }
        }

        if (added.length) {
            await db.update(dispatchJobs).set({ customerNotifications: JSON.stringify([...prior, ...added]) })
                .where(and(eq(dispatchJobs.id, after.id), eq(dispatchJobs.orgId, orgId)));
        }
        return { sent: added, token };
    } catch (err) {
        console.error('customer-notify:', err.message);
        return { sent: [], token: after?.publicToken || null, error: err.message };
    }
}
