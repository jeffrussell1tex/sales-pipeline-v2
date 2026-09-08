// tests/slack-webhook.test.mjs
//
// State §0.92, handoff item 25. send-slack's handler posted a test to ANY
// webhookUrl in the body behind verifyAuth alone — no role gate, no host check
// — so any signed-in user could make the server POST to any URL; the stored
// webhook every pipeline alert reads was never checked either; and
// integration-requests gated on requireWrite while the only panel that offers
// a request lives under Settings, which App.jsx renders for Admins only.
// The pure validator is exercised here; the source scans pin the two Admin
// gates, the two validation sites and the save-time check; behaviour against
// the real handler is tests/integration/send-slack.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSlackWebhookUrl, SLACK_WEBHOOK_HOST, SLACK_WEBHOOK_PATH } from '../netlify/functions/_slackWebhook.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── the validator ────────────────────────────────────────────────────────────

// The well-formed sample is assembled at run time: a literal in the Slack shape
// trips GitHub's push protection (it reads as a leaked webhook, which it is not).
const sample = (t = 'T0AAAAAAA', b = 'B0BBBBBBB', k = 'x'.repeat(24)) => ['https://hooks.slack.com', 'services', t, b, k].join('/');

test('a Slack Incoming Webhook is https, hooks.slack.com, /services/, credential-free, on the default port', () => {
    const good = sample();
    assert.deepEqual(validateSlackWebhookUrl(good), { ok: true, value: good });
    assert.deepEqual(validateSlackWebhookUrl('  ' + good + '  '), { ok: true, value: good }, 'trimmed');
    assert.equal(validateSlackWebhookUrl('https://HOOKS.SLACK.COM/services/T/B/x').ok, true, 'host is case-insensitive');
    assert.equal(validateSlackWebhookUrl('https://hooks.slack.com:443/services/T/B/x').ok, true, 'the default port is no port');
    for (const [input, why] of [
        ['', 'empty'], [null, 'null'], [undefined, 'undefined'], [42, 'not a string'], [{ url: 'x' }, 'an object'],
        ['not a url', 'shape'],
        ['http://hooks.slack.com/services/T/B/x', 'REGRESSION: http'],
        ['https://user:pw@hooks.slack.com/services/T/B/x', 'credentials'],
        ['https://hooks.slack.com:8443/services/T/B/x', 'a port'],
        ['https://example.com/services/T/B/x', 'another host'],
        ['https://hooks.slack.com.evil.example/services/T/B/x', 'a suffix-spoofed host'],
        ['https://evilhooks.slack.com/services/T/B/x', 'a prefix-spoofed host'],
        ['https://10.0.0.5/services/T/B/x', 'a private host'],
        ['https://localhost/services/T/B/x', 'localhost'],
        ['https://hooks.slack.com/', 'hooks.slack.com outside /services/'],
        ['https://hooks.slack.com/api/chat.postMessage', 'the Web API, not a webhook'],
    ]) {
        const r = validateSlackWebhookUrl(input);
        assert.equal(r.ok, false, why);
        assert.ok(typeof r.error === 'string' && r.error.length > 0, why + ': carries a reason');
    }
    assert.equal(SLACK_WEBHOOK_HOST, 'hooks.slack.com');
    assert.equal(SLACK_WEBHOOK_PATH, '/services/');
});

