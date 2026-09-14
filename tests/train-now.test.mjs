// tests/train-now.test.mjs
//
// An Admin's "Train now" for lead scoring (state §0.132). The nightly batch
// trains only above the org's threshold; this lets an Admin train NOW, with
// the threshold set aside — the engine's own floor of 20 decided leads still
// applies, and the answer says which gate stopped it, so the button is never
// a silent no-op. The wording is RUN (pure); the function, the batch and the
// panel are source scans (§18b23); scoreOrg against the real database is
// tests/integration/train-lead-model.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { trainNowMessage } from '../src/utils/leadScoringDefaults.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('trainNowMessage: a trained model is reported with its size and accuracy; every refusal names its gate', () => {
    const ok = trainNowMessage({ ok: true, decided: 31, leadScoring: { predictive: { model: { n: 31, accuracy: 84 } } } });
    assert.equal(ok.ok, true);
    assert.equal(ok.text, 'Model trained on 31 decided leads · 84% training accuracy.');
    const floor = trainNowMessage({ ok: false, reason: 'below-engine-floor', decided: 12, minRows: 20 });
    assert.equal(floor.ok, false);
    assert.equal(floor.text, 'Needs at least 20 decided (Converted / Dead) leads to train — this workspace has 12.');
    assert.match(trainNowMessage({ ok: false, reason: 'predictive-off' }).text, /Turn predictive scoring on and save/);
    assert.match(trainNowMessage({ ok: false, reason: 'scoring-off' }).text, /Lead scoring is off/);
    assert.match(trainNowMessage({ ok: false, reason: 'training-failed' }).text, /nothing changed/);
    assert.equal(trainNowMessage({ ok: false, error: 'Forbidden' }).text, 'Forbidden', 'a refused request shows the server\'s words');
    assert.equal(trainNowMessage(null).text, 'Nothing was trained.');
});

test('train-lead-model.mjs: POST, Admin-only, the caller\'s org from the token, scoreOrg with force, the saved config in the answer', () => {
    const s = code(read('netlify/functions/train-lead-model.mjs'));
    assert.ok(s.includes("import { verifyAuth, requireRole } from './auth.mjs';"));
    assert.ok(s.includes("import { scoreOrg, MODEL_MIN_ROWS } from './score-leads-batch.mjs';"), 'the nightly pass itself, not a copy');
    assert.ok(s.includes("    if (event.httpMethod !== 'POST') return { statusCode: 405"));
    const auth = s.indexOf('const auth = await verifyAuth(event);');
    const gate = s.indexOf("const forbidden = requireRole(auth, ['Admin'], HEADERS);");
    const run  = s.indexOf('const r = await scoreOrg(orgId, { force: true });');
    assert.ok(auth > 0 && gate > auth && run > gate, 'verify → Admin gate → train, in that order');
    assert.ok(s.includes('    const { orgId } = auth;'), 'the org is the token\'s');
    assert.ok(!/JSON\.parse\(event\.body/.test(s), 'the body carries nothing — no org, no threshold, no flags from the client');
    assert.ok(s.includes('                leadScoring:  r.leadScoring,'), 'the panel reads the server\'s config back');
    assert.ok(s.includes("                reason:       r.reason,") && s.includes('                minRows:      MODEL_MIN_ROWS,'), 'the refusal names its gate');
});

test('score-leads-batch.mjs: the per-org pass is one exported function the nightly run loops over; force skips the org threshold, never the engine floor', () => {
    const s = code(read('netlify/functions/score-leads-batch.mjs'));
    assert.ok(s.includes('export const MODEL_MIN_ROWS = 20;'));
    assert.ok(s.includes('export async function scoreOrg(orgId, { force = false } = {}) {'));
    assert.ok(s.includes("    if (!predCfg || !predCfg.enabled)                       reason = 'predictive-off';"));
    assert.ok(s.includes("    else if (decided.length < MODEL_MIN_ROWS)                reason = 'below-engine-floor';"), 'the floor is checked BEFORE force is consulted');
    assert.ok(s.includes("    else if (!force && decided.length < threshold)           reason = 'below-threshold';"), 'force sets the org threshold aside');
    assert.ok(s.includes('            const r = await scoreOrg(orgId);'), 'the nightly run calls it without force');
    assert.ok(!s.includes('scoreOrg(orgId, { force: true })'), 'the batch never forces');
    assert.ok(s.includes("    if (cfg.enabled === false) return { skipped: 'disabled' };"));
    assert.ok(s.includes('    return { leadsUpdated, decided: decided.length, threshold, modelTrained, reason, leadScoring: cfg };'));
    assert.ok(s.includes("export const handler = withHeartbeat('score-leads-batch', run);"), 'still the scheduled job');
});

test('the panel: Train now is disabled while the form is dirty, POSTs the function with no body, and adopts the returned config', () => {
    const s = code(read('src/Tabs/settings/salesProcess/LeadScoringDetail.jsx'));
    assert.ok(s.includes("            const res  = await dbFetch('/.netlify/functions/train-lead-model', { method: 'POST' });"));
    assert.ok(s.includes('            if (!res.ok) throw new Error(data.error || `Training refused (${res.status})`);'), 'a refusal is shown, never swallowed (18b1)');
    assert.ok(s.includes('            if (data.ok && data.leadScoring) setSettings(prev => ({ ...prev, leadScoring: data.leadScoring }));'), 'the server\'s config becomes the prop');
    assert.ok(s.includes('            setTrainMsg(trainNowMessage(data));'));
    assert.ok(s.includes('<button onClick={handleTrainNow} disabled={training || dirty}'), 'never trains against unsaved rules');
    assert.ok(s.includes("{training ? 'Training…' : 'Train now'}"));
});
