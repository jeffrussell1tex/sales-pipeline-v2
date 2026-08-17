// _sanitize.mjs — narrow a sanitized row back down to the columns the payload
// actually supplied.
//
// WHY THIS EXISTS
// ---------------
// Every endpoint's `sanitize()` is a FULL-ROW builder. It does not filter a
// payload; it expands one, emitting every column with a default:
//
//     stageHistory:     data.stageHistory     || [],
//     comments:         data.comments         || [],
//     contactIds:       data.contactIds       || [],
//     pipelineId:       data.pipelineId       || 'default',
//     createdBy:        data.createdBy        || null,
//
// That is correct for POST, where the row does not exist yet. It is destructive
// for the bulk PUT branches, because `bulkUpsert` derives its SET clause from the
// keys actually supplied — and after sanitize(), that is EVERY key. So a CSV
// overwrite carrying fourteen columns wrote all forty, blanking the deal's stage
// history, its Team Notes and its linked contacts with the empty arrays sanitize
// had just invented for them.
//
// This is 18b13, and 18b13 says the fix belongs in the endpoint, not the caller.
// The previous fix was in the caller: buildOpp stopped sending stageHistory /
// comments / contactIds, and sanitize put them straight back. The client-side fix
// was correct and completely ineffective, which is why the overwrite check passed
// on stage and ARR and failed the moment a comment was involved.
//
// Pure and dependency-free, deliberately. accounts.mjs, contacts.mjs and
// opportunities.mjs all import db/index.js, which is TypeScript, so anything
// defined in them loads only under `tsx` and never runs in the gates. Same
// reasoning as _bulk.mjs — and a rule that fixes silent data loss must not itself
// be untestable.

/**
 * Narrow each row to the columns present in the request payload.
 *
 * The set of kept columns is the UNION across the batch, not per row. Two
 * reasons, and the first is not optional:
 *
 *  1. `bulkUpsert` hands the whole chunk to a single multi-row INSERT. Rows with
 *     different key sets in one statement is a shape Drizzle has to reconcile,
 *     and the reconciliation is not ours to depend on. A uniform shape has no
 *     such question in it.
 *  2. If any row in the file supplies a column, that column is part of what this
 *     import describes. A row that left it blank is asserting blank, not
 *     asserting nothing — the user mapped that column.
 *
 * Note the asymmetry that makes this safe: a column NOT MAPPED in the CSV never
 * appears in any row, so it is never written and the stored value survives. A
 * column mapped and left empty appears in every row and is written as empty.
 * That is the distinction the old code could not make, because sanitize() made
 * every column look supplied.
 *
 * THIS ONLY HOLDS IF THE CLIENT KEEPS ITS HALF. It did not, at first: mapCsvRows
 * wrote '' for unmapped fields as well as empty ones, so every field in the
 * importer's list arrived looking supplied and an overwrite blanked the ones the
 * file never mentioned. Narrowing here is necessary and not sufficient -- see the
 * matching comment in src/utils/csvMapping.js. Neither half works alone.
 *
 * @param {Object[]} rows      raw payload rows, before sanitize
 * @param {(row:Object)=>Object} sanitize  the endpoint's own full-row sanitizer
 * @returns {Object[]} sanitized rows carrying only the supplied columns
 */
export function partialRows(rows, sanitize) {
    if (!Array.isArray(rows) || rows.length === 0) return [];
    if (typeof sanitize !== 'function') {
        throw new TypeError('partialRows requires the endpoint sanitize function');
    }

    // No special case for `id`. It is a key of every row by definition — all
    // three bulk PUT branches reject the batch with a 400 if any row lacks one —
    // so an `ALWAYS_KEEP` list containing it could never fire. It was written,
    // and the mutation harness proved it unreachable by surviving its removal.
    // A clause that cannot fire is worse than none: it reads as protection that
    // was never there (see 0A0000.3, onConflictDoNothing).
    const supplied = new Set();
    for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        for (const key of Object.keys(row)) supplied.add(key);
    }

    return rows.map(row => {
        const full = sanitize(row);
        const out = {};
        for (const key of Object.keys(full)) {
            if (supplied.has(key)) out[key] = full[key];
        }
        return out;
    });
}

/**
 * Single-record form, for the non-array PUT paths.
 */
export function partialRow(row, sanitize) {
    return partialRows([row], sanitize)[0];
}
