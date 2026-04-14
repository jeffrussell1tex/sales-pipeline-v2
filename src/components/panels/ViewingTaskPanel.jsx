import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../AppContext';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ResizeHandles from '../../hooks/ResizeHandles';

// ── Local resize hook (same pattern as Viewing panels) ────────────────────────


export default function ViewingTaskPanel({
    setEditingTask, setShowTaskModal,
    setEditingOpp, setShowModal,
    setEditingContact, setShowContactModal,
    setEditingAccount, setEditingSubAccount, setShowAccountModal,
    setEditingActivity, setShowActivityModal, setActivityInitialContext,
}) {
    const {
        opportunities, accounts, contacts, tasks, activities, settings,
        currentUser, userRole, canSeeAll,
        getStageColor, calculateDealHealth,
        showConfirm, softDelete,
        setActiveTab,
        handleDeleteTask, handleCompleteTask, handleAddTaskToCalendar,
        handleSaveActivity,
        viewingTask, setViewingTask,
        viewingContact, setViewingContact,
        viewingAccount, setViewingAccount,
    } = useApp();

    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;

    const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherStyle, containerRef } = useDraggable();
    const { size, getResizeHandleProps } = useResizable(600, 480, 400, 320);

    const handleEditTask = (t) => { setEditingTask(t); setShowTaskModal(true); };

    // Keep viewingTask in sync with tasks state after edits
    useEffect(() => {
        if (!viewingTask) return;
        const updated = tasks.find(t => t.id === viewingTask.id);
        if (updated && updated !== viewingTask) setViewingTask(updated);
    }, [tasks]);

    if (!viewingTask) return null;

    const t = viewingTask;
    const relatedOpp     = t.opportunityId ? opportunities.find(o => o.id === t.opportunityId) : null;
    const relatedContact = t.contactId     ? contacts.find(c => c.id === t.contactId)          : null;
    const relatedAccount = t.accountId     ? accounts.find(a => a.id === t.accountId)          : null;
    const status = t.status || (t.completed ? 'Completed' : 'Open');
    const sc = {
        'Open':       { bg: '#dbeafe', color: '#1e40af' },
        'In-Process': { bg: '#fef3c7', color: '#92400e' },
        'Completed':  { bg: '#dcfce7', color: '#166534' },
    }[status] || { bg: '#dbeafe', color: '#1e40af' };

    const taskActivities = activities.filter(a => {
        if (a.opportunityId && t.opportunityId && a.opportunityId === t.opportunityId) return true;
        if (a.contactId     && t.contactId     && a.contactId     === t.contactId)     return true;
        return false;
    }).sort((a, b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00'));

    return (
        <>
        {/* Dimmed backdrop — click outside closes */}
        <div
            style={{ ...overlayStyle }}
        />
        <div style={clickCatcherStyle} />

        {/* Floating panel — fixed-positioned, draggable, resizable */}
        <div
            ref={containerRef}
            onClick={e => e.stopPropagation()}
            style={{
                ...dragOffsetStyle,
                width:     size.w,
                height:    size.h,
                minWidth:  400,
                minHeight: 320,
                display: 'flex',
                flexDirection: 'column',
                background: '#fff',
                borderRadius: '12px',
                boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
                border: '1px solid #e5e2db',
                overflow: 'hidden',
            }}
        >
            {/* ── Drag-handle header ── */}
            <div
                {...dragHandleProps}
                style={{
                    ...dragHandleProps.style,
                    background: '#1c1917',
                    padding: '0.875rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: '12px 12px 0 0',
                    minHeight: '52px',
                    flexShrink: 0,
                }}
            >
                <div style={{ minWidth: 0, flex: 1 }}>
                    <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: '700', color: '#f5f1eb', userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.title}
                    </h2>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                        <span style={{ background: sc.bg, color: sc.color, padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{status}</span>
                        <span style={{ background: '#2563eb', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{t.type}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, marginLeft: '1rem' }}>
                    <span style={{ fontSize: '0.6875rem', color: 'rgba(245,241,235,0.35)', fontWeight: '500', letterSpacing: '0.03em' }}>⠿ drag</span>
                    <button
                        onClick={() => setViewingTask(null)}
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', width: '28px', height: '28px', cursor: 'pointer', fontSize: '1rem', color: '#f5f1eb', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit' }}
                    >×</button>
                </div>
            </div>

            {/* ── Scrollable body ── */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.25rem 1.5rem', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>

                {t.description && (
                    <div style={{ padding: '0.75rem 1rem', background: '#f8f9fa', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem', color: '#475569', lineHeight: 1.5 }}>
                        {t.description}
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Due Date</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>
                            {t.dueDate
                                ? new Date(t.dueDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
                                : '—'}
                            {t.dueTime ? ' at ' + t.dueTime : ''}
                        </div>
                    </div>

                    {t.completedDate && (
                        <div style={{ padding: '0.625rem 0.75rem', background: '#f0fdf4', borderRadius: '6px' }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Completed</div>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#166534' }}>
                                {new Date(t.completedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                        </div>
                    )}

                    {relatedOpp && (
                        <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Opportunity</div>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#2563eb' }}>
                                {relatedOpp.account}{relatedOpp.opportunityName ? ' — ' + relatedOpp.opportunityName : ''}
                            </div>
                        </div>
                    )}

                    {relatedContact && (
                        <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Contact</div>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>
                                {relatedContact.firstName} {relatedContact.lastName}
                            </div>
                        </div>
                    )}

                    {relatedAccount && (
                        <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Account</div>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>
                                {relatedAccount.name}
                            </div>
                        </div>
                    )}

                    {t.assignedTo && (
                        <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Assigned To</div>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>
                                {t.assignedTo}
                            </div>
                        </div>
                    )}
                </div>

                {taskActivities.length > 0 && (
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
                            Related Activities ({taskActivities.length})
                        </div>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                            {taskActivities.map((a, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: '0.625rem', padding: '0.5rem 0.75rem', borderBottom: idx < taskActivities.length - 1 ? '1px solid #f1f3f5' : 'none', fontSize: '0.8125rem', alignItems: 'center', background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                                    <span style={{ width: '65px', flexShrink: 0, color: '#94a3b8', fontSize: '0.75rem' }}>
                                        {a.date ? new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                    </span>
                                    <span style={{ padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '700', background: '#dbeafe', color: '#1e40af', flexShrink: 0 }}>{a.type}</span>
                                    <span style={{ flex: 1, color: '#475569' }}>{a.notes || a.subject || 'No details'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* ── Footer actions ── */}
            <div style={{ padding: '0.875rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexShrink: 0, background: '#fafaf9' }}>
                <button className="btn btn-secondary" onClick={() => setViewingTask(null)}>Close</button>
                {canEdit && (
                    <button className="btn" onClick={() => { setViewingTask(null); handleEditTask(t); }}>Edit Task</button>
                )}
            </div>

            <ResizeHandles getResizeHandleProps={getResizeHandleProps} />
        </div>
        </>
    );
}
