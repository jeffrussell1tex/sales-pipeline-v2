// settingsDefaults.js — a workspace's settings before it has saved any (state
// §0.170). One copy, read by the app (useSettings, while the org's settings
// load) and by the server (settings.mjs, for a key the workspace has never
// saved). Pure: no React, no fetch.
//
// Before §0.170 these lived in the settings hook alone, and only its autosave
// ever wrote them: the first change an Admin made in a new workspace PUT the
// whole settings object, defaults and all. The autosave is gone — each screen
// saves only its own keys — so the server keeps the defaults: a key absent
// from a workspace's stored settings reads as its default, and a save writes
// it, so the first screen saved never leaves the rest null.

export const DEFAULT_SETTINGS = {
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

// The defaults the server keeps: the keys in the `extra` blob whose default is
// something — the empty lists and off switches are the server's own fallbacks
// already, so a workspace that never saved them reads the same either way. Not
// the roster (`users`, the /users endpoint's), the fiscal year (its own column
// and its own save), the columns with a database default of their own
// (`taskTypes`, `verticalMarkets`, `fieldVisibility` — an empty one is visible
// to all, the default), or `priceBookConfig`, which the server does not store.
export const SEEDED_KEYS = Object.freeze([
    'quotaData', 'pipelines', 'painPoints', 'funnelStages', 'kpiConfig',
    'dispatchLicenses', 'dispatchBlockTypes', 'companyProfile',
]);

// A fresh copy of the seeded defaults — spread under a workspace's stored
// `extra` (`{ ...settingsSeeds(), ...extra }`), so a key the workspace holds,
// even as null, is its own and a key it has never saved is the default.
export function settingsSeeds() {
    const out = {};
    for (const k of SEEDED_KEYS) out[k] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[k]));
    return out;
}
