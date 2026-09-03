// _coaching.mjs — who may see a coaching note. Pure, so node --test can pin it
// (the function file imports db/index.js and is out of the unit suites' reach).
//
// The rules, Jeff's two decisions of 2 Sep 2026 (handoff item 17, state §0.82):
//
//   * A note addressed to PEOPLE is visible to its author, its recipients and
//     Admins. NOT to other managers — not even a recipient's own manager unless
//     they wrote it.
//   * A note addressed to a TEAM is visible to the team's manager and to its
//     members — but a member sees only the notes dated on or after their FIRST
//     DAY on the team. Membership is resolved at READ time, never expanded into
//     per-user rows at write time, so a rep who joins later sees the team's
//     later notes without anyone re-addressing them.
//   * "First day" is users.team_joined_at (stamped by users.mjs whenever a
//     rep's team changes), falling back to the roster row's created_at for
//     members whose team has not changed since the column arrived.
//
// Identity space: every id here is users.id (usr_<uuid>), server-stamped —
// never a display name and never a Clerk id (CLAUDE.md, guide §17).
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// The same shape as src/utils/dateLocal.js isoLocal — a wall-calendar day from
// the process's local clock. Copied rather than imported: the functions tree
// does not reach into src/, and function-imports.test.mjs only follows edges
// between function files.
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** yyyy-mm-dd of an instant, or '' when there is none. */
const dayOfInstant = (v) => {
    if (!v) return '';
    const d = v instanceof Date ? v : new Date(v);
    return Number.isNaN(d.getTime()) ? '' : isoLocal(d);
};

/** The first day a user counts as a team member: team_joined_at, else created_at. '' when neither is known (then no floor applies). */
export function firstDayOf(user) {
    if (!user) return '';
    return dayOfInstant(user.teamJoinedAt) || dayOfInstant(user.createdAt);
}

/** The team id a roster row belongs to: the profile blob's teamId (TeamsDetail writes it there). */
export function teamIdOf(user) {
    return user?.teamId || user?.profile?.teamId || null;
}

/**
 * May `viewer` (a users row + role) see `note`?
 *   viewer: { id, role, teamId?, profile?, createdAt?, teamJoinedAt? }
 *   teams:  settings.extra.teams — [{ id, managerId, ... }]
 */
export function noteVisibleTo(note, viewer, teams = []) {
    if (!note || !viewer || !viewer.id) return false;           // an unresolvable caller sees nothing (18b22)
    if (viewer.role === 'Admin') return true;
    if (note.authorId && note.authorId === viewer.id) return true;
    const recipients = Array.isArray(note.recipientIds) ? note.recipientIds : [];
    if (recipients.includes(viewer.id)) return true;
    if (note.teamId) {
        const team = (Array.isArray(teams) ? teams : []).find(t => t && t.id === note.teamId);
        if (team && team.managerId && team.managerId === viewer.id) return true;
        if (teamIdOf(viewer) === note.teamId) {
            const first = firstDayOf(viewer);
            const day = DAY_RE.test(String(note.date || '')) ? note.date : '';
            // No floor known, or the note is on/after the member's first day.
            if (!first || !day || first <= day) return true;
        }
    }
    return false;
}

/** Has `userId` read the note? readBy is { [userId]: isoInstant }. */
export function isReadBy(note, userId) {
    return !!(userId && note?.readBy && typeof note.readBy === 'object' && note.readBy[userId]);
}

/** May `viewer` delete the note? Its author, or an Admin. */
export function canDeleteNote(note, viewer) {
    if (!note || !viewer || !viewer.id) return false;
    return viewer.role === 'Admin' || note.authorId === viewer.id;
}

/**
 * Validate a create payload's audience. Exactly one of a non-empty recipient
 * list or a team id. Returns { ok, error, recipientIds, teamId }.
 */
export function audienceOf(body) {
    const recipientIds = [...new Set((Array.isArray(body?.recipientIds) ? body.recipientIds : []).filter(v => typeof v === 'string' && v))];
    const teamId = typeof body?.teamId === 'string' && body.teamId ? body.teamId : null;
    if (recipientIds.length && teamId) return { ok: false, error: 'Address a note to people OR to a team, not both.' };
    if (!recipientIds.length && !teamId) return { ok: false, error: 'Address the note to at least one person or to a team.' };
    return { ok: true, recipientIds, teamId };
}

export const isDay = (v) => DAY_RE.test(String(v || ''));
