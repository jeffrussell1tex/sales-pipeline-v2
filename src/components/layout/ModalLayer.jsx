import React from 'react';
import { useApp } from '../../AppContext';
import { dbFetch, dbWrite } from '../../utils/storage';
import { makeBulkClient } from '../../utils/bulkClient';
import { todayLocal } from '../../utils/dateLocal';
import { buildOpportunityRow } from '../../utils/importRows';
import {
    mergeReceipts, receiptFromInsert, receiptFromUpdate, isClean, ImportError,
} from '../../utils/importReceipt';
import OpportunityModal from '../modals/OpportunityModal';
import ContactRail from '../rails/ContactRail';
import AccountRail from '../rails/AccountRail';
import TaskRail from '../rails/TaskRail';
import UserModal from '../modals/UserModal';
import ActivityRail from '../rails/ActivityRail';
import DocumentRail from '../documents/DocumentRail';
import DocumentUploadRail from '../documents/DocumentUploadRail';
import DocumentLinkPicker from '../documents/DocumentLinkPicker';
import CsvImportModal from '../modals/CsvImportModal';
import OutlookImportModal from '../modals/OutlookImportModal';
import LeadImportModal from '../modals/LeadImportModal';
import LeadModal from '../modals/LeadModal';
import LostReasonModal from '../modals/LostReasonModal';
import MergeReviewModal from '../modals/MergeReviewModal';
import ContactMergeReviewModal from '../modals/ContactMergeReviewModal';
import { CoachingNoteDialogHost } from '../modals/CoachingNoteDialog';
// ViewingContactPanel and ViewingAccountPanel replaced by ContactRail and AccountRail

// Chunked bulk transport for the CSV importer.
//
// postNew and saveBulk used to live here, at module scope inside a file that
// imports React — so neither could be reached by `node --test`, and every
// property that makes them correct (chunk size, accumulation across chunks, the
// never-throw contract) is invisible in the return value. They now live in
// src/utils/bulkClient.js with an injected fetch, the same seam bulkInsert uses
// for its db client, and are pinned by tests/bulk-client.test.mjs.
//
// saveBulk is gone rather than renamed: it threw from inside its own loop, so a
// failure on chunk 3 discarded the counts from chunks 1 and 2 even though those
// rows were already written server-side. 18b15 forbids exactly that for postNew;
// it was live in the PUT half. putBulk returns instead, and returns appliedIds.
const bulk = makeBulkClient(dbFetch);

// Progress is a module-level callback because CsvImportModal owns the bar and
// ModalLayer owns the requests. Unchanged in behaviour, named once here.
const onProgress = (done, total) => {
    if (typeof window.__importProgressCb === 'function') window.__importProgressCb(done, total);
};

// Apply an overwrite to local state for EXACTLY the ids the server accepted.
//
// Every overwrite path used to do setX(...) and THEN await the request, so the
// UI showed edits that may never have been written — the same defect 18b15 fixed
// on the new-record paths, left in place on the overwrite ones. appliedIds is
// (sent - notFound - forbidden), derived per chunk, with any chunk whose count
// disagrees with its own id lists excluded rather than guessed at.
const applyOverwrites = (setter, rows, appliedIds) => {
    if (!appliedIds.length) return;
    const byId = new Map(rows.filter(r => appliedIds.includes(r.id)).map(r => [r.id, r]));
    if (byId.size === 0) return;
    setter(prev => prev.map(existing => {
        const ow = byId.get(existing.id);
        return ow ? { ...existing, ...ow } : existing;
    }));
};

// Every handler ends the same way: hand the modal a receipt it can render from,
// or throw one it can read fields off. Never a sentence to be parsed back.
const settle = (receipt, noun) => {
    if (!isClean(receipt)) throw new ImportError(receipt, noun);
    return receipt;
};

