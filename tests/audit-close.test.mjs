// §0.172 (Jeff: "go with your recommendation") — finishing the cross-org audit's
// list:
//   1. The mention text: the browser named the recipient by NAME and wrote every
//      word, and any signed-in member — a read-only one included — could have
//      the org's number text any colleague anything under any name; a name two
//      members share texted whichever row came back first; the answer carried
//      the recipient's phone number.
//   2. The first sign-in linked a roster row by display name (pinned in
//      tests/org-roles.test.mjs).
//   3. The public API's activities and tasks read fields their tables do not
//      have — always undefined, so never sent — and the activities `rep` filter
//      named a column that does not exist.
//   4. An automation's update_field on a task or lead event wrote the deal whose
//      id was the TASK's — none (pinned in tests/automation-events.test.mjs).
//   5. A job's createdBy and dispatchedBy came from the body.
//   6. The customer's status page decoded its token outside the try, and a
//      finished visit's link never expired (pinned in
//      tests/customer-notifications.test.mjs).
//   7. The duplicate scan read every account and contact in the org for any
//      member, a Technician included.
//   8. A Technician read every vehicle, piece of equipment, service plan and
//      plan visit.
//
// Run here: the REAL pure rules (_mentions.mjs, _techJobs.mjs). Scanned: the
// endpoints and hooks, for what tests/integration/audit-close.itest.mjs proves
// against the database — the mutation harness runs unit suites only, so each
// rule is pinned here as well.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MENTION_EVENTS, lastMoveOf } from '../netlify/functions/_mentions.mjs';
import { techJobRefs } from '../netlify/functions/_techJobs.mjs';

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

// ── 1. The mention text — the real rules ─────────────────────────────────────

test('MENTION_EVENTS: four events, each about a deal or a task — any other is refused', () => {
    assert.deepEqual({ ...MENTION_EVENTS }, {
        dealAssigned: 'opportunity', stageChanged: 'opportunity', dealClosedWon: 'opportunity', taskAssigned: 'task',
    });
    assert.ok(Object.isFrozen(MENTION_EVENTS));
});

test('lastMoveOf: the deal’s own last move into the stage it is in — else no text', () => {
    const history = [{ stage: 'Discovery', prevStage: 'Lead' }, { stage: 'Proposal', prevStage: 'Discovery' }];
    assert.deepEqual(lastMoveOf({ stage: 'Proposal', stageHistory: history }), { fromStage: 'Discovery', toStage: 'Proposal' });
    assert.equal(lastMoveOf({ stage: 'Negotiation', stageHistory: history }), null, 'the last move is not into the stage it is in: no change on record');
    assert.deepEqual(lastMoveOf({ stage: 'Proposal', stageHistory: [{ stage: 'Proposal' }] }), { fromStage: '—', toStage: 'Proposal' }, 'no stage left on record');
    assert.equal(lastMoveOf({ stage: 'Proposal', stageHistory: [] }), null);
    assert.equal(lastMoveOf({ stage: 'Proposal' }), null);
    assert.equal(lastMoveOf({ stageHistory: [{ prevStage: 'Lead' }] }), null, 'no stage on either side is no move — undefined === undefined');
    assert.equal(lastMoveOf(null), null);
});

// ── 1. The mention text — the endpoint ───────────────────────────────────────

test('mention-sms: the body names the event and the record — nothing else is read from it', () => {
    const s = code(read('netlify/functions/mention-sms.mjs'));
    assert.ok(s.includes("import { MENTION_EVENTS, lastMoveOf } from './_mentions.mjs';"));
    assert.ok(!/const MENTION_EVENTS|function lastMoveOf/.test(s), 'one definition');
    assert.equal(count(s, 'event.body'), 1);
    assert.ok(s.includes("const { type, recordId } = JSON.parse(event.body || '{}');"));
    assert.ok(s.includes('const entity = MENTION_EVENTS[type];'));
    assert.ok(!s.includes('assigneeName'), 'REGRESSION: the recipient named by the browser, by name');
});

