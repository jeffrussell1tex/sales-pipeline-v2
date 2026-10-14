// src/utils/techLogin.js
//
// A technician's login (state §0.201 — batch 4b-1 of OPEN_ITEMS §1 item 1; Jeff, 14 Oct: "Fix it in 4b-1"):
// dispatch_technicians.userId holds the Clerk identity of a member of THIS org — what the server matches a
// Technician's sign-in against (netlify/functions/_techScope.mjs, resolveTechnicianId). The Technicians screen
// picked the member by their app id (users.id, usr_…) and the endpoint stored it as sent: an id no sign-in
// ever matches, so a Technician linked there was refused on every Dispatch screen. And any value was taken: a
// full-access role could link a technician row to anyone's login — a Technician-role member linked to a
// colleague's row reads that colleague's jobs and the customers' addresses. Pure: the endpoint reads the member
// and the technician already holding the login; tests/dispatch-links.test.mjs runs it.

export const LOGIN_NOT_AN_ID = 'A login must name a member by their id.';
export const LOGIN_NOT_IN_ORG = 'That member is not in your organization — pick one from the list.';

// What a write's userId asks, against the row as stored (null for a create): { keep } — the body names no
// login, or the one the row holds (never asked again, E3); { clear } — unlinked; { status: 400, … } — not
// text; or { member: { by, value } } — a member to read in this org: by their app id (usr_…, what the screen
// picks) or by their Clerk identity (what the column holds, and a seed or an API caller may send).
export function loginAsked(data, stored) {
    if (!data || typeof data !== 'object' || !('userId' in data)) return { keep: true };
    const value = data.userId;
    if (value == null || value === '') return { clear: true };
    if (typeof value !== 'string') return { status: 400, error: LOGIN_NOT_AN_ID, field: 'userId' };
    if (stored && stored.userId && value === stored.userId) return { keep: true };
    return { member: { by: value.startsWith('usr_') ? 'id' : 'clerkUserId', value } };
}

// What it stores, once read: member — the org's member it names, or null; takenBy — the name of another
// technician of the org already holding that member's login, or null. { userId } — the member's Clerk
// identity — or { status, error, field }, and nothing is written.
export function loginDecided(member, takenBy) {
    if (!member) return { status: 404, error: LOGIN_NOT_IN_ORG, field: 'userId' };
    const who = member.name || 'That member';
    if (!member.clerkUserId) return { status: 409, error: `${who} has not signed in yet — link them once they have accepted their invitation.`, field: 'userId' };
    if (takenBy) return { status: 409, error: `${who} is already linked to ${takenBy} — unlink them there first.`, field: 'userId' };
    return { userId: member.clerkUserId };
}
