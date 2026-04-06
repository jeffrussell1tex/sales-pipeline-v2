/**
 * send-sms.mjs
 * Shared SMS utility — all text message sending flows through this function.
 *
 * Setup:
 *   1. Sign up at twilio.com and get an Account SID, Auth Token, and phone number
 *   2. Add TWILIO_ACCOUNT_SID to your Netlify environment variables
 *   3. Add TWILIO_AUTH_TOKEN to your Netlify environment variables
 *   4. Add TWILIO_FROM_NUMBER to your Netlify env (E.164 format, e.g. "+15551234567")
 *
 * Usage from other Netlify functions:
 *   import { sendSms, smsTemplates } from './send-sms.mjs';
 *
 *   await sendSms({
 *     to: '+15559876543',
 *     body: smsTemplates.taskReminder({ repName: 'Jane', taskTitle: 'Follow up with Acme' }),
 *   });
 *
 * No Twilio SDK — uses the Twilio REST API directly via fetch to avoid
 * adding a dependency. Basic Auth with AccountSID:AuthToken per Twilio docs.
 */

// ─── Core send function ───────────────────────────────────────────────────────

/**
 * Send a single SMS via Twilio REST API.
 * Returns { success: true, sid } or throws with a descriptive message.
 *
 * @param {{ to: string, body: string }} opts
 *   to   — E.164 phone number (e.g. "+15551234567")
 *   body — Plain-text message body (Twilio handles encoding)
 */
export async function sendSms({ to, body }) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken  = process.env.TWILIO_AUTH_TOKEN;
    const from       = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !from) {
        console.error('send-sms: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_FROM_NUMBER is not set');
        throw new Error('SMS service is not configured (missing Twilio credentials)');
    }

    if (!to) {
        throw new Error('send-sms: recipient phone number (to) is required');
    }

    // Normalize phone: ensure E.164 — add +1 if it's a 10-digit US number without prefix
    const normalized = normalizePhone(to);
    if (!normalized) {
        console.warn(`send-sms: skipping invalid phone number "${to}"`);
        return { success: false, reason: 'invalid_phone' };
    }

    // Twilio Messages API endpoint
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    // Twilio uses form-encoded bodies, not JSON
    const payload = new URLSearchParams({
        From: from,
        To:   normalized,
        Body: body,
    });

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

    const res = await fetch(url, {
        method:  'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type':  'application/x-www-form-urlencoded',
        },
        body: payload.toString(),
    });

    if (!res.ok) {
        const errBody = await res.text();
        console.error('send-sms: Twilio API error', res.status, errBody);
        throw new Error(`Twilio API returned ${res.status}: ${errBody}`);
    }

    const result = await res.json();
    console.log('send-sms: sent successfully', result.sid, '→', normalized);
    return { success: true, sid: result.sid };
}

// ─── Phone normalization ──────────────────────────────────────────────────────

/**
 * Normalize a phone number to E.164 format.
 * Returns null if the number can't be reasonably parsed.
 *
 * Handles:
 *   "+15551234567"  → "+15551234567"   (already E.164)
 *   "15551234567"   → "+15551234567"   (US with country code, no +)
 *   "5551234567"    → "+15551234567"   (10-digit US, adds +1)
 *   "(555) 123-4567"→ "+15551234567"   (formatted US)
 *   "+44 20 7946 0958" → "+442079460958" (international already has +)
 */
export function normalizePhone(raw) {
    if (!raw) return null;

    // Strip everything except digits and leading +
    const stripped = raw.trim().replace(/[^\d+]/g, '');

    // Already E.164 (starts with +, at least 10 digits after)
    if (stripped.startsWith('+') && stripped.length >= 11) {
        return stripped;
    }

    // Digits only
    const digits = stripped.replace(/\D/g, '');

    if (digits.length === 11 && digits.startsWith('1')) {
        // US/Canada with country code: 15551234567
        return `+${digits}`;
    }

    if (digits.length === 10) {
        // 10-digit US/Canada — assume +1
        return `+1${digits}`;
    }

    if (digits.length > 11) {
        // International number without +
        return `+${digits}`;
    }

    // Can't determine — too short or malformed
    return null;
}

// ─── SMS templates ────────────────────────────────────────────────────────────
// Keep these concise — SMS is capped at 160 chars per segment.
// Messages up to ~300 chars are fine (2 segments); beyond that Twilio
// splits automatically but costs more. Keep each template under 300 chars.

const appUrl = process.env.APP_URL || 'https://salespipelinetracker.com';

