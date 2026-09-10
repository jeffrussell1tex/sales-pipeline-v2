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

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const s = code(read('src/Tabs/DispatchTab.jsx'));

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
    assert.ok(s.includes('                        scheduledStart: j.scheduledStart || null,'), 'the board job shape carries it');
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

test('the job editor offers a preferred start time and a time window, and saves them the way the schema expects', () => {
    assert.ok(s.includes('<CustFieldRow label="Preferred start time">'));
    assert.ok(s.includes('<TimeDropdown value={draft.scheduledStart || \'\'} onChange={v => set(\'scheduledStart\', v)} stepMinutes={30} ariaLabel="Preferred start time"/>'));
    assert.ok(s.includes('<CustFieldRow label="Time window">'));
    assert.ok(s.includes("                    scheduledStart:  draft.scheduledStart || null,"));
    assert.ok(s.includes("                    timeSlot:        draft.scheduledStart ? 'exact' : (draft.timeSlot && draft.timeSlot !== 'exact' ? draft.timeSlot : 'anytime'),"), 'a start makes the window exact; otherwise the slot, never a stale exact');
    assert.ok(s.includes('scheduledEnd:    draft.scheduledStart ? addHoursHHMM(draft.scheduledStart,'), 'the end follows the duration');
    assert.ok(s.includes('const addHoursHHMM = (hhmm, hrs) => {'));
});
