// Quotes, the quote email and PDF, and the public API — the requests tests/gate-matrix.test.mjs asks beside the plain ones (state §0.288): the refusals
// the plain requests do not reach, each with the caller it lets through where there is one. rows: what each table answers (by its SQL name), or a function
// of the operation; env: process.env for that request alone.
const REP = { userId: 'user_qrep' };
const me = { id: 'usr_qrep', clerkUserId: 'user_qrep', orgId: 'org_a', name: 'Quinn Rep', email: 'quinn@example.com', role: 'User', active: true, profile: {} };
const other = { id: 'usr_qother', clerkUserId: 'user_qother', orgId: 'org_a', name: 'Olive Other', email: 'olive@example.com', role: 'Manager', active: true, profile: {} };
const users = [me, other];
const OLD = { userId: 'user_old' }, old = { ...me, id: 'old_1', clerkUserId: 'user_old' };   // a roster id from before the app's own
const deal = (ownerId, salesRep) => ({ id: 'opp_1', orgId: 'org_a', ownerId, salesRep, opportunityName: 'Boiler refit', account: 'Acme Co' });
const own = [deal('usr_qrep', 'Quinn Rep')], anothers = [deal('usr_qother', 'Olive Other')];
const quote = (over = {}) => ({ id: 'q1', orgId: 'org_a', opportunityId: 'opp_1', quoteNumber: 'Q-2026-001', version: 1, name: 'Boiler quote', status: 'Draft',
    lineItems: [{ id: 'l1', name: 'Boiler', quantity: 1, listPrice: 1000, discountPct: 15 }], dealDiscount: '0.00', taxRate: null, taxExempt: false,
    approvalTier: null, approvalReason: null, approvalNote: null, createdBy: 'Quinn Rep', stamp: '2026-11-20 10:00:00', ...over });
const waiting = [quote({ status: 'Pending Approval', approvalTier: 'Mgr approval' })];
// An org whose Admin chose, by person, the approver of every quote past the rep's own 10%.
const routed = (approverUserId) => [{ id: 's1', orgId: 'org_a', extra: { approvalRouting: 'person', approvalTiers: [
    { id: 'tier_1', label: 'Rep', maxDiscount: 0.1, approverUserId: null, backupUserId: null },
    { id: 'tier_2', label: 'Mgr approval', maxDiscount: 1, approverUserId, backupUserId: null }] } }];
const create = { id: 'q1', opportunityId: 'opp_1', lineItems: [] };
const sendBack = { id: 'q1', sendBack: true, sendBackNote: 'Lower the discount.' };

const apiHeaders = { authorization: 'Bearer spt_live_' + 'a1'.repeat(32) };
const apiKey = { id: 'key_1', orgId: 'org_a', name: 'ERP', revokedAt: null };
const apiDeals = { resource: 'opportunities' };
export const REQUESTS = {
    quotes: [
        { what: 'approval statistics are for an Admin or a Manager', method: 'GET', qs: { approvalStats: 'true' } },
        { what: 'a quote on your own deal is made', method: 'POST', ...REP, body: create, rows: { users, opportunities: own, quotes: [quote()] } },
        { what: "a rep makes no quote on another rep's deal", method: 'POST', ...REP, body: create, rows: { users, opportunities: anothers, quotes: [quote()] } },
        { what: "a create whose deal claim aborts (the deal handed away since the check, back by the answer) is refused; an Admin's carries no claim", method: 'POST', ...REP, body: create,
            rows: (op) => {
                if (op.kind === 'insert' && op.table === 'quotes' && globalThis.__gates.ops.some((o) => o.kind === 'execute')) throw Object.assign(new Error('division by zero'), { code: '22012' });
                return { users, opportunities: own, quotes: [quote()] }[op.table] || [];
            }, afterWrite: 'its batch opens with a claim on the deal, which aborts it: nothing of it lands' },
        { what: "a member whose roster id is not one of the app's reads their deal and makes no quote on it", method: 'POST', ...OLD, body: create, rows: { users: [old], opportunities: [deal('old_1', 'Quinn Rep')], quotes: [quote()] } },
        { what: "a member whose roster id is not one of the app's changes no quote", method: 'PUT', ...OLD, body: { id: 'q1', name: 'Boiler quote B' }, rows: { users: [old], opportunities: [deal('old_1', 'Quinn Rep')], quotes: [quote()] } },
        { what: "your own deal's quote is changed", method: 'PUT', ...REP, body: { id: 'q1', name: 'Boiler quote B' }, rows: { users, opportunities: own, quotes: [quote()] } },
        { what: "a rep changes no quote of another rep's deal", method: 'PUT', ...REP, body: { id: 'q1', name: 'Boiler quote B' }, rows: { users, opportunities: anothers, quotes: [quote()] } },
        { what: 'only an Admin or a Manager approves', method: 'PUT', ...REP, body: { id: 'q1', status: 'Approved' }, rows: { users, opportunities: own, quotes: waiting } },
        { what: 'only an Admin or a Manager sends back', method: 'PUT', ...REP, body: sendBack, rows: { users, opportunities: own, quotes: waiting } },
        { what: "the tier's approver is another Manager: only they or an Admin approves", method: 'PUT', ...REP, body: { id: 'q1', status: 'Approved' }, rows: { users, opportunities: own, quotes: waiting, settings: routed('usr_qother') } },
        { what: "the tier's approver is another Manager: only they or an Admin sends back", method: 'PUT', ...REP, body: sendBack, rows: { users, opportunities: own, quotes: waiting, settings: routed('usr_qother') } },
        { what: "the tier's approver is the caller: a Manager approves; a rep named as approver is still refused", method: 'PUT', ...REP, body: { id: 'q1', status: 'Approved' }, rows: { users, opportunities: own, quotes: waiting, settings: routed('usr_qrep') } },
    ],
    'quote-pdf': [
        { what: 'the PDF of a quote on your own deal', method: 'POST', ...REP, body: { quoteId: 'q1' }, rows: { users, opportunities: own, quotes: [quote()] } },
        { what: "the PDF of a quote on another rep's deal: not found", method: 'POST', ...REP, body: { quoteId: 'q1' }, rows: { users, opportunities: anothers, quotes: [quote()] } },
    ],
    'quote-email': [
        { what: "your own deal's quote passes to the send (here: no customer email, a 422)", method: 'POST', ...REP, body: { quoteId: 'q1' }, rows: { users, opportunities: own, quotes: [quote({ lineItems: [] })] } },
        { what: "a member whose roster id is not one of the app's sends no quote", method: 'POST', ...OLD, body: { quoteId: 'q1' }, rows: { users: [old], opportunities: [deal('old_1', 'Quinn Rep')], quotes: [quote({ lineItems: [] })] } },
        { what: "a rep finds no quote of another rep's deal", method: 'POST', ...REP, body: { quoteId: 'q1' }, rows: { users, opportunities: anothers, quotes: [quote({ lineItems: [] })] } },
    ],
    'public-api': [
        { what: 'a key no row holds', method: 'GET', headers: apiHeaders, qs: apiDeals },
        { what: 'a revoked key', method: 'GET', headers: apiHeaders, qs: apiDeals, rows: { api_keys: [{ ...apiKey, revokedAt: '2026-11-01T00:00:00.000Z' }] } },
        { what: 'a live key reads', method: 'GET', headers: apiHeaders, qs: apiDeals, rows: { api_keys: [apiKey], opportunities: [{ total: 1, ...own[0] }] } },
    ],
};
