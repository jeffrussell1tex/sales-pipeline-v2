// teamMembership.js — who is on a team, in the shape the app stores it (state
// §0.168). A membership is three things, and the team editor (TeamsDetail's
// TeamModal) writes them together: the member's id in the team's `repIds` (the
// Teams page's list and counts), the team's id in the member's profile `teamId`
// (coaching notes addressed to a team — _coaching.mjs) and the team's name in the
// member's `team` (the Monday digest matches a Manager's reps by it — _jobRoster.mjs
// teamRepsOf; state §0.211). The invite path wrote
// the name alone, so an invited member joined on no team's list and with no
// teamId. Pure, so the rules run under node --test.
//
// Since §0.222 a team is one record (batch 4b-3, step C): the server pairs a member's team name with its id and renames
// every holder of a renamed team, no new team may share a name, and the Teams page reads a list's entries as the
// members they name — by app id, or by the Clerk id a list held before members had app ids (teamPaired and below).
import { nameKey, NAME_MAX } from './memberName.js';

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

// The teams with `memberId` on the list of the team `teamId` names and on no other (state §0.211) — the member profile
// page's team change, by id: off every other list, onto the new team's once; null takes the member off every list.
// An old plain-string entry has no list and is left as it is; a team with no list gets one when it is the member's.
// `changed` says whether there is anything to save; an untouched team is the same object.
export function teamsWithMemberOn(teams, memberId, teamId) {
    let changed = false;
    const next = (teams || []).map((t) => {
        if (!memberId || !t || typeof t !== 'object') return t;
        const held = Array.isArray(t.repIds) ? t.repIds : [];
        const on = held.includes(memberId);
        if (teamId && t.id === teamId) {
            if (on) return t;
            changed = true;
            return { ...t, repIds: [...held, memberId] };
        }
        if (!on) return t;
        changed = true;
        return { ...t, repIds: held.filter((id) => id !== memberId) };
    });
    return { teams: next, changed };
}

// ── A team is one record (state §0.222 — batch 4b-3 of OPEN_ITEMS §1 item 1, step C; Jeff, 2 Nov: "Start please",
// every answer the Recommended — docs/design/links-batch-4b3/STEP-C.md, ANSWERS.md) ──────────────────────────────────

const unset = (v) => v === null || v === undefined || v === '';

// Each team's name by its id, from the org's teams list: an entry with a text id and a name of its own; the first
// entry of an id that has a name wins. A list that is no list names none.
export function teamNamesOf(list) {
    const named = new Map();
    for (const t of Array.isArray(list) ? list : []) {
        if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id || named.has(t.id)) continue;
        if (typeof t.name === 'string' && t.name.trim()) named.set(t.id, t.name);
    }
    return named;
}

// A member's team as a save stores it (Q7 — the server pairs a team's name and id, as it does a manager's): null when
// the save names neither, else { team, teamId }. A team id is stored with the name the org's list gives it now; an id
// the list no longer holds (a team deleted since: the id a member holds is never asked again) keeps the name sent,
// else the one stored. A blank id sent with a name keeps the name, linked to no team (N5 — an old tab's save, an
// import's row); a blank id with no name clears both. A name sent alone that differs from the stored one unlinks the
// id, so a member is never on one team by id and another by name. stored: { team, teamId } as stored, or null for a
// new member; nameOf(id): the list's name for the id, or undefined.
export function teamPaired(data, stored, nameOf) {
    if (!data || typeof data !== 'object') return null;
    const sentId = 'teamId' in data, sentName = 'team' in data;
    if (!sentId && !sentName) return null;
    if (sentId && !unset(data.teamId)) {
        const listed = typeof data.teamId === 'string' ? nameOf(data.teamId) : undefined;
        if (listed) return { team: listed, teamId: data.teamId };
        return { team: sentName ? (data.team || null) : (stored?.team ?? null), teamId: data.teamId };
    }
    if (sentId) return { team: sentName && !unset(data.team) ? data.team : null, teamId: null };
    if (unset(data.team) ? unset(stored?.team) : data.team === stored?.team) return null;
    return { team: data.team || null, teamId: null };
}

