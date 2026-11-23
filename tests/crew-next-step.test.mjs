// tests/crew-next-step.test.mjs
//
// The next step after choosing a crew (state §0.115). Jeff: "the schedule crew
// buttons are so low I can't see them on a 40" ultrawide monitor … once I assign
// a rep/crew then it needs to automatically prompt me to schedule job or ask
// schedule now or wait for group schedule." Two faults, two fixes: the Dispatch
// page is bound to the viewport so no view's action bar can fall below the fold;
// and the moment a crew slot is filled a card at the TOP of the crew panel asks
// what next — Schedule now (date + start right there), Wait for group schedule
// (the crew is persisted on the job with no time; Mass-schedule next week places
// exactly those people), or Clear. Source scans (§18b23) — the builder is one
// component inside DispatchTab.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jobChanges, heldCrewFields, scheduleFields, sentOf, jobAnswerOf, seenIn, sameAppointment, sameCrew, movedWords, jobHolds, pressLanded } from '../src/utils/jobChanges.js';
import { writeRefusalOf, refusalError, thrownSaid } from '../src/utils/refusalWords.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const s = code(read('src/Tabs/DispatchTab.jsx'));

test('the next-step card is a module-scope component, rendered the moment a slot is filled, at the top of the crew section', () => {
    assert.ok(s.includes('const CrewNextStep = ({ crewNames, addedCount, crewSlots, held, dateStr, onDate, time, onTime, onScheduleNow, onHold, onClear, saving }) => {'),
        'module scope, data as props');
    const card = s.indexOf('{addedCount > 0 && (\n                                <CrewNextStep');
    const header = s.indexOf('Suggested crew — ranked by match</span>');
    assert.ok(card > 0 && header > card, 'the card renders above the suggestions header, not below the fold');
    assert.ok(s.includes("{saving ? 'Saving…' : 'Schedule now'}"));
    assert.ok(s.includes('Wait for group schedule\n                    </button>'));
    assert.ok(s.includes("{held ? 'Release crew' : 'Clear crew'}"));
    assert.ok(s.includes('<TimeDropdown value={time} onChange={onTime} stepMinutes={30} ariaLabel="Next step start time"/>'), 'date and start live in the card');
    assert.ok(s.includes('onScheduleNow={handleSchedule} onHold={handleHoldCrew} onClear={handleClearCrew}'));
});

test('the refusal and success banners sit beside the card, not at the bottom', () => {
    const alert = s.indexOf('<div role="alert"');
    const card = s.indexOf('<CrewNextStep');
    const bar = s.indexOf('{/* Action bar.');
    assert.ok(alert > 0 && alert < card && card < bar, 'alert → card → action bar, in that order');
    // The count is the crew builder's own: the week board has a refusal and a
    // success strip of its own since §0.134 (drag-to-reschedule), in its own
    // component, so the file holds two of each and the builder still one.
    const builder = s.slice(s.indexOf('const CrewBuilderView = ('), s.indexOf('const normaliseTech = ('));
    assert.equal(builder.match(/<div role="alert"/g).length, 1, 'one refusal banner in the crew builder');
    assert.equal(builder.match(/<div role="status"/g).length, 1, 'one success banner in the crew builder');
    const week = s.slice(s.indexOf('const WeekBoardView = ('), s.indexOf('const MonthBoardView = ('));
    assert.equal(week.match(/<div role="alert"/g).length, 1, 'and one refusal strip on the week board');
    assert.equal(week.match(/<div role="status"/g).length, 1, 'and one success strip on the week board');
});

