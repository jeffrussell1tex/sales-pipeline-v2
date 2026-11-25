// tests/row-matrix.test.mjs
// What a 200 holds, run (state §0.298; guide §18b141; OPEN_ITEMS §4.6, §0.288 (j)). The gate matrix pins who is refused;
// no unit test ran the GETs and read which rows, and which of their fields, each role is answered — some filters, masks and
// orgs were pinned as text; with others left out (documents' canSee, the lead requests', jobs', activities', tasks' or leads'
// filter, the inactive products, the settings key hint) every unit test passed. Every function of netlify/functions runs here for real, as
// every role, on the gate matrix's engine (no database, no network), and
//   1. every statement the requests reach is drizzle's own SQL, read: each table of an org's rows it reads, changes or
//      deletes is held to the caller's org (tests/gates/sqlOrg.mjs), each row it stores, and each org it sets, is the
//      caller's — or it is named. A statement no request reaches is counted by its file (UNREACHED), which only falls, and
//      every db or tx read, update and delete chain in the source compares an org in its own where or join (read as text:
//      not whose table's, nor inside what; a db.execute is not read), or is named;
//   2. every GET is answered over three rows of each table — the caller's, another member's, nobody's (the settings one, the
//      audit log and the SPIFF claims four) — or, where a request names its own (EXTRA), over those; and which of them
//      come back, the fields one role is not answered that an Admin is, and the statements' own conditions are the ones
//      written in tests/gates/rows.mjs, with the fields each list has and what is answered beside the lists. What a GET
//      answers of a planted secret is none, whoever asks.
// Not read here: what a condition answers on a real database (the integration suites), most answers of a write, a sign-in's
// masks (auth.mjs), a scheduled job past its off switch, calendar-oauth-callback's own client (its raw statements:
// org-scoping reads its updates), the SQL of a statement no request reaches (UNREACHED: its own text is held by the scan).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, ROLES, ask, functionFiles, load, shapesOf, sourceOf } from './gates/engine.mjs';
import { orgGaps } from './gates/sqlOrg.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { parse } from '@babel/parser';
import { ROWS, UNREACHED } from './gates/rows.mjs';

const REQUESTS = {};
for (const n of ['crm', 'sales', 'quotes', 'dispatch', 'people', 'rest']) Object.assign(REQUESTS, (await import(`./gates/requests-${n}.mjs`)).REQUESTS);
const G = globalThis.__gates;
G.sql = true;
const schema = await import(new URL('db/schema.ts', ROOT).href);
const NAME = Symbol.for('drizzle:Name'), COLS = Symbol.for('drizzle:Columns');
const TABLES = Object.fromEntries(Object.values(schema).filter((t) => t && t[NAME]).map((t) => [t[NAME], t[COLS]]));
const TENANTS = new Set(Object.keys(TABLES).filter((n) => Object.values(TABLES[n]).some((c) => c.name === 'org_id')));

// ── The rows: of every table the caller's, another member's and nobody's ─────────────────────────────────────────────
const WHO = { mine: ['usr_me', 'Me Rep', 'user_me'], theirs: ['usr_other', 'Other Rep', 'user_other'], none: [null, '', null] };
const LINK = { opportunityId: 'opportunities', accountId: 'accounts', contactId: 'contacts', leadId: 'leads', customerId: 'dispatch_customers', jobId: 'dispatch_jobs', documentId: 'documents', quoteId: 'quotes', locationId: 'dispatch_service_locations', techId: 'dispatch_technicians', assignedTechId: 'dispatch_technicians', planId: 'dispatch_service_plans', servicePlanId: 'dispatch_service_plans', vehicleId: 'dispatch_vehicles' };
const valueOf = (table, k, c, who) => {
    const [id, name, clerk] = WHO[who];
    if (k === 'id') return table === 'users' ? { mine: 'usr_me', theirs: 'usr_other', none: 'usr_none' }[who] : `${table}:${who}`;
    if (k === 'orgId') return 'org_a';
    if (k === 'requesterId' && !id) return 'usr_none';   // NOT NULL
    if (/^(ownerId|requesterId|authorId|byId)$/.test(k)) return table === 'saved_reports' || table === 'documents' ? clerk : id;   // the two whose owner is a Clerk id
    if (/^(salesRep|assignedTo|assignedRep|accountOwner|author|repName|ownerName|createdBy|changedBy|byName|authorName)$/.test(k)) return name;
    if (k === 'clerkUserId' || k === 'userId') return clerk;
    if (k === 'visibilityKind') return who === 'none' ? 'team' : 'private';
    if (LINK[k]) return `${LINK[k]}:${who}`;
    if (/^(contactIds|coTechIds|visibilityUserIds|recipientIds|readBy)$/.test(k)) return [];
    if (/Boolean/.test(c.columnType)) return k === 'active';
    if (/Integer|Numeric|Double|Real/.test(c.columnType)) return 1;
    if (/Timestamp/.test(c.columnType)) return new Date('2026-11-01T12:00:00Z');
    if (/Jsonb?$/.test(c.columnType)) return Array.isArray(c.default) ? [] : {};
    if (/[dD]ate$/.test(k)) return '2026-11-01';
    if (/^(secret|keyHash|encryptedRefreshToken)$/.test(k)) return `${table}.${k} ${who} PLANTED`;
    if (k === 'email') return `${who}@itest.invalid`;
    if (k === 'name') return `${table} ${who}`;
    return k;
};
const PLANTED = 'PLANTED';   // what no answer holds: a stored key, hash or token
const SEED = {};
for (const [n, cols] of Object.entries(TABLES)) SEED[n] = Object.keys(WHO).map((w) => Object.fromEntries(Object.entries(cols).map(([k, c]) => [k, valueOf(n, k, c, w)])));
SEED.users = SEED.users.map((u, i) => ({ ...u, name: ['Me Rep', 'Other Rep', 'No One'][i], clerkUserId: ['user_me', 'user_other', 'user_none'][i], role: 'User' }));
SEED.coaching_notes = SEED.coaching_notes.map((n) => ({ ...n, teamId: null }));
SEED.audit_log = [...SEED.audit_log, { ...SEED.audit_log[0], id: 'audit_log:note', entityType: 'coaching_note', detail: 'the note' }];
SEED.audit_log = SEED.audit_log.map((a, i) => ({ ...a, entityType: i < 3 ? 'quote' : a.entityType, action: i < 3 ? 'quote.approved' : a.action, entityId: i < 3 ? `quotes:${Object.keys(WHO)[i]}` : a.entityId }));
SEED.spiff_claims = [...SEED.spiff_claims, { ...SEED.spiff_claims[0], id: 'spiff_claims:by-name', opportunityId: 'opportunities:theirs' }];   // their own, on a deal they may not read
SEED.saved_reports = SEED.saved_reports.map((r) => ({ ...r, isShared: true, config: { delivery: { enabled: true, cadence: 'daily', emailTo: ['usr_other'], lastError: 'email to other@itest.invalid: refused' } } }));
process.env.SETTINGS_ENCRYPTION_KEY = 'row-matrix';
const { encrypt } = await import(new URL('netlify/functions/crypto.mjs', ROOT).href);
SEED.settings = [{
    id: 'org_a', orgId: 'org_a', updatedAt: new Date('2026-11-01T12:00:00Z'), companyName: 'A', fiscalYearStart: 1, quotaData: {}, verticals: [],
    extra: {
        dispatchEnabled: true, repsCanUseDispatch: true, slackConfig: { webhookUrl: 'https://hooks.slack.com/services/x', channel: '#x' }, integrationRequests: { hubspot: { byUserId: 'user_me', note: 'n' } },
        anthropicApiKey: encrypt('sk-ant-row-matrix-0123456789'), aiSettings: { model: 'claude-opus-5-5', byokKey: `sk-ant-${PLANTED}` }, dealModel: { n: 1 },
    },
}];

