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

// The unknown-save rule (state §0.261, docs/design/unknown-save — Jeff, 16 Nov: "A"; 18 Nov, Q1: "Only a 4xx in words"):
// only a 4xx whose body says why in the server's own words proves a write wrote nothing. A 5xx says "Internal server
// error" (serverErrorBody) and about 40 write paths can answer it after they committed (census-D §2C); a gateway's page,
// a wordless answer and a request that threw prove nothing either. `body` is the answer's JSON, null when it was not.
export const heardRefusal = (status, body) => status >= 400 && status < 500
    && !!body && typeof body.error === 'string' && !!body.error.trim();
// A create sent again with its id, answered that the id is already in use in THIS org (`code: 'idInUse'`), or an action
// answered as already done (`code: 'already'`): it is stored — an earlier press landed (Part 6). The server sends the code
// only for its own org's row, never for another org's id.
// Since §0.271 also a delete-like press answered that what it removes is not there in this org (404 `code: 'gone'`): the
// outcome it asked for holds — an earlier press landed, its answer lost.
export const landedBefore = (status, body) => !!body && ((status === 409 && (body.code === 'idInUse' || body.code === 'already'))
    || (status === 404 && body.code === 'gone'));
// The words for a write whose answer proves nothing (Q2: the screen keeps the change and says this, kept until closed).
export const maybeSaid = (subject, verb, words, plural = false) =>
    `${subject} may have been ${verb} — reload the page to see whether ${plural ? 'they were' : 'it was'}${words ? `: ${words}` : '.'}`;
// A refused write's words, its body read (null when not JSON): the server's own 4xx in its words — nothing written — or,
// for any other answer, the maybe sentence about `subject`. `unknown` tells the screen to keep the change.
export const writeRefusal = (res, body, subject, verb = 'saved') => {
    const heard = heardRefusal(res && res.status, body);
    const words = refusalWords(res, body);
    return { words: heard ? words : maybeSaid(subject, verb, words), unknown: !heard };
};
// …and for a press an earlier press had already landed: the record as stored is what the screen shows.
export const alreadySaid = (subject, verb) => `${subject} was already ${verb} by an earlier press — shown as stored.`;
// A refused write's body read once (state §0.263, Part 4): `heard` — the server's own refusal, nothing written — with its
// words, or `role` (a screen's sentence for its role) in place of the words of the server's own 403; any other answer in
// refusalWords' words, not heard: it may have written.
export const writeRefusalOf = async (res, role = null) => {
    const body = await res.json().catch(() => null);
    const heard = heardRefusal(res.status, body);
    return { body, heard, words: heard && role && res.status === 403 ? role : refusalWords(res, body) };
};
// A refusal thrown through a screen's catch carries whether its write may have landed (`unknown`); a thrown fetch, or any
// error that does not say, may have — `unknownOf` reads it so. A step that sent nothing throws `refusalError(words, true)`.
export const refusalError = (words, heard) => Object.assign(new Error(words), { unknown: !heard });
export const unknownOf = (e) => e?.unknown !== false;
// An error whose words are already said in full (a may-have sentence built where it was known, a landed answer that
// cannot be read): its catch says them as they are.
export const saidError = (words) => Object.assign(new Error(words), { said: true });
// A screen's catch (state §0.263, Part 4): words said in full, and the server's own refusal, as they are (failureWords: a
// plain error's message); anything else — a thrown fetch, a 5xx, a page — said as maybe about `subject`.
export const thrownSaid = (e, subject, verb = 'saved', plural = false) =>
    (e?.said || e?.unknown === false ? failureWords(e) : maybeSaid(subject, verb, failureWords(e), plural));
