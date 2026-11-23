// tests/crew-scoring.test.mjs
//
// The crew builder's phantom clash (state §0.112). scoreTech's availability
// check assumed an unscheduled job began at 9 AM and compared start HOURS
// against every job the technician had ever held, on any date — so a September
// job read "Double-booked at 9a" because of two August ones, and a dispatcher
// asked where the 9 AM came from. Now the check is same-day only and runs only
// when a start is actually known (the builder's chosen start, else the job's
// preferred start). And a job can carry a preferred start time: Jobs → Preferred
// start time / Time window, which seeds the builder's Start and makes the
// customer's confirmation read the real window. scoreTech lives inside
// DispatchTab, so these are source scans (§18b23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { editorFields, jobChanges } from '../src/utils/jobChanges.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const s = code(read('src/Tabs/DispatchTab.jsx'));
const jc = code(read('src/utils/jobChanges.js'));
const boardJobOf = s.slice(s.indexOf('const boardJobOf = (j, customers) => {'), s.indexOf('export default function DispatchTab()'));

test('scoreTech: the clash check is same-day and needs a real start — no 9 AM assumption', () => {
    assert.ok(!s.includes('const ns = job.start || 9'), 'the 9 AM default is gone');
    assert.ok(s.includes('const probeStart = avail.start ?? job.start ?? null;'), 'the probe is the chosen start, else the preferred start, else nothing');
    assert.ok(s.includes("j.start != null && j.scheduledDate === availDate)"), 'only jobs on the SAME day can clash');
    assert.ok(s.includes('    if (probeStart == null) {\n        score += 15;'), 'no start means no evidence of a clash — the time gate re-checks later');
    assert.ok(s.includes('const overlaps = sameDayJobs.filter(j => j.start < ne && j.start + (j.durationHrs || 2) > probeStart);'));
});

test('the crew builder hands the scorer its chosen start and re-scores when it changes; selecting a job seeds Start from the preferred time', () => {
    assert.ok(s.includes('start: scheduleTime ? hhToNum(scheduleTime) : (selectedJob.start ?? null) }) }))'));
    assert.ok(s.includes('    }, [selectedJob, techs, jobs, skills, blocks, blockTypes, scheduleDate, scheduleTime]);'), 'scheduleTime is a dependency');
    assert.ok(s.includes("        setScheduleTime(sel?.scheduledStart || '');"), 'the preferred start seeds the builder');
    // The board mapping is boardJobOf at module scope since §0.286 (the load's and every adopted answer's one mapping).
    assert.ok(boardJobOf.includes('        scheduledStart: j.scheduledStart || null,'), 'the board job shape carries it');
});

test('normaliseTech carries the weekly shift pattern onto the board shape — the roster lookup reads it', () => {
    // Work Schedules reads the raw technician rows; everything else reads the
    // normalised shape. Drop workingHours here and every day is "Not rostered".
    const start = s.indexOf('const normaliseTech = (t) => ({');
    assert.ok(start > 0, 'normaliseTech exists');
    const body = s.slice(start, s.indexOf('});', start));
    assert.ok(body.includes('    workingHours:   t.workingHours || {},'), 'the pattern rides on the board technician');
    assert.ok(body.includes('    hoursCap:       capFromPattern(t.workingHours),'));
    assert.ok(s.includes("            blockers.push(`Not rostered on ${dayName}`);"), 'the scorer still blocks a day off the pattern');
});

test('a queue card shows a time only for a SCHEDULED job; an unscheduled job shows its date and its preferred start as a note (§0.117)', () => {
    assert.ok(s.includes("    if (j.status !== 'unscheduled' && j.timeSlot === 'exact' && j.scheduledStart) return j.scheduledStart;"), 'the time only once the job is actually scheduled');
    assert.ok(s.includes("    return j.scheduledStart ? `${day} · prefers ${to12h(j.scheduledStart) || j.scheduledStart}` : day;"), 'a preferred start reads as a preference');
    assert.ok(boardJobOf.includes('        window:         queueWindow(j),'), 'the board mapping');
    // Since §0.286 the editor's save is put through that same mapping (adoptJob → boardJobOf), not a copy of its own.
    assert.ok(s.includes('onSaved={saved => { adoptJob(saved); '), 'and the editor-save mapping — the same one, so a saved preferred time updates the card');
    assert.ok(s.includes('setJobs(prev => prev.map(j => (j.id === row.id ? { ...j, ...boardJobOf(row, customers) } : j)));'), 'adoptJob maps the answer by boardJobOf');
    assert.ok(s.includes('<span>◷ {j.window}</span>'));
});

