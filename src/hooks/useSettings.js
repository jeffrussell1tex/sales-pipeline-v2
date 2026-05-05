import { useState, useRef, useEffect } from 'react';
import { safeStorage, dbFetch, waitForToken } from '../utils/storage';

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
    customerTypes: [],
    companyProfile: { address: '', phone: '', notes: '' },
    priceBookConfig: {
        units:      ['flat', 'month', 'year', 'user', 'hour', 'day'],
        types:      ['recurring', 'one_time', 'service'],
        categories: ['Platform', 'Add-ons', 'Services', 'Hardware'],
    },
};

export function useSettings() {
    const settingsReady = useRef(false);
    const orgIdRef = useRef(null); // track current org for cache key scoping

    const getStorageKey = () => orgIdRef.current
        ? `salesSettings_${orgIdRef.current}`
        : 'salesSettings'; // fallback for initial paint before org known

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
                    return { ...DEFAULT_SETTINGS, ...parsed, users: [] };
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
            })
            .catch(err => { console.error('Failed to load settings:', err); });

        const usersPromise = waitForToken()
            .then(() => new Promise(resolve => setTimeout(resolve, usersDelay)))
            .then(() =>
                dbFetch('/.netlify/functions/users')
                    .then(r => {
                        if (!r.ok) return null; // 403 for reps — don't touch users array
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
    useEffect(() => {
        if (!settingsReady.current) return;
        const { users: _stripUsers, ...settingsToSave } = settings;
        try {
            // Scope by orgId so switching orgs never reads another org's cached settings
            safeStorage.setItem(getStorageKey(), JSON.stringify(settingsToSave));
        } catch(e) {}
        dbFetch('/.netlify/functions/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsToSave)
        }).catch(err => console.error('Failed to save settings:', err));
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
        loadSettings,
        handleUpdateFiscalYearStart,
        handleAddTaskType,
    };
}
