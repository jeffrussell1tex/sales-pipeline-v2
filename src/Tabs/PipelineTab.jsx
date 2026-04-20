import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';
import KanbanView from '../components/KanbanView';
import FunnelView from '../components/FunnelView';

// ── Design tokens ─────────────────────────────────────────────
const T = {
    bg:           '#f0ece4',
    surface:      '#fbf8f3',
    surface2:     '#f5efe3',
    border:       '#e6ddd0',
    borderStrong: '#d4c8b4',
    ink:          '#2a2622',
    inkMid:       '#5a544c',
    inkMuted:     '#8a8378',
    gold:         '#c8b99a',
    goldInk:      '#7a6a48',
    danger:       '#9c3a2e',
    warn:         '#b87333',
    ok:           '#4d6b3d',
    info:         '#3a5a7a',
    surfaceInk:   '#2a2622',
    stages: {
        'Prospecting': '#b0a088', 'Qualification': '#c8a978', 'Discovery': '#b07a55',
        'Evaluation (Demo)': '#b07a55', 'Proposal': '#b87333',
        'Negotiation': '#7a5a3c', 'Negotiation/Review': '#7a5a3c',
        'Contracts': '#4d6b3d', 'Closing': '#4d6b3d',
        'Closed Won': '#3a5530', 'Closed Lost': '#9c3a2e',
    },
    sans:  '"Plus Jakarta Sans", system-ui, sans-serif',
    serif: 'Georgia, "Source Serif 4", serif',
    rSm: 3, rMd: 4, rLg: 6,
};
const stageColor = (s) => T.stages[s] || T.inkMuted;

// ── Filter Panel Modal ────────────────────────────────────────
function FilterPanel({
    open, onClose, onApply,
    allPipelines, activePipeline, setActivePipelineId,
    pipelineQuarterFilter, setPipelineQuarterFilter,
    pipelineStageFilter,   setPipelineStageFilter,
    pipelineRepFilter,     setPipelineRepFilter,
    pipelineTerritoryFilter, setPipelineTerritoryFilter,
    allReps, allTerritories, stages,
    getQuarter, getQuarterLabel, currentUser,
}) {
    // Local draft state — only applied on "Apply"
    const [draftPipeline,   setDraftPipeline]   = useState(activePipeline?.id || null);
    const [draftTimeWindow, setDraftTimeWindow] = useState(pipelineQuarterFilter[0] || 'thisQuarter');
    const [draftStage,      setDraftStage]      = useState(pipelineStageFilter[0]   || '__allOpen__');
    const [draftRep,        setDraftRep]        = useState(pipelineRepFilter[0]     || '__me__');
    const [draftTerritory,  setDraftTerritory]  = useState(pipelineTerritoryFilter[0] || '__all__');

    // Sync when panel opens
    useEffect(() => {
        if (open) {
            setDraftPipeline(activePipeline?.id || null);
            setDraftTimeWindow(pipelineQuarterFilter[0] || 'thisQuarter');
            setDraftStage(pipelineStageFilter[0] || '__allOpen__');
            setDraftRep(pipelineRepFilter[0] || '__me__');
            setDraftTerritory(pipelineTerritoryFilter[0] || '__all__');
        }
    }, [open]);

    const today = new Date();
    const currentQ = getQuarter(today.toISOString().split('T')[0]);
    const currentQL = getQuarterLabel(currentQ, today.toISOString().split('T')[0]);
    const qNum = parseInt(currentQ.replace('Q', ''));
    const nextQNum = qNum < 4 ? qNum + 1 : 1;
    const nextQDate = new Date(today); nextQDate.setMonth(today.getMonth() + 3);
    const nextQL = getQuarterLabel('Q' + nextQNum, nextQDate.toISOString().split('T')[0]);

    const timeWindows = [
        { key: 'thisQuarter',  label: 'This quarter',  match: o => o.closeQuarter === currentQL },
        { key: 'nextQuarter',  label: 'Next quarter',  match: o => o.closeQuarter === nextQL },
        { key: 'thisAndNext',  label: 'This + next',   match: o => o.closeQuarter === currentQL || o.closeQuarter === nextQL },
        { key: 'annual',       label: 'This year',     match: o => { const fy = currentQL.split(' ')[0]; return o.closeQuarter && o.closeQuarter.startsWith(fy); }},
        { key: 'allTime',      label: 'All time',      match: () => true },
    ];

    const handleApply = () => {
        // Pipeline
        if (draftPipeline && setActivePipelineId) {
            setActivePipelineId(draftPipeline);
        }
        // Time window → quarter filter
        if (draftTimeWindow === 'allTime' || draftTimeWindow === 'thisQuarter') {
            setPipelineQuarterFilter([]);
        } else {
            setPipelineQuarterFilter([draftTimeWindow]);
        }
        // Stage
        if (draftStage === '__allOpen__') {
            setPipelineStageFilter([]);
        } else {
            setPipelineStageFilter([draftStage]);
        }
        // Rep
        if (draftRep === '__me__') {
            setPipelineRepFilter([currentUser]);
        } else if (draftRep === '__all__') {
            setPipelineRepFilter([]);
        } else {
            setPipelineRepFilter([draftRep]);
        }
        // Territory
        if (draftTerritory === '__all__') {
            setPipelineTerritoryFilter([]);
        } else {
            setPipelineTerritoryFilter([draftTerritory]);
        }
        onApply();
        onClose();
    };

    const handleReset = () => {
        setDraftTimeWindow('thisQuarter');
        setDraftStage('__allOpen__');
        setDraftRep('__me__');
        setDraftTerritory('__all__');
    };

    if (!open) return null;

    const selStyle = {
        width: '100%', padding: '8px 10px',
        border: `1px solid ${T.border}`, borderRadius: T.rSm,
        background: T.surface, color: T.ink,
        fontSize: 13, fontFamily: T.sans,
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
        paddingRight: 30, cursor: 'pointer', outline: 'none',
    };

    const fieldLabel = { fontSize: 11, fontWeight: 600, color: T.inkMid, marginBottom: 5, display: 'block', fontFamily: T.sans };

    return (
        <>
            {/* Backdrop */}
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />
            {/* Panel */}
            <div style={{
                position: 'fixed', top: 60, right: 16, zIndex: 201,
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: T.rMd, boxShadow: '0 8px 32px rgba(42,38,34,0.18)',
                width: 300, padding: '20px 20px 16px',
                fontFamily: T.sans,
            }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: T.inkMuted, marginBottom: 16 }}>
                    Filters
                </div>

                {/* Pipeline */}
                {allPipelines?.length > 1 && (
                    <div style={{ marginBottom: 14 }}>
                        <label style={fieldLabel}>Pipeline</label>
                        <select value={draftPipeline || ''} onChange={e => setDraftPipeline(e.target.value)} style={selStyle}>
                            {allPipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                    </div>
                )}
                {/* Time window */}
                <div style={{ marginBottom: 14 }}>
                    <label style={fieldLabel}>Time window</label>
                    <select value={draftTimeWindow} onChange={e => setDraftTimeWindow(e.target.value)} style={selStyle}>
                        {timeWindows.map(tw => <option key={tw.key} value={tw.key}>{tw.label}</option>)}
                    </select>
                </div>
                {/* Stage */}
                <div style={{ marginBottom: 14 }}>
                    <label style={fieldLabel}>Stage</label>
                    <select value={draftStage} onChange={e => setDraftStage(e.target.value)} style={selStyle}>
                        <option value="__allOpen__">All open stages</option>
                        {stages.filter(s => s !== 'Closed Won' && s !== 'Closed Lost').map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                        <option value="Closed Won">Closed Won</option>
                        <option value="Closed Lost">Closed Lost</option>
                    </select>
                </div>
                {/* Rep */}
                <div style={{ marginBottom: 14 }}>
                    <label style={fieldLabel}>Rep</label>
                    <select value={draftRep} onChange={e => setDraftRep(e.target.value)} style={selStyle}>
                        <option value="__me__">Me</option>
                        <option value="__all__">All reps</option>
                        {allReps.filter(r => r !== currentUser).map(r => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>
                </div>
                {/* Territory */}
                {allTerritories.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                        <label style={fieldLabel}>Territory</label>
                        <select value={draftTerritory} onChange={e => setDraftTerritory(e.target.value)} style={selStyle}>
                            <option value="__all__">All territories</option>
                            {allTerritories.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                )}

                {/* Footer buttons */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', paddingTop: 4, borderTop: `1px solid ${T.border}`, marginTop: 4 }}>
                    <button onClick={handleReset} style={{
                        padding: '7px 16px', background: 'transparent',
                        border: `1px solid ${T.border}`, borderRadius: T.rSm,
                        color: T.inkMid, fontSize: 13, fontWeight: 500,
                        cursor: 'pointer', fontFamily: T.sans,
                    }}>Reset</button>
                    <button onClick={handleApply} style={{
                        padding: '7px 20px', background: T.ink,
                        border: 'none', borderRadius: T.rSm,
                        color: T.surface, fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', fontFamily: T.sans,
                    }}>Apply</button>
                </div>
            </div>
        </>
    );
}

// ── Save View Name Dialog ─────────────────────────────────────
function SaveViewDialog({ open, onSave, onClose }) {
    const [name, setName] = useState('');
    useEffect(() => { if (open) setName(''); }, [open]);
    if (!open) return null;
    return (
        <>
            <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(42,38,34,0.3)' }} />
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                zIndex: 301, background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: T.rMd, boxShadow: '0 16px 48px rgba(42,38,34,0.2)',
                padding: '20px 24px', width: 320, fontFamily: T.sans,
            }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 12 }}>Save current view</div>
                <input
                    autoFocus
                    value={name}
                    onChange={e => setName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { onSave(name.trim()); } if (e.key === 'Escape') onClose(); }}
                    placeholder="View name…"
                    style={{
                        width: '100%', padding: '7px 10px', border: `1px solid ${T.border}`,
                        borderRadius: T.rSm, fontSize: 13, fontFamily: T.sans,
                        background: T.bg, color: T.ink, outline: 'none',
                        boxSizing: 'border-box', marginBottom: 14,
                    }}
                />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: T.rSm, color: T.inkMid, fontSize: 12, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
                    <button onClick={() => name.trim() && onSave(name.trim())} disabled={!name.trim()} style={{ padding: '6px 14px', background: T.ink, border: 'none', borderRadius: T.rSm, color: T.surface, fontSize: 12, fontWeight: 600, cursor: name.trim() ? 'pointer' : 'not-allowed', fontFamily: T.sans, opacity: name.trim() ? 1 : 0.5 }}>Save</button>
                </div>
            </div>
        </>
    );
}

