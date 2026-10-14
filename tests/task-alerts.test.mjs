// tests/task-alerts.test.mjs
//
// Whose task interrupts whom (state §0.200 — OPEN_ITEMS §1 item 2; Jeff, 13 Oct: "just dont show the admin her
// reminders at all", "admin can see her tasks via the task tab", "they dont need a reminder"; then "Show for
// anyone", "Own only, fix the timing", "Re-check queued popups", "Same-minute reminders", "Test the timing logic").
//
// Before: the task reminder, the due/overdue popup and the bell's task entries went through every task the
// session loaded — for an Admin, Manager or Dispatcher the whole org's — so every member's overdue task popped up
// for them, with a chime; several reminders in one minute showed only the last, each marked fired; a queued alert
// showed as it was queued, completed or reassigned since; a snoozed reminder came back from a timer over the one
// open; the bell's "Task due today" ran from noon the day before to noon on the due day, never overdue; and after a
// sign-out or a switch to no org the last org's list, still loaded, could pop a task into the next org. Here:
// src/utils/taskAlerts.js run on made-up rows, and THE GUARD — App's two checkers and the bell take what it
// decides, from the active org's list only, and ModalLayer shows the next queued alert that still stands.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
    alertsMe, nextStanding, standingCount, reminderClock, reminderStands, atReminderTime, reminderStep,
    dueStands, dueAlerts, dueStep, taskBellEntries,
} from '../src/utils/taskAlerts.js';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const count = (s, sub) => s.split(sub).length - 1;
// The text from `start` to the first `end` after it — both there, or the test fails on a line that is gone.
const between = (s, start, end) => {
    const a = s.indexOf(start);
    assert.ok(a >= 0, `not found: ${start}`);
    const z = s.indexOf(end, a + start.length);
    assert.ok(z >= 0, `no end after: ${start}`);
    return s.slice(a, z + end.length);
};

// The org on screen, the signed-in Admin (Jeff) and a rep (Karen) — each app id the org's own.
const ORG = 'org_qa', OTHER = 'org_test';
const ME = 'usr_jeff', KAREN = 'usr_karen';
const WHO = { me: ME, org: ORG };
const task = (id, fields = {}) => ({ id, orgId: ORG, title: `Task ${id}`, ownerId: null, completed: false, status: 'Open', ...fields });

test('whose task alerts: the member\'s own and the ones nobody owns — never another member\'s, never with the profile unknown, never another org\'s row', () => {
    assert.equal(alertsMe(task('t1', { ownerId: ME }), WHO), true, 'my own');
    assert.equal(alertsMe(task('t2', { ownerId: KAREN }), WHO), false, 'an Admin holding Karen\'s task gets nothing ("they dont need a reminder")');
    for (const none of [null, undefined, '']) assert.equal(alertsMe(task('t3', { ownerId: none }), WHO), true, `nobody's (${JSON.stringify(none)}) — "Show for anyone"`);
    assert.equal(alertsMe(task('t1', { ownerId: ME }), { me: null, org: ORG }), false, 'the profile unknown: my own does not alert yet');
    assert.equal(alertsMe(task('t3'), { me: null, org: ORG }), false, 'nor one nobody owns — null never meets null, and nothing alerts until the app knows who is signed in');
    assert.equal(alertsMe(task('t1', { ownerId: ME, orgId: OTHER }), WHO), false, 'a row of another org');
    assert.equal(alertsMe(task('t3', { orgId: OTHER }), WHO), false, 'nobody\'s, of another org');
    assert.equal(alertsMe(task('t3', { orgId: undefined }), WHO), false, 'a row naming no org');
    assert.equal(alertsMe(task('t1', { ownerId: ME }), { me: ME, org: null }), false, 'no org on screen');
    assert.equal(alertsMe(task('t1', { ownerId: ME, orgId: null }), { me: ME, org: null }), false, 'no org on screen and a row naming none: null never meets null');
    assert.equal(alertsMe(task('t2', { ownerId: KAREN, assignedTo: 'Jeff Russell' }), WHO), false, 'by owner id, never the display name');
    assert.equal(alertsMe(task('t4', { ownerId: ' usr_jeff' }), WHO), false, 'an owner id padded — no one\'s');
    assert.equal(alertsMe(task('t5', { ownerId: 'user_2abcClerk' }), WHO), false, 'a Clerk id where an app id belongs — no one\'s');
    assert.equal(alertsMe(task('t1', { ownerId: ME }), { me: 'usr_jeff_in_test', org: ORG }), false, 'the last org\'s id (one per org) matches nothing here');
    assert.equal(alertsMe(null, WHO), false);
});

