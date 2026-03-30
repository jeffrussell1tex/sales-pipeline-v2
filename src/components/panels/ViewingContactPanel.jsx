import React, { useState } from 'react';
import { useApp } from '../../AppContext';

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
        setMeetingPrepOpen, setMeetingPrepEvent, setMeetingPrepOppId,
        contactShowAllDeals, setContactShowAllDeals,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;

    const handleEditContact = (c) => { setEditingContact(c); setShowContactModal(true); };
    const handleEditAccount = (a) => { setEditingAccount(a); setEditingSubAccount(null); setShowAccountModal(true); };
    const handleEditTask = (t) => { setEditingTask(t); setShowTaskModal(true); };
    const handleAddActivity = (ctx) => { setActivityInitialContext(ctx || null); setEditingActivity(null); setShowActivityModal(true); };

    if (!viewingContact) return null;

const ct = viewingContact;
const ctFullName = (ct.firstName + ' ' + ct.lastName).trim();
const ctNameLower = ctFullName.toLowerCase();
// Find opps where this contact is linked — ID-based first, name fallback for legacy data
const involvedOpps = opportunities.filter(o => {
  if (o.contactIds && o.contactIds.includes(ct.id)) return true;
  // Legacy fallback: name matching
  if (!o.contacts) return false;
  const ctFullName = (ct.firstName + ' ' + ct.lastName).trim().toLowerCase();
  return o.contacts.split(',').map(s => s.trim().toLowerCase()).some(n => n === ctFullName || n.startsWith(ctFullName + ' ('));
});
const activeDeals = involvedOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
const closedDeals = involvedOpps.filter(o => o.stage === 'Closed Won' || o.stage === 'Closed Lost');
const relatedAccount = ct.company ? accounts.find(a => a.name.toLowerCase() === ct.company.toLowerCase()) : null;
const DEAL_LIMIT = 5;
const ctOpps = activeDeals; // alias for Prep button — active deals linked to this contact


    return (
    <div className="modal-overlay" onClick={() => setViewingContact(null)} style={{ alignItems: 'flex-start', paddingTop: '0', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{
          width: '100%', maxWidth: '1100px', minHeight: '100vh', margin: '0 auto',
          background: '#f8fafc', boxShadow: '0 0 40px rgba(0,0,0,0.15)'
      }}>
          {/* Header bar */}
          <div style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '1.25rem 2rem', position: 'sticky', top: 0, zIndex: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                      <button onClick={() => setViewingContact(null)}
                          style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 0.875rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600', color: '#475569', fontFamily: 'inherit', marginTop: '0.125rem' }}
                      >← Back</button>
                      <div>
                          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>{ct.firstName} {ct.lastName}</h1>
                          {ct.title && <div style={{ color: '#64748b', fontWeight: '600', fontSize: '0.875rem', marginTop: '0.125rem' }}>{ct.title}</div>}
                          {ct.company && (
                              <div style={{ color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', marginTop: '0.125rem', cursor: 'pointer' }}
                                  onClick={() => { if (relatedAccount) { setViewingContact(null); setActiveTab('accounts'); setTimeout(() => setViewingAccount(relatedAccount), 100); } }}
                                  onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                  onMouseLeave={e => e.target.style.textDecoration = 'none'}
                              >{ct.company}</div>
                          )}
                          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.375rem', fontSize: '0.8125rem', color: '#64748b' }}>
                              {ct.email && <a href={'mailto:' + ct.email} style={{ color: '#2563eb', textDecoration: 'none' }}>✉️ {ct.email}</a>}
                              {ct.phone && <span>📞 {ct.phone}</span>}
                              {ct.mobile && <span>📱 {ct.mobile}</span>}
                              {(ct.address || ct.city || ct.state || ct.zip) && (
                                  <span>📍 {[ct.address, [ct.city, ct.state].filter(Boolean).join(', '), ct.zip].filter(Boolean).join(', ')}</span>
                              )}
                          </div>
                      </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'center' }}>
                      <button onClick={() => { setActivityInitialContext({ companyName: ct.company || '', contactName: ctFullName }); setEditingActivity(null); setShowActivityModal(true); }}
                          style={{ height:'32px', padding:'0 0.625rem', borderRadius:'12px', border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)', color:'#fff', fontSize:'0.6875rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'0.25rem', transition:'all 0.15s' }}
                          title="Quick log activity">⚡ Log</button>
                      {ctOpps.length > 0 && (
                          <button onClick={() => { setMeetingPrepEvent({ summary: ctFullName, start: { date: new Date().toISOString().split('T')[0] }, attendeeCount: 0 }); setMeetingPrepOppId(ctOpps[0].id); setMeetingPrepOpen(true); }}
                              style={{ height:'32px', padding:'0 0.625rem', borderRadius:'12px', border:'1px solid rgba(245,241,235,0.25)', background:'rgba(200,185,154,0.15)', color:'#c8b99a', fontSize:'0.6875rem', fontWeight:'600', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:'0.25rem', transition:'all 0.15s' }}
                              title="Meeting prep">📋 Prep</button>
                      )}
                      <button className="btn" onClick={() => { setViewingContact(null); handleEditContact(ct); }}>Edit Contact</button>
                  </div>
              </div>
          </div>
    
          <div style={{ padding: '1.5rem 2rem' }}>
              {/* KPI Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', borderLeft: '4px solid #2563eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '800', color: '#1e40af' }}>{activeDeals.length}</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Deals</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', borderLeft: '4px solid #16a34a', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '800', color: '#166534' }}>{closedDeals.filter(o => o.stage === 'Closed Won').length}</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Won</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', borderLeft: '4px solid #f59e0b', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '800', color: '#92400e' }}>${(() => { const v = activeDeals.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0); return v >= 1000 ? Math.round(v / 1000) + 'K' : v.toLocaleString(); })()}</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Pipeline</div>
                  </div>
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', borderLeft: '4px solid #8b5cf6', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      <div style={{ fontSize: '2rem', fontWeight: '800', color: '#6b21a8' }}>{involvedOpps.length}</div>
                      <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#9333ea', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Deals</div>
                  </div>
              </div>
    
              {/* Active Deals Involved With */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Active Deals Involved With ({activeDeals.length})</h3>
                  </div>
                  {activeDeals.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No active deals</div>
                  ) : (
                      <div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px 110px 100px', padding: '0.5rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #f1f3f5', fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              <span>Opportunity</span><span>Stage</span><span style={{ textAlign: 'right' }}>ARR</span><span style={{ textAlign: 'center' }}>Close Date</span><span style={{ textAlign: 'center' }}>Health</span>
                          </div>
                          {activeDeals.sort((a, b) => new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999')).slice(0, contactShowAllDeals ? activeDeals.length : DEAL_LIMIT).map((opp, idx) => {
                              const sc = getStageColor(opp.stage);
                              return (
                              <div key={opp.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 120px 110px 100px', padding: '0.75rem 1.5rem', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem', alignItems: 'center', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc', cursor: 'pointer' }}
                                  onClick={() => { setViewingContact(null); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(opp); setShowModal(true); }, 150); }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                              >
                                  <div>
                                      <div style={{ fontWeight: '600', color: '#1e293b' }}>{opp.opportunityName || opp.account || 'Unnamed'}</div>
                                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{opp.account}</div>
                                  </div>
                                  <span style={{ background: sc.bg, color: sc.text, padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', textAlign: 'center' }}>{opp.stage}</span>
                                  <span style={{ textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>${(parseFloat(opp.arr) || 0).toLocaleString()}</span>
                                  <span style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>{opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}</span>
                                  <span style={{ textAlign: 'center' }}>
                                      <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%', background: opp.health === 'green' ? '#16a34a' : opp.health === 'yellow' ? '#f59e0b' : opp.health === 'red' ? '#ef4444' : '#d1d5db' }} />
                                  </span>
                              </div>
                              );
                          })}
                          {activeDeals.length > DEAL_LIMIT && (
                              <div style={{ padding: '0.75rem 1.5rem', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
                                  <button onClick={() => setContactShowAllDeals(!contactShowAllDeals)}
                                      style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                  >{contactShowAllDeals ? 'Show Less' : `See More (${activeDeals.length - DEAL_LIMIT} more)`}</button>
                              </div>
                          )}
                      </div>
                  )}
              </div>
    
              {/* Closed Deals */}
              {closedDeals.length > 0 && (
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Closed Deals ({closedDeals.length})</h3>
                  </div>
                  <div>
                      {closedDeals.map((opp, idx) => {
                          const isWon = opp.stage === 'Closed Won';
                          return (
                          <div key={opp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.5rem', borderBottom: '1px solid #f1f3f5', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc' }}>
                              <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.875rem' }}>{opp.opportunityName || opp.account || 'Unnamed'}</div>
                                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{opp.account}</div>
                              </div>
                              <span style={{
                                  background: isWon ? '#dcfce7' : '#fef2f2', color: isWon ? '#166534' : '#991b1b',
                                  padding: '0.2rem 0.625rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', marginRight: '1rem'
                              }}>{opp.stage}</span>
                              <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.875rem', minWidth: '80px', textAlign: 'right' }}>${(parseFloat(opp.arr) || 0).toLocaleString()}</span>
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
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
                          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Open Tasks ({ctTasks.length})</h3>
                      </div>
                      {ctTasks.length === 0 ? (
                          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No open tasks</div>
                      ) : (
                          <div>
                              {ctTasks.map((t, idx) => {
                                  const isOD = t.dueDate && new Date(t.dueDate + 'T12:00:00') < new Date([new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'));
                                  const st = t.status || 'Open';
                                  const stc = { 'Open': { bg: '#dbeafe', c: '#1e40af' }, 'In-Process': { bg: '#fef3c7', c: '#92400e' } }[st] || { bg: '#dbeafe', c: '#1e40af' };
                                  return (
                                  <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1.5rem', borderBottom: '1px solid #f1f3f5', background: idx % 2 === 0 ? '#fff' : '#fafbfc', cursor: 'pointer' }}
                                      onClick={() => { setViewingContact(null); setActiveTab('tasks'); setTimeout(() => setViewingTask(t), 150); }}
                                      onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                      onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fff' : '#fafbfc'}
                                  >
                                      <span style={{ background: stc.bg, color: stc.c, padding: '0.15rem 0.4rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '700', flexShrink: 0, width: '65px', textAlign: 'center' }}>{st}</span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                                      </div>
                                      <span style={{ background: '#2563eb18', color: '#2563eb', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '600', flexShrink: 0 }}>{t.type}</span>
                                      <span style={{ fontSize: '0.75rem', color: isOD ? '#ef4444' : '#64748b', fontWeight: isOD ? '700' : '400', flexShrink: 0, width: '75px', textAlign: 'right' }}>
                                          {t.dueDate ? new Date(t.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                      </span>
                                      {isOD && <span style={{ background: '#ef4444', color: '#fff', padding: '0.1rem 0.35rem', borderRadius: '3px', fontSize: '0.5625rem', fontWeight: '700' }}>OVERDUE</span>}
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
                      if (a.opportunityId && involvedOppIds.includes(a.opportunityId)) return true;
                      return false;
                  }).sort((a, b) => new Date(b.date || '2000') - new Date(a.date || '2000'));
                  return (
                  <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
                          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>Activity History ({ctActivities.length})</h3>
                      </div>
                      {ctActivities.length === 0 ? (
                          <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No activity history</div>
                      ) : (
                          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                              {ctActivities.map((a, idx) => {
                                  const relOpp = a.opportunityId ? opportunities.find(o => o.id === a.opportunityId) : null;
                                  return (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.5rem 1.5rem', borderBottom: '1px solid #f1f3f5', background: idx % 2 === 0 ? '#fff' : '#fafbfc' }}>
                                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', flexShrink: 0, width: '70px', paddingTop: '0.1rem' }}>{a.date ? new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
                                      <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.4rem', borderRadius: '3px', fontSize: '0.625rem', fontWeight: '700', flexShrink: 0 }}>{a.type || 'Note'}</span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: '0.8125rem', color: '#475569' }}>{a.notes || a.subject || 'No details'}</div>
                                          {relOpp && <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.125rem' }}>Opp: {relOpp.opportunityName || relOpp.account}</div>}
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
    </div>
    );
}