test('a scheme-less paste is told to start with https:// — not "not a valid URL" (Jeff typed hooks.slack.com/services/)', () => {
    for (const input of ['hooks.slack.com/services/', 'hooks.slack.com/services/T/B/x', 'www.hooks.slack.com/services/T/B/x']) {
        const r = validateSlackWebhookUrl(input);
        assert.equal(r.ok, false, input);
        assert.match(r.error, /must start with https:\/\//, input);
        assert.doesNotMatch(r.error, /not a valid URL/, input);
    }
    assert.match(validateSlackWebhookUrl('https://not a url').error, /not a valid URL/, 'a scheme with garbage after it is still the parser\'s call');
    assert.match(validateSlackWebhookUrl('http://hooks.slack.com/services/T/B/x').error, /must use https/, 'http keeps its own message');
});

// ── source scans ─────────────────────────────────────────────────────────────

test('send-slack: the handler is Admin-only, and a typed test URL is checked before anything is sent', () => {
    const s = code(read('netlify/functions/send-slack.mjs'));
    assert.ok(s.includes("import { verifyAuth, requireRole } from './auth.mjs';"));
    assert.ok(s.includes("import { validateSlackWebhookUrl } from './_slackWebhook.mjs';"));
    assert.ok(s.includes("    const forbidden = requireRole(auth, ['Admin'], HEADERS);"), 'the Admin gate');
    assert.ok(s.includes('    if (forbidden) return forbidden;'));
    assert.ok(s.indexOf("requireRole(auth, ['Admin'], HEADERS)") < s.indexOf('JSON.parse(event.body'), 'the gate sits before the body is read');
    assert.ok(s.includes('            const checked = validateSlackWebhookUrl(url);'));
    assert.ok(s.includes('            if (!checked.ok) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: checked.error }) };'));
    assert.ok(s.includes('await sendSlack({ webhookUrl: url, text: text || slackTemplates.test({}).text, blocks });'), 'the org path is untouched');
});

test('send-slack: sendSlack itself refuses a non-Slack destination, so a stored URL is pinned too', () => {
    const s = code(read('netlify/functions/send-slack.mjs'));
    assert.ok(s.includes('    const checked = validateSlackWebhookUrl(webhookUrl);'));
    assert.ok(s.includes("    if (!checked.ok) throw new Error('sendSlack: ' + checked.error);"));
    assert.ok(s.includes('    const res = await fetch(checked.value, {'), 'the fetch takes the checked value');
    assert.ok(!s.includes('fetch(webhookUrl'), 'nothing fetches the raw input');
    const pa = code(read('netlify/functions/pipeline-alerts.mjs'));
    assert.equal((pa.match(/await sendSlackToOrg\(orgId, slackTemplates\./g) || []).length, 5, 'the five alerts still route through sendSlackToOrg → sendSlack');
    assert.ok(!pa.includes('sendSlack({'), 'no alert bypasses the org path');
});

test('settings: an Admin cannot save a webhook that sendSlack would refuse', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes("import { validateSlackWebhookUrl } from './_slackWebhook.mjs';"));
    assert.ok(s.includes("            if ('slackConfig' in data && data.slackConfig && data.slackConfig.webhookUrl) {"));
    assert.ok(s.includes('                const checked = validateSlackWebhookUrl(data.slackConfig.webhookUrl);'));
    assert.ok(s.includes('                if (!checked.ok) return { statusCode: 400, headers, body: JSON.stringify({ error: checked.error }) };'));
    assert.ok(s.indexOf("'slackConfig' in data && data.slackConfig && data.slackConfig.webhookUrl") < s.indexOf('const existingExtra = existing.length > 0'), 'checked before the row is read');
    assert.ok(s.includes("                slackConfig:    'slackConfig'    in data ? (data.slackConfig    || {}) : existingExtra.slackConfig    || {},"), 'the merge half is unchanged (18b12)');
});

test('integration-requests: Admin-only, because the panel that offers a request is', () => {
    const s = code(read('netlify/functions/integration-requests.mjs'));
    assert.ok(s.includes("import { verifyAuth, requireRole } from './auth.mjs';"));
    assert.ok(s.includes("    const forbidden = requireRole(auth, ['Admin'], HEADERS);"));
    assert.ok(!s.includes('requireWrite'), 'the write gate is gone — Admin is a write role');
    const app = code(read('src/App.jsx'));
    assert.ok(app.includes("{activeTab === 'settings' && isAdmin && ("), 'Settings content renders only for Admins');
});