test('a reminder time reads as typed: AM and PM, 12 AM midnight and 12 PM noon, a 24-hour time, what does not read as a number 0', () => {
    assert.deepEqual(reminderClock('9:00 AM'), { h: 9, m: 0 });
    assert.deepEqual(reminderClock('9:05 pm'), { h: 21, m: 5 });
    assert.deepEqual(reminderClock('9:05pm'), { h: 21, m: 5 });
    assert.deepEqual(reminderClock('12:00 AM'), { h: 0, m: 0 });
    assert.deepEqual(reminderClock('12:30 PM'), { h: 12, m: 30 });
    assert.deepEqual(reminderClock('14:45'), { h: 14, m: 45 });
    assert.deepEqual(reminderClock('7'), { h: 7, m: 0 });
    assert.deepEqual(reminderClock(''), { h: 0, m: 0 });
    assert.deepEqual(reminderClock('soon'), { h: 0, m: 0 });
    assert.deepEqual(reminderClock(undefined), { h: 0, m: 0 });
});

// 13 Oct 2026, 9:00:20 in the morning, local.
const NOW = new Date(2026, 9, 13, 9, 0, 20);
const TODAY = '2026-10-13';
const at = (id, time, fields = {}) => task(id, { reminderDate: TODAY, reminderTime: time, ...fields });

test('a reminder is for its minute: its own moment, its date and its time, give or take one — across the hour and midnight too', () => {
    assert.equal(atReminderTime(at('r', '9:00 AM'), NOW), true);
    assert.equal(atReminderTime(at('r', '9:01 AM'), NOW), true, 'a minute ahead');
    assert.equal(atReminderTime(at('r', '8:59 AM'), new Date(2026, 9, 13, 8, 59, 50)), true);
    assert.equal(atReminderTime(at('r', '9:00 AM'), new Date(2026, 9, 13, 9, 1, 20)), true, 'a minute behind — a tick that came late (a page loaded at 9:01, a machine woken)');
    assert.equal(atReminderTime(at('r', '9:00 AM'), new Date(2026, 9, 13, 9, 2, 20)), false, 'two minutes behind');
    assert.equal(atReminderTime(at('r', '10:00 AM'), new Date(2026, 9, 13, 9, 59, 20)), true, 'across the hour, ahead (the hour and the minute were compared apart: 9:59 never met 10:00)');
    assert.equal(atReminderTime(at('r', '8:59 AM'), NOW), true, 'across the hour, behind');
    assert.equal(atReminderTime(at('r', '9:02 AM'), NOW), false, 'two minutes off');
    assert.equal(atReminderTime(at('r', '11:59 PM'), new Date(2026, 9, 14, 0, 0, 20)), true, 'across midnight, a minute behind (the date was asked first: an 11:59 PM reminder a minute late was missed)');
    assert.equal(atReminderTime(at('r', '11:59 PM'), new Date(2026, 9, 14, 0, 1, 20)), false, 'across midnight, two minutes behind');
    assert.equal(atReminderTime(at('r', '12:00 AM', { reminderDate: '2026-10-14' }), new Date(2026, 9, 13, 23, 59, 30)), true, 'across midnight, a minute ahead');
    assert.equal(atReminderTime(at('r', '9:00 AM', { reminderDate: '10/13/2026' }), NOW), false, 'a date that does not read as yyyy-mm-dd is for no minute');
    assert.equal(atReminderTime(at('r', '10:00 AM'), NOW), false, 'another hour');
    assert.equal(atReminderTime(at('r', '9:00 PM'), NOW), false, 'the evening');
    assert.equal(atReminderTime(at('r', '9:00 AM', { reminderDate: '2026-10-14' }), NOW), false, 'another day');
    assert.equal(atReminderTime(at('r', '09:00'), NOW), true, 'a 24-hour time');
    assert.equal(reminderStands(at('r', '9:00 AM', { completed: true }), WHO), false, 'completed');
    assert.equal(reminderStands(at('r', '9:00 AM', { reminderTime: '' }), WHO), false, 'its time cleared');
    assert.equal(reminderStands(at('r', '9:00 AM', { reminderDate: null }), WHO), false, 'its date cleared');
    assert.equal(reminderStands(at('r', '9:00 AM', { ownerId: KAREN }), WHO), false, 'another member\'s');
    assert.equal(reminderStands(at('r', '9:00 AM'), WHO), true, 'nobody\'s, open, set');
});

const step = (over = {}) => reminderStep({ tasks: [], now: NOW, ...WHO, fired: [], snoozed: {}, open: null, queue: [], ...over });

