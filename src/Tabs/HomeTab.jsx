import React, { useState } from 'react';
import { useApp } from '../AppContext';
import ViewingBar from '../components/ui/ViewingBar';

export default function HomeTab({
    setEditingOpp, setShowModal,
    setEditingTask, setShowTaskModal,
    setActivityInitialContext, setEditingActivity, setShowActivityModal,
    setShowOutlookImportModal,
}) {
    const {
        opportunities,
        accounts,
        contacts,
        tasks,
        activities,
        settings,
        currentUser,
        userRole,
        canSeeAll,
        isRepVisible,
        getStageColor,
        getQuarter,
        getQuarterLabel,
        calculateDealHealth,
        getKpiColor,
        showConfirm,
        softDelete,
        addAudit,
        visibleOpportunities,
        visibleTasks,
        activePipeline,
        allPipelines,
        stages,
        handleDelete,
        handleSave,
        handleCompleteTask,
        handleDeleteTask,
        calendarEvents,
        calendarConnected,
        calendarLoading,
        calendarError,
        fetchCalendarEvents,
        setActiveTab,
        fetchLogFromCalEvents,
        logFromCalOpen, setLogFromCalOpen,
        logFromCalDateFrom, setLogFromCalDateFrom,
        logFromCalDateTo, setLogFromCalDateTo,
        logFromCalEvents, setLogFromCalEvents,
        logFromCalLoading,
        logFromCalError,
        loggedCalendarIds, setLoggedCalendarIds,
        logFromCalLinkingId, setLogFromCalLinkingId,
        logFromCalOppMap, setLogFromCalOppMap,
        meetingPrepOpen, setMeetingPrepOpen,
        meetingPrepEvent, setMeetingPrepEvent,
        meetingPrepOppId, setMeetingPrepOppId,
        viewingRep, setViewingRep,
        viewingTeam, setViewingTeam,
        viewingTerritory, setViewingTerritory,
        activePipelineId, setActivePipelineId,
        allRepNames,
        allTeamNames,
        allTerritoryNames,
        setUndoToast,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;

    // Derived KPIs
    const totalARR = visibleOpportunities.reduce((sum, opp) => sum + (parseFloat(opp.arr) || 0), 0);
    const activeOpps = visibleOpportunities.length;
    const avgARR = activeOpps > 0 ? totalARR / activeOpps : 0;

    // Local state
    const [calView, setCalView] = useState('week');
    const [calOffset, setCalOffset] = useState(0);
    const [showCalConfig, setShowCalConfig] = useState(false);
    const [calShowGcal, setCalShowGcal] = useState(true);
    const [calShowCalls, setCalShowCalls] = useState(true);
    const [calShowMeetings, setCalShowMeetings] = useState(true);
    const [calShowWeekends, setCalShowWeekends] = useState(true);
    const [calRepFilter, setCalRepFilter] = useState('all');
    const [calProvider, setCalProvider] = useState('google');

    // UI handlers
    const handleAddNew = () => { setEditingOpp(null); setShowModal(true); };
    const handleEdit = (opp) => { setEditingOpp(opp); setShowModal(true); };
    const handleAddTask = () => { setEditingTask(null); setShowTaskModal(true); };
    const handleLogFromCalendar = () => { setShowOutlookImportModal(true); };

    const quarterlyData = {};
    visibleOpportunities.forEach(opp => {
        if (opp.forecastedCloseDate) {
            const quarter = getQuarter(opp.forecastedCloseDate);
            const quarterLabel = getQuarterLabel(quarter, opp.forecastedCloseDate);
            
            if (!quarterlyData[quarterLabel]) {
                quarterlyData[quarterLabel] = 0;
            }
            quarterlyData[quarterLabel] += (opp.arr + opp.implementationCost);
        }
    });

    const sortedQuarters = Object.entries(quarterlyData)
        .sort((a, b) => {
            const dateA = visibleOpportunities.find(o => {
                const q = getQuarter(o.forecastedCloseDate);
                const ql = getQuarterLabel(q, o.forecastedCloseDate);
                return ql === a[0];
            });
            const dateB = visibleOpportunities.find(o => {
                const q = getQuarter(o.forecastedCloseDate);
                const ql = getQuarterLabel(q, o.forecastedCloseDate);
                return ql === b[0];
            });
            return new Date(dateA?.forecastedCloseDate) - new Date(dateB?.forecastedCloseDate);
        });

    const nextQuarter = sortedQuarters.length > 0 ? sortedQuarters[0] : null;


    return (

                <div className="tab-page">
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Dashboard</h2>
                            <p>Your sales pipeline at a glance</p>
                        </div>
                    </div>
                    <ViewingBar
                        allPipelines={allPipelines} activePipeline={activePipeline} setActivePipelineId={setActivePipelineId}
                        canSeeAll={canSeeAll} allRepNames={allRepNames} allTeamNames={allTeamNames} allTerritoryNames={allTerritoryNames}
                        viewingRep={viewingRep} setViewingRep={setViewingRep}
                        viewingTeam={viewingTeam} setViewingTeam={setViewingTeam}
                        viewingTerritory={viewingTerritory} setViewingTerritory={setViewingTerritory}
                        visibleCount={visibleOpportunities.length} totalCount={(opportunities||[]).filter(o => (o.pipelineId||'default') === activePipeline.id).length} countLabel="opportunities"
                        isAdmin={isAdmin}
                    />
                    {(() => {
                        const trendMode = settings.kpiTrendMode || 'stage-distribution';
                        const _now = new Date();
                        const getSparkPoints = (valuesFn) => {
                            let buckets = [];
                            if (trendMode === 'stage-distribution') {
                                const sl = (settings.funnelStages || []).map(s => s.name);
                                buckets = sl.map(s => valuesFn(visibleOpportunities.filter(o => o.stage === s)));
                            } else if (trendMode === 'month-over-month') {
                                for (let i = 5; i >= 0; i--) { const d = new Date(_now.getFullYear(), _now.getMonth()-i, 1), nx = new Date(_now.getFullYear(), _now.getMonth()-i+1, 1); buckets.push(valuesFn(visibleOpportunities.filter(o => { const c = o.forecastedCloseDate ? new Date(o.forecastedCloseDate + 'T12:00:00') : null; return c && c >= d && c < nx; }))); }
                            } else if (trendMode === 'quarter-over-quarter') {
                                for (let i = 3; i >= 0; i--) { const qm = _now.getMonth()-(i*3), fy = _now.getFullYear()+Math.floor(qm/12), fm = ((qm%12)+12)%12; const s = new Date(fy,fm,1), e = new Date(fy,fm+3,1); buckets.push(valuesFn(visibleOpportunities.filter(o => { const c = o.forecastedCloseDate ? new Date(o.forecastedCloseDate + 'T12:00:00') : null; return c && c >= s && c < e; }))); }
                            } else if (trendMode === 'year-to-date') {
                                for (let m = 0; m <= _now.getMonth(); m++) { const s = new Date(_now.getFullYear(),m,1), e = new Date(_now.getFullYear(),m+1,1); buckets.push(valuesFn(visibleOpportunities.filter(o => { const c = o.forecastedCloseDate ? new Date(o.forecastedCloseDate + 'T12:00:00') : null; return c && c >= s && c < e; }))); }
                            } else if (trendMode === 'year-over-year') {
                                for (let m = 0; m < 12; m++) { const sT = new Date(_now.getFullYear(),m,1), eT = new Date(_now.getFullYear(),m+1,1), sL = new Date(_now.getFullYear()-1,m,1), eL = new Date(_now.getFullYear()-1,m+1,1); const tv = valuesFn(visibleOpportunities.filter(o => { const c = o.forecastedCloseDate ? new Date(o.forecastedCloseDate + 'T12:00:00') : null; return c && c >= sT && c < eT; })), lv = valuesFn(visibleOpportunities.filter(o => { const c = o.forecastedCloseDate ? new Date(o.forecastedCloseDate + 'T12:00:00') : null; return c && c >= sL && c < eL; })); buckets.push(tv - lv); }
                            }
                            if (buckets.length < 2) return { pts: '0,28 110,28', polyFill: '0,28 110,28 110,28 0,28' };
                            const mx = Math.max(...buckets.map(Math.abs), 1), n = buckets.length;
                            const coords = buckets.map((v,i) => `${Math.round((i/(n-1))*110)},${Math.round(28-Math.max(0,v/mx)*24)}`).join(' ');
                            return { pts: coords, polyFill: coords + ' 110,28 0,28' };
                        };
                        const sparkLine = (pts, polyFill, color) => (
                            <svg width="100%" height="26" viewBox="0 0 110 28" preserveAspectRatio="none" style={{ display:'block', marginTop:'6px' }}>
                                <polyline fill={color} fillOpacity="0.09" stroke="none" points={polyFill} />
                                <polyline fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" points={pts} opacity="0.75" />
                            </svg>
                        );
                        const openCount = visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed').length;
                        const overdueCount = visibleTasks.filter(t => { const s = t.status || (t.completed ? 'Completed' : 'Open'); const due = t.dueDate || t.due; return s !== 'Completed' && due && new Date(due) < new Date(); }).length;
                        const completedCount = visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) === 'Completed').length;
                        const donePct = (openCount + completedCount) > 0 ? Math.round((completedCount / (openCount + completedCount)) * 100) : 0;
                        const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                        const recentOpps = visibleOpportunities.filter(o => o.createdDate && new Date(o.createdDate) > thirtyDaysAgo).length;
                        const closedWonARR = visibleOpportunities.filter(o => o.stage === 'Closed Won').reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
                        const fv = nextQuarter ? nextQuarter[1] : 0;
                        const quotaMode = (settings.users || []).find(u => u.quotaType)?.quotaType || 'annual';
                        const totalQuota = (settings.users || []).filter(u => u.userType !== 'ReadOnly' && isRepVisible(u.name)).reduce((s, u) => { if ((u.quotaType || quotaMode) === 'annual') return s + (u.annualQuota || 0) / 4; return s + (u.q1Quota || u.q2Quota || u.q3Quota || u.q4Quota || 0); }, 0);
                        const attainPct = totalQuota > 0 ? Math.min(100, Math.round((closedWonARR / totalQuota) * 100)) : null;
                        const arrDisplay = totalARR >= 1000000 ? '$' + (totalARR / 1000000).toFixed(1) + 'M' : totalARR >= 1000 ? '$' + Math.round(totalARR / 1000) + 'K' : '$' + totalARR.toLocaleString();
                        const fvDisplay = fv >= 1000000 ? '$' + (fv / 1000000).toFixed(1) + 'M' : fv >= 1000 ? '$' + Math.round(fv / 1000) + 'K' : '$' + fv.toLocaleString();
                        const { pts: sp1, polyFill: pf1 } = getSparkPoints(opps => opps.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0));
                        const { pts: sp2, polyFill: pf2 } = getSparkPoints(opps => opps.length);
                        const kc1 = getKpiColor('totalPipelineARR', totalARR), kc2 = getKpiColor('activeOpps', activeOpps), kc3 = getKpiColor('openTasks', openCount), kc4 = getKpiColor('nextQForecast', fv);
                        return (
                        <div className="kpi-grid">
                            <div className={`kpi-card home-style accent-blue ${kc1.className}`} style={{ ...(kc1.toleranceColor ? { borderLeftColor: kc1.toleranceColor } : {}), paddingBottom: '8px' }}>
                                <div className="kpi-label">Total Pipeline ARR</div>
                                <div className="kpi-value">{arrDisplay}</div>
                                <div style={{ display:'flex', justifyContent:'space-between', marginTop:'5px' }}>
                                    <span style={{ fontSize:'10px', fontWeight:'600', background:'#dbeafe', color:'#1e40af', padding:'2px 6px', borderRadius:'999px' }}>{activeOpps} active</span>
                                    <span style={{ fontSize:'10px', color:'#94a3b8' }}>{totalARR > 0 ? Math.round((closedWonARR/totalARR)*100) : 0}% converted</span>
                                </div>
                                {sparkLine(sp1, pf1, '#2563eb')}
                            </div>
                            <div className={`kpi-card home-style accent-purple ${kc2.className}`} style={{ ...(kc2.toleranceColor ? { borderLeftColor: kc2.toleranceColor } : {}), paddingBottom: '8px' }}>
                                <div className="kpi-label">Active Opportunities</div>
                                <div className="kpi-value">{activeOpps}</div>
                                <div style={{ display:'flex', justifyContent:'space-between', marginTop:'5px' }}>
                                    {recentOpps > 0 ? <span style={{ fontSize:'10px', fontWeight:'600', background:'#ede9fe', color:'#6d28d9', padding:'2px 6px', borderRadius:'999px' }}>▲ {recentOpps} new (30d)</span> : <span style={{ fontSize:'10px', color:'#94a3b8' }}>No new (30d)</span>}
                                    <span style={{ fontSize:'10px', color:'#94a3b8' }}>${Math.round(avgARR / 1000) || 0}K avg</span>
                                </div>
                                {sparkLine(sp2, pf2, '#9333ea')}
                            </div>
                            <div className={`kpi-card home-style accent-amber ${kc3.className}`} style={{ ...(kc3.toleranceColor ? { borderLeftColor: kc3.toleranceColor } : {}), paddingBottom: '8px' }}>
                                <div className="kpi-label">Open Tasks</div>
                                <div className="kpi-value">{openCount}</div>
                                <div style={{ display:'flex', justifyContent:'space-between', marginTop:'5px' }}>
                                    {overdueCount > 0 ? <span style={{ fontSize:'10px', fontWeight:'600', background:'#fee2e2', color:'#dc2626', padding:'2px 6px', borderRadius:'999px' }}>▼ {overdueCount} overdue</span> : <span style={{ fontSize:'10px', fontWeight:'600', background:'#d1fae5', color:'#065f46', padding:'2px 6px', borderRadius:'999px' }}>All on track</span>}
                                    <span style={{ fontSize:'10px', color:'#94a3b8' }}>{donePct}% done</span>
                                </div>
                                <div style={{ marginTop:'8px' }}>
                                    <div style={{ height:'4px', background:'#f1f5f9', borderRadius:'99px', overflow:'hidden' }}>
                                        <div style={{ height:'100%', width: donePct + '%', background:'#f59e0b', borderRadius:'99px', transition:'width 0.4s' }} />
                                    </div>
                                </div>
                            </div>
                            <div className={`kpi-card home-style accent-green ${kc4.className}`} style={{ ...(kc4.toleranceColor ? { borderLeftColor: kc4.toleranceColor } : {}), paddingBottom: '8px' }}>
                                <div className="kpi-label">{nextQuarter ? nextQuarter[0] : 'Next Quarter'} Forecast</div>
                                <div className="kpi-value">{fvDisplay}</div>
                                <div style={{ display:'flex', justifyContent:'space-between', marginTop:'5px' }}>
                                    {attainPct !== null ? <span style={{ fontSize:'10px', fontWeight:'600', background: attainPct>=75?'#d1fae5':attainPct>=40?'#fef3c7':'#fee2e2', color: attainPct>=75?'#065f46':attainPct>=40?'#92400e':'#dc2626', padding:'2px 6px', borderRadius:'999px' }}>{attainPct}% of quota</span> : <span style={{ fontSize:'10px', color:'#94a3b8' }}>No quota set</span>}
                                    {closedWonARR > 0 && <span style={{ fontSize:'10px', color:'#94a3b8' }}>${Math.round(closedWonARR/1000)}K won</span>}
                                </div>
                                {attainPct !== null && (
                                    <div style={{ marginTop:'8px' }}>
                                        <div style={{ height:'4px', background:'#f1f5f9', borderRadius:'99px', overflow:'hidden' }}>
                                            <div style={{ height:'100%', width: attainPct + '%', background: attainPct>=75?'#16a34a':attainPct>=40?'#f59e0b':'#ef4444', borderRadius:'99px', transition:'width 0.4s' }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        );
                    })()}

                    {/* ── CROSS-PIPELINE SUMMARY (only when multiple pipelines) ── */}
                    {allPipelines.length > 1 && (() => {
                        const allVisibleOpps = canSeeAll ? (opportunities||[]) : (opportunities||[]).filter(o => !o.salesRep || o.salesRep === currentUser);
                        return (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', marginBottom: '1.5rem', overflow: 'hidden' }}>
                                <div style={{ padding: '0.875rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <div style={{ fontSize: '0.6875rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.08em' }}>All Pipelines</div>
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Org total across all pipelines</div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${allPipelines.length}, 1fr)`, gap: 0 }}>
                                    {allPipelines.map((p, idx) => {
                                        const pOpps = allVisibleOpps.filter(o => (o.pipelineId||'default') === p.id);
                                        const active = pOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                                        const won    = pOpps.filter(o => o.stage === 'Closed Won');
                                        const pipelineARR = active.reduce((s,o) => s+(o.arr||0), 0);
                                        const wonARR = won.reduce((s,o) => s+(o.arr||0)+(o.implementationCost||0), 0);
                                        const isCurrent = p.id === activePipeline.id;
                                        return (
                                            <div key={p.id} onClick={() => setActivePipelineId(p.id)} style={{
                                                padding: '1rem 1.5rem', cursor: 'pointer', transition: 'background 0.15s',
                                                borderRight: idx < allPipelines.length-1 ? '1px solid #f1f5f9' : 'none',
                                                background: isCurrent ? '#fafbff' : '#fff',
                                                borderTop: isCurrent ? `3px solid ${p.color}` : '3px solid transparent',
                                            }}
                                            onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = '#f8fafc'; }}
                                            onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = '#fff'; }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                                                    <span style={{ fontWeight: '800', fontSize: '0.875rem', color: '#1e293b' }}>{p.name}</span>
                                                    {isCurrent && <span style={{ fontSize: '0.5625rem', fontWeight: '700', background: p.color, color: '#fff', padding: '0.0625rem 0.375rem', borderRadius: '999px' }}>ACTIVE</span>}
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.625rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active ARR</div>
                                                        <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#1e293b' }}>${pipelineARR >= 1000000 ? (pipelineARR/1000000).toFixed(1)+'M' : pipelineARR >= 1000 ? Math.round(pipelineARR/1000)+'K' : pipelineARR.toLocaleString()}</div>
                                                        <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.125rem' }}>{active.length} deal{active.length!==1?'s':''}</div>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontSize: '0.625rem', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Closed Won</div>
                                                        <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#10b981' }}>${wonARR >= 1000000 ? (wonARR/1000000).toFixed(1)+'M' : wonARR >= 1000 ? Math.round(wonARR/1000)+'K' : wonARR.toLocaleString()}</div>
                                                        <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.125rem' }}>{won.length} deal{won.length!==1?'s':''}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div className="table-container">
                            <div className="table-header">
                                <h2>UPCOMING TASKS</h2>
                                <button className="btn" onClick={() => setActiveTab('tasks')}>View All</button>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                {visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed').sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999')).slice(0, 5).length === 0 ? (
                                    <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                        No open tasks
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                                        {visibleTasks.filter(t => (t.status || (t.completed ? 'Completed' : 'Open')) !== 'Completed').sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999')).slice(0, 5).map(task => {
                                            const isOverdue = task.dueDate && new Date(task.dueDate + 'T12:00:00') < new Date();
                                            return (
                                            <div key={task.id}
                                                onClick={() => { setEditingTask(task); setShowTaskModal(true); }}
                                                style={{
                                                    padding: '0.75rem',
                                                    border: '1px solid ' + (isOverdue ? '#fecaca' : '#e2e8f0'),
                                                    borderRadius: '6px',
                                                    background: isOverdue ? '#fff5f5' : '#f8fafc',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = isOverdue ? '#fee2e2' : '#f1f5f9'}
                                                onMouseLeave={e => e.currentTarget.style.background = isOverdue ? '#fff5f5' : '#f8fafc'}>
                                                <div style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.25rem', color: '#1e293b' }}>
                                                    {task.title}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: isOverdue ? '#ef4444' : '#64748b' }}>
                                                    {task.type}{task.dueDate ? ' • Due: ' + new Date(task.dueDate + 'T12:00:00').toLocaleDateString() : ''}
                                                    {isOverdue ? ' — Overdue' : ''}
                                                </div>
                                            </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="table-container">
                            <div className="table-header">
                                <h2>PIPELINE BY QUARTER</h2>
                                <button className="btn" onClick={() => setActiveTab('reports')}>View All</button>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                                {(() => {
                                    // Get current fiscal year quarters
                                    const currentDate = new Date();
                                    const currentYear = currentDate.getFullYear();
                                    const currentMonth = currentDate.getMonth() + 1;
                                    const fiscalStart = settings.fiscalYearStart || 10;
                                    
                                    // Determine current fiscal year
                                    let currentFiscalYear;
                                    if (currentMonth >= fiscalStart) {
                                        currentFiscalYear = currentYear + 1;
                                    } else {
                                        currentFiscalYear = currentYear;
                                    }

                                    // Calculate quarterly data for current fiscal year only
                                    const quarterlyData = {};
                                    opportunities.forEach(opp => {
                                        if (opp.forecastedCloseDate) {
                                            const quarter = getQuarter(opp.forecastedCloseDate);
                                            const quarterLabel = getQuarterLabel(quarter, opp.forecastedCloseDate);
                                            
                                            // Only include if it's in the current fiscal year
                                            if (quarterLabel.startsWith(`FY${currentFiscalYear}`)) {
                                                if (!quarterlyData[quarterLabel]) {
                                                    quarterlyData[quarterLabel] = {
                                                        count: 0,
                                                        totalValue: 0,
                                                        sortKey: new Date(opp.forecastedCloseDate + 'T12:00:00').getTime()
                                                    };
                                                }
                                                quarterlyData[quarterLabel].count++;
                                                quarterlyData[quarterLabel].totalValue += (opp.arr + opp.implementationCost);
                                            }
                                        }
                                    });

                                    const sortedQuarters = Object.entries(quarterlyData)
                                        .sort((a, b) => a[1].sortKey - b[1].sortKey);
                                    
                                    const maxValue = sortedQuarters.length > 0 ? Math.max(...sortedQuarters.map(([_, data]) => data.totalValue)) : 1;

                                    return sortedQuarters.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                            No opportunities in FY{currentFiscalYear}
                                        </div>
                                    ) : (
                                        <div style={{ display: 'grid', gap: '1.25rem' }}>
                                            {sortedQuarters.map(([quarter, data]) => (
                                                <div key={quarter}>
                                                    <div style={{ 
                                                        display: 'flex', 
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        marginBottom: '0.5rem'
                                                    }}>
                                                        <div>
                                                            <div style={{ 
                                                                fontSize: '0.875rem',
                                                                fontWeight: '700',
                                                                color: '#1e293b'
                                                            }}>
                                                                {quarter}
                                                            </div>
                                                            <div style={{ 
                                                                fontSize: '0.75rem',
                                                                color: '#64748b'
                                                            }}>
                                                                {data.count} opportunities
                                                            </div>
                                                        </div>
                                                        <div style={{ 
                                                            fontSize: '1rem', 
                                                            fontWeight: '800', 
                                                            color: '#f59e0b' 
                                                        }}>
                                                            ${data.totalValue.toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <div style={{
                                                        height: '8px',
                                                        background: '#f1f3f5',
                                                        borderRadius: '4px',
                                                        overflow: 'hidden'
                                                    }}>
                                                        <div style={{
                                                            height: '100%',
                                                            width: `${(data.totalValue / maxValue) * 100}%`,
                                                            background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-warning))',
                                                            transition: 'width 0.5s ease'
                                                        }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Rep Leaderboard — managers/admins only, 2+ reps */}
                    {canSeeAll && (() => {
                        const lbReps = [...new Set([
                            ...(settings.users || []).filter(u => u.name).map(u => u.name),
                            ...visibleOpportunities.filter(o => o.salesRep).map(o => o.salesRep)
                        ])].sort();
                        if (lbReps.length < 2) return null;

                        const lbData = lbReps.map(rep => {
                            const repOpps = visibleOpportunities.filter(o => (o.salesRep || o.assignedTo) === rep);
                            const won = repOpps.filter(o => o.stage === 'Closed Won');
                            const open = repOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                            const wonRev = won.reduce((s, o) => s + (parseFloat(o.arr)||0) + (o.implementationCost||0), 0);
                            const pipeline = open.reduce((s, o) => s + (parseFloat(o.arr)||0) + (o.implementationCost||0), 0);
                            const total = repOpps.filter(o => o.stage === 'Closed Won' || o.stage === 'Closed Lost').length;
                            const winRate = total > 0 ? Math.round(won.length / total * 100) : null;
                            return { rep, wonRev, pipeline, wonDeals: won.length, openDeals: open.length, winRate };
                        }).sort((a, b) => b.wonRev - a.wonRev);

                        const maxWonRev = Math.max(...lbData.map(r => r.wonRev), 1);
                        const medals = ['🥇','🥈','🥉'];
                        const rankColors = ['#f59e0b','#94a3b8','#d97706'];

                        return (
                            <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                                <div className="table-header">
                                    <h2>🏆 REP LEADERBOARD</h2>
                                    <button className="btn" onClick={() => setActiveTab('reports')}>Full Report</button>
                                </div>
                                <div style={{ padding: '1.25rem 1.5rem' }}>
                                    {/* Column headers */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1.5rem 1fr 2fr 5rem 5rem 5rem', gap: '0.75rem', alignItems: 'center', padding: '0 0.25rem 0.5rem', borderBottom: '1px solid #f1f5f9', marginBottom: '0.75rem' }}>
                                        <div></div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rep</div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Won Revenue</div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Deals Won</div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Pipeline</div>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Win Rate</div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                        {lbData.map(({ rep, wonRev, pipeline, wonDeals, openDeals, winRate }, i) => (
                                            <div key={rep} style={{ display: 'grid', gridTemplateColumns: '1.5rem 1fr 2fr 5rem 5rem 5rem', gap: '0.75rem', alignItems: 'center', padding: '0.625rem 0.25rem', borderRadius: '8px', background: i === 0 ? '#fffbeb' : 'transparent', transition: 'background 0.15s' }}
                                                onMouseEnter={e => { if (i > 0) e.currentTarget.style.background = '#f8fafc'; }}
                                                onMouseLeave={e => { if (i > 0) e.currentTarget.style.background = 'transparent'; }}>
                                                <div style={{ fontSize: '1rem', textAlign: 'center' }}>{medals[i] || <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#94a3b8' }}>{i+1}</span>}</div>
                                                <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rep}</div>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        <div style={{ flex: 1, height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                                                            <div style={{ height: '100%', width: (wonRev/maxWonRev*100) + '%', background: i === 0 ? 'linear-gradient(to right,#f59e0b,#10b981)' : 'linear-gradient(to right,#2563eb,#7c3aed)', borderRadius: '4px', transition: 'width 0.5s ease' }}></div>
                                                        </div>
                                                        <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap', minWidth: '70px', textAlign: 'right' }}>${wonRev.toLocaleString()}</span>
                                                    </div>
                                                </div>
                                                <div style={{ textAlign: 'right', fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{wonDeals} <span style={{ fontSize: '0.6875rem', color: '#94a3b8', fontWeight: '400' }}>({openDeals} open)</span></div>
                                                <div style={{ textAlign: 'right', fontSize: '0.8125rem', color: '#64748b' }}>${Math.round(pipeline/1000)}K</div>
                                                <div style={{ textAlign: 'right' }}>
                                                    {winRate !== null
                                                        ? <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: winRate >= 60 ? '#10b981' : winRate >= 40 ? '#f59e0b' : '#ef4444' }}>{winRate}%</span>
                                                        : <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>—</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── CALENDAR STRIP (week / month view with activities) ── */}
                    {(() => {
                        const today = new Date(); today.setHours(0,0,0,0);

                        // ── helpers ──
                        const formatTime = (iso) => { if (!iso) return ''; const d = new Date(iso); const h = d.getHours(), m = d.getMinutes(); return (h%12||12)+(m?':'+String(m).padStart(2,'0'):'')+(h>=12?'pm':'am'); };
                        const isSameDay = (a, b) => { const x=new Date(a); x.setHours(0,0,0,0); const y=new Date(b); y.setHours(0,0,0,0); return x.getTime()===y.getTime(); };
                        const dayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                        const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

                        // ── filtered SPT activities (calls + meetings only) ──
                        // Personal calendar — show only the logged-in user's own activities.
                        // Managers/admins have dedicated reports for rep activity review.
                        const sptActivities = (activities || []).filter(a => {
                            if (!a.date) return false;
                            if (a.type === 'Call' && !calShowCalls) return false;
                            if (a.type === 'Meeting' && !calShowMeetings) return false;
                            if (a.type !== 'Call' && a.type !== 'Meeting') return false;
                            // Only show activities logged by the current user
                            return a.author === currentUser || a.salesRep === currentUser || a.assignedTo === currentUser;
                        });

                        const getActivitiesForDay = (day) => sptActivities.filter(a => isSameDay(a.date, day));
                        const getEventsForDay = (day) => calShowGcal ? calendarEvents.filter(ev => {
                            const d = new Date(ev.start?.dateTime || ev.start?.date); d.setHours(0,0,0,0);
                            return d.getTime() === day.getTime();
                        }) : [];

                        // ── week view helpers ──
                        const weekStart = new Date(today); weekStart.setDate(today.getDate() + calOffset * 7);
                        // snap to Sunday of that week
                        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                        const weekDays = Array.from({length:7}, (_,i) => { const d=new Date(weekStart); d.setDate(weekStart.getDate()+i); return d; });
                        const visibleWeekDays = calShowWeekends ? weekDays : weekDays.filter(d => d.getDay()!==0 && d.getDay()!==6);

                        // ── month view helpers ──
                        const monthBase = new Date(today.getFullYear(), today.getMonth() + calOffset, 1);
                        const firstDayOfMonth = new Date(monthBase);
                        const lastDayOfMonth = new Date(monthBase.getFullYear(), monthBase.getMonth()+1, 0);
                        const monthGridStart = new Date(firstDayOfMonth); monthGridStart.setDate(1 - firstDayOfMonth.getDay());
                        const totalCells = Math.ceil((firstDayOfMonth.getDay() + lastDayOfMonth.getDate()) / 7) * 7;
                        const monthDays = Array.from({length: totalCells}, (_,i) => { const d=new Date(monthGridStart); d.setDate(monthGridStart.getDate()+i); return d; });

                        // ── header label ──
                        const headerLabel = calView === 'week'
                            ? monthNames[weekStart.getMonth()] + ' ' + weekStart.getFullYear()
                            : monthNames[monthBase.getMonth()] + ' ' + monthBase.getFullYear();

                        const allRepNames = [...new Set((settings.users||[]).filter(u=>u.name && u.userType !== 'ReadOnly').map(u=>u.name))].sort();

                        // ── event/activity card renderers ──
                        const GcalEvent = ({ev, ei}) => (
                            <div title={ev.summary + ' — click to prep'} onClick={() => { setMeetingPrepEvent(ev); setMeetingPrepOpen(true); }}
                                style={{ background:'#E6F1FB', borderLeft:'2px solid #185FA5', borderRadius:'3px', padding:'2px 4px', marginBottom:'2px', cursor:'pointer' }}>
                                {ev.start?.dateTime && <div style={{ fontSize:'0.525rem', fontWeight:'700', color:'#185FA5', lineHeight:1 }}>{formatTime(ev.start.dateTime)}</div>}
                                <div style={{ fontSize:'0.575rem', fontWeight:'600', color:'#0C447C', lineHeight:1.25, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{ev.summary||'Untitled'}</div>
                            </div>
                        );

                        const ActivityChip = ({a}) => {
                            const isCall = a.type === 'Call';
                            const bg = isCall ? '#FAEEDA' : '#E1F5EE';
                            const border = isCall ? '#854F0B' : '#0F6E56';
                            const color = isCall ? '#633806' : '#085041';
                            const label = (a.companyName || a.opportunityName || a.contactName || a.author || '').slice(0,20) || a.type;
                            return (
                                <div style={{ background:bg, borderLeft:'2px solid '+border, borderRadius:'3px', padding:'2px 4px', marginBottom:'2px' }}>
                                    <div style={{ fontSize:'0.525rem', fontWeight:'700', color:border, lineHeight:1 }}>logged</div>
                                    <div style={{ fontSize:'0.575rem', fontWeight:'600', color, lineHeight:1.25, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.type} · {label}</div>
                                </div>
                            );
                        };

                        const ActivityBadges = ({day}) => {
                            const acts = getActivitiesForDay(day);
                            const calls = acts.filter(a=>a.type==='Call');
                            const meetings = acts.filter(a=>a.type==='Meeting');
                            return (
                                <div style={{ display:'flex', flexWrap:'wrap', gap:'2px', marginTop:'2px' }}>
                                    {calls.length > 0 && <span style={{ fontSize:'0.5rem', fontWeight:'600', padding:'1px 4px', borderRadius:'999px', background:'#FAEEDA', color:'#633806' }}>{calls.length} call{calls.length>1?'s':''}</span>}
                                    {meetings.length > 0 && <span style={{ fontSize:'0.5rem', fontWeight:'600', padding:'1px 4px', borderRadius:'999px', background:'#E1F5EE', color:'#085041' }}>{meetings.length} mtg{meetings.length>1?'s':''}</span>}
                                </div>
                            );
                        };

                        return (
                            <div className="table-container" style={{ marginBottom:'1.5rem' }}>

                                {/* ── Header ── */}
                                <div className="table-header" style={{ flexWrap:'wrap', gap:'0.5rem' }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                        <h2>📅 {headerLabel}</h2>
                                        <div style={{ display:'flex', gap:'2px' }}>
                                            <button onClick={() => setCalOffset(o=>o-1)} style={{ padding:'2px 7px', border:'1px solid #e2e8f0', borderRadius:'4px', background:'#f8fafc', cursor:'pointer', fontFamily:'inherit', fontSize:'0.75rem', color:'#475569' }}>&#8249;</button>
                                            <button onClick={() => setCalOffset(0)} style={{ padding:'2px 7px', border:'1px solid #e2e8f0', borderRadius:'4px', background:'#f8fafc', cursor:'pointer', fontFamily:'inherit', fontSize:'0.75rem', color:'#475569' }}>Today</button>
                                            <button onClick={() => setCalOffset(o=>o+1)} style={{ padding:'2px 7px', border:'1px solid #e2e8f0', borderRadius:'4px', background:'#f8fafc', cursor:'pointer', fontFamily:'inherit', fontSize:'0.75rem', color:'#475569' }}>&#8250;</button>
                                        </div>
                                    </div>
                                    <div style={{ display:'flex', gap:'0.375rem', alignItems:'center', flexWrap:'wrap' }}>
                                        {/* View toggle */}
                                        <div style={{ display:'flex', background:'#f1f3f5', borderRadius:'6px', padding:'2px', gap:'2px' }}>
                                            {['week','month'].map(v => (
                                                <button key={v} onClick={() => { setCalView(v); setCalOffset(0); }}
                                                    style={{ padding:'3px 10px', borderRadius:'4px', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:'0.6875rem', fontWeight:'700', transition:'all 0.15s',
                                                        background: calView===v ? '#fff' : 'transparent',
                                                        color: calView===v ? '#1e293b' : '#64748b',
                                                        boxShadow: calView===v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                                                    {v.charAt(0).toUpperCase()+v.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                        {/* Configure button */}
                                        <button onClick={() => setShowCalConfig(v=>!v)}
                                            style={{ padding:'3px 10px', border:'1px solid '+(showCalConfig?'#2563eb':'#e2e8f0'), borderRadius:'6px', background: showCalConfig?'#eff6ff':'#f8fafc', color: showCalConfig?'#2563eb':'#475569', fontSize:'0.6875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                                            ⚙ Configure
                                        </button>
                                        {calendarConnected && (
                                            <button className="btn" onClick={fetchCalendarEvents} disabled={calendarLoading} style={{ fontSize:'0.6875rem', padding:'3px 8px' }}>
                                                {calendarLoading ? '↻…' : '↻ Refresh'}
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* ── Configure Panel ── */}
                                {showCalConfig && (
                                    <div style={{ margin:'0 1.25rem 0.75rem', padding:'1rem', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'10px', display:'flex', flexWrap:'wrap', gap:'1.25rem' }}>

                                        {/* Provider */}
                                        <div>
                                            <div style={{ fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.5rem' }}>Calendar provider</div>
                                            <div style={{ display:'flex', gap:'0.375rem', flexWrap:'wrap' }}>
                                                {[
                                                    { id:'google',    label:'Google' },
                                                    { id:'microsoft', label:'Microsoft' },
                                                    { id:'apple',     label:'Apple' },
                                                    { id:'yahoo',     label:'Yahoo' },
                                                ].map(p => (
                                                    <button key={p.id} onClick={() => setCalProvider(p.id)}
                                                        style={{ padding:'4px 10px', borderRadius:'6px', border:'1px solid '+(calProvider===p.id?'#2563eb':'#e2e8f0'), background:calProvider===p.id?'#eff6ff':'#fff', color:calProvider===p.id?'#2563eb':'#475569', fontSize:'0.75rem', fontWeight: calProvider===p.id?'700':'400', cursor:'pointer', fontFamily:'inherit' }}>
                                                        {calProvider===p.id ? '✓ ' : ''}{p.label}
                                                        {p.id !== 'google' && <span style={{ fontSize:'0.6rem', color:'#94a3b8', marginLeft:'4px' }}>(coming soon)</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Show/hide toggles */}
                                        <div>
                                            <div style={{ fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.5rem' }}>Show on calendar</div>
                                            <div style={{ display:'flex', flexDirection:'column', gap:'0.375rem' }}>
                                                {[
                                                    { label:'Google Calendar events', val:calShowGcal,     set:setCalShowGcal },
                                                    { label:'Logged calls',           val:calShowCalls,    set:setCalShowCalls },
                                                    { label:'Logged meetings',        val:calShowMeetings, set:setCalShowMeetings },
                                                    { label:'Weekends',               val:calShowWeekends, set:setCalShowWeekends },
                                                ].map(t => (
                                                    <label key={t.label} style={{ display:'flex', alignItems:'center', gap:'0.5rem', cursor:'pointer', fontSize:'0.8125rem', color:'#1e293b' }}>
                                                        <input type="checkbox" checked={t.val} onChange={e => t.set(e.target.checked)} style={{ width:'14px', height:'14px', accentColor:'#2563eb', cursor:'pointer' }} />
                                                        {t.label}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Default view */}
                                        <div>
                                            <div style={{ fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.5rem' }}>Default view</div>
                                            <div style={{ display:'flex', gap:'0.375rem' }}>
                                                {['week','month'].map(v => (
                                                    <button key={v} onClick={() => setCalView(v)}
                                                        style={{ padding:'4px 10px', borderRadius:'6px', border:'1px solid '+(calView===v?'#2563eb':'#e2e8f0'), background:calView===v?'#eff6ff':'#fff', color:calView===v?'#2563eb':'#475569', fontSize:'0.75rem', fontWeight:calView===v?'700':'400', cursor:'pointer', fontFamily:'inherit' }}>
                                                        {calView===v?'✓ ':''}{v.charAt(0).toUpperCase()+v.slice(1)}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div style={{ padding:'1rem 1.25rem' }}>
                                    {/* Loading / error / not connected states */}
                                    {calendarLoading && (
                                        <div style={{ textAlign:'center', padding:'2rem', color:'#64748b', fontSize:'0.875rem' }}>
                                            <span style={{ display:'inline-block', animation:'spin 1s linear infinite', marginRight:'0.5rem' }}>↻</span>
                                            Loading calendar…
                                        </div>
                                    )}
                                    {calendarError && !calendarLoading && (
                                        <div style={{ textAlign:'center', padding:'1.5rem', color:'#94a3b8', fontSize:'0.8125rem' }}>
                                            <div style={{ fontWeight:'600', color:'#475569', marginBottom:'0.25rem' }}>Connect your Google Calendar</div>
                                            <div style={{ marginBottom:'1rem', fontSize:'0.75rem' }}>See this week's meetings alongside your pipeline</div>
                                            <button onClick={fetchCalendarEvents} style={{ padding:'0.45rem 1.25rem', border:'none', borderRadius:'6px', background:'#2563eb', color:'#fff', fontSize:'0.8125rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>Connect Google Calendar</button>
                                        </div>
                                    )}
                                    {!calendarLoading && !calendarError && !calendarConnected && (
                                        <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8' }}>
                                            <div style={{ fontSize:'2rem', marginBottom:'0.5rem' }}>📅</div>
                                            <div style={{ fontWeight:'600', color:'#475569', fontSize:'0.875rem', marginBottom:'0.25rem' }}>See your week at a glance</div>
                                            <div style={{ fontSize:'0.75rem', marginBottom:'1rem' }}>Connect Google Calendar to see meetings alongside your pipeline</div>
                                            <button onClick={fetchCalendarEvents} style={{ padding:'0.5rem 1.25rem', border:'none', borderRadius:'8px', background:'#2563eb', color:'#fff', fontSize:'0.8125rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>Connect Google Calendar</button>
                                        </div>
                                    )}

                                    {/* ── WEEK VIEW ── */}
                                    {!calendarLoading && !calendarError && calendarConnected && calView === 'week' && (
                                        <>
                                        <div style={{ display:'grid', gridTemplateColumns:`repeat(${visibleWeekDays.length}, 1fr)`, gap:'0.5rem' }}>
                                            {visibleWeekDays.map((day, di) => {
                                                const isToday = isSameDay(day, today);
                                                const isWeekend = day.getDay()===0 || day.getDay()===6;
                                                const gcalEvs = getEventsForDay(day);
                                                const acts = getActivitiesForDay(day);
                                                return (
                                                    <div key={di} style={{ border: isToday?'2px solid #2563eb':'1px solid #e2e8f0', borderRadius:'10px', background: isToday?'#eff6ff': isWeekend?'#fafafa':'#fff', overflow:'hidden', minHeight:'110px' }}>
                                                        <div style={{ padding:'0.4rem 0.5rem 0.3rem', borderBottom:'1px solid '+(isToday?'#bfdbfe':'#f1f5f9'), background:isToday?'#dbeafe':'transparent' }}>
                                                            <div style={{ fontSize:'0.575rem', fontWeight:'700', color:isToday?'#2563eb':'#94a3b8', textTransform:'uppercase', letterSpacing:'0.07em' }}>{dayLabels[day.getDay()]}</div>
                                                            <div style={{ fontSize:'0.9375rem', fontWeight:'800', color:isToday?'#2563eb':'#1e293b', lineHeight:1.1 }}>{day.getDate()}</div>
                                                            <div style={{ fontSize:'0.575rem', color:isToday?'#3b82f6':'#cbd5e1' }}>{monthNames[day.getMonth()]}</div>
                                                        </div>
                                                        <div style={{ padding:'0.3rem 0.4rem' }}>
                                                            {gcalEvs.length===0 && acts.length===0 && <div style={{ fontSize:'0.575rem', color:'#e2e8f0', textAlign:'center', padding:'0.4rem 0', userSelect:'none' }}>—</div>}
                                                            {gcalEvs.slice(0,3).map((ev,ei) => <GcalEvent key={ev.id||ei} ev={ev} ei={ei} />)}
                                                            {acts.slice(0,3).map((a,ai) => <ActivityChip key={a.id||ai} a={a} />)}
                                                            {gcalEvs.length + acts.length > 6 && <div style={{ fontSize:'0.525rem', color:'#94a3b8', textAlign:'center' }}>+{gcalEvs.length+acts.length-6} more</div>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        {/* Legend */}
                                        <div style={{ display:'flex', gap:'0.875rem', marginTop:'0.625rem', flexWrap:'wrap' }}>
                                            {calShowGcal && <div style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'0.6875rem', color:'#64748b' }}><div style={{ width:'8px', height:'8px', borderRadius:'2px', background:'#185FA5', flexShrink:0 }}></div>Google Calendar</div>}
                                            {calShowCalls && <div style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'0.6875rem', color:'#64748b' }}><div style={{ width:'8px', height:'8px', borderRadius:'2px', background:'#854F0B', flexShrink:0 }}></div>Logged call</div>}
                                            {calShowMeetings && <div style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'0.6875rem', color:'#64748b' }}><div style={{ width:'8px', height:'8px', borderRadius:'2px', background:'#0F6E56', flexShrink:0 }}></div>Logged meeting</div>}
                                        </div>
                                        </>
                                    )}

                                    {/* ── MONTH VIEW ── */}
                                    {!calendarLoading && !calendarError && calendarConnected && calView === 'month' && (
                                        <div style={{ border:'1px solid #e2e8f0', borderRadius:'8px', overflow:'hidden' }}>
                                            {/* Day-of-week headers */}
                                            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
                                                {dayLabels.map(d => <div key={d} style={{ padding:'4px 0', textAlign:'center', fontSize:'0.6rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>{d}</div>)}
                                            </div>
                                            {/* Month grid */}
                                            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)' }}>
                                                {monthDays.map((day, di) => {
                                                    const isToday = isSameDay(day, today);
                                                    const isCurrentMonth = day.getMonth() === monthBase.getMonth();
                                                    const gcalEvs = getEventsForDay(day);
                                                    const acts = getActivitiesForDay(day);
                                                    const calls = acts.filter(a=>a.type==='Call');
                                                    const meetings = acts.filter(a=>a.type==='Meeting');
                                                    const isLastCol = (di+1)%7===0;
                                                    const isLastRow = di >= monthDays.length-7;
                                                    return (
                                                        <div key={di} style={{ borderRight: isLastCol?'none':'1px solid #f1f5f9', borderBottom: isLastRow?'none':'1px solid #f1f5f9', padding:'4px 5px', minHeight:'68px', background: isToday?'#f0f7ff': !isCurrentMonth?'#fafafa':'#fff' }}>
                                                            <div style={{ width:'20px', height:'20px', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:'2px', background:isToday?'#185FA5':'transparent' }}>
                                                                <span style={{ fontSize:'0.6875rem', fontWeight:'500', color: isToday?'#fff': isCurrentMonth?'#475569':'#cbd5e1' }}>{day.getDate()}</span>
                                                            </div>
                                                            {gcalEvs.slice(0,2).map((ev,ei) => (
                                                                <div key={ev.id||ei} onClick={() => { setMeetingPrepEvent(ev); setMeetingPrepOpen(true); }}
                                                                    style={{ fontSize:'0.55rem', fontWeight:'600', color:'#0C447C', background:'#E6F1FB', borderRadius:'3px', padding:'1px 3px', marginBottom:'1px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                                                                    {ev.summary||'Event'}
                                                                </div>
                                                            ))}
                                                            <div style={{ display:'flex', flexWrap:'wrap', gap:'2px' }}>
                                                                {calShowCalls && calls.length>0 && <span style={{ fontSize:'0.5rem', fontWeight:'600', padding:'1px 4px', borderRadius:'999px', background:'#FAEEDA', color:'#633806' }}>{calls.length} call{calls.length>1?'s':''}</span>}
                                                                {calShowMeetings && meetings.length>0 && <span style={{ fontSize:'0.5rem', fontWeight:'600', padding:'1px 4px', borderRadius:'999px', background:'#E1F5EE', color:'#085041' }}>{meetings.length} mtg{meetings.length>1?'s':''}</span>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* ── LOG FROM CALENDAR (Dashboard) ── */}
                    <div className="table-container" style={{ marginBottom: '1.5rem' }}>
                        <div className="table-header">
                            <h2>📋 LOG FROM CALENDAR</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input type="date" value={logFromCalDateFrom} onChange={e => setLogFromCalDateFrom(e.target.value)}
                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontFamily: 'inherit', color: '#1e293b' }} />
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>to</span>
                                <input type="date" value={logFromCalDateTo} onChange={e => setLogFromCalDateTo(e.target.value)}
                                    style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontFamily: 'inherit', color: '#1e293b' }} />
                                <button className="btn" onClick={fetchLogFromCalEvents} disabled={logFromCalLoading}
                                    style={{ fontSize: '0.75rem' }}>
                                    {logFromCalLoading ? 'Loading…' : 'Fetch Meetings'}
                                </button>
                            </div>
                        </div>
                        <div style={{ padding: '1rem 1.25rem' }}>
                            {logFromCalError && (
                                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.8125rem' }}>
                                    <div style={{ marginBottom: '0.5rem' }}>Could not load calendar events. Make sure Google Calendar is connected.</div>
                                    <button className="btn" onClick={fetchLogFromCalEvents}>Try Again</button>
                                </div>
                            )}
                            {!logFromCalError && logFromCalEvents.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.8125rem' }}>
                                    Set a date range and click Fetch Meetings to see past calendar events
                                </div>
                            )}
                            {logFromCalEvents.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {logFromCalEvents.map(ev => {
                                        const isLogged = loggedCalendarIds.has(ev.id);
                                        const isLinking = logFromCalLinkingId === ev.id;
                                        const evDate = ev.start?.date || (ev.start?.dateTime ? ev.start.dateTime.split('T')[0] : '');
                                        const evTime = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'All day';
                                        return (
                                            <div key={ev.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0.875rem', border: '1px solid ' + (isLogged ? '#bbf7d0' : '#e2e8f0'), borderRadius: '8px', background: isLogged ? '#f0fdf4' : '#fff', gap: '1rem' }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: '600', fontSize: '0.875rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.summary || 'Untitled Event'}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.1rem' }}>{evDate} · {evTime}{ev.attendeeCount > 0 ? ` · ${ev.attendeeCount} attendees` : ''}</div>
                                                </div>
                                                {isLogged ? (
                                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#059669', background: '#dcfce7', padding: '0.2rem 0.625rem', borderRadius: '999px', whiteSpace: 'nowrap', flexShrink: 0 }}>✓ Logged</span>
                                                ) : isLinking ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                                        <select onChange={e => handleLogFromCalendar(ev, e.target.value)}
                                                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', border: '1px solid #2563eb', borderRadius: '6px', fontFamily: 'inherit', color: '#1e293b', maxWidth: '180px' }}>
                                                            <option value="">— No opportunity —</option>
                                                            {(opportunities || []).filter(o => !['Closed Won','Closed Lost'].includes(o.stage)).map(o => (
                                                                <option key={o.id} value={o.id}>{o.opportunityName || o.account}</option>
                                                            ))}
                                                        </select>
                                                        <button onClick={() => handleLogFromCalendar(ev, '')} style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', border: 'none', borderRadius: '6px', background: '#2563eb', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Save</button>
                                                        <button onClick={() => setLogFromCalLinkingId(null)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                                                        <button onClick={() => { setMeetingPrepEvent(ev); setMeetingPrepOpen(true); }} style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', border: '1px solid #7c3aed', borderRadius: '6px', background: '#f5f3ff', color: '#6d28d9', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Prep</button>
                                                        <button onClick={() => setLogFromCalLinkingId(ev.id)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', border: '1px solid #2563eb', borderRadius: '6px', background: '#eff6ff', color: '#1d4ed8', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Log this</button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="table-container">
                        <div className="table-header">
                            <h2>RECENT OPPORTUNITIES</h2>
                            <button className="btn" onClick={() => setActiveTab('pipeline')}>View All</button>
                        </div>
                        <div style={{ padding: '1.5rem' }}>
                            {visibleOpportunities.slice(0, 5).length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                    No opportunities yet
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: '0.75rem' }}>
                                    {visibleOpportunities.slice(0, 5).map(opp => (
                                        <div key={opp.id}
                                            onClick={() => { setEditingOpp(opp); setShowModal(true); }}
                                            style={{
                                                padding: '0.75rem',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '6px',
                                                background: '#f8fafc',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background='#f1f5f9'; e.currentTarget.style.borderColor='#cbd5e1'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background='#f8fafc'; e.currentTarget.style.borderColor='#e2e8f0'; }}>
                                            <div style={{ fontWeight: '600', fontSize: '0.875rem', marginBottom: '0.25rem', color:'#1e293b' }}>
                                                {opp.opportunityName || opp.account + (opp.site ? ' - ' + opp.site : '')}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', display:'flex', gap:'0.5rem', alignItems:'center' }}>
                                                <span style={{ fontWeight:'600', color:'#1e293b' }}>${(opp.arr||0).toLocaleString()}</span>
                                                <span>·</span>
                                                <span>{opp.stage}</span>
                                                {opp.salesRep && <><span>·</span><span>{opp.salesRep}</span></>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            
    );
}
