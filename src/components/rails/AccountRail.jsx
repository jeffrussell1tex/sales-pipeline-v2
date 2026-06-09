import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../../AppContext';
import RecordDocuments from '../documents/RecordDocuments';

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

const INDUSTRIES = [
    'Accounting','Advertising & Marketing','Aerospace & Defense','Agriculture',
    'Architecture & Engineering','Automotive','Banking','Biotech & Life Sciences',
    'Broadcasting & Media','Chemical','Clothing & Apparel','Construction',
    'Consulting','Consumer Goods','Education','Electronics','Energy & Utilities',
    'Entertainment','Environmental Services','Financial Services','Food & Beverage',
    'Government','Healthcare','Hospitality & Travel','Human Resources',
    'Import & Export','Information Technology','Insurance','Legal Services',
    'Logistics & Transportation','Manufacturing','Non-Profit','Oil & Gas',
    'Pharmaceuticals','Real Estate','Retail','Security','Software',
    'Telecommunications','Wholesale',
];

function avatarBg(name) {
    const colors = ['#5a544c','#7a6a48','#4d6b3d','#3a5a7a','#6b3d4d','#3d4d6b','#6b5a3d'];
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
    return colors[Math.abs(h) % colors.length];
}

function monogram(name) {
    const parts = (name || '').trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (name || '?')[0].toUpperCase();
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
    const safeVal = value || '';
    const filtered = (suggestions || []).filter(s => (s || '').toLowerCase().includes(safeVal.toLowerCase()));
    return (
        <div style={{ position: 'relative' }}>
            <input
                type="text"
                value={safeVal}
                onChange={e => { onChange(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 200)}
                placeholder={placeholder}
                style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', outline: 'none' }}
            />
            {open && filtered.length > 0 && (
                <div style={{
                    position: 'absolute', [dropUp ? 'bottom' : 'top']: '100%', left: 0, right: 0,
                    background: '#fff', border: `1px solid ${T.border}`, borderRadius: T.r,
                    marginTop: dropUp ? 0 : 2, marginBottom: dropUp ? 2 : 0,
                    maxHeight: 180, overflowY: 'auto', zIndex: 200,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                }}>
                    {filtered.slice(0, 20).map((s, i) => (
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
const EMPTY_ACCOUNT = {
    name: '', verticalMarket: '', industry: '',
    address: '', address2: '', city: '', state: '', zip: '', country: '',
    website: '', phone: '',
    doNotContact: false, customerTypes: [], accountSegment: '',
    description: '', totalEmployees: '', annualRevenue: '',
    fiscalYearEnd: '', foundedYear: '', linkedInUrl: '',
    sicCode: '', naicsCode: '',
    assignedRep: '', assignedTerritory: '',
    parentAccountId: null,
};

// ── Main component ────────────────────────────────────────────────────────────

export default function AccountRail() {
    const {
        accounts, contacts, setContacts, settings, opportunities, setOpportunities, activities,
        accountRailId, setAccountRailId,
        accountRailMode, setAccountRailMode,
        contactRailId, setContactRailId,
        contactRailMode, setContactRailMode,
        railStack, setRailStack,
        showActivityModal, setShowActivityModal, setActivityInitialContext,
        handleSaveAccount,
        handleDeleteAccount,
        accountModalError, setAccountModalError,
        accountModalSaving,
        taskRailId: _taskRailId, setTaskRailId, taskRailMode: _taskRailMode, setTaskRailMode,
        handleAddActivity,
        editingAccount, setEditingAccount,
        editingSubAccount, setEditingSubAccount,
        parentAccountForSub, setParentAccountForSub,
        lastCreatedAccountName, setLastCreatedAccountName,
        accountCreatedFromOppForm, setAccountCreatedFromOppForm,
        pendingOppFormData, setPendingOppFormData,
        setEditingOpp, setShowModal,
    } = useApp();

    const isNew    = accountRailId === 'new';
    const account  = isNew ? null : (accounts || []).find(a => a.id === accountRailId) || null;
    const isOpen   = !!accountRailId;
    const isEditing = accountRailMode === 'edit' || accountRailMode === 'new';

    // ── Form state ────────────────────────────────────────────────────────────
    const [formData,          setFormData]          = useState(EMPTY_ACCOUNT);
    const [verticalSearch,    setVerticalSearch]    = useState('');
    const [repSearch,         setRepSearch]         = useState('');
    const [territorySearch,   setTerritorySearch]   = useState('');
    const [parentSearch,      setParentSearch]      = useState('');
    const [customerTypeInput, setCustomerTypeInput] = useState('');
    const [activeTab,         setActiveTab]         = useState('general');
    const [dupWarning,        setDupWarning]        = useState(null);
    const [dirty,             setDirty]             = useState(false);
    const [saveError,         setSaveError]         = useState(null);

    // Holds the in-progress NEW account while the user peeks at an existing
    // dup via "Open existing", so "← Back" can restore it intact.
    const restoreNewRef = useRef(null);

    // Seed form when rail opens
    useEffect(() => {
        if (!isOpen) return;
        // Returning to an in-progress new account (Back from "Open existing")
        if (accountRailId === 'new' && restoreNewRef.current) {
            const snap = restoreNewRef.current;
            restoreNewRef.current = null;
            setFormData(snap.formData);
            setVerticalSearch(snap.verticalSearch);
            setRepSearch(snap.repSearch);
            setTerritorySearch(snap.territorySearch);
            setParentSearch(snap.parentSearch);
            setCustomerTypeInput(snap.customerTypeInput);
            setActiveTab(snap.activeTab || 'general');
            setDupWarning(null);
            setDirty(true);
            setSaveError(null);
            setAccountModalError?.(null);
            return;
        }
        const src = account || EMPTY_ACCOUNT;
        setFormData({ ...EMPTY_ACCOUNT, ...src });
        setVerticalSearch(src.verticalMarket || src.industry || '');
        setRepSearch(src.assignedRep || '');
        setTerritorySearch(src.assignedTerritory || '');
        const parentAcct = src.parentAccountId
            ? (accounts || []).find(a => a.id === src.parentAccountId)
            : null;
        setParentSearch(parentAcct?.name || '');
        setActiveTab('general');
        setDupWarning(null);
        setDirty(false);
        setSaveError(null);
        setAccountModalError?.(null);
        setCustomerTypeInput('');
    }, [accountRailId, accountRailMode]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Derived lists ─────────────────────────────────────────────────────────
    const allRepNames = [...new Set(
        (settings?.users || []).filter(u => u.name && u.userType !== 'Manager' && u.userType !== 'Admin').map(u => u.name)
    )].sort();

    const allTerritories = [...new Set([
        ...((settings?.territories || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean)),
    ])].sort();

    const industryList = (() => {
        const raw = settings?.industries || settings?.verticalMarkets || [];
        if (raw.length === 0) return INDUSTRIES;
        return raw.map(m => typeof m === 'string' ? m : m.name || '').filter(Boolean).sort();
    })();

    const allCustomerTypes = (() => {
        const tiers = settings?.customerTypeTiers;
        if (Array.isArray(tiers) && tiers.length) return [...new Set(tiers.map(t => typeof t === 'object' ? t.tier : t).filter(Boolean))];
        return [...new Set((settings?.customerTypes || []).filter(Boolean))].sort();
    })();

    const subAccounts = (accounts || []).filter(a =>
        (a.parentAccountId || a.parentId) === accountRailId
    );

    // Prefer the real accountId link; fall back to the legacy company-name match for
    // contacts not yet migrated/backfilled. Keeps the People list correct mid-migration.
    const accountContacts = (contacts || []).filter(c =>
        c.accountId ? c.accountId === account?.id : (c.company === account?.name)
    );

    const openOpps = (opportunities || []).filter(o => {
        if (!account) return false;
        const closed = ['closed won','closed lost','won','lost'];
        const linked = o.accountId ? o.accountId === account.id : o.account === account.name;
        return linked && !closed.includes((o.stage || '').toLowerCase());
    });

    // Activities that roll up to this account, via ANY of:
    //   - a direct accountId link (the Email/Call quick-log writes this)
    //   - a contact that belongs to this company (same set as the People tab)
    //   - any opportunity belonging to this account (open OR closed)
    const accountActivities = (() => {
        if (!account) return [];
        const acctContactIds = new Set(accountContacts.map(c => c.id));
        const acctOppIds = new Set((opportunities || []).filter(o => o.accountId ? o.accountId === account.id : o.account === account.name).map(o => o.id));
        return (activities || []).filter(a =>
            (a.accountId && a.accountId === account.id) ||
            (a.contactId && acctContactIds.has(a.contactId)) ||
            (Array.isArray(a.contactIds) && a.contactIds.some(id => acctContactIds.has(id))) ||
            (a.opportunityId && acctOppIds.has(a.opportunityId))
        ).sort((a, b) => new Date(b.date || '2000') - new Date(a.date || '2000'));
    })();

    // ── Handlers ──────────────────────────────────────────────────────────────
    const hc = useCallback((field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setDirty(true);
    }, []);

    // Fuzzy duplicate check
    const normalize = s => (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');

    const checkDuplicate = (name) => {
        const inputNorm = normalize(name);
        if (!inputNorm) return null;
        const candidates = (accounts || []).filter(a => {
            if (account && a.id === account.id) return false;
            const aNorm = normalize(a.name);
            if (!aNorm) return false;
            if (aNorm === inputNorm) return true;
            if (aNorm.includes(inputNorm) || inputNorm.includes(aNorm)) return true;
            const longer = Math.max(aNorm.length, inputNorm.length);
            if (longer <= 6) return false;
            let dp = Array.from({ length: inputNorm.length + 1 }, (_, i) => i);
            for (let j = 1; j <= aNorm.length; j++) {
                let prev = j;
                for (let i = 1; i <= inputNorm.length; i++) {
                    const val = aNorm[j-1] === inputNorm[i-1] ? dp[i-1] : 1 + Math.min(dp[i-1], dp[i], prev);
                    dp[i-1] = prev; prev = val;
                }
                dp[inputNorm.length] = prev;
            }
            return dp[inputNorm.length] <= 2;
        });
        return candidates.length > 0 ? candidates : null;
    };

    const handleSave = async () => {
        setSaveError(null);
        const saveData = {
            ...formData,
            verticalMarket: verticalSearch,
            industry:       verticalSearch,
            assignedRep:    repSearch,
            assignedTerritory: territorySearch,
            doNotContact:   formData.doNotContact === true,
            customerTypes:  formData.customerTypes || [],
            accountSegment: formData.accountSegment || '',
        };

        if (!saveData.name?.trim()) { setSaveError('Account name is required.'); return; }

        if (isNew && !dupWarning) {
            const dups = checkDuplicate(saveData.name);
            if (dups) { setDupWarning(dups); return; }
        }

        await handleSaveAccount(saveData, {
            editingAccount:   isNew ? null : account,
            editingSubAccount: null,
            parentAccountForSub: saveData.parentAccountId
                ? (accounts || []).find(a => a.id === saveData.parentAccountId) || null
                : null,
            accountCreatedFromOppForm,
            pendingOppFormData,
            setOpportunities,
            setContacts,
            setShowAccountModal: (open) => {
                if (!open) {
                    if (isNew) {
                        setAccountRailId(null);
                        setAccountRailMode('view');
                    } else {
                        setAccountRailMode('view');
                        setDirty(false);
                    }
                }
            },
            setLastCreatedAccountName,
            setEditingOpp,
            setShowModal,
            setAccountCreatedFromOppForm,
            setPendingOppFormData,
        });
    };

    const handleDiscard = () => {
        if (isNew) {
            closeRail();
        } else {
            const src = account || EMPTY_ACCOUNT;
            setFormData({ ...EMPTY_ACCOUNT, ...src });
            setVerticalSearch(src.verticalMarket || '');
            setRepSearch(src.assignedRep || '');
            setTerritorySearch(src.assignedTerritory || '');
            const parentAcct = src.parentAccountId
                ? (accounts || []).find(a => a.id === src.parentAccountId)
                : null;
            setParentSearch(parentAcct?.name || '');
            setAccountRailMode('view');
            setDirty(false);
            setDupWarning(null);
            setSaveError(null);
        }
    };

    const closeRail = () => {
        if (railStack.length > 0) {
            const prev = railStack[railStack.length - 1];
            setRailStack(s => s.slice(0, -1));
            if (prev.type === 'account') {
                setAccountRailId(prev.id);
                setAccountRailMode(prev.mode);
            } else {
                setAccountRailId(null);
                setAccountRailMode('view');
                if (prev.type === 'contact') {
                    setContactRailId(prev.id);
                    setContactRailMode(prev.mode);
                }
            }
        } else {
            restoreNewRef.current = null;
            setAccountRailId(null);
            setAccountRailMode('view');
            setRailStack([]);
        }
    };

    const handleBack = () => {
        const prev = railStack[railStack.length - 1];
        if (!prev) return;
        setRailStack(s => s.slice(0, -1));
        if (prev.type === 'account') {
            setAccountRailId(prev.id);
            setAccountRailMode(prev.mode);
        } else {
            setAccountRailId(null);
            setAccountRailMode('view');
            if (prev.type === 'contact') {
                setContactRailId(prev.id);
                setContactRailMode(prev.mode);
            }
        }
    };

    // ESC key
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => { if (e.key === 'Escape' && !isEditing) closeRail(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

    // Open contact from the account rail
    const handleOpenContactRail = (contactId) => {
        setRailStack(prev => [...prev, { type: 'account', id: accountRailId, mode: accountRailMode }]);
        setAccountRailId(null);
        setContactRailId(contactId);
        setContactRailMode('view');
    };

    // Open a sub-account from the parent's rail (stacked, so ← Back returns here)
    const handleOpenSubAccount = (subId) => {
        setRailStack(prev => [...prev, { type: 'account', id: accountRailId, mode: accountRailMode }]);
        setAccountRailId(subId);
        setAccountRailMode('view');
    };

    if (!isOpen) return null;

    const bg = avatarBg(account?.name || '');
    const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' };

    const tabBtn = (id, label) => (
        <button
            onClick={() => setActiveTab(id)}
            style={{
                background: 'none', border: 'none',
                borderBottom: activeTab === id ? `2px solid ${T.ink}` : '2px solid transparent',
                color: activeTab === id ? T.ink : T.ink3,
                fontWeight: activeTab === id ? 700 : 500,
                fontSize: 12, padding: '8px 14px', cursor: 'pointer', fontFamily: T.sans,
            }}
        >{label}</button>
    );

    const tierLabel = account?.accountTier === 'site' ? 'Site'
        : account?.accountTier === 'business_unit' ? 'Business Unit'
        : 'Account';

    return (
        <>
        {/* Click-catcher */}
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
        }}>

            {/* ── Header ────────────────────────────────────────────────────── */}
            <div style={{ background: T.ink, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                {railStack.length > 0 && (
                    <button onClick={handleBack} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#f5f1eb', borderRadius: T.r, padding: '4px 8px', cursor: 'pointer', fontSize: 12, fontFamily: T.sans, flexShrink: 0 }}>
                        ← Back
                    </button>
                )}

                {!isNew && (
                    <div style={{ width: 36, height: 36, borderRadius: T.r + 1, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {monogram(account?.name)}
                    </div>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#f5f1eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isNew ? 'New Account' : (account?.name || '—')}
                    </div>
                    {!isNew && (account?.verticalMarket || account?.industry) && (
                        <div style={{ fontSize: 11, color: 'rgba(245,241,235,0.55)', marginTop: 1 }}>
                            {account.verticalMarket || account.industry} {account.accountTier && account.accountTier !== 'account' ? `· ${tierLabel}` : ''}
                        </div>
                    )}
                </div>

                {isEditing && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.gold, background: 'rgba(200,185,154,0.15)', border: `1px solid rgba(200,185,154,0.3)`, borderRadius: 3, padding: '2px 7px', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
                        {isNew ? 'New' : 'Editing'}
                    </span>
                )}

                <button onClick={closeRail} style={{ background: 'none', border: 'none', color: 'rgba(245,241,235,0.5)', fontSize: 18, cursor: 'pointer', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>

            {/* ── Quick stats bar (view mode only) ──────────────────────────── */}
            {!isEditing && account && (
                <div style={{ display: 'flex', background: T.surface2, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                    {[
                        { label: 'CONTACTS',    value: accountContacts.length },
                        { label: 'OPEN PIPE',   value: openOpps.length },
                        { label: 'SUB-ACCTS',   value: subAccounts.length },
                    ].map(({ label, value }) => (
                        <div key={label} style={{ flex: 1, padding: '8px 0', textAlign: 'center', borderRight: `1px solid ${T.border}` }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{value}</div>
                            <div style={{ fontSize: 9, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
                        </div>
                    ))}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <button onClick={() => setAccountRailMode('edit')}
                            style={{ padding: '6px 14px', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                            Edit
                        </button>
                    </div>
                </div>
            )}

            {/* ── Sub-tabs ───────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
                {tabBtn('general', 'General')}
                {tabBtn('details', 'Details')}
                {!isNew && tabBtn('people', 'People')}
                {!isNew && tabBtn('activity', 'Activity')}
                {!isNew && tabBtn('documents', 'Documents')}
            </div>

            {/* ── Scrollable body ────────────────────────────────────────────── */}
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '14px 18px' }}>

                {/* Error / save error */}
                {(accountModalError || saveError) && (
                    <div style={{ background: '#fef2f2', border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: T.danger, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>{accountModalError || saveError}</span>
                        <button onClick={() => { setAccountModalError?.(null); setSaveError(null); }} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                    </div>
                )}

                {/* Duplicate warning */}
                {dupWarning && (
                    <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: T.r, padding: '10px 12px', marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, color: '#92400e', fontSize: 12, marginBottom: 4 }}>⚠ Similar account{dupWarning.length > 1 ? 's' : ''} found</div>
                        {dupWarning.slice(0, 3).map(d => (
                            <div key={d.id} style={{ fontSize: 12, color: '#78350f', marginBottom: 2 }}><strong>{d.name}</strong>{d.verticalMarket ? ` · ${d.verticalMarket}` : ''}</div>
                        ))}
                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                            <button onClick={() => { const d = dupWarning[0]; if (!d) return; restoreNewRef.current = { formData, verticalSearch, repSearch, territorySearch, parentSearch, customerTypeInput, activeTab }; setDupWarning(null); setRailStack(prev => [...prev, { type: 'account', id: accountRailId, mode: accountRailMode }]); setAccountRailId(d.id); setAccountRailMode('view'); }}
                                style={{ padding: '4px 10px', background: '#fff', color: '#92400e', border: '1px solid #fde68a', borderRadius: T.r, fontWeight: 600, cursor: 'pointer', fontSize: 12, fontFamily: T.sans }}>
                                Open existing
                            </button>
                            <button onClick={() => { setDupWarning(null); handleSave(); }}
                                style={{ padding: '4px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: T.r, fontWeight: 600, cursor: 'pointer', fontSize: 12, fontFamily: T.sans }}>
                                Create anyway
                            </button>
                            <button onClick={() => setDupWarning(null)}
                                style={{ padding: '4px 10px', background: '#fff', color: T.ink2, border: `1px solid ${T.border}`, borderRadius: T.r, fontWeight: 600, cursor: 'pointer', fontSize: 12, fontFamily: T.sans }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {/* ════════ TAB: General ════════ */}
                {activeTab === 'general' && (
                    <>
                        <SectionHeading label="Account Info" />
                        {isEditing ? (
                            <div style={grid2}>
                                <FieldGroup label="Account Name *" wide>
                                    <TextInput value={formData.name} onChange={v => { hc('name', v); if (dupWarning) setDupWarning(null); }} />
                                </FieldGroup>
                                {/* Parent Account — committed chip when selected, typeahead when not */}
                                <FieldGroup label="Parent Account" wide>
                                    {formData.parentAccountId ? (() => {
                                        const parent = (accounts || []).find(a => a.id === formData.parentAccountId);
                                        return (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px 5px 10px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: T.ink, width: 'fit-content' }}>
                                                <span>{parent?.name || parentSearch}</span>
                                                <button type="button"
                                                    onClick={() => { hc('parentAccountId', null); setParentSearch(''); }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.ink3, fontSize: 14, lineHeight: 1, padding: '0 0 0 2px' }}>×</button>
                                            </div>
                                        );
                                    })() : (
                                        <Typeahead
                                            value={parentSearch}
                                            onChange={v => { setParentSearch(v); if (formData.parentAccountId) hc('parentAccountId', null); }}
                                            suggestions={(accounts || [])
                                                .filter(a => a.id !== accountRailId && a.name)
                                                .map(a => a.name)
                                                .sort()
                                            }
                                            onSelect={v => {
                                                const selected = (accounts || []).find(a => a.name === v);
                                                if (selected) { hc('parentAccountId', selected.id); setParentSearch(v); }
                                            }}
                                            placeholder="Search accounts…"
                                        />
                                    )}
                                </FieldGroup>
                                <FieldGroup label="Phone">
                                    <TextInput value={formData.phone} onChange={v => hc('phone', v)} type="tel" />
                                </FieldGroup>
                                <FieldGroup label="Website">
                                    <TextInput value={formData.website} onChange={v => hc('website', v)} placeholder="https://…" />
                                </FieldGroup>
                                <FieldGroup label="Industry" wide>
                                    <Typeahead
                                        value={verticalSearch}
                                        onChange={v => setVerticalSearch(v)}
                                        suggestions={industryList}
                                        onSelect={v => setVerticalSearch(v)}
                                        placeholder="Type or select…"
                                    />
                                </FieldGroup>
                                <FieldGroup label="Assign Rep">
                                    <Typeahead value={repSearch} onChange={setRepSearch} suggestions={allRepNames} onSelect={setRepSearch} placeholder="Select rep…" dropUp />
                                </FieldGroup>
                                <FieldGroup label="Territory">
                                    <Typeahead value={territorySearch} onChange={setTerritorySearch} suggestions={allTerritories} onSelect={setTerritorySearch} placeholder="Select territory…" dropUp />
                                </FieldGroup>
                                <FieldGroup label="Segment" wide>
                                    <select value={formData.accountSegment || ''} onChange={e => hc('accountSegment', e.target.value)}
                                        style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans }}>
                                        <option value="">— Not set —</option>
                                        {(settings?.accountSegmentTiers?.length > 0
                                            ? settings.accountSegmentTiers.map(t => typeof t === 'object' ? t.tier : t)
                                            : ['Enterprise','Mid-Market','Partner','SMB','Strategic']
                                        ).map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </FieldGroup>
                                <FieldGroup label="Customer type" wide>
                                    {(formData.customerTypes || []).length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                                            {(formData.customerTypes || []).map(ct => (
                                                <span key={ct} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px 10px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 999, fontSize: 12, fontWeight: 500, color: T.ink }}>
                                                    {ct}
                                                    <button type="button" onClick={() => hc('customerTypes', (formData.customerTypes || []).filter(x => x !== ct))}
                                                        style={{ background: 'none', border: 'none', color: T.ink3, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <Typeahead
                                        value={customerTypeInput}
                                        onChange={setCustomerTypeInput}
                                        suggestions={allCustomerTypes.filter(t => !(formData.customerTypes || []).includes(t))}
                                        onSelect={(v) => { if (v && !(formData.customerTypes || []).includes(v)) hc('customerTypes', [...(formData.customerTypes || []), v]); setCustomerTypeInput(''); }}
                                        placeholder="Add customer type…"
                                        dropUp
                                    />
                                </FieldGroup>
                            </div>
                        ) : (
                            <div style={grid2}>
                                <ReadRow label="Phone" value={account?.phone} />
                                {account?.website && (
                                    <div style={{ marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>Website</div>
                                        <a href={account.website.startsWith('http') ? account.website : 'https://' + account.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#3a5a7a', textDecoration: 'none' }}>{account.website}</a>
                                    </div>
                                )}
                                <ReadRow label="Industry" value={account?.verticalMarket || account?.industry} />
                                <ReadRow label="Segment" value={account?.accountSegment} />
                                <ReadRow label="Customer type" value={((account?.customerTypes && account.customerTypes.length) ? account.customerTypes : (account?.customerType ? [account.customerType] : [])).join(', ')} />
                                <ReadRow label="Assigned Rep" value={account?.assignedRep} />
                                <ReadRow label="Territory" value={account?.assignedTerritory} />
                                {account?.parentAccountId && (() => {
                                    const parent = (accounts || []).find(a => a.id === account.parentAccountId);
                                    return parent ? <ReadRow label="Parent Account" value={parent.name} wide /> : null;
                                })()}
                                {account?.doNotContact && (
                                    <div style={{ gridColumn: '1 / -1', marginBottom: 10, background: '#fef2f2', border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: T.danger }}>
                                        🚫 Do Not Contact — flagged
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
                                    <TextInput value={formData.address2} onChange={v => hc('address2', v)} placeholder="Suite, floor…" />
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
                            (account?.address || account?.city) ? (
                                <div style={{ fontSize: 13, color: T.ink, lineHeight: 1.6, marginBottom: 10 }}>
                                    {account.address && <div>{account.address}</div>}
                                    {account.address2 && <div>{account.address2}</div>}
                                    {(account.city || account.state || account.zip) && (
                                        <div>{[account.city, account.state, account.zip].filter(Boolean).join(', ')}</div>
                                    )}
                                    {account.country && <div>{account.country}</div>}
                                </div>
                            ) : (
                                <div style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic', marginBottom: 10 }}>No address on file</div>
                            )
                        )}

                        {/* Sub-accounts (view only) */}
                        {!isEditing && subAccounts.length > 0 && (
                            <>
                                <SectionHeading label={`Sub-Accounts (${subAccounts.length})`} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                    {subAccounts.map(s => (
                                        <button key={s.id}
                                            onClick={() => handleOpenSubAccount(s.id)}
                                            style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '7px 10px', cursor: 'pointer', textAlign: 'left', fontFamily: T.sans, width: '100%' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{s.name}</div>
                                                {s.verticalMarket && <div style={{ fontSize: 11, color: T.ink3, marginTop: 1 }}>{s.verticalMarket}</div>}
                                            </div>
                                            <span style={{ fontSize: 11, color: T.ink3 }}>→</span>
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}

                {/* ════════ TAB: Details ════════ */}
                {activeTab === 'details' && (
                    <>
                        <SectionHeading label="Account Details" />
                        {isEditing ? (
                            <div style={grid2}>
                                <FieldGroup label="Total Employees">
                                    <TextInput value={formData.totalEmployees} onChange={v => hc('totalEmployees', v)} type="number" />
                                </FieldGroup>
                                <FieldGroup label="Annual Revenue">
                                    <TextInput value={formData.annualRevenue} onChange={v => hc('annualRevenue', v)} placeholder="$" />
                                </FieldGroup>
                                <FieldGroup label="Founded Year">
                                    <TextInput value={formData.foundedYear} onChange={v => hc('foundedYear', v)} />
                                </FieldGroup>
                                <FieldGroup label="Fiscal Year End">
                                    <select value={formData.fiscalYearEnd || ''} onChange={e => hc('fiscalYearEnd', e.target.value)}
                                        style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans }}>
                                        <option value="">— Not set —</option>
                                        {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                                            <option key={m} value={String(i + 1).padStart(2, '0')}>{m}</option>
                                        ))}
                                    </select>
                                </FieldGroup>
                                <FieldGroup label="LinkedIn URL" wide>
                                    <TextInput value={formData.linkedInUrl} onChange={v => hc('linkedInUrl', v)} placeholder="https://linkedin.com/company/…" />
                                </FieldGroup>
                                <FieldGroup label="SIC Code">
                                    <TextInput value={formData.sicCode} onChange={v => hc('sicCode', v)} />
                                </FieldGroup>
                                <FieldGroup label="NAICS Code">
                                    <TextInput value={formData.naicsCode} onChange={v => hc('naicsCode', v)} />
                                </FieldGroup>
                                <FieldGroup label="Description" wide>
                                    <textarea value={formData.description || ''} onChange={e => hc('description', e.target.value)} rows={4}
                                        style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', resize: 'vertical' }} />
                                </FieldGroup>
                                {/* Do Not Contact */}
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
                                <ReadRow label="Total Employees" value={account?.totalEmployees ? Number(account.totalEmployees).toLocaleString() : undefined} />
                                <ReadRow label="Annual Revenue" value={account?.annualRevenue ? '$' + Number(String(account.annualRevenue).replace(/[^0-9.]/g,'')).toLocaleString() : undefined} />
                                <ReadRow label="Founded" value={account?.foundedYear} />
                                <ReadRow label="Fiscal Year End" value={account?.fiscalYearEnd ? (['January','February','March','April','May','June','July','August','September','October','November','December'][parseInt(account.fiscalYearEnd, 10) - 1] || account.fiscalYearEnd) : undefined} />
                                <ReadRow label="SIC Code" value={account?.sicCode} />
                                <ReadRow label="NAICS Code" value={account?.naicsCode} />
                                {account?.linkedInUrl && (
                                    <div style={{ gridColumn: '1 / -1', marginBottom: 10 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.ink3, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>LinkedIn</div>
                                        <a href={account.linkedInUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#3a5a7a', textDecoration: 'none' }}>{account.linkedInUrl}</a>
                                    </div>
                                )}
                                <ReadRow label="Description" value={account?.description} wide />
                            </div>
                        )}

                        {/* Custom fields */}
                        {(settings?.customFieldsByObject?.Accounts || []).filter(f => (f.visibility || '').includes('Detail')).length > 0 && (
                            <div style={{ marginTop: 10 }}>
                                <SectionHeading label="Custom Fields" />
                                <div style={grid2}>
                                    {(settings.customFieldsByObject.Accounts).filter(f => (f.visibility || '').includes('Detail')).map(f => {
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
                                                    <TextInput value={val} onChange={v => hc(key, v)} type={f.type === 'Number' ? 'number' : 'text'} />
                                                )}
                                            </FieldGroup>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* ════════ TAB: People ════════ */}
                {activeTab === 'people' && !isNew && (
                    <>
                        <SectionHeading label={`Contacts (${accountContacts.length})`} />
                        {accountContacts.length === 0 ? (
                            <div style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic' }}>No contacts linked to this account</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {accountContacts.map(c => (
                                    <button key={c.id}
                                        onClick={() => handleOpenContactRail(c.id)}
                                        style={{ display: 'flex', alignItems: 'center', gap: 10, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '8px 10px', cursor: 'pointer', textAlign: 'left', fontFamily: T.sans, width: '100%' }}>
                                        <div style={{ width: 30, height: 30, borderRadius: '50%', background: avatarBg(c.firstName + c.lastName), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                                            {((c.firstName?.[0] || '') + (c.lastName?.[0] || '')).toUpperCase()}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{c.firstName} {c.lastName}</div>
                                            {c.title && <div style={{ fontSize: 11, color: T.ink3 }}>{c.title}</div>}
                                        </div>
                                        <span style={{ fontSize: 11, color: T.ink3 }}>→</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* ════════ TAB: Activity ════════ */}
                {activeTab === 'documents' && !isNew && account && (
                    <RecordDocuments recordType="account" recordId={account.id} recordName={account.name} recordSub={account?.verticalMarket || account?.industry} />
                )}

                {activeTab === 'activity' && !isNew && (
                    <>
                        <SectionHeading label={`Open Opportunities (${openOpps.length})`} />
                        {openOpps.length === 0 ? (
                            <div style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic', marginBottom: 14 }}>No open opportunities</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                                {openOpps.map(o => (
                                    <div key={o.id} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '8px 10px' }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{o.opportunityName || o.account}</div>
                                        <div style={{ fontSize: 11, color: T.ink3, marginTop: 2 }}>
                                            {o.stage}{o.value ? ` · $${Number(o.value).toLocaleString()}` : ''}
                                            {o.closeDate ? ` · Close ${o.closeDate}` : ''}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <SectionHeading label={`Activity History (${accountActivities.length})`} />
                        {accountActivities.length === 0 ? (
                            <div style={{ fontSize: 12, color: T.ink3, fontStyle: 'italic', marginBottom: 14 }}>No activity history</div>
                        ) : (
                            <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden', marginBottom: 14 }}>
                                {accountActivities.map((a, idx) => {
                                    const relOpp = a.opportunityId ? (opportunities || []).find(o => o.id === a.opportunityId) : null;
                                    return (
                                        <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderBottom: idx < accountActivities.length - 1 ? `1px solid ${T.border}` : 'none', background: idx % 2 === 0 ? '#fff' : T.surface }}>
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
                                onClick={() => { setActivityInitialContext && setActivityInitialContext({ opportunityId: '' }); setShowActivityModal(true); }}
                                style={{ flex: 1, padding: '8px', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                + Log Activity
                            </button>
                            <button
                                onClick={() => { setTaskRailId('new'); setTaskRailMode('new'); }}
                                style={{ flex: 1, padding: '8px', background: T.surface2, color: T.ink2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                + Add Task
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* ── Footer: Save/Discard (edit mode) ─────────────────────────── */}
            {isEditing && (
                <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: '12px 16px', background: T.surface, display: 'flex', gap: 8, alignItems: 'center' }}>
                    {dirty && <span style={{ fontSize: 11, color: T.ink3, flex: 1 }}>Unsaved changes</span>}
                    <button onClick={handleDiscard}
                        style={{ padding: '8px 16px', background: T.surface2, color: T.ink2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, marginLeft: 'auto' }}>
                        Discard
                    </button>
                    <button onClick={handleSave} disabled={accountModalSaving}
                        style={{ padding: '8px 20px', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, fontSize: 13, fontWeight: 700, cursor: accountModalSaving ? 'not-allowed' : 'pointer', fontFamily: T.sans, opacity: accountModalSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {accountModalSaving && <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                        {accountModalSaving ? 'Saving…' : isNew ? 'Create Account' : 'Save Changes'}
                    </button>
                </div>
            )}
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
    );
}
