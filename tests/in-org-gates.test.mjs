// §0.169 (Jeff: "go with your recommendation") — the in-org audit: what one
// member of an org could do to another member's work, or read of it. Eight
// findings, fixed together:
//   1. Four PUTs built a full row from the body alone (sanitize() is a full-row
//      builder). Accounts, contacts and activities: a body naming three fields
//      blanked the rest. SPIFF claims: a body naming the claim's SPIFF and rep
//      but not its status reset an approved claim to pending and blanked its
//      approval; one naming neither failed the insert's NOT NULL check, a 500.
//   2. SPIFF claims: a rep filed a claim in any rep's name, approved and paid,
//      and edited any rep's claim — who approved it and when it was paid too.
//   3. Export handed any writer every owner's rows as a file; every role read
//      the run list and the schedules.
//   4. AI scoring: any member scored any deal — a write, and the deal sent to the
//      model — a Technician and a read-only member included; and read its cached
//      score.
//   5. The Slack webhook URL, a credential, went to every member on GET.
//   6. Automations: every role read the rules and every rule's runs.
//   7. A Technician read every customer and service location, any job's line
//      items and history, and every technician's time off — and a co-tech list
//      stored as jsonb TEXT, which most rows hold, matched no co-tech.
//   8. The calendar calls sent no sign-in token: every call was refused.
// And two found in the pane check (Jeff: "Fold it in", "Strip Slack only"): the
// GDPR request queue on the Export page was every role's to read; and the
// settings autosave echoed the Slack config held since sign-in — an older copy
// over the panel's save, and, for a member promoted while the app was open, a
// copy with no webhook URL over the org's.
//
// Run here: the REAL technician rules (_techJobs.mjs, pure). Scanned: the
// endpoints, for the gates tests/integration/in-org.itest.mjs proves against
// the database — the mutation harness runs unit suites only, so each rule is
// pinned here as well.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coTechIdsOf, techOnJob, techJobRefs } from '../netlify/functions/_techJobs.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const code = (src) => src.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, start, end) => {
    const a = s.indexOf(start);
    assert.ok(a >= 0, `missing: ${start}`);
    const b = s.indexOf(end, a + start.length);
    assert.ok(b > a, `no end after: ${start}`);
    return s.slice(a, b + end.length);
};
const count = (s, needle) => s.split(needle).length - 1;
const before = (s, first, second, why) => {
    const a = s.indexOf(first), b = s.indexOf(second);
    assert.ok(a >= 0, `missing: ${first}`);
    assert.ok(b >= 0, `missing: ${second}`);
    assert.ok(a < b, why);
};

// ── 7. A Technician's jobs — the real rules ──────────────────────────────────

test('coTechIdsOf: an array, the jsonb TEXT most rows hold, and nothing else', () => {
    assert.deepEqual(coTechIdsOf({ coTechIds: ['t1', 't2'] }), ['t1', 't2']);
    assert.deepEqual(coTechIdsOf({ coTechIds: '["t1","t2"]' }), ['t1', 't2'], 'what dispatch-jobs writes: JSON.stringify into a jsonb column');
    assert.deepEqual(coTechIdsOf({ co_tech_ids: ['t3'] }), ['t3'], 'a raw row');
    assert.deepEqual(coTechIdsOf({ coTechIds: 'not json' }), []);
    assert.deepEqual(coTechIdsOf({ coTechIds: '{"t1":true}' }), [], 'JSON, but not a list');
    assert.deepEqual(coTechIdsOf({ coTechIds: null }), []);
    assert.deepEqual(coTechIdsOf(null), []);
});

test('techOnJob: the lead or a co-tech — and no technician id is on no job', () => {
    const job = { assignedTechId: 'tech_lead', coTechIds: '["tech_co"]' };
    assert.equal(techOnJob(job, 'tech_lead'), true);
    assert.equal(techOnJob(job, 'tech_co'), true, 'a co-tech stored as text — the copy in dispatch-jobs matched none');
    assert.equal(techOnJob({ assignedTechId: 'x', coTechIds: ['tech_co'] }, 'tech_co'), true, 'and as an array');
    assert.equal(techOnJob(job, 'tech_other'), false);
    assert.equal(techOnJob({ assignedTechId: null, coTechIds: [] }, null), false, 'null === null is not ownership');
    assert.equal(techOnJob({ assignedTechId: undefined }, undefined), false);
    assert.equal(techOnJob({ assignedTechId: '', coTechIds: [''] }, ''), false);
});

