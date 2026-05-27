import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../AppContext';

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(first, last) {
    return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || '?';
}

function avatarBg(name) {
    const colors = ['#5a544c','#7a6a48','#4d6b3d','#3a5a7a','#6b3d4d','#3d4d6b','#6b5a3d'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
    return colors[Math.abs(h) % colors.length];
}

function ReadRow({ label, value, wide }) {
    if (!value && value !== 0) return null;
    return (
        <div style={{ gridColumn: wide ? '1 / -1' : undefined, marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.45, wordBreak: 'break-word' }}>{value}</div>
        </div>
    );
}

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
        <input
            type={type}
            value={value || ''}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', outline: 'none' }}
        />
    );
}

function Typeahead({ value, onChange, suggestions, onSelect, placeholder, dropUp }) {
    const [open, setOpen] = useState(false);
    const filtered = suggestions.filter(s => s.toLowerCase().includes((value || '').toLowerCase()));
    return (
        <div style={{ position: 'relative' }}>
            <TextInput
                value={value}
                onChange={v => { onChange(v); setOpen(true); }}
                placeholder={placeholder}
            />
            {open && filtered.length > 0 && (
                <div style={{
                    position: 'absolute', [dropUp ? 'bottom' : 'top']: '100%', left: 0, right: 0,
                    background: '#fff', border: `1px solid ${T.border}`, borderRadius: T.r,
                    marginTop: dropUp ? 0 : 2, marginBottom: dropUp ? 2 : 0,
                    maxHeight: 180, overflowY: 'auto', zIndex: 200,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}>
                    {filtered.slice(0, 8).map((s, i) => (
                        <div key={i}
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => { onSelect(s); setOpen(false); }}
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

// ── Empty form state ──────────────────────────────────────────────────────────
const EMPTY_CONTACT = {
    prefix: '', firstName: '', middleName: '', lastName: '', suffix: '', nickName: '',
    title: '', company: '', department: '', workLocation: '',
    email: '', personalEmail: '', phone: '', mobile: '',
    address: '', address2: '', city: '', state: '', zip: '', country: '',
    managers: [], directReports: [], assistantName: '',
    homeAddress: '', notes: '', doNotContact: false, buyerPersona: '',
    assignedRep: '',
};

// ── Main component ────────────────────────────────────────────────────────────

export default function ContactRail() {
    const {
        contacts, accounts, settings, opportunities, activities,
        contactRailId, setContactRailId,
        contactRailMode, setContactRailMode,
        accountRailId, setAccountRailId,
        accountRailMode, setAccountRailMode,
        railStack, setRailStack,
        showActivityModal, setShowActivityModal, setActivityInitialContext,
        handleSaveContact,
        handleDeleteContact,
        handleAddActivity,
        contactModalError, setContactModalError,
        contactModalSaving,
        taskRailId: _taskRailId, setTaskRailId, taskRailMode: _taskRailMode, setTaskRailMode,
    } = useApp();

    // ── Resolve the contact being viewed/edited ───────────────────────────────
    const isNew     = contactRailId === 'new';
    const contact   = isNew ? null : (contacts || []).find(c => c.id === contactRailId) || null;
    const isOpen    = !!contactRailId;
    const isEditing = contactRailMode === 'edit' || contactRailMode === 'new';

    // ── Form state ────────────────────────────────────────────────────────────
    const [formData,        setFormData]        = useState(EMPTY_CONTACT);
    const [companySearch,   setCompanySearch]   = useState('');
    const [repSearch,       setRepSearch]       = useState('');
    const [personaSearch,   setPersonaSearch]   = useState('');
    const [activeTab,       setActiveTab]       = useState('primary');
    const [dupWarning,      setDupWarning]      = useState(null);
    const [dirty,           setDirty]           = useState(false);
    const [saveError,       setSaveError]       = useState(null);

    // Seed form when rail opens or contact changes
    useEffect(() => {
        if (!isOpen) return;
        const src = contact || EMPTY_CONTACT;
        setFormData({ ...EMPTY_CONTACT, ...src });
        setCompanySearch(src.company || '');
        setRepSearch(src.assignedRep || '');
        setPersonaSearch(src.buyerPersona || '');
        setActiveTab('primary');
        setDupWarning(null);
        setDirty(false);
        setSaveError(null);
        setContactModalError?.(null);
    }, [contactRailId, contactRailMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Derived lists ─────────────────────────────────────────────────────────
    const allRepNames = [...new Set(
        (settings?.users || []).filter(u => u.name && u.userType === 'Sales Rep').map(u => u.name)
    )].sort();

    const allAccountNames = (accounts || []).map(a => a.name).sort();

    const buyerPersonas = (settings?.buyerPersonas || []).filter(p => p.active !== false);

    const openOpps = (opportunities || []).filter(o => {
        if (!contact) return false;
        const closed = ['closed won','closed lost','won','lost'];
        if (closed.includes((o.stage || '').toLowerCase())) return false;
        return (o.contactIds || []).includes(contact.id) ||
            (o.contacts || '').split(',').map(s => s.trim()).includes(
                ((contact.firstName || '') + ' ' + (contact.lastName || '')).trim()
            );
    });

    // Activities linked to this contact — by direct contactId or via involved opportunities
    const contactActivities = (activities || []).filter(a => {
        if (!contact) return false;
        if (a.contactId && a.contactId === contact.id) return true;
        const involvedOppIds = openOpps.map(o => o.id);
        return a.opportunityId && involvedOppIds.includes(a.opportunityId);
    }).sort((a, b) => new Date(b.date || '2000') - new Date(a.date || '2000'));

    // ── Handlers ──────────────────────────────────────────────────────────────
    const hc = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setDirty(true);
    }, []);

    const handleSelectCompany = (name) => {
        const acc = (accounts || []).find(a => a.name === name);
        setFormData(prev => ({
            ...prev,
            company:  name,
            address:  prev.address  || acc?.address  || '',
            address2: prev.address2 || acc?.address2 || '',
            city:     prev.city     || acc?.city     || '',
            state:    prev.state    || acc?.state    || '',
            zip:      prev.zip      || acc?.zip      || '',
            country:  prev.country  || acc?.country  || '',
        }));
        setCompanySearch(name);
        setDirty(true);
    };

    const handleSave = async () => {
        setSaveError(null);
        const saveData = { ...formData, company: companySearch, assignedRep: repSearch, buyerPersona: personaSearch };

        // Duplicate check for new contacts
        if (isNew && !dupWarning) {
            const dup = (contacts || []).find(c =>
                (c.firstName || '').toLowerCase().trim() === (saveData.firstName || '').toLowerCase().trim() &&
                (c.lastName  || '').toLowerCase().trim() === (saveData.lastName  || '').toLowerCase().trim()
            );
            if (dup) { setDupWarning(dup); return; }
        }

        await handleSaveContact(saveData, {
            editingContact: isNew ? null : contact,
            setShowContactModal: (open) => {
                if (!open) {
                    // On success: return to view mode (rail stays open for existing, closes for new)
                    if (isNew) {
                        setContactRailId(null);
                        setContactRailMode('view');
                    } else {
                        setContactRailMode('view');
                        setDirty(false);
                    }
                }
            },
        });
    };

    const handleDiscard = () => {
        if (isNew) {
            closeRail();
        } else {
            const src = contact || EMPTY_CONTACT;
            setFormData({ ...EMPTY_CONTACT, ...src });
            setCompanySearch(src.company || '');
            setRepSearch(src.assignedRep || '');
            setPersonaSearch(src.buyerPersona || '');
            setContactRailMode('view');
            setDirty(false);
            setDupWarning(null);
            setSaveError(null);
        }
    };

    const closeRail = () => {
        setContactRailId(null);
        setContactRailMode('view');
        setRailStack([]);
    };

    // Clicking the company chip pushes current to stack and opens the Account rail
    const handleOpenAccountRail = (companyName) => {
        const acc = (accounts || []).find(a => a.name === companyName);
        if (!acc) return;
        setRailStack(prev => [...prev, { type: 'contact', id: contactRailId, mode: contactRailMode }]);
        setAccountRailId(acc.id);
        setAccountRailMode('view');
    };

    // Back: pop the stack, restore previous rail
    const handleBack = () => {
        const prev = railStack[railStack.length - 1];
        if (!prev) return;
        setRailStack(s => s.slice(0, -1));
        if (prev.type === 'contact') {
            setContactRailId(prev.id);
            setContactRailMode(prev.mode);
            setAccountRailId(null);
        }
    };

    // ESC key closes
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => { if (e.key === 'Escape' && !isEditing) closeRail(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    const fullName = ((formData.firstName || '') + ' ' + (formData.lastName || '')).trim() || 'New Contact';
    const bg = avatarBg(fullName);

    // ── Shared field styles ───────────────────────────────────────────────────
    const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' };

    // ── Tab button ────────────────────────────────────────────────────────────
    const tabBtn = (id, label) => (
        <button
            onClick={() => setActiveTab(id)}
            style={{
                background: 'none', border: 'none', borderBottom: activeTab === id ? `2px solid ${T.ink}` : '2px solid transparent',
                color: activeTab === id ? T.ink : T.ink3, fontWeight: activeTab === id ? 700 : 500,
                fontSize: 12, padding: '8px 14px', cursor: 'pointer', fontFamily: T.sans,
                transition: 'all 0.15s',
            }}
        >{label}</button>
    );

    // ── RENDER ────────────────────────────────────────────────────────────────
    return (
        <>
        {/* Click-catcher: blocks background interaction */}
        <div
            onClick={!isEditing ? closeRail : undefined}
            style={{ position: 'fixed', inset: 0, zIndex: 10998, background: 'rgba(42,38,34,0.25)' }}
        />

        {/* Rail panel */}
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
            background: T.surface, borderLeft: `1px solid ${T.border}`,
            display: 'flex', flexDirection: 'column',
            zIndex: 10999, boxShadow: '-8px 0 32px rgba(42,38,34,0.12)',
            fontFamily: T.sans,
            transform: 'translateX(0)',
        }}>

            {/* ── Header ────────────────────────────────────────────────────── */}
            <div style={{ background: T.ink, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                {/* Back button (only when stack has entries) */}
                {railStack.length > 0 && (
                    <button onClick={handleBack} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#f5f1eb', borderRadius: T.r, padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontFamily: T.sans, flexShrink: 0 }}>
                        ← Back
                    </button>
                )}

                {/* Avatar */}
                {!isNew && (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {initials(contact?.firstName, contact?.lastName)}
                    </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#f5f1eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isNew ? 'New Contact' : fullName}
                    </div>
                    {!isNew && contact?.title && (
                        <div style={{ fontSize: 11, color: 'rgba(245,241,235,0.55)', marginTop: 1 }}>{contact.title}</div>
                    )}
                </div>

                {/* Mode badge */}
                {isEditing && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.gold, background: 'rgba(200,185,154,0.15)', border: `1px solid rgba(200,185,154,0.3)`, borderRadius: 3, padding: '2px 7px', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
                        {isNew ? 'New' : 'Editing'}
                    </span>
                )}

                <button onClick={closeRail} style={{ background: 'none', border: 'none', color: 'rgba(245,241,235,0.5)', fontSize: 18, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>

            {/* ── Quick-action bar (view mode only) ─────────────────────────── */}
            {!isEditing && contact && (
                <div style={{ display: 'flex', gap: 8, padding: '10px 16px', background: T.surface2, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                    {contact.email && (
                        <a href={`mailto:${contact.email}`}
                           style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 6px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, fontWeight: 600, color: T.ink2, textDecoration: 'none', cursor: 'pointer' }}>
                            ✉ Email
                        </a>
                    )}
                    {contact.phone && (
                        <a href={`tel:${contact.phone}`}
                           style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 6px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, fontWeight: 600, color: T.ink2, textDecoration: 'none' }}>
                            ☎ Call
                        </a>
                    )}
                    <button
                        onClick={() => handleAddActivity && handleAddActivity(null, contact.id)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 6px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, fontWeight: 600, color: T.ink2, cursor: 'pointer', fontFamily: T.sans }}>
                        ✎ Log
                    </button>
                    <button
                        onClick={() => setContactRailMode('edit')}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px 6px', background: T.ink, border: 'none', borderRadius: T.r, fontSize: 12, fontWeight: 600, color: '#f5f1eb', cursor: 'pointer', fontFamily: T.sans }}>
                        Edit
                    </button>
                </div>
            )}

            {/* ── Sub-tabs ───────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
                {tabBtn('primary', 'Primary Info')}
                {tabBtn('additional', 'Additional Info')}
                {!isNew && tabBtn('activity', 'Activity')}
            </div>

            {/* ── Scrollable body ────────────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 18px' }}>

                {/* ── Error banner ─────────────────────────────────────────── */}
                {(contactModalError || saveError) && (
                    <div style={{ background: '#fef2f2', border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: T.danger, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{contactModalError || saveError}</span>
                        <button onClick={() => { setContactModalError?.(null); setSaveError(null); }} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                    </div>
                )}

                {/* ── Duplicate warning ─────────────────────────────────────── */}
                {dupWarning && (
                    <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: T.r, padding: '10px 12px', marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, color: '#92400e', fontSize: 12, marginBottom: 4 }}>⚠ Duplicate contact found</div>
                        <div style={{ fontSize: 12, color: '#78350f', marginBottom: 8 }}>
                            <strong>{dupWarning.firstName} {dupWarning.lastName}</strong>{dupWarning.company ? ` at ${dupWarning.company}` : ''} already exists. Create anyway?
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => { setDupWarning(null); handleSave(); }}
                                style={{ padding: '4px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: T.r, fontWeight: 600, cursor: 'pointer', fontSize: 12, fontFamily: T.sans }}>
                                Yes, create duplicate
                            </button>
                            <button onClick={() => setDupWarning(null)}
                                style={{ padding: '4px 10px', background: '#fff', color: T.ink2, border: `1px solid ${T.border}`, borderRadius: T.r, fontWeight: 600, cursor: 'pointer', fontSize: 12, fontFamily: T.sans }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* ════════ TAB: Primary Info ════════ */}
                {activeTab === 'primary' && (
                    <>
                        <SectionHeading label="Name" />
                        {isEditing ? (
                            <div style={grid2}>
                                <FieldGroup label="Prefix">
                                    <select value={formData.prefix || ''} onChange={e => hc('prefix', e.target.value)}
                                        style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans }}>
                                        {['—','Mr.','Ms.','Mrs.','Dr.','Prof.'].map(p => <option key={p} value={p === '—' ? '' : p}>{p}</option>)}
                                    </select>
                                </FieldGroup>
                                <FieldGroup label="First Name *">
                                    <TextInput value={formData.firstName} onChange={v => hc('firstName', v)} />
                                </FieldGroup>
                                <FieldGroup label="Middle Name">
                                    <TextInput value={formData.middleName} onChange={v => hc('middleName', v)} />
                                </FieldGroup>
                                <FieldGroup label="Last Name *">
                                    <TextInput value={formData.lastName} onChange={v => hc('lastName', v)} />
                                </FieldGroup>
                                <FieldGroup label="Suffix">
                                    <TextInput value={formData.suffix} onChange={v => hc('suffix', v)} placeholder="Jr., III…" />
                                </FieldGroup>
                                <FieldGroup label="Nick Name">
                                    <TextInput value={formData.nickName} onChange={v => hc('nickName', v)} />
                                </FieldGroup>
                            </div>
                        ) : (
                            <div style={grid2}>
                                <ReadRow label="Full Name" value={[formData.prefix, formData.firstName, formData.middleName, formData.lastName, formData.suffix].filter(Boolean).join(' ')} wide />
                                {formData.nickName && <ReadRow label="Nick Name" value={formData.nickName} />}
                            </div>
                        )}

                        <SectionHeading label="Role at Company" />
                        {isEditing ? (
                            <div style={grid2}>
                                <FieldGroup label="Title" wide>
                                    <TextInput value={formData.title} onChange={v => hc('title', v)} placeholder="e.g. Plant Manager" />
                                </FieldGroup>
                                <FieldGroup label="Company" wide>
                                    <Typeahead
                                        value={companySearch}
                                        onChange={v => { setCompanySearch(v); hc('company', v); }}
                                        suggestions={allAccountNames}
                                        onSelect={handleSelectCompany}
                                        placeholder="Type to search accounts…"
                                    />
                                </FieldGroup>
                                <FieldGroup label="Department">
                                    <TextInput value={formData.department} onChange={v => hc('department', v)} />
                                </FieldGroup>
                                <FieldGroup label="Work Location">
                                    <TextInput value={formData.workLocation} onChange={v => hc('workLocation', v)} />
                                </FieldGroup>
                            </div>
                        ) : (
                            <div style={grid2}>
                                <ReadRow label="Title" value={formData.title} />
                                {/* Company chip — clicking opens Account rail (stack) */}
                                {formData.company && (
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Company</div>
                                        <button
                                            onClick={() => handleOpenAccountRail(formData.company)}
                                            style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '3px 10px', fontSize: 12, fontWeight: 600, color: T.ink, cursor: 'pointer', fontFamily: T.sans }}
                                        >
                                            {formData.company} →
                                        </button>
                                    </div>
                                )}
                                <ReadRow label="Department" value={formData.department} />
                                <ReadRow label="Work Location" value={formData.workLocation} />
                            </div>
                        )}

                        <SectionHeading label="Contact Methods" />
                        {isEditing ? (
                            <div style={grid2}>
                                <FieldGroup label="Work Email">
                                    <TextInput value={formData.email} onChange={v => hc('email', v)} type="email" />
                                </FieldGroup>
                                <FieldGroup label="Personal Email">
                                    <TextInput value={formData.personalEmail} onChange={v => hc('personalEmail', v)} type="email" />
                                </FieldGroup>
                                <FieldGroup label="Work Phone">
                                    <TextInput value={formData.phone} onChange={v => hc('phone', v)} type="tel" />
                                </FieldGroup>
                                <FieldGroup label="Mobile">
                                    <TextInput value={formData.mobile} onChange={v => hc('mobile', v)} type="tel" />
                                </FieldGroup>
                            </div>
                        ) : (
                            <div style={grid2}>
                                {formData.email && (
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Work Email</div>
                                        <a href={`mailto:${formData.email}`} style={{ fontSize: 13, color: '#3a5a7a', textDecoration: 'none' }}>{formData.email}</a>
                                    </div>
                                )}
                                {formData.personalEmail && (
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Personal Email</div>
                                        <a href={`mailto:${formData.personalEmail}`} style={{ fontSize: 13, color: '#3a5a7a', textDecoration: 'none' }}>{formData.personalEmail}</a>
                                    </div>
                                )}
                                {formData.phone && (
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Work Phone</div>
                                        <a href={`tel:${formData.phone}`} style={{ fontSize: 13, color: '#3a5a7a', textDecoration: 'none' }}>{formData.phone}</a>
                                    </div>
                                )}
                                {formData.mobile && (
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Mobile</div>
                                        <a href={`tel:${formData.mobile}`} style={{ fontSize: 13, color: '#3a5a7a', textDecoration: 'none' }}>{formData.mobile}</a>
                                    </div>
                                )}
                            </div>
                        )}

                        <SectionHeading label="Address" />
                        {isEditing ? (
                            <div style={grid2}>
                                <FieldGroup label="Street" wide>
                                    <TextInput value={formData.address} onChange={v => hc('address', v)} placeholder="123 Main St" />
                                </FieldGroup>
                                <FieldGroup label="Address Line 2" wide>
                                    <TextInput value={formData.address2} onChange={v => hc('address2', v)} placeholder="Suite, floor, unit…" />
                                </FieldGroup>
                                <FieldGroup label="City">
                                    <TextInput value={formData.city} onChange={v => hc('city', v)} />
                                </FieldGroup>
                                <FieldGroup label="State">
                                    <TextInput value={formData.state} onChange={v => hc('state', v)} />
                                </FieldGroup>
                                <FieldGroup label="ZIP">
                                    <TextInput value={formData.zip} onChange={v => hc('zip', v)} />
                                </FieldGroup>
                                <FieldGroup label="Country">
                                    <TextInput value={formData.country} onChange={v => hc('country', v)} />
                                </FieldGroup>
                            </div>
                        ) : (
                            <div>
                                {(formData.address || formData.city || formData.state) ? (
                                    <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.6 }}>
                                        {formData.address && <div>{formData.address}</div>}
                                        {formData.address2 && <div>{formData.address2}</div>}
                                        {(formData.city || formData.state || formData.zip) && (
                                            <div>{[formData.city, formData.state, formData.zip].filter(Boolean).join(', ')}</div>
                                        )}
                                        {formData.country && <div>{formData.country}</div>}
                                    </div>
                                ) : (
                                    <div style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic' }}>No address on file</div>
                                )}
                            </div>
                        )}

                        <div style={{ marginTop: 14 }}>
                            <SectionHeading label="CRM" />
                        </div>
                        {isEditing ? (
                            <div style={grid2}>
                                <FieldGroup label="Assign Rep">
                                    <Typeahead
                                        value={repSearch}
                                        onChange={setRepSearch}
                                        suggestions={allRepNames}
                                        onSelect={v => setRepSearch(v)}
                                        placeholder="Type or select rep…"
                                        dropUp
                                    />
                                </FieldGroup>
                                <FieldGroup label="Buyer Persona">
                                    <Typeahead
                                        value={personaSearch}
                                        onChange={v => { setPersonaSearch(v); hc('buyerPersona', v); }}
                                        suggestions={buyerPersonas.map(p => typeof p === 'string' ? p : p.name)}
                                        onSelect={v => { setPersonaSearch(v); hc('buyerPersona', v); }}
                                        placeholder="Type to search…"
                                        dropUp
                                    />
                                </FieldGroup>
                                {/* Do Not Contact toggle */}
                                <div style={{ gridColumn: '1 / -1', marginBottom: 10 }}>
                                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Do Not Contact</label>
                                    <div onClick={() => hc('doNotContact', !formData.doNotContact)}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '6px 10px', borderRadius: T.r, border: formData.doNotContact ? `1px solid ${T.danger}` : `1px solid ${T.border}`, background: formData.doNotContact ? '#fef2f2' : T.surface3 }}>
                                        <div style={{ width: 32, height: 18, borderRadius: 999, background: formData.doNotContact ? T.danger : '#d6d3ce', position: 'relative', flexShrink: 0, transition: 'background 0.2s' }}>
                                            <div style={{ position: 'absolute', width: 12, height: 12, background: '#fff', borderRadius: '50%', top: 3, left: formData.doNotContact ? 17 : 3, transition: 'left 0.2s' }} />
                                        </div>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: formData.doNotContact ? T.danger : T.ink2 }}>
                                            {formData.doNotContact ? '🚫 Do Not Contact — flagged' : 'Not flagged'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={grid2}>
                                <ReadRow label="Assigned Rep" value={formData.assignedRep} />
                                <ReadRow label="Buyer Persona" value={formData.buyerPersona} />
                                {formData.doNotContact && (
                                    <div style={{ gridColumn: '1 / -1', marginBottom: 10, background: '#fef2f2', border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: T.danger }}>
                                        🚫 Do Not Contact — flagged
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Open pipeline summary (view only) */}
                        {!isEditing && openOpps.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                                <SectionHeading label="Open Pipeline" />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {openOpps.slice(0, 5).map(o => (
                                        <div key={o.id} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '7px 10px', fontSize: 12 }}>
                                            <div style={{ fontWeight: 600, color: T.ink }}>{o.opportunityName || o.account}</div>
                                            <div style={{ color: T.ink3, marginTop: 2 }}>{o.stage} {o.value ? `· $${Number(o.value).toLocaleString()}` : ''}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ════════ TAB: Additional Info ════════ */}
                {activeTab === 'additional' && (
                    <>
                        {isEditing ? (
                            <div>
                                <FieldGroup label="Assistant's Name" wide>
                                    <TextInput value={formData.assistantName} onChange={v => hc('assistantName', v)} />
                                </FieldGroup>
                                <FieldGroup label="Home Address" wide>
                                    <TextInput value={formData.homeAddress} onChange={v => hc('homeAddress', v)} />
                                </FieldGroup>
                                <FieldGroup label="Notes" wide>
                                    <textarea
                                        value={formData.notes || ''}
                                        onChange={e => hc('notes', e.target.value)}
                                        rows={5}
                                        style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', resize: 'vertical' }}
                                    />
                                </FieldGroup>
                            </div>
                        ) : (
                            <div>
                                <ReadRow label="Assistant" value={formData.assistantName} wide />
                                <ReadRow label="Home Address" value={formData.homeAddress} wide />
                                {formData.notes ? (
                                    <>
                                        <SectionHeading label="Notes" />
                                        <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{formData.notes}</div>
                                    </>
                                ) : (
                                    <div style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic' }}>No additional info on file</div>
                                )}
                            </div>
                        )}

                        {/* Custom fields from settings */}
                        {(settings?.customFieldsByObject?.Contacts || []).filter(f => (f.visibility || '').includes('Detail')).length > 0 && (
                            <div style={{ marginTop: 14 }}>
                                <SectionHeading label="Custom Fields" />
                                <div style={grid2}>
                                    {(settings.customFieldsByObject.Contacts).filter(f => (f.visibility || '').includes('Detail')).map(f => {
                                        const key = f.api.replace(/^[^.]+\./, '');
                                        const val = formData[key] ?? formData[f.api] ?? '';
                                        if (!isEditing) return <ReadRow key={f.api} label={f.label} value={val || undefined} />;
                                        return (
                                            <FieldGroup key={f.api} label={f.label}>
                                                {f.type === 'Toggle' ? (
                                                    <input type="checkbox" checked={!!val} onChange={e => hc(key, e.target.checked)} style={{ width: 16, height: 16 }} />
                                                ) : f.type === 'Date' ? (
                                                    <input type="date" value={val} onChange={e => hc(key, e.target.value)} style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, fontFamily: T.sans }} />
                                                ) : (
                                                    <TextInput value={val} onChange={v => hc(key, v)} type={f.type === 'Number' ? 'number' : f.type === 'Email' ? 'email' : 'text'} />
                                                )}
                                            </FieldGroup>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ════════ TAB: Activity (view only) ════════ */}
                {activeTab === 'activity' && !isNew && (
                    <div>
                        {/* Open Opportunities */}
                        <SectionHeading label="Open Opportunities" />
                        {openOpps.length === 0 ? (
                            <div style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic', marginBottom: 16 }}>No open opportunities</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                                {openOpps.map(o => (
                                    <div key={o.id} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '8px 10px' }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{o.opportunityName || o.account}</div>
                                        <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>
                                            {o.stage}{o.value ? ` · $${Number(o.value).toLocaleString()}` : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Activity History */}
                        <SectionHeading label={`Activity History (${contactActivities.length})`} />
                        {contactActivities.length === 0 ? (
                            <div style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic', marginBottom: 16 }}>No activity history</div>
                        ) : (
                            <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden', marginBottom: 16 }}>
                                {contactActivities.map((a, idx) => {
                                    const relOpp = a.opportunityId ? (opportunities || []).find(o => o.id === a.opportunityId) : null;
                                    return (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderBottom: idx < contactActivities.length - 1 ? `1px solid ${T.border}` : 'none', background: idx % 2 === 0 ? '#fff' : T.surface }}>
                                            <span style={{ fontSize: 11, color: T.ink3, flexShrink: 0, width: 52, paddingTop: 1 }}>
                                                {a.date ? new Date(a.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                            </span>
                                            <span style={{ background: 'rgba(58,90,122,0.1)', color: T.ink, padding: '1px 5px', borderRadius: 3, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{a.type || 'Note'}</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, color: T.ink2 }}>{a.notes || a.subject || 'No details'}</div>
                                                {relOpp && <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>{relOpp.opportunityName || relOpp.account}</div>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                onClick={() => { setActivityInitialContext && setActivityInitialContext({ contactId: contact?.id }); setShowActivityModal(true); }}
                                style={{ flex: 1, padding: '8px', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                + Log Activity
                            </button>
                            <button
                                onClick={() => { setTaskRailId('new'); setTaskRailMode('new'); }}
                                style={{ flex: 1, padding: '8px', background: T.surface2, color: T.ink2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                + Add Task
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Footer: Save/Discard (edit mode only) ─────────────────────── */}
            {isEditing && (
                <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: '12px 16px', background: T.surface, display: 'flex', gap: 8, alignItems: 'center' }}>
                    {dirty && (
                        <span style={{ fontSize: 11, color: T.ink3, flex: 1 }}>Unsaved changes</span>
                    )}
                    <button onClick={handleDiscard}
                        style={{ padding: '8px 16px', background: T.surface2, color: T.ink2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, marginLeft: 'auto' }}>
                        Discard
                    </button>
                    <button onClick={handleSave} disabled={contactModalSaving}
                        style={{ padding: '8px 20px', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 700, cursor: contactModalSaving ? 'not-allowed' : 'pointer', fontFamily: T.sans, opacity: contactModalSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {contactModalSaving && <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                        {contactModalSaving ? 'Saving…' : isNew ? 'Create Contact' : 'Save Changes'}
                    </button>
                </div>
            )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
}