// The teams a teams save renames (Q7, N1): [{ id, name }] — each entry the body sends whose id the stored list holds
// and whose name differs from the stored one (teamNamesOf's, each side). A new team, an entry with no text id or no
// name, a list that is no list: none. Every member holding a renamed team's id is renamed with it (settings.mjs).
export function teamRenames(sent, stored) {
    const was = teamNamesOf(stored);
    return [...teamNamesOf(sent)].filter(([id, name]) => was.has(id) && was.get(id) !== name).map(([id, name]) => ({ id, name }));
}

// No new team of a name another has (Q8): the words, the ones the Teams page shows too.
export const teamNameTaken = (name) => `A team named "${String(name ?? '').trim()}" already exists — choose a different name.`;
export const TEAM_NAME_LONG = `A team name can be at most ${NAME_MAX} characters.`;
const nameOfEntry = (t) => (typeof t === 'string' ? t : t && typeof t === 'object' && typeof t.name === 'string' ? t.name : '');
const countBy = (names, keyOf) => {
    const n = new Map();
    for (const name of names) n.set(keyOf(name), (n.get(keyOf(name)) || 0) + 1);
    return n;
};

// What a teams list a body sends is refused for, or null (Q8 — no new duplicate team name): a name more teams of the
// list share than the stored list's do — by nameKey (spaces collapsed, trimmed, any case: every screen draws
// "North  East" as "North East"), counting the REPEATS (each team of a name after its first), so a pair stored before
// this rule stands and a rename to a free name, a swap or a delete passes; or a name longer than a member's team can
// hold (users.team is varchar(255) — a rename writes it in the save's own transaction) on any team but one that held
// that very name — judged by the team's id, so a long name stored before moves to no other team (the review, 2 Nov: a
// swap or a delete-and-rename carried it onto a team with members, and the save failed as a 500); an entry with no id
// of its own only as the stored list holds the name. { status: 400, error, field: 'teams' }. An old plain-string entry
// counts by its text; a blank name, and a list that is no list, count none.
export function teamNameRefused(sent, stored) {
    if (!Array.isArray(sent)) return null;
    const names = (list) => (Array.isArray(list) ? list : []).map(nameOfEntry).filter((n) => n.trim());
    const sentNames = names(sent), heldNames = names(stored);
    const heldById = teamNamesOf(stored), heldAsText = new Set(heldNames);
    const ownId = (e) => (e && typeof e === 'object' && typeof e.id === 'string' && e.id ? e.id : null);
    const tooLong = sent.some((e) => {
        const n = nameOfEntry(e);
        if (n.length <= NAME_MAX) return false;
        return ownId(e) ? heldById.get(ownId(e)) !== n : !heldAsText.has(n);
    });
    if (tooLong) return { status: 400, error: TEAM_NAME_LONG, field: 'teams' };
    const sentKeys = countBy(sentNames, nameKey), heldKeys = countBy(heldNames, nameKey);
    const repeatsOf = (counts, k) => Math.max(0, (counts.get(k) || 0) - 1);
    const taken = sentNames.find((n) => repeatsOf(sentKeys, nameKey(n)) > repeatsOf(heldKeys, nameKey(n)));
    return taken === undefined ? null : { status: 400, error: teamNameTaken(taken), field: 'teams' };
}

// Whether a team's list holds a member (state §0.222, J1 — Jeff, 2 Nov: "Allow, read only"): by their app id
// (users.id — every list is written in it), or by their Clerk id, as a list held its members before they had app ids
// (UKG's team, the census of 1 Nov). READ ONLY — the one place a Clerk id is matched to a member: no screen writes one
// into a list (a pick adds the app id; a list goes back with the entries it holds), never into a manager. A member
// with no Clerk id is never matched by one (a stored null names no one).
export const namesMember = (id, u) => !!u && !unset(id) && (id === u.id || (!!u.clerkUserId && id === u.clerkUserId));
export const holdsMember = (ids, u) => Array.isArray(ids) && ids.some((id) => namesMember(id, u));
// The list without the member, by either id.
export const withoutMember = (ids, u) => (Array.isArray(ids) ? ids.filter((id) => !namesMember(id, u)) : []);

