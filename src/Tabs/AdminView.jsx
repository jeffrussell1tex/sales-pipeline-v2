// AdminView.jsx
import React, { useState } from 'react';
import { dbFetch } from '../utils/storage';
import DuplicateScanView from './DuplicateScanView';
import ContactDuplicateScanView from './ContactDuplicateScanView';
import { T, eb } from './settings/shared/tokens.js';
import { StatusChip, SettingIcon, Avatar, Ring, CategoryChip } from './settings/shared/ui.jsx';
import { CompanyProfileDetail } from './settings/company/CompanyProfileDetail.jsx';
import { FiscalYearDetail } from './settings/company/FiscalYearDetail.jsx';
import { CompanyCalendarDetail } from './settings/company/CompanyCalendarDetail.jsx';
import { PipelinesDetail } from './settings/salesProcess/PipelinesDetail.jsx';
import { FunnelStagesDetail } from './settings/salesProcess/FunnelStagesDetail.jsx';
import { KPIThresholdsDetail } from './settings/salesProcess/KPIThresholdsDetail.jsx';
import { LeadConversionDetail, LeadConvBenchmarks } from './settings/salesProcess/LeadConversionDetail.jsx';
import { CustomFieldsDetail } from './settings/salesProcess/CustomFieldsDetail.jsx';
import { PainPointsDetail } from './settings/salesProcess/PainPointsDetail.jsx';
import { BuyerPersonasDetail } from './settings/salesProcess/BuyerPersonasDetail.jsx';
import { CustomerTypesDetail } from './settings/salesProcess/CustomerTypesDetail.jsx';
import { LeadScoringDetail } from './settings/salesProcess/LeadScoringDetail.jsx';
import { LeadVisibilityDetail } from './settings/salesProcess/LeadVisibilityDetail.jsx';
import { AccountSegmentsDetail } from './settings/salesProcess/AccountSegmentsDetail.jsx';
import { IndustriesDetail } from './settings/salesProcess/IndustriesDetail.jsx';
import { CompetitorsDetail, ReasonsWonDetail, ReasonsLostDetail } from './settings/salesProcess/FlatListDetail.jsx';
import { ApprovalTiersDetail } from './settings/quoting/ApprovalTiersDetail.jsx';
import { QuoteTemplatesDetail } from './settings/quoting/QuoteTemplatesDetail.jsx';
import { PriceBookDetail } from './settings/quoting/PriceBookDetail.jsx';
import { UsersDetail } from './settings/people/UsersDetail.jsx';
import { TeamsDetail } from './settings/people/TeamsDetail.jsx';
import { TerritoriesDetail } from './settings/people/TerritoriesDetail.jsx';
import { RolesDetail } from './settings/people/RolesDetail.jsx';
import { ConnectedAppsDetail } from './settings/integrations/ConnectedAppsDetail.jsx';
import { ApiKeysDetail } from './settings/integrations/ApiKeysDetail.jsx';
import { WebhooksDetail } from './settings/integrations/WebhooksDetail.jsx';
import { AutomationsDetail } from './settings/integrations/AutomationsDetail.jsx';
import { SsoDetail } from './settings/security/SsoDetail.jsx';
import { MfaDetail } from './settings/security/MfaDetail.jsx';
import { SessionDetail } from './settings/security/SessionDetail.jsx';
import { FlsDetail } from './settings/security/FlsDetail.jsx';
import { AuditDetail } from './settings/audit/AuditDetail.jsx';
import { ImportDetail } from './settings/data/ImportDetail.jsx';
import { ExportDetail } from './settings/data/ExportDetail.jsx';
import { BackupDetail } from './settings/data/BackupDetail.jsx';
import { FeaturesDetail } from './settings/data/FeaturesDetail.jsx';
import { DispatchSkillsDetail } from './settings/dispatch/DispatchSkillsDetail.jsx';
import { DispatchJobTypesDetail } from './settings/dispatch/DispatchJobTypesDetail.jsx';
import { DispatchBlockTypesDetail } from './settings/dispatch/DispatchBlockTypesDetail.jsx';
import { DispatchVehiclesDetail } from './settings/dispatch/DispatchVehiclesDetail.jsx';
import { DispatchCrewsDetail } from './settings/dispatch/DispatchCrewsDetail.jsx';
import { DispatchJobTemplatesDetail } from './settings/dispatch/DispatchJobTemplatesDetail.jsx';
import { DispatchServicePlansDetail } from './settings/dispatch/DispatchServicePlansDetail.jsx';
import { DispatchPropertyTypesDetail } from './settings/dispatch/DispatchPropertyTypesDetail.jsx';
import { SETTINGS_ITEMS, WORKSPACE_TABS_BASE } from './settings/catalogue.js';
import { cardStateOf, healthChecksOf, healthSummaryOf } from '../utils/settingsCards';

