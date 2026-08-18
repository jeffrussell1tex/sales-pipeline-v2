// _stage.mjs — what an import does to a deal's stage clock.
//
// WHY THIS EXISTS
// ---------------
// A CSV overwrite that moved a deal to Proposal left `stageChangedDate` alone and
// added no `stageHistory` entry, so "0 days in Proposal" was measured from the
// deal's creation and the move was invisible in the History tab. A deal moved by
// import could read as fresh indefinitely — the inverse of the `NaN > 14`
// never-stale bug, with the same consequence.
//
// THE TRAP THIS AVOIDS
// --------------------
// The obvious fix — stamp `stageChangedDate = importDate` on every overwrite — is
// worse than the bug. Re-importing the same file is normal here (the conflicts
// step is paged at 100 precisely because a same-file re-import produced 1,504
// conflicts), so a monthly refresh would reset every deal's stage clock to zero
// and nothing would ever flag as stalled again. It would also look right: every
// deal reads "2 days in stage", which is plausible, so nobody investigates.
//
// The clock therefore moves only when the stage actually changed, or when the
// file explicitly asserts a value. That is the same mapped-vs-unmapped contract
// the importer uses everywhere else (see src/utils/csvMapping.js):
//
//   | stage changed | daysInStage mapped | stageChangedDate            |
//   |---------------|--------------------|-----------------------------|
//   | yes           | yes                | importDate - days           |
//   | yes           | no                 | importDate                  |
//   | no            | yes                | importDate - days (asserted)|
//   | no            | no                 | UNTOUCHED                   |
//
// Only the server can evaluate this: the client does not know the prior stage.
//
// Pure and dependency-free — opportunities.mjs imports db/index.js and loads only
// under `tsx`, outside the gates.

// A deal cannot have entered its stage in the future. A negative value would put
// stageChangedDate ahead of today, making `days > 14` permanently false — the
// never-stale bug arriving through the front door this time.
// The two pure date helpers are shared with the client: the CREATE path derives
// stageChangedDate in the browser (no prior stage to compare against) and the
// OVERWRITE path derives it here. Two implementations of one date rule is how
// they drift, so they live in src/utils/stageClock.js and are re-exported.
export { parseDaysInStage, backdate, MAX_DAYS_IN_STAGE } from '../../src/utils/stageClock.js';
import { parseDaysInStage, backdate } from '../../src/utils/stageClock.js';

/**
 * Decide what an incoming import row does to one deal's stage clock and history.
 *
 * @param {Object} row     the incoming row (already narrowed to mapped columns)
 * @param {Object} prior   the stored row: { stage, stageHistory }
 * @param {string} importDate  yyyy-mm-dd
 * @returns {{changed:boolean, patch:Object}}  patch carries ONLY the keys to write
 */
export function resolveStageChange(row, prior, importDate) {
    const patch = {};
    const incomingStage = row?.stage;
    const priorStage = prior?.stage ?? null;

    // A stage is only "changed" if the file actually supplied one and it differs.
    // An unmapped Stage column must never be read as a move to undefined.
    const changed = Boolean(
        incomingStage !== undefined && incomingStage !== null && String(incomingStage).trim() !== ''
        && priorStage !== null && incomingStage !== priorStage
    );

    const days = Object.prototype.hasOwnProperty.call(row || {}, 'daysInStage')
        ? parseDaysInStage(row.daysInStage)
        : null;

    if (days !== null) {
        patch.stageChangedDate = backdate(importDate, days);
    } else if (changed) {
        patch.stageChangedDate = importDate;
    }

    if (changed) {
        // Appended to the array ALREADY IN THE DATABASE. The client never sends a
        // stageHistory array — that is what wiped stage history in 0A0000.1, and
        // this is the one place the field legitimately re-enters a write.
        const existing = Array.isArray(prior?.stageHistory) ? prior.stageHistory : [];
        patch.stageHistory = [...existing, {
            prevStage: priorStage,
            stage:     incomingStage,
            // The DERIVED date, not the import date, or the History tab will
            // contradict the "days in stage" shown in the header.
            date:      patch.stageChangedDate || importDate,
            source:    'import',
        }];
    }

    return { changed, patch };
}

