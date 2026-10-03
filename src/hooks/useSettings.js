import { useState, useRef, useEffect } from 'react';
import { safeStorage, dbFetch, dbWrite, waitForToken } from '../utils/storage';

// ── BYOK key hygiene ──────────────────────────────────────────────────
// The server no longer returns the org's Anthropic key, but browsers that ran
// an earlier build still have the plaintext sitting in localStorage — and this
// hook mirrors settings straight back out on every change, which would re-post
// it. Strip key material from anything we write to the DB. (Since §0.162 the
// hook neither reads nor writes that localStorage copy; every load deletes it.)
// The server scrubs the same fields; this is defence in depth on the client.
const KEY_SHAPED = /^sk-[A-Za-z0-9_-]{16,}$/;
const isKeyString = (v) => typeof v === 'string' && KEY_SHAPED.test(v.trim());

const stripKeyMaterial = (obj) => {
    if (!obj || typeof obj !== 'object') return { value: obj, found: false };
    let found = false;
    const out = { ...obj };
    if ('anthropicApiKey' in out) { delete out.anthropicApiKey; found = true; }
    if (out.aiSettings && typeof out.aiSettings === 'object') {
        const ai = { ...out.aiSettings };
        for (const f of ['byokKey', 'apiKey', 'anthropicApiKey']) {
            if (f in ai) { delete ai[f]; found = true; }
        }
        if (isKeyString(ai.byokProvider)) { ai.byokProvider = 'Anthropic'; found = true; }
        out.aiSettings = ai;
    }
    return { value: out, found };
};

const DEFAULT_SETTINGS = {
    fiscalYearStart: 1,
    products: [],
    users: [],
    teams: [],
    territories: [],
    verticals: [],
    logoUrl: '',
    taskTypes: ['Call', 'Meeting', 'Email'],
    quotaData: {
        type: 'annual',
        annualQuota: 0,
        q1Quota: 0, q2Quota: 0, q3Quota: 0, q4Quota: 0,
        commissionTiers: [
            { id: '1', minPercent: 0,   maxPercent: 50,  rate: 5,  label: '0-50%'   },
            { id: '2', minPercent: 50,  maxPercent: 100, rate: 8,  label: '50-100%' },
            { id: '3', minPercent: 100, maxPercent: 120, rate: 10, label: '100-120%'},
            { id: '4', minPercent: 120, maxPercent: 999, rate: 15, label: '120%+'   },
        ]
    },
    pipelines: [
        { id: 'default', name: 'New Business', color: '#2563eb' }
    ],
    painPoints: ['High Turnover','Scheduling Complexity','Compliance Issues','Manual Processes','Poor Visibility','Budget Constraints','Integration Challenges'],
    verticalMarkets: ['Manufacturing','Healthcare','Energy & Utilities','Oil & Gas','Transportation','Government','Retail','Hospitality','Construction','Mining'],
    funnelStages: [
        { name: 'Qualification',        weight: 10  },
        { name: 'Discovery',            weight: 20  },
        { name: 'Evaluation (Demo)',     weight: 40  },
        { name: 'Proposal',             weight: 60  },
        { name: 'Negotiation/Review',   weight: 75  },
        { name: 'Contracts',            weight: 90  },
        { name: 'Closed Won',           weight: 100 },
        { name: 'Closed Lost',          weight: 0   },
    ],
    fieldVisibility: {
        arr:           { Admin: true, Manager: true, User: true, ReadOnly: true },
        implCost:      { Admin: true, Manager: true, User: true, ReadOnly: true },
        probability:   { Admin: true, Manager: true, User: true, ReadOnly: true },
        weightedValue: { Admin: true, Manager: true, User: true, ReadOnly: true },
        dealAge:       { Admin: true, Manager: true, User: true, ReadOnly: true },
        timeInStage:   { Admin: true, Manager: true, User: true, ReadOnly: true },
        activities:    { Admin: true, Manager: true, User: true, ReadOnly: true },
        notes:         { Admin: true, Manager: true, User: true, ReadOnly: true },
        nextSteps:     { Admin: true, Manager: true, User: true, ReadOnly: true },
        closeDate:     { Admin: true, Manager: true, User: true, ReadOnly: true },
    },
    kpiConfig: [
        { id: 'totalPipelineARR', name: 'Total Pipeline ARR',      color: 'primary', tolerances: [{ label: 'On Track', min: 100000, color: '#16a34a' },{ label: 'Warning',  min: 50000, color: '#f59e0b' },{ label: 'Critical', min: 0, color: '#ef4444' }] },
        { id: 'activeOpps',       name: 'Active Opportunities',    color: 'success', tolerances: [{ label: 'Good',     min: 10,     color: '#16a34a' },{ label: 'Low',      min: 5,     color: '#f59e0b' },{ label: 'Critical', min: 0, color: '#ef4444' }] },
        { id: 'avgARR',           name: 'Avg ARR',                 color: 'warning', tolerances: [{ label: 'Strong',   min: 50000,  color: '#16a34a' },{ label: 'Average',  min: 20000, color: '#f59e0b' },{ label: 'Low',      min: 0, color: '#ef4444' }] },
        { id: 'nextQForecast',    name: 'Next Quarter Forecast',   color: 'info',    tolerances: [{ label: 'On Track', min: 100000, color: '#16a34a' },{ label: 'Behind',   min: 50000, color: '#f59e0b' },{ label: 'At Risk',  min: 0, color: '#ef4444' }] },
        { id: 'openTasks',        name: 'Open Tasks',              color: 'primary', tolerances: [] },
        { id: 'quota',            name: 'Annual Quota',            color: 'info',    tolerances: [] },
        { id: 'closedWon',        name: 'Closed Won',              color: 'success', tolerances: [] },
        { id: 'attainment',       name: 'Attainment',              color: 'warning', tolerances: [{ label: 'Exceeding', min: 100, color: '#16a34a' },{ label: 'On Track', min: 70, color: '#f59e0b' },{ label: 'Behind', min: 0, color: '#ef4444' }] },
    ],
    aiScoringEnabled: false,
    aiReportPromptsEnabled: false,   // §0.141 — Claude reads report prompts only when an Admin turns it on
    leadsEnabled: true,
    dispatchEnabled: false,
    repsCanUseDispatch: false,     // §0.152 — sales reps use Dispatch only when an Admin turns this on
    dispatchSkills: [],
    dispatchCerts: [],
    dispatchLicenses: ['Apprentice','Journeyman','Master','Lead'],
    dispatchTrades: [],
    dispatchJobTypes: [],
    dispatchBlockTypes: [{ id:'bt_pto', name:'PTO', color:'#4d6b3d' }, { id:'bt_sick', name:'Sick', color:'#9c3a2e' }, { id:'bt_holiday', name:'Holiday', color:'#3a5a7a' }, { id:'bt_training', name:'Training', color:'#b87333' }, { id:'bt_jury', name:'Jury duty', color:'#7a6a48' }, { id:'bt_bereavement', name:'Bereavement', color:'#5a544c' }, { id:'bt_other', name:'Other', color:'#8a8378' }],
    dispatchVehicles: [],
    dispatchJobs: [],
    dispatchCrews: [],
    dispatchJobTemplates: [],
    customerTypes: [],
    companyProfile: { address: '', phone: '', notes: '' },
    priceBookConfig: {
        units:      ['flat', 'month', 'year', 'user', 'hour', 'day'],
        types:      ['recurring', 'one_time', 'service'],
        categories: ['Platform', 'Add-ons', 'Services', 'Hardware'],
    },
};

