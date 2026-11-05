// src/hooks/useLocalLayer.js
import { useLayoutEffect, useRef, useCallback } from 'react';
import { useApp } from '../AppContext';
import { closeDecision, DISCARD_MESSAGE, DISCARD_LABELS } from '../utils/tabLayers';

let nextLayerId = 0;

// A layer drawn inside a tab — or a popover portaled out of one — in the one Escape order
// (state §0.230; docs/design/escape-tabs/DESIGN.md §3). While `open` it stands on App's stack
// under its place ('tabLayer' drawn in a tab; 'tabPopover' portaled at 12000), and takes an
// Escape before anything under it: on document, in the capture phase — before every rail's
// listener, every React onKeyDown and App's — while it is the top of its place and nothing
// above the place is open, worked out at key time (App's localLayerBlocked). It marks the
// Escape it takes, so nothing under it acts on the same keypress.
//
// The Escape, and the ×, Cancel and backdrop that call the close this returns, do one thing
// (Jeff, 4 Nov: "All four ask"): nothing while `busy` (a save is out); while `dirty` (typed
// work) App's confirm asks "Discard changes?" — Discard / Keep editing — and the layer stays
// until Discard, which runs the layer's close as it stands then, never while a save is out;
// else the layer's own close. A search box or a filter draft is not typed work.
//
// Registered in a layout effect — before the browser paints and before any key can arrive —
// and only when `open` changes: a layer that stays open keeps its place (its id is per mount).
// App re-renders only when a place goes empty or not empty. Never call it in a component
// defined inside another component: remounted every render, it would register again each
// time (tests/tab-layers.test.mjs refuses it).
export function useLocalLayer(open, { onClose, dirty = false, busy = false, place = 'tabLayer' } = {}) {
    // Only the four it needs, by name (never the context whole): outside the app's provider —
    // a test's render — there is none, and the layer is a plain one.
    const ctx = useApp();
    const appRef = useRef(null);
    appRef.current = ctx ? { registerLayer: ctx.registerLayer, unregisterLayer: ctx.unregisterLayer, localLayerBlocked: ctx.localLayerBlocked, showConfirm: ctx.showConfirm } : null;
    const live = useRef({ onClose, dirty, busy });
    live.current = { onClose, dirty, busy };
    const idRef = useRef(null);
    if (idRef.current === null) { nextLayerId += 1; idRef.current = `layer_${nextLayerId}`; }

    const requestClose = useCallback(() => {
        const { busy: b, dirty: d, onClose: close } = live.current;
        const decided = closeDecision({ busy: b, dirty: d });
        if (decided === 'none') return;
        if (decided === 'ask') {
            const a = appRef.current;
            // The confirm takes no focus: a key typed in the form under it would still reach
            // the form — Enter could submit — so the form lets go of it first.
            if (typeof document !== 'undefined' && document.activeElement && document.activeElement.blur) document.activeElement.blur();
            if (a && a.showConfirm) {
                a.showConfirm(DISCARD_MESSAGE, () => {
                    const now = live.current;
                    if (!now.busy && now.onClose) now.onClose();
                }, true, DISCARD_LABELS);
                return;
            }
        }
        if (close) close();
    }, []);

    useLayoutEffect(() => {
        const a = appRef.current;
        if (!open || !a || !a.registerLayer) return undefined;
        const id = idRef.current;
        a.registerLayer(id, place);
        const onKey = (e) => {
            if (e.key !== 'Escape' || e.defaultPrevented) return;
            const now = appRef.current;
            if (now && now.localLayerBlocked && now.localLayerBlocked(id, place)) return;
            e.preventDefault();
            requestClose();
        };
        document.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('keydown', onKey, true);
            const later = appRef.current;
            if (later && later.unregisterLayer) later.unregisterLayer(id);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return requestClose;
}
