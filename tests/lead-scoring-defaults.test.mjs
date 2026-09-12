// tests/lead-scoring-defaults.test.mjs
//
// Lead scoring: one default config, shared (state §0.123). Jeff: "Lets work on
// lead scoring … finish Lead Scoring v1.5" — read against the code, v1.5 and
// Phase 2 were both already shipped (§0a8); what was NOT right: the Settings
// panel kept a MIRROR of the engine's defaults that had drifted to five
// engagement rules where the engine has ten, so a brand-new org's first Save or
// a Reset to defaults silently dropped the five behavioural rules; "Web Form"
// (the web-to-lead source, §0.121) earned no inbound points; and the engine's
// own test file was never in the mutation harness. Source scans (§18b23) plus
// the shared module RUN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_LEAD_SCORING, DECIDED_STATUSES, isDecidedLead } from '../src/utils/leadScoringDefaults.js';
import { DEFAULT_LEAD_SCORING as ENGINE_DEFAULT, scoreLead, computeFit } from '../netlify/functions/score-lead.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('the engine re-exports the shared defaults — the same object, not a copy', () => {
    assert.equal(ENGINE_DEFAULT, DEFAULT_LEAD_SCORING, 'one object');
    const eng = code(read('netlify/functions/score-lead.mjs'));
    assert.ok(eng.includes("import { DEFAULT_LEAD_SCORING } from '../../src/utils/leadScoringDefaults.js';"));
    assert.ok(eng.includes('export { DEFAULT_LEAD_SCORING };'));
    assert.ok(!eng.includes('export const DEFAULT_LEAD_SCORING = {'), 'the engine no longer carries its own literal');
});

test('the defaults carry ten engagement rules — five status/recency, five behavioural events (v1.5) — and the predictive block', () => {
    const rules = DEFAULT_LEAD_SCORING.engagement.rules;
    assert.equal(rules.length, 10);
    assert.deepEqual(rules.filter(r => r.op === 'event').map(r => r.event), ['Demo', 'Meeting', 'Schedule', 'Call', 'Email']);
    assert.equal(rules.filter(r => r.op === 'recency').length, 1);
    assert.deepEqual(DEFAULT_LEAD_SCORING.predictive, { enabled: false, minClosedRecords: 150, model: null });
    assert.deepEqual(DEFAULT_LEAD_SCORING.buckets, { cold: [0, 40], warm: [41, 70], hot: [71, 100] });
});

test('"Web Form" is an inbound source: a web-to-lead lead earns the inbound fit points', () => {
    const inbound = DEFAULT_LEAD_SCORING.fit.rules.find(r => r.id === 'f_src_inb');
    assert.ok(inbound.value.includes('Web Form'), 'the source the web-to-lead form stamps (§0.121)');
    const fit = computeFit({ source: 'Web Form' }, DEFAULT_LEAD_SCORING.fit);
    assert.deepEqual(fit.matched.map(m => m.id), ['f_src_inb']);
    assert.equal(computeFit({ source: 'Cold List' }, DEFAULT_LEAD_SCORING.fit).matched.length, 0);
});

test('decided leads are Converted or Dead — what the predictive model trains on', () => {
    assert.deepEqual([...DECIDED_STATUSES], ['Converted', 'Dead']);
    assert.equal(isDecidedLead({ status: 'Converted' }), true);
    assert.equal(isDecidedLead({ status: 'Dead' }), true);
    assert.equal(isDecidedLead({ status: 'Qualified' }), false);
    assert.equal(isDecidedLead(null), false);
    const batch = code(read('netlify/functions/score-leads-batch.mjs'));
    assert.ok(batch.includes("const decided = rows.filter(isDecidedLead)"), 'the batch uses the same definition');
});

test('the Settings panel imports the shared defaults and keeps no mirror; Reset uses them; the readiness line counts decided leads', () => {
    const panel = code(read('src/Tabs/settings/salesProcess/LeadScoringDetail.jsx'));
    assert.ok(panel.includes("import { DEFAULT_LEAD_SCORING, isDecidedLead } from '../../../utils/leadScoringDefaults.js';"));
    assert.ok(!panel.includes('const DEFAULT_LEAD_SCORING = {'), 'the drifted mirror is gone');
    assert.ok(!panel.includes("value: ['Website','Webinar','LinkedIn'], points: 10"), 'no stale rule literal survives');
    assert.ok(panel.includes('    const handleReset  = () => { setCfg(JSON.parse(JSON.stringify(DEFAULT_LEAD_SCORING))); setDirty(true); };'), 'Reset restores the shared defaults — ten engagement rules');
    assert.ok(panel.includes('    const decidedCount = (leads || []).filter(isDecidedLead).length;'), 'progress toward the training threshold');
    assert.ok(panel.includes('decided (Converted / Dead) leads so far'), 'and it is shown');
});

test('scoreLead with the shared defaults still scores a web lead: unassigned, New, inbound', () => {
    const sc = scoreLead({ status: 'New', source: 'Web Form', createdAt: new Date().toISOString() }, DEFAULT_LEAD_SCORING, Date.now(), []);
    assert.ok(sc && typeof sc.leadScoreFit === 'number' && sc.leadScoreFit > 0, 'the inbound points land');
    // New (5) + a fresh first touch (recency 40) = 45 on engagement → warm; fit alone (10) would be cold.
    assert.equal(sc.leadScoreEngagement, 45);
    assert.equal(sc.leadScoreBucket, 'warm');
    assert.equal(sc.scoreBreakdown.probability, undefined, 'no model, no probability');
});