// The member saves a team's save sends (state §0.222 — OPEN_ITEMS §4.3: the Teams page cleared the team of every
// holder of its id its list did not hold by app id, so a save of UKG's team, a colour change too, cleared its
// members): [{ u, body }]. A member the list holds now (a rep or the manager, by either id) whose team is another
// joins it — { team, teamId, territory, vertical }; a member the list held when the window opened and does not now,
// whose team is this one, leaves it — all four cleared; when the team's territory or vertical changed, every member
// the list holds who is on it is sent the two (N2, as before §0.222). No one else is sent anything: a holder of the
// team's id the list did not hold is left as they are (N12), and a rename is the server's (it renames every holder by
// id — settings.mjs). A join goes only to a member the list holds by their app id, or one the Admin added in this
// window — never one it holds only by a Clerk id it held when the window opened (the review, 2 Nov: a member moved off
// the team elsewhere — the profile page moves by app id, N13 — keeps that entry, and a save of the team, a colour
// change too, put them back on it). opened: the team as the window opened, null for a new team; saved: as saved.
export function teamSaveMembers({ opened, saved, users }) {
    const out = [];
    const onNow = (u) => holdsMember(saved?.repIds, u) || namesMember(saved?.managerId, u);
    const onBefore = (u) => !!opened && (holdsMember(opened.repIds, u) || namesMember(opened.managerId, u));
    const byAppId = (u) => (Array.isArray(saved?.repIds) && saved.repIds.includes(u.id)) || saved?.managerId === u.id;
    const placeMoved = !!opened && ((opened.territory || '') !== (saved?.territory || '') || (opened.vertical || '') !== (saved?.vertical || ''));
    for (const u of users || []) {
        if (!u || !u.id || !saved) continue;
        const now = onNow(u);
        if (now && u.teamId !== saved.id) {
            if (byAppId(u) || !onBefore(u)) out.push({ u, body: { id: u.id, team: saved.name, teamId: saved.id, territory: saved.territory, vertical: saved.vertical } });
        }
        else if (!now && onBefore(u) && u.teamId === saved.id) out.push({ u, body: { id: u.id, team: '', teamId: '', territory: '', vertical: '' } });
        else if (now && placeMoved) out.push({ u, body: { id: u.id, territory: saved.territory, vertical: saved.vertical } });
    }
    return out;
}

// The app's roster once a team's save landed (state §0.222): each member a save went to as the server answered it
// (answered: Map id -> the row), and every other holder of a renamed team's id — an inactive member too — by its new
// name, as the server renamed them. renamed: { id, name }, or null.
export function rosterAfterTeamSave(users, answered, renamed) {
    return (users || []).map((u) => {
        if (!u) return u;
        if (answered && answered.has(u.id)) return answered.get(u.id);
        if (renamed && u.teamId === renamed.id && u.team !== renamed.name) return { ...u, team: renamed.name };
        return u;
    });
}

// The app's settings once a member's removal landed (state §0.222 — Q9: the member DELETE and an invitation's revoke
// take the member's ids off the org's team and territory lists, and answer the lists as written): their row off the
// roster, and those lists as the server wrote them — without them the same tab's next teams save would send the
// removed id again and be refused (§0.221). Since §0.222 the revoke's screens write no list of their own. The caller
// applies it only while the org that asked is still the one on screen (requestOrg / stillOrg): another org's lists
// never reach this one's copy. removedId: the row removed, or null when none was. Since §0.225 each list it applies
// brings the token the server answered for it (`revs`), merged key by key into the copy's: with the list and not its
// token, the same tab's next save of that list would be refused as stale against its own removal. A token for a list
// it does not apply is never taken, and with none answered the copy's tokens are left as they are.
export function settingsAfterRemoval(prev, removedId, answer) {
    const lists = answer && answer.lists && typeof answer.lists === 'object' ? answer.lists : {};
    const written = {};
    for (const key of ['teams', 'territories']) if (Array.isArray(lists[key])) written[key] = lists[key];
    const tokens = Object.fromEntries(Object.keys(written).filter((k) => typeof answer?.revs?.[k] === 'string').map((k) => [k, answer.revs[k]]));
    return { ...prev, users: (prev?.users || []).filter((u) => !removedId || u?.id !== removedId), ...written, ...(Object.keys(tokens).length ? { revs: { ...(prev?.revs || {}), ...tokens } } : {}) };
}
// What a removal says when a settings save landed at the same moment every time it tried to write the lists.
export const REMOVAL_LISTS_LEFT = 'Removed, but the team and territory lists still name them — another settings save landed at the same moment. Reload to see the lists.';
export const removalNote = (answer) => (answer && answer.listsLeft ? REMOVAL_LISTS_LEFT : null);
