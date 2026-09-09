// tests/slack-alerts.test.mjs
//
// State §0.96 and §0.99, handoff items 29 and 33 — Jeff: "How do I choose what
// gets posted to slack … Can we add an option", then "I don't want to have to
// rely on users to pick the correct items by themselves to enable alerts the
// company wants to post to slack". THE COMPANY DECIDES: the Admin's checkboxes
// in Configure Slack (slackConfig.alerts) are the only gate on the org's
// channel. Two event posts fire from the deal save the moment they happen
// (stageChanged, dealClosedWon); the five hourly signals post on the org's
// selection alone — a rep's own preference gates only that rep's email/SMS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    SLACK_ALERT_TYPES, SLACK_ALERT_KEYS, SLACK_EVENT_KEYS, SLACK_HOURLY_KEYS,
    cleanSlackAlerts, slackAlertEnabled, slackAlertsOnCount, dealSlackEvents,
    bulkStageSummary,
} from '../src/utils/slackAlerts.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── the pure module ──────────────────────────────────────────────────────────

test('eight alert types: two events, six hourly signals, frozen, each labelled for what it is', () => {
    assert.deepEqual([...SLACK_EVENT_KEYS], ['stageChanged', 'dealClosedWon']);
    assert.deepEqual([...SLACK_HOURLY_KEYS], ['dealSilent', 'dealStuck', 'closeLapsed', 'dealMomentum', 'scoreDropAlert', 'agreementRenewal']);
    assert.deepEqual([...SLACK_ALERT_KEYS], [...SLACK_EVENT_KEYS, ...SLACK_HOURLY_KEYS]);
    assert.ok(Object.isFrozen(SLACK_ALERT_TYPES) && Object.isFrozen(SLACK_ALERT_KEYS));
    for (const t of SLACK_ALERT_TYPES) assert.ok(['event', 'hourly'].includes(t.kind) && t.label.length > 0, t.key);
    assert.match(SLACK_ALERT_TYPES.find(t => t.key === 'dealMomentum').label, /2\+ stages within 14 days/, 'momentum says what it is — not "stage advance" (Jeff read that as a stage change)');
    // The hourly keys are the rep-side DEFAULT_PREFS keys, so the job's own vocabulary is reused.
    const prefs = code(read('netlify/functions/pipeline-alerts.mjs'));
    for (const k of SLACK_HOURLY_KEYS) assert.ok(prefs.includes(`    ${k}:`), `${k} is a DEFAULT_PREFS key in pipeline-alerts.mjs`);
});

test('cleanSlackAlerts: absent is on, only false is off, unknown keys are dropped, garbage is all on', () => {
    const allOn = Object.fromEntries(SLACK_ALERT_KEYS.map(k => [k, true]));
    assert.deepEqual(cleanSlackAlerts({}), allOn);
    assert.deepEqual(cleanSlackAlerts({ dealStuck: false, bogus: false }), { ...allOn, dealStuck: false });
    assert.equal(cleanSlackAlerts({ dealSilent: 'no' }).dealSilent, true, 'a string is not false');
    assert.equal(cleanSlackAlerts({ stageChanged: 0 }).stageChanged, true, '0 is not false either — only the boolean turns it off');
    for (const junk of [null, undefined, 'x', 42, [false], []]) assert.deepEqual(cleanSlackAlerts(junk), allOn, String(junk));
});

test('slackAlertEnabled: no type is not gated, an unknown type never posts, no selection posts all, false is off', () => {
    assert.equal(slackAlertEnabled({ alerts: { dealSilent: false } }, undefined), true, 'the digest and the test carry no type');
    assert.equal(slackAlertEnabled({ alerts: {} }, 'notAType'), false, 'fail closed on a typo at a call site');
    assert.equal(slackAlertEnabled({}, 'dealSilent'), true, 'a pre-item-29 config posts everything');
    assert.equal(slackAlertEnabled({ alerts: { dealSilent: false } }, 'stageChanged'), true, 'a config saved before the event keys existed posts them');
    assert.equal(slackAlertEnabled({ alerts: null }, 'dealSilent'), true);
    assert.equal(slackAlertEnabled({ alerts: [false] }, 'dealSilent'), true, 'an array is not a selection');
    assert.equal(slackAlertEnabled({ alerts: { dealStuck: false } }, 'dealStuck'), false, 'REGRESSION: the unticked alert posts');
    assert.equal(slackAlertEnabled({ alerts: { dealClosedWon: false } }, 'dealClosedWon'), false);
    assert.equal(slackAlertEnabled({ alerts: { dealStuck: false } }, 'dealSilent'), true, 'the others still do');
    assert.equal(slackAlertEnabled(undefined, 'closeLapsed'), true);
});

