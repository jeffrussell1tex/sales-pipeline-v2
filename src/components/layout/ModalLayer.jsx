import React from 'react';
import { useApp } from '../../AppContext';
import { dbFetch } from '../../utils/storage';
import OpportunityModal from '../modals/OpportunityModal';
import ContactModal from '../modals/ContactModal';
import AccountModal from '../modals/AccountModal';
import TaskModal from '../modals/TaskModal';
import UserModal from '../modals/UserModal';
import ActivityModal from '../modals/ActivityModal';
import CsvImportModal from '../modals/CsvImportModal';
import OutlookImportModal from '../modals/OutlookImportModal';
import LeadImportModal from '../modals/LeadImportModal';
import LostReasonModal from '../modals/LostReasonModal';
import ViewingContactPanel from '../panels/ViewingContactPanel';
import ViewingAccountPanel from '../panels/ViewingAccountPanel';
import ViewingTaskPanel from '../panels/ViewingTaskPanel';

export default function ModalLayer() {
    const {
        showModal, setShowModal, editingOpp, setEditingOpp,
        oppModalError, setOppModalError, oppModalSaving, setOppModalSaving,
        showAccountModal, setShowAccountModal, editingAccount, setEditingAccount,
        editingSubAccount, setEditingSubAccount,
        accountModalError, setAccountModalError, accountModalSaving, setAccountModalSaving,
        accountCreatedFromOppForm, setAccountCreatedFromOppForm,
        lastCreatedAccountName, setLastCreatedAccountName,
        lastCreatedRepName, setLastCreatedRepName,
        parentAccountForSub, setParentAccountForSub,
        showContactModal, setShowContactModal, editingContact, setEditingContact,
        contactModalError, setContactModalError, contactModalSaving, setContactModalSaving,
        showTaskModal, setShowTaskModal, editingTask, setEditingTask,
        taskModalError, setTaskModalError, taskModalSaving, setTaskModalSaving,
        showUserModal, setShowUserModal, editingUser, setEditingUser,
        userModalError, setUserModalError, userModalSaving, setUserModalSaving, handleSaveUser,
        showActivityModal, setShowActivityModal, editingActivity, setEditingActivity,
        activityInitialContext, setActivityInitialContext,
        activityModalError, setActivityModalError, activityModalSaving, setActivityModalSaving,
        showCsvImportModal, setShowCsvImportModal, csvImportType,
        showLeadImportModal, setShowLeadImportModal,
        showOutlookImportModal, setShowOutlookImportModal,
        showSpiffClaimModal, setShowSpiffClaimModal, spiffClaimContext, setSpiffClaimContext,
        confirmModal, setConfirmModal,
        lostReasonModal, setLostReasonModal, completeLostSave,
        notesPopover, setNotesPopover,
        undoToast, setUndoToast,
        taskReminderPopup, setTaskReminderPopup,
        taskReminderSnoozeH, setTaskReminderSnoozeH, taskReminderSnoozeM, setTaskReminderSnoozeM,
        taskDuePopup, setTaskDuePopup,
        taskDueQueue, setTaskDueQueue,
        taskDueSnoozeH, setTaskDueSnoozeH, taskDueSnoozeM, setTaskDueSnoozeM,
        showShortcuts, setShowShortcuts,
        pendingOppFormData, setPendingOppFormData,
        followUpPrompt, setFollowUpPrompt,
        quickLogOpen, setQuickLogOpen, quickLogForm, setQuickLogForm,
        quickLogContactResults, setQuickLogContactResults,
        // Data
        opportunities, setOpportunities, accounts, setAccounts,
        contacts, setContacts, tasks, setTasks, activities, setActivities,
        leads, setLeads, settings, currentUser, stages, allPipelines, activePipeline,
        spiffClaims, setSpiffClaims,
        handleSave, handleSaveAccount, handleSaveContact, handleSaveTask, handleSaveActivity,
        handleDeleteActivity, handleDeleteTask, handleCompleteTask,
        addAudit, softDelete, showConfirm, loadOpportunities, loadAccounts,
        loadContacts, loadTasks, loadActivities,
        setActiveTab, activeTab,
        viewingContact, setViewingContact, viewingAccount, setViewingAccount,
        viewingTask, setViewingTask,
        isMobile,
    } = useApp();

    return (
        <>
            {showModal && (
                <OpportunityModal
                    opportunity={editingOpp}
                    accounts={accounts}
                    contacts={contacts}
                    settings={settings}
                    pipelines={allPipelines}
                    activePipelineId={activePipeline.id}
                    currentUser={currentUser}
                    activities={activities}
                    onSaveActivity={(activityData) => {
                        const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                        setActivities(prev => [...prev, { ...activityData, id: newId, createdAt: new Date().toISOString(), author: currentUser || '' }]);
                    }}
                    onDeleteActivity={(activityId) => {
                        setActivities(prev => prev.filter(a => a.id !== activityId));
                    }}
                    onSaveComment={(oppId, comment) => {
                        setOpportunities(prev => {
                            const updated = prev.map(o =>
                                o.id === oppId ? { ...o, comments: [...(o.comments || []), comment] } : o
                            );
                            setEditingOpp(updated.find(o => o.id === oppId) || null);
                            return updated;
                        });
                    }}
                    onEditComment={(oppId, commentId, newText) => {
                        setOpportunities(prev => {
                            const updated = prev.map(o =>
                                o.id === oppId ? { ...o, comments: (o.comments || []).map(c =>
                                    c.id === commentId ? { ...c, text: newText, edited: true, editedAt: new Date().toISOString() } : c
                                )} : o
                            );
                            setEditingOpp(updated.find(o => o.id === oppId) || null);
                            return updated;
                        });
                    }}
                    onDeleteComment={(oppId, commentId) => {
                        setOpportunities(prev => {
                            const updated = prev.map(o =>
                                o.id === oppId ? { ...o, comments: (o.comments || []).filter(c => c.id !== commentId) } : o
                            );
                            setEditingOpp(updated.find(o => o.id === oppId) || null);
                            return updated;
                        });
                    }}
                    onClose={() => { setShowModal(false); setOppModalError(null); setOppModalSaving(false); }}
                    onDismissError={() => setOppModalError(null)}
                    onSave={(formData) => handleSave(formData, editingOpp, activePipeline, currentUser, setShowModal, setLostReasonModal)}
                    errorMessage={oppModalError}
                    saving={oppModalSaving}
                    onAddAccount={handleAddAccountFromOpportunity}
                    lastCreatedAccountName={lastCreatedAccountName}
                    lastCreatedRepName={lastCreatedRepName}
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
                    onAddRep={() => {
                        setShowUserModal(true);
                        setEditingUser(null);
                    }}
                />
            )}

            {showAccountModal && (
                <AccountModal
                    account={editingAccount || editingSubAccount}
                    isSubAccount={!!parentAccountForSub || !!editingSubAccount}
                    parentTier={parentAccountForSub?.accountTier || (parentAccountForSub?.parentAccountId ? 'business_unit' : parentAccountForSub ? 'account' : null)}
                    settings={settings}
                    onClose={() => { setShowAccountModal(false); setAccountModalError(null); setAccountModalSaving(false); }}
                    onDismissError={() => setAccountModalError(null)}
                    onSave={(formData) => handleSaveAccount(formData, { editingAccount, editingSubAccount, parentAccountForSub, accountCreatedFromOppForm, pendingOppFormData, setShowAccountModal, setLastCreatedAccountName, setEditingOpp, setShowModal, setAccountCreatedFromOppForm, setPendingOppFormData })}
                    onAddRep={() => { setShowUserModal(true); setEditingUser(null); }}
                    existingAccounts={accounts}
                    errorMessage={accountModalError}
                    saving={accountModalSaving}
                />
            )}

            {showUserModal && (
                <UserModal
                    user={editingUser}
                    settings={settings}
                    onClose={() => { setShowUserModal(false); setUserModalError(null); setUserModalSaving(false); }}
                    onDismissError={() => setUserModalError(null)}
                    onSave={handleSaveUser}
                    errorMessage={userModalError}
                    saving={userModalSaving}
                />
            )}

            {showTaskModal && (
                <TaskModal
                    task={editingTask}
                    taskTypes={settings.taskTypes || ['Call', 'Meeting', 'Email']}
                    opportunities={opportunities}
                    accounts={accounts}
                    contacts={contacts}
                    settings={settings}
                    onClose={() => { setShowTaskModal(false); setTaskModalError(null); setTaskModalSaving(false); }}
                    onDismissError={() => setTaskModalError(null)}
                    onSave={(taskData) => handleSaveTask(taskData, { editingTask, setShowTaskModal, opportunities })}
                    errorMessage={taskModalError}
                    saving={taskModalSaving}
                    onAddTaskType={handleAddTaskType}
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
                    onAddOpportunity={() => {
                        setShowModal(true);
                        setEditingOpp(null);
                    }}
                    onAddContact={() => {
                        setShowContactModal(true);
                        setEditingContact(null);
                    }}
                    onAddAccount={() => {
                        setShowAccountModal(true);
                        setEditingAccount(null);
                    }}
                />
            )}

            <ViewingTaskPanel
                    setEditingTask={setEditingTask} setShowTaskModal={setShowTaskModal}
                    setEditingOpp={setEditingOpp} setShowModal={setShowModal}
                    setEditingContact={setEditingContact} setShowContactModal={setShowContactModal}
                    setEditingAccount={setEditingAccount} setEditingSubAccount={setEditingSubAccount} setShowAccountModal={setShowAccountModal}
                    setEditingActivity={setEditingActivity} setShowActivityModal={setShowActivityModal} setActivityInitialContext={setActivityInitialContext}
                />

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

            <ViewingAccountPanel
                    setEditingOpp={setEditingOpp} setShowModal={setShowModal}
                    setEditingContact={setEditingContact} setShowContactModal={setShowContactModal}
                    setEditingAccount={setEditingAccount} setEditingSubAccount={setEditingSubAccount} setShowAccountModal={setShowAccountModal}
                    setEditingTask={setEditingTask} setShowTaskModal={setShowTaskModal}
                    setEditingActivity={setEditingActivity} setShowActivityModal={setShowActivityModal} setActivityInitialContext={setActivityInitialContext}
                    setShowSpiffClaimModal={setShowSpiffClaimModal} setSpiffClaimContext={setSpiffClaimContext}
                    setShowCsvImportModal={setShowCsvImportModal} setShowLeadImportModal={setShowLeadImportModal} setShowOutlookImportModal={setShowOutlookImportModal}
                    setShowShortcuts={setShowShortcuts}
                />

            <ViewingContactPanel
                    setEditingOpp={setEditingOpp} setShowModal={setShowModal}
                    setEditingContact={setEditingContact} setShowContactModal={setShowContactModal}
                    setEditingAccount={setEditingAccount} setEditingSubAccount={setEditingSubAccount} setShowAccountModal={setShowAccountModal}
                    setEditingTask={setEditingTask} setShowTaskModal={setShowTaskModal}
                    setEditingActivity={setEditingActivity} setShowActivityModal={setShowActivityModal} setActivityInitialContext={setActivityInitialContext}
                    setShowSpiffClaimModal={setShowSpiffClaimModal} setSpiffClaimContext={setSpiffClaimContext}
                />

            {/* Notes Popover */}
            {/* ── Keyboard Shortcuts Overlay ───────────────────────── */}
            {showShortcuts && (
                <div onClick={() => setShowShortcuts(false)} style={{
                    position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 9998,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    backdropFilter: 'blur(2px)', animation: 'fadeIn 0.15s ease'
                }}>
                    <div onClick={e => e.stopPropagation()} style={{
                        background: '#fff', borderRadius: isMobile ? '0' : '16px', width: isMobile ? '100%' : '540px', maxWidth: isMobile ? '100%' : '95vw', height: isMobile ? '100%' : 'auto',
                        maxHeight: isMobile ? '100%' : '85vh', overflowY: 'auto',
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
                    minWidth: isMobile ? 'calc(100vw - 2rem)' : '320px', maxWidth: isMobile ? 'calc(100vw - 2rem)' : '480px' }}>
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
                        <div style={{ position: 'fixed', top, left, zIndex: 999, background: '#fff', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)', border: '1px solid #e2e8f0', width: isMobile ? 'calc(100vw - 2rem)' : '340px', maxHeight: '300px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
                        // Lower concurrency to avoid Neon connection limits with large imports
                        const CONCURRENCY = 3;   // max simultaneous DB calls
                        const BATCH_SIZE = 50;   // records processed per progress tick
                        const RETRY = 2;         // retry each record up to 2 times on failure
                        const DELAY_MS = 100;    // ms pause between batches

                        const saveOne = async (url, item, retriesLeft = RETRY) => {
                            try {
                                const r = await dbFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(item) });
                                if (!r || !r.ok) throw new Error('HTTP ' + (r?.status || 'no response'));
                                return true;
                            } catch (e) {
                                if (retriesLeft > 0) {
                                    await new Promise(res => setTimeout(res, 300));
                                    return saveOne(url, item, retriesLeft - 1);
                                }
                                return false;
                            }
                        };

                        const saveAll = async (url, items, progressOffset = 0, progressTotal = items.length) => {
                            let failed = 0, done = 0;
                            // Process in batches, each batch has limited concurrency
                            for (let i = 0; i < items.length; i += BATCH_SIZE) {
                                const batch = items.slice(i, i + BATCH_SIZE);
                                // Run batch with limited concurrency
                                const queue = [...batch];
                                const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
                                    while (queue.length > 0) {
                                        const item = queue.shift();
                                        const ok = await saveOne(url, item);
                                        if (!ok) failed++;
                                        done++;
                                        if (typeof window.__importProgressCb === 'function') {
                                            window.__importProgressCb(progressOffset + done, progressTotal);
                                        }
                                    }
                                });
                                await Promise.all(workers);
                                if (i + BATCH_SIZE < items.length) {
                                    await new Promise(res => setTimeout(res, DELAY_MS));
                                }
                            }
                            return failed;
                        };

                        const contactsWithIds = newContacts.map((c) => ({
                            ...c,
                            id: crypto.randomUUID(),
                            createdAt: new Date().toISOString()
                        }));

                        // Step 1: Auto-add new companies to accounts first
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
                            await saveAll('/.netlify/functions/accounts', newAccts);
                        }

                        // Step 2: Save contacts
                        setContacts(prev => [...prev, ...contactsWithIds]);
                        const contactsFailed = await saveAll('/.netlify/functions/contacts', contactsWithIds, 0, contactsWithIds.length);
                        if (contactsFailed > 0) {
                            throw new Error(`${contactsFailed} of ${contactsWithIds.length} contacts failed to save. The rest imported successfully — try re-importing the failed records.`);
                        }
                    }}
                    onImportAccounts={async (newAccounts) => {
                        // Pass 1: parents (no parentAccount field)
                        const parents = newAccounts.filter(a => !a.parentAccount?.trim());
                        const parentsWithIds = parents.map(a => {
                            const { parentAccount: _drop, ...rest } = a;
                            return { ...rest, id: crypto.randomUUID(), parentAccountId: null };
                        });

                        // Pass 2: sub-accounts — resolve parentAccountId from parents
                        const subs = newAccounts.filter(a => a.parentAccount?.trim());
                        const allAccountsSoFar = [...accounts, ...parentsWithIds];
                        const subsWithIds = subs.map(a => {
                            const parentAccountId = allAccountsSoFar.find(
                                acc => acc.name?.toLowerCase() === a.parentAccount.toLowerCase()
                            )?.id || null;
                            const { parentAccount: _drop, ...rest } = a;
                            return { ...rest, id: crypto.randomUUID(), parentAccountId };
                        });

                        const allWithIds = [...parentsWithIds, ...subsWithIds];
                        if (allWithIds.length === 0) return;

                        // Optimistic UI update
                        setAccounts(prev => [...prev, ...allWithIds]);
                        if (typeof window.__importProgressCb === 'function') window.__importProgressCb(0, allWithIds.length);

                        // Single bulk POST — one auth check, one DB call
                        const r = await dbFetch('/.netlify/functions/accounts', {
                            method: 'POST',
                            body: JSON.stringify(allWithIds),
                        });
                        const result = await r.json();

                        if (typeof window.__importProgressCb === 'function') window.__importProgressCb(allWithIds.length, allWithIds.length);

                        if (!r.ok) throw new Error(result.error || 'Bulk import failed. Please try again.');

                        const insertedCount = result.inserted ?? result.accounts?.length ?? allWithIds.length;
                        const failedCount = allWithIds.length - insertedCount;
                        if (failedCount > 0) throw new Error(`${failedCount} of ${allWithIds.length} accounts failed to save. The rest imported successfully.`);
                    }}
                    onImportOpportunities={async (newOpps) => {
                        const today = new Date().toISOString().split('T')[0];
                        const activePipelineId = allPipelines?.[0]?.id || 'default';
                        const oppsWithIds = newOpps.map((o) => ({
                            id: crypto.randomUUID(),
                            pipelineId: activePipelineId,
                            opportunityName: o.opportunityName || o.account || 'Imported Deal',
                            account:              o.account              || '',
                            salesRep:             o.salesRep             || currentUser,
                            stage:                o.stage                || 'Qualification',
                            arr:                  parseFloat(o.arr)      || 0,
                            implementationCost:   parseFloat(o.implementationCost) || 0,
                            forecastedCloseDate:  o.forecastedCloseDate  || '',
                            products:             o.products             || '',
                            notes:                o.notes                || '',
                            nextSteps:            o.nextSteps            || '',
                            territory:            o.territory            || '',
                            vertical:             o.vertical             || '',
                            probability:          parseInt(o.probability) || null,
                            createdDate:          o.createdDate          || today,
                            createdBy:            currentUser,
                            stageHistory:         [],
                            comments:             [],
                            contactIds:           [],
                        }));

                        // Optimistic UI update
                        setOpportunities(prev => [...prev, ...oppsWithIds]);
                        if (typeof window.__importProgressCb === 'function') window.__importProgressCb(0, oppsWithIds.length);

                        // Single bulk POST
                        const r = await dbFetch('/.netlify/functions/opportunities', {
                            method: 'POST',
                            body: JSON.stringify(oppsWithIds),
                        });
                        const result = await r.json();

                        if (typeof window.__importProgressCb === 'function') window.__importProgressCb(oppsWithIds.length, oppsWithIds.length);

                        if (!r.ok) throw new Error(result.error || 'Bulk import failed. Please try again.');

                        const insertedCount = result.inserted ?? result.opportunities?.length ?? oppsWithIds.length;
                        const failedCount = oppsWithIds.length - insertedCount;
                        if (failedCount > 0) throw new Error(`${failedCount} of ${oppsWithIds.length} opportunities failed to save. The rest imported successfully.`);
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
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: isMobile ? 'calc(100vw - 2rem)' : '420px', width: '100%', padding: isMobile ? '1.25rem' : '2rem' }}>
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
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10000, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}
                    onClick={() => setTaskReminderPopup(null)}
                >
                    <div style={{ background: '#ffffff', borderRadius: isMobile ? '16px 16px 0 0' : '12px', padding: '0', width: isMobile ? '100%' : '420px', maxWidth: isMobile ? '100%' : '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}
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
                    <div style={{ background: '#ffffff', borderRadius: isMobile ? '16px 16px 0 0' : '16px', padding: '0', width: isMobile ? '100%' : '440px', maxWidth: isMobile ? '100%' : '90vw', boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden', animation: 'slideUp 0.25s ease' }}
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
                    <div style={{ background:'#fff', borderRadius: isMobile ? '16px 16px 0 0' : '14px', padding:'1.5rem', width:'100%', maxWidth: isMobile ? '100%' : '480px', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}
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
                                                <button onClick={async () => {
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
                                                    try {
                                                        const result = await dbFetch('/.netlify/functions/spiff-claims', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify(newClaim),
                                                        });
                                                        setSpiffClaims(prev => [...prev, result.spiffClaim || newClaim]);
                                                    } catch (err) {
                                                        console.error('Failed to submit SPIFF claim:', err.message);
                                                        setSpiffClaims(prev => [...prev, newClaim]); // optimistic fallback
                                                    }
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

        </>
    );
}
