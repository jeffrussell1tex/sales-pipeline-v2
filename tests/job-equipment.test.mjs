// tests/job-equipment.test.mjs
//
// Equipment on a job (state §0.116). Jeff, in three steps: "I do not see where an
// equipment requirement is listed" → "HVAC is not a type of equipment … show the
// name of the actual piece" → "I don't want to require a specific unit. I want to
// require a kind of equipment. If I need a pressure tester and we have 10 of them
// I don't care which one I get as long as there is one assigned to me and the
// job at the day and time needed." So: a requirement is a KIND (the Category on
// the fleet's units, named the way a technician asks for it); the Jobs editor and
// the new-job form pick kinds and show a stale entry as a removable chip; and
// SCHEDULING RESERVES one in-service unit of each kind that no overlapping job
// holds that day, stores it on the job (assigned_equipment_ids), shows it, and
// releases it whenever the job goes back to unscheduled. Source scans (§18b23);
// the storage rule is proved against the test database in
// tests/integration/customer-notify.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jobChanges, scheduleFields, heldCrewFields, unassignFields, editorFields, rebaseDraft, sentOf, jobAnswerOf } from '../src/utils/jobChanges.js';
import { writeRefusalOf, refusalError, thrownSaid } from '../src/utils/refusalWords.js';
import { to12h } from '../src/utils/customerNotifications.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const s = code(read('src/Tabs/DispatchTab.jsx'));
// Since §0.286 an office save's fields are built in src/utils/jobChanges.js (scheduleFields, heldCrewFields, unassignFields,
// editorFields) and sent as jobChanges' body — only what the press changes from the job as the screen holds it.
const jc = code(read('src/utils/jobChanges.js'));
const boardJobOf = s.slice(s.indexOf('const boardJobOf = (j, customers) => {'), s.indexOf('export default function DispatchTab()'));

test('the kind and skill chips read as toggles — "+ Kind" off, "✓ Kind" on, role=checkbox — and the forms say to click them', () => {
    // Jeff: "There is no way to add equipment under required equipment." The
    // pills toggled on click (observed in the pane, both forms) but looked like
    // labels; nothing said they were controls.
    assert.equal((s.match(/role="checkbox" aria-checked=\{!!on\}/g) || []).length, 5, 'skills in the technician editor, skills and kinds in the Jobs editor, skills and kinds in the new-job form');
    assert.ok(s.includes("                                                        {on ? '✓ ' : '+ '}{kind}"), 'Jobs editor kinds');
    assert.ok(s.includes("                                                    {on ? '✓ ' : '+ '}{kind}"), 'new-job form kinds');
    assert.ok(s.includes("{on ? '✓ ' : '+ '}{sk.name}"), 'Jobs editor skills');
    assert.ok(s.includes("                                                        {on ? '✓ ' : '+ '}{s.name}"), 'new-job form skills');
    assert.ok(s.includes('<strong>Click a kind to require it; click again to drop it.</strong>'), 'the Jobs editor says so');
    assert.ok(s.includes('Click a kind to require it; click again to drop it. In service over total.'), 'the new-job form says so');
});

