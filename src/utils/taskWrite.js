// src/utils/taskWrite.js
// A task write's answer (state §0.245, docs/design/refusal-sweep 2a; Jeff's Q3): the ok check first, then the body —
// a refusal said in the server's words with their ref, else "The server returned N." (readRefusal); a request that never
// left said "The server could not be reached." (failureWords); never a parse error's words. A landed answer whose body
// is not JSON is still landed (`task: null` — the screen keeps the copy it sent): the body read before the ok check
// threw there, and the screen rolled back a task the server had completed. Never throws.
//
// Its callers: useTasks' handleCompleteTask (the Tasks tab's ✓ and the task window's Mark Complete) and the Tasks tab's
// Snooze (QRow). `send` makes the request — a dbFetch — and answers its Response.
import { readRefusal, failureWords } from './refusalWords.js';

export const taskWriteAnswer = async (send) => {
    let res;
    try { res = await send(); } catch (e) { return { ok: false, error: failureWords(e) }; }
    if (!res.ok) return { ok: false, error: await readRefusal(res) };
    const data = await res.json().catch(() => null);
    return { ok: true, task: data && data.task ? data.task : null };
};
