/**
 * task-reminders.mjs — Real-time task due-time SMS reminders
 *
 * Runs every minute via Netlify scheduled functions.
 * For each active user with taskReminders SMS enabled, finds tasks that are
 * due within the current minute (in the user's local timezone) and sends
 * a one-time SMS reminder. Deduplication via the recommendation_log table
 * prevents the same task firing more than once.
 *
 * Netlify schedule config in netlify.toml:
 *   [functions."task-reminders"]
 *   schedule = "* * * * *"
 *
 * Requirements per task:
 *   - task.dueDate  set (YYYY-MM-DD)
 *   - task.dueTime  set (HH:MM, 24hr or 12hr — both handled)
 *   - task.assignedTo matches a user name in the DB
 *   - user.smsNotifications.enabled = true
 *   - user.smsNotifications.taskReminders = true
 *   - user.mobile or user.phone is set
 *   - task not already completed
 *   - reminder not already sent for this task (dedup check)
 */

import { db } from '../../db/index.js';
import { tasks, users, recommendationLog } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { sendSms, smsTemplates, normalizePhone } from './send-sms.mjs';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a time string into { hour, minute } in 24-hour format.
 * Handles: "14:30", "2:30 PM", "2:30pm", "14:30:00"
 * Returns null if unparseable.
 */
function parseTime(timeStr) {
    if (!timeStr) return null;
    const s = timeStr.trim();

    // Try HH:MM or HH:MM:SS (24-hour)
    const h24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (h24) {
        const hour = parseInt(h24[1], 10);
        const minute = parseInt(h24[2], 10);
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            return { hour, minute };
        }
    }

    // Try 12-hour with AM/PM: "2:30 PM", "2:30pm"
    const h12 = s.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
    if (h12) {
        let hour = parseInt(h12[1], 10);
        const minute = parseInt(h12[2], 10);
        const meridiem = h12[3].toLowerCase();
        if (meridiem === 'pm' && hour !== 12) hour += 12;
        if (meridiem === 'am' && hour === 12) hour = 0;
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
            return { hour, minute };
        }
    }

    return null;
}

/**
 * Get the current local time (hour + minute) in a given IANA timezone.
 * Returns { hour, minute } in 24-hour format.
 */
function getCurrentLocalTime(timezone) {
    try {
        const now = new Date();
        const hourFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            hour12: false,
        });
        const minuteFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            minute: 'numeric',
        });
        const rawHour = parseInt(hourFormatter.format(now), 10);
        const hour = rawHour === 24 ? 0 : rawHour;
        const minute = parseInt(minuteFormatter.format(now), 10);
        return { hour, minute };
    } catch {
        // Fallback to UTC
        const now = new Date();
        return { hour: now.getUTCHours(), minute: now.getUTCMinutes() };
    }
}

/**
 * Get today's date string (YYYY-MM-DD) in a given IANA timezone.
 */
function getTodayInTimezone(timezone) {
    try {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-CA', { // en-CA gives YYYY-MM-DD
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        });
        return formatter.format(now);
    } catch {
        return new Date().toISOString().slice(0, 10);
    }
}

/**
 * Check if a task reminder has already been sent (dedup).
 * Uses recommendationLog with actionType='taskReminder'.
 */
async function wasReminderSent(orgId, taskId) {
    try {
        const rows = await db.select({ id: recommendationLog.id })
            .from(recommendationLog)
            .where(and(
                eq(recommendationLog.orgId, orgId),
                eq(recommendationLog.opportunityId, taskId), // reuse opportunityId field for taskId
                eq(recommendationLog.actionType, 'taskReminder'),
            ))
            .limit(1);
        return rows.length > 0;
    } catch {
        return false; // fail open — better to send than silently skip
    }
}

/**
 * Log that a reminder was sent so we don't fire again.
 */
async function logReminderSent(orgId, repName, task) {
    try {
        await db.insert(recommendationLog).values({
            id:            `tr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            orgId,
            repName,
            actionType:    'taskReminder',
            opportunityId: task.id, // reuse field to store taskId
            dealName:      task.title || 'Task',
            arrAtRisk:     null,
            stage:         'task',
            signal:        `Due ${task.dueDate} ${task.dueTime || ''}`.trim(),
            outcome:       'sent',
            dismissedAt:   new Date(),
        });
    } catch (err) {
        console.error('task-reminders: logReminderSent failed:', err.message);
    }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export const handler = async () => {
    const now = new Date();
    console.log('task-reminders: running at', now.toISOString());

    try {
        const allUsers = await db.select().from(users);
        const allTasks = await db.select().from(tasks);

        let sent = 0;
        let skipped = 0;

        for (const user of allUsers) {
            if (!user.email || !user.active) continue;

            // Read SMS prefs — flat on user row (AppHeader.saveProfile pattern),
            // with fallback to user.profile for older records.
            const profile          = user.profile || {};
            const smsNotifications = user.smsNotifications || profile.smsNotifications || {};
            const userTz           = user.timezone || profile.timezone || 'UTC';
            const mobile           = user.mobile   || profile.mobile   || null;
            const phone            = user.phone    || profile.phone    || null;
            const smsPhone         = mobile || phone;

            // Must have SMS enabled + taskReminders enabled + a phone number
            if (!smsNotifications.enabled)       continue;
            if (!smsNotifications.taskReminders) continue;
            if (!smsPhone)                       continue;

            // What time is it right now in this user's timezone?
            const { hour: localHour, minute: localMinute } = getCurrentLocalTime(userTz);
            const todayLocal = getTodayInTimezone(userTz);

            // Find this user's tasks due today with a dueTime set
            const userTasks = allTasks.filter(t =>
                t.assignedTo === user.name &&
                t.dueDate    === todayLocal &&
                !t.completed  &&
                t.status     !== 'Completed' &&
                t.dueTime                    // must have a specific time set
            );

            for (const task of userTasks) {
                const parsed = parseTime(task.dueTime);
                if (!parsed) continue;

                // Fire if the task's due hour+minute matches the current local minute
                if (parsed.hour !== localHour || parsed.minute !== localMinute) continue;

                // Dedup: only send once per task
                const alreadySent = await wasReminderSent(task.orgId || user.orgId, task.id);
                if (alreadySent) { skipped++; continue; }

                const normalizedPhone = normalizePhone(smsPhone);
                if (!normalizedPhone) {
                    console.warn(`task-reminders: invalid phone for ${user.name}: "${smsPhone}"`);
                    continue;
                }

                try {
                    const body = smsTemplates.taskReminder({
                        repName:   user.name,
                        taskTitle: task.title,
                        dueDate:   task.dueDate,
                        dueTime:   task.dueTime,
                    });
                    await sendSms({ to: normalizedPhone, body });
                    await logReminderSent(task.orgId || user.orgId, user.name, task);
                    sent++;
                    console.log(`task-reminders: sent → ${normalizedPhone} (${user.name} / "${task.title}" due ${task.dueTime})`);
                } catch (err) {
                    console.error(`task-reminders: send failed for "${task.title}":`, err.message);
                }
            }
        }

        console.log(`task-reminders: complete — ${sent} sent, ${skipped} skipped (already sent)`);
        return { statusCode: 200, body: JSON.stringify({ sent, skipped }) };

    } catch (err) {
        console.error('task-reminders: fatal error:', err.message);
        return { statusCode: 500, body: err.message };
    }
};