test('techJobRefs: the jobs, customers and locations of their own jobs only', () => {
    const jobs = [
        { id: 'j1', customerId: 'c1', locationId: 'l1', assignedTechId: 'me',    coTechIds: [] },
        { id: 'j2', customerId: 'c2', locationId: null, assignedTechId: 'other', coTechIds: '["me"]' },
        { id: 'j3', customerId: 'c3', locationId: 'l3', assignedTechId: 'other', coTechIds: '[]' },
    ];
    const r = techJobRefs(jobs, 'me');
    assert.deepEqual([...r.jobIds].sort(), ['j1', 'j2']);
    assert.deepEqual([...r.customerIds].sort(), ['c1', 'c2']);
    assert.deepEqual([...r.locationIds], ['l1'], 'a job with no location adds none');
    assert.equal(techJobRefs(jobs, null).jobIds.size, 0);
    assert.equal(techJobRefs(null, 'me').customerIds.size, 0);
});

test('one definition: dispatch-jobs reads the shared rules, its own copy is gone; the scope resolves within the org', () => {
    const jobs = code(read('netlify/functions/dispatch-jobs.mjs'));
    assert.ok(jobs.includes("import { resolveTechnicianId } from './_techScope.mjs';"));
    assert.ok(jobs.includes("import { techOnJob } from './_techJobs.mjs';"));
    assert.ok(!/const techOnJob\s*=|function techOnJob|async function resolveTechnicianId/.test(jobs), 'no local copy');
    const scope = code(read('netlify/functions/_techScope.mjs'));
    assert.ok(scope.includes('.where(and(eq(dispatchTechnicians.orgId, orgId), eq(dispatchTechnicians.userId, userId)));'), 'the caller’s row, in this org');
    assert.ok(scope.includes('if (!techId) return null;'), 'no technician row, no scope — callers refuse');
    assert.ok(scope.includes('}).from(dispatchJobs).where(eq(dispatchJobs.orgId, orgId));'), 'this org’s jobs');
    assert.ok(scope.includes('return { techId, ...techJobRefs(jobs, techId) };'));
});

test('a Technician reads a job’s line items and history only for a job they are on — 404 before the read', () => {
    const s = code(read('netlify/functions/dispatch-jobs.mjs'));
    const guard = between(s, 'const techMayReadJob = async (jobId) => {', '};');
    assert.ok(guard.includes('if (!tech) return true;'));
    assert.ok(guard.includes('.where(and(eq(dispatchJobs.id, jobId), eq(dispatchJobs.orgId, orgId)));'));
    assert.ok(guard.includes('return !!row && techOnJob(normaliseJob(row), myTechId);'));
    const refuse = "if (!(await techMayReadJob(params.jobId))) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };";
    assert.equal(count(s, refuse), 2, 'line items and history');
    const items = between(s, "if (resource === 'lineitems') {", '.from(dispatchJobLineItems)');
    assert.ok(items.includes(refuse), 'line items: refused before the read');
    const history = between(s, "if (resource === 'history') {", '.from(dispatchJobStatusHistory)');
    assert.ok(history.includes(refuse), 'history: refused before the read');
});

test('a Technician reads the customers and locations of their own jobs; no technician row, a 403', () => {
    const s = code(read('netlify/functions/dispatch-customers.mjs'));
    assert.ok(s.includes("import { techScopeOf } from './_techScope.mjs';"));
    assert.ok(s.includes("const techScope = gate.access === 'tech' ? await techScopeOf(orgId, auth.userId) : null;"));
    assert.ok(s.includes("if (gate.access === 'tech' && !techScope) {"));
    assert.ok(s.includes('const visible = techScope ? rows.filter((l) => techScope.customerIds.has(l.customerId)) : rows;'), 'locations');
    assert.ok(s.includes("return { statusCode: 200, headers, body: JSON.stringify({ locations: visible.map(normaliseLoc) }) };"));
    assert.ok(s.includes('const visible = techScope ? rows.filter((c) => techScope.customerIds.has(c.id)) : rows;'), 'customers');
    assert.ok(s.includes("return { statusCode: 200, headers, body: JSON.stringify({ customers: visible.map(normaliseCust) }) };"));
});

test('a Technician reads their own time off — the clause is added before any techId the caller names', () => {
    const s = code(read('netlify/functions/dispatch-schedule-blocks.mjs'));
    assert.ok(s.includes("import { resolveTechnicianId } from './_techScope.mjs';"));
    const own = between(s, "if (gate.access === 'tech') {", 'clauses.push(eq(dispatchScheduleBlocks.techId, myTechId));');
    assert.ok(own.includes('const myTechId = await resolveTechnicianId(orgId, userId);'));
    assert.ok(own.includes("if (!myTechId) return { statusCode: 403, headers, body: JSON.stringify({ error: 'No technician record is linked to your account.' }) };"));
    before(s, 'clauses.push(eq(dispatchScheduleBlocks.techId, myTechId));', 'if (params.techId) clauses.push(eq(dispatchScheduleBlocks.techId, params.techId));',
        'ANDed with a named techId — naming another technician reads nothing');
});

