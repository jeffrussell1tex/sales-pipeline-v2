// tests/failed-reads.test.mjs (state §0.292)
// A read the server decides on that FAILS is never an answer. The caller's own lookup (_lib.mjs resolveCaller) answered a
// database error as a caller with no roster row: a create stored with no owner — any writer's to change — a rep's list
// answered short, their own record "not yours". Beside it six reads answered a failure as their default: an org's approval
// rules (a quote its own rules hold was sent without approval), territory rules, lead scoring rules, a lead's activities,
// whether a recommendation was acted on, a first sign-in's link and row — and the web form's GET a form turned off.
// The real handlers run here on the gate matrix's engine (no database, no network): the one statement rejected, every other
// answered. THE GUARD: each such request is a 500 with nothing written, sent or stored; a lookup read only for a name — after
// a write, or to show — changes nothing of the answer. The real database's half: tests/integration/failed-reads.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ROOT, ROLES, ask, functionFiles, load, shapesOf, sourceOf } from './gates/engine.mjs';
import { mailsOwner } from '../netlify/functions/_dealMail.mjs';

const REQUESTS = {};
for (const n of ['crm', 'sales', 'quotes', 'dispatch', 'people', 'rest']) Object.assign(REQUESTS, (await import(`./gates/requests-${n}.mjs`)).REQUESTS);
const G = globalThis.__gates;
const PLAIN = { settings: [{ orgId: 'org_a', extra: { dispatchEnabled: true } }] };
const WRITES = new Set(['insert', 'update', 'delete', 'batch', 'execute', 'store', 'clerk', 'fetch']);
const ME = { id: 'usr_me', name: 'Me Rep' };
const DEAL = { id: 'd1', orgId: 'org_a', ownerId: 'usr_me', salesRep: 'Me Rep', stage: 'Proposal' };
// An org's own AI key, stored as the settings PUT stores it.
const ownKey = async (key, secret = 'failed-reads') => { const was = process.env.SETTINGS_ENCRYPTION_KEY; process.env.SETTINGS_ENCRYPTION_KEY = secret; try { return (await import(new URL('netlify/functions/crypto.mjs', ROOT).href)).encrypt(key); } finally { if (was === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY; else process.env.SETTINGS_ENCRYPTION_KEY = was; } };
const fn = (f) => import(new URL(`netlify/functions/${f}.mjs`, ROOT).href);
const lib = await fn('_lib');
const isCaller = (op) => op.kind === 'select' && op.table === 'users' && Object.keys(op.fields || {}).sort().join() === 'id,name';
const down = () => { throw new Error('TEST lookup down'); };
const answer = (rows, op) => (typeof rows === 'function' ? rows(op) : (rows || PLAIN)[op.table]) || [];
const written = () => G.ops.filter((o) => WRITES.has(o.kind)).map((o) => `${o.kind} ${o.table}`).join(', ');

// One request; `fails(op)` says which statement is rejected. { status, body, wrote, hits }
async function run(handler, f, r, role, fails, rows = r.rows) {
    let hits = 0, res;
    const x = await ask(async (e, c) => (res = await handler(e, c)), f, { ...r, rows: (op) => { if (fails?.(op)) { hits++; down(); } return answer(rows, op); } }, role);
    let body = res?.body;
    try { body = JSON.parse(body); } catch { /* a page */ }
    return { status: x.status, body, wrote: written(), hits, type: res?.headers?.['Content-Type'] };
}
const is500 = (x, what) => {
    assert.ok(x.hits > 0, `${what}: the failing read was asked`);
    assert.equal(x.status, 500, `${what}: ${x.status} ${JSON.stringify(x.body)}`);
    assert.equal(x.body.error, 'Internal server error', what);
    assert.equal(x.wrote, '', `${what}: nothing written`);
};

test('_lib.mjs: a failed read of the caller throws and is not kept; no roster row is nulls; a name read to show is none', async () => {
    lib.invalidateRoster();
    G.rows = down;
    const who = { clerkUserId: 'user_me', orgId: 'org_a' };
    await assert.rejects(lib.resolveCaller('user_me', 'org_a'), /lookup down/);
    await assert.rejects(lib.getCallerId('user_me', 'org_a'), /lookup down/);
    await assert.rejects(lib.stampOwnerId({ firstName: 'A' }, 'contact', who), /lookup down/);
    await assert.rejects(lib.stampOwnerIds([{ firstName: 'A' }], 'contact', { ...who, defaultToCaller: true }), /lookup down/);
    await assert.rejects(lib.ownerIdForWrite({ suppliedName: '', ...who }), /lookup down/);
    const { contacts } = await import(new URL('db/schema.ts', ROOT).href);
    const asRep = { table: contacts, entity: 'contact', id: 'c1', orgId: 'org_a', userId: 'user_me', userRole: 'User', headers: {}, row: { ownerId: 'usr_me' } };
    await assert.rejects(lib.assertOwnership(asRep), /lookup down/);
    await assert.rejects(lib.ownerWriteFilter(asRep), /lookup down/);
    // An Admin's or Manager's writes ask no caller.
    assert.equal(await lib.assertOwnership({ ...asRep, userRole: 'Manager' }), null);
    assert.equal(await lib.ownerWriteFilter({ ...asRep, userRole: 'Admin' }), undefined);
    // A label: none — but never without its org.
    assert.equal(await lib.getCallerName('user_me', 'org_a'), null);
    await assert.rejects(lib.getCallerName('user_me', null), /orgId is required/);
    G.ops = [];
    await lib.auditAs('org_a', 'user_me', { action: 'x', entityType: 'y', entityId: 'z' });
    assert.ok(G.ops.some((o) => o.kind === 'insert' && o.table === 'audit_log'), 'the audit row is still written, by id');
    // The failure was not kept: the next read, landing, is the answer — and that one is kept.
    G.rows = { users: [ME] };
    assert.deepEqual(await lib.resolveCaller('user_me', 'org_a'), ME);
    G.rows = down;
    assert.deepEqual(await lib.resolveCaller('user_me', 'org_a'), ME, 'kept for the request');
    lib.invalidateRoster();
    G.rows = { users: [] };
    assert.deepEqual(await lib.resolveCaller('user_me', 'org_a'), { id: null, name: null }, 'no roster row in this org');
    assert.deepEqual(await lib.stampOwnerId({ firstName: 'A' }, 'contact', who), { firstName: 'A', ownerId: null, assignedRep: null }, 'a caller with no row: unassigned, as before');
    lib.invalidateRoster();
});

// Three reads of the caller the gate matrix's requests do not reach: who decides a claim request, whose a bulk overwrite's
// moves are, and the caller's own inbound address.
const MORE = {
    'lead-requests': [{ method: 'PUT', what: 'decide', body: { id: 'r1', action: 'deny' }, rows: { lead_claim_requests: [{ id: 'r1', orgId: 'org_a', leadId: 'l1', requesterId: 'usr_me', status: 'pending' }], leads: [{ id: 'l1', orgId: 'org_a' }], users: [ME] } }],
    // A create and a settings save naming a pipeline of the org (state §0.297): the matrix's made-up ones are refused before the caller is read.
    settings: [{ method: 'PUT', what: 'pipelines', body: { pipelines: [{ id: 'default', name: 'New Business' }] } }],
    opportunities: [{ method: 'POST', what: 'its pipeline', body: { id: 'x1', pipelineId: 'default' } }, { method: 'PUT', what: 'bulk overwrite', body: [{ id: 'd1', stage: 'Proposal' }], rows: { opportunities: [DEAL], users: [ME] } },
        // And naming a probability it takes (state §0.300): the matrix's made-up one is refused before the caller is read.
        { method: 'PUT', what: 'its probability', body: { id: 'd1', probability: 50 }, rows: { opportunities: [DEAL], users: [ME] } }],
    // Which claims a rep is answered turns on who they are (state §0.298).
    'spiff-claims': [{ method: 'GET', what: 'claims', qs: {}, rows: { spiff_claims: [{ id: 'c1', orgId: 'org_a', opportunityId: 'd1', spiffId: 'sp', repName: ME.name }], opportunities: [DEAL], users: [ME] } }],
    'email-inbound': [{ method: 'GET', what: 'my address', env: { BCC_SECRET: 'test', INBOUND_DOMAIN: 'in.test' }, rows: { users: [ME] } }],
};
// Every function, as every role, with every request the gate matrix knows: where the caller's read fails the request is
// refused whole — or that read was for a name alone, and the answer and the writes are as with it.
test('THE GUARD: a request whose caller cannot be read is a 500 with nothing written, or read the caller only for a name', async () => {
    let asked = 0, refused = 0;
    const bad = [], threw = new Set(), named = new Set();
    const isRefused = (x) => x.status === 500 && x.wrote === '' && x.body?.error === 'Internal server error';
    for (const f of functionFiles()) {
        const handler = await load(f);
        if (!handler) continue;
        const all = [...(MORE[f] || []), ...['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => ({ method })), ...(REQUESTS[f] || []), ...shapesOf(sourceOf(f))];
        for (const r of all) for (const role of ROLES) {
            const without = await run(handler, f, r, role, isCaller);
            if (!without.hits) continue;
            asked++;
            const rows = r.rows;
            const landing = (op) => { const got = answer(rows, op); return isCaller(op) && !got.length ? [ME] : got; };
            let withIt = null;
            const asWith = async () => (withIt ??= await run(handler, f, r, role, null, landing));
            // The first read alone failing, the next landing: a check that took the failure for an answer is not hidden by the next.
            let n = 0;
            const first = await run(handler, f, r, role, (op) => isCaller(op) && n++ === 0, landing);
            if (!isRefused(first)) { const w = await asWith(); if (w.status !== first.status || w.wrote !== first.wrote) bad.push(`${f} ${r.method} as ${role}${r.what ? ` (${r.what})` : ''}, the first read alone: ${first.status} [${first.wrote}], with the caller read ${w.status} [${w.wrote}]`); }
            if (isRefused(without)) { refused++; threw.add(`${f} ${r.method}`); if (!isRefused(first)) bad.push(`${f} ${r.method} as ${role}${r.what ? ` (${r.what})` : ''}: refused with every read failing, not with the first alone`); continue; }
            await asWith();
            named.add(`${f} ${r.method}`);
            if (withIt.status !== without.status || withIt.wrote !== without.wrote) bad.push(`${f} ${r.method} as ${role}${r.what ? ` (${r.what})` : ''}: ${without.status} [${without.wrote}], with the caller read ${withIt.status} [${withIt.wrote}]`);
        }
    }
    assert.deepEqual(bad, []);
    // Each function and method whose requests were refused, and each whose read was for a name alone (an audit row's, a
    // maker's, a notice's): one leaving the first list answers a failed read as something else.
    assert.deepEqual([...threw].sort(), methodsOf(EXPECT_THREW));
    assert.deepEqual([...named].sort(), methodsOf(EXPECT_NAMED));
    assert.ok(asked >= 1486, `${asked} requests read the caller`);
    assert.ok(refused >= 1066, `${refused} of them were refused`);
});
test('THE GUARD: no read of the caller is caught where it is asked — getCallerName is the one that answers none', () => {
    const CAUGHT = /\b(resolveCaller|getCallerId|stampOwnerIds?|assertOwnership|ownerWriteFilter|ownerIdForWrite|dealReadContext|dealAccess|repScopeOf)\((?:[^()]|\([^()]*\))*\)\s*\.(catch|then)\(/;
    assert.ok(CAUGHT.test('const a = await getCallerId(userId, orgId).catch(() => null);'));
    assert.deepEqual(readdirSync(new URL('netlify/functions/', ROOT)).filter((n) => n.endsWith('.mjs') && CAUGHT.test(readFileSync(new URL('netlify/functions/' + n, ROOT), 'utf8'))), []);
});

// The fake database reads no WHERE: each of these reads is this org's, by its text.
test("WIRING: each read that decides is this org's alone, and the caller's is kept for 30 seconds", () => {
    const holds = (f, ...lines) => { const s = sourceOf(f).split('\r\n').join('\n'); for (const l of lines) assert.ok(s.includes(l), `REGRESSION (§0.292): ${f}: ${l}`); };
    holds('_lib', '        .where(and(eq(users.clerkUserId, clerkUserId), eq(users.orgId, orgId)));\n    const caller = { id: row?.id || null, name: row?.name || null };\n', '    if (!row) return caller;\n    callerCache.set(key, { caller, ts: Date.now() });\n',
        '    if (cached && Date.now() - cached.ts < CALLER_NAME_TTL_MS) return cached.caller;\n', 'const CALLER_NAME_TTL_MS = 30_000;');
    const ROW = '.from(settingsTable).where(eq(settingsTable.orgId, orgId));\n';
    holds('quotes', `export async function getApprovalTiers(orgId) {\n    const rows = await db.select()${ROW}`);
    holds('accounts', `async function loadTerritoryRules(orgId) {\n    const rows = await db.select()${ROW}`);
    holds('leads', `async function getLeadScoring(orgId) {\n    const [row] = await db.select()${ROW}`, '        const acts = await db.select().from(activitiesTable).where(and(eq(activitiesTable.orgId, orgId), eq(activitiesTable.leadId, lead.id)));\n');
    holds('activities', `    const [srow] = await db.select()${ROW}`, '    const acts = await db.select().from(activities).where(and(eq(activities.orgId, orgId), eq(activities.leadId, leadId)));\n');
    holds('users', "                        const [theirs] = await db.select().from(users)\n                            .where(and(eq(users.clerkUserId, userId), eq(users.orgId, orgId)));\n                        if (!theirs) throw linkErr;\n                        row = theirs;\n");
});

const methodsOf = (list) => list.flatMap((x) => x.split(' ').slice(1).map((m) => `${x.split(' ')[0]} ${m}`)).sort();
const EXPECT_THREW = [
    'accounts DELETE GET POST PUT', 'activities DELETE GET POST PUT', 'ai-score POST', 'contacts DELETE GET POST PUT',
    'dispatch-plan-visits POST', 'documents DELETE GET PATCH POST PUT', 'duplicates GET', 'email-inbound GET',
    'lead-requests DELETE GET POST PUT', 'leads DELETE GET POST PUT', 'mention-sms POST', 'opportunities DELETE GET POST PUT',
    'quote-email POST', 'quote-pdf POST', 'quote-to-job GET POST', 'quotes GET POST PUT', 'recommendation-log GET POST PUT',
    'spiff-claims GET POST PUT', 'tasks DELETE GET POST PUT', 'users PUT',
];
const EXPECT_NAMED = [
    'api-keys POST', 'audit-log POST', 'backup POST PUT', 'quote-pdf POST', 'calendar-connections DELETE', 'dispatch-customers DELETE POST PUT',
    'dispatch-equipment DELETE POST PUT', 'dispatch-jobs DELETE POST PUT', 'dispatch-plan-visits DELETE',
    'dispatch-schedule-blocks DELETE POST PUT', 'dispatch-service-plans DELETE POST PUT', 'dispatch-technicians DELETE POST PUT',
    'dispatch-vehicles DELETE POST PUT', 'invoices DELETE POST PUT', 'opportunities POST', 'quote-to-job POST',
    'quotes POST PUT', 'recommendation-log POST', 'saved-reports DELETE POST PUT', 'settings PUT', 'spiff-claims POST PUT',
    'train-deal-model POST', 'train-lead-model POST', 'user-role PUT', 'users DELETE POST PUT',
];

const SETTINGS_ROW = (op) => op.kind === 'select' && op.table === 'settings' && !op.fields;
const QUOTE = { id: 'q1', orgId: 'org_a', opportunityId: 'd1', quoteNumber: 'Q-1', version: 1, name: 'Q', status: 'Draft', dealDiscount: '8', lineItems: [{ id: 'l1', name: 'Work', listPrice: 1000, quantity: 1 }], billingContact: 'buyer@test.local', stamp: 's' };
const TIERS = [{ maxDiscount: 0.05, label: 'Rep', approver: null }, { maxDiscount: 1, label: 'Boss', approver: 'Boss', approverRole: 'Admin' }];
const quoteRows = (status) => ({ quotes: [{ ...QUOTE, status }], opportunities: [DEAL], users: [ME], settings: [{ orgId: 'org_a', extra: { approvalTiers: TIERS } }] });

test("an org's approval rules that cannot be read are never the default rules: no quote sent, marked sent or approved by them, and no numbers", async () => {
    const quotes = await load('quotes'), email = await load('quote-email');
    const first = () => { let n = 0; return (op) => SETTINGS_ROW(op) && n++ === 0; };
    is500(await run(email, 'quote-email', { method: 'POST', body: { quoteId: 'q1' } }, 'Admin', first(), quoteRows('Draft')), 'email');
    const held = await run(email, 'quote-email', { method: 'POST', body: { quoteId: 'q1' } }, 'Admin', null, quoteRows('Draft'));
    assert.equal(held.status, 422, 'the rules read: held for approval');
    is500(await run(quotes, 'quotes', { method: 'PUT', body: { id: 'q1', status: 'Sent to Customer' } }, 'Admin', first(), quoteRows('Draft')), 'mark sent');
    is500(await run(quotes, 'quotes', { method: 'PUT', body: { id: 'q1', status: 'Approved' } }, 'Manager', first(), quoteRows('Pending Approval')), 'approve');
    is500(await run(quotes, 'quotes', { method: 'GET', qs: { approvalStats: 'true' } }, 'Admin', first(), quoteRows('Draft')), 'the numbers');
    const { getApprovalTiers } = await fn('quotes');
    const { DEFAULT_QUOTE_APPROVAL_TIERS } = await import(new URL('src/utils/quoteRules.js', ROOT).href);
    for (const rows of [[], [{ extra: null }], [{ extra: { approvalTiers: [] } }]]) { G.rows = { settings: rows }; assert.equal(await getApprovalTiers('org_a'), DEFAULT_QUOTE_APPROVAL_TIERS, 'an org that stored none'); }
    G.rows = { settings: [{ extra: { approvalTiers: TIERS } }] };
    assert.equal(await getApprovalTiers('org_a'), TIERS);
});

test("a submitted, approved or sent-back quote's actor is read before the save: a failed read refuses it, nothing written", async () => {
    const quotes = await load('quotes');
    const submit = { method: 'PUT', body: { id: 'q1', status: 'Pending Approval' } };
    is500(await run(quotes, 'quotes', submit, 'Admin', isCaller, quoteRows('Draft')), 'submit');
    // A save that tells nobody reads the caller for its audit row's name alone: it lands.
    const plain = await run(quotes, 'quotes', { method: 'PUT', body: { id: 'q1', notes: 'n' } }, 'Admin', isCaller, quoteRows('Draft'));
    assert.equal(plain.status, 200, JSON.stringify(plain.body));
    assert.equal(plain.wrote.includes('update quotes'), true, plain.wrote);
});

test('an account whose territory rules cannot be read is not stored with no territory', async () => {
    const accounts = await load('accounts');
    const first = () => { let n = 0; return (op) => SETTINGS_ROW(op) && n++ === 0; };
    const rows = { users: [ME], accounts: [{ id: 'a1', orgId: 'org_a', name: 'West', accountTier: 'account', ownerId: 'usr_me' }] };
    for (const [what, r] of [['single', { method: 'POST', body: { id: 'a9', name: 'West New' } }], ['bulk', { method: 'POST', body: [{ id: 'a9', name: 'West New' }] }], ['save', { method: 'PUT', body: { id: 'a1', name: 'West', phone: '5' } }]]) {
        is500(await run(accounts, 'accounts', r, 'Admin', first(), rows), what);
    }
});

test('territory rules that are read: applied, none when the org turned them off or stored none', async () => {
    const accounts = await load('accounts');
    const made = async (extra) => { await run(accounts, 'accounts', { method: 'POST', body: { id: 'a9', name: 'West New' } }, 'Admin', null, { users: [ME], settings: [{ orgId: 'org_a', extra }] }); return G.ops.find((o) => o.kind === 'insert' && o.table === 'accounts')?.given?.assignedTerritory ?? null; };
    const assignmentRules = [{ field: 'name', contains: 'west', territory: 'West' }];
    assert.equal(await made({ assignmentRules }), 'West');
    assert.equal(await made({ assignmentRules, featureFlags: { 'territory-rules': false } }), null);
    assert.equal(await made({}), null);
});

test("a lead is never scored by the default rules, or as having no activity, when the org's rules or its activities cannot be read", async () => {
    const leads = await load('leads'), activities = await load('activities');
    const LEAD = { id: 'l1', orgId: 'org_a', firstName: 'A', lastName: 'B', company: 'C', ownerId: 'usr_me', status: 'New' };
    const rows = { users: [ME], leads: [LEAD], activities: [] };
    const ACTS = (op) => op.kind === 'select' && op.table === 'activities' && !op.fields;
    for (const [what, r, fails] of [
        ['create', { method: 'POST', body: { id: 'l9', firstName: 'A', lastName: 'B' } }, SETTINGS_ROW],
        ['bulk', { method: 'POST', body: [{ id: 'l9', firstName: 'A', lastName: 'B' }] }, SETTINGS_ROW],
        ['save', { method: 'PUT', body: { id: 'l1', phone: '5' } }, SETTINGS_ROW],
        ['save, its activities', { method: 'PUT', body: { id: 'l1', phone: '5' } }, ACTS],
    ]) is500(await run(leads, 'leads', r, 'Admin', fails, rows), what);
    // The org's own rules, read: the lead scored by them, its activity counted — and not at all when scoring is off.
    const engagement = async (acts, extra) => { await run(leads, 'leads', { method: 'PUT', body: { id: 'l1', phone: '5' } }, 'Admin', null, { ...rows, activities: acts, settings: [{ orgId: 'org_a', extra }] }); return G.ops.find((o) => /insert|update/.test(o.kind) && o.table === 'leads')?.given; };
    const none = await engagement([], {}), one = await engagement([{ type: 'Meeting', date: new Date().toISOString().slice(0, 10) }], {});
    assert.ok(one.leadScoreEngagement > none.leadScoreEngagement, `${one.leadScoreEngagement} > ${none.leadScoreEngagement}`);
    // The activity itself has landed: it answers as made, edited or deleted, and its lead is not written — the org's rules
    // unread, its activities unread, or scoring off.
    const ACT = { id: 'x9', leadId: 'l1', ownerId: 'usr_me', type: 'Call', notes: 'n' };
    const press = { POST: [{ method: 'POST', body: ACT }, 201, 'insert activities'], PUT: [{ method: 'PUT', body: { ...ACT, notes: 'n2' } }, 200, 'insert activities'], DELETE: [{ method: 'DELETE', qs: { id: 'x9' } }, 200, 'delete activities'] };
    const ofLead = (op) => ACTS(op) && G.ops.some((o) => o.table === 'activities' && /insert|delete/.test(o.kind));   // the read that follows the write
    for (const [m, [r, status, wrote]] of Object.entries(press)) {
        for (const [what, fails, extra] of [['rules', SETTINGS_ROW, {}], ['activities', ofLead, {}], ['off', null, { leadScoring: { enabled: false } }], ['read', null, {}]]) {
            const x = await run(activities, 'activities', r, 'Admin', fails, { ...rows, activities: [ACT], settings: [{ orgId: 'org_a', extra }] });
            if (fails) assert.ok(x.hits > 0, `${m} ${what}`);
            assert.equal(x.status, status, `${m} ${what}: ${JSON.stringify(x.body)}`);
            assert.ok(x.wrote.includes(wrote), `${m} ${what}: ${x.wrote}`);
            assert.equal(/update leads/.test(x.wrote), what === 'read', `${m} ${what}: ${x.wrote}`);
        }
    }
});

test('the nightly lead scoring: an org whose rules cannot be read is left as it is and counted, the next org scored, the run a 500', async () => {
    const { scoreOrg } = await fn('score-leads-batch');
    const LEAD = { id: 'l1', orgId: 'org_a', firstName: 'A', lastName: 'B', email: 'a@test.local', status: 'New' };
    const orgs = (op) => Object.keys(op.fields || {}).join() === 'orgId';
    const OFF = [{ id: 's', extra: { leadScoring: { enabled: false } }, asRead: '{}' }];
    const rowsWith = (failAt) => { let n = 0; return (op) => {
        if (op.table === 'leads') return orgs(op) ? [{ orgId: 'org_1' }, { orgId: 'org_2' }, { orgId: 'org_3' }] : [LEAD];
        if (op.kind === 'select' && op.table === 'settings') { n++; if (n === failAt) down(); if (n === 3) return OFF; }   // the third org turned scoring off
        return [];
    }; };
    G.rows = rowsWith(1); G.ops = [];
    await assert.rejects(scoreOrg('org_1'), /lookup down/);
    assert.equal(G.ops.filter((o) => o.kind === 'update').length, 0, 'no lead scored');
    const handler = await load('score-leads-batch');
    const night = async (failAt) => { let res; await ask(async (e, c) => (res = await handler(e, c)), 'score-leads-batch', { method: 'POST', env: { JOBS_ENABLED: 'true' }, rows: rowsWith(failAt) }, 'Admin'); return { status: res.statusCode, body: JSON.parse(res.body), leads: G.ops.filter((o) => o.kind === 'update' && o.table === 'leads').length }; };
    const bad = await night(1);
    assert.equal(bad.status, 500, JSON.stringify(bad.body));
    assert.deepEqual([bad.body.ok, bad.body.orgsProcessed, bad.body.orgsFailed, bad.body.leadsUpdated, bad.leads], [false, 1, 1, 1, 1], 'the second org scored');
    const good = await night(0);
    assert.deepEqual([good.status, good.body.ok, good.body.orgsProcessed, good.body.orgsFailed, good.body.leadsUpdated, good.leads], [200, true, 2, 0, 2, 2]);
    // An org's activities that cannot be read are never none.
    G.ops = []; G.rows = (op) => (op.table === 'activities' ? down() : op.table === 'leads' ? [LEAD] : []);
    await assert.rejects(scoreOrg('org_1'), /lookup down/);
    assert.equal(G.ops.filter((o) => o.kind === 'update').length, 0);
});

test('the hourly quote reminders: an org that cannot be read is counted and left, the orgs after it reminded, the run a 500 (state §0.309)', async () => {
    const handler = await load('quote-reminders');
    const now = Date.now();
    // Two orgs, each with one quote waiting past its tier's SLA (15% — the defaults' 8 h tier), submitted 10 h ago; org_1's
    // second quote waits 1 h — not due.
    const Q = [{ id: 'q1', orgId: 'org_1' }, { id: 'q1b', orgId: 'org_1' }, { id: 'q2', orgId: 'org_2' }].map((q) => ({ ...q, status: 'Pending Approval', quoteNumber: q.id.toUpperCase(), version: 1, lineItems: [{ discountPct: 15 }], dealDiscount: 0 }));
    const rowsWith = (failAt, what) => { let n = 0; return (op) => {
        if (op.kind === 'select' && op.table === what) { n++; if (failAt === 'all' || n === failAt) down(); }
        if (op.table === 'quotes') return Q;
        if (op.table === 'audit_log' && op.kind === 'select') return Q.map((q) => ({ entityId: q.id, action: 'quote.submitted', timestamp: new Date(now - (q.id === 'q1b' ? 1 : 10) * 3600000) }));
        if (op.table === 'users') return [{ id: 'usr_m', name: 'Mo Manager', email: 'mo@test.local', role: 'Manager', active: true }];
        return [];
    }; };
    const hour = async (failAt, what = 'settings') => {
        let res;
        await ask(async (e, c) => (res = await handler(e, c)), 'quote-reminders', { method: 'POST', env: { JOBS_ENABLED: 'true' }, rows: rowsWith(failAt, what) }, 'Admin');
        const recorded = G.ops.filter((o) => o.kind === 'insert' && o.table === 'audit_log' && o.given?.action === 'quote.reminded').map((o) => o.given.entityId);
        return { status: res?.statusCode, body: JSON.parse(res?.body || '{}'), recorded };
    };
    for (const what of ['settings', 'audit_log', 'users', 'opportunities']) {
        const first = await hour(1, what);
        assert.equal(first.status, 500, `${what}: ${JSON.stringify(first.body)}`);
        assert.deepEqual([first.body.orgs, first.body.reminded, first.body.orgsFailed, first.recorded], [2, 1, 1, ['q2']], `${what}: the first org's read failed — the second reminded`);
        assert.equal(first.body.error, '1 org(s) could not be read — their quotes wait for the next hour', what);
        const second = await hour(2, what);
        assert.equal(second.status, 500, what);
        assert.deepEqual([second.body.reminded, second.body.orgsFailed, second.recorded, second.body.error], [1, 1, ['q1'], '1 org(s) could not be read — their quotes wait for the next hour'], `${what}: the second org's read failed — the first reminded`);
        const neither = await hour('all', what);
        assert.equal(neither.status, 500, what);
        assert.deepEqual([neither.body.orgs, neither.body.reminded, neither.body.orgsFailed, neither.recorded, neither.body.error], [2, 0, 2, [], '2 org(s) could not be read — their quotes wait for the next hour'], `${what}: both orgs failed — counted, each`);
    }
    const good = await hour(0);
    assert.equal(good.status, 200, JSON.stringify(good.body));
    // Every count, as the run kept it (the engine sends no email: each send refused, none counted).
    assert.deepEqual(good.body, { orgs: 2, waiting: 3, reminded: 2, emails: 0, notDue: 1, orgsFailed: 0 });
    assert.deepEqual(good.recorded, ['q1', 'q2']);
});

test('the report deliveries: a report that cannot be run is counted, the reports after it sent, the run a 500; one its own setup refuses is its error, the run a 200 (state §0.309)', async () => {
    const handler = await load('report-deliveries');
    // The job reads its own clock: a schedule due now, in a zone where now is far from midnight (a schedule's window does not
    // wrap the day — at 23:59 UTC a run a moment later would find it not due).
    const t = new Date(), timezone = t.getUTCHours() >= 2 && t.getUTCHours() <= 21 ? 'UTC' : 'Asia/Tokyo';
    const { hour, minute } = (await import(new URL('src/utils/reportDelivery.js', ROOT).href)).localClock(t, timezone);
    const delivery = { enabled: true, cadence: 'daily', hour, minute, timezone, emailTo: ['usr_o'] };
    const R = ['r1', 'r2'].map((id, i) => ({ id, orgId: 'org_' + (i + 1), ownerId: 'user_o', name: id, source: 'Opportunities', dims: [{ id: 'owner' }], metrics: [{ id: 'deals' }], filters: {}, config: { delivery } }));
    const OWNER = { id: 'usr_o', clerkUserId: 'user_o', role: 'Admin', name: 'Owner', email: 'o@test.local', active: true };
    const run = async (failAt, what) => {
        let n = 0, res;
        await ask(async (e, c) => (res = await handler(e, c)), 'report-deliveries', { method: 'POST', env: { JOBS_ENABLED: 'true' }, rows: (op) => {
            const hit = what === 'stamp' ? op.kind === 'update' && op.table === 'saved_reports' : op.kind === 'select' && op.table === what;
            if (hit) { n++; if (failAt === 'all' || n === failAt) down(); }
            if (op.kind === 'select' && op.table === 'saved_reports') return R;
            return op.table === 'users' ? [OWNER] : [];
        } }, 'Admin');
        const body = JSON.parse(res.body);
        delete body.at;
        return { status: res.statusCode, body, stamped: G.ops.filter((o) => o.kind === 'update' && o.table === 'saved_reports').length, audited: G.ops.filter((o) => o.kind === 'insert' && o.table === 'audit_log').length };
    };
    // Each report: its owner, then its recipients, read from users; its data from the four record tables and settings.
    // users: #1 the first report's owner, #2 its recipients, #3 the second's owner (#4 its recipients).
    for (const [failAt, what, stamped] of [[1, 'users', 1], [2, 'users', 1], [3, 'users', 1], [4, 'users', 1], [1, 'opportunities', 1], [1, 'settings', 1], ['all', 'users', 0]]) {
        const x = await run(failAt, what);
        const threw = 2 - stamped;
        assert.equal(x.status, 500, failAt + ' ' + what + ': ' + JSON.stringify(x.body));
        assert.deepEqual(x.body, { reports: 2, due: 2, sent: 0, failed: 2, threw, error: threw + ' report(s) could not be read, run or stamped' }, failAt + ' ' + what);
        assert.deepEqual([x.stamped, x.audited], [stamped, stamped], failAt + ' ' + what + ': the other report ran, was stamped and logged');
    }
    // A stamp that cannot be written: that report counted, the next stamped and logged.
    const unstamped = await run(1, 'stamp');
    assert.equal(unstamped.status, 500);
    assert.deepEqual([unstamped.body, unstamped.stamped, unstamped.audited], [{ reports: 2, due: 2, sent: 0, failed: 2, threw: 1, error: '1 report(s) could not be read, run or stamped' }, 2, 1]);
    // Nothing failed: the run is fine — each send refused is the schedule's own error, stamped and logged.
    const fine = await run(0, 'users');
    assert.deepEqual([fine.status, fine.body, fine.stamped, fine.audited], [200, { reports: 2, due: 2, sent: 0, failed: 2, threw: 0 }, 2, 2]);
});

test('rules an Admin changed while the model trained, and that cannot be read again, are never the replaced ones', async () => {
    const { scoreOrg } = await fn('score-leads-batch');
    const decided = Array.from({ length: 24 }, (_, i) => ({ id: 'l' + i, orgId: 'org_a', firstName: 'A', lastName: 'B', email: i % 2 ? 'a@test.local' : '', company: i % 3 ? 'C' : '', status: i % 2 ? 'Converted' : 'Dead', source: i % 2 ? 'Web' : 'Event' }));
    const cfg = { predictive: { enabled: true, minClosedRecords: 1 } };
    const train = async (again, opts) => {
        let reads = 0;
        G.ops = [];
        // The write lands on nothing: the rules moved. The second read is the one that says to what.
        G.rows = (op) => (op.table === 'leads' && op.kind === 'select' ? decided : op.table === 'settings' && op.kind === 'select' ? (reads++ ? again() : [{ id: 's', extra: { leadScoring: cfg }, asRead: '{}' }]) : []);
        const r = await scoreOrg('org_a', opts);
        return [r, G.ops.filter((o) => o.kind === 'update' && o.table === 'leads').length, reads];
    };
    for (const opts of [{}, { force: true }]) {   // the night's, and an Admin's Train now
        const [r, scored, reads] = await train(() => [{ extra: { leadScoring: { enabled: false } } }], opts);
        assert.deepEqual([r.reason, r.modelTrained, scored, reads], ['config-changed', false, 0, 2], 'read again: scoring turned off, no lead scored');
        await assert.rejects(train(down, opts), /lookup down/);
        assert.equal(G.ops.filter((o) => o.kind === 'update' && o.table === 'leads').length, 0, 'no lead scored by the replaced rules');
    }
});

test('a recommendation whose outcome cannot be read stays pending; read and not acted on it is ignored', async () => {
    const { judgePending } = await fn('recommendation-log');
    const now = new Date('2026-11-23T12:00:00Z');
    const LOG = { id: 'r1', orgId: 'org_a', repName: 'Me Rep', actionType: 'stuck', opportunityId: 'd1', dismissedAt: new Date('2026-11-18T12:00:00Z') };
    const judge = async (deal) => { G.ops = []; G.rows = (op) => (op.table === 'recommendation_log' && op.kind === 'select' ? [LOG] : op.table === 'opportunities' ? deal() : []); return [await judgePending('org_a', null, now), written()]; };
    await assert.rejects(judge(down), /1 of 1 recommendations could not be judged: TEST lookup down/);
    assert.equal(written(), '', 'nothing written');
    assert.deepEqual(await judge(() => [{ stageChangedDate: '2026-11-01' }]), [[{ id: 'r1', outcome: 'ignored' }], 'update recommendation_log']);
    assert.deepEqual(await judge(() => [{ stageChangedDate: '2026-11-22' }]), [[{ id: 'r1', outcome: 'resolved' }], 'update recommendation_log']);
    // One that fails leaves the rest judged and kept, and is said: the request a 500, the night's pass counted.
    let n = 0;
    G.ops = []; G.rows = (op) => (op.table === 'recommendation_log' && op.kind === 'select' ? [LOG, { ...LOG, id: 'r2' }] : op.table === 'opportunities' ? (n++ ? [{ stageChangedDate: '2026-11-22' }] : down()) : []);
    await assert.rejects(judgePending('org_a', null, now), /1 of 2 recommendations/);
    assert.equal(written(), 'update recommendation_log', 'the other is kept');
    // Every kind's every read.
    for (const actionType of ['stale', 'stuck', 'lapsed', 'coverage', 'velocity', 'next_step', 'scoreDrop', 'task']) {
        const log = { ...LOG, actionType, dismissedAt: new Date('2026-11-01T12:00:00Z') };
        const reads = async (failAt) => { let k = 0; G.ops = []; G.rows = (op) => { if (op.kind !== 'select') return []; if (op.table === 'recommendation_log') return [log]; if (k++ === failAt) down(); return []; }; const out = await judgePending('org_a', null, now).then((v) => v, (e) => e.message); return [out, k]; };
        const [out, count] = await reads(-1);
        assert.deepEqual(out, [{ id: 'r1', outcome: 'ignored' }], actionType);
        assert.ok(count >= 1, actionType);
        for (let k = 0; k < count; k++) { const [failed] = await reads(k); assert.match(String(failed), /1 of 1 recommendations/, `${actionType}, read ${k + 1}`); assert.equal(written(), '', actionType); }
    }
    // A verdict that could not be kept is not answered as kept; a row not yet due is none.
    G.rows = (op) => (op.table === 'recommendation_log' ? (op.kind === 'select' ? [LOG] : down()) : [{ stageChangedDate: '2026-11-22' }]);
    await assert.rejects(judgePending('org_a', null, now), /1 of 1 recommendations/);
    G.rows = (op) => (op.table === 'recommendation_log' ? [{ ...LOG, dismissedAt: new Date('2026-11-23T11:00:00Z') }] : []);
    assert.deepEqual(await judgePending('org_a', null, now), []);
});

test("a first sign-in: a link that does not land is a 500 — unless the identity's own row is there by now; a roster read that fails is never 'no profile'", async () => {
    const { ensureRosterRow } = lib;
    G.rows = down;
    await assert.rejects(ensureRosterRow({ clerkUserId: 'user_me', orgId: 'org_a', clerkUser: { emailAddresses: [] } }), /lookup down/);
    const users = await load('users');
    const r = { method: 'GET', qs: { me: 'true' } };
    is500(await run(users, 'users', r, 'User', (op) => op.kind === 'select' && op.table === 'users', {}), 'the first lookup');
    // The Clerk identity is read, no row holds it, and an invited row holds its address: the link is written.
    const INVITED = { id: 'usr_inv', orgId: 'org_a', name: 'Invited', email: 'new@test.local', clerkUserId: null, role: 'User', active: false, profile: { status: 'Invited' } };
    const THEIRS = { ...INVITED, id: 'usr_sync', clerkUserId: 'user_me' };
    const signIn = async (after, link) => {
        let selects = 0, res;
        G.clerkUser = { id: 'user_me', emailAddresses: [{ emailAddress: 'new@test.local' }] };
        const rows = (op) => {
            if (op.kind === 'update') return link();
            if (op.table !== 'users') return [];
            return [[], [INVITED]][selects++] || after();
        };
        try { await ask(async (e, c) => (res = await users(e, c)), 'users', { ...r, rows }, 'User'); } finally { delete G.clerkUser; }
        return { status: res.statusCode, body: JSON.parse(res.body) };
    };
    const landed = await signIn(() => [], () => [{ ...INVITED, clerkUserId: 'user_me', active: true }]);
    assert.deepEqual([landed.status, landed.body.user.id, landed.body.user.clerkUserId], [200, 'usr_inv', 'user_me']);
    const meanwhile = await signIn(() => [THEIRS], down);
    assert.deepEqual([meanwhile.status, meanwhile.body.user.id], [200, 'usr_sync'], "the identity's own row, made meanwhile");
    const off = await signIn(() => [{ ...THEIRS, active: false, profile: { status: 'Deactivated' } }], down);
    assert.deepEqual([off.status, off.body.code], [403, 'deactivated'], 'their own row, turned off');
    assert.equal((await signIn(() => [], down)).status, 500, 'not landed');
    assert.equal((await signIn(down, down)).status, 500, 'and not known');
    // Nothing matched: the row is made; a roster read that fails on the way is a 500, never a profile of none.
    let n = 0;
    G.clerkUser = { id: 'user_me', emailAddresses: [{ emailAddress: 'none@test.local' }] };
    try { assert.equal((await run(users, 'users', r, 'User', (op) => op.kind === 'select' && op.table === 'users' && ++n > 2, {})).status, 500); } finally { delete G.clerkUser; }
    assert.ok(n > 2);
    // Each of the provisioning's own reads, one at a time: the row by Clerk id, by email, the names, and the row a racing
    // request made when the insert gave way. None is taken for "no such row".
    const clerkUser = { emailAddresses: [{ emailAddress: 'none@test.local' }] };
    const provision = async (failAt, clerk = clerkUser) => { let k = 0; G.ops = []; G.rows = (op) => { if (op.kind !== 'select' || op.table !== 'users') return []; if (++k === failAt) down(); return []; }; const out = await ensureRosterRow({ clerkUserId: 'user_me', orgId: 'org_a', clerkUser: clerk }).then((v) => v, (e) => e.message); return [out, written(), k]; };
    assert.deepEqual(await provision(0), [null, 'insert users', 4], 'four reads, the insert having given way');
    for (const [k, wrote] of [[1, ''], [2, ''], [3, ''], [4, 'insert users']]) assert.deepEqual((await provision(k)).slice(0, 2), ['TEST lookup down', wrote], `read ${k}`);
    // Clerk unreadable: no row is made of nothing read.
    G.clerkUser = { then: (_, no) => no(new Error('Clerk down')) };
    try { assert.deepEqual((await provision(0, null)).slice(0, 2), [null, '']); } finally { delete G.clerkUser; }
});

test("a win chance that could not be worked out just now is said so — never last night's, explained and kept as the one that stands", async () => {
    const { rescoreDeals } = await fn('_dealScore');
    const ai = await load('ai-score');
    const deal = { ...DEAL, opportunityName: 'D', arr: '100', dealScore: { score: 62, status: 'Healthy' } };
    const rows = { opportunities: [deal], users: [ME], activities: [], settings: [{ orgId: 'org_a', extra: { aiScoringEnabled: true, anthropicApiKey: await ownKey('test') } }] };
    const env = { SETTINGS_ENCRYPTION_KEY: 'failed-reads' };
    const x = await run(ai, 'ai-score', { method: 'POST', body: { opportunityId: 'd1' }, env }, 'Admin', (op) => op.kind === 'select' && op.table === 'activities', rows);
    assert.ok(x.hits > 0);
    assert.deepEqual([x.status, x.body.code, x.wrote], [503, 'no_win_chance', ''], JSON.stringify(x.body));
    // A save that has landed still never fails for its score.
    G.rows = down;
    assert.deepEqual(await rescoreDeals('org_a', ['d1']), {});
    await assert.rejects(rescoreDeals('org_a', ['d1'], { orThrow: true }), /lookup down/);
});

test('a deal made by its own rep tells them nothing, by owner id; made for another it does; its maker unread stores nothing', async () => {
    const src = sourceOf('opportunities');
    const line = src.match(/await maybeEmail\(inserted, creatorId, 'opportunityCreated', \{/g) || [];
    assert.equal(line.length, 1);
    // Run (mailsOwner, state §0.304): a deal with no owner tells no one — by name it told the member it named (reversed by design).
    assert.deepEqual([mailsOwner({ salesRep: 'Me', ownerId: 'usr_me' }, 'usr_me'), mailsOwner({ salesRep: 'Other', ownerId: 'usr_o' }, 'usr_me'), mailsOwner({ salesRep: 'Other', ownerId: null }, null), mailsOwner({ salesRep: null, ownerId: null }, 'usr_me')], [false, true, false, false]);
    const deals = await load('opportunities');
    const x = await run(deals, 'opportunities', { method: 'POST', body: { id: 'd9', opportunityName: 'N', account: 'A', stage: 'Proposal', salesRep: 'Me Rep' } }, 'User', isCaller, { users: [ME], accounts: [{ id: 'a1', orgId: 'org_a', name: 'A' }] });
    is500(x, 'the maker unread');
});

test("the app's profile load: asked once more after a failure, then said — never a silent 'no profile'; a turned-off member never asked again", async () => {
    const { readMyProfile } = await import(new URL('src/utils/myProfileLoad.js', ROOT).href);
    const answer = (status, body) => ({ ok: status < 400, status, json: async () => { if (body === undefined) throw new SyntaxError('<'); return body; } });
    const go = async (...answers) => { let asked = 0; const out = await readMyProfile(async () => { const a = answers[asked++]; if (a instanceof Error) throw a; return a; }).then((v) => v, (e) => e.message); return [out, asked]; };
    const user = { user: { id: 'usr_me' } };
    assert.deepEqual(await go(answer(200, user)), [user, 1]);
    assert.deepEqual(await go(answer(500, { error: 'Internal server error', requestId: 'r' }), answer(200, user)), [user, 2]);
    assert.deepEqual(await go(new TypeError('Failed to fetch'), answer(200, user)), [user, 2]);
    assert.deepEqual(await go(answer(500, { error: 'Internal server error', requestId: 'r' }), answer(500, { error: 'Internal server error', requestId: 'r2' })), ['Internal server error (ref r2)', 2]);
    assert.deepEqual(await go(answer(502), answer(502)), ['The server returned 502.', 2]);
    assert.deepEqual(await go(answer(200), answer(200, user)), [user, 2], 'a 200 that cannot be read is asked again');
    const off = answer(500, { error: 'x', code: 'deactivated' });
    assert.deepEqual(await go(off, off), ['x', 2], 'a refusal alone turns a member off');
    const { failureWords } = await import(new URL('src/utils/refusalWords.js', ROOT).href);
    const words = async (a) => failureWords(await readMyProfile(async () => { if (a instanceof Error) throw a; return a; }).catch((e) => e));
    assert.deepEqual([await words(answer(500, { error: 'Internal server error' })), await words(new TypeError('Failed to fetch'))], ['Internal server error', 'The server could not be reached.']);
    // Another load on screen by then: not asked again (it would ask for that org), nothing answered.
    let n = 0;
    assert.equal(await readMyProfile(async () => { n++; return answer(500, {}); }, () => false), null);
    assert.equal(n, 1);
    assert.deepEqual(await go(answer(403, { error: 'x', code: 'deactivated' })), [{ deactivated: true }, 1]);
    assert.deepEqual(await go(answer(403, { error: 'Not a member.' }), answer(403, { error: 'Not a member.' })), ['Not a member.', 2]);
    const app = readFileSync(new URL('src/App.jsx', ROOT), 'utf8').split('\r\n').join('\n');
    // Reversed in §0.296: no notice of its own — the load reports as a list's does, and the banner and what waits say it
    // (tests/list-loads.test.mjs RUNS it: its count, its org, its words).
    assert.ok(app.includes("return readMyProfile(() => dbFetch('/.netlify/functions/users?me=true'), meStill)\n            .then(data => {\n                if (!stillOrg(meOrgId)) return;\n"));
    const auth = async (a) => readMyProfile(async () => a).catch((e) => !!e.auth);
    assert.deepEqual([await auth(answer(401, {})), await auth(answer(403, { error: 'x' })), await auth(answer(500, {}))], [true, true, false], 'a refused sign-in is said as one');
});

test("the web form: an org that cannot be read is 'something went wrong', never a form turned off", async () => {
    const intake = await load('lead-intake');
    const ask1 = (fails) => run(intake, 'lead-intake', { method: 'GET', qs: { t: 'wf_failedreads0123456789abcdef' } }, null, fails, { settings: [] });
    const bad = await ask1((op) => op.table === 'settings');
    assert.equal(bad.status, 500);
    assert.match(String(bad.body), /Something went wrong/);
    assert.match(bad.type, /text\/html/);
    const post = await run(intake, 'lead-intake', { method: 'POST', qs: { t: 'wf_failedreads0123456789abcdef' }, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'lastName=A' }, null, (op) => op.table === 'settings', { settings: [] });
    assert.deepEqual([post.status, /Something went wrong/.test(String(post.body)), /text\/html/.test(post.type)], [500, true, true], 'a submission too');
    const off = await ask1(null);
    assert.equal(off.status, 404);
    assert.match(String(off.body), /This form is not available/);
});
