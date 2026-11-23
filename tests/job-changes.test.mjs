// tests/job-changes.test.mjs — §0.286 (OPEN_ITEMS §4.8, §0.285's found (i); Jeff, 22 Nov: "Do your recommended"): a
// Dispatch office save sends only what it changed from the job as its screen holds it, and a status move names the status
// it moved from. src/utils/jobChanges.js, run: one rule per column (a list held as JSON text, a decimal, none and false),
// the body each press sends, the editor's form as it always was, a stale editor rebased, and the server's 'already'.
// And §0.289 (§0.286's found (a); Jeff, 23 Nov: "Next race finding"): the appointment and the crew a save relied on, named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from '@babel/parser';
import {
    JOB_STATUSES, listOf, sameJobValue, jobChanges, scheduleFields, heldCrewFields, unassignFields, editorFields,
    rebaseDraft, jobHolds, jobAnswerOf, sentOf, seenOf, seenIn, movedWords, sameAppointment, sameCrew,
    pressLanded, appointmentDropped,
} from '../src/utils/jobChanges.js';

const STORED = {   // a job as the server holds it (normaliseJob's shape, lists as drizzle hands them back)
    id: 'j1', status: 'scheduled', title: 'Boiler', description: null, priority: 'normal', jobType: '', trade: '',
    durationMinutes: 120, crewSize: 1, minLicense: null, needSkills: [], equipmentIds: [],
    scheduledDate: '2026-11-26', scheduledStart: '08:00', scheduledEnd: '10:00', timeSlot: 'exact',
    locationId: 'loc1', assignedTechId: 't1', coTechIds: ['t2'], assignedEquipmentIds: ['u1'],
};

test('J1 — one rule per column: a list as JSON text is the list; a decimal is its number; none and false are not one; none and empty text are', () => {
    assert.deepEqual(listOf('["t1","t2"]'), ['t1', 't2']);
    assert.deepEqual(listOf(null), []);
    assert.ok(sameJobValue('coTechIds', '["t2"]', ['t2']), 'held as text, sent as a list');
    assert.ok(!sameJobValue('coTechIds', ['t2', 't3'], ['t3', 't2']), 'the crew order counts (the lead is first)');
    assert.ok(sameJobValue('laborCost', '12.50', 12.5));
    assert.ok(sameJobValue('durationMinutes', '90', 90));
    assert.ok(!sameJobValue('durationMinutes', null, 0), 'none is not zero');
    assert.ok(!sameJobValue('customerSignature', null, false), 'none stored is not false (the §0.278 review)');
    assert.ok(sameJobValue('description', null, ''), 'none and empty text are one value');
    assert.ok(sameJobValue('status', null, 'unscheduled'), 'a status none is unscheduled');
    assert.ok(sameJobValue('actualStart', '2026-11-26T08:00:00.000Z', new Date('2026-11-26T08:00:00.000Z')));
    assert.equal(JOB_STATUSES.length, 8);
});

test('J2 — the body: the id and only what changed, a group whole; a status moved names where it moved from; nothing changed is null', () => {
    assert.equal(jobChanges(STORED, { title: 'Boiler' }, 'j1'), null);
    assert.deepEqual(jobChanges(STORED, { title: 'Boiler room' }, 'j1'), { id: 'j1', title: 'Boiler room' });
    assert.deepEqual(jobChanges(STORED, { status: 'cancelled' }, 'j1'), { id: 'j1', status: 'cancelled', fromStatus: 'scheduled' });
    assert.deepEqual(jobChanges({ ...STORED, status: null }, { status: 'scheduled' }, 'j1'), { id: 'j1', status: 'scheduled', fromStatus: 'unscheduled' });
    // A crew changed sends the crew whole; a start changed sends the appointment whole.
    assert.deepEqual(jobChanges(STORED, { assignedTechId: 't1', coTechIds: ['t3'] }, 'j1'), { id: 'j1', assignedTechId: 't1', coTechIds: ['t3'] });
    assert.deepEqual(jobChanges(STORED, { scheduledDate: '2026-11-26', scheduledStart: '09:00', scheduledEnd: '11:00', timeSlot: 'exact' }, 'j1'),
        { id: 'j1', scheduledDate: '2026-11-26', scheduledStart: '09:00', scheduledEnd: '11:00', timeSlot: 'exact' });
    assert.ok(!('fromStatus' in jobChanges(STORED, { title: 'x' }, 'j1')), 'no status moved: none named');
    // The review: a job the screen holds no copy of — the whole intent and no fromStatus, decided by the server as before;
    // a diff against nothing read every field as unchanged (a time off counted a job returned with no request sent).
    assert.deepEqual(jobChanges(undefined, unassignFields(), 'j9'), { id: 'j9', ...unassignFields() });
    assert.deepEqual(jobChanges(null, { status: 'scheduled' }, 'j9'), { id: 'j9', status: 'scheduled' });
});

