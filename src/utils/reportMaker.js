// src/utils/reportMaker.js — who made a saved report, in words (state §0.250, guide §18b125 rule 2).
//
// saved_reports.owner_id holds the maker's CLERK user id (the POST stamps verifyAuth's userId); owner_name is a
// snapshot of a name, stamped by the server when the report was made (never a body's since §0.250), and it goes
// stale when the member is renamed. The library and Home therefore name the maker as the delivery email already
// does (report-deliveries.mjs ownerOf): the LIVE name of the member of THIS org whose Clerk id is the row's
// ownerId — else the stored name, else none. Never the viewer's.
//
// The caller (netlify/functions/saved-reports.mjs makersNamed) hands the roster of the org it read the rows in —
// one org-scoped read, names and Clerk ids only — so a Clerk id that is a member of two orgs reads this org's name.
// Pure: nothing is written, the rows are copied.

/** The rows with each one's maker named: the live roster name by its ownerId, else the stored name, else null. */
export const namedByMaker = (rows, roster) => {
    const names = new Map();
    for (const u of Array.isArray(roster) ? roster : []) {
        if (u && u.clerkUserId && u.name && !names.has(u.clerkUserId)) names.set(u.clerkUserId, u.name);
    }
    return (Array.isArray(rows) ? rows : []).map((r) => (r && typeof r === 'object'
        ? { ...r, ownerName: (r.ownerId && names.get(r.ownerId)) || r.ownerName || null }
        : r));
};
