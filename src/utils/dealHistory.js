// dealHistory.js — a deal's two histories, its stage moves and its close-date moves (state §0.239;
// docs/design/close-date-history, Jeff's Q1-Q4, 10 Nov 2026; guide §18b122).
//
// Both lists are the server's. A close-date move is appended in the write that makes it, decided from the date
// as stored at that moment (opportunities.mjs — closeDatesWith): any change, a date set where there was none
// and a date cleared included (Q1). A stage move is appended the same way (the import's since §0.239; the
// single save's since §0.236). No screen sends either list, and a restore keeps a file's lists only entry by
// entry, each one in the shape the server writes (Q4) — a file's junk, or an entry with no day, time, author or
// source, never lands. The check is the entry's shape, not who made it or whether it happened: a well-formed entry
// written by hand still lands, as any row a restore brings in does (the review).
//
// Pure: the server, the restore, the deal window's History tab and tests/deal-history.test.mjs run the same rules.

// A calendar day as every close date is stored: yyyy-mm-dd, a real day.
export function isDay(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const [y, m, d] = v.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
const isTime = (v) => typeof v === 'string' && v !== '' && Number.isFinite(Date.parse(v));
const isMemberId = (v) => v === null || (typeof v === 'string' && /^usr_[A-Za-z0-9-]{1,80}$/.test(v));
const isText = (v, max = 200) => typeof v === 'string' && v.length <= max;

// Where a move was made: the deal's own save, or an import's Overwrite.
export const HISTORY_SOURCES = Object.freeze(['deal', 'import']);

// A close date as the column holds it: none, or its text (varchar 20) — every one stored so far yyyy-mm-dd, but a
// body sent straight to the endpoint is stored as sent, and the history records what was stored.
const isStoredDate = (v) => v === null || (typeof v === 'string' && v !== '' && v.length <= 20);

// A close-date move as the server writes it: { from, to, date, timestamp, author, authorId, source }.
export function isCloseDateEntry(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
    const fromOk = isStoredDate(e.from);
    const toOk = isStoredDate(e.to);
    return fromOk && toOk && e.from !== e.to
        && isDay(e.date) && isTime(e.timestamp)
        && isText(e.author) && isMemberId(e.authorId ?? null)
        && HISTORY_SOURCES.includes(e.source);
}

// A stage move: { stage, prevStage, date } always; author, authorId, timestamp and source where the entry has
// them (an import's before §0.239 carries none of the first three, a single save's before it no id or source).
export function isStageEntry(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
    if (!isText(e.stage, 100) || e.stage.trim() === '') return false;
    if (!(e.prevStage == null || isText(e.prevStage, 100))) return false;
    if (!isDay(e.date)) return false;
    if ('author' in e && !isText(e.author ?? '')) return false;
    if ('authorId' in e && !isMemberId(e.authorId ?? null)) return false;
    if ('timestamp' in e && !isTime(e.timestamp)) return false;
    if ('source' in e && !HISTORY_SOURCES.includes(e.source)) return false;
    return true;
}

// A list as a file holds it — the list, or its JSON text — read entry by entry: the entries that read as entries,
// or null when it is no list at all.
export function keptEntries(list, isEntry) {
    let v = list;
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
    if (!Array.isArray(v)) return null;
    return v.filter((e) => isEntry(e));
}

// A deal a restore lands: each history kept entry by entry (Q4). A list that is no list is left out, and the
// column takes its default (the stage history's []; the close-date history's none).
export function restoredHistories(row) {
    if (!row || typeof row !== 'object') return row;
    const out = { ...row };
    for (const [key, isEntry] of [['stageHistory', isStageEntry], ['closeDateHistory', isCloseDateEntry]]) {
        if (!(key in out)) continue;
        if (out[key] == null) { delete out[key]; continue; }
        const kept = keptEntries(out[key], isEntry);
        if (kept === null) delete out[key]; else out[key] = kept;
    }
    return out;
}

// A deal's close-date moves, newest first, for the History tab (Q3) — only entries that read as entries.
export function closeDateMovesOf(deal) {
    const list = keptEntries(deal?.closeDateHistory, isCloseDateEntry) || [];
    return list.slice().sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
}

// A move's from → to in words, as the History tab and the audit row say it.
export function moveWords(entry) {
    const day = (d) => (d ? d : 'none');
    return `${day(entry?.from)} → ${day(entry?.to)}`;
}

// What a refusal says.
export const HISTORY_WORDS = Object.freeze({
    wholeList: 'A deal\'s close-date history is kept by the server; a save never sends it.',
});
