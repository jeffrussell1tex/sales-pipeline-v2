// src/utils/draggableOrder.js — which draggable window is drawn on top (state §0.252; guide §18b80 rule 5).
//
// The draggable windows (the deal and user windows, the two imports, the lost reason) share one place in the Escape
// order: among themselves the one on top is the one drawn on top — each starts at one z and rises when its header is
// pressed (useDraggable), so the order is the order clicked; at one z, the one later in the page. Until §0.252 App's
// Escape closed the deal window first whenever it was open: with "+ New Rep" open over a deal, one Escape closed the
// DEAL window and its typed form, and left the user window on top open.
//
// Pure, so a test can run it: each window as { el, z }, and whether one element follows another in the page.

// The window drawn on top of those open, or null when none is.
export function topWindow(windows, follows) {
    let top = null;
    for (const w of windows || []) {
        if (!w || !w.el) continue;
        if (!top) { top = w; continue; }
        if (w.z > top.z || (w.z === top.z && follows(w.el, top.el))) top = w;
    }
    return top ? top.el : null;
}
