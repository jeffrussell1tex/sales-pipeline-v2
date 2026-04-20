import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

// ── V1 Design tokens ──────────────────────────────────────────
const T = {
    bg:           '#f0ece4',
    surface:      '#fbf8f3',
    surface2:     '#f5efe3',
    border:       '#e6ddd0',
    borderStrong: '#d4c8b4',
    ink:          '#2a2622',
    inkMid:       '#5a544c',
    inkMuted:     '#8a8378',
    gold:         '#c8b99a',
    goldInk:      '#7a6a48',
    danger:       '#9c3a2e',
    warn:         '#b87333',
    ok:           '#4d6b3d',
    info:         '#3a5a7a',
    sans:         '"Plus Jakarta Sans", system-ui, sans-serif',
    serif:        'Georgia, serif',
    r:            3,
};

const avatarBg = name => {
    const p = ['#9c6b4a','#7a5a3c','#5a6e5a','#6b5a7a','#8a5a5a','#5a7a8a','#7a6b5a','#4a6b5a'];
    let h = 0; for (let i = 0; i < (name||'').length; i++) h = (h*31 + (name||'').charCodeAt(i))|0;
    return p[Math.abs(h) % p.length];
};

const Icon = ({ name, size=13, color='currentColor' }) => {
    const p = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:color, strokeWidth:1.75, strokeLinecap:'round', strokeLinejoin:'round' };
    switch(name) {
        case 'search':  return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
        case 'export':  return <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>;
        case 'plus':    return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
        case 'dots':    return <svg {...p}><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>;
        case 'import':  return <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>;
        default: return null;
    }
};