// The two columns this module DERIVES per row rather than reading from the CSV.
// They are the reason applyStageChanges cannot simply hand its output to
// partialRows -- see the batch-uniformity note on applyStageChanges below.
const DERIVED_KEYS = ['stageChangedDate', 'stageHistory'];

// The stored value for a derived key, used to backfill a row this import does not
// touch. NOT sanitize()'s default: sanitize is a full-row builder, so its default
// for stageChangedDate is null and for stageHistory is [] -- writing either over a
// real row is the data loss this backfill exists to prevent.
function storedValue(key, prior) {
    if (key === 'stageHistory') {
        return Array.isArray(prior?.stageHistory) ? prior.stageHistory : [];
    }
    return prior?.[key] ?? null;
}

/**
 * Apply resolveStageChange across a batch. `priors` is a Map of id → stored row.
 * Returns the rows with their patches merged and `daysInStage` stripped —
 * it is a transport field, not a column.
 *
 * WHY THIS IS TWO PASSES
 * ----------------------
 * resolveStageChange is correct per row: a deal that did not move and whose file
 * asserts no daysInStage gets an EMPTY patch, so its stored clock survives. That
 * held in isolation and failed in composition.
 *
 * partialRows (see _sanitize.mjs) keeps the UNION of keys across the batch, and
 * that union is right for CSV columns -- a column is mapped or not, file-wide.
 * These two keys are not CSV columns. They are derived HERE, per row, so one deal
 * moving stage put `stageChangedDate` and `stageHistory` into the union for the
 * whole batch. Every row without a patch then went through sanitize(), which
 * emitted `stageChangedDate: null` and `stageHistory: []`, and bulkUpsert wrote
 * them.
 *
 * Observed on dev: a file containing one moved deal and one unmoved deal left the
 * unmoved deal with stageChangedDate null and its stage history erased. It had
 * never moved and the file did not mention it. In a 500-row import where 200 deals
 * move, the other 300 lose their clock and their history.
 *
 * The fix cannot be "omit the key on rows that have no patch". bulkUpsert hands a
 * whole chunk to ONE multi-row INSERT, so the rows must share a shape -- that is
 * union reason #1 in _sanitize.mjs and it still applies. So the shape stays
 * uniform and the value comes from the STORED row instead of sanitize's invented
 * default: a no-op write rather than a destructive one. Same move as backfilling
 * NOT NULL columns from the stored row in the bulkUpsert INSERT arm.
 *
 * Backfill happens ONLY when some row in the batch actually acquired the key. A
 * batch where nothing moved and nothing asserted days adds neither key, the union
 * excludes both, and nothing is written -- the untouched case, unchanged.
 *
 * `priors` must therefore carry stageChangedDate as well as stage and
 * stageHistory. opportunities.mjs selects all three.
 */
export function applyStageChanges(rows, priors, importDate) {
    let changedCount = 0;

    const staged = (rows || []).map((row) => {
        const prior = priors?.get?.(row.id);
        const { changed, patch } = resolveStageChange(row, prior, importDate);
        if (changed) changedCount++;
        const { daysInStage: _transport, ...rest } = row;
        return { row: { ...rest, ...patch }, patch, prior };
    });

    // Which derived keys did ANY row in this batch acquire? Only those need
    // backfilling; the rest must stay absent so the stored value survives.
    const inBatch = DERIVED_KEYS.filter(
        key => staged.some(s => Object.prototype.hasOwnProperty.call(s.patch, key))
    );

    const out = staged.map(({ row, prior }) => {
        for (const key of inBatch) {
            if (!Object.prototype.hasOwnProperty.call(row, key)) {
                row[key] = storedValue(key, prior);
            }
        }
        return row;
    });

    return { rows: out, changedCount };
}
