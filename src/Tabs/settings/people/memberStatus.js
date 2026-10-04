// A member's status in this org, read from their roster row (state §0.164).
//
// `active: false` means two different things on a row:
//   - an invitation not yet accepted: the invite stores the row off, with status
//     'Invited' and no Clerk link, until the first sign-in links it;
//   - a member an Admin deactivated: refused on every request in this org.
// Reading every inactive row as Deactivated listed each pending invitation as
// deactivated, and would have offered to reactivate it. A LINKED inactive row is
// deactivated whatever its stored status says — the server refuses it.
export function memberStatus(u) {
    const invited = u.status === 'Invited' || u.status === 'invited';
    if (u.active === false) return invited && !u.clerkUserId ? 'Invited' : 'Deactivated';
    return invited ? 'Invited' : 'Active';
}

// The Pending invites list (state §0.165): the roster's invitations not yet
// accepted and this org's pending Clerk invitations, one entry per email — a
// row with no live invitation (expired, or revoked in Clerk) still shows, to be
// resent or revoked; an invitation with no row (made in Clerk's dashboard) shows
// too. The newest invitation wins when Clerk holds two for one address.
export function invitationEntries(users, invites) {
    const byEmail = new Map();
    for (const u of users) {
        const email = (u.email || '').toLowerCase();
        if (!email || memberStatus(u) !== 'Invited') continue;
        byEmail.set(email, { email, row: u, invite: null });
    }
    for (const inv of invites) {
        const email = (inv.email || '').toLowerCase();
        if (!email) continue;
        const entry = byEmail.get(email) || { email, row: null, invite: null };
        if (!entry.invite || (inv.createdAt || 0) > (entry.invite.createdAt || 0)) entry.invite = inv;
        byEmail.set(email, entry);
    }
    return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
}
