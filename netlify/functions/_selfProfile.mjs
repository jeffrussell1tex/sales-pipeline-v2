// What a signed-in member may change about THEMSELVES through
// `PUT /users?me=true` — and nothing else (state §0.109, guide §18b34).
//
// The self-profile save is the one write in users.mjs open to every role, and
// it took the whole body. The profile panel sent the entire roster row it
// held (`{ ...myDbUser, ...updates }` — since §0.196 it sends `{ id, ...updates }`,
// AppHeader.jsx saveProfile), so a preference toggle rewrote quota,
// team, territory, the quarterly quotas and `active` from the caller's own
// copy — and a body written by hand could set any of them. The role column
// was already pinned to the stored value; the rest was not.
//
// This is an ALLOWLIST, not a denylist of the fields we have thought of:
// a column added to sanitize() later is administrative until someone puts it
// here on purpose — as a member's manager (state §0.212, `managerId`) is not: who
// a member reports to is an Admin's or a Manager's to set. Pure — no imports —
// so the unit suite loads it directly.
export const SELF_EDITABLE_KEYS = Object.freeze([
    // Who I am
    'prefix', 'firstName', 'middleName', 'lastName', 'suffix', 'nickName', 'title',
    // Where I work and how to reach me
    'company', 'department', 'workLocation', 'personalEmail', 'email', 'phone', 'mobile',
    'address', 'city', 'state', 'zip', 'country', 'notes',
    // What I send
    'emailSignature',
    // What I want to hear about, and when
    'notificationPrefs', 'digestTime', 'smsNotifications', 'timezone',
    // Which saved reports sit on my Home (state §0.135) — ids, mine to choose
    'pinnedReports',
]);

// Field-present semantics, the same contract mergeForUpdate keeps: a key sent
// is applied — an explicit '' or null included — and a key omitted is left to
// the stored row. Keys outside the list are dropped, not refused: the panel
// sent them along until §0.196; a 400 would break a save from an older tab.
export const pickSelfEditable = (data) => {
    const out = {};
    for (const k of SELF_EDITABLE_KEYS) if (k in data) out[k] = data[k];
    return out;
};