test('J3 — each press: a schedule, a hold, a time off — only what it changes from the job held', () => {
    const sch = scheduleFields({ leadId: 't1', coIds: ['t2'], date: '2026-11-27', start: '08:00', end: '10:00', units: ['u1'] });
    assert.deepEqual(jobChanges(STORED, sch, 'j1'), { id: 'j1', scheduledDate: '2026-11-27', scheduledStart: '08:00', scheduledEnd: '10:00', timeSlot: 'exact' },
        'a reschedule of a scheduled job to another day: the appointment alone — no status, no crew it already holds');
    const fresh = { id: 'j2', status: 'unscheduled' };
    assert.equal(jobChanges(fresh, sch, 'j2').fromStatus, 'unscheduled');
    // The hold names its units released, and no time (a crew held, §0.115).
    const held = heldCrewFields(['t1', 't2']);
    assert.deepEqual(held, { status: 'unscheduled', assignedTechId: 't1', coTechIds: ['t2'], assignedEquipmentIds: [] });
    assert.deepEqual(jobChanges(STORED, held, 'j1'), { id: 'j1', status: 'unscheduled', assignedEquipmentIds: [], fromStatus: 'scheduled' });
    assert.deepEqual(heldCrewFields([]), { status: 'unscheduled', assignedTechId: null, coTechIds: [], assignedEquipmentIds: [] }, 'Release');
    const off = jobChanges(STORED, unassignFields(), 'j1');
    // The appointment's group is sent of what the press names: the time off clears the start and end, the day and slot left.
    assert.deepEqual(off, { id: 'j1', status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledStart: null, scheduledEnd: null, assignedEquipmentIds: [], fromStatus: 'scheduled' });
    assert.equal(jobChanges({ id: 'j3', status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledStart: null, scheduledEnd: null, assignedEquipmentIds: [] }, unassignFields(), 'j3'), null,
        'a job already back in the queue: no write');
});

test('J3b — a press whose meaning is a status names it and where it saw the job whenever it sends anything (the review); nothing to change sends nothing', () => {
    const queued = { id: 'j4', status: 'unscheduled', assignedTechId: null, coTechIds: [], assignedEquipmentIds: [] };
    assert.deepEqual(jobChanges(queued, heldCrewFields(['t1']), 'j4', { checkStatus: true }),
        // Moved in §0.289: the time and the crew it was seen with too.
        { id: 'j4', status: 'unscheduled', assignedTechId: 't1', coTechIds: [], fromStatus: 'unscheduled',
            fromAppointment: { scheduledDate: '', scheduledStart: '', scheduledEnd: '', timeSlot: 'anytime', durationMinutes: '' }, fromCrew: { assignedTechId: '', coTechIds: [] } },
        'REGRESSION: a hold over a job held unscheduled names no status — scheduled since by another, it lands unchecked');
    assert.deepEqual(jobChanges(queued, heldCrewFields(['t1']), 'j4'), { id: 'j4', assignedTechId: 't1', coTechIds: [] }, 'without it: the fields alone');
    assert.equal(jobChanges(queued, unassignFields(), 'j4', { checkStatus: true }), null, 'a job already back with no crew: still nothing to send');
    const sch = jobChanges(STORED, scheduleFields({ leadId: 't1', coIds: ['t2'], date: '2026-11-27', start: '08:00', end: '10:00', units: ['u1'] }), 'j1', { checkStatus: true });
    assert.equal(sch.fromStatus, 'scheduled', 'a reschedule names where it saw the job');
    assert.deepEqual(sentOf({ id: 'j1', status: 'scheduled', fromStatus: 'unscheduled', title: 'x' }), { status: 'scheduled', title: 'x' });
    assert.deepEqual(sentOf({ id: 'j1', ...seenOf(STORED), title: 'x' }), { title: 'x' }, 'REGRESSION: what its screen saw kept as the job\'s own (§0.289)');
});

test("J4 — the editor's form is the body its Save always sent; an untouched form sends nothing; a start typed sends the appointment", () => {
    const f = editorFields(STORED, STORED.locationId);
    assert.deepEqual(f, { title: 'Boiler', description: null, priority: 'normal', status: 'scheduled', jobType: '', trade: '', durationMinutes: 120,
        crewSize: 1, minLicense: null, needSkills: [], equipmentIds: [], scheduledDate: '2026-11-26', scheduledStart: '08:00', scheduledEnd: '10:00',
        timeSlot: 'exact', locationId: 'loc1' });
    assert.equal(editorFields({ ...STORED, durationMinutes: null }, 'loc1').durationMinutes, 120, 'none is two hours, as it always was');
    assert.equal(editorFields({ ...STORED, scheduledStart: '23:00', durationMinutes: 120 }, 'loc1').scheduledEnd, '01:00', 'wraps at midnight');
    const same = jobChanges(editorFields(STORED, 'loc1'), editorFields({ ...STORED }, 'loc1'), 'j1');
    assert.equal(same, null, 'REGRESSION: an untouched editor sends the job back');
    assert.deepEqual(jobChanges(editorFields(STORED, 'loc1'), editorFields({ ...STORED, title: 'New' }, 'loc1'), 'j1'), { id: 'j1', title: 'New' });
    assert.deepEqual(jobChanges(editorFields(STORED, 'loc1'), editorFields({ ...STORED, scheduledStart: '09:30' }, 'loc1'), 'j1'),
        { id: 'j1', scheduledDate: '2026-11-26', scheduledStart: '09:30', scheduledEnd: '11:30', timeSlot: 'exact' });
    assert.deepEqual(jobChanges(editorFields(STORED, 'loc1'), editorFields({ ...STORED, durationHrs: 3 }, 'loc1'), 'j1'),
        { id: 'j1', durationMinutes: 180, scheduledDate: '2026-11-26', scheduledStart: '08:00', scheduledEnd: '11:00', timeSlot: 'exact' }, 'a longer job moves its end');
    assert.deepEqual(jobChanges(editorFields(STORED, 'loc1'), editorFields({ ...STORED, status: 'cancelled' }, 'loc1'), 'j1'),
        { id: 'j1', status: 'cancelled', fromStatus: 'scheduled' });
    assert.deepEqual(jobChanges(editorFields(STORED, 'loc1'), editorFields(STORED, 'loc2'), 'j1'), { id: 'j1', locationId: 'loc2' }, 'a new address');
    assert.equal(jobChanges(editorFields({ ...STORED, priority: 'urgent' }, 'loc1'), editorFields({ ...STORED, priority: 'urgent' }, 'loc1'), 'j1'), null,
        'a stored alias left untouched is not sent');
});

