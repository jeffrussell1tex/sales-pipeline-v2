// tests/week-drop.test.mjs
//
// Drag-to-reschedule on the dispatch week board (state §0.134; Jeff: "Drag-to-
// reschedule on the dispatch week grid"). §9 had carried it since the board was
// built — "nothing in DispatchTab is draggable". The pure planner is RUN here:
// the crew after a drop, the gates the crew builder's Schedule now already runs,
// and the PARTIAL PUT body (only what changes, never status). The board and the
// parent's handler are source scans (§18b23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planWeekDrop, nextCrewAfterDrop, dayNameOf, fmtHour } from '../src/utils/weekDrop.js';
import { jobChanges, scheduleFields, sentOf } from '../src/utils/jobChanges.js';
import { writeRefusalOf, refusalError, unknownOf, maybeSaid, failureWords } from '../src/utils/refusalWords.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

// ── fixtures ─────────────────────────────────────────────────────────────────
const ann  = { id: 't_ann',  name: 'Ann Lee' };
const bob  = { id: 't_bob',  name: 'Bob Ray' };
const cara = { id: 't_cara', name: 'Cara Fox' };
const SHIFT = { start: '08:00', end: '17:00' };
const blockTypes = [{ id: 'pto', name: 'PTO' }, { id: 'training', name: 'Training' }];

// A scheduled job on Ann and Bob, Tue 15 Sep 9–11.
const job = { id: 'j1', title: 'Boiler service', scheduledDate: '2026-09-15', start: 9, durationHrs: 2, assignedTechIds: ['t_ann', 't_bob'], status: 'scheduled' };
// A held crew with no time (§0.115).
const held = { id: 'j2', customer: 'Acme', scheduledDate: '2026-09-15', start: null, durationHrs: 3, assignedTechIds: ['t_ann'], status: 'unscheduled' };
// A dated job with no crew — the "Needs a crew" row.
const bare = { id: 'j3', customer: 'Bolt', scheduledDate: '2026-09-16', start: null, durationHrs: 2, assignedTechIds: [], status: 'unscheduled' };

// Everyone rostered 8–5 every day, nothing else on, unless overridden.
const lookupWith = (over = {}) => (techId) => {
    const tech = [ann, bob, cara].find(t => t.id === techId);
    if (!tech) return null;
    return { tech, shift: SHIFT, dayBlocks: [], rivals: [], ...(over[techId] || {}) };
};

// ── nextCrewAfterDrop ────────────────────────────────────────────────────────
test('the crew after a drop: swap the seat dragged from, keep a date move on a member’s own row, seat an uncrewed job', () => {
    assert.deepEqual(nextCrewAfterDrop(['t_ann', 't_bob'], 't_ann', 't_cara'), { crew: ['t_cara', 't_bob'], changed: true, swapped: { from: 't_ann', to: 't_cara' } });
    assert.deepEqual(nextCrewAfterDrop(['t_ann', 't_bob'], 't_bob', 't_cara'), { crew: ['t_ann', 't_cara'], changed: true, swapped: { from: 't_bob', to: 't_cara' } }, 'the co-tech seat swaps, the lead stays the lead');
    assert.deepEqual(nextCrewAfterDrop(['t_ann', 't_bob'], 't_ann', 't_bob'), { crew: ['t_ann', 't_bob'], changed: false, swapped: null }, 'dropped on a row already on the crew: a date move, not a swap');
    assert.deepEqual(nextCrewAfterDrop([], null, 't_cara'), { crew: ['t_cara'], changed: true, swapped: null }, 'from the Needs-a-crew row: that technician is the crew');
    assert.deepEqual(nextCrewAfterDrop(['t_ann'], null, null), { crew: ['t_ann'], changed: false, swapped: null });
    assert.deepEqual(nextCrewAfterDrop(null, null, null), { crew: [], changed: false, swapped: null });
});

// ── planWeekDrop: what changes ───────────────────────────────────────────────
test('a drop on the same cell is a no-op, not a write', () => {
    const r = planWeekDrop({ job, fromTechId: 't_ann', toTechId: 't_ann', toDate: '2026-09-15', lookup: lookupWith(), blockTypes });
    assert.deepEqual(r, { ok: false, noop: true });
    const r2 = planWeekDrop({ job, fromTechId: 't_ann', toTechId: 't_bob', toDate: '2026-09-15', lookup: lookupWith(), blockTypes });
    assert.deepEqual(r2, { ok: false, noop: true }, 'onto a crew-mate’s row on the same day: nothing changes');
});

