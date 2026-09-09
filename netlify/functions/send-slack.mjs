/**
 * send-slack.mjs
 * Shared Slack notification utility — all Slack messages flow through this.
 *
 * Uses Slack Incoming Webhooks — no OAuth required.
 * The webhook URL is stored per-org in settings.extra.slackConfig.webhookUrl.
 *
 * Setup:
 *   1. Go to api.slack.com/apps → Create App → Incoming Webhooks
 *   2. Enable Incoming Webhooks, click "Add New Webhook to Workspace"
 *   3. Choose a channel, copy the Webhook URL
 *   4. Save it in Accelerep: Settings → Integrations → Connected Apps → Slack → Configure
 *
 * Usage from other Netlify functions:
 *   import { sendSlack, slackTemplates } from './send-slack.mjs';
 *
 *   await sendSlack({
 *     webhookUrl: org.slackWebhookUrl,
 *     ...slackTemplates.dealSilent({ repName: 'Jane', dealName: 'Acme Corp', daysSilent: 15 })
 *   });
 *
 * Or use sendSlackToOrg() which reads the webhook URL from the org settings automatically.
 *
 * Gate (state §0.92, handoff item 25): the handler is Admin-only, and every URL
 * this module POSTs to — typed into the test, or stored by an Admin — must be
 * a Slack Incoming Webhook (_slackWebhook.mjs). Before: verifyAuth alone, and
 * the server would POST to any URL a signed-in user put in the body.
 */

import { db }      from '../../db/index.js';
import { settings } from '../../db/schema.js';
import { eq }      from 'drizzle-orm';
import { serverErrorBody } from './_lib.mjs';
import { validateSlackWebhookUrl } from './_slackWebhook.mjs';
import { slackAlertEnabled, dealSlackEvents } from '../../src/utils/slackAlerts.js';

// ── Core send function ────────────────────────────────────────────────────────
/**
 * Post a message to a Slack Incoming Webhook.
 * @param {{ webhookUrl: string, text: string, blocks?: object[] }} opts
 */
