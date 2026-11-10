// tests/ai-models.test.mjs — AI scoring batch 1 (state §0.238; docs/design/ai-scoring; OPEN_ITEMS §3.1).
//
// The AI score uses the Admin's model from one list, asks the fallback once when the first answer is busy,
// missing, refused or unreadable, keeps the model on the score and names every attempt in one audit row;
// "Available to" is an allowlist on scoring and the report builder's Ask AI; the token budget and the panel's
// mock AI controls came out. The rules run here; the wiring of each file that reads them is pinned.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import {
    AI_MODELS, DEFAULT_MODEL, DEFAULT_FALLBACK, isAiModel, modelLabel, modelOf, fallbackOf,
    AI_ACCESS, aiAccessOf, mayUseAi, aiAccessWords, aiSettingsRefused, RETIRED_AI_FIELDS, aiSettingsToSave,
} from '../src/utils/aiModels.js';
import { ATTEMPT_MS, BUDGET_MS, MIN_ATTEMPT_MS, attemptTime, SCORE_SCHEMA, scoreRequestBody, attemptOutcome, causeWords } from '../src/utils/aiCall.js';
import { withHistory, cutAtWord } from '../src/utils/aiScore.js';
import { APP_ROLES } from '../src/utils/roles.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const between = (src, from, to) => { const a = src.indexOf(from); assert.ok(a >= 0, from); const b = src.indexOf(to, a + from.length); assert.ok(b > a, to); return src.slice(a, b); };
const count = (src, s) => src.split(s).length - 1;
const before = (src, a, b, why) => { const i = src.indexOf(a), j = src.indexOf(b); assert.ok(i >= 0, a); assert.ok(j >= 0, b); assert.ok(i < j, why || `${a} before ${b}`); };

// ── the list ────────────────────────────────────────────────────────────────