test('mention-sms: a writer, on a record of this org they could have saved — refused before anything is sent', () => {
    const s = code(read('netlify/functions/mention-sms.mjs'));
    const forbidden = 'const forbidden = requireWrite(auth, event, headers);';
    assert.ok(s.includes(forbidden));
    before(s, forbidden, "JSON.parse(event.body || '{}')", 'a read-only member is refused before the body is read');
    assert.ok(s.includes('.where(and(eq(table.id, String(recordId)), eq(table.orgId, orgId)));'), 'the record, in this org');
    assert.ok(s.includes('const denied = await assertOwnership({ table, entity, id: record.id, orgId, userId, userRole, headers, row: record });'),
        'only a caller who could have saved it');
    before(s, 'if (denied) return denied;', 'await sendSms(', 'refused before the text');
});

test('mention-sms: to the record’s owner by id, borne out by the record, signed with the caller’s roster name; no number in the answer', () => {
    const s = code(read('netlify/functions/mention-sms.mjs'));
    const unassigned = "if (!record.ownerId) return { statusCode: 200, headers, body: JSON.stringify({ skipped: 'unassigned' }) };";
    assert.ok(s.includes(unassigned), 'an unassigned record texts no one');
    assert.ok(s.includes('.where(and(eq(users.id, record.ownerId), eq(users.orgId, orgId)));'), 'the owner, by id, in this org');
    before(s, unassigned, 'eq(users.id, record.ownerId)', 'no owner is never looked up — null would match nothing, but say so first');
    assert.ok(!s.includes('users.name'), 'REGRESSION: the recipient found by name');
    assert.ok(s.includes("if (type === 'dealClosedWon' && record.stage !== 'Closed Won') {"), 'a win is a won deal');
    assert.ok(s.includes('move = lastMoveOf(record);'), 'a stage change is the deal’s own last move');
    assert.ok(s.includes("const by       = (await getCallerName(userId, orgId)) || 'Someone';"), 'signed by the server');
    assert.ok(s.includes('return { statusCode: 200, headers, body: JSON.stringify({ success: true, type }) };'));
    assert.ok(!s.includes('to: normalizedPhone })'), 'REGRESSION: the answer carried the recipient’s phone number');
    assert.equal(count(s, 'normalizedPhone'), 3, 'normalised, checked, sent — never answered');
});

test('the hooks send the event and the record’s id — nothing the server could take as the message', () => {
    for (const [file, calls, events] of [
        ['src/hooks/useOpportunities.js', 4, ['dealAssigned', 'stageChanged', 'dealClosedWon']],
        ['src/hooks/useTasks.js',         2, ['taskAssigned']],
    ]) {
        const s = code(read(file));
        const shaped = [...s.matchAll(/fireMentionSms\(\{ type: '(\w+)', recordId: (editingOpp\.id|editingTask\.id|newId) \}\);/g)];
        assert.equal(shaped.length, calls, `${file}: every call`);
        assert.equal(count(s, 'fireMentionSms('), calls + 1, `${file}: no other call, no other shape`);
        for (const m of shaped) {
            assert.ok(events.includes(m[1]), `${file}: ${m[1]}`);
            assert.ok(m[1] in MENTION_EVENTS, `${file}: ${m[1]} is an event the server knows`);
        }
    }
});

// ── 3. The public API ────────────────────────────────────────────────────────