test('a requirement is a kind: the editor and the new-job form pick categories, and a stale entry is a removable chip', () => {
    assert.ok(s.includes('<CustFieldRow label="Required equipment">'));
    assert.ok(s.includes("const kindList = [...new Set(units.map(u => (u.category || '').trim()).filter(Boolean))].sort();"));
    assert.ok(s.includes('const unknown = req.filter(r => !kindList.includes(r));'));
    assert.ok(s.includes('                                            {unknown.map(r => ('), 'a stored entry that is not a kind is shown, not hidden');
    assert.ok(s.includes('⚠ {r} — not a kind in Vehicles &amp; equipment · remove ×'));
    assert.ok(s.includes("const toggle = (v) => set('equipmentIds', req.includes(v) ? req.filter(x => x !== v) : [...req, v]);"));
    assert.ok(s.includes('name it the way a'), 'the editor tells the dispatcher what a kind is');
    assert.ok(s.includes('<strong>Reserved for this job:</strong>'), 'the reservation is shown, read-only');
    // the new-job form
    assert.ok(s.includes('{equipCategories.map(kind => {\n                                            const on    = (newJobForm.equipCategories || []).includes(kind);'));
    assert.ok(!s.includes('(newJobForm.equipCategories || []).includes(u.id)'), 'no unit picker remains');
    assert.ok(jc.includes('    equipmentIds:    Array.isArray(job.equipmentIds) ? job.equipmentIds : [],'), 'the editor saves the kinds (editorFields, §0.286)');
    assert.ok(s.includes('const body = jobChanges(editorFields(base, base.locationId), editorFields(draft, locationId), draft.id);'), "through the editor's Save");
    const opened = { id: 'j1', title: 'T', status: 'unscheduled', equipmentIds: ['Pressure tester'] };
    assert.deepEqual(jobChanges(editorFields(opened, null), editorFields({ ...opened, equipmentIds: ['Pressure tester', 'Ladder'] }, null), 'j1'),
        { id: 'j1', equipmentIds: ['Pressure tester', 'Ladder'] }, 'a kind added sends the kinds, nothing else');
    assert.deepEqual(editorFields({ title: 'T', equipmentIds: 'not a list' }, null).equipmentIds, [], 'a stored non-list is sent as none');
});

test('the conflict check counts a kind against what overlapping jobs hold: reserved units when they have them, requirements otherwise', () => {
    assert.ok(s.includes('const rivals = overlappingRivals(job, allJobs, dateStr, probe);'));
    assert.ok(s.includes("((j.equipCategories || []).length > 0 || (j.assignedEquipment || []).length > 0) &&"), 'a rival competes if it requires OR holds equipment');
    assert.ok(s.includes('const committed = rivals.reduce((n, j) => n + committedOfKind(j, kind, units), 0);'));
    assert.ok(s.includes("return reserved.filter(id => ((units || []).find(u => u.id === id)?.category || '').trim() === kind).length;"), 'reserved units count by their kind');
    assert.ok(s.includes('return (rival.equipCategories || []).filter(k => k === kind).length;'), 'a rival without a reservation counts its requirement');
    assert.ok(s.includes("if (c.missing) return `${c.cat} — not a kind in Vehicles & equipment (remove it under Jobs, or set a unit's Category to it)`;"));
    assert.ok(s.includes("return `${c.cat} — all ${c.usable} available unit(s) reserved by overlapping jobs that day`;"));
    assert.ok(!s.includes('const unit = (units || []).find(u => u.id === req);'), 'no unit-as-requirement branch');
});

test('scheduling reserves one in-service unit per kind that no overlapping job holds, first by name, never the same unit twice', () => {
    assert.ok(s.includes('const pickEquipmentFor = (kinds, units = [], rivals = [], alsoTaken = []) => {'));
    assert.ok(s.includes('const taken = new Set([...rivals.flatMap(j => j.assignedEquipment || []), ...alsoTaken]);'));
    assert.ok(s.includes("            .filter(x => { const st = x.status || 'available'; return st !== 'maintenance' && st !== 'out_of_service'; })"));
    assert.ok(s.includes('            .filter(x => !taken.has(x.id) && !picked.includes(x.id))'));
    assert.ok(s.includes("            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))[0];"));
    // the crew builder's write
    assert.ok(s.includes('        const reservedUnits = pickEquipmentFor(\n            selectedJob.equipCategories, equipUnits,'));
    assert.ok(s.includes('const body = jobChanges(selectedJob._raw, scheduleFields({ leadId, coIds, date: dateStr, start: scheduleTime, end: endStr, units: reservedUnits }), selectedJob.id, { checkStatus: true });'),
        'the reservation rides the schedule PUT (scheduleFields, §0.286), its status checked (the §0.286 review)');
    assert.ok(jc.includes("    scheduledDate: date, scheduledStart: start, scheduledEnd: end, timeSlot: 'exact',\n    assignedEquipmentIds: units,"), 'scheduleFields names the units');
    const queued = { id: 'j1', status: 'unscheduled', assignedTechId: null, coTechIds: [], assignedEquipmentIds: [] };
    assert.deepEqual(jobChanges(queued, scheduleFields({ leadId: 't1', coIds: [], date: '2026-09-15', start: '09:00', end: '11:00', units: ['u1'] }), 'j1'),
        { id: 'j1', status: 'scheduled', assignedTechId: 't1', coTechIds: [], scheduledDate: '2026-09-15', scheduledStart: '09:00', scheduledEnd: '11:00',
            timeSlot: 'exact', assignedEquipmentIds: ['u1'], fromStatus: 'unscheduled' }, 'run: the reserved unit is in the body');
    assert.ok(s.includes('                assignedEquipment: reservedUnits,\n            });'), 'the parent learns it');
    assert.ok(s.includes("+ (reservedUnits.length ? ` Reserved: ${reservedUnits.map(id => unitLabel(id, equipUnits)).join(', ')}.` : '')"), 'the success banner names the reserved units');
    // the mass scheduler's writes
    assert.ok(s.includes('        const reservedThisRun = [];'));
    assert.ok(s.includes('                reservedThisRun).picked;'), 'units reserved earlier in the same pass are not offered again');
    assert.ok(s.includes('                    date: pr.dateStr, start: startS, end: endS, units: pr.assignedEquipment }), pr.job.id, { checkStatus: true });'), "the mass scheduler's units ride its scheduleFields, its status checked");
    assert.ok(s.includes('                reservedThisRun.push(...pr.assignedEquipment);'));
    assert.ok(s.includes("                assignedEquipment: pr.assignedEquipment || [] } : j;"));
});