test('the reminder checker: my own and nobody\'s come due at their minute, each once; another member\'s never; nothing with the profile unknown', () => {
    const mine = at('m1', '9:00 AM', { ownerId: ME }), karens = at('k1', '9:00 AM', { ownerId: KAREN }), nobodys = at('n1', '9:01 AM');
    const tasks = [karens, mine, nobodys, at('done', '9:00 AM', { ownerId: ME, completed: true }), at('later', '11:00 AM', { ownerId: ME })];
    const s = step({ tasks });
    assert.equal(s.show, mine, 'the first that came due shows');
    assert.deepEqual(s.queue.map((t) => t.id), ['n1'], 'the next waits its turn');
    assert.deepEqual(s.fired, ['m1', 'n1'], 'each that came due is fired — once');
    assert.equal(s.chime, true);
    const again = step({ tasks, fired: ['m1', 'n1'], open: mine, queue: s.queue });
    assert.equal(again.show, null);
    assert.equal(again.queue, s.queue, 'nothing new: the same queue — never set again');
    assert.deepEqual(again.fired, []);
    assert.equal(again.chime, false);
    const closed = step({ tasks, fired: ['m1', 'n1'] });
    assert.equal(closed.show, null, 'dismissed within its minute, nothing waiting: it does not come back');
    assert.equal(closed.chime, false);
    const unknown = step({ tasks, me: null });
    assert.equal(unknown.show, null);
    assert.equal(unknown.chime, false, 'the profile not yet known: nothing — not even nobody\'s');
    assert.equal(step({ tasks: [karens] }).chime, false, 'Karen\'s reminder never sounds for the Admin');
    assert.equal(step({ tasks: [at('o1', '9:00 AM', { ownerId: ME, orgId: OTHER })] }).chime, false, 'another org\'s row never');
});

test('the same minute: several reminders each show, one after another, and a new one never replaces the one open (before, the last replaced the rest, each marked fired, unseen)', () => {
    const a = at('a', '9:00 AM', { ownerId: ME }), b = at('b', '9:00 AM', { ownerId: ME }), c = at('c', '9:00 AM');
    const s = step({ tasks: [a, b, c] });
    assert.equal(s.show, a);
    assert.deepEqual(s.queue.map((t) => t.id), ['b', 'c']);
    const open = at('x', '8:00 AM', { ownerId: ME });
    const busy = step({ tasks: [a, b, open], open });
    assert.equal(busy.show, null, 'one open: nothing replaces it');
    assert.deepEqual(busy.queue.map((t) => t.id), ['a', 'b'], 'they wait behind it');
    assert.equal(busy.chime, true, 'and sound, as they came due');
    const queued = step({ tasks: [a, b], open, queue: [a] });
    assert.deepEqual(queued.queue.map((t) => t.id), ['a', 'b'], 'one already waiting is not queued twice');
});

test('the queue\'s turn: the next that still stands, read in the list as it is now — completed, reassigned, cleared or gone since is skipped; the turn is silent', () => {
    const q0 = at('q0', '8:00 AM', { ownerId: ME }), q1 = at('q1', '8:00 AM', { ownerId: ME }), q2 = at('q2', '8:00 AM', { ownerId: ME }), q3 = at('q3', '8:00 AM');
    const now = [{ ...q0, reminderTime: '' }, { ...q1, completed: true }, { ...q2, ownerId: KAREN }, { ...q3, title: 'Call back — edited' }];
    const s = step({ tasks: now, fired: ['q0', 'q1', 'q2', 'q3'], queue: [q0, q1, q2, q3] });
    assert.equal(s.show, now[3], 'q0 its reminder cleared, q1 completed and q2 reassigned to Karen since are skipped; q3 shows as the list holds it now');
    assert.equal(s.show.title, 'Call back — edited');
    assert.deepEqual(s.queue, []);
    assert.equal(s.chime, false, 'a turn of the queue is silent — the round sounded');
    const gone = step({ tasks: [], fired: ['q1'], queue: [q1] });
    assert.equal(gone.show, null);
    assert.deepEqual(gone.queue, [], 'one the list no longer holds: dropped');
    const empty = [];
    assert.equal(step({ tasks: [q1], queue: empty, fired: ['q1'] }).queue, empty, 'nothing waiting: the same array');
});

test('a snoozed reminder comes back through the checker once its time runs out — while it still stands, behind the one open; its snooze cleared either way', () => {
    const t1 = at('s1', '8:00 AM', { ownerId: ME });
    const ran = step({ tasks: [t1], fired: ['s1'], snoozed: { s1: NOW.getTime() - 1000 } });
    assert.equal(ran.show, t1);
    assert.deepEqual(ran.ended, ['s1']);
    assert.equal(ran.chime, true);
    assert.deepEqual(ran.fired, [], 'fired already: not again');
    const pending = step({ tasks: [{ ...t1, reminderTime: '9:00 AM' }], fired: ['s1'], snoozed: { s1: NOW.getTime() + 60000 } });
    assert.equal(pending.show, null, 'not yet');
    assert.deepEqual(pending.ended, []);
    const unfired = step({ tasks: [{ ...t1, reminderTime: '9:00 AM' }], fired: [], snoozed: { s1: NOW.getTime() + 60000 } });
    assert.equal(unfired.show, null, 'a snooze not yet run out holds it at its minute even unfired (defensive: in the app a reminder snoozed has always fired)');
    assert.equal(unfired.chime, false);
    const reassigned = step({ tasks: [{ ...t1, ownerId: KAREN }], fired: ['s1'], snoozed: { s1: NOW.getTime() - 1 } });
    assert.equal(reassigned.show, null, 'reassigned to Karen while snoozed: it does not come back for me');
    assert.deepEqual(reassigned.ended, ['s1'], 'and its snooze is cleared');
    const open = at('o', '8:00 AM', { ownerId: ME });
    const behind = step({ tasks: [t1, open], fired: ['s1', 'o'], snoozed: { s1: NOW.getTime() - 1 }, open });
    assert.equal(behind.show, null);
    assert.deepEqual(behind.queue.map((t) => t.id), ['s1'], 'it waits behind the one open — never over it');
    const gone = step({ tasks: [], snoozed: { s1: NOW.getTime() - 1 } });
    assert.deepEqual(gone.ended, ['s1'], 'a snooze of a task gone is cleared too');
});

