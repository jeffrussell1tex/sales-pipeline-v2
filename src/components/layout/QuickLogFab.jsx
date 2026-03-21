import React from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

export default function QuickLogFab({
    quickLogOpen, setQuickLogOpen,
    quickLogForm, setQuickLogForm,
    quickLogContactResults, setQuickLogContactResults,
    followUpPrompt, setFollowUpPrompt,
    setEditingTask, setShowTaskModal,
}) {
    const { activeTab, contacts, opportunities, currentUser, addAudit, activities, setActivities } = useApp();

    return (
        <>
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
        </>
    );
}