test('Wait for group schedule persists the crew with NO time and the status unchanged; Release clears it', () => {
    // Since §0.286 the hold sends only what it changes from the job as the builder holds it (jobChanges over
    // heldCrewFields), a status move naming where it moved from — the body's shape is run below on the real helpers.
    // Moved in the §0.286 review: the hold is a press whose meaning is a status (checkStatus) — whenever it sends anything
    // it names the status and where it saw the job, unchanged or not, so a job another member scheduled since is refused.
    const hold = s.slice(s.indexOf('const writeHeldCrew = async (ids) => {'), s.indexOf('const handleHoldCrew = '));
    assert.ok(hold.includes('const body = jobChanges(selectedJob._raw, heldCrewFields(ids), selectedJob.id, { checkStatus: true });'),
        'the hold body is the change from the job as held — no scheduledStart, no scheduledEnd — its status checked');
    assert.ok(hold.includes('body: JSON.stringify(body),'), 'and it is what the PUT sends');
    const fields = heldCrewFields(['t1', 't2']);
    assert.ok(!('scheduledStart' in fields) && !('scheduledEnd' in fields) && !('scheduledDate' in fields),
        'no scheduledStart, no scheduledEnd — so no customer confirmation goes out');
    assert.equal(fields.status, 'unscheduled', 'the status it names is unscheduled');
    const CHECK = { checkStatus: true };
    // Moved in §0.289: a hold is a press, so whenever it sends anything it also names the crew AND the appointment the screen
    // saw the job with (fromCrew, fromAppointment — the length with it), sent or not: a job given another crew or another
    // time since, its status unmoved, is refused.
    // An unscheduled job keeps its status (unchanged) but names it and where it was seen; its preferred time is never touched.
    const raw = { id: 'j1', status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledStart: '09:00', assignedEquipmentIds: [] };
    const AT9 = { scheduledDate: '', scheduledStart: '09:00', scheduledEnd: '', timeSlot: 'anytime', durationMinutes: '' };
    assert.deepEqual(jobChanges(raw, heldCrewFields(['t1', 't2']), 'j1', CHECK),
        { id: 'j1', assignedTechId: 't1', coTechIds: ['t2'], status: 'unscheduled', fromStatus: 'unscheduled', fromAppointment: AT9, fromCrew: { assignedTechId: '', coTechIds: [] } },
        'held on an unscheduled job: the crew, the status unchanged — named with where it was seen');
    // Without checkStatus (the Jobs editor's mode) the unchanged status stays unsent — the hold does not use it.
    assert.deepEqual(jobChanges(raw, heldCrewFields(['t1', 't2']), 'j1'), { id: 'j1', assignedTechId: 't1', coTechIds: ['t2'] });
    // A crew held on a scheduled job takes it back to the queue, naming the status it moved from; its units released.
    const placed = { id: 'j2', status: 'scheduled', assignedTechId: 't1', coTechIds: [], scheduledStart: '09:00', scheduledEnd: '11:00', assignedEquipmentIds: ['u1'] };
    assert.deepEqual(jobChanges(placed, heldCrewFields(['t1']), 'j2', CHECK),
        { id: 'j2', status: 'unscheduled', assignedEquipmentIds: [], fromStatus: 'scheduled',
            fromAppointment: { scheduledDate: '', scheduledStart: '09:00', scheduledEnd: '11:00', timeSlot: 'anytime', durationMinutes: '' }, fromCrew: { assignedTechId: 't1', coTechIds: [] } },
        'the crew and the appointment unsent, yet named — the hold means both (§0.289)');
    // Release (no ids) on a held job clears the crew, its status named.
    assert.deepEqual(jobChanges({ ...raw, assignedTechId: 't1', coTechIds: ['t2'] }, heldCrewFields([]), 'j1', CHECK),
        { id: 'j1', assignedTechId: null, coTechIds: [], status: 'unscheduled', fromStatus: 'unscheduled', fromAppointment: AT9, fromCrew: { assignedTechId: 't1', coTechIds: ['t2'] } });
    // A crew stored as JSON text is named as the list it is (§0.289) — the form the server compares.
    assert.deepEqual(jobChanges({ ...raw, assignedTechId: 't1', coTechIds: '["t2"]' }, heldCrewFields(['t3']), 'j1', CHECK),
        { id: 'j1', assignedTechId: 't3', coTechIds: [], status: 'unscheduled', fromStatus: 'unscheduled', fromAppointment: AT9, fromCrew: { assignedTechId: 't1', coTechIds: ['t2'] } });
    // …and only its ids: an empty or foreign entry of the list is no member of the crew.
    assert.deepEqual(jobChanges({ ...raw, assignedTechId: 't1', coTechIds: ['', 't2', null, 7] }, heldCrewFields(['t3']), 'j1', CHECK).fromCrew, { assignedTechId: 't1', coTechIds: ['t2'] });
    // The length is part of the appointment named, as a number (§0.289) — a job with no time made longer moved none of it.
    assert.equal(jobChanges({ ...raw, durationMinutes: '120' }, heldCrewFields(['t3']), 'j1', CHECK).fromAppointment.durationMinutes, 120);
    // A job the screen did not see as stored names only its status: moved by a press whose answer proved nothing (_maybe),
    // or made by one whose answer could not be read (no id).
    for (const unseen of [{ ...raw, _maybe: true }, { ...raw, id: undefined }]) {
        assert.deepEqual(jobChanges(unseen, heldCrewFields(['t1', 't2']), 'j1', CHECK),
            { id: 'j1', assignedTechId: 't1', coTechIds: ['t2'], status: 'unscheduled', fromStatus: 'unscheduled' });
    }
    // A hold with nothing to change sends nothing, checkStatus or not.
    assert.equal(jobChanges({ ...raw, assignedTechId: 't1', coTechIds: ['t2'] }, heldCrewFields(['t1', 't2']), 'j1', CHECK), null);
    assert.ok(s.includes('const handleHoldCrew = () => writeHeldCrew(Object.entries(addedTechs).filter(([, v]) => v).map(([k]) => k));'));
    assert.ok(s.includes('const handleClearCrew = () => { if (isHeld) writeHeldCrew([]); else setAddedTechs({}); };'), 'clearing a held crew releases it on the server');
    assert.ok(s.includes('const isHeld = heldIds.length > 0 && addedIdsNow.length === heldIds.length && addedIdsNow.every(id => heldIds.includes(id));'));
    assert.ok(s.includes("const held = sel && sel.start == null ? (sel.assignedTechIds || []) : [];\n        setAddedTechs(Object.fromEntries(held.map(id => [id, true])));"),
        'selecting a job brings its held crew back as the added crew');
    assert.ok(s.includes("setJobs(prev => prev.map(j => j.id === jobId ? { ...j, assignedTechIds: techIds, start: null, status: 'unscheduled', window: 'TBD', assignedEquipment: [] } : j));"),
        'the parent records the crew with NO placed start — holding a crew on a job that had a time takes the time off the client copy too');
    // An unscheduled job's scheduledStart is its PREFERRED time (§0.112); it must
    // not read as a placement, or a held crew shows as booked at that hour.
    assert.ok(s.includes("if (j.scheduledStart && j.status !== 'unscheduled') {"), 'the board mapping places only a scheduled job');
    // Since §0.286 the editor's save is mapped by that one board mapping (boardJobOf, through adoptJob) — no copy of its own.
    const mapper = s.slice(s.indexOf('const boardJobOf = (j, customers) => {'), s.indexOf('export default function DispatchTab()'));
    assert.ok(mapper.includes("if (j.scheduledStart && j.status !== 'unscheduled') {"), 'the one mapping is boardJobOf');
    assert.equal(s.split("j.scheduledStart && j.status !== 'unscheduled'").length - 1, 1, 'and no second mapping places a start');
    assert.ok(!s.includes("saved.status !== 'unscheduled'"), 'the editor save mapping of its own is gone');
    assert.ok(s.includes('onSaved={saved => { adoptJob(saved); '), 'the editor save mapping too — through adoptJob');
    assert.ok(s.includes('setJobs(prev => prev.map(j => (j.id === row.id ? { ...j, ...boardJobOf(row, customers) } : j)));'), 'adoptJob maps by boardJobOf');
    // Moved in the §0.286 review: an answer that could not be read keeps what was sent in both copies and the base
    // (keepSent), and the no-start guess runs under `if (!serverJob)` — run in the next test.
    assert.ok(s.includes('if (serverJob) adoptJob(serverJob);\n                            else keepSent(jobId, sent);\n'
        + '                            if (!serverJob) setJobs(prev => prev.map(j => j.id === jobId ? { ...j, assignedTechIds: techIds, start: null'),
        'a hold the server answered is adopted; kept as sent and the no-start guess only when the answer could not be read');
    assert.ok(s.includes("addAudit(techIds.length ? 'dispatch.crew.hold' : 'dispatch.crew.release', 'dispatch_job', jobId, jobName,"));
});

