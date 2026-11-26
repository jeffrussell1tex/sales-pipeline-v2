// Leads, lead requests, deals, saved reports, the recommendation log, mention texts and the duplicate look — the requests tests/gate-matrix.test.mjs asks beside the plain ones (state §0.288): the refusals
// the plain requests do not reach, each with the caller it lets through where there is one. rows: what each table answers (by its SQL name), or a function
// of the operation; env: process.env for that request alone.
const REP = 'user_crm2';                  // the caller's Clerk id; usr_crm2 on the roster
const GONE = 'user_crm2_gone';            // signed in, no row on the org's roster
const member = (id, clerkUserId, name) => ({ id, clerkUserId, orgId: 'org_a', name, email: `${id}@example.test`, role: 'User', active: true, profile: {} });
const users = [member('usr_crm2', REP, 'Rae Crm2'), member('usr_crm2_other', 'user_crm2_other', 'Olive Crm2')];
const MINE = 'usr_crm2', OTHERS = 'usr_crm2_other';
const named = (ownerId) => ({ [MINE]: 'Rae Crm2', [OTHERS]: 'Olive Crm2' }[ownerId] || null);

const lead = (ownerId) => ({ users, leads: [{ id: 'x1', orgId: 'org_a', firstName: 'Pat', lastName: 'Lee', company: 'Acme', status: 'New', score: 50, ownerId, assignedTo: named(ownerId) }] });
const deal = (ownerId) => ({ users, opportunities: [{ id: 'x1', orgId: 'org_a', opportunityName: 'Acme renewal', account: 'Acme', accountId: null, stage: 'Discovery', pipelineId: 'default', contactIds: [], stageHistory: [], comments: [], closeDateHistory: [], ownerId, salesRep: named(ownerId) }] });
// An org whose stages are its own (state §0.299): a deal is made and moved in those alone.
const ownStages = [{ id: 'org_a', orgId: 'org_a', extra: { funnelStages: [{ name: 'Site visit', weight: 20 }, { name: 'Bid sent', weight: 50 }] }, funnelStages: [{ name: 'Site visit', weight: 20 }, { name: 'Bid sent', weight: 50 }], stages: [] }];
const staged = (op) => ({ users, settings: ownStages, opportunities: op.kind === 'insert' ? [{ ...deal(MINE).opportunities[0], id: 'x2' }] : [] }[op.table] || []);
const task = (ownerId) => ({ users, tasks: [{ id: 'x1', orgId: 'org_a', title: 'Call back', ownerId, assignedTo: named(ownerId) }] });
const report = (ownerId) => ({ users, saved_reports: [{ id: 'x1', orgId: 'org_a', ownerId, name: 'Won deals', source: 'opportunities', config: null, isShared: true }] });   // a report's owner is a Clerk id
const claim = (requesterId) => ({ users, lead_claim_requests: [{ id: 'x1', orgId: 'org_a', leadId: 'l1', requesterId, status: 'pending', note: null }] });
// No request of the lead yet; the insert hands back the row it wrote.
const noClaimYet = (op) => ({
    users, leads: [{ id: 'l1', orgId: 'org_a', firstName: 'Pat', lastName: 'Lee', ownerId: null, assignedTo: null }],
    lead_claim_requests: op.kind === 'insert' ? claim(MINE).lead_claim_requests : [],
}[op.table] || []);
// The deal as the check reads it, then handed to another rep before the note's write, which touches no row.
const handedOn = (op) => {
    if (op.table !== 'opportunities') return op.table === 'users' ? users : [];
    if (op.kind !== 'select') return [];
    const first = globalThis.__gates.ops.filter((o) => o.kind === 'select' && o.table === 'opportunities').length === 1;
    return deal(first ? MINE : OTHERS).opportunities;
};
const logged = { recommendation_log: [{ id: 'x1', orgId: 'org_a', repName: 'Rae Crm2', actionType: 'stale', outcome: 'pending' }] };