const withExtra = (extra) => ({ ...SEED, settings: [{ ...SEED.settings[0], extra: { ...SEED.settings[0].extra, ...extra } }] });
// What a GET's answer turns on beside its role: a Manager's named reps, an org's switches, a caller with no row in the org.
const NARROW = [{ label: 'a Manager who manages Other Rep', managedReps: ['Other Rep'] }], NO_ROW = { label: 'a caller with no row here', rows: { ...SEED, users: [] } };
const UNASSIGNED = [{ label: 'unassigned deals shown to reps', rows: withExtra({ unassignedDealsVisibleToReps: true }) }];
const CLOSED = { label: 'reps may not use Dispatch', rows: withExtra({ repsCanUseDispatch: false }) };
const EXTRA = {
    opportunities: [...NARROW, ...UNASSIGNED, NO_ROW], quotes: [...NARROW, ...UNASSIGNED, NO_ROW, ...['mine', 'theirs'].flatMap((w) => [{ label: `of the deal ${w}`, qs: { opportunityId: `opportunities:${w}` } }, { label: `the history of the quote ${w}`, qs: { activity: 'true', quoteId: `quotes:${w}` }, rows: { ...SEED, quotes: SEED.quotes.filter((q) => q.id === `quotes:${w}`) } }])], 'spiff-claims': [...NARROW, ...UNASSIGNED, NO_ROW],
    leads: [{ label: 'unassigned leads hidden from reps', rows: withExtra({ unassignedLeadsVisibleToReps: false }) }, NO_ROW],
    accounts: [...NARROW, NO_ROW], contacts: [...NARROW, NO_ROW], tasks: [...NARROW, NO_ROW], activities: [...NARROW, NO_ROW], 'coaching-notes': [NO_ROW], 'lead-requests': [NO_ROW], documents: [NO_ROW], 'recommendation-log': [NO_ROW],
    ...Object.fromEntries(['dispatch-jobs', 'dispatch-customers', 'dispatch-technicians', 'dispatch-schedule-blocks', 'dispatch-service-plans', 'dispatch-plan-visits', 'dispatch-equipment', 'dispatch-vehicles', 'invoices']
        .map((f) => [f, [CLOSED, { label: 'a technician with no row here', rows: { ...SEED, dispatch_technicians: [] } }]])),
};
EXTRA['dispatch-jobs'].push(...['mine', 'theirs'].flatMap((w) => ['lineitems', 'history'].map((resource) => ({ label: `${resource} of the job ${w}`, qs: { resource, jobId: `dispatch_jobs:${w}` }, rows: { ...SEED, dispatch_jobs: SEED.dispatch_jobs.filter((j) => j.id === `dispatch_jobs:${w}`) } }))));
EXTRA.documents.push({ label: 'a version of a document', qs: { action: 'download', id: 'documents:mine', v: '1' } });
EXTRA['dispatch-jobs'].push(...['mine', 'theirs'].map((w) => ({ label: `the job ${w}`, qs: { id: `dispatch_jobs:${w}` }, rows: { ...SEED, dispatch_jobs: SEED.dispatch_jobs.filter((j) => j.id === `dispatch_jobs:${w}`) } })));
EXTRA.documents.push(...['download', 'versions'].flatMap((action) => ['theirs', 'none'].map((w) => ({ label: `${action} of the document ${w}`, qs: { action, id: `documents:${w}` }, rows: { ...SEED, documents: SEED.documents.filter((d) => d.id === `documents:${w}`) } }))), { label: 'a kind of record and its id', qs: { linkedTo: 'accounts:mine', type: 'account' } });
EXTRA.invoices.push({ label: 'of a job', qs: { jobId: 'dispatch_jobs:mine' } });
EXTRA['dispatch-customers'].push({ label: 'a customer\'s locations', qs: { resource: 'locations', customerId: 'dispatch_customers:mine' } });
EXTRA.duplicates = [{ label: 'a contact typed', qs: { mode: 'create', entityType: 'contact', email: 'theirs@itest.invalid' } }, { label: 'an account typed', qs: { mode: 'create', entityType: 'account', name: 'accounts theirs' } }, { label: 'a lead typed', qs: { mode: 'create', entityType: 'lead', email: 'theirs@itest.invalid' } }];
// A key's answers and the customer's status page, which no role asks.
const KEY = { headers: { authorization: 'Bearer spt_live_' + 'a1'.repeat(32) } };
EXTRA['public-api'] = ['opportunities', 'accounts', 'contacts', 'activities', 'leads', 'tasks'].map((resource) => ({ ...KEY, method: 'GET', label: `an API key: ${resource}`, qs: { resource }, rows: (op) => (op.table === 'api_keys' ? [{ id: `key ${resource}`, orgId: 'org_a', revokedAt: null }] : op.fields?.total ? [{ total: 3 }] : SEED[op.table] || []) }));
EXTRA['dispatch-status'] = [{ method: 'GET', label: "the customer's page", qs: { t: 'a'.repeat(64) }, rows: { ...SEED, dispatch_jobs: [{ ...SEED.dispatch_jobs[0], publicToken: 'a'.repeat(64), status: 'scheduled' }] } }];
EXTRA['quote-to-job'] = ['mine', 'theirs'].map((w) => ({ label: `the job of the quote ${w}`, qs: { quoteId: `quotes:${w}` }, rows: { ...SEED, quotes: SEED.quotes.filter((q) => q.id === `quotes:${w}`), opportunities: SEED.opportunities.filter((d) => d.id === `opportunities:${w}`) } }));