// ── RUN (the §0.286 review): the builder's writeHeldCrew, the parent's onHeld and keepSent, extracted and run over stubs ──
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, a); const j = src.indexOf(b, i + a.length); assert.ok(j > i, b); return src.slice(i, j); };
const answerOf = (status, body) => ({ ok: status < 400, status, json: async () => { if (body instanceof Error) throw body; return body; } });
const UNREADABLE = () => new SyntaxError("Unexpected token '<'");
const runHold = async (selectedJob, ids, answer) => {
    const fn = between(s, '    const writeHeldCrew = async (ids) => {', '\n    const handleHoldCrew = ');
    const st = { sent: [], held: [], adopted: [], errors: [], notices: [], reseeds: 0 };
    const dbFetch = async (url, opts) => { const body = JSON.parse(opts.body); st.sent.push([url, opts.method, body]); if (answer instanceof Error) throw answer; return typeof answer === 'function' ? answer(body) : answer; };
    const writeHeldCrew = new Function('selectedJob', 'setScheduleError', 'setScheduleNotice', 'setSaving', 'requestOrg', 'stillOrg', 'dbFetch',
        'jobChanges', 'heldCrewFields', 'sentOf', 'jobAnswerOf', 'writeRefusalOf', 'refusalError', 'thrownSaid', 'onAdopt', 'onHeld', 'techs',
        'setAddedTechs', 'showNotice', 'setReseed', `${fn}\nreturn writeHeldCrew;`)(
        selectedJob, (v) => { if (v) st.errors.push(v); }, () => {}, () => {}, () => 'org_a', () => true, dbFetch,
        jobChanges, heldCrewFields, sentOf, jobAnswerOf, writeRefusalOf, refusalError, thrownSaid, (j) => st.adopted.push(j), (h) => st.held.push(h),
        [{ id: 't1', name: 'Ann Lee' }, { id: 't2', name: 'Bob Ray' }], () => {}, (m) => st.notices.push(m), (f) => { st.reseeds = f(st.reseeds); });
    await writeHeldCrew(ids);
    return st;
};
// The parent's keepSent and onHeld over two copies (the Jobs view's jobsRaw, the board's jobs) held as plain state.
const parentOf = (jobsRaw, jobs) => {
    const st = { raw: jobsRaw, jobs, kept: [], adopted: [], audit: [] };
    const setJobsRaw = (f) => { st.raw = typeof f === 'function' ? f(st.raw) : f; };
    const setJobs = (f) => { st.jobs = typeof f === 'function' ? f(st.jobs) : f; };
    const keepSentReal = new Function('setJobsRaw', 'setJobs', `${between(s, '    const keepSent = (id, sent) => {', '\n    };')}\n    };\nreturn keepSent;`)(setJobsRaw, setJobs);
    const keepSent = (id, sent) => { st.kept.push([id, sent]); keepSentReal(id, sent); };
    const adoptJob = (row) => { st.adopted.push(row); };
    const arrow = between(s, 'onHeld={', '\n                        onScheduled={').slice('onHeld={'.length).trim();
    assert.ok(arrow.endsWith('}}'), 'the handler as written, its JSX brace closing it');
    st.onHeld = new Function('adoptJob', 'keepSent', 'setJobs', 'addAudit', `return ${arrow.slice(0, -1)};`)(adoptJob, keepSent, setJobs, (...a) => st.audit.push(a));
    return st;
};

test('a hold over a copy already unscheduled sends its status and where it saw it; one with nothing to change sends nothing — RUN', async () => {
    const raw = { id: 'j1', title: 'Boiler', status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledStart: '09:00', assignedEquipmentIds: [] };
    const job = { id: 'j1', title: 'Boiler', start: null, assignedTechIds: [], _raw: raw };
    const stored = { ...raw, assignedTechId: 't1', coTechIds: ['t2'] };
    const st = await runHold(job, ['t1', 't2'], answerOf(200, { job: stored }));
    // Moved in §0.289: the appointment and the crew the screen saw the job with are named too (no crew here).
    assert.deepEqual(st.sent, [['/.netlify/functions/dispatch-jobs?id=j1', 'PUT',
        { id: 'j1', assignedTechId: 't1', coTechIds: ['t2'], status: 'unscheduled', fromStatus: 'unscheduled',
            fromAppointment: { scheduledDate: '', scheduledStart: '09:00', scheduledEnd: '', timeSlot: 'anytime', durationMinutes: '' }, fromCrew: { assignedTechId: '', coTechIds: [] } }]],
        'the status unchanged is named, with where the screen saw it — a job scheduled since by another is refused, never held over');
    assert.equal(st.held.length, 1);
    assert.equal(st.held[0].serverJob, stored, 'the answer handed up');
    assert.deepEqual(st.held[0].sent, { assignedTechId: 't1', coTechIds: ['t2'], status: 'unscheduled' }, 'and what was sent (no id, nothing of what it saw)');
    assert.deepEqual(st.errors, []); assert.equal(st.reseeds, 0, 'a hold that landed seeds nothing again');

    // Nothing to change: no PUT at all, checkStatus or not.
    const same = await runHold({ ...job, assignedTechIds: ['t1', 't2'], _raw: stored }, ['t1', 't2'], answerOf(500, {}));
    assert.deepEqual(same.sent, [], 'no write');
    assert.equal(same.held.length, 1); assert.equal(same.held[0].serverJob, null); assert.equal(same.held[0].sent, null);

    // Scheduled since by another member: the server refuses (409 stale, the job as stored) — adopted, the words said, onHeld not run.
    const moved = { ...raw, status: 'scheduled', assignedTechId: 't9', scheduledStart: '10:00' };
    const stale = await runHold(job, ['t1', 't2'], answerOf(409, { error: 'This job is scheduled now — it changed since you opened it. Nothing was saved.', code: 'stale', job: moved }));
    assert.equal(stale.sent[0][2].fromStatus, 'unscheduled');
    assert.deepEqual(stale.adopted, [moved]);
    assert.equal(stale.reseeds, 1, 'the picks and the start seeded again from the job adopted (§0.289)');
    assert.deepEqual(stale.held, []);
    assert.deepEqual(stale.errors, ['Boiler: This job is scheduled now — it changed since you opened it. Nothing was saved.']);
});