test('public API: every field a resource answers with, and every column it filters on, is a column of its table', () => {
    const schema = read('db/schema.ts');
    const api = code(read('netlify/functions/public-api.mjs'));
    const columnsOf = (name) => {
        const start = schema.indexOf(`export const ${name} = pgTable(`);
        assert.ok(start >= 0, `no table ${name}`);
        const body = schema.slice(start, schema.indexOf('\n}', start));
        return new Set([...body.matchAll(/^\s{4}([A-Za-z0-9_]+):\s/gm)].map((m) => m[1]));
    };
    for (const table of ['opportunities', 'accounts', 'contacts', 'activities', 'leads', 'tasks']) {
        const block = between(api, `if (resource === '${table}') {`, 'body: JSON.stringify(paginatedResponse(shaped, page, limit, total)),');
        const cols = columnsOf(table);
        assert.ok(cols.size > 15, `${table}: the schema parsed`);
        const reads = [...new Set([...block.matchAll(/\br\.([A-Za-z0-9_]+)/g)].map((m) => m[1]))];
        const named = [...new Set([...block.matchAll(new RegExp(`\\b${table}\\.([A-Za-z0-9_]+)`, 'g'))].map((m) => m[1]))];
        assert.ok(reads.length > 10, `${table}: the shaper parsed`);
        assert.deepEqual(reads.filter((f) => !cols.has(f)), [], `${table}: a field that is no column is always undefined, and JSON drops it`);
        assert.deepEqual(named.filter((f) => !cols.has(f)), [], `${table}: a filter on no column fails the request`);
    }
    assert.ok(api.includes('if (params.rep) conds.push(eq(activities.author, params.rep));'), 'an activity’s rep is its author');
});

// ── 5. A job's attribution ───────────────────────────────────────────────────

test('dispatch-jobs: createdBy is the caller’s, kept across a re-POST; no body sets it or dispatchedBy', () => {
    const s = code(read('netlify/functions/dispatch-jobs.mjs'));
    assert.ok(s.includes('createdBy:        priorJob ? (priorJob.createdBy ?? null) : (userId ?? null),'));
    assert.ok(s.includes('dispatchedBy:     priorJob ? (priorJob.dispatchedBy ?? null) : null,'));
    assert.ok(s.includes('.where(and(eq(dispatchJobs.id, data.id), eq(dispatchJobs.orgId, orgId)));'), 'the prior row, in this org');
    const fields = between(s, 'const scalarFields = [', '];');
    assert.ok(!/'createdBy'|'dispatchedBy'/.test(fields), 'REGRESSION: an edit rewrites who made the job');
    assert.ok(!/data\.(createdBy|dispatchedBy)/.test(s), 'REGRESSION: the body names who made it');
});

// ── 7. Duplicates ────────────────────────────────────────────────────────────

test('duplicates: the org-wide scan is the merge’s roles’; the on-create probe reads where the caller may — before any read', () => {
    const s = code(read('netlify/functions/duplicates.mjs'));
    const gate = "const denied = requireRole(auth, ['Admin', 'Manager'], headers);";
    assert.ok(s.includes(gate));
    before(s, "if (q.mode !== 'create') {", gate, 'every mode but the probe');
    before(s, 'if (denied) return denied;', 'await db.select()', 'refused before any read');
    const none = "if (scope === 'none') return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };";
    assert.ok(s.includes('const scope = crmReadScope(auth.userRole);'));
    assert.ok(s.includes(none), 'a Technician reads no CRM record');
    before(s, none, 'await db.select()', 'refused before any read');
    assert.ok(s.includes("const readable = (r) => scope === 'all' || !r.ownerId || r.ownerId === callerId;"));
    assert.ok(s.includes('.filter(c => !c.mergeArchived && readable(c));'), 'contacts');
    assert.ok(s.includes('.filter(a => !a.mergeArchived && readable(a));'), 'accounts');
    assert.equal(count(s, 'await db.select().from('), 2, 'two reads, both narrowed');
    for (const f of ['netlify/functions/accounts.mjs', 'netlify/functions/contacts.mjs']) {
        assert.ok(code(read(f)).includes('results = results.filter(r => !r.ownerId || r.ownerId === callerId);'), `${f}: the same rule the probe follows`);
    }
    const probe = between(code(read('src/components/rails/ContactRail.jsx')), 'const checkDuplicate = async (data) => {', 'return null; // fail open');
    assert.ok(probe.includes('if (!res.ok) return null;'), 'a refused probe never blocks a save');
});

