import React, { useState, useEffect } from 'react';
import { useApp } from '../../AppContext';
import { useDraggable } from '../../hooks/useDraggable';

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
    const { dragHandleProps, dragOffsetStyle } = useDraggable();

    const handleEditTask = (t) => { setEditingTask(t); setShowTaskModal(true); };
    const handleEditOpp = (o) => { setEditingOpp(o); setShowModal(true); };
    const handleAddActivity = (ctx) => { setActivityInitialContext(ctx || null); setEditingActivity(null); setShowActivityModal(true); };

    // Keep viewingTask in sync with tasks state after edits
    useEffect(() => {
        if (!viewingTask) return;
        const updated = tasks.find(t => t.id === viewingTask.id);
        if (updated && updated !== viewingTask) setViewingTask(updated);
    }, [tasks]);

    if (!viewingTask) return null;

const t = viewingTask;
const relatedOpp = t.opportunityId ? opportunities.find(o => o.id === t.opportunityId) : null;
const relatedContact = t.contactId ? contacts.find(c => c.id === t.contactId) : null;
const relatedAccount = t.accountId ? accounts.find(a => a.id === t.accountId) : null;
const status = t.status || (t.completed ? 'Completed' : 'Open');
const sc = { 'Open': { bg: '#dbeafe', color: '#1e40af' }, 'In-Process': { bg: '#fef3c7', color: '#92400e' }, 'Completed': { bg: '#dcfce7', color: '#166534' } }[status] || { bg: '#dbeafe', color: '#1e40af' };
const taskActivities = activities.filter(a => {
  if (a.opportunityId && t.opportunityId && a.opportunityId === t.opportunityId) return true;
  if (a.contactId && t.contactId && a.contactId === t.contactId) return true;
  return false;
}).sort((a, b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00'));


    return (
      <div className="modal-overlay" onClick={() => setViewingTask(null)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', ...dragOffsetStyle }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                  <div>
                      <h2 {...dragHandleProps} style={{ ...dragHandleProps.style, margin: '0 0 0.5rem 0' }}>{t.title}</h2>
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <span style={{ background: sc.bg, color: sc.color, padding: '0.2rem 0.625rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>{status}</span>
                          <span style={{ background: '#2563eb', color: 'white', padding: '0.2rem 0.625rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700' }}>{t.type}</span>
                      </div>
                  </div>
                  <button onClick={() => setViewingTask(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#64748b', lineHeight: 1 }}>x</button>
              </div>
    
              {t.description && (
                  <div style={{ padding: '0.75rem 1rem', background: '#f8f9fa', borderRadius: '6px', marginBottom: '1rem', fontSize: '0.875rem', color: '#475569' }}>{t.description}</div>
              )}
    
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                      <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Due Date</div>
                      <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>{t.dueDate ? new Date(t.dueDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '-'}{t.dueTime ? ' at ' + t.dueTime : ''}</div>
                  </div>
                  {t.completedDate && (
                      <div style={{ padding: '0.625rem 0.75rem', background: '#f0fdf4', borderRadius: '6px' }}>
                          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Completed</div>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#166534' }}>{new Date(t.completedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
                      </div>
                  )}
                  {relatedOpp && (
                      <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Opportunity</div>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#2563eb' }}>{relatedOpp.account}{relatedOpp.opportunityName ? ' - ' + relatedOpp.opportunityName : ''}</div>
                      </div>
                  )}
                  {relatedContact && (
                      <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Contact</div>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>{relatedContact.firstName} {relatedContact.lastName}</div>
                      </div>
                  )}
                  {relatedAccount && (
                      <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Account</div>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>{relatedAccount.name}</div>
                      </div>
                  )}
                  {t.assignedTo && (
                      <div style={{ padding: '0.625rem 0.75rem', background: '#f8f9fa', borderRadius: '6px' }}>
                          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Assigned To</div>
                          <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}>{t.assignedTo}</div>
                      </div>
                  )}
              </div>
    
              {taskActivities.length > 0 && (
                  <div>
                      <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Related Activities ({taskActivities.length})</div>
                      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                          {taskActivities.map((a, idx) => (
                              <div key={idx} style={{ display: 'flex', gap: '0.625rem', padding: '0.5rem 0', borderBottom: idx < taskActivities.length - 1 ? '1px solid #f1f3f5' : 'none', fontSize: '0.8125rem', alignItems: 'center' }}>
                                  <span style={{ width: '65px', flexShrink: 0, color: '#94a3b8', fontSize: '0.75rem' }}>{a.date ? new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}</span>
                                  <span style={{ padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '700', background: '#dbeafe', color: '#1e40af' }}>{a.type}</span>
                                  <span style={{ flex: 1, color: '#475569' }}>{a.notes || a.subject || 'No details'}</span>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
    
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                  <button className="btn btn-secondary" onClick={() => { setViewingTask(null); handleEditTask(t); }}>Edit Task</button>
                  <button className="btn" onClick={() => setViewingTask(null)}>Close</button>
              </div>
          </div>
      </div>
    );
}