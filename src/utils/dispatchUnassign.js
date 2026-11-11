// src/utils/dispatchUnassign.js
// Time off over booked work (state §0.246, docs/design/refusal-sweep 6a; Jeff's Q12): DispatchTab's saveBlock saves the
// block, then returns each of the technician's jobs in that time to the queue, one PUT each. A refused or unsent PUT was
// counted only in the audit row ("— N failed"): both dialogs closed and the view jumped to the Queue, so the dispatcher
// took every job as freed while some stayed on a technician who is away. These are the words of the banner across the
// top of Dispatch that names each job still assigned and why, kept until its Close. Pure; never throws.
//
// notFreed: [{ id, words }] — each job not returned and why (readRefusal's or failureWords' words).
// jobs:     the jobs the screen holds, to name each one (its title, else its customer, else its id).
// techName: the technician's name ('' when unknown). total: how many jobs the save tried to return.
const nameOf = (id, jobs) => {
    const job = (Array.isArray(jobs) ? jobs : []).find((j) => j && j.id === id);
    const title = job ? String(job.title || '').trim() || String(job.customer || '').trim() : '';
    return title || String(id);
};

export const notFreedWords = (notFreed, jobs, techName, total) => {
    const list = Array.isArray(notFreed) ? notFreed : [];
    if (!list.length) return '';
    const n = list.length;
    const of = Math.max(Number(total) || 0, n);
    const one = n === 1;
    const who = String(techName || '').trim() || 'the technician';
    // Each reason's own full stop goes ("The server returned 502." — never ".;" between two jobs); one ends the list.
    let each = list.map(({ id, words }) => `${nameOf(id, jobs)}: ${String(words || '').trim().replace(/\.+$/, '') || 'not returned'}`).join('; ');
    if (!/[.!?]$/.test(each)) each += '.';
    return `The time off was saved, but ${n} of ${of} job${of === 1 ? '' : 's'} ${one ? 'was' : 'were'} not returned to the queue`
        + ` and ${one ? 'is' : 'are'} still assigned to ${who} — ${each} Unassign ${one ? 'it' : 'them'} from the Job Board.`;
};
