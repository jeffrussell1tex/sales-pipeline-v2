// Members, roles, SPIFF claims and coaching notes — the requests tests/gate-matrix.test.mjs asks beside the plain ones (state §0.288): the refusals
// the plain requests do not reach, each with the caller it lets through where there is one. rows: what each table answers (by its SQL name), or a function
// of the operation; env: process.env for that request alone.
const me = (clerkUserId, more = {}) => ({ id: 'usr_me', clerkUserId, orgId: 'org_a', name: 'Me Rep', email: 'me@example.com', role: 'User', active: true, profile: { status: 'Active' }, ...more });
const other = (more = {}) => ({ id: 'usr_other', clerkUserId: 'user_other', orgId: 'org_a', name: 'Other Member', email: 'other@example.com', role: 'User', active: true, profile: { status: 'Active' }, ...more });
const invited = other({ id: 'usr_inv', clerkUserId: null, name: 'Invited Person', email: 'inv@example.com', active: false, profile: { status: 'Invited' } });
const claim = (more = {}) => ({ id: 'clm_1', orgId: 'org_a', spiffId: 'spf_1', spiffName: 'Q4 push', repName: 'Me Rep', amount: 500, status: 'pending', claimedAt: new Date('2026-11-01T12:00:00Z'), ...more });
const spiffs = [{ orgId: 'org_a', extra: { spiffs: [{ id: 'spf_1', name: 'Q4 push', active: true }] } }];
const note = (authorId) => ({ id: 'cn_1', orgId: 'org_a', authorId, authorName: 'Someone', text: 'Good call.', date: '2026-11-02', recipientIds: ['usr_me'], teamId: null, readBy: {} });
// One table read twice in a request: what the first select finds, then what the next does. Its writes touch no row.
const then = (table, first, next) => (op) => {
    if (op.table !== table || op.kind !== 'select') return [];
    return globalThis.__gates.ops.filter((o) => o.kind === 'select' && o.table === table).length === 1 ? first : next;
};
const withCaller = (clerkUserId, f) => (op) => (op.table === 'users' ? [me(clerkUserId)] : f(op));
const inserts = (row) => (op) => (op.table === 'users' && op.kind === 'insert' ? [row] : []);
const edit = { id: 'clm_1', note: 'Signed on the 3rd.' };