test('a hold that landed with an answer that cannot be read is kept as sent in both copies and the base; the next press diffs from it — RUN', async () => {
    // The board held the job scheduled with a unit reserved; the hold lands, its answer unreadable.
    const raw = { id: 'j2', title: 'Furnace', status: 'scheduled', assignedTechId: 't1', coTechIds: [], scheduledDate: '2026-09-15',
        scheduledStart: '09:00', scheduledEnd: '11:00', timeSlot: 'exact', assignedEquipmentIds: ['u1'] };
    const row = { id: 'j2', title: 'Furnace', start: 9, status: 'scheduled', assignedTechIds: ['t1'], assignedEquipment: ['u1'], _raw: raw };
    const st = await runHold(row, ['t1', 't2'], answerOf(200, UNREADABLE()));
    // Moved in §0.289: the appointment and the crew it was seen with are named, and (below) never kept as sent.
    assert.deepEqual(st.sent[0][2], { id: 'j2', status: 'unscheduled', assignedTechId: 't1', coTechIds: ['t2'], assignedEquipmentIds: [], fromStatus: 'scheduled',
        fromAppointment: { scheduledDate: '2026-09-15', scheduledStart: '09:00', scheduledEnd: '11:00', timeSlot: 'exact', durationMinutes: '' }, fromCrew: { assignedTechId: 't1', coTechIds: [] } });
    assert.equal(st.held[0].serverJob, null, 'nothing read');
    const sent = st.held[0].sent;
    assert.deepEqual(sent, { status: 'unscheduled', assignedTechId: 't1', coTechIds: ['t2'], assignedEquipmentIds: [] });

    const p = parentOf([raw], [row]);
    p.onHeld(st.held[0]);
    assert.deepEqual(p.kept, [['j2', sent]], 'keepSent ran with what was sent');
    assert.deepEqual(p.adopted, [], 'nothing adopted');
    assert.deepEqual(p.raw, [{ ...raw, ...sent }], 'the Jobs view\'s copy holds what was sent');
    assert.deepEqual(p.jobs[0]._raw, { ...raw, ...sent }, 'and the board row\'s base');
    assert.equal(p.jobs[0].start, null); assert.equal(p.jobs[0].status, 'unscheduled'); assert.deepEqual(p.jobs[0].assignedTechIds, ['t1', 't2']);
    assert.deepEqual(p.jobs[0].assignedEquipment, [], 'the guess ran too — the answer was not read');
    assert.deepEqual(p.audit[0].slice(0, 3), ['dispatch.crew.hold', 'dispatch_job', 'j2']);

    // The next press diffs from the base as sent: holding the same crew again sends nothing (it landed), and a release
    // names 'unscheduled' as where it saw the job — from the old base it named 'scheduled', and the server refused it stale.
    const after = { ...row, ...p.jobs[0] };
    assert.deepEqual((await runHold(after, ['t1', 't2'], answerOf(500, {}))).sent, [], 'the landed hold is not sent again');
    const release = await runHold(after, [], answerOf(200, { job: { ...raw, ...sent, assignedTechId: null, coTechIds: [] } }));
    // Moved in §0.289: and the crew as sent — from the old base it named t1 alone, and the server would refuse it.
    assert.deepEqual(release.sent[0][2], { id: 'j2', assignedTechId: null, coTechIds: [], status: 'unscheduled', fromStatus: 'unscheduled',
        fromAppointment: { scheduledDate: '2026-09-15', scheduledStart: '09:00', scheduledEnd: '11:00', timeSlot: 'exact', durationMinutes: '' }, fromCrew: { assignedTechId: 't1', coTechIds: ['t2'] } });

    // An answer that was read: adopted, never kept as sent, no guess.
    const q = parentOf([raw], [row]);
    const stored = { ...raw, ...sent };
    q.onHeld({ ...st.held[0], serverJob: stored });
    assert.deepEqual(q.adopted, [stored]); assert.deepEqual(q.kept, []); assert.equal(q.jobs[0], row, 'the row left to adoptJob');
});

