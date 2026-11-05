// src/utils/tabLayers.js
//
// The layers drawn inside the tabs, and the popovers that portal out of them, in the one
// Escape order (state §0.230; docs/design/escape-tabs/DESIGN.md §3). App holds them in a
// stack, in the order they opened — a nested layer (a picker inside a dialog) always opens
// after the one it sits in — each entry under a place in ESCAPE_ORDER: 'tabLayer' (drawn in
// a tab, inside .app-container), 'tabPopover' (portaled to the page at 12000), or an app
// place a tab's layer stands in for. The last entry of a place is that place's top.
//
// Pure, so a test can run every decision: the stack's moves, which places are open, and
// what a layer's close does — nothing while a save is out, ask before dropping typed work,
// else close (Jeff, 4 Nov: "Ask "Discard?"", and "All four ask": Escape, ×, Cancel and the
// backdrop alike).

// The words App's confirm asks with before a layer drops typed work (Q1).
export const DISCARD_MESSAGE = 'Discard changes?';
export const DISCARD_LABELS = { confirm: 'Discard', cancel: 'Keep editing' };

// A layer opened: on top of the stack. Opened again under the same id (StrictMode runs an
// effect twice), it stays where it was.
export function pushLayer(stack, entry) {
    if (stack.some((e) => e.id === entry.id)) return stack;
    return [...stack, { id: entry.id, place: entry.place }];
}

// A layer closed or unmounted: out of the stack by its id, wherever it stood.
export function removeLayer(stack, id) {
    return stack.some((e) => e.id === id) ? stack.filter((e) => e.id !== id) : stack;
}

// Whether this layer is the top of its own place — the last of that place to open. One
// stack holds several places; a layer of another place never holds it (the order does).
export function onTopOfPlace(stack, id) {
    const at = stack.find((e) => e.id === id);
    if (!at) return false;
    const same = stack.filter((e) => e.place === at.place);
    return same[same.length - 1].id === id;
}

// Each place with a layer open, as App's openLayers reads it.
export function placesOpen(stack) {
    const out = {};
    for (const e of stack) out[e.place] = true;
    return out;
}

// Whether two readings of placesOpen say the same — App re-renders only when one changes.
export function samePlaces(a, b) {
    const ka = Object.keys(a || {}).filter((k) => a[k]);
    const kb = Object.keys(b || {}).filter((k) => b[k]);
    return ka.length === kb.length && ka.every((k) => !!b[k]);
}

// What a layer's close does (§3.4): 'none' while a save is out, 'ask' while it holds typed
// work, else 'close'.
export function closeDecision({ busy, dirty }) {
    if (busy) return 'none';
    if (dirty) return 'ask';
    return 'close';
}