export async function sendSlack({ webhookUrl, text, blocks }) {
    if (!webhookUrl) throw new Error('sendSlack: webhookUrl is required');
    // Fail closed on the destination itself, so a stored URL that is not Slack
    // (saved before §0.92, or by hand) is refused here too — sendSlackToOrg
    // logs and returns false, the alert is skipped, nothing leaves the server.
    const checked = validateSlackWebhookUrl(webhookUrl);
    if (!checked.ok) throw new Error('sendSlack: ' + checked.error);

    const payload = { text, ...(blocks ? { blocks } : {}) };

    // Four seconds, like the audit stream: an event post now sits inside the
    // deal save (state §0.99), and a hung Slack must not hang the save.
    const res = await fetch(checked.value, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(4000),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Slack webhook returned ${res.status}: ${body}`);
    }

    return { success: true };
}

// ── Org-aware send — reads webhook URL from settings automatically ─────────────
/**
 * Look up the org's Slack webhook URL from settings, then send.
 * Returns false silently if Slack is not configured for this org.
 * Never throws — Slack is always supplementary to email.
 */
export async function sendSlackToOrg(orgId, { text, blocks }, alertType) {
    try {
        const rows = await db.select().from(settings).where(eq(settings.orgId, orgId));
        if (!rows.length) return false;

        const slackConfig = rows[0].extra?.slackConfig || {};
        const webhookUrl  = slackConfig.webhookUrl;
        const enabled     = slackConfig.enabled !== false; // default true if configured

        if (!webhookUrl || !enabled) return false;
        // The org's own selection (state §0.96, item 29): a pipeline alert the
        // Admin unticked in Configure Slack posts nowhere. No alertType (the
        // digest, the test) is not gated; a config with no `alerts` posts all.
        if (!slackAlertEnabled(slackConfig, alertType)) return false;

        await sendSlack({ webhookUrl, text, blocks });
        return true;
    } catch (err) {
        console.error('sendSlackToOrg error:', err.message);
        return false;
    }
}

// ── Event posts from a deal save (state §0.99, handoff item 33) ───────────────
/**
 * Post what a deal save changed — a stage change, or a win — the moment it
 * happens, per the org's own selection (slackConfig.alerts). Jeff: the
 * company decides what posts; a rep's preferences never gate it. Never throws;
 * returns the types that posted. `before` may be null for a create.
 */
export async function postDealEvents(orgId, { before, after, mover } = {}) {
    const posted = [];
    for (const ev of dealSlackEvents({ before, after })) {
        const ctx = { mover: mover || after?.salesRep || 'Someone', repName: after?.salesRep || '—', dealName: after?.opportunityName || after?.account || 'Unnamed deal', account: after?.account || '—', arr: after?.arr, fromStage: ev.from, toStage: ev.to };
        const msg = ev.type === 'dealClosedWon' ? slackTemplates.dealWon(ctx) : slackTemplates.stageChanged(ctx);
        if (await sendSlackToOrg(orgId, msg, ev.type)) posted.push(ev.type);
    }
    return posted;
}

// ── One summary post for a bulk stage move (state §0.106) ─────────────────────
/**
 * A CSV import that moved deals posts ONE line — how many moved, into which
 * stages, by whom — under the org's 'stageChanged' switch, never one post per
 * deal (a 200-deal import would flood the channel). Nothing posts when nothing
 * moved. Never throws; returns whether it posted.
 */
export async function postBulkStageMove(orgId, { summary, total, mover } = {}) {
    if (!summary || !(summary.moved > 0)) return false;
    return sendSlackToOrg(orgId, slackTemplates.bulkStageMoved({ mover: mover || 'Someone', total: total || summary.moved, ...summary }), 'stageChanged');
}

// ── Message templates ─────────────────────────────────────────────────────────
const APP_URL = process.env.APP_URL || process.env.URL || 'https://salespipelinetracker.com';

const fmtArr = (v) => {
    const n = parseFloat(v) || 0;
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n.toLocaleString();
};

export const slackTemplates = {

    // Deal has gone silent (no activity in 14+ days)
    dealSilent: ({ repName, dealName, account, arr, stage, daysSilent }) => ({
        text: `⚠️ *${dealName}* has gone silent — ${daysSilent} days without activity`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `⚠️ *Deal silent alert*\n*${dealName}* (${account}) — ${daysSilent} days without activity`,
                },
            },
            {
                type: 'context',
                elements: [
                    { type: 'mrkdwn', text: `Rep: *${repName}* · Stage: *${stage}* · ARR: *${fmtArr(arr)}*` },
                ],
            },
            {
                type: 'actions',
                elements: [
                    { type: 'button', text: { type: 'plain_text', text: 'View deal →' }, url: APP_URL, action_id: 'view_deal' },
                ],
            },
        ],
    }),

    // Deal stuck in stage
    dealStuck: ({ repName, dealName, account, arr, stage, daysInStage, avgDays }) => ({
        text: `🚧 *${dealName}* has been stuck in ${stage} for ${daysInStage} days`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `🚧 *Deal stuck in stage*\n*${dealName}* (${account}) — ${daysInStage} days in *${stage}*${avgDays ? ` (avg ${avgDays}d)` : ''}`,
                },
            },
            {
                type: 'context',
                elements: [
                    { type: 'mrkdwn', text: `Rep: *${repName}* · ARR: *${fmtArr(arr)}*` },
                ],
            },
            {
                type: 'actions',
                elements: [
                    { type: 'button', text: { type: 'plain_text', text: 'View deal →' }, url: APP_URL, action_id: 'view_deal' },
                ],
            },
        ],
    }),

    // Close date has passed
    closeDateLapsed: ({ repName, dealName, account, arr, stage, daysLapsed, originalCloseDate }) => ({
        text: `🔴 *${dealName}* close date passed ${daysLapsed} day${daysLapsed !== 1 ? 's' : ''} ago`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `🔴 *Close date lapsed*\n*${dealName}* (${account}) — close date ${originalCloseDate} passed *${daysLapsed} day${daysLapsed !== 1 ? 's' : ''} ago*`,
                },
            },
            {
                type: 'context',
                elements: [
                    { type: 'mrkdwn', text: `Rep: *${repName}* · Stage: *${stage}* · ARR: *${fmtArr(arr)}*` },
                ],
            },
            {
                type: 'actions',
                elements: [
                    { type: 'button', text: { type: 'plain_text', text: 'Update close date →' }, url: APP_URL, action_id: 'view_deal' },
                ],
            },
        ],
    }),

    // Deal moving fast (positive)
    dealMomentum: ({ repName, dealName, account, arr, stage, stageCount, daysSinceCreated }) => ({
        text: `🚀 *${dealName}* is moving fast — ${stageCount} stages in ${daysSinceCreated} days`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `🚀 *High-velocity deal*\n*${dealName}* (${account}) — ${stageCount} stages advanced in just ${daysSinceCreated} days`,
                },
            },
            {
                type: 'context',
                elements: [
                    { type: 'mrkdwn', text: `Rep: *${repName}* · Stage: *${stage}* · ARR: *${fmtArr(arr)}*` },
                ],
            },
        ],
    }),

    // AI score dropped
    scoreDrop: ({ repName, dealName, account, arr, stage, score, verdict }) => ({
        text: `⚠️ *${dealName}* AI score dropped to ${score}/100 (${verdict})`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `⚠️ *AI score alert*\n*${dealName}* (${account}) scored *${score}/100* — ${verdict}`,
                },
            },
            {
                type: 'context',
                elements: [
                    { type: 'mrkdwn', text: `Rep: *${repName}* · Stage: *${stage}* · ARR: *${fmtArr(arr)}*` },
                ],
            },
            {
                type: 'actions',
                elements: [
                    { type: 'button', text: { type: 'plain_text', text: 'Review deal →' }, url: APP_URL, action_id: 'view_deal' },
                ],
            },
        ],
    }),

    // A bulk stage move — one line for the batch (state §0.106)
    bulkStageMoved: ({ mover, moved, won, total, byStage }) => {
        const where = (byStage || []).map(s => `*${s.n}* → ${s.to}`).join(' · ');
        return {
            text: `➡️ *${moved} deal${moved === 1 ? '' : 's'}* moved stage in an import by ${mover}${won ? ` · 🏆 ${won} closed won` : ''}`,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `➡️ *Stages moved in bulk*\n*${moved}* of ${total} imported deal${total === 1 ? '' : 's'} changed stage${where ? ` — ${where}` : ''}${won ? `\n🏆 *${won}* closed won` : ''}`,
                    },
                },
                {
                    type: 'context',
                    elements: [
                        { type: 'mrkdwn', text: `Imported by *${mover}*` },
                    ],
                },
                {
                    type: 'actions',
                    elements: [
                        { type: 'button', text: { type: 'plain_text', text: 'View pipeline →' }, url: APP_URL, action_id: 'view_pipeline' },
                    ],
                },
            ],
        };
    },

    // A deal changed stage — posted from the save (state §0.99)
    stageChanged: ({ mover, repName, dealName, account, arr, fromStage, toStage }) => ({
        text: `➡️ *${dealName}* moved to ${toStage}${fromStage ? ` (from ${fromStage})` : ''}`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `➡️ *Stage changed*\n*${dealName}* (${account}) — ${fromStage ? `*${fromStage}* → ` : ''}*${toStage}*`,
                },
            },
            {
                type: 'context',
                elements: [
                    { type: 'mrkdwn', text: `Moved by *${mover}* · Rep: *${repName}* · ARR: *${fmtArr(arr)}*` },
                ],
            },
            {
                type: 'actions',
                elements: [
                    { type: 'button', text: { type: 'plain_text', text: 'View deal →' }, url: APP_URL, action_id: 'view_deal' },
                ],
            },
        ],
    }),

    // A deal was won — posted from the save (state §0.99)
    dealWon: ({ mover, repName, dealName, account, arr, fromStage }) => ({
        text: `🏆 *${dealName}* closed won — ${fmtArr(arr)} ARR (${repName})`,
        blocks: [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `🏆 *Closed Won*\n*${dealName}* (${account}) — *${fmtArr(arr)}* ARR${fromStage ? ` · from ${fromStage}` : ''}`,
                },
            },
            {
                type: 'context',
                elements: [
                    { type: 'mrkdwn', text: `Rep: *${repName}* · Closed by *${mover}*` },
                ],
            },
            {
                type: 'actions',
                elements: [
                    { type: 'button', text: { type: 'plain_text', text: 'View deal →' }, url: APP_URL, action_id: 'view_deal' },
                ],
            },
        ],
    }),

    // Daily/weekly digest summary
    digest: ({ teamName, totalPipeline, repCount, atRiskCount, weekActivities, topDeals }) => ({
        text: `📊 Pipeline digest — ${totalPipeline} total pipeline across ${repCount} rep${repCount !== 1 ? 's' : ''}`,
        blocks: [
            {
                type: 'header',
                text: { type: 'plain_text', text: `📊 ${teamName || 'Team'} Pipeline Digest` },
            },
            {
                type: 'section',
                fields: [
                    { type: 'mrkdwn', text: `*Total pipeline*\n${totalPipeline}` },
                    { type: 'mrkdwn', text: `*Reps tracked*\n${repCount}` },
                    { type: 'mrkdwn', text: `*Need attention*\n${atRiskCount > 0 ? `⚠️ ${atRiskCount}` : '✅ 0'}` },
                    { type: 'mrkdwn', text: `*Activities this week*\n${weekActivities}` },
                ],
            },
            ...(topDeals && topDeals.length > 0 ? [{
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Top deals*\n${topDeals.slice(0, 3).map(d => `• ${d.name} — ${d.arr} (${d.stage})`).join('\n')}`,
                },
            }] : []),
            {
                type: 'actions',
                elements: [
                    { type: 'button', text: { type: 'plain_text', text: 'Open Sales Manager →' }, url: APP_URL, action_id: 'view_pipeline' },
                ],
            },
        ],
    }),

    // Test message (used by Connected Apps → Test connection)
    test: ({ orgName }) => ({
        text: `✅ Accelerep is connected to Slack${orgName ? ` for *${orgName}*` : ''}. Pipeline alerts and digests will post here.`,
    }),
};