test('the board job carries its reservation, shows it, and drops it when the job leaves the schedule', () => {
    assert.ok(s.includes('assignedEquipment: Array.isArray(j.assignedEquipmentIds) ? j.assignedEquipmentIds : [],'), 'from the server');
    // Since §0.286 an editor save (and every answer a sender adopts) goes through that same mapping: adoptJob → boardJobOf.
    assert.ok(boardJobOf.includes('assignedEquipment: Array.isArray(j.assignedEquipmentIds) ? j.assignedEquipmentIds : [],'), 'the one mapping carries it');
    assert.equal(s.split('assignedEquipment: Array.isArray(').length - 1, 1, 'no second mapping of its own');
    assert.ok(s.includes('onSaved={saved => { adoptJob(saved); ') && s.includes('setJobs(prev => prev.map(j => (j.id === row.id ? { ...j, ...boardJobOf(row, customers) } : j)));'), 'after an editor save');
    assert.ok(s.includes("> · reserved: {(selectedJob.assignedEquipment || []).map(id => unitLabel(id, equipUnits)).join(', ')}</span>"), 'the crew builder shows what is reserved');
    assert.ok(s.includes("(not a kind in Vehicles &amp; equipment — remove it under Jobs)"), 'and names a requirement no unit matches');
    assert.ok(s.includes("start: null, status: 'unscheduled', window: 'TBD', assignedEquipment: [] } : j));"), 'a held crew has no reservation');
    assert.ok(s.includes("? { ...j, assignedTechIds: [], start: null, status: 'unscheduled', window: 'TBD', assignedEquipment: [] }"), 'a time-off unassign has none either');
    // And on the server: since §0.286 the hold and the unassign release the units by name (the server released them only
    // when a body named the status 'unscheduled'). Moved in the §0.286 review: both are status presses (checkStatus) —
    // whenever they send anything they name the status, unchanged or not, and where the screen saw the job.
    const CHECK = { checkStatus: true };
    assert.ok(s.includes('const body = jobChanges((jobs.find(j => j.id === jobId) || {})._raw, unassignFields(), jobId, { checkStatus: true });'),
        'the time-off unassign, as saveBlock sends it');
    const reserved = { id: 'j1', status: 'unscheduled', assignedTechId: 't1', coTechIds: [], assignedEquipmentIds: ['u1'] };
    assert.deepEqual(jobChanges(reserved, heldCrewFields(['t1']), 'j1', CHECK),
        { id: 'j1', assignedEquipmentIds: [], status: 'unscheduled', fromStatus: 'unscheduled' }, 'a held crew releases its units, its status named as seen');
    assert.deepEqual(jobChanges(reserved, unassignFields(), 'j1', CHECK),
        { id: 'j1', assignedTechId: null, coTechIds: [], assignedEquipmentIds: [], status: 'unscheduled', fromStatus: 'unscheduled' },
        'a time-off unassign over a copy already unscheduled releases them too, naming its status and where it saw it (no time held, none sent)');
    assert.equal(jobChanges({ ...reserved, assignedTechId: null, assignedEquipmentIds: [] }, unassignFields(), 'j1', CHECK), null, 'a job already free needs no write');
    const placed = { ...reserved, status: 'scheduled', scheduledStart: '09:00', scheduledEnd: '11:00' };
    assert.deepEqual(jobChanges(placed, unassignFields(), 'j1', CHECK),
        { id: 'j1', status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledStart: null, scheduledEnd: null, assignedEquipmentIds: [], fromStatus: 'scheduled' },
        'an unassign of a scheduled job: back to the queue from where it stood');
    assert.ok(s.includes('const unitLabel = (id, units = []) => {'));
});

