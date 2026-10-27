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
// themselves. { id, name }, by name (step B, §0.212, is to store the id).
export function managerOptions(users, selfId) {
    return (users || [])
        .filter((u) => u && u.name && u.id && u.id !== selfId && canSeeAll(u.role) && memberStatus(u) === 'Active')
        .map((u) => ({ id: u.id, name: u.name }))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// The member's manager when the options do not offer them: null, or the words its greyed option shows.
export function heldManager(form, options, users, selfId) {
    const name = form?.manager;
    if (blank(name) || (options || []).some((o) => o.name === name)) return null;
    const m = (users || []).find((u) => u && u.name === name);
    if (!m) return `${name} (no member has this name now)`;
    if (m.id === selfId) return `${name} (this member)`;
    const status = memberStatus(m);
    if (status === 'Deactivated') return `${name} (deactivated)`;
    if (status === 'Invited') return `${name} (invited, not yet joined)`;
    return `${name} (${ROLE_LABEL[m.role] || m.role || 'no role'})`;
}

// The member's territory when the list does not hold it.
export const heldTerritory = (name, names) => (blank(name) || (names || []).includes(name) ? null : `${name} (not on the territory list)`);
