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
import { users, opportunities, tasks, activities } from '../../db/schema.js';
import { gte, eq, and } from 'drizzle-orm';
import { sendEmail, emailTemplates } from './send-email.mjs';
import { sendSms, smsTemplates, normalizePhone } from './send-sms.mjs';

const DEFAULT_PREFS = {
    stageChanged:        { enabled: true,  mode: 'instant' },
    dealAssigned:        { enabled: true,  mode: 'instant' },
    opportunityCreated:  { enabled: true,  mode: 'instant' },
    opportunityUpdated:  { enabled: false, mode: 'digest'  },
    dealClosed:          { enabled: true,  mode: 'instant' },
    commentAdded:        { enabled: true,  mode: 'instant' },
    taskDigest:          { enabled: true,  mode: 'digest'  },
    overdueTaskNudge:    { enabled: true,  mode: 'digest'  },
    managerTeamDigest:   { enabled: true,  mode: 'digest'  }, // weekly team health summary for managers/admins
};

function getPref(profile, alertType) {
    const prefs = profile?.notificationPrefs || {};
    return prefs[alertType] || DEFAULT_PREFS[alertType] || { enabled: false, mode: 'digest' };
}

function wantsDigest(resolvedProfile, alertType) {
    const pref = getPref(profile, alertType);
    return pref.enabled && pref.mode === 'digest';
}

function wantsSms(resolvedProfile, smsKey) {
    const smsPrefs = profile?.smsNotifications || {};
    if (!smsPrefs.enabled) return false;
    return smsPrefs[smsKey] === true;
}

async function trySendSms(to, body, label) {
    try {
        const phone = normalizePhone(to);
        if (!phone) { console.warn(`digest SMS: invalid phone for ${label}`); return; }
        await sendSms({ to: phone, body });
        console.log(`digest SMS sent → ${phone} (${label})`);
    } catch (err) {
        console.error(`digest SMS error (${label}):`, err.message);
    }
}

/**
 * Convert a user's local digest hour to the equivalent UTC hour so we can
 * compare it against the current UTC hour when the cron fires.
 *
 * Strategy: use Intl.DateTimeFormat to find what hour it currently is in the
 * user's timezone, compute the offset from UTC, then apply that offset to the
 * user's desired local hour.
 *
 * Example: user wants 8am CT (UTC-5 in winter).
 *   - Current UTC hour = 13, current CT hour = 8 → offset = UTC - local = 5
 *   - Target UTC = 8 + 5 = 13 ✓
 *
 * This correctly handles DST and half-hour offsets.
 *
 * @param {number} localHour  0-23 hour in user's local time
 * @param {string} timezone   IANA timezone string, e.g. "America/Chicago"
 * @returns {number}          Equivalent UTC hour (0-23)
 */
