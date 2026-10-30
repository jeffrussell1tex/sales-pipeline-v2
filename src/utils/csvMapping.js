// csvMapping.js — CSV rows → app records, and an account of what was discarded.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// getMappedData() inside CsvImportModal ended in:
//
//     .filter(r => appFields.filter(f => f.required).some(f => r[f.key]?.trim()))
//
// — a silent drop with no counterpart anywhere in the UI. An accounts CSV run
// through the CONTACTS importer maps neither firstName nor lastName, so every row
// fails that filter: six rows in, zero out, and the modal renders a green tick
// and "Import Complete!". The user is congratulated for importing nothing.
//
// The drop itself is not the bug — a row with no required field genuinely cannot
// be saved. Not saying so is. This module returns the discards alongside the
// records so the modal can surface them at PREVIEW, before anything is sent,
// which is the only step where the user can still fix the mapping.
//
// Pure and dependency-free: CsvImportModal imports React, so a rule that fixes a
// silent drop would otherwise be as untestable as the drop was. Same reasoning as
// csvAutoMap.js, which this runs immediately after.

import { toLocalDay } from './dateLocal.js';

// A field declared `type: 'day'` (Close Date, Created Date) REFUSES its row when
// the cell holds something toLocalDay cannot read. The importer used to pass
// such a cell through as written: "Sept 15" landed in a varchar(20), every
// reader appended noon to it, and that deal was an Invalid Date everywhere
// downstream (0.60). Blanking it instead would erase a real date on an
// overwrite with nothing on the receipt to say so. So the row is refused HERE,
// at the step where the user can still fix the file, and the banner names the
// row, the field and the cell (0.64, Jeff: refuse). A blank cell is not a bad
// date; it is silence, and silence is allowed. Only the first bad cell in a row
// is named — one is enough to send the user back to the file.
const unreadableDay = (fields, fieldMapping, record) =>
    fields.filter(f => f.type === 'day'
        && isMapped(fieldMapping?.[f.key])
        && (record[f.key] || '').trim() !== ''
        && toLocalDay(record[f.key]) === null);

// A row survives if ANY required field carries a value.
//
// DELIBERATELY PRESERVED, not tidied. `.some` (not `.every`) means a contact with
// a first name but no last name is kept, and the required marks on the field list
// therefore mean "at least one of these", not "all of these". That is the shipped
// behaviour and real files depend on it — mononyms, companies in a person field.
// Tightening it to `.every` is a product decision with an import-breaking blast
// radius, so it is pinned by test rather than changed here.
const rowHasAnyRequired = (record, requiredFields) =>
    requiredFields.length === 0 || requiredFields.some(f => (record[f.key] || '').trim() !== '');

// Is this field wired to a CSV column at all?
// Mirrors the guard getMappedData used: undefined and '' both mean unmapped, and
// a negative index is the "— Skip this field —" option.
const isMapped = (colIdx) => colIdx !== undefined && colIdx !== '' && colIdx >= 0;

/**
 * @param {string[][]} csvRows      parsed data rows (header row already removed)
 * @param {{key:string,label:string,required?:boolean}[]} appFields
 * @param {Record<string, number|string>} fieldMapping  field key → column index
 * @returns {{
 *   records: Object[],
 *   dropped: {rowNumber:number, sample:string}[],
 *   unmappedRequired: string[],
 *   rowNumbers: number[],
 * }}
 */