// §0.289: the job given another crew or another time since the builder read it, its status unmoved. The server's answer is
// decided from the body by the rules dispatch-jobs.mjs reads (seenIn, sameAppointment, sameCrew, pressLanded, movedWords) over
// the job as stored here; a body that names no crew or time is written over it, as the server does — so a press that leaves
// fromCrew or fromAppointment out fails here.
const serverOf = (first) => {
    const sv = { stored: first, answers: [] };
    sv.put = (body) => {
        const { seen, error } = seenIn(body);
        assert.equal(error, undefined, 'what the press names is what the server takes');
        const now = sv.stored;
        const stands = (seen.status === undefined || seen.status === now.status) && (!seen.appointment || sameAppointment(now, seen.appointment)) && (!seen.crew || sameCrew(now, seen.crew));
        const updates = sentOf(body);
        const job = { ...now, ...(stands ? updates : {}) };
        const code = stands ? 'written' : pressLanded(now, updates, seen) ? 'already' : 'stale';
        sv.stored = job; sv.answers.push(code);
        return stands ? answerOf(200, { job }) : answerOf(409, { error: code === 'already' ? 'This job holds what you sent already.' : movedWords(now, seen), code, job });
    };
    return sv;
};
test('a hold over a crew or a time another member gave the job since is refused, the job as stored adopted; the next press names that crew and lands — RUN', async () => {
    const raw = { id: 'j1', title: 'Boiler', status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledDate: '2026-09-15', scheduledStart: '09:00', assignedEquipmentIds: [] };
    const job = { id: 'j1', title: 'Boiler', start: null, assignedTechIds: [], _raw: raw };
    const AT = { scheduledDate: '2026-09-15', scheduledStart: '09:00', scheduledEnd: '', timeSlot: 'anytime', durationMinutes: '' };
    const sv = serverOf({ ...raw, assignedTechId: 't9', coTechIds: ['t8'] });
    const st = await runHold(job, ['t1', 't2'], sv.put);
    assert.deepEqual(sv.stored, { ...raw, assignedTechId: 't9', coTechIds: ['t8'] }, 'nothing written over the crew given since');
    assert.deepEqual(st.sent.map(([, , b]) => b.fromCrew), [{ assignedTechId: '', coTechIds: [] }]);
    // Moved in §0.289 (the review; the first cut named no appointment): the hold names the time it was seen at too.
    assert.deepEqual(st.sent[0][2].fromAppointment, AT, 'and the appointment, though it sends none');
    assert.deepEqual(st.errors, ['Boiler: This job’s crew changed since this screen loaded it. Nothing was saved.']);
    assert.deepEqual(st.adopted, [sv.stored], 'the job as stored adopted');
    assert.equal(st.reseeds, 1, 'and the picks seeded again');
    assert.deepEqual(st.held, [], 'and the hold not said to have landed');

    // The next press, from the adopted job, names the crew it now shows and lands.
    const again = await runHold({ ...job, assignedTechIds: ['t9', 't8'], _raw: st.adopted[0] }, ['t1', 't2'], sv.put);
    assert.deepEqual(again.sent[0][2], { id: 'j1', assignedTechId: 't1', coTechIds: ['t2'], status: 'unscheduled', fromStatus: 'unscheduled', fromAppointment: AT, fromCrew: { assignedTechId: 't9', coTechIds: ['t8'] } });
    assert.deepEqual(again.errors, []); assert.equal(again.held.length, 1); assert.equal(again.reseeds, 0);
    assert.deepEqual([sv.stored.assignedTechId, sv.stored.coTechIds], ['t1', ['t2']]);

    // The same people under another lead are another crew; the same crew stored as JSON text is the same one.
    const seen12 = { ...job, assignedTechIds: ['t1', 't2'], _raw: { ...raw, assignedTechId: 't1', coTechIds: ['t2'] } };
    sv.stored = { ...raw, assignedTechId: 't2', coTechIds: ['t1'] };
    const swapped = await runHold(seen12, [], sv.put);
    assert.deepEqual(swapped.errors, ['Boiler: This job’s crew changed since this screen loaded it. Nothing was saved.']);
    assert.equal(sv.stored.assignedTechId, 't2', 'the release wrote nothing');
    sv.stored = { ...raw, assignedTechId: 't1', coTechIds: '["t2"]' };
    const released = await runHold(seen12, [], sv.put);
    assert.deepEqual(released.errors, []); assert.equal(released.held.length, 1); assert.equal(sv.stored.assignedTechId, null);

    // Moved to another time, made longer, or both moved: refused too, the words naming what moved.
    for (const [change, words] of [
        [{ scheduledStart: '14:00' }, 'time'], [{ scheduledDate: '2026-09-16' }, 'time'], [{ durationMinutes: 240 }, 'time'], [{ timeSlot: 'morning' }, 'time'],
        [{ scheduledStart: '14:00', assignedTechId: 't9' }, 'time and crew'],
    ]) {
        sv.stored = { ...raw, ...change };
        const timed = await runHold(job, ['t1', 't2'], sv.put);
        assert.deepEqual(timed.errors, [`Boiler: This job’s ${words} changed since this screen loaded it. Nothing was saved.`], JSON.stringify(change));
        assert.deepEqual(sv.stored, { ...raw, ...change }, 'nothing written');
        assert.deepEqual([timed.adopted.length, timed.held.length, timed.reseeds], [1, 0, 1]);
    }
});

test('a hold sent again over its own landed press is done; another member\'s same crew at another time is not — RUN (§0.289)', async () => {
    const raw = { id: 'j1', title: 'Boiler', status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledDate: '2026-09-15', scheduledStart: '09:00', assignedEquipmentIds: [] };
    const job = { id: 'j1', title: 'Boiler', start: null, assignedTechIds: [], _raw: raw };
    // The first press landed and its answer was lost; the second, from the same copy, names the crew as it was before.
    const sv = serverOf(raw);
    const lost = await runHold(job, ['t1', 't2'], (body) => { sv.put(body); throw new TypeError('Failed to fetch'); });
    assert.equal(lost.held.length, 0); assert.equal(lost.reseeds, 0, 'an answer that proved nothing keeps the picks');
    const again = await runHold(job, ['t1', 't2'], sv.put);
    assert.deepEqual(sv.answers, ['written', 'already']);
    assert.deepEqual(again.errors, []); assert.deepEqual(again.adopted, []); assert.equal(again.reseeds, 0);
    assert.equal(again.held[0].serverJob, sv.stored, 'held, the job as stored handed up');
    // Another member held the same two and moved the time: the job holds all that was sent, but not at the time it was seen.
    sv.stored = { ...raw, assignedTechId: 't1', coTechIds: ['t2'], scheduledStart: '14:00' };
    const other = await runHold(job, ['t1', 't2'], sv.put);
    assert.ok(jobHolds(sv.stored, sentOf(other.sent[0][2])), 'judged on what was sent alone it read as done');
    assert.equal(sv.answers.at(-1), 'stale');
    assert.deepEqual(other.held, [], 'never said to have landed');
    assert.deepEqual(other.errors, ['Boiler: This job’s time and crew changed since this screen loaded it. Nothing was saved.']);
    assert.equal(other.reseeds, 1);
});

