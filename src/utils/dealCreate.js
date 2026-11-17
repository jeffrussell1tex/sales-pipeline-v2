// src/utils/dealCreate.js — what a deal create may name of the lists a deal holds (state §0.252; OPEN_ITEMS §4.2;
// guide §18b119 rule 2; Jeff, 16 Nov: "Refuse non-empty, all 3").
//
// A deal's team notes, its stage history and its close-date history are added to on the server, one entry at a time
// (state §0.236, §0.239): who wrote a note, and each move, are the server's (guide §18b119 rules 3 and 5). A save
// naming a whole list is refused (opportunities.mjs's PUTs). A create was not: both POSTs stored the notes and the
// stage history a body sent, so a request could make a deal with notes under any author and time, and any history.
//
// The rule for a create, single or bulk: a list it names is absent, null or empty — every screen sends the two empty
// ones (the deal window, the Closed Lost dialog, the CSV import) — else the create is refused, 400, nothing written.
// An empty list is taken: the deal starts with none (the column defaults), and its close-date history stays none
// until the date first moves (§0.239).

export const CREATE_LISTS = Object.freeze(['comments', 'stageHistory', 'closeDateHistory']);

// What a refusal says, by the list it names.
export const CREATE_LIST_WORDS = Object.freeze({
    comments:         'A new deal starts with no notes. Post them once it is saved.',
    stageHistory:     'A new deal starts with no stage history. The server adds each move.',
    closeDateHistory: 'A new deal starts with no close-date history. The server adds each move.',
});

// The first list a create names with anything in it — { field, error } — or null when it may be made.
export function createListRefused(row) {
    if (!row || typeof row !== 'object') return null;
    for (const field of CREATE_LISTS) {
        if (!Object.prototype.hasOwnProperty.call(row, field)) continue;
        const v = row[field];
        if (v === null || v === undefined) continue;
        if (Array.isArray(v) && v.length === 0) continue;
        return { field, error: CREATE_LIST_WORDS[field] };
    }
    return null;
}
