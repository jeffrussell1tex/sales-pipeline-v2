// src/utils/escapeLayer.js
//
// Who takes an Escape (state §0.180). A layer that opens above others — the document
// rail, the upload rail, the link picker, the document picker — takes an Escape before
// anything under it: its listener runs on document in the capture phase (useEscapeLayer),
// marks the Escape it takes (preventDefault), and every listener under it leaves a marked
// one alone — the rails, the panels and App all check e.defaultPrevented (guide §18b74).
// Before, an Escape over a document closed the record rail, the deal modal or the panel
// under it, and the document stayed open.
//
// takeEscape is that listener's decision, pure so a test can run it.
//   blocked — something above this layer is open (the app's confirm or prompt, another
//             document layer): the Escape is theirs, and it passes unmarked.
// Returns true when this layer took the Escape.
export function takeEscape(e, blocked, onEscape) {
    if (e.key !== 'Escape' || e.defaultPrevented || blocked) return false;
    e.preventDefault();
    onEscape();
    return true;
}