// ── HTTP handler — POST /.netlify/functions/send-slack ────────────────────────
// Allows the frontend to send a test message or trigger ad-hoc Slack posts.
import { verifyAuth, requireRole } from './auth.mjs';

const HEADERS = {
    'Content-Type':                 'application/json',
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: HEADERS, body: '' };
    if (event.httpMethod !== 'POST') return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };

    const auth = await verifyAuth(event);
    if (auth.error) return { statusCode: auth.status || 401, headers: HEADERS, body: JSON.stringify({ error: auth.error }) };
    const { orgId } = auth;
    // Admin-only: the only client caller is the Configure Slack modal, which
    // only an Admin can open; the endpoint had trusted membership alone (§0.92).
    const forbidden = requireRole(auth, ['Admin'], HEADERS);
    if (forbidden) return forbidden;

    try {
        const { type, webhookUrl, text, blocks } = JSON.parse(event.body || '{}');

        // If explicit webhookUrl provided (e.g. testing a new config), use it directly
        const url = webhookUrl || null;
        if (url) {
            const checked = validateSlackWebhookUrl(url);
            if (!checked.ok) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: checked.error }) };
            await sendSlack({ webhookUrl: url, text: text || slackTemplates.test({}).text, blocks });
        } else {
            // Otherwise look up the org's stored webhook
            const sent = await sendSlackToOrg(orgId, { text: text || slackTemplates.test({}).text, blocks });
            if (!sent) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Slack is not configured for this workspace' }) };
        }

        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    } catch (err) {
        console.error('send-slack handler error:', err.message);
        return { statusCode: 500, headers: HEADERS, body: serverErrorBody(err, 'send-slack') };
    }
};
