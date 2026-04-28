import React, { useState, useRef, useCallback } from 'react';
import { useApp } from '../../AppContext';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ResizeHandles from '../../hooks/ResizeHandles';



export default function ViewingContactPanel({
    setEditingOpp, setShowModal,
    setEditingContact, setShowContactModal,
    setEditingAccount, setEditingSubAccount, setShowAccountModal,
    setEditingTask, setShowTaskModal,
    setEditingActivity, setShowActivityModal, setActivityInitialContext,
    setShowSpiffClaimModal, setSpiffClaimContext,
}) {
    const {
        opportunities, accounts, contacts, tasks, activities, settings,
        currentUser, userRole, canSeeAll,
        getStageColor, calculateDealHealth, getQuarter, getQuarterLabel,
        showConfirm, softDelete, addAudit,
        setActiveTab,
        handleDeleteContact, handleSaveContact,
        handleDeleteTask, handleCompleteTask,
        handleSaveActivity, handleDeleteActivity,
        visibleOpportunities, stages,
        viewingContact, setViewingContact,
        viewingAccount, setViewingAccount,
        viewingTask, setViewingTask,
        meetingPrepOpen, setMeetingPrepOpen, setMeetingPrepEvent, setMeetingPrepOppId,
        contactShowAllDeals, setContactShowAllDeals,
    } = useApp();

    const isReadOnly = userRole === 'ReadOnly';
    const canEdit    = !isReadOnly;
    // V1 stage color map
    const STAGE_COLORS = {
        'Prospecting':        '#b0a088',
        'Qualification':      '#c8a978',
        'Discovery':          '#b07a55',
        'Evaluation (Demo)':  '#b07a55',
        'Proposal':           '#b87333',
        'Negotiation':        '#7a5a3c',
        'Negotiation/Review': '#7a5a3c',
        'Contracts':          '#4d6b3d',
        'Closing':            '#4d6b3d',
        'Closed Won':         '#3a5530',
        'Closed Lost':        '#9c3a2e',
    };
    const getStageBadgeStyle = (stage) => {
        const c = STAGE_COLORS[stage] || '#8a8378';
        return { display:'inline-block', padding:'0.2rem 0.625rem', borderRadius:3, fontSize:'0.6875rem', fontWeight:600, fontFamily:'inherit', background:c+'22', color:c, border:`1px solid ${c}44` };
    };
    const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherStyle, containerRef } = useDraggable({ transparent: meetingPrepOpen });
    const { size, getResizeHandleProps } = useResizable(760, 580, 480, 380);

    const handleEditContact = (c) => { setEditingContact(c); setShowContactModal(true); };
    const handleEditAccount = (a) => { setEditingAccount(a); setEditingSubAccount(null); setShowAccountModal(true); };
    const handleEditTask    = (t) => { setEditingTask(t); setShowTaskModal(true); };
    const handleAddActivity = (ctx) => { setActivityInitialContext(ctx || null); setEditingActivity(null); setShowActivityModal(true); };

    const [panelTab, setPanelTab] = React.useState(
        () => localStorage.getItem('panel:contact:tab') || 'overview'
    );
    const switchPanelTab = (t) => { setPanelTab(t); localStorage.setItem('panel:contact:tab', t); };

    const panelTabStyle = (t) => ({
        padding: '0.5rem 1.25rem',
        border: 'none',
        borderBottom: panelTab === t ? '2px solid #3a5a7a' : '2px solid transparent',
        background: 'transparent',
        color: panelTab === t ? '#3a5a7a' : '#8a8378',
        fontWeight: panelTab === t ? '700' : '500',
        fontSize: '0.875rem',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
    });

    if (!viewingContact) return null;

    const ct         = viewingContact;
    const ctFullName = (ct.firstName + ' ' + ct.lastName).trim();
    const ctNameLower = ctFullName.toLowerCase();

    const involvedOpps = opportunities.filter(o => {
        if (o.contactIds && o.contactIds.includes(ct.id)) return true;
        if (!o.contacts) return false;
        const fn = (ct.firstName + ' ' + ct.lastName).trim().toLowerCase();
        return o.contacts.split(',').map(s => s.trim().toLowerCase()).some(n => n === fn || n.startsWith(fn + ' ('));
    });
    const activeDeals  = involvedOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
    const closedDeals  = involvedOpps.filter(o => o.stage === 'Closed Won' || o.stage === 'Closed Lost');
    const relatedAccount = ct.company ? accounts.find(a => a.name.toLowerCase() === ct.company.toLowerCase()) : null;
    const DEAL_LIMIT   = 5;
    const ctOpps       = activeDeals;

    return (
        <>
        {/* Dimmed backdrop */}
        <div
            style={{ ...overlayStyle }}
        />
        <div style={clickCatcherStyle} />

        {/* Floating panel */}
        <div
            ref={containerRef}
            onClick={e => e.stopPropagation()}
            style={{
                ...dragOffsetStyle,
                width:  size.w,
                height: size.h,
                minWidth:  480,
                minHeight: 380,
                display: 'flex',
                flexDirection: 'column',
                background: '#fbf8f3',
                borderRadius: '12px',
                boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
                border: '1px solid #e6ddd0',
                overflow: 'hidden',
            }}
        >
            {/* ── Drag-handle header ── */}
            <div
                {...dragHandleProps}
                style={{
                    ...dragHandleProps.style,
                    background: '#2a2622',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    padding: '0.875rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: '12px 12px 0 0',
                    minHeight: '52px',
                    flexShrink: 0,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0, flex: 1 }}>
                    <button
                        onClick={() => setViewingContact(null)}
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: '600', color: '#fbf8f3', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}
                    >← Back</button>
                    <div style={{ minWidth: 0 }}>
                        <h1 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: '700', color: '#fbf8f3', userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ct.firstName} {ct.lastName}</h1>
                        {(ct.title || ct.company) && (
                            <div style={{ fontSize: '0.75rem', color: 'rgba(245,241,235,0.55)', marginTop: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {[ct.title, ct.company].filter(Boolean).join(' · ')}
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'center' }}>
                    <button
                        onClick={() => { setActivityInitialContext({ companyName: ct.company || '', contactName: ctFullName }); setEditingActivity(null); setShowActivityModal(true); }}
                        style={{ height: '32px', padding: '0 0.875rem', borderRadius: '8px', border: '1px solid #c8b99a', background: '#c8b99a', color: '#7a6a48', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 0 rgba(0,0,0,0.15) inset' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#d4c8a8'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#c8b99a'; e.currentTarget.style.boxShadow = '0 1px 0 rgba(0,0,0,0.15) inset'; }}
                        onMouseDown={e => { e.currentTarget.style.background = '#bca984'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2) inset'; }}
                        onMouseUp={e => { e.currentTarget.style.background = '#d4c8a8'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2)'; }}
                        title="Log activity"
                    >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                            stroke="#7a6a48" strokeWidth="1.6" strokeLinecap="round">
                            <path d="M8 3v10M3 8h10" />
                        </svg>
                        Log activity
                    </button>
                    {ctOpps.length > 0 && (
                        <button
                            onClick={() => { setMeetingPrepEvent({ summary: ctFullName, start: { date: new Date().toISOString().split('T')[0] }, attendeeCount: 0 }); setMeetingPrepOppId(ctOpps[0].id); setMeetingPrepOpen(true); }}
                            style={{ height: '32px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#f5f1eb', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
                            title="Meeting prep"
                        >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                                stroke="#f5f1eb" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="10" height="11" rx="1.5"/>
                                <path d="M6 2.5h4v2H6z" fill="#f5f1eb" stroke="none"/>
                                <path d="M6 8h4M6 11h3"/>
                            </svg>
                            Prep
                        </button>
                    )}
                    <button
                        onClick={() => { setViewingContact(null); handleEditContact(ct); }}
                        style={{ height: '32px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fbf8f3', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Edit Contact</button>
                    <span style={{ fontSize: '0.6875rem', color: 'rgba(245,241,235,0.35)', fontWeight: '500', letterSpacing: '0.03em', marginLeft: '0.25rem' }}>⠿ drag</span>
                </div>
            </div>

            {/* ── Sub-tab row ── */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e6ddd0', background: '#fbf8f3', flexShrink: 0, paddingLeft: '0.25rem' }}>
                <button style={panelTabStyle('overview')} onClick={() => switchPanelTab('overview')}>Overview</button>
                <button style={panelTabStyle('info')} onClick={() => switchPanelTab('info')}>Info</button>
            </div>

            {/* ── Scrollable body ── */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.25rem 1.5rem', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>

                {panelTab === 'overview' && (<>
                {/* KPI cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', padding: '1rem', textAlign: 'center', borderLeft: '4px solid #3a5a7a', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#2a2622' }}>{activeDeals.length}</div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#7a6a48', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Deals</div>
                    </div>
                    <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', padding: '1rem', textAlign: 'center', borderLeft: '4px solid #4d6b3d', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#2e4a24' }}>{closedDeals.filter(o => o.stage === 'Closed Won').length}</div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#4d6b3d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Won</div>
                    </div>
                    <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', padding: '1rem', textAlign: 'center', borderLeft: '4px solid #b87333', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#6b4820' }}>${(() => { const v = activeDeals.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0); return v >= 1000 ? Math.round(v / 1000) + 'K' : v.toLocaleString(); })()}</div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#7a6a48', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Pipeline</div>
                    </div>
                    <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', padding: '1rem', textAlign: 'center', borderLeft: '4px solid #5a4a7a', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#5a4a7a' }}>{involvedOpps.length}</div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#5a4a7a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Deals</div>
                    </div>
                </div>

                {/* Active Deals */}
                <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e6ddd0' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#2a2622' }}>Active Deals Involved With ({activeDeals.length})</h3>
                    </div>
                    {activeDeals.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#8a8378', fontSize: '0.875rem' }}>No active deals</div>
                    ) : (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 130px 110px 100px 90px', padding: '0.5rem 1.5rem', background: '#fbf8f3', borderBottom: '1px solid #f5efe3', fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <span>Opportunity</span><span>Stage</span><span style={{ textAlign: 'right' }}>Revenue</span><span style={{ textAlign: 'center' }}>Close</span><span style={{ textAlign: 'center' }}>Health</span>
                            </div>
                            {activeDeals.sort((a, b) => new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999')).slice(0, contactShowAllDeals ? activeDeals.length : DEAL_LIMIT).map((opp, idx) => {
                                                                return (
                                    <div key={opp.id}
                                        style={{ display: 'grid', gridTemplateColumns: '1fr 130px 110px 100px 90px', padding: '0.625rem 1.5rem', borderBottom: '1px solid #f5efe3', fontSize: '0.875rem', alignItems: 'center', background: idx % 2 === 0 ? '#fbf8f3' : '#fbf8f3', cursor: 'pointer' }}
                                        onClick={() => { setViewingContact(null); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(opp); setShowModal(true); }, 150); }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f5efe3'}
                                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fbf8f3' : '#fbf8f3'}
                                    >
                                        <div>
                                            <div style={{ fontWeight: '600', color: '#2a2622' }}>{opp.opportunityName || opp.account || 'Unnamed'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#8a8378' }}>{opp.account}</div>
                                        </div>
                                        <span style={getStageBadgeStyle(opp.stage)}>{opp.stage}</span>
                                        <span style={{ textAlign: 'right', fontWeight: '700', color: '#2a2622' }}>${(parseFloat(opp.arr) || 0).toLocaleString()}</span>
                                        <span style={{ textAlign: 'center', color: '#8a8378', fontSize: '0.8125rem' }}>{opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}</span>
                                        <span style={{ textAlign: 'center' }}>
                                            <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: opp.health === 'green' ? '#4d6b3d' : opp.health === 'yellow' ? '#b87333' : opp.health === 'red' ? '#9c3a2e' : '#d1d5db' }} />
                                        </span>
                                    </div>
                                );
                            })}
                            {activeDeals.length > DEAL_LIMIT && (
                                <div style={{ padding: '0.75rem 1.5rem', textAlign: 'center', borderTop: '1px solid #e6ddd0' }}>
                                    <button onClick={() => setContactShowAllDeals(!contactShowAllDeals)}
                                        style={{ background: 'none', border: 'none', color: '#3a5a7a', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                    >{contactShowAllDeals ? 'Show Less' : `See More (${activeDeals.length - DEAL_LIMIT} more)`}</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Closed Deals */}
                {closedDeals.length > 0 && (
                    <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e6ddd0' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#2a2622' }}>Closed Deals ({closedDeals.length})</h3>
                        </div>
                        <div>
                            {closedDeals.map((opp, idx) => {
                                const isWon = opp.stage === 'Closed Won';
                                return (
                                    <div key={opp.id}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', borderBottom: '1px solid #f5efe3', background: idx % 2 === 0 ? '#fbf8f3' : '#fbf8f3' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: '600', color: '#2a2622', fontSize: '0.875rem' }}>{opp.opportunityName || opp.account || 'Unnamed'}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#8a8378' }}>{opp.account}</div>
                                        </div>
                                        <span style={{ background: isWon ? 'rgba(77,107,61,0.1)' : 'rgba(156,58,46,0.06)', color: isWon ? '#2e4a24' : '#7a2820', padding: '0.2rem 0.625rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', marginRight: '1rem' }}>{opp.stage}</span>
                                        <span style={{ fontWeight: '700', color: '#2a2622', fontSize: '0.875rem', minWidth: '80px', textAlign: 'right' }}>${(parseFloat(opp.arr) || 0).toLocaleString()}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Open Tasks */}
                {(() => {
                    const ctTasks = tasks.filter(t => {
                        const status = t.status || (t.completed ? 'Completed' : 'Open');
                        if (status === 'Completed') return false;
                        if (t.assignedTo && t.assignedTo.toLowerCase() === ctNameLower) return true;
                        if (t.contactId && ct.id && t.contactId === ct.id) return true;
                        const ctNames = (t.title || '').toLowerCase();
                        return ctNames.includes((ct.firstName || '').toLowerCase()) && ctNames.includes((ct.lastName || '').toLowerCase());
                    }).sort((a, b) => new Date(a.dueDate || '9999') - new Date(b.dueDate || '9999'));
                    return (
                        <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e6ddd0' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#2a2622' }}>Open Tasks ({ctTasks.length})</h3>
                            </div>
                            {ctTasks.length === 0 ? (
                                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#8a8378', fontSize: '0.875rem' }}>No open tasks</div>
                            ) : (
                                <div>
                                    {ctTasks.map((t, idx) => {
                                        const isOD = t.dueDate && new Date(t.dueDate + 'T12:00:00') < new Date([new Date().getFullYear(), String(new Date().getMonth() + 1).padStart(2, '0'), String(new Date().getDate()).padStart(2, '0')].join('-'));
                                        const st   = t.status || 'Open';
                                        const stc  = { 'Open': { bg: 'rgba(58,90,122,0.1)', c: '#2a2622' }, 'In-Process': { bg: 'rgba(184,115,51,0.1)', c: '#6b4820' } }[st] || { bg: 'rgba(58,90,122,0.1)', c: '#2a2622' };
                                        return (
                                            <div key={t.id}
                                                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1.5rem', borderBottom: '1px solid #f5efe3', background: idx % 2 === 0 ? '#fff' : '#fbf8f3', cursor: 'pointer' }}
                                                onClick={() => { setViewingContact(null); setActiveTab('tasks'); setTimeout(() => setViewingTask(t), 150); }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f5efe3'}
                                                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fbf8f3'}
                                            >
                                                <span style={{ background: stc.bg, color: stc.c, padding: '0.15rem 0.4rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '700', flexShrink: 0, width: '65px', textAlign: 'center' }}>{st}</span>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#2a2622', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                                                </div>
                                                <span style={{ background: '#3a5a7a18', color: '#3a5a7a', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '600', flexShrink: 0 }}>{t.type}</span>
                                                <span style={{ fontSize: '0.75rem', color: isOD ? '#9c3a2e' : '#8a8378', fontWeight: isOD ? '700' : '400', flexShrink: 0, width: '75px', textAlign: 'right' }}>
                                                    {t.dueDate ? new Date(t.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                                </span>
                                                {isOD && <span style={{ background: '#9c3a2e', color: '#fff', padding: '0.1rem 0.35rem', borderRadius: '3px', fontSize: '0.5625rem', fontWeight: '700' }}>OVERDUE</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })()}

                {/* Activity History */}
                {(() => {
                    const ctActivities = activities.filter(a => {
                        if (a.contactId && ct.id && a.contactId === ct.id) return true;
                        const involvedOppIds = involvedOpps.map(o => o.id);
                        return a.opportunityId && involvedOppIds.includes(a.opportunityId);
                    }).sort((a, b) => new Date(b.date || '2000') - new Date(a.date || '2000'));
                    return (
                        <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e6ddd0' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#2a2622' }}>Activity History ({ctActivities.length})</h3>
                            </div>
                            {ctActivities.length === 0 ? (
                                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#8a8378', fontSize: '0.875rem' }}>No activity history</div>
                            ) : (
                                <div>
                                    {ctActivities.map((a, idx) => {
                                        const relOpp = a.opportunityId ? opportunities.find(o => o.id === a.opportunityId) : null;
                                        return (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.5rem 1.5rem', borderBottom: '1px solid #f5efe3', background: idx % 2 === 0 ? '#fff' : '#fbf8f3' }}>
                                                <span style={{ fontSize: '0.75rem', color: '#8a8378', flexShrink: 0, width: '70px', paddingTop: '0.1rem' }}>{a.date ? new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
                                                <span style={{ background: 'rgba(58,90,122,0.1)', color: '#2a2622', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '700', flexShrink: 0 }}>{a.type || 'Note'}</span>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: '0.8125rem', color: '#5a544c' }}>{a.notes || a.subject || 'No details'}</div>
                                                    {relOpp && <div style={{ fontSize: '0.6875rem', color: '#8a8378', marginTop: '0.125rem' }}>Opp: {relOpp.opportunityName || relOpp.account}</div>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })()}
                </>)}

                {panelTab === 'info' && (
                    <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

                            {/* Full Name — full width */}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Name</div>
                                <div style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#2a2622' }}>
                                    {[ct.prefix, ct.firstName, ct.middleName, ct.lastName, ct.suffix].filter(Boolean).join(' ') || '—'}
                                </div>
                            </div>

                            {/* Title */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Title</div>
                                <div style={{ fontSize: '0.875rem', color: '#2a2622' }}>{ct.title || <span style={{ color: '#8a8378' }}>—</span>}</div>
                            </div>

                            {/* Company Name */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Company</div>
                                {ct.company ? (
                                    relatedAccount ? (
                                        <div style={{ fontSize: '0.875rem', color: '#3a5a7a', fontWeight: '600', cursor: 'pointer' }}
                                            onClick={() => { setViewingContact(null); setViewingAccount(relatedAccount); }}
                                            onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                            onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                        >{ct.company}</div>
                                    ) : (
                                        <div style={{ fontSize: '0.875rem', color: '#2a2622' }}>{ct.company}</div>
                                    )
                                ) : <span style={{ fontSize: '0.875rem', color: '#8a8378' }}>—</span>}
                            </div>

                            {/* Work Location */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Work Location</div>
                                <div style={{ fontSize: '0.875rem', color: '#2a2622' }}>{ct.workLocation || <span style={{ color: '#8a8378' }}>—</span>}</div>
                            </div>

                            {/* Work Email */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Work Email</div>
                                {ct.email
                                    ? <a href={`mailto:${ct.email}`} style={{ fontSize: '0.875rem', color: '#3a5a7a', textDecoration: 'none' }}
                                        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                        onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                      >{ct.email}</a>
                                    : <span style={{ fontSize: '0.875rem', color: '#8a8378' }}>—</span>}
                            </div>

                            {/* Work Phone */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Work Phone</div>
                                <div style={{ fontSize: '0.875rem', color: '#2a2622' }}>{ct.phone || <span style={{ color: '#8a8378' }}>—</span>}</div>
                            </div>

                            {/* Mobile Phone */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Mobile Phone</div>
                                <div style={{ fontSize: '0.875rem', color: '#2a2622' }}>{ct.mobile || <span style={{ color: '#8a8378' }}>—</span>}</div>
                            </div>

                            {/* Address */}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Address</div>
                                <div style={{ fontSize: '0.875rem', color: '#2a2622', lineHeight: 1.5 }}>
                                    {ct.address || ct.city || ct.state || ct.zip || ct.country ? (<>
                                        {ct.address && <div>{ct.address}</div>}
                                        {(ct.city || ct.state || ct.zip) && <div>{[ct.city, ct.state, ct.zip].filter(Boolean).join(', ')}</div>}
                                        {ct.country && <div>{ct.country}</div>}
                                    </>) : <span style={{ color: '#8a8378' }}>—</span>}
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </div>

            <ResizeHandles getResizeHandleProps={getResizeHandleProps} />
        </div>
        </>
    );
}
