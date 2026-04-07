/**
 * mention-sms.mjs — On-occurrence SMS for deal and task assignments
 *
 * Called fire-and-forget from the browser hooks (useOpportunities, useTasks)
 * immediately after a successful DB save. Looks up the assignee's SMS prefs
 * from the users table, then sends via Twilio if they have it enabled.
 *
 * Protected by Clerk JWT (verifyAuth) — only authenticated org members can call it.
 *
 * POST body:
 * {
 *   type:        'dealAssigned' | 'taskAssigned' | 'stageChanged' | 'dealClosedWon'
 *   assigneeName: string   — name of the user being notified (must match users.name)
 *   assignedBy:   string   — name of the person who made the change
 *   dealName:     string   — opportunity name (for deal events)
 *   taskTitle:    string   — task title (for task events)
 *   account:      string   — account name
 *   fromStage:    string   — previous stage (stageChanged only)
 *   toStage:      string   — new stage (stageChanged only)
 *   arr:          number   — ARR value (dealClosedWon only)
 * }
 */

import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyAuth } from './auth.mjs';
import { sendSms, smsTemplates, normalizePhone } from './send-sms.mjs';

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

    // Auth — must be a valid org member
    const auth = await verifyAuth(event);
    if (auth.error) {
        return { statusCode: auth.status || 401, headers, body: JSON.stringify({ error: auth.error }) };
    }
    const { orgId } = auth;

    try {
        const {
            type,
            assigneeName,
            assignedBy,
            dealName,
            taskTitle,
            account,
            fromStage,
            toStage,
            arr,
        } = JSON.parse(event.body || '{}');

        if (!type || !assigneeName) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'type and assigneeName are required' }) };
        }

        // Look up the assignee in this org
        const matchedUsers = await db.select().from(users)
            .where(and(eq(users.orgId, orgId), eq(users.name, assigneeName)))
            .limit(1);

        if (matchedUsers.length === 0) {
            console.log(`mention-sms: no user found for name "${assigneeName}" in org ${orgId}`);
            return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'user_not_found' }) };
        }

        const user = matchedUsers[0];

        // Resolve SMS prefs — flat on user row first, fallback to user.profile
        const profile          = user.profile || {};
        const smsNotifications = user.smsNotifications || profile.smsNotifications || {};
        const mobile           = user.mobile || profile.mobile || null;
        const phone            = user.phone  || profile.phone  || null;
        const smsPhone         = mobile || phone;

        if (!smsNotifications.enabled) {
            console.log(`mention-sms: SMS disabled for ${assigneeName}`);
            return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'sms_disabled' }) };
        }

        if (!smsNotifications.mentions) {
            console.log(`mention-sms: mentions SMS disabled for ${assigneeName}`);
            return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'mentions_disabled' }) };
        }

        if (!smsPhone) {
            console.log(`mention-sms: no phone number for ${assigneeName}`);
            return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'no_phone' }) };
        }

        const normalizedPhone = normalizePhone(smsPhone);
        if (!normalizedPhone) {
            console.warn(`mention-sms: invalid phone "${smsPhone}" for ${assigneeName}`);
            return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'invalid_phone' }) };
        }

        // Build the SMS body based on event type
        let body;
        switch (type) {
            case 'dealAssigned':
                body = smsTemplates.dealAssigned({
                    repName:    assigneeName,
                    dealName:   dealName || 'a deal',
                    account:    account  || '',
                    assignedBy: assignedBy || 'Someone',
                });
                break;
            case 'taskAssigned':
                body = smsTemplates.taskReminder({
                    repName:   assigneeName,
                    taskTitle: taskTitle || 'a task',
                    dueDate:   '',   // not shown for assignment — just the title
                    dueTime:   null,
                });
                // Override with a cleaner assignment message
                body = `Accelerep: ${assignedBy || 'Someone'} assigned you a task — "${taskTitle || 'Untitled'}"\nView: ${process.env.APP_URL || 'https://salespipelinetracker.com'}?tab=tasks`;
                break;
            case 'stageChanged':
                body = smsTemplates.stageChanged({
                    dealName:  dealName  || 'a deal',
                    fromStage: fromStage || '—',
                    toStage:   toStage   || '—',
                    changedBy: assignedBy || 'Someone',
                });
                break;
            case 'dealClosedWon':
                body = smsTemplates.dealClosedWon({
                    repName:  assigneeName,
                    dealName: dealName || 'a deal',
                    account:  account  || '',
                    arr:      arr      || 0,
                });
                break;
            default:
                return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown type: ${type}` }) };
        }

        await sendSms({ to: normalizedPhone, body });
        console.log(`mention-sms: sent ${type} → ${normalizedPhone} (${assigneeName})`);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, type, to: normalizedPhone }) };

    } catch (err) {
        console.error('mention-sms error:', err.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
    }
};
