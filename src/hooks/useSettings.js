import { useState, useRef, useEffect } from 'react';
import { safeStorage, dbFetch, dbWrite, waitForToken } from '../utils/storage';

// ── BYOK key hygiene ──────────────────────────────────────────────────
// The server no longer returns the org's Anthropic key, but browsers that ran
// an earlier build still have the plaintext sitting in localStorage — and this
// hook mirrors settings straight back out on every change, which would re-post
// it. Strip key material from anything we read from or write to storage/DB.
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
    leadsEnabled: true,
    dispatchEnabled: false,
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

export function useSettings() {
    const settingsReady = useRef(false);
    const orgIdRef = useRef(null); // track current org for cache key scoping
    // Serialized form of the last state KNOWN to the server — set on load and
    // after each accepted PUT. The autosave diffs against this and skips
    // no-change writes. Without it the effect fired on every settings OBJECT
    // identity change (the load's own mirror-back, users/roster refreshes,
    // role saves), which PUT unchanged payloads on every cycle: ~3 junk
    // `settings.updated` audit rows per load for admins, and a naked 403
    // toast for every non-writer who changed nothing (§0.53's useSettings
    // debt, closed here).
    const lastSavedRef = useRef(null);

    const getStorageKey = () => orgIdRef.current
        ? `salesSettings_${orgIdRef.current}`
        : 'salesSettings'; // fallback for initial paint before org known

    // Non-empty when the last autosave was rejected.
    const [saveError, setSaveError] = useState('');

    const [settings, setSettings] = useState(() => {
        // Bootstrap non-user settings from localStorage for instant paint,
        // but NEVER seed users from localStorage — always authoritative from DB.
        // We can't scope by orgId here (not known yet) so we read the unscoped key
        // as a best-effort bootstrap — it will be overwritten by DB data momentarily.
        try {
            const saved = safeStorage.getItem('salesSettings');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    const { value: clean, found } = stripKeyMaterial(parsed);
                    // If this cache predates the fix it still holds the plaintext
                    // key — rewrite it immediately rather than waiting for the next
                    // settings change to overwrite it.
                    if (found) { try { safeStorage.setItem('salesSettings', JSON.stringify(clean)); } catch(e) {} }
                    return { ...DEFAULT_SETTINGS, ...clean, users: [] };
                } catch(e) {}
            }
        } catch(e) {}
        return DEFAULT_SETTINGS;
    });

    // Load settings from DB on mount
    const loadSettings = (clerkUser, clearFirst = false) => {
        if (!clerkUser) return;

        // Extract orgId from clerkUser's active org — used to scope the localStorage key
        const orgId = clerkUser.organizationMemberships?.[0]?.organization?.id || null;
        const prevOrgId = orgIdRef.current;
        orgIdRef.current = orgId;

        // Reset state when switching orgs to prevent bleed-through
        if (clearFirst || (prevOrgId && prevOrgId !== orgId)) {
            settingsReady.current = false;
            setSettings(DEFAULT_SETTINGS);
            // Purge ALL sales/accel keys — org switch must start completely clean
            try {
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && (k.startsWith('salesSettings') || k.startsWith('salesUsers') || k.startsWith('accel'))) {
                        keysToRemove.push(k);
                    }
                }
                keysToRemove.forEach(k => safeStorage.removeItem(k));
            } catch(e) {}
        }
        // Always purge the stale users cache — users are authoritative from DB only
        try { safeStorage.removeItem('salesUsers'); } catch(e) {}

        // Load settings and users in parallel, only mark ready when both complete.
        // On org switch, delay users fetch 500ms to ensure Clerk JWT has rotated.
        const usersDelay = (clearFirst || (prevOrgId && prevOrgId !== orgId)) ? 500 : 0;

        const settingsPromise = dbFetch('/.netlify/functions/settings')
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => {
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
            })
            .catch(err => { console.error('Failed to load settings:', err); });

        const usersPromise = waitForToken()
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
                        if (data && data.users) {
                            setSettings(prev => ({ ...prev, users: data.users }));
                        }
                    })
                    .catch(() => {})
            );

        // Mark ready only after both loads complete (or fail)
        Promise.allSettled([settingsPromise, usersPromise]).then(() => {
            setTimeout(() => { settingsReady.current = true; }, 0);
        });
    };

    // Save settings to DB whenever they change (after initial load).
    // Users are managed separately via the /users endpoint — never written here.
    // fiscalYearStart is intentionally excluded: it is a top-level DB column saved
    // only via handleUpdateFiscalYearStart (explicit user action in Settings).
    // Including it here causes DEFAULT_SETTINGS value (1) to race against and
    // overwrite the real DB value on every settings load cycle.
    useEffect(() => {
        if (!settingsReady.current) return;
        const { users: _stripUsers, fiscalYearStart: _stripFiscal, ...rest } = settings;
        // Never mirror key material to disk or echo it back to the server. The
        // key is written only by the AI settings panel, via an explicit PUT.
        const { value: settingsToSave } = stripKeyMaterial(rest);
        // No-change guard: users/roster refreshes and the load's own
        // mirror-back produce new OBJECTS with identical payloads — skip them.
        // Only a payload that differs from the server's last-known state PUTs.
        const json = JSON.stringify(settingsToSave);
        if (json === lastSavedRef.current) return;
        // DB FIRST, cache second. This used to write localStorage BEFORE the PUT
        // and then discard the Response — dbFetch resolves for ANY status (guide
        // 18b1), so a non-admin's 403 on this Admin-only endpoint left the change
        // cached locally forever: the UI showed it, a reload re-read it from cache,
        // and nothing ever reached the database. A failure that masked itself
        // indefinitely on one machine while no one else saw the change.
        (async () => {
            const r = await dbWrite('/.netlify/functions/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settingsToSave),
            });
            if (!r.ok) {
                setSaveError(r.error);
                return;                       // do NOT cache what the server rejected
            }
            setSaveError('');
            lastSavedRef.current = json;      // the server now holds this state
            try {
                // Scope by orgId so switching orgs never reads another org's cached settings
                safeStorage.setItem(getStorageKey(), JSON.stringify(settingsToSave));
            } catch(e) {}
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
        settingsSaveError: saveError,
        loadSettings,
        handleUpdateFiscalYearStart,
        handleAddTaskType,
    };
}
