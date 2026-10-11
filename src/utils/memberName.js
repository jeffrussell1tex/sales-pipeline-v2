// memberName.js — one name per member of an org (state §0.196; Jeff, 9 Oct: "Number it",
// "Yes, Full name wins"). Deals, tasks and leads are still assigned by NAME through
// resolveOwnerId (netlify/functions/_lib.mjs), which refuses a name two members share
// (§0.193), so two members of one org may never share one. Every writer of users.name
// decides through this module — users.mjs (the self PUT, the Admin PUT, the create, the
// invite), ensureRosterRow, users-sync, the backup restore — and the team import's check
// on screen uses its key. The restore's words are here too, so a test runs them. Pure, no
// imports: the function files and the screens share it.

// users.name is varchar(255) (db/schema.ts).
export const NAME_MAX = 255;

// Two names are the SAME name when this is equal: whitespace collapsed, trimmed, any
// case. JS \s is the set trim() removes.
export const nameKey = (name) => String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

// The resolver's own comparison (trimmed, any case, NOT collapsed — _lib.mjs
// resolveOwnerId). nameKey is this key collapsed, so a roster with no two of one nameKey
// never gives the resolver two matches.
export const resolverKey = (name) => String(name ?? '').trim().toLowerCase();

// The refusal's words. No member's email: a rep reads it.
export const nameTakenMessage = (name) =>
    `Another member of this organization is already named "${String(name ?? '').trim()}". Choose a different name — deals, tasks and leads are assigned by name, so two members cannot share one.`;

// null when `name` may be stored on row `selfId` (null: a new row), else the refusal.
// `roster` is every member of the org, invited and deactivated too. A write that keeps
// its row's RESOLVER key is let through, so a pair made before this rule stays editable
// and can be renamed apart — but never respaced onto the other (exempting by nameKey
// would let 'Pat  Smith' become 'pat smith', a new collision for the resolver).
export function nameRefusal(roster, name, selfId = null) {
    const key = nameKey(name);
    if (!key) return null;
    const self = selfId ? (roster || []).find((u) => u?.id === selfId) : null;
    if (self && resolverKey(self.name) === resolverKey(name)) return null;
    const holder = (roster || []).find((u) => u && u.id !== selfId && nameKey(u.name) === key);
    return holder ? nameTakenMessage(name) : null;
}

// Where nobody can be asked (a first sign-in, the sync, an invitation with no name, a
// restore) a taken name is numbered: base, "base (2)" … "base (upTo)", each cut so it
// fits the column.
export function numbered(base, upTo = 20) {
    const b = String(base ?? '').trim().slice(0, NAME_MAX).trim();
    if (!b) return [];
    const out = [b];
    for (let n = 2; n <= upTo; n++) {
        const tail = ` (${n})`;
        out.push(b.slice(0, NAME_MAX - tail.length).trimEnd() + tail);
    }
    return out;
}

// The first candidate no member holds, trimmed; null when every one is held.
export function firstFreeName(roster, candidates) {
    for (const c of candidates || []) {
        const n = String(c ?? '').trim();
        if (n && !nameRefusal(roster, n)) return n;
    }
    return null;
}