const DUE = { today: TODAY, nowMs: NOW.getTime(), ...WHO, dismissed: [], snoozed: {} };

test('the due popup: my own and nobody\'s open tasks due today or overdue, the most overdue first — not another member\'s, not dismissed, not snoozed, not done', () => {
    const tasks = [
        task('today', { ownerId: ME, dueDate: TODAY }),
        task('old', { ownerId: ME, dueDate: '2026-10-10' }),
        task('nobody', { dueDate: '2026-10-11' }),
        task('karen', { ownerId: KAREN, dueDate: '2026-10-01' }),
        task('soon', { ownerId: ME, dueDate: '2026-10-14' }),
        task('done', { ownerId: ME, dueDate: '2026-10-01', completed: true }),
        task('status', { ownerId: ME, dueDate: '2026-10-01', status: 'Completed' }),
        task('nodate', { ownerId: ME }),
        task('dismissed', { ownerId: ME, dueDate: '2026-10-02' }),
        task('snoozed', { ownerId: ME, dueDate: '2026-10-03' }),
        task('woke', { ownerId: ME, dueDate: '2026-10-04' }),
        task('other', { ownerId: ME, dueDate: '2026-10-01', orgId: OTHER }),
    ];
    const ctx = { ...DUE, dismissed: ['dismissed'], snoozed: { snoozed: NOW.getTime() + 1000, woke: NOW.getTime() - 1000 } };
    assert.deepEqual(dueAlerts(tasks, ctx).map((t) => t.id), ['woke', 'old', 'nobody', 'today']);
    assert.deepEqual(dueAlerts(tasks, { ...ctx, me: null }), [], 'the profile not yet known: nothing');
    assert.equal(dueStands(task('k', { ownerId: KAREN, dueDate: TODAY }), DUE), false, 'Karen\'s overdue task never pops for the Admin');
});

test('the due checker: none while one is open; else the queue\'s next that still stands, silent; else a new round with a chime', () => {
    const a = task('a', { ownerId: ME, dueDate: '2026-10-01' }), b = task('b', { ownerId: ME, dueDate: '2026-10-02' });
    const open = task('o', { ownerId: ME, dueDate: TODAY });
    const queue = [a];
    const busy = dueStep({ tasks: [a, b, open], open, queue, ...DUE });
    assert.deepEqual(busy, { show: null, queue, chime: false });
    const round = dueStep({ tasks: [b, a], ...DUE });
    assert.equal(round.show, a, 'the most overdue first');
    assert.deepEqual(round.queue.map((t) => t.id), ['b']);
    assert.equal(round.chime, true);
    const turn = dueStep({ tasks: [{ ...a, completed: true }, b], queue: [a, b], ...DUE });
    assert.equal(turn.show.id, 'b', 'a completed since is skipped');
    assert.equal(turn.chime, false, 'the queue\'s turn is silent');
    const empty = [];
    const none = dueStep({ tasks: [], queue: empty, ...DUE });
    assert.equal(none.queue, empty, 'nothing due and nothing waiting: the same array');
    assert.equal(none.show, null);
    const stale = dueStep({ tasks: [{ ...a, ownerId: KAREN }], queue: [a], ...DUE });
    assert.deepEqual(stale, { show: null, queue: [], chime: false }, 'nothing in the queue stands and nothing new: the queue emptied');
    const leftover = dueStep({ tasks: [a, { ...b, completed: true }], queue: [{ ...b }], ...DUE });
    assert.equal(leftover.show, a);
    assert.deepEqual(leftover.queue, [], 'a new round of one empties a queue that no longer stands');
    const one = dueStep({ tasks: [a], queue: empty, ...DUE });
    assert.equal(one.queue, empty, 'one due, none to queue: the queue unchanged');
    const karens = dueStep({ tasks: [task('k', { ownerId: KAREN, dueDate: '2026-10-01' })], ...DUE });
    assert.equal(karens.show, null, 'an Admin\'s list holding only Karen\'s overdue task: nothing pops');
    assert.equal(karens.chime, false, 'and nothing sounds');
});

