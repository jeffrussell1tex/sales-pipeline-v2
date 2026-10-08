// tests/ai-score.test.mjs
//
// A deal's AI score, end to end (state §0.188 — §0.187's found (b); Jeff: "fix the AI
// score one when you have the chance").
//
// Before: the deal window's AI Score tab asked ai-score.mjs for a score with no
// `opportunityId` — answered 400, every time — and kept `data.score`, a number, where it
// reads an object; it and the right rail's AI read took the score from `cachedScore` and
// a history from `scoreHistory`, which no deal has (its score is `aiScore`), a signal's
// tone from `kind` (ai-score stores `sentiment`), and the tab had no colour for "On
// Track". Nothing kept a history. A deal save sent the score the window opened with,
// and the PUT wrote it back over a newer one. No screen set the org's switch,
// `aiScoringEnabled`, so the tab and the Pipeline's "Score all deals" were hidden in
// every workspace. And the History and AI Score tabs' Save submitted #opp-form, which a
// detail tab unmounts: it did nothing.
//
// The server half runs against the test database (tests/integration/ai-score.itest.mjs,
// the model answered in-process). Here: the shape both halves share, run; the guard on
// who writes a score; and the screens' wiring, pinned — node --test renders no JSX.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { VERDICTS, HISTORY_KEPT, withHistory, storedScore, signalKind } from '../src/utils/aiScore.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const count = (src, s) => src.split(s).length - 1;
const walk = (node, visit, anc = []) => {
    if (!node || typeof node.type !== 'string') return;
    visit(node, anc);
    const here = [...anc, node];
    for (const k of Object.keys(node)) {
        if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
        const v = node[k];
        if (Array.isArray(v)) v.forEach((c) => walk(c, visit, here));
        else if (v && typeof v.type === 'string') walk(v, visit, here);
    }
};

// ── the shape, run ──────────────────────────────────────────────────────────

test('withHistory: the score it replaces heads the history — earlier scores, newest first, four kept, each its score, verdict and when', () => {
    const t = (n) => `2026-10-0${n}T12:00:00.000Z`;
    const next = { score: 61, verdict: 'On Track', signals: [], scoredAt: t(9) };
    assert.deepEqual(withHistory(null, next), { ...next, history: [] }, 'the first score: no history');
    assert.deepEqual(withHistory(undefined, next).history, []);
    const prev = { score: 72, verdict: 'On Track', headline: 'h', signals: [{ text: 'x', sentiment: 'positive' }], scoredAt: t(8), history: [
        { score: 50, verdict: 'At Risk', scoredAt: t(7) }, { score: 45, verdict: 'At Risk', scoredAt: t(6) },
        { score: 40, verdict: 'Critical', scoredAt: t(5) }, { score: 30, verdict: 'Critical', scoredAt: t(4) }] };
    const out = withHistory(prev, next);
    assert.equal(out.score, 61);
    assert.equal(out.scoredAt, t(9));
    assert.deepEqual(out.history, [
        { score: 72, verdict: 'On Track', scoredAt: t(8) }, { score: 50, verdict: 'At Risk', scoredAt: t(7) },
        { score: 45, verdict: 'At Risk', scoredAt: t(6) }, { score: 40, verdict: 'Critical', scoredAt: t(5) }],
        'the replaced score first, its signals and headline not carried; the oldest past four dropped');
    assert.equal(HISTORY_KEPT, 4);
    assert.deepEqual(withHistory({ verdict: 'Strong' }, next).history, [], 'a stored value with no score is no score');
    assert.deepEqual(withHistory({ score: 70, verdict: 'Strong', scoredAt: t(8), history: [null, { score: 'x' }, { score: 40, scoredAt: t(5) }] }, next).history,
        [{ score: 70, verdict: 'Strong', scoredAt: t(8) }, { score: 40, verdict: null, scoredAt: t(5) }], 'a malformed entry is left out');
});

test('storedScore: an answer less its transport flags; an answer with no score keeps nothing', () => {
    const s = { score: 61, verdict: 'On Track', headline: 'h', signals: [], recommendation: 'r', scoredAt: 'x', history: [] };
    assert.deepEqual(storedScore({ ...s, usingOrgKey: false }), s);
    assert.deepEqual(storedScore({ ...s, fromCache: true }), s);
    assert.equal(storedScore({ disabled: true }), null, 'the switch off');
    assert.equal(storedScore({ error: 'opportunityId required' }), null);
    assert.equal(storedScore(null), null);
    assert.equal(storedScore({ score: 0, verdict: 'Critical' }).score, 0, 'a score of 0 is a score');
});

