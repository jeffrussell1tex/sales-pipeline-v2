import React, { useState, useEffect } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';
import { SliceDropdown } from '../components/ui/ViewingBar';

function KanbanView({ pipelineFilteredOpps, kanbanDragging, kanbanDragOver, setKanbanDragging, setKanbanDragOver, handleEdit, handleDelete }) {
    const {
        stages, opportunities, setOpportunities,
        accounts, contacts, tasks, setTasks, activities,
        settings, currentUser, userRole, canSeeAll, isRepVisible,
        exportToCSV, exportingCSV, setExportingCSV,
        showConfirm, softDelete, addAudit,
        getStageColor, calculateDealHealth, canViewField,
        visibleOpportunities, activePipeline, allPipelines,
        getQuarter, getQuarterLabel,
    } = useApp();
    const stageColors = ['#6366f1','#8b5cf6','#0ea5e9','#f59e0b','#f97316','#10b981','#16a34a','#ef4444'];

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

    return (
        <div style={{ padding: '1rem 1.25rem 1.5rem' }}>
            <div className="spt-kanban-wrap" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
                {stages.filter(s => s !== 'Closed Lost').map((stage, idx) => {
                    const color = stageColors[idx % stageColors.length];
                    const colOpps = pipelineFilteredOpps.filter(o => o.stage === stage);
                    const colARR = colOpps.reduce((s, o) => s + (parseFloat(o.arr)||0), 0);
                    const isDragOver = kanbanDragOver === stage;
                    return (
                        <div key={stage}
                            onDragOver={e => { e.preventDefault(); setKanbanDragOver(stage); }}
                            onDragLeave={e => { setKanbanDragOver(null); }}
                            onDrop={() => handleKanbanDrop(stage)}
                            style={{ width: '200px', flexShrink: 0, flexGrow: 1, minWidth: '160px', maxWidth: '240px', background: isDragOver ? '#eff6ff' : '#f8fafc', border: isDragOver ? '1px solid #93c5fd' : '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', transition: 'all 0.15s' }}>
                            <div style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #e2e8f0', borderTop: '3px solid ' + color, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.6875rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{stage}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                                    <span style={{ fontSize: '0.6rem', fontWeight: '700', background: '#e2e8f0', color: '#64748b', borderRadius: '10px', padding: '0.1rem 0.35rem' }}>{colOpps.length}</span>
                                    <span style={{ fontSize: '0.6rem', fontWeight: '700', color: color }}>{Math.round(colARR/1000)}K</span>
                                </div>
                            </div>
                            <div style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '80px' }}>
                                {colOpps.map(opp => {
                                    const health = calculateDealHealth(opp);
                                    const healthColor = health.score >= 70 ? '#10b981' : health.score >= 40 ? '#f59e0b' : '#ef4444';
                                    const isDragging = kanbanDragging && kanbanDragging.oppId === opp.id;
                                    return (
                                        <div key={opp.id}
                                            draggable
                                            onDragStart={() => setKanbanDragging({ oppId: opp.id, fromStage: stage })}
                                            onDragEnd={() => { setKanbanDragging(null); setKanbanDragOver(null); }}
                                            style={{ background: '#fff', borderRadius: '7px', border: '1px solid #e2e8f0', padding: '0.5rem 0.625rem', cursor: 'grab', opacity: isDragging ? 0.5 : 1, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; }}>
                                            <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#1e293b', marginBottom: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opp.opportunityName || opp.account}</div>
                                            <div style={{ fontSize: '0.6375rem', color: '#64748b', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opp.account}{opp.site ? ' · ' + opp.site : ''}</div>
                                            {opp.salesRep && <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginBottom: '0.25rem' }}>{'\u{1F464} ' + opp.salesRep}</div>}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#2563eb' }}>{Math.round((parseFloat(opp.arr)||0)/1000)}K</span>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    {opp.aiScore?.verdict && (() => {
                                                        const aiColors = { 'Strong': '#639922', 'On Track': '#378ADD', 'At Risk': '#BA7517', 'Critical': '#E24B4A' };
                                                        const aiColor = aiColors[opp.aiScore.verdict] || '#94a3b8';
                                                        return <div title={`AI: ${opp.aiScore.score} — ${opp.aiScore.verdict}`} style={{ width: '6px', height: '6px', borderRadius: '50%', background: aiColor, flexShrink: 0, outline: `2px solid ${aiColor}40` }} />;
                                                    })()}
                                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: healthColor, flexShrink: 0 }}></div>
                                                    <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{opp.forecastedCloseDate ? opp.forecastedCloseDate.slice(5) : '-'}</span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.375rem' }}>
                                                <button className="action-btn" onClick={() => handleEdit(opp)} style={{ flex: 1, padding: '0.4rem 0', fontSize: '0.6rem', textAlign: 'center', minHeight: '28px' }}>Edit</button>
                                                <button className="action-btn delete" onClick={() => handleDelete(opp.id)} style={{ flex: 1, padding: '0.4rem 0', fontSize: '0.6rem', textAlign: 'center', minHeight: '28px' }}>Del</button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {colOpps.length === 0 && (
                                    <div style={{ fontSize: '0.6875rem', color: '#cbd5e1', textAlign: 'center', padding: '1rem 0', fontStyle: 'italic' }}>Drop here</div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

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

    return (

                <div className="tab-page" onClick={() => healthPopover && setHealthPopover(null)}>
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Pipeline</h2>
                        </div>
                    </div>
                {/* ── Sub-tabs: Funnel | Kanban | List ── */}
                <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid #e2e8f0', marginBottom:'0.25rem' }}>
                    <button onClick={() => { setPipelineView('funnel'); localStorage.setItem('pipelineView','funnel'); setFunnelExpandedStage(null); }}
                        style={{ padding:'0.5rem 1.25rem', border:'none', borderBottom: pipelineView==='funnel' ? '2px solid #2563eb' : '2px solid transparent', background:'transparent', color: pipelineView==='funnel' ? '#2563eb' : '#64748b', fontWeight: pipelineView==='funnel' ? '700' : '500', fontSize:'0.875rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', whiteSpace:'nowrap' }}>Funnel</button>
                    <button onClick={() => { setPipelineView('kanban'); localStorage.setItem('pipelineView','kanban'); setFunnelExpandedStage(null); }}
                        style={{ padding:'0.5rem 1.25rem', border:'none', borderBottom: pipelineView==='kanban' ? '2px solid #2563eb' : '2px solid transparent', background:'transparent', color: pipelineView==='kanban' ? '#2563eb' : '#64748b', fontWeight: pipelineView==='kanban' ? '700' : '500', fontSize:'0.875rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', whiteSpace:'nowrap' }}>Kanban</button>
                    <button onClick={() => { setPipelineView('table'); localStorage.setItem('pipelineView','table'); setFunnelExpandedStage(null); }}
                        style={{ padding:'0.5rem 1.25rem', border:'none', borderBottom: pipelineView==='table' ? '2px solid #2563eb' : '2px solid transparent', background:'transparent', color: pipelineView==='table' ? '#2563eb' : '#64748b', fontWeight: pipelineView==='table' ? '700' : '500', fontSize:'0.875rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', whiteSpace:'nowrap' }}>List</button>
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
                                            fontFamily: 'inherit', fontSize: '0.6875rem', fontWeight: '700',
                                            transition: 'all 0.15s', whiteSpace: 'nowrap',
                                            border: '1px solid ' + (isActive ? '#2563eb' : '#e2e8f0'),
                                            background: isActive ? '#2563eb' : '#f8fafc',
                                            color: isActive ? '#fff' : '#64748b',
                                        }}>
                                            {icon && <span style={{ fontSize: '0.75rem' }}>{icon}</span>}
                                            <span>{btnLabel}</span>
                                            <span style={{ fontSize: '0.5rem', opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
                                        </button>
                                        {open && (
                                            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 400,
                                                background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px',
                                                boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: '170px', overflow: 'hidden' }}>
                                                <div onClick={() => { onClear(); setOpen(false); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem',
                                                        padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem',
                                                        color: !isActive ? '#2563eb' : '#1e293b', fontWeight: !isActive ? '700' : '400',
                                                        background: !isActive ? '#eff6ff' : 'transparent', borderBottom: '1px solid #f1f5f9' }}>
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
                                                                color: checked ? '#2563eb' : '#1e293b', fontWeight: checked ? '700' : '400',
                                                                background: checked ? '#eff6ff' : 'transparent', transition: 'background 0.1s' }}>
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
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 1rem', borderBottom: '1px solid #f1f5f9', flexWrap: 'wrap' }}>
                                    {/* Title */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '0.5rem', flexShrink: 0 }}>
                                        <div style={{ width: '3px', height: '18px', background: 'linear-gradient(to bottom, #2563eb, #7c3aed)', borderRadius: '2px' }} />
                                        <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0f172a' }}>Pipeline KPIs</span>
                                    </div>
                                    {/* Divider */}
                                    <div style={{ width: '1px', height: '16px', background: '#e2e8f0', flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.6rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>Filter by</span>

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
                                            if (s === '__allOpen__') return <span style={{ fontWeight:'700', color:'#2563eb' }}>All Open</span>;
                                            const sc = getStageColor(s);
                                            return <span style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                                <span style={{ width:'8px', height:'8px', borderRadius:'50%', background: sc.text, flexShrink:0 }}></span>
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
                                            style={{ padding: '0.2rem 0.45rem', borderRadius: '4px', border: '1px solid #fca5a5', background: '#fff', color: '#ef4444', fontSize: '0.625rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            ✕ Clear
                                        </button>
                                    )}

                                    {/* Deal count — right side */}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', color: '#94a3b8', fontWeight: '600', flexShrink: 0 }}>{pipelineFilteredOpps.length} deals</span>
                                </div>
                            );
                        })()}
                </div>{/* end filter toolbar container */}

                    {/* ════ HORIZONTAL SUMMARY PANEL (KPIs only) ════ */}
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'visible', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom:'0.75rem' }}>
                        {/* Two-column body: KPIs left | Stage bars right */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>

                            {/* LEFT: 2×2 KPI tile grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', padding: '0.875rem 1rem' }}>
                                {[
                                    { label: 'Total Pipeline Revenue', value: '$' + (pipelineTotalARR >= 1000000 ? (pipelineTotalARR/1000000).toFixed(1)+'M' : pipelineTotalARR >= 1000 ? Math.round(pipelineTotalARR/1000)+'K' : pipelineTotalARR.toLocaleString()), kpiId: 'totalPipelineRevenue', rawVal: pipelineTotalARR, accent: '#2563eb' },
                                    { label: 'Active Opportunities', value: String(pipelineActiveOpps), kpiId: 'activeOpps', rawVal: pipelineActiveOpps, accent: '#10b981' },
                                    { label: 'Avg Deal Value', value: '$' + (pipelineAvgARR >= 1000000 ? (pipelineAvgARR/1000000).toFixed(1)+'M' : Math.round(pipelineAvgARR/1000)+'K'), kpiId: 'avgDealValue', rawVal: pipelineAvgARR, accent: '#f59e0b' },
                                    { label: (pipelineNextQtr ? pipelineNextQtr[0] : 'Next Qtr') + ' Forecast', value: '$' + ((pipelineNextQtr?pipelineNextQtr[1]:0) >= 1000000 ? ((pipelineNextQtr?pipelineNextQtr[1]:0)/1000000).toFixed(1)+'M' : Math.round((pipelineNextQtr?pipelineNextQtr[1]:0)/1000)+'K'), kpiId: 'nextQForecast', rawVal: pipelineNextQtr ? pipelineNextQtr[1] : 0, accent: '#7c3aed' },
                                ].map(({ label, value, kpiId, rawVal, accent }) => {
                                    const kc = getKpiColor(kpiId, rawVal);
                                    const borderColor = kc.toleranceColor || accent;
                                    return (
                                        <div key={label} style={{
                                            background: '#f8fafc', border: '1px solid #f1f5f9',
                                            borderLeft: `3px solid ${borderColor}`,
                                            borderRadius: '8px', padding: '0.5rem 0.75rem'
                                        }}>
                                            <div style={{ fontSize: '0.575rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.3rem' }}>{label}</div>
                                            <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#1e293b', letterSpacing: '-0.02em', lineHeight: 1 }}>{value}</div>
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
                            <div style={{ background: '#f1f5f9' }}></div>

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
                                        <div style={{ fontSize: '0.575rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.625rem' }}>By Stage</div>
                                        {stageGroups.length === 0 ? (
                                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>No open opportunities</div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {stageGroups.map(g => {
                                                    const sc = getStageColor(g.stage);
                                                    const pct = Math.round((g.arr / maxArr) * 100);
                                                    return (
                                                        <div key={g.stage}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                                                                <span style={{ fontSize: '0.6375rem', fontWeight: '600', color: sc.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>{g.stage}</span>
                                                                <span style={{ fontSize: '0.575rem', color: '#94a3b8', fontWeight: '500', flexShrink: 0 }}>{g.count} · ${g.arr >= 1000 ? Math.round(g.arr/1000)+'K' : g.arr}</span>
                                                            </div>
                                                            <div style={{ height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                                                                <div style={{ height: '5px', background: sc.text, borderRadius: '3px', width: pct + '%', opacity: 0.75 }} />
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
                            <span style={{ fontSize: '0.6875rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{pipelineFilteredOpps.length} deal{pipelineFilteredOpps.length !== 1 ? 's' : ''}</span>
                            <button onClick={() => { setEditingOpp(null); setShowModal(true); }} style={{ padding: '0.45rem 0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>+ New Deal</button>
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
                                style={{ padding: '0.3rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: bulkScoring ? '#f1f5f9' : '#fff', color: '#475569', fontSize: '0.75rem', fontWeight: '700', cursor: bulkScoring ? 'not-allowed' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                                {bulkScoring ? (
                                    <>
                                        <span style={{ width: '10px', height: '10px', border: '2px solid #94a3b8', borderTopColor: '#2563eb', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                                        Scoring {bulkScoreProgress?.done}/{bulkScoreProgress?.total}…
                                    </>
                                ) : '🤖 Score all deals'}
                            </button>
                        </div>
                    )}

                    {/* ════ FUNNEL VIEW ════ */}
                    {pipelineView === 'funnel' && (
                        <div style={{ display:'flex' }}>
                        <div style={{ flex:1, minWidth:0, borderRight: selectedPipelineOpp ? '1px solid #e2e8f0' : 'none' }}>
                        <div style={{ padding:'0.75rem 1rem' }}>
                            {stages.map((stage) => {
                                const stageOpps = pipelineFilteredOpps.filter(o => o.stage === stage);
                                const stageARR = stageOpps.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
                                const maxCount = Math.max(...stages.map(s2 => pipelineFilteredOpps.filter(o => o.stage === s2).length), 1);
                                const pct = stageOpps.length === 0 ? 0 : Math.max(4, Math.round((stageOpps.length / maxCount) * 100));
                                const sc = getStageColor(stage);
                                const isExp = funnelExpandedStage === stage;
                                const stDef = (settings.funnelStages||[]).find(s2 => s2.name === stage);
                                return (
                                    <div key={stage} style={{ marginBottom:'0.5rem' }}>
                                        <div onClick={() => setFunnelExpandedStage(isExp ? null : stage)}
                                            style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.5rem 0.75rem', borderRadius:'8px', background:'#f8fafc', border:'1px solid #e2e8f0', cursor:'pointer', transition:'all 0.15s' }}
                                            onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'}
                                            onMouseLeave={e => e.currentTarget.style.background='#f8fafc'}>
                                            <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:sc.text, flexShrink:0 }} />
                                            <span style={{ fontSize:'0.8125rem', fontWeight:'700', color:'#1e293b', width:'160px', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{stage}</span>
                                            <div style={{ flex:1, height:'10px', background:'#e2e8f0', borderRadius:'5px', overflow:'hidden' }}>
                                                <div style={{ height:'100%', width:pct+'%', background:sc.text, opacity:0.75, borderRadius:'5px', transition:'width 0.4s ease' }} />
                                            </div>
                                            <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#475569', minWidth:'28px', textAlign:'right' }}>{stageOpps.length}</span>
                                            <span style={{ fontSize:'0.6875rem', color:'#94a3b8', minWidth:'75px', textAlign:'right' }}>${stageARR >= 1000 ? Math.round(stageARR/1000)+'K' : stageARR.toLocaleString()}</span>
                                            {stDef && <span style={{ fontSize:'0.625rem', color:'#94a3b8', minWidth:'48px', textAlign:'right' }}>{stDef.weight}%</span>}
                                            <span style={{ fontSize:'0.75rem', color:'#94a3b8', transition:'transform 0.2s', transform: isExp ? 'rotate(180deg)' : 'none' }}>▼</span>
                                        </div>
                                        {isExp && stageOpps.length > 0 && (
                                            <div style={{ marginTop:'3px', marginLeft:'1rem', display:'flex', flexDirection:'column', gap:'3px' }}>
                                                {stageOpps.map(opp => (
                                                    <div key={opp.id}
                                                        style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.375rem 0.75rem', background: selectedPipelineOpp?.id === opp.id ? '#eff6ff' : '#fff', border: selectedPipelineOpp?.id === opp.id ? '1px solid #93c5fd' : '1px solid #f1f5f9', borderRadius:'6px', fontSize:'0.75rem', color:'#1e293b' }}
                                                        onMouseEnter={e => { if (selectedPipelineOpp?.id !== opp.id) e.currentTarget.style.background='#f8fafc'; }}
                                                        onMouseLeave={e => { if (selectedPipelineOpp?.id !== opp.id) e.currentTarget.style.background='#fff'; }}>
                                                        <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:sc.text, flexShrink:0 }} />
                                                        <span style={{ fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{opp.opportunityName || opp.account || '—'}</span>
                                                        {opp.account && opp.opportunityName && <span style={{ color:'#94a3b8', flexShrink:0, fontSize:'0.6875rem' }}>{opp.account}</span>}
                                                        <span style={{ fontWeight:'700', color:'#2563eb', flexShrink:0 }}>${(parseFloat(opp.arr)||0).toLocaleString()}</span>
                                                        {opp.salesRep && <span style={{ color:'#94a3b8', fontSize:'0.6875rem', flexShrink:0 }}>{opp.salesRep}</span>}
                                                        {opp.forecastedCloseDate && <span style={{ color:'#94a3b8', fontSize:'0.6875rem', flexShrink:0 }}>{new Date(opp.forecastedCloseDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>}
                                                        <button onClick={e => { e.stopPropagation(); setSelectedPipelineOpp(selectedPipelineOpp?.id === opp.id ? null : opp); }} style={{ padding:'2px 10px', borderRadius:'999px', border:'none', background: selectedPipelineOpp?.id === opp.id ? '#1d4ed8' : '#2563eb', color:'#fff', fontWeight:'600', fontSize:'0.6rem', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0 }}>Details</button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        </div>{/* end funnel content */}
                        {selectedPipelineOpp && (() => {
                            const opp = selectedPipelineOpp;
                            const health = calculateDealHealth(opp);
                            const stageDefault = (settings.funnelStages || []).find(s => s.name === opp.stage);
                            const defaultProb = stageDefault ? stageDefault.weight : null;
                            const effectiveProb = (opp.probability !== null && opp.probability !== undefined) ? opp.probability : defaultProb;
                            const isOverridden = opp.probability !== null && opp.probability !== undefined && opp.probability !== defaultProb;
                            const probNum = (opp.probability !== null && opp.probability !== undefined) ? opp.probability / 100 : (stageDefault ? stageDefault.weight / 100 : 0.3);
                            const totalVal = (parseFloat(opp.arr) || 0) + (opp.implementationCost || 0);
                            const weighted = Math.round(totalVal * probNum);
                            const oppActs = activities.filter(a => a.opportunityId === opp.id).sort((a,b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00'));
                            const daysSinceAct = oppActs[0] ? Math.floor((new Date() - new Date(oppActs[0].date)) / 86400000) : null;
                            const dealAgeDays = opp.createdDate ? Math.floor((new Date() - new Date(opp.createdDate + 'T12:00:00')) / 86400000) : null;
                            const timeInStageDays = opp.stageChangedDate ? Math.floor((new Date() - new Date(opp.stageChangedDate + 'T12:00:00')) / 86400000) : null;
                            return (
                                <div style={{ width:'300px', flexShrink:0, background:'#f8fafc', overflowY:'auto', padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem', maxHeight:'70vh', position:'sticky', top:0, borderLeft:'1px solid #e2e8f0' }}>
                                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'0.5rem' }}>
                                        <div>
                                            <div style={{ fontSize:'0.875rem', fontWeight:'700', color:'#0f172a', lineHeight:1.3 }}>{opp.opportunityName || opp.account}</div>
                                            <div style={{ fontSize:'0.75rem', color:'#64748b', marginTop:'0.2rem' }}>{opp.account}{opp.site ? ' · ' + opp.site : ''}</div>
                                        </div>
                                        <button onClick={() => setSelectedPipelineOpp(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:'1.1rem', lineHeight:1, padding:'0', flexShrink:0 }}>×</button>
                                    </div>
                                    <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
                                        <button className="btn" style={{ fontSize:'0.75rem', padding:'0.4rem 0.75rem', width:'100%' }} onClick={e => { e.stopPropagation(); handleEdit(opp); }}>✏️ Edit Opportunity</button>
                                        <div style={{ display:'flex', gap:'0.35rem' }}>
                                            <button className="btn btn-secondary" style={{ fontSize:'0.75rem', padding:'0.4rem 0', flex:1 }} onClick={e => { e.stopPropagation(); setActivityInitialContext({ opportunityId: opp.id, opportunityName: opp.opportunityName || opp.account, companyName: opp.account }); setEditingActivity(null); setShowActivityModal(true); }}>+ Activity</button>
                                            <button className="btn btn-secondary" style={{ fontSize:'0.75rem', padding:'0.4rem 0', flex:1 }} onClick={e => { e.stopPropagation(); setEditingTask({ relatedTo: opp.id, opportunityId: opp.id }); setShowTaskModal(true); }}>+ Task</button>
                                        </div>
                                        <button onClick={e => { e.stopPropagation(); showConfirm('Delete this opportunity?', () => handleDelete(opp.id)); }} style={{ fontSize:'0.6875rem', color:'#dc2626', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', padding:'0.1rem 0', textAlign:'left' }}>Delete…</button>
                                    </div>
                                    {opp.stage === 'Closed Won' ? (
                                        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 0.75rem', background:'#d1fae5', borderRadius:'6px', border:'1px solid #6ee7b7' }}>
                                            <span>✅</span><span style={{ fontSize:'0.8rem', fontWeight:'700', color:'#065f46' }}>Closed Won</span>
                                        </div>
                                    ) : (
                                        <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.5rem 0.75rem', background:'#fff', borderRadius:'6px', border:'1px solid #e2e8f0' }}>
                                            <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:health.color, flexShrink:0 }} />
                                            <span style={{ fontSize:'0.8rem', fontWeight:'600', color:health.color }}>{health.status}</span>
                                            <span style={{ fontSize:'0.75rem', color:'#94a3b8', marginLeft:'auto' }}>{health.score}/100</span>
                                        </div>
                                    )}
                                    <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                                        {[
                                            { label:'Stage', value: <span style={{ background:getStageColor(opp.stage).text+'22', color:getStageColor(opp.stage).text, padding:'0.15rem 0.5rem', borderRadius:'999px', fontSize:'0.75rem', fontWeight:'600' }}>{opp.stage}</span> },
                                            canViewField('arr') && { label:'Revenue', value:'$'+(opp.arr||0).toLocaleString() },
                                            canViewField('probability') && { label:'Probability', value:<span style={{ fontWeight:'600', color:isOverridden?'#f59e0b':'#475569' }}>{effectiveProb !== null ? effectiveProb+'%' : '—'}{isOverridden?' ✎':''}</span> },
                                            canViewField('weightedValue') && { label:'Weighted', value:'$'+weighted.toLocaleString() },
                                            { label:'Sales Rep', value:opp.salesRep||'—' },
                                            { label:'Close Date', value:opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—' },
                                            canViewField('dealAge') && dealAgeDays !== null && { label:'Deal Age', value:<span style={{ color:dealAgeDays>90?'#ef4444':dealAgeDays>60?'#f59e0b':'#475569', fontWeight:'600' }}>{dealAgeDays}d</span> },
                                            canViewField('activities') && { label:'Activities', value:<span>{oppActs.length}{daysSinceAct !== null && <span style={{ fontSize:'0.7rem', color:daysSinceAct>14?'#ef4444':'#94a3b8', marginLeft:'0.35rem' }}>{daysSinceAct}d ago</span>}</span> },
                                            opp.nextSteps && { label:'Next Steps', value:opp.nextSteps },
                                            opp.notes && { label:'Notes', value:opp.notes },
                                        ].filter(Boolean).map((row, ri) => (
                                            <div key={ri} style={{ display:'flex', flexDirection:'column', gap:'0.15rem' }}>
                                                <span style={{ fontSize:'0.65rem', textTransform:'uppercase', letterSpacing:'0.05em', color:'#94a3b8', fontWeight:'600' }}>{row.label}</span>
                                                <span style={{ fontSize:'0.8rem', color:'#1e293b' }}>{row.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}
                        </div>
                    )}

                    {/* ════ KANBAN VIEW ════ */}
                    {pipelineView === 'kanban' && (
                        <KanbanView
                            pipelineFilteredOpps={pipelineFilteredOpps}
                            kanbanDragging={kanbanDragging}
                            kanbanDragOver={kanbanDragOver}
                            setKanbanDragging={setKanbanDragging}
                            setKanbanDragOver={setKanbanDragOver}
                            handleEdit={handleEdit}
                            handleDelete={handleDelete}
                        />
                    )}


                    {/* ════ FULL-WIDTH TABLE ════ */}
                    {pipelineView === 'table' && (
                    <div className="table-container">
                        {/* ── Opportunities header: title + New button + count + CSV ── */}
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.625rem 1rem', borderBottom:'1px solid #e2e8f0', gap:'0.5rem' }}>
                            <h2 style={{ margin:0, fontSize:'0.75rem', fontWeight:'800', color:'#0f172a', textTransform:'uppercase', letterSpacing:'0.05em' }}>Opportunities</h2>
                            <div style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                                <span style={{ fontSize:'0.6875rem', color:'#94a3b8', fontWeight:'600' }}>{pipelineFilteredOpps.length} deals</span>
                                <button className="btn" onClick={handleAddNew} style={{ padding:'0.3rem 0.75rem', fontSize:'0.6875rem', fontWeight:'700' }}>+ New</button>
                            </div>
                        </div>
                        {selectedOpps.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 1.5rem', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: '700', fontSize: '0.8125rem', color: '#1d4ed8' }}>
                                    {selectedOpps.length} selected
                                </span>
                                <div style={{ width: '1px', height: '18px', background: '#bfdbfe' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Stage:</span>
                                    <select value={bulkAction.stage} onChange={e => setBulkAction(a => ({ ...a, stage: e.target.value }))}
                                        style={{ fontSize: '0.75rem', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.2rem 0.5rem', background: '#fff', color: '#1e293b', cursor: 'pointer' }}>
                                        <option value="">— pick stage —</option>
                                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                    {bulkAction.stage && (
                                        <button onClick={() => {
                                            const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
                                            setOpportunities(prev => prev.map(o => selectedOpps.includes(o.id) ? {
                                                ...o, stage: bulkAction.stage, stageChangedDate: today,
                                                stageHistory: [...(o.stageHistory||[]), { stage: bulkAction.stage, date: today, prevStage: o.stage, author: currentUser||'', timestamp: new Date().toISOString() }]
                                            } : o));
                                            setSelectedOpps([]); setBulkAction({ stage: '', rep: '' });
                                        }} style={{ padding: '0.2rem 0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            Apply
                                        </button>
                                    )}
                                </div>
                                <div style={{ width: '1px', height: '18px', background: '#bfdbfe' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>Assign to:</span>
                                    <select value={bulkAction.rep} onChange={e => setBulkAction(a => ({ ...a, rep: e.target.value }))}
                                        style={{ fontSize: '0.75rem', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.2rem 0.5rem', background: '#fff', color: '#1e293b', cursor: 'pointer' }}>
                                        <option value="">— pick rep —</option>
                                        {[...new Set((settings.users||[]).filter(u=>u.userType!=='Admin'&&u.userType!=='Manager').map(u=>u.name).filter(Boolean))].sort().map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                    {bulkAction.rep && (
                                        <button onClick={() => {
                                           setSelectedOpps([]); setBulkAction({ stage: '', rep: '' });
                                        }} style={{ padding: '0.2rem 0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            Apply
                                        </button>
                                    )}
 
                                </div>
                                <div style={{ width: '1px', height: '18px', background: '#bfdbfe' }} />
                                <button onClick={() => {
                                   showConfirm('Delete ' + selectedOpps.length + '...', () => {
    const idsToDelete = [...selectedOpps];
    const snapshot = [...opportunities];
    setOpportunities(prev => prev.filter(o => !idsToDelete.includes(o.id)));
    setSelectedOpps([]);
    idsToDelete.forEach(id => {
        dbFetch(`/.netlify/functions/opportunities?id=${id}`, { method: 'DELETE' })
            .catch(err => console.error('Failed to delete opportunity:', err));
    });
    softDelete(
        `${idsToDelete.length} opportunit${idsToDelete.length === 1 ? 'y' : 'ies'}`,
        () => {},
        () => {
            setOpportunities(snapshot);
            setUndoToast(null);
            // Re-insert the deleted opportunities back to the DB
            const deletedOpps = snapshot.filter(o => idsToDelete.includes(o.id));
            deletedOpps.forEach(o => {
                dbFetch('/.netlify/functions/opportunities', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(o),
                }).catch(err => console.error('Failed to restore opportunity to DB:', err));
            });
        }
    );
});
                                }} style={{ padding: '0.2rem 0.625rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    🗑 Delete
                                </button>
                                <div style={{ width: '1px', height: '18px', background: '#bfdbfe' }} />
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>📋 Task:</span>
                                    <input
                                        placeholder="Task title…"
                                        id="bulk-task-title-input"
                                        style={{ fontSize: '0.75rem', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '0.2rem 0.5rem', background: '#fff', color: '#1e293b', width: '140px' }}
                                    />
                                    <button onClick={() => {
                                        const titleEl = document.getElementById('bulk-task-title-input');
                                        const title = titleEl ? titleEl.value.trim() : '';
                                        if (!title) return;
                                        const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
                                        const newTasks = selectedOpps.map(oppId => {
                                            const opp = (opportunities || []).find(o => o.id === oppId);
                                            const newTask = { id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2,6), title, type: 'Follow-up', status: 'Open', dueDate: today, assignedTo: opp?.salesRep || currentUser, relatedTo: oppId, opportunityId: oppId, account: opp?.account || '', createdAt: new Date().toISOString() };
                                            dbFetch('/.netlify/functions/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newTask) }).catch(console.error);
                                            return newTask;
                                        });
                                        setTasks(prev => [...prev, ...newTasks]);
                                        if (titleEl) titleEl.value = '';
                                        setSelectedOpps([]); setBulkAction({ stage: '', rep: '' });
                                    }} style={{ padding: '0.2rem 0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                        Create
                                    </button>
                                </div>
                                <button onClick={() => { setSelectedOpps([]); setBulkAction({ stage: '', rep: '' }); }}
                                    style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#64748b', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600' }}>
                                    Clear selection ✕
                                </button>
                            </div>
                        )}

                        <div className="table-wrapper">
                            {/* Mobile cards — Opportunities (pipeline tab) */}
                            <div className="opp-mobile-cards" style={{ padding: '0.75rem' }}>
                                {pipelineFilteredOpps.length === 0 ? (
                                    <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.875rem' }}>No opportunities found</div>
                                ) : pipelineFilteredOpps.map(opp => {
                                    const health = calculateDealHealth(opp);
                                    return (
                                        <div key={opp.id} className="mobile-record-card" onClick={() => { setEditingOpp(opp); setShowModal(true); }}>
                                            <div className="mobile-card-top">
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div className="mobile-card-title" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{opp.opportunityName || opp.account}</div>
                                                    <div className="mobile-card-sub">{opp.account}{opp.site ? ' · ' + opp.site : ''}{opp.salesRep ? ` · ${opp.salesRep}` : ''}</div>
                                                </div>
                                                {canViewField('arr') && <div className="mobile-card-arr">${(parseFloat(opp.arr)||0).toLocaleString()}</div>}
                                            </div>
                                            <div className="mobile-card-meta">
                                                <span style={{ background: getStageColor(opp.stage).text+'22', color: getStageColor(opp.stage).text, padding:'0.125rem 0.5rem', borderRadius:'999px', fontSize:'0.6875rem', fontWeight:'700' }}>{opp.stage}</span>
                                                <span style={{ width:'8px', height:'8px', borderRadius:'50%', background: health.color, display:'inline-block' }} />
                                                <span className="mobile-card-meta-item" style={{ color: health.color, fontWeight:'600' }}>{health.status}</span>
                                                {opp.forecastedCloseDate && <span className="mobile-card-meta-item">📅 {new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>}
                                            </div>
                                            <div className="mobile-card-actions" onClick={e => e.stopPropagation()}>
                                                <button className="primary" onClick={() => { setEditingOpp(opp); setShowModal(true); }}>✏️ Edit</button>
                                                <button onClick={() => { const s = document.createElement('select'); stages.forEach(st => { const o = document.createElement('option'); o.value=st; o.text=st; if(st===opp.stage) o.selected=true; s.appendChild(o); }); }}>Stage ▾</button>
                                                {canEdit && <button onClick={() => { showConfirm('Delete this opportunity?', () => handleDelete(opp.id)); }} style={{ color:'#ef4444', borderColor:'#fecaca' }}>🗑</button>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Desktop table — hidden on mobile */}
                            <div className="opp-desktop-wrap">
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', padding: '0.3rem 1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>👆 Click any row to view full details</div>
                            <div className="opp-split-layout">
                            <div className="opp-desktop-table" style={{ borderRight: selectedPipelineOpp ? '1px solid #e2e8f0' : 'none' }}>
                            {/* Stale deals warning banner */}
                            {(() => {
                                const staleDeals = pipelineFilteredOpps.filter(opp => {
                                    if (opp.stage === 'Closed Won' || opp.stage === 'Closed Lost') return false;
                                    if (!opp.stageChangedDate) return false;
                                    const days = Math.floor((new Date() - new Date(opp.stageChangedDate + 'T12:00:00')) / 86400000);
                                    return days > 30;
                                });
                                const noActivityDeals = pipelineFilteredOpps.filter(opp => {
                                    if (opp.stage === 'Closed Won' || opp.stage === 'Closed Lost') return false;
                                    return activities.filter(a => a.opportunityId === opp.id).length === 0;
                                });
                                if (staleDeals.length === 0 && noActivityDeals.length === 0) return null;
                                return (
                                    <div style={{ padding: '0.625rem 1rem', background: '#fffbeb', border: '1px solid #fde68a', borderBottom: '1px solid #fde68a', display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#92400e' }}>⚠ Pipeline Attention</span>
                                        {staleDeals.length > 0 && (
                                            <span style={{ fontSize: '0.75rem', color: '#b45309' }}>
                                                <strong>{staleDeals.length}</strong> deal{staleDeals.length > 1 ? 's' : ''} stuck in stage &gt;30 days
                                                {staleDeals.length <= 3 && ': ' + staleDeals.map(o => o.account || o.opportunityName).join(', ')}
                                            </span>
                                        )}
                                        {staleDeals.length > 0 && noActivityDeals.length > 0 && <span style={{ color: '#fbbf24' }}>·</span>}
                                        {noActivityDeals.length > 0 && (
                                            <span style={{ fontSize: '0.75rem', color: '#b45309' }}>
                                                <strong>{noActivityDeals.length}</strong> open deal{noActivityDeals.length > 1 ? 's' : ''} with no activities logged
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '36px' }}>
                                            <input type="checkbox"
                                                checked={pipelineFilteredOpps.length > 0 && selectedOpps.length === pipelineFilteredOpps.length}
                                                onChange={e => setSelectedOpps(e.target.checked ? pipelineFilteredOpps.map(o => o.id) : [])}
                                                style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#2563eb' }}
                                            />
                                        </th>
                                        <th style={{ width: '80px' }}>Health</th>
                                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (pipelineSortField === 'salesRep') setPipelineSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setPipelineSortField('salesRep'); setPipelineSortDir('asc'); } }}>Sales Rep {pipelineSortField === 'salesRep' ? (pipelineSortDir === 'asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (pipelineSortField === 'account') setPipelineSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setPipelineSortField('account'); setPipelineSortDir('asc'); } }}>Account {pipelineSortField === 'account' ? (pipelineSortDir === 'asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th>Opportunity</th>
                                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (pipelineSortField === 'stage') setPipelineSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setPipelineSortField('stage'); setPipelineSortDir('asc'); } }}>Stage {pipelineSortField === 'stage' ? (pipelineSortDir === 'asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        {canViewField('arr') && <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (pipelineSortField === 'arr') setPipelineSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setPipelineSortField('arr'); setPipelineSortDir('desc'); } }}>Revenue {pipelineSortField === 'arr' ? (pipelineSortDir === 'asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>}
                                        <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => { if (pipelineSortField === 'closeDate') setPipelineSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setPipelineSortField('closeDate'); setPipelineSortDir('asc'); } }}>Close Date {pipelineSortField === 'closeDate' ? (pipelineSortDir === 'asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th style={{ width: '130px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pipelineFilteredOpps
                                        .filter(opp => {
                                            if (pipelineQuarterFilter.length === 0) return true;
                                            const opts = window.__pipelineFilterOptions || [];
                                            return pipelineQuarterFilter.some(key => {
                                                const opt = opts.find(o => o.key === key);
                                                return opt && opt.match(opp);
                                            });
                                        })
                                        .filter(opp => {
                                            if (pipelineStageFilter.length === 0) return true;
                                            if (pipelineStageFilter.includes('__allOpen__')) return opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost';
                                            return pipelineStageFilter.includes(opp.stage);
                                        })
                                        .filter(opp => {
                                            if (pipelineRepFilter.length === 0) return true;
                                            return pipelineRepFilter.includes(opp.salesRep) || pipelineRepFilter.includes(opp.assignedTo);
                                        })
                                        .filter(opp => {
                                            if (pipelineTeamFilter.length === 0) return true;
                                            const rep = opp.salesRep || opp.assignedTo;
                                            const userRec = (settings.users || []).find(u => u.name === rep);
                                            return userRec && pipelineTeamFilter.includes(userRec.team);
                                        })
                                        .filter(opp => {
                                            if (pipelineTerritoryFilter.length === 0) return true;
                                            const rep = opp.salesRep || opp.assignedTo;
                                            const userRec = (settings.users || []).find(u => u.name === rep);
                                            return userRec && pipelineTerritoryFilter.includes(userRec.territory);
                                        })
                                        .sort((a, b) => {
                                            const dir = pipelineSortDir === 'asc' ? 1 : -1;
                                            switch (pipelineSortField) {
                                                case 'salesRep': return dir * (a.salesRep || '').localeCompare(b.salesRep || '');
                                                case 'account': return dir * (a.account || '').localeCompare(b.account || '');
                                                case 'stage': {
                                                    const order = ['Qualification','Discovery','Evaluation (Demo)','Proposal','Negotiation/Review','Contracts','Closed Won','Closed Lost'];
                                                    return dir * (order.indexOf(a.stage) - order.indexOf(b.stage));
                                                }
                                                case 'arr': return dir * ((a.arr || 0) - (b.arr || 0));
                                                case 'closeDate': return dir * (new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999'));
                                                case 'closeQuarter': return dir * (a.closeQuarter || '').localeCompare(b.closeQuarter || '');
                                                default: return dir * (new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999'));
                                            }
                                        })
                                        .map((opp, oppIdx) => {
                                            const health = calculateDealHealth(opp);
                                            return (
                                        <React.Fragment key={opp.id}>
                                        <tr
                                            style={{ background: selectedPipelineOpp?.id === opp.id ? '#eff6ff' : selectedOpps.includes(opp.id) ? '#dbeafe' : oppIdx % 2 === 0 ? '#ffffff' : '#f8fafc', borderLeft: selectedPipelineOpp?.id === opp.id ? '3px solid #2563eb' : '3px solid transparent' }}
                                        >
                                            <td style={{ width: '36px' }} onClick={e => e.stopPropagation()}>
                                                <input type="checkbox"
                                                    checked={selectedOpps.includes(opp.id)}
                                                    onChange={e => setSelectedOpps(prev => e.target.checked ? [...prev, opp.id] : prev.filter(id => id !== opp.id))}
                                                    style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: '#2563eb' }}
                                                />
                                            </td>
                                            <td style={{ position: 'relative' }}>
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.5rem',
                                                    cursor: 'pointer'
                                                }} onClick={(e) => { e.stopPropagation(); setHealthPopover(healthPopover === opp.id ? null : opp.id); }}>
                                                    <div style={{
                                                        width: '12px',
                                                        height: '12px',
                                                        borderRadius: '50%',
                                                        background: health.color
                                                    }} />
                                                    <span style={{ 
                                                        fontSize: '0.8125rem',
                                                        fontWeight: '600',
                                                        color: health.color
                                                    }}>
                                                        {health.status}
                                                    </span>
                                                </div>
                                                {healthPopover === opp.id && (
                                                    <div style={{
                                                        position: 'absolute', top: '100%', left: 0, zIndex: 1000,
                                                        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px',
                                                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: '0.875rem 1rem',
                                                        minWidth: '280px', marginTop: '0.25rem'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: health.color }} />
                                                                <span style={{ fontWeight: '700', fontSize: '0.875rem', color: health.color }}>{health.status}</span>
                                                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>({health.score}/100)</span>
                                                            </div>
                                                            <button onClick={(e) => { e.stopPropagation(); setHealthPopover(null); }}
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', padding: 0, lineHeight: 1 }}>×</button>
                                                        </div>
                                                        {health.reasons.map((reason, ri) => (
                                                            <div key={ri} style={{
                                                                display: 'flex', alignItems: 'flex-start', gap: '0.375rem',
                                                                padding: '0.3rem 0', fontSize: '0.8125rem', color: '#475569', lineHeight: 1.4
                                                            }}>
                                                                <span style={{ color: reason.includes('No activity in over') || reason.includes('overdue') || reason.includes('Stuck') || reason.includes('No activities logged') ? '#ef4444' : reason.includes('approaching') || reason.includes('In current stage for') ? '#f59e0b' : '#10b981', flexShrink: 0 }}>
                                                                    {reason.includes('No activity in over') || reason.includes('overdue') || reason.includes('Stuck') || reason.includes('No activities logged') ? '⚠' : reason.includes('approaching') || reason.includes('In current stage for') ? '○' : '✓'}
                                                                </span>
                                                                <span>{reason}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{opp.salesRep || '-'}</td>
                                            <td>{opp.account}{opp.site ? ' · ' + opp.site : ''}</td>
                                            <td><span onClick={() => handleEdit(opp)} style={{ color: '#2563eb', fontWeight: '600', cursor: 'pointer', textDecoration: 'underline' }} onMouseEnter={e => e.currentTarget.style.color='#1d4ed8'} onMouseLeave={e => e.currentTarget.style.color='#2563eb'}>{opp.opportunityName || '-'}</span></td>
                                            <td onClick={e => e.stopPropagation()}>
                                                {inlineEdit && inlineEdit.oppId === opp.id && inlineEdit.field === 'stage' ? (
                                                    <select autoFocus
                                                        value={inlineEdit.value}
                                                        onChange={e => {
                                                            const newStage = e.target.value;
                                                            const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
                                                            const prevStageVal = opp.stage;
                                                            const updatedOpp = {
                                                                ...opp, stage: newStage,
                                                                stageChangedDate: today,
                                                                stageHistory: [...(opp.stageHistory || []), { stage: newStage, date: today, prevStage: opp.stage, author: currentUser || '', timestamp: new Date().toISOString() }]
                                                            };
                                                            setOpportunities(prev => prev.map(o => o.id === opp.id ? updatedOpp : o));
                                                            dbFetch('/.netlify/functions/opportunities', {
                                                                method: 'PUT',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify(updatedOpp)
                                                            }).catch(err => console.error('Failed to save stage change:', err));
                                                            addAudit('update', 'opportunity', opp.id, opp.opportunityName || opp.account || opp.id, `Stage: ${prevStageVal} → ${newStage}`);
                                                            setInlineEdit(null);
                                                        }}
                                                        onBlur={() => setInlineEdit(null)}
                                                        onKeyDown={e => { if (e.key === 'Escape') setInlineEdit(null); }}
                                                        style={{ fontSize: '0.6875rem', fontWeight: '600', border: '1.5px solid #2563eb', borderRadius: '6px', padding: '0.1rem 0.25rem', outline: 'none', background: '#fff', cursor: 'pointer', color: '#1e293b' }}>
                                                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                ) : (
                                                    <span title="Click to change stage"
                                                        onClick={() => setInlineEdit({ oppId: opp.id, field: 'stage', value: opp.stage })}
                                                        style={{ background: getStageColor(opp.stage).text + '22', color: getStageColor(opp.stage).text, padding: '0.125rem 0.5rem', borderRadius: '999px', fontSize: '0.6875rem', fontWeight: '600', whiteSpace: 'nowrap', display: 'inline-block', cursor: 'pointer', transition: 'opacity 0.1s' }}
                                                        onMouseEnter={e => e.currentTarget.style.opacity = '0.75'}
                                                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                                        {opp.stage} ✎
                                                    </span>
                                                )}
                                            </td>
{canViewField('arr') && (
                                            <td onClick={e => e.stopPropagation()}>
                                                {inlineEdit && inlineEdit.oppId === opp.id && inlineEdit.field === 'arr' ? (
                                                    <input autoFocus type="number" min="0"
                                                        defaultValue={opp.arr}
                                                        onBlur={e => {
                                                            const val = Math.max(0, parseInt(e.target.value) || 0);
                                                            setOpportunities(prev => prev.map(o => o.id === opp.id ? { ...o, arr: val } : o));
                                                            setInlineEdit(null);
                                                        }}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') e.target.blur();
                                                            if (e.key === 'Escape') setInlineEdit(null);
                                                        }}
                                                        style={{ width: '90px', fontSize: '0.8125rem', fontWeight: '600', border: '1.5px solid #2563eb', borderRadius: '6px', padding: '0.1rem 0.35rem', outline: 'none', color: '#1e293b' }}
                                                    />
                                                ) : (
                                                    <span title="Click to edit ARR"
                                                        onClick={() => setInlineEdit({ oppId: opp.id, field: 'arr', value: opp.arr })}
                                                        style={{ cursor: 'pointer', display: 'inline-block', transition: 'opacity 0.1s' }}
                                                        onMouseEnter={e => e.currentTarget.style.opacity = '0.65'}
                                                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                                                        ${opp.arr.toLocaleString()} ✎
                                                    </span>
                                                )}
                                            </td>
)}
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                {new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap' }}>
                                                <button onClick={e => { e.stopPropagation(); setSelectedPipelineOpp(selectedPipelineOpp?.id === opp.id ? null : opp); }} style={{ padding: '4px 12px', borderRadius: '999px', border: 'none', background: selectedPipelineOpp?.id === opp.id ? '#1d4ed8' : '#2563eb', color: '#fff', fontWeight: '600', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Details</button>
                                            </td>
                                        </tr>
                                        {/* Activity log expand panel */}
                                        {!selectedPipelineOpp && expandedOppActivities[opp.id] === true && (() => {
                                            const oppActs = activities.filter(a => a.opportunityId === opp.id)
                                                .sort((a, b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00'));
                                            if (oppActs.length === 0) return null;
                                            return (
                                                <tr key={opp.id + '-acts'} style={{ background: '#f8fafc' }}>
                                                    <td colSpan={99} style={{ padding: '0.5rem 1rem 0.5rem 2.5rem', borderBottom: '2px solid #e2e8f0' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                                                            <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Activity Log</span>
                                                            <span style={{ fontSize: '0.625rem', background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.4rem', borderRadius: '999px', fontWeight: '700' }}>{oppActs.length}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                            {oppActs.slice(0, 5).map(a => (
                                                                <div key={a.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.25rem 0.625rem', fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                                                    <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.05rem 0.35rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '700', flexShrink: 0 }}>{a.type}</span>
                                                                    <span style={{ color: '#94a3b8', flexShrink: 0 }}>{a.date ? new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
                                                                    {a.notes && <span style={{ color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.notes}</span>}
                                                                </div>
                                                            ))}
                                                            {oppActs.length > 5 && <span style={{ fontSize: '0.75rem', color: '#94a3b8', alignSelf: 'center' }}>+{oppActs.length - 5} more</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })()}
                                        </React.Fragment>
                                    );
                                })}
                                </tbody>
                            </table>
                            </div>{/* overflow wrapper */}
                            </div>
                            {/* ── Option 5 Detail Panel ── */}
                            {selectedPipelineOpp && (() => {
                                const opp = selectedPipelineOpp;
                                const health = calculateDealHealth(opp);
                                const stageDefault = (settings.funnelStages || []).find(s => s.name === opp.stage);
                                const defaultProb = stageDefault ? stageDefault.weight : null;
                                const effectiveProb = (opp.probability !== null && opp.probability !== undefined) ? opp.probability : defaultProb;
                                const isOverridden = opp.probability !== null && opp.probability !== undefined && opp.probability !== defaultProb;
                                const probNum = (opp.probability !== null && opp.probability !== undefined) ? opp.probability / 100 : (stageDefault ? stageDefault.weight / 100 : 0.3);
                                const totalVal = (parseFloat(opp.arr) || 0) + (opp.implementationCost || 0);
                                const weighted = Math.round(totalVal * probNum);
                                const oppActs = activities.filter(a => a.opportunityId === opp.id).sort((a,b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00'));
                                const lastAct = oppActs[0];
                                const daysSinceAct = lastAct ? Math.floor((new Date() - new Date(lastAct.date + 'T12:00:00')) / 86400000) : null;
                                const dealAgeDays = opp.createdDate ? Math.floor((new Date() - new Date(opp.createdDate + 'T12:00:00')) / 86400000) : null;
                                const timeInStageDays = opp.stageChangedDate ? Math.floor((new Date() - new Date(opp.stageChangedDate + 'T12:00:00')) / 86400000) : null;
                                return (
                                    <div style={{
                                        width: '300px', flexShrink: 0, background: '#f8fafc',
                                        overflowY: 'auto', padding: '1rem',
                                        display: 'flex', flexDirection: 'column', gap: '0.75rem',
                                        height: '520px', position: 'sticky', top: 0, borderLeft: '1px solid #e2e8f0'
                                    }}>
                                        {/* Header */}
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                                            <div>
                                                <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#0f172a', lineHeight: 1.3 }}>{opp.opportunityName || opp.account}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>{opp.account}{opp.site ? ' · ' + opp.site : ''}</div>
                                            </div>
                                            <button onClick={e => { e.stopPropagation(); setSelectedPipelineOpp(null); }}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.1rem', lineHeight: 1, padding: '0', flexShrink: 0 }}>×</button>
                                        </div>
                                        {/* Action buttons */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                            <button className="btn" style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', width: '100%' }}
                                                onClick={e => { e.stopPropagation(); handleEdit(opp); }}>✏️ Edit Opportunity</button>
                                            <div style={{ display:'flex', gap:'0.35rem' }}>
                                                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.4rem 0', flex:1 }}
                                                    onClick={e => { e.stopPropagation(); setActivityInitialContext({ opportunityId: opp.id, opportunityName: opp.opportunityName || opp.account, companyName: opp.account }); setEditingActivity(null); setShowActivityModal(true); }}>+ Activity</button>
                                                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.4rem 0', flex:1 }}
                                                    onClick={e => { e.stopPropagation(); setEditingTask({ relatedTo: opp.id, opportunityId: opp.id }); setShowTaskModal(true); }}>+ Task</button>
                                            </div>
                                            {opp.stage === 'Closed Won' && (settings.spiffs||[]).filter(s=>s.active).length > 0 && (
                                                <button className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem', width: '100%', borderColor: '#7c3aed', color: '#7c3aed' }}
                                                    onClick={e => { e.stopPropagation(); setSpiffClaimContext({ opp }); setShowSpiffClaimModal(true); }}>⚡ Claim SPIFF</button>
                                            )}
                                            <button onClick={e => { e.stopPropagation(); showConfirm('Delete this opportunity?', () => handleDelete(opp.id)); }} style={{ fontSize:'0.6875rem', color:'#dc2626', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', padding:'0.1rem 0', textAlign:'left' }}>Delete…</button>
                                        </div>
                                        {/* Health */}
                                        {opp.stage === 'Closed Won' ? (
                                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 0.75rem', background:'#d1fae5', borderRadius:'6px', border:'1px solid #6ee7b7' }}>
                                                <span style={{ fontSize:'1rem' }}>✅</span>
                                                <span style={{ fontSize:'0.8rem', fontWeight:'700', color:'#065f46' }}>Closed Won</span>
                                                {opp.forecastedCloseDate && <span style={{ fontSize:'0.75rem', color:'#059669', marginLeft:'auto' }}>{new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>}
                                            </div>
                                        ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.75rem', background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: health.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: health.color }}>{health.status}</span>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 'auto' }}>{health.score}/100</span>
                                        </div>
                                        )}
                                        {/* Stage */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            {[
                                                { label: 'Stage', value: <span style={{ background: getStageColor(opp.stage).text + '22', color: getStageColor(opp.stage).text, padding: '0.35rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600' }}>{opp.stage}</span> },
                                                canViewField('arr') && { label: 'Revenue', value: '$' + (opp.arr || 0).toLocaleString() },
                                                canViewField('implCost') && opp.implementationCost > 0 && { label: 'Impl. Cost', value: '$' + (opp.implementationCost || 0).toLocaleString() },
                                                canViewField('probability') && { label: 'Probability', value: <span style={{ fontWeight: '600', color: isOverridden ? '#f59e0b' : '#475569' }}>{effectiveProb !== null ? effectiveProb + '%' : '—'}{isOverridden ? ' ✎' : ''}</span> },
                                                canViewField('weightedValue') && { label: 'Weighted Value', value: '$' + weighted.toLocaleString() },
                                                { label: 'Sales Rep', value: opp.salesRep || '—' },
                                                { label: 'Close Date', value: opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
                                                { label: 'Close Quarter', value: opp.closeQuarter || '—' },
                                                canViewField('dealAge') && dealAgeDays !== null && { label: 'Deal Age', value: <span style={{ color: dealAgeDays > 90 ? '#ef4444' : dealAgeDays > 60 ? '#f59e0b' : '#475569', fontWeight: '600' }}>{dealAgeDays}d</span> },
                                                canViewField('timeInStage') && timeInStageDays !== null && { label: 'Time in Stage', value: <span style={{ color: (opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost' && timeInStageDays > 30) ? '#ef4444' : '#475569', fontWeight: '600' }}>{timeInStageDays}d</span> },
                                                canViewField('activities') && { label: 'Activities', value: <span>{oppActs.length}{daysSinceAct !== null ? <span style={{ fontSize: '0.7rem', color: daysSinceAct > 14 ? '#ef4444' : '#94a3b8', marginLeft: '0.35rem' }}>{daysSinceAct}d ago</span> : null}</span> },
                                                canViewField('nextSteps') && opp.nextSteps && { label: 'Next Steps', value: opp.nextSteps },
                                                opp.notes && { label: 'Notes', value: opp.notes },
                                                (opp.stage === 'Closed Lost' && opp.lostCategory) && { label: 'Loss Reason', value: <span style={{ color: '#b91c1c', fontWeight: '600' }}>{opp.lostCategory}{opp.lostReason ? ' — ' + opp.lostReason : ''}</span> },
                                            ].filter(Boolean).map((row, ri) => (
                                                <div key={ri} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', fontWeight: '600' }}>{row.label}</span>
                                                    <span style={{ fontSize: '0.8rem', color: '#1e293b' }}>{row.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                        {/* Activity timeline in panel */}
                                        <div style={{ paddingTop: '0.5rem', borderTop: '1px solid #e2e8f0' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    Activity Timeline
                                                    {oppActs.length > 0 && <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.35rem', borderRadius: '999px', fontWeight: '700', marginLeft: '0.375rem' }}>{oppActs.length}</span>}
                                                </div>
                                                <button onClick={e => { e.stopPropagation(); setActivityInitialContext({ opportunityId: opp.id, opportunityName: opp.opportunityName || opp.account, companyName: opp.account }); setEditingActivity(null); setShowActivityModal(true); }}
                                                    style={{ fontSize: '0.6rem', fontWeight: '700', color: '#2563eb', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '4px', padding: '0.15rem 0.4rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                                                    + Log
                                                </button>
                                            </div>
                                            {oppActs.length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: '0.75rem 0', color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic' }}>No activities yet</div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                                                    {(() => {
                                                        const actTypeIcons = { Call: '📞', Email: '📧', Meeting: '🤝', Demo: '💻', 'Proposal Sent': '📄', 'Follow-up': '🔄', Note: '📝', Other: '📝' };
                                                        const actTypeColors = { Call: '#dbeafe', Email: '#fce7f3', Meeting: '#d1fae5', Demo: '#ede9fe', 'Proposal Sent': '#fef3c7', 'Follow-up': '#ffedd5', Note: '#f1f5f9', Other: '#f1f5f9' };
                                                        const actTypeText = { Call: '#1e40af', Email: '#9d174d', Meeting: '#065f46', Demo: '#5b21b6', 'Proposal Sent': '#92400e', 'Follow-up': '#9a3412', Note: '#475569', Other: '#475569' };
                                                        const sorted = [...oppActs].sort((a,b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));
                                                        return sorted.slice(0, 10).map((a, idx) => {
                                                            const icon = actTypeIcons[a.type] || '📝';
                                                            const bg = actTypeColors[a.type] || '#f1f5f9';
                                                            const tc = actTypeText[a.type] || '#475569';
                                                            const dateStr = a.date ? new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
                                                            const isLast = idx === Math.min(sorted.length, 10) - 1;
                                                            return (
                                                                <div key={a.id} style={{ display: 'flex', gap: '0.5rem', paddingBottom: isLast ? '0' : '0.5rem', position: 'relative' }}>
                                                                    {/* Timeline spine */}
                                                                    {!isLast && <div style={{ position: 'absolute', left: '11px', top: '22px', bottom: '0', width: '1px', background: '#e2e8f0' }} />}
                                                                    {/* Icon dot */}
                                                                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: bg, border: '1px solid ' + tc + '44', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0, zIndex: 1 }}>{icon}</div>
                                                                    {/* Content */}
                                                                    <div style={{ flex: 1, minWidth: 0, paddingBottom: '0.35rem' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                                                                            <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: tc, background: bg, padding: '0.05rem 0.35rem', borderRadius: '3px' }}>{a.type || 'Activity'}</span>
                                                                            <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>{dateStr}</span>
                                                                            {a.author && <span style={{ fontSize: '0.6rem', color: '#94a3b8', marginLeft: 'auto' }}>{a.author.split(' ')[0]}</span>}
                                                                        </div>
                                                                        {a.notes && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{a.notes}</div>}
                                                                    </div>
                                                                </div>
                                                            );
                                                        });
                                                    })()}
                                                    {oppActs.length > 10 && <div style={{ fontSize: '0.7rem', color: '#94a3b8', textAlign: 'center', paddingTop: '0.25rem' }}>+{oppActs.length - 10} more activities</div>}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                            </div>{/* end opp-split-layout */}
                            </div>{/* end opp-desktop-wrap */}
                        </div>
                    </div>
                    )}
                    </div>{/* end spt-pipeline-desktop */}

                </div>
            
    );
}