test('server: assignedEquipmentIds is a JSON field on create and PUT, and a job returning to unscheduled releases it', () => {
    const f = code(read('netlify/functions/dispatch-jobs.mjs'));
    assert.ok(f.includes('assignedEquipmentIds: row.assignedEquipmentIds ?? row.assigned_equipment_ids ?? [],'));
    assert.ok(f.includes('assignedEquipmentIds: JSON.stringify(data.assignedEquipmentIds ?? []),'), 'create');
    assert.ok(f.includes("if ('assignedEquipmentIds' in data) updates.assignedEquipmentIds = JSON.stringify(data.assignedEquipmentIds ?? []);"));
    assert.ok(f.includes("else if (data.status === 'unscheduled') updates.assignedEquipmentIds = JSON.stringify([]);"), 'released by ANY path that unschedules');
    const schema = read('db/schema.ts');
    assert.ok(schema.includes("assignedEquipmentIds: jsonb('assigned_equipment_ids'),"), 'nullable, additive');
    const guard = read('tests/integration/_schema-guard.mjs');
    assert.ok(guard.includes("['dispatch_jobs', 'assigned_equipment_ids'],"), 'the test database must carry it');
});

// ── RUN (the §0.286 review): the crew builder's Schedule now, the parent's onScheduled and keepSent, Mass-schedule and the
// Jobs editor's landed save — extracted from DispatchTab.jsx and run over stubs, the helpers of jobChanges.js real. ──
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); const j = src.indexOf(b, i + a.length); assert.ok(j > i, b); return src.slice(i, j); };
const answerOf = (status, body) => ({ ok: status < 400, status, json: async () => { if (body instanceof Error) throw body; return body; } });
const UNREADABLE = () => new SyntaxError("Unexpected token '<'");
const hhToNum = new Function(`${between(s, 'const hhToNum = ', ';\n')};\nreturn hhToNum;`)();
const hhmm = new Function(`${between(s, 'const hhmm = ', ';\n')};\nreturn hhmm;`)();
const fetchOf = (st, answers) => async (url, opts) => {
    st.sent.push([url, opts.method, JSON.parse(opts.body)]);
    const id = new URL(url, 'http://x.test').searchParams.get('id');
    const a = answers[id];
    if (a instanceof Error) throw a;
    return a;
};
// The parent's keepSent over two copies held as plain state; adoptJob recorded.
const parentOf = (jobsRaw, jobs) => {
    const st = { raw: jobsRaw, jobs, kept: [], adopted: [], audit: [], selected: [] };
    st.setJobsRaw = (f) => { st.raw = typeof f === 'function' ? f(st.raw) : f; };
    st.setJobs = (f) => { st.jobs = typeof f === 'function' ? f(st.jobs) : f; };
    const real = new Function('setJobsRaw', 'setJobs', `${between(s, '    const keepSent = (id, sent) => {', '\n    };')}\n    };\nreturn keepSent;`)(st.setJobsRaw, st.setJobs);
    st.keepSent = (id, sent) => { st.kept.push([id, sent]); real(id, sent); };
    st.adoptJob = (row) => { st.adopted.push(row); };
    return st;
};

