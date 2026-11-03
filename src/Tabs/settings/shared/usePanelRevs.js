// settings/shared/usePanelRevs.js — a settings panel's revision tokens (state §0.226 — batch 4b-3, step B-3).
//
// A panel's save names the token it loaded for every key it sends (ifRevs); the server refuses one whose token has
// moved since — another tab or another Admin saved that key first. The tokens a panel names are those of the render
// that seeded its draft: `opened`, taken once as the panel opens, never read at send time from the app's copy (which
// a load could move under an open draft — a false refusal at worst, never a lost update). A save that lands merges
// the tokens it answered into the copy and into `opened` (landed), so the panel's next save names them; a panel that
// re-seeds its draft from an effect re-takes them there (reopen). A stale refusal goes to AdminView's one handler
// (panelStale — J-B5): it takes the latest and draws the panel again on it. A second save while one is out shares
// the first one's outcome (once — JB3-10): the guard's "Save changes and continue" pressed while the panel's own
// Save is out would otherwise be refused by it.
//
// Module scope, React hooks only.
import React from 'react';
import { revsAfter } from '../../../utils/settingsRevs.js';
// AdminView provides { took, landed } around the open panel (J-B5); null elsewhere.
export const PanelStaleContext = React.createContext(null);
export function usePanelRevs(settings, setSettings) {
    // The tokens as this panel opened — its draft was seeded from the same render.
    const [opened, setOpened] = React.useState(() => ({ ...(settings?.revs || {}) }));
    const shell = React.useContext(PanelStaleContext);
    // Mounted? A refusal or a landing answered after Back/Discard must touch no other panel (critic A2).
    const alive = React.useRef(true);
    React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    const flight = React.useRef(null);
    const landed = (answer) => {
        setSettings((prev) => ({ ...prev, revs: revsAfter(prev?.revs, answer?.revs) }));
        setOpened((held) => revsAfter(held, answer?.revs));
        if (shell && alive.current) shell.landed();
    };
    const reopen = (revs = settings?.revs) => setOpened({ ...(revs || {}) });
    const panelStale = async (e, words) => (shell ? shell.took(e, words, () => alive.current) : false);
    // A second save while one is out shares its outcome (SalesManagerTab.jsx:1040-1052 precedent; JB3-10).
    const once = (fn) => (...args) => {
        if (flight.current) return flight.current;
        const p = fn(...args); flight.current = p;
        const clear = () => { if (flight.current === p) flight.current = null; };
        p.then(clear, clear);
        return p;
    };
    return { opened, landed, reopen, panelStale, once };
}
