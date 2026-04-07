/**
 * pipeline-alerts.mjs — Proactive pipeline health alerts (email + SMS)
 *
 * Runs every hour via Netlify scheduled functions (same as digest.mjs).
 * Each user's alertTime preference (stored in profile.alertTime, defaults to
 * "08:00" in their local timezone) determines when they receive alerts.
 * If no alertTime is set, falls back to firing once daily at the user's
 * digestTime, or 08:00 local time.
 *
 * Netlify schedule config in netlify.toml:
 *   [functions."pipeline-alerts"]
 *   schedule = "0 * * * *"   ← changed from "0 8 * * *" to run hourly
 *
 * Signal types evaluated:
 *   stale       - no activity in 14+ days
 *   stuck       - days in stage >= 2x historical average (or 21d fallback)
 *   lapsed      - forecasted close date has passed
 *   velocity    - 2+ stages in 14 days (positive alert)
 *   scoreDrop   - AI score dropped below 40
 */

import { db } from '../../db/index.js';
import { opportunities, activities, users, recommendationLog } from '../../db/schema.js';
import { eq, and, gte } from 'drizzle-orm';
import { sendEmail, emailTemplates } from './send-email.mjs';
import { sendSms, smsTemplates, normalizePhone } from './send-sms.mjs';

const DEDUP_DAYS = 7;
const today = new Date();
const todayStr = today.toISOString().split('T')[0];

// ── Default prefs ─────────────────────────────────────────────────────────────
const DEFAULT_PREFS = {
    dealSilent:    { enabled: true  },
    dealStuck:     { enabled: true  },
    closeLapsed:   { enabled: true  },
    dealMomentum:  { enabled: true  },
    managerAlerts: { enabled: true  },
    scoreDropAlert: { enabled: true  },
};

function wantsAlert(resolvedProfile, alertType) {
    const prefs = profile?.notificationPrefs || {};
    const pref  = prefs[alertType] ?? DEFAULT_PREFS[alertType] ?? { enabled: false };
    return pref.enabled === true;
}

/**
 * Returns true if the user has SMS enabled globally AND for pipeline alerts.
 * Reads from profile.smsNotifications (stored on user.profile in the DB).
 *
 * Expected shape:
 *   profile.smsNotifications = {
 *     enabled: true,
 *     pipelineAlerts: true,
 *     taskReminders: true,
 *     digest: true,
 *   }
 */
function wantsSms(resolvedProfile) {
    const smsPrefs = profile?.smsNotifications || {};
    return smsPrefs.enabled === true && smsPrefs.pipelineAlerts === true;
}

// Fire-and-forget SMS — never throws, just logs. Always used alongside email.
async function trySendSms(to, body, label) {
    try {
        const phone = normalizePhone(to);
        if (!phone) { console.warn(`pipeline-alerts SMS: invalid phone for ${label}`); return; }
        await sendSms({ to: phone, body });
        console.log(`SMS sent → ${phone} (${label})`);
    } catch (err) {
        console.error(`pipeline-alerts SMS error (${label}):`, err.message);
    }
}

// ── Timezone helper (mirrors digest.mjs) ─────────────────────────────────────
/**
 * Convert a user's local hour to UTC for cron comparison.
 * Uses Intl.DateTimeFormat to compute the current UTC-local offset,
 * then applies it to the desired local hour.
 */
function localHourToUtc(localHour, timezone) {
    try {
        const now = new Date();

        const localFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            hour: 'numeric',
            hour12: false,
        });
        const rawLocal = parseInt(localFormatter.format(now), 10);
        const currentLocalHour = rawLocal === 24 ? 0 : rawLocal;
        const currentUtcHour = now.getUTCHours();

        // UTC offset = how many hours ahead UTC is relative to local time
        const utcOffsetHours = ((currentUtcHour - currentLocalHour) + 24) % 24;
        const targetUtcHour = (localHour + utcOffsetHours) % 24;

        console.log(`pipeline-alerts: timezone=${timezone} localHour=${localHour} offset=${utcOffsetHours} → targetUTC=${targetUtcHour}`);
        return targetUtcHour;
    } catch (err) {
        console.warn(`pipeline-alerts: unrecognized timezone "${timezone}", treating as UTC. Error: ${err.message}`);
        return localHour;
    }
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function daysSince(dateStr) {
    if (!dateStr) return null;
    return Math.floor((today - new Date(dateStr + 'T12:00:00')) / 86400000);
}

