// src/utils/quotePdfAnswer.js
// The quote PDF's answer (state §0.246, docs/design/refusal-sweep 7a; Jeff's Q14): the ok check first, then the file.
// A refusal in the server's words with their ref, else "The server returned N." (readRefusal); a request that never left
// "The server could not be reached.", and a file that could not be read "Its answer could not be read." (failureWords).
// It answers { blob } or { error } and never throws: the Quotes tab says the error under Download PDF, kept until its
// Close, and offers the print copy as a button — never opened on its own. Until §0.246 ANY failure opened the print copy
// in a new tab with no word, and that hid every PDF failing with a 500 until §0.234.
//
// Its caller: QuotesTab's handleExportPDF. `send` makes the request — a dbFetch — and answers its Response.
import { readRefusal, failureWords } from './refusalWords.js';

export const quotePdfOf = async (send) => {
    try {
        const res = await send();
        if (!res.ok) return { error: await readRefusal(res) };
        return { blob: await res.blob() };
    } catch (e) { return { error: failureWords(e) }; }
};
