// tests/work-week.test.mjs
//
// A new technician starts rostered (state §0.113). Before this, a technician
// created without a shift pattern was "Not rostered" on every day — once the
// board actually read the roster (§0.112's correction), that blocked every job
// for a new hire until someone opened Work Schedules. The default is Mon–Fri
// 08:00–17:00, defined once in src/utils/workWeek.js and read by the editor's
// new-technician draft (client) and the technicians function's create (server).
// An explicit {} is still "no working days": only an absent pattern defaults.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultWorkWeek, DEFAULT_SHIFT_HOURS, WORK_WEEK_DAYS } from '../src/utils/workWeek.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

test('defaultWorkWeek is Mon–Fri 08:00–17:00, a fresh object every call, weekend absent', () => {
    const w = defaultWorkWeek();
    assert.deepEqual(Object.keys(w), ['mon', 'tue', 'wed', 'thu', 'fri']);
    for (const d of WORK_WEEK_DAYS) assert.deepEqual(w[d], { start: '08:00', end: '17:00' });
    assert.equal(w.sat, undefined);
    assert.equal(w.sun, undefined);
    assert.deepEqual(DEFAULT_SHIFT_HOURS, { start: '08:00', end: '17:00' });
    const w2 = defaultWorkWeek();
    w2.mon.start = '06:00';
    assert.equal(defaultWorkWeek().mon.start, '08:00', 'mutating one copy does not touch the next');
    assert.notEqual(w.mon, w2.mon, 'days are not shared references');
});

test('the technician editor seeds a new technician with the default week; the shift toggle uses the same hours', () => {
    const s = code(read('src/Tabs/DispatchTab.jsx'));
    assert.ok(s.includes("import { defaultWorkWeek, DEFAULT_SHIFT_HOURS } from '../utils/workWeek.js';"));
    assert.ok(s.includes("homeZip: '', skills: [], laborRate: '', overtimeRate: '', assignedVehicleId: '', notes: '', workingHours: defaultWorkWeek() });"),
        'the new-technician draft carries the default pattern, so the POST body does too');
    assert.ok(s.includes('const DEFAULT_SHIFT = DEFAULT_SHIFT_HOURS;'), 'ticking a day on in the shift dialog gives the same 08:00–17:00');
    assert.ok(!s.includes("{ start: '07:00', end: '17:00' }"), 'no second, disagreeing default');
});

test('the technicians function defaults an ABSENT pattern on create, and leaves an explicit {} alone', () => {
    const f = code(read('netlify/functions/dispatch-technicians.mjs'));
    assert.ok(f.includes("import { defaultWorkWeek } from '../../src/utils/workWeek.js';"));
    assert.ok(f.includes('workingHours:     JSON.stringify(data.workingHours     ?? defaultWorkWeek()),'),
        '?? — undefined/null take the default; {} is kept as "no working days"');
});
