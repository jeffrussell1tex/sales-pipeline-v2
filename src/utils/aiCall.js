// src/utils/aiCall.js
//
// One request to Claude for a deal's score, and what its answer means (state §0.238; docs/design/ai-scoring
// R3). Pure, so the suite runs every rule ai-score.mjs runs: the body sent, the reply read by its type, and
// whether a failed first answer goes once more to the fallback.
//
// The 5.5 models think before they answer: a reply can open with a `thinking` block, and thinking counts
// toward max_tokens — ai-score read content[0].text from a 600-token reply, which would have failed every
// score. They can also refuse (HTTP 200, stop_reason 'refusal'). The request asks at effort low, which
// answered in about four seconds with no thinking on each of the three (9 Nov, a made-up deal), for JSON that
// matches the score's schema.

// Each attempt's own limit. A synchronous Netlify function has 60 seconds, not configurable (Netlify's functions
// documentation, read 9 Nov); the request's whole work — the reads before, the attempts, the write and the audit row
// after — must end inside it, or the platform ends it after the deal was sent and before the log says so. So the
// attempts share BUDGET_MS from the request's start: the fallback gets what is left, and none when too little is.
export const ATTEMPT_MS = 25_000;
export const BUDGET_MS = 48_000;
export const MIN_ATTEMPT_MS = 5_000;
// The time the next attempt may take, `elapsed` ms into the request: its own limit, or what the budget has left.
export const attemptTime = (elapsed) => Math.min(ATTEMPT_MS, BUDGET_MS - elapsed);

// The score's fields as Claude returns them (the server cuts and checks them again — ai-score.mjs).
export const SCORE_SCHEMA = Object.freeze({
    type: 'object',
    properties: {
        score: { type: 'integer' },
        verdict: { type: 'string', enum: ['Strong', 'On Track', 'At Risk', 'Critical'] },
        headline: { type: 'string' },
        signals: {
            type: 'array',
            items: {
                type: 'object',
                properties: { text: { type: 'string' }, sentiment: { type: 'string', enum: ['positive', 'warning', 'negative'] } },
                required: ['text', 'sentiment'],
                additionalProperties: false,
            },
        },
        recommendation: { type: 'string' },
    },
    required: ['score', 'verdict', 'headline', 'signals', 'recommendation'],
    additionalProperties: false,
});

export const scoreRequestBody = (model, prompt) => ({
    model,
    max_tokens: 4000,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCORE_SCHEMA } },
    messages: [{ role: 'user', content: prompt }],
});

// Never a key in a cause that goes to the audit log or an answer (guide: never log the key).
const noKey = (s) => String(s || '').replace(/sk-ant-[A-Za-z0-9_-]+/g, '[key]').replace(/\s+/g, ' ').trim();

function errorDetail(status, text) {
    let type = '', message = '';
    try { const j = JSON.parse(text || ''); type = j?.error?.type || ''; message = j?.error?.message || ''; } catch { message = text || ''; }
    return noKey(`${status}${type ? ' ' + type : ''}${message ? ': ' + String(message).slice(0, 160) : ''}`);
}

// What one attempt came to:
//   { ok: true, parsed }                     — a score to keep
//   { ok: false, cause, retry, detail }      — cause: 'key' | 'busy' | 'model' | 'declined' | 'unreadable' | 'request'
// `retry` says whether the fallback may answer instead: a busy or missing model, a refusal, an answer cut
// short or unreadable — yes; the request itself (400) or the key (401, 403) — no, the second would fail alike.
export function attemptOutcome({ thrown, status, text, json }) {
    if (thrown) {
        const timedOut = thrown?.name === 'TimeoutError' || thrown?.name === 'AbortError';
        return { ok: false, cause: 'busy', retry: true, detail: timedOut ? 'no answer in its time' : noKey(`network: ${thrown?.name || 'error'}`) };
    }
    if (status !== 200) {
        const detail = errorDetail(status, text);
        if (status === 401 || status === 403) return { ok: false, cause: 'key', retry: false, detail };
        if (status === 404) return { ok: false, cause: 'model', retry: true, detail };
        if (status === 429 || status >= 500) return { ok: false, cause: 'busy', retry: true, detail };
        return { ok: false, cause: 'request', retry: false, detail };
    }
    if (json?.stop_reason === 'refusal') {
        const category = json?.stop_details?.category;
        return { ok: false, cause: 'declined', retry: true, detail: `declined${category ? ' (' + category + ')' : ''}` };
    }
    // Cut short, the JSON is not the score whole — even where what came back happens to parse.
    if (json?.stop_reason === 'max_tokens') return { ok: false, cause: 'unreadable', retry: true, detail: 'stopped at max_tokens' };
    const block = Array.isArray(json?.content) ? json.content.find((b) => b?.type === 'text' && typeof b.text === 'string') : null;
    if (!block) return { ok: false, cause: 'unreadable', retry: true, detail: 'no text in the answer' };
    try {
        const parsed = JSON.parse(block.text.replace(/```json|```/g, '').trim());
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
        return { ok: true, parsed };
    } catch {
        return { ok: false, cause: 'unreadable', retry: true, detail: 'the answer is not JSON' };
    }
}

// What the deal window says when no score came back (OPEN_ITEMS §4.2: every failure read "AI scoring
// service unavailable"). `label` is the model the last attempt asked.
export function causeWords(cause, label) {
    switch (cause) {
        case 'key':        return 'The AI key was refused — an Admin can check it in Settings → Features & AI.';
        case 'busy':       return 'Claude is busy — try again in a minute.';
        case 'model':      return `This workspace's AI key can't use ${label || 'the chosen model'} — an Admin can choose another in Settings → Features & AI.`;
        case 'declined':   return 'Claude declined to score this deal.';
        case 'unreadable': return "Claude's answer couldn't be read — try again.";
        default:           return "Claude couldn't take this request — tell your administrator.";
    }
}
