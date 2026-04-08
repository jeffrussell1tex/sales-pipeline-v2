import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../AppContext';
import { useDraggable } from '../../hooks/useDraggable';

// ─── helpers ──────────────────────────────────────────────────────────────────

const INDUSTRIES = [
    'Accounting', 'Advertising & Marketing', 'Aerospace & Defense', 'Agriculture',
    'Architecture & Engineering', 'Automotive', 'Banking', 'Biotech & Life Sciences',
    'Broadcasting & Media', 'Chemical', 'Clothing & Apparel', 'Construction',
    'Consulting', 'Consumer Goods', 'Education', 'Electronics', 'Energy & Utilities',
    'Entertainment', 'Environmental Services', 'Financial Services', 'Food & Beverage',
    'Government', 'Healthcare', 'Hospitality & Travel', 'Human Resources',
    'Import & Export', 'Information Technology', 'Insurance', 'Legal Services',
    'Logistics & Transportation', 'Manufacturing', 'Non-Profit', 'Oil & Gas',
    'Pharmaceuticals', 'Real Estate', 'Retail', 'Security', 'Software',
    'Telecommunications', 'Wholesale',
];

const MONTH_OPTIONS = [
    { value: '01', label: 'January' },   { value: '02', label: 'February' },
    { value: '03', label: 'March' },     { value: '04', label: 'April' },
    { value: '05', label: 'May' },       { value: '06', label: 'June' },
    { value: '07', label: 'July' },      { value: '08', label: 'August' },
    { value: '09', label: 'September' }, { value: '10', label: 'October' },
    { value: '11', label: 'November' },  { value: '12', label: 'December' },
];