// The builder as a screen (§0.289): its selection, its seeding effect, its Schedule now, Hold and Clear as written, over a
// hook host — state in plain fields, an effect run after a render when its deps changed, the job read by the real boardJobOf.
const boardJobOf = new Function('normalisePriority', 'queueWindow', `${between(s, 'const boardJobOf = (j, customers) => {', '\n};')}\n};\nreturn boardJobOf;`)((p) => p, () => '');
const isUnscheduled = new Function(`${s.match(/^const isUnscheduled = .*$/m)[0]}\nreturn isUnscheduled;`)();
const DATED = "    useEffect(() => { setScheduleDate(''); }, [reseed]);";
const builderOf = (raws, server, src = s) => {
    const selection = between(src, '    const chosen = jobs.find(', '\n    const sortedQueue = ');
    const effect = `${between(src, '    useEffect(() => {\n        const sel = selectedJob;', ']);')}]);`;
    const dated = src.includes(DATED) ? DATED : '';   // the day chosen, dropped at a reseed
    const presses = between(src, '    const handleSchedule = async () => {', '\n    const unscheduledJobs = ');
    const st = { jobs: raws.map((r) => boardJobOf(r, [])), selectedJobId: raws[0].id, added: {}, date: '', time: '', reseed: 0, deps: [], error: '', sent: [], landed: [] };
    const put = (key) => (v) => { st[key] = typeof v === 'function' ? v(st[key]) : v; };
    const adopt = (row) => { st.jobs = st.jobs.map((j) => (j.id === row.id ? { ...j, ...boardJobOf(row, []) } : j)); };
    const landed = (o) => { if (o.serverJob) adopt(o.serverJob); st.landed.push(o); };
    const dbFetch = async (url, opts) => { const body = JSON.parse(opts.body); st.sent.push(body); return server(body); };
    const names = ['jobs', 'selectedJobId', 'isUnscheduled', 'addedTechs', 'setAddedTechs', 'scheduleDate', 'setScheduleDate', 'scheduleTime', 'setScheduleTime', 'reseed', 'setReseed', 'useEffect',
        'setScheduleError', 'setScheduleNotice', 'setSaving', 'showNotice', 'techs', 'shiftForDate', 'hhToNum', 'blocksOnDate', 'blocks', 'blockTypes', 'equipmentConflicts', 'equipUnits',
        'describeConflict', 'pickEquipmentFor', 'overlappingRivals', 'requestOrg', 'stillOrg', 'dbFetch', 'jobChanges', 'scheduleFields', 'heldCrewFields', 'sentOf', 'jobAnswerOf',
        'writeRefusalOf', 'refusalError', 'thrownSaid', 'onAdopt', 'onHeld', 'onScheduled', 'candidates', 'to12h', 'unitLabel'];
    const render = new Function(...names, `${selection}\n${dated}\n${effect}\n${presses}\nreturn { selectedJob, handleSchedule, handleHoldCrew, handleClearCrew, isHeld };`);
    const once = () => {
        const run = []; let at = 0;
        const ui = render(st.jobs, st.selectedJobId, isUnscheduled, st.added, put('added'), st.date, put('date'), st.time, put('time'), st.reseed, put('reseed'),
            (fn, deps) => { const k = at++; if (!st.deps[k] || deps.some((d, i) => d !== st.deps[k][i])) run.push(fn); st.deps[k] = deps; },
            put('error'), () => {}, () => {}, () => {}, [{ id: 't1', name: 'Ann Lee' }, { id: 't2', name: 'Bob Ray' }], () => null, () => 0, () => [], [], [], () => [], [],
            () => '', () => ({ picked: [] }), () => [], () => 'org_a', () => true, dbFetch, jobChanges, scheduleFields, heldCrewFields, sentOf, jobAnswerOf,
            writeRefusalOf, refusalError, thrownSaid, adopt, landed, (o) => { landed(o); st.selectedJobId = null; }, [], (v) => v, (v) => v);
        run.forEach((fn) => fn());
        return { ui, ran: run.length > 0 };
    };
    st.ui = () => { for (let i = 0; i < 5; i++) { const r = once(); if (!r.ran) return r.ui; } throw new Error('the seeding effect never settles'); };
    st.picks = () => { st.ui(); return Object.keys(st.added).filter((k) => st.added[k]); };
    st.pick = (...ids) => { st.ui(); st.added = Object.fromEntries(ids.map((id) => [id, true])); };
    st.ui();
    return st;
};
const QUEUED = { id: 'j1', title: 'Boiler', status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledDate: '2026-09-15', scheduledStart: '09:00', scheduledEnd: null,
    timeSlot: 'anytime', durationMinutes: 120, assignedEquipmentIds: [] };
const NEXT = { ...QUEUED, id: 'j2', title: 'Chiller', assignedTechId: 't2', scheduledStart: '07:30' };
// Each wrong version of the builder: its line taken out of the press (or the effect) that holds it, there once.
const RESEED = "if (answer === 'stale' && onAdopt) { onAdopt(r.body.job); setReseed(n => n + 1); }";
const DEPS = '}, [selectedJob?.id, reseed]);';
const without = (start, end, line, instead) => {
    const i = s.indexOf(start); const j = s.indexOf(end, i);
    assert.ok(i > 0 && j > i, start);
    const part = s.slice(i, j);
    assert.equal(part.split(line).length - 1, 1, `${start} holds ${line} once`);
    return s.slice(0, i) + part.replace(line, () => instead) + s.slice(j);
};
const ADOPT_ONLY = "if (answer === 'stale' && onAdopt) onAdopt(r.body.job);";
const WRONG = {
    schedule: () => without('    const handleSchedule = async () => {', '    const writeHeldCrew = ', RESEED, ADOPT_ONLY),
    hold: () => without('    const writeHeldCrew = async (ids) => {', '    const handleHoldCrew = ', RESEED, ADOPT_ONLY),
    deps: () => without('    useEffect(() => {\n        const sel = selectedJob;', '    const candidates = ', DEPS, '}, [selectedJob?.id]);'),
};