function localHourToUtc(localHour, timezone) {
    try {
        const now = new Date();

        // Get the current hour in the user's timezone using a reliable numeric format
        const localFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            hour12: false,
        });
        // "numeric" + hour12:false returns "0"-"23"; "24" is returned for midnight
        // in some implementations — normalise it to 0.
        const rawLocal = parseInt(localFormatter.format(now), 10);
        const currentLocalHour = rawLocal === 24 ? 0 : rawLocal;

        const currentUtcHour = now.getUTCHours();

        // UTC offset in whole hours: how many hours ahead UTC is vs local.
        // We use modulo 24 to handle the day-boundary case correctly.
        // e.g. local=23, UTC=4 → offset = (4 - 23 + 24) % 24 = 5
        const utcOffsetHours = ((currentUtcHour - currentLocalHour) + 24) % 24;

        const targetUtcHour = (localHour + utcOffsetHours) % 24;

        console.log(`digest: timezone=${timezone} localHour=${localHour} currentLocal=${currentLocalHour} currentUTC=${currentUtcHour} offset=${utcOffsetHours} → targetUTC=${targetUtcHour}`);

        return targetUtcHour;
    } catch (err) {
        console.warn(`digest: unrecognized timezone "${timezone}", treating as UTC. Error: ${err.message}`);
        return localHour;
    }
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

            // AppHeader.saveProfile saves these fields flat on the user row (top-level),
            // not nested inside user.profile. Read from top-level first, fall back to
            // user.profile for any older records that may have nested values.
            const profile           = user.profile || {};
            const digestTime        = user.digestTime        || profile.digestTime        || '08:00';
            const userTz            = user.timezone          || profile.timezone          || 'UTC';
            const smsNotifications  = user.smsNotifications  || profile.smsNotifications  || {};
            const notificationPrefs = user.notificationPrefs || profile.notificationPrefs || {};
            const mobile            = user.mobile            || profile.mobile            || null;
            const phone             = user.phone             || profile.phone             || null;

            // Build a normalized profile-like object so all downstream helpers
            // (wantsDigest, wantsSms) work without modification.
            const resolvedProfile = {
                ...profile,
                digestTime,
                timezone: userTz,
                smsNotifications,
                notificationPrefs,
                mobile,
                phone,
            };

            const [dHour]       = digestTime.split(':').map(Number);
            const targetUtcHour = localHourToUtc(dHour, userTz);
            if (targetUtcHour !== nowHour) continue;

            console.log(`digest: processing user ${user.name} (${user.email}) — digestTime=${digestTime} tz=${userTz} → fires at UTC ${targetUtcHour}`);

            // ── Tasks due today ────────────────────────────────────────────────
            if (wantsDigest(resolvedProfile, 'taskDigest')) {
                const todayTasks = await db.select().from(tasks)
                    .where(and(eq(tasks.orgId, user.orgId), eq(tasks.assignedTo, user.name)));
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
                        if (wantsSms(resolvedProfile, 'digest')) {
                            const smsPhone = mobile || phone;
                            await trySendSms(
                                smsPhone,
                                smsTemplates.digestSummary({ repName: user.name, taskCount: dueTodayTasks.length, overdueCount: 0 }),
                                `taskDigest/${user.name}`
                            );
                        }
                        console.log(`taskDigest sent to ${user.email} (${dueTodayTasks.length} tasks)`);
                    } catch (err) {
                        console.error(`taskDigest error for ${user.email}:`, err.message);
                    }
                }
            }

            // ── Overdue tasks ─────────────────────────────────────────────────
            if (wantsDigest(resolvedProfile, 'overdueTaskNudge')) {
                const allTasks = await db.select().from(tasks)
                    .where(and(eq(tasks.orgId, user.orgId), eq(tasks.assignedTo, user.name)));
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
                        if (wantsSms(resolvedProfile, 'digest')) {
                            const smsPhone = mobile || phone;
                            await trySendSms(
                                smsPhone,
                                smsTemplates.digestSummary({ repName: user.name, taskCount: 0, overdueCount: overdueTasks.length }),
                                `overdueNudge/${user.name}`
                            );
                        }
                        console.log(`overdueTaskNudge sent to ${user.email} (${overdueTasks.length} overdue)`);
                    } catch (err) {
                        console.error(`overdueTaskNudge error for ${user.email}:`, err.message);
                    }
                }
            }

            // ── Opportunity updates digest ─────────────────────────────────────
            if (wantsDigest(resolvedProfile, 'opportunityUpdated') || wantsDigest(resolvedProfile, 'stageChanged') || wantsDigest(resolvedProfile, 'commentAdded')) {
                const recentOpps = await db.select().from(opportunities)
                    .where(and(eq(opportunities.orgId, user.orgId), eq(opportunities.salesRep, user.name)));

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

        // ── Manager weekly team health digest ─────────────────────────────────
        // Fires on Mondays only (UTC day 1). Sends a team health summary to
        // managers and admins who have managerTeamDigest enabled.
        const isMonday = now.getUTCDay() === 1;
        if (isMonday) {
            const managers = allUsers.filter(u =>
                u.email && u.active &&
                (u.userType === 'Manager' || u.userType === 'Admin')
            );

            for (const mgr of managers) {
                const profile = mgr.profile || {};
                if (!wantsDigest(resolvedProfile, 'managerTeamDigest')) continue;

                const digestTime = mgr.digestTime || profile.digestTime || '08:00';
                const userTz     = mgr.timezone   || profile.timezone   || 'UTC';
                const [dHour]    = digestTime.split(':').map(Number);
                const targetUtcHour = localHourToUtc(dHour, userTz);
                if (targetUtcHour !== nowHour) continue;

                console.log(`managerTeamDigest: building for ${mgr.name} (${mgr.email})`);

                try {
                    // Identify reps this manager can see
                    const allReps = allUsers.filter(u => u.userType === 'User');
                    const visibleReps = mgr.userType === 'Admin' ? allReps : allReps.filter(u =>
                        (mgr.teamId && u.teamId === mgr.teamId) ||
                        (mgr.team   && u.team   === mgr.team)
                    );
                    if (visibleReps.length === 0) continue;

                    const allOpps = await db.select().from(opportunities).where(eq(opportunities.orgId, mgr.orgId));
                    const allTasks = await db.select().from(tasks).where(eq(tasks.orgId, mgr.orgId));
                    const allActs  = await db.select().from(activities).where(eq(activities.orgId, mgr.orgId));
                    const today    = now.toISOString().slice(0, 10);
                    const since7d  = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

                    const BENCHMARK_WIN_RATE = 45;

                    const repRows = visibleReps.map(rep => {
                        const repOpps    = allOpps.filter(o => o.salesRep === rep.name && !['Closed Won','Closed Lost'].includes(o.stage));
                        const allRepOpps = allOpps.filter(o => o.salesRep === rep.name);
                        const wonOpps    = allRepOpps.filter(o => o.stage === 'Closed Won');
                        const lostOpps   = allRepOpps.filter(o => o.stage === 'Closed Lost');
                        const closedTotal = wonOpps.length + lostOpps.length;
                        const winRate    = closedTotal > 0 ? Math.round((wonOpps.length / closedTotal) * 100) : null;

                        const repActs    = allActs.filter(a => a.salesRep === rep.name || a.author === rep.name);
                        const lastActDate = repActs.sort((a,b) => (b.date||'').localeCompare(a.date||''))[0]?.date || null;
                        const daysSinceAct = lastActDate
                            ? Math.floor((now - new Date(lastActDate + 'T12:00:00')) / 86400000) : null;

                        const repTasks   = allTasks.filter(t => t.assignedTo === rep.name);
                        const overdueCount = repTasks.filter(t => {
                            const due = t.dueDate || t.due;
                            return !t.completed && t.status !== 'Completed' && due && due < today;
                        }).length;

                        const pipelineArr = repOpps.reduce((s,o) => s + (parseFloat(o.arr)||0), 0);
                        const dealCount   = repOpps.length;

                        const quota = rep.quotaType === 'quarterly'
                            ? ['q1','q2','q3','q4'].reduce((s,q) => s + (rep[q+'Quota']||0), 0) / 4
                            : (rep.annualQuota || 0) / 4;
                        const wonArr     = wonOpps.reduce((s,o) => s + (parseFloat(o.arr)||0), 0);
                        const attainPct  = quota > 0 ? Math.round((wonArr / quota) * 100) : null;

                        // Health score (mirrors frontend logic)
                        let score = 100;
                        if      (daysSinceAct === null) score -= 30;
                        else if (daysSinceAct >= 21)    score -= 30;
                        else if (daysSinceAct >= 14)    score -= 20;
                        else if (daysSinceAct >= 7)     score -= 10;
                        const staleDeals = repOpps.filter(o => {
                            const lastOppAct = allActs.filter(a => a.opportunityId === o.id)
                                .sort((a,b) => (b.date||'').localeCompare(a.date||''))[0];
                            const ds = lastOppAct?.date
                                ? Math.floor((now - new Date(lastOppAct.date + 'T12:00:00')) / 86400000)
                                : null;
                            return ds !== null && ds >= 14;
                        }).length;
                        score -= Math.min(25, staleDeals * 8);
                        score -= Math.min(20, overdueCount * 5);
                        if      (attainPct === null) score -= 10;
                        else if (attainPct < 25)     score -= 25;
                        else if (attainPct < 50)     score -= 15;
                        else if (attainPct < 75)     score -= 5;
                        score = Math.max(0, Math.round(score));

                        const statusColor = score >= 65 ? '#639922' : score >= 40 ? '#BA7517' : '#E24B4A';
                        const statusLabel = score >= 65
                            ? (score >= 80 ? 'Top performer' : 'On track')
                            : (score >= 40 ? (staleDeals > 0 ? `${staleDeals} stale deal${staleDeals>1?'s':''}` : 'Needs attention') : 'Needs coaching');

                        const weekActs = allActs.filter(a =>
                            (a.salesRep === rep.name || a.author === rep.name) &&
                            new Date(a.date) >= since7d
                        ).length;

                        const fmtArr = v => v >= 1000000 ? '$'+(v/1000000).toFixed(1)+'M' : v >= 1000 ? '$'+Math.round(v/1000)+'K' : '$'+(v||0);

                        return { name: rep.name, score, statusColor, statusLabel, pipelineArr, dealCount, winRate, attainPct, overdueCount, daysSinceAct, weekActs, fmtPipeline: fmtArr(pipelineArr) };
                    });

                    repRows.sort((a,b) => a.score - b.score);

                    // Team summary stats
                    const totalArr    = repRows.reduce((s,r) => s + r.pipelineArr, 0);
                    const atRisk      = repRows.filter(r => r.score < 40).length;
                    const repsWR      = repRows.filter(r => r.winRate !== null);
                    const teamWinRate = repsWR.length > 0 ? Math.round(repsWR.reduce((s,r)=>s+r.winRate,0)/repsWR.length) : null;
                    const totalWeekActs = repRows.reduce((s,r) => s + r.weekActs, 0);
                    const fmtTotal    = totalArr >= 1000000 ? '$'+(totalArr/1000000).toFixed(1)+'M' : totalArr >= 1000 ? '$'+Math.round(totalArr/1000)+'K' : '$'+totalArr;

                    // Team insights (mirrors frontend logic)
                    const insights = [];
                    if (teamWinRate !== null) {
                        if (teamWinRate < BENCHMARK_WIN_RATE) {
                            insights.push(`⚠️ Team win rate is ${teamWinRate}% vs ${BENCHMARK_WIN_RATE}% benchmark — focus on qualification tightness.`);
                        } else {
                            insights.push(`✅ Team win rate is ${teamWinRate}% — ${teamWinRate - BENCHMARK_WIN_RATE}pts above the ${BENCHMARK_WIN_RATE}% benchmark.`);
                        }
                    }
                    if (atRisk > 0) {
                        insights.push(`⚠️ ${atRisk} rep${atRisk>1?'s':''} flagged as needing coaching — review pipeline and activity levels.`);
                    }
                    const repsAttain = repRows.filter(r => r.attainPct !== null);
                    const teamAttain = repsAttain.length > 0 ? Math.round(repsAttain.reduce((s,r)=>s+r.attainPct,0)/repsAttain.length) : null;
                    if (teamAttain !== null) {
                        insights.push(teamAttain >= 75
                            ? `✅ Team quota attainment averaging ${teamAttain}% — on pace for a strong quarter.`
                            : `⚠️ Team quota attainment averaging ${teamAttain}% — reps below 25% may need pipeline coaching.`
                        );
                    }

                    // Build rep rows HTML
                    const repRowsHtml = repRows.map(r => `
                        <tr>
                            <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#1a1a2e;border-bottom:1px solid #f4f6f8">${r.name}</td>
                            <td style="padding:8px 12px;font-size:13px;color:${r.statusColor};font-weight:700;border-bottom:1px solid #f4f6f8">${r.score}</td>
                            <td style="padding:8px 12px;font-size:13px;color:${r.statusColor};border-bottom:1px solid #f4f6f8">${r.statusLabel}</td>
                            <td style="padding:8px 12px;font-size:13px;color:#4a4a6a;border-bottom:1px solid #f4f6f8">${r.fmtPipeline} · ${r.dealCount} deals</td>
                            <td style="padding:8px 12px;font-size:13px;color:#4a4a6a;border-bottom:1px solid #f4f6f8">${r.winRate !== null ? r.winRate+'%' : '—'}</td>
                            <td style="padding:8px 12px;font-size:13px;color:#4a4a6a;border-bottom:1px solid #f4f6f8">${r.attainPct !== null ? r.attainPct+'%' : '—'}</td>
                            <td style="padding:8px 12px;font-size:13px;color:#4a4a6a;border-bottom:1px solid #f4f6f8">${r.weekActs} this week</td>
                        </tr>`).join('');

                    const insightsHtml = insights.map(t =>
                        `<div style="font-size:13px;line-height:1.6;color:#4a4a6a;padding:6px 0;border-bottom:1px solid #f4f6f8">${t}</div>`
                    ).join('');

                    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><style>
                        body{margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e}
                        .wrapper{max-width:640px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
                        .header{background:#1a1a2e;padding:24px 32px}.header-title{color:#fff;font-size:16px;font-weight:600;margin:0}
                        .header-sub{color:#94a3b8;font-size:12px;margin:4px 0 0}
                        .body{padding:32px}.body h2{font-size:20px;font-weight:700;margin:0 0 4px;color:#1a1a2e}
                        .body p{font-size:14px;line-height:1.6;color:#4a4a6a;margin:0 0 16px}
                        .stat-row{display:flex;gap:12px;margin-bottom:20px}
                        .stat{flex:1;background:#f4f6f8;border-radius:6px;padding:12px 16px;text-align:center}
                        .stat-val{font-size:20px;font-weight:700;color:#1a1a2e}
                        .stat-lbl{font-size:11px;color:#94a3b8;margin-top:2px}
                        table{width:100%;border-collapse:collapse;margin-bottom:20px}
                        th{text-align:left;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;padding:6px 12px;background:#f4f6f8}
                        .insight-box{background:#f4f6f8;border-radius:6px;padding:12px 16px;margin-bottom:20px}
                        .insight-title{font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
                        .btn{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;margin-top:4px}
                        .footer{background:#f4f6f8;padding:16px 32px;border-top:1px solid #e5e7eb;font-size:11px;color:#8b92a9;text-align:center}
                        .footer a{color:#3b82f6;text-decoration:none}
                    </style></head><body><div class="wrapper">
                        <div class="header">
                            <p class="header-title">Accelerep — Weekly Team Health Summary</p>
                            <p class="header-sub">Week of ${now.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</p>
                        </div>
                        <div class="body">
                            <h2>Hi ${mgr.name},</h2>
                            <p>Here's your weekly snapshot of team pipeline health.</p>
                            <div class="stat-row">
                                <div class="stat"><div class="stat-val">${repRows.length}</div><div class="stat-lbl">Reps tracked</div></div>
                                <div class="stat"><div class="stat-val">${fmtTotal}</div><div class="stat-lbl">Total pipeline</div></div>
                                <div class="stat"><div class="stat-val" style="color:${atRisk>0?'#E24B4A':'#639922'}">${atRisk}</div><div class="stat-lbl">Need attention</div></div>
                                <div class="stat"><div class="stat-val">${totalWeekActs}</div><div class="stat-lbl">Activities this week</div></div>
                            </div>
                            <table>
                                <thead><tr>
                                    <th>Rep</th><th>Score</th><th>Status</th><th>Pipeline</th><th>Win rate</th><th>Attainment</th><th>Activity</th>
                                </tr></thead>
                                <tbody>${repRowsHtml}</tbody>
                            </table>
                            ${insights.length > 0 ? `<div class="insight-box"><div class="insight-title">Team coaching insights</div>${insightsHtml}</div>` : ''}
                            <a class="btn" href="${process.env.APP_URL || 'https://salespipelinetracker.com'}">Open Sales Manager →</a>
                        </div>
                        <div class="footer"><p>Weekly manager digest · <a href="${process.env.APP_URL || 'https://salespipelinetracker.com'}/settings">Manage preferences</a></p></div>
                    </div></body></html>`;

                    await sendEmail({
                        to: mgr.email,
                        subject: `Weekly team health — ${atRisk > 0 ? `${atRisk} rep${atRisk>1?'s':''} need attention · ` : ''}${fmtTotal} pipeline`,
                        html,
                    });
                    console.log(`managerTeamDigest sent to ${mgr.email} (${repRows.length} reps)`);
                } catch (err) {
                    console.error(`managerTeamDigest error for ${mgr.email}:`, err.message);
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