// ── 2. SPIFF claims ──────────────────────────────────────────────────────────

test('SPIFF POST: a rep’s claim is filed in their roster name, pending, nothing approved or paid', () => {
    const s = code(read('netlify/functions/spiff-claims.mjs'));
    assert.ok(s.includes("import { serverErrorBody, auditAs, getCallerName } from './_lib.mjs';"));
    const post = between(s, "if (event.httpMethod === 'POST') {", '.returning();');
    const rep = between(post, 'if (!isAdmin && !isManager) {', "claim = { ...claim, repName: me, status: 'pending', approvedAt: null, approvedBy: null, paidAt: null };");
    assert.ok(rep.includes('const me = await getCallerName(auth.userId, orgId);'));
    assert.ok(rep.includes('if (!me) return { statusCode: 403,'), 'no roster row, no claim');
    assert.ok(post.includes('.values({ ...claim, orgId })'), 'the stamped claim is the one written');
    assert.ok(!post.includes('.values({ ...sanitize(data), orgId })'), 'never the body as sent');
});

test('SPIFF PUT: over the stored claim; a rep edits their own, while pending, and never its approval or payment', () => {
    const s = code(read('netlify/functions/spiff-claims.mjs'));
    const put = between(s, "if (event.httpMethod === 'PUT') {", '.returning();');
    assert.ok(put.includes('.where(and(eq(spiffClaims.id, data.id), eq(spiffClaims.orgId, orgId)));'), 'the stored claim, in this org');
    const rep = between(put, 'if (!isAdmin && !isManager) {', 'changes = ownFields;');
    assert.ok(rep.includes("if (!existing) return { statusCode: 404,"));
    assert.ok(rep.includes('if (!sameName(existing.repName, await getCallerName(auth.userId, orgId))) {'), 'their own claim');
    assert.ok(rep.includes("if ((existing.status || 'pending') !== 'pending') {"), 'while pending');
    assert.ok(rep.includes('const { status: _status, approvedAt: _approvedAt, approvedBy: _approvedBy, paidAt: _paidAt, repName: _repName, ...ownFields } = data;'),
        'status, approval, payment and the rep are not a rep’s to set');
    assert.ok(put.includes('const clean = sanitize({ ...(existing || {}), ...changes });'), 'built over the stored claim');
    assert.ok(!s.includes('const clean = sanitize(data);'), 'the full-row build from the body alone is gone');
    // The §0.166 answer stays: a manager naming an id another org holds writes nothing.
    assert.ok(s.includes("if (!upserted) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Claim not found in your organization' }) };"));
});

test('SPIFF: a claim is a rep’s by name — trimmed, any case, never an empty name', () => {
    const s = code(read('netlify/functions/spiff-claims.mjs'));
    const fn = between(s, 'const sameName = (a, b) => {', '};');
    assert.ok(fn.includes("const x = String(a ?? '').trim().toLowerCase();"));
    assert.ok(fn.includes("return !!x && x === String(b ?? '').trim().toLowerCase();"), 'an empty name matches nothing');
    // The one exception to "nothing authorizes on a name" is written where the rule is.
    const lib = read('netlify/functions/_lib.mjs');
    assert.ok(lib.includes("The one thing that authorizes on this is a rep's edit of a"), 'getCallerName’s note names the exception');
});

// ── 3. Export ────────────────────────────────────────────────────────────────

test('export: an Admin’s — the runs, the run list and the schedules, before anything is read', () => {
    const runs = code(read('netlify/functions/export-runs.mjs'));
    assert.ok(runs.includes("import { verifyAuth, requireRole }"));
    assert.ok(!runs.includes('requireWrite'), 'the writer gate is gone — every writer could export');
    before(runs, "const forbidden = requireRole(auth, ['Admin'], HEADERS);", "if (event.httpMethod === 'GET') {", 'the run list is gated too');
    const sched = code(read('netlify/functions/export-schedules.mjs'));
    assert.equal(count(sched, 'const adminErr = requireAdmin(userRole);'), 1, 'one gate, for every method');
    before(sched, 'const adminErr = requireAdmin(userRole);', "if (event.httpMethod === 'GET') {", 'the schedules read is gated');
    // Found in the pane check, folded in (Jeff: "Fold it in"): the GDPR queue on the same page.
    const dsr = code(read('netlify/functions/export-dsr.mjs'));
    assert.equal(count(dsr, 'const adminErr = requireAdmin(userRole);'), 1, 'one gate, for every method');
    before(dsr, 'const adminErr = requireAdmin(userRole);', "if (event.httpMethod === 'GET') {", 'the GDPR queue read is gated');
});

