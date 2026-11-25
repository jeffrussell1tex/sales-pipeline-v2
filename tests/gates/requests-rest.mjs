// Documents, calendars, AI, inbound email, the two senders and the two public tokens — the requests tests/gate-matrix.test.mjs asks beside the plain ones (state §0.288): the refusals
// the plain requests do not reach, each with the caller it lets through where there is one. rows: what each table answers (by its SQL name), or a function
// of the operation; env: process.env for that request alone.
import { createHmac } from 'node:crypto';
import { signState, NONCE_COOKIE } from '../../netlify/functions/_oauthState.mjs';

const member = (userId, id, name) => ({ id, clerkUserId: userId, orgId: 'org_a', name, email: id + '@example.test', role: 'User', active: true });

// ── documents ────────────────────────────────────────────────────────────────
// A document's owner is a Clerk id; a Specific document lists app ids.
const doc = (over = {}) => ({ id: 'x1', orgId: 'org_a', name: 'Proposal', ext: 'pdf', category: 'Note', sizeKb: 10, ownerId: 'user_other', ownerName: 'Other Rep',
    visibilityKind: 'team', visibilityUserIds: [], version: 1, storageKey: 'org_a/x1/v1/proposal.pdf', contentType: 'application/pdf', ...over });
const PRIVATE_THEIRS = { documents: [doc({ visibilityKind: 'private' })] };
const PRIVATE_MINE   = { documents: [doc({ visibilityKind: 'private', ownerId: 'user_me', ownerName: 'Me Rep' })] };
const TEAM_THEIRS    = { documents: [doc()] };
const VERSION = { id: 'dvr_1', orgId: 'org_a', documentId: 'x1', v: 1, storageKey: 'org_a/x1/v1/proposal.pdf', sizeKb: 10, contentType: 'application/pdf' };
const SPECIFIC = (...ids) => ({ documents: [doc({ visibilityKind: 'specific', visibilityUserIds: ids })], users: [member('user_doc_rep', 'usr_doc_rep', 'Doc Rep')] });
const R2 = { R2_ENDPOINT: 'https://r2.example.test', R2_BUCKET: 'bucket', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test' };
const LINK = { id: 'dlk_1', orgId: 'org_a', documentId: 'x1', recordType: 'opportunity', recordId: 'opp_1' };

const documents = [
    { what: "download: another's private document - everyone refused, an Admin too", method: 'GET', qs: { action: 'download', id: 'x1' }, rows: PRIVATE_THEIRS },
    { what: 'download: your own private document passes', method: 'GET', qs: { action: 'download', id: 'x1' }, rows: PRIVATE_MINE, env: R2 },
    { what: "download: another's document shared with other people only", method: 'GET', qs: { action: 'download', id: 'x1' }, rows: SPECIFIC('usr_other'), userId: 'user_doc_rep' },
    { what: "download: another's document shared with you passes", method: 'GET', qs: { action: 'download', id: 'x1' }, rows: SPECIFIC('usr_other', 'usr_doc_rep'), userId: 'user_doc_rep', env: R2 },
    { what: 'download: a team document passes', method: 'GET', qs: { action: 'download', id: 'x1' }, rows: TEAM_THEIRS, env: R2 },
    { what: "versions: another's private document", method: 'GET', qs: { action: 'versions', id: 'x1' }, rows: PRIVATE_THEIRS },
    { what: 'versions: your own private document passes', method: 'GET', qs: { action: 'versions', id: 'x1' }, rows: { ...PRIVATE_MINE, document_versions: [VERSION] } },

    { what: "a new version's upload url: another's private document", method: 'POST', qs: { action: 'upload-url' }, body: { documentId: 'x1', filename: 'a.pdf', kind: 'version' }, rows: PRIVATE_THEIRS },
    { what: "a new version's upload url: your own private document passes", method: 'POST', qs: { action: 'upload-url' }, body: { documentId: 'x1', filename: 'a.pdf', kind: 'version' }, rows: PRIVATE_MINE, env: R2 },
    { what: "new version: another's private document", method: 'POST', qs: { action: 'new-version' }, body: { id: 'x1', storageKey: 'org_a/x1/v2/a.pdf', sizeKb: 5 }, rows: PRIVATE_THEIRS },
    { what: 'new version: your own private document passes', method: 'POST', qs: { action: 'new-version' }, body: { id: 'x1', storageKey: 'org_a/x1/v2/a.pdf', sizeKb: 5 }, rows: PRIVATE_MINE },
    { what: "restore a version: another's private document", method: 'POST', qs: { action: 'restore-version' }, body: { id: 'x1', v: 1 }, rows: { ...PRIVATE_THEIRS, document_versions: [VERSION] } },
    { what: 'restore a version: your own private document passes', method: 'POST', qs: { action: 'restore-version' }, body: { id: 'x1', v: 1 }, rows: { ...PRIVATE_MINE, document_versions: [VERSION] } },
    { what: "link: another's private document", method: 'POST', qs: { action: 'link' }, body: { id: 'x1', links: [] }, rows: PRIVATE_THEIRS },
    { what: 'link: your own private document passes', method: 'POST', qs: { action: 'link' }, body: { id: 'x1', links: [] }, rows: PRIVATE_MINE },
    // A record the caller cannot see answers 404, as one that is not there does.
    { what: "link your own document to another rep's deal - a rep's is 404, Admin and Manager pass", method: 'POST', qs: { action: 'link' }, body: { id: 'x1', links: [{ type: 'opportunity', recordId: 'opp_1' }] }, rows: { ...PRIVATE_MINE, opportunities: [{ id: 'opp_1', orgId: 'org_a', opportunityName: 'Deal', ownerId: 'usr_other', salesRep: 'Other Rep' }] } },
    { what: "link your own document to another rep's account - a rep's is 404, Admin and Manager pass", method: 'POST', qs: { action: 'link' }, body: { id: 'x1', links: [{ type: 'account', recordId: 'acc_1' }] }, rows: { ...PRIVATE_MINE, accounts: [{ id: 'acc_1', orgId: 'org_a', name: 'Acme', ownerId: 'usr_other' }] } },
    { what: "a new document linked to another rep's deal - a rep's is 404, Admin and Manager pass", method: 'POST', body: { id: 'x2', name: 'Proposal', storageKey: 'org_a/x2/v1/proposal.pdf', links: [{ type: 'opportunity', recordId: 'opp_1' }] }, rows: (op) => ({ documents: op.kind === 'insert' ? [doc({ id: 'x2', ownerId: 'user_me' })] : [], opportunities: [{ id: 'opp_1', orgId: 'org_a', opportunityName: 'Deal', ownerId: 'usr_other', salesRep: 'Other Rep' }] }[op.table] || []) },
    { what: "edit: another's private document", method: 'PUT', body: { id: 'x1', name: 'Renamed' }, rows: PRIVATE_THEIRS },
    { what: "edit: another's team document passes (its name is any writer's)", method: 'PUT', body: { id: 'x1', name: 'Renamed' }, rows: TEAM_THEIRS },
    { what: "who sees it: another's team document - an Admin alone", method: 'PUT', body: { id: 'x1', visibility: 'private' }, rows: TEAM_THEIRS },
    { what: "who sees it, by its list alone: another's document shared with you - an Admin alone", method: 'PUT', body: { id: 'x1', visibilityUserIds: ['usr_doc_rep'] }, rows: SPECIFIC('usr_doc_rep'), userId: 'user_doc_rep' },
    { what: 'who sees it: your own document passes', method: 'PUT', body: { id: 'x1', visibility: 'private' }, rows: PRIVATE_MINE },
    { what: "unlink: another's private document", method: 'DELETE', qs: { action: 'link', linkId: 'dlk_1' }, rows: { ...PRIVATE_THEIRS, document_links: [LINK] } },
    { what: 'unlink: your own private document passes', method: 'DELETE', qs: { action: 'link', linkId: 'dlk_1' }, rows: { ...PRIVATE_MINE, document_links: [LINK] } },
    { what: "delete: another's private document - everyone, an Admin too", method: 'DELETE', qs: { id: 'x1' }, rows: PRIVATE_THEIRS },
    { what: "delete: another's team document - an Admin alone", method: 'DELETE', qs: { id: 'x1' }, rows: TEAM_THEIRS },
    { what: 'delete: your own document passes', method: 'DELETE', qs: { id: 'x1' }, rows: PRIVATE_MINE },
];

// ── calendars ────────────────────────────────────────────────────────────────
const calendarConnections = [
    { what: "disconnect another member's own calendar", method: 'DELETE', qs: { id: 'x1', scope: 'user' }, rows: { user_calendar_connections: [{ id: 'x1', userId: 'user_other', orgId: 'org_a', provider: 'google' }] } },
    { what: 'disconnect your own calendar passes', method: 'DELETE', qs: { id: 'x1', scope: 'user' }, rows: { user_calendar_connections: [{ id: 'x1', userId: 'user_me', orgId: 'org_a', provider: 'google' }] } },
    { what: 'disconnect the company calendar - an Admin alone', method: 'DELETE', qs: { id: 'x1', scope: 'org' }, rows: { org_calendar_connections: [{ id: 'x1', orgId: 'org_a', provider: 'google' }] } },
];
const KEY = { SETTINGS_ENCRYPTION_KEY: 'gate-test-key' };
const GOOGLE = { ...KEY, GOOGLE_CLIENT_ID: 'test', GOOGLE_CLIENT_SECRET: 'test' };
const calendarOauthStart = [
    { what: 'connect a company calendar - an Admin alone', method: 'POST', body: { provider: 'google', scope: 'org' }, env: GOOGLE },
    { what: 'connect your own calendar passes', method: 'POST', body: { provider: 'google', scope: 'user' }, env: GOOGLE },
];
// The callback answers a 302 whatever it decides: the reason is in its Location (bad_state, not_admin, server_error),
// so a status alone shows none of these - the test must read headers.Location. server_error is the passing one here:
// the state was taken and the exchange then met the faked fetch.
const state = (over = {}, opts = {}) => signState({ userId: 'user_me', orgId: 'org_a', userRole: 'Admin', provider: 'google', scope: 'org', from: 'company', ...over },
    { secret: KEY.SETTINGS_ENCRYPTION_KEY, nonce: 'nonce_1', ...opts }).state;
const back = (what, st, cookie = 'nonce_1', env = GOOGLE) => ({ what, method: 'GET', qs: () => ({ code: 'c', state: st() }), headers: { cookie: NONCE_COOKIE + '=' + cookie }, env });
const calendarOauthCallback = [
    back('a state signed here, in this browser, passes (server_error: the exchange is faked)', () => state()),
    ...['Manager', 'User', 'Dispatcher', 'Technician', 'ReadOnly', 'Nonsense'].map((userRole) => back(`a company calendar by a state signed for ${userRole} (not_admin)`, () => state({ userRole }))),
    back('your own calendar by a state signed for a rep passes (server_error)', () => state({ userRole: 'User', scope: 'user' })),
    back("a state signed with another key (bad_state)", () => state({}, { secret: 'another-key' })),
    back('a state started in another browser (bad_state)', () => state(), 'nonce_2'),
    back('a state past its ten minutes (bad_state)', () => state({}, { now: Date.now() - 11 * 60 * 1000 })),
    back('no signing key on the site (bad_state)', () => state(), 'nonce_1', {}),
];

// ── AI ───────────────────────────────────────────────────────────────────────
// The passing requests stop at "no Anthropic key" (503): nothing is asked of Claude.
const deal = (ownerId) => ({ id: 'opp_1', orgId: 'org_a', opportunityName: 'Deal', ownerId, salesRep: 'Rep', stage: 'Proposal' });
const ai = (availableTo, ownerId) => ({ opportunities: [deal(ownerId)], settings: [{ orgId: 'org_a', extra: { aiScoringEnabled: true, aiSettings: { availableTo } } }], users: [member('user_ai_rep', 'usr_ai_rep', 'Ai Rep')] });
const explain = (what, rows) => ({ what, method: 'POST', body: { opportunityId: 'opp_1' }, rows, userId: 'user_ai_rep' });
const aiScore = [
    explain("another rep's deal - the rep refused, Admin and Manager pass", ai('All roles', 'usr_other')),
    explain('your own deal passes, open to All roles', ai('All roles', 'usr_ai_rep')),
    explain('AI open to Admins and Managers: the rep refused on their own deal', ai('Admin + Manager only', 'usr_ai_rep')),
    explain('AI open to Admins: a Manager refused too', ai('Admin only', 'usr_ai_rep')),
    explain('a stored choice the list does not hold reads as Admins only', ai('Everyone', 'usr_ai_rep')),
];

// ── email-inbound ────────────────────────────────────────────────────────────
const HOOK = 'whsec_' + Buffer.from('gate-test-hook').toString('base64');
const mail = JSON.stringify({ type: 'email.received', data: { from: 'someone@example.test', to: ['nobody@example.test'], subject: 'Hello' } });
const svix = (body, { secret = HOOK, ts = Math.floor(Date.now() / 1000) } = {}) => ({ 'svix-id': 'msg_1', 'svix-timestamp': String(ts),
    'svix-signature': 'v1,' + createHmac('sha256', Buffer.from(secret.replace(/^whsec_/, ''), 'base64')).update(`msg_1.${ts}.${body}`).digest('base64') });
const INBOUND = { RESEND_INBOUND_SECRET: HOOK, BCC_SECRET: 'gate-test-bcc', INBOUND_DOMAIN: 'in.example.test' };
const SHARED = { INBOUND_SHARED_SECRET: 'gate-test-shared', BCC_SECRET: 'gate-test-bcc' };
const hook = (what, headers, env = INBOUND, qs = {}) => ({ what, method: 'POST', qs, body: mail, headers, env });
const sigOf = (text) => createHmac('sha256', INBOUND.BCC_SECRET).update(text).digest('hex').slice(0, 16);
const USR = 'usr_00000000-0000-4000-8000-000000000001';
const inbox = (active) => [{ ...member('user_me', USR, 'Me Rep'), email: 'rep@example.test', active }];
const logged = (what, to, users) => { const body = JSON.stringify({ type: 'email.received', data: { from: 'rep@example.test', to: [to], subject: 'Hello' } }); return { what, method: 'POST', qs: {}, body, headers: () => svix(body), env: INBOUND, rows: { users, contacts: [] } }; };
const emailInbound = [
    hook('a webhook signed by its secret passes', () => svix(mail)),
    hook('a webhook signed by another secret', () => svix(mail, { secret: 'whsec_' + Buffer.from('other').toString('base64') })),
    hook('a signature over another body', () => svix(mail + ' ')),
    hook('a signed webhook older than five minutes', () => svix(mail, { ts: Math.floor(Date.now() / 1000) - 600 })),
    hook('a site with no webhook secret refuses every signature', () => svix(mail), { BCC_SECRET: 'gate-test-bcc' }),
    hook('the shared secret in the query passes', {}, SHARED, { secret: 'gate-test-shared' }),
    hook('the wrong shared secret', {}, SHARED, { secret: 'guess' }),
    hook('no shared secret set: a query without one is no match', {}, { BCC_SECRET: 'gate-test-bcc' }),
    hook('a signed webhook while no dropbox secret is set (503)', () => svix(mail), { RESEND_INBOUND_SECRET: HOOK }),
    // The address is the second authority. Each answers 200 so the provider does not retry; the body says which:
    // 'no valid dropbox recipient' (refused) or 'no contact matched participants' (taken; no contact to log it on).
    logged('a personal address with its own signature is taken', `me-${USR}-${sigOf('user:' + USR)}@in.example.test`, inbox(true)),
    logged("a personal address signed as an org's is not", `me-${USR}-${sigOf(USR)}@in.example.test`, inbox(true)),
    logged("a deactivated member's personal address is not", `me-${USR}-${sigOf('user:' + USR)}@in.example.test`, inbox(false)),
    logged("an org's address with its own signature is taken", `log-org_a-${sigOf('org_a')}@in.example.test`, []),
    logged("an org's address with another org's signature is not", `log-org_a-${sigOf('org_b')}@in.example.test`, []),
];

// ── the two senders: INTERNAL_API_SECRET ─────────────────────────────────────
// The passing request stops at the body check (400), so nothing is sent.
const SECRET = { INTERNAL_API_SECRET: 'gate-test-secret' };
const internal = (body) => [
    { what: 'the internal secret passes', method: 'POST', headers: { authorization: 'Bearer gate-test-secret' }, body, env: SECRET },
    { what: 'another secret', method: 'POST', headers: { authorization: 'Bearer gate-test-secre' }, body, env: SECRET },
    { what: 'no header while the secret is set', method: 'POST', body, env: SECRET },
    { what: 'no secret set: "Bearer undefined" is not it', method: 'POST', headers: { authorization: 'Bearer undefined' }, body },
    { what: 'no secret set: an empty one is not it', method: 'POST', headers: { authorization: 'Bearer ' }, body, env: { INTERNAL_API_SECRET: '' } },
];
const sendEmail = internal({ type: 'noSuchTemplate', to: 'a@example.test', data: {} });
const sendSms = internal({ to: '+15550100000' });

// ── the two public tokens (a refusal is a 404, the same page or body either way) ─────────────────────
const T = (n) => 'gatetesttoken00000000000' + n;   // a token each: the rate limit counts by token
const form = (token, over = {}) => ({ orgId: 'org_a', companyName: 'Acme', extra: { webToLead: { enabled: true, token, ...over } } });
const json = { 'content-type': 'application/json' };
const bot = { firstName: 'A', lastName: 'B', email: 'a@example.test', website: 'http://bot.example.test' };   // the honeypot: thanked, nothing stored
const leadIntake = [
    { what: 'the form opens by its token', method: 'GET', qs: { t: T(1) }, rows: { settings: [form(T(1))] } },
    { what: 'a token no org holds', method: 'GET', qs: { t: T(2) }, rows: { settings: [] } },
    { what: 'a token two orgs hold answers for neither', method: 'GET', qs: { t: T(3) }, rows: { settings: [form(T(3)), { ...form(T(3)), orgId: 'org_b' }] } },
    { what: 'a form turned off', method: 'GET', qs: { t: T(4) }, rows: { settings: [form(T(4), { enabled: false })] } },
    { what: 'a row holding another token', method: 'GET', qs: { t: T(5) }, rows: { settings: [form(T(6))] } },
    { what: 'what is not a token', method: 'GET', qs: { t: 'short' }, rows: { settings: [form('short')] } },
    { what: 'a submission by its token passes (the honeypot: thanked, not stored)', method: 'POST', qs: { t: T(7) }, headers: json, body: bot, rows: { settings: [form(T(7))] } },
    { what: 'a submission to a form turned off', method: 'POST', qs: { t: T(8) }, headers: json, body: bot, rows: { settings: [form(T(8), { enabled: false })] } },
];
const VISIT = { id: 'job_1', orgId: 'org_a', title: 'Service visit', jobNumber: 'JOB-1', status: 'scheduled', customerId: 'cus_1', publicToken: T(1) };
const dispatchStatus = [
    { what: 'the page opens by its token', method: 'GET', qs: { t: T(1) }, rows: { dispatch_jobs: [VISIT] } },
    { what: 'a token no job holds', method: 'GET', qs: { t: T(2) }, rows: { dispatch_jobs: [] } },
    { what: 'what is not a token', method: 'GET', qs: { t: 'short' }, rows: { dispatch_jobs: [VISIT] } },
    { what: 'a visit finished more than two weeks ago', method: 'GET', qs: { t: T(1) }, rows: { dispatch_jobs: [{ ...VISIT, status: 'completed', actualEnd: '2020-01-01T12:00:00Z' }] } },
    { what: 'a visit finished yesterday still opens', method: 'GET', qs: { t: T(1) }, rows: { dispatch_jobs: [{ ...VISIT, status: 'completed', actualEnd: new Date(Date.now() - 86400000).toISOString() }] } },
];

// ai-models: the plain GET already shows its one role gate (an Admin alone); its other 401/403 is Anthropic's answer
// read, no refusal of a caller.
const prompt = (what, availableTo) => ({ what, method: 'POST', body: { prompt: 'won deals this year' }, rows: { settings: [{ orgId: 'org_a', extra: { aiReportPromptsEnabled: true, aiSettings: { availableTo } } }] } });
const reportPrompt = [
    prompt('a report by prompt: the roles AI is open to (the rest: reason role, in a 200)', 'All roles'),
    prompt('a report by prompt, AI open to Admins: the rest refused in words', 'Admin only'),
];

// A settings save whose list drops what a deal of the org is in (state §0.297, §0.299): read to be refused, an Admin's alone.
const CLOSES = [{ name: 'Closed Won', weight: 100 }, { name: 'Closed Lost', weight: 0 }];
const inUse = (stage, pipelineId) => ({ settings: [{ id: 'org_a', orgId: 'org_a', extra: { pipelines: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }], funnelStages: [{ name: 'Site visit', weight: 20 }, { name: 'Bid sent', weight: 50 }, ...CLOSES] } }], opportunities: [{ id: 'd1', orgId: 'org_a', stage, pipelineId }] });
const settingsSaves = [
    { what: 'a pipelines list without one an open deal is in', method: 'PUT', body: { pipelines: [{ id: 'p1', name: 'One' }] }, rows: inUse('Proposal', 'p2') },
    { what: 'a stages list without the one a deal is in', method: 'PUT', body: { funnelStages: [{ name: 'Bid sent', weight: 50 }, ...CLOSES] }, rows: inUse('Site visit', 'p1') },
    { what: "a stages list without one of the old column's", method: 'PUT', body: { funnelStages: [{ name: 'Bid sent', weight: 50 }, ...CLOSES] }, rows: { settings: [{ id: 'org_a', orgId: 'org_a', extra: {}, stages: [{ name: 'Old one', weight: 5 }, ...CLOSES] }], opportunities: [{ id: 'd1', orgId: 'org_a', stage: 'Old one', pipelineId: 'p1' }] } },
    { what: 'a stage renamed, its deals with it', method: 'PUT', body: { funnelStages: [{ name: 'Visit', was: 'Site visit', weight: 20 }, { name: 'Bid sent', weight: 50 }, ...CLOSES] }, rows: inUse('Site visit', 'p1') },
    { what: 'a rename of a stage not saved', method: 'PUT', body: { funnelStages: [{ name: 'Visit', was: 'Nope', weight: 20 }, { name: 'Bid sent', weight: 50 }, ...CLOSES] }, rows: inUse('Site visit', 'p1') },
    { what: 'a stages list with no open stage', method: 'PUT', body: { funnelStages: CLOSES }, rows: inUse('Closed Won', 'p1') },
];

export const REQUESTS = {
    'report-prompt': reportPrompt, settings: settingsSaves,
    documents, 'calendar-connections': calendarConnections, 'calendar-oauth-start': calendarOauthStart, 'calendar-oauth-callback': calendarOauthCallback,
    'ai-score': aiScore, 'email-inbound': emailInbound, 'send-email': sendEmail, 'send-sms': sendSms, 'lead-intake': leadIntake, 'dispatch-status': dispatchStatus,
};
