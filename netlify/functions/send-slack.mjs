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
 */

import { db }      from '../../db/index.js';
import { settings } from '../../db/schema.js';
import { eq }      from 'drizzle-orm';

// ── Core send function ────────────────────────────────────────────────────────
/**
 * Post a message to a Slack Incoming Webhook.
 * @param {{ webhookUrl: string, text: string, blocks?: object[] }} opts
 */
export async function sendSlack({ webhookUrl, text, blocks }) {
    if (!webhookUrl) throw new Error('sendSlack: webhookUrl is required');

    const payload = { text, ...(blocks ? { blocks } : {}) };

    const res = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
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
export async function sendSlackToOrg(orgId, { text, blocks }) {
    try {
        const rows = await db.select().from(settings).where(eq(settings.orgId, orgId));
        if (!rows.length) return false;

        const slackConfig = rows[0].extra?.slackConfig || {};
        const webhookUrl  = slackConfig.webhookUrl;
        const enabled     = slackConfig.enabled !== false; // default true if configured

        if (!webhookUrl || !enabled) return false;

        await sendSlack({ webhookUrl, text, blocks });
        return true;
    } catch (err) {
        console.error('sendSlackToOrg error:', err.message);
        return false;
    }
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
import { verifyAuth } from './auth.mjs';

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

    try {
        const { type, webhookUrl, text, blocks } = JSON.parse(event.body || '{}');

        // If explicit webhookUrl provided (e.g. testing a new config), use it directly
        const url = webhookUrl || null;
        if (url) {
            await sendSlack({ webhookUrl: url, text: text || slackTemplates.test({}).text, blocks });
        } else {
            // Otherwise look up the org's stored webhook
            const sent = await sendSlackToOrg(orgId, { text: text || slackTemplates.test({}).text, blocks });
            if (!sent) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: 'Slack is not configured for this workspace' }) };
        }

        return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true }) };
    } catch (err) {
        console.error('send-slack handler error:', err.message);
        return { statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: err.message }) };
    }
};
