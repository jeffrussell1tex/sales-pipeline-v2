import { useState, useRef } from 'react';
import { safeStorage, dbFetch, waitForToken } from '../utils/storage';
import { DEFAULT_SETTINGS } from '../utils/settingsDefaults.js';

// The app's copy of the active org's settings. This hook LOADS them and never
// writes them (state §0.170): each settings screen saves the keys it owns by its
// own PUT, and updates this copy once that save has landed.
//
// Until §0.170 an autosave here PUT the whole settings object whenever any of it
// changed — every key, as it was at sign-in. It put back whatever had been saved
// since by a screen that keeps its own copy (Connected Apps, field visibility)
// or by the server (integration requests, the nightly lead-scoring model);
// every screen's save went out twice, as two audit rows reading "Updated:" and
// the first 20 keys of everything; a filter click PUT the lot; and a Manager's
// refused autosave said "Settings not saved" for a change that was never one.
//
// The defaults are src/utils/settingsDefaults.js — the server's too: a key a
// workspace has never saved reads as its default, and a save writes it, so the
// autosave's one useful act, writing a new workspace's defaults, is the server's.

export function useSettings() {
    // WHICH ORG's settings are in state (state §0.162). Every load is for one
    // org — the org App passes, the org its token speaks for — and takes the
    // next number; an answer that comes back for an older number is dropped, so
    // a slow answer for the org the user just left never lands in the new one.
    // The org is recorded only when its load SUCCEEDS; until then the Settings
    // view does not open (SettingsTab compares it with the active org), and the
    // Sales Manager's incentive saves refuse. This hook used to start from an
    // UNSCOPED localStorage copy, mark itself ready whether the load succeeded or
    // not, and PUT the next change an Admin made — the defaults, or an earlier
    // build's cached copy, possibly another org's — over the org's real
    // pipelines, stages and KPIs.
    const loadGenRef     = useRef(0);
    const loadOrgRef     = useRef(null);   // the org the latest load is for
    const settingsOrgRef = useRef(null);   // the org whose settings are in state
    const [settingsOrgId, setSettingsOrgId] = useState(null);
    // Non-empty when the active org's settings did not load.
    const [loadError, setLoadError] = useState('');

    const [settings, setSettings] = useState(DEFAULT_SETTINGS);

    // Load the org's settings and roster from the DB. App calls this for the
    // active org each time its main load runs — at sign-in, and on every switch.
    const loadSettings = (clerkUser, clearFirst = false, orgId = null) => {
        if (!clerkUser || !orgId) return;

        // Each load is for ONE org and takes the next number; only the latest
        // load's answers are applied.
        const gen = ++loadGenRef.current;
        const prevOrgId = loadOrgRef.current;
        loadOrgRef.current = orgId;
        const switched = clearFirst || (prevOrgId && prevOrgId !== orgId);

        // Reset state when switching orgs to prevent bleed-through — no org's
        // settings are in state until this load succeeds.
        if (switched) {
            settingsOrgRef.current = null;
            setSettingsOrgId(null);
            setLoadError('');
            setSettings(DEFAULT_SETTINGS);
        }
        // Purge what nothing reads any more — the users cache (users are
        // authoritative from DB only) and the settings copies earlier builds
        // kept (unscoped, or keyed by the FIRST membership, kept after
        // sign-out) — and on an org switch every sales/accel key: a switch
        // starts completely clean.
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && (k === 'salesUsers' || k.startsWith('salesSettings')
                    || (switched && (k.startsWith('salesUsers') || k.startsWith('accel'))))) {
                    keysToRemove.push(k);
                }
            }
            keysToRemove.forEach(k => safeStorage.removeItem(k));
        } catch(e) {}

        // On org switch, delay users fetch 500ms to ensure Clerk JWT has rotated.
        const usersDelay = switched ? 500 : 0;

        dbFetch('/.netlify/functions/settings')
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => {
                if (gen !== loadGenRef.current) return;   // a newer load owns the state
                if (data.settings) {
                    const { users: _stripUsers, ...settingsFromDb } = data.settings;
                    setSettings(prev => ({
                        ...DEFAULT_SETTINGS,
                        ...settingsFromDb,
                        users: prev.users,
                        taskTypes: settingsFromDb.taskTypes?.length ? settingsFromDb.taskTypes : DEFAULT_SETTINGS.taskTypes,
                        funnelStages: settingsFromDb.funnelStages?.length ? settingsFromDb.funnelStages : DEFAULT_SETTINGS.funnelStages,
                    }));
                } else {
                    setSettings(prev => ({ ...DEFAULT_SETTINGS, users: prev.users }));
                }
                // This org's settings are in state: the Settings view may use
                // them from here.
                settingsOrgRef.current = orgId;
                setSettingsOrgId(orgId);
                setLoadError('');
            })
            .catch(err => {
                console.error('Failed to load settings:', err);
                if (gen !== loadGenRef.current) return;
                // A reload of the org already in state keeps that copy: it is
                // this org's. A first load or a switch that failed has nothing
                // in state — Settings stays closed, and says why.
                if (settingsOrgRef.current !== orgId) setLoadError(err?.message || 'the request failed');
            });

        waitForToken()
            .then(() => new Promise(resolve => setTimeout(resolve, usersDelay)))
            .then(() =>
                dbFetch('/.netlify/functions/users')
                    .then(r => {
                        // Reps now receive a DIRECTORY read (id/name/active only)
                        // rather than a 403, so the user pickers have names to
                        // offer. A genuine failure still leaves the array alone
                        // rather than blanking a roster already loaded.
                        if (!r.ok) return null;
                        return r.json();
                    })
                    .then(data => {
                        if (gen !== loadGenRef.current) return;   // the roster of an org the user left
                        if (data && data.users) {
                            setSettings(prev => ({ ...prev, users: data.users }));
                        }
                    })
                    .catch(() => {})
            );
    };

    return {
        settings,
        setSettings,
        settingsOrgId,
        settingsLoadError: loadError,
        loadSettings,
    };
}