test('another day on the same row moves the date only — the body carries the date and nothing else, never status', () => {
    const r = planWeekDrop({ job, fromTechId: 't_ann', toTechId: 't_ann', toDate: '2026-09-17', lookup: lookupWith(), blockTypes });
    assert.equal(r.ok, true);
    assert.deepEqual(r.payload, { id: 'j1', scheduledDate: '2026-09-17' });
    assert.equal(r.dateChanged, true); assert.equal(r.crewChanged, false); assert.equal(r.swapped, null);
    assert.deepEqual(r.crew, ['t_ann', 't_bob']);
    assert.deepEqual(r.checked, ['t_ann', 't_bob'], 'a day move checks the WHOLE crew on the new day');
    assert.ok(!('status' in r.payload) && !('scheduledStart' in r.payload) && !('scheduledEnd' in r.payload), 'the time and the status are the server’s and untouched');
});

test('another technician’s row hands that seat over — lead and co-techs in the body, the date only when it moved', () => {
    const same = planWeekDrop({ job, fromTechId: 't_ann', toTechId: 't_cara', toDate: '2026-09-15', lookup: lookupWith(), blockTypes });
    assert.deepEqual(same.payload, { id: 'j1', assignedTechId: 't_cara', coTechIds: ['t_bob'] });
    assert.deepEqual(same.checked, ['t_cara'], 'a swap on the same day checks only the newcomer');
    assert.deepEqual(same.swapped, { from: 't_ann', to: 't_cara' });

    const co = planWeekDrop({ job, fromTechId: 't_bob', toTechId: 't_cara', toDate: '2026-09-15', lookup: lookupWith(), blockTypes });
    assert.deepEqual(co.payload, { id: 'j1', assignedTechId: 't_ann', coTechIds: ['t_cara'] }, 'the lead keeps the lead seat');

    const both = planWeekDrop({ job, fromTechId: 't_ann', toTechId: 't_cara', toDate: '2026-09-18', lookup: lookupWith(), blockTypes });
    assert.deepEqual(both.payload, { id: 'j1', scheduledDate: '2026-09-18', assignedTechId: 't_cara', coTechIds: ['t_bob'] });
    assert.deepEqual(both.checked, ['t_cara', 't_bob']);
});

test('a held crew (no time) moves by date and by seat with no status — it stays held, and the time gates do not run', () => {
    const r = planWeekDrop({ job: held, fromTechId: 't_ann', toTechId: 't_bob', toDate: '2026-09-16',
        lookup: lookupWith({ t_bob: { rivals: [{ id: 'jx', title: 'Other', start: 9, durationHrs: 8 }] } }), blockTypes });
    assert.equal(r.ok, true, 'no placed start: a busy day is not a clash yet — the time gate runs when a time is chosen');
    assert.deepEqual(r.payload, { id: 'j2', scheduledDate: '2026-09-16', assignedTechId: 't_bob', coTechIds: [] });
});

test('a job from the Needs-a-crew row takes the technician it lands on as its crew, held with no time', () => {
    const r = planWeekDrop({ job: bare, fromTechId: null, toTechId: 't_cara', toDate: '2026-09-16', lookup: lookupWith(), blockTypes });
    assert.deepEqual(r.payload, { id: 'j3', assignedTechId: 't_cara', coTechIds: [] });
    assert.equal(r.dateChanged, false);
    const moved = planWeekDrop({ job: bare, fromTechId: null, toTechId: null, toDate: '2026-09-18', lookup: lookupWith(), blockTypes });
    assert.deepEqual(moved.payload, { id: 'j3', scheduledDate: '2026-09-18' }, 'along the Needs-a-crew row: a date move');
});