test('the job editor offers a preferred start time and a time window, and saves them the way the schema expects', () => {
    assert.ok(s.includes('<CustFieldRow label="Preferred start time">'));
    assert.ok(s.includes('<TimeDropdown value={draft.scheduledStart || \'\'} onChange={v => set(\'scheduledStart\', v)} stepMinutes={30} ariaLabel="Preferred start time"/>'));
    assert.ok(s.includes('<CustFieldRow label="Time window">'));
    // Since §0.286 the Save's fields are jobChanges.js editorFields (the same expressions), diffed against the job as opened.
    assert.ok(s.includes('const body = jobChanges(editorFields(base, base.locationId), editorFields(draft, locationId), draft.id);'), 'the editor saves editorFields');
    assert.ok(jc.includes("    scheduledStart:  job.scheduledStart || null,"));
    assert.ok(jc.includes("    timeSlot:        job.scheduledStart ? 'exact' : (job.timeSlot && job.timeSlot !== 'exact' ? job.timeSlot : 'anytime'),"), 'a start makes the window exact; otherwise the slot, never a stale exact');
    assert.ok(jc.includes('    scheduledEnd:    job.scheduledStart ? addHours(job.scheduledStart, hoursOf(job)) : null,'), 'the end follows the duration');
    assert.ok(jc.includes('const addHours = (hhmm, hrs) => {'));
    assert.ok(!s.includes('addHoursHHMM'), 'DispatchTab keeps no copy of its own');
    // Run on the real builder: a start makes it exact with the end from the duration; none keeps the slot, never a stale exact.
    const withStart = editorFields({ title: 'T', scheduledStart: '09:30', durationHrs: 1.5, timeSlot: 'morning' }, null);
    assert.equal(withStart.scheduledStart, '09:30');
    assert.equal(withStart.scheduledEnd, '11:00', 'the end follows the duration');
    assert.equal(withStart.timeSlot, 'exact');
    assert.equal(editorFields({ title: 'T', durationMinutes: 60, scheduledStart: '23:30' }, null).scheduledEnd, '00:30', 'wraps at midnight');
    const noStart = editorFields({ title: 'T', timeSlot: 'afternoon' }, null);
    assert.equal(noStart.scheduledStart, null);
    assert.equal(noStart.scheduledEnd, null);
    assert.equal(noStart.timeSlot, 'afternoon');
    assert.equal(editorFields({ title: 'T', timeSlot: 'exact' }, null).timeSlot, 'anytime', 'a stale exact with no start reads anytime');
    // A preferred start set in the editor sends the appointment whole (its group), nothing else.
    const opened = { id: 'j1', title: 'T', status: 'unscheduled', durationMinutes: 120, timeSlot: 'anytime' };
    assert.deepEqual(jobChanges(editorFields(opened, null), editorFields({ ...opened, scheduledStart: '08:00' }, null), 'j1'),
        { id: 'j1', scheduledDate: null, scheduledStart: '08:00', scheduledEnd: '10:00', timeSlot: 'exact' });
});

test('the queue lists only jobs still to schedule; a scheduled job clicked on the board opens its record, never the queue (Jeff, 11 Sep)', () => {
    assert.ok(s.includes("const isUnscheduled = (j) => !j.start || (j.assignedTechIds || []).length === 0;"), 'no placed start, or no crew — a held crew and a won opportunity both count');
    assert.ok(s.includes("    const sortedQueue = useMemo(() => jobs.filter(isUnscheduled).sort(QUEUE_SORTS[queueSort] || QUEUE_SORTS.Priority), [jobs, queueSort]);"), 'unscheduled only — Jeff saw a scheduled job join the list and called it a bug');
    assert.ok(s.includes("    const selectedJob = (chosen && isUnscheduled(chosen)) ? chosen : (jobs.find(isUnscheduled) || null);"), 'a selection pointing at a scheduled job is ignored; the default is the first job to schedule');
    assert.ok(s.includes("        if (!isUnscheduled(job)) { openJobRecord(job.id); return; }"), 'the board sends a scheduled job to its record in Jobs');
    assert.ok(s.includes("                        onOpenJob={openJobRecord}"), 'so does Service Due\'s Open job on a scheduled visit');
    assert.ok(!s.includes('✓ Scheduled'), 'no scheduled card exists to badge');
    assert.ok(!s.includes("selectedJobId={selectedJobId || jobsWithBridge[0]?.id}"), 'the parent no longer defaults to the first row of every job');
    assert.ok(s.includes("        const sel = selectedJob;\n"), 'the held-crew effect reads the job actually shown');
    assert.ok(s.includes("    }, [selectedJob?.id]);   // eslint-disable-line react-hooks/exhaustive-deps"), 'and follows it');
});

test('a won opportunity has Create job where a saved job has Edit job — header and card; unset template values read as unset', () => {
    assert.ok(s.includes('Edit job →'), 'the saved job\'s header button');
    assert.ok(s.includes("{onCreateBridgeJob && selectedJob.isBridge && ("), 'the header button for a won opportunity');
    assert.ok(s.includes("{onCreateBridgeJob && j.isBridge && ("), 'the card link for a won opportunity');
    assert.ok(s.includes("<span onClick={e => { e.stopPropagation(); onCreateBridgeJob(j); }} title=\"Create the job from this won opportunity\""), 'the card link does not also re-select');
    assert.equal(s.match(/onCreateBridgeJob\(selectedJob\)/g).length, 1, 'one Create job button on the selected row — the banner explains, the header acts');
    assert.ok(s.includes('const crewLine = (j, compact = false) => {'));
    assert.ok(s.includes("    if (crew == null && hrs == null) return 'crew and duration not set';"));
    assert.ok(s.includes('<span>{crewLine(j, true)}</span>'), 'the queue card');
    assert.ok(s.includes('<span>{crewLine(job)}</span>'), 'the board rail card');
    assert.ok(s.includes("{ l: 'Crew size',   v: selectedJob.crewSize > 0 ? `${selectedJob.crewSize} tech${selectedJob.crewSize > 1 ? 's' : ''}` : 'Not set' },"));
    assert.ok(s.includes("{ l: 'Duration',    v: selectedJob.durationHrs > 0 ? `${selectedJob.durationHrs}h` : 'Not set' },"));
    assert.ok(s.includes("{ l: 'Min license', v: selectedJob.minLicense || 'Not set' },"));
    assert.ok(!s.includes('`${selectedJob.crewSize} techs`'), '"null techs" is gone');
});
