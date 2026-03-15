/**
 * digest.mjs — Daily email digest scheduled function
 *
 * Runs every hour via Netlify scheduled functions.
 * For each user who has digest-mode alerts enabled, checks if their
 * configured digestTime (e.g. "08:00") matches the current UTC hour,
 * then sends a digest of pending events from the past 24 hours.
 *
 * Netlify schedule config in netlify.toml:
 *   [functions."digest"]
 *   schedule = "0 * * * *"   (runs top of every hour)
 */

import { db } from '../../db/index.js';
import { users, opportunities, tasks } from '../../db/schema.js';
import { gte, eq } from 'drizzle-orm';
import { sendEmail, emailTemplates } from './send-email.mjs';

const DEFAULT_PREFS = {
    stageChanged:        { enabled: true,  mode: 'instant' },
    dealAssigned:        { enabled: true,  mode: 'instant' },
    opportunityCreated:  { enabled: true,  mode: 'instant' },
    opportunityUpdated:  { enabled: false, mode: 'digest'  },
    dealClosed:          { enabled: true,  mode: 'instant' },
    commentAdded:        { enabled: true,  mode: 'instant' },
    taskDigest:          { enabled: true,  mode: 'digest'  },
    overdueTaskNudge:    { enabled: true,  mode: 'digest'  },
};

function getPref(profile, alertType) {
    const prefs = profile?.notificationPrefs || {};
    return prefs[alertType] || DEFAULT_PREFS[alertType] || { enabled: false, mode: 'digest' };
}

function wantsDigest(profile, alertType) {
    const pref = getPref(profile, alertType);
    return pref.enabled && pref.mode === 'digest';
}