// ── Main PipelineTab ──────────────────────────────────────────
export default function PipelineTab() {
    const {
        opportunities, setOpportunities,
        accounts, contacts, activities, settings,
        currentUser, userRole, canSeeAll,
        stages, exportToCSV, exportingCSV,
        showConfirm, softDelete, addAudit,
        getStageColor, getQuarter, getQuarterLabel,
        calculateDealHealth, canViewField,
        visibleOpportunities, getKpiColor,
        setUndoToast, activePipeline, allPipelines,
        handleDelete, handleSave, completeLostSave,
        viewingRep, viewingTeam, viewingTerritory,
        setEditingOpp, setShowModal,
        setActivityInitialContext, setEditingActivity, setShowActivityModal,
        setSpiffClaimContext, setShowSpiffClaimModal,
        setLostReasonModal, setCsvImportType, setShowCsvImportModal,
        setActivePipelineId, isMobile,
    } = useApp();

    const isAdmin    = userRole === 'Admin';
    const isManager  = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit    = !isReadOnly;

    const handleAddNew = () => { setEditingOpp(null); setShowModal(true); };
    const handleEdit   = (opp) => { setEditingOpp(opp); setShowModal(true); };

    // ── View state — default to 'table' (List) ──────────────
    const [pipelineView, setPipelineView] = useState(
        () => { const v = localStorage.getItem('pipelineView'); return ['table','funnel','kanban','forecast'].includes(v) ? v : 'table'; }
    );
    useEffect(() => { localStorage.setItem('pipelineView', pipelineView); }, [pipelineView]);

    const [funnelExpandedStage, setFunnelExpandedStage] = useState(null);
    const [kanbanDragging, setKanbanDragging]   = useState(null);
    const [kanbanDragOver, setKanbanDragOver]   = useState(null);
    const [selectedOpps, setSelectedOpps]       = useState([]);
    const [selectMode, setSelectMode]            = useState(false);
    const [pipelineSortField, setPipelineSortField] = useState('forecastedCloseDate');
    const [pipelineSortDir,   setPipelineSortDir]   = useState('asc');
    const [bulkScoring, setBulkScoring]         = useState(false);
    const [bulkScoreProgress, setBulkScoreProgress] = useState(null);

    // ── Filter state ─────────────────────────────────────────
    const [filterOpen, setFilterOpen]                     = useState(false);
    const [pipelineQuarterFilter, setPipelineQuarterFilter] = useState([]);
    const [pipelineStageFilter,   setPipelineStageFilter]   = useState([]);
    const [pipelineRepFilter,     setPipelineRepFilter]     = useState([]);
    const [pipelineTeamFilter,    setPipelineTeamFilter]    = useState([]);
    const [pipelineTerritoryFilter, setPipelineTerritoryFilter] = useState([]);

    const activeFilterCount = pipelineQuarterFilter.length + pipelineStageFilter.length +
        pipelineRepFilter.length + pipelineTeamFilter.length + pipelineTerritoryFilter.length;

    // ── Saved views — persisted in localStorage ───────────────
    const [savedViews, setSavedViews] = useState(() => {
        try {
            const raw = localStorage.getItem('pipelineSavedViews');
            return raw ? JSON.parse(raw) : [];
        } catch { return []; }
    });
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);

    const persistSavedViews = (views) => {
        setSavedViews(views);
        localStorage.setItem('pipelineSavedViews', JSON.stringify(views));
    };

    const saveCurrentView = (name) => {
        const newView = {
            id:        Date.now().toString(),
            name,
            preset:    smartPreset,
            quarter:   pipelineQuarterFilter,
            stage:     pipelineStageFilter,
            rep:       pipelineRepFilter,
            territory: pipelineTerritoryFilter,
        };
        persistSavedViews([...savedViews, newView]);
        setSaveDialogOpen(false);
    };

    const deleteSavedView = (id) => {
        persistSavedViews(savedViews.filter(v => v.id !== id));
    };

    const applySavedView = (view) => {
        setSmartPreset(view.preset || null);
        setPipelineQuarterFilter(view.quarter   || []);
        setPipelineStageFilter(view.stage       || []);
        setPipelineRepFilter(view.rep           || []);
        setPipelineTerritoryFilter(view.territory || []);
    };

    // ── Smart presets ─────────────────────────────────────────
    const [smartPreset, setSmartPreset] = useState(null);

    const stalledOpps = visibleOpportunities.filter(o =>
        !['Closed Won','Closed Lost'].includes(o.stage) && o.stageChangedDate &&
        (Date.now() - new Date(o.stageChangedDate + 'T12:00:00').getTime()) / 86400000 > 14
    );
    const closingThisWeek = visibleOpportunities.filter(o => {
        if (['Closed Won','Closed Lost'].includes(o.stage) || !o.forecastedCloseDate) return false;
        const d = Math.round((new Date(o.forecastedCloseDate + 'T12:00:00') - new Date()) / 86400000);
        return d >= -14 && d <= 7;
    });
    const commitOpps = visibleOpportunities.filter(o =>
        ['Negotiation','Negotiation/Review','Contracts','Closing'].includes(o.stage)
    );
    const recentlyTouched = visibleOpportunities.filter(o => {
        if (!o.stageChangedDate) return false;
        return Math.round((Date.now() - new Date(o.stageChangedDate + 'T12:00:00').getTime()) / 86400000) <= 7;
    });

    // ── Filter options (built once, stored on window for compat) ──
    const todayDate  = new Date();
    const currentQ2  = getQuarter(todayDate.toISOString().split('T')[0]);
    const currentQL2 = getQuarterLabel(currentQ2, todayDate.toISOString().split('T')[0]);
    const qNum2      = parseInt(currentQ2.replace('Q', ''));
    const nextQ2     = 'Q' + (qNum2 < 4 ? qNum2 + 1 : 1);
    const nextMonth2 = new Date(todayDate); nextMonth2.setMonth(todayDate.getMonth() + 3);
    const nextQL2    = getQuarterLabel(nextQ2, nextMonth2.toISOString().split('T')[0]);
    const timeFilterOpts = [
        { key: 'thisQuarter', label: 'This quarter', match: o => o.closeQuarter === currentQL2 },
        { key: 'nextQuarter', label: 'Next quarter', match: o => o.closeQuarter === nextQL2 },
        { key: 'thisAndNext', label: 'This + next',  match: o => o.closeQuarter === currentQL2 || o.closeQuarter === nextQL2 },
        { key: 'annual',      label: 'This year',    match: o => { const fy = currentQL2.split(' ')[0]; return o.closeQuarter && o.closeQuarter.startsWith(fy); }},
        { key: 'allTime',     label: 'All time',     match: () => true },
    ];
    window.__pipelineFilterOptions = timeFilterOpts;

    const excludedRoles = new Set(['Admin', 'Manager']);
    const allReps2 = canSeeAll ? [...new Set([
        ...(settings.users||[]).filter(u => u.name && !excludedRoles.has(u.userType)).map(u => u.name),
        ...visibleOpportunities.filter(o => o.salesRep).map(o => o.salesRep),
    ])].sort() : [];
    const allTerritories2 = canSeeAll ? [...new Set((settings.users||[]).filter(u => u.territory).map(u => u.territory))].sort() : [];

    // ── Filtered opps ─────────────────────────────────────────
    const pipelineFilteredOpps = visibleOpportunities
        .filter(opp => {
            if (pipelineQuarterFilter.length === 0) return true;
            return pipelineQuarterFilter.some(key => {
                const opt = timeFilterOpts.find(o => o.key === key);
                return opt && opt.match(opp);
            });
        })
        .filter(opp => {
            if (pipelineStageFilter.length === 0) return true;
            if (pipelineStageFilter.includes('__allOpen__')) return opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost';
            return pipelineStageFilter.includes(opp.stage);
        })
        .filter(opp => pipelineRepFilter.length === 0 || pipelineRepFilter.includes(opp.salesRep) || pipelineRepFilter.includes(opp.assignedTo))
        .filter(opp => {
            if (pipelineTeamFilter.length === 0) return true;
            const u = (settings.users||[]).find(u => u.name === (opp.salesRep || opp.assignedTo));
            return u && pipelineTeamFilter.includes(u.team);
        })
        .filter(opp => {
            if (pipelineTerritoryFilter.length === 0) return true;
            const u = (settings.users||[]).find(u => u.name === (opp.salesRep || opp.assignedTo));
            return u && pipelineTerritoryFilter.includes(u.territory);
        });

    const smartFilteredOpps = React.useMemo(() => {
        if (smartPreset === 'stalled')  return pipelineFilteredOpps.filter(o => stalledOpps.some(s => s.id === o.id));
        if (smartPreset === 'closing')  return pipelineFilteredOpps.filter(o => closingThisWeek.some(s => s.id === o.id));
        if (smartPreset === 'commit')   return pipelineFilteredOpps.filter(o => commitOpps.some(s => s.id === o.id));
        if (smartPreset === 'recent')   return pipelineFilteredOpps.filter(o => recentlyTouched.some(s => s.id === o.id));
        return pipelineFilteredOpps;
    }, [pipelineFilteredOpps, smartPreset]);

    const pipelineTotalARR  = pipelineFilteredOpps.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
    const commitARR = pipelineFilteredOpps.filter(o => ['Negotiation','Negotiation/Review','Contracts','Closing'].includes(o.stage)).reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
    const fmtA = n => n >= 1e6 ? '$' + (n/1e6).toFixed(1) + 'M' : '$' + Math.round(n/1000) + 'K';

    // ── Bulk AI score ─────────────────────────────────────────
    useEffect(() => {
        const handler = () => handleBulkScore();
        document.addEventListener('accelerep:bulkScore', handler);
        return () => document.removeEventListener('accelerep:bulkScore', handler);
    }, []);

    const handleBulkScore = async () => {
        if (bulkScoring) return;
        const active = visibleOpportunities.filter(o => !['Closed Won','Closed Lost'].includes(o.stage));
        if (!active.length) return;
        setBulkScoring(true);
        setBulkScoreProgress({ done: 0, total: active.length });
        let scored = 0;
        for (const opp of active) {
            try {
                const res  = await dbFetch('/.netlify/functions/ai-score', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ opportunityId: opp.id, forceRefresh: false }) });
                const data = await res.json();
                if (!data.disabled && data.score !== undefined) {
                    setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, aiScore: data } : o));
                }
            } catch (err) { console.warn('Bulk score failed for', opp.id, err.message); }
            scored++;
            setBulkScoreProgress({ done: scored, total: active.length });
        }
        setBulkScoring(false);
        setBulkScoreProgress(null);
    };

    // ── View definitions: List, Funnel, Kanban, Forecast (no Map) ──
    // Icons match the screenshots exactly — list/rows, funnel shape, kanban columns, forecast target
    const ViewIcon = ({ name, active }) => {
        const c = active ? T.ink : T.inkMuted;
        const p = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: c, strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round' };
        switch (name) {
            case 'list':     return <svg {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
            case 'funnel':   return <svg {...p}><path d="M4 4h16l-6.5 8v6l-3-1.5V12L4 4z"/></svg>;
            case 'kanban':   return <svg {...p}><rect x="3" y="3" width="5" height="18" rx="1"/><rect x="10" y="3" width="5" height="12" rx="1"/><rect x="17" y="3" width="4" height="15" rx="1"/></svg>;
            case 'forecast': return <svg {...p}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><line x1="12" y1="3" x2="12" y2="1"/></svg>;
            default: return null;
        }
    };
    const views = [
        { id: 'table',    label: 'List',     icon: <ViewIcon name="list"     active={pipelineView === 'table'}    /> },
        { id: 'funnel',   label: 'Funnel',   icon: <ViewIcon name="funnel"   active={pipelineView === 'funnel'}   /> },
        { id: 'kanban',   label: 'Kanban',   icon: <ViewIcon name="kanban"   active={pipelineView === 'kanban'}   /> },
        { id: 'forecast', label: 'Forecast', icon: <ViewIcon name="forecast" active={pipelineView === 'forecast'} /> },
    ];

    // ── Chip button helper ────────────────────────────────────
    const Chip = ({ label, active, count, onClick, onDelete }) => (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
            <button onClick={onClick} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', paddingRight: onDelete ? 7 : 10,
                border: `1px solid ${active ? T.ink : T.border}`,
                borderRight: onDelete ? 'none' : undefined,
                borderRadius: onDelete ? `${T.rSm}px 0 0 ${T.rSm}px` : T.rSm,
                background: active ? T.ink : 'transparent',
                color: active ? T.surface : T.ink,
                fontSize: 12, fontWeight: active ? 600 : 400,
                cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms',
                whiteSpace: 'nowrap',
            }}>
                {label}
                {count != null && count > 0 && (
                    <span style={{
                        fontSize: 11, fontWeight: 500,
                        color: active ? 'rgba(255,255,255,0.75)' : T.inkMuted,
                        marginLeft: 1,
                    }}>{count}</span>
                )}
            </button>
            {onDelete && (
                <button onClick={onDelete} style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, padding: '5px 0',
                    border: `1px solid ${active ? T.ink : T.border}`,
                    borderLeft: `1px solid ${active ? 'rgba(255,255,255,0.2)' : T.border}`,
                    borderRadius: `0 ${T.rSm}px ${T.rSm}px 0`,
                    background: active ? T.ink : 'transparent',
                    color: active ? 'rgba(255,255,255,0.55)' : T.inkMuted,
                    fontSize: 9, cursor: 'pointer', fontFamily: T.sans, lineHeight: 1,
                }}>✕</button>
            )}
        </div>
    );

    return (
        <div className="tab-page" style={{ fontFamily: T.sans }} onClick={() => filterOpen && false}>

            {/* ── Page header ──────────────────────────────────── */}
            <div style={{ padding: '0 0 12px', display: 'flex', alignItems: 'flex-end', gap: 24 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 28, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 5 }}>
                        Pipeline.
                    </div>
                    <div style={{ fontSize: 12, color: T.inkMuted, lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 600, color: T.ink }}>
                            {pipelineFilteredOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').length}
                        </span> open deals
                        <span style={{ margin: '0 7px', color: T.border }}>·</span>
                        <span style={{ fontWeight: 600, color: T.ink }}>{fmtA(pipelineTotalARR)}</span> total pipeline
                        {commitARR > 0 && <>
                            <span style={{ margin: '0 7px', color: T.border }}>·</span>
                            <span style={{ fontWeight: 600, color: T.ink }}>{fmtA(commitARR)}</span>
                            <span style={{ color: T.inkMuted }}> commit</span>
                        </>}
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                    {/* Filter button */}
                    <button
                        onClick={() => setFilterOpen(o => !o)}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '6px 11px',
                            background: activeFilterCount > 0 ? T.ink : 'transparent',
                            border: `1px solid ${activeFilterCount > 0 ? T.ink : T.border}`,
                            color: activeFilterCount > 0 ? T.surface : T.ink,
                            fontSize: 12, fontWeight: 500, borderRadius: T.rSm,
                            cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap',
                            transition: 'all 120ms',
                        }}
                        onMouseEnter={e => { if (!activeFilterCount) e.currentTarget.style.background = T.surface2; }}
                        onMouseLeave={e => { if (!activeFilterCount) e.currentTarget.style.background = 'transparent'; }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 5h16l-6 8v6l-4-2v-4L4 5z"/>
                        </svg>
                        Filter{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
                    </button>
                    {/* Select mode + delete */}
                    {canEdit && selectMode && selectedOpps.length > 0 && (
                        <button
                            onClick={() => {
                                showConfirm(`Delete ${selectedOpps.length} deal${selectedOpps.length > 1 ? 's' : ''}? This cannot be undone.`, async () => {
                                    const toDelete = [...selectedOpps];
                                    for (const id of toDelete) {
                                        const opp = opportunities.find(o => o.id === id);
                                        if (opp) await handleDelete(opp).catch(console.error);
                                    }
                                    setSelectedOpps([]);
                                    setSelectMode(false);
                                });
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: T.danger, border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, borderRadius: T.rSm, cursor: 'pointer', fontFamily: T.sans }}>
                            Delete ({selectedOpps.length})
                        </button>
                    )}
                    {canEdit && (
                        <button
                            onClick={() => { setSelectMode(m => !m); setSelectedOpps([]); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', background: selectMode ? T.surface2 : 'transparent', border: `1px solid ${selectMode ? T.borderStrong : T.border}`, color: T.inkMid, fontSize: 12, fontWeight: selectMode ? 600 : 400, borderRadius: T.rSm, cursor: 'pointer', fontFamily: T.sans }}>
                            {selectMode ? 'Cancel' : 'Select'}
                        </button>
                    )}
                    {!isReadOnly && (
                        <button onClick={handleAddNew} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '6px 12px', background: T.ink, border: 'none',
                            color: T.surface, fontSize: 12, fontWeight: 600,
                            borderRadius: T.rSm, cursor: 'pointer', fontFamily: T.sans,
                        }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                            New deal
                        </button>
                    )}

                    {/* Filter panel */}
                    <FilterPanel
                        open={filterOpen}
                        onClose={() => setFilterOpen(false)}
                        onApply={() => {}}
                        allPipelines={allPipelines}
                        activePipeline={activePipeline}
                        setActivePipelineId={setActivePipelineId}
                        pipelineQuarterFilter={pipelineQuarterFilter}
                        setPipelineQuarterFilter={setPipelineQuarterFilter}
                        pipelineStageFilter={pipelineStageFilter}
                        setPipelineStageFilter={setPipelineStageFilter}
                        pipelineRepFilter={pipelineRepFilter}
                        setPipelineRepFilter={setPipelineRepFilter}
                        pipelineTerritoryFilter={pipelineTerritoryFilter}
                        setPipelineTerritoryFilter={setPipelineTerritoryFilter}
                        allReps={allReps2}
                        allTerritories={allTerritories2}
                        stages={stages}
                        getQuarter={getQuarter}
                        getQuarterLabel={getQuarterLabel}
                        currentUser={currentUser}
                    />
                </div>
            </div>

            {/* ── Smart views + saved views row ────────────────── */}
            <div style={{ padding: '0 0 8px', display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                {/* SMART VIEWS label */}
                <span style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans, marginRight: 3 }}>Smart views</span>

                <Chip label="All open"         active={smartPreset === null}      onClick={() => setSmartPreset(null)} />
                <Chip label="Closing this week" active={smartPreset === 'closing'} count={closingThisWeek.length} onClick={() => setSmartPreset(smartPreset === 'closing' ? null : 'closing')} />
                <Chip label="Stalled"          active={smartPreset === 'stalled'} count={stalledOpps.length}     onClick={() => setSmartPreset(smartPreset === 'stalled' ? null : 'stalled')} />
                <Chip label="My commit"        active={smartPreset === 'commit'}  onClick={() => setSmartPreset(smartPreset === 'commit' ? null : 'commit')} />
                <Chip label="Recently touched" active={smartPreset === 'recent'}  onClick={() => setSmartPreset(smartPreset === 'recent' ? null : 'recent')} />

                {/* Divider */}
                <div style={{ width: 1, height: 20, background: T.border, margin: '0 5px' }} />

                {/* SAVED label */}
                <span style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans, marginRight: 3 }}>Saved</span>

                {savedViews.map(v => (
                    <Chip
                        key={v.id}
                        label={v.name}
                        active={false}
                        onClick={() => applySavedView(v)}
                        onDelete={(e) => { e?.stopPropagation(); deleteSavedView(v.id); }}
                    />
                ))}

                {/* + Save current */}
                <button
                    onClick={() => setSaveDialogOpen(true)}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '5px 10px', background: 'transparent',
                        border: `1px solid ${T.border}`, color: T.inkMid,
                        fontSize: 12, fontWeight: 500, borderRadius: T.rSm,
                        cursor: 'pointer', fontFamily: T.sans,
                        transition: 'all 120ms',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.surface2; e.currentTarget.style.color = T.ink; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.inkMid; }}>
                    + Save current
                </button>
            </div>

            {/* ── View switcher row — underline sub-tabs per style guide ── */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.border}`, marginBottom: 2 }}>
                {views.map(v => {
                    const active = pipelineView === v.id;
                    return (
                        <button key={v.id}
                            onClick={() => { setPipelineView(v.id); setFunnelExpandedStage(null); }}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '8px 16px',
                                border: 'none',
                                borderBottom: active ? `2px solid ${T.ink}` : '2px solid transparent',
                                background: 'transparent',
                                color: active ? T.ink : T.inkMuted,
                                fontSize: 12, fontWeight: active ? 600 : 400,
                                cursor: 'pointer', fontFamily: T.sans,
                                transition: 'color 120ms, border-color 120ms',
                                whiteSpace: 'nowrap', marginBottom: -1,
                            }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.color = T.inkMid; }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.color = T.inkMuted; }}>
                            {v.icon}
                            {v.label}
                        </button>
                    );
                })}
                <div style={{ flex: 1 }} />
                <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans, paddingBottom: 4 }}>
                    {pipelineView === 'kanban'
                        ? 'Sorted by urgency · last action'
                        : `Showing ${smartFilteredOpps.length} of ${pipelineFilteredOpps.length}`}
                </div>
            </div>

            {/* ── Mobile card list ──────────────────────────────── */}
            <div className="spt-pipeline-mobile" style={{ padding: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: T.inkMid, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{pipelineFilteredOpps.length} deal{pipelineFilteredOpps.length !== 1 ? 's' : ''}</span>
                    <button onClick={handleAddNew} style={{ padding: '0.45rem 0.875rem', background: T.ink, color: T.surface, border: 'none', borderRadius: T.rSm, fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: T.sans }}>+ New Deal</button>
                </div>
                {pipelineFilteredOpps.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem 1rem', color: T.inkMuted, fontSize: '0.875rem' }}>No deals match the current filter.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                        {pipelineFilteredOpps.map(opp => {
                            const health = calculateDealHealth(opp);
                            const healthColor = health.score >= 70 ? T.ok : health.score >= 40 ? T.warn : T.danger;
                            const sc = getStageColor(opp.stage);
                            return (
                                <div key={opp.id} className="mobile-record-card" onClick={() => { setEditingOpp(opp); setShowModal(true); }}>
                                    <div className="mobile-card-top">
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div className="mobile-card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opp.opportunityName || opp.account || 'Unnamed'}</div>
                                            <div className="mobile-card-sub">{opp.account}{opp.site ? ' · ' + opp.site : ''}{opp.salesRep ? ` · ${opp.salesRep}` : ''}</div>
                                        </div>
                                        {canViewField('arr') && <div className="mobile-card-arr">${((parseFloat(opp.arr)||0)/1000).toFixed(0)}K</div>}
                                    </div>
                                    <div className="mobile-card-meta">
                                        <span style={{ background: sc.text + '22', color: sc.text, padding: '0.125rem 0.5rem', borderRadius: '999px', fontSize: '0.6875rem', fontWeight: '700' }}>{opp.stage}</span>
                                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: healthColor, display: 'inline-block' }} />
                                        <span className="mobile-card-meta-item" style={{ color: healthColor, fontWeight: '600' }}>{health.status}</span>
                                        {opp.forecastedCloseDate && <span className="mobile-card-meta-item">📅 {new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Desktop views ─────────────────────────────────── */}
            <div className="spt-pipeline-desktop">

                {/* AI bulk score */}
                {settings?.aiScoringEnabled && (
                    <div style={{ padding: '0 0 8px' }}>
                        <button onClick={handleBulkScore} disabled={bulkScoring}
                            style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: T.rSm, background: bulkScoring ? T.surface2 : T.surface, color: T.inkMid, fontSize: '0.75rem', fontWeight: '600', cursor: bulkScoring ? 'not-allowed' : 'pointer', fontFamily: T.sans, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            {bulkScoring ? (
                                <><span style={{ width: 10, height: 10, border: `2px solid ${T.border}`, borderTopColor: T.inkMid, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Scoring {bulkScoreProgress?.done}/{bulkScoreProgress?.total}…</>
                            ) : '🤖 Score all deals'}
                        </button>
                    </div>
                )}

                {/* ── LIST VIEW ──────────────────────────────────── */}
                {pipelineView === 'table' && (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, overflow: 'auto', fontFamily: T.sans }}>
                        {/* Header */}
                        {/* Select-all header row */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: selectMode ? '36px 1.6fr 1fr 100px 90px 90px 60px 70px 55px 24px' : '28px 1.6fr 1fr 100px 90px 90px 60px 70px 55px 24px',
                            alignItems: 'center', padding: '0 14px', height: 36,
                            background: T.surface2, borderBottom: `1px solid ${T.border}`,
                            fontSize: 10, fontWeight: 700, color: T.inkMuted,
                            letterSpacing: 0.6, textTransform: 'uppercase',
                            position: 'sticky', top: 0, zIndex: 1,
                        }}>
                            {selectMode ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    onClick={() => setSelectedOpps(prev => prev.length === smartFilteredOpps.length ? [] : smartFilteredOpps.map(o => o.id))}>
                                    <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${selectedOpps.length === smartFilteredOpps.length && smartFilteredOpps.length > 0 ? T.ink : T.borderStrong}`, background: selectedOpps.length === smartFilteredOpps.length && smartFilteredOpps.length > 0 ? T.ink : 'transparent', cursor: 'pointer' }} />
                                </div>
                            ) : <div/>}
                            <div>Deal</div><div>Account</div><div>Stage</div>
                            <div style={{ textAlign: 'right' }}>ARR</div>
                            <div>Close</div><div>AI</div><div>Health</div><div>Days</div><div/>
                        </div>
                        {/* Rows */}
                        {smartFilteredOpps
                            .sort((a, b) => {
                                const dir = pipelineSortDir === 'asc' ? 1 : -1;
                                switch (pipelineSortField) {
                                    case 'salesRep': return dir * (a.salesRep||'').localeCompare(b.salesRep||'');
                                    case 'account':  return dir * (a.account||'').localeCompare(b.account||'');
                                    case 'arr':      return dir * ((parseFloat(a.arr)||0) - (parseFloat(b.arr)||0));
                                    default:         return dir * (new Date(a.forecastedCloseDate||'9999') - new Date(b.forecastedCloseDate||'9999'));
                                }
                            })
                            .map(opp => {
                                const health      = calculateDealHealth(opp);
                                const daysInStage = opp.stageChangedDate ? Math.max(0, Math.floor((new Date() - new Date(opp.stageChangedDate + 'T12:00:00')) / 86400000)) : null;
                                const stale       = daysInStage !== null && daysInStage > 14;
                                const closeDays   = opp.forecastedCloseDate ? Math.round((new Date(opp.forecastedCloseDate + 'T12:00:00') - new Date()) / 86400000) : null;
                                const overdue     = closeDays !== null && closeDays < 0;
                                const aiRisk      = opp.aiScore && opp.aiScore.score < 50;
                                return (
                                    <div key={opp.id}
                                        onClick={() => selectMode ? setSelectedOpps(prev => prev.includes(opp.id) ? prev.filter(x => x !== opp.id) : [...prev, opp.id]) : (setEditingOpp(opp), setShowModal(true))}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: selectMode ? '36px 1.6fr 1fr 100px 90px 90px 60px 70px 55px 24px' : '28px 1.6fr 1fr 100px 90px 90px 60px 70px 55px 24px',
                                            alignItems: 'center', padding: '0 14px', height: 42,
                                            borderBottom: `1px solid ${T.border}`,
                                            background: selectedOpps.includes(opp.id) ? 'rgba(42,38,34,0.04)' : 'transparent',
                                            fontSize: 12, color: T.ink, cursor: 'pointer', transition: 'background 100ms',
                                        }}
                                        onMouseEnter={e => { if (!selectedOpps.includes(opp.id)) e.currentTarget.style.background = T.surface2; }}
                                        onMouseLeave={e => { if (!selectedOpps.includes(opp.id)) e.currentTarget.style.background = selectedOpps.includes(opp.id) ? 'rgba(42,38,34,0.04)' : 'transparent'; }}>
                                        {/* Checkbox — only in select mode */}
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            onClick={e => { e.stopPropagation(); setSelectedOpps(prev => prev.includes(opp.id) ? prev.filter(x => x !== opp.id) : [...prev, opp.id]); }}>
                                            {selectMode && (
                                                <div style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${selectedOpps.includes(opp.id) ? T.ink : T.borderStrong}`, background: selectedOpps.includes(opp.id) ? T.ink : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 120ms' }}>
                                                    {selectedOpps.includes(opp.id) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.surface} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>}
                                                </div>
                                            )}
                                        </div>
                                        {/* Deal */}
                                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{opp.opportunityName || opp.account}</div>
                                        {/* Account */}
                                        <div style={{ color: T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>{opp.account}</div>
                                        {/* Stage */}
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rSm, fontSize: 11, fontWeight: 500, width: 'fit-content' }}>
                                            <div style={{ width: 6, height: 6, borderRadius: 1, background: stageColor(opp.stage) }}/>{opp.stage}
                                        </div>
                                        {/* ARR */}
                                        <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: T.ink }}>
                                            ${(parseFloat(opp.arr)||0) >= 1000 ? Math.round((parseFloat(opp.arr)||0)/1000) + 'K' : (parseFloat(opp.arr)||0).toLocaleString()}
                                        </div>
                                        {/* Close */}
                                        <div style={{ fontSize: 11, color: overdue ? T.danger : T.inkMid, fontWeight: overdue ? 600 : 400 }}>
                                            {opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                        </div>
                                        {/* AI */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            {opp.aiScore ? (
                                                <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={aiRisk ? T.danger : T.inkMid} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>
                                                <span style={{ fontSize: 11, color: aiRisk ? T.danger : T.inkMid }}>{opp.aiScore.score}</span></>
                                            ) : <span style={{ fontSize: 11, color: T.inkMuted }}>—</span>}
                                        </div>
                                        {/* Health */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: health.score >= 65 ? T.ok : health.score >= 45 ? T.warn : T.danger }}/>
                                            <span style={{ fontSize: 11, color: T.inkMid }}>{health.score}</span>
                                        </div>
                                        {/* Days */}
                                        <div style={{ fontSize: 11, color: stale ? T.danger : T.inkMuted, fontWeight: stale ? 600 : 400 }}>
                                            {daysInStage !== null ? daysInStage + 'd' : '—'}
                                        </div>
                                        {/* ⋯ */}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>
                                        </div>
                                    </div>
                                );
                            })}
                        {smartFilteredOpps.length === 0 && (
                            <div style={{ padding: '2rem', textAlign: 'center', color: T.inkMuted, fontSize: 13 }}>No deals match the current filter.</div>
                        )}
                    </div>
                )}

                {/* ── FUNNEL VIEW ──────────────────────────────────── */}
                {pipelineView === 'funnel' && (
                    <FunnelView
                        pipelineFilteredOpps={smartFilteredOpps}
                        funnelExpandedStage={funnelExpandedStage}
                        setFunnelExpandedStage={setFunnelExpandedStage}
                        handleEdit={handleEdit}
                        handleDelete={handleDelete}
                        selectMode={selectMode}
                        selectedOpps={selectedOpps}
                        setSelectedOpps={setSelectedOpps}
                    />
                )}

                {/* ── KANBAN VIEW ───────────────────────────────────── */}
                {pipelineView === 'kanban' && (
                    <KanbanView
                        pipelineFilteredOpps={smartFilteredOpps}
                        kanbanDragging={kanbanDragging}
                        kanbanDragOver={kanbanDragOver}
                        setKanbanDragging={setKanbanDragging}
                        setKanbanDragOver={setKanbanDragOver}
                        handleEdit={handleEdit}
                        selectedOpps={selectedOpps}
                        setSelectedOpps={setSelectedOpps}
                        selectMode={selectMode}
                    />
                )}

                {/* ── FORECAST VIEW ─────────────────────────────────── */}
                {pipelineView === 'forecast' && (() => {
                    const open         = smartFilteredOpps.filter(o => !['Closed Won','Closed Lost'].includes(o.stage));
                    const commitDeals  = open.filter(o => ['Negotiation','Negotiation/Review','Contracts','Closing'].includes(o.stage)).sort((a,b) => new Date(a.forecastedCloseDate||'9999') - new Date(b.forecastedCloseDate||'9999'));
                    const bestDeals    = open.filter(o => ['Proposal'].includes(o.stage)).sort((a,b) => new Date(a.forecastedCloseDate||'9999') - new Date(b.forecastedCloseDate||'9999'));
                    const pipeDeals    = open.filter(o => ['Prospecting','Qualification','Discovery','Evaluation (Demo)'].includes(o.stage)).sort((a,b) => new Date(a.forecastedCloseDate||'9999') - new Date(b.forecastedCloseDate||'9999'));
                    const sumARR = arr => arr.reduce((s,o) => s + (parseFloat(o.arr)||0), 0);

                    // Real "this week" stats
                    const weekStart    = new Date(); weekStart.setDate(weekStart.getDate() - weekStart.getDay()); weekStart.setHours(0,0,0,0);
                    const weekStartStr = weekStart.toISOString().split('T')[0];
                    const dealsAdvanced = visibleOpportunities.filter(o => o.stageChangedDate >= weekStartStr && !['Closed Won','Closed Lost'].includes(o.stage)).length;
                    const dealsSlipped  = visibleOpportunities.filter(o => {
                        if (!o.forecastedCloseDate) return false;
                        const prev = o.stageHistory?.find(h => h.date >= weekStartStr);
                        return prev && new Date(o.forecastedCloseDate) < new Date(prev.date);
                    }).length;

                    const ForecastCard = ({ opp }) => {
                        const closedays = opp.forecastedCloseDate ? Math.round((new Date(opp.forecastedCloseDate+'T12:00:00') - new Date()) / 86400000) : null;
                        const overdue   = closedays !== null && closedays < 0;
                        const health    = calculateDealHealth(opp);
                        const hColor    = health.score >= 65 ? T.ok : health.score >= 45 ? T.warn : T.danger;
                        const relDay    = d => { if (!d) return '—'; const diff = Math.round((new Date(d+'T12:00:00') - new Date()) / 86400000); if (diff === 0) return 'today'; if (diff < 0) return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); if (diff <= 14) return diff+'d'; return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); };
                        return (
                            <div onClick={() => { setEditingOpp(opp); setShowModal(true); }}
                                style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${stageColor(opp.stage)}`, borderRadius: T.rSm, padding: '9px 12px', minWidth: 200, maxWidth: 220, flexShrink: 0, cursor: 'pointer', transition: 'box-shadow 120ms', fontFamily: T.sans }}
                                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px -4px rgba(42,38,34,0.15)'}
                                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, marginBottom: 2, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{opp.account}</div>
                                <div style={{ fontSize: 10, color: T.inkMuted, marginBottom: 6, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{opp.opportunityName || ''}</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{fmtA(parseFloat(opp.arr)||0)}</div>
                                    <div style={{ fontSize: 10, color: overdue ? T.danger : T.inkMuted, fontWeight: overdue ? 600 : 400 }}>{relDay(opp.forecastedCloseDate)}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.border}`, fontSize: 10, color: T.inkMuted, alignItems: 'center' }}>
                                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: hColor }}/>
                                    {opp.aiScore && <><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>{opp.aiScore.score}</>}
                                    <span style={{ flex: 1 }}/><span style={{ color: T.inkMuted }}>{opp.stage}</span>
                                </div>
                            </div>
                        );
                    };

                    const ForecastLane = ({ label, subtitle, opps, total, accent }) => (
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                                    <div style={{ width: 4, height: 16, background: accent, borderRadius: 1, flexShrink: 0 }}/>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: -0.2, fontFamily: T.sans }}>{label}</div>
                                    <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{subtitle}</div>
                                </div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums', fontFamily: T.sans }}>{fmtA(total)}</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                                {opps.map(o => <ForecastCard key={o.id} opp={o}/>)}
                                {opps.length === 0 && <div style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic', padding: '20px 0', fontFamily: T.sans }}>— nothing here —</div>}
                            </div>
                        </div>
                    );

                    return (
                        <div style={{ paddingBottom: 20 }}>
                            {/* Forecast header */}
                            <div style={{ marginBottom: 14 }}>
                                <div style={{ fontFamily: T.serif, fontSize: 26, fontStyle: 'italic', fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 4 }}>Your quarter, at a glance.</div>
                                <div style={{ fontSize: 12, color: T.inkMuted }}>Three lanes: what's committed, what's likely, what's coming.</div>
                            </div>
                            {/* This week strip */}
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 20, fontSize: 12, fontFamily: T.sans, marginBottom: 20 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>This week</span>
                                {dealsAdvanced > 0 && <span><span style={{ color: T.ok, fontWeight: 700 }}>+{dealsAdvanced}</span> <span style={{ color: T.inkMid }}>deals advanced</span></span>}
                                {dealsAdvanced > 0 && <span style={{ color: T.border }}>·</span>}
                                {dealsSlipped > 0 && <><span><span style={{ color: T.danger, fontWeight: 700 }}>{dealsSlipped}</span> <span style={{ color: T.inkMid }}>slipped</span></span><span style={{ color: T.border }}>·</span></>}
                                <span><span style={{ color: T.ink, fontWeight: 700 }}>{fmtA(pipelineTotalARR)}</span> <span style={{ color: T.inkMid }}>total pipeline</span></span>
                                <div style={{ flex: 1 }}/>
                            </div>
                            <ForecastLane label="Commit"    subtitle={`${commitDeals.length} deal${commitDeals.length !== 1 ? 's' : ''} you're betting on`} opps={commitDeals} total={sumARR(commitDeals)} accent={T.ok}/>
                            <ForecastLane label="Best case" subtitle={`${bestDeals.length} in proposal stage`}                                               opps={bestDeals}   total={sumARR(bestDeals)}   accent={T.warn}/>
                            <ForecastLane label="Pipeline"  subtitle={`${pipeDeals.length} earlier stages`}                                                   opps={pipeDeals}   total={sumARR(pipeDeals)}   accent={T.info}/>
                        </div>
                    );
                })()}

            </div>{/* end spt-pipeline-desktop */}



            {/* Save view dialog */}
            <SaveViewDialog
                open={saveDialogOpen}
                onSave={saveCurrentView}
                onClose={() => setSaveDialogOpen(false)}
            />

        </div>
    );
}
