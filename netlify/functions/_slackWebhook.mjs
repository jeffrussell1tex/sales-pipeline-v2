// _slackWebhook.mjs — the pure half of Slack delivery (state §0.92, handoff item 25).
//
// send-slack.mjs POSTs to a URL: the one typed into the Configure Slack modal's
// "Send test message", or the one an Admin saved that every pipeline alert
// reads. Until §0.92 neither was checked — any signed-in user could make the
// server POST a message to any URL on the internet, or to whatever sits beside
// the function. A Slack Incoming Webhook has exactly one shape, and this pins
// it: https, hooks.slack.com, a /services/ path, no credentials, no port.
// Reachable by `node --test` without a database, like _auditPayload.mjs.
export const SLACK_WEBHOOK_HOST = 'hooks.slack.com';
export const SLACK_WEBHOOK_PATH = '/services/';
const SHAPE = `https://${SLACK_WEBHOOK_HOST}${SLACK_WEBHOOK_PATH}…`;
const NOT_SLACK = `Webhook URL must be a Slack Incoming Webhook (${SHAPE}).`;

/** { ok:true, value:<normalised url> } or { ok:false, error }. */
export function validateSlackWebhookUrl(raw) {
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (!s) return { ok: false, error: 'Webhook URL is required.' };
    let u;
    try { u = new URL(s); } catch { return { ok: false, error: 'Webhook URL is not a valid URL.' }; }
    if (u.protocol !== 'https:') return { ok: false, error: 'Webhook URL must use https://.' };
    if (u.username || u.password) return { ok: false, error: 'Webhook URL must not carry credentials.' };
    if (u.port) return { ok: false, error: NOT_SLACK };
    if (u.hostname.toLowerCase() !== SLACK_WEBHOOK_HOST) return { ok: false, error: NOT_SLACK };
    if (!u.pathname.startsWith(SLACK_WEBHOOK_PATH)) return { ok: false, error: NOT_SLACK };
    return { ok: true, value: u.toString() };
}