test('the queue helpers: the next that stands with what is left after it; the count of those that stand', () => {
    const list = [task('a'), task('b', { ownerId: KAREN }), task('c')];
    const stands = (t) => alertsMe(t, WHO);
    assert.deepEqual(nextStanding([{ id: 'b' }, { id: 'c' }, { id: 'a' }], list, stands), { task: list[2], rest: [{ id: 'a' }] });
    assert.deepEqual(nextStanding([{ id: 'zz' }], list, stands), { task: null, rest: [] });
    assert.equal(standingCount([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'zz' }], list, stands), 2);
});

test('the bell: my own and nobody\'s open tasks due today or overdue, the most overdue first — not from noon the day before, never another member\'s', () => {
    const afternoon = new Date(2026, 9, 13, 15, 0, 0);
    const tasks = [
        task('today', { ownerId: ME, dueDate: TODAY, title: 'Send the quote' }),
        task('late', { ownerId: ME, dueDate: '2026-10-09', title: 'Call Ineos' }),
        task('nobody', { dueDate: '2026-10-12', title: 'Unassigned follow-up' }),
        task('karen', { ownerId: KAREN, dueDate: TODAY, title: 'Karen\'s call' }),
        task('tomorrow', { ownerId: ME, dueDate: '2026-10-14', title: 'Tomorrow' }),
        task('done', { ownerId: ME, dueDate: TODAY, completed: true }),
        task('status', { ownerId: ME, dueDate: TODAY, status: 'Completed' }),
    ];
    const entries = taskBellEntries(tasks, { now: afternoon, ...WHO });
    assert.deepEqual(entries.map((e) => [e.id, e.type, e.message]), [
        ['task-late', 'danger', 'Task overdue: Call Ineos'],
        ['task-nobody', 'danger', 'Task overdue: Unassigned follow-up'],
        ['task-today', 'warning', 'Task due today: Send the quote'],
    ], 'the old bell said "Task due today" for tomorrow\'s task from noon, and never for an overdue one');
    assert.equal(entries[0].taskId, 'late');
    assert.equal(entries[0].date, afternoon.toISOString());
    assert.deepEqual(taskBellEntries(tasks, { now: afternoon, me: null, org: ORG }), [], 'the profile not yet known: none');
    assert.deepEqual(taskBellEntries(tasks, { now: afternoon, me: ME, org: OTHER }), [], 'rows of another org: none');
});

// ── THE GUARD ───────────────────────────────────────────────

