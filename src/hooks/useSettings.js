import { useState, useRef, useEffect } from 'react';
import { safeStorage, dbFetch } from '../utils/storage';

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
};

export function useSettings() {
    const settingsReady = useRef(false);

    const [settings, setSettings] = useState(() => {
        try {
            const saved = safeStorage.getItem('salesSettings');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    // Always start with empty users — DB is the source of truth
                    return { ...parsed, users: [] };
                } catch(e) {}
            }
        } catch(e) {}
        return DEFAULT_SETTINGS;
    });

    // Load settings from DB on mount
    const loadSettings = (clerkUser, clearFirst = false) => {
        if (!clerkUser) return;

        // Reset state when switching orgs to prevent bleed-through
        if (clearFirst) {
            settingsReady.current = false;
            setSettings(DEFAULT_SETTINGS);
            try { safeStorage.removeItem('salesSettings'); } catch(e) {}
        }

        dbFetch('/.netlify/functions/settings')
            .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then(data => {
                if (data.settings) {
                    // Strip users — they come exclusively from the /users endpoint
                    const { users: _stripUsers, ...settingsFromDb } = data.settings;
                    // Replace settings entirely (don't merge with prev) to prevent org bleed-through
                    setSettings({
                        ...DEFAULT_SETTINGS,
                        ...settingsFromDb,
                        taskTypes: settingsFromDb.taskTypes?.length ? settingsFromDb.taskTypes : DEFAULT_SETTINGS.taskTypes,
                        funnelStages: settingsFromDb.funnelStages?.length ? settingsFromDb.funnelStages : DEFAULT_SETTINGS.funnelStages,
                    });
                } else {
                    // No settings for this org yet — use defaults
                    setSettings(DEFAULT_SETTINGS);
                }
                setTimeout(() => { settingsReady.current = true; }, 0);
            })
            .catch(err => {
                console.error('Failed to load settings:', err);
                setTimeout(() => { settingsReady.current = true; }, 0);
            });

        // Load users from dedicated endpoint
        dbFetch('/.netlify/functions/users')
            .then(r => r.ok ? r.json() : { users: [] })
            .then(data => {
                if (data.users && data.users.length > 0) {
                    setSettings(prev => ({ ...prev, users: data.users }));
                }
            })
            .catch(() => {});
    };

    // Save settings to DB whenever they change (after initial load)
    useEffect(() => {
        if (!settingsReady.current) return;
        const { users: _stripUsers, ...settingsToSave } = settings;
        try { safeStorage.setItem('salesSettings', JSON.stringify(settingsToSave)); } catch(e) {}
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
