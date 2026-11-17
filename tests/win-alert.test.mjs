// tests/win-alert.test.mjs — the score-drop alert on the win chance (AI scoring batch 2C; docs/design/deal-score/
// DESIGN-2C.md — Jeff, 17 Nov: Q1 "A fall into Critical", Q2 "Add win_chance", Q3 "Add the switch"). The band's moves
// kept on the score, the fall rule, the words on every channel, the API's win_chance, the rep's own switch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { withBandChange, sameDealScore, fellToCritical, managerCopied, fallWords, winChanceOf } from '../src/utils/dealScore.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
const NOW = new Date('2026-11-17T15:00:00.000Z');
const S = (score, status, extra = {}) => ({ score, status, weight: 60, rules: score, learned: null, share: 0, factors: [], scoredAt: '2026-11-17T14:00:00.000Z', ...extra });

test('a write notes the band\'s move: a new band keeps the one it left and when; the same band carries the last move on', () => {
    assert.deepEqual(withBandChange(S(40, 'At Risk'), S(12, 'Critical'), NOW), { ...S(12, 'Critical'), previousStatus: 'At Risk', statusChangedAt: NOW.toISOString() });
    const moved = withBandChange(S(40, 'At Risk'), S(12, 'Critical'), NOW);
    const later = withBandChange(moved, S(11, 'Critical'), new Date('2026-11-18T06:00:00.000Z'));
    assert.equal(later.previousStatus, 'At Risk', 'the same band keeps its last move');
    assert.equal(later.statusChangedAt, NOW.toISOString(), 'and when it was');
    assert.deepEqual(withBandChange(null, S(12, 'Critical'), NOW), S(12, 'Critical'), 'a first score moved from nothing');
    assert.equal(withBandChange(S(40, 'At Risk'), null, NOW), null, 'a closed deal keeps none');
    // The notes are when it moved, not what it is: the same score either way (no rewrite for them alone).
    assert.equal(sameDealScore(later, { ...S(11, 'Critical') }), true);
});

test('the fall rule (Q1): Healthy or At Risk to Critical since the window\'s start — not a level, not an old fall', () => {
    const since = NOW.getTime() - 86400000;
    assert.equal(fellToCritical({ ...S(12, 'Critical'), previousStatus: 'At Risk', statusChangedAt: '2026-11-17T13:00:00.000Z' }, since), true);
    assert.equal(fellToCritical({ ...S(12, 'Critical'), previousStatus: 'Healthy', statusChangedAt: '2026-11-17T13:00:00.000Z' }, since), true);
    assert.equal(fellToCritical(S(12, 'Critical'), since), false, 'Critical from the first score: no fall');
    assert.equal(fellToCritical({ ...S(12, 'Critical'), previousStatus: 'At Risk', statusChangedAt: '2026-11-14T13:00:00.000Z' }, since), false, 'a fall three days ago');
    assert.equal(fellToCritical({ ...S(40, 'At Risk'), previousStatus: 'Healthy', statusChangedAt: '2026-11-17T13:00:00.000Z' }, since), false, 'a fall to At Risk is no alert');
    assert.equal(fellToCritical({ ...S(12, 'Critical'), previousStatus: 'Critical', statusChangedAt: '2026-11-17T13:00:00.000Z' }, since), false, 'from Critical is no fall');
    assert.equal(fellToCritical(null, since), false);
    // The server notes the band on every write (_dealScore.mjs keepScores).
    assert.ok(code(read('netlify/functions/_dealScore.mjs')).includes('const next = withBandChange(d.dealScore, scoreDeal(d, actsByDeal[d.id] || [], { funnelStages, model, today, now }), now);'));
    assert.equal(managerCopied(S(14, 'Critical')), true, 'below a quarter of 60');
    assert.equal(managerCopied(S(15, 'Critical')), false, 'a quarter is not below');
});

test('the words, every channel: the subject, the log, the why — the factor costing the most', () => {
    const w = fallWords({ ...S(12, 'Critical', { factors: [{ text: 'In current stage for 5 days', effect: 0 }, { text: 'No activity in over 30 days (34 days)', effect: -24 }] }), previousStatus: 'At Risk' }, 'Alpha Fall', 'Proposal');
    assert.deepEqual(w, {
        subject: "Win chance fell to Critical: Alpha Fall — 12% (the stage's usual is 60%)",
        log: 'Win chance 12% (Critical, was At Risk)',
        why: 'No activity in over 30 days (34 days)',
        band: 'Critical for Proposal',
    });
    assert.equal(fallWords({ ...S(12, 'Critical'), previousStatus: 'At Risk' }, 'D', 'Proposal').why, 'Its win chance has fallen');
    const slack = code(read('netlify/functions/send-slack.mjs'));
    assert.ok(slack.includes('text: `⚠️ *${dealName}* win chance fell to ${score}% — ${verdict}`,'));
    assert.ok(read('netlify/functions/send-email.mjs').includes("'score-critical': 'Win chance critical' };"), 'REGRESSION: the manager\'s subject read the key');
    assert.ok(read('src/utils/automationEvents.js').includes("label: 'Win chance fell to Critical',"));
    assert.ok(read('src/utils/automationEvents.js').includes("F('score', 'Win chance (%)'), F('verdict', 'Band')"), 'the keys stay, relabelled');
    assert.ok(read('src/utils/slackAlerts.js').includes("label: 'Win chance fell to Critical' }),"));
    assert.ok(!/opp\.aiScore/.test(code(read('netlify/functions/pipeline-alerts.mjs'))), 'REGRESSION: the alert reads Claude\'s number');
});

test('the public API (Q2): win_chance added — the number, band, stage weight and time; none for a closed or unscored deal; ai_score as it was', () => {
    assert.deepEqual(winChanceOf(S(42, 'At Risk')), { score: 42, status: 'At Risk', stage_weight: 60, scored_at: '2026-11-17T14:00:00.000Z' });
    assert.equal(winChanceOf(null), null);
    assert.equal(winChanceOf({ score: 'x' }), null);
    const api = code(read('netlify/functions/public-api.mjs'));
    assert.ok(api.includes('win_chance:          winChanceOf(r.dealScore),'));
    assert.ok(api.includes('ai_score:            r.aiScore && Number.isFinite(Number(r.aiScore.score)) ? { score: r.aiScore.score, verdict: r.aiScore.verdict } : null,'), 'ai_score unchanged');
});

test('a rep\'s own switch (Q3): "Win chance fell to Critical" in the profile panel, on by default as the server\'s default', () => {
    const h = read('src/components/layout/AppHeader.jsx');
    assert.ok(h.includes("        scoreDropAlert:     { enabled: true,  mode: 'instant' },"), 'on by default');
    assert.ok(h.includes("        scoreDropAlert: 'Win chance fell to Critical',"), 'listed, so the panel draws its switch');
    assert.ok(read('netlify/functions/pipeline-alerts.mjs').includes('    scoreDropAlert: { enabled: true  },'), 'the server\'s default, the same');
    assert.ok(code(read('netlify/functions/pipeline-alerts.mjs')).includes("if (wantsAlert(resolvedProfile, 'scoreDropAlert')) {"), 'the rep\'s email behind it');
});
