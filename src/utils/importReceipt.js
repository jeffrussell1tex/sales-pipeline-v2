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
    attempted:   0,      // created + updated + failed
    error:       null,   // fatal transport/server message, if any
});

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
export const receiptFromInsert = ({ attempted = 0, landed = [], error = null } = {}) => {
    const created = landed.length;
    return {
        ...emptyReceipt(),
        created,
        failed: Math.max(0, attempted - created),
        attempted,
        error: error || null,
    };
};

// From bulkClient.putBulk().
//
// notFound and forbidden arrive as id arrays from bulkUpsert; they are stored as
// counts here because the receipt is a reporting value, not a work list. The ids
// stay in the transport result for the caller that needs them (state application).
export const receiptFromUpdate = ({
    attempted = 0, updated = 0, notFound = [], forbidden = [], discrepancy = 0, error = null,
} = {}) => ({
    ...emptyReceipt(),
    updated,
    failed: Math.max(0, attempted - updated),
    notFound: notFound.length,
    forbidden: forbidden.length,
    discrepancy,
    attempted,
    error: error || null,
});

// Rows the user chose to skip, and rows the mapper dropped. Neither was sent.
export const receiptFromPreflight = ({ skipped = 0, dropped = 0 } = {}) => ({
    ...emptyReceipt(),
    skipped,
    dropped,
});

// ── Predicates ───────────────────────────────────────────────────────────────

// Everything the user asked to save, saved. `dropped` counts against this: an
// import that discarded six rows before sending them is not a clean import, and
// treating it as one is exactly how "Import Complete! · 0 imported" happened.
export const isClean = (r) => !r.error && r.failed === 0 && r.dropped === 0;

// Something landed AND something did not.
export const isPartial = (r) => (r.created + r.updated) > 0 && !isClean(r);

// ── Prose, generated last and only here ──────────────────────────────────────

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The single place a sentence is produced from the numbers. Nothing parses this
// back; it is terminal output for a human.
export const describeReceipt = (r, noun = 'record') => {
    const parts = [];
    if (r.created) parts.push(`${plural(r.created, noun)} created`);
    if (r.updated) parts.push(`${r.updated} overwritten`);

    const saved = parts.length ? parts.join(', ') : 'Nothing was saved';

    const reasons = [];
    if (r.notFound)    reasons.push(`${r.notFound} no longer exist`);
    if (r.forbidden)   reasons.push(`${r.forbidden} owned by another rep`);
    if (r.discrepancy) reasons.push(`${r.discrepancy} the server reported inconsistently`);

    const tail = [];
    if (r.failed) {
        tail.push(reasons.length
            ? `${r.failed} did not save (${reasons.join('; ')})`
            : `${r.failed} did not save`);
    }
    if (r.dropped) tail.push(`${plural(r.dropped, 'row')} skipped before sending — required fields were empty`);
    if (r.skipped) tail.push(`${r.skipped} skipped as duplicates`);

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
