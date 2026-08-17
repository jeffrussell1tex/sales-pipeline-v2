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

/**
 * Apply resolveStageChange across a batch. `priors` is a Map of id → stored row.
 * Returns the rows with their patches merged and `daysInStage` stripped —
 * it is a transport field, not a column.
 */
export function applyStageChanges(rows, priors, importDate) {
    let changedCount = 0;
    const out = (rows || []).map((row) => {
        const prior = priors?.get?.(row.id);
        const { changed, patch } = resolveStageChange(row, prior, importDate);
        if (changed) changedCount++;
        const { daysInStage: _transport, ...rest } = row;
        return { ...rest, ...patch };
    });
    return { rows: out, changedCount };
}
