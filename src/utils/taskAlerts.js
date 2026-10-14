// Whose task interrupts whom, and when (state §0.200 — OPEN_ITEMS §1 item 2; Jeff, 13 Oct: "just dont show the
// admin her reminders at all", "admin can see her tasks via the task tab", "they dont need a reminder"; then
// "Show for anyone", "Own only, fix the timing", "Re-check queued popups", "Same-minute reminders", "Test the
// timing logic"). The task reminder, the due/overdue popup and the bell's task entries went through every task
// the session loaded — for an Admin, Manager or Dispatcher the whole org's — so each member's overdue task popped
// up for them, with a chime. Each now takes the signed-in member's own tasks and the ones nobody owns, as the
// Tasks tab's Mine does (TasksTab.jsx): by owner id, never the display name; the profile known — a null id
// alerts nothing, so null never meets null; and only rows of the org on screen. Pure: App's checkers and
// ModalLayer hand it the list, the clock and what was dismissed, snoozed and fired; tests/task-alerts.test.mjs
// runs it.
import { isoLocal } from './dateLocal.js';

// The member's own task, or one nobody owns (an empty owner reads as nobody's, as the tasks GET reads it) — the
// member's app id known, the row the active org's.
export function alertsMe(task, { me, org } = {}) {
    if (!task || !me || !org || task.orgId !== org) return false;
    return !task.ownerId || task.ownerId === me;
}

// Open, as the due popup has always read it: not completed, and a Status that is not Completed.
const openForDue = (t) => !t.completed && (t.status || 'Open') !== 'Completed';

// The queue's next alert that still stands, read in the list as it is now — its title or notes edited since show
// as they are; one the list no longer holds, or that no longer stands (completed, reassigned, dismissed), is
// dropped with those before it.
export function nextStanding(queue, tasks, stands) {
    const byId = new Map((tasks || []).map((t) => [t.id, t]));
    for (let i = 0; i < queue.length; i++) {
        const t = byId.get(queue[i].id);
        if (t && stands(t)) return { task: t, rest: queue.slice(i + 1) };
    }
    return { task: null, rest: [] };
}

// How many queued still stand — a popup's "+N more".
export function standingCount(queue, tasks, stands) {
    const byId = new Map((tasks || []).map((t) => [t.id, t]));
    return queue.filter((q) => { const t = byId.get(q.id); return !!t && stands(t); }).length;
}

// ── the reminder ─────────────────────────────────────────────

// A reminder time as typed: "9:00 AM", "2:30 pm", "14:00" — 12 AM is midnight and 12 PM noon; what does not
// read as a number reads 0.
export function reminderClock(text) {
    const s = String(text || '');
    const ampm = s.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (ampm) {
        let h = parseInt(ampm[1], 10);
        const m = parseInt(ampm[2], 10);
        const pm = ampm[3].toUpperCase() === 'PM';
        if (pm && h !== 12) h += 12;
        if (!pm && h === 12) h = 0;
        return { h, m };
    }
    const parts = s.split(':');
    return { h: parseInt(parts[0], 10) || 0, m: parseInt(parts[1], 10) || 0 };
}

// A reminder still worth showing: not completed, a date and a time still set, the member's or nobody's.
export function reminderStands(t, who) {
    return !!t && !t.completed && !!t.reminderDate && !!t.reminderTime && alertsMe(t, who);
}

// The minute a reminder is for: its own moment — its date and its time, local — give or take one (the checker
// reads every 30 s), across the hour and midnight alike: the hour and the minute were compared apart, so 9:59
// never met a 10:00 reminder, and the date first, so an 11:59 PM reminder a minute late was missed. A date that
// does not read as yyyy-mm-dd is for no minute.
export function atReminderTime(t, now) {
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(t.reminderDate || ''));
    if (!day) return false;
    const { h, m } = reminderClock(t.reminderTime);
    const at = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), h, m);
    return Math.abs(Math.floor(now.getTime() / 60000) - Math.floor(at.getTime() / 60000)) <= 1;
}

