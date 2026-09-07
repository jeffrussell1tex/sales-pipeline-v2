// activityView.js — the pure half of reading an activity (state §0.93, item 26).
//
// Every logged email is one activity row whose `notes` is "<subject> — <body>"
// (email-inbound.mjs), and until §0.93 the only places an activity appeared were
// list rows that either dumped the whole field unclamped (the rails) or cut it
// at 80 characters with no way to see the rest (the deal History tab). Nothing
// was clickable and no read-only view existed. These helpers split the field
// back into what the row shows and what the viewer shows, and decide who may
// open the editor from the viewer — mirroring the server's rule, never
// replacing it (activities.mjs → assertOwnership → mayMutate).

const SEP = ' — ';   // the em-dash join email-inbound.mjs writes

/** { subject, body } — the notes with a leading "<subject> — " removed when the subject is known. */
export function emailPartsOf(activity) {
    const subject = typeof activity?.subject === 'string' && activity.subject.trim() ? activity.subject.trim() : null;
    const notes = typeof activity?.notes === 'string' ? activity.notes : '';
    if (subject && notes.startsWith(subject + SEP)) return { subject, body: notes.slice(subject.length + SEP.length) };
    if (subject && notes === subject) return { subject, body: '' };
    return { subject, body: notes };
}

/** What a list row shows: a bold title when there is a subject, and the snippet the row clamps. */
export function previewOf(activity) {
    const { subject, body } = emailPartsOf(activity);
    return { title: subject, snippet: body };
}

// Who may open the editor from the viewer. The server decides on the write
// (assertOwnership → mayMutate); this only decides whether to SHOW the button,
// and it says no wherever the server would: read roles, a caller that cannot
// be resolved, an owner id that is not an app user id (18b22). Unassigned rows
// are open to any writing role, as on the server.
const WRITE_ROLES = new Set(['Admin', 'Manager', 'User']);
const SEE_ALL_ROLES = new Set(['Admin', 'Manager']);
const isAppUserId = (v) => typeof v === 'string' && v.startsWith('usr_') && v.length > 4;

export function canEditActivity(activity, { userRole, currentUserId } = {}) {
    if (!activity || !WRITE_ROLES.has(userRole)) return false;
    if (SEE_ALL_ROLES.has(userRole)) return true;
    const owner = typeof activity.ownerId === 'string' ? activity.ownerId.trim() : activity.ownerId;
    if (owner === null || owner === undefined || owner === '') return true;   // unassigned
    if (!isAppUserId(owner) || !isAppUserId(currentUserId)) return false;
    return owner === currentUserId;
}