const runSchedule = async (selectedJob, { added = ['t1'], date = '2026-09-15', time = '10:00', units = ['u1'], answer } = {}) => {
    const fn = between(s, '    const handleSchedule = async () => {', '\n    const writeHeldCrew = ');
    const st = { sent: [], scheduled: [], adopted: [], errors: [] };
    const names = ['addedTechs', 'selectedJob', 'scheduleDate', 'scheduleTime', 'setScheduleError', 'techs', 'shiftForDate', 'hhToNum', 'blocksOnDate',
        'blocks', 'blockTypes', 'equipmentConflicts', 'jobs', 'equipUnits', 'describeConflict', 'pickEquipmentFor', 'overlappingRivals',
        'setScheduleNotice', 'setSaving', 'requestOrg', 'stillOrg', 'jobChanges', 'scheduleFields', 'sentOf', 'jobAnswerOf', 'dbFetch',
        'writeRefusalOf', 'refusalError', 'thrownSaid', 'onAdopt', 'candidates', 'onScheduled', 'showNotice', 'to12h', 'unitLabel',
        'setAddedTechs', 'setScheduleTime', 'setScheduleDate'];
    const handleSchedule = new Function(...names, `${fn}\nreturn handleSchedule;`)(
        Object.fromEntries(added.map((id) => [id, true])), selectedJob, date, time, (v) => { if (v) st.errors.push(v); },
        [{ id: 't1', name: 'Ann Lee' }, { id: 't2', name: 'Bob Ray' }], () => null, hhToNum, () => [],
        [], [], () => [], [], [], () => '', () => ({ picked: units }), () => [],
        () => {}, () => {}, () => 'org_a', () => true, jobChanges, scheduleFields, sentOf, jobAnswerOf, fetchOf(st, { [selectedJob.id]: answer }),
        writeRefusalOf, refusalError, thrownSaid, (j) => st.adopted.push(j), [], (o) => st.scheduled.push(o), () => {}, to12h, (id) => id,
        () => {}, () => {}, () => {});
    await handleSchedule();
    return st;
};

test('Schedule now over a copy already scheduled names its status and where it saw it; nothing to change sends nothing; an unreadable answer hands up what was sent — RUN', async () => {
    const raw = { id: 'j1', title: 'Boiler', status: 'scheduled', assignedTechId: 't1', coTechIds: [], scheduledDate: '2026-09-15',
        scheduledStart: '09:00', scheduledEnd: '11:00', timeSlot: 'exact', assignedEquipmentIds: ['u1'] };
    const job = { id: 'j1', title: 'Boiler', customer: 'Acme', scheduledDate: '2026-09-15', durationHrs: 2, equipCategories: ['Ladder'], _raw: raw };
    const stored = { ...raw, scheduledStart: '10:00', scheduledEnd: '12:00' };
    const st = await runSchedule(job, { answer: answerOf(200, { job: stored }) });
    assert.deepEqual(st.errors, []);
    assert.deepEqual(st.sent, [['/.netlify/functions/dispatch-jobs?id=j1', 'PUT', { id: 'j1', scheduledDate: '2026-09-15', scheduledStart: '10:00',
        scheduledEnd: '12:00', timeSlot: 'exact', status: 'scheduled', fromStatus: 'scheduled' }]],
        'the appointment moved; the crew and the reserved unit unchanged, unsent; the status unchanged, named with where it was seen');
    assert.equal(st.scheduled[0].serverJob, stored);
    assert.deepEqual(st.scheduled[0].sent, { scheduledDate: '2026-09-15', scheduledStart: '10:00', scheduledEnd: '12:00', timeSlot: 'exact', status: 'scheduled' });
    assert.deepEqual(st.scheduled[0].assignedEquipment, ['u1']);

    // The schedule the job already holds: no PUT, checkStatus or not.
    const same = await runSchedule(job, { time: '09:00', answer: answerOf(500, {}) });
    assert.deepEqual(same.sent, []);
    assert.equal(same.scheduled[0].serverJob, null); assert.equal(same.scheduled[0].sent, null);

    // Landed, unreadable: no answer, what was sent handed up.
    const lost = await runSchedule(job, { answer: answerOf(200, UNREADABLE()) });
    assert.deepEqual(lost.errors, []);
    assert.equal(lost.scheduled[0].serverJob, null);
    assert.deepEqual(lost.scheduled[0].sent, { scheduledDate: '2026-09-15', scheduledStart: '10:00', scheduledEnd: '12:00', timeSlot: 'exact', status: 'scheduled' });

    // Moved since by another member (a technician's Start travel): refused stale, the job as stored adopted, the words said.
    const enRoute = { ...raw, status: 'en_route' };
    const stale = await runSchedule(job, { answer: answerOf(409, { error: 'This job is en route now — it changed since you opened it. Nothing was saved.', code: 'stale', job: enRoute }) });
    assert.deepEqual(stale.adopted, [enRoute]); assert.deepEqual(stale.scheduled, []);
    assert.deepEqual(stale.errors, ['Boiler: This job is en route now — it changed since you opened it. Nothing was saved.']);
});