test('the builder seeds its picks and Start from the job shown; any answer but a stale refusal of that job keeps the member\'s — RUN', async () => {
    const held = builderOf([NEXT, QUEUED], async () => answerOf(500, {}));
    assert.deepEqual([held.picks(), held.time, held.ui().isHeld], [['t2'], '07:30', true], 'a held crew comes back as the picks');
    held.selectedJobId = 'j1';
    assert.deepEqual([held.picks(), held.time], [[], '09:00'], 'another job selected: its own');
    for (const [answer, words] of [
        [answerOf(500, {}), 'The held crew may have been saved — reload the page to see whether it was: The server returned 500.'],
        [answerOf(403, { error: 'Forbidden' }), 'Your role cannot schedule jobs.'],
        [answerOf(400, { error: 'That technician is not in this org.' }), 'That technician is not in this org.'],
        [answerOf(409, { error: 'Moved', code: 'stale', job: { ...QUEUED, id: 'other' } }), 'Moved'],
    ]) {
        const b = builderOf([QUEUED], async () => answer);
        b.pick('t1', 't2'); b.time = '10:00';
        await b.ui().handleHoldCrew();
        assert.deepEqual([b.picks(), b.time, b.error, b.reseed], [['t1', 't2'], '10:00', words, 0]);
        await b.ui().handleSchedule();
        assert.deepEqual([b.picks(), b.time, b.reseed, b.sent.length], [['t1', 't2'], '10:00', 0, 2]);
    }
    // Answered 'already': held, nothing seeded again.
    const done = builderOf([QUEUED], async () => answerOf(409, { error: 'This job holds what you sent already.', code: 'already', job: { ...QUEUED, assignedTechId: 't1' } }));
    done.pick('t1');
    await done.ui().handleHoldCrew();
    assert.deepEqual([done.picks(), done.error, done.reseed, done.landed.length], [['t1'], '', 0, 1]);
});

test('a press refused as stale drops the day chosen too — the job as stored, never its new start on the day chosen before; another job selected keeps it, and the queue is held while a press is out — RUN (§0.289)', async () => {
    const play = async (src) => {
        const sv = serverOf({ ...QUEUED, assignedTechId: 't9', scheduledDate: '2026-09-20', scheduledStart: '14:00' });
        const b = builderOf([QUEUED, NEXT], sv.put, src);
        b.pick('t1'); b.time = '10:00'; b.date = '2026-09-16';
        await b.ui().handleSchedule();
        b.ui();
        return b;
    };
    const b = await play();
    assert.deepEqual([b.date, b.time], ['', '14:00'], 'REGRESSION: the day chosen before beside the start another member set');
    assert.deepEqual([(await play(s.replace(DATED, () => ''))).date], ['2026-09-16'], 'shown red: the line out, the day stays');
    const kept = builderOf([QUEUED, NEXT], async () => answerOf(500, {}));
    kept.date = '2026-09-16'; kept.selectedJobId = 'j2'; kept.ui();
    assert.equal(kept.date, '2026-09-16', 'a day chosen stays from job to job');
    assert.ok(s.includes('<div key={j.id} onClick={() => { if (!saving) onSelectJob(j.id); }}'), 'REGRESSION: another job picked while a press is out — its answer seeds that job\'s picks');
});

test('a Hold refused as stale seeds the picks and the Start again from the job as stored: the next press never writes the old picks back — RUN (§0.289)', async () => {
    const play = async (src) => {
        const sv = serverOf({ ...QUEUED, assignedTechId: 't9', coTechIds: ['t8'], scheduledStart: '14:00' });
        const b = builderOf([QUEUED], sv.put, src);
        b.pick('t1', 't2'); b.time = '10:00';
        await b.ui().handleHoldCrew();
        const after = { error: b.error, picks: b.picks(), time: b.time, isHeld: b.ui().isHeld };
        // Pressed again as the screen stands, nothing chosen since.
        await b.ui().handleHoldCrew();
        return { b, sv, after };
    };
    const { b, sv, after } = await play();
    assert.deepEqual(after, { error: 'Boiler: This job’s time and crew changed since this screen loaded it. Nothing was saved.', picks: ['t9', 't8'], time: '14:00', isHeld: true });
    assert.equal(b.sent.length, 1, 'the next press has nothing of the member\'s to send');
    assert.deepEqual([sv.answers, sv.stored.assignedTechId, sv.stored.coTechIds], [['stale'], 't9', ['t8']]);
    // Chosen again over the job as it is: sent, naming the crew and the time now shown, and it lands.
    b.pick('t1', 't2');
    await b.ui().handleHoldCrew();
    assert.deepEqual(b.sent[1].fromCrew, { assignedTechId: 't9', coTechIds: ['t8'] });
    assert.equal(b.sent[1].fromAppointment.scheduledStart, '14:00');
    assert.deepEqual([sv.answers, sv.stored.assignedTechId, b.picks(), b.error], [['stale', 'written'], 't1', ['t1', 't2'], '']);
    // Each wrong version keeps the old picks and writes them over the other member's crew.
    for (const k of ['hold', 'deps']) {
        const bad = await play(WRONG[k]());
        assert.deepEqual([bad.after.picks, bad.after.time, bad.sv.stored.assignedTechId], [['t1', 't2'], '10:00', 't1'], `the wrong version (${k}) writes the old picks back`);
    }
    // A Release refused the same way: the crew given since is what the card shows, none of it released.
    const sv2 = serverOf({ ...NEXT, assignedTechId: 't1' });
    const rel = builderOf([NEXT], sv2.put);
    rel.ui().handleClearCrew();   // hands no promise back
    for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
    assert.deepEqual([rel.sent.length, sv2.answers], [1, ['stale']]);
    assert.deepEqual([rel.picks(), sv2.stored.assignedTechId, rel.error], [['t1'], 't1', 'Chiller: This job’s crew changed since this screen loaded it. Nothing was saved.']);
});