const V2Card = ({ item, onOpen, settings, liveCounts = {} }) => {
    const [hov, setHov] = useState(false);

    const { status, statusDetail, attention } = cardStateOf(item, settings, liveCounts);
    return (
        <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
            onClick={() => onOpen && onOpen(item)}
            style={{ background:T.surface, border:`1px solid ${hov ? T.borderStrong : T.border}`, borderRadius:6, padding:14, cursor:'pointer', position:'relative', boxShadow: hov ? '0 2px 0 rgba(0,0,0,0.02)' : 'none', transition:'border-color 120ms, box-shadow 120ms' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 }}>
                <SettingIcon category={item.category} size={34}/>
                <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2, flexWrap:'wrap' }}>
                        <div style={{ fontSize:13.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{item.name}</div>
                        {item.link && <span style={{ fontSize:11, color:T.info }}>↗</span>}
                    </div>
                    <div style={{ fontSize:11.5, color:T.inkMid, lineHeight:1.45, fontFamily:T.sans }}>{item.desc}</div>
                </div>
            </div>
            <div style={{ padding:'8px 10px', background:T.bg, border:`1px solid ${T.border}`, borderRadius:T.r, marginBottom:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <StatusChip status={status} detail={statusDetail || (status === 'none' ? 'No data' : null)} small/>
                {attention && <span style={{ fontSize:10, color:T.danger, fontWeight:700, fontFamily:T.sans }}>Needs attention</span>}
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:10.5, color:T.inkMuted, fontFamily:T.sans }}>
                {/* No invented edit history: the catalogue carried "Edited 2 months ago by
                    Admin" on 46 cards, values that never moved (§0.81). "Managed in X" is the
                    one footer that is true; otherwise nothing. */}
                <span>{item.managedIn ? `Managed in ${item.managedIn}` : ''}</span>
                <span style={{ color:T.info, fontWeight:600 }}>{item.link ? 'Open in Quotes →' : 'Open →'}</span>
            </div>
        </div>
    );
};

// Module scope — a component defined inside AdminView would be a new type on
// every render and remount mid-save. Mirrors the wording and option order of the
// top-level nav guard in App.jsx so the two do not feel like different features.
const LeaveGuardModal = ({ saving, canSave, failed, onStay, onSave, onDiscard }) => (
    <div style={{ position:'fixed', inset:0, zIndex:99999, display:'flex', alignItems:'center', justifyContent:'center',
        background:'rgba(42,38,34,0.55)' }} onClick={saving ? undefined : onStay}>
        <div onClick={e => e.stopPropagation()}
            style={{ background:T.surface, borderRadius:8, boxShadow:'0 24px 64px rgba(42,38,34,0.22)',
                width:420, maxWidth:'92vw', padding:'26px 30px', fontFamily:T.sans }}>
            <div style={{ fontSize:17, fontWeight:700, color:T.ink, marginBottom:8 }}>Unsaved changes</div>
            {failed && (
                <div style={{ fontSize:12.5, fontWeight:600, color:T.danger, marginBottom:10, fontFamily:T.sans }}>
                    The save did not go through — the panel behind this dialog shows why. Your changes are still here.
                </div>
            )}
            <div style={{ fontSize:13.5, color:T.inkMid, lineHeight:1.55, marginBottom:22 }}>
                This panel has changes that have not been saved. Save them, or discard and continue.
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {canSave && (
                    <button onClick={onSave} disabled={saving}
                        style={{ padding:'10px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:4,
                            fontSize:13.5, fontWeight:600, cursor:saving?'default':'pointer', textAlign:'left',
                            opacity:saving?0.6:1, fontFamily:T.sans }}>
                        {saving ? 'Saving…' : 'Save changes and continue'}
                    </button>
                )}
                <button onClick={onStay} disabled={saving}
                    style={{ padding:'10px 16px', background:canSave?'transparent':T.ink,
                        color:canSave?T.inkMid:'#fbf8f3', border:canSave?`1px solid ${T.borderStrong}`:'none',
                        borderRadius:4, fontSize:13.5, fontWeight:600, cursor:saving?'default':'pointer',
                        textAlign:'left', fontFamily:T.sans }}>
                    Stay here
                </button>
                <button onClick={onDiscard} disabled={saving}
                    style={{ padding:'10px 16px', background:'transparent', color:T.danger,
                        border:`1px solid ${T.border}`, borderRadius:4, fontSize:13.5, fontWeight:500,
                        cursor:saving?'default':'pointer', textAlign:'left', fontFamily:T.sans }}>
                    Discard changes and continue
                </button>
            </div>
        </div>
    </div>
);