// ── 1. Every statement names its org ─────────────────────────────────────────────────────────────────────────────────
// Where a statement finds its org by something else: [function, the gap, what its text holds, why].
const OTHERWISE = [
    ['dispatch-status', 'dispatch_jobs', '"public_token" = $1', "the customer's status page: the job's own token names the job, and its org"],
    ['documents', 'documents', 'select "id" from "documents" where "documents"."id" = $1', 'a new id held by any org is refused before its file is stored; the answer says only that it is taken'],
    ['email-inbound', 'users', '"users"."id" = $1', "a member's own signed address names them, and their org"],
    ['lead-intake', 'settings', "->'webToLead'->>'token' = $1", "the company's web form: its own token names the org"],
    ['public-api', 'api_keys', '"key_hash" = $1', 'an API key names its org'],
];
const everyRequest = (f) => [...['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((method) => ({ method })), ...(REQUESTS[f] || []), ...shapesOf(sourceOf(f)), ...(EXTRA[f] || []).map((r) => ({ method: 'GET', ...r }))];

test('THE GUARD: every statement a function makes, as any role, is held to the caller\'s org — drizzle\'s own SQL, read; each row it stores is the caller\'s org\'s; or it is named', async () => {
    G.sites = new Set();
    let read = 0; const loose = new Map(), used = new Set(), stored = new Set();
    for (const f of functionFiles()) {
        const handler = await load(f);
        if (!handler) continue;
        for (const r of everyRequest(f)) for (const rows of r.rows ? [r.rows, SEED] : [undefined, SEED]) for (const role of ROLES) {
            await ask(handler, f, { ...r, rows }, role);
            for (const op of G.ops) {
                if (!op.sql) continue;
                assert.equal(op.unread, undefined, `${f}: a statement the builder could not make: ${op.unread}`);
                let q;
                try { q = op.sql(); } catch (e) { if (/Invalid time value/.test(e.message)) continue; throw e; }   // a day the request made up
                assert.ok(q, `${f}: a ${op.kind} with no SQL`);
                read++;
                const gaps = orgGaps(q.text, q.params, TENANTS, 'org_a');
                if (op.kind === 'insert' && TENANTS.has(op.table)) {
                    const given = [].concat(op.given || []);
                    stored.add(`${f} ${op.table}`);
                    if (!given.length || given.some((x) => x?.orgId !== 'org_a')) gaps.push(`${op.table} (stored)`);
                }
                for (const gap of gaps) {
                    const i = OTHERWISE.findIndex(([fn, g, holds]) => fn === f && g === gap && q.text.includes(holds));
                    if (i >= 0) { used.add(i); continue; }
                    const key = `${f} — ${gap}: ${q.text.slice(0, 260)}`;
                    if (!loose.has(key)) loose.set(key, `${r.method}${r.what || r.label ? ` (${r.what || r.label})` : ''} as ${role}`);
                }
            }
        }
    }
    assert.deepEqual([...loose].map(([k, who]) => `${k}\n      asked by ${who}`), [], "REGRESSION: a statement that is not held to the caller's org — read, changed or deleted, any org's rows");
    OTHERWISE.forEach(([fn, g, , why], i) => { assert.ok(used.has(i), `${fn} ${g}: named as finding its org otherwise, and nothing does — take it out`); assert.ok(why.length > 20); });
    assert.ok(read >= 55000, `the statements read (${read}) — fewer means the engine lost its SQL`);
    assert.ok(stored.size >= 75, `the inserts read (${stored.size})`);
    // What no request reached, by file: a count that only falls — a new statement is asked by a request (tests/gates/requests-*.mjs).
    const unreached = {};
    for (const [file, line] of statementSites()) if (!G.sites.has(`${file}:${line}`)) unreached[file] = (unreached[file] || 0) + 1;
    G.sites = null;
    if (process.env.ROWS_OUT) (await import('node:fs')).writeFileSync(process.env.ROWS_OUT + '.unreached', JSON.stringify(unreached));
    const more = Object.entries(unreached).filter(([f, n]) => n > (UNREACHED[f] || 0)).map(([f, n]) => `${f}: ${n}, ${UNREACHED[f] || 0} written`);
    assert.deepEqual(more, [], 'a statement no request of the gate matrix reaches: add one that does');
    assert.deepEqual(Object.entries(UNREACHED).filter(([f, n]) => (unreached[f] || 0) < n).map(([f, n]) => `${f}: ${unreached[f] || 0}, ${n} written`), [], 'reached now: bring the number down');
});

// Every db statement in the functions, where it stands: [file, line].
function statementSites() {
    const out = [];
    for (const file of readdirSync(new URL('netlify/functions/', ROOT)).filter((n) => n.endsWith('.mjs'))) {
        walk(parse(readFileSync(new URL(`netlify/functions/${file}`, ROOT), 'utf8'), { sourceType: 'module' }).program, (n) => {
            if (n.type !== 'CallExpression' || n.callee.type !== 'MemberExpression' || !/^(select|selectDistinct|insert|update|delete|execute)$/.test(n.callee.property.name || '')) return;
            let o = n.callee.object;
            while (o.type === 'CallExpression') o = o.callee.object || o.callee;   // db.with(cte).update(
            if (o.type === 'Identifier' && o.name === 'db') out.push([file, n.callee.property.loc.start.line]);
        });
    }
    return out;
}
function walk(n, visit, parents = []) {
    if (!n || typeof n.type !== 'string') return;
    visit(n, parents);
    for (const k of Object.keys(n)) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach((c) => walk(c, visit, [...parents, n])); else if (v && typeof v.type === 'string') walk(v, visit, [...parents, n]); }
}

// A read, an update or a delete whose own where, and joins, compare no org: [file, its text's words, why].
const NO_ORG_IN_TEXT = [
    ...[['digest.mjs', 'from(users)'], ['pipeline-alerts.mjs', 'from(users)'], ['pipeline-alerts.mjs', 'from(opportunities)'], ['pipeline-alerts.mjs', 'from(activities)'], ['pipeline-alerts.mjs', 'from(dispatchCustomers)'], ['pipeline-alerts.mjs', 'from(dispatchServicePlans)'], ['report-deliveries.mjs', 'from(savedReports)'], ['task-reminders.mjs', 'from(users)'], ['task-reminders.mjs', 'from(tasks)']]
        .map(([f, x]) => [f, `db.select().${x}`, "a scheduled job: every org's rows in one read, each handled by its own org (scheduled-job-orgs)"]),
    ...[['score-deals-batch.mjs', 'db.selectDistinct({ orgId: opportunities.orgId })'], ['score-leads-batch.mjs', 'db.selectDistinct({ orgId: leads.orgId })'], ['pipeline-alerts.mjs', "db.select({ orgId: automations.orgId }).from(automations).where(and(eq(automations.triggerEvent, 'task.overdue')"]].map(([f, x]) => [f, x, 'a scheduled job: which orgs there are, nothing of theirs']),
    ['_heartbeat.mjs', 'db.update(siteJobHeartbeats)', 'the site, no org'], ['email-inbound.mjs', 'from(users).where(eq(users.id, userId))', "a member's own signed address"],
    ['spiff-claims.mjs', 'where(pairOf(auth.orgId, opportunityId, spiffId, id))', "pairOf's first condition (sales-links pins it)"],
    ['dispatch-status.mjs', 'eq(dispatchJobs.publicToken, token)', "the job's own token"], ['lead-intake.mjs', "'webToLead'->>'token'", "the form's own token"], ['public-api.mjs', 'eq(apiKeys.keyHash, keyHash)', "the key's own hash"], ['job-status.mjs', 'eq(siteJobHeartbeats.site, site)', 'the site, no org'],
    ['documents.mjs', 'where(eq(documents.id, documentId))', 'a new id held by any org'], ['documents.mjs', 'where(eq(documents.id, row.id))', 'a new id held by any org'],
    ...[['dispatch-customers.mjs', 'from(dispatchServiceLocations).where(where)'], ['dispatch-plan-visits.mjs', 'where(and(...clauses))'], ['dispatch-schedule-blocks.mjs', 'where(and(...clauses))'], ['documents.mjs', 'from(documentLinks).where(linkWhere)'], ['invoices.mjs', 'from(invoices).where(where)'], ['recommendation-log.mjs', 'and(...base,'], ['saved-reports.mjs', 'from(savedReports).where(where)']]
        .map(([f, x]) => [f, x, 'its conditions are built above it: read as SQL by THE GUARD, which its GET reaches']),
    ['merge.mjs', 'db.select({ id: table.id }).from(table).where(predicate)', "snapIds' predicate, each caller's own, with its org (pinned below)"],
    ...['opportunities', 'accounts', 'contacts', 'activities', 'leads', 'tasks'].flatMap((t) => [['public-api.mjs', `count(*)::int\` }).from(${t}).where(whereExpr)`, 'the conditions open with the key\'s org (pinned below)'], ['public-api.mjs', `db.select().from(${t}).where(whereExpr)`, 'the conditions open with the key\'s org (pinned below)']]),
];
const COMPARED = [/\b(eq|inArray)\(\s*[\w.]+\.orgId\s*,\s*(auth\.|user\.|mgr\.|job\.|row\.|keyRow\.)?(orgId|org|\[\.\.\.orgsWithRule\])\s*[),]/, /\$\{[\w.]+\.orgId\}\s*=\s*\$\{\w*\.?orgId\}/, /\borg_id\s*=/];
test('every read, update and delete in the functions compares its org in its own where, or join — or is named with what holds it', () => {
    assert.ok(COMPARED.some((r) => r.test('and(eq(tasks.id, id), eq(tasks.orgId, orgId))')) && !COMPARED.some((r) => r.test('and(eq(tasks.id, id), eq(tasks.orgId, data.orgId))')) && !COMPARED.some((r) => r.test('and(eq(tasks.id, orgId), isNull(tasks.orgId))')));
    const used = new Set(), bare = []; let n = 0;
    for (const file of readdirSync(new URL('netlify/functions/', ROOT)).filter((x) => x.endsWith('.mjs'))) {
        const s = readFileSync(new URL(`netlify/functions/${file}`, ROOT), 'utf8');
        walk(parse(s, { sourceType: 'module' }).program, (node, parents) => {
            if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || !/^(from|update|delete)$/.test(node.callee.property.name)) return;
            let top = node; const conditions = [];
            for (const p of [...parents].reverse()) {
                if (p.type === 'MemberExpression' && p.object === top) { top = p; continue; }
                if (p.type === 'CallExpression' && p.callee === top) { if (/^(where|innerJoin|leftJoin)$/.test(top.property.name) && p.arguments.length) conditions.push(s.slice(p.arguments[0].start, p.arguments.at(-1).end)); top = p; continue; }
                break;
            }
            const text = s.slice(top.start, top.end).replace(/\s+/g, ' ').replace(/ \./g, '.');
            if (!/^(db|tx)\./.test(text)) return;
            n++;
            if (conditions.some((c) => COMPARED.some((r) => r.test(c)))) return;
            const i = NO_ORG_IN_TEXT.findIndex(([f, x], k) => f === file && text.includes(x) && !used.has(k));
            if (i >= 0) used.add(i); else bare.push(`${file}:${node.loc.start.line} ${text.slice(0, 160)}`);
        });
    }
    assert.deepEqual(bare, [], "REGRESSION: a read of every org's rows");
    assert.ok(n >= 556, `the statements read (${n})`);
    NO_ORG_IN_TEXT.forEach(([f, x, why], i) => assert.ok(used.has(i) && why, `${f} ${x}: named, and not there — take it out`));
    const merge = sourceOf('merge');
    assert.deepEqual([merge.split('await snapIds(').length - 1, (merge.match(/await snapIds\(t\.table, and\((?:eq\(t\.col, \w+\)|inArray\(t\.table\.id, ids\)), eq\(t\.table\.orgId, orgId\)/g) || []).length], [3, 3], "merge: each of snapIds' callers names its org");
    const api = sourceOf('public-api').split('\r\n').join('\n');
    for (const t of ['opportunities', 'accounts', 'contacts', 'activities', 'leads', 'tasks']) assert.equal(api.split(`[eq(${t}.orgId, orgId)]`).length, 2, `public-api: ${t}' conditions open with the key's org`);
});

test('orgGaps on made-up statements: each way a statement loses its org found; each way one holds it, held', () => {
    const T = new Set(['deals', 'accounts']);
    const gaps = (text, params = ['x', 'org_a']) => orgGaps(text, params, T, 'org_a');
    const HELD = [
        'select "id" from "deals" where ("deals"."id" = $1 and "deals"."org_id" = $2)',
        'select "id" from "deals" where "deals"."org_id" = $2 order by "deals"."name" asc limit 5',
        'select "id" from "deals" where (("deals"."id" = $1 or "deals"."id" is null) and "deals"."org_id" = $2)',
        'update "deals" set "name" = $1 where ("deals"."org_id" = $2)',
        'delete from "deals" where ("deals"."id" = $1 and "deals"."org_id" = $2) returning "id"',
        'select "id" from "other" where "other"."id" = $1',
        'select "id" from "deals" inner join "accounts" on ("accounts"."id" = "deals"."account_id" and "accounts"."org_id" = $2) where "deals"."org_id" = $2',
        'select "id" from "deals" left join "accounts" on ("accounts"."org_id" = "deals"."org_id") where "deals"."org_id" = $2',
        'with c as (select "deals"."id" from "deals" where "deals"."org_id" = $2 for update) select 1 / count(*) from c',
        'delete from "deals" where ("deals"."org_id" = $2 and not exists (select 1 from "accounts" s where s.id = "deals"."account_id" and s.org_id = "deals"."org_id"))',
        'insert into "deals" ("id") values ($1) on conflict ("id") do nothing',
        'insert into "deals" ("id") values ($1) on conflict ("id") do update set "name" = $1 where "deals"."org_id" = $2',
        "select \"id\" from \"deals\" where (\"deals\".\"name\" = 'a or b' and \"deals\".\"org_id\" = $2)",
        'select "id" from "deals" where (coalesce("deals"."owner_id", \'\') = \'\' and "deals"."org_id" = $2)',
        'select "id" from "deals" where "org_id" = $2',
        'delete from "deals" where ("deals"."id" = $1 and "deals"."org_id" = $2 and ("deals"."merged" is not true or not exists (select 1 from "deals" s where s.id = "deals"."into" and s.org_id = "deals"."org_id")))',
        'with "replaced" as (select "id" from "deals" where ("deals"."id" = $1 and "deals"."org_id" = $2) for update) update "deals" set "name" = $1 from "replaced" where ("deals"."org_id" = $2 and "deals"."id" = "replaced"."id")',
        'select "id" from "deals" where ("deals"."day" between $1 and $1 and "deals"."org_id" = $2)',
        'select 1 / (case when exists (select 1 from "deals" where "deals"."org_id" = $2) then 0 else 1 end)',
        'select "id" from "deals" where "deals"."org_id" = $2 union all select "id" from "accounts" where "accounts"."org_id" = $2',
        'select "x" from (select "id" from "deals" where "deals"."org_id" = $2) "sub" where "sub"."id" = $1',
        'select "id", (select count(*) from "accounts" where "accounts"."org_id" = "deals"."org_id") from "deals" where "deals"."org_id" = $2',
        'select "id" from "deals" where ("deals"."org_id" = $2 and left("deals"."name", 1) = $1)',
        'select "id" from "deals", unnest($1) as u(id) where ("deals"."id" = u.id and "deals"."org_id" = $2)',
        'update "deals" set "org_id" = $2, "name" = case when "name" is distinct from $1 then $1 else "name" end where "deals"."org_id" = $2',
        'insert into "deals" ("id") values ($1) on conflict ("id") do update set "org_id" = excluded.org_id, "name" = $1 where "deals"."org_id" = $2 returning "id"',
        'select "id" from "deals" where ("deals"."org_id" = $2 and case when "deals"."name" = $1 and "deals"."id" = $1 then true else false end)',
        'with "deals" as (select "id" from "accounts" where "accounts"."org_id" = $2) select "id" from "deals"',
        'insert into "deals" ("id") select "id" from "accounts" where "accounts"."org_id" = $2 on conflict ("id") do nothing',
    ];
    for (const s of HELD) assert.deepEqual(gaps(s), [], s);
    const LOOSE = [
        ['select "id" from "deals" where "deals"."id" = $1', ['deals']],
        ['select "id" from "deals"', ['deals']],
        ['select "id" from "deals" where ("deals"."id" = $1 or "deals"."org_id" = $2)', ['deals']],
        ['select "id" from "deals" where ("deals"."id" = $1 and ("deals"."org_id" = $2 or "deals"."x" is null))', ['deals']],
        ['select "id" from "deals" where "deals"."id" = $1 or "deals"."org_id" = $2', ['deals']],
        ['select "id" from "deals" where not ("deals"."org_id" = $2)', ['deals']],
        ['select "id" from "deals" where "deals"."org_id" <> $2', ['deals']],
        ['select "id", ("deals"."org_id" = $2) from "deals" where "deals"."id" = $1', ['deals']],
        ['update "deals" set "name" = $1 where "deals"."id" = $1', ['deals']],
        ['update "deals" set "org_id" = $2 where "deals"."id" = $1', ['deals']],
        ['delete from "deals" where "deals"."id" = $1', ['deals']],
        ['select "id" from "deals" inner join "accounts" on "accounts"."id" = "deals"."account_id" where "deals"."org_id" = $2', ['accounts']],
        ['select "id" from "deals" inner join "accounts" on "accounts"."org_id" = $2 where "deals"."id" = $1', ['deals']],
        ['select "id" from "deals" where ("deals"."org_id" = $2 and "deals"."account_id" in (select "id" from "accounts"))', ['accounts']],
        ['delete from "deals" where ("deals"."org_id" = $2 and not exists (select 1 from "accounts" s where s.id = "deals"."account_id"))', ['accounts']],
        ['with c as (select "deals"."id" from "deals" where "deals"."id" = $1) select 1 from c', ['deals']],
        ['insert into "deals" ("id") values ($1) on conflict ("id") do update set "name" = $1', ['deals (update)']],
        ['insert into "deals" ("id") values ($1) on conflict ("id") do update set "name" = $1 where "deals"."id" = $1', ['deals (update)']],
        ['select "id" from "deals" where coalesce("deals"."org_id" = $2, true)', ['deals']],
        ['delete from "deals" where ("deals"."id" = $1 and not exists (select 1 from "deals" s where s.id = "deals"."into" and s.org_id = "deals"."org_id"))', ['deals', 'deals']],
        ['delete from "deals" where ("deals"."id" = $1 and not exists (select 1 from "deals" where "deals"."org_id" = $2))', ['deals']],
        ['update "deals" set "name" = $1 where ("deals"."id" = $1 and exists (select 1 from "deals" where "deals"."org_id" = $2))', ['deals']],
        ['with "replaced" as (select "id" from "deals" where ("deals"."id" = $1 and "deals"."org_id" = $2) for update) update "deals" set "name" = $1 from "replaced" where "deals"."id" = "replaced"."id"', ['deals']],
        ['select "id" from "deals" where ("deals"."id" = $1 and not "deals"."org_id" = $2)', ['deals']],
        ['select "id" from "deals" where ("deals"."org_id" = $2) is not true', ['deals']],
        ['select "id" from "deals" where ("deals"."org_id" = $2) = false', ['deals']],
        ['select "id" from "deals" where case when "deals"."org_id" = $2 then true else true end', ['deals']],
        ['select "id" from "deals" inner join "accounts" on "accounts"."org_id" = "deals"."org_id"', ['deals', 'accounts']],
        ['select "id" from "deals" left join "accounts" on ("accounts"."org_id" = $2 and "deals"."org_id" = $2) where "deals"."id" = $1', ['deals']],
        ['select "id" from "accounts", "deals" where "accounts"."org_id" = $2', ['deals']],
        ['select "id" from deals where id = $1', ['deals']],
        ['select "id" from "deals" where "deals"."org_id" = $2 union all select "id" from "accounts"', ['accounts']],
        ['select "x" from (select "id" from "deals") "sub" where "sub"."org_id" = $2', ['deals']],
        ['insert into "deals" ("id") select "id" from "accounts" where "accounts"."id" = $1', ['accounts']],
        ['select "id", (select count(*) from "deals" where "deals"."account_id" = "accounts"."id") from "accounts" where "accounts"."org_id" = $2', ['deals']],
        ['delete from "accounts" where "accounts"."org_id" = $2 returning "id", (select "name" from "deals" where "deals"."id" = $1)', ['deals']],
        ['select "id" from "accounts" where "accounts"."org_id" = $2 order by "id", (select "name" from "deals" limit 1)', ['deals']],
        ['update "deals" set "name" = $1 where ("deals"."id" = $1 and case when "deals"."name" = $1 and "deals"."org_id" = $2 and "deals"."id" = $1 then false else true end)', ['deals']],
        ['select "id" from "deals" where ("deals"."id" between $1 and "deals"."org_id" = $2)', ['deals']],
        ['with "accounts" as (select "id" from "accounts" where "accounts"."id" = $1) select "id" from "accounts"', ['accounts']],
        ['with "deals" as (select "id" from "accounts" where "accounts"."org_id" = $2) update "deals" set "name" = $1 where "deals"."id" = $1', ['deals']],
        ['select "id" from unnest($1) as u(id), "deals" where "deals"."id" = u.id', ['deals']],
        ['select "id" from (values ($1)) as v("id"), "deals" where "deals"."id" = v."id"', ['deals']],
        ['select "id" from "accounts" inner join "other" on "other"."id" = "accounts"."id", "deals" where "accounts"."org_id" = $2', ['deals']],
        ['select "id" from ("deals" inner join "accounts" on "accounts"."id" = "deals"."id") where "deals"."org_id" = $2', ['(not read)']],
        ['select "id" from public.deals where id = $1', ['(not read)', '(not read)']],
        ['delete from only "deals" where "deals"."id" = $1', ['deals']],
        ['merge into "deals" using "accounts" on "accounts"."id" = "deals"."id" when matched then do nothing', ['(not read)']],
        ['truncate "deals"', ['(not read)']],
        ['select "id" from "deals" right join "accounts" on ("accounts"."org_id" = $2 and "deals"."org_id" = $2)', ['deals', 'accounts']],
        ['select "id" from "deals" full join "accounts" on ("accounts"."org_id" = $2 and "deals"."org_id" = $2)', ['deals', 'accounts']],
        ['delete from "deals" where ("deals"."id" = $1 and exists (select 1 from "accounts" where ("accounts"."org_id" = $2 and "deals"."org_id" = "accounts"."org_id")) and exists (select 1 from "accounts" a where a.org_id = "deals"."org_id"))', ['deals', 'accounts']],
        ['insert into "deals" ("id") select "id" from "deals" where "deals"."id" = $1 on conflict ("id") do update set "name" = $1 where "deals"."org_id" = $2', ['deals']],
        ['select "id" from "deals" where "deals"."org_id" = $2 and left("deals"."name", 1) = $1 or "deals"."name" is null', ['deals']],
        ['insert into "deals" ("id") select "id" from "accounts" where "accounts"."id" = $1 on conflict ("id") do update set "name" = $1 where "deals"."org_id" = $2', ['accounts']],
        ['insert into "deals" ("id") values ($1) on conflict ("id") do update set "org_id" = $1 where "deals"."org_id" = $2', ['deals (moved)']],
        ['update "deals" set "name" = $1, "org_id" = $1 where "deals"."org_id" = $2', ['deals (moved)']],
        ['select "id" from "deals" inner join "other" on "other"."org_id" = "deals"."org_id"', ['deals']],
        ['select (select count(*) from "deals" where "deals"."account_id" = "accounts"."id") from "accounts" where "accounts"."org_id" = $2', ['deals']],
    ];
    for (const [s, want] of LOOSE) assert.deepEqual(gaps(s), want, s);
    assert.deepEqual(gaps('select "id" from "deals" where "deals"."org_id" = $2', ['x', 'org_b']), ['deals'], "another org's");
    assert.deepEqual(gaps('select "id" from "deals" where "deals"."org_id" = $1', ['x', 'org_a']), ['deals'], 'a value that is no org');
});

// ── 2. Which rows, which fields ──────────────────────────────────────────────────────────────────────────────────────
const whoOf = (id) => String(id).replace(/^\w+:/, '').replace(/^usr_(me|other|none)$/, (_, w) => ({ me: 'mine', other: 'theirs', none: 'none' }[w]));
// The rows an answer holds, by the path to each list (or record) of them; a list of none is said.
function rowsIn(x, out = {}, path = '') {
    if (Array.isArray(x)) { if (path && !x.length && !path.includes('.')) out[path] = out[path] || []; for (const y of x) rowsIn(y, out, path); }
    else if (x && typeof x === 'object' && !(x instanceof Date)) {
        if (typeof x.id === 'string' && path) (out[path] ||= []).push([whoOf(x.id), x]);
        for (const [k, v] of Object.entries(x)) if (v && typeof v === 'object') rowsIn(v, out, path ? `${path}.${k}` : k);
    }
    return out;
}
const said = (q) => q.text.replace(/^select [\s\S]*? from /, 'from ').replace(/\$(\d+)/g, (_, n) => { const v = q.params[n - 1]; return typeof v === 'string' ? (/^\d{4}-\d\d-\d\d[T ]/.test(v) ? "'a time'" : `'${v}'`) : JSON.stringify(v); }).replace(/"(\w+)"\./g, '').replace(/"/g, '');
const planted = new Set();   // the answers that hold a planted secret
// One answer, in a line: the rows, the statements. `fields` hears the first row of each list.
async function answerOf(handler, f, r, role) {
    let res;
    const x = await ask(async (e, c) => (res = await handler(e, c)), f, { rows: SEED, ...r }, role);
    if (x.status !== 200) return { line: String(x.status), lists: {} };
    let body = null;
    try { body = JSON.parse(res.body); } catch { /* a page */ }
    const lists = rowsIn(body);
    const top = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    if (top.settings) lists.settings = [['org', top.settings]];
    // …and what is answered beside them.
    const beside = Object.keys(top).filter((k) => !Object.keys(lists).some((l) => l === k || l.startsWith(`${k}.`)));
    const rows = [...Object.entries(lists).map(([k, v]) => `${k}=${v.map(([w]) => w).join(',')}`), ...(beside.length ? [`{${beside.join(',')}}`] : [])].join(' ');
    if (new RegExp(PLANTED).test(res.body) || String(res.body).includes(SEED.settings[0].extra.anthropicApiKey)) planted.add(`${f} ${r.label || ''} as ${role}`);
    const asked = G.ops.filter((o) => o.kind === 'select').map((o) => { try { return said(o.sql()); } catch { return 'a day the request made up'; } }).filter((s) => !/^from (users where \(clerk_user_id = '[^']*' and org_id = 'org_a'\)|settings where org_id = 'org_a')( limit 1)?$/.test(s));
    const times = new Map(); for (const q of asked) times.set(q, (times.get(q) || 0) + 1);   // a statement asked twice is said twice
    return { line: [rows, ...[...times].map(([q, n]) => (n > 1 ? `${q} (x${n})` : q))].join(' ; '), lists };
}
const fieldsLeft = (mine, admins) => {
    const out = [];
    for (const [k, v] of Object.entries(admins)) for (const [who, row] of v) {
        const same = (mine[k] || []).find(([w]) => w === who);
        if (!same) continue;
        for (const key of Object.keys(same[1])) if (!(key in row)) out.push(`${k}.${key} added`);
        for (const key of Object.keys(row)) if (!(key in same[1])) out.push(`${k}.${key} left out`); else if (JSON.stringify(row[key]) !== JSON.stringify(same[1][key])) out.push(`${k}.${key} changed`);
    }
    return [...new Set(out)];
};
// Every GET: no query, and each query its source reads that answers something else.
async function rowTable() {
    const table = {};
    for (const f of functionFiles()) {
        const handler = await load(f);
        if (!handler) continue;
        const seen = new Set(); let lastFields = '{}';
        const gets = shapesOf(sourceOf(f)).filter((x) => x.method === 'GET');
        for (const r of [...gets, ...(EXTRA[f] || []).map((x) => ({ ...(gets[0] || { method: 'GET' }), ...x }))]) {
            const by = new Map(); let admins = null;
            for (const role of ROLES) {
                const a = await answerOf(handler, f, r, role);
                if (role === 'Admin') admins = a.lists;
                const left = fieldsLeft(a.lists, admins);
                const line = a.line + (left.length ? ` ; less than an Admin: ${left.join(', ')}` : '');
                by.set(line, [...(by.get(line) || []), role]);
            }
            const lines = [...by].map(([line, roles]) => `${roles.join(' ')}: ${line}`);
            // The fields each list has, as an Admin — or, none being answered one, whoever is — is answered it.
            const fields = Object.fromEntries(Object.entries(admins || {}).map(([k, v]) => [k, v.length ? Object.keys(v[0][1]).sort().join(' ') : '']).filter(([, v]) => v));
            const key = lines.join('\n') + JSON.stringify(fields);
            if (seen.has(key) || lines.every((l) => /: (40\d|50\d|302)$/.test(l))) continue;
            seen.add(key);
            (table[f] ||= []).push([r.label, lines, ...(JSON.stringify(fields) === lastFields ? [] : [fields])]);
            lastFields = JSON.stringify(fields);
        }
    }
    return table;
}

test('every GET, every role: the rows it is answered of the caller\'s, another member\'s and nobody\'s, the fields it is not, and what its statements ask — as written in tests/gates/rows.mjs — RUN', async () => {
    const is = await rowTable();
    if (process.env.ROWS_OUT) (await import('node:fs')).writeFileSync(process.env.ROWS_OUT, JSON.stringify(is, null, 1));
    assert.deepEqual(Object.keys(is).sort(), Object.keys(ROWS).sort(), 'every function that answers a GET');
    for (const f of Object.keys(ROWS)) assert.deepEqual(is[f], ROWS[f], `REGRESSION: ${f} — who is answered which rows, or fields, changed (if it is meant: ROWS_OUT=<file> node --test tests/row-matrix.test.mjs writes the table)`);
    assert.deepEqual([...planted], [], 'REGRESSION: a stored key, hash or token in an answer');
    assert.ok(Object.values(ROWS).flat().length >= 138, `the requests read (${Object.values(ROWS).flat().length})`);
});

// ── 3. What a write hands back, and writes beside it ─────────────────────────────────────────────────────────────────
test('a write hands back, and keeps beside it, only what its caller may read: a deal\'s score, the claim that holds a SPIFF, a note\'s words, a report\'s recipients, a quote\'s job — RUN', async () => {
    const body = async (f, r, role) => { let res; const handler = await load(f); await ask(async (e, c) => (res = await handler(e, c)), f, { rows: SEED, ...r }, role); return [res.statusCode, JSON.parse(res.body), [...G.ops]]; };
    // An activity may name any deal of the org: its score is answered where the deal is.
    const deals = (id) => ({ ...SEED, opportunities: SEED.opportunities.filter((d) => d.id === id), activities: [] });
    const ACT = { id: 'a1', type: 'Call', date: '2026-11-01', opportunityId: 'opportunities:theirs', author: 'Me Rep' };
    const scored = async (id, role, method = 'POST') => Object.keys((await body('activities', { method, body: { ...ACT, opportunityId: id }, qs: { id: 'a1' }, rows: (op) => (op.table === 'activities' && op.kind !== 'select' ? [{ id: 'a1', orgId: 'org_a', opportunityId: id, ownerId: 'usr_me' }] : op.table === 'activities' ? [{ id: 'a1', orgId: 'org_a', opportunityId: id, ownerId: 'usr_me' }] : deals(id)[op.table] || []) }, role))[1].dealScores || {});
    for (const method of ['POST', 'PUT', 'DELETE']) assert.deepEqual([await scored('opportunities:mine', 'User', method), await scored('opportunities:theirs', 'User', method), await scored('opportunities:theirs', 'Admin', method), await scored('opportunities:none', 'User', method)], [['opportunities:mine'], [], ['opportunities:theirs'], []], `REGRESSION: ${method}: how another rep's deal stands, to anyone who names it`);
    // A Manager narrowed to named reps; a read of the deals that fails answers none, never a 500 over the activity.
    const { scoresSeen, readableDealIds } = await import(new URL('netlify/functions/_dealAccess.mjs', ROOT).href);
    const asked = async (auth, rows, scores = { 'opportunities:mine': 1, 'opportunities:theirs': 2 }) => { G.rows = rows; return scoresSeen({ orgId: 'org_a', userId: 'user_me', managedReps: [], ...auth }, scores); };
    assert.deepEqual(await asked({ userRole: 'Manager', managedReps: ['Other Rep'] }, SEED), { 'opportunities:theirs': 2 });
    assert.deepEqual(await asked({ userRole: 'User' }, (op) => { if (op.table === 'opportunities') throw new Error('TEST down'); return SEED[op.table] || []; }), {}, 'REGRESSION: a failed read hands back every score, or fails a write that landed');
    assert.deepEqual([await asked({ userRole: 'Admin' }, SEED, {}), await asked({ userRole: 'Technician' }, SEED)], [{}, {}]);
    G.rows = SEED; G.ops = [];
    assert.deepEqual([...await readableDealIds({ orgId: 'org_a', userId: 'user_me', userRole: 'User' }, [null, 7, '', 'opportunities:mine'])], ['opportunities:mine']);
    const reads = () => G.ops.filter((o) => o.table === 'opportunities').map((o) => o.sql().params);
    assert.deepEqual(reads(), [['opportunities:mine', 'org_a']], 'the ids that are text, of this org');
    G.ops = []; assert.equal((await readableDealIds({ orgId: 'org_a', userId: 'user_me', userRole: 'Technician' }, ['opportunities:mine'])).size, 0); assert.deepEqual(reads(), [], 'a role that reads no deal asks for none');
    // The claim that holds a deal's SPIFF: handed back where the caller may read it.
    const aborted = Object.assign(new Error('division by zero'), { code: '22012' });
    const refused = async (who, role) => { const rows = (op) => { if (op.kind === 'insert' && op.table === 'spiff_claims') throw aborted; return op.table === 'spiff_claims' ? (op.fields ? [] : SEED.spiff_claims.filter((c) => c.id === `spiff_claims:${who}`)) : SEED[op.table] || []; };
        const [status, b] = await body('spiff-claims', { method: 'POST', body: { id: 'c9', spiffId: 'sp', opportunityId: `opportunities:${who}`, repName: 'Me Rep' }, rows: (op) => (op.table === 'settings' ? [{ ...SEED.settings[0], extra: { ...SEED.settings[0].extra, spiffs: [{ id: 'sp' }] } }] : rows(op)) }, role);
        return [status, b.code, b.spiffClaim?.id]; };
    assert.deepEqual([await refused('mine', 'User'), await refused('theirs', 'User'), await refused('theirs', 'Manager')], [[409, 'claimed', 'spiff_claims:mine'], [409, 'claimed', undefined], [409, 'claimed', 'spiff_claims:theirs']], "REGRESSION: another rep's claim, and its amount, to whoever names their deal");
    // A coaching note's words stay the note's: the audit log is every Manager's.
    const [made, , ops] = await body('coaching-notes', { method: 'POST', body: { id: 'n1', text: 'what only they may read', date: '2026-11-01', recipientIds: ['usr_other'] } }, 'Admin');
    const kept = ops.filter((o) => o.kind === 'insert' && o.table === 'audit_log').flatMap((o) => o.given);
    assert.deepEqual([made, kept.length, kept.some((a) => JSON.stringify(a).includes('only they'))], [201, 1, false], 'REGRESSION: a private note in the audit log');
    // …and one kept before is an Admin's.
    const note = async (role) => (await body('audit-log', { method: 'GET' }, role))[1].entries.filter((e) => e.entityType === 'coaching_note').map((e) => e.detail);
    assert.deepEqual([await note('Admin'), await note('Manager')], [['the note'], [null]]);
    assert.ok((await body('audit-log', { method: 'GET' }, 'Manager'))[1].entries.some((e) => e.entityType !== 'coaching_note' && e.detail), "the others' as they are");
    // A shared report's last error names no address, whoever reads it.
    for (const role of ROLES) assert.ok(!JSON.stringify((await body('saved-reports', { method: 'GET', qs: {} }, role))[1]).includes('@'), `REGRESSION: ${role}: a member's address, by a shared report`);
    const report = { ...SEED.saved_reports[0], ownerId: 'user_me' };
    const [put, { report: after }] = await body('saved-reports', { method: 'PUT', body: { id: report.id, name: 'Renamed' }, rows: (op) => (op.table === 'saved_reports' ? [{ ...report, ...op.given }] : SEED[op.table] || []) }, 'User');
    assert.deepEqual([put, after?.name, !!after?.config?.delivery?.lastError], [200, 'Renamed', true]);
    assert.ok(!JSON.stringify(after).includes('@'), 'REGRESSION: a rename answers, and keeps, the addresses');
    // A backup's file carries no AI key — stored, or kept as typed by an earlier panel — and the rest of the settings.
    const file = async (extra) => (await body('backup', { method: 'GET', qs: { id: 'backups:mine', download: '1' }, rows: { ...SEED, settings: [{ ...SEED.settings[0], extra }] } }, 'Admin'))[1].entities.settings[0].extra;
    assert.deepEqual(await file({ anthropicApiKey: 'cipher', stages: ['A'], aiSettings: { model: 'm', byokKey: 'k', apiKey: 'k', anthropicApiKey: 'k', byokProvider: 'sk-ant-k' } }), { stages: ['A'], aiSettings: { model: 'm', byokProvider: 'Anthropic' } }, 'REGRESSION: an AI key in a downloaded file');
    assert.deepEqual([await file({ aiSettings: { byokProvider: 'OpenAI' } }), await file({ aiSettings: 'x' }), await file(null)], [{ aiSettings: { byokProvider: 'OpenAI' } }, { aiSettings: 'x' }, null]);
    // A quote's job: what its card draws.
    const [, { job }] = await body('quote-to-job', { method: 'GET', qs: { quoteId: 'quotes:mine' } }, 'User');
    assert.deepEqual([Object.keys(job).sort(), Object.keys(job.invoice).sort()], [['id', 'invoice', 'jobNumber', 'scheduledDate', 'status'], ['id', 'invoiceNumber', 'status', 'total']], "REGRESSION: its costs, its crew, its customer's status link");
});

test('a report\'s delivery names its recipients by member name — sent, and refused — RUN', async () => {
    const { noAddresses } = await import(new URL('src/utils/reportDelivery.js', ROOT).href);
    assert.deepEqual([noAddresses('email to a.b@c.co: refused <x@y.z> | (p@q.r)'), noAddresses(null), noAddresses('Slack: none')], ['email to a member: refused <a member> | (a member)', null, 'Slack: none']);
    const src = sourceOf('report-deliveries').split('\r\n').join('\n');
    assert.ok(src.includes("sent.email.push(r.name || 'A member');") && src.includes("errors.push(`email to ${r.name || 'a member'}: ${noAddresses(String(e.message || e)).slice(0, 120)}`);") && !/push\([^)]*r\.email/.test(src), 'REGRESSION: the addresses a rep\'s directory leaves out');
});
