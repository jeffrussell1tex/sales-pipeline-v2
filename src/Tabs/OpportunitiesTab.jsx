import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';
import { SliceDropdown } from '../components/ui/ViewingBar';

export default function OpportunitiesTab() {
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
        activePipeline,
        allPipelines,
        handleDelete,
        handleSave,
        completeLostSave,
        setEditingOpp, setShowModal,
        setActivityInitialContext, setEditingActivity, setShowActivityModal,
        setEditingTask, setShowTaskModal,
        setSpiffClaimContext, setShowSpiffClaimModal,
        setLostReasonModal,
        setCsvImportType, setShowCsvImportModal,
        isMobile,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;

    // Kanban drag/drop
    const handleKanbanDrop = (toStage) => {
        if (!kanbanDragging || kanbanDragging.fromStage === toStage) {
            setKanbanDragging(null); setKanbanDragOver(null); return;
        }
        const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
        const opp = opportunities.find(o => o.id === kanbanDragging.oppId);
        if (!opp) { setKanbanDragging(null); setKanbanDragOver(null); return; }
        const updatedOpp = {
            ...opp, stage: toStage, stageChangedDate: today,
            stageHistory: [...(opp.stageHistory||[]), { stage: toStage, date: today, prevStage: opp.stage, author: currentUser||'', timestamp: new Date().toISOString() }]
        };
        setOpportunities(prev => prev.map(o => o.id === updatedOpp.id ? updatedOpp : o));
        dbFetch('/.netlify/functions/opportunities', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(updatedOpp) }).catch(console.error);
        setKanbanDragging(null); setKanbanDragOver(null);
    };

    // UI handlers
    const handleAddNew = () => { setEditingOpp(null); setShowModal(true); };
    const handleEdit = (opp) => { setEditingOpp(opp); setShowModal(true); };

    // Local state
    const [oppTabView, setOppTabView] = useState(() => localStorage.getItem('tab:opps:view') || 'list');
    const [oppTabFunnelExpanded, setOppTabFunnelExpanded] = useState(null);
    const [oppQuarterFilter, setOppQuarterFilter] = useState([]);
    const [oppStageFilter, setOppStageFilter] = useState([]);
    const [oppRepFilter, setOppRepFilter] = useState([]);
    const [oppTeamFilter, setOppTeamFilter] = useState([]);
    const [oppTerritoryFilter, setOppTerritoryFilter] = useState([]);
    const [selectedOppTabOpp, setSelectedOppTabOpp] = useState(null);
    const [selectedOpps, setSelectedOpps] = useState([]);
    const [bulkAction, setBulkAction] = useState({ stage: '', rep: '' });
    const [expandedOppActivities, setExpandedOppActivities] = useState({});
    const [oppSortField, setOppSortField] = useState('closeDate');
    const [oppSortDir, setOppSortDir] = useState('asc');
    const [inlineEdit, setInlineEdit] = useState(null);
    const [healthPopover, setHealthPopover] = useState(null);
    const [kanbanDragging, setKanbanDragging] = useState(null);
    const [kanbanDragOver, setKanbanDragOver] = useState(null);


                // ── Opp-tab filtered set (driven by opp-tab filters below) ──
                const todayOpp = new Date();
                const currentQOpp = getQuarter(todayOpp.toISOString().split('T')[0]);
                const currentQLOpp = getQuarterLabel(currentQOpp, todayOpp.toISOString().split('T')[0]);
                const qNumOpp = parseInt(currentQOpp.replace('Q', ''));
                const nextQOpp = 'Q' + (qNumOpp < 4 ? qNumOpp + 1 : 1);
                const nextMonthOpp = new Date(todayOpp);
                nextMonthOpp.setMonth(todayOpp.getMonth() + 3);
                const nextQLOpp = getQuarterLabel(nextQOpp, nextMonthOpp.toISOString().split('T')[0]);
                const oppTimeFilterOpts = [
                    { key: 'currentQ',    label: 'Current Qtr',  match: o => o.closeQuarter === currentQLOpp },
                    { key: 'currentNextQ',label: 'Cur + Next',   match: o => o.closeQuarter === currentQLOpp || o.closeQuarter === nextQLOpp },
                    { key: 'annual',      label: 'Annual',       match: o => { const fy = currentQLOpp.split(' ')[0]; return o.closeQuarter && o.closeQuarter.startsWith(fy); }},
                    { key: 'Q1', label: 'Q1', match: o => o.closeQuarter && o.closeQuarter.includes('Q1') },
                    { key: 'Q2', label: 'Q2', match: o => o.closeQuarter && o.closeQuarter.includes('Q2') },
                    { key: 'Q3', label: 'Q3', match: o => o.closeQuarter && o.closeQuarter.includes('Q3') },
                    { key: 'Q4', label: 'Q4', match: o => o.closeQuarter && o.closeQuarter.includes('Q4') },
                ];
                const oppAllReps = canSeeAll ? [...new Set([
                    ...(settings.users||[]).filter(u => u.name).map(u => u.name),
                    ...visibleOpportunities.filter(o => o.salesRep).map(o => o.salesRep)
                ])].sort() : [];
                const oppAllTeams = canSeeAll ? [...new Set((settings.users||[]).filter(u => u.team).map(u => u.team))].sort() : [];
                const oppAllTerritories = canSeeAll ? [...new Set((settings.users||[]).filter(u => u.territory).map(u => u.territory))].sort() : [];
                const oppAnyActive = oppQuarterFilter.length > 0 || oppStageFilter.length > 0 ||
                    oppRepFilter.length > 0 || oppTeamFilter.length > 0 || oppTerritoryFilter.length > 0;

                const oppFilteredOpps = visibleOpportunities
                    .filter(opp => {
                        if (oppQuarterFilter.length === 0) return true;
                        return oppQuarterFilter.some(key => { const opt = oppTimeFilterOpts.find(o => o.key === key); return opt && opt.match(opp); });
                    })
                    .filter(opp => {
                if (oppStageFilter.length === 0) return true;
                if (oppStageFilter.includes('__allOpen__')) return opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost';
                return oppStageFilter.includes(opp.stage);
            })
                    .filter(opp => oppRepFilter.length === 0 || oppRepFilter.includes(opp.salesRep) || oppRepFilter.includes(opp.assignedTo))
                    .filter(opp => {
                        if (oppTeamFilter.length === 0) return true;
                        const u = (settings.users||[]).find(u => u.name === (opp.salesRep||opp.assignedTo));
                        return u && oppTeamFilter.includes(u.team);
                    })
                    .filter(opp => {
                        if (oppTerritoryFilter.length === 0) return true;
                        const u = (settings.users||[]).find(u => u.name === (opp.salesRep||opp.assignedTo));
                        return u && oppTerritoryFilter.includes(u.territory);
                    });

                // ── Reusable multi-select dropdown ──
                const OppDD = ({ label, icon, options, selected, onToggle, onClear, renderOption }) => {
                    const [open, setOpen] = React.useState(false);
                    const ref = React.useRef(null);
                    React.useEffect(() => {
                        if (!open) return;
                        const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
                        document.addEventListener('mousedown', h);
                        return () => document.removeEventListener('mousedown', h);
                    }, [open]);
                    const isActive = selected.length > 0;
                    const activeLabels = selected.map(s => options.find(o => (o.key||o) === s)).filter(Boolean).map(o => o.label||o);
                    const btnLabel = isActive ? (activeLabels.length === 1 ? `${label}: ${activeLabels[0]}` : `${label}: ${activeLabels.length}`) : label;
                    return (
                        <div ref={ref} style={{ position:'relative', flexShrink:0 }}>
                            <button onClick={() => setOpen(o => !o)} style={{
                                display:'flex', alignItems:'center', gap:'0.3rem',
                                padding:'0.25rem 0.5rem', borderRadius:'6px', cursor:'pointer',
                                fontFamily:'inherit', fontSize:'0.6875rem', fontWeight:'700',
                                transition:'all 0.15s', whiteSpace:'nowrap',
                                border:'1px solid ' + (isActive ? '#2563eb' : '#e2e8f0'),
                                background: isActive ? '#2563eb' : '#f8fafc',
                                color: isActive ? '#fff' : '#64748b',
                            }}>
                                {icon && <span style={{ fontSize:'0.75rem' }}>{icon}</span>}
                                <span>{btnLabel}</span>
                                <span style={{ fontSize:'0.5rem', opacity:0.6 }}>{open ? '▲' : '▼'}</span>
                            </button>
                            {open && (
                                <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, zIndex:400,
                                    background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px',
                                    boxShadow:'0 8px 24px rgba(0,0,0,0.12)', minWidth:'170px', overflow:'hidden' }}>
                                    <div onClick={() => { onClear(); setOpen(false); }}
                                        style={{ display:'flex', alignItems:'center', gap:'0.5rem',
                                            padding:'0.5rem 0.75rem', cursor:'pointer', fontSize:'0.8125rem',
                                            color: !isActive ? '#2563eb' : '#1e293b', fontWeight: !isActive ? '700' : '400',
                                            background: !isActive ? '#eff6ff' : 'transparent', borderBottom:'1px solid #f1f5f9' }}>
                                        <span style={{ width:'14px', textAlign:'center', fontSize:'0.75rem' }}>{!isActive ? '✓' : ''}</span>
                                        <span>All</span>
                                    </div>
                                    {options.map(opt => {
                                        const key = opt.key || opt;
                                        const checked = selected.includes(key);
                                        return (
                                            <div key={key} onClick={() => onToggle(key)}
                                                style={{ display:'flex', alignItems:'center', gap:'0.5rem',
                                                    padding:'0.5rem 0.75rem', cursor:'pointer', fontSize:'0.8125rem',
                                                    color: checked ? '#2563eb' : '#1e293b', fontWeight: checked ? '700' : '400',
                                                    background: checked ? '#eff6ff' : 'transparent', transition:'background 0.1s' }}>
                                                <span style={{ width:'14px', textAlign:'center', fontSize:'0.75rem' }}>{checked ? '✓' : ''}</span>
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
                <div className="tab-page" onClick={() => healthPopover && setHealthPopover(null)}>
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Opportunities</h2>
                        </div>
                    </div>
                {/* ── Sub-tabs: Funnel | Kanban | List ── */}
                <div style={{ display:'flex', alignItems:'center', borderBottom:'1px solid #e2e8f0' }}>
                    <button onClick={() => { setOppTabView('funnel'); localStorage.setItem('tab:opps:view','funnel'); }}
                        style={{ padding:'0.5rem 1.25rem', border:'none', borderBottom: oppTabView==='funnel' ? '2px solid #2563eb' : '2px solid transparent', background:'transparent', color: oppTabView==='funnel' ? '#2563eb' : '#64748b', fontWeight: oppTabView==='funnel' ? '700' : '500', fontSize:'0.875rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', whiteSpace:'nowrap' }}>Funnel</button>
                    <button onClick={() => { setOppTabView('kanban'); localStorage.setItem('tab:opps:view','kanban'); }}
                        style={{ padding:'0.5rem 1.25rem', border:'none', borderBottom: oppTabView==='kanban' ? '2px solid #2563eb' : '2px solid transparent', background:'transparent', color: oppTabView==='kanban' ? '#2563eb' : '#64748b', fontWeight: oppTabView==='kanban' ? '700' : '500', fontSize:'0.875rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', whiteSpace:'nowrap' }}>Kanban</button>
                    <button onClick={() => { setOppTabView('list'); localStorage.setItem('tab:opps:view','list'); }}
                        style={{ padding:'0.5rem 1.25rem', border:'none', borderBottom: oppTabView==='list' ? '2px solid #2563eb' : '2px solid transparent', background:'transparent', color: oppTabView==='list' ? '#2563eb' : '#64748b', fontWeight: oppTabView==='list' ? '700' : '500', fontSize:'0.875rem', cursor:'pointer', fontFamily:'inherit', transition:'all 0.15s', whiteSpace:'nowrap' }}>List</button>
                </div>

                    {/* ── Toolbar container: filters + new button ── */}
                    <div className="table-container" style={{ marginBottom:'0.75rem' }}>
                        {/* ── Header: filters left, actions right ── */}
                        <div style={{ display:'flex', alignItems:'center', gap:'0.375rem', padding:'0.625rem 1rem', borderBottom:'1px solid #e2e8f0', flexWrap:'wrap' }}>
                            <div style={{ width:'3px', height:'18px', background:'linear-gradient(to bottom, #2563eb, #7c3aed)', borderRadius:'2px', flexShrink:0, marginRight:'0.25rem' }} />
                            <span style={{ fontSize:'0.6875rem', fontWeight:'800', color:'#0f172a', marginRight:'0.5rem', flexShrink:0 }}>Filter:</span>

                            {/* Pipeline */}
                            {allPipelines.length > 1 && (
                                <SliceDropdown label="Pipeline" icon="🔀"
                                    options={allPipelines.map(p => p.name)}
                                    selected={activePipeline.name}
                                    colorMap={Object.fromEntries(allPipelines.map(p => [p.name, p.color]))}
                                    activeColor={activePipeline.color}
                                    onSelect={name => { const p = allPipelines.find(pl => pl.name === name); if (p) setActivePipelineId(p.id); }}
                                    alwaysActive />
                            )}

                            <OppDD label="Time" icon="⏱" options={oppTimeFilterOpts}
                                selected={oppQuarterFilter}
                                onToggle={k => setOppQuarterFilter(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])}
                                onClear={() => setOppQuarterFilter([])} />

                            <OppDD label="Stage" icon="📊" options={[{key:'__allOpen__', label:'All Open'}, ...stages]}
                                selected={oppStageFilter}
                                onToggle={s => {
                                    if (s === '__allOpen__') {
                                        setOppStageFilter(prev => prev.includes('__allOpen__') ? [] : ['__allOpen__']);
                                    } else {
                                        setOppStageFilter(prev => {
                                            const without = prev.filter(x => x !== '__allOpen__');
                                            return without.includes(s) ? without.filter(x => x !== s) : [...without, s];
                                        });
                                    }
                                }}
                                onClear={() => setOppStageFilter([])}
                                renderOption={(opt, checked) => {
                                    const s = opt.key || opt;
                                    if (s === '__allOpen__') return <span style={{ fontWeight:'700', color:'#2563eb' }}>All Open</span>;
                                    const sc = getStageColor(s);
                                    return <span style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                        <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:sc.text, flexShrink:0 }}></span>
                                        <span>{s}</span>
                                    </span>;
                                }} />

                            {oppAllReps.length >= 2 && (
                                <OppDD label="Rep" icon="👤" options={oppAllReps}
                                    selected={oppRepFilter}
                                    onToggle={r => setOppRepFilter(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r])}
                                    onClear={() => setOppRepFilter([])} />
                            )}

                            {oppAllTeams.length > 0 && (
                                <OppDD label="Team" icon="👥" options={oppAllTeams}
                                    selected={oppTeamFilter}
                                    onToggle={t => setOppTeamFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                                    onClear={() => setOppTeamFilter([])} />
                            )}

                            {oppAllTerritories.length > 0 && (
                                <OppDD label="Territory" icon="📍" options={oppAllTerritories}
                                    selected={oppTerritoryFilter}
                                    onToggle={t => setOppTerritoryFilter(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                                    onClear={() => setOppTerritoryFilter([])} />
                            )}

                            {oppAnyActive && (
                                <button onClick={() => { setOppQuarterFilter([]); setOppStageFilter([]); setOppRepFilter([]); setOppTeamFilter([]); setOppTerritoryFilter([]); }}
                                    style={{ padding:'0.2rem 0.5rem', borderRadius:'4px', border:'1px solid #e2e8f0', background:'#fff', color:'#94a3b8', fontSize:'0.625rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
                                    ✕ Clear all
                                </button>
                            )}

                            {/* Right side: count + CSV + New */}
                            <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginLeft:'auto', flexShrink:0 }}>
                                <span style={{ fontSize:'0.6875rem', color:'#94a3b8', fontWeight:'600' }}>{oppFilteredOpps.length} deals</span>
                                <button className="btn" onClick={handleAddNew} style={{ padding:'0.3rem 0.75rem', fontSize:'0.6875rem', fontWeight:'700' }}>+ New</button>
                            </div>
                        </div>

                        {/* Bulk actions bar */}
                        {selectedOpps.length > 0 && (
                            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.625rem 1.5rem', background:'#eff6ff', borderBottom:'1px solid #bfdbfe', flexWrap:'wrap' }}>
                                <span style={{ fontWeight:'700', fontSize:'0.8125rem', color:'#1d4ed8' }}>{selectedOpps.length} selected</span>
                                <div style={{ width:'1px', height:'18px', background:'#bfdbfe' }} />
                                <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                    <span style={{ fontSize:'0.75rem', color:'#64748b', fontWeight:'600' }}>Stage:</span>
                                    <select value={bulkAction.stage} onChange={e => setBulkAction(a => ({...a, stage: e.target.value}))}
                                        style={{ fontSize:'0.75rem', border:'1px solid #bfdbfe', borderRadius:'6px', padding:'0.2rem 0.5rem', background:'#fff', color:'#1e293b', cursor:'pointer' }}>
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
                                            setSelectedOpps([]); setBulkAction({ stage:'', rep:'' });
                                        }} style={{ padding:'0.2rem 0.625rem', background:'#2563eb', color:'#fff', border:'none', borderRadius:'6px', fontSize:'0.75rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>Apply</button>
                                    )}
                                </div>
                                <div style={{ width:'1px', height:'18px', background:'#bfdbfe' }} />
                                <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                    <span style={{ fontSize:'0.75rem', color:'#64748b', fontWeight:'600' }}>Assign to:</span>
                                    <select value={bulkAction.rep} onChange={e => setBulkAction(a => ({...a, rep: e.target.value}))}
                                        style={{ fontSize:'0.75rem', border:'1px solid #bfdbfe', borderRadius:'6px', padding:'0.2rem 0.5rem', background:'#fff', color:'#1e293b', cursor:'pointer' }}>
                                        <option value="">— pick rep —</option>
                                        {[...new Set((settings.users||[]).filter(u=>u.userType!=='Admin'&&u.userType!=='Manager').map(u=>u.name).filter(Boolean))].sort().map(n => <option key={n} value={n}>{n}</option>)}
                                    </select>
                                    {bulkAction.rep && (
                                        <button onClick={() => {
                                            setOpportunities(prev => prev.map(o => selectedOpps.includes(o.id) ? {...o, salesRep: bulkAction.rep} : o));
                                            setSelectedOpps([]); setBulkAction({ stage:'', rep:'' });
                                        }} style={{ padding:'0.2rem 0.625rem', background:'#2563eb', color:'#fff', border:'none', borderRadius:'6px', fontSize:'0.75rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>Apply</button>
                                    )}
                                </div>
                                <div style={{ width:'1px', height:'18px', background:'#bfdbfe' }} />
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
        () => { setOpportunities(snapshot); setUndoToast(null); }
    );
});
                                }} style={{ padding:'0.2rem 0.625rem', background:'#ef4444', color:'white', border:'none', borderRadius:'6px', fontSize:'0.75rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>🗑 Delete</button>
                                <button onClick={() => { setSelectedOpps([]); setBulkAction({ stage:'', rep:'' }); }}
                                    style={{ marginLeft:'auto', background:'none', border:'none', color:'#64748b', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit', fontWeight:'600' }}>Clear selection ✕</button>
                            </div>
                        )}

                    </div>{/* end toolbar container */}

                    {/* ── Content container ── */}
                    <div className="table-container" style={{ overflow:'hidden' }}>
                        <div className="table-wrapper">
                            {/* Mobile cards — Opportunities tab */}
                            <div className="opp-mobile-cards" style={{ padding: '0.75rem' }}>
                                {oppFilteredOpps.length === 0 ? (
                                    <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.875rem' }}>No opportunities found</div>
                                ) : oppFilteredOpps.map(opp => {
                                    const health = calculateDealHealth(opp);
                                    return (
                                        <div key={opp.id} className="mobile-record-card" onClick={() => { setEditingOpp(opp); setShowModal(true); }}>
                                            <div className="mobile-card-top">
                                                <div style={{ flex:1, minWidth:0 }}>
                                                    <div className="mobile-card-title" style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{opp.opportunityName || opp.account}</div>
                                                    <div className="mobile-card-sub">{opp.account}{opp.site ? ' · ' + opp.site : ''}{opp.salesRep ? ` · ${opp.salesRep}` : ''}</div>
                                                </div>
                                                {canViewField('arr') && <div className="mobile-card-arr">${(parseFloat(opp.arr)||0).toLocaleString()}</div>}
                                            </div>
                                            <div className="mobile-card-meta">
                                                <span style={{ background: getStageColor(opp.stage).text+'22', color: getStageColor(opp.stage).text, padding:'0.125rem 0.5rem', borderRadius:'999px', fontSize:'0.6875rem', fontWeight:'700' }}>{opp.stage}</span>
                                                <span style={{ width:'8px', height:'8px', borderRadius:'50%', background:health.color, display:'inline-block' }} />
                                                <span className="mobile-card-meta-item" style={{ color:health.color, fontWeight:'600' }}>{health.status}</span>
                                                {opp.forecastedCloseDate && <span className="mobile-card-meta-item">📅 {new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>}
                                            </div>
                                            <div className="mobile-card-actions" onClick={e => e.stopPropagation()}>
                                                <button className="primary" onClick={() => { setEditingOpp(opp); setShowModal(true); }}>✏️ Edit</button>
                                                {canEdit && <button onClick={() => { showConfirm('Delete this opportunity?', () => handleDelete(opp.id)); }} style={{ color:'#ef4444', borderColor:'#fecaca' }}>🗑 Delete</button>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {/* Desktop table — list view */}
                            {oppTabView === 'list' && (
                            <div className="opp-desktop-wrap">
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8', padding: '0.3rem 1rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>👆 Click any row to view full details</div>
                            <div className="opp-split-layout">
                            <div className="opp-desktop-table" style={{ borderRight: selectedOppTabOpp ? '1px solid #e2e8f0' : 'none' }}>
                            {/* Stale deals warning banner */}
                            {(() => {
                                const staleDeals = oppFilteredOpps.filter(opp => {
                                    if (opp.stage === 'Closed Won' || opp.stage === 'Closed Lost') return false;
                                    if (!opp.stageChangedDate) return false;
                                    return Math.floor((new Date() - new Date(opp.stageChangedDate + 'T12:00:00')) / 86400000) > 30;
                                });
                                const noActivityDeals = oppFilteredOpps.filter(opp => {
                                    if (opp.stage === 'Closed Won' || opp.stage === 'Closed Lost') return false;
                                    return activities.filter(a => a.opportunityId === opp.id).length === 0;
                                });
                                if (staleDeals.length === 0 && noActivityDeals.length === 0) return null;
                                return (
                                    <div style={{ padding:'0.625rem 1rem', background:'#fffbeb', border:'1px solid #fde68a', borderBottom:'1px solid #fde68a', display:'flex', gap:'1.25rem', flexWrap:'wrap', alignItems:'center' }}>
                                        <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#92400e' }}>⚠ Pipeline Attention</span>
                                        {staleDeals.length > 0 && <span style={{ fontSize:'0.75rem', color:'#b45309' }}><strong>{staleDeals.length}</strong> deal{staleDeals.length > 1 ? 's' : ''} stuck in stage &gt;30 days{staleDeals.length <= 3 && ': ' + staleDeals.map(o => o.account||o.opportunityName).join(', ')}</span>}
                                        {staleDeals.length > 0 && noActivityDeals.length > 0 && <span style={{ color:'#fbbf24' }}>·</span>}
                                        {noActivityDeals.length > 0 && <span style={{ fontSize:'0.75rem', color:'#b45309' }}><strong>{noActivityDeals.length}</strong> open deal{noActivityDeals.length > 1 ? 's' : ''} with no activities logged</span>}
                                    </div>
                                );
                            })()}
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width:'36px' }}>
                                            <input type="checkbox"
                                                checked={oppFilteredOpps.length > 0 && selectedOpps.length === oppFilteredOpps.length}
                                                onChange={e => setSelectedOpps(e.target.checked ? oppFilteredOpps.map(o => o.id) : [])}
                                                style={{ width:'15px', height:'15px', cursor:'pointer', accentColor:'#2563eb' }} />
                                        </th>
                                        <th style={{ width:'80px' }}>Health</th>
                                        <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => { if (oppSortField==='salesRep') setOppSortDir(d => d==='asc'?'desc':'asc'); else { setOppSortField('salesRep'); setOppSortDir('asc'); } }}>Sales Rep {oppSortField==='salesRep' ? (oppSortDir==='asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => { if (oppSortField==='account') setOppSortDir(d => d==='asc'?'desc':'asc'); else { setOppSortField('account'); setOppSortDir('asc'); } }}>Account {oppSortField==='account' ? (oppSortDir==='asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th>Opportunity</th>
                                        <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => { if (oppSortField==='stage') setOppSortDir(d => d==='asc'?'desc':'asc'); else { setOppSortField('stage'); setOppSortDir('asc'); } }}>Stage {oppSortField==='stage' ? (oppSortDir==='asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        {canViewField('arr') && <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => { if (oppSortField==='arr') setOppSortDir(d => d==='asc'?'desc':'asc'); else { setOppSortField('arr'); setOppSortDir('desc'); } }}>ARR {oppSortField==='arr' ? (oppSortDir==='asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>}
                                        <th style={{ cursor:'pointer', userSelect:'none' }} onClick={() => { if (oppSortField==='closeDate') setOppSortDir(d => d==='asc'?'desc':'asc'); else { setOppSortField('closeDate'); setOppSortDir('asc'); } }}>Close Date {oppSortField==='closeDate' ? (oppSortDir==='asc' ? <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▲</span> : <span style={{color:'#2563eb',fontSize:'0.7rem'}}>▼</span>) : <span style={{color:'#cbd5e1',fontSize:'0.7rem'}}>▼</span>}</th>
                                        <th style={{ width:'130px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {oppFilteredOpps
                                        .sort((a, b) => {
                                            const dir = oppSortDir === 'asc' ? 1 : -1;
                                            switch (oppSortField) {
                                                case 'salesRep': return dir * (a.salesRep||'').localeCompare(b.salesRep||'');
                                                case 'account': return dir * (a.account||'').localeCompare(b.account||'');
                                                case 'stage': {
                                                    const order = ['Qualification','Discovery','Evaluation (Demo)','Proposal','Negotiation/Review','Contracts','Closed Won','Closed Lost'];
                                                    return dir * (order.indexOf(a.stage) - order.indexOf(b.stage));
                                                }
                                                case 'arr': return dir * ((a.arr||0) - (b.arr||0));
                                                case 'closeDate': return dir * (new Date(a.forecastedCloseDate||'9999') - new Date(b.forecastedCloseDate||'9999'));
                                                case 'closeQuarter': return dir * (a.closeQuarter||'').localeCompare(b.closeQuarter||'');
                                                default: return dir * (new Date(a.forecastedCloseDate||'9999') - new Date(b.forecastedCloseDate||'9999'));
                                            }
                                        })
                                        .map((opp, oppIdx) => {
                                            const health = calculateDealHealth(opp);
                                            return (
                                        <React.Fragment key={opp.id}>
                                        <tr
                                            style={{ background: selectedOppTabOpp?.id === opp.id ? '#eff6ff' : selectedOpps.includes(opp.id) ? '#dbeafe' : oppIdx % 2 === 0 ? '#ffffff' : '#f8fafc', borderLeft: selectedOppTabOpp?.id === opp.id ? '3px solid #2563eb' : '3px solid transparent', cursor: 'pointer' }}
                                            onClick={() => setSelectedOppTabOpp(selectedOppTabOpp?.id === opp.id ? null : opp)}
                                        >
                                            <td onClick={e => e.stopPropagation()} style={{ width:'36px' }}>
                                                <input type="checkbox"
                                                    checked={selectedOpps.includes(opp.id)}
                                                    onChange={e => setSelectedOpps(prev => e.target.checked ? [...prev, opp.id] : prev.filter(id => id !== opp.id))}
                                                    style={{ width:'15px', height:'15px', cursor:'pointer', accentColor:'#2563eb' }} />
                                            </td>
                                            <td style={{ position:'relative' }}>
                                                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', cursor:'pointer' }}
                                                    onClick={e => { e.stopPropagation(); setHealthPopover(healthPopover === opp.id ? null : opp.id); }}>
                                                    <div style={{ width:'12px', height:'12px', borderRadius:'50%', background: health.color }} />
                                                    <span style={{ fontSize:'0.8125rem', fontWeight:'600', color: health.color }}>{health.status}</span>
                                                </div>
                                                {healthPopover === opp.id && (
                                                    <div style={{ position:'absolute', top:'100%', left:0, zIndex:1000,
                                                        background:'#ffffff', border:'1px solid #e2e8f0', borderRadius:'8px',
                                                        boxShadow:'0 8px 24px rgba(0,0,0,0.12)', padding:'0.875rem 1rem',
                                                        minWidth:'280px', marginTop:'0.25rem' }}>
                                                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.625rem' }}>
                                                            <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                                                <div style={{ width:'10px', height:'10px', borderRadius:'50%', background: health.color }} />
                                                                <span style={{ fontWeight:'700', fontSize:'0.875rem', color: health.color }}>{health.status}</span>
                                                                <span style={{ fontSize:'0.75rem', color:'#94a3b8' }}>({health.score}/100)</span>
                                                            </div>
                                                            <button onClick={e => { e.stopPropagation(); setHealthPopover(null); }}
                                                                style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:'1rem', padding:0, lineHeight:1 }}>×</button>
                                                        </div>
                                                        {health.reasons.map((reason, ri) => (
                                                            <div key={ri} style={{ display:'flex', alignItems:'flex-start', gap:'0.375rem', padding:'0.3rem 0', fontSize:'0.8125rem', color:'#475569', lineHeight:1.4 }}>
                                                                <span style={{ color: reason.includes('No activity in over')||reason.includes('overdue')||reason.includes('Stuck')||reason.includes('No activities logged') ? '#ef4444' : reason.includes('approaching')||reason.includes('In current stage for') ? '#f59e0b' : '#10b981', flexShrink:0 }}>
                                                                    {reason.includes('No activity in over')||reason.includes('overdue')||reason.includes('Stuck')||reason.includes('No activities logged') ? '⚠' : reason.includes('approaching')||reason.includes('In current stage for') ? '○' : '✓'}
                                                                </span>
                                                                <span>{reason}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ whiteSpace:'nowrap' }}>{opp.salesRep || '-'}</td>
                                            <td>{opp.account}{opp.site ? ' · ' + opp.site : ''}</td>
                                            <td><span style={{ cursor:'pointer', color:'#2563eb', fontWeight:'600' }} onClick={e => { e.stopPropagation(); setEditingOpp(opp); setShowModal(true); }}>{opp.opportunityName || '-'}</span></td>
                                            <td onClick={e => e.stopPropagation()}>
                                                {inlineEdit && inlineEdit.oppId === opp.id && inlineEdit.field === 'stage' ? (
                                                    <select autoFocus value={inlineEdit.value}
                                                        onChange={e => {
                                                            const newStage = e.target.value;
                                                            const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
                                                            const prevStageVal = opp.stage;
                                                            const updatedOpp = {
                                                                ...opp, stage: newStage, stageChangedDate: today,
                                                                stageHistory: [...(opp.stageHistory||[]), { stage: newStage, date: today, prevStage: opp.stage, author: currentUser||'', timestamp: new Date().toISOString() }]
                                                            };
                                                            setOpportunities(prev => prev.map(o => o.id === opp.id ? updatedOpp : o));
                                                            dbFetch('/.netlify/functions/opportunities', {
                                                                method: 'PUT',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify(updatedOpp)
                                                            }).catch(err => console.error('Failed to save stage change:', err));
                                                            addAudit('update','opportunity',opp.id,opp.opportunityName||opp.account||opp.id,`Stage: ${prevStageVal} → ${newStage}`);
                                                            setInlineEdit(null);
                                                        }}
                                                        onBlur={() => setInlineEdit(null)}
                                                        onKeyDown={e => { if (e.key==='Escape') setInlineEdit(null); }}
                                                        style={{ fontSize:'0.6875rem', fontWeight:'600', border:'1.5px solid #2563eb', borderRadius:'6px', padding:'0.1rem 0.25rem', outline:'none', background:'#fff', cursor:'pointer', color:'#1e293b' }}>
                                                        {stages.map(s => <option key={s} value={s}>{s}</option>)}
                                                    </select>
                                                ) : (
                                                    <span title="Click to change stage"
                                                        onClick={() => setInlineEdit({ oppId: opp.id, field:'stage', value: opp.stage })}
                                                        style={{ background: getStageColor(opp.stage).text+'22', color: getStageColor(opp.stage).text, padding:'0.125rem 0.5rem', borderRadius:'999px', fontSize:'0.6875rem', fontWeight:'600', whiteSpace:'nowrap', display:'inline-block', cursor:'pointer', transition:'opacity 0.1s' }}
                                                        onMouseEnter={e => e.currentTarget.style.opacity='0.75'}
                                                        onMouseLeave={e => e.currentTarget.style.opacity='1'}>
                                                        {opp.stage}
                                                    </span>
                                                )}
                                            </td>
                                            {canViewField('arr') && <td style={{ textAlign:'right' }} onClick={e => e.stopPropagation()}>
                                                {inlineEdit && inlineEdit.oppId === opp.id && inlineEdit.field === 'arr' ? (
                                                    <input autoFocus type="number" value={inlineEdit.value}
                                                        onChange={e => setInlineEdit(prev => ({...prev, value: e.target.value}))}
                                                        onBlur={() => {
                                                            const val = parseFloat(inlineEdit.value) || 0;
                                                            const updatedOpp = {...opp, arr: val};
                                                            setOpportunities(prev => prev.map(o => o.id === opp.id ? updatedOpp : o));
                                                            dbFetch('/.netlify/functions/opportunities', {
                                                                method: 'PUT',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify(updatedOpp)
                                                            }).catch(err => console.error('Failed to save ARR change:', err));
                                                            addAudit('update','opportunity',opp.id,opp.opportunityName||opp.account||opp.id,`ARR: ${opp.arr} → ${val}`);
                                                            setInlineEdit(null);
                                                        }}
                                                        onKeyDown={e => { if (e.key==='Enter') e.target.blur(); if (e.key==='Escape') setInlineEdit(null); }}
                                                        style={{ width:'80px', fontSize:'0.75rem', border:'1.5px solid #2563eb', borderRadius:'4px', padding:'0.1rem 0.25rem', textAlign:'right', outline:'none' }} />
                                                ) : (
                                                    <span title="Click to edit ARR" onClick={() => setInlineEdit({ oppId: opp.id, field:'arr', value: opp.arr||0 })}
                                                        style={{ cursor:'pointer' }} onMouseEnter={e => e.currentTarget.style.textDecoration='underline'} onMouseLeave={e => e.currentTarget.style.textDecoration='none'}>
                                                        ${(parseFloat(opp.arr)||0).toLocaleString()}
                                                    </span>
                                                )}
                                            </td>}

                                            <td style={{ whiteSpace:'nowrap', color:'#64748b', fontSize:'0.8125rem' }}>
                                                {inlineEdit && inlineEdit.oppId===opp.id && inlineEdit.field==='closeDate' ? (
                                                    <input autoFocus type="date" value={inlineEdit.value}
                                                        onChange={e => setInlineEdit(prev => ({...prev, value: e.target.value}))}
                                                        onBlur={() => {
                                                            const val = inlineEdit.value;
                                                            if (val) {
                                                                const newQ = getQuarterLabel(getQuarter(val), val);
                                                                const updatedOpp = {...opp, forecastedCloseDate: val, closeQuarter: newQ};
                                                                setOpportunities(prev => prev.map(o => o.id===opp.id ? updatedOpp : o));
                                                                dbFetch('/.netlify/functions/opportunities', {
                                                                    method: 'PUT',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify(updatedOpp)
                                                                }).catch(err => console.error('Failed to save close date change:', err));
                                                                addAudit('update','opportunity',opp.id,opp.opportunityName||opp.account||opp.id,`Close Date: ${opp.forecastedCloseDate} → ${val}`);
                                                            }
                                                            setInlineEdit(null);
                                                        }}
                                                        onKeyDown={e => { if (e.key==='Enter') e.target.blur(); if (e.key==='Escape') setInlineEdit(null); }}
                                                        style={{ fontSize:'0.75rem', border:'1.5px solid #2563eb', borderRadius:'4px', padding:'0.1rem 0.25rem', outline:'none' }} />
                                                ) : (
                                                    <span title="Click to edit close date" onClick={() => setInlineEdit({ oppId: opp.id, field:'closeDate', value: opp.forecastedCloseDate||'' })}
                                                        style={{ cursor:'pointer' }} onMouseEnter={e => e.currentTarget.style.textDecoration='underline'} onMouseLeave={e => e.currentTarget.style.textDecoration='none'}>
                                                        {opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '-'}
                                                    </span>
                                                )}
                                            </td>

                                            <td style={{ whiteSpace:'nowrap' }}>
                                                <button onClick={e => { e.stopPropagation(); setSelectedOppTabOpp(selectedOppTabOpp?.id === opp.id ? null : opp); }} style={{ padding: '4px 12px', borderRadius: '999px', border: 'none', background: selectedOppTabOpp?.id === opp.id ? '#1d4ed8' : '#2563eb', color: '#fff', fontWeight: '600', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Details</button>
                                            </td>
                                        </tr>
                                        {!selectedOppTabOpp && expandedOppActivities[opp.id] === true && (() => {
                                            const oppActs = activities.filter(a => a.opportunityId === opp.id).sort((a,b) => new Date(b.date + 'T12:00:00')-new Date(a.date + 'T12:00:00'));
                                            if (oppActs.length === 0) return null;
                                            return (
                                                <tr key={opp.id+'-acts'} style={{ background:'#f8fafc' }}>
                                                    <td colSpan={99} style={{ padding:'0.5rem 1rem 0.5rem 2.5rem', borderBottom:'2px solid #e2e8f0' }}>
                                                        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.375rem' }}>
                                                            <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>Activity Log</span>
                                                            <span style={{ fontSize:'0.625rem', background:'#dbeafe', color:'#1e40af', padding:'0.1rem 0.4rem', borderRadius:'999px', fontWeight:'700' }}>{oppActs.length}</span>
                                                        </div>
                                                        <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap' }}>
                                                            {oppActs.slice(0,5).map(a => (
                                                                <div key={a.id} style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:'6px', padding:'0.25rem 0.625rem', fontSize:'0.75rem', color:'#475569', display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                                                    <span style={{ background:'#dbeafe', color:'#1e40af', padding:'0.05rem 0.35rem', borderRadius:'3px', fontSize:'0.625rem', fontWeight:'700', flexShrink:0 }}>{a.type}</span>
                                                                    <span style={{ color:'#94a3b8', flexShrink:0 }}>{a.date ? new Date(a.date + 'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}</span>
                                                                    {a.notes && <span style={{ color:'#64748b', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.notes}</span>}
                                                                </div>
                                                            ))}
                                                            {oppActs.length > 5 && <span style={{ fontSize:'0.75rem', color:'#94a3b8', alignSelf:'center' }}>+{oppActs.length-5} more</span>}
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
                            </div>{/* end opp-desktop-table */}
                            {/* ── Option 5 Detail Panel (Opps Tab) ── */}
                            {selectedOppTabOpp && (() => {
                                const opp = selectedOppTabOpp;
                                const health = calculateDealHealth(opp);
                                const stageDefault = (settings.funnelStages || []).find(s => s.name === opp.stage);
                                const effectiveProb = (opp.probability !== null && opp.probability !== undefined) ? opp.probability : (stageDefault ? stageDefault.weight : null);
                                const isOverridden = opp.probability !== null && opp.probability !== undefined && opp.probability !== (stageDefault ? stageDefault.weight : null);
                                const probNum = (opp.probability !== null && opp.probability !== undefined) ? opp.probability / 100 : (stageDefault ? stageDefault.weight / 100 : 0.3);
                                const totalVal = (parseFloat(opp.arr) || 0) + (opp.implementationCost || 0);
                                const weighted = Math.round(totalVal * probNum);
                                const oppActs = activities.filter(a => a.opportunityId === opp.id).sort((a,b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00'));
                                const lastAct = oppActs[0];
                                const daysSinceAct = lastAct ? Math.floor((new Date() - new Date(lastAct.date + 'T12:00:00')) / 86400000) : null;
                                const dealAgeDays = opp.createdDate ? Math.floor((new Date() - new Date(opp.createdDate + 'T12:00:00')) / 86400000) : null;
                                const timeInStageDays = opp.stageChangedDate ? Math.floor((new Date() - new Date(opp.stageChangedDate + 'T12:00:00')) / 86400000) : null;
                                const prods = Array.isArray(opp.products) ? opp.products : (opp.products ? [opp.products] : []);
                                return (
                                    <div style={{ width: '300px', flexShrink: 0, background: '#f8fafc', overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '520px', position: 'sticky', top: 0, borderLeft: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                                            <div>
                                                <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#0f172a', lineHeight: 1.3 }}>{opp.opportunityName || opp.account}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>{opp.account}{opp.site ? ' · ' + opp.site : ''}</div>
                                            </div>
                                            <button onClick={e => { e.stopPropagation(); setSelectedOppTabOpp(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.1rem', lineHeight: 1, padding: '0', flexShrink: 0 }}>×</button>
                                        </div>
                                        {/* Action buttons - above deal details */}
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
                                            {!isAdmin && <button onClick={e => { e.stopPropagation(); if(window.confirm('Delete this opportunity?')) handleDelete(opp.id); }} style={{ fontSize:'0.6875rem', color:'#dc2626', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', padding:'0.1rem 0', textAlign:'left' }}>Delete…</button>}
                                        </div>
                                        {/* Health / Won indicator */}
                                        {opp.stage === 'Closed Won' ? (
                                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 0.75rem', background:'#d1fae5', borderRadius:'6px', border:'1px solid #6ee7b7' }}>
                                                <span style={{ fontSize:'1rem' }}>✅</span>
                                                <span style={{ fontSize:'0.8rem', fontWeight:'700', color:'#065f46' }}>Closed Won</span>
                                                {opp.forecastedCloseDate && <span style={{ fontSize:'0.75rem', color:'#059669', marginLeft:'auto' }}>{new Date(opp.forecastedCloseDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>}
                                            </div>
                                        ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.75rem', background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: health.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: health.color }}>{health.status}</span>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: 'auto' }}>{health.score}/100</span>
                                        </div>
                                        )}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                            {[
                                                { label: 'Stage', value: <span style={{ background: getStageColor(opp.stage).text + '22', color: getStageColor(opp.stage).text, padding: '0.35rem 0.5rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '600' }}>{opp.stage}</span> },
                                                canViewField('arr') && { label: 'ARR', value: '$' + (opp.arr || 0).toLocaleString() },
                                                canViewField('implCost') && opp.implementationCost > 0 && { label: 'Impl. Cost', value: '$' + (opp.implementationCost || 0).toLocaleString() },
                                                canViewField('probability') && { label: 'Probability', value: <span style={{ fontWeight: '600', color: isOverridden ? '#f59e0b' : '#475569' }}>{effectiveProb !== null ? effectiveProb + '%' : '—'}{isOverridden ? ' ✎' : ''}</span> },
                                                canViewField('weightedValue') && { label: 'Weighted Value', value: '$' + weighted.toLocaleString() },
                                                { label: 'Sales Rep', value: opp.salesRep || '—' },
                                                { label: 'Close Date', value: opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—' },
                                                { label: 'Close Quarter', value: opp.closeQuarter || '—' },
                                                prods.length > 0 && { label: 'Products', value: prods.join(', ') },
                                                { label: 'Site Unionized', value: opp.unionized ? <span style={{ color: '#dc2626', fontWeight: '600' }}>Yes</span> : 'No' },
                                                canViewField('dealAge') && dealAgeDays !== null && { label: 'Deal Age', value: <span style={{ color: dealAgeDays > 90 ? '#ef4444' : dealAgeDays > 60 ? '#f59e0b' : '#475569', fontWeight: '600' }}>{dealAgeDays}d</span> },
                                                canViewField('timeInStage') && timeInStageDays !== null && { label: 'Time in Stage', value: <span style={{ color: (opp.stage !== 'Closed Won' && opp.stage !== 'Closed Lost' && timeInStageDays > 30) ? '#ef4444' : '#475569', fontWeight: '600' }}>{timeInStageDays}d</span> },
                                                canViewField('activities') && { label: 'Activities', value: <span>{oppActs.length}{daysSinceAct !== null ? <span style={{ fontSize: '0.7rem', color: daysSinceAct > 14 ? '#ef4444' : '#94a3b8', marginLeft: '0.35rem' }}>{daysSinceAct}d ago</span> : null}</span> },
                                                canViewField('nextSteps') && opp.nextSteps && { label: 'Next Steps', value: opp.nextSteps },
                                                canViewField('notes') && opp.notes && { label: 'Notes', value: opp.notes },
                                                (opp.stage === 'Closed Lost' && opp.lostCategory) && { label: 'Loss Reason', value: <span style={{ color: '#b91c1c', fontWeight: '600' }}>{opp.lostCategory}{opp.lostReason ? ' — ' + opp.lostReason : ''}</span> },
                                            ].filter(Boolean).map((row, ri) => (
                                                <div key={ri} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                                                    <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', fontWeight: '600' }}>{row.label}</span>
                                                    <span style={{ fontSize: '0.8rem', color: '#1e293b' }}>{row.value}</span>
                                                </div>
                                            ))}
                                        </div>

                                    </div>
                                );
                            })()}
                            </div>
                            </div>
                            )}{/* end oppTabView list */}


                            {oppTabView === 'list' && oppFilteredOpps.length === 0 && (
                                <div style={{ textAlign:'center', padding:'4rem 2rem', display:'flex', flexDirection:'column', alignItems:'center', gap:'1rem' }}>
                                    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <rect x="8" y="20" width="56" height="36" rx="6" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.5"/>
                                        <rect x="16" y="28" width="14" height="20" rx="3" fill="#93c5fd"/>
                                        <rect x="34" y="32" width="14" height="16" rx="3" fill="#60a5fa"/>
                                        <rect x="52" y="36" width="8" height="12" rx="3" fill="#3b82f6"/>
                                        <circle cx="36" cy="12" r="6" fill="#dbeafe" stroke="#93c5fd" strokeWidth="1.5"/>
                                        <path d="M36 9v6M33 12h6" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
                                    </svg>
                                    <div>
                                        <div style={{ fontWeight:'700', fontSize:'1.0625rem', color:'#1e293b', marginBottom:'0.5rem' }}>No opportunities found</div>
                                        <div style={{ fontSize:'0.875rem', color:'#64748b', marginBottom:'1.25rem' }}>{oppAnyActive ? 'Try adjusting your filters' : 'Add your first opportunity to get started'}</div>
                                        {canEdit && !oppAnyActive && <button className="btn" onClick={() => { setEditingOpp(null); setShowModal(true); }}>+ New Opportunity</button>}
                                    </div>
                                </div>
                            )}
                        </div>
                            {/* Kanban view */}
                            {oppTabView === 'kanban' && (
                            <div style={{ padding:'0.75rem 1rem' }}>
                                <div style={{ display:'flex', gap:'0.625rem', flexWrap:'wrap' }}>
                                    {stages.filter(s => s !== 'Closed Lost').map(stage => {
                                        const colOpps = oppFilteredOpps.filter(o => o.stage === stage);
                                        const sc = getStageColor(stage);
                                        return (
                                            <div key={stage}
                                                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setKanbanDragOver(stage); }}
                                                onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setKanbanDragOver(null); }}
                                                onDrop={e => { e.preventDefault(); handleKanbanDrop(stage); }}
                                                style={{ width: isMobile ? 'calc(50% - 0.375rem)' : '220px', flexShrink:0, background: kanbanDragOver === stage ? '#eff6ff' : '#f8fafc', border: kanbanDragOver === stage ? '1px solid #93c5fd' : '1px solid #e2e8f0', borderRadius:'10px', overflow:'hidden', transition:'all 0.15s' }}>
                                                <div style={{ padding:'0.5rem 0.75rem', borderTop:'3px solid '+sc.text, borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', background:'#fff' }}>
                                                    <span style={{ fontSize:'0.6875rem', fontWeight:'800', color:sc.text, textTransform:'uppercase', letterSpacing:'0.04em', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{stage}</span>
                                                    <div style={{ display:'flex', alignItems:'center', gap:'0.375rem', flexShrink:0 }}>
                                                        <span style={{ fontSize:'0.6rem', fontWeight:'700', background:'#e2e8f0', color:'#64748b', borderRadius:'10px', padding:'0.1rem 0.35rem' }}>{colOpps.length}</span>
                                                        {colOpps.length > 0 && <span style={{ fontSize:'0.6rem', color:'#94a3b8' }}>${Math.round(colOpps.reduce((s,o)=>s+(parseFloat(o.arr)||0),0)/1000)}K</span>}
                                                    </div>
                                                </div>
                                                <div style={{ padding:'0.5rem', display:'flex', flexDirection:'column', gap:'0.375rem', minHeight:'80px', maxHeight:'70vh', overflowY:'auto' }}>
                                                    {colOpps.map(opp => {
                                                        const health = calculateDealHealth(opp);
                                                        return (
                                                            <div key={opp.id}
                                                                draggable
                                                                onDragStart={() => setKanbanDragging({ oppId: opp.id, fromStage: stage })}
                                                                onDragEnd={() => { setKanbanDragging(null); setKanbanDragOver(null); }}
                                                                onClick={() => setSelectedOppTabOpp(selectedOppTabOpp?.id === opp.id ? null : opp)}
                                                                style={{ background: selectedOppTabOpp?.id === opp.id ? '#eff6ff' : '#fff', border: selectedOppTabOpp?.id === opp.id ? '1px solid #93c5fd' : '1px solid #e2e8f0', borderRadius:'6px', padding:'0.5rem 0.625rem', cursor:'grab', transition:'all 0.1s', opacity: kanbanDragging?.oppId === opp.id ? 0.5 : 1 }}
                                                                onMouseEnter={e => { if(selectedOppTabOpp?.id !== opp.id) { e.currentTarget.style.borderColor='#2563eb'; e.currentTarget.style.boxShadow='0 2px 8px rgba(37,99,235,0.1)'; }}}
                                                                onMouseLeave={e => { if(selectedOppTabOpp?.id !== opp.id) { e.currentTarget.style.borderColor='#e2e8f0'; e.currentTarget.style.boxShadow='none'; }}}>
                                                                <div style={{ fontSize:'0.75rem', fontWeight:'700', color:'#1e293b', marginBottom:'0.2rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                                                    {opp.opportunityName || opp.account || '—'}
                                                                </div>
                                                                {opp.account && opp.opportunityName && <div style={{ fontSize:'0.625rem', color:'#64748b', marginBottom:'0.2rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{opp.account}{opp.site ? ' · ' + opp.site : ''}</div>}
                                                                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'0.25rem' }}>
                                                                    <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#1e293b' }}>${(parseFloat(opp.arr)||0).toLocaleString()}</span>
                                                                    <div style={{ width:'20px', height:'20px', borderRadius:'50%', background: health.score >= 70 ? '#dcfce7' : health.score >= 40 ? '#fef3c7' : '#fee2e2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.5rem', fontWeight:'800', color: health.score >= 70 ? '#16a34a' : health.score >= 40 ? '#d97706' : '#dc2626', flexShrink:0 }}>{health.score}</div>
                                                                </div>
                                                                {opp.forecastedCloseDate && <div style={{ fontSize:'0.575rem', color:'#94a3b8', marginTop:'0.15rem' }}>Close: {new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString()}</div>}
                                                                {opp.salesRep && <div style={{ fontSize:'0.575rem', color:'#94a3b8', marginBottom:'0.2rem' }}>{opp.salesRep}</div>}
                                                                <div style={{ display:'flex', gap:'0.25rem', marginTop:'0.375rem' }} onClick={e => e.stopPropagation()}>
                                                                    <button className="action-btn" onClick={() => handleEdit(opp)} style={{ flex:1, padding:'0.15rem 0', fontSize:'0.6rem', textAlign:'center' }}>Edit</button>
                                                                    <button className="action-btn delete" onClick={() => handleDelete(opp.id)} style={{ flex:1, padding:'0.15rem 0', fontSize:'0.6rem', textAlign:'center' }}>Del</button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                    {colOpps.length === 0 && <div style={{ fontSize:'0.6875rem', color:'#cbd5e1', textAlign:'center', padding:'1rem 0', fontStyle:'italic' }}>Empty</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            )}{/* end oppTabView kanban */}

                            {/* ── FUNNEL VIEW ── */}
                            {oppTabView === 'funnel' && (
                            <div style={{ display:'flex' }}>
                            <div style={{ flex:1, minWidth:0, borderRight: selectedOppTabOpp ? '1px solid #e2e8f0' : 'none' }}>
                            <div style={{ padding:'0.75rem 1rem' }}>
                                {stages.map((stage, idx) => {
                                    const stageOpps = oppFilteredOpps.filter(o => o.stage === stage);
                                    const stageARR = stageOpps.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
                                    const maxCount = Math.max(...stages.map(s2 => oppFilteredOpps.filter(o => o.stage === s2).length), 1);
                                    const pct = stageOpps.length === 0 ? 0 : Math.max(4, Math.round((stageOpps.length / maxCount) * 100));
                                    const sc = getStageColor(stage);
                                    const isExp = oppTabFunnelExpanded === stage;
                                    return (
                                        <div key={stage} style={{ marginBottom:'0.5rem' }}>
                                            <div onClick={() => setOppTabFunnelExpanded(isExp ? null : stage)}
                                                style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.5rem 0.75rem', borderRadius:'8px', background:'#f8fafc', border:'1px solid #e2e8f0', cursor:'pointer', transition:'all 0.15s' }}
                                                onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'}
                                                onMouseLeave={e => e.currentTarget.style.background='#f8fafc'}>
                                                <div style={{ width:'10px', height:'10px', borderRadius:'50%', background:sc.text, flexShrink:0 }} />
                                                <span style={{ fontSize:'0.8125rem', fontWeight:'700', color:'#1e293b', width:'130px', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{stage}</span>
                                                <div style={{ flex:1, height:'10px', background:'#e2e8f0', borderRadius:'5px', overflow:'hidden' }}>
                                                    <div style={{ height:'100%', width:pct+'%', background:sc.text, opacity:0.75, borderRadius:'5px', transition:'width 0.4s ease' }} />
                                                </div>
                                                <span style={{ fontSize:'0.75rem', fontWeight:'700', color:'#475569', minWidth:'28px', textAlign:'right' }}>{stageOpps.length}</span>
                                                <span style={{ fontSize:'0.6875rem', color:'#94a3b8', minWidth:'70px', textAlign:'right' }}>${stageARR >= 1000 ? Math.round(stageARR/1000)+'K' : stageARR.toLocaleString()}</span>
                                                <span style={{ fontSize:'0.75rem', color:'#94a3b8', transition:'transform 0.2s', transform: isExp ? 'rotate(180deg)' : 'none' }}>▼</span>
                                            </div>
                                            {isExp && stageOpps.length > 0 && (
                                                <div style={{ marginTop:'3px', marginLeft:'1rem', display:'flex', flexDirection:'column', gap:'3px' }}>
                                                    {stageOpps.map(opp => (
                                                        <div key={opp.id}
                                                            style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.375rem 0.75rem', background: selectedOppTabOpp?.id === opp.id ? '#eff6ff' : '#fff', border: selectedOppTabOpp?.id === opp.id ? '1px solid #93c5fd' : '1px solid #f1f5f9', borderRadius:'6px', fontSize:'0.75rem', color:'#1e293b' }}
                                                            onMouseEnter={e => { if (selectedOppTabOpp?.id !== opp.id) e.currentTarget.style.background='#f8fafc'; }}
                                                            onMouseLeave={e => { if (selectedOppTabOpp?.id !== opp.id) e.currentTarget.style.background='#fff'; }}>
                                                            <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:sc.text, flexShrink:0 }} />
                                                            <span style={{ fontWeight:'600', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>{opp.opportunityName || opp.account || '—'}</span>
                                                            {opp.account && opp.opportunityName && <span style={{ color:'#94a3b8', flexShrink:0 }}>{opp.account}</span>}
                                                            <span style={{ fontWeight:'700', color:'#1e293b', flexShrink:0 }}>${(parseFloat(opp.arr)||0).toLocaleString()}</span>
                                                            {opp.salesRep && <span style={{ color:'#94a3b8', fontSize:'0.6875rem', flexShrink:0 }}>{opp.salesRep}</span>}
                                                            <button onClick={e => { e.stopPropagation(); setSelectedOppTabOpp(selectedOppTabOpp?.id === opp.id ? null : opp); }} style={{ padding:'2px 10px', borderRadius:'999px', border:'none', background: selectedOppTabOpp?.id === opp.id ? '#1d4ed8' : '#2563eb', color:'#fff', fontWeight:'600', fontSize:'0.6rem', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', flexShrink:0 }}>Details</button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            </div>{/* end funnel content */}
                            {selectedOppTabOpp && (() => {
                                const opp = selectedOppTabOpp;
                                const health = calculateDealHealth(opp);
                                const stageDefault = (settings.funnelStages || []).find(s => s.name === opp.stage);
                                const effectiveProb = (opp.probability !== null && opp.probability !== undefined) ? opp.probability : (stageDefault ? stageDefault.weight : null);
                                const isOverridden = opp.probability !== null && opp.probability !== undefined && opp.probability !== (stageDefault ? stageDefault.weight : null);
                                const probNum = effectiveProb !== null ? effectiveProb / 100 : 0.3;
                                const weighted = Math.round(((parseFloat(opp.arr)||0) + (opp.implementationCost||0)) * probNum);
                                const oppActs = activities.filter(a => a.opportunityId === opp.id).sort((a,b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00'));
                                const daysSinceAct = oppActs[0] ? Math.floor((new Date() - new Date(oppActs[0].date)) / 86400000) : null;
                                const dealAgeDays = opp.createdDate ? Math.floor((new Date() - new Date(opp.createdDate + 'T12:00:00')) / 86400000) : null;
                                return (
                                    <div style={{ width:'300px', flexShrink:0, background:'#f8fafc', overflowY:'auto', padding:'1rem', display:'flex', flexDirection:'column', gap:'0.75rem', maxHeight:'70vh', position:'sticky', top:0, borderLeft:'1px solid #e2e8f0' }}>
                                        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'0.5rem' }}>
                                            <div>
                                                <div style={{ fontSize:'0.875rem', fontWeight:'700', color:'#0f172a', lineHeight:1.3 }}>{opp.opportunityName || opp.account}</div>
                                                <div style={{ fontSize:'0.75rem', color:'#64748b', marginTop:'0.2rem' }}>{opp.account}{opp.site ? ' · ' + opp.site : ''}</div>
                                            </div>
                                            <button onClick={() => setSelectedOppTabOpp(null)} style={{ background:'none', border:'none', cursor:'pointer', color:'#94a3b8', fontSize:'1.1rem', lineHeight:1, padding:'0', flexShrink:0 }}>×</button>
                                        </div>
                                        <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
                                            <button className="btn" style={{ fontSize:'0.75rem', padding:'0.4rem 0.75rem', width:'100%' }} onClick={e => { e.stopPropagation(); handleEdit(opp); }}>✏️ Edit Opportunity</button>
                                            <div style={{ display:'flex', gap:'0.35rem' }}>
                                                <button className="btn btn-secondary" style={{ fontSize:'0.75rem', padding:'0.4rem 0', flex:1 }} onClick={e => { e.stopPropagation(); setActivityInitialContext({ opportunityId: opp.id, opportunityName: opp.opportunityName || opp.account, companyName: opp.account }); setEditingActivity(null); setShowActivityModal(true); }}>+ Activity</button>
                                                <button className="btn btn-secondary" style={{ fontSize:'0.75rem', padding:'0.4rem 0', flex:1 }} onClick={e => { e.stopPropagation(); setEditingTask({ relatedTo: opp.id, opportunityId: opp.id }); setShowTaskModal(true); }}>+ Task</button>
                                            </div>
                                            {opp.stage === 'Closed Won' && (settings.spiffs||[]).filter(s=>s.active).length > 0 && (
                                                <button className="btn btn-secondary" style={{ fontSize:'0.75rem', padding:'0.4rem 0.75rem', width:'100%', borderColor:'#7c3aed', color:'#7c3aed' }} onClick={e => { e.stopPropagation(); setSpiffClaimContext({ opp }); setShowSpiffClaimModal(true); }}>⚡ Claim SPIFF</button>
                                            )}
                                            <button onClick={e => { e.stopPropagation(); showConfirm('Delete this opportunity?', () => handleDelete(opp.id)); }} style={{ fontSize:'0.6875rem', color:'#dc2626', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', padding:'0.1rem 0', textAlign:'left' }}>Delete…</button>
                                        </div>
                                        {opp.stage === 'Closed Won' ? (
                                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.5rem 0.75rem', background:'#d1fae5', borderRadius:'6px', border:'1px solid #6ee7b7' }}>
                                                <span>✅</span><span style={{ fontSize:'0.8rem', fontWeight:'700', color:'#065f46' }}>Closed Won</span>
                                                {opp.forecastedCloseDate && <span style={{ fontSize:'0.75rem', color:'#059669', marginLeft:'auto' }}>{new Date(opp.forecastedCloseDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>}
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
                                                { label:'Stage', value:<span style={{ background:getStageColor(opp.stage).text+'22', color:getStageColor(opp.stage).text, padding:'0.15rem 0.5rem', borderRadius:'999px', fontSize:'0.75rem', fontWeight:'600' }}>{opp.stage}</span> },
                                                canViewField('arr') && { label:'ARR', value:'$'+(opp.arr||0).toLocaleString() },
                                                canViewField('probability') && { label:'Probability', value:<span style={{ fontWeight:'600', color:isOverridden?'#f59e0b':'#475569' }}>{effectiveProb !== null ? effectiveProb+'%' : '—'}{isOverridden?' ✎':''}</span> },
                                                canViewField('weightedValue') && { label:'Weighted', value:'$'+weighted.toLocaleString() },
                                                { label:'Sales Rep', value:opp.salesRep||'—' },
                                                { label:'Close Date', value:opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—' },
                                                canViewField('dealAge') && dealAgeDays !== null && { label:'Deal Age', value:<span style={{ color:dealAgeDays>90?'#ef4444':dealAgeDays>60?'#f59e0b':'#475569', fontWeight:'600' }}>{dealAgeDays}d</span> },
                                                canViewField('activities') && { label:'Activities', value:<span>{oppActs.length}{daysSinceAct !== null && <span style={{ fontSize:'0.7rem', color:daysSinceAct>14?'#ef4444':'#94a3b8', marginLeft:'0.35rem' }}>{daysSinceAct}d ago</span>}</span> },
                                                opp.nextSteps && { label:'Next Steps', value:opp.nextSteps },
                                                opp.notes && { label:'Notes', value:opp.notes },
                                                (opp.stage === 'Closed Lost' && opp.lostCategory) && { label:'Loss Reason', value:<span style={{ color:'#b91c1c', fontWeight:'600' }}>{opp.lostCategory}{opp.lostReason?' — '+opp.lostReason:''}</span> },
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
                            )}{/* end oppTabView funnel */}

                    </div>
                </div>
                );
}
