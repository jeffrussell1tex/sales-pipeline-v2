// teamMembership.js — who is on a team, in the shape the app stores it (state
// §0.168). A membership is three things, and the team editor (TeamsDetail's
// TeamModal) writes them together: the member's id in the team's `repIds` (the
// Teams page's list and counts), the team's id in the member's profile `teamId`
// (coaching notes addressed to a team, the manager digest — _coaching.mjs,
// digest.mjs) and the team's name in the member's `team`. The invite path wrote
// the name alone, so an invited member joined on no team's list and with no
// teamId. Pure, so the rules run under node --test.

// The id of the team called `name` — exact, as the screens offer the names (the
// import matches them to the workspace's spelling first). Null when there is no
// such team, or it is an old plain-string entry, which has no id or list.
export function teamIdNamed(teams, name) {
    if (!name) return null;
    const team = (teams || []).find((t) => t && typeof t === 'object' && t.name === name);
    return team?.id || null;
}

// The teams with each member added to the list of the team its `teamId` names.
// A member already listed, or naming no team, changes nothing; an untouched team
// is the same object. `changed` says whether there is anything to save.
export function teamsWithMembers(teams, members) {
    const joining = new Map();
    for (const m of members || []) {
        if (!m || !m.id || !m.teamId) continue;
        if (!joining.has(m.teamId)) joining.set(m.teamId, []);
        joining.get(m.teamId).push(m.id);
    }
    let changed = false;
    const next = (teams || []).map((t) => {
        if (!t || typeof t !== 'object' || !joining.has(t.id)) return t;
        const listed = Array.isArray(t.repIds) ? t.repIds : [];
        const added = joining.get(t.id).filter((id, i, all) => !listed.includes(id) && all.indexOf(id) === i);
        if (!added.length) return t;
        changed = true;
        return { ...t, repIds: [...listed, ...added] };
    });
    return { teams: next, changed };
}

// The teams with `memberId` off every list — a revoked invitation's row is gone,
// and its id would otherwise stay listed on the team its invite named.
export function teamsWithout(teams, memberId) {
    let changed = false;
    const next = (teams || []).map((t) => {
        if (!memberId || !t || typeof t !== 'object' || !Array.isArray(t.repIds) || !t.repIds.includes(memberId)) return t;
        changed = true;
        return { ...t, repIds: t.repIds.filter((id) => id !== memberId) };
    });
    return { teams: next, changed };
}