test('J5 — an editor refused as stale shows the job as stored with what the member typed over it; its next Save sends only their changes', () => {
    const opened = STORED;
    const draft = { ...STORED, title: 'Boiler — mine' };   // the member typed a title
    const stored = { ...STORED, status: 'en_route', scheduledStart: '08:30', scheduledEnd: '10:30' };   // a technician moved it, the office re-timed it
    const rebased = rebaseDraft(opened, draft, stored);
    assert.equal(rebased.title, 'Boiler — mine', 'what they typed stays');
    assert.equal(rebased.status, 'en_route', "REGRESSION: an untouched field kept the old value — the next Save wrote it back");
    assert.equal(rebased.scheduledStart, '08:30');
    assert.deepEqual(jobChanges(editorFields(stored, stored.locationId), editorFields(rebased, rebased.locationId), 'j1'), { id: 'j1', title: 'Boiler — mine' });
    const moved = rebaseDraft(opened, { ...STORED, durationHrs: 4 }, stored);
    assert.equal(moved.durationHrs, 4, 'a duration typed stays');
});

test("J6 — the server's 'already': every value the write sets held, by the same rule — never on an empty write, never on a field it differs in", () => {
    const row = { ...STORED, coTechIds: '["t2"]', laborCost: '12.50' };   // lists as JSON text, a decimal, as some rows hold them
    const updates = { updatedAt: new Date(), status: 'scheduled', coTechIds: JSON.stringify(['t2']), laborCost: 12.5 };
    assert.ok(jobHolds(row, updates));
    assert.ok(!jobHolds(row, { updatedAt: new Date() }), 'nothing to hold is not held');
    assert.ok(!jobHolds(row, { ...updates, scheduledStart: '09:00' }));
    assert.ok(!jobHolds(null, updates));
    // The review: custom fields as a write holds them (JSON text) against the stored object, keys in any order.
    assert.ok(jobHolds({ customFields: { b: 2, a: 1 } }, { customFields: JSON.stringify({ a: 1, b: 2 }) }), "REGRESSION: an API press sent again with its custom fields said 'stale'");
    assert.ok(!jobHolds({ customFields: { a: 1 } }, { customFields: JSON.stringify({ a: 2 }) }));
    assert.ok(jobHolds({ tags: '["x"]' }, { tags: JSON.stringify(['x']) }));
    // §0.290: a New Job sent again, answered with the job an earlier press made — the body as New Job sends it (a trade, a type and
    // a plan not chosen as none) against the job as the server stores and answers it; scheduled, crewed or edited since, it is not as sent.
    const sent = { customerId: 'c1', locationId: 'loc1', title: 'Boiler', trade: null, jobType: null, priority: 'normal', status: 'unscheduled', durationMinutes: 120, crewSize: 1, minLicense: null,
        needSkills: [], scheduledDate: null, equipmentIds: [], requiredVehicleType: null, servicePlanId: null, planDueDate: null };
    const made = { ...STORED, customerId: 'c1', status: 'unscheduled', scheduledDate: null, scheduledStart: null, scheduledEnd: null, timeSlot: 'anytime', assignedTechId: null, coTechIds: [], assignedEquipmentIds: [],
        requiredVehicleType: null, servicePlanId: null, planDueDate: null, createdBy: 'user_me', jobNumber: 'JOB-2026-0001' };
    assert.ok(jobHolds(made, sent), 'REGRESSION: a create sent again and standing as sent said to stand otherwise');
    for (const since of [{ status: 'scheduled' }, { scheduledDate: '2026-12-01' }, { title: 'Boiler (rush)' }, { priority: 'emergency' }, { needSkills: ['gas'] }, { durationMinutes: 60 }, { locationId: null }]) assert.ok(!jobHolds({ ...made, ...since }, sent), JSON.stringify(since));
});

test("J7 — a refusal read only about the job pressed: 'already' and 'stale' with the job, else nothing", () => {
    assert.equal(jobAnswerOf(409, { code: 'already', job: { id: 'j1' } }, 'j1'), 'already');
    assert.equal(jobAnswerOf(409, { code: 'stale', job: { id: 'j1' } }, 'j1'), 'stale');
    assert.equal(jobAnswerOf(409, { code: 'stale', job: { id: 'j9' } }, 'j1'), null, 'another job: not this press');
    assert.equal(jobAnswerOf(409, { code: 'stale' }, 'j1'), null, 'no job: not this rule');
    assert.equal(jobAnswerOf(404, { code: 'stale', job: { id: 'j1' } }, 'j1'), null);
});