export const handler = async () => {
    const now       = new Date();
    const nowHour   = now.getUTCHours();
    const nowMinute = now.getUTCMinutes();
    const since24h  = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const today     = now.toISOString().slice(0, 10);

    console.log(`digest: running at UTC ${nowHour}:${String(nowMinute).padStart(2,'0')}`);

    try {
        const allUsers = await db.select().from(users);

        for (const user of allUsers) {
            if (!user.email || !user.active) continue;

            const profile     = user.profile || {};
            const digestTime  = profile.digestTime || '08:00'; // e.g. "08:00"
            const [dHour]     = digestTime.split(':').map(Number);

            // Only send if current UTC hour matches user's digest hour
            // (runs every hour, fires once when hour matches)
            if (dHour !== nowHour) continue;

            console.log(`digest: processing user ${user.name} (${user.email}) at digestTime ${digestTime}`);

            const digestItems = [];

            // ── Tasks due today ────────────────────────────────────────────────
            if (wantsDigest(profile, 'taskDigest')) {
                const todayTasks = await db.select().from(tasks)
                    .where(eq(tasks.assignedTo, user.name));
                const dueTodayTasks = todayTasks.filter(t =>
                    t.dueDate === today && !t.completed
                );
                if (dueTodayTasks.length > 0) {
                    try {
                        await sendEmail({
                            to: user.email,
                            ...emailTemplates.taskDigest({
                                repName: user.name,
                                tasks: dueTodayTasks.map(t => ({
                                    title:           t.title,
                                    opportunityName: t.relatedTo || null,
                                    dueTime:         t.dueTime   || null,
                                    priority:        t.priority  || 'Medium',
                                })),
                            }),
                        });
                        console.log(`taskDigest sent to ${user.email} (${dueTodayTasks.length} tasks)`);
                    } catch (err) {
                        console.error(`taskDigest error for ${user.email}:`, err.message);
                    }
                }
            }

            // ── Overdue tasks ─────────────────────────────────────────────────
            if (wantsDigest(profile, 'overdueTaskNudge')) {
                const allTasks = await db.select().from(tasks)
                    .where(eq(tasks.assignedTo, user.name));
                const overdueTasks = allTasks.filter(t =>
                    t.dueDate && t.dueDate < today && !t.completed
                );
                if (overdueTasks.length > 0) {
                    try {
                        await sendEmail({
                            to: user.email,
                            ...emailTemplates.overdueTaskNudge({
                                repName: user.name,
                                tasks: overdueTasks.map(t => {
                                    const daysOverdue = Math.floor(
                                        (now - new Date(t.dueDate)) / (1000 * 60 * 60 * 24)
                                    );
                                    return {
                                        title:           t.title,
                                        opportunityName: t.relatedTo || null,
                                        dueDate:         t.dueDate,
                                        daysOverdue,
                                    };
                                }),
                            }),
                        });
                        console.log(`overdueTaskNudge sent to ${user.email} (${overdueTasks.length} overdue)`);
                    } catch (err) {
                        console.error(`overdueTaskNudge error for ${user.email}:`, err.message);
                    }
                }
            }

            // ── Opportunity updates digest ─────────────────────────────────────
            if (wantsDigest(profile, 'opportunityUpdated') || wantsDigest(profile, 'stageChanged') || wantsDigest(profile, 'commentAdded')) {
                const recentOpps = await db.select().from(opportunities)
                    .where(eq(opportunities.salesRep, user.name));

                const updatedRecently = recentOpps.filter(o =>
                    o.updatedAt && new Date(o.updatedAt) >= since24h
                );

                if (updatedRecently.length > 0) {
                    const dealRows = updatedRecently.map(o =>
                        `<div class="detail-row"><span class="detail-label">${o.opportunityName || o.account || 'Deal'}</span><span>${o.stage}</span></div>`
                    ).join('');

                    try {
                        await sendEmail({
                            to: user.email,
                            subject: `Your daily pipeline digest — ${updatedRecently.length} deal${updatedRecently.length !== 1 ? 's' : ''} updated`,
                            html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><style>
                                body{margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e}
                                .wrapper{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
                                .header{background:#1a1a2e;padding:24px 32px}.header-title{color:#fff;font-size:16px;font-weight:600;margin:0}
                                .body{padding:32px}.body h2{font-size:20px;font-weight:700;margin:0 0 8px;color:#1a1a2e}
                                .body p{font-size:14px;line-height:1.6;color:#4a4a6a;margin:0 0 16px}
                                .detail-box{background:#f4f6f8;border-radius:6px;padding:16px 20px;margin:20px 0}
                                .detail-row{display:flex;justify-content:space-between;font-size:13px;padding:4px 0;color:#4a4a6a}
                                .detail-label{font-weight:600;color:#1a1a2e;min-width:140px}
                                .btn{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;margin-top:8px}
                                .footer{background:#f4f6f8;padding:16px 32px;border-top:1px solid #e5e7eb;font-size:11px;color:#8b92a9;text-align:center}
                                .footer a{color:#3b82f6;text-decoration:none}
                            </style></head><body><div class="wrapper">
                                <div class="header"><p class="header-title">Sales Pipeline Tracker</p></div>
                                <div class="body">
                                    <h2>Your daily pipeline digest</h2>
                                    <p>Hi ${user.name}, here are the deals that were updated in the last 24 hours.</p>
                                    <div class="detail-box">${dealRows}</div>
                                    <a class="btn" href="${process.env.APP_URL || 'https://salespipelinetracker.com'}">View Pipeline →</a>
                                </div>
                                <div class="footer"><p>You're receiving this as your daily digest. <a href="${process.env.APP_URL || 'https://salespipelinetracker.com'}/settings">Manage preferences</a></p></div>
                            </div></body></html>`,
                        });
                        console.log(`opportunityDigest sent to ${user.email} (${updatedRecently.length} deals)`);
                    } catch (err) {
                        console.error(`opportunityDigest error for ${user.email}:`, err.message);
                    }
                }
            }
        }

        console.log('digest: complete');
        return { statusCode: 200, body: 'Digest complete' };

    } catch (err) {
        console.error('digest error:', err.message);
        return { statusCode: 500, body: err.message };
    }
};