// ── 8. A Technician's dispatch reads — the real rule, then the four reads ────

test('techJobRefs: the vehicle, reserved units and plan their own jobs carry — a reservation stored as JSON text reads too; a KIND reaches no unit', () => {
    const jobs = [
        { id: 'j1', assignedTechId: 'me', coTechIds: [], assignedVehicleId: 'v1', equipmentIds: '["Lift"]', assignedEquipmentIds: '["e1","e2"]', servicePlanId: 'p1' },
        { id: 'j2', assignedTechId: 'other', coTechIds: '["me"]', assignedVehicleId: null, assignedEquipmentIds: ['e3'], servicePlanId: null },
        { id: 'j3', assignedTechId: 'other', coTechIds: [], assignedVehicleId: 'v3', assignedEquipmentIds: '["e9"]', servicePlanId: 'p3' },
    ];
    const r = techJobRefs(jobs, 'me');
    assert.deepEqual([...r.vehicleIds], ['v1']);
    assert.deepEqual([...r.reservedEquipmentIds].sort(), ['e1', 'e2', 'e3']);
    assert.ok(!r.reservedEquipmentIds.has('Lift'), 'equipmentIds is the KINDS a job needs, not units');
    assert.deepEqual([...r.servicePlanIds], ['p1']);
    const none = techJobRefs(jobs, null);
    assert.equal(none.vehicleIds.size + none.reservedEquipmentIds.size + none.servicePlanIds.size, 0, 'no technician id is on no job');
    const scope = code(read('netlify/functions/_techScope.mjs'));
    for (const col of ['assignedVehicleId', 'assignedEquipmentIds', 'servicePlanId']) {
        assert.match(scope, new RegExp(`${col}:\\s+dispatchJobs\\.${col},`), `the scope reads ${col}`);
    }
});

test('a Technician reads the vehicles, equipment, plans and plan visits their jobs reach; no technician row, a 403 — before the read', () => {
    const SCOPE = "const tech = gate.access === 'tech' ? await techScopeOf(orgId, auth.userId) : null;";
    const NO_ROW = "if (gate.access === 'tech' && !tech) return { statusCode: 403, headers, body: JSON.stringify({ error: 'No technician record is linked to your account.' }) };";
    for (const [file, narrowed, answer] of [
        ['netlify/functions/dispatch-equipment.mjs',
            '? rows.filter((e) => e.checkedOutToId === tech.techId || tech.jobIds.has(e.checkedOutJobId) || tech.reservedEquipmentIds.has(e.id))',
            'JSON.stringify({ equipment: visible.map(normalise) })'],
        ['netlify/functions/dispatch-vehicles.mjs',
            '? rows.filter((v) => v.assignedTechId === tech.techId || tech.vehicleIds.has(v.id))',
            'JSON.stringify({ vehicles: visible.map(normalise) })'],
        ['netlify/functions/dispatch-service-plans.mjs',
            'const visible = tech ? rows.filter((p) => tech.servicePlanIds.has(p.id)) : rows;',
            'JSON.stringify({ plans: visible.map(normalise) })'],
        ['netlify/functions/dispatch-plan-visits.mjs',
            'const visible = tech ? rows.filter((v) => tech.customerIds.has(v.customerId)) : rows;',
            'JSON.stringify({ visits: visible.map(normalise) })'],
    ]) {
        const s = code(read(file));
        assert.ok(s.includes("import { techScopeOf } from './_techScope.mjs';"), file);
        const get = between(s, "if (event.httpMethod === 'GET') {", answer);
        assert.ok(get.includes(SCOPE), `${file}: the caller’s own scope`);
        assert.ok(get.includes(NO_ROW), `${file}: no technician row, nothing`);
        assert.ok(get.includes(narrowed), `${file}: narrowed to their jobs`);
        before(get, NO_ROW, 'await db.select()', `${file}: refused before the read`);
    }
});
