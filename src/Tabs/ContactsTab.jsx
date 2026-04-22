import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

// ── Design tokens ─────────────────────────────────────────────
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

const fmtArr = v => {
    const n = parseFloat(v) || 0;
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n.toLocaleString();
};

const avatarBg = name => {
    const p = ['#9c6b4a','#7a5a3c','#5a6e5a','#6b5a7a','#8a5a5a','#5a7a8a','#7a6b5a','#4a6b5a'];
    let h = 0; for (let i = 0; i < (name||'').length; i++) h = (h*31 + (name||'').charCodeAt(i))|0;
    return p[Math.abs(h) % p.length];
};

const relDate = d => {
    if (!d) return '—';
    const days = Math.floor((Date.now() - new Date(d+'T12:00:00').getTime()) / 86400000);
    if (days === 0)  return 'Today';
    if (days === 1)  return '1d ago';
    if (days < 7)   return days + 'd ago';
    if (days < 30)  return Math.floor(days/7) + 'wk ago';
    if (days < 365) return Math.floor(days/30) + 'mo ago';
    return Math.floor(days/365) + 'yr ago';
};

const Icon = ({ name, size=13, color='currentColor' }) => {
    const p = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:color, strokeWidth:1.75, strokeLinecap:'round', strokeLinejoin:'round' };
    switch(name) {
        case 'search':  return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
        case 'plus':    return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
        case 'dots':    return <svg {...p}><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>;
        case 'export':  return <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>;
        case 'import':  return <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10" transform="rotate(180 12 12)"/><line x1="12" y1="3" x2="12" y2="15"/></svg>;
        case 'chevron': return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
        case 'building':return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></svg>;
        default: return null;
    }
};

