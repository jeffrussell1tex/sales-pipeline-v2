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
