import React, { useState } from 'react';
import { useApp } from '../../AppContext';
import { dbFetch } from '../../utils/storage';

export default function ViewingAccountPanel({
    setEditingOpp, setShowModal,
    setEditingContact, setShowContactModal,
    setEditingAccount, setEditingSubAccount, setShowAccountModal,
    setEditingTask, setShowTaskModal,
    setEditingActivity, setShowActivityModal, setActivityInitialContext,
    setShowCsvImportModal, setShowLeadImportModal, setShowOutlookImportModal,
    setShowSpiffClaimModal, setSpiffClaimContext,
    setShowShortcuts,
}) {
    const {
        opportunities, accounts, contacts, tasks, activities, settings,
        currentUser, userRole, canSeeAll,
        getStageColor, calculateDealHealth, getQuarter, getQuarterLabel,
        showConfirm, softDelete, addAudit,
        setActiveTab,
        handleDelete, handleSave,
        handleDeleteContact, handleSaveContact,
        handleDeleteTask, handleCompleteTask,
        handleSaveActivity, handleDeleteActivity,
        handleDeleteAccount, handleDeleteSubAccount, getSubAccounts,
        visibleOpportunities, stages,
        viewingContact, setViewingContact,
        viewingAccount, setViewingAccount,
        viewingTask, setViewingTask,
        accShowAllClosed, setAccShowAllClosed,
        accShowAllContacts, setAccShowAllContacts,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;

    const handleEditContact = (c) => { setEditingContact(c); setShowContactModal(true); };
    const handleEditAccount = (a, isSub) => { if (isSub) { setEditingSubAccount(a); setEditingAccount(null); } else { setEditingAccount(a); setEditingSubAccount(null); } setShowAccountModal(true); };
    const handleEditTask = (t) => { setEditingTask(t); setShowTaskModal(true); };
    const handleEditOpp = (o) => { setEditingOpp(o); setShowModal(true); };
    const handleAddActivity = (ctx) => { setActivityInitialContext(ctx || null); setEditingActivity(null); setShowActivityModal(true); };

    if (!viewingAccount) return null;

const acc = viewingAccount;
const accName = acc.name.toLowerCase();
const accOpps = opportunities.filter(o => o.account && o.account.toLowerCase() === accName);
const accContacts = contacts.filter(c => c.company && c.company.toLowerCase() === accName);
const pv = accOpps.reduce((sum, o) => sum + (parseFloat(o.arr) || 0), 0);
const openOpps = accOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
const closedOpps = accOpps.filter(o => o.stage === 'Closed Won' || o.stage === 'Closed Lost');
const wonOpps = accOpps.filter(o => o.stage === 'Closed Won');
const wonValue = wonOpps.reduce((sum, o) => sum + (parseFloat(o.arr) || 0) + (parseFloat(o.implementationCost) || 0), 0);

// Rollup across all sub-accounts
const subs = getSubAccounts(acc.id);
const hasSubs = subs.length > 0;
const rollup = hasSubs ? getAccountRollup(acc) : null;

// Sub-account enriched data
const subData = subs.map(sub => {
  const sn = sub.name.toLowerCase();
  const subOpps = opportunities.filter(o => o.account && o.account.toLowerCase() === sn);
  const subOpen = subOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
  const subWon = subOpps.filter(o => o.stage === 'Closed Won');
  const subPipeline = subOpen.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
  const subWonValue = subWon.reduce((s, o) => s + (parseFloat(o.arr) || 0) + (parseFloat(o.implementationCost) || 0), 0);
  const subContacts = contacts.filter(c => c.company && c.company.toLowerCase() === sn);
  return { sub, subOpps, subOpen, subWon, subPipeline, subWonValue, subContacts };
});

// All opps across parent + subs (for consolidated view)
const allOpps = hasSubs ? [...accOpps, ...subData.flatMap(d => d.subOpps)] : accOpps;
const allOpenOpps = allOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
const allClosedOpps = allOpps.filter(o => o.stage === 'Closed Won' || o.stage === 'Closed Lost');
const allWonOpps = allOpps.filter(o => o.stage === 'Closed Won');
const totalPipeline = hasSubs ? rollup.pipeline : pv;
const totalWonValue = hasSubs ? rollup.wonArr : wonValue;
const totalContacts = hasSubs ? rollup.allContacts : accContacts;

const CLOSED_LIMIT = 5;
const CONTACT_LIMIT = 8;


    return (
    <div className="modal-overlay" onClick={() => setViewingAccount(null)} style={{ alignItems: 'flex-start', paddingTop: '0', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ 
          width: '100%', maxWidth: '1100px', minHeight: '100vh', margin: '0 auto',
          background: '#f8fafc', boxShadow: '0 0 40px rgba(0,0,0,0.15)'
      }}>
          {/* Header bar */}
          <div style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '1.25rem 2rem', position: 'sticky', top: 0, zIndex: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                      <button onClick={() => setViewingAccount(null)}
                          style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.5rem 0.875rem', cursor: 'pointer', fontSize: '0.875rem', fontWeight: '600', color: '#475569', fontFamily: 'inherit', marginTop: '0.125rem' }}
                      >← Back</button>
                      <div>
                          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '800', color: '#0f172a' }}>{acc.name}</h1>
                          {acc.accountOwner && <div style={{ color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', marginTop: '0.125rem' }}>{acc.accountOwner}</div>}
                          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginTop: '0.375rem', fontSize: '0.8125rem', color: '#64748b' }}>
                              {(acc.address || acc.city || acc.state || acc.zip) && (
                                  <span>📍 {[acc.address, [acc.city, acc.state].filter(Boolean).join(', '), acc.zip].filter(Boolean).join(', ')}</span>
                              )}
                              {acc.phone && <span>📞 {acc.phone}</span>}
                              {acc.website && <a href={acc.website} target="_blank" style={{ color: '#2563eb', textDecoration: 'none' }}>🌐 {acc.website.replace(/^https?:/, '').replace(/^\/\//, '').replace(/^www\./, '')}</a>}
                          </div>
                      </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      <button onClick={() => { setActivityInitialContext({ companyName: acc.name }); setEditingActivity(null); setShowActivityModal(true); }} style={{ width:'40px', height:'40px', borderRadius:'50%', background:'linear-gradient(135deg,#2563eb,#7c3aed)', color:'#fff', border:'none', boxShadow:'0 2px 10px rgba(37,99,235,0.4)', fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }} title="Quick log activity">⚡</button>
                      <button className="btn" onClick={() => { setViewingAccount(null); handleEditAccount(acc); }}>Edit Account</button>
                  </div>
              </div>
          </div>
    
          <div style={{ padding: '1.5rem 2rem' }}>
    
              {/* Account metadata + sub-account breakdown */}
              {(acc.verticalMarket || acc.country || hasSubs) && (
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem 1.5rem', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  {(acc.verticalMarket || acc.country) && (
                  <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.875rem', marginBottom: hasSubs ? '1rem' : 0, paddingBottom: hasSubs ? '1rem' : 0, borderBottom: hasSubs ? '1px solid #f1f3f5' : 'none' }}>
                      {acc.verticalMarket && (
                          <div>
                              <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Vertical</div>
                              <div style={{ color: '#1e293b', fontWeight: '500' }}>{acc.verticalMarket}</div>
                          </div>
                      )}
                      {acc.country && (
                          <div>
                              <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Country</div>
                              <div style={{ color: '#1e293b', fontWeight: '500' }}>{acc.country}</div>
                          </div>
                      )}
                  </div>
                  )}
                  {hasSubs && (
                  <div>
                      <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Sub-Accounts ({subs.length})</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {subData.map(({ sub, subOpen, subWon, subPipeline, subContacts }) => (
                              <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                      <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>↳</span>
                                      <span style={{ fontWeight: '700', color: '#4338ca', fontSize: '0.875rem', cursor: 'pointer' }}
                                          onClick={() => setViewingAccount(sub)}
                                          onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                          onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                      >{sub.name}</span>
                                      {sub.accountOwner && <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{sub.accountOwner}</span>}
                                  </div>
                                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                      {subOpen.length > 0 && <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{subOpen.length} active</span>}
                                      {subWon.length > 0 && <span style={{ background: '#dcfce7', color: '#166534', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{subWon.length} won</span>}
                                      {subPipeline > 0 && <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>${subPipeline >= 1000 ? Math.round(subPipeline/1000)+'K' : subPipeline.toLocaleString()} pipeline</span>}
                                      {subContacts.length > 0 && <span style={{ background: '#f3e8ff', color: '#6b21a8', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{subContacts.length} contacts</span>}
                                      {subOpen.length === 0 && subWon.length === 0 && <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic' }}>No opportunities</span>}
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
                  )}
              </div>
              )}
    
              {/* KPI Cards — rolled up when subs exist */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.25rem' }}>
                  {[
                      { value: allOpenOpps.length, sub: hasSubs && openOpps.length !== allOpenOpps.length ? `${openOpps.length} direct` : null, label: 'Active Opps', accent: '#2563eb', textColor: '#1e40af', subColor: '#3b82f6' },
                      { value: allWonOpps.length, sub: hasSubs && wonOpps.length !== allWonOpps.length ? `${wonOpps.length} direct` : null, label: 'Won', accent: '#16a34a', textColor: '#166534', subColor: '#16a34a' },
                      { value: '$' + (totalPipeline >= 1000 ? Math.round(totalPipeline/1000)+'K' : totalPipeline.toLocaleString()), sub: hasSubs && pv !== totalPipeline ? `$${pv >= 1000 ? Math.round(pv/1000)+'K' : pv.toLocaleString()} direct` : null, label: hasSubs ? 'Total Pipeline' : 'Pipeline', accent: '#f59e0b', textColor: '#92400e', subColor: '#b45309' },
                      { value: totalContacts.length, sub: hasSubs && accContacts.length !== totalContacts.length ? `${accContacts.length} direct` : null, label: 'Contacts', accent: '#8b5cf6', textColor: '#6b21a8', subColor: '#9333ea' },
                  ].map(({ value, sub, label, accent, textColor, subColor }) => (
                      <div key={label} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem', textAlign: 'center', borderLeft: `4px solid ${accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                          <div style={{ fontSize: '2rem', fontWeight: '800', color: textColor, lineHeight: 1.1 }}>{value}</div>
                          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: subColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>{label}</div>
                          {sub && <div style={{ fontSize: '0.6rem', color: '#94a3b8', marginTop: '0.25rem', fontWeight: '500' }}>{sub}</div>}
                          {hasSubs && <div style={{ fontSize: '0.6rem', color: accent, marginTop: '0.1rem', fontWeight: '600', opacity: 0.7 }}>incl. {subs.length} sub{subs.length > 1 ? 's' : ''}</div>}
                      </div>
                  ))}
              </div>
    
              {/* Won Revenue banner when subs exist */}
              {hasSubs && totalWonValue > 0 && (
                  <div style={{ background: 'linear-gradient(135deg, #166534, #16a34a)', borderRadius: '10px', padding: '1rem 1.5rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Won Revenue (Parent + All Subs)</div>
                          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#ffffff', marginTop: '0.125rem' }}>${totalWonValue.toLocaleString()}</div>
                      </div>
                      {wonValue > 0 && wonValue !== totalWonValue && (
                          <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>This account direct</div>
                              <div style={{ fontSize: '1.125rem', fontWeight: '800', color: 'rgba(255,255,255,0.9)' }}>${wonValue.toLocaleString()}</div>
                          </div>
                      )}
                  </div>
              )}
    
              {/* Open Opportunities — all subs included when parent */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                          Open Opportunities ({allOpenOpps.length})
                          {hasSubs && allOpenOpps.length !== openOpps.length && <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500', marginLeft: '0.5rem' }}>across all sub-accounts</span>}
                      </h3>
                      {totalPipeline > 0 && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#b45309' }}>${totalPipeline >= 1000 ? Math.round(totalPipeline/1000)+'K' : totalPipeline.toLocaleString()} pipeline</span>}
                  </div>
                  {allOpenOpps.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No open opportunities</div>
                  ) : (
                      <div>
                          <div style={{ display: 'grid', gridTemplateColumns: hasSubs ? '1fr 130px 140px 110px 90px' : '1fr 140px 120px 110px 100px', padding: '0.5rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #f1f3f5', fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              <span>Opportunity</span>{hasSubs && <span>Account</span>}<span>Stage</span><span style={{ textAlign: 'right' }}>ARR</span><span style={{ textAlign: 'center' }}>Close Date</span>
                          </div>
                          {[...allOpenOpps].sort((a, b) => new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999')).map((opp, idx) => {
                              const sc = getStageColor(opp.stage);
                              const isSubOpp = opp.account && opp.account.toLowerCase() !== accName;
                              return (
                              <div key={opp.id} style={{ display: 'grid', gridTemplateColumns: hasSubs ? '1fr 130px 140px 110px 90px' : '1fr 140px 120px 110px 100px', padding: '0.625rem 1.5rem', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem', alignItems: 'center', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc', cursor: 'pointer' }}
                                  onClick={() => { setViewingAccount(null); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(opp); setShowModal(true); }, 150); }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                              >
                                  <div>
                                      <div style={{ fontWeight: '600', color: '#1e293b' }}>{opp.opportunityName || 'Unnamed'}</div>
                                      {opp.salesRep && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{opp.salesRep}</div>}
                                  </div>
                                  {hasSubs && <span style={{ fontSize: '0.6875rem', color: isSubOpp ? '#4338ca' : '#64748b', fontWeight: isSubOpp ? '700' : '400' }}>{isSubOpp ? '↳ ' : ''}{opp.account}</span>}
                                  <span style={{ background: sc.bg, color: sc.text, padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{opp.stage}</span>
                                  <span style={{ textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>${(parseFloat(opp.arr) || 0).toLocaleString()}</span>
                                  <span style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>{opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}</span>
                              </div>
                              );
                          })}
                      </div>
                  )}
              </div>
    
              {/* Closed Opportunities */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                          Closed Opportunities ({allClosedOpps.length})
                      </h3>
                      {totalWonValue > 0 && !hasSubs && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#16a34a' }}>Won: ${wonValue.toLocaleString()}</span>}
                  </div>
                  {allClosedOpps.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No closed opportunities</div>
                  ) : (
                      <div>
                          {[...allClosedOpps].sort((a, b) => new Date(b.forecastedCloseDate || '0') - new Date(a.forecastedCloseDate || '0')).slice(0, accShowAllClosed ? allClosedOpps.length : CLOSED_LIMIT).map((opp, idx) => {
                              const isWon = opp.stage === 'Closed Won';
                              const isSubOpp = opp.account && opp.account.toLowerCase() !== accName;
                              return (
                              <div key={opp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 1.5rem', borderBottom: '1px solid #f1f3f5', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc', cursor: 'pointer' }}
                                  onClick={() => { setViewingAccount(null); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(opp); setShowModal(true); }, 150); }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                              >
                                  <div style={{ flex: 1 }}>
                                      <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.875rem' }}>{opp.opportunityName || 'Unnamed'}</div>
                                      <div style={{ fontSize: '0.75rem', color: isSubOpp ? '#4338ca' : '#94a3b8' }}>{isSubOpp ? `↳ ${opp.account}` : (opp.salesRep || '')}</div>
                                  </div>
                                  <span style={{ background: isWon ? '#dcfce7' : '#fef2f2', color: isWon ? '#166534' : '#991b1b', padding: '0.2rem 0.625rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', marginRight: '1rem' }}>{opp.stage}</span>
                                  <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.875rem', minWidth: '80px', textAlign: 'right' }}>${(parseFloat(opp.arr) || 0).toLocaleString()}</span>
                              </div>
                              );
                          })}
                          {allClosedOpps.length > CLOSED_LIMIT && (
                              <div style={{ padding: '0.75rem 1.5rem', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
                                  <button onClick={() => setAccShowAllClosed(!accShowAllClosed)}
                                      style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                  >{accShowAllClosed ? 'Show Less' : `See More (${allClosedOpps.length - CLOSED_LIMIT} more)`}</button>
                              </div>
                          )}
                      </div>
                  )}
              </div>
    
              {/* Contacts — all subs included */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                  <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                          Contacts ({totalContacts.length})
                          {hasSubs && totalContacts.length !== accContacts.length && <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500', marginLeft: '0.5rem' }}>across all sub-accounts</span>}
                      </h3>
                  </div>
                  {totalContacts.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No contacts linked to this account</div>
                  ) : (
                      <div>
                          {[...totalContacts].sort((a, b) => ((a.lastName||'')+(a.firstName||'')).localeCompare((b.lastName||'')+(b.firstName||''))).slice(0, accShowAllContacts ? totalContacts.length : CONTACT_LIMIT).map((c, idx) => {
                              const isSubContact = c.company && c.company.toLowerCase() !== accName;
                              return (
                              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 1rem', borderBottom: '1px solid #f1f3f5', cursor: 'pointer', transition: 'background 0.15s', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc' }}
                                  onClick={() => { setViewingAccount(null); setActiveTab('contacts'); setTimeout(() => setViewingContact(c), 100); }}
                                  onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                              >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                                      <div style={{ fontWeight: '700', color: '#2563eb', fontSize: '0.75rem', whiteSpace: 'nowrap', minWidth: '140px' }}>{c.firstName} {c.lastName}</div>
                                      <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.title || ''}</div>
                                      {isSubContact && <span style={{ fontSize: '0.625rem', color: '#4338ca', fontWeight: '700', background: '#e0e7ff', padding: '0.05rem 0.35rem', borderRadius: '3px', flexShrink: 0 }}>↳ {c.company}</span>}
                                  </div>
                                  <div style={{ display: 'flex', gap: '1.25rem', flexShrink: 0, alignItems: 'center' }}>
                                      {c.email && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.email}</div>}
                                      {c.phone && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{c.phone}</div>}
                                  </div>
                              </div>
                              );
                          })}
                          {totalContacts.length > CONTACT_LIMIT && (
                              <div style={{ padding: '0.75rem 1.5rem', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
                                  <button onClick={() => setAccShowAllContacts(!accShowAllContacts)}
                                      style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                  >{accShowAllContacts ? 'Show Less' : `See More (${totalContacts.length - CONTACT_LIMIT} more)`}</button>
                              </div>
                          )}
                      </div>
                  )}
              </div>
          </div>
      </div>
    </div>
    );
}