test('slackAlertsOnCount counts the ticked types', () => {
    assert.equal(slackAlertsOnCount({}), 8);
    assert.equal(slackAlertsOnCount({ alerts: { dealSilent: false, scoreDropAlert: false } }), 6);
    assert.equal(slackAlertsOnCount(null), 8);
});

test('dealSlackEvents: a win is a win, any other stage change is a stage change, nothing else is anything', () => {
    assert.deepEqual(dealSlackEvents({ before: { stage: 'Proposal' }, after: { stage: 'Negotiation/Review' } }), [{ type: 'stageChanged', from: 'Proposal', to: 'Negotiation/Review' }]);
    assert.deepEqual(dealSlackEvents({ before: { stage: 'Proposal' }, after: { stage: 'Closed Won' } }), [{ type: 'dealClosedWon', from: 'Proposal', to: 'Closed Won' }], 'REGRESSION: a win posts as a plain stage change');
    assert.deepEqual(dealSlackEvents({ before: { stage: 'Proposal' }, after: { stage: 'Closed Lost' } }), [{ type: 'stageChanged', from: 'Proposal', to: 'Closed Lost' }], 'a loss is a stage change, not a win');
    assert.deepEqual(dealSlackEvents({ before: { stage: 'Closed Won' }, after: { stage: 'Closed Won' } }), [], 'saving a won deal again is nothing');
    assert.deepEqual(dealSlackEvents({ before: { stage: 'Proposal' }, after: { stage: 'Proposal' } }), [], 'no stage change: nothing');
    assert.deepEqual(dealSlackEvents({ before: null, after: { stage: 'Closed Won' } }), [{ type: 'dealClosedWon', from: null, to: 'Closed Won' }], 'created already won counts');
    assert.deepEqual(dealSlackEvents({ before: null, after: { stage: 'Proposal' } }), [], 'created in a stage is not "changed"');
    assert.deepEqual(dealSlackEvents({ before: { stage: 'Proposal' }, after: null }), []);
    assert.deepEqual(dealSlackEvents(), []);
    assert.deepEqual(dealSlackEvents({ before: { stage: 'Proposal' }, after: { stage: 42 } }), [], 'a non-string stage is no stage');
});

// ── source scans ─────────────────────────────────────────────────────────────

test('sendSlackToOrg takes the alert type and asks the selection before it posts; the fetch is capped at 4 s', () => {
    const s = code(read('netlify/functions/send-slack.mjs'));
    assert.ok(s.includes("import { slackAlertEnabled, dealSlackEvents } from '../../src/utils/slackAlerts.js';"));
    assert.ok(s.includes('export async function sendSlackToOrg(orgId, { text, blocks }, alertType) {'));
    assert.ok(s.includes('        if (!slackAlertEnabled(slackConfig, alertType)) return false;'), 'the gate');
    assert.ok(s.indexOf('if (!slackAlertEnabled(slackConfig, alertType)) return false;') < s.indexOf('await sendSlack({ webhookUrl, text, blocks });'), 'before the post');
    assert.ok(s.includes('        signal:  AbortSignal.timeout(4000),'), 'an event post sits inside the deal save — a hung Slack must not hang it');
});

test('postDealEvents posts each event through the org path with its type, and the two templates exist', () => {
    const s = code(read('netlify/functions/send-slack.mjs'));
    assert.ok(s.includes('export async function postDealEvents(orgId, { before, after, mover } = {}) {'));
    assert.ok(s.includes('    for (const ev of dealSlackEvents({ before, after })) {'), 'the pure detector decides what happened');
    assert.ok(s.includes("        const msg = ev.type === 'dealClosedWon' ? slackTemplates.dealWon(ctx) : slackTemplates.stageChanged(ctx);"));
    assert.ok(s.includes('        if (await sendSlackToOrg(orgId, msg, ev.type)) posted.push(ev.type);'), "the org's selection gates it, per type");
    assert.ok(s.includes('    stageChanged: ({ mover, repName, dealName, account, arr, fromStage, toStage }) => ({'));
    assert.ok(s.includes('    dealWon: ({ mover, repName, dealName, account, arr, fromStage }) => ({'));
});