// ── planWeekDrop: the gates ──────────────────────────────────────────────────
test('the crew builder’s gates, in words: not rostered, out all day, outside the shift, a partial block, double-booked', () => {
    const at = (over, toTechId = 't_cara', toDate = '2026-09-15') =>
        planWeekDrop({ job, fromTechId: 't_ann', toTechId, toDate, lookup: lookupWith(over), blockTypes });

    assert.deepEqual(at({ t_cara: { shift: null } }, 't_cara', '2026-09-20'), { ok: false, noop: false, reason: 'Cara Fox is not rostered on Sunday.' });
    assert.deepEqual(at({ t_cara: { dayBlocks: [{ blockType: 'pto', allDay: true }] } }), { ok: false, noop: false, reason: 'Cara Fox is out (PTO) on 2026-09-15.' });
    assert.deepEqual(at({ t_cara: { shift: { start: '10:00', end: '18:00' } } }), { ok: false, noop: false, reason: 'Cara Fox works 10:00–18:00 that day — the job runs outside their shift.' });
    assert.deepEqual(at({ t_cara: { dayBlocks: [{ blockType: 'training', allDay: false, startTime: '10:00', endTime: '12:00' }] } }),
        { ok: false, noop: false, reason: 'Cara Fox is out (Training) 10:00–12:00 that day.' });
    assert.equal(at({ t_cara: { dayBlocks: [{ blockType: 'training', allDay: false, startTime: '11:00', endTime: '12:00' }] } }).ok, true, 'a block after the job is no block');
    assert.deepEqual(at({ t_cara: { rivals: [{ id: 'jx', title: 'Furnace swap', start: 10.5, durationHrs: 2 }] } }),
        { ok: false, noop: false, reason: 'Cara Fox is already on Furnace swap at 10:30a that day.' });
    assert.equal(at({ t_cara: { rivals: [{ id: 'jx', title: 'Furnace swap', start: 11, durationHrs: 2 }] } }).ok, true, 'back-to-back is not a clash');
    assert.equal(at({ t_cara: { rivals: [{ id: 'j1', title: 'itself', start: 9, durationHrs: 2 }] } }).ok, true, 'the job never clashes with itself');
});

test('a day move checks EVERY crew member on the new day — the co-tech’s day off refuses the move', () => {
    const r = planWeekDrop({ job, fromTechId: 't_ann', toTechId: 't_ann', toDate: '2026-09-17',
        lookup: lookupWith({ t_bob: { dayBlocks: [{ blockType: 'pto', allDay: true }] } }), blockTypes });
    assert.deepEqual(r, { ok: false, noop: false, reason: 'Bob Ray is out (PTO) on 2026-09-17.' });
});

test('an unknown technician, a stale crew, a crewed job on the Needs-a-crew row and a won-opportunity placeholder are refused, not guessed', () => {
    const unknown = planWeekDrop({ job, fromTechId: 't_ann', toTechId: 't_zed', toDate: '2026-09-15', lookup: lookupWith(), blockTypes });
    assert.deepEqual(unknown, { ok: false, noop: false, reason: 'This technician is not rostered on Tuesday.' });
    const stale = planWeekDrop({ job, fromTechId: 't_cara', toTechId: 't_bob', toDate: '2026-09-15', lookup: lookupWith(), blockTypes });
    assert.equal(stale.ok, false); assert.match(stale.reason, /crew has changed since the board loaded/);
    const row = planWeekDrop({ job, fromTechId: 't_ann', toTechId: null, toDate: '2026-09-16', lookup: lookupWith(), blockTypes });
    assert.equal(row.ok, false); assert.match(row.reason, /Drop a crewed job on a technician/);
    const bridge = planWeekDrop({ job: { ...bare, id: 'bridge_1', isBridge: true }, fromTechId: null, toTechId: 't_ann', toDate: '2026-09-16', lookup: lookupWith(), blockTypes });
    assert.deepEqual(bridge, { ok: false, noop: false, reason: 'This is a won opportunity, not a job yet. Use "Create job" on it first.' });
    assert.equal(planWeekDrop({ job: null, toDate: '2026-09-16', lookup: lookupWith() }).ok, false);
    assert.equal(planWeekDrop({ job, toDate: '', lookup: lookupWith() }).ok, false);
});

test('dayNameOf reads local parts (no UTC shift); fmtHour keeps the minutes', () => {
    assert.equal(dayNameOf('2026-09-13'), 'Sunday');
    assert.equal(dayNameOf('2026-09-14'), 'Monday');
    assert.equal(dayNameOf('nope'), '');
    assert.equal(fmtHour(8), '8a'); assert.equal(fmtHour(13.5), '1:30p'); assert.equal(fmtHour(12), '12p'); assert.equal(fmtHour(0), '12a'); assert.equal(fmtHour(null), '');
});

