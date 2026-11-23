// Accounts, activities, contacts and tasks — the requests tests/gate-matrix.test.mjs asks beside the plain ones (state §0.288): the refusals
// the plain requests do not reach, each with the caller it lets through where there is one. rows: what each table answers (by its SQL name), or a function
// of the operation; env: process.env for that request alone.
const userId = 'user_crm1';
const users = [
    { id: 'usr_crm1', clerkUserId: userId, orgId: 'org_a', name: 'Me Rep', email: 'me@example.com', role: 'User', active: true },
];
const other = (row) => ({ ...row, ownerId: 'usr_other' });
const own = (row) => ({ ...row, ownerId: 'usr_crm1' });

const account = { id: 'x1', orgId: 'org_a', name: 'Acme', accountTier: 'account', parentAccountId: null, accountOwner: null, mergeArchived: false };
const activity = { id: 'x1', orgId: 'org_a', type: 'Call', date: '2026-11-20', subject: 'Intro call', contactIds: [], contactId: null, author: null };
const contact = { id: 'x1', orgId: 'org_a', firstName: 'Ann', lastName: 'Lee', company: null, accountId: null, assignedRep: null, managers: [], directReports: [], mergeArchived: false };
const task = { id: 'x1', orgId: 'org_a', title: 'Call Ann', dueDate: '2026-11-25', completed: false, assignedTo: null, contacts: [], contactId: null };

const requests = (table, row, change) => {
    const on = (r) => ({ users, [table]: [r] });
    return [
        { what: 'a rep saves only their own or an unassigned record: another rep\'s', method: 'PUT', body: { id: 'x1', ...change }, rows: on(other(row)), userId },
        { what: 'a rep saves only their own or an unassigned record: their own', method: 'PUT', body: { id: 'x1', ...change }, rows: on(own(row)), userId },
        { what: 'a rep deletes only their own or an unassigned record: another rep\'s', method: 'DELETE', qs: { id: 'x1' }, rows: on(other(row)), userId },
        { what: 'a rep deletes only their own or an unassigned record: their own (an account: an Admin alone)', method: 'DELETE', qs: { id: 'x1' }, rows: on(own(row)), userId },
        { what: 'the org-wide wipe is an Admin\'s alone', method: 'DELETE', qs: { clear: 'true' }, rows: on(own(row)), userId },
    ];
};

export const REQUESTS = {
    accounts: requests('accounts', account, { city: 'Dallas' }),
    activities: requests('activities', activity, { notes: 'Left a message' }),
    contacts: requests('contacts', contact, { city: 'Dallas' }),
    tasks: requests('tasks', task, { priority: 'High' }),
};
