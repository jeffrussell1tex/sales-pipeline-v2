// src/utils/createResend.js — a create sent again with its id, read on the screen (state §0.290; OPEN_ITEMS §4.8, §0.289's
// found (1); Jeff, 23 Nov: "Fix New Job resend"). A Dispatch screen keeps its create's id after an answer that proved nothing
// (§0.263) and sends the same create again; the server answers one that landed 409 code 'idInUse' with the row as stored,
// nothing written — it was an upsert, and wrote the create's values over another member's change made in between. Pure: no
// React, no database.

/** The stored row a refused create is answered with: 409 'idInUse' naming the very id sent — else null (another org's id,
 * a row of another id and a body with no row prove nothing of this create). `key` — the answer's: job, customer, location, technician, vehicle, item, block or plan. */
export const heldCreate = (status, body, key, id) =>
    (status === 409 && body?.code === 'idInUse' && !!id && body[key]?.id === id ? body[key] : null);

// One value whichever way it is held: none and '' are one; a list or an object by what it holds, keys in any order (a column
// may sort them); a decimal column as its number ('120' typed, '120.00' stored) — those columns alone: a tag '1.10' is not '1.1'.
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.keys(v).sort().map((k) => [k, canon(v[k])]) : v);
const DECIMALS = new Set(['laborRate', 'overtimeRate', 'purchasePrice', 'includedHours', 'discountPercent', 'price', 'creditLimit']);
const same = (k, a, b) => {
    const text = (v) => (v == null || v === '' ? '' : typeof v === 'object' ? JSON.stringify(canon(v)) : String(v));
    const x = text(a), y = text(b);
    return x === y || (DECIMALS.has(k) && !!x && !!y && Number(x) === Number(y));
};

/**
 * A new record's form whose create had landed: the record as stored, with what the member changed since over it. `sent` —
 * every body sent under the id whose answer proved nothing; any of them may be the one stored (one a body left out was sent
 * as none). A field typed otherwise than stored is the member's change since when no body held what is typed, or a body
 * held what is stored (a later press that carried the change wrote nothing: the first is the one stored). Any other is as
 * stored: another member's or the server's since. Never written by itself: the form shows it, and its next Save sends it.
 * → { draft, mine: [the fields changed since], differs: whether the form shows anything but the record as stored }
 */
export function overStored(typed, stored, sent = []) {
    const draft = { ...stored };
    const mine = [];
    let differs = false;
    for (const k of Object.keys(typed || {})) {
        if (k === 'id' || k.startsWith('_') || same(k, typed[k], stored?.[k])) continue;
        differs = true;
        if (sent.length && (!sent.some((b) => same(k, b?.[k], typed[k])) || sent.some((b) => same(k, b?.[k], stored?.[k])))) { draft[k] = typed[k]; mine.push(k); }
    }
    return { draft, mine, differs };
}

/** What a form says when the record it made stands with what was typed since over it, not written yet. */
export const keptSaid = (subject) => `${subject} was already created by an earlier press. What you changed since is in the form, not saved yet — Save to keep it.`;
