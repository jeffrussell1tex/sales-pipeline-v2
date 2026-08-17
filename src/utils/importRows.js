// importRows.js — CSV record → request body for the opportunities importer.
//
// WHY THIS IS ITS OWN MODULE
// --------------------------
// `buildOpp` lived inside a callback prop inside ModalLayer.jsx, which imports
// React, so nothing about it was reachable by `node --test`. It carried this
// comment:
//
//     "an overwrite now sends only the columns the CSV actually describes and
//      the server merges the rest"
//
// and the ten lines beneath it did the opposite. It built all thirteen columns
// unconditionally, whatever the file contained:
//
//     salesRep:           o.salesRep           || currentUser,
//     implementationCost: parseFloat(o.implementationCost) || 0,
//     nextSteps:          o.nextSteps          || '',
//
// So an overwrite reassigned the deal to whoever ran the import, zeroed the
// implementation cost, and blanked next steps, products, territory and vertical —
// none of which the file mentioned. Confirmed on dev twice: Next Steps was
// blanked by an import whose CSV has no Next Steps column, and it was the only
// one of four probes to fail, because the other three are not in the field list
// at all.
//
// The create path and the overwrite path are NOT the same record, and the
// difference is not cosmetic:
//   - CREATE fills every column, because the row does not exist and a default is
//     the best available answer.
//   - OVERWRITE fills only what the file described, because every other column
//     already has a real value and a default would destroy it.
//
// Pure and dependency-free so the split is pinned by tests/import-rows.test.mjs.

// Coercions, keyed by column. Applied ONLY to keys the caller actually supplied —
// `mapCsvRows` omits unmapped fields, and that omission has to survive this step
// or it was pointless. The two halves of the contract are here and in
// src/utils/csvMapping.js; neither works alone.
const CSV_COLUMNS = {
    opportunityName:    (v) => v || '',
    account:            (v) => v || '',
    salesRep:           (v) => v || '',
    stage:              (v) => v || '',
    arr:                (v) => parseFloat(v) || 0,
    implementationCost: (v) => parseFloat(v) || 0,
    forecastedCloseDate:(v) => v || '',
    products:           (v) => v || '',
    notes:              (v) => v || '',
    nextSteps:          (v) => v || '',
    territory:          (v) => v || '',
    vertical:           (v) => v || '',
    probability:        (v) => parseInt(v, 10) || null,
    createdDate:        (v) => v || '',
};

// Columns a new deal always gets, even when the file is silent.
const CREATE_DEFAULTS = {
    opportunityName: '', account: '', salesRep: '', stage: '',
    arr: 0, implementationCost: 0, forecastedCloseDate: '', products: '',
    notes: '', nextSteps: '', territory: '', vertical: '', probability: null,
};

export const coerceCsvColumns = (row) => {
    const out = {};
    for (const [key, coerce] of Object.entries(CSV_COLUMNS)) {
        if (Object.prototype.hasOwnProperty.call(row || {}, key)) out[key] = coerce(row[key]);
    }
    return out;
};

/**
 * @param {Object}  row          a record from mapCsvRows — only mapped columns
 * @param {Object}  opts
 * @param {string}  [opts.existingId]  set => OVERWRITE
 * @param {string}  opts.currentUser
 * @param {string}  opts.pipelineId
 * @param {string}  opts.today         ISO date, yyyy-mm-dd
 * @param {() => string} opts.newId
 */
export function buildOpportunityRow(row, { existingId = null, currentUser = '', pipelineId = 'default', today = '', newId } = {}) {
    const fromCsv = coerceCsvColumns(row);

    // OVERWRITE: the id, and strictly what the file described. Anything else is
    // already correct in the database and the endpoint merges it (18b13).
    if (existingId) {
        // createdDate is provenance, not content. A file that happens to carry a
        // Created Date column must not rewrite when the deal was created.
        const { createdDate: _drop, ...rest } = fromCsv;
        return { id: existingId, ...rest };
    }

    // CREATE: fill everything.
    const merged = { ...CREATE_DEFAULTS, ...fromCsv };
    merged.opportunityName = merged.opportunityName || merged.account || 'Imported Deal';
    merged.salesRep        = merged.salesRep        || currentUser;
    merged.stage           = merged.stage           || 'Qualification';

    return {
        id: typeof newId === 'function' ? newId() : undefined,
        pipelineId,
        ...merged,
        createdDate: fromCsv.createdDate || today,
        createdBy:   currentUser,
        // The deal entered its stage in this system today. Leaving it unset
        // rendered "NaNd" in the funnel and made `stale = NaN > 14` permanently
        // false, so an imported deal could never flag as stalled.
        stageChangedDate: today,
        stageHistory: [],
        comments:     [],
        contactIds:   [],
    };
}