// ── the board and the handler: source scans ──────────────────────────────────
test('WeekBoardView: every job card is draggable (never a won-opportunity placeholder, never mid-write) and every cell is a drop target', () => {
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(s.includes('const WeekBoardView = ({ jobs, techs, skills, blocks, blockTypes, anchor, onJobClick, onMove, moveState, onDismiss }) => {'),
        'module scope; the write and its outcome are the parent’s (onMove / moveState)');
    assert.equal(s.match(/draggable=\{!busy && !j\.isBridge\}/g)?.length, 2, 'the crew rows’ cards and the Needs-a-crew row’s cards');
    assert.ok(s.includes('onDragStart={e => startDrag(e, j, tech.id)} onDragEnd={endDrag}'), 'a crew-row card carries its row’s technician');
    assert.ok(s.includes('onDragStart={e => startDrag(e, j, null)} onDragEnd={endDrag}'), 'a Needs-a-crew card carries no technician');
    assert.ok(s.includes('{...cellHandlers(tech.id, ds)}') && s.includes('{...cellHandlers(null, ds)}'), 'both rows’ cells take drops');
    assert.ok(s.includes("if (busy || j.isBridge) { e.preventDefault(); return; }"), 'a placeholder or a write in flight never starts a drag');
    assert.ok(s.includes("try { e.dataTransfer.setData('text/plain', j.id); } catch { /* older engines */ }"), 'Firefox needs data set to start a drag');
    assert.ok(s.includes('if (job && onMove) onMove({ job, fromTechId: drag.fromTechId, toTechId: techId, toDate: dateStr });'));
    assert.ok(s.includes('<div role="alert" style={{ flexShrink: 0, display: \'flex\', alignItems: \'center\', gap: 10, padding: \'7px 12px\','), 'a refusal is a banner above the grid');
    assert.ok(s.includes('<button onClick={onDismiss} style={dismissBtn}>Dismiss</button>'));
});

test('the parent’s handler: the planner’s refusal is shown, the equipment gate runs on a new day, the PUT is the partial body, the row adopts the server’s answer', () => {
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(s.includes("import { planWeekDrop } from '../utils/weekDrop.js';"));
    assert.ok(s.includes('const plan = planWeekDrop({ job, fromTechId, toTechId, toDate, lookup, blockTypes });'));
    assert.ok(s.includes("if (!plan.ok) { if (!plan.noop) setWeekMove({ busy: false, error: plan.reason, notice: '' }); return; }"), 'refused in words; a no-op says nothing');
    assert.ok(s.includes('rivals:    jobs.filter(j => j.id !== job.id && (j.assignedTechIds || []).includes(techId) && j.scheduledDate === toDate && j.start != null),'),
        'the clash read is that technician’s placed jobs on the target day');
    assert.ok(s.includes('if (plan.dateChanged && (job.equipCategories || []).length) {'), 'equipment is re-checked only when the day moves');
    assert.ok(s.includes('const conf = equipmentConflicts(job, jobs, equipment, toDate, probe);'));
    assert.ok(s.includes('reserved = pickEquipmentFor(job.equipCategories, equipment, overlappingRivals(job, jobs, toDate, probe)).picked;'), 'held units are re-picked for the new day');
    assert.ok(s.includes('body: JSON.stringify(payload),'), 'the body is the planner’s partial payload');
    assert.ok(!s.includes("payload = { ...payload, status:"), 'the handler never adds a status');
    // Moved in §0.286: the server's answer is adopted into both copies at once (adoptJob — the board row by boardJobOf, its
    // _raw the job as stored, which the next sender diffs against; the Jobs view's raw copy too); an answer that could not
    // be read moves the row as the plan sent it.
    // Moved in the §0.286 review: an answer that could not be read keeps what was sent in both copies and the base too
    // (keepSent over sentOf(payload)) beside the row moved as the plan sent it — run below.
    assert.ok(s.includes('if (saved) adoptJob(saved); else { moveRow(); keepSent(job.id, sentOf(payload)); }'), 'the client row follows the server, else the plan — its base as sent');
    assert.ok(s.includes('assignedTechIds: plan.crew,'), 'the row as the plan sent it');
    assert.ok(s.includes('setJobsRaw(prev => prev.map(j => (j.id === row.id ? row : j)));'), 'the Jobs view’s raw copy follows too');
    assert.ok(s.includes('setJobs(prev => prev.map(j => (j.id === row.id ? { ...j, ...boardJobOf(row, customers) } : j)));'), 'and the board row, its _raw with it');
    assert.ok(!s.includes('if (saved) setJobsRaw(prev => prev.map(j => j.id === job.id ? saved : j));'), 'no raw copy of its own left behind');
    assert.ok(s.includes(".filter(b => !/^(Not rostered|Off ·|Double-booked)/.test(b))"), 'the soft blockers are the ones the builder overrides; the hard gates ran already');
    assert.ok(s.includes("showConfirm(`${toTech.name} does not meet this job's requirements: ${soft.join('; ')}. Move it anyway?`, () => commit(soft), false);"), 'the app-wide confirm, like the builder’s Override — the INFO variant: its button reads Confirm; the danger variant’s reads Delete (seen in the pane, 14 Sep)');
    assert.ok(s.includes("addAudit(overridden.length ? 'dispatch.reschedule.override' : 'dispatch.reschedule', 'dispatch_job', job.id, name,"));
    // Moved pin (state §0.248, docs/design/refusal-sweep Part 11): the ok check first; a 403 still the role's sentence (Q13).
    // Moved in §0.263 (the unknown-save rule, Part 4): the server's own 403 the role's sentence; the refusal carries
    // whether it proves nothing was written, and one that does not moves the row as sent, said as maybe.
    assert.ok(s.includes("const r = await writeRefusalOf(res, 'Your role cannot reschedule jobs.');"));
    // Moved in the §0.286 review: a move whose answer proves nothing is kept as sent in the base too (keepSent).
    assert.ok(s.includes("if (unknownOf(e)) { moveRow(); keepSent(job.id, sentOf(payload)); setWeekMove({ busy: false, error: maybeSaid(name, 'moved', failureWords(e)), notice: '' }); return; }"));
    assert.ok(s.includes('onMove={handleWeekMove} moveState={weekMove}'), 'wired into the week range of the board');
});

