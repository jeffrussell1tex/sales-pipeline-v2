// userImport.js — a CSV of team members becomes invitations (state §0.167 —
// Jeff: "go with your recommendation"). The Import CSV page on Settings → Users
// was a mockup that read no file and imported nothing. The shared CSV importer
// (CsvImportModal) now reads, maps and previews the file; this module decides
// what a row means for a PERSON: the role it names, whether that person is
// already on the team, and the invitation it becomes. Pure, so the rules run
// under node --test (csvMapping.js and importReceipt.js, the same reasoning).
import { ROLE_OPTIONS } from './roles.js';
import { memberStatus } from '../Tabs/settings/people/memberStatus.js';

const norm = (s) => String(s ?? '').trim().toLowerCase();
const text = (v) => String(v ?? '').trim() || null;

// The columns a team member's file maps to. `memberName`, not `name`: the
// accounts importer's `name` aliases ("Company Name", "Organization") would map a
// company column onto a person's name.
export const USER_IMPORT_FIELDS = Object.freeze([
    Object.freeze({ key: 'email',      label: 'Email', required: true }),
    Object.freeze({ key: 'memberName', label: 'Name' }),
    Object.freeze({ key: 'role',       label: 'Role' }),
    Object.freeze({ key: 'team',       label: 'Team' }),
    Object.freeze({ key: 'territory',  label: 'Territory' }),
]);

// The Invite page's check (UsersDetail.jsx, validateRows).
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// A role cell may hold the label a person reads ("Sales Rep") or the value the
// server stores ("User"), in any case. Blank is the server's default, a rep.
// Anything else stays as written, and userConflicts() refuses the row — never
// guessed into a role (an untouched 'Sales Rep' once became a role no gate knew).
export function roleValueOf(cell) {
    const c = norm(cell);
    if (!c) return undefined;
    const hit = ROLE_OPTIONS.find((o) => norm(o.value) === c || norm(o.label) === c);
    return hit ? hit.value : String(cell).trim();
}

// What a stored role reads as — blank is a rep, the server's default.
export function roleLabelOf(value) {
    const v = value || 'User';
    return ROLE_OPTIONS.find((o) => o.value === v)?.label || v;
}

// Teams and territories are objects with a name, or (older rows) plain strings —
// the Invite page reads them the same way.
const namesOf = (list) => (list || []).map((t) => (typeof t === 'string' ? t : t?.name)).filter(Boolean);
// The workspace's own spelling of a name the file wrote in any case; null when
// the workspace has none by that name.
const canonical = (cell, names) => names.find((n) => norm(n) === norm(cell)) || null;

// The invitation a mapped row becomes — what the invite path takes. The name is
// decided HERE and always sent: the first sign-in links the row and never
// renames it (users.mjs, GET ?me — ownership stores names), so the name an
// invitation carries is the one the member keeps. None in the file, the part of
// the address before the @ — the server's own default, made visible at Review
// so the name check below sees the name that will be stored.
export function inviteFrom(record, { teams, territories } = {}) {
    const email = norm(record.email);
    const team = text(record.team), territory = text(record.territory);
    return {
        email,
        name: text(record.memberName) || email.split('@')[0],
        role: roleValueOf(record.role),
        team: team && (canonical(team, namesOf(teams)) || team),
        territory: territory && (canonical(territory, namesOf(territories)) || territory),
    };
}

// Why a row is not invited, or null when it is. In order: the address, the
// person already on the team (a member, an invitation not yet accepted, a
// deactivated member — inviting again is Resend on Pending invites), an address
// already invited earlier in the file (twice would revoke the first invitation
// and send a second email), a role, team or territory this workspace does not
// have, and a name already on the team or earlier in the file — owners are
// resolved by name, trimmed and in any case, and two members of one name make
// every assignment by that name a 409 (_lib.mjs, resolveOwnerId).
const reasonNotInvited = (rec, invite, { byEmail, rosterNames, teamNames, terrNames, seenEmails, seenNames }) => {
    if (!EMAIL_SHAPE.test(invite.email)) return 'not an email address';
    const existing = byEmail.get(invite.email);
    if (existing) {
        const s = memberStatus(existing);
        return s === 'Invited' ? 'already invited' : s === 'Deactivated' ? 'a deactivated member' : 'already a member';
    }
    if (seenEmails.has(invite.email)) return 'repeated in this file';
    if (text(rec.role) && !ROLE_OPTIONS.some((o) => o.value === invite.role)) return `"${text(rec.role)}" is not a role`;
    if (text(rec.team) && !canonical(rec.team, teamNames)) return `no team named "${text(rec.team)}"`;
    if (text(rec.territory) && !canonical(rec.territory, terrNames)) return `no territory named "${text(rec.territory)}"`;
    if (rosterNames.has(norm(invite.name))) return `a member is already named "${invite.name}"`;
    if (seenNames.has(norm(invite.name))) return `an earlier row is also named "${invite.name}"`;
    return null;
};

// Rows that are not invited, in the importer's conflict shape — { incomingIndex,
// incoming, existing, matchReason, action } — each SKIPPED: an invitation is an
// email to a person, so nothing here is overwritten.
export function userConflicts(records, { roster, teams, territories } = {}) {
    const byEmail = new Map();
    const rosterNames = new Set();
    for (const u of roster || []) {
        const e = norm(u.email);
        if (e) byEmail.set(e, u);
        if (norm(u.name)) rosterNames.add(norm(u.name));
    }
    const ctx = {
        byEmail, rosterNames,
        teamNames: namesOf(teams), terrNames: namesOf(territories),
        seenEmails: new Set(), seenNames: new Set(),
    };
    const conflicts = [];
    (records || []).forEach((rec, idx) => {
        const invite = inviteFrom(rec, { teams, territories });
        const matchReason = reasonNotInvited(rec, invite, ctx);
        if (matchReason) {
            conflicts.push({ incomingIndex: idx, incoming: rec, existing: byEmail.get(invite.email) || null, matchReason, action: 'skip' });
            return;
        }
        // Only a row that WILL be invited claims its address and its name: a later
        // row repeating a refused one is judged on its own.
        ctx.seenEmails.add(invite.email);
        ctx.seenNames.add(norm(invite.name));
    });
    return conflicts;
}
