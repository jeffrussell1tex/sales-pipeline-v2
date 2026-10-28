// memberPickers.js — the member profile page's Team, Manager and Territory boxes (state §0.211). Pure. A value the
// options leave out is shown as itself, greyed — never as the first option, which is what a <select> shows for a
// value none of its options holds (UsersDetail.jsx, RoleSelect's comment; guide §18b101).
import { memberStatus } from './memberStatus.js';
import { ROLE_OPTIONS, canSeeAll } from '../../../utils/roles.js';

const ROLE_LABEL = Object.fromEntries(ROLE_OPTIONS.map((o) => [o.value, o.label]));
const blank = (v) => v === null || v === undefined || v === '';

// The held team's option value — no team id is ever this.
export const HELD_TEAM = '__held__';

// Every team of the org's list that has an id, by name, sorted; a second team of one name reads "East (2)" (in list
// order), so each can be told apart. An old plain-string entry has no id and is not offered.
export function teamOptions(teams) {
    const seen = new Map();
    return (teams || [])
        .filter((t) => t && typeof t === 'object' && typeof t.id === 'string' && t.id && t.name)
        .map((t) => {
            const n = (seen.get(t.name) || 0) + 1;
            seen.set(t.name, n);
            return { value: t.id, name: t.name, label: n > 1 ? `${t.name} (${n})` : t.name };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}

// The form's team once one is picked: its name and its id together; '' (unassigned) clears both.
export function teamPicked(options, id) {
    const t = (options || []).find((o) => o.value === id);
    return { team: t ? t.name : '', teamId: t ? t.value : '' };
}

// The member's team when the options do not hold it: null, or the words its greyed option shows.
export function heldTeam(form, options) {
    const id = form?.teamId, name = form?.team;
    if (blank(id) && blank(name)) return null;
    if (!blank(id)) return (options || []).some((o) => o.value === id) ? null : `${name || 'A team'} (no longer on the team list)`;
    return (options || []).some((o) => o.name === name) ? `${name} (not linked to the team list \u2014 pick it again)` : `${name} (not on the team list)`;
}

// Who the Manager box offers: a member of the org with access now whose role holds other members' records — an
// Admin or a Manager (roles.js canSeeAll; the roles the Teams page offers as a team's manager) — never the member
// themselves. { id, name }, by name; a pick stores the id with the name (managerPicked — state §0.212).
export function managerOptions(users, selfId) {
    return (users || [])
        .filter((u) => u && u.name && u.id && u.id !== selfId && canSeeAll(u.role) && memberStatus(u) === 'Active')
        .map((u) => ({ id: u.id, name: u.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// The form's manager once one is picked from the box: the member's name and id together; '' (none) clears both.
export function managerPicked(options, id) {
    const m = (options || []).find((o) => o.id === id);
    return { manager: m ? m.name : '', managerId: m ? m.id : '' };
}

// The name of a member's manager as the org names them now (state §0.212): the member the id names, else the name
// stored with it — a row from before §0.212, or a manager no longer a member. users: the org's roster.
export function managerNameOf(member, users) {
    const id = member?.managerId;
    const m = blank(id) ? null : (users || []).find((u) => u && u.id === id);
    return (m && m.name) || member?.manager || null;
}

// Why a member the box does not offer is not offered: the words beside their name.
const whyNotOffered = (m, selfId) => {
    if (m.id === selfId) return '(this member)';
    const status = memberStatus(m);
    if (status === 'Deactivated') return '(deactivated)';
    if (status === 'Invited') return '(invited, not yet joined)';
    return `(${ROLE_LABEL[m.role] || m.role || 'no role'})`;
};

// The member's manager when the box does not offer them as stored: null, or the words their greyed chip shows — by
// the id since §0.212; a name with no id (a row from before it) by the name, and one the box offers is not linked.
export function heldManager(form, options, users, selfId) {
    const id = form?.managerId, name = form?.manager;
    if (!blank(id)) {
        if ((options || []).some((o) => o.id === id)) return null;
        const byId = (users || []).find((u) => u && u.id === id);
        return byId ? `${byId.name} ${whyNotOffered(byId, selfId)}` : name ? `${name} (no longer a member)` : 'Former member';
    }
    if (blank(name)) return null;
    if ((options || []).some((o) => o.name === name)) return `${name} (not linked \u2014 remove, then pick them again)`;
    const m = (users || []).find((u) => u && u.name === name);
    return m ? `${name} ${whyNotOffered(m, selfId)}` : `${name} (no member has this name now)`;
}

// The member's territory when the list does not hold it.
export const heldTerritory = (name, names) => (blank(name) || (names || []).includes(name) ? null : `${name} (not on the territory list)`);
