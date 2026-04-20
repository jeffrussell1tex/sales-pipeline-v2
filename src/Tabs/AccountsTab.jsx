import React, { useState, useMemo } from 'react';
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
    surfaceInk:   '#2a2622',
    sans:         '"Plus Jakarta Sans", system-ui, sans-serif',
    r:            3,
};

const fmtArr = v => {
    const n = parseFloat(v) || 0;
    if (n >= 1e6) return '$' + (n/1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n/1e3) + 'K';
    return '$' + n.toLocaleString();
};

const avatarBg = name => {
    const p = ['#9c6b4a','#7a5a3c','#5a6e5a','#6b5a7a','#8a5a5a','#5a7a8a','#7a6b5a','#4a6b5a'];
    let h = 0; for (let i = 0; i < (name||'').length; i++) h = (h*31 + (name||'').charCodeAt(i))|0;
    return p[Math.abs(h) % p.length];
};

// Warmth scoring — drives Signal sort and filter chips
function getWarmth(account, opportunities, activities) {
    const accName = (account.name || '').toLowerCase();
    const accOpps = opportunities.filter(o => (o.account||'').toLowerCase() === accName);
    const activeOpps = accOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
    const pipeline = activeOpps.reduce((s,o) => s+(parseFloat(o.arr)||0), 0);

    const accActs = activities.filter(a => {
        const oppIds = accOpps.map(o => o.id);
        return (a.company||'').toLowerCase() === accName || (a.opportunityId && oppIds.includes(a.opportunityId));
    }).sort((a,b) => (b.date||'').localeCompare(a.date||''));

    const lastAct = accActs[0];
    const daysSince = lastAct?.date
        ? Math.floor((Date.now() - new Date(lastAct.date+'T12:00:00').getTime()) / 86400000)
        : null;

    // Hot = active pipeline + recent contact (<7d)
    // Warm = active pipeline, last contact 7-30d
    // Cool = active pipeline, last contact 30-90d
    // Cold = no contact in 90d+ or no pipeline
    let warmth = 'cold';
    if (pipeline > 0) {
        if (daysSince !== null && daysSince < 7)  warmth = 'hot';
        else if (daysSince !== null && daysSince < 30) warmth = 'warm';
        else if (daysSince !== null && daysSince < 90) warmth = 'cool';
        else warmth = 'cold';
    } else {
        if (daysSince !== null && daysSince < 14) warmth = 'warm';
        else if (daysSince !== null && daysSince < 60) warmth = 'cool';
        else warmth = 'cold';
    }

    return { warmth, pipeline, activeOpps, daysSince, lastAct };
}

// Warmth dot color
const warmthColor = w => w === 'hot' ? T.danger : w === 'warm' ? T.warn : w === 'cool' ? T.info : T.inkMuted;
const warmthLabel = w => w === 'hot' ? 'Hot' : w === 'warm' ? 'Warm' : w === 'cool' ? 'Cool' : 'Cold';