// App's checkers and bell, as this batch wires them: each reads the active org's lists only — its first line —
// decides through taskAlerts.js, sets what its step answers, and keeps activeOrgId out of its deps (a switch alone
// never runs it in its own commit, whose render still holds the last org's lists). Answers what is wrong — empty
// for the tree, and not for the checkers as they were.
const GUARD_LINE = '            if (!listsOnScreen(activeOrgId)) return;';
const NAMES = {
    import: 'the import',
    onScreen: 'the lists a checker may read: the active org\'s, its switch run, its lists loaded',
    remGuard: 'the reminder checker reads the active org\'s list only — first',
    remStep: 'the reminder checker decides through reminderStep with who is signed in, and sets what the step answers — fired each once, snoozes run out cleared, the queue only when it changed, a popup only when one shows — sounding only for something newly due',
    remWalk: 'the reminder checker walks no task list of its own',
    remDeps: 'the reminder checker re-runs when the profile lands, the popup closes or the queue moves — and not on activeOrgId',
    remByName: 'the reminder checker passed by name, its interval cleared with each run (an old one kept its closure: a reminder dismissed came back each tick of its minute)',
    dueGuard: 'the due checker reads the active org\'s list only — first',
    dueStep: 'the due checker decides through dueStep with who is signed in, sets what the step answers — a silent turn too — and sounds only for a new round',
    dueWalk: 'the due checker walks no task list of its own',
    dueDeps: 'the due checker re-runs when the profile lands or the queue moves — and not on activeOrgId',
    dueByName: 'the due checker passed by name, its interval cleared with each run (an old one kept its closure: a dismissed alert came back each minute)',
    bellGuard: 'the bell is made from the active org\'s lists only, and empties when they are not — first',
    bellTasks: 'the bell\'s task entries are taskBellEntries\'',
    bellWalk: 'the bell walks no task list of its own',
    bellDeps: 'the bell re-runs as before — its interval cleared with each run — and not on activeOrgId',
    bellWords: 'the bell\'s words are taskAlerts.js\'s alone',
};
function appWiringProblems(app) {
    const wrong = [];
    const need = (ok, key) => { if (!ok) wrong.push(NAMES[key]); };
    const c = code(app);
    const body = (start) => (c.indexOf(start) >= 0 ? between(c, start, '\n        };\n') : '');
    need(c.includes("import { reminderStep, dueStep, taskBellEntries } from './utils/taskAlerts.js';"), 'import');
    need(c.includes('    const listsOnScreen = (org) => !!org && uiOrgRef.current === org && listsOrgRef.current === org;'), 'onScreen');
    const rem = body('        const checkReminders = () => {');
    need(rem.startsWith(`        const checkReminders = () => {\n${GUARD_LINE}\n`), 'remGuard');
    need(rem.includes('            const step = reminderStep({ tasks, now: new Date(), me: currentUserId, org: activeOrgId,\n                fired: dismissedReminders, snoozed: snoozedReminders, open: taskReminderPopup, queue: taskReminderQueue });\n' +
        '            if (step.fired.length) setDismissedReminders(prev => [...prev, ...step.fired.filter(id => !prev.includes(id))]);\n' +
        '            if (step.ended.length) setSnoozedReminders(prev => { const left = { ...prev }; for (const id of step.ended) delete left[id]; return left; });\n' +
        '            if (step.queue !== taskReminderQueue) setTaskReminderQueue(step.queue);\n' +
        '            if (step.show) setTaskReminderPopup(step.show);\n' +
        '            if (step.chime) {\n'), 'remStep');
    need(!/tasks\.(forEach|filter|map|some|find)\(/.test(rem), 'remWalk');
    need(c.includes('    }, [tasks, dismissedReminders, snoozedReminders, taskReminderPopup, taskReminderQueue, currentUserId]);'), 'remDeps');
    need(c.includes('        const interval = setInterval(checkReminders, 30000); // Check every 30 seconds\n        return () => clearInterval(interval);\n'), 'remByName');
    const due = body('        const checkDueToday = () => {');
    need(due.startsWith(`        const checkDueToday = () => {\n${GUARD_LINE}   // this org's lists only — as the reminder checker\n`), 'dueGuard');
    need(due.includes('            const step = dueStep({ tasks, today: todayLocal(), nowMs: Date.now(), me: currentUserId, org: activeOrgId,\n                dismissed: dismissedDueTodayAlerts, snoozed: snoozedDueAlerts, open: taskDuePopup, queue: taskDueQueue });\n' +
        '            if (step.queue !== taskDueQueue) setTaskDueQueue(step.queue);\n' +
        '            if (step.show) setTaskDuePopup(step.show);\n' +
        '            if (!step.chime) return;\n'), 'dueStep');
    need(!/tasks\.(forEach|filter|map|some|find)\(/.test(due), 'dueWalk');
    need(c.includes('    }, [tasks, dismissedDueTodayAlerts, snoozedDueAlerts, taskDuePopup, taskDueQueue, currentUserId]);'), 'dueDeps');
    need(c.includes('        const interval = setInterval(checkDueToday, 60000);\n        return () => clearInterval(interval);\n'), 'dueByName');
    const bell = body('        const generateNotifications = () => {');
    need(bell.startsWith('        const generateNotifications = () => {\n            if (!listsOnScreen(activeOrgId)) { setNotifications(prev => (prev.length ? [] : prev)); return; }\n            const newNotifications = [];\n'), 'bellGuard');
    need(bell.includes('            newNotifications.push(...taskBellEntries(tasks, { now, me: currentUserId, org: activeOrgId }));'), 'bellTasks');
    need(!/tasks\.(forEach|filter|map|some|find)\(/.test(bell), 'bellWalk');
    need(c.includes('        const interval = setInterval(generateNotifications, 60000); // Check every minute\n        \n        return () => clearInterval(interval);\n    }, [opportunities, activities, tasks, coachingNotes, currentUserId, myProfile]);'), 'bellDeps');
    need(!c.includes('Task due today'), 'bellWords');
    return wrong;
}

test('THE GUARD: App\'s two checkers and the bell decide through taskAlerts.js, from the active org\'s lists only, re-run when the profile lands, and keep activeOrgId out of their deps; no other file names either popup\'s setter', () => {
    assert.deepEqual(appWiringProblems(read('src/App.jsx')), []);
    const app = code(read('src/App.jsx'));
    assert.equal(count(app, GUARD_LINE), 2, 'one guard in each checker');
    assert.ok(app.includes('    const listsOrgRef  = React.useRef(null);   // the org whose lists are on screen (state §0.173)'), 'the ref naming the org whose lists are loaded');
    assert.ok(app.includes('    const uiOrgRef = useRef(null);   // the org the open UI belongs to'), 'the ref the switch moves in its own effects');
    assert.ok(app.indexOf('    const listsOnScreen = (org) =>') > app.indexOf('    const uiOrgRef = useRef(null);'), 'the helper after the refs it reads');
    assert.ok(app.includes('        snoozedReminders, setSnoozedReminders, taskReminderQueue, setTaskReminderQueue,\n'), 'App takes the reminder\'s snooze and queue from the modal state');
    assert.ok(app.includes('        taskReminderQueue, setTaskReminderQueue,\n        setSnoozedReminders,\n'), 'and hands ModalLayer the queue and the snooze');
    // Every place either popup's setter is named — called, handed on or destructured: useModalState declares and
    // returns it; App takes it, calls it from its step and hands it to the context; ModalLayer takes it and shows the
    // queue's next that stands. A new one could show a task no rule asked whose it is.
    const sites = {};
    for (const rel of readdirSync(new URL('src/', ROOT), { recursive: true })) {
        if (!/\.(jsx?|mjs)$/.test(rel)) continue;
        const file = `src/${String(rel).replace(/\\/g, '/')}`;
        const t = code(read(file));
        for (const name of ['setTaskReminderPopup', 'setTaskDuePopup']) if (count(t, name)) sites[`${file} ${name}`] = count(t, name);
    }
    assert.deepEqual(sites, {
        'src/App.jsx setTaskReminderPopup': 3, 'src/App.jsx setTaskDuePopup': 3,
        'src/components/layout/ModalLayer.jsx setTaskReminderPopup': 2, 'src/components/layout/ModalLayer.jsx setTaskDuePopup': 2,
        'src/hooks/useModalState.js setTaskReminderPopup': 2, 'src/hooks/useModalState.js setTaskDuePopup': 2,
    });
    assert.ok(app.includes('            if (step.show) setTaskReminderPopup(step.show);') && app.includes('            if (step.show) setTaskDuePopup(step.show);'), 'App\'s calls are the steps\'');
    const ml = code(read('src/components/layout/ModalLayer.jsx'));
    assert.equal(count(ml, 'setTaskReminderPopup(') + count(ml, 'setTaskDuePopup('), 2, 'ModalLayer\'s calls are the queue\'s next that stands');
});

test('THE GUARD finds the checkers as they were — every member\'s task, no org check, no profile, the last of a minute over the rest', () => {
    const before = [
        "import { isoLocal, todayLocal } from './utils/dateLocal';",
        '    useEffect(() => {',
        '        const checkReminders = () => {',
        '            tasks.forEach(task => {',
        '                if (task.completed || !task.reminderDate || !task.reminderTime) return;',
        '                setTaskReminderPopup(task);',
        '            });',
        '        };',
        '        const interval = setInterval(checkReminders, 30000); // Check every 30 seconds',
        '        return () => clearInterval(interval);',
        '    }, [tasks, dismissedReminders]);',
        '        const checkDueToday = () => {',
        '            const dueTasks = tasks.filter(task => {',
        '            });',
        '        };',
        '        const interval = setInterval(checkDueToday, 60000);',
        '        return () => clearInterval(interval);',
        '    }, [tasks, dismissedDueTodayAlerts, snoozedDueAlerts, taskDuePopup]);',
        '        const generateNotifications = () => {',
        '            const newNotifications = [];',
        '            tasks.forEach(task => {',
        "                        message: `Task due today: ${task.title}`,",
        '            });',
        '        };',
        '        const interval = setInterval(generateNotifications, 60000); // Check every minute',
        '        ',
        '        return () => clearInterval(interval);',
        '    }, [opportunities, activities, tasks, coachingNotes, currentUserId, myProfile]);',
    ].join('\n') + '\n';
    assert.deepEqual(appWiringProblems(before), ['import', 'onScreen', 'remGuard', 'remStep', 'remWalk', 'remDeps', 'dueGuard', 'dueStep', 'dueWalk', 'dueDeps', 'bellGuard', 'bellTasks', 'bellWalk', 'bellWords'].map((k) => NAMES[k]),
        'every rule but the intervals passed by name and cleared, and the bell\'s deps, which the checkers kept: no org check, no step — so no profile, and the last of a minute over the rest — the deps without the member');
    const cleanups = before.replace('        return () => clearInterval(interval);\n', '');
    assert.ok(appWiringProblems(cleanups).includes(NAMES.remByName), 'a checker whose interval outlives its run is flagged');
    const tree = read('src/App.jsx');
    for (const [from, to] of [['taskReminderQueue, currentUserId]);', 'taskReminderQueue, currentUserId, activeOrgId]);'], ['taskDueQueue, currentUserId]);', 'taskDueQueue, currentUserId, activeOrgId]);']]) {
        assert.ok(appWiringProblems(tree.replace(from, to)).length > 0, `activeOrgId in a checker's deps is flagged (${to}): its run in a switch's commit holds the last org's list`);
    }
    const late = tree.replace(`${GUARD_LINE}\n            const step = reminderStep(`, '            const step = reminderStep(').replace('            if (step.show) setTaskReminderPopup(step.show);\n', `            if (step.show) setTaskReminderPopup(step.show);\n${GUARD_LINE}\n`);
    assert.ok(appWiringProblems(late).includes(NAMES.remGuard), 'a guard below what the checker sets is flagged: an old tick would set the last org\'s popup first');
    const lateDue = tree.replace(`${GUARD_LINE}   // this org's lists only — as the reminder checker\n`, '').replace('            if (!step.chime) return;\n', `            if (!step.chime) return;\n${GUARD_LINE}   // this org's lists only — as the reminder checker\n`);
    assert.notEqual(lateDue, tree);
    assert.ok(appWiringProblems(lateDue).includes(NAMES.dueGuard), 'and the due checker\'s: an old tick would set the last org\'s due popup and queue first');
});

test('THE GUARD: ModalLayer shows the next queued alert that still stands — every close of either popup — counts only those, and snoozes a reminder by a time the checker reads', () => {
    const ml = code(read('src/components/layout/ModalLayer.jsx'));
    assert.ok(ml.includes("import { nextStanding, standingCount, dueStands, reminderStands } from '../../utils/taskAlerts.js';"));
    assert.ok(ml.includes('        taskReminderPopup, setTaskReminderPopup, taskReminderQueue, setTaskReminderQueue, setSnoozedReminders,\n'), 'the reminder\'s queue and snooze from the context');
    assert.ok(ml.includes('        currentUserId, activeOrgId,\n'), 'who is signed in, and the org on screen');
    assert.ok(ml.includes('    const alertWho = { me: currentUserId, org: activeOrgId };'));
    assert.ok(ml.includes('    const dueNow = () => ({ today: todayLocal(), nowMs: Date.now(), ...alertWho, dismissed: dismissedDueTodayAlerts, snoozed: snoozedDueAlerts });'),
        'what still stands for the due popup, as App\'s checker reads it');
    assert.ok(ml.includes('        const { task, rest } = nextStanding(taskDueQueue, tasks, (t) => dueStands(t, dueNow()));\n        setTaskDuePopup(task);\n        setTaskDueQueue(rest);\n'), 'the due popup\'s next');
    assert.ok(ml.includes('        const { task, rest } = nextStanding(taskReminderQueue, tasks, (t) => reminderStands(t, alertWho));\n        setTaskReminderPopup(task);\n        setTaskReminderQueue(rest);\n'), 'the reminder\'s next');
    assert.ok(ml.includes('        if (taskDuePopup) setDismissedDueTodayAlerts(prev => prev.includes(taskDuePopup.id) ? prev : [...prev, taskDuePopup.id]);\n        showNextDue();\n'), 'Dismiss records the dismissal, then the next');
    assert.equal(count(ml, 'showNextDue();'), 3, 'Dismiss, Snooze and Open Task each show the next due alert that stands');
    assert.ok(ml.includes('                                        setSnoozedDueAlerts(prev => ({ ...prev, [task.id]: Date.now() + ms }));\n                                        showNextDue();\n'),
        'the due alert\'s Snooze records its re-alert time, then the next — or it popped straight back');
    assert.ok(ml.includes('                                        setDismissedDueTodayAlerts(prev => prev.includes(task.id) ? prev : [...prev, task.id]);\n                                        showNextDue();\n'),
        'its Open Task records the dismissal, then the next — or it popped straight back over its task');
    assert.equal(count(ml, 'showNextReminder();'), 2, 'the reminder\'s Snooze and Open Task each show the next');
    assert.equal(count(ml, 'onClick={showNextReminder}'), 2, 'and its backdrop and Dismiss');
    assert.ok(!ml.includes('taskDueQueue[0]') && !ml.includes('taskDueQueue.length'), 'no copy shown as it was queued, no count of copies that no longer stand');
    assert.ok(!ml.includes('setTaskReminderPopup(null)'), 'no close that leaves the reminders waiting unseen');
    assert.ok(ml.includes('    const reminderWaiting = taskReminderPopup ? standingCount(taskReminderQueue, tasks, (t) => reminderStands(t, alertWho)) : 0;'));
    assert.ok(ml.includes('    const dueWaiting = taskDuePopup ? standingCount(taskDueQueue, tasks, (t) => dueStands(t, dueNow())) : 0;'));
    assert.equal(count(ml, 'dueWaiting > 0'), 2, 'the due popup\'s "+N more" and "Dismiss · Next (N)"');
    assert.equal(count(ml, 'reminderWaiting > 0'), 2, 'and the reminder\'s');
    assert.ok(ml.includes('                                        setSnoozedReminders(prev => ({ ...prev, [task.id]: Date.now() + ms }));\n                                        showNextReminder();\n'),
        'a snoozed reminder is a re-alert-at time App\'s checker reads');
    assert.ok(!/setTimeout\(\(\) => \{?[^}]*setTaskReminderPopup/.test(ml), 'no timer brings back the copy snoozed');
});
