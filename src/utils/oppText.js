// oppText.js — the two comma-text columns on an opportunity, read and written.
//
// `opportunities.products` and `opportunities.contacts` are TEXT columns holding
// comma-separated names ("Shiftboard, AutoCall"; "Ada Lovelace, Grace Hopper").
// The Opportunity History pane treated products as an array — `.map` on a string
// throws, so the pane crashed for every deal that had products — and wrote
// contacts back as a JavaScript array, which lands in a text column as a
// Postgres array literal and breaks every reader that splits on commas (0.68
// tier 1 item 13). Pure, so tests/opp-text.test.mjs can pin both directions.

/** Names from a comma-text column (or an array, tolerated), trimmed, no blanks. */
export function productsListOf(value) {
    if (value == null) return [];
    const parts = Array.isArray(value) ? value : String(value).split(',');
    return parts.map(p => (typeof p === 'string' ? p : (p?.name ?? '')).trim()).filter(Boolean);
}

/** Names to the comma-text form every reader splits on: ", " joined, deduped, no blanks. */
export function contactNamesText(names) {
    const seen = new Set();
    const out = [];
    for (const n of Array.isArray(names) ? names : []) {
        const s = typeof n === 'string' ? n.trim() : '';
        if (s && !seen.has(s)) { seen.add(s); out.push(s); }
    }
    return out.join(', ');
}
