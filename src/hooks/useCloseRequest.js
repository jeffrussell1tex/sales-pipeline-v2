// src/hooks/useCloseRequest.js
import { useRef, useCallback } from 'react';
import { useApp } from '../AppContext';
import { closeDecision, DISCARD_MESSAGE, DISCARD_LABELS } from '../utils/tabLayers';

// One close for an app window's ×, Cancel, backdrop and Escape (state §0.252; OPEN_ITEMS §4.1; Jeff, 16 Nov: "Deal +
// lead"), as a tab's layer has had since §0.230 (useLocalLayer): nothing while `busy` — a save is out (guide §18b80
// rule 4); while `dirty` — typed work, measured against what the window opened with — App's confirm asks "Discard
// changes?" (Discard / Keep editing), and the window stays until Discard, which closes it as it stands then, never
// while a save is out; else the window's own close. The deal window closed over typed work at once, and on Escape even
// while its save was out; the lead window asked "Discard this lead?" on Escape and its backdrop only, its × and Cancel
// closing at once.
//
// `dirty` and `busy` may each be a function, read when the close is asked for — the deal window's busy is its own
// save's, a team note's being posted and its History tab's activity being logged. The returned close is stable: a listener made in an
// earlier render reads the window as it stands. It takes what to do once the window has closed (`after` — the deal
// window's move to its quotes), run only if it closes; anything else it is handed (a click's event) is ignored.
const busyOf = (w) => (typeof w.busy === 'function' ? !!w.busy() : !!w.busy);

export function useCloseRequest({ onClose, dirty = false, busy = false }) {
    const ctx = useApp();
    const live = useRef(null);
    live.current = { onClose, dirty, busy, showConfirm: ctx ? ctx.showConfirm : null };
    return useCallback((after) => {
        const next = typeof after === 'function' ? after : null;
        const now = live.current;
        const typed = typeof now.dirty === 'function' ? !!now.dirty() : !!now.dirty;
        const decided = closeDecision({ busy: busyOf(now), dirty: typed });
        if (decided === 'none') return;
        if (decided === 'ask' && now.showConfirm) {
            // The confirm takes no focus: a key typed in the form under it would still reach the form — Enter could
            // submit — so the form lets go of it first (as useLocalLayer's).
            if (typeof document !== 'undefined' && document.activeElement && document.activeElement.blur) document.activeElement.blur();
            now.showConfirm(DISCARD_MESSAGE, () => {
                const then = live.current;
                if (busyOf(then) || !then.onClose) return;
                then.onClose();
                if (next) next();
            }, true, DISCARD_LABELS);
            return;
        }
        if (!now.onClose) return;
        now.onClose();
        if (next) next();
    }, []);
}