test('the deal save posts the events the moment a stage changes, naming who moved it', () => {
    const s = code(read('netlify/functions/opportunities.mjs'));
    assert.ok(s.includes("import { postDealEvents, postBulkStageMove } from './send-slack.mjs';"), 'the per-deal poster and, since §0.106, the batch poster');
    assert.ok(s.includes('                await postDealEvents(orgId, { before: { stage: previousStage }, after: upserted, mover: await getCallerName(userId, orgId) });'));
    assert.ok(s.indexOf('await postDealEvents(orgId,') > s.indexOf('if (stageChanged) {'), 'inside the stage-changed branch');
    assert.ok(s.indexOf('await postDealEvents(orgId,') < s.indexOf("const autoEvt = upserted.stage === 'Closed Won'"), 'beside the webhooks, before the automations');
});

test("the five hourly signals fire on the signal alone; the rep's preference gates only the rep's email and SMS", () => {
    const s = code(read('netlify/functions/pipeline-alerts.mjs'));
    // The conditions no longer carry the rep's preference.
    assert.ok(s.includes('            if (daysSilent !== null && daysSilent >= 14) {'), 'silent');
    assert.ok(s.includes('            if (daysInStage !== null && daysInStage >= stuckThreshold && daysInStage >= 14) {'), 'stuck');
    assert.ok(s.includes('            if (daysLapsed !== null && daysLapsed > 0) {'), 'lapsed');
    assert.ok(s.includes("                !['Negotiation/Review', 'Contracts', 'Closed Won', 'Closed Lost'].includes(opp.stage)\n            ) {"), 'momentum');
    assert.ok(s.includes('                opp.aiScore.score < 40\n            ) {'), 'score drop');
    assert.ok(!/&& wantsAlert\(resolvedProfile/.test(s), "REGRESSION: a rep's preference gates the company's post");
    // The preference now wraps the rep's own email (five) — and the log + Slack post sit outside it.
    for (const k of SLACK_HOURLY_KEYS) assert.ok(s.includes(`if (wantsAlert(resolvedProfile, '${k}')) {`), `${k}: the rep's email is behind the rep's preference`);
    for (const [key, action] of [['dealSilent', 'stale'], ['dealStuck', 'stuck'], ['closeLapsed', 'lapsed'], ['dealMomentum', 'velocity'], ['scoreDropAlert', 'scoreDrop']]) {
        const pref = s.indexOf(`if (wantsAlert(resolvedProfile, '${key}')) {`);
        const log  = s.indexOf(`await logAlert(orgId, repName, '${action}', opp,`);
        const slack = s.indexOf(`, '${key}');`);
        assert.ok(pref > 0 && log > pref && slack > log, `${key}: preference block, then the log, then the Slack post`);
    }
});

test('settings PUT stores the selection as booleans, whatever the client sent', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes("import { cleanSlackAlerts } from '../../src/utils/slackAlerts.js';"));
    assert.ok(s.includes('                data.slackConfig = { ...data.slackConfig, alerts: cleanSlackAlerts(data.slackConfig.alerts) };'));
    assert.ok(s.indexOf('alerts: cleanSlackAlerts(data.slackConfig.alerts)') > s.indexOf('if (!checked.ok) return { statusCode: 400, headers, body: JSON.stringify({ error: checked.error }) };'), 'after the URL check, inside the same guard');
});

test('the Configure Slack modal renders the two groups as checkboxes, says the company decides, saves them, and the card counts them', () => {
    const s = code(read('src/Tabs/settings/integrations/ConnectedAppsDetail.jsx'));
    assert.ok(s.includes("import { SLACK_ALERT_TYPES, cleanSlackAlerts, slackAlertsOnCount } from '../../../utils/slackAlerts.js';"));
    assert.ok(s.includes('useState(() => cleanSlackAlerts(existing?.alerts))'), 'seeded from the stored config, absent = on');
    assert.ok(s.includes("{[['event', 'Posted the moment it happens'], ['hourly', 'Checked every hour']].map(([kind, heading]) => ("), 'two groups');
    assert.ok(s.includes('{SLACK_ALERT_TYPES.filter(t => t.kind === kind).map(t => ('), 'one checkbox per type, in its group');
    assert.ok(s.includes('<input type="checkbox" checked={alerts[t.key] !== false}'));
    assert.ok(s.includes("the company's choice. A user's own notification preferences decide what they are emailed or texted, never what posts to the channel."));
    assert.ok(s.includes('await onSave({ webhookUrl: webhookUrl.trim(), channel: channel.trim(), enabled: true, alerts: cleanSlackAlerts(alerts) });'));
    assert.ok(s.includes('${slackAlertsOnCount(slackConfig)} of ${SLACK_ALERT_TYPES.length} alerts'), 'the card says n of 7');
    assert.ok(!s.includes('when the rep the deal belongs to has that alert on'), 'the old rep-gated sentence is gone');
});