// The exact bytes the autosave would PUT for a given settings state. One
// serializer used by BOTH the autosave and the load-time baseline below, so
// they can never disagree about what "unchanged" means.
const serializeForSave = (settings) => {
    const { users: _stripUsers, fiscalYearStart: _stripFiscal, ...rest } = settings;
    const { value } = stripKeyMaterial(rest);
    return JSON.stringify(value);
};

export function useSettings(activeOrgId = null) {
    const settingsReady = useRef(false);
    // Serialized form of the last state KNOWN to the server — set on load and
    // after each accepted PUT. The autosave diffs against this and skips
    // no-change writes. Without it the effect fired on every settings OBJECT
    // identity change (the load's own mirror-back, users/roster refreshes,
    // role saves), which PUT unchanged payloads on every cycle: ~3 junk
    // `settings.updated` audit rows per load for admins, and a naked 403
    // toast for every non-writer who changed nothing (§0.53's useSettings
    // debt, closed here).
    const lastSavedRef = useRef(null);

    // WHICH ORG's settings are in state (state §0.162). Every load is for one
    // org — the org App passes, the org its token speaks for — and takes the
    // next number; an answer that comes back for an older number is dropped, so
    // a slow answer for the org the user just left never lands in the new one.
    // The org is recorded only when its load SUCCEEDS; until then nothing
    // autosaves and the Settings view does not open (SettingsTab compares it
    // with the active org). This hook used to start from an UNSCOPED
    // localStorage copy, mark itself ready whether the load succeeded or not,
    // and PUT the next change an Admin made — the defaults, or an earlier
    // build's cached copy, possibly another org's — over the org's real
    // pipelines, stages and KPIs.
    const loadGenRef     = useRef(0);
    const loadOrgRef     = useRef(null);   // the org the latest load is for
    const settingsOrgRef = useRef(null);   // the org whose settings are in state
    const [settingsOrgId, setSettingsOrgId] = useState(null);
    // Non-empty when the active org's settings did not load.
    const [loadError, setLoadError] = useState('');

    // Non-empty when the last autosave was rejected.
    const [saveError, setSaveError] = useState('');

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

        // Reset state when switching orgs to prevent bleed-through — nothing is
        // ready, and no org's settings are in state, until this load succeeds.
        if (switched) {
            settingsReady.current = false;
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
                    setSettings(prev => {
                        const next = {
                            ...DEFAULT_SETTINGS,
                            ...settingsFromDb,
                            users: prev.users,
                            taskTypes: settingsFromDb.taskTypes?.length ? settingsFromDb.taskTypes : DEFAULT_SETTINGS.taskTypes,
                            funnelStages: settingsFromDb.funnelStages?.length ? settingsFromDb.funnelStages : DEFAULT_SETTINGS.funnelStages,
                        };
                        // What just arrived IS the server's state — adopt it as
                        // the autosave baseline so the mirror-back never PUTs.
                        lastSavedRef.current = serializeForSave(next);
                        return next;
                    });
                } else {
                    setSettings(prev => {
                        const next = { ...DEFAULT_SETTINGS, users: prev.users };
                        lastSavedRef.current = serializeForSave(next);
                        return next;
                    });
                }
                // This org's settings are in state: the autosave and the
                // Settings view may use them from here.
                settingsOrgRef.current = orgId;
                setSettingsOrgId(orgId);
                setLoadError('');
                setTimeout(() => { if (gen === loadGenRef.current) settingsReady.current = true; }, 0);
            })
            .catch(err => {
                console.error('Failed to load settings:', err);
                if (gen !== loadGenRef.current) return;
                // A reload of the org already in state keeps that copy: it is
                // this org's. A first load or a switch that failed has nothing
                // to save — the autosave stays off, and Settings says why.
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

    // Save settings to DB whenever they change (after initial load).
    // Users are managed separately via the /users endpoint — never written here.
    // fiscalYearStart is intentionally excluded: it is a top-level DB column saved
    // only via handleUpdateFiscalYearStart (explicit user action in Settings).
    // Including it here causes DEFAULT_SETTINGS value (1) to race against and
    // overwrite the real DB value on every settings load cycle.
    // activeOrgId is read, not a dependency: the effect runs when the settings
    // change, and each run sees that render's active org.
    useEffect(() => {
        if (!settingsReady.current) return;
        // Only the org whose settings are in state, and only while it is the
        // active org — the PUT goes out with the ACTIVE org's token (§0.162).
        const org = settingsOrgRef.current;
        if (!org || org !== activeOrgId) return;
        const { users: _stripUsers, fiscalYearStart: _stripFiscal, ...rest } = settings;
        // Never echo key material back to the server. The key is written only
        // by the AI settings panel, via an explicit PUT.
        const { value: settingsToSave } = stripKeyMaterial(rest);
        // No-change guard: users/roster refreshes and the load's own
        // mirror-back produce new OBJECTS with identical payloads — skip them.
        // Only a payload that differs from the server's last-known state PUTs.
        const json = JSON.stringify(settingsToSave);
        if (json === lastSavedRef.current) return;
        // DB only. This used to write localStorage BEFORE the PUT and then
        // discard the Response — dbFetch resolves for ANY status (guide 18b1), so
        // a non-admin's 403 on this Admin-only endpoint left the change cached
        // locally forever: the UI showed it, a reload re-read it from cache, and
        // nothing ever reached the database. The cache itself is gone (§0.162):
        // it was keyed by the FIRST membership, not the active org, and nothing
        // read it but the unscoped bootstrap.
        (async () => {
            const r = await dbWrite('/.netlify/functions/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsToSave),
            });
            if (!r.ok) {
                setSaveError(r.error);
                return;                       // the baseline stays: the server does not hold this
            }
            setSaveError('');
            // The server now holds this state — this org's baseline, unless the
            // user switched orgs while the PUT was out (that org's load has set
            // its own).
            if (settingsOrgRef.current === org) lastSavedRef.current = json;
        })();
    }, [settings]);

    const handleUpdateFiscalYearStart = (month) => {
        setSettings(prev => ({ ...prev, fiscalYearStart: parseInt(month) }));
    };

    const handleAddTaskType = (newType) => {
        if (newType && !(settings.taskTypes || []).includes(newType)) {
            setSettings(prev => ({ ...prev, taskTypes: [...(prev.taskTypes || []), newType] }));
        }
    };

    return {
        settings,
        setSettings,
        settingsReady,
        settingsOrgId,
        settingsLoadError: loadError,
        settingsSaveError: saveError,
        loadSettings,
        handleUpdateFiscalYearStart,
        handleAddTaskType,
    };
}