export const REQUESTS = {
    'users': [
        { what: 'a first sign-in whose row an Admin turned off (linked since the first read) is refused', method: 'GET', qs: { me: 'true' }, userId: 'user_first_sign_in',
            rows: then('users', [], [me('user_first_sign_in', { active: false, profile: { status: 'Deactivated' } })]) },
        { what: 'a first sign-in whose row is on gets its own profile', method: 'GET', qs: { me: 'true' }, userId: 'user_first_sign_in',
            rows: then('users', [], [me('user_first_sign_in')]) },
        { what: 'a member saves no other member through ?me', method: 'PUT', qs: { me: 'true' }, userId: 'user_profile_self', body: { id: 'usr_other', phone: '1' }, rows: { users: [me('user_profile_self')] } },
        { what: 'a member saves their own row through ?me', method: 'PUT', qs: { me: 'true' }, userId: 'user_profile_self', body: { id: 'usr_me', phone: '1' }, rows: { users: [me('user_profile_self')] } },
        { what: 'the pending invitations are an Admin’s: a Manager refused, the rest answered the name directory (filed, OPEN_ITEMS §4.6)', method: 'GET', qs: { invitations: 'pending' } },
        { what: 'the membership limit is an Admin’s: a Manager refused, the rest answered the name directory (filed, OPEN_ITEMS §4.6)', method: 'GET', qs: { seats: 'true' } },
        { what: 'revoking an invitation is an Admin’s', method: 'POST', qs: {}, body: { action: 'revoke-invite', email: 'inv@example.com' }, rows: { users: [invited] } },
        { what: 'inviting above a Sales Rep is an Admin’s', method: 'POST', qs: {}, body: { action: 'invite', invites: [{ email: 'new@example.com', name: 'New Person', role: 'Manager' }] },
            rows: inserts(other({ role: 'Manager' })) },
        { what: 'a Manager invites a Sales Rep', method: 'POST', qs: {}, body: { action: 'invite', invites: [{ email: 'new@example.com', name: 'New Person', role: 'User' }] },
            rows: inserts(other()) },
        { what: 'adding a member above a Sales Rep is an Admin’s', method: 'POST', qs: {}, body: { firstName: 'New', lastName: 'Person', email: 'new@example.com', userType: 'Manager' },
            rows: inserts(other({ role: 'Manager' })) },
        { what: 'a Manager adds a Sales Rep', method: 'POST', qs: {}, body: { firstName: 'New', lastName: 'Person', email: 'new@example.com', userType: 'User' },
            rows: inserts(other()) },
        { what: 'a Manager’s save reaches only a Sales Rep', method: 'PUT', qs: {}, body: { id: 'usr_other', title: 'Lead' }, rows: { users: [other({ role: 'Manager' })] } },
        ...['Admin', 'Dispatcher', 'Technician', 'ReadOnly'].map((role) => ({ what: `a Manager’s save reaches no ${role}`, method: 'PUT', qs: {}, body: { id: 'usr_other', title: 'Lead' }, rows: { users: [other({ role })] } })),
        { what: 'a Manager’s save reaches a Sales Rep', method: 'PUT', qs: {}, body: { id: 'usr_other', title: 'Lead' }, rows: { users: [other()] } },
        { what: 'deactivating a member is an Admin’s', method: 'PUT', qs: {}, body: { id: 'usr_other', active: false }, rows: { users: [other()] } },
        { what: 'clearing the roster is an Admin’s', method: 'DELETE', qs: { clear: 'true' }, rows: { users: [other()] } },
    ],
    'user-role': [
        { what: 'a linked row’s person who is no member of this organization in Clerk keeps their role', method: 'PUT', qs: {}, body: { targetUserId: 'usr_other', role: 'Manager' }, rows: { users: [other()] } },
        { what: 'an Admin sets the role of a linked member of this organization', method: 'PUT', qs: {}, body: { targetUserId: 'usr_other', role: 'Manager' }, rows: { users: [other()] }, clerk: { user_other: ['org_a'] } },
        { what: 'a linked person who is a member of another organization alone keeps their role', method: 'PUT', qs: {}, body: { targetUserId: 'usr_other', role: 'Manager' }, rows: { users: [other()] }, clerk: { user_other: ['org_b'], user_me: ['org_a'] } },
        { what: 'an Admin sets an invited row’s role', method: 'PUT', qs: {}, body: { targetUserId: 'usr_inv', role: 'Manager' }, rows: { users: [invited] } },
    ],
    'spiff-claims': [
        { what: 'a rep with no roster row files no claim', method: 'POST', qs: {}, userId: 'user_spiff_norow', body: { id: 'clm_1', spiffId: 'spf_1', repName: 'Me Rep' }, rows: { settings: spiffs, spiff_claims: [claim()] } },
        { what: 'a rep files their own claim', method: 'POST', qs: {}, userId: 'user_spiff_rep', body: { id: 'clm_1', spiffId: 'spf_1', repName: 'Me Rep' }, rows: { users: [me('user_spiff_rep')], settings: spiffs, spiff_claims: [claim()] } },
        { what: 'approving a claim is a manager’s', method: 'PUT', qs: {}, userId: 'user_spiff_rep', body: { id: 'clm_1', status: 'approved', fromStatus: 'pending' }, rows: { users: [me('user_spiff_rep')], spiff_claims: [claim()] } },
        { what: 'a rep edits no other rep’s claim', method: 'PUT', qs: {}, userId: 'user_spiff_rep', body: edit, rows: { users: [me('user_spiff_rep')], spiff_claims: [claim({ repName: 'Other Member' })] } },
        { what: 'a rep edits their own claim only while it is pending', method: 'PUT', qs: {}, userId: 'user_spiff_rep', body: edit, rows: { users: [me('user_spiff_rep')], spiff_claims: [claim({ status: 'approved' })] } },
        { what: 'a rep edits their own pending claim', method: 'PUT', qs: {}, userId: 'user_spiff_rep', body: edit, rows: { users: [me('user_spiff_rep')], spiff_claims: [claim()] } },
        { what: 'a claim approved since the check read it is not the rep’s to edit', method: 'PUT', qs: {}, userId: 'user_spiff_rep', body: edit,
            rows: withCaller('user_spiff_rep', then('spiff_claims', [claim()], [claim({ status: 'approved' })])), afterWrite: 'its write names the rep and the status it read, so it touches no row; the claim is read again and refused' },
        { what: 'a claim moved to another rep since the check read it is not the rep’s to edit', method: 'PUT', qs: {}, userId: 'user_spiff_rep', body: edit,
            rows: withCaller('user_spiff_rep', then('spiff_claims', [claim()], [claim({ repName: 'Other Member' })])), afterWrite: 'its write names the rep and the status it read, so it touches no row; the claim is read again and refused' },
    ],
    'coaching-notes': [
        { what: 'a team’s coaching note is a manager’s to write', method: 'POST', qs: {}, body: { id: 'cn_2', teamId: 'team_1', text: 'Good call.', date: '2026-11-20' }, rows: { users: [me('user_me'), other()], settings: [{ orgId: 'org_a', extra: { teams: [{ id: 'team_1', name: 'North', repIds: ['usr_other'] }] } }], coaching_notes: [note('usr_me')] } },
        { what: 'a member who is neither its author nor its recipient marks no note read (an Admin may)', method: 'PUT', qs: {}, body: { id: 'cn_1', action: 'read' }, rows: { users: [me('user_me')], coaching_notes: [{ ...note('usr_other'), recipientIds: ['usr_third'] }] } },
        { what: 'a caller with no roster row marks no note read', method: 'PUT', qs: {}, body: { id: 'cn_1', action: 'read' }, rows: { coaching_notes: [note('usr_other')] } },
        { what: 'a recipient marks their note read', method: 'PUT', qs: {}, body: { id: 'cn_1', action: 'read' }, rows: { users: [me('user_me')], coaching_notes: [note('usr_other')] } },
        { what: 'a note is deleted by its author or an Admin', method: 'DELETE', qs: { id: 'cn_1' }, rows: { users: [me('user_me')], coaching_notes: [note('usr_other')] } },
        { what: 'a note’s author deletes it', method: 'DELETE', qs: { id: 'cn_1' }, rows: { users: [me('user_me')], coaching_notes: [note('usr_me')] } },
    ],
};
