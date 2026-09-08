// tests/slack-alerts.test.mjs
//
// State §0.96, handoff item 29 — Jeff: "How do I choose what gets posted to
// slack … Can we add an option that enables me to select what actions get
// posted". Before: every fired pipeline alert went to the org's one webhook,
// gated only by slackConfig.enabled; the only choice was each rep's own
// notification preference. Now the Configure Slack modal saves five booleans
// as slackConfig.alerts, settings.mjs normalises them, and sendSlackToOrg asks
// slackAlertEnabled() before posting. A config saved before the key existed
// posts everything — absent is on, only an explicit false is off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SLACK_ALERT_TYPES, SLACK_ALERT_KEYS, cleanSlackAlerts, slackAlertEnabled, slackAlertsOnCount } from '../src/utils/slackAlerts.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── the pure module ──────────────────────────────────────────────────────────

test('the five alert types are the rep-side preference keys, frozen, each with a label', () => {
    assert.deepEqual([...SLACK_ALERT_KEYS], ['dealSilent', 'dealStuck', 'closeLapsed', 'dealMomentum', 'scoreDropAlert']);
    assert.ok(Object.isFrozen(SLACK_ALERT_TYPES) && Object.isFrozen(SLACK_ALERT_KEYS));
    for (const t of SLACK_ALERT_TYPES) assert.ok(typeof t.label === 'string' && t.label.length > 0, t.key);
    const prefs = code(read('netlify/functions/pipeline-alerts.mjs'));
    for (const k of SLACK_ALERT_KEYS) assert.ok(prefs.includes(`    ${k}:`), `${k} is a DEFAULT_PREFS key in pipeline-alerts.mjs`);
});

test('cleanSlackAlerts: absent is on, only false is off, unknown keys are dropped, garbage is all on', () => {
    assert.deepEqual(cleanSlackAlerts({}), { dealSilent: true, dealStuck: true, closeLapsed: true, dealMomentum: true, scoreDropAlert: true });
    assert.deepEqual(cleanSlackAlerts({ dealStuck: false, bogus: false }), { dealSilent: true, dealStuck: false, closeLapsed: true, dealMomentum: true, scoreDropAlert: true });
    assert.equal(cleanSlackAlerts({ dealSilent: 'no' }).dealSilent, true, 'a string is not false');
    assert.equal(cleanSlackAlerts({ dealSilent: 0 }).dealSilent, true, '0 is not false either — only the boolean turns it off');
    for (const junk of [null, undefined, 'x', 42, [false], []]) assert.deepEqual(cleanSlackAlerts(junk), cleanSlackAlerts({}), String(junk));
});

test('slackAlertEnabled: no type is not gated, an unknown type never posts, no selection posts all, false is off', () => {
    assert.equal(slackAlertEnabled({ alerts: { dealSilent: false } }, undefined), true, 'the digest and the test carry no type');
    assert.equal(slackAlertEnabled({ alerts: {} }, 'notAType'), false, 'fail closed on a typo at a call site');
    assert.equal(slackAlertEnabled({}, 'dealSilent'), true, 'a pre-item-29 config posts everything');
    assert.equal(slackAlertEnabled({ alerts: null }, 'dealSilent'), true);
    assert.equal(slackAlertEnabled({ alerts: [false] }, 'dealSilent'), true, 'an array is not a selection');
    assert.equal(slackAlertEnabled({ alerts: { dealStuck: false } }, 'dealStuck'), false, 'REGRESSION: the unticked alert posts');
    assert.equal(slackAlertEnabled({ alerts: { dealStuck: false } }, 'dealSilent'), true, 'the others still do');
    assert.equal(slackAlertEnabled(undefined, 'closeLapsed'), true);
});

test('slackAlertsOnCount counts the ticked five', () => {
    assert.equal(slackAlertsOnCount({}), 5);
    assert.equal(slackAlertsOnCount({ alerts: { dealSilent: false, scoreDropAlert: false } }), 3);
    assert.equal(slackAlertsOnCount(null), 5);
});

// ── source scans ─────────────────────────────────────────────────────────────

test('sendSlackToOrg takes the alert type and asks the selection before it posts', () => {
    const s = code(read('netlify/functions/send-slack.mjs'));
    assert.ok(s.includes("import { slackAlertEnabled } from '../../src/utils/slackAlerts.js';"));
    assert.ok(s.includes('export async function sendSlackToOrg(orgId, { text, blocks }, alertType) {'));
    assert.ok(s.includes('        if (!slackAlertEnabled(slackConfig, alertType)) return false;'), 'the gate');
    assert.ok(s.indexOf('if (!slackAlertEnabled(slackConfig, alertType)) return false;') < s.indexOf('await sendSlack({ webhookUrl, text, blocks });'), 'before the post');
});

test('every pipeline alert names its type at the call site', () => {
    const s = code(read('netlify/functions/pipeline-alerts.mjs'));
    for (const [tpl, key] of [['dealSilent', 'dealSilent'], ['dealStuck', 'dealStuck'], ['closeDateLapsed', 'closeLapsed'], ['dealMomentum', 'dealMomentum'], ['scoreDrop', 'scoreDropAlert']]) {
        const re = new RegExp(`await sendSlackToOrg\\(orgId, slackTemplates\\.${tpl}\\(\\{[^\\n]*\\}\\), '${key}'\\);`);
        assert.match(s, re, `${tpl} → '${key}'`);
    }
    assert.equal((s.match(/await sendSlackToOrg\(orgId, slackTemplates\./g) || []).length, 5, 'still five, none bypassing');
});

test('settings PUT stores the selection as five booleans, whatever the client sent', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes("import { cleanSlackAlerts } from '../../src/utils/slackAlerts.js';"));
    assert.ok(s.includes('                data.slackConfig = { ...data.slackConfig, alerts: cleanSlackAlerts(data.slackConfig.alerts) };'));
    assert.ok(s.indexOf('alerts: cleanSlackAlerts(data.slackConfig.alerts)') > s.indexOf('if (!checked.ok) return { statusCode: 400, headers, body: JSON.stringify({ error: checked.error }) };'), 'after the URL check, inside the same guard');
});

test('the Configure Slack modal renders the five as checkboxes, saves them, and the card counts them', () => {
    const s = code(read('src/Tabs/settings/integrations/ConnectedAppsDetail.jsx'));
    assert.ok(s.includes("import { SLACK_ALERT_TYPES, cleanSlackAlerts, slackAlertsOnCount } from '../../../utils/slackAlerts.js';"));
    assert.ok(s.includes('useState(() => cleanSlackAlerts(existing?.alerts))'), 'seeded from the stored config, absent = on');
    assert.ok(s.includes('{SLACK_ALERT_TYPES.map(t => ('), 'one checkbox per type');
    assert.ok(s.includes('<input type="checkbox" checked={alerts[t.key] !== false}'));
    assert.ok(s.includes('await onSave({ webhookUrl: webhookUrl.trim(), channel: channel.trim(), enabled: true, alerts: cleanSlackAlerts(alerts) });'));
    assert.ok(s.includes('${slackAlertsOnCount(slackConfig)} of ${SLACK_ALERT_TYPES.length} alerts'), 'the card says n of 5');
    assert.ok(!s.includes('deal silent, stuck in stage, close date lapsed, deal momentum, score drop — alongside'), 'the static list is gone');
});