// One tick of the reminder checker. A reminder comes due at its minute — once, `fired` — or when its snooze runs
// out (`snoozed`: { [taskId]: re-alert-at ms }), and only while it stands. Each that comes due waits its turn
// behind the one open and those queued: several in one minute each show, one after another, and a new one never
// replaces the one open (before, the last of a minute replaced the rest, each marked fired, unseen). With none
// open, the queue's next that still stands shows. Answers what to show, the queue after, the ids newly fired,
// the snoozes run out (each cleared, whether or not its task still stands) and whether to chime — only for
// something newly due; the queue's turn is silent.
export function reminderStep({ tasks, now, me, org, fired = [], snoozed = {}, open = null, queue = [] }) {
    const who = { me, org };
    const nowMs = now.getTime();
    const ended = Object.keys(snoozed).filter((id) => nowMs >= snoozed[id]);
    const waiting = new Set([...(open ? [open.id] : []), ...queue.map((t) => t.id)]);
    const fresh = (tasks || []).filter((t) => reminderStands(t, who) && !waiting.has(t.id)
        && (ended.includes(t.id) || (!fired.includes(t.id) && snoozed[t.id] == null && atReminderTime(t, now))));
    let next = fresh.length ? [...queue, ...fresh] : queue;
    let show = null;
    if (!open && next.length) {
        const { task, rest } = nextStanding(next, tasks, (t) => reminderStands(t, who));
        show = task;
        next = rest;
    }
    return { show, queue: next, fired: fresh.map((t) => t.id).filter((id) => !fired.includes(id)), ended, chime: fresh.length > 0 };
}

// ── the due/overdue popup ────────────────────────────────────

// A due alert still worth showing: open, the member's or nobody's, due today or before (yyyy-mm-dd compares as
// text), not dismissed, not snoozed past now.
export function dueStands(t, { today, nowMs, me, org, dismissed = [], snoozed = {} }) {
    if (!t || !openForDue(t) || !alertsMe(t, { me, org })) return false;
    if (!t.dueDate || t.dueDate > today) return false;
    if (dismissed.includes(t.id)) return false;
    const until = snoozed[t.id];
    return !(until && nowMs < until);
}

// Every due alert that stands, the most overdue first.
export function dueAlerts(tasks, ctx) {
    return (tasks || []).filter((t) => dueStands(t, ctx)).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
}

// One tick of the due checker: nothing while one is open; else the queue's next that still stands — silent, the
// round has sounded; else a new round, the most overdue shown, the rest queued, with a chime. A queue left empty
// is answered as the same array, so an unchanged queue is never set again.
export function dueStep({ tasks, open = null, queue = [], ...ctx }) {
    if (open) return { show: null, queue, chime: false };
    if (queue.length) {
        const { task, rest } = nextStanding(queue, tasks, (t) => dueStands(t, ctx));
        if (task) return { show: task, queue: rest, chime: false };
    }
    const due = dueAlerts(tasks, ctx);
    if (!due.length) return { show: null, queue: queue.length ? [] : queue, chime: false };
    return { show: due[0], queue: due.length > 1 || queue.length ? due.slice(1) : queue, chime: true };
}

// ── the bell ─────────────────────────────────────────────────

// The bell's task entries: the member's own tasks and the ones nobody owns that are open and due today or
// overdue, the most overdue first (before: every task of the org, from noon the day before to noon on the due
// day — an overdue one never).
export function taskBellEntries(tasks, { now, me, org }) {
    const today = isoLocal(now);
    return (tasks || [])
        .filter((t) => !!t && openForDue(t) && alertsMe(t, { me, org }) && !!t.dueDate && t.dueDate <= today)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        .map((t) => (t.dueDate < today
            ? { id: `task-${t.id}`, type: 'danger', message: `Task overdue: ${t.title}`, taskId: t.id, date: now.toISOString() }
            : { id: `task-${t.id}`, type: 'warning', message: `Task due today: ${t.title}`, taskId: t.id, date: now.toISOString() }));
}
