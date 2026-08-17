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
 * }}
 */
export function mapCsvRows(csvRows, appFields, fieldMapping) {
    const fields = appFields || [];
    const required = fields.filter(f => f.required);

    const records = [];
    const dropped = [];

    (csvRows || []).forEach((row, idx) => {
        const record = {};
        for (const field of fields) {
            const colIdx = fieldMapping?.[field.key];
            record[field.key] = isMapped(colIdx) ? (row[colIdx] || '') : '';
        }

        if (rowHasAnyRequired(record, required)) {
            records.push(record);
        } else {
            dropped.push({
                // +2, not +1: row 1 of the file is the header, so this is the
                // number the user will see in Excel when they go to fix it.
                rowNumber: idx + 2,
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

    return { records, dropped, unmappedRequired };
}

/**
 * One line for the preview banner. Returns null when there is nothing to say, so
 * the caller can render conditionally without duplicating the logic.
 */
export function describeDropped({ records, dropped, unmappedRequired }, totalRows) {
    if (!dropped.length) return null;

    const cause = unmappedRequired.length
        ? ` No column is mapped to ${unmappedRequired.join(' or ')}.`
        : '';

    if (records.length === 0) {
        return `None of the ${totalRows} rows in this file can be imported — every row is missing all of its required fields.${cause} Go back and check the column mapping.`;
    }

    const which = dropped.slice(0, 5).map(d => d.rowNumber).join(', ');
    const more = dropped.length > 5 ? `, +${dropped.length - 5} more` : '';
    return `${dropped.length} of ${totalRows} rows will be skipped — required fields are empty (rows ${which}${more}).${cause}`;
}