test("signalKind: a signal's sentiment as the deal window's chips — positive, warning, risk; anything else neutral", () => {
    assert.equal(signalKind({ sentiment: 'positive' }), 'positive');
    assert.equal(signalKind({ sentiment: 'warning' }), 'warning');
    assert.equal(signalKind({ sentiment: 'negative' }), 'risk');
    assert.equal(signalKind({ kind: 'positive' }), 'neutral', 'a kind is not what ai-score stores');
    assert.equal(signalKind(undefined), 'neutral');
    const signal = between(read('src/components/modals/OpportunityModal.jsx'), 'const SIGNAL = {', '\n};');
    for (const k of ['positive', 'warning', 'risk', 'neutral']) assert.ok(new RegExp(`^ {4}${k}: +\\{`, 'm').test(signal), `the chip has a ${k}`);
});

test("the verdicts are ai-score's four, and the tab colours each", () => {
    assert.deepEqual(VERDICTS, ['Strong', 'On Track', 'At Risk', 'Critical']);
    assert.ok(read('netlify/functions/ai-score.mjs').includes("['Strong','On Track','At Risk','Critical'].includes(parsed.verdict)"));
    const config = between(read('src/components/modals/OpportunityModal.jsx'), '    const verdictConfig = {', '\n    };');
    for (const v of VERDICTS) assert.ok(config.includes(`'${v}':`), `${v} has a colour`);
});

// ── the server ──────────────────────────────────────────────────────────────

test('ai-score.mjs keeps the new score with the one it replaces in its history, and answers the score as kept', () => {
    const s = read('netlify/functions/ai-score.mjs');
    assert.ok(s.includes("import { withHistory } from '../../src/utils/aiScore.js';"));
    assert.ok(s.includes('const cached = opp.aiScore;'));
    assert.ok(s.includes('const stored = withHistory(cached, scoreData);'));
    assert.ok(s.includes('.set({ aiScore: stored, updatedAt: new Date() })'));
    assert.ok(s.includes('body: JSON.stringify({ ...stored, usingOrgKey })'));
});

// Every object built with an aiScore key in netlify/functions — a write of it.
const aiScoreWrites = (files) => {
    const hits = [];
    for (const [file, src] of files) {
        walk(parse(src, { sourceType: 'module', plugins: ['jsx'] }).program, (n, anc) => {
            if (n.type !== 'ObjectProperty' || n.computed || anc[anc.length - 1].type !== 'ObjectExpression') return;
            const key = n.key.type === 'Identifier' ? n.key.name : n.key.type === 'StringLiteral' ? n.key.value : null;
            if (key === 'aiScore') hits.push(`${file}:${n.loc.start.line}`);
        });
    }
    return hits;
};

test("THE GUARD: a deal's score is written by ai-score.mjs alone — no other function builds an aiScore, the deal's sanitize least of all", () => {
    const dir = 'netlify/functions/';
    const files = readdirSync(new URL(dir, ROOT)).filter((f) => f.endsWith('.mjs')).map((f) => [f, read(dir + f)]);
    assert.ok(files.length > 90, `the function files were read (${files.length})`);
    const hits = aiScoreWrites(files);
    assert.deepEqual(hits.map((h) => h.split(':')[0]), ['ai-score.mjs'], `aiScore built outside ai-score.mjs: ${hits.join(', ')}`);
});

test('the guard finds the shape as it was: the deal sanitize passing the window\'s aiScore through', () => {
    const before = "const sanitize = (data) => ({ id: data.id, comments: data.comments || [], aiScore: data.aiScore ?? null });\nconst { aiScore } = opp;";
    assert.deepEqual(aiScoreWrites([['opportunities.mjs', before]]), ['opportunities.mjs:1'], 'the build, not the destructuring');
});

// ── the deal window ─────────────────────────────────────────────────────────