// ── The settings autosave (found in the pane check; Jeff: "Strip Slack only") ─

test('the settings autosave never sends the Slack config — one payload builder for the PUT and its baseline', () => {
    const s = code(read('src/hooks/useSettings.js'));
    const build = between(s, 'const payloadForSave = (settings) => {', 'return stripKeyMaterial(rest).value;');
    assert.ok(build.includes('const { users: _stripUsers, fiscalYearStart: _stripFiscal, slackConfig: _stripSlack, ...rest } = settings;'),
        'the Connected Apps panel writes Slack by its own PUT; the copy held here since sign-in is older, and a member’s has no webhook URL');
    assert.ok(s.includes('const serializeForSave = (settings) => JSON.stringify(payloadForSave(settings));'), 'the baseline is the payload’s own shape');
    assert.ok(s.includes('const settingsToSave = payloadForSave(settings);'), 'the PUT is the same shape — the two can never disagree about "unchanged"');
    assert.ok(!s.includes('const { value: settingsToSave } = stripKeyMaterial(rest);'), 'the effect’s own copy of the strip is gone');
    // A key the PUT is not sent, the server keeps — the merge half is unchanged.
    const server = code(read('netlify/functions/settings.mjs'));
    assert.ok(server.includes("slackConfig:    'slackConfig'    in data ? (data.slackConfig    || {}) : existingExtra.slackConfig    || {},"));
});

// ── 4. AI scoring ────────────────────────────────────────────────────────────

test('AI scoring: a writer, on a deal they may edit — asked before the key, the switch and the cached score', () => {
    const s = code(read('netlify/functions/ai-score.mjs'));
    assert.ok(s.includes("import { verifyAuth, requireWrite } from './auth.mjs';"));
    assert.ok(s.includes("import { serverErrorBody, auditAs, assertOwnership } from './_lib.mjs';"));
    before(s, 'const forbidden = requireWrite(auth, event, headers);', 'try {', 'roles that write no CRM record are refused first');
    const own = 'const notYours = await assertOwnership({ table: opportunities, entity: \'opportunity\', id: opportunityId, orgId, userId: auth.userId, userRole: auth.userRole, headers, row: opp });';
    assert.ok(s.includes(own));
    assert.ok(s.includes('if (notYours) return notYours;'));
    before(s, own, 'const { apiKey, usingOrgKey } = resolveAnthropicKey(orgSettingsRow?.extra);', 'before the key');
    before(s, own, 'const aiEnabled = orgSettingsRow?.extra?.aiScoringEnabled ?? false;', 'before the switch');
    before(s, own, 'const cached = opp.aiScore;', 'before a cached score is returned');
});

// ── 5. The Slack webhook ─────────────────────────────────────────────────────

test('settings GET: the Slack webhook URL is an Admin’s; everyone else reads the rest of the config', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes('slackConfig:    isAdmin(userRole) ? (row.extra?.slackConfig || {}) : withoutWebhookUrl(row.extra?.slackConfig),'));
    // Ends at its return — `cfg || {};` holds a `};` of its own.
    const fn = between(s, 'const withoutWebhookUrl = (cfg) => {', 'return rest;');
    assert.ok(fn.includes('const { webhookUrl: _webhookUrl, ...rest } = cfg || {};'), 'the URL, and only the URL, is left out');
});

// ── 6. Automations ───────────────────────────────────────────────────────────

test('automations: read by the roles that manage them — one gate, before both reads', () => {
    const s = code(read('netlify/functions/automations.mjs'));
    assert.ok(s.includes("const canWrite = (role) => ['Admin', 'Manager'].includes(role);"));
    assert.equal(count(s, 'if (!canWrite(userRole)) {'), 1);
    before(s, 'if (!canWrite(userRole)) {', "if (event.httpMethod === 'GET' && event.queryStringParameters?.runs) {", 'the run history');
    before(s, 'if (!canWrite(userRole)) {', '.from(automations)', 'the rules');
});

// ── 8. The calendar ──────────────────────────────────────────────────────────

test('calendar: every call sends the sign-in token, and “not connected” is not a success', () => {
    const tasks = code(read('src/hooks/useTasks.js'));
    const acts = code(read('src/hooks/useActivities.js'));
    for (const [name, s, n] of [['useTasks', tasks, 2], ['useActivities', acts, 1]]) {
        assert.equal(count(s, "dbFetch('/.netlify/functions/calendar-add-event'"), n, `${name}: dbFetch`);
        assert.equal(count(s.replaceAll('dbFetch(', 'DBFETCH('), "fetch('/.netlify/functions/calendar-add-event'"), 0, `${name}: no bare fetch`);
        assert.equal(count(s, 'result.connected === false'), n, `${name}: a 200 that added nothing is not a success`);
    }
});
