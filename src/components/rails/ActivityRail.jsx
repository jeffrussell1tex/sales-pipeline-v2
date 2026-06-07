import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../AppContext';
import AttachmentsStrip from '../documents/AttachmentsStrip';
import { dbFetch } from '../../utils/storage';

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
    sans:    '"Plus Jakarta Sans", system-ui, sans-serif',
    surface: '#fbf8f3',
    surface2:'#f5efe3',
    surface3:'#f0ece4',
    border:  '#e6ddd0',
    ink:     '#2a2622',
    ink2:    '#5a544c',
    ink3:    '#8a8378',
    gold:    '#c8b99a',
    danger:  '#9c3a2e',
    r:       3,
};

function SectionHeading({ label }) {
    return (
        <div style={{ fontSize: 10, fontWeight: 700, color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, marginTop: 6, borderBottom: `1px solid ${T.border}`, paddingBottom: 5 }}>
            {label}
        </div>
    );
}

function FieldGroup({ label, wide, children }) {
    return (
        <div style={{ gridColumn: wide ? '1 / -1' : undefined, marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{label}</label>
            {children}
        </div>
    );
}

function TextInput({ value, onChange, placeholder, type = 'text' }) {
    return (
        <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', outline: 'none' }}
        />
    );
}

function Typeahead({ value, onChange, suggestions, onSelect, placeholder, dropUp }) {
    const [open, setOpen] = useState(false);
    const filtered = (suggestions || []).filter(s => (s || '').toLowerCase().includes((value || '').toLowerCase()));
    return (
        <div style={{ position: 'relative' }}>
            <TextInput value={value} onChange={v => { onChange(v); setOpen(true); }} placeholder={placeholder} />
            {open && filtered.length > 0 && (
                <div style={{ position: 'absolute', [dropUp ? 'bottom' : 'top']: '100%', left: 0, right: 0, background: '#fff', border: `1px solid ${T.border}`, borderRadius: T.r, marginTop: dropUp ? 0 : 2, marginBottom: dropUp ? 2 : 0, maxHeight: 180, overflowY: 'auto', zIndex: 300, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {filtered.slice(0, 8).map((s, i) => (
                        <div key={i} onMouseDown={e => e.preventDefault()} onClick={() => { onSelect(s); setOpen(false); }}
                            style={{ padding: '7px 10px', fontSize: 13, cursor: 'pointer', borderBottom: `1px solid ${T.border}` }}
                            onMouseEnter={e => e.currentTarget.style.background = T.surface3}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >{s}</div>
                    ))}
                </div>
            )}
        </div>
    );
}

const today = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
};

const EMPTY_ACTIVITY = {
    type: 'Call', date: '', notes: '',
    opportunityId: '', contactId: '', company: '',
};

// ── Main component ─────────────────────────────────────────────────────────────

export default function ActivityRail() {
    const {
        opportunities, contacts, accounts, settings, currentUser,
        showActivityModal, setShowActivityModal,
        editingActivity, setEditingActivity,
        activityInitialContext, setActivityInitialContext,
        activityModalError, setActivityModalError,
        activityModalSaving,
        handleSaveActivity,
        setFollowUpPrompt,
        setQuickLogOpen, setQuickLogForm, setQuickLogContactResults,
        setContacts, setAccounts,
        contactRailId, setContactRailId,
        contactRailMode, setContactRailMode,
        accountRailId, setAccountRailId,
        accountRailMode, setAccountRailMode,
    } = useApp();

    const isOpen    = !!showActivityModal;
    const isEditing = true; // Activity rail is always in edit/create mode

    // ── Form state ─────────────────────────────────────────────────────────────
    const [formData,     setFormData]     = useState({ ...EMPTY_ACTIVITY, date: today() });
    const [oppSearch,    setOppSearch]    = useState('');
    const [contactSearch,setContactSearch]= useState('');
    const [companySearch,setCompanySearch]= useState('');
    const [saveError,    setSaveError]    = useState(null);

    useEffect(() => {
        if (!isOpen) return;
        const ctx = activityInitialContext || {};
        const src = editingActivity ? { ...EMPTY_ACTIVITY, ...editingActivity } : { ...EMPTY_ACTIVITY, date: today(), ...ctx };

        setFormData(src);

        const relOpp     = src.opportunityId ? (opportunities || []).find(o => o.id === src.opportunityId) : null;
        const relContact = src.contactId     ? (contacts     || []).find(c => c.id === src.contactId)     : null;

        setOppSearch(relOpp     ? (relOpp.opportunityName || relOpp.account) : '');
        setContactSearch(relContact ? ((relContact.firstName || '') + ' ' + (relContact.lastName || '')).trim() : '');
        setCompanySearch(src.company || (relOpp?.account) || '');
        setSaveError(null);
        setActivityModalError?.(null);
    }, [showActivityModal, editingActivity, activityInitialContext]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Derived lists ──────────────────────────────────────────────────────────
    const taskTypes   = settings?.taskTypes || ['Call', 'Meeting', 'Email', 'Demo', 'Follow-up'];
    const oppNames    = (opportunities || []).map(o => o.opportunityName || o.account).filter(Boolean);
    const contactNames = (contacts || []).map(c => ((c.firstName||'') + ' ' + (c.lastName||'')).trim()).filter(Boolean);
    const accountNames = (accounts  || []).map(a => a.name).filter(Boolean);

    const hc = useCallback((field, value) => setFormData(prev => ({ ...prev, [field]: value })), []);

    const closeRail = () => {
        setShowActivityModal(false);
        setEditingActivity(null);
        setActivityInitialContext?.(null);
        setActivityModalError?.(null);
        setSaveError(null);
    };

    const handleSave = async () => {
        setSaveError(null);
        if (!formData.notes?.trim()) { setSaveError('Notes are required.'); return; }

        const selOpp     = (opportunities || []).find(o => (o.opportunityName || o.account) === oppSearch);
        const selContact = (contacts     || []).find(c => ((c.firstName||'') + ' ' + (c.lastName||'')).trim() === contactSearch);

        const saveData = {
            ...formData,
            company:       companySearch || selOpp?.account || '',
            opportunityId: selOpp     ? selOpp.id     : (formData.opportunityId || ''),
            contactId:     selContact ? selContact.id : (formData.contactId     || ''),
        };

        await handleSaveActivity(saveData, {
            editingActivity,
            currentUser,
            opportunities,
            setShowActivityModal: (open) => { if (!open) closeRail(); },
            setFollowUpPrompt,
            setQuickLogOpen,
            setQuickLogForm,
            setQuickLogContactResults,
        });
    };

    // ESC to close
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => { if (e.key === 'Escape') closeRail(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' };

    return (
        <>
        {/* Click-catcher */}
        <div onClick={closeRail}
            style={{ position: 'fixed', inset: 0, zIndex: 11000, background: 'rgba(42,38,34,0.25)' }}
        />

        {/* Rail panel */}
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
            background: T.surface, borderLeft: `1px solid ${T.border}`,
            display: 'flex', flexDirection: 'column',
            zIndex: 11001, boxShadow: '-8px 0 32px rgba(42,38,34,0.12)',
            fontFamily: T.sans,
        }}>

            {/* ── Header ────────────────────────────────────────────────────── */}
            <div style={{ background: T.ink, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#f5f1eb' }}>
                        {editingActivity ? 'Edit Activity' : 'Log Activity'}
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(245,241,235,0.5)', marginTop: 1 }}>
                        What happened?
                    </div>
                </div>
                <button onClick={closeRail} style={{ background: 'none', border: 'none', color: 'rgba(245,241,235,0.5)', fontSize: 18, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>

            {/* ── Scrollable body ────────────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 18px' }}>

                {/* Error */}
                {(activityModalError || saveError) && (
                    <div style={{ background: '#fef2f2', border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: T.danger, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{activityModalError || saveError}</span>
                        <button onClick={() => { setActivityModalError?.(null); setSaveError(null); }} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                    </div>
                )}

                <SectionHeading label="Activity Details" />
                <div style={grid2}>
                    <FieldGroup label="Activity Type">
                        <select value={formData.type || 'Call'} onChange={e => hc('type', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans }}>
                            {taskTypes.map(tt => <option key={tt} value={tt}>{tt}</option>)}
                        </select>
                    </FieldGroup>
                    <FieldGroup label="Date *">
                        <input type="date" value={formData.date || today()} onChange={e => hc('date', e.target.value)}
                            style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box' }} />
                    </FieldGroup>
                    <FieldGroup label="Notes *" wide>
                        <textarea value={formData.notes || ''} onChange={e => hc('notes', e.target.value)}
                            rows={5} placeholder="What was discussed? Next steps? Important details…"
                            style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', resize: 'vertical' }}
                        />
                    </FieldGroup>
                </div>

                <SectionHeading label="Related To" />
                <div style={grid2}>
                    <FieldGroup label="Contact" wide>
                        <Typeahead value={contactSearch} onChange={setContactSearch} suggestions={contactNames} onSelect={setContactSearch} placeholder="Type to search contacts…" />
                    </FieldGroup>
                    <FieldGroup label="Company" wide>
                        <Typeahead value={companySearch} onChange={setCompanySearch} suggestions={accountNames} onSelect={setCompanySearch} placeholder="Type company name…" />
                    </FieldGroup>
                    <FieldGroup label="Opportunity" wide>
                        <Typeahead value={oppSearch} onChange={setOppSearch} suggestions={oppNames} onSelect={v => { setOppSearch(v); const o = (opportunities||[]).find(x => (x.opportunityName||x.account) === v); if (o) setCompanySearch(prev => prev || o.account || ''); }} placeholder="Type opportunity or account name…" dropUp />
                    </FieldGroup>
                </div>

                {editingActivity && editingActivity.id && (
                    <>
                        <SectionHeading label="Attachments" />
                        <AttachmentsStrip recordType="activity" recordId={editingActivity.id} recordName={editingActivity.name || editingActivity.type || 'Activity'} recordSub={editingActivity.date || ''} />
                    </>
                )}
            </div>

            {/* ── Footer ────────────────────────────────────────────────────── */}
            <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: '12px 16px', background: T.surface, display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={closeRail}
                    style={{ padding: '8px 16px', background: T.surface2, color: T.ink2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                    Cancel
                </button>
                <button onClick={handleSave} disabled={activityModalSaving}
                    style={{ padding: '8px 20px', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 700, cursor: activityModalSaving ? 'not-allowed' : 'pointer', fontFamily: T.sans, opacity: activityModalSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                    {activityModalSaving && <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                    {activityModalSaving ? 'Saving…' : editingActivity ? 'Save Activity' : 'Log Activity'}
                </button>
            </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
}