export default function ContactsTab() {
    const {
        contacts, setContacts,
        opportunities, accounts, activities, tasks, settings,
        currentUser, userRole, canSeeAll,
        exportToCSV,
        showConfirm, softDelete,
        visibleContacts,
        handleDeleteContact,
        setEditingContact, setShowContactModal,
        setCsvImportType, setShowCsvImportModal,
        viewingContact, setViewingContact,
        contactsSortBy, setContactsSortBy,
        selectedContacts, setSelectedContacts,
        isMobile,
    } = useApp();

    const isReadOnly = userRole === 'ReadOnly';
    const canEdit    = !isReadOnly;

    // ── State ─────────────────────────────────────────────────
    const [search,      setSearch]      = useState('');
    const [selectMode,  setSelectMode]  = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const searchRef = useRef(null);

    // ── Handlers ──────────────────────────────────────────────
    const handleAddContact  = () => { setEditingContact(null); setShowContactModal(true); };
    const handleEditContact = (c)  => { setEditingContact(c); setShowContactModal(true); };

    const handleDeleteSelected = () => {
        if (!selectedIds.length) return;
        showConfirm(`Delete ${selectedIds.length} contact${selectedIds.length > 1 ? 's' : ''}? This cannot be undone.`, async () => {
            const toDelete = [...selectedIds];
            const snapshot = [...(contacts || [])];
            setContacts(prev => prev.filter(c => !toDelete.includes(c.id)));
            setSelectedIds([]);
            setSelectMode(false);
            const deletingAll = toDelete.length === contacts.length;
            if (deletingAll) {
                await dbFetch('/.netlify/functions/contacts?clear=true', { method: 'DELETE' }).catch(console.error);
            } else {
                for (const id of toDelete) {
                    await dbFetch(`/.netlify/functions/contacts?id=${id}`, { method: 'DELETE' }).catch(console.error);
                }
            }
            softDelete(
                `${toDelete.length} contact${toDelete.length === 1 ? '' : 's'}`,
                () => {},
                () => {
                    setContacts(snapshot);
                    const deleted = snapshot.filter(c => toDelete.includes(c.id));
                    deleted.forEach(c => dbFetch('/.netlify/functions/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) }).catch(console.error));
                }
            );
        });
    };

    const toggleSelect    = id  => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const toggleSelectAll = ()  => setSelectedIds(prev => prev.length === sorted.length ? [] : sorted.map(c => c.id));

    // ── Sort + filter ─────────────────────────────────────────
    const sortField = contactsSortBy === 'firstName' ? 'firstName' : contactsSortBy === 'company' ? 'company' : 'lastName';

    const sorted = useMemo(() => {
        let list = visibleContacts;
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(c =>
                (c.firstName||'').toLowerCase().includes(q) ||
                (c.lastName||'').toLowerCase().includes(q) ||
                (c.company||'').toLowerCase().includes(q) ||
                (c.email||'').toLowerCase().includes(q) ||
                (c.title||'').toLowerCase().includes(q)
            );
        }
        return [...list].sort((a, b) => {
            if (contactsSortBy === 'lastName')   return (a.lastName||'').localeCompare(b.lastName||'');
            if (contactsSortBy === 'firstName')  return (a.firstName||'').localeCompare(b.firstName||'');
            const cmp = (a.company||'').localeCompare(b.company||'');
            return cmp !== 0 ? cmp : (a.lastName||'').localeCompare(b.lastName||'');
        });
    }, [visibleContacts, search, contactsSortBy]);

    // Opp count per contact
    const oppCount = useMemo(() => {
        const map = {};
        (visibleContacts || []).forEach(c => {
            const name = (c.firstName + ' ' + c.lastName).trim().toLowerCase();
            map[c.id] = (opportunities || []).filter(o =>
                (o.contactIds && o.contactIds.includes(c.id)) ||
                (o.contacts && o.contacts.split(',').map(s => s.trim().toLowerCase()).some(n => n === name || n.startsWith(name + ' (')))
            ).length;
        });
        return map;
    }, [visibleContacts, opportunities]);

    // ── Sort tabs (underline style per style guide) ───────────
    const SortTabs = () => (
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.border}`, marginBottom: 2 }}>
            {[
                { key: 'lastName',  label: 'Last Name'  },
                { key: 'firstName', label: 'First Name' },
                { key: 'company',   label: 'Company'    },
            ].map(opt => {
                const active = contactsSortBy === opt.key;
                return (
                    <button key={opt.key} onClick={() => setContactsSortBy(opt.key)} style={{
                        padding: '8px 16px', border: 'none',
                        borderBottom: active ? `2px solid ${T.ink}` : '2px solid transparent',
                        background: 'transparent',
                        color: active ? T.ink : T.inkMuted,
                        fontSize: 12, fontWeight: active ? 600 : 400,
                        cursor: 'pointer', fontFamily: T.sans,
                        transition: 'color 120ms, border-color 120ms',
                        whiteSpace: 'nowrap', marginBottom: -1,
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = T.inkMid; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = T.inkMuted; }}>
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );

    // ── Letter jump bar ───────────────────────────────────────
    const LetterBar = () => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, padding: '6px 12px', borderBottom: `1px solid ${T.border}`, background: T.surface2 }}>
            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => {
                const hasMatch = sorted.some(c => ((c[sortField]||'')[0]||'').toUpperCase() === letter);
                return (
                    <div key={letter}
                        onClick={() => {
                            if (!hasMatch) return;
                            const el = document.getElementById('contact-letter-' + letter);
                            if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
                        }}
                        style={{
                            fontSize: 10, fontWeight: 700, width: 20, height: 18,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: hasMatch ? T.info : T.border,
                            cursor: hasMatch ? 'pointer' : 'default',
                            borderRadius: T.r, userSelect: 'none', transition: 'all 80ms',
                            fontFamily: T.sans,
                        }}
                        onMouseEnter={e => { if (hasMatch) { e.currentTarget.style.background = T.surface2; e.currentTarget.style.color = T.ink; } }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = hasMatch ? T.info : T.border; }}>
                        {letter}
                    </div>
                );
            })}
        </div>
    );

    // ── Table header ──────────────────────────────────────────
    const TableHeader = () => (
        <div style={{
            display: 'grid',
            gridTemplateColumns: selectMode ? '36px 1.8fr 1.4fr 1fr 1fr 1.6fr 28px' : '1.8fr 1.4fr 1fr 1fr 1.6fr 28px',
            alignItems: 'center', height: 34, padding: '0 14px',
            background: T.surface2, borderBottom: `1px solid ${T.border}`,
            fontSize: 10, fontWeight: 700, color: T.inkMuted,
            letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: T.sans,
        }}>
            {selectMode && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={toggleSelectAll}>
                    <div style={{ width: 14, height: 14, borderRadius: T.r, border: `1.5px solid ${selectedIds.length === sorted.length && sorted.length > 0 ? T.ink : T.borderStrong}`, background: selectedIds.length === sorted.length && sorted.length > 0 ? T.ink : 'transparent', cursor: 'pointer' }} />
                </div>
            )}
            <div style={{ paddingLeft: 2 }}>Name</div>
            <div>Company</div>
            <div>Title</div>
            <div>Phone</div>
            <div>Email</div>
            <div />
        </div>
    );

    // ── Contact row ───────────────────────────────────────────
    const ContactRow = ({ contact, isEven, anchorId }) => {
        const [hov, setHov] = useState(false);
        const isSelected = selectedIds.includes(contact.id);
        const initials   = ((contact.firstName||'')[0]||'') + ((contact.lastName||'')[0]||'');
        const opps       = oppCount[contact.id] || 0;

        return (
            <div
                id={anchorId || undefined}
                onMouseEnter={() => setHov(true)}
                onMouseLeave={() => setHov(false)}
                onClick={() => selectMode ? toggleSelect(contact.id) : setViewingContact(contact)}
                style={{
                    display: 'grid',
                    gridTemplateColumns: selectMode ? '36px 1.8fr 1.4fr 1fr 1fr 1.6fr 28px' : '1.8fr 1.4fr 1fr 1fr 1.6fr 28px',
                    alignItems: 'center', height: 48, padding: '0 14px',
                    borderBottom: `1px solid ${T.border}`,
                    background: isSelected ? 'rgba(42,38,34,0.04)' : hov ? T.surface2 : isEven ? T.surface : T.bg,
                    cursor: 'pointer', fontFamily: T.sans, transition: 'background 80ms',
                }}>

                {/* Checkbox in select mode */}
                {selectMode && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={e => { e.stopPropagation(); toggleSelect(contact.id); }}>
                        <div style={{ width: 16, height: 16, borderRadius: T.r, border: `1.5px solid ${isSelected ? T.ink : T.borderStrong}`, background: isSelected ? T.ink : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 120ms' }}>
                            {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fbf8f3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>}
                        </div>
                    </div>
                )}

                {/* Name + avatar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: avatarBg(contact.firstName + contact.lastName), color: '#fef4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase' }}>
                        {initials || '?'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {contact.firstName} {contact.lastName}
                            </span>
                            {opps > 0 && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: T.info, background: `${T.info}18`, padding: '1px 5px', borderRadius: 999, flexShrink: 0, border: `1px solid ${T.info}30` }}>
                                    {opps} opp{opps > 1 ? 's' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Company */}
                <div style={{ fontSize: 12, color: T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                    {contact.company || '—'}
                </div>

                {/* Title */}
                <div style={{ fontSize: 12, color: T.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                    {contact.title || '—'}
                </div>

                {/* Phone */}
                <div style={{ fontSize: 12, color: T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                    {contact.phone || '—'}
                </div>

                {/* Email */}
                <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                    {contact.email
                        ? <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()} style={{ color: T.info, textDecoration: 'none', fontFamily: T.sans }}
                            onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                            onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}>
                            {contact.email}
                          </a>
                        : <span style={{ color: T.inkMuted }}>—</span>
                    }
                </div>

                {/* Actions ⋯ */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => { e.stopPropagation(); handleEditContact(contact); }}>
                    <Icon name="dots" size={14} color={hov ? T.inkMid : T.border} />
                </div>
            </div>
        );
    };

    // ── Company group header (Company sort) ───────────────────
    const CompanyHeader = ({ company, count }) => (
        <div style={{
            padding: '5px 14px', background: T.surface2, borderBottom: `1px solid ${T.border}`,
            fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase',
            letterSpacing: 0.6, fontFamily: T.sans, display: 'flex', alignItems: 'center', gap: 8,
        }}>
            <span style={{ color: T.ink }}>{company}</span>
            <span style={{ color: T.border }}>({count})</span>
        </div>
    );

    // ── Build rows with letter anchors / company headers ──────
    const rows = useMemo(() => {
        const result = [];
        let lastLetter  = '';
        let lastCompany = null;

        sorted.forEach((contact, i) => {
            const firstChar = ((contact[sortField]||'')[0]||'').toUpperCase();
            let anchorId = null;

            if (contactsSortBy === 'company') {
                const co = (contact.company||'').trim() || '(No Company)';
                if (co !== lastCompany) {
                    lastCompany = co;
                    const count = sorted.filter(c => ((c.company||'').trim()||'(No Company)') === co).length;
                    // Anchor on first char of company name
                    if (firstChar !== lastLetter) { lastLetter = firstChar; anchorId = 'contact-letter-' + firstChar; }
                    result.push({ type: 'company-header', key: 'co-' + co, company: co, count, anchorId });
                    anchorId = null;
                }
            } else {
                if (firstChar !== lastLetter) { lastLetter = firstChar; anchorId = 'contact-letter-' + firstChar; }
            }

            result.push({ type: 'row', key: contact.id, contact, isEven: i % 2 === 0, anchorId });
        });
        return result;
    }, [sorted, contactsSortBy, sortField]);

    // ── Empty state ───────────────────────────────────────────
    const EmptyState = () => (
        <div style={{ padding: '3rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
            {search ? `No contacts matching "${search}".` : 'No contacts yet.'}
            {canEdit && !search && (
                <div style={{ marginTop: 12 }}>
                    <button onClick={handleAddContact} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: T.ink, border: 'none', color: T.surface, fontSize: 12, fontWeight: 600, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                        <Icon name="plus" size={12} color={T.surface} /> New contact
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="tab-page" style={{ fontFamily: T.sans }}>

            {/* ── Page header ── */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, paddingBottom: 12 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 28, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 5 }}>
                        Contacts
                    </div>
                    <div style={{ fontSize: 12, color: T.inkMuted }}>
                        <span style={{ fontWeight: 600, color: T.ink }}>{sorted.length}</span> contacts
                        {search && <span> matching <em>"{search}"</em></span>}
                        <span style={{ margin: '0 6px', color: T.border }}>·</span>
                        sorted by {contactsSortBy === 'lastName' ? 'last name' : contactsSortBy === 'firstName' ? 'first name' : 'company'}
                    </div>
                </div>

                {/* Right buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                    {/* Search */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface, minWidth: 180 }}>
                        <Icon name="search" size={13} color={T.inkMuted} />
                        <input
                            ref={searchRef}
                            defaultValue=""
                            onKeyDown={e => {
                                if (e.key === 'Enter')  setSearch(e.currentTarget.value);
                                if (e.key === 'Escape') { e.currentTarget.value = ''; setSearch(''); }
                            }}
                            placeholder="Search… (Enter)"
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: T.ink, fontFamily: T.sans, width: '100%' }}
                        />
                    </div>

                    {/* Export */}
                    <button onClick={() => exportToCSV?.(`contacts-${new Date().toISOString().slice(0,10)}.csv`, ['First Name','Last Name','Company','Title','Phone','Email'], sorted.map(c => [c.firstName||'',c.lastName||'',c.company||'',c.title||'',c.phone||'',c.email||'']))}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'transparent', border: `1px solid ${T.border}`, color: T.inkMid, fontSize: 12, fontWeight: 400, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <Icon name="export" size={12} color={T.inkMid} /> Export
                    </button>

                    {/* Delete (in select mode with selection) */}
                    {canEdit && selectMode && selectedIds.length > 0 && (
                        <button onClick={handleDeleteSelected} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: T.danger, border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                            Delete ({selectedIds.length})
                        </button>
                    )}

                    {/* Select toggle */}
                    {canEdit && (
                        <button onClick={() => { setSelectMode(m => !m); setSelectedIds([]); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: selectMode ? T.surface2 : 'transparent', border: `1px solid ${selectMode ? T.borderStrong : T.border}`, color: T.inkMid, fontSize: 12, fontWeight: selectMode ? 600 : 400, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                            {selectMode ? 'Cancel' : 'Select'}
                        </button>
                    )}

                    {/* Import */}
                    {canEdit && (
                        <button onClick={() => { setCsvImportType?.('contacts'); setShowCsvImportModal?.(true); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'transparent', border: `1px solid ${T.border}`, color: T.inkMid, fontSize: 12, fontWeight: 400, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}
                            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <Icon name="import" size={12} color={T.inkMid} /> Import
                        </button>
                    )}

                    {/* New contact */}
                    {canEdit && (
                        <button onClick={handleAddContact} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: T.ink, border: 'none', color: T.surface, fontSize: 12, fontWeight: 600, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                            <Icon name="plus" size={12} color={T.surface} /> New contact
                        </button>
                    )}
                </div>
            </div>

            {/* ── Sort tabs ── */}
            <SortTabs />

            {/* ── Contacts table ── */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                {sorted.length === 0 ? (
                    <EmptyState />
                ) : (
                    <>
                        <LetterBar />
                        <TableHeader />
                        {rows.map(r => {
                            if (r.type === 'company-header') {
                                return <CompanyHeader key={r.key} company={r.company} count={r.count} />;
                            }
                            return (
                                <ContactRow
                                    key={r.key}
                                    contact={r.contact}
                                    isEven={r.isEven}
                                    anchorId={r.anchorId}
                                />
                            );
                        })}
                    </>
                )}
            </div>
        </div>
    );
}