test('the parent’s onScheduled: an answer adopted; one that could not be read kept as sent in both copies and the base, then guessed on the board — RUN', () => {
    const arrow = between(s, 'onScheduled={', '}/>\n').slice('onScheduled={'.length).trim();
    assert.ok(!arrow.includes('publicToken') && !arrow.includes('customerNotifications'), 'the guess map no longer reads the answer’s notice fields');
    const run = (p) => new Function('adoptJob', 'keepSent', 'setJobs', 'addAudit', 'setSelectedJobId', `return ${arrow};`)(
        p.adoptJob, p.keepSent, p.setJobs, (...a) => p.audit.push(a), (v) => p.selected.push(v));
    const raw = { id: 'j1', title: 'Boiler', status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledDate: null, scheduledStart: null,
        scheduledEnd: null, timeSlot: 'anytime', assignedEquipmentIds: [] };
    const row = { id: 'j1', title: 'Boiler', start: null, status: 'unscheduled', assignedTechIds: [], assignedEquipment: [], _raw: raw };
    const sent = scheduleFields({ leadId: 't1', coIds: ['t2'], date: '2026-09-15', start: '10:00', end: '12:00', units: ['u1'] });
    const press = { jobId: 'j1', jobName: 'Boiler', techIds: ['t1', 't2'], crewNames: ['Ann Lee', 'Bob Ray'], startHr: 10, startTime: '10:00',
        startDate: '2026-09-15', overridden: [], assignedEquipment: ['u1'] };

    const p = parentOf([raw], [row]);
    run(p)({ ...press, serverJob: null, sent });
    assert.deepEqual(p.kept, [['j1', sent]]);
    assert.deepEqual(p.raw, [{ ...raw, ...sent }], 'the Jobs view’s copy holds what was sent');
    assert.deepEqual(p.jobs[0]._raw, { ...raw, ...sent }, 'the board’s base too');
    assert.equal(p.jobs[0].status, 'scheduled'); assert.equal(p.jobs[0].start, 10); assert.deepEqual(p.jobs[0].assignedEquipment, ['u1']);
    // The next press diffs from the base as sent: the same schedule sends nothing; a hold names 'scheduled' as where it saw it.
    assert.equal(jobChanges(p.jobs[0]._raw, sent, 'j1', { checkStatus: true }), null, 'the landed schedule is not sent again');
    assert.equal(jobChanges(p.jobs[0]._raw, heldCrewFields(['t1', 't2']), 'j1', { checkStatus: true }).fromStatus, 'scheduled');
    assert.equal(jobChanges(raw, sent, 'j1', { checkStatus: true }).fromStatus, 'unscheduled', 'from the old base it named the status it no longer holds');
    assert.deepEqual(p.audit[0].slice(0, 3), ['dispatch.schedule', 'dispatch_job', 'j1']);
    assert.deepEqual(p.selected, [null]);

    const q = parentOf([raw], [row]);
    const stored = { ...raw, ...sent };
    run(q)({ ...press, serverJob: stored, sent });
    assert.deepEqual(q.adopted, [stored]); assert.deepEqual(q.kept, []); assert.equal(q.jobs[0], row, 'no guess over an answer');
});