test('a Schedule now refused as stale seeds the picks and the Start again from the job as stored — RUN (§0.289)', async () => {
    const play = async (stored, src) => {
        const sv = serverOf(stored);
        const b = builderOf([QUEUED, NEXT], sv.put, src);
        b.pick('t1'); b.time = '10:00';
        await b.ui().handleSchedule();
        const after = { error: b.error, shown: b.ui().selectedJob.id, picks: b.picks(), time: b.time, sent: b.sent.length };
        if (after.shown === 'j1') await b.ui().handleSchedule();   // pressed again as the screen stands
        return { b, sv, after };
    };
    // Given another crew and another preferred start, still in the queue.
    const { b, sv, after } = await play({ ...QUEUED, assignedTechId: 't2', scheduledStart: '14:00' });
    assert.deepEqual(b.sent[0].fromAppointment, { scheduledDate: '2026-09-15', scheduledStart: '09:00', scheduledEnd: '', timeSlot: 'anytime', durationMinutes: 120 });
    assert.deepEqual(b.sent[0].fromCrew, { assignedTechId: '', coTechIds: [] });
    assert.deepEqual(after, { error: 'Boiler: This job’s time and crew changed since this screen loaded it. Nothing was saved.', shown: 'j1', picks: ['t2'], time: '14:00', sent: 1 });
    // The next press schedules the crew and the start the screen shows — the job's own, never the picks refused.
    assert.deepEqual([sv.answers, sv.stored.assignedTechId, sv.stored.scheduledStart], [['stale', 'written'], 't2', '14:00']);
    for (const k of ['schedule', 'deps']) {
        const bad = await play({ ...QUEUED, assignedTechId: 't2', scheduledStart: '14:00' }, WRONG[k]());
        assert.deepEqual([bad.after.picks, bad.sv.stored.assignedTechId, bad.sv.stored.scheduledStart], [['t1'], 't1', '10:00'], `the wrong version (${k}) writes the old picks back`);
    }
    // Made longer, no crew on it: no picks stand, and the next press sends nothing.
    const none = await play({ ...QUEUED, durationMinutes: 240 });
    assert.deepEqual(none.after, { error: 'Boiler: This job’s time changed since this screen loaded it. Nothing was saved.', shown: 'j1', picks: [], time: '09:00', sent: 1 });
    assert.deepEqual(none.sv.answers, ['stale'], 'nobody is picked, so nothing is sent');
    // Scheduled since by another member: the queue moves on, the next job shown with its own crew and start, the words kept.
    const gone = await play({ ...QUEUED, status: 'scheduled', assignedTechId: 't9' });
    assert.deepEqual(gone.after, { error: 'Boiler: This job is scheduled now — it changed since you opened it. Nothing was saved.', shown: 'j2', picks: ['t2'], time: '07:30', sent: 1 });
});

test('a press over a row whose last answer proved nothing names only its status — RUN (§0.289)', async () => {
    const sv = serverOf({ ...QUEUED });
    const b = builderOf([{ ...QUEUED, assignedTechId: 't9', _maybe: true }], sv.put);
    b.pick('t1');
    await b.ui().handleHoldCrew();
    assert.deepEqual(b.sent[0], { id: 'j1', assignedTechId: 't1', coTechIds: [], status: 'unscheduled', fromStatus: 'unscheduled' });
    assert.deepEqual([b.error, sv.stored.assignedTechId], ['', 't1']);
});

test('Mass-schedule next week honours a held crew — those people, exactly, or a named skip', () => {
    assert.ok(s.includes('const candidatesForDay = (job, dateStr, only = null) => {'));
    assert.ok(s.includes('            .filter(t => !only || only.has(t.id))   // a held crew: these people, exactly (§0.115)'));
    assert.ok(s.includes('const crewForDay = (job, dateStr, need, only = null) => {\n        const cands = candidatesForDay(job, dateStr, only);'));
    assert.ok(s.includes('const heldIds = (job.assignedTechIds || []).filter(id => techs.some(t => t.id === id));\n        const only = heldIds.length ? new Set(heldIds) : null;\n        const want = only ? heldIds.length : need;'));
    assert.ok(s.includes('const r = crewForDay(job, dateStr, want, only);'));
    assert.ok(s.includes("reason = `Held crew (${heldIds.map(id => techs.find(t => t.id === id)?.name || id).join(', ')}) not free together in this window`;"));
});

test('the Dispatch page is bound to the viewport below the fixed header, so no action bar falls below the fold', () => {
    assert.ok(s.includes('import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback } from \'react\';'));
    assert.ok(s.includes("const below = parseFloat(getComputedStyle(pageRef.current.parentElement).paddingBottom) || 0;"), 'the shell\'s bottom padding counts (§0.117 — the document still scrolled by 8px)');
    assert.ok(s.includes('setPageTop(Math.max(0, Math.round(pageRef.current.getBoundingClientRect().top + window.scrollY + below)));'), 'measured from the page div, the ContactsTab pattern, plus the padding below');
    assert.ok(s.includes("        if (pageTop != null || !pageRef.current) return;\n        const below = "), 'measured on every render until it exists — the loading state renders first, without the div');
    assert.ok(!s.includes("getBoundingClientRect().top + window.scrollY)));\n    }, []);"), 'not mount-only');
    assert.ok(s.includes("height: pageTop != null ? `calc(100vh - ${pageTop}px)` : '100%', boxSizing: 'border-box', overflow: 'hidden' }}>"));
    assert.ok(s.includes('<div ref={pageRef} className="tab-page"'));
});
