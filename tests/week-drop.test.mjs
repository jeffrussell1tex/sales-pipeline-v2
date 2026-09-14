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
    assert.ok(s.includes('assignedTechIds: plan.crew,') && s.includes('window:          saved ? queueWindow(saved) : j.window,'), 'the client row follows the plan and the server');
    assert.ok(s.includes('if (saved) setJobsRaw(prev => prev.map(j => j.id === job.id ? saved : j));'), 'the Jobs view’s raw copy follows too');
    assert.ok(s.includes(".filter(b => !/^(Not rostered|Off ·|Double-booked)/.test(b))"), 'the soft blockers are the ones the builder overrides; the hard gates ran already');
    assert.ok(s.includes("showConfirm(`${toTech.name} does not meet this job's requirements: ${soft.join('; ')}. Move it anyway?`, () => commit(soft), true);"), 'the app-wide confirm, like the builder’s Override');
    assert.ok(s.includes("addAudit(overridden.length ? 'dispatch.reschedule.override' : 'dispatch.reschedule', 'dispatch_job', job.id, name,"));
    assert.ok(s.includes("if (res.status === 403) throw new Error('Your role cannot reschedule jobs.');"));
    assert.ok(s.includes('onMove={handleWeekMove} moveState={weekMove}'), 'wired into the week range of the board');
});
