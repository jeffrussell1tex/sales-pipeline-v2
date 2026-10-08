// src/utils/escapeOrder.js
//
// The app's layers, top first — the order an Escape closes them in (state §0.186). Twelve
// layers had no Escape at all: the meeting prep panel, the three import windows, the two
// merge reviews, the SPIFF claim, the blocked-delete notice, both task reminders, the
// quick log with its follow-up, and the leave guard. Each now takes its own Escape
// (useEscapeLayer: document, capture phase — before every rail's listener and App's) and
// passes it on while a layer above it is open, so one Escape closes the layer on top and
// only that one (guide §18b74).
//
// The order is the z-index each layer draws, highest first; at one z, the one later in
// the page sits on top. The draggable windows (the deal and user modals, the imports, the
// lost reason) share one place: each is raised when clicked (useDraggable), so their order
// among themselves is the order they were clicked, and a z here is where they start.
// A layer drawn inside .app-container — the header's panels — draws in that container's
// stacking context, z-index 1: under every layer drawn outside it, whatever its own z
// (state §0.187 — the meeting prep panel, drawn there, opened under the rails). Those
// layers come last, the notes popover at 998 above the search results at 1199.
// tests/escape-order.test.mjs keeps every app layer in this list, the list in z order,
// and each z true to the file that draws it.
export const ESCAPE_ORDER = [
    ['coachingNote', 100100],    // .modal-overlay, later in ModalLayer than the three below
    ['blockedDelete', 100100],
    ['prompt', 100100],
    ['confirm', 100100],
    ['followUp', 100050],        // the quick log's "add a follow-up?"
    ['leaveGuard', 99999],
    ['linkPicker', 11105],
    ['uploadRail', 11103],
    ['documentRail', 11101],
    ['meetingPrep', 11021],      // over the rail or the deal window its Prep was pressed in (§0.187)
    ['activityDetail', 11010],
    ['taskRail', 11003],
    ['activityRail', 11001],
    ['accountRail', 10999],      // later in ModalLayer than the contact rail
    ['contactRail', 10999],
    ['spiffClaim', 10100],
    ['duePopup', 10001],
    ['reminderPopup', 10000],    // later in ModalLayer than every draggable window
    ['draggable', 10000],
    ['shortcuts', 9998],
    ['quickLog', 9990],
    ['leadModal', 9000],
    ['merge', 4000],
    ['notes', 998],
    // inside .app-container, its z-index 1 — under every layer above (§0.187)
    ['search', 1199],
    ['profile', 1099],
    ['notifications', 1000],
];

// Whether a layer above `name` is open — the Escape is that layer's, and passes on.
// `open` maps each name above to whether it is open (App's openLayers).
export function layersAbove(name, open) {
    const i = ESCAPE_ORDER.findIndex(([n]) => n === name);
    if (i < 0) throw new Error(`layersAbove: no layer named ${name} in ESCAPE_ORDER`);
    return ESCAPE_ORDER.slice(0, i).some(([n]) => !!open[n]);
}
