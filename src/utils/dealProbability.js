// dealProbability.js — a deal's probability: none, or a whole number from 0 to 100 (state §0.300; guide §18b143). Pure: the
// deals endpoint, the deal window, the import and the automations read one rule.
//
// The column is an integer with no range. Until §0.300 the server stored any whole number, answered a fraction or text with a
// 500, and a file's "0", "0.5" or "abc" erased the stored one with nothing said; and a deal with none was held as NaN.
import { CLOSED_STAGES } from './stageOrder.js';

export const PROBABILITY_REFUSED = "A deal's probability is a whole number from 0 to 100, or none.";

// What a value is: { value } — a whole number from 0 to 100, or null for none — or { refused }. Its digits are the number; no
// other text is.
export function probabilityOf(sent) {
    if (sent === undefined || sent === null || (typeof sent === 'string' && !sent.trim())) return { value: null };
    const n = typeof sent === 'string' && /^\d{1,3}$/.test(sent.trim()) ? Number(sent) : sent;
    return Number.isInteger(n) && n >= 0 && n <= 100 ? { value: n } : { refused: PROBABILITY_REFUSED };
}

// The rows of a write, each with the probability it stores: { rows }, or { status, error, field, ids } — every row refused,
// nothing written. A row that leaves it out is as it was; what the stored row holds (priors) is never asked again; one of a row
// the caller may not write (mayAsk) refuses nothing — the write answers that row forbidden or not found.
export function decideProbabilities(rows, { priors = null, mayAsk = () => true } = {}) {
    const decided = rows.map((row) => {
        if (!row || typeof row !== 'object' || row.probability === undefined) return { row, left: true };
        const held = priors?.get(row.id)?.probability ?? null;
        if (held !== null && row.probability === held) return { row, left: true };
        const asked = probabilityOf(row.probability);
        return asked.refused && !mayAsk(row) ? { row, drop: true } : { row, ...asked };
    });
    const bad = decided.filter((d) => d.refused);
    if (bad.length) return { status: 400, error: bad[0].refused, field: 'probability', ids: bad.map((d) => d.row.id) };
    return { rows: decided.map((d) => {
        if (d.left) return d.row;
        if (!d.drop) return { ...d.row, probability: d.value };
        const { probability: _refused, ...rest } = d.row;
        return rest;
    }) };
}

// A stage's default probability, as the org's list holds it — a whole number from 0 to 100 — or null: none, or no such stage.
// A stored weight is not asked when a restore lands it, so it is read within its range.
export function stageDefaultOf(funnelStages, name) {
    const s = (Array.isArray(funnelStages) ? funnelStages : []).find((f) => f && typeof f === 'object' && f.name === name);
    const w = s && s.weight !== null && s.weight !== '' ? Number(s.weight) : NaN;
    return Number.isFinite(w) ? Math.max(0, Math.min(100, Math.round(w))) : null;
}
// A close's: the org's, else won is 100 and lost is 0.
export const closeDefaultOf = (funnelStages, name) => stageDefaultOf(funnelStages, name) ?? (name === 'Closed Won' ? 100 : 0);
// Any stage's, the closes' among them.
export const defaultOf = (funnelStages, name) => (CLOSED_STAGES.includes(name) ? closeDefaultOf : stageDefaultOf)(funnelStages, name);

// What a deal counts at, and reads: its own probability, else its stage's default (Jeff, 25 Nov: "yes") — null where it has
// neither. A deal with none weighed nothing, while its window read the stage's.
export const countedProbability = (deal, funnelStages) => deal?.probability ?? defaultOf(funnelStages, deal?.stage);

// What a deal's probability is after a move to a stage, where the move names none: a close is its own; from a stage whose
// default it stood on, or from none, the new stage's default; a rep's own stands. The deal window's rule, and the board's.
export function probabilityAfterMove(deal, to, funnelStages) {
    if (CLOSED_STAGES.includes(to)) return closeDefaultOf(funnelStages, to);
    const now = deal?.probability ?? null;
    const ofClose = (deal?.stage === 'Closed Won' && now === 100) || (deal?.stage === 'Closed Lost' && now === 0);   // whatever the close's default is now
    if (now !== null && !ofClose && now !== defaultOf(funnelStages, deal?.stage)) return now;
    // A stage with no default leaves an open deal's where it is; a close's own never stays on an open deal.
    return stageDefaultOf(funnelStages, to) ?? (CLOSED_STAGES.includes(deal?.stage) ? null : now);
}

// What a window shows after a stage is pressed: the server's rule from the deal as stored — the save names no probability
// unless one was typed (`typed`), so two presses read as one move, and a press back as none. A new deal, or one typed, moves
// from what the window shows.
export function pressedProbability(opened, form, typed, to, funnelStages) {
    if (typed || !opened?.id) return probabilityAfterMove(form, to, funnelStages);
    return to === opened.stage ? opened.probability ?? null : probabilityAfterMove(opened, to, funnelStages);
}

// A cell of a file: none, or a whole number from 0 to 100 as 50, 50% or 50.0 — { value } — else { refused }.
export function probabilityOfCell(cell) {
    const m = /^\s*(\d{1,3})(?:\.0+)?\s*%?\s*$/.exec(String(cell ?? ''));
    return m ? probabilityOf(Number(m[1])) : probabilityOf(String(cell ?? '').trim() === '' ? null : 'x');
}
export const cellRefused = (cell) => `“${String(cell ?? '').trim()}” is not a probability — a whole number from 0 to 100, as 50 or 50%.`;

// How a screen says one: none is none, never 0%.
export const probabilityText = (p) => (p === null || p === undefined || p === '' || Number.isNaN(Number(p)) ? '—' : `${Number(p)}%`);
