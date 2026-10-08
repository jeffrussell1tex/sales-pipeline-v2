// src/utils/aiScore.js
//
// A deal's AI score (state §0.188): the shape ai-score.mjs keeps on the deal
// (`aiScore`) and answers, and what the deal window reads from it. Pure, so the
// server and the screens share one shape and node --test can reach it.
//
// Kept on the deal:
//   { score, verdict, headline, signals: [{ text, sentiment }], recommendation,
//     scoredAt, history: [{ score, verdict, scoredAt }] }
// An answer adds transport flags — fromCache, usingOrgKey — the deal does not keep;
// with the org's switch off it is { disabled: true } and carries no score.

export const VERDICTS = ['Strong', 'On Track', 'At Risk', 'Critical'];

// The earlier scores a deal keeps, newest first.
export const HISTORY_KEPT = 4;

const earlierOf = (s) => (s && Number.isFinite(Number(s.score)) && s.scoredAt
    ? { score: Number(s.score), verdict: s.verdict || null, scoredAt: s.scoredAt }
    : null);

// The score a new scoring keeps: the new one, the score it replaces at the head of
// its history — earlier scores, newest first, at most HISTORY_KEPT. Nothing kept a
// history before: the window read one from a field no deal had.
export function withHistory(prev, next) {
    const earlier = [earlierOf(prev), ...(Array.isArray(prev?.history) ? prev.history.map(earlierOf) : [])]
        .filter(Boolean);
    return { ...next, history: earlier.slice(0, HISTORY_KEPT) };
}

// What the deal keeps from an answer: the score without its transport flags, or
// null for an answer that carries none (the switch off, an error's body).
export function storedScore(answer) {
    if (!answer || typeof answer !== 'object' || !Number.isFinite(Number(answer.score))) return null;
    const { fromCache: _c, usingOrgKey: _k, disabled: _d, ...kept } = answer;
    return kept;
}

// A signal's chip in the deal window, by the sentiment ai-score.mjs stores: the window
// read a `kind` no signal has, so every signal showed as neutral.
const KIND = { positive: 'positive', warning: 'warning', negative: 'risk' };
export const signalKind = (signal) => KIND[signal?.sentiment] || 'neutral';