// ── §0.106: a bulk stage move posts one summary line ─────────────────────────

test('bulkStageSummary: a row moved when the file supplied a stage that differs from the stored one; wins counted; tallied by destination', () => {
    const priors = new Map([
        ['a', { stage: 'Proposal' }], ['b', { stage: 'Proposal' }], ['c', { stage: 'Qualification' }],
        ['d', { stage: 'Negotiation' }], ['e', { stage: 'Proposal' }],
    ]);
    const rows = [
        { id: 'a', stage: 'Negotiation' },      // moved
        { id: 'b', stage: 'Negotiation' },      // moved
        { id: 'c', stage: 'Closed Won' },       // moved, won
        { id: 'd', stage: 'Negotiation' },      // unchanged
        { id: 'e' },                            // no stage in the file — not a move
        { id: 'zz', stage: 'Proposal' },        // no prior (a new row) — not a move
        { id: 'a2', stage: '  ' },              // blank — not a move
    ];
    assert.deepEqual(bulkStageSummary(rows, priors), { moved: 3, won: 1, byStage: [{ to: 'Negotiation', n: 2 }, { to: 'Closed Won', n: 1 }] });
    assert.deepEqual(bulkStageSummary([], priors), { moved: 0, won: 0, byStage: [] });
    assert.deepEqual(bulkStageSummary(rows, null), { moved: 0, won: 0, byStage: [] }, 'no priors: nothing is known to have moved');
    assert.deepEqual(bulkStageSummary(undefined, priors), { moved: 0, won: 0, byStage: [] });
    const many = Array.from({ length: 12 }, (_, i) => ({ id: 's' + i, stage: 'S' + i }));
    const manyPriors = new Map(many.map(r => [r.id, { stage: 'X' }]));
    assert.equal(bulkStageSummary(many, manyPriors).byStage.length, 8, 'the tally is capped at eight destinations');
});

test('the bulk stage move posts ONE line for the batch, under the stageChanged switch, beside its audit — and nothing when nothing moved', () => {
    const slack = code(read('netlify/functions/send-slack.mjs'));
    assert.ok(slack.includes('export async function postBulkStageMove(orgId, { summary, total, mover } = {}) {'));
    assert.ok(slack.includes('    if (!summary || !(summary.moved > 0)) return false;'), 'REGRESSION: an import that moved nothing posts nothing');
    assert.ok(slack.includes("    return sendSlackToOrg(orgId, slackTemplates.bulkStageMoved({ mover: mover || 'Someone', total: total || summary.moved, ...summary }), 'stageChanged');"), 'one post, the org\'s stage-changed switch');
    assert.ok(slack.includes('    bulkStageMoved: ({ mover, moved, won, total, byStage }) => {'), 'the template');
    assert.ok(slack.includes("{ type: 'mrkdwn', text: `Imported by *${mover}*` }"), 'names who imported');
    const opp = code(read('netlify/functions/opportunities.mjs'));
    assert.ok(opp.includes("import { postDealEvents, postBulkStageMove } from './send-slack.mjs';"));
    assert.ok(opp.includes("import { bulkStageSummary } from '../../src/utils/slackAlerts.js';"));
    const call = '                    await postBulkStageMove(orgId, { summary: bulkStageSummary(staged.rows, priors), total: data.length, mover: await getCallerName(userId, orgId) });';
    assert.ok(opp.includes(call), 'REGRESSION: the batch branch posts the summary');
    const audit = opp.indexOf("action: 'opportunity.stage_changed_bulk'");
    assert.ok(audit > 0 && opp.indexOf(call) > audit && opp.indexOf(call) - audit < 700, 'inside the same `if (staged.changedCount > 0)` block as the bulk audit');
    assert.equal((opp.match(/postDealEvents\(/g) || []).length, 1, 'the per-deal event post stays on the single save only — never inside the batch loop');
});
