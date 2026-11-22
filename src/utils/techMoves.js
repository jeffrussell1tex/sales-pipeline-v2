// techMoves.js — the moves a technician makes in the field, one rule for the job card and the server (state §0.281;
// OPEN_ITEMS §4.8, §0.278's found (b)). The job card offered a move by its own copy of the job (TECH_NEXT), and the
// server checked only where a move went (TECH_STATUS_ALLOWED), never where it came from: a direct request completed a
// cancelled or unscheduled job, and a card that had not seen a dispatcher's change sent its old move again after a
// refusal. A move from anywhere else is the dispatcher's.
//
// From each status, where a technician may take the job: travel, arrive, pause or complete on site, resume.
export const TECH_MOVES = Object.freeze({
    scheduled: Object.freeze(['en_route']),
    en_route:  Object.freeze(['on_site']),
    on_site:   Object.freeze(['paused', 'completed']),
    paused:    Object.freeze(['on_site']),
});

const words = (s) => String(s || 'unscheduled').replace(/_/g, ' ');

// null when the move is one a technician may make from where the job stands (a status kept is no move); otherwise the
// refusal, in words the card shows.
export function techMoveRefusal(from, to) {
    const f = from || 'unscheduled';
    if (to === f) return null;
    if ((TECH_MOVES[f] || []).includes(to)) return null;
    return `This job is ${words(f)} — it cannot be marked ${words(to)} from the field. Nothing was saved.`;
}
