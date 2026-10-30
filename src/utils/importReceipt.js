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
//     attempted === created + updated + failed
//
// `failed` is the total shortfall — every row that was sent (or that the user
// asked to send) and did not land. notFound / forbidden / discrepancy are the
// REASONS, and they are a breakdown of `failed`, not additions to it. A reason
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
    notFound:    0,      // overwrite target no longer exists (reason)
    forbidden:   0,      // owned by another rep (reason)
    discrepancy: 0,      // server's own count disagreed with its own id lists (reason)
    skipped:     0,      // user chose skip at the conflicts step — never sent
    dropped:     0,      // mapper discarded before the request — never sent
    refused:     0,      // a name in the row is no one record (state §0.215) — refused at Preview, never sent
    attempted:   0,      // created + updated + failed
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
export const receiptFromInsert = ({ attempted = 0, landed = [], error = null, ambiguousOwners = [], unmatchedOwners = [] } = {}) => {
    const created = landed.length;
    return {
        ...emptyReceipt(),
        created,
        failed: Math.max(0, attempted - created),
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
    attempted = 0, updated = 0, notFound = [], forbidden = [], discrepancy = 0, error = null,
    ambiguousOwners = [], unmatchedOwners = [],
} = {}) => ({
    ...emptyReceipt(),
    updated,
    failed: Math.max(0, attempted - updated),
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
export const isClean = (r) => !r.error && r.failed === 0 && r.dropped === 0 && !r.refused;

// Something landed AND something did not.
export const isPartial = (r) => (r.created + r.updated) > 0 && !isClean(r);

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
const SAVE_WORDS = Object.freeze({ created: 'created', failed: 'did not save', skipped: 'skipped as duplicates', none: 'Nothing was saved' });
export const describeReceipt = (r, noun = 'record', words = {}) => {
    const w = { ...SAVE_WORDS, ...words };
    const parts = [];
    if (r.created) parts.push(`${plural(r.created, noun)} ${w.created}`);
    if (r.updated) parts.push(`${r.updated} overwritten`);

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