// THE GUARD: every office PUT body DispatchTab sends is built by jobChanges — no literal status reaches a job write but the
// technician's own card (its server rule, techMoves.js) and the week move's planner payload (weekDrop.js names no status).
test('THE GUARD — every Dispatch office save of a job sends a jobChanges body; no literal status reaches one', () => {
    const src = readFileSync(new URL('../src/Tabs/DispatchTab.jsx', import.meta.url), 'utf8').split('\r\n').join('\n');
    const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
    const puts = [];
    const walk = (n, fn) => {
        if (!n || typeof n.type !== 'string') return;
        // The function a call sits in, by the name it is declared under (`const save = async () => …`).
        const here = (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && /Function/.test(n.init?.type || '')) ? n.id.name : fn;
        if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'dbFetch') {
            const url = src.slice(n.arguments[0].start, n.arguments[0].end);
            const opts = n.arguments[1];
            const method = opts && opts.type === 'ObjectExpression' && opts.properties.find((p) => p.key && p.key.name === 'method');
            if (url.includes("dispatch-jobs?id=") && method && src.slice(method.value.start, method.value.end).includes('PUT')) {
                const bodyProp = opts.properties.find((p) => p.key && p.key.name === 'body');
                puts.push({ fn: here, body: src.slice(bodyProp.value.start, bodyProp.value.end) });
            }
        }
        for (const k of Object.keys(n)) {
            if (k === 'loc' || k === 'start' || k === 'end' || k === 'extra') continue;
            const v = n[k];
            if (Array.isArray(v)) v.forEach((c) => walk(c, here)); else if (v && typeof v.type === 'string') walk(v, here);
        }
    };
    walk(ast.program, null);
    const NAMED = { updateMyJob: 'the technician\'s card — its own rule (techMoves.js, §0.281)', commit: 'the week move — weekDrop.js\'s partial payload, never a status' };
    const office = puts.filter((p) => !NAMED[p.fn]);
    assert.equal(puts.length, 7, `the job PUTs found: ${puts.map((p) => p.fn).join(', ')}`);
    assert.deepEqual(office.map((p) => p.body), Array(office.length).fill('JSON.stringify(body)'), 'REGRESSION: an office save sends a body not built by jobChanges');
    for (const fn of ['handleSchedule', 'writeHeldCrew', 'save', 'confirmMassSchedule', 'saveBlock']) {
        // The Jobs view's save (three components declare a `save`).
        const at = src.indexOf(`const ${fn} = async`, fn === 'save' ? src.indexOf('const JobsView = (') : 0);
        assert.ok(at >= 0, fn);
        const end = src.indexOf('\n    };\n', at);
        assert.ok(end > at, `${fn}: its end`);
        const body = src.slice(at, end);
        assert.ok(/const body = jobChanges\(/.test(body), `REGRESSION: ${fn}: its body is not jobChanges'`);
        // A literal status stays only in a board row kept as sent when an answer cannot be read — never in what is sent.
        assert.ok(!/body:\s*JSON\.stringify\(\{[^)]*status:/.test(body), `REGRESSION: ${fn} sends a literal status`);
    }
});

// The review: the parent's adoption had no test — onScheduled's adoptJob and onAdopt={adoptJob} could each be removed with
// every test green. Pinned in order: the wiring, each sender's status guard, the editor's rebase on every answer, and
// every press kept as sent (both copies and the base) when its answer cannot be read.
test('THE GUARD — the parent adopts every job a press is answered with, and keeps an unreadable one as sent; the senders guard their status', () => {
    const d = readFileSync(new URL('../src/Tabs/DispatchTab.jsx', import.meta.url), 'utf8').split('\r\n').join('\n');
    const inOrder = (...needles) => { let at = 0; for (const n of needles) { const i = d.indexOf(n, at); assert.ok(i >= 0, `REGRESSION: missing or out of order — ${n}`); at = i + n.length; } };
    inOrder('const adoptJob = (row) => {', 'setJobsRaw(prev => prev.map(j => (j.id === row.id ? row : j)));', 'setJobs(prev => prev.map(j => (j.id === row.id ? { ...j, ...boardJobOf(row, customers) } : j)));',
        'const keepSent = (id, sent) => {', 'setJobsRaw(prev => prev.map(j => (j.id === id ? { ...j, ...sent } : j)));', "_raw: { ...(j._raw || {}), ...sent } }");
    inOrder('onSaved={saved => { adoptJob(saved);', 'onAdopt={adoptJob}', 'onHeld={({ jobId, jobName, techIds, crewNames, serverJob, sent }) => {', 'if (serverJob) adoptJob(serverJob);', 'else keepSent(jobId, sent);',
        'onScheduled={({', 'if (serverJob) adoptJob(serverJob);', 'else keepSent(jobId, sent);');
    for (const call of ['units: reservedUnits }), selectedJob.id, { checkStatus: true });', 'heldCrewFields(ids), selectedJob.id, { checkStatus: true });',
        'units: pr.assignedEquipment }), pr.job.id, { checkStatus: true, seen: pr.job._raw || held });', 'unassignFields(), jobId, { checkStatus: true });']) assert.ok(d.includes(call), `REGRESSION: a status press unguarded — ${call}`);
    inOrder('setDraft(d => (d && d.id === draft.id ? rebaseDraft(base, { ...d, locationId }, r.body.job, { refused: true }) : d));', 'const stored = data.job || { ...(selected || base), ...sentOf(body) };', 'setDraft(d => (d && d.id === draft.id ? rebaseDraft(base, { ...d, locationId }, stored) : d));', 'if (opened.current?.id === draft.id) opened.current = { ...stored };');
    inOrder('if (saved) adopted.push(saved); else asSent.set(pr.job.id, sentOf(body));', 'asSent.forEach((sent, id) => keepSent(id, sent));');
    inOrder('else asSent.set(jobId, sentOf(body)); }', 'asSent.forEach((sent, id) => keepSent(id, sent));');
    inOrder('if (saved) adoptJob(saved); else { moveRow(); keepSent(job.id, sentOf(payload)); }', 'if (unknownOf(e)) { moveRow(); keepSent(job.id, { ...sentOf(payload), _maybe: true });');
});

// The server's two refusals before any write (§0.286 and its review): a fromStatus that is no status, and a status that is
// none of the job's — on the office PUT and the POST. Pinned by their lines (tests/integration/dispatch-race.itest.mjs
// runs them against the database; this file is the harness's).
test("the job endpoint refuses a fromStatus or a status outside the job statuses — 400 naming the field, before anything is written", () => {
    const f = readFileSync(new URL('../netlify/functions/dispatch-jobs.mjs', import.meta.url), 'utf8').split('\r\n').join('\n');
    // Each line once in the file, by its position against the write (the line items' own PUT comes first in the file).
    const at = (n) => { const i = f.indexOf(n); assert.ok(i >= 0, `REGRESSION: missing — ${n}`); assert.equal(f.indexOf(n, i + 1), -1, `once: ${n}`); return i; };
    // Moved in §0.289: seenIn reads all three (its own refusals: J8).
    const write = at('const { before: replaced, written } = await officeWrite(orgId, id, updates, named.seen);');
    const from = at("const named = seenIn(data);\n            if (named.error) return { statusCode: 400, headers, body: JSON.stringify({ error: named.error, field: named.field }) };");
    const st = at("if ('status' in data && !JOB_STATUSES.includes(data.status)) {\n                return { statusCode: 400, headers, body: JSON.stringify({ error: `status is one of: ${JOB_STATUSES.join(', ')}.`, field: 'status' }) };");
    const officeLinks = f.lastIndexOf('const linked = await checkLinks(JOB_LINKS, data, current, orgId);');
    assert.ok(from < officeLinks && st < officeLinks && officeLinks < write, 'the office PUT refuses both before its links are asked and its write');
    const p = at("if (data.status != null && !JOB_STATUSES.includes(data.status)) {\n                return { statusCode: 400, headers, body: JSON.stringify({ error: `status is one of: ${JOB_STATUSES.join(', ')}.`, field: 'status' }) };");
    // Moved in §0.290: the create's first read is its held look (POST is a create, no upsert) — it was priorJob's. In order: the
    // refusal, the held look, the links (asked against none), the insert, the look again, the words alone — before any status
    // history, customer notice or audit.
    const steps = ['const landed = await heldJob(orgId, data.id);\n            if (landed) return landed;', 'const linked = await checkLinks(JOB_LINKS, data, null, orgId);',
        'const [w] = await db.insert(dispatchJobs).values(r).onConflictDoNothing({ target: dispatchJobs.id }).returning();',
        'if (!written) {\n                const beside = await heldJob(orgId, data.id);\n                if (beside) return beside;\n            }',
        "if (!written) return { statusCode: 409, headers, body: JSON.stringify({ error: 'That job id is already in use.' }) };",
        "await recordStatusChange(orgId, data.id, null, row.status, userId, 'Job created');",
        'await notifyCustomer({ orgId, before: null, after: written, actorName: await getCallerName(userId, orgId) });',
        "action: 'dispatch_job.created'"].map(at);
    assert.ok(p < steps[0], 'the create refuses before it reads or writes');
    for (let i = 1; i < steps.length; i++) assert.ok(steps[i - 1] < steps[i], `REGRESSION: the create's steps out of order — ${i}`);
    // Reversed in §0.290: POST was an upsert that kept the number and the maker of the job it found; a create writes neither over one.
    assert.ok(!f.includes('priorJob'), 'no create reads the job it would write over');
    assert.ok(f.includes("body: JSON.stringify({ error: 'That job id is already in use.', code: 'idInUse', job: normaliseJob(held) })"), 'the job as stored');
    assert.ok(f.includes('from(dispatchJobs).where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, orgId)));\n    return held ? {'), 'the held look in its org');
});

// ── §0.289: where the screen saw the job ──

const APPT = { scheduledDate: '2026-11-26', scheduledStart: '08:00', scheduledEnd: '10:00', timeSlot: 'exact', durationMinutes: 120 };
const CREW = { assignedTechId: 't1', coTechIds: ['t2'] };

test('J8 — what a screen saw: the appointment and the crew as stored — none of a field is empty, a slot never set is anytime, a crew list however it is held', () => {
    assert.deepEqual(seenOf(STORED), { fromAppointment: APPT, fromCrew: CREW });
    assert.deepEqual(seenOf({ ...STORED, coTechIds: '["t2"]' }), { fromAppointment: APPT, fromCrew: CREW }, 'a list held as JSON text');
    for (const bare of [{ id: 'j0' }, { id: 'j0', scheduledDate: null, scheduledStart: '', scheduledEnd: undefined, timeSlot: null, assignedTechId: null, coTechIds: null }]) {
        assert.deepEqual(seenOf(bare), { fromAppointment: { scheduledDate: '', scheduledStart: '', scheduledEnd: '', timeSlot: 'anytime', durationMinutes: '' }, fromCrew: { assignedTechId: '', coTechIds: [] } });
    }
    // The review: a job not seen as stored names nothing — none held, a row with no job behind it, one moved by a press whose answer proved nothing.
    for (const none of [null, undefined, {}, { status: 'scheduled', ...CREW }, { ...STORED, _maybe: true }]) assert.deepEqual(seenOf(none), {}, JSON.stringify(none));
    assert.deepEqual(seenOf({ ...STORED, coTechIds: ['t2', null, '', 5] }).fromCrew, CREW, 'a crew list its ids alone, as the database reads it');
    assert.equal(seenOf({ ...STORED, durationMinutes: '90' }).fromAppointment.durationMinutes, 90);
    assert.ok(!sameAppointment(STORED, { ...STORED, durationMinutes: 240 }), 'REGRESSION: a longer job read as the same appointment — scheduled for its old length');
    assert.ok(sameAppointment({ timeSlot: null }, { timeSlot: 'anytime', scheduledDate: '' }) && !sameAppointment(STORED, { ...STORED, scheduledEnd: '11:00' }));
    assert.ok(sameCrew({ coTechIds: '[]' }, { assignedTechId: '' }) && !sameCrew(STORED, { ...STORED, coTechIds: ['t3'] }) && !sameCrew(STORED, { ...STORED, assignedTechId: 't9' }));
    // The server's reading of a body: each named one, read the same way; none named, none asked.
    assert.deepEqual(seenIn({ title: 'x' }), { seen: {} });
    assert.deepEqual(seenIn({ fromStatus: 'scheduled', ...seenOf(STORED) }), { seen: { status: 'scheduled', appointment: APPT, crew: CREW } });
    assert.deepEqual(seenIn({ fromAppointment: {} }), { seen: { appointment: { scheduledDate: '', scheduledStart: '', scheduledEnd: '', timeSlot: 'anytime', durationMinutes: '' } } });
    assert.equal(seenIn({ fromAppointment: { durationMinutes: '240' } }).seen.appointment.durationMinutes, 240);
    assert.equal(seenIn({ fromStatus: 'gone' }).field, 'fromStatus');
    assert.equal(seenIn({ fromStatus: undefined }).field, 'fromStatus');
    for (const a of [null, undefined, 'x', 5, [], { scheduledDate: 5 }, { timeSlot: {} }, { durationMinutes: 'x' }, { durationMinutes: {} }]) assert.equal(seenIn({ fromAppointment: a }).field, 'fromAppointment', JSON.stringify(a));
    for (const c of [null, 'x', [], {}, { coTechIds: 't2' }, { assignedTechId: {}, coTechIds: [] }, { coTechIds: [1] }]) assert.equal(seenIn({ fromCrew: c }).field, 'fromCrew', JSON.stringify(c));
});

test('J9 — a save that sends the appointment or the crew names the one it saw, from the job as stored; one that sends neither names neither; a press names each it means', () => {
    // The Jobs editor: its form reads an end from the start and the length, and no slot as anytime — what it saw is the job's own.
    const odd = { ...STORED, scheduledEnd: '12:30', timeSlot: null };
    assert.deepEqual(jobChanges(editorFields(odd, 'loc1'), editorFields({ ...odd, durationHrs: 3 }, 'loc1'), 'j1', { seen: odd }),
        { id: 'j1', durationMinutes: 180, scheduledDate: '2026-11-26', scheduledStart: '08:00', scheduledEnd: '11:00', timeSlot: 'exact',
            fromAppointment: { scheduledDate: '2026-11-26', scheduledStart: '08:00', scheduledEnd: '12:30', timeSlot: 'anytime', durationMinutes: 120 } },
        "REGRESSION: an appointment sent with no word of the one it saw, or with the form's reading of it");
    assert.deepEqual(jobChanges(editorFields(STORED, 'loc1'), editorFields({ ...STORED, title: 'New' }, 'loc1'), 'j1', { seen: STORED }), { id: 'j1', title: 'New' }, 'a title beside another member\'s reschedule lands');
    assert.deepEqual(jobChanges(STORED, { assignedTechId: 't9', coTechIds: ['t2'] }, 'j1', { seen: STORED }), { id: 'j1', assignedTechId: 't9', coTechIds: ['t2'], fromCrew: CREW });
    // A press: Schedule now for another crew at the time it saw — the time not sent, and named.
    const sch = jobChanges(STORED, scheduleFields({ leadId: 't9', coIds: [], date: '2026-11-26', start: '08:00', end: '10:00', units: ['u1'] }), 'j1', { checkStatus: true });
    assert.deepEqual(sch, { id: 'j1', status: 'scheduled', assignedTechId: 't9', coTechIds: [], fromStatus: 'scheduled', fromAppointment: APPT, fromCrew: CREW },
        'REGRESSION: a crew given for a time another member has since moved lands at the new time');
    // Every press means both: a hold takes the job off the time it was seen at (the review).
    assert.deepEqual(Object.keys(jobChanges(STORED, heldCrewFields(['t1', 't2']), 'j1', { checkStatus: true })).filter((k) => k.startsWith('from')), ['fromStatus', 'fromAppointment', 'fromCrew']);
    assert.deepEqual(Object.keys(jobChanges(STORED, unassignFields(), 'j1', { checkStatus: true })).filter((k) => k.startsWith('from')), ['fromStatus', 'fromAppointment', 'fromCrew']);
    assert.equal(jobChanges({ ...STORED, status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledStart: null, scheduledEnd: null, assignedEquipmentIds: [] }, unassignFields(), 'j1', { checkStatus: true }), null, 'nothing to change: nothing sent');
    // The review: an editor that puts the job on the schedule names the appointment it goes on at; one that takes it off does not.
    const queued = { ...STORED, status: 'unscheduled' };
    assert.deepEqual(jobChanges(editorFields(queued, 'loc1'), editorFields({ ...queued, status: 'scheduled' }, 'loc1'), 'j1', { seen: queued }), { id: 'j1', status: 'scheduled', fromStatus: 'unscheduled', fromAppointment: APPT },
        'REGRESSION: a job scheduled from its status alone, its time moved since, confirmed at a time nobody chose');
    assert.deepEqual(jobChanges(editorFields(STORED, 'loc1'), editorFields({ ...STORED, status: 'cancelled' }, 'loc1'), 'j1', { seen: STORED }), { id: 'j1', status: 'cancelled', fromStatus: 'scheduled' });
    // A length sent alone (no start: the end stays none) names the appointment it is the length of.
    const noStart = { ...STORED, scheduledStart: null, scheduledEnd: null, timeSlot: 'morning' };
    const longer = jobChanges(editorFields(noStart, 'loc1'), editorFields({ ...noStart, durationHrs: 3 }, 'loc1'), 'j1', { seen: noStart });
    assert.deepEqual(Object.keys(longer).sort(), ['durationMinutes', 'fromAppointment', 'id']);
    // Mass-schedule: the diff against the row held now, what it saw the copy the plan was made on.
    const planned = { ...STORED, assignedTechId: 't8' };
    assert.equal(jobChanges(STORED, scheduleFields({ leadId: 't9', date: '2026-11-26', start: '08:00', end: '10:00' }), 'j1', { checkStatus: true, seen: planned }).fromCrew.assignedTechId, 't8', 'REGRESSION: a plan names the crew of a copy adopted after it');
    // A job the screen holds no copy of: nothing seen, nothing named.
    assert.deepEqual(jobChanges(undefined, unassignFields(), 'j9', { checkStatus: true }), { id: 'j9', ...unassignFields() });
});

test('J10 — a refusal says what moved, the status first', () => {
    const seen = { status: 'scheduled', appointment: APPT, crew: CREW };
    assert.equal(movedWords({ ...STORED, status: 'en_route', scheduledDate: 'x' }, seen), 'This job is en route now — it changed since you opened it. Nothing was saved.');
    assert.equal(movedWords({ ...STORED, status: null }, { status: 'scheduled' }), 'This job is unscheduled now — it changed since you opened it. Nothing was saved.');
    assert.equal(movedWords({ ...STORED, scheduledDate: '2026-12-01' }, seen), 'This job’s time changed since this screen loaded it. Nothing was saved.');
    assert.equal(movedWords({ ...STORED, durationMinutes: 240 }, seen), 'This job’s time changed since this screen loaded it. Nothing was saved.');
    assert.equal(movedWords({ ...STORED, coTechIds: [] }, seen), 'This job’s crew changed since this screen loaded it. Nothing was saved.');
    assert.equal(movedWords({ ...STORED, coTechIds: [], timeSlot: 'am' }, seen), 'This job’s time and crew changed since this screen loaded it. Nothing was saved.');
    assert.equal(movedWords(STORED, seen), 'This job changed since this screen loaded it. Nothing was saved.', 'moved and moved back since: still no claim of what');
    assert.equal(movedWords(STORED), 'This job changed since this screen loaded it. Nothing was saved.');
});

test("J11 — 'already' is an earlier press landed: all it sent held, and all else it relied on as it saw it (the review)", () => {
    const seen = { status: 'scheduled', appointment: APPT, crew: CREW };
    const crew = { updatedAt: new Date(), assignedTechId: 't9', coTechIds: '[]' };
    const landed = { ...STORED, assignedTechId: 't9', coTechIds: [] };
    assert.ok(pressLanded(landed, crew, seen), 'its own press, sent again');
    assert.ok(!pressLanded({ ...landed, scheduledDate: '2026-12-01' }, crew, seen), 'REGRESSION: the same crew by another member, at another time, said done');
    assert.ok(!pressLanded({ ...landed, durationMinutes: 240 }, crew, seen));
    assert.ok(!pressLanded({ ...landed, status: 'cancelled' }, crew, seen), 'REGRESSION: a cancelled job said done');
    const day = { updatedAt: new Date(), scheduledDate: '2026-11-27' };
    const moved = { ...STORED, scheduledDate: '2026-11-27' };
    assert.ok(pressLanded(moved, day, seen), 'the day sent, the rest of the appointment as seen');
    assert.ok(!pressLanded({ ...moved, scheduledStart: '14:00' }, day, seen));
    assert.ok(!pressLanded({ ...moved, assignedTechId: 't9' }, day, seen), 'REGRESSION: the same day by another member, for another crew, said done');
    assert.ok(!pressLanded(STORED, day, seen), 'what it sent is not held');
    assert.ok(pressLanded({ ...STORED, status: 'cancelled' }, { status: 'cancelled' }, { status: 'scheduled' }), 'a status sent is the one it moved to');
    assert.ok(pressLanded(moved, day), 'nothing named: what it sent alone, as before');
});

test('J12 — an editor refused over another appointment shows the stored one whole and says so; one refused over its crew or status keeps the time typed (the review)', () => {
    const stored = { ...STORED, scheduledDate: '2026-12-01', scheduledStart: null, scheduledEnd: null, timeSlot: 'morning' };
    const draft = { ...STORED, title: 'Mine', scheduledStart: '13:00', scheduledEnd: '15:00' };
    const shown = rebaseDraft(STORED, draft, stored, { refused: true });
    assert.deepEqual([shown.title, shown.scheduledDate, shown.scheduledStart, shown.scheduledEnd, shown.timeSlot], ['Mine', '2026-12-01', null, null, 'morning'],
        'REGRESSION: a start typed for one day beside the day another member moved it to');
    assert.ok(appointmentDropped(STORED, draft, stored));
    assert.ok(!appointmentDropped(STORED, { ...STORED, title: 'Mine' }, stored), 'no time typed: none dropped');
    assert.ok(!appointmentDropped(STORED, draft, { ...STORED, assignedTechId: 't9' }), 'the appointment stands: none dropped');
    assert.equal(rebaseDraft(STORED, draft, { ...STORED, assignedTechId: 't9' }, { refused: true }).scheduledStart, '13:00');
    assert.equal(rebaseDraft(STORED, draft, stored).scheduledStart, '13:00', 'a save that landed keeps what was typed while it was out');
});

// The database's half, by its lines (tests/integration/dispatch-race.itest.mjs runs them; this file is the harness's).
test('THE GUARD — the office write finds the job only where the save saw it: its status, its appointment and its crew, in the locked read; a miss is said by what moved', () => {
    const f = readFileSync(new URL('../netlify/functions/dispatch-jobs.mjs', import.meta.url), 'utf8').split('\r\n').join('\n');
    const at = f.indexOf('async function officeWrite(orgId, id, updates, saw = {}) {');
    assert.ok(at > 0);
    const write = f.slice(at, f.indexOf('\n}\n', at));
    for (const line of ["saw.status === undefined ? undefined : textIs(dispatchJobs.status, 'unscheduled', saw.status),",
        "a && and(textIs(dispatchJobs.scheduledDate, '', a.scheduledDate), textIs(dispatchJobs.scheduledStart, '', a.scheduledStart),",
        "textIs(dispatchJobs.scheduledEnd, '', a.scheduledEnd), textIs(dispatchJobs.timeSlot, 'anytime', a.timeSlot),",
        "sql`coalesce(${dispatchJobs.durationMinutes}::text, '') = ${String(a.durationMinutes)}`),",
        "c && and(textIs(dispatchJobs.assignedTechId, '', c.assignedTechId), sql`${coCrew} = ${JSON.stringify(c.coTechIds)}::jsonb`));",
        ".where(and(eq(dispatchJobs.id, id), eq(dispatchJobs.orgId, orgId), seen)).for('update'));"]) assert.ok(write.includes(line), `REGRESSION: missing — ${line}`);
    assert.ok(f.includes("const textIs = (col, none, v) => sql`coalesce(nullif(${col}, ''), ${none}) = ${v}`;"));
    assert.ok(f.includes('if (!written) return await missedOfficeJob(orgId, id, updates, named.seen);'));
    assert.ok(f.includes("JSON.stringify({ error: movedWords(now, saw), job, code: 'stale' })"));
    const d = readFileSync(new URL('../src/Tabs/DispatchTab.jsx', import.meta.url), 'utf8').split('\r\n').join('\n');
    assert.ok(d.includes('editorFields(draft, locationId), draft.id, { seen: base });'), 'REGRESSION: the Jobs editor names no appointment it saw');
    assert.ok(d.includes("if (seenOf(job._raw).fromCrew) payload = { ...payload, ...(KNOWN_STATUSES.includes(at) ? { fromStatus: at } : {}), ...seenOf(job._raw) };"), 'REGRESSION: the week drag names nothing it saw');
    assert.ok(f.includes('if (pressLanded(now, updates, saw)) return { statusCode: 409,'));
    // The crew list as stored, read as the screen reads it: a list, JSON text of one, one id, JSON text of nothing.
    for (const line of ["const coList = sql`case when jsonb_typeof(${co}) = 'array' then ${co}",
        "when jsonb_typeof(${co}) <> 'string' then '[]'::jsonb",
        "when not ((${co} #>> '{}') is json) then jsonb_build_array(${co} #>> '{}')",
        "when jsonb_typeof((${co} #>> '{}')::jsonb) = 'array' then (${co} #>> '{}')::jsonb",
        "when jsonb_typeof((${co} #>> '{}')::jsonb) = 'string' then jsonb_build_array((${co} #>> '{}')::jsonb)",
        "else '[]'::jsonb end`;",
        "const coCrew = sql`coalesce((select jsonb_agg(t.e order by t.n) from jsonb_array_elements(${coList}) with ordinality as t(e, n) where jsonb_typeof(t.e) = 'string' and t.e <> '\"\"'::jsonb), '[]'::jsonb)`;",
        "updates.coTechIds    = JSON.stringify(data.coTechIds || []);"]) assert.ok(f.includes(line), `REGRESSION: missing — ${line}`);
    for (const line of ["if (answer === 'stale' && onAdopt) { onAdopt(r.body.job); setReseed(n => n + 1); }\n", "if (answer === 'stale' && onAdopt) { onAdopt(r.body.job); setReseed(n => n + 1); }   // the job as stored", '}, [selectedJob?.id, reseed]);',
        "if (appointmentDropped(base, draft, r.body.job)) dropped = ' Its time is shown as it is now — choose yours again.';", 'if (crew.includes(blk.techId)) notFreed.push({ id: jobId,', 'else noLonger.push(jobId);']) assert.ok(d.includes(line), `REGRESSION: missing — ${line}`);
});
