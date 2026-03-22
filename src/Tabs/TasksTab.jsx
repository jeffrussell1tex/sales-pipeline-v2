import React, { useState } from 'react';
import { useApp } from '../AppContext';
import TaskItem from '../components/ui/TaskItem';
import ViewingBar from '../components/ui/ViewingBar';

export default function TasksTab() {
    const {
        tasks, setTasks,
        opportunities,
        contacts,
        accounts,
        activities,
        settings,
        currentUser,
        userRole,
        canSeeAll,
        isRepVisible,
        exportToCSV,
        exportingCSV, setExportingCSV,
        showConfirm,
        softDelete,
        addAudit,
        getStageColor,
        calculateDealHealth,
        visibleTasks,
        handleDeleteTask,
        handleSaveTask,
        handleCompleteTask,
        handleAddTaskToCalendar,
        allPipelines,
        activePipeline,
        activePipelineId, setActivePipelineId,
        allRepNames,
        allTeamNames,
        allTerritoryNames,
        viewingRep, setViewingRep,
        viewingTeam, setViewingTeam,
        viewingTerritory, setViewingTerritory,
        stages,
        logFromCalOpen, setLogFromCalOpen,
        logFromCalDateFrom, setLogFromCalDateFrom,
        logFromCalDateTo, setLogFromCalDateTo,
        logFromCalEvents, setLogFromCalEvents,
        logFromCalLoading,
        logFromCalError,
        loggedCalendarIds, setLoggedCalendarIds,
        logFromCalLinkingId, setLogFromCalLinkingId,
        logFromCalOppMap, setLogFromCalOppMap,
        fetchLogFromCalEvents,
        meetingPrepEvent, setMeetingPrepEvent,
        meetingPrepOpen, setMeetingPrepOpen,
        meetingPrepOppId, setMeetingPrepOppId,
        calendarEvents, calendarConnected, calendarLoading, calendarError,
        setEditingTask, setShowTaskModal,
        setActivityInitialContext, setEditingActivity, setShowActivityModal,
        setShowOutlookImportModal,
        viewingTask, setViewingTask,
        feedFilter, setFeedFilter,
        feedLastRead, setFeedLastRead,
        isMobile,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;

    // Local state
    const [tasksSubView, setTasksSubView] = useState('tasks');
    const [taskViewMode, setTaskViewMode] = useState('card');
    const [taskStatusFilter, setTaskStatusFilter] = useState([]);
    const [tasksExpandedSections, setTasksExpandedSections] = useState({
        overdue: true, today: true, upcoming: true, future: false, completed: false
    });
    const [completedDateFrom, setCompletedDateFrom] = useState('');
    const [completedDateTo, setCompletedDateTo] = useState('');

    // UI handlers
    const handleAddTask = () => { setEditingTask(null); setShowTaskModal(true); };
    const handleEditTask = (task) => { setEditingTask(task); setShowTaskModal(true); };
    const handleAddActivity = () => { setActivityInitialContext(null); setEditingActivity(null); setShowActivityModal(true); };
    const handleLogFromCalendar = () => { setActivityInitialContext(null); setEditingActivity(null); setShowActivityModal(true); };

    // Feed pre-computation (avoids IIFE-in-JSX Babel issues)
    const feedAvatarColors = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ec4899','#0891b2','#ef4444'];
    const feedGetAvatarColor = (name) => feedAvatarColors[(name||'A').charCodeAt(0) % feedAvatarColors.length];
    const feedGetInitials = (name) => (name||'?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const feedActTypeIcon = { Call: '📞', Email: '✉️', Meeting: '🤝', Demo: '🖥️', 'Proposal Sent': '📄', 'Follow-up': '🔄', Other: '📝' };
    const feedExtractMentions = (text) => {
        if (!text) return [];
        const allUsers = (settings?.users || []).map(u => u.name).filter(Boolean);
        const found = [];
        const parts = text.split('@');
        for (let i = 1; i < parts.length; i++) {
            for (const name of [...allUsers].sort((a, b) => b.length - a.length)) {
                if (parts[i].startsWith(name)) { found.push(name); break; }
            }
        }
        return [...new Set(found)];
    };
    const allFeedItems = [];
    (activities || []).forEach(act => {
        const feedOpp = (opportunities || []).find(o => o.id === act.opportunityId);
        allFeedItems.push({ id: 'act_' + act.id, type: 'activity', icon: feedActTypeIcon[act.type] || '📝', actor: act.author || act.salesRep || '', label: act.type, detail: act.notes || '', opp: feedOpp, timestamp: act.createdAt || act.date || '', mentions: [] });
    });
    (opportunities || []).forEach(opp => {
        (opp.comments || []).forEach(c => {
            const mentions = (c.mentions && c.mentions.length > 0) ? c.mentions : feedExtractMentions(c.text);
            allFeedItems.push({ id: c.id, type: 'comment', icon: '💬', actor: c.author || '', label: 'left a note', detail: c.text || '', opp, timestamp: c.timestamp || '', mentions });
        });
        (opp.stageHistory || []).forEach(sh => {
            const stageIcon = sh.stage === 'Closed Won' ? '🏆' : sh.stage === 'Closed Lost' ? '❌' : '📊';
            allFeedItems.push({ id: 'stage_' + opp.id + '_' + sh.timestamp, type: 'stage', icon: stageIcon, actor: sh.author || '', label: 'moved to ' + sh.stage, detail: '', opp, timestamp: sh.timestamp || sh.date || '', mentions: [] });
        });
        if (opp.createdDate) {
            allFeedItems.push({ id: 'created_' + opp.id, type: 'created', icon: '✨', actor: opp.createdBy || opp.salesRep || '', label: 'created deal', detail: '$' + (parseFloat(opp.arr)||0).toLocaleString() + ' ARR', opp, timestamp: opp.createdDate || '', mentions: [] });
        }
    });
    allFeedItems.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const feedFiltered = allFeedItems.filter(item => {
        if (feedFilter === 'all') return true;
        if (feedFilter === 'mentions') return (item.mentions || []).includes(currentUser);
        if (feedFilter === 'activities') return item.type === 'activity';
        if (feedFilter === 'comments') return item.type === 'comment';
        if (feedFilter === 'stages') return item.type === 'stage' || item.type === 'created';
        return true;
    });
    const feedFilterButtons = [
        { key: 'all', label: 'All' },
        { key: 'mentions', label: '@ Mentions' },
        { key: 'activities', label: '📞 Activities' },
        { key: 'comments', label: '💬 Notes' },
        { key: 'stages', label: '📊 Deal Events' }
    ];
    const feedTimeAgo = (ts) => {
        if (!ts) return '';
        const now = new Date(), t = new Date(ts), diff = now - t;
        const mins = Math.floor(diff / 60000), hrs = Math.floor(diff / 3600000), days = Math.floor(diff / 86400000);
        if (mins < 1) return 'just now';
        if (mins < 60) return mins + 'm ago';
        if (hrs < 24) return hrs + 'h ago';
        if (days < 7) return days + 'd ago';
        return t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };


    return (

                <div className="tab-page">
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Tasks &amp; Activities</h2>
                            <p>Track follow-ups, calls, and team activities</p>
                        </div>
                    </div>
                    <ViewingBar
                        allPipelines={allPipelines} activePipeline={activePipeline} setActivePipelineId={setActivePipelineId}
                        canSeeAll={canSeeAll} allRepNames={allRepNames} allTeamNames={allTeamNames} allTerritoryNames={allTerritoryNames}
                        viewingRep={viewingRep} setViewingRep={setViewingRep}
                        viewingTeam={viewingTeam} setViewingTeam={setViewingTeam}
                        viewingTerritory={viewingTerritory} setViewingTerritory={setViewingTerritory}
                        visibleCount={visibleTasks.length} totalCount={(canSeeAll ? (tasks||[]) : (tasks||[]).filter(t => !t.assignedTo || t.assignedTo === currentUser)).length} countLabel="tasks"
                        isAdmin={isAdmin}
                    />
                <div className="table-container">
                    <div className="table-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 0, padding: 0 }}>
                        {/* ── Row 1: sub-view tabs ── */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', background: '#f1f3f5', borderRadius: '6px', padding: '3px' }}>
                                <button onClick={() => setTasksSubView('tasks')}
                                    style={{ padding: '0.5rem 1.25rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.8125rem', fontFamily: 'inherit', transition: 'all 0.2s',
                                        background: tasksSubView === 'tasks' ? '#ffffff' : 'transparent', color: tasksSubView === 'tasks' ? '#1e293b' : '#64748b',
                                        boxShadow: tasksSubView === 'tasks' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>TASKS</button>
                                <button onClick={() => setTasksSubView('activities')}
                                    style={{ padding: '0.5rem 1.25rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.8125rem', fontFamily: 'inherit', transition: 'all 0.2s',
                                        background: tasksSubView === 'activities' ? '#ffffff' : 'transparent', color: tasksSubView === 'activities' ? '#1e293b' : '#64748b',
                                        boxShadow: tasksSubView === 'activities' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>COMPLETED</button>
                                <button onClick={() => { setTasksSubView('feed'); const now = new Date().toISOString(); setFeedLastRead(now); try { safeStorage.setItem('feedLastRead', now); } catch(e) {} }}
                                    style={{ position: 'relative', padding: '0.5rem 1.25rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.8125rem', fontFamily: 'inherit', transition: 'all 0.2s',
                                        background: tasksSubView === 'feed' ? '#ffffff' : 'transparent', color: tasksSubView === 'feed' ? '#1e293b' : '#64748b',
                                        boxShadow: tasksSubView === 'feed' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>FEED</button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                {tasksSubView === 'tasks' && canEdit && <button className="btn" onClick={handleAddTask}>+ ADD TASK</button>}
                                {tasksSubView === 'activities' && <button className="btn" onClick={() => handleAddActivity()}>+ LOG ACTIVITY</button>}
                                {tasksSubView === 'activities' && (
                                    <button className="btn" onClick={fetchLogFromCalEvents} disabled={logFromCalLoading}
                                        style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
                                        {logFromCalLoading ? 'Loading…' : '📋 Log from Calendar'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ── Row 2: filter bar (opp-style) — only on Tasks sub-view ── */}
                        {tasksSubView === 'tasks' && (() => {
                            const TaskDD = ({ label, icon, options, selected, onToggle, onClear, renderOption }) => {
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
                            const taskStatusOpts = [
                                { key: 'Overdue',    label: 'Overdue',    color: '#ef4444' },
                                { key: 'Open',       label: 'Open',       color: '#2563eb' },
                                { key: 'In-Process', label: 'In-Process', color: '#f59e0b' },
                            ];
                            const anyTaskFilter = taskStatusFilter.length > 0;
                            return (
                                <div style={{ display:'flex', alignItems:'center', gap:'0.375rem', padding:'0.625rem 1rem', borderBottom:'1px solid #e2e8f0', flexWrap:'wrap' }}>
                                    <div style={{ width:'3px', height:'18px', background:'linear-gradient(to bottom, #2563eb, #7c3aed)', borderRadius:'2px', flexShrink:0, marginRight:'0.25rem' }} />
                                    <span style={{ fontSize:'0.6875rem', fontWeight:'800', color:'#0f172a', marginRight:'0.5rem', flexShrink:0 }}>Filter:</span>

                                    <TaskDD label="Status" icon="🔖"
                                        options={taskStatusOpts}
                                        selected={taskStatusFilter}
                                        onToggle={k => setTaskStatusFilter(prev => prev.includes(k) ? prev.filter(v => v !== k) : [...prev, k])}
                                        onClear={() => setTaskStatusFilter([])}
                                        renderOption={(opt, checked) => (
                                            <span style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                                <span style={{ width:'8px', height:'8px', borderRadius:'50%', background: opt.color, flexShrink:0 }}></span>
                                                <span>{opt.label}</span>
                                            </span>
                                        )} />

                                    {anyTaskFilter && (
                                        <button onClick={() => setTaskStatusFilter([])}
                                            style={{ padding:'0.2rem 0.5rem', borderRadius:'4px', border:'1px solid #e2e8f0', background:'#fff', color:'#94a3b8', fontSize:'0.625rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit' }}>
                                            ✕ Clear all
                                        </button>
                                    )}

                                    <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', marginLeft:'auto', flexShrink:0 }}>
                                        <div style={{ display:'flex', background:'#f1f3f5', borderRadius:'6px', padding:'2px' }}>
                                            {['card', 'table'].map(mode => (
                                                <button key={mode} onClick={() => setTaskViewMode(mode)}
                                                    style={{ padding:'0.3rem 0.875rem', borderRadius:'4px', border:'none', cursor:'pointer', fontWeight:'700', fontSize:'0.6875rem', fontFamily:'inherit', transition:'all 0.2s', textTransform:'capitalize',
                                                        background: taskViewMode === mode ? '#ffffff' : 'transparent', color: taskViewMode === mode ? '#1e293b' : '#64748b',
                                                        boxShadow: taskViewMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>{mode}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* ── Row 3: right-side action buttons (CSV + Import) ── */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', padding: '0.5rem 1rem', borderBottom: '1px solid #e2e8f0' }}>
                            {tasksSubView === 'tasks' && (
                                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.625rem', fontSize: '0.6875rem' }} disabled={exportingCSV === 'tasks'} onClick={() => {
                                    const today = new Date(); today.setHours(0,0,0,0);
                                    const getStatus = (t) => t.status || (t.completed ? 'Completed' : 'Open');
                                    const isOverdue = (t) => { const s = getStatus(t); return (s === 'Open' || s === 'In-Process') && t.dueDate && new Date(t.dueDate + 'T12:00:00') < today; };
                                    const rows = [...visibleTasks]
                                        .filter(t => {
                                            if (taskStatusFilter.length === 0) return true;
                                            const st = getStatus(t);
                                            if (taskStatusFilter.includes('Overdue') && isOverdue(t)) return true;
                                            if (taskStatusFilter.includes('Open') && st === 'Open' && !isOverdue(t)) return true;
                                            if (taskStatusFilter.includes('In-Process') && st === 'In-Process') return true;
                                            return false;
                                        })
                                        .sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999'));
                                    exportToCSV(
                                        `tasks-${new Date().toISOString().slice(0,10)}.csv`,
                                        ['Title','Type','Status','Due Date','Priority','Assigned To','Account','Related To','Notes'],
                                        rows.map(t => {
                                            const ro = t.opportunityId ? (opportunities||[]).find(o => o.id === t.opportunityId) : null;
                                            const rc = t.contactId ? contacts.find(c => c.id === t.contactId) : null;
                                            const ra = t.accountId ? (accounts||[]).find(a => a.id === t.accountId) : null;
                                            const related = ro ? (ro.opportunityName||ro.account) : rc ? (rc.firstName+' '+rc.lastName) : ra ? ra.name : t.relatedTo||'';
                                            return [t.title||'', t.type||'', getStatus(t), t.dueDate||'', t.priority||'', t.assignedTo||'', t.account||'', related, t.notes||''];
                                        })
                                    , 'tasks');
                                }}>{exportingCSV === 'tasks' ? '⏳ Exporting…' : '📤 Export'}</button>
                            )}
                            {tasksSubView === 'activities' && (
                                <button className="btn btn-secondary" style={{ padding: '0.3rem 0.625rem', fontSize: '0.6875rem' }} disabled={exportingCSV === 'activities'} onClick={() => {
                                    const rows = [...(activities||[])]
                                        .sort((a,b) => new Date((b.date||'1970-01-01') + 'T12:00:00') - new Date((a.date||'1970-01-01') + 'T12:00:00'));
                                    exportToCSV(
                                        `activities-${new Date().toISOString().slice(0,10)}.csv`,
                                        ['Date','Type','Subject','Account','Rep','Duration (min)','Notes'],
                                        rows.map(a => [a.date||'', a.type||'', a.subject||'', a.account||'', a.rep||a.salesRep||'', a.duration||'', a.notes||''])
                                    , 'activities');
                                }}>{exportingCSV === 'activities' ? '⏳ Exporting…' : '📤 Export'}</button>
                            )}
                            <button className="btn" style={{ background: '#10b981', color: '#fff', padding: '0.3rem 0.625rem', fontSize: '0.6875rem', fontWeight: '700' }} onClick={() => setShowOutlookImportModal(true)}>📥 Import</button>
                        </div>
                    </div>

                    {tasksSubView === 'tasks' && (
                    <div style={{ padding: '1.5rem' }}>
                        {visibleTasks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="14" y="10" width="44" height="52" rx="6" fill="#f0fdf4" stroke="#bbf7d0" strokeWidth="2"/>
                                    <path d="M24 26h24M24 34h24M24 42h16" stroke="#86efac" strokeWidth="2" strokeLinecap="round"/>
                                    <circle cx="52" cy="50" r="10" fill="#22c55e"/>
                                    <path d="M48 50l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <div>
                                    <div style={{ width:'72px', height:'72px', borderRadius:'20px', background:'linear-gradient(135deg,#f0fdf4,#dcfce7)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem', margin:'0 auto 0.75rem' }}>✅</div>
                                    <div style={{ fontWeight: '700', fontSize: '1.0625rem', color: '#1e293b', marginBottom: '0.375rem' }}>No tasks yet</div>
                                    <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.25rem', maxWidth:'280px' }}>Create tasks to track follow-ups, calls, and next steps.</div>
                                    {canEdit && <button className="btn" onClick={handleAddTask}>+ Add Task</button>}
                                </div>
                            </div>
                        ) : (
                            <>
                            {(() => {
                                const getStatus = (t) => t.status || (t.completed ? 'Completed' : 'Open');
                                const todayStr = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
                                const today = new Date(todayStr);
                                const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
                                const isNotDone = (t) => getStatus(t) !== 'Completed';
                                const isOverdue = (t) => isNotDone(t) && t.dueDate && new Date(t.dueDate + 'T12:00:00') < today;

                                // Apply status filter
                                const filterTasks = (tasks) => {
                                    if (taskStatusFilter.length === 0) return tasks;
                                    return tasks.filter(t => {
                                        const st = getStatus(t);
                                        if (taskStatusFilter.includes('Overdue') && isOverdue(t)) return true;
                                        if (taskStatusFilter.includes('Open') && st === 'Open' && !isOverdue(t)) return true;
                                        if (taskStatusFilter.includes('In-Process') && st === 'In-Process') return true;
                                        return false;
                                    });
                                };

                                const overdueTasks = filterTasks(visibleTasks.filter(t => isNotDone(t) && getStatus(t) !== 'In-Process' && t.dueDate && new Date(t.dueDate + 'T12:00:00') < today));
                                const inProcessTasks = filterTasks(visibleTasks.filter(t => getStatus(t) === 'In-Process'));
                                const todayTasks = filterTasks(visibleTasks.filter(t => isNotDone(t) && getStatus(t) !== 'In-Process' && t.dueDate === todayStr));
                                const weekTasks = filterTasks(visibleTasks.filter(t => { if (!isNotDone(t) || getStatus(t) === 'In-Process') return false; const d = new Date(t.dueDate + 'T12:00:00'); return d > today && d <= weekEnd; }));
                                const monthTasks = filterTasks(visibleTasks.filter(t => { if (!isNotDone(t) || getStatus(t) === 'In-Process') return false; const d = new Date(t.dueDate + 'T12:00:00'); return d > weekEnd && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear(); }));
                                const futureTasks = filterTasks(visibleTasks.filter(t => { if (!isNotDone(t) || getStatus(t) === 'In-Process') return false; const d = new Date(t.dueDate + 'T12:00:00'); const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0); return d > monthEnd; }));
                                const allOpenTasks = filterTasks(visibleTasks.filter(t => isNotDone(t))).sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999'));

                                const sectionColors = {
                                    overdue: '#ef4444', inProcess: '#f59e0b', today: '#2563eb', thisWeek: '#6366f1', thisMonth: '#8b5cf6', future: '#64748b', allOpen: '#334155'
                                };

                                const Section = ({ id, label, count, tasks: sectionTasks, borderColor }) => {
                                    if (sectionTasks.length === 0) return null;
                                    const isOpen = id === 'overdue' ? tasksExpandedSections[id] !== false : tasksExpandedSections[id];
                                    return (
                                        <div style={{ marginBottom: '1.25rem' }}>
                                            <div onClick={() => setTasksExpandedSections({...tasksExpandedSections, [id]: !isOpen})}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 0', borderBottom: '1px solid #e2e8f0', marginBottom: isOpen ? '0.5rem' : 0 }}>
                                                <div style={{ width: '4px', height: '18px', borderRadius: '2px', background: borderColor, flexShrink: 0 }} />
                                                <span style={{ fontWeight: '700', fontSize: '0.8125rem', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
                                                <span style={{ background: borderColor + '18', color: borderColor, fontSize: '0.6875rem', fontWeight: '700', padding: '0.1rem 0.5rem', borderRadius: '999px' }}>{count}</span>
                                                <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '0.75rem' }}>{isOpen ? '▼' : '▶'}</span>
                                            </div>
                                            {isOpen && (
                                                <div>
                                                    {taskViewMode === 'card' ? (
                                                        sectionTasks.map((task, tIdx) => (
                                                            <div key={task.id} style={{ borderLeft: '3px solid ' + borderColor, marginBottom: '0.25rem', borderRadius: '0 6px 6px 0' }}>
                                                                <TaskItem task={task} opportunities={opportunities} contacts={contacts} accounts={accounts} onEdit={handleEditTask} onComplete={handleCompleteTask} onDelete={handleDeleteTask} onView={setViewingTask} onPrep={task => { setMeetingPrepEvent({ summary: task.title, start: { date: task.dueDate }, attendeeCount: 0 }); setMeetingPrepOppId(task.opportunityId); setMeetingPrepOpen(true); }} rowIndex={tIdx} />
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                                                                    <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', width: '90px' }}>Status</th>
                                                                    <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Title</th>
                                                                    <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', width: '80px' }}>Type</th>
                                                                    <th style={{ padding: '0.5rem', textAlign: 'center', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', width: '100px' }}>Due Date</th>
                                                                    <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase' }}>Related To</th>
                                                                    <th style={{ padding: '0.5rem', textAlign: 'right', fontWeight: '700', color: '#64748b', fontSize: '0.6875rem', textTransform: 'uppercase', width: '100px' }}>Actions</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {sectionTasks.map((task, tIdx) => {
                                                                    const st = getStatus(task);
                                                                    const stc = { 'Open': { bg: '#dbeafe', c: '#1e40af' }, 'In-Process': { bg: '#fef3c7', c: '#92400e' }, 'Completed': { bg: '#dcfce7', c: '#166534' } }[st] || { bg: '#dbeafe', c: '#1e40af' };
                                                                    const ro = task.opportunityId ? (opportunities || []).find(o => o.id === task.opportunityId) : null;
                                                                    const rc = task.contactId ? (contacts || []).find(c => c.id === task.contactId) : null;
                                                                    const ra = task.accountId ? (accounts || []).find(a => a.id === task.accountId) : null;
                                                                    const related = ro ? (ro.opportunityName || ro.account) : rc ? (rc.firstName + ' ' + rc.lastName) : ra ? ra.name : task.relatedTo || '—';
                                                                    return (
                                                                        <tr key={task.id} style={{ borderBottom: '1px solid #f1f3f5', borderLeft: '3px solid ' + borderColor, background: tIdx % 2 === 0 ? '#ffffff' : '#f8fafc', cursor: 'pointer' }}
                                                                            onClick={() => setViewingTask(task)}>
                                                                            <td style={{ padding: '0.5rem' }}>
                                                                                <select value={st} onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); handleCompleteTask(task.id, e.target.value); }}
                                                                                    style={{ padding: '0.2rem 0.25rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', cursor: 'pointer', background: stc.bg, color: stc.c, fontFamily: 'inherit', width: '85px' }}>
                                                                                    <option value="Open">Open</option><option value="In-Process">In-Process</option><option value="Completed">Completed</option>
                                                                                </select>
                                                                            </td>
                                                                            <td style={{ padding: '0.5rem', fontWeight: '600', color: '#1e293b' }}>{task.title}</td>
                                                                            <td style={{ padding: '0.5rem' }}>
                                                                                <span style={{ background: '#2563eb18', color: '#2563eb', padding: '0.125rem 0.4rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '600' }}>{task.type}</span>
                                                                            </td>
                                                                            <td style={{ padding: '0.5rem', textAlign: 'center', color: isOverdue(task) ? '#ef4444' : '#64748b', fontWeight: isOverdue(task) ? '700' : '400', fontSize: '0.8125rem' }}>
                                                                                {task.dueDate ? new Date(task.dueDate + 'T12:00:00').toLocaleDateString() : '—'}
                                                                            </td>
                                                                            <td style={{ padding: '0.5rem', color: '#64748b', fontSize: '0.8125rem' }}>{related}</td>
                                                                            <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                                                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                                                    {task.dueDate && (
                                                                                        <button onClick={e => handleAddTaskToCalendar(e, task, opportunities)}
                                                                                            disabled={calendarAddingTaskId === task.id}
                                                                                            title={calendarAddFeedback[task.id] === 'success' ? 'Added to calendar!' : calendarAddFeedback[task.id] === 'error' ? 'Failed — try again' : 'Add to Google Calendar'}
                                                                                            style={{ padding: '4px 8px', borderRadius: '999px', border: '0.5px solid ' + (calendarAddFeedback[task.id] === 'success' ? '#10b981' : calendarAddFeedback[task.id] === 'error' ? '#fca5a5' : '#cbd5e1'), background: calendarAddFeedback[task.id] === 'success' ? '#d1fae5' : 'transparent', color: calendarAddFeedback[task.id] === 'success' ? '#059669' : calendarAddFeedback[task.id] === 'error' ? '#dc2626' : '#64748b', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                                                                                            {calendarAddingTaskId === task.id ? '…' : calendarAddFeedback[task.id] === 'success' ? '✓ Added' : calendarAddFeedback[task.id] === 'error' ? '✕ Failed' : '📅'}
                                                                                        </button>
                                                                                    )}
                                                                                    {task.opportunityId && (
                                                                                        <button onClick={e => { e.stopPropagation(); setMeetingPrepEvent({ summary: task.title, start: { date: task.dueDate }, attendeeCount: 0 }); setMeetingPrepOppId(task.opportunityId); setMeetingPrepOpen(true); }}
                                                                                            style={{ padding: '4px 8px', borderRadius: '999px', border: '0.5px solid #7c3aed', background: '#f5f3ff', color: '#6d28d9', fontWeight: '600', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Prep</button>
                                                                                    )}
                                                                                    <button onClick={e => { e.stopPropagation(); handleEditTask(task); }} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Edit</button>
                                                                                    <button onClick={e => { e.stopPropagation(); handleDeleteTask(task.id); }} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Delete</button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                };

                                return (
                                    <>
                                    <Section id="overdue" label="Overdue" count={overdueTasks.length} tasks={overdueTasks} borderColor={sectionColors.overdue} />
                                    <Section id="inProcess" label="In-Process" count={inProcessTasks.length} tasks={inProcessTasks} borderColor={sectionColors.inProcess} />
                                    <Section id="today" label="Today" count={todayTasks.length} tasks={todayTasks} borderColor={sectionColors.today} />
                                    <Section id="thisWeek" label="This Week" count={weekTasks.length} tasks={weekTasks} borderColor={sectionColors.thisWeek} />
                                    <Section id="thisMonth" label="This Month" count={monthTasks.length} tasks={monthTasks} borderColor={sectionColors.thisMonth} />
                                    <Section id="all" label="Future" count={futureTasks.length} tasks={futureTasks.sort((a, b) => new Date(a.dueDate + 'T12:00:00') - new Date(b.dueDate + 'T12:00:00'))} borderColor={sectionColors.future} />
                                    <Section id="allOpen" label="All" count={allOpenTasks.length} tasks={allOpenTasks} borderColor={sectionColors.allOpen} />
                                    {taskStatusFilter.length > 0 && overdueTasks.length === 0 && inProcessTasks.length === 0 && todayTasks.length === 0 && weekTasks.length === 0 && monthTasks.length === 0 && futureTasks.length === 0 && (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8' }}>No tasks match the selected filters.</div>
                                    )}
                                    </>
                                );
                            })()}
                            </>
                        )}
                    </div>
                    )}

                    {tasksSubView === 'activities' && logFromCalEvents.length > 0 && (
                        <div style={{ margin: '0 1.25rem 1rem', border: '1px solid #bfdbfe', borderRadius: '10px', overflow: 'hidden', background: '#f0f9ff' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 1rem', borderBottom: '1px solid #bfdbfe', background: '#dbeafe' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <span style={{ fontWeight: '700', fontSize: '0.75rem', color: '#1e40af' }}>📋 LOG FROM CALENDAR</span>
                                    <input type="date" value={logFromCalDateFrom} onChange={e => setLogFromCalDateFrom(e.target.value)}
                                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', border: '1px solid #93c5fd', borderRadius: '4px', fontFamily: 'inherit', color: '#1e293b' }} />
                                    <span style={{ fontSize: '0.7rem', color: '#64748b' }}>to</span>
                                    <input type="date" value={logFromCalDateTo} onChange={e => setLogFromCalDateTo(e.target.value)}
                                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', border: '1px solid #93c5fd', borderRadius: '4px', fontFamily: 'inherit', color: '#1e293b' }} />
                                    <button onClick={fetchLogFromCalEvents} disabled={logFromCalLoading}
                                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: 'none', borderRadius: '4px', background: '#2563eb', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
                                        {logFromCalLoading ? '…' : 'Refresh'}
                                    </button>
                                </div>
                                <button onClick={() => setLogFromCalEvents([])} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>✕</button>
                            </div>
                            <div style={{ padding: '0.625rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                {logFromCalEvents.map(ev => {
                                    const isLogged = loggedCalendarIds.has(ev.id);
                                    const isLinking = logFromCalLinkingId === ev.id;
                                    const evDate = ev.start?.date || (ev.start?.dateTime ? ev.start.dateTime.split('T')[0] : '');
                                    const evTime = ev.start?.dateTime ? new Date(ev.start.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'All day';
                                    return (
                                        <div key={ev.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', border: '1px solid ' + (isLogged ? '#bbf7d0' : '#bfdbfe'), borderRadius: '6px', background: isLogged ? '#f0fdf4' : '#fff', gap: '1rem' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.summary || 'Untitled Event'}</div>
                                                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>{evDate} · {evTime}{ev.attendeeCount > 0 ? ` · ${ev.attendeeCount} attendees` : ''}</div>
                                            </div>
                                            {isLogged ? (
                                                <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#059669', background: '#dcfce7', padding: '0.35rem 0.5rem', borderRadius: '999px', whiteSpace: 'nowrap', flexShrink: 0 }}>✓ Logged</span>
                                            ) : isLinking ? (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                                                    <select onChange={e => handleLogFromCalendar(ev, e.target.value)}
                                                        style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', border: '1px solid #2563eb', borderRadius: '4px', fontFamily: 'inherit', color: '#1e293b', maxWidth: '160px' }}>
                                                        <option value="">— No opportunity —</option>
                                                        {(opportunities || []).filter(o => !['Closed Won','Closed Lost'].includes(o.stage)).map(o => (
                                                            <option key={o.id} value={o.id}>{o.opportunityName || o.account}</option>
                                                        ))}
                                                    </select>
                                                    <button onClick={() => handleLogFromCalendar(ev, '')} style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', border: 'none', borderRadius: '4px', background: '#2563eb', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                                                    <button onClick={() => setLogFromCalLinkingId(null)} style={{ fontSize: '0.7rem', padding: '0.2rem 0.4rem', border: '1px solid #e2e8f0', borderRadius: '4px', background: '#f8fafc', color: '#64748b', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                                                    <button onClick={() => { setMeetingPrepEvent(ev); setMeetingPrepOpen(true); }} style={{ fontSize: '0.6875rem', padding: '0.2rem 0.5rem', border: '1px solid #7c3aed', borderRadius: '4px', background: '#f5f3ff', color: '#6d28d9', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Prep</button>
                                                    <button onClick={() => setLogFromCalLinkingId(ev.id)} style={{ fontSize: '0.6875rem', padding: '0.2rem 0.625rem', border: '1px solid #2563eb', borderRadius: '4px', background: '#eff6ff', color: '#1d4ed8', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Log this</button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}


                    {tasksSubView === 'activities' && (
                    <div style={{ padding: '1.5rem' }}>
                        {(() => {
                            const getStatus = (t) => t.status || (t.completed ? 'Completed' : 'Open');
                            const completedTasks = visibleTasks.filter(t => getStatus(t) === 'Completed');
                            const filteredCompleted = completedTasks.filter(t => {
                                const cd = t.completedDate || t.dueDate;
                                if (completedDateFrom && cd < completedDateFrom) return false;
                                if (completedDateTo && cd > completedDateTo) return false;
                                return true;
                            }).sort((a, b) => new Date(b.completedDate || b.dueDate) - new Date(a.completedDate || a.dueDate));

                            const todayStr2 = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
                            const today2 = new Date(todayStr2);
                            const weekEnd2 = new Date(today2); weekEnd2.setDate(today2.getDate() + 7);
                            const monthEnd2 = new Date(today2.getFullYear(), today2.getMonth() + 1, 0);

                            const completedToday = filteredCompleted.filter(t => (t.completedDate || t.dueDate) === todayStr2);
                            const completedThisWeek = filteredCompleted.filter(t => { const d = new Date(t.completedDate || t.dueDate); return d >= today2 && d <= weekEnd2 && (t.completedDate || t.dueDate) !== todayStr2; });
                            const completedThisMonth = filteredCompleted.filter(t => { const d = new Date(t.completedDate || t.dueDate); const m = today2.getMonth(); const y = today2.getFullYear(); return d.getMonth() === m && d.getFullYear() === y && d > weekEnd2; });

                            const cSectionColors = { today: '#2563eb', thisWeek: '#6366f1', thisMonth: '#8b5cf6', all: '#334155' };

                            const CSection = ({ id, label, count, tasks: sTasks, borderColor }) => {
                                if (sTasks.length === 0) return null;
                                const isOpen = tasksExpandedSections['c_' + id] !== false;
                                return (
                                    <div style={{ marginBottom: '1.25rem' }}>
                                        <div onClick={() => setTasksExpandedSections({...tasksExpandedSections, ['c_' + id]: !isOpen})}
                                            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.5rem 0', borderBottom: '1px solid #e2e8f0', marginBottom: isOpen ? '0.5rem' : 0 }}>
                                            <div style={{ width: '4px', height: '18px', borderRadius: '2px', background: borderColor, flexShrink: 0 }} />
                                            <span style={{ fontWeight: '700', fontSize: '0.8125rem', color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{label}</span>
                                            <span style={{ background: borderColor + '18', color: borderColor, fontSize: '0.6875rem', fontWeight: '700', padding: '0.1rem 0.5rem', borderRadius: '999px' }}>{count}</span>
                                            <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: '0.75rem' }}>{isOpen ? '▼' : '▶'}</span>
                                        </div>
                                        {isOpen && sTasks.map((task, tIdx) => (
                                            <TaskItem key={task.id} task={task} opportunities={opportunities} contacts={contacts} accounts={accounts} onEdit={handleEditTask} onComplete={handleCompleteTask} onDelete={handleDeleteTask} onView={setViewingTask} onPrep={task => { setMeetingPrepEvent({ summary: task.title, start: { date: task.dueDate }, attendeeCount: 0 }); setMeetingPrepOppId(task.opportunityId); setMeetingPrepOpen(true); }} rowIndex={tIdx} />
                                        ))}
                                    </div>
                                );
                            };

                            return (
                                <>
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b', margin: 0 }}>Completed Tasks ({filteredCompleted.length})</h3>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#64748b' }}>Filter:</span>
                                            <input type="date" value={completedDateFrom} onChange={e => setCompletedDateFrom(e.target.value)}
                                                style={{ padding: '0.3rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'inherit' }} />
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>to</span>
                                            <input type="date" value={completedDateTo} onChange={e => setCompletedDateTo(e.target.value)}
                                                style={{ padding: '0.3rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '0.75rem', fontFamily: 'inherit' }} />
                                            {(completedDateFrom || completedDateTo) && (
                                                <button onClick={() => { setCompletedDateFrom(''); setCompletedDateTo(''); }}
                                                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', fontFamily: 'inherit' }}>Clear</button>
                                            )}
                                        </div>
                                    </div>
                                    {filteredCompleted.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '0.875rem' }}>No completed tasks{(completedDateFrom || completedDateTo) ? ' in this date range' : ''}</div>
                                    ) : (
                                        <div>
                                            <CSection id="today" label="Today" count={completedToday.length} tasks={completedToday} borderColor={cSectionColors.today} />
                                            <CSection id="thisWeek" label="This Week" count={completedThisWeek.length} tasks={completedThisWeek} borderColor={cSectionColors.thisWeek} />
                                            <CSection id="thisMonth" label="This Month" count={completedThisMonth.length} tasks={completedThisMonth} borderColor={cSectionColors.thisMonth} />
                                            <CSection id="all" label="All" count={filteredCompleted.length} tasks={filteredCompleted} borderColor={cSectionColors.all} />
                                        </div>
                                    )}
                                </div>
                                </>
                            );
                        })()}
                    </div>
                    )}

                    {tasksSubView === 'feed' && (
                    <div style={{ padding: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            {feedFilterButtons.map(f => (
                                <button key={f.key} onClick={() => setFeedFilter(f.key)}
                                    style={{ padding: '0.3rem 0.75rem', borderRadius: '999px', border: feedFilter === f.key ? '1.5px solid #2563eb' : '1.5px solid #e2e8f0', background: feedFilter === f.key ? '#eff6ff' : '#fff', color: feedFilter === f.key ? '#2563eb' : '#64748b', fontWeight: feedFilter === f.key ? '700' : '500', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}>
                                    {f.label}
                                </button>
                            ))}
                            <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', color: '#94a3b8' }}>{feedFiltered.length} events</span>
                        </div>
                        {feedFiltered.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: '10px' }}>
                                No activity yet
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {feedFiltered.map((item, idx) => {
                                    const isNew = item.timestamp > feedLastRead && item.actor !== currentUser;
                                    const isMentioned = (item.mentions || []).includes(currentUser);
                                    const hasBorder = idx < feedFiltered.length - 1;
                                    return (
                                        <div key={item.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.75rem 0', borderBottom: hasBorder ? '1px solid #f1f5f9' : 'none', alignItems: 'flex-start' }}>
                                            <div style={{ position: 'relative', flexShrink: 0 }}>
                                                <div style={{ width: '34px', height: '34px', borderRadius: '50%', background: item.actor ? feedGetAvatarColor(item.actor) : '#e2e8f0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: '800' }}>
                                                    {item.actor ? feedGetInitials(item.actor) : item.icon}
                                                </div>
                                                <span style={{ position: 'absolute', bottom: '-2px', right: '-2px', fontSize: '0.75rem', background: '#fff', borderRadius: '50%' }}>{item.icon}</span>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem', flexWrap: 'wrap', marginBottom: '0.125rem' }}>
                                                    {item.actor && <span style={{ fontWeight: '700', fontSize: '0.8125rem', color: '#1e293b' }}>{item.actor}</span>}
                                                    <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>{item.label}</span>
                                                    {item.opp && (
                                                        <button type="button" onClick={() => { setEditingOpp(item.opp); setShowModal(true); }}
                                                            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: '600', color: '#2563eb', textDecoration: 'underline' }}>
                                                            {item.opp.account}
                                                        </button>
                                                    )}
                                                    <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{feedTimeAgo(item.timestamp)}</span>
                                                    {isNew && <span style={{ background: '#2563eb', color: '#fff', borderRadius: '999px', fontSize: '0.5625rem', fontWeight: '800', padding: '0.0625rem 0.375rem' }}>NEW</span>}
                                                    {isMentioned && <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: '999px', fontSize: '0.5625rem', fontWeight: '800', padding: '0.0625rem 0.375rem' }}>@ YOU</span>}
                                                </div>
                                                {item.detail && (
                                                    <div style={{ fontSize: '0.8125rem', color: '#475569', lineHeight: '1.45', marginTop: '0.2rem' }}>
                                                        {item.detail}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    )}
                </div>
                </div>
            
    );
}
