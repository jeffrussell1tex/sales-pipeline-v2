// importReceipt.js — the one structured value the CSV importer reports from.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// CsvImportModal used to recover its Results figures by REGEX-PARSING the thrown
// error message:
//
//     const isPartial = msg.includes('of') && msg.includes('failed to save');
//     const m = msg.match(/(\d+)\s+of\s+(\d+)/);
//
// So the numbers a user saw depended on the wording of an error string thrown in
// another module. "2 of 3 new companies failed to save" on a 5-contact import
// rendered "1 of 5 records saved" — both numbers wrong, and wrong in the
// reassuring direction. Guide 18b15: counts must not travel as prose.
//
// The direction of travel is now one-way. Numbers come off the server response,
// are carried as fields, and prose is generated FROM them at the very end by
// describeReceipt(). Nothing ever parses a sentence back into a number.
//
// Pure and dependency-free, because both call sites (ModalLayer.jsx and
// CsvImportModal.jsx) import React and nothing left inside them is reachable by
// `node --test`. Same reasoning as quarters.js and csvAutoMap.js.

// ── The receipt ──────────────────────────────────────────────────────────────
//
// Invariant, asserted in tests/import-receipt.test.mjs:
//
//     attempted === created + updated + failed + unread
//
// `failed` is the total shortfall — every row that was sent (or that the user
// asked to send) and did not land. `unread` (state §0.249) is neither: sent, and
// answered as landed (a 201), with an answer that could not be read — which landed is unknown (a 201 says at least
// one did), so it is never counted as failed, and it is not clean (the screen cannot name them; the import reads the
// roster again, and when that read lands each is counted sent or failed by it — unreadOnRoster, the §0.249 review,
// round 3 — so only a read that failed leaves any unread). notFound / forbidden / discrepancy are the
// REASONS, and they are a breakdown of `failed`, not additions to it; `onRoster` is a breakdown of `unread` the same way
// (round 4: on the roster read again, which shows no who-or-when — invited by this import or before it). A reason
// can be zero while failed is not: a 500 on chunk 3 fails rows for no reason the
// server named.
//
// `skipped` and `dropped` are deliberately outside that invariant. Neither was
// ever sent: `skipped` is the user's choice at the conflicts step, `dropped` is a
// row the mapper discarded before any request was made. Folding them into
// `failed` is how "6 rows in, 0 out" came to render as success.
export const emptyReceipt = () => ({
    created:     0,      // server confirmed these were inserted
    updated:     0,      // server confirmed these were updated
    failed:      0,      // sent (or queued) and did not land — total shortfall
    unread:      0,      // sent and landed (a 201), its answer unreadable — never failed (state §0.249)
    maybe:       0,      // sent, its answer proving nothing — may have saved, never failed (state §0.261, the unknown-save rule)
    onRoster:    0,      // of unread: on the roster read again — invited by this import or before it (reason; §0.249 round 4)
    notFound:    0,      // overwrite target no longer exists (reason)
    forbidden:   0,      // owned by another rep (reason)
    discrepancy: 0,      // server's own count disagreed with its own id lists (reason)
    skipped:     0,      // user chose skip at the conflicts step — never sent
    dropped:     0,      // mapper discarded before the request — never sent
    refused:     0,      // a name in the row is no one record (state §0.215) — refused at Preview, never sent
    attempted:   0,      // created + updated + failed + unread + maybe
    error:       null,   // fatal transport/server message, if any
    // Outside the invariant too (state §0.216). `companies`: the new accounts the contact import made for its rows'
    // Companies — accounts, never counted as contacts (they were summed into `created`, and a 5-contact import that
    // made 2 read "7 contacts created"). The owner names: those the server matched to no member, or to more than
    // one — each name once (bulkClient.js), said on the Results, never a failure.
    companies:   0,
    ambiguousOwners: [],
    unmatchedOwners: [],
});

const OWNER_KEYS = ['ambiguousOwners', 'unmatchedOwners'];

// Combine the phases of one import — new records, then overwrites — into a single
// receipt. Every import has at least two phases and the contacts importer has
// three (it creates missing accounts first), so summing has to be the default
// rather than something each handler open-codes.
//
// The first fatal error wins: later phases do not run after one, so a second
// error would be describing work that never started.
export const mergeReceipts = (...parts) => {
    const out = emptyReceipt();
    for (const p of parts) {
        if (!p) continue;
        for (const k of Object.keys(out)) {
            if (k === 'error') continue;
            if (OWNER_KEYS.includes(k)) { out[k] = [...new Set([...out[k], ...(Array.isArray(p[k]) ? p[k] : [])])]; continue; }
            out[k] += p[k] || 0;
        }
        if (!out.error && p.error) out.error = p.error;
    }
    return out;
};

// ── Builders ─────────────────────────────────────────────────────────────────