// A backup's member rows, each under a name no member of this org has (state §0.196).
// The restore inserts them with onConflictDoNothing against the users table's own keys
// (db/schema.ts): the id, global; this org's email; this org's Clerk id; id, name and
// email NOT NULL. A file can be edited by hand, so only what the insert is SURE to skip
// keeps the file's name:
// - A row whose id, email or Clerk id is a member's of THIS org goes as it is (the insert
//   skips it), and so does a row with no id or no email at all (NOT NULL refuses it). An
//   earlier row of the file never excuses a later one: the insert may skip the earlier
//   row itself (its id can be another org's), and the later one would land.
// - A row whose id or email is anything but a non-empty string is dropped ('' and 0
//   insert), as is a row every name of which is taken: `dropped` lists { id, name, why }
//   for the restore to report as errors (droppedErrors).
// - A taken name is numbered: the name first, then the email, then the id — each checked
//   against this org's members and the file's rows named before it.
// - First and last name are kept only when they spell the stored name. sanitize()
//   rebuilds the name from them on every later write (users.mjs), so a pair that spells
//   another name would turn the member's next quota or team save into a refusal.
// - `renamed` lists { id, from, to } for the restore to report once the row has landed
//   (restoreNotes).
export function restorableMembers(roster, rows) {
    const members = (roster || []).filter((u) => u && typeof u === 'object');
    const fromFile = [];   // the file's rows as named here: to choose a free name, never to excuse a row
    const renamed = [];
    const dropped = [];
    const isText = (v) => typeof v === 'string' && v !== '';
    const isMember = (r) => members.some((u) => u.id === r.id || (!!u.email && u.email === r.email) || (!!u.clerkUserId && u.clerkUserId === r.clerkUserId));
    const out = [];
    for (const r of rows || []) {
        if (r?.id == null || r?.email == null || isMember(r)) { out.push(r); continue; }
        const filed = String(r.name ?? '').trim();
        if (!isText(r.id) || !isText(r.email)) { dropped.push({ id: r.id, name: filed, why: 'blank' }); continue; }
        const name = firstFreeName([...members, ...fromFile], [...numbered(filed), ...numbered(r.email), ...numbered(r.id, 1)]);
        if (!name) { dropped.push({ id: r.id, name: filed, why: 'taken' }); continue; }
        fromFile.push({ id: r.id, name, email: r.email, clerkUserId: r.clerkUserId || null });
        if (name !== filed) renamed.push({ id: r.id, from: filed, to: name });
        const p = r.profile && typeof r.profile === 'object' && !Array.isArray(r.profile) ? r.profile : null;
        const rebuilt = p ? ((p.firstName || '') + ' ' + (p.lastName || '')).trim() : '';
        if (rebuilt && resolverKey(rebuilt) !== resolverKey(name)) out.push({ ...r, name, profile: { ...p, firstName: null, lastName: null } });
        else out.push({ ...r, name });
    }
    return { rows: out, renamed, dropped };
}

const membersWere = (n) => (n === 1 ? '1 member was' : `${n} members were`);

// The restore's notes (state §0.196), for the members renamed whose rows landed. A member
// the file gave no name is said on its own line: nobody here had their name.
export function restoreNotes(renamed) {
    const taken = (renamed || []).filter((m) => m.from);
    const unnamed = (renamed || []).filter((m) => !m.from);
    const notes = [];
    if (taken.length) notes.push(`${membersWere(taken.length)} restored under another name — a member of this workspace already has theirs: ${taken.map((m) => `"${m.from}" as "${m.to}"`).join(', ')}.`);
    if (unnamed.length) notes.push(`${membersWere(unnamed.length)} restored with no name in the file — named by their address: ${unnamed.map((m) => `"${m.to}"`).join(', ')}.`);
    return notes;
}

// The rows restorableMembers dropped, as the restore's errors: each one is a row of the
// file that was not restored.
export function droppedErrors(dropped) {
    const rowsWere = (n) => (n === 1 ? '1 member row was' : `${n} member rows were`);
    const label = (d) => (d.name ? `"${d.name}"` : 'one with no name');
    const blank = (dropped || []).filter((d) => d.why === 'blank');
    const taken = (dropped || []).filter((d) => d.why === 'taken');
    const errs = [];
    if (blank.length) errs.push(`users: ${rowsWere(blank.length)} not restored — the file gives no usable id or email address: ${blank.map(label).join(', ')}`);
    if (taken.length) errs.push(`users: ${rowsWere(taken.length)} not restored — every name the restore could give is held by a member here: ${taken.map(label).join(', ')}`);
    return errs;
}