export const REQUESTS = {
    leads: [
        { what: "a create naming another member is a manager's", method: 'POST', userId: REP, body: { id: 'n1', company: 'Acme', assignedTo: 'Olive Crm2' }, rows: lead(OTHERS) },
        { what: 'a create naming a name nobody holds, by a caller on no roster (none is not none)', method: 'POST', userId: GONE, body: { id: 'n1', company: 'Acme', assignedTo: 'Nobody Crm2' }, rows: { leads: lead(null).leads } },
        { what: 'a create naming the caller is theirs to make', method: 'POST', userId: REP, body: { id: 'n1', company: 'Acme', assignedTo: 'Rae Crm2' }, rows: lead(MINE) },
        { what: "a save of another rep's lead", method: 'PUT', userId: REP, body: { id: 'x1', title: 'COO' }, rows: lead(OTHERS) },
        { what: "a save of the caller's own lead, its owner sent unchanged", method: 'PUT', userId: REP, body: { id: 'x1', title: 'COO', assignedTo: 'Rae Crm2' }, rows: lead(MINE) },
        { what: 'a rep giving up their own lead (the owner changes)', method: 'PUT', userId: REP, body: { id: 'x1', assignedTo: '' }, rows: lead(MINE) },
        { what: 'a rep naming a name nobody holds on an unassigned lead (only the name changes)', method: 'PUT', userId: REP, body: { id: 'x1', assignedTo: 'Nobody Crm2' }, rows: lead(null) },
        { what: "the org-wide wipe is an Admin's", method: 'DELETE', userId: REP, qs: { clear: 'true' }, rows: lead(MINE) },
        { what: "a delete of another rep's lead (the owner words)", method: 'DELETE', userId: REP, rows: lead(OTHERS) },
        { what: "a delete of the caller's own lead is still an Admin's (the role words)", method: 'DELETE', userId: REP, rows: lead(MINE) },
    ],
    'lead-requests': [
        { what: 'a request by a caller on no roster', method: 'POST', userId: GONE, body: { id: 'x1', leadId: 'l1' }, rows: { leads: [{ id: 'l1', orgId: 'org_a', ownerId: null }] } },
        { what: 'a request by a member for an unassigned lead', method: 'POST', userId: REP, body: { id: 'x1', leadId: 'l1' }, rows: noClaimYet },
        { what: "a cancel of another rep's request", method: 'DELETE', userId: REP, rows: claim(OTHERS) },
        { what: "a cancel of the caller's own request", method: 'DELETE', userId: REP, rows: claim(MINE) },
        { what: 'a cancel by a caller on no roster', method: 'DELETE', userId: GONE, rows: { lead_claim_requests: claim(OTHERS).lead_claim_requests } },
    ],
    opportunities: [
        { what: "a save of another rep's deal", method: 'PUT', userId: REP, body: { id: 'x1', nextSteps: 'Call' }, rows: deal(OTHERS) },
        { what: "a save of the caller's own deal", method: 'PUT', userId: REP, body: { id: 'x1', nextSteps: 'Call' }, rows: deal(MINE) },
        { what: 'a save of an unassigned deal', method: 'PUT', userId: REP, body: { id: 'x1', nextSteps: 'Call' }, rows: deal(null) },
        { what: "a team note on another rep's deal", method: 'PUT', userId: REP, body: { id: 'x1', note: { op: 'add', text: 'Hello' } }, rows: deal(OTHERS) },
        { what: "a create in a stage of the org's own", method: 'POST', userId: REP, body: { id: 'x2', opportunityName: 'New', stage: 'bid SENT', pipelineId: 'default' }, rows: staged },
        { what: 'a create in a stage the org has not', method: 'POST', userId: REP, body: { id: 'x2', opportunityName: 'New', stage: 'Proposal', pipelineId: 'default' }, rows: staged },
        { what: 'a save onto a stage the org has not', method: 'PUT', userId: REP, body: { id: 'x1', stage: 'Proposal' }, rows: { ...deal(MINE), settings: ownStages } },
        { what: "a team note on a deal reassigned since the check", method: 'PUT', userId: REP, body: { id: 'x1', note: { op: 'add', text: 'Hello' } }, rows: handedOn, afterWrite: 'its write names the owner, so it touches no row; the deal is read again and refused' },
        { what: 'a save of an owned deal by a caller on no roster', method: 'PUT', userId: GONE, body: { id: 'x1', nextSteps: 'Call' }, rows: { opportunities: deal(OTHERS).opportunities } },
        { what: "the org-wide wipe is an Admin's", method: 'DELETE', userId: REP, qs: { clear: 'true' }, rows: deal(MINE) },
        { what: "a delete of another rep's deal (the owner words)", method: 'DELETE', userId: REP, rows: deal(OTHERS) },
        { what: "a delete of the caller's own deal is still an Admin's (the role words)", method: 'DELETE', userId: REP, rows: deal(MINE) },
    ],
    'saved-reports': [
        { what: "sending another member's report", method: 'POST', userId: REP, qs: { action: 'deliver', id: 'x1' }, rows: report('user_crm2_other') },
        { what: "sending the caller's own report (here: it has no schedule, a 400)", method: 'POST', userId: REP, qs: { action: 'deliver', id: 'x1' }, rows: report(REP) },
        { what: "a save of another member's report", method: 'PUT', userId: REP, body: { id: 'x1', name: 'Lost deals' }, rows: report('user_crm2_other') },
        { what: "a save of the caller's own report", method: 'PUT', userId: REP, body: { id: 'x1', name: 'Lost deals' }, rows: report(REP) },
        { what: "a delete of another member's report", method: 'DELETE', userId: REP, rows: report('user_crm2_other') },
        { what: "a delete of the caller's own report", method: 'DELETE', userId: REP, rows: report(REP) },
    ],
    'recommendation-log': [
        { what: 'a log row by a caller on no roster', method: 'POST', userId: GONE, body: { id: 'x1', repName: 'Rae Crm2', actionType: 'stale' }, rows: logged },
        { what: 'a log row by a member', method: 'POST', userId: REP, body: { id: 'x1', repName: 'Rae Crm2', actionType: 'stale' }, rows: { users, ...logged } },
    ],
    'mention-sms': [
        { what: "a text about another rep's deal", method: 'POST', userId: REP, body: { type: 'dealAssigned', recordId: 'x1' }, rows: deal(OTHERS) },
        { what: "a text about the caller's own deal (skipped, a 200)", method: 'POST', userId: REP, body: { type: 'dealAssigned', recordId: 'x1' }, rows: deal(MINE) },
        { what: "a text about another rep's task", method: 'POST', userId: REP, body: { type: 'taskAssigned', recordId: 'x1' }, rows: task(OTHERS) },
        { what: "a text about the caller's own task (skipped, a 200)", method: 'POST', userId: REP, body: { type: 'taskAssigned', recordId: 'x1' }, rows: task(MINE) },
    ],
    duplicates: [
        { what: 'the on-create look is for those who may read the CRM (a Technician, none)', method: 'GET', userId: REP, qs: { mode: 'create', entityType: 'account', name: 'Acme' }, rows: { users, accounts: [{ id: 'a1', orgId: 'org_a', name: 'Acme', ownerId: OTHERS }] } },
    ],
};