function daysBetween(a, b) {
    return Math.floor((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

// Build avg days per stage from Closed Won stageHistory
function buildAvgDaysInStage(allOpps) {
    const map = {};
    allOpps
        .filter(o => o.stage === 'Closed Won' && Array.isArray(o.stageHistory) && o.stageHistory.length > 0)
        .forEach(o => {
            o.stageHistory.forEach((h, i) => {
                const from = i === 0 ? o.createdDate : o.stageHistory[i - 1]?.date;
                if (!from || !h.date) return;
                const stageName = h.prevStage || h.stage;
                if (!map[stageName]) map[stageName] = [];
                map[stageName].push(daysBetween(from, h.date));
            });
        });
    const result = {};
    Object.entries(map).forEach(([s, arr]) => {
        result[s] = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    });
    return result;
}

// Check if this deal+signal was already alerted recently
async function wasRecentlyAlerted(orgId, repName, opportunityId, actionType) {
    const since = new Date(today.getTime() - DEDUP_DAYS * 86400000);
    try {
        const rows = await db.select({ id: recommendationLog.id })
            .from(recommendationLog)
            .where(and(
                eq(recommendationLog.orgId, orgId),
                eq(recommendationLog.repName, repName),
                eq(recommendationLog.opportunityId, opportunityId),
                eq(recommendationLog.actionType, actionType),
                gte(recommendationLog.dismissedAt, since),
            ))
            .limit(1);
        return rows.length > 0;
    } catch {
        return false; // fail open — better to send than silently skip
    }
}

// Log the alert so resolution tracking works automatically
async function logAlert(orgId, repName, actionType, opp, signal) {
    try {
        await db.insert(recommendationLog).values({
            id:            `pal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            orgId,
            repName,
            actionType,
            opportunityId: opp.id,
            dealName:      opp.opportunityName || opp.account || 'Unnamed deal',
            arrAtRisk:     opp.arr ?? null,
            stage:         opp.stage,
            signal,
            outcome:       'pending',
            dismissedAt:   new Date(),
        });
    } catch (err) {
        console.error('pipeline-alerts: logAlert failed:', err.message);
    }
}

// ── Main handler ──────────────────────────────────────────────────────────────
export const handler = async () => {
    const now     = new Date();
    const nowHour = now.getUTCHours();
    console.log('pipeline-alerts: starting at', now.toISOString(), `(UTC hour ${nowHour})`);

    try {
        const allUsers = await db.select().from(users);
        const allOpps  = await db.select().from(opportunities);
        const allActs  = await db.select().from(activities);

        const avgDaysInStage = buildAvgDaysInStage(allOpps);

        // Build lookup maps
        const userByName = {};
        allUsers.forEach(u => { userByName[u.name] = u; });

        // Manager lookup: repName → manager (by managedReps array, then by team fallback)
        const managerByRep  = {};
        const managerByTeam = {};
        allUsers.forEach(u => {
            if (u.role === 'Manager' && u.team) managerByTeam[u.team] = u;
            (u.profile?.managedReps || []).forEach(rep => { managerByRep[rep] = u; });
        });

        const activeOpps = allOpps.filter(o =>
            o.stage !== 'Closed Won' && o.stage !== 'Closed Lost' && o.salesRep
        );

        let emailsSent = 0;
        let smsSent    = 0;
        let skipped    = 0;

        for (const opp of activeOpps) {
            const repName = opp.salesRep;
            const repUser = userByName[repName];
            if (!repUser?.email || !repUser.active) continue;

            const orgId   = opp.orgId;
            // Cross-tenant safety: skip if the matched user belongs to a different org
            if (repUser.orgId && repUser.orgId !== orgId) continue;

            // AppHeader.saveProfile saves these fields flat on the user row (top-level),
            // not nested inside user.profile. Read top-level first, fall back to
            // user.profile for any older records that may have nested values.
            const profile           = repUser.profile || {};
            const userTz            = repUser.timezone          || profile.timezone          || 'UTC';
            const alertTimeStr      = repUser.alertTime          || repUser.digestTime        || profile.alertTime || profile.digestTime || '08:00';
            const smsNotifications  = repUser.smsNotifications  || profile.smsNotifications  || {};
            const notificationPrefs = repUser.notificationPrefs || profile.notificationPrefs || {};
            const mobile            = repUser.mobile            || profile.mobile            || null;
            const phone             = repUser.phone             || profile.phone             || null;

            // Normalized profile for wantsAlert/wantsSms helpers
            const resolvedProfile = {
                ...profile,
                timezone: userTz,
                smsNotifications,
                notificationPrefs,
                mobile,
                phone,
            };
            const [alertHour]  = alertTimeStr.split(':').map(Number);
            const targetUtcHour = localHourToUtc(alertHour, userTz);
            if (targetUtcHour !== nowHour) continue;

            const arr      = parseFloat(opp.arr) || 0;
            const name     = opp.opportunityName || opp.account || 'Unnamed deal';
            const manager  = managerByRep[repName] || (repUser.team ? managerByTeam[repUser.team] : null);
            const smsPhone = mobile || phone || null;

            const oppActs = allActs
                .filter(a => a.opportunityId === opp.id)
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            const lastActDate    = oppActs[0]?.date || opp.createdDate;
            const daysSilent     = daysSince(lastActDate);
            const daysInStage    = daysSince(opp.stageChangedDate || opp.createdDate);
            const avgForStage    = avgDaysInStage[opp.stage] || null;
            const stuckThreshold = avgForStage ? avgForStage * 2 : 21;
            const daysLapsed     = opp.forecastedCloseDate
                ? -daysBetween(todayStr, opp.forecastedCloseDate)
                : null;
            const createdDays    = daysSince(opp.createdDate);
            const stageCount     = (opp.stageHistory || []).length;

            // ── Signal 1: Silent deal (14+ days no activity) ──────────────────
            if (daysSilent !== null && daysSilent >= 14 && wantsAlert(resolvedProfile, 'dealSilent')) {
                const alerted = await wasRecentlyAlerted(orgId, repName, opp.id, 'stale');
                if (!alerted) {
                    try {
                        await sendEmail({
                            to: repUser.email,
                            ...emailTemplates.dealSilent({ repName, dealName: name, account: opp.account, arr, stage: opp.stage, daysSilent, opportunityId: opp.id }),
                        });
                        emailsSent++;
                        if (wantsSms(resolvedProfile) && smsPhone) {
                            await trySendSms(smsPhone, smsTemplates.dealSilent({ dealName: name, daysSilent }), `dealSilent/${repName}`);
                            smsSent++;
                        }
                        await logAlert(orgId, repName, 'stale', opp, `No activity in ${daysSilent} days`);
                        console.log(`dealSilent → ${repUser.email} (${name}, ${daysSilent}d)`);

                        // Manager copy for very stale (21+ days)
                        if (daysSilent >= 21 && manager?.email && wantsAlert(manager.profile || {}, 'managerAlerts')) {
                            await sendEmail({
                                to: manager.email,
                                ...emailTemplates.managerDealAlert({ managerName: manager.name, repName, dealName: name, account: opp.account, arr, stage: opp.stage, alertType: 'silent', detail: `No activity in ${daysSilent} days`, opportunityId: opp.id }),
                            });
                            emailsSent++;
                            if (wantsSms(manager.profile || {})) {
                                const mgPhone = (manager.profile || {}).mobile || (manager.profile || {}).phone;
                                if (mgPhone) {
                                    await trySendSms(mgPhone, smsTemplates.managerDealAlert({ repName, dealName: name, alertType: 'silent' }), `managerAlert-silent/${manager.name}`);
                                    smsSent++;
                                }
                            }
                        }
                    } catch (err) {
                        console.error(`dealSilent error (${name}):`, err.message);
                    }
                } else { skipped++; }
            }

            // ── Signal 2: Stuck in stage ──────────────────────────────────────
            if (daysInStage !== null && daysInStage >= stuckThreshold && daysInStage >= 14 && wantsAlert(resolvedProfile, 'dealStuck')) {
                const alerted = await wasRecentlyAlerted(orgId, repName, opp.id, 'stuck');
                if (!alerted) {
                    try {
                        await sendEmail({
                            to: repUser.email,
                            ...emailTemplates.dealStuck({ repName, dealName: name, account: opp.account, arr, stage: opp.stage, daysInStage, avgDays: avgForStage, opportunityId: opp.id }),
                        });
                        emailsSent++;
                        if (wantsSms(resolvedProfile) && smsPhone) {
                            await trySendSms(smsPhone, smsTemplates.dealStuck({ dealName: name, stage: opp.stage, daysInStage }), `dealStuck/${repName}`);
                            smsSent++;
                        }
                        await logAlert(orgId, repName, 'stuck', opp, `${daysInStage} days in ${opp.stage}${avgForStage ? ` (avg ${avgForStage}d)` : ''}`);
                        console.log(`dealStuck → ${repUser.email} (${name}, ${daysInStage}d)`);

                        // Manager copy if 3× over average
                        const veryStuck = avgForStage ? daysInStage >= avgForStage * 3 : daysInStage >= 30;
                        if (veryStuck && manager?.email && wantsAlert(manager.profile || {}, 'managerAlerts')) {
                            await sendEmail({
                                to: manager.email,
                                ...emailTemplates.managerDealAlert({ managerName: manager.name, repName, dealName: name, account: opp.account, arr, stage: opp.stage, alertType: 'stuck', detail: `${daysInStage} days in ${opp.stage}${avgForStage ? ` (avg ${avgForStage}d)` : ''}`, opportunityId: opp.id }),
                            });
                            emailsSent++;
                            if (wantsSms(manager.profile || {})) {
                                const mgPhone = (manager.profile || {}).mobile || (manager.profile || {}).phone;
                                if (mgPhone) {
                                    await trySendSms(mgPhone, smsTemplates.managerDealAlert({ repName, dealName: name, alertType: 'stuck' }), `managerAlert-stuck/${manager.name}`);
                                    smsSent++;
                                }
                            }
                        }
                    } catch (err) {
                        console.error(`dealStuck error (${name}):`, err.message);
                    }
                } else { skipped++; }
            }

            // ── Signal 3: Close date lapsed ───────────────────────────────────
            if (daysLapsed !== null && daysLapsed > 0 && wantsAlert(resolvedProfile, 'closeLapsed')) {
                const alerted = await wasRecentlyAlerted(orgId, repName, opp.id, 'lapsed');
                if (!alerted) {
                    try {
                        await sendEmail({
                            to: repUser.email,
                            ...emailTemplates.closeDateLapsed({ repName, dealName: name, account: opp.account, arr, stage: opp.stage, daysLapsed, originalCloseDate: opp.forecastedCloseDate, opportunityId: opp.id }),
                        });
                        emailsSent++;
                        if (wantsSms(resolvedProfile) && smsPhone) {
                            await trySendSms(smsPhone, smsTemplates.closeDateLapsed({ dealName: name, daysLapsed }), `closeLapsed/${repName}`);
                            smsSent++;
                        }
                        await logAlert(orgId, repName, 'lapsed', opp, `Close date ${opp.forecastedCloseDate} passed ${daysLapsed} days ago`);
                        console.log(`closeLapsed → ${repUser.email} (${name}, ${daysLapsed}d overdue)`);

                        // Always CC manager on lapsed close date
                        if (manager?.email && wantsAlert(manager.profile || {}, 'managerAlerts')) {
                            await sendEmail({
                                to: manager.email,
                                ...emailTemplates.managerDealAlert({ managerName: manager.name, repName, dealName: name, account: opp.account, arr, stage: opp.stage, alertType: 'lapsed', detail: `Close date ${opp.forecastedCloseDate} passed ${daysLapsed} days ago`, opportunityId: opp.id }),
                            });
                            emailsSent++;
                            if (wantsSms(manager.profile || {})) {
                                const mgPhone = (manager.profile || {}).mobile || (manager.profile || {}).phone;
                                if (mgPhone) {
                                    await trySendSms(mgPhone, smsTemplates.managerDealAlert({ repName, dealName: name, alertType: 'lapsed' }), `managerAlert-lapsed/${manager.name}`);
                                    smsSent++;
                                }
                            }
                        }
                    } catch (err) {
                        console.error(`closeLapsed error (${name}):`, err.message);
                    }
                } else { skipped++; }
            }

            // ── Signal 4: High-velocity deal (positive) ───────────────────────
            if (
                createdDays !== null && createdDays <= 14 && stageCount >= 2 &&
                !['Negotiation/Review', 'Contracts', 'Closed Won', 'Closed Lost'].includes(opp.stage) &&
                wantsAlert(resolvedProfile, 'dealMomentum')
            ) {
                const alerted = await wasRecentlyAlerted(orgId, repName, opp.id, 'velocity');
                if (!alerted) {
                    try {
                        await sendEmail({
                            to: repUser.email,
                            ...emailTemplates.dealMomentum({ repName, dealName: name, account: opp.account, arr, stage: opp.stage, stageCount, daysSinceCreated: createdDays, opportunityId: opp.id }),
                        });
                        emailsSent++;
                        await logAlert(orgId, repName, 'velocity', opp, `${stageCount} stages in ${createdDays} days`);
                        console.log(`dealMomentum → ${repUser.email} (${name})`);
                    } catch (err) {
                        console.error(`dealMomentum error (${name}):`, err.message);
                    }
                } else { skipped++; }
            }

            // ── Signal 5: AI score dropped below threshold ──────────────────────
            if (
                opp.aiScore?.score !== undefined &&
                opp.aiScore.score < 40 &&
                wantsAlert(resolvedProfile, 'scoreDropAlert')
            ) {
                const alerted = await wasRecentlyAlerted(orgId, repName, opp.id, 'scoreDrop');
                if (!alerted) {
                    try {
                        const verdictLabel = opp.aiScore.verdict || 'At Risk';
                        const headline = opp.aiScore.headline || 'Deal health has declined';
                        await sendEmail({
                            to: repUser.email,
                            subject: `⚠️ AI Score Alert: ${name} scored ${opp.aiScore.score}/100 (${verdictLabel})`,
                            html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><style>
                                body{margin:0;padding:0;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a2e}
                                .wrapper{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
                                .header{background:#1a1a2e;padding:24px 32px}.header-title{color:#fff;font-size:16px;font-weight:600;margin:0}
                                .body{padding:32px}.body h2{font-size:20px;font-weight:700;margin:0 0 8px;color:#1a1a2e}
                                .body p{font-size:14px;line-height:1.6;color:#4a4a6a;margin:0 0 16px}
                                .score-box{background:#FCEBEB;border:1px solid #F7C1C1;border-radius:8px;padding:16px 20px;margin:16px 0;display:flex;align-items:center;gap:16px}
                                .score-num{font-size:36px;font-weight:800;color:#A32D2D;line-height:1}
                                .score-detail{flex:1}
                                .score-verdict{font-size:14px;font-weight:700;color:#A32D2D}
                                .score-headline{font-size:13px;color:#633806;margin-top:4px}
                                .btn{display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-size:14px;font-weight:600;margin-top:8px}
                                .footer{background:#f4f6f8;padding:16px 32px;border-top:1px solid #e5e7eb;font-size:11px;color:#8b92a9;text-align:center}
                                .footer a{color:#3b82f6;text-decoration:none}
                            </style></head><body><div class="wrapper">
                                <div class="header"><p class="header-title">Accelerep — AI Score Alert</p></div>
                                <div class="body">
                                    <h2>Deal health warning: ${name}</h2>
                                    <p>Hi ${repName}, your deal <strong>${name}</strong> (${opp.account}) has been scored below the attention threshold.</p>
                                    <div class="score-box">
                                        <div class="score-num">${opp.aiScore.score}</div>
                                        <div class="score-detail">
                                            <div class="score-verdict">${verdictLabel}</div>
                                            <div class="score-headline">${headline}</div>
                                        </div>
                                    </div>
                                    <p>Stage: ${opp.stage} · ARR: ${Math.round(arr).toLocaleString()}</p>
                                    <a class="btn" href="${process.env.APP_URL || 'https://salespipelinetracker.com'}">Review this deal →</a>
                                </div>
                                <div class="footer"><p>AI Score Alert · <a href="${process.env.APP_URL || 'https://salespipelinetracker.com'}/settings">Manage preferences</a></p></div>
                            </div></body></html>`,
                        });
                        emailsSent++;
                        await logAlert(orgId, repName, 'scoreDrop', opp, `AI score ${opp.aiScore.score} (${verdictLabel})`);
                        console.log(`scoreDropAlert → ${repUser.email} (${name}, score ${opp.aiScore.score})`);

                        // Escalate to manager if Critical
                        if (opp.aiScore.score < 25 && manager?.email && wantsAlert(manager.profile || {}, 'managerAlerts')) {
                            await sendEmail({
                                to: manager.email,
                                ...emailTemplates.managerDealAlert({ managerName: manager.name, repName, dealName: name, account: opp.account, arr, stage: opp.stage, alertType: 'score-critical', detail: `AI score ${opp.aiScore.score}/100 — ${verdictLabel}: ${headline}`, opportunityId: opp.id }),
                            });
                            emailsSent++;
                        }
                    } catch (err) {
                        console.error(`scoreDropAlert error (${name}):`, err.message);
                    }
                } else { skipped++; }
            }

        } // end for loop

        const summary = `${emailsSent} emails sent, ${smsSent} SMS sent, ${skipped} skipped (dedup)`;
        console.log('pipeline-alerts: complete —', summary);
        return { statusCode: 200, body: JSON.stringify({ emailsSent, smsSent, skipped }) };

    } catch (err) {
        console.error('pipeline-alerts: fatal error:', err.message);
        return { statusCode: 500, body: err.message };
    }
};