test('the list: the current Haiku, Sonnet and Opus (Jeff, 9 Nov: decision 4); Haiku 5.5 the default, Sonnet 5.5 its fallback (Q2)', () => {
    assert.deepEqual(AI_MODELS.map((m) => m.id), ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5']);
    assert.deepEqual(AI_MODELS.map((m) => m.label), ['Haiku 5.5', 'Sonnet 5.5', 'Opus 5.5']);
    for (const m of AI_MODELS) assert.ok(m.what.length > 20 && !/\$\d/.test(m.what), `${m.label}: words on speed and cost, no price to go stale`);
    assert.equal(DEFAULT_MODEL, 'claude-haiku-5-5');
    assert.equal(DEFAULT_FALLBACK, 'claude-sonnet-5-5');
    assert.ok(isAiModel('claude-opus-5-5'));
    for (const x of ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001', 'claude-opus-5', '', null, undefined, 3, {}]) assert.equal(isAiModel(x), false, String(x));
    assert.equal(modelLabel('claude-sonnet-5-5'), 'Sonnet 5.5');
    assert.equal(modelLabel('claude-haiku-4-5-20251001'), 'claude-haiku-4-5-20251001', 'a score from before the list names its id');
    assert.equal(modelLabel(undefined), '');
});

test('modelOf / fallbackOf: a stored id on the list runs; an old id, junk or nothing runs as the default (Q2 "Default, Haiku 5.5")', () => {
    assert.equal(modelOf({ model: 'claude-opus-5-5' }), 'claude-opus-5-5');
    assert.equal(modelOf({ model: 'claude-sonnet-4-6' }), DEFAULT_MODEL, 'what a panel nobody chose in stored');
    assert.equal(modelOf({ model: 'claude-opus-4-6' }), DEFAULT_MODEL, 'not its 5.5 sibling (Q2 b, not chosen)');
    for (const blob of [null, undefined, {}, 'claude-opus-5-5', ['claude-opus-5-5'], { model: 42 }]) assert.equal(modelOf(blob), DEFAULT_MODEL, JSON.stringify(blob));
    assert.equal(fallbackOf({ fallback: 'claude-haiku-5-5' }), 'claude-haiku-5-5');
    assert.equal(fallbackOf({ fallback: 'claude-haiku-4-5-20251001' }), DEFAULT_FALLBACK);
    assert.equal(fallbackOf(null), DEFAULT_FALLBACK);
});

// ── "Available to" ──────────────────────────────────────────────────────────

test('"Available to": an allowlist of roles by the stored label; absent is All roles; anything else Admin only; no reader, technician or dispatcher ever', () => {
    const may = (availableTo) => APP_ROLES.filter((r) => mayUseAi(r, availableTo === undefined ? {} : { availableTo }));
    assert.deepEqual(may('All roles'), ['Admin', 'Manager', 'User']);
    assert.deepEqual(may('Admin + Manager only'), ['Admin', 'Manager']);
    assert.deepEqual(may('Admin only'), ['Admin']);
    assert.deepEqual(may(undefined), ['Admin', 'Manager', 'User'], 'never saved: All roles, as the panel always showed');
    assert.deepEqual(APP_ROLES.filter((r) => mayUseAi(r, null)), ['Admin', 'Manager', 'User'], 'no blob at all');
    assert.deepEqual(may(''), ['Admin', 'Manager', 'User']);
    assert.deepEqual(may('Everyone'), ['Admin'], 'a value the list does not hold: closed, an Admin can still fix it');
    assert.deepEqual(may('all roles'), ['Admin'], 'by the exact label');
    assert.equal(mayUseAi(undefined, {}), false, 'no role, no asking');
    assert.equal(mayUseAi('Sales Rep', {}), false, 'the label is not the stored role');
    assert.deepEqual(AI_ACCESS.map((a) => a.value), ['All roles', 'Admin + Manager only', 'Admin only']);
    assert.equal(aiAccessOf({ availableTo: 'Admin only' }).who, 'Admins');
    assert.equal(aiAccessWords({ availableTo: 'Admin + Manager only' }), 'AI in this workspace is open to Admins and Managers.');
});

// ── the settings PUT's rule and the panel's save ────────────────────────────

test("the PUT's rule: a model, fallback or \"Available to\" named anew must be on the list; one the row holds is never asked again", () => {
    const held = { model: 'claude-sonnet-4-6', fallback: 'claude-haiku-4-5-20251001', availableTo: 'All roles', byok: false };
    assert.equal(aiSettingsRefused({ ...held }, held), null, 'an untouched old id still saves');
    assert.equal(aiSettingsRefused({ ...held, model: 'claude-opus-5-5' }, held), null, 'a model on the list');
    assert.deepEqual(aiSettingsRefused({ ...held, model: 'claude-opus-4-6' }, held)?.field, 'aiSettings.model', 'an old id named anew');
    assert.deepEqual(aiSettingsRefused({ ...held, fallback: 'gpt-6' }, held)?.field, 'aiSettings.fallback');
    assert.deepEqual(aiSettingsRefused({ ...held, availableTo: 'Everyone' }, held)?.field, 'aiSettings.availableTo');
    assert.equal(aiSettingsRefused({ ...held, availableTo: 'Admin only' }, held), null);
    assert.equal(aiSettingsRefused({ model: 'claude-haiku-5-5' }, null), null, 'a first save');
    assert.equal(aiSettingsRefused({ byokProvider: 'Anthropic', tone: 'x' }, null), null, 'a blob naming none of the three (settings-revs.itest round-trips these)');
    assert.equal(aiSettingsRefused({ model: null }, held), null, 'a cleared choice reads as the default');
    assert.equal(aiSettingsRefused(null, held), null);
    assert.equal(aiSettingsRefused(['x'], held)?.status, 400);
    assert.equal(aiSettingsRefused('claude-opus-5-5', held)?.field, 'aiSettings');
    assert.ok(aiSettingsRefused({ model: 'x'.repeat(500) }, {}).error.length < 120, 'the words never echo a whole body');
});

test("the panel's save: the model, fallback and \"Available to\" as they run, BYOK as it was, the budget and the mock controls' fields left out", () => {
    assert.deepEqual(RETIRED_AI_FIELDS, ['tokenBudget', 'budgetExceed', 'region', 'trainingOptIn', 'zeroRetention', 'piiRedaction', 'dpaSignedAt', 'auditLogging', 'blockList']);
    const stored = { model: 'claude-sonnet-4-6', fallback: 'claude-haiku-4-5-20251001', region: 'US · us-east-2', tokenBudget: 25000000, trainingOptIn: false,
        zeroRetention: true, piiRedaction: true, byok: true, byokProvider: 'Anthropic', dpaSignedAt: '', auditLogging: 'All AI requests · 13mo retention',
        blockList: '', budgetExceed: 'Throttle to 1 req/s', availableTo: 'Admin + Manager only' };
    assert.deepEqual(aiSettingsToSave(stored), { model: 'claude-haiku-5-5', fallback: 'claude-sonnet-5-5', byok: true, byokProvider: 'Anthropic', availableTo: 'Admin + Manager only' });
    assert.deepEqual(aiSettingsToSave(null), { model: 'claude-haiku-5-5', fallback: 'claude-sonnet-5-5', availableTo: 'All roles' });
    assert.equal(aiSettingsToSave({ availableTo: 'Everyone' }).availableTo, 'Admin only', 'saved as it runs');
    assert.equal(aiSettingsRefused(aiSettingsToSave(stored), stored), null, 'what the panel sends, the PUT takes');
});

// ── one attempt ─────────────────────────────────────────────────────────────

test('the request: the model asked, room for thinking, effort low, JSON that matches the score — no sampling parameters, no thinking switch', () => {
    const body = scoreRequestBody('claude-opus-5-5', 'P');
    assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'output_config']);
    assert.equal(body.model, 'claude-opus-5-5');
    assert.equal(body.max_tokens, 4000);
    assert.deepEqual(body.output_config, { effort: 'low', format: { type: 'json_schema', schema: SCORE_SCHEMA } });
    assert.deepEqual(body.messages, [{ role: 'user', content: 'P' }]);
    assert.deepEqual(SCORE_SCHEMA.required, ['score', 'verdict', 'headline', 'signals', 'recommendation']);
    assert.equal(SCORE_SCHEMA.additionalProperties, false);
    assert.deepEqual(SCORE_SCHEMA.properties.verdict.enum, ['Strong', 'On Track', 'At Risk', 'Critical']);
    assert.equal(SCORE_SCHEMA.properties.signals.items.additionalProperties, false);
    // The function's 60 seconds (Netlify, not configurable): the attempts share BUDGET_MS from the request's start, the
    // rest kept for the reads before and the write and audit row after (the review, 9 Nov).
    assert.ok(BUDGET_MS + 10_000 <= 60_000, 'room left for the write and the audit row');
    assert.equal(attemptTime(1_000), ATTEMPT_MS, 'a first attempt: its own limit');
    assert.equal(attemptTime(30_000), BUDGET_MS - 30_000, 'a fallback after a slow first: what is left');
    assert.ok(attemptTime(45_000) < MIN_ATTEMPT_MS, 'too little left: no fallback');
});