export default function ModalLayer() {
    // Claim submit state lives here: the SPIFF modal below is an IIFE,
    // not a component, so it cannot own hooks.
    const [spiffClaimError, setSpiffClaimError] = React.useState(null);
    const [spiffClaimBusy, setSpiffClaimBusy] = React.useState(null);
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
        contactRailId, setContactRailId, contactRailMode, setContactRailMode,
        accountRailId, setAccountRailId, accountRailMode, setAccountRailMode,
        railStack, setRailStack,
        showTaskModal, setShowTaskModal, editingTask, setEditingTask,
        taskModalError, setTaskModalError, taskModalSaving, setTaskModalSaving,
        taskRailId, setTaskRailId, taskRailMode, setTaskRailMode,
        showUserModal, setShowUserModal, editingUser, setEditingUser,
        userModalError, setUserModalError, userModalSaving, setUserModalSaving, handleSaveUser,
        showActivityModal, setShowActivityModal, editingActivity, setEditingActivity,
        activityInitialContext, setActivityInitialContext,
        activityModalError, setActivityModalError, activityModalSaving, setActivityModalSaving,
        showCsvImportModal, setShowCsvImportModal, csvImportType,
        showLeadImportModal, setShowLeadImportModal,
        showLeadModal, setShowLeadModal,
        showOutlookImportModal, setShowOutlookImportModal,
        showSpiffClaimModal, setShowSpiffClaimModal, spiffClaimContext, setSpiffClaimContext,
        confirmModal, setConfirmModal,
        promptModal, setPromptModal,
        blockedDeleteModal, setBlockedDeleteModal,
        lostReasonModal, setLostReasonModal, completeLostSave,
        notesPopover, setNotesPopover,
        undoToast, setUndoToast,
        taskReminderPopup, setTaskReminderPopup,
        taskReminderSnoozeH, setTaskReminderSnoozeH, taskReminderSnoozeM, setTaskReminderSnoozeM,
        taskDuePopup, setTaskDuePopup,
        taskDueQueue, setTaskDueQueue,
        taskDueSnoozeH, setTaskDueSnoozeH, taskDueSnoozeM, setTaskDueSnoozeM,
        dismissedDueTodayAlerts, setDismissedDueTodayAlerts,
        snoozedDueAlerts, setSnoozedDueAlerts,
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
        handleAddAccountFromOpportunity, handleAddTaskType,
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
                    tasks={tasks}
                    onSaveActivity={(activityData) => {
                        const newId = 'id_' + crypto.randomUUID();
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
                    onClose={() => { document.activeElement?.blur(); setShowModal(false); setOppModalError(null); setOppModalSaving(false); }}
                    onDismissError={() => setOppModalError(null)}
                    onSave={(formData) => handleSave(formData, editingOpp, activePipeline, currentUser, setShowModal, setLostReasonModal)}
                    errorMessage={oppModalError}
                    saving={oppModalSaving}
                    onAddAccount={handleAddAccountFromOpportunity}
                    lastCreatedAccountName={lastCreatedAccountName}
                    lastCreatedRepName={lastCreatedRepName}
                    onSaveNewContact={(data) => {
                        const newId = 'id_' + crypto.randomUUID();
                        const nc = { ...data, id: newId, createdAt: new Date().toISOString() };
                        setContacts(prev => [...prev, nc]);
                        // Inline-created contacts get attached to whatever record the
                        // picker belongs to. A rejected POST used to leave a contact
                        // that exists only in this tab's state — it looks saved,
                        // links fine, and is gone on reload along with the link.
                        dbWrite('/.netlify/functions/contacts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(nc)
                        }).then(r => {
                            if (r.ok) return;
                            setContacts(prev => prev.filter(c => c.id !== newId));
                            setUndoToast({ error: `Contact not created — ${r.error}` });
                        });
                        return nc;
                    }}
                    onSaveNewAccount={(data) => {
                        const newId = 'id_' + crypto.randomUUID();
                        const na = { ...data, id: newId };
                        setAccounts(prev => [...prev, na]);
                        // Account twin of the inline contact create above.
                        dbWrite('/.netlify/functions/accounts', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(na)
                        }).then(r => {
                            if (r.ok) return;
                            setAccounts(prev => prev.filter(a => a.id !== newId));
                            setUndoToast({ error: `Account not created — ${r.error}` });
                        });
                        return na;
                    }}
                    onAddContact={() => {
                        setContactRailId('new'); setContactRailMode('new');
                    }}
                    onAddRep={() => {
                        setShowUserModal(true);
                        setEditingUser(null);
                    }}
                />
            )}



            {showUserModal && (
                <UserModal
                    user={editingUser}
                    settings={settings}
                    onClose={() => { document.activeElement?.blur(); setShowUserModal(false); setUserModalError(null); setUserModalSaving(false); }}
                    onDismissError={() => setUserModalError(null)}
                    onSave={handleSaveUser}
                    errorMessage={userModalError}
                    saving={userModalSaving}
                />
            )}

            {/* TaskModal replaced by TaskRail */}


            {/* ContactModal replaced by ContactRail */}

            {/* ViewingAccountPanel replaced by AccountRail */}

            {/* ViewingContactPanel replaced by ContactRail */}

            {/* AccountModal replaced by AccountRail */}

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
                                { keys: ['3'], desc: 'Tasks' },
                                { keys: ['4'], desc: 'Accounts' },
                                { keys: ['5'], desc: 'Contacts' },
                                { keys: ['6'], desc: 'Leads' },
                                { keys: ['7'], desc: 'Quotes' },
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
                    {/* Two shapes. The delete shape is { label, restore, timerId }.
                        The error shape is { error } and carries no restore — it is how
                        a FAILED undo reports itself, since the row has already been put
                        back on screen and then taken away again. Rendering .label for
                        an error toast would print "undefined deleted" and give an Undo
                        button that throws on click. */}
                    <span style={{ fontSize: '0.875rem', flex: 1 }}>
                        {undoToast.error
                            ? <>⚠ {undoToast.error}</>
                            : <>🗑 <strong>{undoToast.label}</strong> deleted</>}
                    </span>
                    {!undoToast.error && (
                        <button onClick={() => { clearTimeout(undoToast.timerId); undoToast.restore(); }}
                            style={{ padding: '0.3rem 0.875rem', background: '#3b82f6', color: '#fff', border: 'none',
                                borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
                            ↩ Undo
                        </button>
                    )}
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

            {/* ActivityModal replaced by ActivityRail */}

            {showCsvImportModal && (
                <CsvImportModal
                    importType={csvImportType}
                    contacts={contacts}
                    accounts={accounts}
                    opportunities={opportunities}
                    onClose={() => { document.activeElement?.blur(); setShowCsvImportModal(false); }}
                    onImportContacts={async (newContacts, overwrites = []) => {
                        // Three phases: auto-create missing companies, POST new
                        // contacts, PUT overwrites. Each returns a receipt; the
                        // modal renders the sum. Counts never travel as prose
                        // (18b15) — the accounts phase in particular used to
                        // throw "2 of 3 new companies failed to save", which the
                        // modal regexed and rendered as contacts.
                        const totalProgress = newContacts.length + overwrites.length;
                        const phases = [];

                        // Phase 1: companies referenced by the incoming contacts.
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
                            const acc = await bulk.postNew('/.netlify/functions/accounts', newAccts);
                            if (acc.landed.length > 0) setAccounts(prev => [...prev, ...acc.landed]);
                            const accReceipt = receiptFromInsert(acc);
                            // A contact whose company failed would point at an
                            // account that does not exist, so this stops rather
                            // than importing them orphaned — and reports the
                            // company figures as company figures.
                            if (!isClean(accReceipt)) throw new ImportError(accReceipt, 'company');
                            phases.push(accReceipt);
                        }

                        // Phase 2: new contacts.
                        const contactsWithIds = newContacts.map((c) => ({
                            ...c,
                            id: crypto.randomUUID(),
                            createdAt: new Date().toISOString()
                        }));
                        if (contactsWithIds.length > 0) {
                            const res = await bulk.postNew('/.netlify/functions/contacts', contactsWithIds, { onProgress, progressTotal: totalProgress });
                            if (res.landed.length > 0) setContacts(prev => [...prev, ...res.landed]);
                            phases.push(receiptFromInsert(res));
                        }

                        // Phase 3: overwrites — state applied from appliedIds.
                        if (overwrites.length > 0) {
                            const overwritesWithIds = overwrites.map((c) => ({
                                ...c,
                                id: c._existingId,
                                updatedAt: new Date().toISOString(),
                                _existingId: undefined,
                            }));
                            const ow = await bulk.putBulk('/.netlify/functions/contacts', overwritesWithIds, { onProgress, progressOffset: contactsWithIds.length, progressTotal: totalProgress });
                            applyOverwrites(setContacts, overwritesWithIds, ow.appliedIds);
                            phases.push(receiptFromUpdate(ow));
                        }

                        return settle(mergeReceipts(...phases), 'contact');
                    }}
                    onImportAccounts={async (newAccounts, overwrites = []) => {
                        const totalProgress = newAccounts.length + overwrites.length;
                        const phases = [];

                        // Pass 1: new accounts — parents first, then sub-accounts
                        const parents = newAccounts.filter(a => !a.parentAccount?.trim());
                        const parentsWithIds = parents.map(a => {
                            const { parentAccount: _drop, ...rest } = a;
                            return { ...rest, id: crypto.randomUUID(), parentAccountId: null };
                        });

                        // Pass 2: new sub-accounts — resolve parentAccountId
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

                        if (allWithIds.length > 0) {
                            onProgress(0, totalProgress);
                            const res = await bulk.postNew('/.netlify/functions/accounts', allWithIds, { onProgress, progressTotal: totalProgress });
                            // Commit what actually saved before surfacing the failure.
                            if (res.landed.length > 0) setAccounts(prev => [...prev, ...res.landed]);

                            // parentAccountId is a plain text column, not a
                            // foreign key, so a sub-account whose parent failed
                            // lands pointing at nothing and the hierarchy looks
                            // wrong rather than erroring. Name the parents so a
                            // re-import fixes the cause, not the symptom. This is
                            // the one piece of prose that survives, because it
                            // identifies ROWS rather than reporting a count.
                            const lostParents = res.failed.filter(f => parentsWithIds.some(p => p.id === f.id));
                            const receipt = receiptFromInsert(res);
                            if (lostParents.length > 0) {
                                receipt.error = [
                                    receipt.error,
                                    `${lostParents.length} of the failures are parent accounts (${lostParents.slice(0, 3).map(p => p.name).join(', ')}${lostParents.length > 3 ? '…' : ''}), so any sub-accounts under them imported without a parent link.`,
                                ].filter(Boolean).join(' ');
                            }
                            phases.push(receipt);
                            if (!isClean(receipt)) throw new ImportError(mergeReceipts(...phases), 'account');
                        }

                        // Overwrites — PUT with the existing id, state from appliedIds
                        if (overwrites.length > 0) {
                            const overwritesWithIds = overwrites.map(a => {
                                const { parentAccount: _drop, _existingId, ...rest } = a;
                                return { ...rest, id: _existingId };
                            });
                            const ow = await bulk.putBulk('/.netlify/functions/accounts', overwritesWithIds, { onProgress, progressOffset: allWithIds.length, progressTotal: totalProgress });
                            applyOverwrites(setAccounts, overwritesWithIds, ow.appliedIds);
                            phases.push(receiptFromUpdate(ow));
                        }

                        return settle(mergeReceipts(...phases), 'account');
                    }}
                    onImportOpportunities={async (newOpps, overwrites = []) => {
                        // Stored on every imported deal (createdDate, stageChangedDate),
                        // so it must be the day the user is looking at (dateLocal.js).
                        const today = todayLocal();
                        const activePipelineId = allPipelines?.[0]?.id || 'default';
                        const totalProgress = newOpps.length + overwrites.length;

                        // `existingId` set means OVERWRITE, and the two cases are
                        // not the same record. The builder lives in
                        // src/utils/importRows.js: it was a closure inside this
                        // prop, unreachable by `node --test`, and it carried a
                        // comment claiming an overwrite "sends only the columns
                        // the CSV actually describes" while building all thirteen
                        // unconditionally — reassigning the deal's rep, zeroing
                        // its implementation cost and blanking next steps,
                        // products, territory and vertical on every import.
                        const buildOpp = (o, existingId) => buildOpportunityRow(o, {
                            existingId,
                            currentUser,
                            pipelineId: activePipelineId,
                            today,
                            newId: () => crypto.randomUUID(),
                        });

                        const phases = [];

                        // POST new opps
                        if (newOpps.length > 0) {
                            const oppsWithIds = newOpps.map(o => buildOpp(o, null));
                            onProgress(0, totalProgress);
                            const res = await bulk.postNew('/.netlify/functions/opportunities', oppsWithIds, { onProgress, progressTotal: totalProgress });
                            if (res.landed.length > 0) setOpportunities(prev => [...prev, ...res.landed]);
                            const receipt = receiptFromInsert(res);
                            phases.push(receipt);
                            if (!isClean(receipt)) throw new ImportError(mergeReceipts(...phases), 'opportunity');
                        }

                        // PUT overwrites.
                        //
                        // This path called dbFetch directly with the entire array
                        // and read the body only when the response was NOT ok, so
                        // it was the one overwrite path with no chunking, and
                        // `updated` / `notFound` / `forbidden` were discarded
                        // outright. An overwrite matching zero ids returned 200
                        // with updated: 0, and the Results tile rendered
                        // "3 overwritten" — the count the CLIENT decided to send,
                        // never a number the server agreed with.
                        if (overwrites.length > 0) {
                            const overwritesBuilt = overwrites.map(o => buildOpp(o, o._existingId));
                            const ow = await bulk.putBulk('/.netlify/functions/opportunities', overwritesBuilt, { onProgress, progressOffset: newOpps.length, progressTotal: totalProgress });
                            applyOverwrites(setOpportunities, overwritesBuilt, ow.appliedIds);
                            phases.push(receiptFromUpdate(ow));
                        }

                        return settle(mergeReceipts(...phases), 'opportunity');
                    }}
                />
            )}

            {showOutlookImportModal && (
                <OutlookImportModal
                    contacts={contacts}
                    opportunities={opportunities}
                    activities={activities}
                    onClose={() => { document.activeElement?.blur(); setShowOutlookImportModal(false); }}
                    onImport={async (newActivities) => {
                        const activitiesWithIds = newActivities.map((a) => ({
                            ...a,
                            id: 'id_' + crypto.randomUUID(),
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

            {showLeadModal && (
                <LeadModal
                    onClose={() => setShowLeadModal(false)}
                    onSaved={(lead) => {
                        setLeads(prev => [...(prev||[]), lead]);
                    }}
                    onSavedOpenCockpit={(id) => {
                        setShowLeadModal(false);
                        // Switch leads tab to cockpit with this lead selected
                        try { localStorage.setItem('tab:leads:subTab', 'cockpit'); } catch {}
                        try { localStorage.setItem('tab:leads:cockpitLead', id); } catch {}
                    }}
                />
            )}
            {showLeadImportModal && (
                <LeadImportModal
                    existingLeads={leads}
                    onClose={() => { document.activeElement?.blur(); setShowLeadImportModal(false); }}
                    onImport={async (newLeads) => {
                        // Was a hand-rolled single POST that sent the whole array
                        // and then read `data.leads` off the response — a key the
                        // endpoint has never returned. Both halves were wrong and
                        // neither was reachable by a test. This uses the same
                        // chunked client as the other three importers.
                        const res = await bulk.postNew('/.netlify/functions/leads', newLeads);

                        // 18b15: commit what actually landed BEFORE raising, or a
                        // failure in a later chunk discards rows already written
                        // server-side and state disagrees with the database.
                        if (res.landed.length > 0) setLeads(prev => [...(prev || []), ...res.landed]);
                        if (res.error) throw new Error(res.error);
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

            {/* ════ PROMPT MODAL — the app's own prompt dialog (state §0.79) ════ */}
            {promptModal && (() => {
                const value = promptModal.value ?? '';
                const submit = () => { const v = value.trim(); if (!v) return; const fn = promptModal.onSubmit; setPromptModal(null); fn(v); };
                return (
                    <div className="modal-overlay" onClick={() => setPromptModal(null)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: isMobile ? 'calc(100vw - 2rem)' : '460px', width: '100%', padding: isMobile ? '1.25rem' : '2rem' }}>
                            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.125rem', fontWeight: '700', color: '#1e293b' }}>{promptModal.title}</h3>
                            {promptModal.help && <p style={{ color: '#64748b', fontSize: '0.85rem', margin: '0 0 1rem 0', lineHeight: '1.5' }}>{promptModal.help}</p>}
                            {promptModal.label && <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.375rem' }}>{promptModal.label}</label>}
                            <input
                                autoFocus
                                value={value}
                                placeholder={promptModal.placeholder || ''}
                                onChange={e => setPromptModal(m => ({ ...m, value: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
                                style={{ width: '100%', padding: '0.625rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.9rem', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '1.25rem' }}
                            />
                            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                                <button onClick={() => setPromptModal(null)}
                                    style={{ padding: '0.625rem 1.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#ffffff', color: '#64748b', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                <button onClick={submit} disabled={!value.trim()}
                                    style={{ padding: '0.625rem 1.5rem', border: 'none', borderRadius: '6px', background: '#1c1917', color: 'white', fontWeight: '600', fontSize: '0.875rem', cursor: value.trim() ? 'pointer' : 'default', opacity: value.trim() ? 1 : 0.5, fontFamily: 'inherit' }}>{promptModal.submitLabel || 'Save'}</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ════ BLOCKED DELETE MODAL ════ */}
            {blockedDeleteModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(28,25,23,0.55)', zIndex: 10200, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', padding: isMobile ? '0' : '1rem' }}
                    onClick={() => setBlockedDeleteModal(null)}>
                    <div style={{ background: '#ffffff', borderRadius: isMobile ? '16px 16px 0 0' : '14px', padding: 0, width: '100%', maxWidth: isMobile ? '100%' : '440px', boxShadow: '0 20px 60px rgba(0,0,0,0.28)', overflow: 'hidden' }}
                        onClick={e => e.stopPropagation()}>
                        {/* Header band */}
                        <div style={{ background: '#dc2626', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: '1.125rem', lineHeight: 1 }}>🚫</span>
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: '800', fontSize: '0.9375rem', color: '#ffffff', lineHeight: 1.2 }}>
                                    {blockedDeleteModal.title}
                                </div>
                            </div>
                            <button onClick={() => setBlockedDeleteModal(null)}
                                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '6px', color: '#ffffff', cursor: 'pointer', fontSize: '1.125rem', lineHeight: 1, padding: '0.25rem 0.5rem', fontFamily: 'inherit', flexShrink: 0 }}>
                                ×
                            </button>
                        </div>
                        {/* Body */}
                        <div style={{ padding: '1.5rem 1.5rem 0.75rem' }}>
                            <p style={{ margin: '0 0 1.25rem', fontSize: '0.9rem', color: '#44403c', lineHeight: '1.6' }}>
                                {blockedDeleteModal.message}
                            </p>
                        </div>
                        {/* Footer */}
                        <div style={{ padding: '0 1.5rem 1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => setBlockedDeleteModal(null)}
                                style={{ padding: '0.6rem 1.75rem', background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                                OK, Got It
                            </button>
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
                                            setTaskRailId(task.id);
                                            setTaskRailMode('view');
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
                        // Closing without acting counts as dismissing the current alert —
                        // otherwise the checker would re-fire it on the next tick.
                        if (taskDuePopup) setDismissedDueTodayAlerts(prev => prev.includes(taskDuePopup.id) ? prev : [...prev, taskDuePopup.id]);
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
                                <div style={{ fontWeight: '800', fontSize: '1rem', color: '#ffffff', letterSpacing: '-0.01em' }}>{taskDuePopup.dueDate && taskDuePopup.dueDate < [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-') ? 'Task Overdue' : 'Task Due Today'}</div>
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
                                        // Record a re-alert-at timestamp; the 60s checker in App re-fires
                                        // it when the snooze elapses (robust across re-renders, unlike a
                                        // setTimeout, which also could not re-fire a pre-dismissed task).
                                        setSnoozedDueAlerts(prev => ({ ...prev, [task.id]: Date.now() + ms }));
                                        if (taskDueQueue.length > 0) { setTaskDuePopup(taskDueQueue[0]); setTaskDueQueue(prev => prev.slice(1)); } else { setTaskDuePopup(null); }
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
                                        setDismissedDueTodayAlerts(prev => prev.includes(task.id) ? prev : [...prev, task.id]);
                                        if (taskDueQueue.length > 0) {
                                            setTaskDuePopup(taskDueQueue[0]);
                                            setTaskDueQueue(prev => prev.slice(1));
                                        } else {
                                            setTaskDuePopup(null);
                                        }
                                        setActiveTab('tasks');
                                        setTimeout(() => { setTaskRailId(task.id); setTaskRailMode('view'); }, 150);
                                    }}
                                    style={{ flex: 1, padding: '0.7rem 1rem', background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: '#ffffff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', boxShadow: '0 2px 8px rgba(220,38,38,0.3)' }}
                                    onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(220,38,38,0.45)'}
                                    onMouseLeave={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(220,38,38,0.3)'}
                                >Open Task</button>
                                <button
                                    onClick={() => {
                                        if (taskDuePopup) setDismissedDueTodayAlerts(prev => prev.includes(taskDuePopup.id) ? prev : [...prev, taskDuePopup.id]);
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
                const closeClaimModal = () => { setSpiffClaimError(null); setSpiffClaimBusy(null); setShowSpiffClaimModal(false); };
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
                    onClick={closeClaimModal}>
                    <div style={{ background:'#fff', border:'1px solid #e5e2db', borderRadius: isMobile ? '12px 12px 0 0' : '12px', padding:'1.25rem 1.5rem', width:'100%', maxWidth: isMobile ? '100%' : '480px', boxShadow:'0 12px 40px rgba(0,0,0,0.15)', fontFamily:"'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}
                        onClick={e => e.stopPropagation()}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'1rem' }}>
                            <div>
                                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                    <div style={{ width:'3px', height:'16px', borderRadius:'1px', background:'#c8b99a' }} />
                                    <div style={{ fontWeight:'700', fontSize:'1rem', color:'#1c1917' }}>Claim SPIFF</div>
                                </div>
                                <div style={{ fontSize:'0.75rem', color:'#78716c', marginTop:'3px' }}>{opp.opportunityName || opp.account} · ${dealArr.toLocaleString()} ARR</div>
                            </div>
                            <button onClick={closeClaimModal} style={{ background:'none', border:'none', fontSize:'1.25rem', color:'#a8a29e', cursor:'pointer', lineHeight:1, fontFamily:'inherit' }}>×</button>
                        </div>

                        {existingClaims.length > 0 && (
                            <div style={{ marginBottom:'1rem' }}>
                                <div style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#a8a29e', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.5rem' }}>Already claimed</div>
                                {existingClaims.map(c => {
                                    const sp = activeSpiffsList.find(s => s.id === c.spiffId) || {};
                                    return (
                                        <div key={c.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.5rem 0.75rem', background:'#f0ece4', border:'1px solid #ddd8cf', borderRadius:'6px', marginBottom:'4px', fontSize:'0.8125rem' }}>
                                            <span style={{ fontWeight:'600', color:'#1c1917' }}>{sp.name || 'SPIFF'}</span>
                                            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                                <span style={{ fontWeight:'700', color:'#7a6a48' }}>${Math.round(c.amount).toLocaleString()}</span>
                                                <span style={{ fontSize:'0.625rem', padding:'2px 7px', borderRadius:'999px', fontWeight:'700', textTransform:'uppercase', letterSpacing:'0.04em',
                                                    background: c.status==='approved'?'#16a34a18':c.status==='rejected'?'#dc262618':c.status==='paid'?'#2563eb18':'#d9770618',
                                                    color: c.status==='approved'?'#16a34a':c.status==='rejected'?'#dc2626':c.status==='paid'?'#2563eb':'#d97706' }}>
                                                    {c.status.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {spiffClaimError && (
                            <div style={{ background:'#dc262614', border:'1px solid #dc262640', borderRadius:'8px', padding:'0.625rem 0.875rem', marginBottom:'0.875rem', fontSize:'0.8125rem', color:'#dc2626', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                <span>⚠</span><span style={{ flex:1 }}>{spiffClaimError}</span>
                                <button onClick={() => setSpiffClaimError(null)} style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:'1rem', lineHeight:1, fontFamily:'inherit' }}>×</button>
                            </div>
                        )}

                        {claimableSpiffs.length === 0 ? (
                            <div style={{ textAlign:'center', padding:'2rem', color:'#78716c', fontSize:'0.875rem', background:'#f0ece4', border:'1px solid #ddd8cf', borderRadius:'8px' }}>
                                All active SPIFFs have already been claimed for this deal.
                            </div>
                        ) : (
                            <div>
                                <div style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#a8a29e', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:'0.5rem' }}>Select SPIFFs to claim</div>
                                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem', maxHeight:'300px', overflowY:'auto' }}>
                                    {claimableSpiffs.map(spiff => {
                                        const estAmt = calcClaimAmt(spiff);
                                        return (
                                            <div key={spiff.id} style={{ border:'1px solid #ddd8cf', borderRadius:'8px', padding:'0.75rem', background:'#fff' }}>
                                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'0.375rem' }}>
                                                    <div style={{ fontWeight:'600', fontSize:'0.875rem', color:'#1c1917' }}>{spiff.name || 'Unnamed SPIFF'}</div>
                                                    <div style={{ fontWeight:'700', color:'#7a6a48', fontSize:'0.875rem' }}>
                                                        {spiff.type === 'multiplier' ? `${spiff.amount}× multiplier` : `$${Math.round(estAmt).toLocaleString()}`}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize:'0.75rem', color:'#78716c', marginBottom:'0.625rem' }}>
                                                    {spiff.type==='flat'?`$${parseFloat(spiff.amount||0).toLocaleString()} flat bonus`:spiff.type==='pct'?`${spiff.amount}% of deal ARR`:`Commission multiplier ${spiff.amount}×`}
                                                    {spiff.condition && <span> · {spiff.condition}</span>}
                                                </div>
                                                <button onClick={async () => {
                                                    const newClaim = {
                                                        id: 'claim_' + crypto.randomUUID(),
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
                                                    // dbFetch returns a Response and does NOT throw on 4xx/5xx.
                                                    setSpiffClaimError(null);
                                                    setSpiffClaimBusy(spiff.id);
                                                    try {
                                                        const res = await dbFetch('/.netlify/functions/spiff-claims', {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify(newClaim),
                                                        });
                                                        let payload = null;
                                                        try { payload = await res.json(); } catch { /* empty body */ }
                                                        if (!res.ok) {
                                                            setSpiffClaimError((payload && payload.error)
                                                                || `Claim not submitted — the server returned ${res.status}.`);
                                                            return;
                                                        }
                                                        setSpiffClaims(prev => [...prev, (payload && payload.spiffClaim) || newClaim]);
                                                    } catch (err) {
                                                        console.error('Failed to submit SPIFF claim:', err.message);
                                                        setSpiffClaimError('Claim not submitted — network error. Nothing was saved.');
                                                    } finally {
                                                        setSpiffClaimBusy(null);
                                                    }
                                                }}
                                                disabled={spiffClaimBusy === spiff.id}
                                                style={{ width:'100%', padding:'0.4rem 0.875rem', background: spiffClaimBusy === spiff.id ? '#44403c' : '#1c1917', color:'#f5f1eb', border:'none', borderRadius:'8px', fontSize:'0.75rem', fontWeight:'500', cursor: spiffClaimBusy === spiff.id ? 'wait' : 'pointer', fontFamily:'inherit' }}>
                                                    {spiffClaimBusy === spiff.id ? 'Submitting…' : 'Submit Claim'}
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

            <ActivityRail />
            <TaskRail />
            <ContactRail />
            <AccountRail />
            <DocumentRail />
            <DocumentUploadRail />
            <DocumentLinkPicker />
            <MergeReviewModal />
            <ContactMergeReviewModal />
            <CoachingNoteDialogHost />
        </>
    );
}
