// stageClock.js — shared with netlify/functions/_stage.mjs.
//
// The importer needs the same two helpers on both sides: the CREATE path derives
// stageChangedDate on the client (there is no prior stage to compare against),
// and the OVERWRITE path derives it on the server (only the server knows the
// prior stage). Two implementations of a date rule is how they drift, so the
// pure half lives here and _stage.mjs re-exports it.

export const MAX_DAYS_IN_STAGE = 3650;   // ten years; beyond this it is a typo

export function parseDaysInStage(raw) {
    if (raw === null || raw === undefined || String(raw).trim() === '') return null;
    const n = Number(String(raw).trim());
    if (!Number.isFinite(n)) return null;          // non-numeric: treat as unmapped, do not guess
    if (n < 0) return 0;                            // clamp; never a future date
    if (n > MAX_DAYS_IN_STAGE) return null;         // implausible: ignore rather than invent 1753
    return Math.floor(n);
}

// yyyy-mm-dd, `days` before `importDate`. String in, string out — the column is
// varchar(20) and every consumer compares it as a date string.
export function backdate(importDate, days) {
    const d = new Date(`${importDate}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return importDate;
    d.setUTCDate(d.getUTCDate() - (days || 0));
    return d.toISOString().slice(0, 10);
}