test('Mass-schedule: a copy already scheduled names its status; an unreadable answer is kept as sent after the adopted — RUN', async () => {
    const fn = between(s, '    const confirmMassSchedule = async () => {', '\n    const [unassignError, setUnassignError]');
    const rawA = { id: 'jA', title: 'Boiler', status: 'scheduled', assignedTechId: 't1', coTechIds: [], scheduledDate: '2026-09-21',
        scheduledStart: '09:00', scheduledEnd: '11:00', timeSlot: 'exact', assignedEquipmentIds: [] };
    const rawB = { id: 'jB', title: 'Furnace', status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledDate: null,
        scheduledStart: null, scheduledEnd: null, timeSlot: 'anytime', assignedEquipmentIds: [] };
    const rowA = { id: 'jA', title: 'Boiler', durationHrs: 2, equipCategories: [], assignedTechIds: ['t1'], status: 'scheduled', start: 9, _raw: rawA };
    const rowB = { id: 'jB', title: 'Furnace', durationHrs: 2, equipCategories: [], assignedTechIds: [], status: 'unscheduled', start: null, _raw: rawB };
    const t1 = { id: 't1' }, t2 = { id: 't2' };
    const prA = { job: rowA, tech: t2, crew: [t2], dateStr: '2026-09-22', startHr: 10 };
    const prB = { job: rowB, tech: t1, crew: [t1, t2], dateStr: '2026-09-22', startHr: 13 };
    const storedA = { ...rawA, assignedTechId: 't2', scheduledDate: '2026-09-22', scheduledStart: '10:00', scheduledEnd: '12:00' };
    const p = parentOf([rawA, rawB], [rowA, rowB]);
    const st = { sent: [], prog: [], plan: [] };
    const names = ['massPlan', 'setMassSaving', 'setMassProg', 'requestOrg', 'stillOrg', 'pickEquipmentFor', 'equipment', 'overlappingRivals', 'jobs',
        'hhmm', 'jobChanges', 'scheduleFields', 'sentOf', 'dbFetch', 'writeRefusalOf', 'jobAnswerOf', 'refusalError', 'thrownSaid',
        'adoptJob', 'keepSent', 'setJobs', 'addAudit', 'setMassPlan'];
    const confirmMassSchedule = new Function(...names, `${fn}\nreturn confirmMassSchedule;`)(
        { proposals: [prA, prB], fromStr: '2026-09-21', toStr: '2026-09-25', skipped: [] }, () => {}, (v) => st.prog.push(v), () => 'org_a', () => true,
        () => ({ picked: [] }), [], () => [], [rowA, rowB], hhmm, jobChanges, scheduleFields, sentOf,
        fetchOf(st, { jA: answerOf(200, { job: storedA }), jB: answerOf(200, UNREADABLE()) }), writeRefusalOf, jobAnswerOf, refusalError, thrownSaid,
        p.adoptJob, p.keepSent, p.setJobs, (...a) => p.audit.push(a), (v) => st.plan.push(v));
    await confirmMassSchedule();
    assert.deepEqual(st.sent.map(([, , b]) => b), [
        { id: 'jA', assignedTechId: 't2', coTechIds: [], scheduledDate: '2026-09-22', scheduledStart: '10:00', scheduledEnd: '12:00', timeSlot: 'exact',
            status: 'scheduled', fromStatus: 'scheduled' },
        { id: 'jB', status: 'scheduled', assignedTechId: 't1', coTechIds: ['t2'], scheduledDate: '2026-09-22', scheduledStart: '13:00', scheduledEnd: '15:00',
            timeSlot: 'exact', fromStatus: 'unscheduled' },
    ], 'A, already scheduled, names its unchanged status and where it was seen; B moves from unscheduled');
    assert.deepEqual(p.adopted, [storedA], 'the answered job adopted');
    const sentB = sentOf(st.sent[1][2]);
    assert.deepEqual(p.kept, [['jB', sentB]], 'the unreadable one kept as sent');
    assert.deepEqual(p.raw, [rawA, { ...rawB, ...sentB }], 'the Jobs view’s copy of B holds what was sent');
    assert.deepEqual(p.jobs[1]._raw, { ...rawB, ...sentB }, 'and B’s board base');
    assert.equal(p.jobs[1].status, 'scheduled'); assert.deepEqual(p.jobs[1].assignedTechIds, ['t1', 't2']);
    assert.equal(p.jobs[0], rowA, 'the adopted job left to adoptJob, no guess over it');
    assert.equal(jobChanges(p.jobs[1]._raw, heldCrewFields(['t1', 't2']), 'jB', { checkStatus: true }).fromStatus, 'scheduled', 'a press after it names where B stands now');
    assert.deepEqual(st.plan, [null], 'all landed: the panel closes');
});

