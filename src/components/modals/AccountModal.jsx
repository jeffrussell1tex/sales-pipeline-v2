import React, { useState, useEffect, useRef } from 'react';

export default function AccountModal({ account, isSubAccount, settings, onClose, onSave, onAddRep, existingAccounts, errorMessage, onDismissError, saving }) {
    const [formData, setFormData] = useState(account || {
        name: '',
        verticalMarket: '',
        address: '',
        city: '',
        state: '',
        zip: '',
        country: '',
        website: '',
        phone: '',
        accountOwner: ''
    });

    const [verticalSearch, setVerticalSearch] = useState(account?.verticalMarket || '');
    const [showVerticalSuggestions, setShowVerticalSuggestions] = useState(false);
    const [ownerSearch, setOwnerSearch] = useState(account?.accountOwner || '');
    const [showOwnerSuggestions, setShowOwnerSuggestions] = useState(false);
    const [repSearch, setRepSearch] = useState(account?.assignedRep || '');
    const [showRepSuggestions, setShowRepSuggestions] = useState(false);
    const [territorySearch, setTerritorySearch] = useState(account?.assignedTerritory || '');
    const [showTerritorySuggestions, setShowTerritorySuggestions] = useState(false);
    const [duplicateWarning, setDuplicateWarning] = useState(null);

    const allRepNames = [...new Set([
        ...(settings?.users || []).filter(u => u.name).map(u => u.name)
    ])].sort();
    const allTerritories = [...new Set(
        (settings?.users || []).filter(u => u.territory).map(u => u.territory)
    )].sort();

    const handleChange = (field, value) => {
        setFormData({ ...formData, [field]: value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const saveData = { ...formData, verticalMarket: verticalSearch, accountOwner: ownerSearch, assignedRep: repSearch, assignedTerritory: territorySearch };
        // Fuzzy duplicate check — catches exact, case-insensitive, and near matches
        const normalize = s => (s || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
        const inputNorm = normalize(saveData.name);
        if (existingAccounts && inputNorm) {
            const candidates = existingAccounts.filter(a => {
                // Skip self when editing
                if (account && a.id === account.id) return false;
                const aNorm = normalize(a.name);
                if (!aNorm) return false;
                // Exact match
                if (aNorm === inputNorm) return true;
                // One contains the other (e.g. "Acme" vs "Acme Corp")
                if (aNorm.includes(inputNorm) || inputNorm.includes(aNorm)) return true;
                // Levenshtein distance <= 2 for similar short names
                const longer = Math.max(aNorm.length, inputNorm.length);
                if (longer <= 6) return false; // too short to fuzzy-match reliably
                let dp = Array.from({length: inputNorm.length+1}, (_,i) => i);
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
            if (candidates.length > 0 && !duplicateWarning) {
                setDuplicateWarning(candidates);
                return;
            }
        }
        onSave(saveData);
    };

    const verticalMarkets = settings?.verticalMarkets || [];

    return (
        <>
        {errorMessage && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
                 onClick={e => e.stopPropagation()}>
                <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '2rem', maxWidth: '420px', width: '90%', textAlign: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem' }}>⚠️</div>
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.0625rem', fontWeight: '700', color: '#1e293b' }}>Failed to Save Account</h3>
                    <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>{errorMessage}</p>
                    <button
                        onClick={onDismissError}
                        style={{ padding: '0.5rem 1.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#1e293b', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                        OK
                    </button>
                </div>
            </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div className="modal-overlay">
            <div className="modal" onClick={e => e.stopPropagation()}>
                <h2>{account ? (isSubAccount ? 'Edit Sub-Account' : 'Edit Account') : (isSubAccount ? 'New Sub-Account' : 'New Account')}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group full">
                            <label>Account Name*</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={e => { handleChange('name', e.target.value); if (duplicateWarning) setDuplicateWarning(null); }}
                                style={duplicateWarning ? { borderColor: '#f59e0b', background: '#fffbeb' } : {}}
                            />
                        </div>
                        <div className="form-group" style={{ position: 'relative' }}>
                            <label>Account Owner</label>
                            <input
                                type="text"
                                value={ownerSearch}
                                onChange={e => {
                                    setOwnerSearch(e.target.value);
                                    setShowOwnerSuggestions(e.target.value.length > 0);
                                }}
                                onFocus={() => setShowOwnerSuggestions(ownerSearch.length > 0)}
                                onBlur={() => setTimeout(() => setShowOwnerSuggestions(false), 200)}
                                placeholder="Start typing name..."
                                autoComplete="off"
                            />
                            {showOwnerSuggestions && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0,
                                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px',
                                    marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', zIndex: 1000,
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}>
                                    {(settings?.users || [])
                                        .filter(u => u.name.toLowerCase().startsWith(ownerSearch.toLowerCase()))
                                        .map(user => (
                                            <div key={user.id}
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => { setOwnerSearch(user.name); setShowOwnerSuggestions(false); }}
                                                style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontWeight: '600', fontSize: '0.875rem' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >{user.name}</div>
                                        ))}
                                    <div onMouseDown={e => e.preventDefault()}
                                        onClick={() => { setShowOwnerSuggestions(false); if (onAddRep) onAddRep(); }}
                                        style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >+ New Rep</div>
                                </div>
                            )}
                        </div>
                        <div className="form-group">
                            <label>Main Phone</label>
                            <input
                                type="tel"
                                value={formData.phone}
                                onChange={e => handleChange('phone', e.target.value)}
                                
                            />
                        </div>
                        <div className="form-group full">
                            <label>Street Address</label>
                            <input
                                type="text"
                                value={formData.address}
                                onChange={e => handleChange('address', e.target.value)}
                                
                            />
                        </div>
                        <div className="form-group">
                            <label>City</label>
                            <input
                                type="text"
                                value={formData.city}
                                onChange={e => handleChange('city', e.target.value)}
                                
                            />
                        </div>
                        <div className="form-group">
                            <label>State</label>
                            <input
                                type="text"
                                value={formData.state}
                                onChange={e => handleChange('state', e.target.value)}
                                
                            />
                        </div>
                        <div className="form-group">
                            <label>ZIP Code</label>
                            <input
                                type="text"
                                value={formData.zip}
                                onChange={e => handleChange('zip', e.target.value)}
                                
                            />
                        </div>
                        <div className="form-group">
                            <label>Country</label>
                            <input
                                type="text"
                                value={formData.country}
                                onChange={e => handleChange('country', e.target.value)}
                                
                            />
                        </div>
                        <div className="form-group">
                            <label>Website</label>
                            <input
                                type="url"
                                value={formData.website}
                                onChange={e => handleChange('website', e.target.value)}
                                
                            />
                        </div>
                        <div className="form-group" style={{ position: 'relative' }}>
                            <label>Industry</label>
                            <input
                                type="text"
                                value={verticalSearch}
                                onChange={e => {
                                    setVerticalSearch(e.target.value);
                                    setShowVerticalSuggestions(e.target.value.length > 0);
                                }}
                                onFocus={() => setShowVerticalSuggestions(verticalSearch.length > 0 || verticalMarkets.length > 0)}
                                placeholder="Type or select..."
                                autoComplete="off"
                            />
                            {showVerticalSuggestions && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0,
                                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px',
                                    marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto',
                                    zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}>
                                    {verticalMarkets
                                        .filter(m => m.toLowerCase().includes(verticalSearch.toLowerCase()))
                                        .map((market, idx) => (
                                            <div key={idx}
                                                onClick={() => { setVerticalSearch(market); setShowVerticalSuggestions(false); }}
                                                style={{ padding: '0.75rem', cursor: 'pointer', borderBottom: '1px solid #e2e8f0', transition: 'background 0.2s' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                {market}
                                            </div>
                                        ))}
                                    {verticalMarkets.length === 0 && (
                                        <div style={{ padding: '0.75rem', color: '#94a3b8', fontSize: '0.8125rem' }}>
                                            No industries defined yet — add them in Settings → Industries.
                                        </div>
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
                                onChange={e => { setTerritorySearch(e.target.value); setShowTerritorySuggestions(true); }}
                                onFocus={() => setShowTerritorySuggestions(true)}
                                onBlur={() => setTimeout(() => setShowTerritorySuggestions(false), 200)}
                                placeholder="Type or select territory..."
                                autoComplete="off"
                            />
                            {showTerritorySuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '180px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                    {allTerritories.filter(t => t.toLowerCase().includes(territorySearch.toLowerCase())).map((t, i) => (
                                        <div key={i} onMouseDown={e => e.preventDefault()}
                                            onClick={() => { setTerritorySearch(t); setShowTerritorySuggestions(false); }}
                                            style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >{t}</div>
                                    ))}
                                    {allTerritories.filter(t => t.toLowerCase().includes(territorySearch.toLowerCase())).length === 0 && (
                                        <div style={{ padding: '0.625rem 0.75rem', color: '#94a3b8', fontSize: '0.8125rem' }}>No territories found — add in Settings</div>
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
                                onChange={e => { setRepSearch(e.target.value); setShowRepSuggestions(true); }}
                                onFocus={() => setShowRepSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowRepSuggestions(false), 200)}
                                placeholder="Type or select rep..."
                                autoComplete="off"
                            />
                            {showRepSuggestions && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '0.25rem', maxHeight: '180px', overflowY: 'auto', zIndex: 1000, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                                    {allRepNames.filter(r => r.toLowerCase().includes(repSearch.toLowerCase())).map((r, i) => (
                                        <div key={i} onMouseDown={e => e.preventDefault()}
                                            onClick={() => { setRepSearch(r); setShowRepSuggestions(false); }}
                                            style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem', fontWeight: '600' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >{r}</div>
                                    ))}
                                    {allRepNames.filter(r => r.toLowerCase().includes(repSearch.toLowerCase())).length === 0 && (
                                        <div style={{ padding: '0.625rem 0.75rem', color: '#94a3b8', fontSize: '0.8125rem' }}>No reps found — add in Settings</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    {duplicateWarning && (
                        <div style={{ margin: '0 0 1rem', padding: '1rem', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px' }}>
                            <div style={{ fontWeight: '700', color: '#92400e', marginBottom: '0.375rem', fontSize: '0.9375rem' }}>
                                ⚠ Possible Duplicate{duplicateWarning.length > 1 ? 's' : ''} Found
                            </div>
                            <div style={{ fontSize: '0.8125rem', color: '#78350f', marginBottom: '0.625rem' }}>
                                {duplicateWarning.length === 1 ? 'An account with a similar name already exists:' : duplicateWarning.length + ' similar accounts already exist:'}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.75rem' }}>
                                {duplicateWarning.map(dup => (
                                    <div key={dup.id} style={{ background: '#fff', border: '1px solid #fde68a', borderRadius: '6px', padding: '0.5rem 0.75rem', fontSize: '0.8125rem' }}>
                                        <div style={{ fontWeight: '700', color: '#1e293b' }}>{dup.name}</div>
                                        <div style={{ color: '#64748b', marginTop: '0.1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                                            {dup.industry && <span>🏭 {dup.industry}</span>}
                                            {dup.accountOwner && <span>👤 {dup.accountOwner}</span>}
                                            {dup.phone && <span>📞 {dup.phone}</span>}
                                            {dup.website && <span>🌐 {dup.website}</span>}
                                            {!dup.industry && !dup.accountOwner && !dup.phone && <span style={{ color: '#94a3b8' }}>No additional details</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button type="button"
                                    onClick={() => { setDuplicateWarning(null); onSave({ ...formData, verticalMarket: verticalSearch, accountOwner: ownerSearch, assignedRep: repSearch, assignedTerritory: territorySearch }); }}
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