const reply = (content, extra = {}) => ({ status: 200, json: { content, stop_reason: 'end_turn', ...extra } });
const good = JSON.stringify({ score: 52, verdict: 'At Risk', headline: 'h', signals: [], recommendation: 'r' });

test('what an answer means: a score; or busy, missing, refused, cut short or unreadable — the fallback asked; the key or the request refused — not', () => {
    assert.deepEqual(attemptOutcome(reply([{ type: 'text', text: good }])), { ok: true, parsed: JSON.parse(good) });
    assert.equal(attemptOutcome(reply([{ type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: good }])).ok, true, 'REGRESSION: a thinking block first (content[0].text was read)');
    assert.equal(attemptOutcome(reply([{ type: 'text', text: '```json\n' + good + '\n```' }])).ok, true, 'fenced');
    const o = (x) => { const r = attemptOutcome(x); return [r.ok, r.cause, r.retry]; };
    assert.deepEqual(o({ status: 401, text: '{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}' }), [false, 'key', false]);
    assert.deepEqual(o({ status: 403, text: '' }), [false, 'key', false]);
    assert.deepEqual(o({ status: 404, text: '{"error":{"type":"not_found_error","message":"model: claude-opus-5-5"}}' }), [false, 'model', true]);
    assert.deepEqual(o({ status: 429, text: '' }), [false, 'busy', true]);
    assert.deepEqual(o({ status: 500, text: '' }), [false, 'busy', true]);
    assert.deepEqual(o({ status: 529, text: '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}' }), [false, 'busy', true]);
    assert.deepEqual(o({ status: 400, text: '{"error":{"type":"invalid_request_error","message":"bad"}}' }), [false, 'request', false]);
    assert.deepEqual(o({ status: 413, text: '' }), [false, 'request', false]);
    assert.deepEqual(o(reply([], { stop_reason: 'refusal', stop_details: { category: 'cyber' } })), [false, 'declined', true]);
    assert.deepEqual(o(reply([{ type: 'thinking', thinking: '' }], { stop_reason: 'max_tokens' })), [false, 'unreadable', true]);
    assert.deepEqual(o(reply([{ type: 'text', text: good }], { stop_reason: 'max_tokens' })), [false, 'unreadable', true], 'cut short is not the score whole, even where it parses');
    assert.equal(attemptOutcome(reply([{ type: 'text', text: '{"score": 5' }], { stop_reason: 'max_tokens' })).detail, 'stopped at max_tokens');
    assert.deepEqual(o(reply([{ type: 'thinking', thinking: '' }])), [false, 'unreadable', true], 'no text block');
    assert.deepEqual(o(reply([{ type: 'text', text: 'Here is the score: 52' }])), [false, 'unreadable', true]);
    assert.deepEqual(o(reply([{ type: 'text', text: '[1,2]' }])), [false, 'unreadable', true], 'JSON, but no score object');
    assert.deepEqual(o({ status: 200, json: null }), [false, 'unreadable', true], 'a body that was not JSON');
    const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
    assert.deepEqual(o({ thrown: timeout }), [false, 'busy', true]);
    assert.equal(attemptOutcome({ thrown: timeout }).detail, 'no answer in its time');
    assert.deepEqual(o({ thrown: new TypeError('fetch failed') }), [false, 'busy', true]);
    assert.equal(attemptOutcome({ status: 529, text: '{"error":{"type":"overloaded_error","message":"Overloaded"}}' }).detail, '529 overloaded_error: Overloaded');
    assert.equal(attemptOutcome(reply([], { stop_reason: 'refusal', stop_details: { category: 'cyber' } })).detail, 'declined (cyber)');
});