function ensureHttp(url) {
    if (!url) return '#';
    return /^https?:\/\//i.test(url) ? url : 'https://' + url;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function AccountModal({
    account, isSubAccount, parentTier, settings: settingsProp,
    onClose, onSave, onAddRep, existingAccounts, errorMessage, onDismissError, saving
}) {
    const { settings: contextSettings } = useApp();
    const settings = {
        ...settingsProp,
        users: contextSettings?.users?.length
            ? contextSettings.users
            : (settingsProp?.users || []),
    };

    // ── tier labels ──────────────────────────────────────────────────────────
    const tierLabel = account?.accountTier === 'site'          ? 'Site'
        : account?.accountTier === 'business_unit'             ? 'Business Unit'
        : parentTier === 'business_unit'                       ? 'Site'
        : parentTier === 'site'                                ? 'Site'
        : parentTier === 'account'                             ? 'Business Unit'
        : 'Account';

    const derivedTier = account?.accountTier
        || (parentTier === 'business_unit' ? 'site'
            : parentTier === 'site'        ? 'site'
            : parentTier === 'account'     ? 'business_unit'
            : 'account');

    // ── form state ───────────────────────────────────────────────────────────
    const [formData, setFormData] = useState(account || {
        name: '', verticalMarket: '',
        address: '', address2: '',
        city: '', state: '', zip: '', country: '',
        website: '', phone: '',
        doNotContact: false, customerTypes: [],
        // Account Details fields
        description: '', totalEmployees: '', annualRevenue: '',
        fiscalYearEnd: '', foundedYear: '', linkedInUrl: '',
        sicCode: '', naicsCode: '',
    });

    const [activeTab, setActiveTab] = useState('general');

    const [verticalSearch,       setVerticalSearch]       = useState(account?.verticalMarket || '');
    const [showVerticalSugg,     setShowVerticalSugg]     = useState(false);
    const [repSearch,            setRepSearch]            = useState(account?.assignedRep || '');
    const [showRepSugg,          setShowRepSugg]          = useState(false);
    const [territorySearch,      setTerritorySearch]      = useState(account?.assignedTerritory || '');
    const [showTerritorySugg,    setShowTerritorySugg]    = useState(false);
    const [parentSearch,         setParentSearch]         = useState(() => {
        if (account?.parentAccountId && existingAccounts) {
            const p = existingAccounts.find(a => a.id === account.parentAccountId);
            return p?.name || '';
        }
        return '';
    });
    const [showParentSugg,       setShowParentSugg]       = useState(false);
    const [duplicateWarning,     setDuplicateWarning]     = useState(null);
    const [customerTypeInput,    setCustomerTypeInput]    = useState('');
    const [showCustomerTypeSugg, setShowCustomerTypeSugg] = useState(false);

    const { dragHandleProps, dragOffsetStyle, overlayStyle, containerRef } = useDraggable();

    // ── derived lists ────────────────────────────────────────────────────────
    const allRepNames = [...new Set(
        (settings?.users || []).filter(u => u.name).map(u => u.name)
    )].sort();

    const allTerritories = [...new Set([
        ...((settings?.territories || []).map(t => typeof t === 'string' ? t : t.name).filter(Boolean)),
        ...((settings?.users || []).filter(u => u.territory).map(u => u.territory)),
    ])].sort();

    // Industry list: merge Settings-defined verticalMarkets (alphabetically) with built-in list
    const verticalMarkets = React.useMemo(() => {
        const raw = settings?.verticalMarkets || [];
        const options = [];
        raw.forEach(m => {
            if (typeof m === 'string') options.push(m);
            else {
                options.push(m.name);
                (m.subs || []).forEach(s => options.push(s));
            }
        });
        // Fall back to built-in list if settings has none defined
        const base = options.length > 0 ? options : INDUSTRIES;
        return [...new Set(base)].sort((a, b) => a.localeCompare(b));
    }, [settings?.verticalMarkets]);

    // ── handlers ─────────────────────────────────────────────────────────────
    const handleChange = (field, value) => setFormData(prev => ({ ...prev, [field]: value }));

    const handleSubmit = (e) => {
        e.preventDefault();
        const selectedParent = (existingAccounts || []).find(a => a.name === parentSearch);
        const saveData = {
            ...formData,
            verticalMarket:    verticalSearch,
            assignedRep:       repSearch,
            assignedTerritory: territorySearch,
            parentAccountId:   selectedParent ? selectedParent.id : (formData.parentAccountId || null),
            accountTier:       derivedTier,
            doNotContact:      formData.doNotContact === true,
            customerTypes:     formData.customerTypes || [],
        };

        // Fuzzy duplicate check
        const normalize = s => (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const inputNorm = normalize(saveData.name);
        if (existingAccounts && inputNorm) {
            const candidates = existingAccounts.filter(a => {
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
                        const val = aNorm[j-1] === inputNorm[i-1]
                            ? dp[i-1]
                            : 1 + Math.min(dp[i-1], dp[i], prev);
                        dp[i-1] = prev; prev = val;
                    }
                    dp[inputNorm.length] = prev;
                }
                return dp[inputNorm.length] <= 2;
            });
            if (candidates.length > 0 && !duplicateWarning) {
                setDuplicateWarning(candidates);
                return;
            }
        }
        onSave(saveData);
    };

    // ── shared input styles ──────────────────────────────────────────────────
    const inp = { /* applied via className="..." in index.css */ };

    // ── tab styles ───────────────────────────────────────────────────────────
    const tabStyle = (tab) => ({
        padding: '0.5rem 1.25rem',
        border: 'none',
        borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
        background: 'transparent',
        color: activeTab === tab ? '#2563eb' : '#64748b',
        fontWeight: activeTab === tab ? '700' : '500',
        fontSize: '0.875rem',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
    });

    // ── render ───────────────────────────────────────────────────────────────
    return (
        <>
        {errorMessage && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
                 onClick={e => e.stopPropagation()}>
                <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '2rem', maxWidth: '420px', width: '90%', textAlign: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem' }}>⚠️</div>
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.0625rem', fontWeight: '700', color: '#1e293b' }}>Failed to Save Account</h3>
                    <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>{errorMessage}</p>
                    <button onClick={onDismissError} style={{ padding: '0.5rem 1.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#1e293b', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>OK</button>
                </div>
            </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

        {/* Overlay — transparent backdrop; click-outside closes */}
        <div className="modal-overlay" style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()} />

        {/* Modal — fixed-positioned, freely draggable */}
        <div
            ref={containerRef}
            onClick={e => e.stopPropagation()}
            style={{
                ...dragOffsetStyle,
                width: '96vw',
                maxWidth: '800px',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: '#fff',
                borderRadius: '12px',
                boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
                border: '1px solid #e5e2db',
                maxHeight: '90vh',
            }}
        >
            {/* ── Drag handle header ── */}
            <div
                {...dragHandleProps}
                style={{
                    ...dragHandleProps.style,
                    background: '#1c1917',
                    padding: '0.875rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: '12px 12px 0 0',
                    minHeight: '52px',
                    flexShrink: 0,
                }}
            >
                <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: '700', color: '#f5f1eb', cursor: 'inherit', userSelect: 'none' }}>
                    {account ? `Edit ${tierLabel}` : `New ${tierLabel}`}
                </h2>
                <span style={{ fontSize: '0.6875rem', color: 'rgba(245,241,235,0.35)', fontWeight: '500', letterSpacing: '0.03em' }}>⠿ drag</span>
            </div>

            {/* ── Sub-tab row ── */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#fafaf9', flexShrink: 0 }}>
                <button style={tabStyle('general')}  onClick={() => setActiveTab('general')}>General Info</button>
                <button style={tabStyle('details')}  onClick={() => setActiveTab('details')}>Account Details</button>
            </div>

            {/* ── Scrollable body ── */}
            <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1, minHeight: 0 }}>
                <form onSubmit={handleSubmit}>

                    {/* ════════════ TAB 1 — General Info ════════════ */}
                    {activeTab === 'general' && (
                        <div className="form-grid">

                            {/* Account Name */}
                            <div className="form-group full">
                                <label>Account Name*</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={e => { handleChange('name', e.target.value); if (duplicateWarning) setDuplicateWarning(null); }}
                                    style={duplicateWarning ? { borderColor: '#f59e0b', background: '#fffbeb' } : {}}
                                    required
                                    autoFocus
                                />
                            </div>

                            {/* Parent Account */}
                            {!isSubAccount && (
                                <div className="form-group full" style={{ position: 'relative' }}>
                                    <label>Parent Account <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '400' }}>— leave blank for top-level</span></label>
                                    <input
                                        type="text"
                                        value={parentSearch}
                                        onChange={e => { setParentSearch(e.target.value); setShowParentSugg(true); }}
                                        onFocus={() => setShowParentSugg(true)}
                                        onBlur={() => setTimeout(() => setShowParentSugg(false), 200)}
                                        placeholder="Type to search accounts..."
                                        autoComplete="off"
                                        style={parentSearch && (existingAccounts || []).find(a => a.name === parentSearch)
                                            ? { borderColor: '#16a34a', background: '#f0fdf4' } : {}}
                                    />
                                    {parentSearch && (existingAccounts || []).find(a => a.name === parentSearch) && (
                                        <div style={{ fontSize: '0.75rem', color: '#16a34a', marginTop: '0.25rem', fontWeight: '600' }}>
                                            ✓ Will be saved as Business Unit under {parentSearch}
                                        </div>
                                    )}
                                    {showParentSugg && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                            {(existingAccounts || [])
                                                .filter(a => a.id !== account?.id && !a.parentAccountId && (!parentSearch || a.name.toLowerCase().includes(parentSearch.toLowerCase())))
                                                .sort((a, b) => a.name.localeCompare(b.name))
                                                .slice(0, 10)
                                                .map(a => (
                                                    <div key={a.id}
                                                        onMouseDown={e => e.preventDefault()}
                                                        onClick={() => { setParentSearch(a.name); setShowParentSugg(false); }}
                                                        style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                    >{a.name}</div>
                                                ))}
                                            {parentSearch && (
                                                <div
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => setParentSearch('')}
                                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', color: '#94a3b8', borderTop: '1px solid #f1f3f5' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >✕ Clear (save as top-level)</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Phone */}
                            <div className="form-group">
                                <label>Main Phone</label>
                                <input type="tel" value={formData.phone} onChange={e => handleChange('phone', e.target.value)} />
                            </div>

                            {/* Website with hyperlink */}
                            <div className="form-group">
                                <label>Website</label>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <input
                                        type="url"
                                        value={formData.website}
                                        onChange={e => handleChange('website', e.target.value)}
                                        placeholder="https://example.com"
                                        style={{ flex: 1 }}
                                    />
                                    {formData.website && (
                                        <a
                                            href={ensureHttp(formData.website)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="Open website"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '34px',
                                                height: '34px',
                                                borderRadius: '6px',
                                                background: '#1c1917',
                                                color: '#f5f1eb',
                                                fontSize: '0.875rem',
                                                textDecoration: 'none',
                                                flexShrink: 0,
                                                transition: 'background 0.15s',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#44403c'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#1c1917'}
                                        >↗</a>
                                    )}
                                </div>
                            </div>

                            {/* Industry — alphabetical typeahead */}
                            <div className="form-group" style={{ position: 'relative' }}>
                                <label>Industry</label>
                                <input
                                    type="text"
                                    value={verticalSearch}
                                    onChange={e => { setVerticalSearch(e.target.value); setShowVerticalSugg(true); }}
                                    onFocus={() => setShowVerticalSugg(true)}
                                    onBlur={() => setTimeout(() => setShowVerticalSugg(false), 200)}
                                    placeholder="Type or select..."
                                    autoComplete="off"
                                />
                                {showVerticalSugg && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '220px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                        {verticalMarkets
                                            .filter(v => v.toLowerCase().includes(verticalSearch.toLowerCase()))
                                            .map((v, i) => (
                                                <div key={i}
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => { setVerticalSearch(v); setShowVerticalSugg(false); }}
                                                    style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.8125rem', color: '#1e293b', transition: 'background 0.15s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >{v}</div>
                                            ))}
                                        {verticalMarkets.filter(v => v.toLowerCase().includes(verticalSearch.toLowerCase())).length === 0 && (
                                            <div style={{ padding: '0.75rem', color: '#94a3b8', fontSize: '0.8125rem' }}>No industries found.</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Assign Territory */}
                            <div className="form-group" style={{ position: 'relative' }}>
                                <label>Assign Territory</label>
                                <input
                                    type="text"
                                    value={territorySearch}
                                    onChange={e => { setTerritorySearch(e.target.value); setShowTerritorySugg(true); }}
                                    onFocus={() => setShowTerritorySugg(true)}
                                    onBlur={() => setTimeout(() => setShowTerritorySugg(false), 200)}
                                    placeholder="Type or select territory..."
                                    autoComplete="off"
                                />
                                {showTerritorySugg && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '180px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                        {allTerritories.filter(t => t.toLowerCase().includes(territorySearch.toLowerCase())).map((t, i) => (
                                            <div key={i}
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => { setTerritorySearch(t); setShowTerritorySugg(false); }}
                                                style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >{t}</div>
                                        ))}
                                        {allTerritories.filter(t => t.toLowerCase().includes(territorySearch.toLowerCase())).length === 0 && (
                                            <div style={{ padding: '0.625rem 0.75rem', color: '#94a3b8', fontSize: '0.8125rem' }}>No territories — add in Settings</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Assign Rep */}
                            <div className="form-group" style={{ position: 'relative' }}>
                                <label>Assign Rep</label>
                                <input
                                    type="text"
                                    value={repSearch}
                                    onChange={e => { setRepSearch(e.target.value); setShowRepSugg(true); }}
                                    onFocus={() => setShowRepSugg(true)}
                                    onBlur={() => setTimeout(() => setShowRepSugg(false), 200)}
                                    placeholder="Type or select rep..."
                                    autoComplete="off"
                                />
                                {showRepSugg && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '180px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                        {allRepNames.filter(r => r.toLowerCase().includes(repSearch.toLowerCase())).map((r, i) => (
                                            <div key={i}
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => { setRepSearch(r); setShowRepSugg(false); }}
                                                style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem', fontWeight: '600' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >{r}</div>
                                        ))}
                                        {allRepNames.filter(r => r.toLowerCase().includes(repSearch.toLowerCase())).length === 0 && (
                                            <div style={{ padding: '0.625rem 0.75rem', color: '#94a3b8', fontSize: '0.8125rem' }}>No reps — add in Settings</div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── Address block ── */}
                            <div className="form-group full">
                                <label>Street Address</label>
                                <input type="text" value={formData.address} onChange={e => handleChange('address', e.target.value)} placeholder="123 Main Street" />
                            </div>
                            <div className="form-group full">
                                <label>Address Line 2 <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '400' }}>Suite, floor, unit, etc.</span></label>
                                <input type="text" value={formData.address2 || ''} onChange={e => handleChange('address2', e.target.value)} placeholder="Suite 100" />
                            </div>
                            <div className="form-group">
                                <label>City</label>
                                <input type="text" value={formData.city} onChange={e => handleChange('city', e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>State</label>
                                <input type="text" value={formData.state} onChange={e => handleChange('state', e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>ZIP Code</label>
                                <input type="text" value={formData.zip} onChange={e => handleChange('zip', e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Country</label>
                                <input type="text" value={formData.country} onChange={e => handleChange('country', e.target.value)} />
                            </div>

                            {/* ── Customer Types ── */}
                            <div className="form-group full" style={{ position: 'relative' }}>
                                <label>Customer Type</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: (formData.customerTypes || []).length > 0 ? '0.5rem' : 0 }}>
                                    {(formData.customerTypes || []).map((ct, i) => (
                                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', background: '#1c1917', color: '#f5f1eb', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.75rem', fontWeight: '600' }}>
                                            {ct}
                                            <button type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, customerTypes: (prev.customerTypes || []).filter((_, j) => j !== i) }))}
                                                style={{ background: 'none', border: 'none', color: '#a8a29e', cursor: 'pointer', padding: '0 0 0 2px', lineHeight: 1, fontSize: '0.875rem', fontFamily: 'inherit' }}
                                            >×</button>
                                        </span>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    value={customerTypeInput}
                                    onChange={e => { setCustomerTypeInput(e.target.value); setShowCustomerTypeSugg(true); }}
                                    onFocus={() => setShowCustomerTypeSugg(true)}
                                    onBlur={() => setTimeout(() => setShowCustomerTypeSugg(false), 200)}
                                    placeholder="Type to search or add a type..."
                                    autoComplete="off"
                                />
                                {showCustomerTypeSugg && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '180px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                        {(settings?.customerTypes || [])
                                            .filter(ct => ct.toLowerCase().includes(customerTypeInput.toLowerCase()) && !(formData.customerTypes || []).includes(ct))
                                            .map((ct, i) => (
                                                <div key={i}
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => {
                                                        setFormData(prev => ({ ...prev, customerTypes: [...(prev.customerTypes || []), ct] }));
                                                        setCustomerTypeInput('');
                                                        setShowCustomerTypeSugg(false);
                                                    }}
                                                    style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >{ct}</div>
                                            ))}
                                        {(settings?.customerTypes || []).filter(ct => ct.toLowerCase().includes(customerTypeInput.toLowerCase()) && !(formData.customerTypes || []).includes(ct)).length === 0 && (
                                            <div style={{ padding: '0.625rem 0.75rem', color: '#94a3b8', fontSize: '0.8125rem' }}>
                                                {(settings?.customerTypes || []).length === 0
                                                    ? 'No types defined — add in Settings → Configuration'
                                                    : 'No matching types'}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* ── Do Not Contact ── */}
                            <div className="form-group full">
                                <label>Do Not Contact</label>
                                <div
                                    onClick={() => setFormData(prev => ({ ...prev, doNotContact: !prev.doNotContact }))}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer', userSelect: 'none', padding: '0.625rem 0.875rem', borderRadius: '8px', border: formData.doNotContact ? '1px solid #fca5a5' : '1px solid #e5e2db', background: formData.doNotContact ? '#fef2f2' : '#f0ece4', transition: 'all 0.15s' }}
                                >
                                    <div style={{ width: '36px', height: '20px', borderRadius: '999px', background: formData.doNotContact ? '#dc2626' : '#d6d3ce', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                        <div style={{ position: 'absolute', width: '14px', height: '14px', background: '#fff', borderRadius: '50%', top: '3px', left: formData.doNotContact ? '19px' : '3px', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: formData.doNotContact ? '#dc2626' : '#57534e' }}>
                                            {formData.doNotContact ? '🚫 Do Not Contact — flagged' : 'Not flagged'}
                                        </div>
                                        {formData.doNotContact && (
                                            <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: '0.125rem' }}>
                                                Emails blocked · Activity warnings active
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ════════════ TAB 2 — Account Details ════════════ */}
                    {activeTab === 'details' && (
                        <div className="form-grid">

                            {/* Company Description */}
                            <div className="form-group full">
                                <label>Company Description</label>
                                <textarea
                                    value={formData.description || ''}
                                    onChange={e => handleChange('description', e.target.value)}
                                    rows={4}
                                    placeholder="What does this company do? Core products, services, market position..."
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e5e2db', borderRadius: '8px', fontSize: '0.875rem', fontFamily: 'inherit', background: '#f0ece4', color: '#1c1917', outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
                                />
                            </div>

                            {/* Total Employees */}
                            <div className="form-group">
                                <label>Total Employees</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={formData.totalEmployees || ''}
                                    onChange={e => handleChange('totalEmployees', e.target.value)}
                                    placeholder="e.g. 250"
                                />
                            </div>

                            {/* Annual Revenue */}
                            <div className="form-group">
                                <label>Annual Revenue ($)</label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1000"
                                    value={formData.annualRevenue || ''}
                                    onChange={e => handleChange('annualRevenue', e.target.value)}
                                    placeholder="e.g. 5000000"
                                />
                            </div>

                            {/* Founded Year */}
                            <div className="form-group">
                                <label>Founded Year</label>
                                <input
                                    type="number"
                                    min="1800"
                                    max={new Date().getFullYear()}
                                    value={formData.foundedYear || ''}
                                    onChange={e => handleChange('foundedYear', e.target.value)}
                                    placeholder="e.g. 1998"
                                />
                            </div>

                            {/* Fiscal Year End */}
                            <div className="form-group">
                                <label>Fiscal Year End</label>
                                <select
                                    value={formData.fiscalYearEnd || ''}
                                    onChange={e => handleChange('fiscalYearEnd', e.target.value)}
                                >
                                    <option value="">— Select month —</option>
                                    {MONTH_OPTIONS.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* LinkedIn URL */}
                            <div className="form-group">
                                <label>LinkedIn URL</label>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <input
                                        type="url"
                                        value={formData.linkedInUrl || ''}
                                        onChange={e => handleChange('linkedInUrl', e.target.value)}
                                        placeholder="https://linkedin.com/company/..."
                                        style={{ flex: 1 }}
                                    />
                                    {formData.linkedInUrl && (
                                        <a
                                            href={ensureHttp(formData.linkedInUrl)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="Open LinkedIn"
                                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '6px', background: '#0a66c2', color: '#fff', fontSize: '0.75rem', fontWeight: '700', textDecoration: 'none', flexShrink: 0 }}
                                        >in</a>
                                    )}
                                </div>
                            </div>

                            {/* SIC Code */}
                            <div className="form-group">
                                <label>SIC Code <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '400' }}>optional</span></label>
                                <input
                                    type="text"
                                    value={formData.sicCode || ''}
                                    onChange={e => handleChange('sicCode', e.target.value)}
                                    placeholder="e.g. 7372"
                                    maxLength={6}
                                />
                            </div>

                            {/* NAICS Code */}
                            <div className="form-group">
                                <label>NAICS Code <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '400' }}>optional</span></label>
                                <input
                                    type="text"
                                    value={formData.naicsCode || ''}
                                    onChange={e => handleChange('naicsCode', e.target.value)}
                                    placeholder="e.g. 511210"
                                    maxLength={8}
                                />
                            </div>
                        </div>
                    )}

                    {/* ── Duplicate warning ── */}
                    {duplicateWarning && (
                        <div style={{ margin: '0 0 1rem', padding: '1rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px' }}>
                            <div style={{ fontWeight: '700', color: '#92400e', marginBottom: '0.375rem', fontSize: '0.9375rem' }}>
                                ⚠ Possible Duplicate{duplicateWarning.length > 1 ? 's' : ''} Found
                            </div>
                            <div style={{ fontSize: '0.8125rem', color: '#78350f', marginBottom: '0.625rem' }}>
                                {duplicateWarning.length === 1
                                    ? 'An account with a similar name already exists:'
                                    : `${duplicateWarning.length} similar accounts already exist:`}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.75rem' }}>
                                {duplicateWarning.map(dup => (
                                    <div key={dup.id} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.8125rem' }}>
                                        <div style={{ fontWeight: '700', color: '#1e293b' }}>{dup.name}</div>
                                        <div style={{ color: '#64748b', marginTop: '0.1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                            {dup.industry      && <span>🏭 {dup.industry}</span>}
                                            {dup.accountOwner  && <span>👤 {dup.accountOwner}</span>}
                                            {dup.phone         && <span>📞 {dup.phone}</span>}
                                            {dup.website       && <span>🌐 {dup.website}</span>}
                                            {!dup.industry && !dup.accountOwner && !dup.phone
                                                && <span style={{ color: '#94a3b8' }}>No additional details</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button type="button"
                                    onClick={() => {
                                        setDuplicateWarning(null);
                                        const p2 = (existingAccounts || []).find(a => a.name === parentSearch);
                                        onSave({ ...formData, verticalMarket: verticalSearch, assignedRep: repSearch, assignedTerritory: territorySearch, parentAccountId: p2 ? p2.id : (formData.parentAccountId || null), accountTier: derivedTier, doNotContact: formData.doNotContact === true, customerTypes: formData.customerTypes || [] });
                                    }}
                                    style={{ padding: '0.375rem 0.75rem', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '700', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}>
                                    Create Anyway
                                </button>
                                <button type="button" onClick={() => setDuplicateWarning(null)}
                                    style={{ padding: '0.375rem 0.75rem', background: '#fff', color: '#64748b', border: '1px solid #d1d5db', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '0.8125rem', fontFamily: 'inherit' }}>
                                    Go Back & Edit
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── Actions ── */}
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="btn" disabled={saving} style={{ opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {saving && <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                            {saving ? 'Saving…' : (account ? 'Update' : 'Create')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
        </>
    );
}
