// src/utils/taskWrite.js
// A task write's answer (state §0.245, docs/design/refusal-sweep 2a; Jeff's Q3): the ok check first, then the body —
// a refusal said in the server's words with their ref, else "The server returned N." (readRefusal); a request that never
// left said "The server could not be reached." (failureWords); never a parse error's words. A landed answer whose body
// is not JSON is still landed (`task: null` — the screen keeps the copy it sent): the body read before the ok check
// threw there, and the screen rolled back a task the server had completed. Never throws.
//
// Its callers: useTasks' handleCompleteTask (the Tasks tab's ✓ and the task window's Mark Complete) and the Tasks tab's
// Snooze (QRow). `send` makes the request — a dbFetch — and answers its Response.
// unknown (state §0.261, the unknown-save rule): an answer that proves nothing — a throw, a 5xx, a page, a wordless 4xx —
// may have landed; only a 4xx in the server's words (heardRefusal) wrote nothing.
import { refusalWords, failureWords, heardRefusal } from './refusalWords.js';

export const taskWriteAnswer = async (send) => {
    let res;
    try { res = await send(); } catch (e) { return { ok: false, error: failureWords(e), unknown: true }; }
    if (!res.ok) { const body = await res.json().catch(() => null); return { ok: false, error: refusalWords(res, body), unknown: !heardRefusal(res.status, body) }; }
    const data = await res.json().catch(() => null);
    return { ok: true, task: data && data.task ? data.task : null };
};
