// src/utils/aiScore.js
//
// A deal's AI read (state §0.188; since AI scoring batch 2B, §0.257): what ai-score.mjs keeps on the deal (`aiScore`)
// and answers, and what the deal window reads from it. Pure, so the server and the screens share one shape and
// node --test can reach it.
//
// Kept on the deal since 2B — Claude's explanation of the deal's win chance (Jeff, 17 Nov, Q1: Claude's own number
// retires now, for every org):
//   { headline, signals: [{ text, sentiment }], recommendation, model, scoredAt,
//     explains: { score, status, scoredAt }, history: [{ score, verdict, scoredAt, model? }] }
// `explains` is the win chance it explained (the deal's dealScore as it stood — src/utils/dealScore.js). Before 2B a
// deal kept Claude's own score instead: { score, verdict, headline, signals, recommendation, scoredAt, history } — such
// a score still reads, as Claude's own, earlier (`earlierScoresOf`). `history` holds Claude's own earlier scores only.
// An answer adds transport fields — fromCache, usingOrgKey (until §0.293), and since 2B winChance (the win chance it explained, which the
// screen sets on the deal itself) — the deal's aiScore does not keep; with the org's switch off it is
// { disabled: true } and carries nothing.

export const VERDICTS = ['Strong', 'On Track', 'At Risk', 'Critical'];

// The earlier scores a deal keeps, newest first.
export const HISTORY_KEPT = 4;

// An earlier score keeps the model that made it (state §0.238), when it names one. Only Claude's own numbers are
// earlier scores: an explanation has none, and leaves the list as it was.
const earlierOf = (s) => (s && Number.isFinite(Number(s.score)) && s.scoredAt
    ? { score: Number(s.score), verdict: s.verdict || null, scoredAt: s.scoredAt, ...(typeof s.model === 'string' && s.model ? { model: s.model } : {}) }
    : null);

// Whether a kept answer is an explanation of a win chance (2B), not Claude's own score.
export const isExplanation = (s) => !!(s && typeof s === 'object' && s.explains && typeof s.explains === 'object' && Number.isFinite(Number(s.explains.score)));

// A score's text, at most `max` characters, ended at its last whole word (state §0.238; OPEN_ITEMS §4.2:
// "…schedule specific check-in with legal team. Confir"). Text that fits is kept as it is.
export function cutAtWord(text, max) {
    const s = typeof text === 'string' ? text.trim() : '';
    if (s.length <= max) return s;
    const cut = s.slice(0, max - 1);
    const space = cut.lastIndexOf(' ');
    const base = (space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.—–-]+$/, '');
    return base + '…';
}

// The answer a new reading keeps: the new one, the score it replaces at the head of its history when that was Claude's
// own — earlier scores, newest first, at most HISTORY_KEPT. Nothing kept a history before §0.188.
export function withHistory(prev, next) {
    const earlier = [earlierOf(prev), ...(Array.isArray(prev?.history) ? prev.history.map(earlierOf) : [])]
        .filter(Boolean);
    return { ...next, history: earlier.slice(0, HISTORY_KEPT) };
}

// What the deal keeps from an answer: the explanation (or a score from before 2B) without its transport flags, or null
// for an answer that carries neither (the switch off, an error's body).
export function storedScore(answer) {
    if (!answer || typeof answer !== 'object') return null;
    if (!isExplanation(answer) && !Number.isFinite(Number(answer.score))) return null;
    const { fromCache: _c, usingOrgKey: _k, disabled: _d, winChance: _w, ...kept } = answer;
    return kept;
}

// Claude's own earlier scores, newest first: a pre-2B score the deal still keeps, then its history — each shown as
// Claude's, never as the deal's number.
export function earlierScoresOf(aiScore) {
    if (!aiScore || typeof aiScore !== 'object') return [];
    const own = earlierOf(aiScore);   // an explanation carries no number of its own, so earlierOf leaves it out
    return [own, ...(Array.isArray(aiScore.history) ? aiScore.history.map(earlierOf) : [])].filter(Boolean);
}

// Said when the deal's win chance has moved since Claude explained it (Jeff, 17 Nov, Q3: "Say so, Refresh asks") —
// null when it has not, or when there is nothing to compare.
export function movedWords(aiScore, deal) {
    if (!isExplanation(aiScore)) return null;
    const now = Number(deal?.dealScore?.score);
    const then = Number(aiScore.explains.score);
    if (!Number.isFinite(now) || now === then) return null;
    return `Explained at ${then}% — now ${now}%. Refresh to have Claude explain it again.`;
}

// A signal's chip in the deal window, by the sentiment ai-score.mjs stores: the window read a `kind` no signal has,
// so every signal showed as neutral.
const KIND = { positive: 'positive', warning: 'warning', negative: 'risk' };
export const signalKind = (signal) => KIND[signal?.sentiment] || 'neutral';