export function mapCsvRows(csvRows, appFields, fieldMapping, lineNumbers) {
    const fields = appFields || [];
    const required = fields.filter(f => f.required);
    // Each row's line in the file (the modal's parse keeps them — a blank line it drops still counts in Excel, state
    // §0.215); none given: the row's place, + 2.
    const lineOf = (idx) => (Array.isArray(lineNumbers) && lineNumbers[idx]) || idx + 2;

    const records = [];
    // Each record's row in the file, as the user sees it (state §0.215): a refusal names it.
    const rowNumbers = [];
    const dropped = [];

    (csvRows || []).forEach((row, idx) => {
        // An UNMAPPED field is omitted entirely; a MAPPED field is always
        // present, even when the cell is empty.
        //
        // That distinction is the whole contract with partialRows() on the
        // server. This used to write '' for both, so a CSV with no Next Steps
        // column still sent `nextSteps: ''`, the endpoint saw a supplied column,
        // and an overwrite blanked the field. Confirmed on dev: Team Notes, the
        // linked contacts and the stage history all survived an overwrite and
        // Next Steps did not -- because those three are never in the field list
        // at all, and Next Steps is.
        //
        // New records are unaffected: buildOpp and the account/contact mappers
        // all coalesce with `|| ''`, so an absent key still lands as empty.
        const record = {};
        for (const field of fields) {
            const colIdx = fieldMapping?.[field.key];
            if (isMapped(colIdx)) record[field.key] = row[colIdx] || '';
        }

        if (rowHasAnyRequired(record, required)) {
            const bad = unreadableDay(fields, fieldMapping, record);
            if (bad.length === 0) {
                records.push(record);
                rowNumbers.push(lineOf(idx));
            } else {
                // Same row numbering and sample as a required-field drop, plus
                // what was wrong: the field and the cell, verbatim, so the user
                // can find it in the file. `reason` separates the two classes
                // for the banner; a drop without one is a required-field drop.
                dropped.push({
                    sample: (row || []).filter(Boolean).slice(0, 3).join(', ').slice(0, 60),
                    reason: 'date',
                    field:  bad[0].label,
                    value:  (record[bad[0].key] || '').trim(),
                    rowNumber: lineOf(idx)
                });
            }
        } else {
            dropped.push({
                // The row's line in the file (blank lines counted; else +2,
                // not +1: row 1 is the header), the number the user will see
                // in Excel when they go to fix it.
                rowNumber: lineOf(idx),
                sample: (row || []).filter(Boolean).slice(0, 3).join(', ').slice(0, 60),
            });
        }
    });

    // The diagnosis, not just the symptom. If every row was dropped it is almost
    // never 500 bad rows — it is a required field that no column was mapped to,
    // which is what an accounts file in the contacts importer looks like. Naming
    // the field turns "0 imported" into something the user can act on.
    const unmappedRequired = required
        .filter(f => !isMapped(fieldMapping?.[f.key]))
        .map(f => f.label);

    return { records, dropped, unmappedRequired, rowNumbers };
}

// What an Overwrite sends of a record: the cells the file fills (state §0.216; Jeff, 30 Oct, Q14: "Keep what's
// stored"). A mapped column's empty cell is in the record as '' (above) and wrote over what was stored — a blank
// Sales Rep unassigned the deal, a blank Stage set Discovery, a blank ARR 0 — so an Overwrite leaves it out, as an
// unmapped column is left out, and the server keeps the stored value (partialRows' stored rows: a key another row of
// the request sends is filled from the stored row, never written empty). A key that is no text — the plan's own
// annotations — is kept.
export function filledCells(record) {
    const out = {};
    for (const [key, value] of Object.entries(record || {})) {
        if (typeof value === 'string' && value.trim() === '') continue;
        out[key] = value;
    }
    return out;
}

/**
 * One line for the preview banner. Returns null when there is nothing to say, so
 * the caller can render conditionally without duplicating the logic.
 *
 * Two classes of drop, two sentences. The required-field wording is unchanged
 * from before date refusals existed and is pinned by test; the refusal sentence
 * names each row with its cell so the user can find it, and says what shape
 * to write instead.
 */
export function describeDropped({ records, dropped, unmappedRequired }, totalRows) {
    if (!dropped.length) return null;

    const byRequired = dropped.filter(d => d.reason !== 'date');
    const byDate     = dropped.filter(d => d.reason === 'date');

    const cause = unmappedRequired.length
        ? ` No column is mapped to ${unmappedRequired.join(' or ')}.`
        : '';

    const parts = [];

    if (byRequired.length) {
        if (records.length === 0 && byDate.length === 0) {
            return `None of the ${totalRows} rows in this file can be imported — every row is missing all of its required fields.${cause} Go back and check the column mapping.`;
        }
        const which = byRequired.slice(0, 5).map(d => d.rowNumber).join(', ');
        const more = byRequired.length > 5 ? `, +${byRequired.length - 5} more` : '';
        parts.push(`${byRequired.length} of ${totalRows} rows will be skipped — required fields are empty (rows ${which}${more}).${cause}`);
    }

    if (byDate.length) {
        const shown = byDate.slice(0, 5).map(d => `row ${d.rowNumber}: "${d.value}" in ${d.field}`).join('; ');
        const more = byDate.length > 5 ? `; +${byDate.length - 5} more` : '';
        const lead = records.length === 0 && byRequired.length === 0
            ? `None of the ${totalRows} rows in this file can be imported — every row has a date that cannot be read`
            : `${byDate.length} of ${totalRows} rows will be refused — a date cannot be read`;
        parts.push(`${lead} (${shown}${more}). Write dates as m/d/yyyy or yyyy-mm-dd and try again.`);
    }

    return parts.join(' ');
}