test('a cause never carries a key, and says its words — the key, busy, the model by name, declined, unreadable, the request', () => {
    const r = attemptOutcome({ status: 401, text: '{"error":{"type":"authentication_error","message":"key sk-ant-api03-AbC_123-xyz is invalid"}}' });
    assert.ok(!r.detail.includes('sk-ant'), r.detail);
    assert.ok(r.detail.includes('[key]'));
    assert.ok(attemptOutcome({ status: 500, text: 'x'.repeat(2000) }).detail.length < 200, 'a cause is short');
    assert.match(causeWords('key'), /key was refused/);
    assert.match(causeWords('busy'), /busy/);
    assert.equal(causeWords('model', 'Opus 5.5'), "This workspace's AI key can't use Opus 5.5 — an Admin can choose another in Settings → Features & AI.");
    assert.match(causeWords('declined'), /declined/);
    assert.match(causeWords('unreadable'), /couldn't be read/);
    assert.match(causeWords('request'), /tell your administrator/);
    assert.match(causeWords(undefined), /tell your administrator/);
});

// ── what a score keeps ──────────────────────────────────────────────────────

test("cutAtWord: text that fits is kept; longer ends at its last whole word, never mid-word (OPEN_ITEMS §4.2: \"…legal team. Confir\")", () => {
    assert.equal(cutAtWord('short text', 120), 'short text');
    assert.equal(cutAtWord('  padded  ', 120), 'padded');
    const long = 'Schedule a specific check-in with the legal team. Confirm the close date with the CFO this week.';
    const out = cutAtWord(long, 60);
    assert.ok(out.length <= 60, out);
    assert.ok(out.endsWith('…'));
    assert.ok(long.startsWith(out.slice(0, -1)), 'a prefix of the text');
    assert.ok(/\w…$/.test(out) && long[out.length - 1] === ' ', `ends at a word: ${out}`);
    assert.equal(cutAtWord('one, two, three, four', 12), 'one, two…', 'no dangling comma');
    const word = 'x'.repeat(200);
    assert.equal(cutAtWord(word, 100).length, 100, 'one long word: cut, within the cap');
    assert.equal(cutAtWord(undefined, 10), '');
    assert.equal(cutAtWord(7, 10), '');
});

test('the score keeps its model; an earlier score keeps the model that made it — one from before the list keeps none', () => {
    const next = { score: 61, verdict: 'On Track', model: 'claude-haiku-5-5', scoredAt: '2026-11-09T12:00:00.000Z' };
    const prev = { score: 50, verdict: 'At Risk', model: 'claude-sonnet-5-5', scoredAt: '2026-11-08T12:00:00.000Z',
        history: [{ score: 40, verdict: 'Critical', scoredAt: '2026-11-07T12:00:00.000Z' }] };
    const out = withHistory(prev, next);
    assert.equal(out.model, 'claude-haiku-5-5');
    assert.deepEqual(out.history, [
        { score: 50, verdict: 'At Risk', scoredAt: '2026-11-08T12:00:00.000Z', model: 'claude-sonnet-5-5' },
        { score: 40, verdict: 'Critical', scoredAt: '2026-11-07T12:00:00.000Z' },
    ]);
    assert.ok(!('model' in withHistory({ score: 1, scoredAt: 'x', model: '' }, next).history[0]), 'an empty model is none');
});

// ── THE GUARD: one list ─────────────────────────────────────────────────────

const MODEL_ID = /claude-(?:haiku|sonnet|opus|fable|mythos)-\d[\w-]*/g;
const filesUnder = (dir) => readdirSync(new URL(dir, ROOT)).flatMap((f) => {
    const p = `${dir}${f}`;
    if (statSync(new URL(p, ROOT)).isDirectory()) return filesUnder(`${p}/`);
    return /\.(m?js|jsx)$/.test(f) ? [p] : [];
});
// Ids outside the list, each named with its reason.
const NAMED = {
    'netlify/functions/_reportPromptShape.mjs': ['claude-opus-5'],   // Ask AI's own model (Jeff, 9 Nov, Q1: the model choice covers scoring only)
};
const strayIds = (files) => files.flatMap(([file, src]) => {
    if (file === 'src/utils/aiModels.js') return [];
    const ids = (src.replace(/\/\/.*$/gm, '').match(MODEL_ID) || []).filter((id) => !(NAMED[file] || []).includes(id));
    return ids.map((id) => `${file}: ${id}`);
});

test('THE GUARD: no model id is written in netlify/functions or src outside src/utils/aiModels.js — Ask AI\'s own model named with its reason', () => {
    const files = [...filesUnder('netlify/functions/'), ...filesUnder('src/')].map((f) => [f, read(f)]);
    assert.ok(files.length > 200, `the files were read (${files.length})`);
    assert.deepEqual(strayIds(files), []);
    for (const [file, ids] of Object.entries(NAMED)) for (const id of ids) assert.ok(read(file).includes(`'${id}'`), `${file} still holds ${id}, or the name goes`);
});

test('the guard finds what it was written for: the scorer as it was, and the panel\'s old options', () => {
    assert.deepEqual(strayIds([['netlify/functions/ai-score.mjs', "body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 600 })"]]), ['netlify/functions/ai-score.mjs: claude-haiku-4-5-20251001']);
    assert.deepEqual(strayIds([['src/Tabs/settings/data/FeaturesDetail.jsx', '<option value="claude-opus-4-6">']]), ['src/Tabs/settings/data/FeaturesDetail.jsx: claude-opus-4-6']);
    assert.deepEqual(strayIds([['src/x.js', "// once 'claude-opus-4-6'"]]), [], 'a comment is not a request');
});

// ── the scorer's wiring (ai-score.mjs) ──────────────────────────────────────

test('ai-score.mjs: "Available to" after the deal is yours and before the key — no cached score for a role it leaves out (Q3)', () => {
    const s = read('netlify/functions/ai-score.mjs');
    assert.ok(s.includes("import { modelOf, fallbackOf, modelLabel, mayUseAi, aiAccessWords } from '../../src/utils/aiModels.js';"));
    assert.ok(s.includes("import { MIN_ATTEMPT_MS, attemptTime, scoreRequestBody, attemptOutcome, causeWords } from '../../src/utils/aiCall.js';"));
    const gate = "if (!mayUseAi(auth.userRole, aiSettings)) return { statusCode: 403, headers, body: JSON.stringify({ error: aiAccessWords(aiSettings), code: 'ai_role' }) };";
    assert.ok(s.includes('const aiSettings = orgSettingsRow?.extra?.aiSettings;'), "this org's own settings row");
    before(s, 'if (notYours) return notYours;', gate, 'the deal is yours first');
    before(s, gate, 'if (!apiKey)', 'before the key, so a refused role learns nothing of the setup');
    before(s, gate, 'const cached = opp.aiScore;', 'and before the cached score (Q3)');
});

test('ai-score.mjs: the Admin\'s model, then once more on the fallback — the same key and prompt; no fallback after a refused key or request', () => {
    const s = read('netlify/functions/ai-score.mjs');
    const ask = between(s, 'const ask = async (m) => {', '\n        };\n');
    assert.equal(count(s, "fetch('https://api.anthropic.com/v1/messages'"), 1, 'one request site, run per attempt');
    assert.ok(ask.includes("'x-api-key': apiKey,"), 'the one key resolved for this org');
    assert.ok(ask.includes("'anthropic-version': '2023-06-01',"));
    assert.ok(ask.includes('body: JSON.stringify(scoreRequestBody(m, prompt)),'), 'the same prompt each time');
    assert.ok(ask.includes('signal: AbortSignal.timeout(attemptTime(Date.now() - startedAt)),'), 'each attempt has its time, inside the budget');
    assert.ok(s.indexOf('const startedAt = Date.now();') < s.indexOf('const auth = await verifyAuth(event);'), "the budget counts from the request's start");
    assert.ok(ask.includes("if (e?.name === 'TimeoutError' || e?.name === 'AbortError') throw e; return null;"), 'a body cut by the time is busy, not unreadable');
    assert.ok(ask.includes('catch (thrown) {\n                return attemptOutcome({ thrown });'), 'a network failure is an outcome, not a 500');
    assert.ok(s.includes('const model = modelOf(aiSettings);') && s.includes('const fallback = fallbackOf(aiSettings);'));
    assert.ok(s.includes('const attempts = [{ model, outcome: await ask(model) }];'));
    assert.ok(s.includes('if (!attempts[0].outcome.ok && attempts[0].outcome.retry && attemptTime(Date.now() - startedAt) >= MIN_ATTEMPT_MS) attempts.push({ model: fallback, outcome: await ask(fallback) });'), 'once, where the cause allows and the time holds an attempt');
    assert.ok(s.includes('score:          Number.isFinite(parseInt(parsed.score, 10)) ? Math.max(0, Math.min(100, parseInt(parsed.score, 10))) : 50,'), 'a score of 0 is kept as 0');
    assert.ok(!/model:\s*'claude-/.test(s), 'no model written in the request');
});

test('ai-score.mjs: no score — 502 with the cause in words, after the audit row; a score keeps its model, each text cut at a word', () => {
    const s = read('netlify/functions/ai-score.mjs');
    const fail = between(s, 'if (!last.outcome.ok) {', 'const parsed = last.outcome.parsed;');
    before(fail, "action: 'ai.deal_score_failed'", 'return { statusCode: 502', 'the log first, then the answer');
    assert.ok(fail.includes("body: JSON.stringify({ error: causeWords(last.outcome.cause, modelLabel(last.model)), cause: last.outcome.cause })"));
    assert.ok(!s.includes('AI scoring service unavailable'), 'REGRESSION (OPEN_ITEMS §4.2): every failure said the same');
    assert.ok(s.includes('headline:       cutAtWord(parsed.headline, 120),'));
    assert.ok(s.includes('text:      cutAtWord(s?.text, 100),'));
    assert.ok(s.includes('recommendation: cutAtWord(parsed.recommendation, 150),'));
    assert.ok(s.includes('model:          last.model,'), 'the model that answered');
    assert.ok(!/\.slice\(0, (100|120|150)\)/.test(s), 'no cut mid-word left');
});

// ── the other readers ───────────────────────────────────────────────────────

test('settings.mjs: a model, fallback or "Available to" named anew off the list is refused before anything is written', () => {
    const s = read('netlify/functions/settings.mjs');
    assert.ok(s.includes("import { aiSettingsRefused } from '../../src/utils/aiModels.js';"));
    const rule = "const aiRefused = 'aiSettings' in data ? aiSettingsRefused(data.aiSettings, existingExtra.aiSettings) : null;";
    assert.ok(s.includes(rule), 'against the row as stored');
    assert.ok(s.includes('if (aiRefused) return { statusCode: aiRefused.status, headers, body: JSON.stringify({ error: aiRefused.error, field: aiRefused.field }) };'));
    before(s, rule, 'const linked = await checkSettingsLinks(data, existingExtra, orgId);');
    before(s, rule, 'const extra = {');
});

test("report-prompt.mjs: \"Available to\" covers Ask AI (Q1) — a role it leaves out sends nothing and gets the built-in reader; the model stays its own", () => {
    const s = read('netlify/functions/report-prompt.mjs');
    const gate = "if (!mayUseAi(auth.userRole, row?.extra?.aiSettings)) return answer(200, { unavailable: true, reason: 'role' });";
    assert.ok(s.includes("import { mayUseAi } from '../../src/utils/aiModels.js';"));
    before(s, "if (!(row?.extra?.aiReportPromptsEnabled === true)) return answer(200, { unavailable: true, reason: 'off' });", gate);
    before(s, gate, 'const { apiKey, usingOrgKey } = resolveAnthropicKey(row?.extra);', 'before the key');
    before(s, gate, "await fetch('https://api.anthropic.com/v1/messages'", 'nothing sent');
    assert.ok(s.includes('model: REPORT_PROMPT_MODEL,'), 'its own model (Q1)');
    const r = read('src/Tabs/ReportsTab.jsx');
    const apply = between(r, 'const applyPrompt = async (text) => {', 'if (!reading) {');
    before(apply, 'const aiOpen = mayUseAi(aiRole, settings?.aiSettings);', "dbFetch('/.netlify/functions/report-prompt'", 'the screen asks only where it may');
    assert.ok(apply.includes("if (settings?.aiReportPromptsEnabled === true && !aiOpen) {"));
    assert.ok(apply.includes("else if (data.unavailable && data.reason === 'role')"), "the server's refusal read too");
    assert.ok(apply.includes("extraNotes.push(aiOpen ? PROMPT_AI_AVAILABLE_NOTE : 'Read by the built-in interpreter.');"), 'switch off: only one who may ask is told an Admin can turn it on');
    assert.ok(r.includes('const { userRole: aiRole } = useApp();'));
});

test('ai-models.mjs: an Admin\'s; this org\'s key, asked now, nothing cached; ids of the list only, never the key', () => {
    const s = read('netlify/functions/ai-models.mjs');
    assert.ok(s.includes("const forbidden = requireRole(auth, ['Admin'], headers);"));
    assert.ok(s.includes('.from(settingsTable).where(eq(settingsTable.orgId, auth.orgId)).limit(1);'), "this org's row");
    assert.ok(s.includes('const { apiKey, usingOrgKey } = resolveAnthropicKey(row?.extra);'), 'the key a score would use');
    assert.ok(s.includes("callable: AI_MODELS.map((m) => m.id).filter((id) => ids.has(id))"), 'the list, filtered');
    const top = s.slice(s.indexOf('const answer ='), s.indexOf('export const handler'));
    assert.ok(!/\b(let|var)\b|new Map|new Set/.test(top), 'no module-level state to carry one org\'s answer to another');
    assert.equal(count(s, 'apiKey'), 3, 'the key: resolved, checked, sent — never answered');
});

test('the Features panel: the list\'s models, each marked by the key check; "Available to" as it runs; the budget and the mock controls gone', () => {
    const f = read('src/Tabs/settings/data/FeaturesDetail.jsx');
    assert.ok(f.includes("import { AI_MODELS, AI_ACCESS, modelOf, fallbackOf, aiAccessOf, modelLabel, aiSettingsToSave } from '../../../utils/aiModels.js';"));
    assert.equal(count(f, '{AI_MODELS.map(m => <option key={m.id} value={m.id} disabled={uncallable(m.id)}>'), 2, 'Model and Fallback');
    assert.ok(f.includes('<select style={selSt} value={modelOf(aiSettings)}'), 'the model as it runs (Q2)');
    assert.ok(f.includes('<select style={selSt} value={fallbackOf(aiSettings)}'));
    assert.ok(f.includes('<select style={selSt} value={aiAccessOf(aiSettings).value}'));
    assert.ok(f.includes("dbFetch('/.netlify/functions/ai-models')"), 'the key check, as the panel opens');
    const check = between(f, "dbFetch('/.netlify/functions/ai-models')", '}, [settings?.anthropicApiKeySet, settings?.anthropicApiKeyLast4]);');   // asked again when a save changes the key (the review, 9 Nov)
    assert.ok(check.includes('if (stillOrg(askedOrg) && data) setKeyCheck(data);'), 'after an org switch it changes nothing');
    assert.ok(f.includes('const aiSent = aiSettingsToSave(aiSettings);'));
    assert.equal(count(f, 'aiSettings: aiSent,'), 2, 'sent, and on the settings after');
    // The code, without its comments (which say what came out and why).
    const code = f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');
    for (const gone of ['Daily token budget', 'On budget exceed', 'tokenBudget', 'Zero data retention', 'PII redaction', 'Training opt-out', 'Data Residency', 'DPA signed', 'Block list', 'Audit logging', 'Reset training data', 'aiRegion', 'us-east-2', 'zeroRetention', 'piiRedaction'])
        assert.ok(!code.includes(gone), `gone: ${gone}`);
    assert.ok(f.includes('BYOK (bring your own key)'), 'the own key stays');
    assert.ok(f.includes("to Claude ${modelLabel(modelOf(aiSettings))}"), 'the switch names the model');
});

test('Score all deals: offered by "Available to"; keeps the score as the window does; says what went unscored; the button back after an org switch', () => {
    const p = read('src/Tabs/PipelineTab.jsx');
    const bulk = between(p, 'const handleBulkScore = async () => {', '// ── Export CSV');
    assert.ok(bulk.includes('const score = res.ok ? storedScore(data) : null;'), 'REGRESSION: a refusal counted as done, transport flags kept');
    assert.ok(bulk.includes('setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, aiScore: score } : o));'));
    assert.ok(bulk.includes('if (kept < active.length) setBulkScoreNote(`Scored ${kept} of ${active.length} deals. ${firstCause}`);'));
    before(bulk, '} finally {', 'setBulkScoring(false);', 'the button comes back however the loop ends');
    assert.ok(p.includes('{bulkScoreNote && !bulkScoring && ('));
});