// From bulkClient.postNew().
//
// `attempted` is the caller's full list, NOT landed.length + failed.length.
// postNew stops at the first failing chunk, so rows in later chunks were never
// sent at all — and the old code reported only failed.length, which silently
// omitted them. On a 1,500-row import failing at chunk 2, that is the difference
// between "400 failed" and the truth, which is 1,100.
export const receiptFromInsert = ({ attempted = 0, landed = [], error = null, unsure = 0, ambiguousOwners = [], unmatchedOwners = [] } = {}) => {
    const created = landed.length;
    const maybe = Math.min(unsure || 0, Math.max(0, attempted - created));   // a chunk whose answer proved nothing (§0.261)
    return {
        ...emptyReceipt(),
        created,
        maybe,
        failed: Math.max(0, attempted - created - maybe),
        attempted,
        error: error || null,
        ambiguousOwners, unmatchedOwners,
    };
};

// From bulkClient.putBulk().
//
// notFound and forbidden arrive as id arrays from bulkUpsert; they are stored as
// counts here because the receipt is a reporting value, not a work list. The ids
// stay in the transport result for the caller that needs them (state application).
export const receiptFromUpdate = ({
    attempted = 0, updated = 0, notFound = [], forbidden = [], discrepancy = 0, error = null, unsure = 0,
    ambiguousOwners = [], unmatchedOwners = [],
} = {}) => ({
    ...emptyReceipt(),
    updated,
    maybe: Math.min(unsure || 0, Math.max(0, attempted - updated)),   // as receiptFromInsert's (§0.261)
    failed: Math.max(0, attempted - updated - Math.min(unsure || 0, Math.max(0, attempted - updated))),
    notFound: notFound.length,
    forbidden: forbidden.length,
    discrepancy,
    attempted,
    error: error || null,
    ambiguousOwners, unmatchedOwners,
});

// The Results' lines for the owner names (state §0.216): null for none. A name no member has, or one more than one
// member has, is not guessed at — its rows were saved with no owner (an overwrite naming one more than one member
// has keeps the owner it had).
export const describeOwners = (r) => {
    const q = (list) => list.map((n) => `“${n}”`).join(', ');
    const lines = [];
    if (r?.unmatchedOwners?.length) lines.push(`No member is named ${q(r.unmatchedOwners)} — those rows were saved with no owner. Set the owner on each record's page.`);
    if (r?.ambiguousOwners?.length) lines.push(`More than one member is named ${q(r.ambiguousOwners)} — those rows were saved with no owner (an overwrite kept the owner it had). Set the owner on each record's page.`);
    return lines.length ? lines : null;
};

// The ones sent unread, read against the roster read again (the §0.249 review, rounds 3-4). A 201 whose answer cannot
// be read says at least one of its request was invited, not which. `requests` holds each request answered so, apart.
// Each address not on the roster — by address, trimmed and in any case, as the import's duplicate check compares
// (userImport.js userConflicts) — was not invited (the server refused it), and is a "Not invited" row in the refusals'
// shape ({ email, error }), its words naming the person "they". An address on it may have been there before the import
// (a screen's roster can be stale, and a held address's invitation refused): a roster row carries no time or inviter,
// so it proves nothing of who invited them, and they are `onRoster` — invited by this import or before it. Only where
// the answer proves it are they `invited`: the one of a request on the roster while the rest of it are not — the 201
// says one of it was. Pure: the handler counts them; the receipt says exact counts only where they are proven.
export const NOT_ON_ROSTER = 'The answer could not be read, and they are not on the roster — not invited.';
export const unreadOnRoster = (requests, roster) => {
    const key = (e) => String(e ?? '').trim().toLowerCase();
    const held = new Set((Array.isArray(roster) ? roster : []).map((u) => key(u?.email)).filter(Boolean));
    const invited = [], onRoster = [], notInvited = [];
    for (const request of requests || []) {
        const found = [];
        for (const v of Array.isArray(request) ? request : []) {
            if (held.has(key(v?.email))) found.push(v);
            else notInvited.push({ email: v?.email || '', error: NOT_ON_ROSTER });
        }
        (found.length === 1 ? invited : onRoster).push(...found);
    }
    return { invited, onRoster, notInvited };
};

// Rows the user chose to skip, rows the mapper dropped, and rows a name refused. None was sent.
export const receiptFromPreflight = ({ skipped = 0, dropped = 0, refused = 0 } = {}) => ({
    ...emptyReceipt(),
    skipped,
    dropped,
    refused,
});

// ── Predicates ───────────────────────────────────────────────────────────────

// Everything the user asked to save, saved. `dropped` counts against this: an
// import that discarded six rows before sending them is not a clean import, and
// treating it as one is exactly how "Import Complete! · 0 imported" happened.
export const isClean = (r) => !r.error && r.failed === 0 && r.dropped === 0 && !r.refused && !r.unread && !r.maybe;

