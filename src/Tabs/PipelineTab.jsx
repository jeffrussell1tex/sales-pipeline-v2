import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';
import { SliceDropdown } from '../components/ui/ViewingBar';
import KanbanView from '../components/KanbanView';
import FunnelView from '../components/FunnelView';

// ── Design tokens — exact match to Pipeline mockup TOKENS ────
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
    stages: {
        'Prospecting': '#b0a088', 'Qualification': '#c8a978', 'Discovery': '#b07a55',
        'Evaluation (Demo)': '#b07a55', 'Proposal': '#b87333',
        'Negotiation': '#7a5a3c', 'Negotiation/Review': '#7a5a3c',
        'Contracts': '#4d6b3d', 'Closing': '#4d6b3d',
        'Closed Won': '#3a5530', 'Closed Lost': '#9c3a2e',
    },
    sans:  '"Plus Jakarta Sans", system-ui, sans-serif',
    serif: '"Source Serif 4", Georgia, serif',
    rSm: 3, rMd: 4, rLg: 6,
};
const stageColor = (s) => T.stages[s] || T.inkMuted;

export default function PipelineTab() {
    const {
        opportunities, setOpportunities,
        accounts,
        contacts,
        activities,
        settings,
        currentUser,
        userRole,
        canSeeAll,
        isRepVisible,
        stages,
        exportToCSV,
        exportingCSV, setExportingCSV,
        showConfirm,
        softDelete,
        addAudit,
        getStageColor,
        getQuarter,
        getQuarterLabel,
        calculateDealHealth,
        canViewField,
        visibleOpportunities,
        getKpiColor,
        setUndoToast,
        activePipeline,
        allPipelines,
        handleDelete,
        handleSave,
        completeLostSave,
        viewingRep, viewingTeam, viewingTerritory,
        setEditingOpp, setShowModal,
        setActivityInitialContext, setEditingActivity, setShowActivityModal,
        setSpiffClaimContext, setShowSpiffClaimModal,
        setLostReasonModal,
        setCsvImportType, setShowCsvImportModal,
        isMobile,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;

    // UI handlers
    const handleAddNew = () => { setEditingOpp(null); setShowModal(true); };
    const handleEdit = (opp) => { setEditingOpp(opp); setShowModal(true); };

    // Local state
    const [pipelineView, setPipelineView] = useState(() => localStorage.getItem('pipelineView') || 'funnel');
    const [funnelExpandedStage, setFunnelExpandedStage] = useState(null);
    const [kanbanDragging, setKanbanDragging] = useState(null);
    const [kanbanDragOver, setKanbanDragOver] = useState(null);
    const [pipelineQuarterFilter, setPipelineQuarterFilter] = useState([]);
    const [pipelineRepFilter, setPipelineRepFilter] = useState([]);
    const [pipelineTeamFilter, setPipelineTeamFilter] = useState([]);
    const [pipelineTerritoryFilter, setPipelineTerritoryFilter] = useState([]);
    const [pipelineStageFilter, setPipelineStageFilter] = useState([]);
    const [selectedPipelineOpp, setSelectedPipelineOpp] = useState(null);
    const [selectedOpps, setSelectedOpps] = useState([]);
    const [healthPopover, setHealthPopover] = useState(null);
    const [inlineEdit, setInlineEdit] = useState(null);
    const [pipelineSortField, setPipelineSortField] = useState('forecastedCloseDate');
    const [pipelineSortDir, setPipelineSortDir] = useState('asc');
    const [bulkAction, setBulkAction] = useState({ stage: '', rep: '' });
    const [expandedOppActivities, setExpandedOppActivities] = useState({});
    const [bulkScoring, setBulkScoring] = useState(false);
    const [bulkScoreProgress, setBulkScoreProgress] = useState(null); // { done, total }

    useEffect(() => { localStorage.setItem('pipelineView', pipelineView); }, [pipelineView]);

    // Listen for ⚡ Score button fired from AppHeader
    useEffect(() => {
        const handler = () => handleBulkScore();
        document.addEventListener('accelerep:bulkScore', handler);
        return () => document.removeEventListener('accelerep:bulkScore', handler);
    }, []);

    // Bulk AI scoring — scores all active deals sequentially
    const handleBulkScore = async () => {
        if (bulkScoring) return;
        const active = visibleOpportunities.filter(o => !['Closed Won','Closed Lost'].includes(o.stage));
        if (active.length === 0) return;
        setBulkScoring(true);
        setBulkScoreProgress({ done: 0, total: active.length });
        let scored = 0;
        for (const opp of active) {
            try {
                const res = await dbFetch('/.netlify/functions/ai-score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ opportunityId: opp.id, forceRefresh: false }),
                });
                const data = await res.json();
                if (!data.disabled && data.score !== undefined) {
                    setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, aiScore: data } : o));
                }
            } catch (err) {
                console.warn('Bulk score failed for', opp.id, err.message);
            }
            scored++;
            setBulkScoreProgress({ done: scored, total: active.length });
        }
        setBulkScoring(false);
        setBulkScoreProgress(null);
    };

    // Kanban drag/drop
    const handleKanbanDrop = (toStage) => {
        if (!kanbanDragging || kanbanDragging.fromStage === toStage) {
            setKanbanDragging(null); setKanbanDragOver(null); return;
        }
        const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
        const updatedOpp = opportunities.find(o => o.id === kanbanDragging.oppId);
        if (!updatedOpp) return;
        const newOpp = {
            ...updatedOpp, stage: toStage, stageChangedDate: today,
            stageHistory: [...(updatedOpp.stageHistory||[]), { stage: toStage, date: today, prevStage: updatedOpp.stage, author: currentUser||'', timestamp: new Date().toISOString() }]
        };
        setOpportunities(prev => prev.map(o => o.id === kanbanDragging.oppId ? newOpp : o));
        dbFetch('/.netlify/functions/opportunities', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(newOpp) }).catch(console.error);
        setKanbanDragging(null); setKanbanDragOver(null);
    };

    // ── Pipeline-tab filtered opps (drives KPIs + table + summary panel) ──
    const pipelineFilteredOpps = (() => {
        const opts = window.__pipelineFilterOptions || [];
        return visibleOpportunities
            .filter(opp => {
                if (pipelineQuarterFilter.length === 0) return true;
                return pipelineQuarterFilter.some(key => { const opt = opts.find(o => o.key === key); return opt && opt.match(opp); });
            })
            .filter(opp => {
                if (pipelineStageFilter.length === 0) return true;
                if (pipelineStageFilter.includes('__allOpen__')) return opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost';
                return pipelineStageFilter.includes(opp.stage);
            })
            .filter(opp => pipelineRepFilter.length === 0 || pipelineRepFilter.includes(opp.salesRep) || pipelineRepFilter.includes(opp.assignedTo))
            .filter(opp => {
                if (pipelineTeamFilter.length === 0) return true;
                const u = (settings.users||[]).find(u => u.name===(opp.salesRep||opp.assignedTo));
                return u && pipelineTeamFilter.includes(u.team);
            })
            .filter(opp => {
                if (pipelineTerritoryFilter.length === 0) return true;
                const u = (settings.users||[]).find(u => u.name===(opp.salesRep||opp.assignedTo));
                return u && pipelineTerritoryFilter.includes(u.territory);
            });
    })();
    const pipelineTotalARR = pipelineFilteredOpps.reduce((sum, o) => sum + (parseFloat(o.arr) || 0), 0);
    const pipelineActiveOpps = pipelineFilteredOpps.length;
    const pipelineAvgARR = pipelineActiveOpps > 0 ? pipelineTotalARR / pipelineActiveOpps : 0;
    const pipelineNextQtr = (() => {
        const qData = {};
        pipelineFilteredOpps.forEach(opp => {
            if (opp.forecastedCloseDate) {
                const ql = getQuarterLabel(getQuarter(opp.forecastedCloseDate), opp.forecastedCloseDate);
                qData[ql] = (qData[ql] || 0) + (parseFloat(opp.arr) || 0);
            }
        });
        const sorted = Object.entries(qData).sort((a, b) => {
            const da = pipelineFilteredOpps.find(o => getQuarterLabel(getQuarter(o.forecastedCloseDate), o.forecastedCloseDate) === a[0]);
            const db = pipelineFilteredOpps.find(o => getQuarterLabel(getQuarter(o.forecastedCloseDate), o.forecastedCloseDate) === b[0]);
            return new Date(da?.forecastedCloseDate) - new Date(db?.forecastedCloseDate);
        });
        return sorted.length > 0 ? sorted[0] : null;
    })();

    // ── Smart preset filter state ───────────────────────────
    const [smartPreset, setSmartPreset] = useState(null);
    const stalledOpps     = visibleOpportunities.filter(o => !['Closed Won','Closed Lost'].includes(o.stage) && o.stageChangedDate && (Date.now() - new Date(o.stageChangedDate+'T12:00:00').getTime()) / 86400000 > 14);
    const closingThisWeek = visibleOpportunities.filter(o => !['Closed Won','Closed Lost'].includes(o.stage) && o.forecastedCloseDate && (() => { const d = Math.round((new Date(o.forecastedCloseDate+'T12:00:00') - new Date()) / 86400000); return d >= -14 && d <= 7; })());
    const commitOpps       = visibleOpportunities.filter(o => ['Negotiation','Negotiation/Review','Contracts','Closing'].includes(o.stage));
    const recentlyTouched  = visibleOpportunities.filter(o => {
        if (!o.stageChangedDate) return false;
        const days = Math.round((Date.now() - new Date(o.stageChangedDate + 'T12:00:00').getTime()) / 86400000);
        return days <= 7;
    });
    const smartFilteredOpps = React.useMemo(() => {
        if (smartPreset === 'stalled')  return pipelineFilteredOpps.filter(o => stalledOpps.some(s => s.id === o.id));
        if (smartPreset === 'closing')  return pipelineFilteredOpps.filter(o => closingThisWeek.some(s => s.id === o.id));
        if (smartPreset === 'commit')   return pipelineFilteredOpps.filter(o => commitOpps.some(s => s.id === o.id));
        if (smartPreset === 'recent')   return pipelineFilteredOpps.filter(o => recentlyTouched.some(s => s.id === o.id));
        return pipelineFilteredOpps;
    }, [pipelineFilteredOpps, smartPreset]);

    return (
                <div className="tab-page" onClick={() => healthPopover && setHealthPopover(null)} style={{ fontFamily: T.sans }}>

                    {/* ── Editorial page header — PageHeader pattern from mockup ── */}
                    <div style={{ padding: '0 0 14px', display: 'flex', alignItems: 'flex-end', gap: 24 }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 28, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 6 }}>
                                Pipeline.
                            </div>
                            <div style={{ fontSize: 12, color: T.inkMuted, lineHeight: 1.4 }}>
                                <span style={{ fontWeight: 600, color: T.ink }}>{pipelineFilteredOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').length}</span> open deals
                                <span style={{ margin: '0 8px', color: T.border }}>·</span>
                                <span style={{ fontWeight: 600, color: T.ink }}>${pipelineTotalARR >= 1e6 ? (pipelineTotalARR/1e6).toFixed(1)+'M' : Math.round(pipelineTotalARR/1000)+'K'}</span> total pipeline
                                <span style={{ margin: '0 8px', color: T.border }}>·</span>
                                {(() => { const c = pipelineFilteredOpps.filter(o => ['Negotiation','Negotiation/Review','Contracts','Closing'].includes(o.stage)).reduce((s,o)=>s+(parseFloat(o.arr)||0),0); return c > 0 ? <><span style={{ fontWeight: 600, color: T.ink }}>${c>=1e6?(c/1e6).toFixed(1)+'M':Math.round(c/1000)+'K'}</span><span style={{ color: T.inkMuted }}> commit</span></> : null; })()}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {/* GhostBtn — matches mockup */}
                            <button style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'transparent', border: `1px solid ${T.border}`, color: T.ink, fontSize: 12, fontWeight: 500, borderRadius: T.rSm, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap', transition: 'background 120ms' }}
                                onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16l-6 8v6l-4-2v-4L4 5z"/></svg>
                                Filters{(() => { const n = pipelineQuarterFilter.length+pipelineStageFilter.length+pipelineRepFilter.length+pipelineTeamFilter.length+pipelineTerritoryFilter.length; return n > 0 ? ` · ${n}` : ''; })()}
                            </button>
                            {!isReadOnly && (
                                <button onClick={handleAddNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: T.ink, border: 'none', color: T.surface, fontSize: 12, fontWeight: 600, borderRadius: T.rSm, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                                    New deal
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── Smart views row (V2) + view switcher ─────────────── */}
                    {/* Row 1: SMART VIEWS chips + SAVED section */}
                    <div style={{ padding: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans, marginRight: 4 }}>Smart views</div>
                        {/* All open */}
                        <button onClick={() => setSmartPreset(null)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: `1px solid ${smartPreset === null ? T.ink : T.border}`, background: smartPreset === null ? T.ink : T.surface, color: smartPreset === null ? T.surface : T.ink, fontSize: 12, fontWeight: 500, borderRadius: T.rSm, cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms' }}>
                            All open
                        </button>
                        {/* Closing this week */}
                        <button onClick={() => setSmartPreset(smartPreset === 'closing' ? null : 'closing')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: `1px solid ${smartPreset==='closing' ? T.ink : T.border}`, background: smartPreset==='closing' ? T.ink : T.surface, color: smartPreset==='closing' ? T.surface : T.ink, fontSize: 12, fontWeight: 500, borderRadius: T.rSm, cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms' }}>
                            Closing this week
                            {closingThisWeek.length > 0 && <span style={{ background: smartPreset==='closing' ? 'rgba(255,255,255,0.2)' : T.surface2, padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600, color: smartPreset==='closing' ? T.surface : T.inkMuted }}>{closingThisWeek.length}</span>}
                        </button>
                        {/* Stalled */}
                        <button onClick={() => setSmartPreset(smartPreset === 'stalled' ? null : 'stalled')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: `1px solid ${smartPreset==='stalled' ? T.ink : T.border}`, background: smartPreset==='stalled' ? T.ink : T.surface, color: smartPreset==='stalled' ? T.surface : T.ink, fontSize: 12, fontWeight: 500, borderRadius: T.rSm, cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms' }}>
                            Stalled
                            {stalledOpps.length > 0 && <span style={{ background: smartPreset==='stalled' ? 'rgba(255,255,255,0.2)' : T.surface2, padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 600, color: smartPreset==='stalled' ? T.surface : T.inkMuted }}>{stalledOpps.length}</span>}
                        </button>
                        {/* My commit */}
                        <button onClick={() => setSmartPreset(smartPreset === 'commit' ? null : 'commit')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: `1px solid ${smartPreset==='commit' ? T.ink : T.border}`, background: smartPreset==='commit' ? T.ink : T.surface, color: smartPreset==='commit' ? T.surface : T.ink, fontSize: 12, fontWeight: 500, borderRadius: T.rSm, cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms' }}>
                            My commit
                        </button>
                        {/* Recently touched */}
                        <button onClick={() => setSmartPreset(smartPreset === 'recent' ? null : 'recent')}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: `1px solid ${smartPreset==='recent' ? T.ink : T.border}`, background: smartPreset==='recent' ? T.ink : T.surface, color: smartPreset==='recent' ? T.surface : T.ink, fontSize: 12, fontWeight: 500, borderRadius: T.rSm, cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms' }}>
                            Recently touched
                        </button>
                        {/* Divider + SAVED section */}
                        <div style={{ width: 1, height: 20, background: T.border, margin: '0 6px' }}/>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans, marginRight: 4 }}>Saved</div>
                        {['My commit', 'Stalled deals', 'Closing this week'].map(v => (
                            <button key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: `1px solid ${T.border}`, background: T.surface, color: T.ink, fontSize: 12, fontWeight: 500, borderRadius: T.rSm, cursor: 'pointer', fontFamily: T.sans }}>
                                {v}
                            </button>
                        ))}
                        <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'transparent', border: `1px solid ${T.border}`, color: T.ink, fontSize: 12, fontWeight: 500, borderRadius: T.rSm, cursor: 'pointer', fontFamily: T.sans }}>
                            + Save current
                        </button>
                    </div>
                    {/* Row 2: view switcher + showing count */}
                    <div style={{ padding: '0 0 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ display: 'flex', gap: 2, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rSm, padding: 2 }}>
                            {[{id:'kanban',l:'Kanban',i:'layers'},{id:'table',l:'List',i:'menu'},{id:'funnel',l:'Funnel',i:'pipeline'},{id:'forecast',l:'Forecast',i:'target'},{id:'map',l:'Map',i:'building'}].map(v => (
                                <button key={v.id} onClick={() => { setPipelineView(v.id); localStorage.setItem('pipelineView', v.id); setFunnelExpandedStage(null); }}
                                    style={{ background: pipelineView===v.id ? T.ink : 'transparent', color: pipelineView===v.id ? T.surface : T.inkMid, border: 'none', padding: '5px 10px', borderRadius: T.rSm - 1, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.sans, display: 'inline-flex', alignItems: 'center', gap: 5, transition: 'all 120ms' }}>
                                    {v.l}
                                </button>
                            ))}
                        </div>
                        <div style={{ flex: 1 }}/>
                        <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>
                            {pipelineView === 'kanban' ? 'Sorted by urgency · last action' : `Showing ${smartFilteredOpps.length} of ${pipelineFilteredOpps.length}`}
                        </div>
                    </div>

                {/* ── Filter toolbar container ── */}
                <div className="table-container" style={{ marginBottom:'0.75rem' }}>
                    {(() => {
                            const todayDate = new Date();
                            const currentQ2 = getQuarter(todayDate.toISOString().split('T')[0]);
                            const currentQL2 = getQuarterLabel(currentQ2, todayDate.toISOString().split('T')[0]);
                            const qNum2 = parseInt(currentQ2.replace('Q', ''));
                            const nextQ2 = 'Q' + (qNum2 < 4 ? qNum2 + 1 : 1);
                            const nextMonth2 = new Date(todayDate);
                            nextMonth2.setMonth(todayDate.getMonth() + 3);
                            const nextQL2 = getQuarterLabel(nextQ2, nextMonth2.toISOString().split('T')[0]);
                            const timeFilterOpts = [
                                { key: 'currentQ', label: 'Current Qtr', match: (opp) => opp.closeQuarter === currentQL2 },
                                { key: 'currentNextQ', label: 'Cur + Next', match: (opp) => opp.closeQuarter === currentQL2 || opp.closeQuarter === nextQL2 },
                                { key: 'annual', label: 'Annual', match: (opp) => { const fy = currentQL2.split(' ')[0]; return opp.closeQuarter && opp.closeQuarter.startsWith(fy); }},
                                { key: 'Q1', label: 'Q1', match: (opp) => opp.closeQuarter && opp.closeQuarter.includes('Q1') },
                                { key: 'Q2', label: 'Q2', match: (opp) => opp.closeQuarter && opp.closeQuarter.includes('Q2') },
                                { key: 'Q3', label: 'Q3', match: (opp) => opp.closeQuarter && opp.closeQuarter.includes('Q3') },
                                { key: 'Q4', label: 'Q4', match: (opp) => opp.closeQuarter && opp.closeQuarter.includes('Q4') },
                            ];
                            window.__pipelineFilterOptions = timeFilterOpts;
                            const excludedRoles = new Set(['Admin', 'Manager']);
                            const allReps2 = canSeeAll ? [...new Set([
                                ...(settings.users||[]).filter(u => u.name && !excludedRoles.has(u.userType)).map(u => u.name),
                                ...visibleOpportunities.filter(o => o.salesRep).map(o => o.salesRep)
                            ])].sort() : [];
                            const allTeams2 = canSeeAll ? [...new Set((settings.users||[]).filter(u => u.team).map(u => u.team))].sort() : [];
                            const allTerritories2 = canSeeAll ? [...new Set((settings.users||[]).filter(u => u.territory).map(u => u.territory))].sort() : [];
                            const anyActive2 = pipelineQuarterFilter.length > 0 || pipelineStageFilter.length > 0 ||
                                pipelineRepFilter.length > 0 || pipelineTeamFilter.length > 0 || pipelineTerritoryFilter.length > 0;
                            const PD = ({ label, icon, options, selected, onToggle, onClear, renderOption }) => {
                                const [open, setOpen] = React.useState(false);
                                const ref = React.useRef(null);
                                React.useEffect(() => {
                                    if (!open) return;
                                    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
                                    document.addEventListener('mousedown', h);
                                    return () => document.removeEventListener('mousedown', h);
                                }, [open]);
                                const isActive = selected.length > 0;
                                const activeLabels = selected.map(s => options.find(o => (o.key || o) === s)).filter(Boolean).map(o => o.label || o);
                                const btnLabel = isActive ? (activeLabels.length === 1 ? `${label}: ${activeLabels[0]}` : `${label}: ${activeLabels.length}`) : label;
                                return (
                                    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
                                        <button onClick={() => setOpen(o => !o)} style={{
                                            display: 'flex', alignItems: 'center', gap: '0.3rem',
                                            padding: '0.2rem 0.5rem', borderRadius: '6px', cursor: 'pointer',
                                            fontFamily: T.sans, fontSize: '0.6875rem', fontWeight: '600',
                                            transition: 'all 0.15s', whiteSpace: 'nowrap',
                                            border: `1px solid ${isActive ? T.ink : T.border}`,
                                            background: isActive ? T.ink : T.surface,
                                            color: isActive ? T.surface : T.inkMid,
                                        }}>
                                            {icon && <span style={{ fontSize: '0.75rem' }}>{icon}</span>}
                                            <span>{btnLabel}</span>
                                            <span style={{ fontSize: '0.5rem', opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
                                        </button>
                                        {open && (
                                            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 400,
                                                background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd,
                                                boxShadow: '0 8px 24px rgba(42,38,34,0.12)', minWidth: '170px', overflow: 'hidden' }}>
                                                <div onClick={() => { onClear(); setOpen(false); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                        padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem',
                                                        color: !isActive ? T.ink : T.inkMid, fontWeight: !isActive ? '700' : '400',
                                                        background: !isActive ? T.surface2 : 'transparent', borderBottom: `1px solid ${T.border}`, fontFamily: T.sans }}>
                                                    <span style={{ width: '14px', textAlign: 'center', fontSize: '0.75rem' }}>{!isActive ? '✓' : ''}</span>
                                                    <span>All</span>
                                                </div>
                                                {options.map(opt => {
                                                    const key = opt.key || opt;
                                                    const checked = selected.includes(key);
                                                    return (
                                                        <div key={key} onClick={() => onToggle(key)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                                padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem',
                                                                color: checked ? T.ink : T.inkMid, fontWeight: checked ? '700' : '400',
                                                                background: checked ? T.surface2 : 'transparent', transition: 'background 0.1s', fontFamily: T.sans }}>
                                                            <span style={{ width: '14px', textAlign: 'center', fontSize: '0.75rem' }}>{checked ? '✓' : ''}</span>
                                                            {renderOption ? renderOption(opt, checked) : <span>{opt.label || opt}</span>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            };
                            return (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1rem', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap', fontFamily: T.sans }}>
                                    {/* Title */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem', flexShrink: 0 }}>
                                        <div style={{ width: '3px', height: '18px', background: T.gold, borderRadius: '2px' }} />
                                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: T.ink, fontFamily: T.sans }}>Pipeline KPIs</span>
                                    </div>
                                    {/* Divider */}
                                    <div style={{ width: '1px', height: '16px', background: T.border, flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.6rem', fontWeight: '700', color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0, fontFamily: T.sans }}>Filter by</span>

                                    {/* Pipeline selector */}
                                    {allPipelines.length > 1 && (
                                        <SliceDropdown label="Pipeline" icon="🔀"
                                            options={allPipelines.map(p => p.name)}
                                            selected={activePipeline.name}
                                            colorMap={Object.fromEntries(allPipelines.map(p => [p.name, p.color]))}
                                            activeColor={activePipeline.color}
                                            onSelect={name => { const p = allPipelines.find(pl => pl.name === name); if (p) setActivePipelineId(p.id); }}
                                            alwaysActive />
                                    )}

                                    {/* Time */}
                                    <PD label="Time" icon="⏱" options={timeFilterOpts}
                                        selected={pipelineQuarterFilter}
                                        onToggle={key => setPipelineQuarterFilter(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])}
                                        onClear={() => setPipelineQuarterFilter([])} />

                                    {/* Stage */}
                                    <PD label="Stage" icon="📊" options={[{key:'__allOpen__', label:'All Open'}, ...stages]}
                                        selected={pipelineStageFilter}
                                        onToggle={s => {
                                            if (s === '__allOpen__') {
                                                setPipelineStageFilter(prev => prev.includes('__allOpen__') ? [] : ['__allOpen__']);
                                            } else {
                                                setPipelineStageFilter(prev => {
                                                    const without = prev.filter(x => x !== '__allOpen__');
                                                    return without.includes(s) ? without.filter(x => x !== s) : [...without, s];
                                                });
                                            }
                                        }}
                                        onClear={() => setPipelineStageFilter([])}
                                        renderOption={(opt, checked) => {
                                            const s = opt.key || opt;
                                            if (s === '__allOpen__') return <span style={{ fontWeight:'700', color: T.ink, fontWeight:'700' }}>All Open</span>;
                                            const sc = getStageColor(s);
                                            return <span style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                                <span style={{ width:'8px', height:'8px', borderRadius:'50%', background: stageColor(s), flexShrink:0 }}></span>
                                                <span>{s}</span>
                                            </span>;
                                        }} />

                                    {/* Rep */}
                                    {allReps2.length >= 2 && (
                                        <PD label="Rep" icon="👤" options={allReps2}
                                            selected={pipelineRepFilter}
                                            onToggle={r => setPipelineRepFilter(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                                            onClear={() => setPipelineRepFilter([])} />
                                    )}

                                    {/* Team */}
                                    {allTeams2.length > 0 && (
                                        <PD label="Team" icon="👥" options={allTeams2}
                                            selected={pipelineTeamFilter}
                                            onToggle={t => setPipelineTeamFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                                            onClear={() => setPipelineTeamFilter([])} />
                                    )}

                                    {/* Territory */}
                                    {allTerritories2.length > 0 && (
                                        <PD label="Territory" icon="📍" options={allTerritories2}
                                            selected={pipelineTerritoryFilter}
                                            onToggle={t => setPipelineTerritoryFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                                            onClear={() => setPipelineTerritoryFilter([])} />
                                    )}

                                    {/* Clear all */}
                                    {anyActive2 && (
                                        <button onClick={() => { setPipelineQuarterFilter([]); setPipelineStageFilter([]); setPipelineRepFilter([]); setPipelineTeamFilter([]); setPipelineTerritoryFilter([]); }}
                                            style={{ padding: '0.2rem 0.45rem', borderRadius: '4px', border: `1px solid rgba(156,58,46,0.4)`, background: T.surface, color: T.danger, fontSize: '0.625rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            ✕ Clear
                                        </button>
                                    )}

                                    {/* Deal count — right side */}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', color: T.inkMuted, fontWeight: '600', flexShrink: 0, fontFamily: T.sans }}>{pipelineFilteredOpps.length} deals</span>
                                </div>
                            );
                        })()}
                </div>{/* end filter toolbar container */}

                    {/* ════ HORIZONTAL SUMMARY PANEL (KPIs only) ════ */}
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, overflow: 'visible', boxShadow: '0 1px 3px rgba(42,38,34,0.07)', marginBottom:'0.75rem' }}>
                        {/* Two-column body: KPIs left | Stage bars right */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>

                            {/* LEFT: 2×2 KPI tile grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', padding: '0.875rem 1rem' }}>
                                {[
                                    { label: 'Total Pipeline Revenue', value: '$' + (pipelineTotalARR >= 1000000 ? (pipelineTotalARR/1000000).toFixed(1)+'M' : pipelineTotalARR >= 1000 ? Math.round(pipelineTotalARR/1000)+'K' : pipelineTotalARR.toLocaleString()), kpiId: 'totalPipelineRevenue', rawVal: pipelineTotalARR, accent: T.gold },
                                    { label: 'Active Opportunities', value: String(pipelineActiveOpps), kpiId: 'activeOpps', rawVal: pipelineActiveOpps, accent: '#10b981' },
                                    { label: 'Avg Deal Value', value: '$' + (pipelineAvgARR >= 1000000 ? (pipelineAvgARR/1000000).toFixed(1)+'M' : Math.round(pipelineAvgARR/1000)+'K'), kpiId: 'avgDealValue', rawVal: pipelineAvgARR, accent: '#f59e0b' },
                                    { label: (pipelineNextQtr ? pipelineNextQtr[0] : 'Next Qtr') + ' Forecast', value: '$' + ((pipelineNextQtr?pipelineNextQtr[1]:0) >= 1000000 ? ((pipelineNextQtr?pipelineNextQtr[1]:0)/1000000).toFixed(1)+'M' : Math.round((pipelineNextQtr?pipelineNextQtr[1]:0)/1000)+'K'), kpiId: 'nextQForecast', rawVal: pipelineNextQtr ? pipelineNextQtr[1] : 0, accent: '#7c3aed' },
                                ].map(({ label, value, kpiId, rawVal, accent }) => {
                                    const kc = getKpiColor(kpiId, rawVal);
                                    const borderColor = kc.toleranceColor || accent;
                                    return (
                                        <div key={label} style={{
                                            background: T.surface, border: `1px solid ${T.border}`,
                                            borderLeft: `3px solid ${borderColor}`,
                                            borderRadius: T.rMd, padding: '0.5rem 0.75rem'
                                        }}>
                                            <div style={{ fontSize: '0.575rem', fontWeight: '700', color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.3rem', fontFamily: T.sans }}>{label}</div>
                                            <div style={{ fontSize: '1.125rem', fontWeight: '800', color: T.ink, letterSpacing: '-0.02em', lineHeight: 1, fontFamily: T.sans }}>{value}</div>
                                            {(() => {
                                                const tMode = settings.kpiTrendMode || 'stage-distribution';
                                                const _n = new Date();
                                                let bkts = [];
                                                const oppVal = o => kpiId === 'totalPipelineRevenue' || kpiId === 'avgDealValue' ? (parseFloat(o.arr)||0) : 1;
                                                if (tMode === 'stage-distribution') { const sl = (settings.funnelStages||[]).map(s=>s.name); bkts = sl.map(s => pipelineFilteredOpps.filter(o=>o.stage===s).reduce((a,o)=>a+oppVal(o),0)); }
                                                else if (tMode === 'month-over-month') { for(let i=5;i>=0;i--){const d=new Date(_n.getFullYear(),_n.getMonth()-i,1),nx=new Date(_n.getFullYear(),_n.getMonth()-i+1,1); bkts.push(pipelineFilteredOpps.filter(o=>{const c=o.forecastedCloseDate?new Date(o.forecastedCloseDate + 'T12:00:00'):null;return c&&c>=d&&c<nx;}).reduce((a,o)=>a+oppVal(o),0));} }
                                                else if (tMode === 'quarter-over-quarter') { for(let i=3;i>=0;i--){const qm=_n.getMonth()-(i*3),fy=_n.getFullYear()+Math.floor(qm/12),fm=((qm%12)+12)%12;const s=new Date(fy,fm,1),e=new Date(fy,fm+3,1); bkts.push(pipelineFilteredOpps.filter(o=>{const c=o.forecastedCloseDate?new Date(o.forecastedCloseDate + 'T12:00:00'):null;return c&&c>=s&&c<e;}).reduce((a,o)=>a+oppVal(o),0));} }
                                                else { bkts = [rawVal*0.6, rawVal*0.75, rawVal*0.85, rawVal]; }
                                                if (bkts.length < 2) return null;
                                                const mx = Math.max(...bkts, 1), n = bkts.length;
                                                const pts = bkts.map((v,i)=>`${Math.round((i/(n-1))*90)},${Math.round(18-Math.max(0,v/mx)*14)}`).join(' ');
                                                const pf = pts + ' 90,18 0,18';
                                                return (<svg width="100%" height="18" viewBox="0 0 90 18" preserveAspectRatio="none" style={{ display:'block', marginTop:'4px' }}><polyline fill={borderColor} fillOpacity="0.10" stroke="none" points={pf}/><polyline fill="none" stroke={borderColor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={pts} opacity="0.8"/></svg>);
                                            })()}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Vertical divider */}
                            <div style={{ background: T.border }}></div>

                            {/* RIGHT: Stage funnel bars */}
                            {(() => {
                                const openOpps = pipelineFilteredOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                                const stageGroups = stages
                                    .filter(s => s !== 'Closed Won' && s !== 'Closed Lost')
                                    .map(s => ({
                                        stage: s,
                                        count: openOpps.filter(o => o.stage === s).length,
                                        arr: openOpps.filter(o => o.stage === s).reduce((sum, o) => sum + (parseFloat(o.arr) || 0), 0)
                                    }))
                                    .filter(g => g.count > 0);
                                const maxArr = stageGroups.reduce((m, g) => Math.max(m, g.arr), 1);
                                return (
                                    <div style={{ padding: '0.875rem 1rem' }}>
                                        <div style={{ fontSize: '0.575rem', fontWeight: '700', color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem', fontFamily: T.sans }}>By Stage</div>
                                        {stageGroups.length === 0 ? (
                                            <div style={{ fontSize: '0.75rem', color: T.inkMuted, fontFamily: T.sans }}>No open opportunities</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {stageGroups.map(g => {
                                                    const sc = getStageColor(g.stage);
                                                    const pct = Math.round((g.arr / maxArr) * 100);
                                                    return (
                                                        <div key={g.stage}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                                                                <span style={{ fontSize: '0.6375rem', fontWeight: '600', color: stageColor(g.stage), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>{g.stage}</span>
                                                                <span style={{ fontSize: '0.575rem', color: T.inkMuted, fontWeight: '500', flexShrink: 0 }}>{g.count} · ${g.arr >= 1000 ? Math.round(g.arr/1000)+'K' : g.arr}</span>
                                                            </div>
                                                            <div style={{ height: '5px', background: T.surface2, borderRadius: T.rSm, overflow: 'hidden' }}>
                                                                <div style={{ height: '5px', background: stageColor(g.stage), borderRadius: T.rSm, width: pct + '%', opacity: 0.75 }} />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                        </div>
                    </div>
                    {/* ════ END SUMMARY PANEL ════ */}

                    {/* ════ MOBILE PIPELINE CARD LIST (≤640px only) ════ */}
                    <div className="spt-pipeline-mobile" style={{ padding: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: T.inkMid, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: T.sans }}>{pipelineFilteredOpps.length} deal{pipelineFilteredOpps.length !== 1 ? 's' : ''}</span>
                            <button onClick={() => { setEditingOpp(null); setShowModal(true); }} style={{ padding: '0.45rem 0.875rem', background: T.ink, color: T.surface, border: 'none', borderRadius: T.rSm, fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: T.sans }}>+ New Deal</button>
                        </div>
                        {pipelineFilteredOpps.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontSize: '0.875rem' }}>No deals match the current filter.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                {pipelineFilteredOpps.map(opp => {
                                    const health = calculateDealHealth(opp);
                                    const healthColor = health.score >= 70 ? '#10b981' : health.score >= 40 ? '#f59e0b' : '#ef4444';
                                    const sc = getStageColor(opp.stage);
                                    return (
                                        <div key={opp.id} className="mobile-record-card"
                                            onClick={() => { setEditingOpp(opp); setShowModal(true); }}>
                                            <div className="mobile-card-top">
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="mobile-card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {opp.opportunityName || opp.account || 'Unnamed'}
                                                    </div>
                                                    <div className="mobile-card-sub">{opp.account}{opp.site ? ' · ' + opp.site : ''}{opp.salesRep ? ` · ${opp.salesRep}` : ''}</div>
                                                </div>
                                                {canViewField('arr') && (
                                                    <div className="mobile-card-arr">${((parseFloat(opp.arr)||0)/1000).toFixed(0)}K</div>
                                                )}
                                            </div>
                                            <div className="mobile-card-meta">
                                                <span style={{ background: sc.text + '22', color: sc.text, padding: '0.125rem 0.5rem', borderRadius: '999px', fontSize: '0.6875rem', fontWeight: '700' }}>{opp.stage}</span>
                                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: healthColor, display: 'inline-block' }} />
                                                <span className="mobile-card-meta-item" style={{ color: healthColor, fontWeight: '600' }}>{health.status}</span>
                                                {opp.forecastedCloseDate && (
                                                    <span className="mobile-card-meta-item">📅 {new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ════ DESKTOP VIEWS: VIEW TOGGLE + FUNNEL / KANBAN / TABLE ════ */}
                    <div className="spt-pipeline-desktop">

                    {/* AI bulk score button — no longer wrapped in styled bar */}
                    {settings?.aiScoringEnabled && (
                        <div style={{ padding:'0.375rem 1rem 0' }}>
                            <button
                                onClick={handleBulkScore}
                                disabled={bulkScoring}
                                title="Score all active deals with AI"
                                style={{ padding: '0.3rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: T.rSm, background: bulkScoring ? T.surface2 : T.surface, color: T.inkMid, fontSize: '0.75rem', fontWeight: '600', cursor: bulkScoring ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                                {bulkScoring ? (
                                    <>
                                        <span style={{ width: '10px', height: '10px', border: '2px solid #94a3b8', borderTopColor: T.inkMid, borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                                        Scoring {bulkScoreProgress?.done}/{bulkScoreProgress?.total}…
                                    </>
                                ) : '🤖 Score all deals'}
                            </button>
                        </div>
                    )}


                    {/* ════ FORECAST / STORY VIEW (V3) ════ */}
                    {pipelineView === 'forecast' && (() => {
                        const open = pipelineFilteredOpps.filter(o => !['Closed Won','Closed Lost'].includes(o.stage));
                        const commitDeals = open.filter(o => ['Negotiation','Negotiation/Review','Contracts','Closing'].includes(o.stage)).sort((a,b) => new Date(a.forecastedCloseDate||'9999') - new Date(b.forecastedCloseDate||'9999'));
                        const bestDeals   = open.filter(o => ['Proposal'].includes(o.stage)).sort((a,b) => new Date(a.forecastedCloseDate||'9999') - new Date(b.forecastedCloseDate||'9999'));
                        const pipeDeals   = open.filter(o => ['Prospecting','Qualification','Discovery','Evaluation (Demo)'].includes(o.stage)).sort((a,b) => new Date(a.forecastedCloseDate||'9999') - new Date(b.forecastedCloseDate||'9999'));
                        const sumARR = arr => arr.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
                        const fmtA  = n => n >= 1e6 ? '$'+(n/1e6).toFixed(1)+'M' : '$'+Math.round(n/1000)+'K';

                        const ForecastCard = ({ opp }) => {
                            const closedays = opp.forecastedCloseDate ? Math.round((new Date(opp.forecastedCloseDate+'T12:00:00') - new Date()) / 86400000) : null;
                            const overdue   = closedays !== null && closedays < 0;
                            const health    = calculateDealHealth(opp);
                            const hColor    = health.score >= 65 ? T.ok : health.score >= 45 ? T.warn : T.danger;
                            const relDay    = d => { if (!d) return '—'; const diff = Math.round((new Date(d+'T12:00:00') - new Date()) / 86400000); if (diff === 0) return 'today'; if (diff < 0) return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); if (diff <= 14) return diff+'d'; return new Date(d+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}); };
                            return (
                                <div
                                    onClick={() => { setEditingOpp(opp); setShowModal(true); }}
                                    style={{ background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${stageColor(opp.stage)}`, borderRadius: T.rSm, padding: '9px 12px', minWidth: 220, flexShrink: 0, cursor: 'pointer', transition: 'box-shadow 120ms', fontFamily: T.sans }}
                                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px -4px rgba(42,38,34,0.15)'}
                                    onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, marginBottom: 2, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                        {opp.account}
                                    </div>
                                    <div style={{ fontSize: 10, color: T.inkMuted, marginBottom: 6, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                        {opp.opportunityName || ''}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>{fmtA(parseFloat(opp.arr)||0)}</div>
                                        <div style={{ fontSize: 10, color: overdue ? T.danger : T.inkMuted, fontWeight: overdue ? 600 : 400 }}>{relDay(opp.forecastedCloseDate)}</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6, paddingTop: 6, borderTop: `1px solid ${T.border}`, fontSize: 10, color: T.inkMuted, alignItems: 'center' }}>
                                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: hColor }}/>
                                        {opp.aiScore && <><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>{opp.aiScore.score}</>}
                                        <span style={{ flex: 1 }}/>
                                        <span>{opp.stage}</span>
                                    </div>
                                </div>
                            );
                        };

                        const ForecastLane = ({ label, subtitle, opps, total, accent }) => (
                            <div style={{ marginBottom: 20 }}>
                                <div style={{ padding: '0 24px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                                        <div style={{ width: 4, height: 16, background: accent, borderRadius: 1 }}/>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, letterSpacing: -0.2, fontFamily: T.sans }}>{label}</div>
                                        <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{subtitle}</div>
                                    </div>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums', fontFamily: T.sans }}>{fmtA(total)}</div>
                                </div>
                                <div style={{ display: 'flex', gap: 8, padding: '0 24px 4px', overflowX: 'auto' }}>
                                    {opps.map(o => <ForecastCard key={o.id} opp={o}/>)}
                                    {opps.length === 0 && <div style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic', padding: '20px 0', fontFamily: T.sans }}>— nothing here —</div>}
                                </div>
                            </div>
                        );

                        return (
                            <div style={{ paddingBottom: 20 }}>
                                {/* Forecast page title — matches V3 mockup */}
                                <div style={{ padding: '0 24px 16px' }}>
                                    <div style={{ fontFamily: T.serif, fontSize: 28, fontStyle: 'italic', fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 6 }}>Your quarter, at a glance.</div>
                                    <div style={{ fontSize: 12, color: T.inkMuted }}>Three lanes: what\'s committed, what\'s likely, what\'s coming.</div>
                                </div>
                                {/* What changed strip */}
                                <div style={{ padding: '0 24px 16px' }}>
                                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 20, fontSize: 12, fontFamily: T.sans }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase' }}>This week</span>
                                        <span><span style={{ color: T.ok, fontWeight: 700 }}>+3</span> <span style={{ color: T.inkMid }}>deals advanced</span></span>
                                        <span style={{ color: T.border }}>·</span>
                                        <span><span style={{ color: T.danger, fontWeight: 700 }}>2</span> <span style={{ color: T.inkMid }}>slipped</span></span>
                                        <span style={{ color: T.border }}>·</span>
                                        <span><span style={{ color: T.ink, fontWeight: 700 }}>{fmtA(pipelineTotalARR * 0.08)}</span> <span style={{ color: T.inkMid }}>new pipeline added</span></span>
                                        <div style={{ flex: 1 }}/>
                                        <span style={{ color: T.gold, fontWeight: 500, cursor: 'pointer' }}>See changelog →</span>
                                    </div>
                                </div>
                                <ForecastLane label="Commit"    subtitle={`${commitDeals.length} deal${commitDeals.length !== 1?'s':''} you're betting on`} opps={commitDeals} total={sumARR(commitDeals)} accent={T.ok}/>
                                <ForecastLane label="Best case" subtitle={`${bestDeals.length} in proposal stage`}                                            opps={bestDeals}   total={sumARR(bestDeals)}   accent={T.warn}/>
                                <ForecastLane label="Pipeline"  subtitle={`${pipeDeals.length} earlier stages`}                                               opps={pipeDeals}   total={sumARR(pipeDeals)}   accent={T.info}/>
                            </div>
                        );
                    })()}

                    {/* ════ FUNNEL VIEW ════ */}
                    {pipelineView === 'funnel' && (
                        <FunnelView
                            pipelineFilteredOpps={smartFilteredOpps}
                            funnelExpandedStage={funnelExpandedStage}
                            setFunnelExpandedStage={setFunnelExpandedStage}
                            handleEdit={handleEdit}
                            handleDelete={handleDelete}
                        />
                    )}

                    {/* ════ KANBAN VIEW ════ */}
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
                        />
                    )}


                    {/* ════ FULL-WIDTH TABLE ════ */}
                    {/* ════ MAP VIEW (placeholder) ════ */}
                    {pipelineView === 'map' && (
                        <div style={{ padding: '40px 32px', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
                            Map view — territory coverage coming soon.
                        </div>
                    )}

                                        {pipelineView === 'table' && (
                    <div style={{ margin: '0 0 24px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rMd, overflow: 'auto', fontFamily: T.sans }}>
                        {/* ── Table header row — V2 mockup: 28px 1.6fr 1fr 100px 90px 90px 70px 70px 60px 24px ── */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '28px 1.6fr 1fr 100px 90px 90px 70px 70px 60px 24px',
                            alignItems: 'center', padding: '0 14px', height: 36,
                            background: T.surface2, borderBottom: `1px solid ${T.border}`,
                            fontSize: 10, fontWeight: 700, color: T.inkMuted,
                            letterSpacing: 0.6, textTransform: 'uppercase',
                            position: 'sticky', top: 0, zIndex: 1,
                        }}>
                            <div/>
                            <div>Deal</div>
                            <div>Account</div>
                            <div>Stage</div>
                            <div style={{ textAlign: 'right' }}>ARR</div>
                            <div>Close</div>
                            <div>AI</div>
                            <div>Health</div>
                            <div>Days</div>
                            <div/>
                        </div>
                        {/* ── Table body rows ── */}
                        {pipelineFilteredOpps
                            .filter(opp => pipelineStageFilter.length === 0 || (pipelineStageFilter.includes('__allOpen__') ? opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost' : pipelineStageFilter.includes(opp.stage)))
                            .filter(opp => pipelineRepFilter.length === 0 || pipelineRepFilter.includes(opp.salesRep) || pipelineRepFilter.includes(opp.assignedTo))
                            .sort((a, b) => {
                                const dir = pipelineSortDir === 'asc' ? 1 : -1;
                                switch (pipelineSortField) {
                                    case 'salesRep': return dir * (a.salesRep||'').localeCompare(b.salesRep||'');
                                    case 'account':  return dir * (a.account||'').localeCompare(b.account||'');
                                    case 'arr':      return dir * ((parseFloat(a.arr)||0) - (parseFloat(b.arr)||0));
                                    default:         return dir * (new Date(a.forecastedCloseDate||'9999') - new Date(b.forecastedCloseDate||'9999'));
                                }
                            })
                            .map((opp, oppIdx) => {
                                const health = calculateDealHealth(opp);
                                const daysInStage = opp.stageChangedDate ? Math.max(0, Math.floor((new Date() - new Date(opp.stageChangedDate + 'T12:00:00')) / 86400000)) : null;
                                const stale = daysInStage !== null && daysInStage > 14;
                                const closeDays = opp.forecastedCloseDate ? Math.round((new Date(opp.forecastedCloseDate + 'T12:00:00') - new Date()) / 86400000) : null;
                                const overdue = closeDays !== null && closeDays < 0;
                                const aiRisk = opp.aiScore && opp.aiScore.score < 50;
                                const [hover, setHover] = React.useState ? [false, {}] : [false, {}]; // fallback
                                return (
                                    <div key={opp.id}
                                        onClick={() => { setEditingOpp(opp); setShowModal(true); }}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '28px 1.6fr 1fr 100px 90px 90px 70px 70px 60px 24px',
                                            alignItems: 'center', padding: '0 14px', height: 42,
                                            borderBottom: `1px solid ${T.border}`,
                                            background: selectedOpps.includes(opp.id) ? T.surface2 : 'transparent',
                                            fontSize: 12, color: T.ink, cursor: 'pointer',
                                            transition: 'background 100ms',
                                            fontFamily: T.sans,
                                        }}
                                        onMouseEnter={e => { if (!selectedOpps.includes(opp.id)) e.currentTarget.style.background = T.surface2; }}
                                        onMouseLeave={e => { if (!selectedOpps.includes(opp.id)) e.currentTarget.style.background = 'transparent'; }}>
                                        {/* Checkbox */}
                                        <div onClick={e => { e.stopPropagation(); setSelectedOpps(prev => prev.includes(opp.id) ? prev.filter(x => x !== opp.id) : [...prev, opp.id]); }}>
                                            {selectedOpps.includes(opp.id) && (
                                                <div style={{ width: 15, height: 15, borderRadius: 3, border: `1px solid ${T.ink}`, background: T.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.surface} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>
                                                </div>
                                            )}
                                        </div>
                                        {/* Deal name */}
                                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                                            {opp.opportunityName || opp.account}
                                        </div>
                                        {/* Account */}
                                        <div style={{ color: T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                                            {opp.account}
                                        </div>
                                        {/* Stage — inline indicator matching V2 mockup */}
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.rSm, fontSize: 11, fontWeight: 500, width: 'fit-content' }}>
                                            <div style={{ width: 6, height: 6, borderRadius: 1, background: stageColor(opp.stage) }}/>
                                            {opp.stage}
                                        </div>
                                        {/* ARR */}
                                        <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: T.ink }}>
                                            ${(parseFloat(opp.arr)||0) >= 1000 ? Math.round((parseFloat(opp.arr)||0)/1000)+'K' : (parseFloat(opp.arr)||0).toLocaleString()}
                                        </div>
                                        {/* Close date */}
                                        <div style={{ fontSize: 11, color: overdue ? T.danger : T.inkMid, fontWeight: overdue ? 600 : 400 }}>
                                            {opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                        </div>
                                        {/* AI score */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                            {opp.aiScore ? (
                                                <>
                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={aiRisk ? T.danger : T.inkMid} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>
                                                    <span style={{ fontSize: 11, color: aiRisk ? T.danger : T.inkMid }}>{opp.aiScore.score}</span>
                                                </>
                                            ) : <span style={{ fontSize: 11, color: T.inkMuted }}>—</span>}
                                        </div>
                                        {/* Health */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: health.score >= 65 ? T.ok : health.score >= 45 ? T.warn : T.danger }}/>
                                            <span style={{ fontSize: 11, color: T.inkMid }}>{health.score}</span>
                                        </div>
                                        {/* Days in stage */}
                                        <div style={{ fontSize: 11, color: stale ? T.danger : T.inkMuted, fontWeight: stale ? 600 : 400 }}>
                                            {daysInStage !== null ? daysInStage + 'd' : '—'}
                                        </div>
                                        {/* More icon on hover */}
                                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>
                                        </div>
                                    </div>
                                );
                            })
                        }
                        {pipelineFilteredOpps.length === 0 && (
                            <div style={{ padding: '2rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
                                No deals match the current filter.
                            </div>
                        )}
                    </div>
                    )}

                    </div>


                {/* ════ FLOATING BULK ACTION BAR (V1/V2 mockup) ════ */}
                {selectedOpps.length > 0 && (
                    <div style={{
                        position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
                        background: T.surfaceInk, color: '#e6ddd0', padding: '10px 12px 10px 16px',
                        borderRadius: 6, display: 'flex', alignItems: 'center', gap: 10,
                        boxShadow: '0 12px 36px rgba(42,38,34,0.3)',
                        fontFamily: T.sans, zIndex: 500,
                    }}>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{selectedOpps.length} selected</span>
                        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.2)' }}/>
                        {[
                            { l: 'Move stage' },
                            { l: 'Update close' },
                            { l: 'AI score' },
                        ].map(b => (
                            <button key={b.l}
                                onClick={() => { if (b.l === 'AI score') handleBulkScore(); }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(255,255,255,0.08)', border: 'none', color: '#e6ddd0', fontSize: 12, fontWeight: 500, padding: '5px 10px', borderRadius: 3, cursor: 'pointer', fontFamily: T.sans }}>
                                {b.l}
                            </button>
                        ))}
                        <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.2)' }}/>
                        <button onClick={() => setSelectedOpps([])}
                            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: 4, fontSize: 16, lineHeight: 1 }}>
                            ✕
                        </button>
                    </div>
                )}

                </div>
            
    );
}