export const smsTemplates = {

    /**
     * Task reminder — sent at task reminder time.
     * @param {{ repName, taskTitle, dueDate, dueTime }} data
     */
    taskReminder({ repName, taskTitle, dueDate, dueTime }) {
        const when = dueTime ? `${dueDate} at ${dueTime}` : dueDate;
        return `Accelerep reminder: Task due ${when}\n"${taskTitle}"\nView: ${appUrl}?tab=tasks`;
    },

    /**
     * Task overdue nudge.
     * @param {{ taskTitle, daysOverdue }} data
     */
    taskOverdue({ taskTitle, daysOverdue }) {
        return `Accelerep: Overdue task (${daysOverdue}d) — "${taskTitle}"\nView: ${appUrl}?tab=tasks`;
    },

    /**
     * Deal assigned to rep.
     * @param {{ repName, dealName, account, assignedBy }} data
     */
    dealAssigned({ repName, dealName, account, assignedBy }) {
        return `Accelerep: ${assignedBy} assigned you "${dealName}" (${account || 'No account'})\nView: ${appUrl}`;
    },

    /**
     * Deal stage changed.
     * @param {{ dealName, fromStage, toStage, changedBy }} data
     */
    stageChanged({ dealName, fromStage, toStage, changedBy }) {
        return `Accelerep: "${dealName}" moved ${fromStage} → ${toStage} by ${changedBy}\nView: ${appUrl}`;
    },

    /**
     * Deal closed won — celebratory.
     * @param {{ repName, dealName, account, arr }} data
     */
    dealClosedWon({ repName, dealName, account, arr }) {
        const fmtArr = arr ? ` ($${Math.round(arr).toLocaleString()})` : '';
        return `🎉 Accelerep: "${dealName}"${fmtArr} marked Closed Won! Great work, ${repName}!`;
    },

    /**
     * Deal silent alert.
     * @param {{ dealName, daysSilent }} data
     */
    dealSilent({ dealName, daysSilent }) {
        return `Accelerep alert: "${dealName}" has been silent ${daysSilent} days. Log an activity to keep it moving.\nView: ${appUrl}`;
    },

    /**
     * Deal stuck in stage.
     * @param {{ dealName, stage, daysInStage }} data
     */
    dealStuck({ dealName, stage, daysInStage }) {
        return `Accelerep alert: "${dealName}" stuck in ${stage} for ${daysInStage} days. Consider advancing or disqualifying.\nView: ${appUrl}`;
    },

    /**
     * Close date lapsed.
     * @param {{ dealName, daysLapsed }} data
     */
    closeDateLapsed({ dealName, daysLapsed }) {
        return `Accelerep: "${dealName}" close date passed ${daysLapsed} day${daysLapsed !== 1 ? 's' : ''} ago. Update your forecast.\nView: ${appUrl}`;
    },

    /**
     * Daily digest summary (brief — directs to app for detail).
     * @param {{ repName, taskCount, overdueCount }} data
     */
    digestSummary({ repName, taskCount, overdueCount }) {
        const parts = [];
        if (taskCount > 0) parts.push(`${taskCount} task${taskCount !== 1 ? 's' : ''} due today`);
        if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
        const summary = parts.length > 0 ? parts.join(', ') : 'nothing due today';
        return `Accelerep daily digest: ${summary}. View: ${appUrl}?tab=tasks`;
    },

    /**
     * New comment/mention on a deal.
     * @param {{ dealName, commentBy }} data
     */
    commentAdded({ dealName, commentBy }) {
        return `Accelerep: ${commentBy} commented on "${dealName}"\nView: ${appUrl}`;
    },

    /**
     * Manager alert: rep deal needs attention.
     * @param {{ repName, dealName, alertType }} data
     */
    managerDealAlert({ repName, dealName, alertType }) {
        const alertLabels = { silent: 'gone silent', stuck: 'stuck in stage', lapsed: 'close date lapsed' };
        const label = alertLabels[alertType] || alertType;
        return `Accelerep manager alert: ${repName}'s "${dealName}" has ${label}. View: ${appUrl}`;
    },
};

// ─── HTTP handler (internal use only) ────────────────────────────────────────
// Accepts POST: { to, body } — guarded by INTERNAL_API_SECRET like send-email.mjs.

export const handler = async (event) => {
    const headers = {
        'Content-Type':                'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const internalSecret = process.env.INTERNAL_API_SECRET;
    const authHeader = event.headers?.authorization || event.headers?.Authorization || '';
    const isInternal = internalSecret && authHeader === `Bearer ${internalSecret}`;

    if (!isInternal) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden: use INTERNAL_API_SECRET' }) };
    }

    try {
        const { to, body } = JSON.parse(event.body || '{}');
        if (!to || !body) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'to and body are required' }) };
        }
        const result = await sendSms({ to, body });
        return { statusCode: 200, headers, body: JSON.stringify(result) };
    } catch (err) {
        console.error('send-sms handler error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
