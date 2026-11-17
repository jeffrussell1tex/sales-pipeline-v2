// tests/ai-explain.test.mjs — Claude explains the win chance (AI scoring batch 2B; docs/design/deal-score/DESIGN-2B.md —
// Jeff, 17 Nov: Q1 "Now, every org", Q2 "Screens and reports", Q3 "Say so, Refresh asks", Q4 "Take it out"). The kept
// explanation's shape, Claude's own earlier scores apart, a moved number said, the report's Win chance, and THE GUARD: no
// screen reads Claude's number as the deal's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { isExplanation, storedScore, withHistory, earlierScoresOf, movedWords } from '../src/utils/aiScore.js';
import { formatMetric } from '../src/utils/reportQuery.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');

const EXPL = Object.freeze({ headline: 'Quiet since the demo', signals: [{ text: 'No activity in 20 days', sentiment: 'negative' }], recommendation: 'Call Priya',
    model: 'claude-haiku-5-5', scoredAt: '2026-11-17T18:00:00.000Z', explains: { score: 42, status: 'At Risk', scoredAt: '2026-11-17T17:59:00.000Z' } });
const OWN = Object.freeze({ score: 70, verdict: 'On Track', headline: 'Own', signals: [], recommendation: 'r', scoredAt: '2026-11-01T00:00:00.000Z',
    history: [{ score: 60, verdict: 'At Risk', scoredAt: '2026-10-01T00:00:00.000Z' }] });

test('an explanation is one: it names the win chance it explained', () => {
    assert.equal(isExplanation(EXPL), true);
    assert.equal(isExplanation(OWN), false, 'Claude\'s own score from before 2B');
    assert.equal(isExplanation({ explains: { score: 'x' } }), false);
    assert.equal(isExplanation(null), false);
});

test('what the deal keeps: the explanation less its transport fields — the win chance it rode with is set on the deal, never kept here', () => {
    assert.deepEqual(storedScore({ ...EXPL, fromCache: true, usingOrgKey: false, winChance: { score: 42 } }), EXPL);
    assert.deepEqual(storedScore({ ...OWN }), { ...OWN }, 'a score from before 2B still reads');
    assert.equal(storedScore({ headline: 'no number, no explains' }), null);
    assert.equal(storedScore({ disabled: true }), null);
});

test('Claude\'s own earlier scores stay its own: an explanation never enters the history, and a kept own score heads it', () => {
    const next = withHistory(OWN, EXPL);
    assert.deepEqual(next.history.map((h) => h.score), [70, 60], 'the own score it replaced, then its history');
    const again = withHistory(next, { ...EXPL, headline: 'again' });
    assert.deepEqual(again.history.map((h) => h.score), [70, 60], 'REGRESSION: an explanation put into the history of scores');
    assert.deepEqual(earlierScoresOf(OWN).map((h) => h.score), [70, 60], 'a kept own score shows as earlier, never as the number');
    assert.deepEqual(earlierScoresOf(again).map((h) => h.score), [70, 60]);
    assert.deepEqual(earlierScoresOf(null), []);
});

test('a number moved since it was explained is said, with Refresh to ask again (Q3); the same number says nothing', () => {
    assert.equal(movedWords(EXPL, { dealScore: { score: 50 } }), 'Explained at 42% — now 50%. Refresh to have Claude explain it again.');
    assert.equal(movedWords(EXPL, { dealScore: { score: 42 } }), null);
    assert.equal(movedWords(EXPL, { dealScore: null }), null, 'nothing to compare');
    assert.equal(movedWords(OWN, { dealScore: { score: 10 } }), null, 'Claude\'s own score explains nothing');
});

test('reports gain Win chance — the deal\'s kept score, a percent; "health score" asks for it (Q2)', () => {
    const q = read('src/utils/reportQuery.js');
    assert.ok(q.includes("    M('win_chance',    'Win chance',     'avg',    (o) => (o.dealScore && Number.isFinite(Number(o.dealScore.score)) ? Number(o.dealScore.score) : null), 'percent', true),"));
    assert.equal(formatMetric(41.6, 'percent'), '42%');
    const p = read('src/utils/reportPrompt.js');
    assert.ok(p.includes("        ['win_chance',    /\\b(win chance|win %|win percent(?:age)?|chance of winning|health score|deal health)\\b/],"));
    assert.ok(p.indexOf("['win_chance',") < p.indexOf("['ai_score',"), 'read before the AI score');
    assert.ok(!/\['ai_score',[^\n]*health score/.test(p), 'REGRESSION: "health score" asks for Claude\'s own number');
});

test('ai-score.mjs explains the win chance as it stands: worked out first, a closed deal refused before anything is sent, only an explanation answers from the cache', () => {
    const s = code(read('netlify/functions/ai-score.mjs'));
    const closedAt = s.indexOf("if (opp.stage === 'Closed Won' || opp.stage === 'Closed Lost') return { statusCode: 400");
    const winAt = s.indexOf('const win = (await rescoreDeals(orgId, [opportunityId]))[opportunityId] || opp.dealScore || null;');
    const cacheAt = s.indexOf('if (!forceRefresh && isExplanation(cached) && cached?.scoredAt) {');
    const askAt = s.indexOf('const attempts = [{ model, outcome: await ask(model) }];');
    assert.ok(closedAt > -1 && winAt > closedAt && cacheAt > winAt && askAt > cacheAt, 'closed refused, the number worked out, the cache, then Claude');
    assert.ok(s.includes('Do not give your own score or change the number.'));
    assert.ok(s.includes('Never state a different percentage or score.'));
    assert.ok(!/parsed\.(score|verdict)/.test(s), 'no number of Claude\'s own read');
});

test('the public API keeps its shape until 2C: Claude\'s stored own score and verdict, else null — never an empty object for an explanation', () => {
    const s = code(read('netlify/functions/public-api.mjs'));
    assert.ok(s.includes('ai_score:            r.aiScore && Number.isFinite(Number(r.aiScore.score)) ? { score: r.aiScore.score, verdict: r.aiScore.verdict } : null,'));
});

// THE GUARD (Q1, Q2): no screen reads Claude's number as the deal's — the deal window lists it as Claude's earlier, and
// the report's 'AI score' metric reads the stored ones. Anything else naming aiScore.score / aiScore?.score fails here.
test('THE GUARD: no screen reads Claude\'s own number as the deal\'s', () => {
    const walk = (dir) => readdirSync(new URL(dir, ROOT), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}${e.name}/`) : /\.(jsx?|mjs)$/.test(e.name) ? [`${dir}${e.name}`] : []));
    const ALLOWED = new Map([
        ['src/utils/reportQuery.js', "the 'AI score' metric: Claude's stored own scores, kept for history (2B, Q2)"],
    ]);
    const hits = [];
    for (const f of walk('src/')) {
        if (/aiScore\??\.score\b|\.aiScore\.score\b|aiNumber/.test(code(read(f))) && !ALLOWED.has(f)) hits.push(f);
    }
    assert.deepEqual(hits, [], 'a screen reading Claude\'s number as the deal\'s — the win chance is the number (dealScoreOf)');
    for (const f of ALLOWED.keys()) assert.ok(/aiScore/.test(read(f)), `stale allowance: ${f}`);
    // The scan sees the shape.
    assert.ok(/aiScore\??\.score\b/.test('opp.aiScore?.score || 0'));
});