export default function ContactsTab() {
    const {
        contacts, setContacts,
        opportunities, accounts, activities, settings,
        currentUser, userRole, canSeeAll,
        showConfirm, softDelete,
        visibleContacts,
        handleDeleteContact,
        setEditingContact, setShowContactModal,
        viewingContact, setViewingContact,
        viewingAccount, setViewingAccount,
        contactsSortBy, setContactsSortBy,
        selectedContacts, setSelectedContacts,
        exportToCSV, exportingCSV,
        setCsvImportType, setShowCsvImportModal,
        getAccountRollup,
        isMobile,
    } = useApp();

    const isReadOnly = userRole === 'ReadOnly';
    const canEdit    = !isReadOnly;

    // ── State ─────────────────────────────────────────────────
    const [search,         setSearch]         = useState('');
    const [selectMode,     setSelectMode]      = useState(false);
    const [selectedIds,    setSelectedIds]     = useState([]);
    const [selectedCompany, setSelectedCompany] = useState(null); // for company two-pane

    // ── Sort field mapping ────────────────────────────────────
    const sortField = contactsSortBy === 'firstName' ? 'firstName'
                    : contactsSortBy === 'company'   ? 'company'
                    : 'lastName';

    // ── Filtered + sorted contacts ────────────────────────────
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
            if (contactsSortBy === 'lastName')  return (a.lastName||'').localeCompare(b.lastName||'');
            if (contactsSortBy === 'firstName') return (a.firstName||'').localeCompare(b.firstName||'');
            const cmp = (a.company||'').localeCompare(b.company||'');
            return cmp !== 0 ? cmp : (a.lastName||'').localeCompare(b.lastName||'');
        });
    }, [visibleContacts, search, contactsSortBy]);

    // ── Opp count per contact ────────────────────────────────
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

    // ── Company list for two-pane (Company sort mode) ─────────
    // Build unique company list from visible contacts + match to accounts
    const companyList = useMemo(() => {
        if (contactsSortBy !== 'company') return [];
        const coMap = {};
        sorted.forEach(c => {
            const co = (c.company || '').trim() || '(No Company)';
            if (!coMap[co]) coMap[co] = { name: co, contacts: [] };
            coMap[co].contacts.push(c);
        });
        return Object.values(coMap).sort((a, b) => a.name.localeCompare(b.name));
    }, [sorted, contactsSortBy]);

    // Auto-select first company when list changes
    React.useEffect(() => {
        if (contactsSortBy === 'company' && companyList.length > 0 && !selectedCompany) {
            setSelectedCompany(companyList[0].name);
        }
        if (contactsSortBy === 'company' && companyList.length > 0 && selectedCompany) {
            // Ensure selected company is still valid
            if (!companyList.find(c => c.name === selectedCompany)) {
                setSelectedCompany(companyList[0].name);
            }
        }
    }, [companyList, contactsSortBy]);

    // ── Handlers ─────────────────────────────────────────────
    const handleAddContact  = () => { setEditingContact(null); setShowContactModal(true); };
    const handleEditContact = (c) => { setEditingContact(c); setShowContactModal(true); };

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
                    deleted.forEach(c => dbFetch('/.netlify/functions/contacts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(c),
                    }).catch(console.error));
                }
            );
        });
    };

    const toggleSelect    = id  => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const toggleSelectAll = ()  => setSelectedIds(prev => prev.length === sorted.length ? [] : sorted.map(c => c.id));

    const handleExport = () => {
        const headers = ['First Name', 'Last Name', 'Company', 'Title', 'Email', 'Phone', 'Role'];
        const rows = sorted.map(c => [c.firstName||'', c.lastName||'', c.company||'', c.title||'', c.email||'', c.phone||'', c.role||'']);
        exportToCSV(`contacts-${new Date().toISOString().slice(0,10)}.csv`, headers, rows, 'contacts');
    };

    // ── Rows with letter anchors / company headers (flat modes) ──
    const rows = useMemo(() => {
        if (contactsSortBy === 'company') return []; // handled separately in two-pane
        const result = [];
        let lastLetter = '';
        sorted.forEach((contact, i) => {
            const firstChar = ((contact[sortField]||'')[0]||'').toUpperCase();
            let anchorId = null;
            if (firstChar !== lastLetter) { lastLetter = firstChar; anchorId = 'contact-letter-' + firstChar; }
            result.push({ type: 'row', key: contact.id, contact, isEven: i % 2 === 0, anchorId });
        });
        return result;
    }, [sorted, contactsSortBy, sortField]);

    // ── Sort tabs ─────────────────────────────────────────────
    const SortTabs = () => (
        <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.border}`, marginBottom: contactsSortBy === 'company' ? 0 : 2 }}>
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
            <div style={{ flex: 1 }} />
            <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans, paddingBottom: 4, paddingRight: 4 }}>
                {sorted.length} contact{sorted.length !== 1 ? 's' : ''}
                {contactsSortBy === 'company' && companyList.length > 0 && ` · ${companyList.length} companies`}
            </div>
        </div>
    );

    // ── Letter jump bar (flat modes only) ─────────────────────
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

    // ── Table column header (flat modes) ─────────────────────
    const TableHeader = () => (
        <div style={{
            display: 'grid',
            gridTemplateColumns: selectMode ? '36px 1.8fr 1.4fr 1fr 1fr 1.6fr 28px' : '1.8fr 1.4fr 1fr 1fr 1.6fr 28px',
            alignItems: 'center', height: 34, padding: '0 14px',
            background: T.surface2, borderBottom: `1px solid ${T.border}`,
            fontSize: 10, fontWeight: 700, color: T.inkMuted,
            letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: T.sans,
            position: 'sticky', top: 0, zIndex: 1,
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

    // ── Contact row (flat modes) ──────────────────────────────
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

                {/* Checkbox */}
                {selectMode && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={e => { e.stopPropagation(); toggleSelect(contact.id); }}>
                        <div style={{ width: 16, height: 16, borderRadius: T.r, border: `1.5px solid ${isSelected ? T.ink : T.borderStrong}`, background: isSelected ? T.ink : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 120ms' }}>
                            {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fbf8f3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>}
                        </div>
                    </div>
                )}

                {/* Name + avatar + badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: avatarBg(contact.firstName + contact.lastName), color: '#fef4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase' }}>
                        {initials || '?'}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {contact.firstName} {contact.lastName}
                            </span>
                            {contact.isVip && <span style={{ fontSize: 8, fontWeight: 700, color: T.goldInk, background: 'rgba(200,185,154,0.2)', padding: '1px 5px', borderRadius: 2, border: `1px solid ${T.gold}`, letterSpacing: 0.5, flexShrink: 0 }}>VIP</span>}
                            {contact.isDnc && <span style={{ fontSize: 8, fontWeight: 700, color: T.danger, background: 'rgba(156,58,46,0.1)', padding: '1px 5px', borderRadius: 2, border: `1px solid rgba(156,58,46,0.3)`, letterSpacing: 0.5, flexShrink: 0 }}>DNC</span>}
                            {opps > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: T.info, background: `${T.info}18`, padding: '1px 5px', borderRadius: 999, flexShrink: 0, border: `1px solid ${T.info}30` }}>{opps} opp{opps > 1 ? 's' : ''}</span>}
                        </div>
                        {contact.role && (
                            <div style={{ fontSize: 10, color: T.inkMuted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.role}</div>
                        )}
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
                        ? <a href={`mailto:${contact.email}`} onClick={e => e.stopPropagation()}
                            style={{ color: T.info, textDecoration: 'none', fontFamily: T.sans }}
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

    // ── Company two-pane (Company sort mode) ──────────────────
    const CompanyTwoPane = () => {
        const [coSearch, setCoSearch] = useState('');

        const filteredCompanies = useMemo(() => {
            if (!coSearch.trim()) return companyList;
            const q = coSearch.toLowerCase();
            return companyList.filter(c => c.name.toLowerCase().includes(q));
        }, [companyList, coSearch]);

        const activeCompany = selectedCompany
            ? companyList.find(c => c.name === selectedCompany) || companyList[0]
            : companyList[0];

        // Find matching account record for rollup
        const matchedAccount = useMemo(() => {
            if (!activeCompany) return null;
            return (accounts || []).find(a => a.name?.toLowerCase() === activeCompany.name.toLowerCase());
        }, [activeCompany, accounts]);

        // Use getAccountRollup if we found an account, else compute from contacts
        const rollup = useMemo(() => {
            if (matchedAccount) return getAccountRollup(matchedAccount);
            // Fallback: compute from opportunities directly
            const coName = (activeCompany?.name || '').toLowerCase();
            const openOpps = (opportunities || []).filter(o =>
                (o.account||'').toLowerCase() === coName &&
                o.stage !== 'Closed Won' && o.stage !== 'Closed Lost'
            );
            const pipeline = openOpps.reduce((s, o) => s + (parseFloat(o.arr)||0), 0);
            return { pipeline, openOpps, allContacts: activeCompany?.contacts || [] };
        }, [matchedAccount, activeCompany]);

        // Last touch — most recent activity linked to any opp at this company
        const lastTouch = useMemo(() => {
            if (!activeCompany) return null;
            const coName = activeCompany.name.toLowerCase();
            const coOpps = (opportunities || []).filter(o => (o.account||'').toLowerCase() === coName);
            const oppIds = new Set(coOpps.map(o => o.id));
            const acts   = (activities || []).filter(a =>
                (a.company||'').toLowerCase() === coName ||
                (a.opportunityId && oppIds.has(a.opportunityId))
            ).sort((a, b) => (b.date||'').localeCompare(a.date||''));
            return acts[0]?.date || null;
        }, [activeCompany]);

        const initials = (activeCompany?.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

        if (!activeCompany) return (
            <div style={{ padding: '3rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
                No companies match.
            </div>
        );

        return (
            <div style={{ display: 'flex', gap: 14, flex: 1, minHeight: 0, overflow: 'hidden' }}>

                {/* LEFT — Company list */}
                <div style={{ width: 280, flexShrink: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Search */}
                    <div style={{ padding: '10px 12px', borderBottom: `1px solid ${T.border}`, background: T.surface2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '5px 10px' }}>
                            <Icon name="search" size={12} color={T.inkMuted} />
                            <input
                                value={coSearch}
                                onChange={e => setCoSearch(e.target.value)}
                                placeholder="Search companies…"
                                style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: T.ink, width: '100%', fontFamily: T.sans }}
                            />
                            {coSearch && (
                                <button onClick={() => setCoSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMuted, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: T.inkMuted, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans }}>
                            <span>Companies</span>
                            <span>{filteredCompanies.length}</span>
                        </div>
                    </div>

                    {/* Company list */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {filteredCompanies.map(co => {
                            const active = co.name === (activeCompany?.name);
                            return (
                                <div key={co.name}
                                    onClick={() => setSelectedCompany(co.name)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 14px',
                                        borderBottom: `1px solid ${T.border}`,
                                        background: active ? T.surface2 : 'transparent',
                                        borderLeft: `3px solid ${active ? T.ink : 'transparent'}`,
                                        cursor: 'pointer', transition: 'background 80ms',
                                    }}
                                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = T.bg; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = active ? T.surface2 : 'transparent'; }}>
                                    <div style={{ width: 32, height: 32, borderRadius: T.r, background: avatarBg(co.name), color: '#fef4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                                        {co.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: active ? 700 : 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{co.name}</div>
                                        <div style={{ fontSize: 10, color: T.inkMuted, marginTop: 1 }}>{co.contacts.length} contact{co.contacts.length !== 1 ? 's' : ''}</div>
                                    </div>
                                    {active && <Icon name="chevron" size={12} color={T.inkMuted} />}
                                </div>
                            );
                        })}
                        {filteredCompanies.length === 0 && (
                            <div style={{ padding: '2rem', textAlign: 'center', color: T.inkMuted, fontSize: 12, fontFamily: T.sans }}>No companies match.</div>
                        )}
                    </div>
                </div>

                {/* RIGHT — Company detail + contacts */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {/* Company header card */}
                    <div style={{
                        background: T.surface, border: `1px solid ${T.border}`,
                        borderLeft: `3px solid ${T.gold}`,
                        borderRadius: `0 ${T.r+1}px ${T.r+1}px 0`,
                        padding: '14px 20px',
                        display: 'flex', alignItems: 'center', gap: 16,
                        marginBottom: 12, flexShrink: 0,
                    }}>
                        {/* Company monogram */}
                        <div style={{
                            width: 48, height: 48, borderRadius: T.r,
                            background: T.ink, color: T.gold,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: T.serif, fontStyle: 'italic', fontSize: 20, letterSpacing: -0.5,
                            flexShrink: 0,
                        }}>{initials}</div>

                        {/* Name + meta */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 22, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, color: T.ink, letterSpacing: -0.5, lineHeight: 1, marginBottom: 4 }}>
                                {activeCompany.name}
                            </div>
                            {matchedAccount && (
                                <div style={{ fontSize: 12, color: T.inkMuted }}>
                                    {matchedAccount.verticalMarket || matchedAccount.industry || ''}
                                    {matchedAccount.employeeCount ? ` · ${matchedAccount.employeeCount} employees` : ''}
                                </div>
                            )}
                        </div>

                        {/* Stats */}
                        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexShrink: 0 }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>Contacts</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, fontFamily: T.sans, lineHeight: 1.2 }}>{activeCompany.contacts.length}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>Open pipe</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: rollup.pipeline > 0 ? T.ink : T.inkMuted, fontFamily: T.sans, lineHeight: 1.2 }}>{rollup.pipeline > 0 ? fmtArr(rollup.pipeline) : '—'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>Last touch</div>
                                <div style={{ fontSize: 14, color: T.inkMid, fontWeight: 500, fontFamily: T.sans, lineHeight: 1.4 }}>{relDate(lastTouch)}</div>
                            </div>
                            {/* Divider */}
                            <div style={{ width: 1, height: 36, background: T.border }} />
                            {/* Open account button */}
                            {matchedAccount && (
                                <button
                                    onClick={() => setViewingAccount(matchedAccount)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: T.r, color: T.inkMid, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}
                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <Icon name="building" size={12} color={T.inkMid} />
                                    Open account
                                </button>
                            )}
                            {canEdit && (
                                <button
                                    onClick={() => { setEditingContact(null); setShowContactModal(true); }}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: T.ink, border: 'none', borderRadius: T.r, color: T.surface, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                                    <Icon name="plus" size={12} color={T.surface} />
                                    Add contact
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Section label */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexShrink: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: T.sans }}>
                            People at {activeCompany.name}
                        </div>
                        <div style={{ flex: 1, height: 1, background: T.border }} />
                    </div>

                    {/* Contact cards for selected company */}
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                            {activeCompany.contacts.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>No contacts at this company.</div>
                            ) : (
                                activeCompany.contacts.map((c, i) => {
                                    const initials = ((c.firstName||'')[0]||'') + ((c.lastName||'')[0]||'');
                                    const opps = oppCount[c.id] || 0;
                                    return (
                                        <div key={c.id}
                                            onClick={() => setViewingContact(c)}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '12px 16px',
                                                borderBottom: i < activeCompany.contacts.length - 1 ? `1px solid ${T.border}` : 'none',
                                                cursor: 'pointer', transition: 'background 80ms',
                                                background: 'transparent',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            {/* Avatar */}
                                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: avatarBg(c.firstName + c.lastName), color: '#fef4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, textTransform: 'uppercase' }}>
                                                {initials || '?'}
                                            </div>
                                            {/* Name + title */}
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{c.firstName} {c.lastName}</span>
                                                    {c.isVip && <span style={{ fontSize: 8, fontWeight: 700, color: T.goldInk, background: 'rgba(200,185,154,0.2)', padding: '1px 5px', borderRadius: 2, border: `1px solid ${T.gold}`, letterSpacing: 0.5 }}>VIP</span>}
                                                    {c.isDnc && <span style={{ fontSize: 8, fontWeight: 700, color: T.danger, background: 'rgba(156,58,46,0.1)', padding: '1px 5px', borderRadius: 2, letterSpacing: 0.5 }}>DNC</span>}
                                                    {opps > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: T.info, background: `${T.info}18`, padding: '1px 5px', borderRadius: 999, border: `1px solid ${T.info}30` }}>{opps} opp{opps > 1 ? 's' : ''}</span>}
                                                </div>
                                                <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2 }}>{c.title || c.role || '—'}</div>
                                            </div>
                                            {/* Email + phone */}
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                {c.email && <div style={{ fontSize: 11, color: T.info, marginBottom: 2 }}>{c.email}</div>}
                                                {c.phone && <div style={{ fontSize: 11, color: T.inkMuted }}>{c.phone}</div>}
                                            </div>
                                            {/* Edit */}
                                            <div onClick={e => { e.stopPropagation(); handleEditContact(c); }} style={{ color: T.border, cursor: 'pointer' }}>
                                                <Icon name="dots" size={14} color={T.inkMuted} />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

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
        <div className="tab-page" style={{ fontFamily: T.sans, display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* ── Page header ── */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, paddingBottom: 12, flexShrink: 0 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 28, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 5 }}>
                        Contacts
                    </div>
                    <div style={{ fontSize: 12, color: T.inkMuted }}>
                        <span style={{ fontWeight: 600, color: T.ink }}>{sorted.length}</span> contacts
                        {search && <span> matching <em>"{search}"</em></span>}
                    </div>
                </div>

                {/* Right buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                    {/* Live search */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface, minWidth: 180 }}>
                        <Icon name="search" size={13} color={T.inkMuted} />
                        <input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Escape') setSearch(''); }}
                            placeholder="Search contacts…"
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: T.ink, fontFamily: T.sans, width: '100%' }}
                        />
                        {search && (
                            <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMuted, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                        )}
                    </div>

                    {/* Delete (select mode) */}
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
                        <button
                            onClick={() => { setCsvImportType('contacts'); setShowCsvImportModal(true); }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'transparent', border: `1px solid ${T.border}`, color: T.inkMid, fontSize: 12, fontWeight: 400, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}
                            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <Icon name="import" size={12} color={T.inkMid} /> Import
                        </button>
                    )}

                    {/* Export */}
                    <button
                        onClick={handleExport}
                        disabled={!!exportingCSV}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'transparent', border: `1px solid ${T.border}`, color: T.inkMid, fontSize: 12, fontWeight: 400, borderRadius: T.r, cursor: exportingCSV ? 'not-allowed' : 'pointer', fontFamily: T.sans, opacity: exportingCSV ? 0.5 : 1 }}
                        onMouseEnter={e => { if (!exportingCSV) e.currentTarget.style.background = T.surface2; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                        <Icon name="export" size={12} color={T.inkMid} />
                        {exportingCSV === 'contacts' ? 'Exporting…' : 'Export'}
                    </button>

                    {/* New contact */}
                    {canEdit && (
                        <button onClick={handleAddContact} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: T.ink, border: 'none', color: T.surface, fontSize: 12, fontWeight: 600, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                            <Icon name="plus" size={12} color={T.surface} /> New contact
                        </button>
                    )}
                </div>
            </div>

            {/* ── Sort tabs ── */}
            <div style={{ flexShrink: 0 }}>
                <SortTabs />
            </div>

            {/* ── Company two-pane (Company mode) ── */}
            {contactsSortBy === 'company' && (
                <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', paddingTop: 12 }}>
                    {sorted.length === 0
                        ? <EmptyState />
                        : <CompanyTwoPane />
                    }
                </div>
            )}

            {/* ── Flat table (Last Name / First Name modes) ── */}
            {contactsSortBy !== 'company' && (
                <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                        {sorted.length === 0 ? (
                            <EmptyState />
                        ) : (
                            <>
                                <LetterBar />
                                <TableHeader />
                                {rows.map(r => (
                                    <ContactRow
                                        key={r.key}
                                        contact={r.contact}
                                        isEven={r.isEven}
                                        anchorId={r.anchorId}
                                    />
                                ))}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
