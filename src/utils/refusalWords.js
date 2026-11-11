// src/utils/refusalWords.js
// What a refused request says to the member (state §0.243, guide §18b125 rule 5, §18b123 rule 4): the server's
// own words — with the ref of its log line when it sent one (serverErrorBody's requestId, as storage.js refusalOf
// says it) — else "The server returned N.". Never undefined, never a parse error's words: a 502's HTML page, an
// empty body or a body with no `error` all fall back to the status. Twelve throws in four Settings panels were
// `new Error(data.error)` — an undefined message, an empty banner — after a bare `res.json()`, so a body that was
// not JSON said "Unexpected token '<'". Pure but for reading the body; never throws.
//
// Unlike refusalOf (storage.js, the write paths' words), a 403 keeps the server's words here: these are a
// screen's reads and saves alike, and "You do not have permission to make this change" is wrong for a read.
// failureWords (below) says a thrown failure: these words passed through, a network or parse failure in plain words.

// The words for an answer whose body is already read (`body` may be anything, null when it was not JSON).
export const refusalWords = (res, body) => {
    const said = body && typeof body === 'object' && typeof body.error === 'string' ? body.error.trim() : '';
    if (!said) return `The server returned ${res && res.status != null ? res.status : 'no answer'}.`;
    const ref = typeof body.requestId === 'string' && body.requestId.trim() ? ` (ref ${body.requestId.trim()})` : '';
    return said + ref;
};

// The words for a refused answer whose body is not yet read: reads it once, as JSON when it is.
export const readRefusal = async (res) => {
    let body = null;
    try { body = await res.json(); } catch { /* not JSON, or no body */ }
    return refusalWords(res, body);
};

// The words for a request that failed by throwing (state §0.243's second fix round): a refusal thrown in readRefusal's
// words (`throw new Error(await readRefusal(res))` — a plain Error) passes through as it was said; a request that never
// reached the server (fetch's TypeError: "Failed to fetch", "NetworkError when attempting to fetch resource.", "Load
// failed") says so; an answer that was not JSON (a SyntaxError — "Unexpected token '<'") or any other failure reading
// it says its answer could not be read. Never a parse error's or a runtime error's own words, never empty; never throws.
const NETWORK_WORDS = /failed to fetch|networkerror|network error|load failed/i;
export const failureWords = (e) => {
    if (e instanceof TypeError && NETWORK_WORDS.test(String(e.message || ''))) return 'The server could not be reached.';
    const plain = !!e && typeof e === 'object' && Object.getPrototypeOf(e) === Error.prototype;
    const said = plain && typeof e.message === 'string' ? e.message.trim() : '';
    return said || 'Its answer could not be read.';
};