export const AdminView = ({ settings, setSettings, currentUser, setActiveTab, setAccountsDeepFilter, settingsDirty, setSettingsDirty, settingsSaveRef }) => {
    const [tab,   setTab  ] = useState('All');
    const [search, setSearch] = useState('');
    const [activeItem, setActiveItem] = useState(null); // detail panel state

    // Unsaved-changes guard for leaving a settings panel. `go` is the navigation
    // that was intercepted; it runs on Discard, or after a successful Save.
    const [leaveGuard, setLeaveGuard] = useState(null);
    const [guardSaving, setGuardSaving] = useState(false);
    const [guardFailed, setGuardFailed] = useState(false);

    const openItem = (it) => {
        if (settingsDirty) { setLeaveGuard({ go: () => { setSettingsDirty(false); setActiveItem(it); } }); return; }
        setActiveItem(it);
    };

    // `settingsSaveRef` is populated by every dirty panel and was never called by
    // anything — the existing nav guard only offers Stay or Discard. Wiring it here
    // means "Save and continue" is a real option rather than a manual round trip.
    const guardSave = async () => {
        const save = settingsSaveRef && settingsSaveRef.current;
        if (!save) { setLeaveGuard(null); return; }
        setGuardSaving(true);
        setGuardFailed(false);
        try {
            await save();
        } catch (e) {
            setGuardSaving(false);
            setGuardFailed(true);
            return;                  // guard stays open — see below
        }

        // Every panel save now rethrows on failure (coding guide §18a10), so the
        // catch above is the whole story — the timing-based check that used to sit
        // here, polling settingsSaveRef after a delay, is gone.
        const go = leaveGuard?.go;
        setSettingsDirty(false);
        setLeaveGuard(null);
        setGuardSaving(false);
        if (go) go();
    };

    // ── Needs Attention snooze/dismiss ───────────────────────────────────────
    const [naMenuOpen,   setNaMenuOpen]   = React.useState(null);
    // naHidden persisted to localStorage so dismissals survive refresh/relogin
    const NA_STORAGE_KEY = 'accelerep_na_hidden';
    const [naHidden, setNaHiddenRaw] = React.useState(() => {
        try {
            const stored = localStorage.getItem(NA_STORAGE_KEY);
            if (stored) return JSON.parse(stored);
        } catch (e) {}
        return {};
    });
    const setNaHidden = (updater) => {
        setNaHiddenRaw(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            try { localStorage.setItem(NA_STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
            return next;
        });
    };
    const [naShowHidden, setNaShowHidden] = React.useState(false);
    const now = Date.now();

    const isHidden = (id) => {
        const h = naHidden[id];
        if (!h) return false;
        if (h.until === 'forever') return true;
        return new Date(h.until).getTime() > now;
    };

    const handleNaSnooze = (item, days) => {
        const until = new Date(now + days * 86400000);
        const label = until.toLocaleDateString('en-US', { month:'short', day:'numeric' });
        setNaHidden(prev => ({ ...prev, [item.id]: { until: until.toISOString(), name: item.name, snoozedUntilLabel: label } }));
        setNaMenuOpen(null);
    };

    const handleNaDismiss = (item) => {
        setNaHidden(prev => ({ ...prev, [item.id]: { until: 'forever', name: item.name, snoozedUntilLabel: null } }));
        setNaMenuOpen(null);
    };

    const handleNaRestore = (id) => {
        setNaHidden(prev => { const n = {...prev}; delete n[id]; return n; });
    };

    React.useEffect(() => {
        if (!naMenuOpen) return;
        const onDoc = (e) => {
            const menu = document.getElementById('na-menu-' + naMenuOpen);
            const btn  = document.getElementById('na-btn-'  + naMenuOpen);
            if (menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) setNaMenuOpen(null);
        };
        const onKey = (e) => { if (e.key === 'Escape') setNaMenuOpen(null); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown',   onKey);
        return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
    }, [naMenuOpen]);

    // Detail panels that have real content — others just open the card (no-op for now)
    const DETAIL_PANELS = {
        'lead-conv-benchmarks': <LeadConvBenchmarks settings={settings} setSettings={setSettings}/>,
        'company-profile':      'company-profile',
        'fiscal-year':          'fiscal-year',
        'company-calendar':     'company-calendar',
        // Sales process Group 1
        'pipelines':            'pipelines',
        'funnel-stages':        'funnel-stages',
        'kpi-settings':         'kpi-settings',
        // Quoting
        'approval-tiers':       'approval-tiers',
        'quote-templates':      'quote-templates',
        'price-book':           'price-book',
        // Data
        'import':   'import',
        'export':   'export',
        'backup':   'backup',
        'features': 'features',
        // Security
        'sso':              'sso',
        'mfa':              'mfa',
        'session':          'session',
        'field-visibility': 'field-visibility',
        'audit-log':        'audit-log',
        // Integrations
        'apps':         'apps',
        'api-keys':     'api-keys',
        'webhooks':     'webhooks',
        'automations':  'automations',
        // People & Teams
        'users':        'users',
        'teams':        'teams',
        'territories':  'territories',
        'roles':        'roles',
        // Sales process Group 2
        'custom-fields':        'custom-fields',
        'pain-points':          'pain-points',
        'customer-types':       'customer-types',
        'lead-scoring':         'lead-scoring',
        'lead-visibility':      'lead-visibility',
        'account-segments':     'account-segments',
        'industries':           'industries',
        'duplicates':           'duplicates',
        'contact-duplicates':   'contact-duplicates',
        'competitors':          'competitors',
        'reasons-won':          'reasons-won',
        'reasons-lost':         'reasons-lost',
        'buyer-personas':       'buyer-personas',
        // Dispatch
        'dsp-skills':           'dsp-skills',
        'dsp-jobtypes':         'dsp-jobtypes',
        'dsp-blocktypes':       'dsp-blocktypes',
        'dsp-vehicles':         'dsp-vehicles',
        'dsp-crews':            'dsp-crews',
        'dsp-templates':        'dsp-templates',
        'dsp-plans':            'dsp-plans',
        'dsp-proptypes':        'dsp-proptypes',
        'dispatch-skills':      'dispatch-skills',
        'dispatch-vehicles':    'dispatch-vehicles',
    };

    // ── Live card badge counts — fetched once on mount ────────────────────────
    const [liveCounts, setLiveCounts] = React.useState({});
    React.useEffect(() => {
        let cancelled = false;
        const fetchCounts = async () => {
            try {
                const [keysRes, webhooksRes, autosRes, auditRes, backupRes, mfaRes] = await Promise.allSettled([
                    dbFetch('/.netlify/functions/api-keys'),
                    dbFetch('/.netlify/functions/webhooks'),
                    dbFetch('/.netlify/functions/automations'),
                    dbFetch('/.netlify/functions/audit-log'),
                    dbFetch('/.netlify/functions/backup'),
                    dbFetch('/.netlify/functions/clerk-mfa-status'),
                ]);
                if (cancelled) return;
                const counts = {};
                if (keysRes.status === 'fulfilled') {
                    const d = await keysRes.value.json().catch(() => ({}));
                    const keys = d.keys || [];
                    counts.apiKeysActive  = keys.filter(k => !k.revokedAt).length;
                    counts.apiKeysTotal   = keys.length;
                }
                if (webhooksRes.status === 'fulfilled') {
                    const d = await webhooksRes.value.json().catch(() => ({}));
                    const subs = d.subscriptions || [];
                    counts.webhooksTotal   = subs.length;
                    counts.webhooksActive  = subs.filter(s => s.active).length;
                    counts.webhooksFailing = subs.filter(s => s.active && s.lastStatus && s.lastStatus >= 400).length;
                }
                if (autosRes.status === 'fulfilled') {
                    const d = await autosRes.value.json().catch(() => ({}));
                    const autos = d.automations || [];
                    counts.autosTotal  = autos.length;
                    counts.autosActive = autos.filter(a => a.active).length;
                }
                if (auditRes.status === 'fulfilled') {
                    const d = await auditRes.value.json().catch(() => ({}));
                    counts.auditEvents = (d.entries || []).length;
                }
                if (backupRes.status === 'fulfilled') {
                    const d = await backupRes.value.json().catch(() => ({}));
                    const snaps = d.snapshots || [];
                    if (backupRes.value.ok) counts.backupChecked = true;   // an answer, even "no snapshots"
                    if (snaps[0]) {
                        const last = snaps[0];
                        const diffH = Math.round((Date.now() - new Date(last.createdAt)) / 3600000);
                        counts.backupLastLabel = diffH < 1 ? 'just now' : diffH < 24 ? diffH + 'h ago' : Math.round(diffH/24) + 'd ago';
                        counts.backupFreq = d.schedule?.frequency || 'Daily';
                        counts.backupLastHours = diffH;
                    }
                }
                // Admin-only endpoint: a 403 leaves counts.mfa unset and the card blank.
                if (mfaRes.status === 'fulfilled' && mfaRes.value.ok) {
                    const d = await mfaRes.value.json().catch(() => ({}));
                    if (typeof d.total === 'number') counts.mfa = { enrolled: d.enrolled, total: d.total };
                }
                setLiveCounts(counts);
            } catch (e) { /* silent — badges just stay empty */ }
        };
        fetchCounts();
        return () => { cancelled = true; };
    }, []);

    // Recently changed feed — loaded from audit log (must be before early return)
    const [recentFeed, setRecentFeed] = React.useState([]);
    React.useEffect(() => {
        let cancelled = false;
        dbFetch('/.netlify/functions/audit-log')
            .then(r => r.json())
            .then(data => {
                if (cancelled) return;
                const entries = data.entries || [];
                const fmtAge = (iso) => {
                    if (!iso) return '—';
                    const d = new Date(iso);
                    const diffMin = Math.round((Date.now() - d) / 60000);
                    if (diffMin < 1)    return 'just now';
                    if (diffMin < 60)   return diffMin + 'm ago';
                    if (diffMin < 1440) return Math.round(diffMin/60) + 'h ago';
                    if (diffMin < 2880) return 'yesterday';
                    if (diffMin < 10080) return Math.round(diffMin/1440) + 'd ago';
                    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
                };
                const mapped = entries.slice(0, 4).map(e => ({
                    who:  e.userName || e.userId || 'System',
                    what: (e.action || '').replace(/[._]/g, ' '),
                    when: fmtAge(e.timestamp),
                }));
                if (mapped.length > 0) setRecentFeed(mapped);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

        if (activeItem) {
        // The panel is produced by an IIFE rather than returned directly, so the
        // unsaved-changes modal can render alongside whichever of the ~40 branches
        // below fired. Editing each return individually would guarantee one gets
        // missed — the same reason the Dispatch prompt uses a single guard().
        const panelEl = (() => {
        const id = activeItem.id;
        // Back used to clear the dirty flag and leave — discarding unsaved edits
        // with no prompt. The top-level nav guard in App.jsx only fires on TAB
        // clicks, so the most common exit from a panel was also the only unguarded
        // one. Same three options as that guard, for consistency.
        const onBack = () => {
            if (settingsDirty) { setLeaveGuard({ go: () => { setSettingsDirty(false); setActiveItem(null); } }); return; }
            if (typeof setSettingsDirty === 'function') setSettingsDirty(false);
            setActiveItem(null);
        };

        // Company detail pages — full chrome, no wrapper card
        if (id === 'company-profile')  return <CompanyProfileDetail  settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'fiscal-year')      return <FiscalYearDetail      settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'company-calendar') return <CompanyCalendarDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;

        // Sales process Group 1 detail pages
        if (id === 'pipelines')            return <PipelinesDetail        settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'funnel-stages')        return <FunnelStagesDetail     settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'kpi-settings')         return <KPIThresholdsDetail    settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'lead-conv-benchmarks') return <LeadConversionDetail   settings={settings} setSettings={setSettings} onBack={onBack}/>;

        // Quoting detail pages
        if (id === 'quote-templates') return <QuoteTemplatesDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'approval-tiers')  return <ApprovalTiersDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'price-book')      return <PriceBookDetail     settings={settings} setSettings={setSettings} onBack={onBack}/>;

        // Data detail pages
        if (id === 'import')   return <ImportDetail   onBack={onBack}/>;
        if (id === 'export')   return <ExportDetail   onBack={onBack}/>;
        if (id === 'backup')   return <BackupDetail   onBack={onBack}/>;
        if (id === 'features') return <FeaturesDetail settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;

        // Security detail pages
        if (id === 'sso')              return <SsoDetail       onBack={onBack}/>;
        if (id === 'mfa')              return <MfaDetail       onBack={onBack}/>;
        if (id === 'session')          return <SessionDetail   onBack={onBack}/>;
        if (id === 'field-visibility') return <FlsDetail       onBack={onBack}/>;
        if (id === 'audit-log')        return <AuditDetail     onBack={onBack}/>;

        // Integrations detail pages
        if (id === 'apps')        return <ConnectedAppsDetail onBack={onBack}/>;
        if (id === 'api-keys')    return <ApiKeysDetail      onBack={onBack}/>;
        if (id === 'webhooks')    return <WebhooksDetail     onBack={onBack}/>;
        if (id === 'automations') return <AutomationsDetail  onBack={onBack}/>;

        // People & Teams detail pages
        if (id === 'users')       return <UsersDetail       settings={settings} onBack={onBack}/>;
        if (id === 'teams')       return <TeamsDetail        settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'territories') return <TerritoriesDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'roles')       return <RolesDetail       settings={settings} onBack={onBack}/>;

        // Sales process Group 2 detail pages
        if (id === 'custom-fields')   return <CustomFieldsDetail   settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'pain-points')     return <PainPointsDetail     settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'competitors')     return <CompetitorsDetail     settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'reasons-won')     return <ReasonsWonDetail      settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'reasons-lost')    return <ReasonsLostDetail     settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'customer-types')  return <CustomerTypesDetail  settings={settings} setSettings={setSettings} onBack={onBack} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter}/>;
        if (id === 'lead-scoring')    return <LeadScoringDetail    settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'lead-visibility') return <LeadVisibilityDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'account-segments') return <AccountSegmentsDetail settings={settings} setSettings={setSettings} onBack={onBack} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter}/>;
        if (id === 'buyer-personas')  return <BuyerPersonasDetail  settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        // Dispatch detail pages
        if (id === 'dsp-skills'    || id === 'dispatch-skills')   return <DispatchSkillsDetail   settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'dsp-jobtypes')                                return <DispatchJobTypesDetail settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'dsp-blocktypes')                              return <DispatchBlockTypesDetail settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'dsp-vehicles'  || id === 'dispatch-vehicles') return <DispatchVehiclesDetail  settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'dsp-crews')     return <DispatchCrewsDetail    settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'dsp-templates') return <DispatchJobTemplatesDetail settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'dsp-plans')     return <DispatchServicePlansDetail settings={settings} onBack={onBack} setSettingsDirty={setSettingsDirty}/>;
        if (id === 'dsp-proptypes') return <DispatchPropertyTypesDetail settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty}/>;
        if (id === 'industries')      return <IndustriesDetail     settings={settings} setSettings={setSettings} onBack={onBack} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter}/>;
        if (id === 'duplicates')      return <DuplicateScanView onBack={onBack}/>;
        if (id === 'contact-duplicates') return <ContactDuplicateScanView onBack={onBack}/>;

        // Generic wrapper for all other panels
        const panel = DETAIL_PANELS[id];
        return (
            <div>
                {/* Back breadcrumb */}
                <button onClick={onBack}
                    style={{ display:'inline-flex', alignItems:'center', gap:6, background:'none', border:'none', color:T.info, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:'0 0 14px' }}>
                    ← Back to settings
                </button>
                <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:20, fontWeight:700, color:T.ink, marginBottom:4, fontFamily:T.sans }}>{activeItem.name}</div>
                    <div style={{ fontSize:13, color:T.inkMid, fontFamily:T.sans }}>{activeItem.desc}</div>
                </div>
                <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:20 }}>
                    {panel || (
                        <div style={{ color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>
                            This setting panel is not yet implemented.
                        </div>
                    )}
                </div>
            </div>
        );
        })();

        return (
            <>
                {panelEl}
                {leaveGuard && (
                    <LeaveGuardModal saving={guardSaving} failed={guardFailed} canSave={!!(settingsSaveRef && settingsSaveRef.current)}
                        onStay={() => { setLeaveGuard(null); setGuardFailed(false); }}
                        onSave={guardSave}
                        onDiscard={() => { const go = leaveGuard.go; setLeaveGuard(null); go && go(); }}/>
                )}
            </>
        );
    }

    // Alphabetical throughout (Jeff's call, 2 Sep): tabs sort A→Z with 'All'
    // pinned first, and the cards inside every tab (and search results) sort
    // by name. The sort lives HERE, not in catalogue.js — the catalogue stays
    // grouped by category for editing, and a new item lands in the right
    // display position without anyone hand-ordering it.
    const WORKSPACE_TABS = ['All', ...[...WORKSPACE_TABS_BASE.slice(1), ...(settings?.dispatchEnabled ? ['Dispatch'] : [])].sort((a, b) => a.localeCompare(b))];
    const tabs = WORKSPACE_TABS;
    const scopeItems = SETTINGS_ITEMS.filter(i => i.scope === 'workspace');
    const filteredByTab = (tab === 'All' ? scopeItems : scopeItems.filter(i => i.category === tab))
        .filter(i => i.category !== 'Dispatch' || settings?.dispatchEnabled);
    const items = (search.trim()
        ? scopeItems.filter(i => (i.name + ' ' + i.desc + ' ' + i.category).toLowerCase().includes(search.toLowerCase()))
        : filteredByTab)
        .slice().sort((a, b) => a.name.localeCompare(b.name));

    // Workspace health — from real data + static checks
    const users = settings?.users || [];
    const pipelines = settings?.pipelines || [];
    const funnelStages = settings?.funnelStages || [];
    const calConnected = settings?.googleCalendarConnected || false;
    // Attention is computed per card from the same live data as its chip (the
    // catalogue's attention:true on webhooks and sso were hand-typed, §0.81);
    // the row shows the computed detail, not the row's typed one.
    const cardStates = Object.fromEntries(scopeItems.map(i => [i.id, cardStateOf(i, settings, liveCounts)]));
    const allAttentionItems = scopeItems.filter(i => cardStates[i.id].attention).map(i => ({ ...i, statusDetail: cardStates[i.id].statusDetail }));
    const visibleAttention  = allAttentionItems.filter(it => !isHidden(it.id));
    const hiddenAttention   = allAttentionItems.filter(it =>  isHidden(it.id));
    const attentionItems    = visibleAttention; // alias for any remaining references
    const hiddenCount       = hiddenAttention.length;
    const lastHidden        = hiddenAttention.length > 0 ? hiddenAttention[hiddenAttention.length - 1] : null;
    const lastHiddenInfo    = lastHidden ? naHidden[lastHidden.id] : null;
    // Only checks that can be READ (settingsCards.js): four of the eight here
    // were constants — "MFA enforced" false beside live enrolment, "Backups
    // running" / "Session policy set" / "Quote branding configured" true (§0.81).
    const activeHealthChecks = healthChecksOf(settings, liveCounts, isHidden);
    const health    = healthSummaryOf(activeHealthChecks);
    const healthOk  = health.ok;
    const healthPct = health.pct;


    // Group items by category
    const grouped = {};
    for (const it of items) (grouped[it.category] ||= []).push(it);

    return (
        <div>
            {/* Scope switch + search row */}
            <div style={{ display:'flex', alignItems:'center', gap:14, padding:'4px 0 14px', flexWrap:'wrap' }}>
                {/* The Workspace/Personal scope toggle is gone. Personal preferences
                    live behind the avatar menu for every user; the panels this toggle
                    revealed were mockups — a Connect button with no onClick, sync
                    toggles held in local state and read by nothing, and an email
                    signature with a fabricated job title and invented open rates. */}
                <span style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>
                    Admin settings · affects all users
                </span>
                <div style={{ flex:1 }}/>
                {/* Search */}
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, width:300, fontFamily:T.sans }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search settings…" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:13, color:T.ink, fontFamily:T.sans }}/>
                    {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:14, padding:0 }}>×</button>}
                    <span style={{ fontSize:10, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', padding:'1px 5px', background:T.surface2, borderRadius:2, border:`1px solid ${T.border}` }}>⌘.</span>
                </div>
            </div>

            {/* Health + attention + recent strip — workspace only, no search */}
            {!search.trim() && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1.1fr', gap:14, marginBottom:18 }}>
                    {/* Health ring */}
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:16, display:'flex', alignItems:'center', gap:14 }}>
                        <Ring value={healthPct} size={72} stroke={7} color={T.ok} trackColor={T.border}/>
                        <div style={{ flex:1 }}>
                            <div style={{ ...eb(T.ok), marginBottom:4 }}>WORKSPACE HEALTH</div>
                            <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:4, fontFamily:T.sans }}>{healthOk} of {activeHealthChecks.length} checks passing</div>
                            <div style={{ fontSize:11.5, color:T.inkMid, lineHeight:1.5, fontFamily:T.sans }}>{health.sentence}</div>
                        </div>
                    </div>
                    {/* Needs attention */}
                    <div style={{ background:'rgba(156,58,46,0.04)', border:'1px solid rgba(156,58,46,0.2)', borderRadius:6, padding:16 }}>
                        {/* Header */}
                        <div style={{ ...eb('#9c3a2e'), marginBottom:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                                <span>⚠</span> NEEDS ATTENTION
                            </span>
                            {hiddenCount > 0 && (
                                <span style={{ fontSize:9.5, color:T.inkMuted, letterSpacing:0, textTransform:'none', fontWeight:400, fontFamily:T.sans }}>
                                    {hiddenCount} hidden · <span onClick={() => setNaShowHidden(v => !v)}
                                        style={{ color:T.info, fontWeight:600, cursor:'pointer' }}>
                                        {naShowHidden ? 'Hide' : 'Show'}
                                    </span>
                                </span>
                            )}
                        </div>

                        {/* Visible attention rows */}
                        {visibleAttention.slice(0,3).map((it, i) => {
                            const isOpen  = naMenuOpen === it.id;
                            const fixable = it.id !== 'sso';
                            return (
                                <div key={it.id} style={{ padding:'8px 0',
                                    borderBottom: i < Math.min(visibleAttention.length,3)-1 ? `1px dashed rgba(156,58,46,0.15)` : 'none',
                                    display:'flex', alignItems:'center', gap:8, position:'relative',
                                    background: isOpen ? 'rgba(200,185,154,0.07)' : 'transparent' }}>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{it.name}</div>
                                        <div style={{ fontSize:11, color:T.inkMid, marginTop:1, fontFamily:T.sans }}>{it.statusDetail}</div>
                                    </div>
                                    {/* Fix button */}
                                    <button onClick={() => fixable && setActiveItem(SETTINGS_ITEMS.find(s => s.id===it.id)||it)}
                                        style={{ padding:'4px 10px', fontSize:11, fontWeight:600,
                                            background: fixable ? T.danger : 'rgba(156,58,46,0.35)',
                                            color:'#fbf8f3', border:'none', borderRadius:T.r,
                                            cursor: fixable ? 'pointer' : 'not-allowed', fontFamily:T.sans,
                                            display:'inline-flex', alignItems:'center', gap:4 }}>
                                        Fix <span style={{ fontSize:10 }}>→</span>
                                    </button>
                                    {/* Kebab ⋯ */}
                                    <button id={'na-btn-' + it.id}
                                        onClick={() => setNaMenuOpen(isOpen ? null : it.id)}
                                        style={{ width:24, height:24, display:'inline-flex', alignItems:'center', justifyContent:'center',
                                            borderRadius:3, cursor:'pointer', border:'none', padding:0,
                                            color: isOpen ? T.goldInk : T.inkMuted,
                                            background: isOpen ? 'rgba(200,185,154,0.30)' : 'transparent',
                                            fontSize:15, fontWeight:700, lineHeight:1 }}>⋯</button>
                                    {/* Kebab menu */}
                                    {isOpen && (
                                        <div id={'na-menu-' + it.id}
                                            style={{ position:'absolute', right:0, zIndex:50, ...(i >= 1 ? { bottom:'100%', marginBottom:4 } : { top:'100%', marginTop:4 }),
                                                width:220, background:T.surface, border:`1px solid ${T.borderStrong}`,
                                                borderRadius:4, padding:4, fontFamily:T.sans,
                                                boxShadow:'0 8px 24px rgba(42,38,34,0.12), 0 2px 4px rgba(42,38,34,0.06)' }}>
                                            <div style={{ position:'absolute', top:-6, right:10, width:12, height:12,
                                                background:T.surface, border:`1px solid ${T.borderStrong}`,
                                                borderRight:'none', borderBottom:'none', transform:'rotate(45deg)' }}/>
                                            <div style={{ padding:'6px 12px 4px', fontSize:9.5, fontWeight:800,
                                                color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase' }}>
                                                Remind me later
                                            </div>
                                            {[
                                                { days:7,  label:'Snooze 7 days',  sub:'Until next Monday' },
                                                { days:30, label:'Snooze 30 days', sub:'Recommended'       },
                                                { days:90, label:'Snooze 90 days', sub:'Once a quarter'    },
                                            ].map(o => (
                                                <div key={o.days} onClick={() => handleNaSnooze(it, o.days)}
                                                    style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', borderRadius:3, cursor:'pointer' }}
                                                    onMouseEnter={e => e.currentTarget.style.background='rgba(200,185,154,0.10)'}
                                                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                                    <span style={{ fontSize:12, color:T.inkMid, flexShrink:0 }}>◷</span>
                                                    <div>
                                                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{o.label}</div>
                                                        <div style={{ fontSize:10.5, color:T.inkMuted }}>{o.sub}</div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
                                            <div onClick={() => handleNaDismiss(it)}
                                                style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', borderRadius:3, cursor:'pointer' }}
                                                onMouseEnter={e => e.currentTarget.style.background='rgba(200,185,154,0.10)'}
                                                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                                <span style={{ fontSize:12, color:T.danger, flexShrink:0 }}>🗑</span>
                                                <div>
                                                    <div style={{ fontSize:12.5, fontWeight:600, color:T.danger }}>Dismiss permanently</div>
                                                    <div style={{ fontSize:10.5, color:T.inkMuted }}>Won't show again on this workspace</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Hidden items — shown when "Show" toggled */}
                        {naShowHidden && hiddenAttention.map(it => {
                            const info = naHidden[it.id];
                            return (
                                <div key={it.id} style={{ padding:'8px 0',
                                    borderTop:`1px dashed rgba(156,58,46,0.15)`,
                                    display:'flex', alignItems:'center', gap:10, opacity:0.55 }}>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans,
                                            textDecoration:'line-through', textDecorationColor:'rgba(42,38,34,0.35)' }}>
                                            {it.name}
                                        </div>
                                        <div style={{ fontSize:11, color:T.inkMid, marginTop:1, fontFamily:T.sans }}>
                                            <span style={{ padding:'1px 5px', borderRadius:2, fontSize:9.5, fontWeight:700,
                                                background:'rgba(58,90,122,0.12)', color:T.info, marginRight:6,
                                                textTransform:'uppercase', letterSpacing:0.5 }}>
                                                {info?.until === 'forever' ? 'Dismissed' : 'Snoozed'}
                                            </span>
                                            {info?.until !== 'forever' && info?.snoozedUntilLabel
                                                ? 'Until ' + info.snoozedUntilLabel
                                                : 'Permanently hidden'}
                                        </div>
                                    </div>
                                    <span onClick={() => handleNaRestore(it.id)}
                                        style={{ fontSize:10.5, color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                                        Restore
                                    </span>
                                </div>
                            );
                        })}

                        {/* All clear states */}
                        {visibleAttention.length === 0 && hiddenCount === 0 && (
                            <div style={{ fontSize:12, color:T.ok, fontFamily:T.sans }}>All checks passing ✓</div>
                        )}
                        {visibleAttention.length === 0 && hiddenCount > 0 && (
                            <div style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans, fontStyle:'italic' }}>
                                All visible checks passing — {hiddenCount} hidden.
                            </div>
                        )}

                        {/* Info strip — most recently hidden item */}
                        {lastHidden && lastHiddenInfo && !naShowHidden && (
                            <div style={{ marginTop:10, padding:'8px 10px',
                                background:'rgba(58,90,122,0.06)', borderRadius:3,
                                fontSize:10.5, color:T.inkMid, display:'flex', alignItems:'center', gap:6, fontFamily:T.sans }}>
                                <span style={{ fontSize:11, color:T.info }}>◷</span>
                                <span>
                                    <b style={{ color:T.ink }}>{lastHiddenInfo.name}</b>
                                    {lastHiddenInfo.until === 'forever'
                                        ? ' dismissed permanently.'
                                        : ` snoozed until ${lastHiddenInfo.snoozedUntilLabel}.`}
                                    {' '}
                                    <span onClick={() => handleNaRestore(lastHidden.id)}
                                        style={{ color:T.info, fontWeight:600, cursor:'pointer' }}>Restore</span>
                                </span>
                            </div>
                        )}
                    </div>
                    {/* Recently changed */}
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:16 }}>
                        <div style={{ ...eb(T.inkMuted), marginBottom:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <span>RECENTLY CHANGED</span>
                            <span style={{ fontSize:10.5, color:T.info, cursor:'pointer', fontWeight:600, letterSpacing:0, textTransform:'none', fontFamily:T.sans }}>View audit log →</span>
                        </div>
                        {recentFeed.slice(0,4).map((r, i) => (
                            <div key={i} style={{ padding:'6px 0', borderBottom: i < 3 ? `1px dashed ${T.border}` : 'none', display:'flex', alignItems:'center', gap:10 }}>
                                <Avatar name={r.who} size={22}/>
                                <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:12, color:T.ink, lineHeight:1.3, fontFamily:T.sans }}><strong>{(r.who||'').split(' ')[0]}</strong> {r.what.toLowerCase()}</div>
                                    <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:1, fontFamily:T.sans }}>{r.when}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Workspace: category tabs + card grid */}
            {(
                <>
                    <div style={{ borderBottom:`1px solid ${T.border}`, display:'flex', gap:26, overflowX:'auto', marginBottom:18 }}>
                        {tabs.map(t => (
                            <div key={t} onClick={() => setTab(t)} style={{ fontSize:13, fontWeight: t===tab ? 600 : 400, color: t===tab ? T.info : T.inkMid, borderBottom: t===tab ? `2px solid ${T.info}` : '2px solid transparent', paddingBottom:10, cursor:'pointer', whiteSpace:'nowrap', fontFamily:T.sans, transition:'color 120ms, border-color 120ms' }}>
                                {t}
                                {t !== 'All' && (
                                    <span style={{ marginLeft:6, fontSize:10.5, color:T.inkMuted, fontWeight:500, fontFamily:T.sans }}>
                                        {SETTINGS_ITEMS.filter(i => i.scope==='workspace' && i.category===t).length}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    <div>
                        {search.trim() && <div style={{ fontSize:13, color:T.inkMid, marginBottom:14, fontFamily:T.sans }}>{items.length} results for <strong>{search}</strong></div>}
                        {Object.entries(grouped).map(([cat, list]) => (
                            <div key={cat} style={{ marginBottom:24 }}>
                                {(tab === 'All' || search.trim()) && (
                                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                                        <CategoryChip category={cat}/>
                                        <span style={{ fontSize:11.5, color:T.inkMuted, fontFamily:T.sans }}>{list.length} setting{list.length===1?'':'s'}</span>
                                    </div>
                                )}
                                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                                    {list.map(it => <V2Card key={it.id} item={it} settings={settings} liveCounts={liveCounts} onOpen={DETAIL_PANELS[it.id] ? () => openItem(it) : undefined}/>)}
                                </div>
                            </div>
                        ))}
                        {Object.keys(grouped).length === 0 && (
                            <div style={{ padding:'3rem', textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>
                                {search ? `No settings match "${search}".` : 'No settings in this category.'}
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Also needed on the card list: `openItem` can intercept a click on a
                DIFFERENT panel while the current one is dirty. */}
            {leaveGuard && (
                <LeaveGuardModal saving={guardSaving} failed={guardFailed} canSave={!!(settingsSaveRef && settingsSaveRef.current)}
                    onStay={() => { setLeaveGuard(null); setGuardFailed(false); }}
                    onSave={guardSave}
                    onDiscard={() => { const go = leaveGuard.go; setLeaveGuard(null); go && go(); }}/>
            )}
        </div>
    );
};