test("the AI Score tab asks with the deal's id, checks the org before it sets the list, and hands the answer to the window", () => {
    const m = read('src/components/modals/OpportunityModal.jsx');
    const tab = between(m, 'function AiScoreTab({ opportunity, aiScore, onScored, onClose, onUpdate }) {', '\n//  Quotes panel');
    assert.ok(tab.includes('body: JSON.stringify({ opportunityId: dealId, forceRefresh }),'), 'the id the endpoint requires');
    assert.ok(tab.includes('const askedOrg = requestOrg();'));
    assert.ok(tab.indexOf('if (!stillOrg(askedOrg)) return;') > -1
        && tab.indexOf('if (!stillOrg(askedOrg)) return;') < tab.indexOf('setOpportunities(prev => prev.map(o => (o.id === dealId ? { ...o, aiScore: score } : o)));'),
        'the org checked before the list (§18b68)');
    assert.ok(tab.includes('if (data.disabled) { setOff(true); return; }'), 'the switch off, said');
    assert.ok(tab.includes('const score = storedScore(data);') && tab.includes('onScored(score);'));
    assert.ok(tab.includes('<SignalChip key={i} kind={signalKind(s)} text={s.text}/>'));
    assert.ok(tab.includes('const history = Array.isArray(score?.history) ? score.history : [];'));
    assert.ok(tab.includes('an Admin turns it on in Settings → Features &amp; AI'));
    assert.ok(!tab.includes('useEffect('), "nothing asked or copied on open — the window's score is the tab's");
    assert.ok(tab.includes('<GhostBtn onClick={() => fetchScore(true)}>↻ Refresh score</GhostBtn>'));
    assert.ok(tab.includes('<PrimaryBtn type="button" onClick={() => fetchScore(false)}>Score this deal</PrimaryBtn>'));
});

test("the window keeps the deal's score — the one it opened with, or the one just asked for — and the rail and the tab read it", () => {
    const m = read('src/components/modals/OpportunityModal.jsx');
    assert.ok(m.includes('const aiScore = (scoredNow && scoredNow.id === opportunity?.id) ? scoredNow.score : (opportunity?.aiScore || null);'));
    assert.ok(m.includes('const aiOn = !!settings?.aiScoringEnabled;'));
    assert.ok(m.includes('onScored={(score) => setScoredNow({ id: opportunity.id, score })}'));
    assert.ok(m.includes('<AiScoreTab opportunity={opportunity} aiScore={aiScore}'));
    assert.ok(m.includes('                                            aiScore={aiScore}\n                                            aiOn={aiOn}'), 'the rail is handed both');
    const rail = between(m, 'function RightRail(', '{/* ── Buying committee');
    assert.ok(rail.includes('const aiSignals = aiScore?.signals || [];'));
    assert.ok(rail.includes('{(aiOn || aiScore) && ('), 'no score and the switch off: no AI read');
    assert.ok(rail.includes('{aiOn && ('), 'the full analysis only where the tab is offered');
    assert.ok(rail.includes('<SignalChip key={i} kind={signalKind(s)} text={s.text}/>'));
    assert.ok(m.includes("...(settings?.aiScoringEnabled ? [{ id: 'ai-score', label: 'AI Score' }] : []),"), 'the tab offered by the switch');
});

test("every detail tab's Save saves the deal — none submits the form a detail tab unmounts; a missing field opens the form", () => {
    const m = read('src/components/modals/OpportunityModal.jsx');
    assert.equal(count(m, "document.getElementById('opp-form')"), 0);
    assert.equal(count(m, 'onUpdate={saveDeal}/>'), 2, 'the History and AI Score tabs');
    assert.ok(m.includes('const handleSubmit = (e) => { e.preventDefault(); saveDeal(); };'), "the form's own Save, the same");
    const save = between(m, 'const saveDeal = () => {', 'const handleSubmit = ');
    const at = save.indexOf('setDetailTab(null);');
    assert.ok(at > save.indexOf('setValidationErrors(errors);') && at < save.indexOf('return;'), 'the errors show where their fields are');
    assert.ok(save.includes('onSave({ ...formData, account: resolvedAccount.name, accountId: resolvedAccount.id,'));
});

test('the switch: "Claude scores deals" in Settings → Features & AI, saved as aiScoringEnabled — both halves of settings.mjs, off by default', () => {
    const f = read('src/Tabs/settings/data/FeaturesDetail.jsx');
    assert.ok(f.includes('const [aiScoring, setAiScoring] = React.useState(false);'));
    assert.ok(f.includes('setAiScoring(settings.aiScoringEnabled === true);'), 'read from the settings prop, never self-fetched');
    assert.equal(count(f, '                aiScoringEnabled: aiScoring,\n'), 2, 'saved with the panel, and on the settings after');
    assert.ok(f.includes('onClick={() => { setAiScoring(v => !v); setDirty(true); }} role="switch" aria-checked={aiScoring}'));
    assert.ok(f.includes('Claude scores deals'));
    const s = read('netlify/functions/settings.mjs');
    assert.equal(count(s, 'aiScoringEnabled:'), 2, 'the GET projection AND the PUT whitelist (18b12)');
    assert.ok(read('src/utils/settingsDefaults.js').includes('    aiScoringEnabled: false,'), 'off by default');
    assert.ok(read('src/Tabs/PipelineTab.jsx').includes('{settings?.aiScoringEnabled && ('), "the Pipeline's Score all deals, by the same switch");
});