test('the Jobs editor’s landed save rebases the draft onto the job as stored, keeping what was typed while it was out — RUN', () => {
    const tail = between(s, '            const stored = data.job || ', "            setStatus({ kind: 'ok', msg: 'Saved' });");
    // Moved in §0.286's review: functional, and only while the editor still shows the job saved (the list stays live).
    assert.ok(tail.includes('setDraft(d => (d && d.id === draft.id ? rebaseDraft(base, { ...d, locationId }, stored) : d));'), 'functional: keystrokes typed while out are kept');
    assert.ok(tail.includes('if (opened.current?.id === draft.id) opened.current = { ...stored };'), 'the base only for the job still shown');
    assert.ok(s.includes('setDraft(d => (d && d.id === draft.id ? rebaseDraft(base, { ...d, locationId }, r.body.job) : d));'), 'the stale path is functional too');
    const run = ({ data, selected, base, body, typed }) => {
        const st = { saved: [], selectedIds: [], draft: typed, opened: { current: base } };
        new Function('data', 'selected', 'base', 'sentOf', 'body', 'onSaved', 'setDraft', 'rebaseDraft', 'locationId', 'opened', 'setSelectedId', 'draft', tail)(
            data, selected, base, sentOf, body, (j) => st.saved.push(j), (f) => { st.draft = typeof f === 'function' ? f(st.draft) : f; },
            rebaseDraft, 'loc1', st.opened, (v) => st.selectedIds.push(v), { id: base.id });
        return st;
    };
    const base = { id: 'j1', title: 'Boiler', status: 'unscheduled', priority: 'normal', durationMinutes: 120, equipmentIds: ['Ladder'],
        scheduledDate: null, scheduledStart: null, timeSlot: 'anytime', locationId: 'loc1' };
    const draft = { ...base, equipmentIds: ['Ladder', 'Pressure tester'] };
    const body = jobChanges(editorFields(base, base.locationId), editorFields(draft, 'loc1'), 'j1');
    assert.deepEqual(body, { id: 'j1', equipmentIds: ['Ladder', 'Pressure tester'] }, 'the kind added, alone');
    // Another member scheduled the job since the editor opened; the member typed a title while the request was out.
    const stored = { ...base, equipmentIds: ['Ladder', 'Pressure tester'], status: 'scheduled', scheduledDate: '2026-09-15', scheduledStart: '09:00', timeSlot: 'exact' };
    const typed = { ...draft, title: 'Boiler (rush)' };
    const st = run({ data: { job: stored }, selected: base, base, body, typed });
    assert.deepEqual(st.saved, [stored]); assert.deepEqual(st.selectedIds, ['j1']);
    assert.equal(st.draft.status, 'scheduled', 'a field another member changed, untouched here, takes the stored value');
    assert.equal(st.draft.scheduledStart, '09:00');
    assert.equal(st.draft.title, 'Boiler (rush)', 'what was typed while the request was out survives');
    assert.deepEqual(st.draft.equipmentIds, ['Ladder', 'Pressure tester']);
    assert.equal(st.opened.current.status, 'scheduled', 'the base the next Save diffs against is the job as stored');
    const second = jobChanges(editorFields(st.opened.current, st.opened.current.locationId), editorFields(st.draft, 'loc1'), 'j1');
    assert.deepEqual(second, { id: 'j1', title: 'Boiler (rush)' }, 'a second Save sends the typed title alone — never the old status, no fromStatus');

    // An answer that cannot be read: kept as sent — the job the list holds with what was sent over it; nothing selected anew.
    const lost = run({ data: {}, selected: base, base, body, typed: draft });
    assert.deepEqual(lost.saved, [{ ...base, equipmentIds: ['Ladder', 'Pressure tester'] }]);
    assert.deepEqual(lost.selectedIds, []);
    assert.equal(jobChanges(editorFields(lost.opened.current, lost.opened.current.locationId), editorFields(lost.draft, 'loc1'), 'j1'), null,
        'a Save after it sends nothing — the kinds it sent are the base now');
});