// Relative date
const relDate = d => {
    if (!d) return '—';
    const days = Math.floor((Date.now() - new Date(d+'T12:00:00').getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return '1d ago';
    if (days < 7)  return days+'d ago';
    if (days < 30) return Math.floor(days/7)+'wk ago';
    if (days < 365) return Math.floor(days/30)+'mo ago';
    return Math.floor(days/365)+'yr ago';
};

// Small SVG icons
const Icon = ({ name, size=13, color='currentColor' }) => {
    const p = { width:size, height:size, viewBox:'0 0 24 24', fill:'none', stroke:color, strokeWidth:1.75, strokeLinecap:'round', strokeLinejoin:'round' };
    switch(name) {
        case 'signal':   return <svg {...p}><path d="M2 20h.01M7 20v-4M12 20v-8M17 20V4M22 20v-8"/></svg>;
        case 'book':     return <svg {...p}><path d="M4 19V5a2 2 0 012-2h13v14H6a2 2 0 000 4h13"/><path d="M4 19a2 2 0 002 2h13"/></svg>;
        case 'list':     return <svg {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
        case 'filter':   return <svg {...p}><path d="M4 5h16l-6 8v6l-4-2v-4L4 5z"/></svg>;
        case 'export':   return <svg {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>;
        case 'plus':     return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
        case 'search':   return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
        case 'chevron-right': return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
        case 'dots':     return <svg {...p}><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>;
        default: return null;
    }
};

// ── Account card for Business Book lanes ─────────────────────
function AccountCard({ account, warmthData, onClick }) {
    const [hov, setHov] = useState(false);
    const { pipeline, activeOpps, daysSince } = warmthData;
    const initials = (account.name||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

    return (
        <div onClick={onClick}
            onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
            style={{
                background: T.surface, border: `1px solid ${hov ? T.borderStrong : T.border}`,
                borderRadius: T.r+1, padding: '12px 14px', minWidth: 180, maxWidth: 200,
                flexShrink: 0, cursor: 'pointer',
                boxShadow: hov ? '0 4px 12px rgba(42,38,34,0.1)' : 'none',
                transition: 'all 120ms', fontFamily: T.sans,
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: avatarBg(account.name), color: '#fef4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</div>
                    {account.verticalMarket && <div style={{ fontSize: 10, color: T.inkMuted }}>{account.verticalMarket}</div>}
                    {account.employeeCount && <div style={{ fontSize: 10, color: T.inkMuted }}>{account.employeeCount} emp</div>}
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
                {[
                    { label: 'Pipeline', value: pipeline > 0 ? fmtArr(pipeline) : '—' },
                    { label: 'Deals',    value: activeOpps.length || '—' },
                    { label: 'Touch',    value: daysSince !== null ? relDate(new Date(Date.now() - daysSince*86400000).toISOString().split('T')[0]) : '—' },
                ].map(({ label, value }) => (
                    <div key={label}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, marginTop: 1 }}>{value}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Shared table row ──────────────────────────────────────────
function AccountRow({ account, warmthData, contacts, onView, onEdit, isEven, selectMode, isSelected, onToggleSelect }) {
    const [hov, setHov] = useState(false);
    const { warmth, pipeline, activeOpps, daysSince, lastAct } = warmthData;
    const dot = warmthColor(warmth);
    const contactCount = contacts.filter(c => (c.company||'').toLowerCase() === (account.name||'').toLowerCase()).length;
    const ownerInitials = (account.accountOwner||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();

    return (
        <div
            onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
            style={{
                display: 'grid',
                gridTemplateColumns: selectMode ? '36px 3px 1.8fr 1fr 90px 60px 110px 100px 28px' : '3px 1.8fr 1fr 90px 60px 110px 100px 28px',
                alignItems: 'center', height: 52,
                borderBottom: `1px solid ${T.border}`,
                background: isSelected ? 'rgba(42,38,34,0.04)' : hov ? T.surface2 : isEven ? T.surface : T.bg,
                cursor: 'pointer', fontFamily: T.sans, transition: 'background 80ms',
            }}
            onClick={() => selectMode ? onToggleSelect(account.id) : onView(account)}>
            {/* Checkbox — only in select mode */}
            {selectMode && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => { e.stopPropagation(); onToggleSelect(account.id); }}>
                    <div style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${isSelected ? T.ink : T.borderStrong}`, background: isSelected ? T.ink : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 120ms' }}>
                        {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fbf8f3" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>}
                    </div>
                </div>
            )}
            {/* Warmth accent bar */}
            <div style={{ width: 3, height: '100%', background: dot, flexShrink: 0 }} />

            {/* Account name + meta */}
            <div style={{ paddingLeft: 12, paddingRight: 8, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.name}</span>
                    {account.isVip && <span style={{ fontSize: 8, fontWeight: 700, color: T.goldInk, background: 'rgba(200,185,154,0.2)', padding: '1px 5px', borderRadius: T.r, border: `1px solid ${T.gold}`, letterSpacing: 0.5 }}>VIP</span>}
                    {account.isDnc && <span style={{ fontSize: 8, fontWeight: 700, color: T.danger, background: 'rgba(156,58,46,0.1)', padding: '1px 5px', borderRadius: T.r, border: `1px solid rgba(156,58,46,0.3)`, letterSpacing: 0.5 }}>DNC</span>}
                </div>
                <div style={{ fontSize: 10, color: T.inkMuted, marginTop: 1 }}>
                    {contactCount > 0 && `${contactCount} contact${contactCount!==1?'s':''}` }
                    {contactCount > 0 && account.employeeCount && ' · '}
                    {account.employeeCount && `${account.employeeCount} employees`}
                </div>
            </div>

            {/* Industry */}
            <div style={{ fontSize: 12, color: T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
                {account.verticalMarket || account.industry || '—'}
            </div>

            {/* Pipeline */}
            <div style={{ fontSize: 12, fontWeight: 600, color: pipeline > 0 ? T.ink : T.inkMuted, fontVariantNumeric: 'tabular-nums', paddingRight: 8 }}>
                {pipeline > 0 ? fmtArr(pipeline) : '—'}
            </div>

            {/* Deals */}
            <div style={{ fontSize: 12, color: T.inkMid, textAlign: 'center' }}>
                {activeOpps.length || '—'}
            </div>

            {/* Last contact */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingRight: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: daysSince !== null && daysSince < 7 ? T.danger : T.inkMuted }}>
                    {daysSince !== null ? relDate(new Date(Date.now() - daysSince*86400000).toISOString().split('T')[0]) : '—'}
                </span>
            </div>

            {/* Owner */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {account.accountOwner && (
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: avatarBg(account.accountOwner), color: '#fef4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{ownerInitials}</div>
                )}
                <span style={{ fontSize: 11, color: T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{account.accountOwner || '—'}</span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={e => { e.stopPropagation(); onEdit(account); }}>
                <Icon name="dots" size={14} color={hov ? T.inkMid : T.border} />
            </div>
        </div>
    );
}

// ── Main AccountsTab ──────────────────────────────────────────
export default function AccountsTab() {
    const {
        accounts, setAccounts,
        opportunities, contacts, activities, tasks, settings,
        currentUser, userRole, canSeeAll,
        exportToCSV, exportingCSV,
        showConfirm, softDelete, addAudit,
        getSubAccounts, getAccountRollup,
        visibleAccounts,
        handleDeleteAccount,
        setEditingAccount, setEditingSubAccount, setParentAccountForSub, setShowAccountModal,
        setCsvImportType, setShowCsvImportModal,
        viewingAccount, setViewingAccount,
        selectedAccounts, setSelectedAccounts,
        isMobile,
    } = useApp();

    const isReadOnly = userRole === 'ReadOnly';
    const canEdit    = !isReadOnly;

    // ── View state ────────────────────────────────────────────
    const [view, setView]         = useState(() => localStorage.getItem('accounts:view') || 'signal');
    const [selectedIds, setSelectedIds] = useState([]);
    const [selectMode, setSelectMode]   = useState(false);
    const [warmthFilter, setWarmthFilter] = useState('all');
    const [search, setSearch]     = useState('');
    const [searchInput, setSearchInput] = useState('');

    const setViewPersist = v => { setView(v); localStorage.setItem('accounts:view', v); };

    // ── Warmth data for each account ─────────────────────────
    const warmthMap = useMemo(() => {
        const map = {};
        visibleAccounts.forEach(acc => {
            map[acc.id] = getWarmth(acc, opportunities, activities);
        });
        return map;
    }, [visibleAccounts, opportunities, activities]);

    // ── Filtered accounts ─────────────────────────────────────
    const filtered = useMemo(() => {
        let list = visibleAccounts;
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(a => (a.name||'').toLowerCase().includes(q) || (a.verticalMarket||'').toLowerCase().includes(q) || (a.accountOwner||'').toLowerCase().includes(q));
        }
        if (warmthFilter !== 'all') {
            list = list.filter(a => warmthMap[a.id]?.warmth === warmthFilter);
        }
        return list;
    }, [visibleAccounts, search, warmthFilter, warmthMap]);

    // Warmth counts
    const counts = useMemo(() => {
        const c = { all: visibleAccounts.length, hot: 0, warm: 0, cool: 0, cold: 0 };
        visibleAccounts.forEach(a => { const w = warmthMap[a.id]?.warmth; if (w) c[w]++; });
        return c;
    }, [visibleAccounts, warmthMap]);

    // Handlers
    const handleAddAccount  = () => { setEditingAccount(null); setEditingSubAccount(null); setParentAccountForSub(null); setShowAccountModal(true); };
    const handleEditAccount = (a) => { setEditingAccount(a); setEditingSubAccount(null); setParentAccountForSub(null); setShowAccountModal(true); };
    const handleDeleteSelected = () => {
        if (!selectedIds.length) return;
        showConfirm(`Delete ${selectedIds.length} account${selectedIds.length > 1 ? 's' : ''}? This cannot be undone.`, async () => {
            const toDelete = [...selectedIds];
            const snapshot = [...(accounts || [])];
            setAccounts(prev => prev.filter(a => !toDelete.includes(a.id)));
            setSelectedIds([]);
            setSelectMode(false);
            for (const id of toDelete) {
                await dbFetch(`/.netlify/functions/accounts?id=${id}`, { method: 'DELETE' }).catch(console.error);
            }
        });
    };
    const toggleSelect = (id) => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    const toggleSelectAll = () => setSelectedIds(prev => prev.length === filtered.length ? [] : filtered.map(a => a.id));

    // Views config
    const views = [
        { id: 'signal',   label: 'Signal',        icon: 'signal' },
        { id: 'business', label: 'Business Book',  icon: 'book'   },
        { id: 'list',     label: 'List',           icon: 'list'   },
    ];

    // ── Shared header ─────────────────────────────────────────
    const Header = () => (
        <div style={{ padding: '0 0 14px', display: 'flex', alignItems: 'flex-end', gap: 20 }}>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: 28, fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 5 }}>
                    Accounts
                </div>
                <div style={{ fontSize: 12, color: T.inkMuted }}>
                    <span style={{ fontWeight: 600, color: T.ink }}>{filtered.length}</span> accounts
                    {view === 'signal' && <span> · sorted by signal</span>}
                    {view === 'business' && <span> · grouped into lanes by intent</span>}
                    {view === 'list' && <span> · alphabetical</span>}
                </div>
            </div>
            {/* View toggle — pill style per screenshots */}
            <div style={{ display: 'flex', gap: 2, border: `1px solid ${T.border}`, borderRadius: T.r, padding: 2, background: T.surface }}>
                {views.map(v => (
                    <button key={v.id} onClick={() => setViewPersist(v.id)} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '5px 11px',
                        background: view === v.id ? T.ink : 'transparent',
                        color:      view === v.id ? T.surface : T.inkMid,
                        border: 'none', borderRadius: T.r-1,
                        fontSize: 12, fontWeight: view === v.id ? 600 : 400,
                        cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms',
                    }}>
                        <Icon name={v.icon} size={12} color={view === v.id ? T.surface : T.inkMid} />
                        {v.label}
                    </button>
                ))}
            </div>
            {/* Right buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', background: 'transparent', border: `1px solid ${T.border}`, color: T.ink, fontSize: 12, fontWeight: 500, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Icon name="filter" size={12} color={T.inkMid} /> Filter
                </button>
                <button onClick={() => exportToCSV(`accounts-${new Date().toISOString().slice(0,10)}.csv`, ['Account Name','Industry','Owner','Phone','Website'], visibleAccounts.map(a => [a.name,a.verticalMarket||'',a.accountOwner||'',a.phone||'',a.website||'']))}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', background: 'transparent', border: `1px solid ${T.border}`, color: T.ink, fontSize: 12, fontWeight: 500, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Icon name="export" size={12} color={T.inkMid} /> Export
                </button>
                {canEdit && selectMode && selectedIds.length > 0 && (
                    <button onClick={handleDeleteSelected} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: T.danger, border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                        Delete ({selectedIds.length})
                    </button>
                )}
                {canEdit && (
                    <button onClick={() => { setSelectMode(m => !m); setSelectedIds([]); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', background: selectMode ? T.surface2 : 'transparent', border: `1px solid ${selectMode ? T.borderStrong : T.border}`, color: T.inkMid, fontSize: 12, fontWeight: selectMode ? 600 : 400, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                        {selectMode ? 'Cancel' : 'Select'}
                    </button>
                )}
                {canEdit && (
                    <button onClick={handleAddAccount} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: T.ink, border: 'none', color: T.surface, fontSize: 12, fontWeight: 600, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                        <Icon name="plus" size={12} color={T.surface} /> New account
                    </button>
                )}
            </div>
        </div>
    );

    // ── Warmth filter chips + search bar ─────────────────────
    const FilterBar = () => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {/* Warmth chips */}
            {[
                { key: 'all',  label: 'All',                    dot: null },
                { key: 'hot',  label: 'Hot',                    dot: T.danger },
                { key: 'warm', label: 'Warm',                   dot: T.warn },
                { key: 'cool', label: 'Cool',                   dot: T.info },
                { key: 'cold', label: 'Cold — needs reach-out', dot: T.inkMuted },
            ].map(({ key, label, dot }) => {
                const active = warmthFilter === key;
                const count  = counts[key] ?? 0;
                return (
                    <button key={key} onClick={() => setWarmthFilter(key)} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px',
                        background: active ? T.ink : 'transparent',
                        border: `1px solid ${active ? T.ink : T.border}`,
                        color: active ? T.surface : T.ink,
                        borderRadius: T.r, fontSize: 12, fontWeight: active ? 600 : 400,
                        cursor: 'pointer', fontFamily: T.sans, transition: 'all 120ms',
                    }}>
                        {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'rgba(255,255,255,0.7)' : dot, display: 'inline-block', flexShrink: 0 }} />}
                        {label}
                        <span style={{ fontSize: 11, color: active ? 'rgba(255,255,255,0.7)' : T.inkMuted }}>{count}</span>
                    </button>
                );
            })}
            {/* Search */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface, minWidth: 180 }}>
                <Icon name="search" size={13} color={T.inkMuted} />
                <input
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') setSearch(searchInput); if (e.key === 'Escape') { setSearchInput(''); setSearch(''); } }}
                    placeholder="Search accounts… (Enter)"
                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: T.ink, fontFamily: T.sans, width: '100%' }} />
            </div>
        </div>
    );

    // ── TABLE COLUMN HEADER ───────────────────────────────────
    const TableHeader = ({ sortLabel, selectMode, allSelected, onSelectAll }) => (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '3px 1.8fr 1fr 90px 60px 110px 100px 28px',
            alignItems: 'center', height: 34,
            background: T.surface2, borderBottom: `1px solid ${T.border}`,
            fontSize: 10, fontWeight: 700, color: T.inkMuted,
            letterSpacing: 0.6, textTransform: 'uppercase', fontFamily: T.sans,
        }}>
            <div />
            <div style={{ paddingLeft: 12 }}>Account {sortLabel && <span style={{ color: T.border, fontWeight: 400 }}>↑ {sortLabel}</span>}</div>
            <div>Industry</div>
            <div>Pipeline</div>
            <div style={{ textAlign: 'center' }}>Deals</div>
            <div>Last Contact</div>
            <div>Owner</div>
            <div />
        </div>
    );

    // ── SIGNAL VIEW — sorted by warmth score ─────────────────
    const SignalView = () => {
        const sorted = [...filtered].sort((a, b) => {
            const order = { hot: 0, warm: 1, cool: 2, cold: 3 };
            const wa = order[warmthMap[a.id]?.warmth] ?? 4;
            const wb = order[warmthMap[b.id]?.warmth] ?? 4;
            if (wa !== wb) return wa - wb;
            return (warmthMap[b.id]?.pipeline||0) - (warmthMap[a.id]?.pipeline||0);
        });

        return (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                <TableHeader sortLabel="warmth · pipeline" selectMode={selectMode} allSelected={selectedIds.length === filtered.length && filtered.length > 0} onSelectAll={toggleSelectAll} />
                {sorted.length === 0
                    ? <EmptyState />
                    : sorted.map((acc, i) => (
                        <AccountRow key={acc.id} account={acc} warmthData={warmthMap[acc.id]} contacts={contacts}
                            onView={setViewingAccount} onEdit={handleEditAccount} isEven={i%2===0} selectMode={selectMode} isSelected={selectedIds.includes(acc.id)} onToggleSelect={toggleSelect} />
                    ))
                }
            </div>
        );
    };

    // ── BUSINESS BOOK VIEW — four intent lanes ────────────────
    const BusinessBookView = () => {
        const needsAttn = filtered.filter(a => {
            const w = warmthMap[a.id];
            return w?.activeOpps.length > 0 && (w?.daysSince === null || w?.daysSince > 21);
        });
        const topPipeline = [...filtered].filter(a => (warmthMap[a.id]?.pipeline||0) > 0)
            .sort((a,b) => (warmthMap[b.id]?.pipeline||0) - (warmthMap[a.id]?.pipeline||0));
        const recentActivity = [...filtered].filter(a => {
            const ds = warmthMap[a.id]?.daysSince;
            return ds !== null && ds <= 7;
        }).sort((a,b) => (warmthMap[a.id]?.daysSince||999) - (warmthMap[b.id]?.daysSince||999));
        const dormant = filtered.filter(a => {
            const w = warmthMap[a.id];
            return w?.warmth === 'cold' || (w?.daysSince === null);
        });

        const Lane = ({ title, subtitle, accounts: laneAccs, accentColor, count }) => {
            if (laneAccs.length === 0) return null;
            return (
                <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 3, height: 18, background: accentColor, borderRadius: 1, flexShrink: 0 }} />
                            <div>
                                <span style={{ fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: T.sans }}>{title}</span>
                                {subtitle && <span style={{ fontSize: 11, color: T.inkMuted, marginLeft: 8, fontFamily: T.sans }}>{subtitle}</span>}
                            </div>
                        </div>
                        <button style={{ fontSize: 11, color: T.goldInk, background: 'none', border: 'none', cursor: 'pointer', fontFamily: T.sans, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                            See all <Icon name="chevron-right" size={11} color={T.goldInk} />
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                        {laneAccs.map(acc => (
                            <AccountCard key={acc.id} account={acc} warmthData={warmthMap[acc.id]}
                                onClick={() => setViewingAccount(acc)} />
                        ))}
                    </div>
                </div>
            );
        };

        return (
            <div>
                <Lane title="Needs attention" subtitle={`${needsAttn.length} · Open pipeline, no contact in 21+ days`}
                    accounts={needsAttn} accentColor={T.danger} />
                <Lane title="Top by pipeline value" subtitle={`${topPipeline.length} · Your biggest open opportunities`}
                    accounts={topPipeline} accentColor={T.gold} />
                <Lane title="Recent activity" subtitle={`${recentActivity.length} · Accounts you've been working this week`}
                    accounts={recentActivity} accentColor={T.ok} />
                <Lane title="Dormant" subtitle={`${dormant.length} · No recent contact or pipeline`}
                    accounts={dormant} accentColor={T.inkMuted} />
                {filtered.length === 0 && <EmptyState />}
            </div>
        );
    };

    // ── LIST VIEW — alphabetical A-Z ──────────────────────────
    const ListView = () => {
        const sorted = [...filtered].sort((a, b) => (a.name||'').localeCompare(b.name||''));
        return (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+1, overflow: 'hidden' }}>
                <TableHeader sortLabel="A–Z" selectMode={selectMode} allSelected={selectedIds.length === filtered.length && filtered.length > 0} onSelectAll={toggleSelectAll} />
                {sorted.length === 0
                    ? <EmptyState />
                    : sorted.map((acc, i) => (
                        <AccountRow key={acc.id} account={acc} warmthData={warmthMap[acc.id]} contacts={contacts}
                            onView={setViewingAccount} onEdit={handleEditAccount} isEven={i%2===0} selectMode={selectMode} isSelected={selectedIds.includes(acc.id)} onToggleSelect={toggleSelect} />
                    ))
                }
            </div>
        );
    };

    const EmptyState = () => (
        <div style={{ padding: '3rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
            {search || warmthFilter !== 'all' ? 'No accounts match the current filter.' : 'No accounts yet — add your first one.'}
            {canEdit && !search && warmthFilter === 'all' && (
                <div style={{ marginTop: 12 }}>
                    <button onClick={handleAddAccount} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: T.ink, border: 'none', color: T.surface, fontSize: 12, fontWeight: 600, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                        <Icon name="plus" size={12} color={T.surface} /> New account
                    </button>
                </div>
            )}
        </div>
    );

    return (
        <div className="tab-page" style={{ fontFamily: T.sans }}>
            <Header />
            <FilterBar />
            {view === 'signal'   && <SignalView />}
            {view === 'business' && <BusinessBookView />}
            {view === 'list'     && <ListView />}
        </div>
    );
}
