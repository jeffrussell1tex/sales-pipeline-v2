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
import { jobChanges, heldCrewFields, sentOf, jobAnswerOf } from '../src/utils/jobChanges.js';
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
    // An unscheduled job keeps its status (unchanged) but names it and where it was seen; its preferred time is never touched.
    const raw = { id: 'j1', status: 'unscheduled', assignedTechId: null, coTechIds: [], scheduledStart: '09:00', assignedEquipmentIds: [] };
    assert.deepEqual(jobChanges(raw, heldCrewFields(['t1', 't2']), 'j1', CHECK),
        { id: 'j1', assignedTechId: 't1', coTechIds: ['t2'], status: 'unscheduled', fromStatus: 'unscheduled' },
        'held on an unscheduled job: the crew, the status unchanged — named with where it was seen');
    // Without checkStatus (the Jobs editor's mode) the unchanged status stays unsent — the hold does not use it.
    assert.deepEqual(jobChanges(raw, heldCrewFields(['t1', 't2']), 'j1'), { id: 'j1', assignedTechId: 't1', coTechIds: ['t2'] });
    // A crew held on a scheduled job takes it back to the queue, naming the status it moved from; its units released.
    const placed = { id: 'j2', status: 'scheduled', assignedTechId: 't1', coTechIds: [], scheduledStart: '09:00', scheduledEnd: '11:00', assignedEquipmentIds: ['u1'] };
    assert.deepEqual(jobChanges(placed, heldCrewFields(['t1']), 'j2', CHECK),
        { id: 'j2', status: 'unscheduled', assignedEquipmentIds: [], fromStatus: 'scheduled' });
    // Release (no ids) on a held job clears the crew, its status named.
    assert.deepEqual(jobChanges({ ...raw, assignedTechId: 't1', coTechIds: ['t2'] }, heldCrewFields([]), 'j1', CHECK),
        { id: 'j1', assignedTechId: null, coTechIds: [], status: 'unscheduled', fromStatus: 'unscheduled' });
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
    const st = { sent: [], held: [], adopted: [], errors: [], notices: [] };
    const dbFetch = async (url, opts) => { st.sent.push([url, opts.method, JSON.parse(opts.body)]); if (answer instanceof Error) throw answer; return answer; };
    const writeHeldCrew = new Function('selectedJob', 'setScheduleError', 'setScheduleNotice', 'setSaving', 'requestOrg', 'stillOrg', 'dbFetch',
        'jobChanges', 'heldCrewFields', 'sentOf', 'jobAnswerOf', 'writeRefusalOf', 'refusalError', 'thrownSaid', 'onAdopt', 'onHeld', 'techs',
        'setAddedTechs', 'showNotice', `${fn}\nreturn writeHeldCrew;`)(
        selectedJob, (v) => { if (v) st.errors.push(v); }, () => {}, () => {}, () => 'org_a', () => true, dbFetch,
        jobChanges, heldCrewFields, sentOf, jobAnswerOf, writeRefusalOf, refusalError, thrownSaid, (j) => st.adopted.push(j), (h) => st.held.push(h),
        [{ id: 't1', name: 'Ann Lee' }, { id: 't2', name: 'Bob Ray' }], () => {}, (m) => st.notices.push(m));
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
    assert.deepEqual(st.sent, [['/.netlify/functions/dispatch-jobs?id=j1', 'PUT',
        { id: 'j1', assignedTechId: 't1', coTechIds: ['t2'], status: 'unscheduled', fromStatus: 'unscheduled' }]],
        'the status unchanged is named, with where the screen saw it — a job scheduled since by another is refused, never held over');
    assert.equal(st.held.length, 1);
    assert.equal(st.held[0].serverJob, stored, 'the answer handed up');
    assert.deepEqual(st.held[0].sent, { assignedTechId: 't1', coTechIds: ['t2'], status: 'unscheduled' }, 'and what was sent (no id, no fromStatus)');
    assert.deepEqual(st.errors, []);

    // Nothing to change: no PUT at all, checkStatus or not.
    const same = await runHold({ ...job, assignedTechIds: ['t1', 't2'], _raw: stored }, ['t1', 't2'], answerOf(500, {}));
    assert.deepEqual(same.sent, [], 'no write');
    assert.equal(same.held.length, 1); assert.equal(same.held[0].serverJob, null); assert.equal(same.held[0].sent, null);

    // Scheduled since by another member: the server refuses (409 stale, the job as stored) — adopted, the words said, onHeld not run.
    const moved = { ...raw, status: 'scheduled', assignedTechId: 't9', scheduledStart: '10:00' };
    const stale = await runHold(job, ['t1', 't2'], answerOf(409, { error: 'This job is scheduled now — it changed since you opened it. Nothing was saved.', code: 'stale', job: moved }));
    assert.equal(stale.sent[0][2].fromStatus, 'unscheduled');
    assert.deepEqual(stale.adopted, [moved]);
    assert.deepEqual(stale.held, []);
    assert.deepEqual(stale.errors, ['Boiler: This job is scheduled now — it changed since you opened it. Nothing was saved.']);
});

test('a hold that landed with an answer that cannot be read is kept as sent in both copies and the base; the next press diffs from it — RUN', async () => {
    // The board held the job scheduled with a unit reserved; the hold lands, its answer unreadable.
    const raw = { id: 'j2', title: 'Furnace', status: 'scheduled', assignedTechId: 't1', coTechIds: [], scheduledDate: '2026-09-15',
        scheduledStart: '09:00', scheduledEnd: '11:00', timeSlot: 'exact', assignedEquipmentIds: ['u1'] };
    const row = { id: 'j2', title: 'Furnace', start: 9, status: 'scheduled', assignedTechIds: ['t1'], assignedEquipment: ['u1'], _raw: raw };
    const st = await runHold(row, ['t1', 't2'], answerOf(200, UNREADABLE()));
    assert.deepEqual(st.sent[0][2], { id: 'j2', status: 'unscheduled', assignedTechId: 't1', coTechIds: ['t2'], assignedEquipmentIds: [], fromStatus: 'scheduled' });
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
    assert.deepEqual(release.sent[0][2], { id: 'j2', assignedTechId: null, coTechIds: [], status: 'unscheduled', fromStatus: 'unscheduled' });

    // An answer that was read: adopted, never kept as sent, no guess.
    const q = parentOf([raw], [row]);
    const stored = { ...raw, ...sent };
    q.onHeld({ ...st.held[0], serverJob: stored });
    assert.deepEqual(q.adopted, [stored]); assert.deepEqual(q.kept, []); assert.equal(q.jobs[0], row, 'the row left to adoptJob');
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