// ── RUN (the §0.286 review): the parent's handleWeekMove and keepSent, extracted and run over stubs ─────────────────
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); const j = src.indexOf(b, i + a.length); assert.ok(j > i, b); return src.slice(i, j); };
const answerOf = (status, body) => ({ ok: status < 400, status, json: async () => { if (body instanceof Error) throw body; return body; } });
const runWeekMove = async (move, rows, answer) => {
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    const fn = between(s, '    const handleWeekMove = async ({ job, fromTechId, toTechId, toDate }) => {', '\n    if (loading) {');
    const st = { raw: rows.map((r) => r._raw), jobs: rows, sent: [], kept: [], adopted: [], moves: [], audit: [] };
    const setJobsRaw = (f) => { st.raw = typeof f === 'function' ? f(st.raw) : f; };
    const setJobs = (f) => { st.jobs = typeof f === 'function' ? f(st.jobs) : f; };
    const keepSentReal = new Function('setJobsRaw', 'setJobs', `${between(s, '    const keepSent = (id, sent) => {', '\n    };')}\n    };\nreturn keepSent;`)(setJobsRaw, setJobs);
    const dbFetch = async (url, opts) => { st.sent.push([url, opts.method, JSON.parse(opts.body)]); if (answer instanceof Error) throw answer; return answer; };
    const names = ['weekMove', 'settings', 'techs', 'shiftForDate', 'blocksOnDate', 'blocks', 'jobs', 'planWeekDrop', 'setWeekMove', 'equipmentConflicts',
        'equipment', 'describeConflict', 'pickEquipmentFor', 'overlappingRivals', 'scoreTech', 'skills', 'vehicles', 'setJobs', 'requestOrg', 'dbFetch',
        'writeRefusalOf', 'stillOrg', 'refusalError', 'adoptJob', 'keepSent', 'sentOf', 'addAudit', 'unitLabel', 'weekMoveTimer', 'setTimeout',
        'clearTimeout', 'unknownOf', 'maybeSaid', 'failureWords', 'showConfirm'];
    const handleWeekMove = new Function(...names, `${fn}\nreturn handleWeekMove;`)(
        { busy: false }, { dispatchBlockTypes: blockTypes }, [ann, bob, cara], () => SHIFT, () => [], [], rows, planWeekDrop, (v) => st.moves.push(v),
        () => [], [], () => '', () => ({ picked: [] }), () => [], () => ({ blockers: [] }), [], [], setJobs, () => 'org_a', dbFetch,
        writeRefusalOf, () => true, refusalError, (row) => st.adopted.push(row), (id, sent) => { st.kept.push([id, sent]); keepSentReal(id, sent); }, sentOf,
        (...a) => st.audit.push(a), (id) => id, { current: null }, () => 0, () => {}, unknownOf, maybeSaid, failureWords, null);
    await handleWeekMove(move);
    return st;
};
const RAW = Object.freeze({ id: 'j1', title: 'Boiler service', status: 'scheduled', assignedTechId: 't_ann', coTechIds: ['t_bob'], scheduledDate: '2026-09-15',
    scheduledStart: '09:00', scheduledEnd: '11:00', timeSlot: 'exact', assignedEquipmentIds: [] });
