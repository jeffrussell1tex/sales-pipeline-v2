/**
 * mention-sms.mjs — the text a member gets when a deal or a task is assigned to
 * them, a deal of theirs changes stage, or one is won (state §0.172).
 *
 * The browser names the event and the record — { type, recordId } — and nothing
 * else. The server loads the record in the caller's org, refuses a caller who
 * could not have saved it, texts the record's OWNER (by users.id, never a name),
 * signs the text with the caller's roster name, and words it from the stored
 * fields — and only for an event the record bears out (a win is a deal in Closed
 * Won; a stage change is the deal's last recorded move).
 *
 * Until §0.172 the body carried the recipient's NAME and every word of the
 * message: any signed-in member, a read-only one included, could have the org's
 * Twilio number text any colleague with mention texts on, saying anything, under
 * any name; and a name two members share texted whichever row came back first.
 *
 * POST body: { type: 'dealAssigned' | 'stageChanged' | 'dealClosedWon' | 'taskAssigned', recordId }
 * Called fire-and-forget from the browser hooks (useOpportunities, useTasks)
 * after a successful save.
 */

import { db } from '../../db/index.js';
import { users, opportunities, tasks } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth, requireWrite } from './auth.mjs';
import { sendSms, smsTemplates, normalizePhone } from './send-sms.mjs';
import { serverErrorBody, getCallerName, assertOwnership } from './_lib.mjs';
import { MENTION_EVENTS, lastMoveOf } from './_mentions.mjs';

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

    const auth = await verifyAuth(event);
    if (auth.error) {
        return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    }
    // Only the roles that change CRM records send these — the save they follow
    // is one of theirs.
    const forbidden = requireWrite(auth, event, headers);
    if (forbidden) return forbidden;
    const { orgId, userId, userRole } = auth;

    try {
        const { type, recordId } = JSON.parse(event.body || '{}');
        const entity = MENTION_EVENTS[type];
        if (!entity) return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown type: ${type}` }) };
        if (!recordId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'recordId is required' }) };

        const table = entity === 'opportunity' ? opportunities : tasks;
        const [record] = await db.select().from(table)
            .where(and(eq(table.id, String(recordId)), eq(table.orgId, orgId)));
        if (!record) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

        // A caller who could not have saved the record sends nothing about it.
        const denied = await assertOwnership({ table, entity, id: record.id, orgId, userId, userRole, headers, row: record });
        if (denied) return denied;

        // The event must be one the record bears out.
        let move = null;
        if (type === 'dealClosedWon' && record.stage !== 'Closed Won') {
            return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'not_won' }) };
        }
        if (type === 'stageChanged') {
            move = lastMoveOf(record);
            if (!move) return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'no_stage_change' }) };
        }

        // The recipient is the record's owner — an id, never a name.
        if (!record.ownerId) return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'unassigned' }) };
        const [user] = await db.select().from(users)
            .where(and(eq(users.id, record.ownerId), eq(users.orgId, orgId)));
        if (!user) return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'user_not_found' }) };
        if (user.active === false) return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'inactive' }) };

        // Resolve SMS prefs — flat on user row first, fallback to user.profile
        const profile          = user.profile || {};
        const smsNotifications = user.smsNotifications || profile.smsNotifications || {};
        const mobile           = user.mobile || profile.mobile || null;
        const phone            = user.phone  || profile.phone  || null;
        const smsPhone         = mobile || phone;

        if (!smsNotifications.enabled) {
            return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'sms_disabled' }) };
        }
        if (!smsNotifications.mentions) {
            return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'mentions_disabled' }) };
        }
        if (!smsPhone) {
            return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'no_phone' }) };
        }
        const normalizedPhone = normalizePhone(smsPhone);
        if (!normalizedPhone) {
            console.warn(`mention-sms: invalid phone on ${user.id}`);
            return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'invalid_phone' }) };
        }

        // Every word below is the server's: the record's stored fields, the
        // recipient's roster name, the caller's roster name.
        const by       = (await getCallerName(userId, orgId)) || 'Someone';
        const repName  = user.name || 'there';
        const dealName = record.opportunityName || record.account || 'a deal';
        let body;
        switch (type) {
            case 'dealAssigned':
                body = smsTemplates.dealAssigned({ repName, dealName, account: record.account || '', assignedBy: by });
                break;
            case 'stageChanged':
                body = smsTemplates.stageChanged({ dealName, fromStage: move.fromStage, toStage: move.toStage, changedBy: by });
                break;
            case 'dealClosedWon':
                body = smsTemplates.dealClosedWon({ repName, dealName, account: record.account || '', arr: Number(record.arr) || 0 });
                break;
            case 'taskAssigned':
                body = `Accelerep: ${by} assigned you a task — "${record.title || 'Untitled'}"\nView: ${process.env.APP_URL || 'https://salespipelinetracker.com'}?tab=tasks`;
                break;
        }

        await sendSms({ to: normalizedPhone, body });
        console.log(`mention-sms: sent ${type} for ${record.id} to ${user.id}`);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, type }) };

    } catch (err) {
        console.error('mention-sms error:', err.message);
        return { statusCode: 500, headers, body: serverErrorBody(err, 'mention-sms') };
    }
};
