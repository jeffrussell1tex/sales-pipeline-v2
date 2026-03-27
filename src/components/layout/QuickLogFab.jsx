import React from 'react';
import { useApp } from '../../AppContext';
import { dbFetch } from '../../utils/storage';

export default function QuickLogFab() {
    const {
        activeTab, contacts, opportunities, visibleOpportunities, currentUser, addAudit, activities, setActivities,
        quickLogOpen, setQuickLogOpen,
        quickLogForm, setQuickLogForm,
        quickLogContactResults, setQuickLogContactResults,
        followUpPrompt, setFollowUpPrompt,
        setEditingTask, setShowTaskModal, isMobile,
    } = useApp();

    const inputStyle = {
        width: '100%', fontSize: '0.875rem', border: '1px solid #e5e2db',
        borderRadius: '8px', padding: '0.5rem 0.75rem',
        background: '#f0ece4', color: '#1c1917', fontFamily: 'inherit', outline: 'none',
        boxSizing: 'border-box',
    };
    const labelStyle = {
        display: 'block', fontSize: '0.75rem', fontWeight: '600',
        color: '#57534e', marginBottom: '0.375rem',
    };

    return (
        <>
            {quickLogOpen && (
                <div style={{ position: 'fixed', bottom: 0, right: 0, top: 0, left: 0, zIndex: 9989 }} onClick={() => setQuickLogOpen(false)} />
            )}
            {quickLogOpen && (
                <div style={{ position: 'fixed', top: '4.5rem', right: '1.5rem', zIndex: 9990 }}>
                    <div style={{
                        background: '#fff', border: '1px solid #e5e2db', borderRadius: '16px',
                        boxShadow: '0 12px 40px rgba(0,0,0,0.15)', padding: '1.5rem',
                        width: '360px', display: 'flex', flexDirection: 'column', gap: '1rem',
                    }} onClick={e => e.stopPropagation()}>

                        {/* Title */}
                        <div style={{ fontSize: '1.125rem', fontWeight: '700', color: '#1c1917' }}>⚡ Log Activity</div>

                        {/* Activity type */}
                        <div>
                            <label style={labelStyle}>Activity Type</label>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                {['Call','Email','Meeting','Demo','Follow-up','Note'].map(t => (
                                    <button key={t} onClick={() => setQuickLogForm(f => ({ ...f, type: t }))}
                                        style={{
                                            padding: '0.45rem 0.25rem', borderRadius: '8px', cursor: 'pointer',
                                            fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: '600', transition: 'all 0.15s',
                                            border: '1px solid ' + (quickLogForm.type === t ? '#1c1917' : '#e5e2db'),
                                            background: quickLogForm.type === t ? '#1c1917' : '#f0ece4',
                                            color: quickLogForm.type === t ? '#f5f1eb' : '#57534e',
                                        }}>
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Contact */}
                        <div style={{ position: 'relative' }}>
                            <label style={labelStyle}>Contact</label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    value={quickLogForm.contactSearch}
                                    onChange={e => {
                                        const q = e.target.value;
                                        setQuickLogForm(f => ({ ...f, contactSearch: q, contactId: '' }));
                                        if (q.trim().length < 1) { setQuickLogContactResults([]); return; }
                                        const ql = q.toLowerCase();
                                        setQuickLogContactResults((contacts || []).filter(c =>
                                            ((c.firstName || '') + ' ' + (c.lastName || '')).toLowerCase().includes(ql) ||
                                            (c.company || '').toLowerCase().includes(ql) ||
                                            (c.email || '').toLowerCase().includes(ql)
                                        ).slice(0, 6));
                                    }}
                                    placeholder="Type contact name…"
                                    style={{ ...inputStyle, paddingRight: '2rem' }}
                                />
                                {quickLogForm.contactSearch.length > 0 && (
                                    <button onClick={() => { setQuickLogForm(f => ({ ...f, contactId: '', contactSearch: '' })); setQuickLogContactResults([]); }}
                                        style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '1rem', lineHeight: 1, padding: 0 }}>×</button>
                                )}
                            </div>
                            {quickLogContactResults.length > 0 && !quickLogForm.contactId && (
                                <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, background: '#fff', border: '1px solid #e5e2db', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', zIndex: 10, overflow: 'hidden' }}>
                                    {quickLogContactResults.map((c, idx) => {
                                        const fullName = [c.firstName, c.lastName].filter(Boolean).join(' ');
                                        const sub = [c.title, c.company].filter(Boolean).join(' · ');
                                        return (
                                            <div key={c.id} onClick={() => { setQuickLogForm(f => ({ ...f, contactId: c.id, contactSearch: fullName })); setQuickLogContactResults([]); }}
                                                style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: idx < quickLogContactResults.length - 1 ? '1px solid #f1f5f9' : 'none' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1c1917' }}>{fullName || '—'}</div>
                                                {sub && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{sub}</div>}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Opportunity */}
                        <div>
                            <label style={labelStyle}>Opportunity</label>
                            <select value={quickLogForm.opportunityId} onChange={e => setQuickLogForm(f => ({ ...f, opportunityId: e.target.value }))}
                                style={inputStyle}>
                                <option value="">Type opportunity or account name…</option>
                                {(visibleOpportunities || []).filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').map(o => (
                                    <option key={o.id} value={o.id}>{o.opportunityName || o.account}</option>
                                ))}
                            </select>
                        </div>

                        {/* Notes */}
                        <div>
                            <label style={labelStyle}>Notes *</label>
                            <textarea value={quickLogForm.notes} onChange={e => setQuickLogForm(f => ({ ...f, notes: e.target.value }))}
                                placeholder="What was discussed? Next steps? Important details…" rows={3}
                                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }} />
                        </div>

                        {/* Add to Calendar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                            <input type="checkbox" id="quickLogCal" checked={!!quickLogForm.addToCalendar}
                                onChange={e => setQuickLogForm(f => ({ ...f, addToCalendar: e.target.checked }))}
                                style={{ width: '16px', height: '16px', accentColor: '#1c1917', cursor: 'pointer', flexShrink: 0 }} />
                            <label htmlFor="quickLogCal" style={{ fontSize: '0.875rem', fontWeight: '500', color: '#1c1917', cursor: 'pointer', userSelect: 'none' }}>
                                📅 Add to Google Calendar
                            </label>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Creates an all-day event</span>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '0.625rem', paddingTop: '0.25rem' }}>
                            <button onClick={() => { setQuickLogOpen(false); setQuickLogForm({ type: 'Call', notes: '', opportunityId: '', contactId: '', contactSearch: '', addToCalendar: false }); setQuickLogContactResults([]); }}
                                style={{ flex: 1, padding: '0.625rem', borderRadius: '8px', border: '1px solid #e5e2db', background: '#fff', color: '#57534e', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                                Cancel
                            </button>
                            <button onClick={async () => {
                                const linkedOpp = quickLogForm.opportunityId ? (opportunities || []).find(o => o.id === quickLogForm.opportunityId) : null;
                                const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
                                const newActivity = {
                                    id: 'act_' + Date.now(),
                                    type: quickLogForm.type,
                                    notes: quickLogForm.notes,
                                    date: today,
                                    opportunityId: quickLogForm.opportunityId || null,
                                    opportunityName: linkedOpp?.opportunityName || linkedOpp?.account || '',
                                    companyName: linkedOpp?.account || '',
                                    contactId: quickLogForm.contactId || null,
                                    salesRep: currentUser,
                                    author: currentUser,
                                    createdAt: new Date().toISOString(),
                                };
                                setActivities(prev => [newActivity, ...(prev || [])]);
                                try {
                                    await dbFetch('/.netlify/functions/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newActivity) });
                                } catch(e) { console.error('Quick log save failed:', e); }
                                if (linkedOpp) setFollowUpPrompt({ opportunityId: linkedOpp.id, opportunityName: linkedOpp.opportunityName || linkedOpp.account });
                                setQuickLogOpen(false);
                                setQuickLogForm({ type: 'Call', notes: '', opportunityId: '', contactId: '', contactSearch: '', addToCalendar: false });
                                setQuickLogContactResults([]);
                            }} style={{ flex: 1, padding: '0.625rem', borderRadius: '8px', border: 'none', background: '#1c1917', color: '#f5f1eb', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                Log Activity
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ════ FOLLOW-UP TASK PROMPT ════ */}
            {followUpPrompt && (
                <div style={{ position: 'fixed', bottom: '2rem', right: isMobile ? '0.75rem' : '1.5rem', left: isMobile ? '0.75rem' : 'auto', zIndex: 9991, background: '#fff', border: '1px solid #e5e2db', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)', padding: '1.25rem', width: isMobile ? 'auto' : '280px' }}
                    onClick={e => e.stopPropagation()}>
                    <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1c1917', marginBottom: '0.375rem' }}>✅ Activity logged!</div>
                    <div style={{ fontSize: '0.8125rem', color: '#57534e', marginBottom: '0.875rem' }}>Create a follow-up task for <strong>{followUpPrompt.opportunityName}</strong>?</div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => setFollowUpPrompt(null)}
                            style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: '1px solid #e5e2db', background: '#fff', color: '#57534e', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Skip
                        </button>
                        <button onClick={() => {
                            setEditingTask({ relatedTo: followUpPrompt.opportunityId, opportunityId: followUpPrompt.opportunityId, type: 'Follow-up', dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0] });
                            setShowTaskModal(true);
                            setFollowUpPrompt(null);
                        }} style={{ flex: 1, padding: '0.5rem', borderRadius: '8px', border: 'none', background: '#1c1917', color: '#f5f1eb', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                            + Add Task
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