const ROW = Object.freeze({ ...job, equipCategories: [], assignedEquipment: [], _raw: RAW });
const DAY_MOVE = { job: ROW, fromTechId: 't_ann', toTechId: 't_ann', toDate: '2026-09-17' };

test('a week move that landed with an answer that cannot be read is kept as sent in both copies and the base; the next press diffs from it — RUN', async () => {
    const st = await runWeekMove(DAY_MOVE, [ROW], answerOf(200, new SyntaxError("Unexpected token '<'")));
    assert.deepEqual(st.sent, [['/.netlify/functions/dispatch-jobs?id=j1', 'PUT', { id: 'j1', scheduledDate: '2026-09-17' }]], 'the planner’s partial body, never status');
    assert.deepEqual(st.adopted, []);
    assert.deepEqual(st.kept, [['j1', { scheduledDate: '2026-09-17' }]], 'kept as sent: the body minus its id');
    assert.equal(st.jobs[0].scheduledDate, '2026-09-17', 'the row moved as the plan sent it');
    assert.deepEqual(st.jobs[0]._raw, { ...RAW, scheduledDate: '2026-09-17' }, 'and its base — what the next sender diffs against');
    assert.deepEqual(st.raw, [{ ...RAW, scheduledDate: '2026-09-17' }], 'and the Jobs view’s copy');
    assert.equal(st.moves.at(-1).error, '', 'a landed move, said as moved');
    assert.match(st.moves.at(-1).notice, /^Moved Boiler service to 2026-09-17\./);
    // The next press: Schedule now back on the 15th at 09:00 sends the day back with its status checked. From the old base
    // it sent nothing and said done (the review), the job left on the 17th.
    const back = scheduleFields({ leadId: 't_ann', coIds: ['t_bob'], date: '2026-09-15', start: '09:00', end: '11:00', units: [] });
    assert.deepEqual(jobChanges(st.jobs[0]._raw, back, 'j1', { checkStatus: true }),
        { id: 'j1', scheduledDate: '2026-09-15', scheduledStart: '09:00', scheduledEnd: '11:00', timeSlot: 'exact', status: 'scheduled', fromStatus: 'scheduled' });
    assert.equal(jobChanges(RAW, back, 'j1', { checkStatus: true }), null, 'from the base as loaded it would have sent nothing');
});

test('a week move whose answer proves nothing is kept as sent too, said as maybe; one the server answered is adopted, never kept as sent — RUN', async () => {
    const st = await runWeekMove(DAY_MOVE, [ROW], new TypeError('Failed to fetch'));
    assert.deepEqual(st.kept, [['j1', { scheduledDate: '2026-09-17' }]]);
    assert.deepEqual(st.jobs[0]._raw, { ...RAW, scheduledDate: '2026-09-17' });
    assert.deepEqual(st.raw, [{ ...RAW, scheduledDate: '2026-09-17' }]);
    assert.equal(st.moves.at(-1).error, maybeSaid('Boiler service', 'moved', 'The server could not be reached.'));
    assert.deepEqual(st.audit, [], 'no audit row for a move not known to have landed');

    const stored = { ...RAW, scheduledDate: '2026-09-17' };
    const ok = await runWeekMove(DAY_MOVE, [ROW], answerOf(200, { job: stored }));
    assert.deepEqual(ok.adopted, [stored]);
    assert.deepEqual(ok.kept, [], 'an answer read is adopted whole');
    assert.equal(ok.jobs[0], ROW, 'the row left to adoptJob');
    assert.deepEqual(ok.audit[0].slice(0, 3), ['dispatch.reschedule', 'dispatch_job', 'j1']);

    // The server's own refusal (a 4xx in words) proves nothing was written: nothing kept, the row unmoved.
    const no = await runWeekMove(DAY_MOVE, [ROW], answerOf(403, { error: 'Forbidden: read-only role' }));
    assert.deepEqual(no.kept, []); assert.equal(no.jobs[0], ROW);
    assert.equal(no.moves.at(-1).error, 'Your role cannot reschedule jobs.');
});