// Something landed AND something did not.
// Sent unread (state §0.249) is something that landed.
export const isPartial = (r) => (r.created + r.updated + (r.unread || 0)) > 0 && !isClean(r);

// ── Prose, generated last and only here ──────────────────────────────────────

// "opportunity" -> "opportunities", not "opportunitys". The naive `${one}s`
// shipped and rendered "2 opportunitys created" on the Results screen.
// Deliberately small: this pluralises the handful of entity nouns the importer
// passes, not English.
const pluralise = (one) => {
    if (/[^aeiou]y$/i.test(one)) return `${one.slice(0, -1)}ies`;   // opportunity -> opportunities
    if (/(s|x|z|ch|sh)$/i.test(one)) return `${one}es`;              // address -> addresses
    return `${one}s`;                                                // contact -> contacts
};

const plural = (n, one, many = pluralise(one)) => `${n} ${n === 1 ? one : many}`;

// The single place a sentence is produced from the numbers. Nothing parses this
// back; it is terminal output for a human. `words` is for an import whose rows
// are not records saved: the team import SENDS invitations (state §0.167) — "3
// invitations sent", not "created" — and its skipped rows are not all duplicates.
// `unread` claims only what a 201 says (the §0.249 review, round 2): at least one of a request was sent, not which —
// so "up to" N, some maybe refused; one alone was sent (`unreadOne`). The import reads the roster again itself, and
// says to reload only when that read fails; a read that lands counts each by it (unreadOnRoster, rounds 3-4), so these
// words are said only over a roster read that failed. The ones it found are said as what it shows (`onRoster`, round
// 4): on the roster — invited by this import or before it; never as sent by this import, never "up to".
const SAVE_WORDS = Object.freeze({ created: 'created', failed: 'did not save', skipped: 'skipped as duplicates', none: 'Nothing was saved',
    maybe: 'may have saved — reload the page to see whether they did',   // §0.261: sent, the answer proving nothing
    unread: 'sent — the answer could not be read; some may have been refused', unreadOne: 'sent — the answer could not be read',
    onRoster: 'on the roster — invited by this import or before it' });
export const describeReceipt = (r, noun = 'record', words = {}) => {
    const w = { ...SAVE_WORDS, ...words };
    const parts = [];
    if (r.created) parts.push(`${plural(r.created, noun)} ${w.created}`);
    if (r.updated) parts.push(`${r.updated} overwritten`);
    // Sent, its answer unreadable (state §0.249): said with what landed, never as "not sent" or none — less the ones on
    // the roster read again (round 4), said apart.
    const onRoster = Math.min(r.onRoster || 0, r.unread || 0);
    const unread = (r.unread || 0) - onRoster;
    if (unread) parts.push(unread === 1
        ? `${parts.length ? '1 more' : plural(1, noun)} ${w.unreadOne}`
        : `${parts.length ? `up to ${unread} more` : `Up to ${plural(unread, noun)}`} ${w.unread}`);
    if (onRoster) parts.push(`${onRoster} ${w.onRoster}`);

    const saved = parts.length ? parts.join(', ') : w.none;

    const reasons = [];
    if (r.notFound)    reasons.push(`${r.notFound} no longer exist`);
    if (r.forbidden)   reasons.push(`${r.forbidden} owned by another rep`);
    if (r.discrepancy) reasons.push(`${r.discrepancy} the server reported inconsistently`);

    const tail = [];
    if (r.failed) {
        tail.push(reasons.length
            ? `${r.failed} ${w.failed} (${reasons.join('; ')})`
            : `${r.failed} ${w.failed}`);
    }
    if (r.maybe) tail.push(`${r.maybe} ${w.maybe}`);
    if (r.dropped) tail.push(`${plural(r.dropped, 'row')} skipped before sending — required fields were empty`);
    if (r.refused) tail.push(`${plural(r.refused, 'row')} refused — each is listed below with why`);
    if (r.skipped) tail.push(`${r.skipped} ${w.skipped}`);

    const body = tail.length ? `${saved}. ${tail.join('. ')}.` : `${saved}.`;
    return r.error ? `${body} ${r.error}` : body;
};

// ── The error ────────────────────────────────────────────────────────────────

// Thrown by the ModalLayer handlers when a receipt is not clean, so the modal can
// read fields instead of a sentence. `message` exists for console output and for
// any caller that predates this — it is never the source of a rendered number.
export class ImportError extends Error {
    constructor(receipt, noun = 'record') {
        super(describeReceipt(receipt, noun));
        this.name = 'ImportError';
        this.receipt = receipt;
    }
}

// Read a receipt off anything thrown. An ImportError carries one; a TypeError
// from a bug in a handler does not, and must not be rendered as though it were a
// counted partial failure.
export const receiptFromError = (err) =>
    (err && err.receipt && typeof err.receipt === 'object') ? err.receipt : null;
