import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

export default function ViewingTaskPanel({
    // Modal setters passed as props (managed by App.jsx)
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
        calculateDealHealth,
        getQuarter,
        getQuarterLabel,
        showConfirm,
        softDelete,
        addAudit,
        setActiveTab,
        handleDelete,
        handleSave,
        handleCompleteTask,
        handleDeleteTask,
        handleSaveActivity,
        handleDeleteActivity,
        handleSaveContact,
        handleDeleteContact,
        visibleOpportunities,
        stages,
        // Viewing state
        viewingTask, setViewingTask,
        viewingAccount, setViewingAccount,
        viewingContact, setViewingContact,
        contactShowAllDeals, setContactShowAllDeals,
        accShowAllClosed, setAccShowAllClosed,
        accShowAllContacts, setAccShowAllContacts,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;

    // UI handlers
    const handleEditContact = (c) => { setEditingContact(c); setShowContactModal(true); };
    const handleEditAccount = (a) => { setEditingAccount(a); setEditingSubAccount(null); setShowAccountModal(true); };
    const handleEditTask = (t) => { setEditingTask(t); setShowTaskModal(true); };

    if (!viewingTask) return null;

    return (

                    <div className="modal-overlay" onClick={() => setViewingTask(null)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                                <div>
                                    <h2 style={{ margin: '0 0 0.5rem 0' }}>{t.title}</h2>
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
            })()}

            {showContactModal && (
                <ContactModal
                    contact={editingContact}
                    contacts={contacts}
                    accounts={accounts}
                    settings={settings}
                    onClose={() => { setShowContactModal(false); setContactModalError(null); setContactModalSaving(false); }}
                    onDismissError={() => setContactModalError(null)}
                    onSave={(contactData) => handleSaveContact(contactData, { editingContact, setShowContactModal })}
                    errorMessage={contactModalError}
                    saving={contactModalSaving}
                    onSaveNewContact={(newContactData) => {
                        const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        const nc = { ...newContactData, id: newId, createdAt: new Date().toISOString() };
                        setContacts(prev => [...prev, nc]);
                        dbFetch('/.netlify/functions/contacts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(nc)
                        }).catch(err => console.error('Failed to save inline contact:', err));
                        return nc;
                    }}
                    onAddAccount={() => {
                        setShowAccountModal(true);
                        setEditingAccount(null);
                        setEditingSubAccount(null);
                        setParentAccountForSub(null);
                    }}
                />
            )}

            {viewingAccount && (() => {
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
            })()}

            {viewingContact && (() => {
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
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                    <button onClick={() => { setActivityInitialContext({ companyName: ct.company || '', contactName: ctFullName }); setEditingActivity(null); setShowActivityModal(true); }} style={{ width:'40px', height:'40px', borderRadius:'50%', background:'linear-gradient(135deg,#2563eb,#7c3aed)', color:'#fff', border:'none', boxShadow:'0 2px 10px rgba(37,99,235,0.4)', fontSize:'1.1rem', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }} title="Quick log activity">⚡</button>
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
            })()}

            {/* Notes Popover */}
            {/* ── Keyboard Shortcuts Overlay ───────────────────────── */}
            {showShortcuts && (
                <div onClick={() => setShowShortcuts(false)} style={{
                    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9998,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(2px)', animation: 'fadeIn 0.15s ease'
                }}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: '16px', width: '540px', maxWidth: '95vw',
                        maxHeight: '85vh', overflowY: 'auto',
                        boxShadow: '0 25px 60px rgba(0,0,0,0.25)', animation: 'slideUp 0.18s ease'
                    }}>
                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: '800', color: '#0f172a' }}>⌨ Keyboard Shortcuts</div>
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.125rem' }}>Press <kbd style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.1rem 0.375rem', fontSize: '0.6875rem', fontFamily: 'monospace', fontWeight: '700' }}>?</kbd> to toggle this panel</div>
                            </div>
                            <button onClick={() => setShowShortcuts(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1.25rem', lineHeight: 1, padding: '0.25rem' }}>✕</button>
                        </div>
                        {/* Sections */}
                        {[
                            { section: 'Navigation', icon: '🧭', shortcuts: [
                                { keys: ['1'], desc: 'Home' },
                                { keys: ['2'], desc: 'Pipeline' },
                                { keys: ['3'], desc: 'Opportunities' },
                                { keys: ['4'], desc: 'Tasks' },
                                { keys: ['5'], desc: 'Accounts' },
                                { keys: ['6'], desc: 'Contacts' },
                                { keys: ['7'], desc: 'Leads' },
                                { keys: ['8'], desc: 'Reports' },
                            ]},
                            { section: 'Create', icon: '✏️', shortcuts: [
                                { keys: ['O'], desc: 'New Opportunity' },
                                { keys: ['A'], desc: 'New Account' },
                                { keys: ['C'], desc: 'New Contact' },
                                { keys: ['T'], desc: 'New Task' },
                            ]},
                            { section: 'Search & UI', icon: '🔍', shortcuts: [
                                { keys: ['/'], desc: 'Focus search bar' },
                                { keys: ['Esc'], desc: 'Close modal or popover' },
                            ]},
                        ].map(group => (
                            <div key={group.section} style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #f8fafc' }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.625rem' }}>
                                    {group.icon} {group.section}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                    {group.shortcuts.map(sc => (
                                        <div key={sc.desc} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ fontSize: '0.8125rem', color: '#475569' }}>{sc.desc}</span>
                                            <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0, marginLeft: '1rem' }}>
                                                {sc.keys.map(k => (
                                                    <kbd key={k} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderBottom: '2px solid #d1d5db', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: '700', color: '#1e293b', minWidth: '28px', textAlign: 'center' }}>{k}</kbd>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div style={{ padding: '0.75rem 1.5rem', background: '#f8fafc', borderRadius: '0 0 16px 16px' }}>
                            <div style={{ fontSize: '0.6875rem', color: '#94a3b8', textAlign: 'center' }}>
                                Shortcuts are disabled while typing in a field
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Undo Toast ───────────────────────────────────────── */}
            {undoToast && (
                <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 10050,
                    background: '#1e293b', color: '#fff', borderRadius: '10px', padding: '0.75rem 1.25rem',
                    display: 'flex', alignItems: 'center', gap: '1rem', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                    minWidth: '320px', maxWidth: '480px' }}>
                    <span style={{ fontSize: '0.875rem', flex: 1 }}>
                        🗑 <strong>{undoToast.label}</strong> deleted
                    </span>
                    <button onClick={() => { clearTimeout(undoToast.timerId); undoToast.restore(); }}
                        style={{ padding: '0.3rem 0.875rem', background: '#3b82f6', color: '#fff', border: 'none',
                            borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                        ↩ Undo
                    </button>
                    <button onClick={() => { clearTimeout(undoToast.timerId); setUndoToast(null); }}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem', lineHeight: 1 }}>✕</button>
                </div>
            )}

            {notesPopover && (() => {
                const { opp, type, rect } = notesPopover;
                const popH = 300;
                const spaceBelow = window.innerHeight - rect.bottom;
                const top = spaceBelow >= popH + 12 ? rect.bottom + 6 : rect.top - popH - 6;
                const left = Math.min(rect.left, window.innerWidth - 360);
                const avatarColors = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ec4899','#0891b2','#ef4444'];
                const getColor = (name) => avatarColors[(name||'A').charCodeAt(0) % avatarColors.length];
                const getInitials = (name) => (name||'?').split(' ').map(w=>w[0]).join('').toUpperCase().slice(0,2);
                return (
                    <>
                        <div onClick={() => setNotesPopover(null)} style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
                        <div style={{ position: 'fixed', top, left, zIndex: 999, background: '#fff', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)', border: '1px solid #e2e8f0', width: '340px', maxHeight: '300px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: '10px 10px 0 0' }}>
                                <div style={{ fontWeight: '700', fontSize: '0.75rem', color: '#1e293b' }}>
                                    {type === 'notes' ? '📝 Notes' : '💬 Team Notes'} · <span style={{ color: '#64748b', fontWeight: '500' }}>{opp.opportunityName || opp.account}</span>
                                </div>
                                <button onClick={() => setNotesPopover(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', lineHeight: 1, padding: '0 0.25rem' }}>✕</button>
                            </div>
                            <div style={{ overflowY: 'auto', padding: '0.75rem 0.875rem', flex: 1 }}>
                                {type === 'notes' ? (
                                    <p style={{ margin: 0, fontSize: '0.8125rem', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{opp.notes}</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                                        {(opp.comments || []).slice().sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).map(c => (
                                            <div key={c.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                                                <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: getColor(c.author), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5625rem', fontWeight: '800', flexShrink: 0 }}>{getInitials(c.author)}</div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'baseline', marginBottom: '0.125rem' }}>
                                                        <span style={{ fontWeight: '700', fontSize: '0.75rem', color: '#1e293b' }}>{c.author}</span>
                                                        <span style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{new Date(c.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: '0.8125rem', color: '#334155', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.text}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div style={{ padding: '0.5rem 0.875rem', borderTop: '1px solid #f1f5f9', background: '#f8fafc', borderRadius: '0 0 10px 10px' }}>
                                <button onClick={() => { setNotesPopover(null); setEditingOpp(notesPopover.opp); setShowModal(true); }}
                                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                                    Open full opportunity →
                                </button>
                            </div>
                        </div>
                    </>
                );
            })()}

            {showActivityModal && (
                <ActivityModal
                    key={editingActivity?.id || ('new-activity-' + (showActivityModal ? 'open' : 'closed'))}
                    activity={editingActivity}
                    opportunities={opportunities}
                    contacts={contacts}
                    accounts={accounts}
                    onClose={() => { setShowActivityModal(false); setActivityModalError(null); setActivityModalSaving(false); }}
                    onDismissError={() => setActivityModalError(null)}
                    onSave={(activityData) => handleSaveActivity(activityData, { editingActivity, currentUser, opportunities, setShowActivityModal, setFollowUpPrompt, setQuickLogOpen, setQuickLogForm, setQuickLogContactResults })}
                    errorMessage={activityModalError}
                    saving={activityModalSaving}
                    initialContext={activityInitialContext}
                    onSaveNewContact={(data) => {
                        const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        const nc = { ...data, id: newId, createdAt: new Date().toISOString() };
                        setContacts(prev => [...prev, nc]);
                        dbFetch('/.netlify/functions/contacts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(nc)
                        }).catch(err => console.error('Failed to save inline contact:', err));
                        return nc;
                    }}
                    onSaveNewAccount={(data) => {
                        const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        const na = { ...data, id: newId };
                        setAccounts(prev => [...prev, na]);
                        dbFetch('/.netlify/functions/accounts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(na)
                        }).catch(err => console.error('Failed to save inline account:', err));
                        return na;
                    }}
                    onAddContact={() => {
                        setShowContactModal(true);
                        setEditingContact(null);
                    }}
                    onAddAccount={() => {
                        setShowAccountModal(true);
                        setEditingAccount(null);
                        setEditingSubAccount(null);
                        setParentAccountForSub(null);
                    }}
                    onAddOpportunity={() => {
                        setShowModal(true);
                        setEditingOpp(null);
                    }}
                />
            )}

            {showCsvImportModal && (
                <CsvImportModal
                    importType={csvImportType}
                    contacts={contacts}
                    accounts={accounts}
                    onClose={() => setShowCsvImportModal(false)}
                    onImportContacts={async (newContacts) => {
                        // Save records in batches to avoid overwhelming Netlify concurrency limits
                        const saveBatch = async (url, items, progressOffset = 0, progressTotal = items.length) => {
                            const BATCH_SIZE = 20;
                            let failed = 0;
                            let done = 0;
                            for (let i = 0; i < items.length; i += BATCH_SIZE) {
                                const batch = items.slice(i, i + BATCH_SIZE);
                                const results = await Promise.allSettled(batch.map(async (item) => {
                                    const r = await dbFetch(url, { method: 'POST', body: JSON.stringify(item) });
                                    if (!r || !r.ok) throw new Error('failed');
                                }));
                                failed += results.filter(r => r.status === 'rejected').length;
                                done += batch.length;
                                if (typeof window.__importProgressCb === 'function') {
                                    window.__importProgressCb(progressOffset + done, progressTotal);
                                }
                            }
                            return failed;
                        };

                        const contactsWithIds = newContacts.map((c) => ({
                            ...c,
                            id: crypto.randomUUID(),
                            createdAt: new Date().toISOString()
                        }));

                        // Step 1: Auto-add new companies to accounts FIRST in batches
                        const existingNames = accounts.map(a => a.name.toLowerCase());
                        const newCompanies = [...new Set(
                            newContacts.map(c => c.company).filter(c => c && !existingNames.includes(c.toLowerCase()))
                        )];
                        if (newCompanies.length > 0) {
                            const newAccts = newCompanies.map((name) => ({
                                id: crypto.randomUUID(), name,
                                verticalMarket: '', address: '', city: '', state: '',
                                zip: '', country: '', website: '', phone: '', accountOwner: '',
                            }));
                            setAccounts(prev => [...prev, ...newAccts]);
                            await saveBatch('/.netlify/functions/accounts', newAccts);
                        }

                        // Step 2: Save contacts in batches — only after accounts confirmed saved
                        setContacts(prev => [...prev, ...contactsWithIds]);
                        const contactsFailed = await saveBatch('/.netlify/functions/contacts', contactsWithIds, 0, contactsWithIds.length);
                        if (contactsFailed > 0) {
                            throw new Error(`${contactsFailed} of ${contactsWithIds.length} contacts failed to save. The rest imported successfully — try re-importing the failed records.`);
                        }
                        // Modal handles its own close via Done button
                    }}
                    onImportAccounts={async (newAccounts) => {
                        const BATCH_SIZE = 20;
                        const accountsWithIds = newAccounts.map((a) => ({ ...a, id: crypto.randomUUID() }));
                        setAccounts(prev => [...prev, ...accountsWithIds]);
                        let accountsFailed = 0;
                        for (let i = 0; i < accountsWithIds.length; i += BATCH_SIZE) {
                            const batch = accountsWithIds.slice(i, i + BATCH_SIZE);
                            const results = await Promise.allSettled(batch.map(async (account) => {
                                const r = await dbFetch('/.netlify/functions/accounts', {
                                    method: 'POST', body: JSON.stringify(account)
                                });
                                if (!r || !r.ok) throw new Error('failed');
                            }));
                            accountsFailed += results.filter(r => r.status === 'rejected').length;
                        }
                        if (accountsFailed > 0) {
                            throw new Error(`${accountsFailed} of ${accountsWithIds.length} accounts failed to save. The rest imported successfully — try re-importing the failed records.`);
                        }
                        // Modal handles its own close via Done button
                    }}
                />
            )}

            {showOutlookImportModal && (
                <OutlookImportModal
                    contacts={contacts}
                    opportunities={opportunities}
                    activities={activities}
                    onClose={() => setShowOutlookImportModal(false)}
                    onImport={async (newActivities) => {
                        const startId = Date.now();
                        const activitiesWithIds = newActivities.map((a, i) => ({
                            ...a,
                            id: 'id_' + (startId + i) + '_' + Math.random().toString(36).slice(2, 7),
                            createdAt: new Date().toISOString()
                        }));
                        setActivities([...activities, ...activitiesWithIds]);
                        // Save all imported activities — await all so we can catch partial failures
                        const activitySaveResults = await Promise.allSettled(
                            activitiesWithIds.map(activity =>
                                dbFetch('/.netlify/functions/activities', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(activity)
                                })
                            )
                        );
                        const activityFailed = activitySaveResults.filter(r => r.status === 'rejected').length;
                        if (activityFailed > 0) {
                            console.error(`${activityFailed} of ${activitiesWithIds.length} activities failed to save. Try re-importing the failed records.`);
                        }
                        setShowOutlookImportModal(false);
                    }}
                />
            )}

            {showLeadImportModal && (
                <LeadImportModal
                    existingLeads={leads}
                    onClose={() => setShowLeadImportModal(false)}
                    onImport={async (newLeads) => {
                        const resp = await dbFetch('/.netlify/functions/leads', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(newLeads),
                        });
                        if (!resp.ok) throw new Error('Import failed');
                        const data = await resp.json();
                        const imported = data.leads || [];
                        setLeads(prev => [...prev, ...imported]);
                        // Modal handles its own close via Done button
                    }}
                />
            )}

            {/* Lost Reason Modal */}
            {lostReasonModal && (
                <LostReasonModal
                    oppName={lostReasonModal.pendingFormData.opportunityName || lostReasonModal.pendingFormData.account}
                    onSave={(category, reason) => completeLostSave(lostReasonModal.pendingFormData, lostReasonModal.editingOpp, reason, category, activePipeline, currentUser, setLostReasonModal)}
                    onSkip={() => completeLostSave(lostReasonModal.pendingFormData, lostReasonModal.editingOpp, '', '', activePipeline, currentUser, setLostReasonModal)}
                />
            )}

            {confirmModal && (
                <div className="modal-overlay" onClick={() => setConfirmModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', padding: '2rem' }}>
                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: confirmModal.danger !== false ? '#fef2f2' : '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                <span style={{ fontSize: '1.5rem' }}>{confirmModal.danger !== false ? '\u26A0\uFE0F' : '\u2139\uFE0F'}</span>
                            </div>
                            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.125rem', fontWeight: '700', color: '#1e293b' }}>Confirm Action</h3>
                            <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0, lineHeight: '1.5', whiteSpace: 'pre-line' }}>{confirmModal.message}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button
                                onClick={() => setConfirmModal(null)}
                                style={{ padding: '0.625rem 1.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#ffffff', color: '#64748b', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                                onMouseEnter={e => e.target.style.background = '#f8f9fa'}
                                onMouseLeave={e => e.target.style.background = '#ffffff'}
                            >Cancel</button>
                            <button
                                onClick={() => { const fn = confirmModal.onConfirm; setConfirmModal(null); fn(); }}
                                style={{ padding: '0.625rem 1.5rem', border: 'none', borderRadius: '6px', background: confirmModal.danger !== false ? '#ef4444' : '#2563eb', color: 'white', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                                onMouseEnter={e => e.target.style.opacity = '0.9'}
                                onMouseLeave={e => e.target.style.opacity = '1'}
                            >{confirmModal.danger !== false ? 'Delete' : 'Confirm'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Task Reminder Popup */}
            {taskReminderPopup && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => setTaskReminderPopup(null)}
                >
                    <div style={{ background: '#ffffff', borderRadius: '12px', padding: '0', width: '420px', maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ background: '#f59e0b', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <span style={{ fontSize: '1.5rem' }}>🔔</span>
                            <div>
                                <div style={{ fontWeight: '700', fontSize: '1rem', color: '#ffffff' }}>Task Reminder</div>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.85)', fontWeight: '500' }}>
                                    {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        </div>
                        <div style={{ padding: '1.25rem' }}>
                            <div style={{ fontSize: '1.0625rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.75rem' }}>
                                {taskReminderPopup.title}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '1rem' }}>
                                {taskReminderPopup.type && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', width: '55px' }}>Type:</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b', background: '#f1f5f9', padding: '0.125rem 0.5rem', borderRadius: '4px' }}>{taskReminderPopup.type}</span>
                                    </div>
                                )}
                                {taskReminderPopup.dueDate && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', width: '55px' }}>Due:</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: new Date(taskReminderPopup.dueDate + 'T12:00:00') < new Date() ? '#ef4444' : '#1e293b' }}>
                                            {new Date(taskReminderPopup.dueDate + 'T12:00:00').toLocaleDateString()}
                                        </span>
                                    </div>
                                )}
                                {taskReminderPopup.assignedTo && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', width: '55px' }}>Assigned:</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{taskReminderPopup.assignedTo}</span>
                                    </div>
                                )}
                                {taskReminderPopup.notes && (
                                    <div style={{ marginTop: '0.375rem', fontSize: '0.8125rem', color: '#475569', background: '#f8fafc', borderRadius: '6px', padding: '0.5rem 0.625rem', border: '1px solid #e2e8f0', lineHeight: '1.4' }}>
                                        {taskReminderPopup.notes}
                                    </div>
                                )}
                            </div>
                            {/* Snooze selector */}
                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.625rem', padding:'0.5rem 0.75rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
                                <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', flexShrink:0 }}>Snooze</span>
                                <select value={taskReminderSnoozeH} onChange={e => setTaskReminderSnoozeH(Number(e.target.value))}
                                    style={{ padding:'3px 6px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', color:'#1e293b', background:'#fff' }}>
                                    {[0,1,2,3,4,5,6,8,12,24].map(h => <option key={h} value={h}>{h}h</option>)}
                                </select>
                                <select value={taskReminderSnoozeM} onChange={e => setTaskReminderSnoozeM(Number(e.target.value))}
                                    style={{ padding:'3px 6px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', color:'#1e293b', background:'#fff' }}>
                                    {[0,5,10,15,20,30,45].map(m => <option key={m} value={m}>{m}m</option>)}
                                </select>
                                <button onClick={() => {
                                        const task = taskReminderPopup;
                                        const ms = (taskReminderSnoozeH * 60 + taskReminderSnoozeM) * 60 * 1000;
                                        if (ms <= 0) return;
                                        setTaskReminderPopup(null);
                                        setTimeout(() => setTaskReminderPopup(task), ms);
                                    }}
                                    style={{ padding:'4px 14px', background:'#f59e0b', color:'#fff', border:'none', borderRadius:'6px', fontWeight:'700', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
                                    Snooze
                                </button>
                            </div>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    onClick={() => {
                                        const task = taskReminderPopup;
                                        setTaskReminderPopup(null);
                                        setActiveTab('tasks');
                                        setTimeout(() => {
                                            setEditingTask(task);
                                            setShowTaskModal(true);
                                        }, 150);
                                    }}
                                    style={{ flex: 1, padding: '0.625rem 1rem', background: '#2563eb', color: '#ffffff', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                                    onMouseEnter={e => e.target.style.background = '#1d4ed8'}
                                    onMouseLeave={e => e.target.style.background = '#2563eb'}
                                >Open Task</button>
                                <button
                                    onClick={() => setTaskReminderPopup(null)}
                                    style={{ flex: 1, padding: '0.625rem 1rem', background: '#ffffff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.target.style.background = '#f8fafc'; e.target.style.color = '#475569'; }}
                                    onMouseLeave={e => { e.target.style.background = '#ffffff'; e.target.style.color = '#64748b'; }}
                                >Dismiss</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Task Due Today Popup */}
            {taskDuePopup && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={() => {
                        if (taskDueQueue.length > 0) {
                            setTaskDuePopup(taskDueQueue[0]);
                            setTaskDueQueue(prev => prev.slice(1));
                        } else {
                            setTaskDuePopup(null);
                        }
                    }}
                >
                    <div style={{ background: '#ffffff', borderRadius: '16px', padding: '0', width: '440px', maxWidth: '90vw', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden', animation: 'slideUp 0.25s ease' }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Red header */}
                        <div style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', padding: '1.125rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.375rem', flexShrink: 0 }}>⏰</div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '800', fontSize: '1rem', color: '#ffffff', letterSpacing: '-0.01em' }}>Task Due Today</div>
                                <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)', fontWeight: '500', marginTop: '1px' }}>
                                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                    {taskDueQueue.length > 0 && <span style={{ marginLeft: '0.5rem', background: 'rgba(255,255,255,0.25)', padding: '0.1rem 0.4rem', borderRadius: '999px', fontSize: '0.6875rem', fontWeight: '700' }}>+{taskDueQueue.length} more</span>}
                                </div>
                            </div>
                        </div>

                        {/* Body */}
                        <div style={{ padding: '1.375rem 1.5rem' }}>
                            <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#1e293b', marginBottom: '1rem', lineHeight: '1.3' }}>
                                {taskDuePopup.title}
                            </div>

                            {/* Detail rows */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.25rem' }}>
                                {taskDuePopup.type && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                        <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: '60px', flexShrink: 0 }}>Type</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b', background: '#f1f5f9', padding: '0.2rem 0.625rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>{taskDuePopup.type}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                    <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: '60px', flexShrink: 0 }}>Due</span>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#dc2626', background: '#fef2f2', padding: '0.2rem 0.625rem', borderRadius: '6px', border: '1px solid #fecaca' }}>
                                        {new Date(taskDuePopup.dueDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                        {taskDuePopup.dueTime && <span style={{ marginLeft: '0.375rem' }}>at {taskDuePopup.dueTime}</span>}
                                    </span>
                                </div>
                                {taskDuePopup.assignedTo && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                        <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: '60px', flexShrink: 0 }}>Assigned</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{taskDuePopup.assignedTo}</span>
                                    </div>
                                )}
                                {taskDuePopup.account && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                        <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', width: '60px', flexShrink: 0 }}>Account</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{taskDuePopup.account}</span>
                                    </div>
                                )}
                                {taskDuePopup.notes && (
                                    <div style={{ marginTop: '0.25rem', fontSize: '0.8125rem', color: '#475569', background: '#f8fafc', borderRadius: '8px', padding: '0.625rem 0.75rem', border: '1px solid #e2e8f0', lineHeight: '1.5' }}>
                                        {taskDuePopup.notes}
                                    </div>
                                )}
                            </div>

                            {/* Snooze selector */}
                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.875rem', padding:'0.5rem 0.75rem', background:'#f8fafc', borderRadius:'8px', border:'1px solid #e2e8f0' }}>
                                <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', flexShrink:0 }}>Snooze</span>
                                <select value={taskDueSnoozeH} onChange={e => setTaskDueSnoozeH(Number(e.target.value))}
                                    style={{ padding:'3px 6px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', color:'#1e293b', background:'#fff' }}>
                                    {[0,1,2,3,4,5,6,8,12,24].map(h => <option key={h} value={h}>{h}h</option>)}
                                </select>
                                <select value={taskDueSnoozeM} onChange={e => setTaskDueSnoozeM(Number(e.target.value))}
                                    style={{ padding:'3px 6px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', color:'#1e293b', background:'#fff' }}>
                                    {[0,5,10,15,20,30,45].map(m => <option key={m} value={m}>{m}m</option>)}
                                </select>
                                <button onClick={() => {
                                        const task = taskDuePopup;
                                        const ms = (taskDueSnoozeH * 60 + taskDueSnoozeM) * 60 * 1000;
                                        if (ms <= 0) return;
                                        if (taskDueQueue.length > 0) { setTaskDuePopup(taskDueQueue[0]); setTaskDueQueue(prev => prev.slice(1)); } else { setTaskDuePopup(null); }
                                        setTimeout(() => setTaskDuePopup(task), ms);
                                    }}
                                    style={{ padding:'4px 14px', background:'#f59e0b', color:'#fff', border:'none', borderRadius:'6px', fontWeight:'700', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>
                                    Snooze
                                </button>
                            </div>

                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                                <button
                                    onClick={() => {
                                        const task = taskDuePopup;
                                        if (taskDueQueue.length > 0) {
                                            setTaskDuePopup(taskDueQueue[0]);
                                            setTaskDueQueue(prev => prev.slice(1));
                                        } else {
                                            setTaskDuePopup(null);
                                        }
                                        setActiveTab('tasks');
                                        setTimeout(() => { setEditingTask(task); setShowTaskModal(true); }, 150);
                                    }}
                                    style={{ flex: 1, padding: '0.7rem 1rem', background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(220,38,38,0.3)' }}
                                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(220,38,38,0.45)'}
                                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(220,38,38,0.3)'}
                                >Open Task</button>
                                <button
                                    onClick={() => {
                                        if (taskDueQueue.length > 0) {
                                            setTaskDuePopup(taskDueQueue[0]);
                                            setTaskDueQueue(prev => prev.slice(1));
                                        } else {
                                            setTaskDuePopup(null);
                                        }
                                    }}
                                    style={{ flex: 1, padding: '0.7rem 1rem', background: '#ffffff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#f8fafc'; e.currentTarget.style.color = '#475569'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.color = '#64748b'; }}
                                >{taskDueQueue.length > 0 ? `Dismiss · Next (${taskDueQueue.length})` : 'Dismiss'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ SPIFF CLAIM MODAL ════ */}
            {showSpiffClaimModal && spiffClaimContext && (() => {
                const { opp } = spiffClaimContext;
                const activeSpiffsList = (settings.spiffs||[]).filter(s => s.active);
                const existingClaims = spiffClaims.filter(c => c.opportunityId === opp.id);
                const claimedSpiffIds = new Set(existingClaims.map(c => c.spiffId));
                const claimableSpiffs = activeSpiffsList.filter(s => !claimedSpiffIds.has(s.id));
                const dealArr = parseFloat(opp.arr) || 0;
                const calcClaimAmt = (spiff) => {
                    const amt = parseFloat(spiff.amount) || 0;
                    if (spiff.type === 'flat') return amt;
                    if (spiff.type === 'pct') return dealArr * amt / 100;
                    return 0; // multiplier shown separately
                };
                return (
                <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:10100, display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
                    onClick={() => setShowSpiffClaimModal(false)}>
                    <div style={{ background:'#fff', borderRadius:'14px', padding:'1.5rem', width:'100%', maxWidth:'480px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1rem' }}>
                            <div>
                                <div style={{ fontWeight:'800', fontSize:'1rem', color:'#1e293b' }}>⚡ Claim SPIFF</div>
                                <div style={{ fontSize:'0.75rem', color:'#64748b', marginTop:'2px' }}>{opp.opportunityName || opp.account} · ${dealArr.toLocaleString()} ARR</div>
                            </div>
                            <button onClick={() => setShowSpiffClaimModal(false)} style={{ background:'none', border:'none', fontSize:'1.25rem', color:'#94a3b8', cursor:'pointer', lineHeight:1 }}>×</button>
                        </div>

                        {existingClaims.length > 0 && (
                            <div style={{ marginBottom:'1rem' }}>
                                <div style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.375rem' }}>Already Claimed</div>
                                {existingClaims.map(c => {
                                    const sp = activeSpiffsList.find(s => s.id === c.spiffId) || {};
                                    return (
                                        <div key={c.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.5rem 0.75rem', background:'#f8fafc', borderRadius:'6px', marginBottom:'4px', fontSize:'0.8125rem' }}>
                                            <span style={{ fontWeight:'600', color:'#1e293b' }}>{sp.name || 'SPIFF'}</span>
                                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                                <span style={{ fontWeight:'700', color:'#059669' }}>${Math.round(c.amount).toLocaleString()}</span>
                                                <span style={{ fontSize:'0.625rem', padding:'2px 6px', borderRadius:'999px', fontWeight:'700',
                                                    background: c.status==='approved'?'#d1fae5':c.status==='rejected'?'#fee2e2':c.status==='paid'?'#dbeafe':'#fef3c7',
                                                    color: c.status==='approved'?'#065f46':c.status==='rejected'?'#dc2626':c.status==='paid'?'#1e40af':'#92400e' }}>
                                                    {c.status.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {claimableSpiffs.length === 0 ? (
                            <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.875rem', background:'#f8fafc', borderRadius:'8px' }}>
                                All active SPIFFs have already been claimed for this deal.
                            </div>
                        ) : (
                            <div>
                                <div style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'0.5rem' }}>Select SPIFFs to Claim</div>
                                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem', maxHeight:'300px', overflowY:'auto' }}>
                                    {claimableSpiffs.map(spiff => {
                                        const estAmt = calcClaimAmt(spiff);
                                        return (
                                            <div key={spiff.id} style={{ border:'1px solid #e2e8f0', borderRadius:'8px', padding:'0.75rem', background:'#fff' }}>
                                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.375rem' }}>
                                                    <div style={{ fontWeight:'600', fontSize:'0.875rem', color:'#1e293b' }}>{spiff.name || 'Unnamed SPIFF'}</div>
                                                    <div style={{ fontWeight:'700', color:'#7c3aed', fontSize:'0.875rem' }}>
                                                        {spiff.type === 'multiplier' ? `${spiff.amount}× multiplier` : `$${Math.round(estAmt).toLocaleString()}`}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginBottom:'0.625rem' }}>
                                                    {spiff.type==='flat'?`$${parseFloat(spiff.amount||0).toLocaleString()} flat bonus`:spiff.type==='pct'?`${spiff.amount}% of deal ARR`:`Commission multiplier ${spiff.amount}×`}
                                                    {spiff.condition && <span> · {spiff.condition}</span>}
                                                </div>
                                                <button onClick={() => {
                                                    const newClaim = {
                                                        id: 'claim_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
                                                        spiffId: spiff.id,
                                                        spiffName: spiff.name || 'Unnamed SPIFF',
                                                        opportunityId: opp.id,
                                                        opportunityName: opp.opportunityName || opp.account,
                                                        account: opp.account,
                                                        repName: opp.salesRep || opp.assignedTo || currentUser,
                                                        amount: spiff.type === 'multiplier' ? 0 : Math.round(estAmt),
                                                        multiplier: spiff.type === 'multiplier' ? parseFloat(spiff.amount)||1 : null,
                                                        spiffType: spiff.type,
                                                        dealArr,
                                                        status: 'pending',
                                                        claimedAt: new Date().toISOString(),
                                                        approvedAt: null,
                                                        approvedBy: null,
                                                        paidAt: null,
                                                        note: '',
                                                    };
                                                    setSpiffClaims(prev => [...prev, newClaim]);
                                                }}
                                                style={{ width:'100%', padding:'0.375rem', background:'#7c3aed', color:'#fff', border:'none', borderRadius:'6px', fontSize:'0.75rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>
                                                    Submit Claim
                                                </button>
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

            {/* ════ QUICK-LOG FLOATING BUTTON (home, pipeline, opportunities tabs) ════ */}
            {(activeTab === 'pipeline' || activeTab === 'home' || activeTab === 'opportunities') && (
                <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9990, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                    {quickLogOpen && (
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', padding: '1rem', width: '300px', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}
                            onClick={e => e.stopPropagation()}>
                            <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0f172a' }}>⚡ Quick Log Activity</div>

                            {/* Activity type pills */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
                                {['Call','Email','Meeting','Demo','Follow-up','Note'].map(t => (
                                    <button key={t} onClick={() => setQuickLogForm(f => ({ ...f, type: t }))}
                                        style={{ padding: '0.3rem 0.25rem', borderRadius: '6px', border: '1px solid ' + (quickLogForm.type === t ? '#2563eb' : '#e2e8f0'), background: quickLogForm.type === t ? '#eff6ff' : '#f8fafc', color: quickLogForm.type === t ? '#2563eb' : '#64748b', fontSize: '0.6875rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                        {quickLogForm.type === t ? '✓ ' : ''}{t}
                                    </button>
                                ))}
                            </div>

                            {/* Contact typeahead */}
                            <div style={{ position: 'relative' }}>
                                <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Contact</div>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <input
                                        value={quickLogForm.contactSearch}
                                        onChange={e => {
                                            const q = e.target.value;
                                            setQuickLogForm(f => ({ ...f, contactSearch: q, contactId: '' }));
                                            if (q.trim().length < 1) { setQuickLogContactResults([]); return; }
                                            const ql = q.toLowerCase();
                                            const matches = (contacts || []).filter(c =>
                                                ((c.firstName || '') + ' ' + (c.lastName || '')).toLowerCase().includes(ql) ||
                                                (c.company || '').toLowerCase().includes(ql) ||
                                                (c.email || '').toLowerCase().includes(ql)
                                            ).slice(0, 6);
                                            setQuickLogContactResults(matches);
                                        }}
                                        onFocus={e => {
                                            if (quickLogForm.contactSearch.trim().length > 0 && quickLogContactResults.length === 0) {
                                                const ql = quickLogForm.contactSearch.toLowerCase();
                                                setQuickLogContactResults((contacts || []).filter(c =>
                                                    ((c.firstName || '') + ' ' + (c.lastName || '')).toLowerCase().includes(ql) ||
                                                    (c.company || '').toLowerCase().includes(ql)
                                                ).slice(0, 6));
                                            }
                                        }}
                                        placeholder="Search contacts…"
                                        style={{ width: '100%', fontSize: '0.75rem', border: '1px solid ' + (quickLogForm.contactId ? '#10b981' : '#e2e8f0'), borderRadius: '6px', padding: '0.35rem 1.75rem 0.35rem 0.5rem', background: quickLogForm.contactId ? '#f0fdf4' : '#f8fafc', color: '#1e293b', fontFamily: 'inherit', outline: 'none' }}
                                    />
                                    {quickLogForm.contactId ? (
                                        <button onClick={() => { setQuickLogForm(f => ({ ...f, contactId: '', contactSearch: '' })); setQuickLogContactResults([]); }}
                                            style={{ position: 'absolute', right: '0.375rem', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1, padding: '0.1rem' }}>×</button>
                                    ) : quickLogForm.contactSearch.length > 0 ? (
                                        <button onClick={() => { setQuickLogForm(f => ({ ...f, contactSearch: '' })); setQuickLogContactResults([]); }}
                                            style={{ position: 'absolute', right: '0.375rem', background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '0.875rem', lineHeight: 1, padding: '0.1rem' }}>×</button>
                                    ) : (
                                        <span style={{ position: 'absolute', right: '0.5rem', color: '#cbd5e1', fontSize: '0.7rem', pointerEvents: 'none' }}>👤</span>
                                    )}
                                </div>
                                {/* Dropdown results */}
                                {quickLogContactResults.length > 0 && !quickLogForm.contactId && (
                                    <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 10, overflow: 'hidden' }}>
                                        {quickLogContactResults.map((c, idx) => {
                                            const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
                                            const sub = [c.title, c.company].filter(Boolean).join(' · ');
                                            return (
                                                <div key={c.id}
                                                    onClick={() => {
                                                        setQuickLogForm(f => ({ ...f, contactId: c.id, contactSearch: fullName }));
                                                        setQuickLogContactResults([]);
                                                    }}
                                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: idx < quickLogContactResults.length - 1 ? '1px solid #f1f5f9' : 'none', background: '#fff' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                    <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#1e293b' }}>{fullName || '—'}</div>
                                                    {sub && <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.1rem' }}>{sub}</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {/* No results hint */}
                                {quickLogForm.contactSearch.length > 1 && quickLogContactResults.length === 0 && !quickLogForm.contactId && (
                                    <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.5rem 0.75rem', fontSize: '0.75rem', color: '#94a3b8', zIndex: 10 }}>
                                        No contacts found
                                    </div>
                                )}
                            </div>

                            {/* Link to deal */}
                            <div>
                                <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Deal</div>
                                <select value={quickLogForm.opportunityId} onChange={e => setQuickLogForm(f => ({ ...f, opportunityId: e.target.value }))}
                                    style={{ width: '100%', fontSize: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.35rem 0.5rem', background: '#f8fafc', color: '#1e293b', fontFamily: 'inherit' }}>
                                    <option value="">— Link to deal (optional) —</option>
                                    {(visibleOpportunities || []).filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').map(o => <option key={o.id} value={o.id}>{o.opportunityName || o.account}</option>)}
                                </select>
                            </div>

                            {/* Notes */}
                            <textarea value={quickLogForm.notes} onChange={e => setQuickLogForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="Notes…" rows={2}
                                style={{ fontSize: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.35rem 0.5rem', background: '#f8fafc', color: '#1e293b', fontFamily: 'inherit', resize: 'none' }} />

                            {/* Add to Calendar */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0', borderTop: '1px solid #f1f5f9' }}>
                                <input
                                    type="checkbox"
                                    id="quickLogCal"
                                    checked={!!quickLogForm.addToCalendar}
                                    onChange={e => setQuickLogForm(f => ({ ...f, addToCalendar: e.target.checked }))}
                                    style={{ width: '14px', height: '14px', accentColor: '#2563eb', cursor: 'pointer', flexShrink: 0 }}
                                />
                                <label htmlFor="quickLogCal" style={{ fontSize: '0.6875rem', fontWeight: '600', color: '#475569', cursor: 'pointer', userSelect: 'none' }}>
                                    📅 Add to Google Calendar
                                </label>
                            </div>

                            {/* Actions */}
                            <div style={{ display: 'flex', gap: '0.375rem' }}>
                                <button onClick={() => { setQuickLogOpen(false); setQuickLogForm({ type: 'Call', notes: '', opportunityId: '', contactId: '', contactSearch: '', addToCalendar: false }); setQuickLogContactResults([]); }}
                                    style={{ flex: 1, padding: '0.35rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Cancel
                                </button>
                                <button onClick={() => {
                                    const linkedOpp = quickLogForm.opportunityId ? (opportunities || []).find(o => o.id === quickLogForm.opportunityId) : null;
                                    handleSaveActivity({
                                        type: quickLogForm.type,
                                        notes: quickLogForm.notes,
                                        date: [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'),
                                        opportunityId: quickLogForm.opportunityId || null,
                                        opportunityName: linkedOpp?.opportunityName || linkedOpp?.account || '',
                                        companyName: linkedOpp?.account || '',
                                        contactId: quickLogForm.contactId || null,
                                        contactName: quickLogForm.contactSearch || '',
                                        salesRep: currentUser,
                                        addToCalendar: !!quickLogForm.addToCalendar,
                                    }, { editingActivity: null, currentUser, opportunities, setShowActivityModal, setFollowUpPrompt, setQuickLogOpen, setQuickLogForm, setQuickLogContactResults });
                                }} style={{ flex: 1, padding: '0.35rem', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Save
                                </button>
                            </div>
                        </div>
                    )}
                    <button onClick={() => setQuickLogOpen(v => !v)}
                        style={{ width: '52px', height: '52px', borderRadius: '50%', background: quickLogOpen ? '#1d4ed8' : 'linear-gradient(135deg,#2563eb,#7c3aed)', color: '#fff', border: 'none', boxShadow: '0 4px 20px rgba(37,99,235,0.5)', fontSize: '1.375rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', lineHeight: '1' }}
                        title="Quick-log an activity">
                        {quickLogOpen ? '✕' : '⚡'}
                    </button>
                </div>
            )}

            {/* ════ FOLLOW-UP TASK PROMPT (persists across tabs) ════ */}
            {followUpPrompt && (
                <div style={{ position: 'fixed', bottom: '5.5rem', right: '1.5rem', zIndex: 9991, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)', padding: '1rem', width: '260px' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#0f172a', marginBottom: '0.375rem' }}>✅ Activity logged!</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '0.75rem' }}>Create a follow-up task for <strong>{followUpPrompt.opportunityName}</strong>?</div>
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                        <button onClick={() => setFollowUpPrompt(null)}
                            style={{ flex: 1, padding: '0.35rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Skip
                        </button>
                        <button onClick={() => {
                            setEditingTask({ relatedTo: followUpPrompt.opportunityId, opportunityId: followUpPrompt.opportunityId, type: 'Follow-up', dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0] });
                            setShowTaskModal(true);
                            setFollowUpPrompt(null);
                        }} style={{ flex: 1, padding: '0.35rem', borderRadius: '6px', border: 'none', background: '#2563eb', color: '#fff', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                            + Add Task
                        </button>
                    </div>
                </div>
            )}

        </div>
        </AppProvider>
    );

    );
}
