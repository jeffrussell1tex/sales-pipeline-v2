import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

export default function AccountsTab() {
    const {
        accounts, setAccounts,
        opportunities,
        contacts,
        activities,
        tasks,
        settings,
        currentUser,
        userRole,
        canSeeAll,
        isRepVisible,
        exportToCSV,
        exportingCSV, setExportingCSV,
        showConfirm,
        softDelete,
        addAudit,
        getStageColor,
        getSubAccounts,
        getAccountRollup,
        visibleAccounts,
        handleDeleteAccount,
        handleDeleteSubAccount,
        setEditingAccount, setEditingSubAccount, setParentAccountForSub, setShowAccountModal,
        setCsvImportType, setShowCsvImportModal,
        viewingAccount, setViewingAccount,
        accShowAllClosed, setAccShowAllClosed,
        accShowAllContacts, setAccShowAllContacts,
        expandedAccounts, setExpandedAccounts,
        accountsSortDir, setAccountsSortDir,
        accountsViewMode, setAccountsViewMode,
        selectedAccounts, setSelectedAccounts,
        isMobile,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;

    // UI handlers (open modals)
    const handleAddAccount = () => { setEditingAccount(null); setEditingSubAccount(null); setParentAccountForSub(null); setShowAccountModal(true); };
    const handleAddSubAccount = (parentAccount, forceTier) => {
        setEditingAccount(null);
        setEditingSubAccount(null);
        // _forceTier lets ModalLayer override tier derivation
        setParentAccountForSub(forceTier ? { ...parentAccount, _forceTier: forceTier } : parentAccount);
        setShowAccountModal(true);
    };
    const handleEditAccount = (account, isSubAccount = false) => {
        if (isSubAccount) { setEditingSubAccount(account); setEditingAccount(null); }
        else { setEditingAccount(account); setEditingSubAccount(null); }
        setParentAccountForSub(null);
        setShowAccountModal(true);
    };
    const toggleAccountExpanded = (accountId) => setExpandedAccounts(prev => ({ ...prev, [accountId]: !prev[accountId] }));
    // Tier helpers — derived from hierarchy depth, not accountTier field
    // This works even if accountTier column is null/missing in DB
    const getDepth = (acc) => {
        if (!acc?.parentAccountId) return 0;
        const parent = accounts.find(a => a.id === acc.parentAccountId);
        if (!parent?.parentAccountId) return 1;
        return 2;
    };
    const getTier = (acc) => { const d = getDepth(acc); return d === 0 ? 'account' : d === 1 ? 'business_unit' : 'site'; };
    const tierLabel = { account: 'Account', business_unit: 'Business Unit', site: 'Site' };

    return (

                <div className="tab-page">
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Accounts</h2>
                            
                        </div>
                    </div>
                {/* ── Toolbar bar ── */}
                <div className="table-container" style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {/* Left: alphabet nav */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px' }}>
                            {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(letter => {
                                const hasMatch = visibleAccounts.some(a => ((a.name || '')[0] || '').toUpperCase() === letter);
                                return (
                                    <div key={letter}
                                        onClick={() => {
                                            if (!hasMatch) return;
                                            const el = document.getElementById('account-letter-' + letter);
                                            if (el) el.scrollIntoView({ block: 'start' });
                                        }}
                                        style={{
                                            fontSize: '0.6875rem', fontWeight: '700', width: '22px', height: '20px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            color: hasMatch ? '#2563eb' : '#cbd5e1',
                                            cursor: hasMatch ? 'pointer' : 'default',
                                            borderRadius: '3px', transition: 'all 0.1s', userSelect: 'none'
                                        }}
                                        onMouseEnter={e => { if (hasMatch) { e.target.style.background = '#dbeafe'; e.target.style.color = '#1e40af'; } }}
                                        onMouseLeave={e => { e.target.style.background = 'transparent'; e.target.style.color = hasMatch ? '#2563eb' : '#cbd5e1'; }}
                                    >{letter}</div>
                                );
                            })}
                        </div>
                        {/* Right: action buttons */}
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                            {selectedAccounts.length > 0 && (
                                <button className="btn" style={{ background: '#ef4444', border: 'none' }} onClick={() => {
                                    showConfirm('Delete ' + selectedAccounts.length + ' selected account(s)? This cannot be undone.', async () => {
                                        const accountIdsToDelete = [...selectedAccounts];
                                        const snapshot = [...accounts];
                                        setAccounts(prev => prev.filter(a => !accountIdsToDelete.includes(a.id)));
                                        setSelectedAccounts([]);
                                        const deletingAll = accountIdsToDelete.length === accounts.length;
                                        if (deletingAll) {
                                            await dbFetch('/.netlify/functions/accounts?clear=true', { method: 'DELETE' })
                                                .catch(err => console.error('Failed to clear accounts:', err));
                                        } else {
                                            const CONCURRENCY = 3;
                                            const queue = [...accountIdsToDelete];
                                            const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
                                                while (queue.length > 0) {
                                                    const id = queue.shift();
                                                    await dbFetch(`/.netlify/functions/accounts?id=${id}`, { method: 'DELETE' })
                                                        .catch(err => console.error('Failed to delete account:', err));
                                                }
                                            });
                                            await Promise.all(workers);
                                        }
                                        softDelete(
                                            `${accountIdsToDelete.length} account${accountIdsToDelete.length === 1 ? '' : 's'}`,
                                            () => {},
                                            () => {
                                                setAccounts(snapshot);
                                                setUndoToast(null);
                                                // Re-insert deleted accounts back to DB
                                                const deletedAccounts = snapshot.filter(a => accountIdsToDelete.includes(a.id));
                                                deletedAccounts.forEach(a => {
                                                    dbFetch('/.netlify/functions/accounts', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify(a),
                                                    }).catch(err => console.error('Failed to restore account to DB:', err));
                                                });
                                            }
                                        );
                                    });
                                }}>Delete ({selectedAccounts.length})</button>
                            )}
                            {canEdit && <button className="btn" onClick={handleAddAccount}>+ Add Account</button>}
                        </div>
                    </div>
                </div>

                {/* ── Accounts list ── */}
                <div className="table-container">
                    <div style={{ padding: '1.5rem' }}>
                        {visibleAccounts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="8" y="28" width="56" height="36" rx="6" fill="#faf5ff" stroke="#e9d5ff" strokeWidth="2"/>
                                    <rect x="24" y="16" width="24" height="18" rx="4" fill="#ede9fe" stroke="#c4b5fd" strokeWidth="2"/>
                                    <circle cx="36" cy="25" r="5" fill="#a78bfa"/>
                                    <path d="M20 44h32M20 52h22" stroke="#c4b5fd" strokeWidth="2" strokeLinecap="round"/>
                                </svg>
                                <div>
                                    <div style={{ width:'72px', height:'72px', borderRadius:'20px', background:'linear-gradient(135deg,#eff6ff,#dbeafe)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2rem', margin:'0 auto 0.75rem' }}>🏢</div>
                                    <div style={{ fontWeight: '700', fontSize: '1.0625rem', color: '#1e293b', marginBottom: '0.375rem' }}>No accounts yet</div>
                                    <div style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.25rem', maxWidth:'280px' }}>Add your first customer or prospect to start tracking relationships.</div>
                                    {canEdit && <button className="btn" onClick={handleAddAccount}>+ Add Account</button>}
                                </div>
                            </div>
                        ) : (
                            <>
                            {/* View toggle */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                                <div style={{ display: 'flex', background: '#f1f3f5', borderRadius: '6px', padding: '2px' }}>
                                    {['compact', 'detailed'].map(mode => (
                                        <button key={mode} onClick={() => setAccountsViewMode(mode)}
                                            style={{ padding: '0.375rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: '700', fontSize: '0.75rem', fontFamily: 'inherit', transition: 'all 0.2s', textTransform: 'capitalize',
                                                background: accountsViewMode === mode ? '#ffffff' : 'transparent', color: accountsViewMode === mode ? '#1e293b' : '#64748b',
                                                boxShadow: accountsViewMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                                        >{mode}</button>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingRight: '0.25rem' }}>
                                    <input type="checkbox"
                                        checked={visibleAccounts.length > 0 && selectedAccounts.length === visibleAccounts.length}
                                        onChange={e => setSelectedAccounts(e.target.checked ? visibleAccounts.map(a => a.id) : [])}
                                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }}
                                    />
                                    <span style={{ fontSize: '0.8125rem', color: '#64748b', fontWeight: '600' }}>Select all ({visibleAccounts.length})</span>
                                </div>
                            </div>
                            {/* Column header */}
                            <div style={{ display: 'flex', alignItems: 'center', padding: '0.3rem 0.75rem', background: '#f1f5f9', borderRadius: '4px', marginBottom: '0.25rem', border: '1px solid #e2e8f0' }}>
                                <div style={{ width: '36px', flexShrink: 0 }} />
                                <span style={{ fontWeight: '700', fontSize: '0.6875rem', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px', width: 'clamp(160px, 40vw, 280px)', flexShrink: 0 }}>Account</span>
                                <span style={{ fontWeight: '700', fontSize: '0.6875rem', textTransform: 'uppercase', color: '#475569', letterSpacing: '0.5px', flex: 1, textAlign: 'center' }}>Account Owner</span>
                                <div style={{ width: '140px', flexShrink: 0 }} />
                            </div>

                            <div style={{ position: 'relative' }}>
                            {accountsViewMode === 'compact' && (() => {
                                const sorted = [...visibleAccounts].sort((a, b) => {
                                    const cmp = (a.name || '').localeCompare(b.name || '');
                                    return accountsSortDir === 'asc' ? cmp : -cmp;
                                });
                                let lastLetter = '';
                                return sorted.map((account, idx) => {
                                    const firstChar = ((account.name || '')[0] || '').toUpperCase();
                                    let anchorId = null;
                                    if (firstChar !== lastLetter) { lastLetter = firstChar; anchorId = 'account-letter-' + firstChar; }
                                    return (
                                <div key={account.id} id={anchorId} style={{
                                    border: selectedAccounts.includes(account.id) ? '1px solid #93c5fd' : '1px solid #edf0f3',
                                    borderBottom: 'none', borderRadius: '0',
                                    background: selectedAccounts.includes(account.id) ? '#eff6ff' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'),
                                    transition: 'all 0.15s ease', overflow: 'hidden'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.75rem' }}>
                                        <div style={{ width: '36px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <input type="checkbox" checked={selectedAccounts.includes(account.id)}
                                                onChange={e => { if (e.target.checked) setSelectedAccounts([...selectedAccounts, account.id]); else setSelectedAccounts(selectedAccounts.filter(id => id !== account.id)); }}
                                                style={{ width: '13px', height: '13px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0 }} />
                                            {getSubAccounts(account.id).length > 0 ? (
                                                <button onClick={(e) => { e.stopPropagation(); toggleAccountExpanded(account.id); }}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: '#2563eb', padding: '0', flexShrink: 0, width: '12px' }}>
                                                    {expandedAccounts[account.id] ? '▼' : '▶'}
                                                </button>
                                            ) : <span style={{ width: '12px' }} />}
                                        </div>
                                        <div style={{ width: 'clamp(160px, 40vw, 280px)', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                                            onClick={() => setViewingAccount(account)}>
                                            <span style={{ fontWeight: '700', fontSize: '0.75rem', color: '#2563eb' }}>{account.name}</span>
                                            {(() => {
                                                const children = getSubAccounts(account.id);
                                                if (children.length === 0) return null;
                                                const buCount = children.filter(c => c.accountTier !== 'site').length;
                                                const siteCount = children.filter(c => c.accountTier === 'site').length;
                                                return <>
                                                    {buCount > 0 && <span style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '0.5rem', fontWeight: '700', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>{buCount} BU</span>}
                                                    {siteCount > 0 && <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '0.5rem', fontWeight: '700', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>{siteCount} Site</span>}
                                                </>;
                                            })()}
                                            {getSubAccounts(account.id).length > 0 && (() => {
                                                const rollup = getAccountRollup(account);
                                                if (rollup.pipeline === 0) return null;
                                                return <span style={{ fontSize: '0.5625rem', color: '#b45309', fontWeight: '700', background: '#fef3c7', padding: '0.05rem 0.3rem', borderRadius: '3px' }}>${rollup.pipeline >= 1000 ? Math.round(rollup.pipeline/1000)+'K' : rollup.pipeline.toLocaleString()}</span>;
                                            })()}
                                        </div>
                                        <span style={{ color: '#64748b', fontSize: '0.75rem', fontWeight: '500', flex: 1, textAlign: 'center' }}>{account.accountOwner || '—'}</span>
                                        <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', gap: '4px' }}>
                                            <button onClick={() => handleEditAccount(account)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Edit</button>
                                            <button onClick={() => handleAddSubAccount(account, 'business_unit')} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>+ BU</button>
                                            <button onClick={() => handleAddSubAccount(account, 'site')} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>+ Site</button>
                                            <button onClick={() => handleDeleteAccount(account.id, opportunities)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Delete</button>
                                        </div>
                                    </div>
                                    {expandedAccounts[account.id] && getSubAccounts(account.id).length > 0 && (
                                        <div style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
                                            {getSubAccounts(account.id).map(sub => {
                                                const subNm = sub.name.toLowerCase();
                                                const subOpps = opportunities.filter(o => o.account && o.account.toLowerCase() === subNm);
                                                const subPipe = subOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
                                                const subWon  = subOpps.filter(o => o.stage === 'Closed Won').reduce((s,o) => s+(parseFloat(o.arr)||0), 0);
                                                const fv = v => v >= 1000000 ? '$'+(v/1000000).toFixed(1)+'M' : v >= 1000 ? '$'+Math.round(v/1000)+'K' : '$'+Math.round(v);
                                                const subSites = getSubAccounts(sub.id);
                                                // BU = has child accounts. Site = no children AND accountTier is 'site'
                                                // For backwards compat: no children + no accountTier = BU (old behavior)
                                                const badgeIsSite = subSites.length === 0 && sub.accountTier === 'site';
                                                return (
                                                    <React.Fragment key={sub.id}>
                                                    <div style={{ display: 'flex', alignItems: 'center', padding: '0.25rem 0.75rem 0.25rem 2.75rem', borderBottom: '1px solid #edf0f3', gap: '0.5rem' }}>
                                                        {subSites.length > 0 && (
                                                            <button onClick={() => toggleAccountExpanded(sub.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.6rem', padding: '0', flexShrink: 0 }}>
                                                                {expandedAccounts[sub.id] ? '▼' : '▶'}
                                                            </button>
                                                        )}
                                                        <span style={{ cursor: 'pointer', color: '#2563eb', fontWeight: '600', fontSize: '0.75rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => setViewingAccount(sub)}>{badgeIsSite ? '⇢' : '↳'} {sub.name}</span>
                                                        {badgeIsSite
                                                            ? <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '0.5rem', fontWeight: '700', padding: '0.05rem 0.3rem', borderRadius: '3px', flexShrink: 0 }}>Site</span>
                                                            : <span style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '0.5rem', fontWeight: '700', padding: '0.05rem 0.3rem', borderRadius: '3px', flexShrink: 0 }}>BU</span>
                                                        }
                                                        {sub.accountOwner && <span style={{ fontSize: '0.6875rem', color: '#64748b', flexShrink: 0 }}>{sub.accountOwner}</span>}
                                                        {subSites.length > 0 && <span style={{ fontSize: '0.6rem', color: '#64748b', background: '#f1f5f9', padding: '1px 5px', borderRadius: '3px', flexShrink: 0 }}>{subSites.length} site{subSites.length !== 1 ? 's' : ''}</span>}
                                                        {subPipe > 0 && <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: '3px', flexShrink: 0 }}>{fv(subPipe)} pipe</span>}
                                                        {subWon > 0 && <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#15803d', background: '#dcfce7', padding: '1px 6px', borderRadius: '3px', flexShrink: 0 }}>{fv(subWon)} won</span>}
                                                        <div style={{ flexShrink: 0, display: 'flex', gap: '4px' }}>
                                                            <button onClick={() => handleEditAccount(sub, true)} style={{ padding: '3px 8px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6rem', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                                                            {!badgeIsSite && <button onClick={() => handleAddSubAccount(sub)} style={{ padding: '3px 8px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6rem', cursor: 'pointer', fontFamily: 'inherit' }}>+ Site</button>}
                                                            <button onClick={() => handleDeleteSubAccount(account.id, sub.id, opportunities)} style={{ padding: '3px 8px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.6rem', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                                                        </div>
                                                    </div>
                                                    {/* Sites under this BU in compact view */}
                                                    {expandedAccounts[sub.id] && subSites.map(site => (
                                                        <div key={site.id} style={{ display: 'flex', alignItems: 'center', padding: '0.2rem 0.75rem 0.2rem 4.5rem', borderBottom: '1px solid #edf0f3', gap: '0.5rem', background: '#f0f4f8' }}>
                                                            <span style={{ cursor: 'pointer', color: '#475569', fontWeight: '600', fontSize: '0.6875rem', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => setViewingAccount(site)}>⇢ {site.name}</span>
                                                            <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '0.5rem', fontWeight: '700', padding: '0.05rem 0.3rem', borderRadius: '3px', flexShrink: 0 }}>Site</span>
                                                            <div style={{ flexShrink: 0, display: 'flex', gap: '4px' }}>
                                                                <button onClick={() => handleEditAccount(site, true)} style={{ padding: '2px 7px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.5625rem', cursor: 'pointer', fontFamily: 'inherit' }}>Edit</button>
                                                                <button onClick={() => handleDeleteSubAccount(sub.id, site.id, opportunities)} style={{ padding: '2px 7px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.5625rem', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                            });
                            })()}
                            {accountsViewMode === 'detailed' && (() => {
                                const sorted = [...visibleAccounts].sort((a, b) => {
                                    const cmp = (a.name || '').localeCompare(b.name || '');
                                    return accountsSortDir === 'asc' ? cmp : -cmp;
                                });
                                let lastLetter2 = '';
                                return sorted.map((account, idx) => {
                                const accountName = account.name.toLowerCase();
                                const accountOpps = opportunities.filter(o => o.account && o.account.toLowerCase() === accountName);
                                const pipelineValue = accountOpps.reduce((sum, o) => sum + (parseFloat(o.arr) || 0), 0);
                                const activeOppCount = accountOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').length;
                                const wonCount = accountOpps.filter(o => o.stage === 'Closed Won').length;
                                const contactCount = contacts.filter(c => c.company && c.company.toLowerCase() === accountName).length;
                                const subCount = getSubAccounts(account.id).length;
                                const firstChar2 = ((account.name || '')[0] || '').toUpperCase();
                                let anchorId2 = null;
                                if (firstChar2 !== lastLetter2) { lastLetter2 = firstChar2; anchorId2 = 'account-letter-' + firstChar2; }

                                return (
                                <div key={account.id} id={anchorId2 || undefined} style={{ 
                                    marginBottom: '0',
                                    border: selectedAccounts.includes(account.id) ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                    borderRadius: '0',
                                    borderBottom: 'none',
                                    background: selectedAccounts.includes(account.id) ? '#eff6ff' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc'),
                                    transition: 'all 0.15s ease',
                                    overflow: 'hidden'
                                }}
                                >
                                    <div style={{ padding: '1rem 1.25rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                            <input type="checkbox"
                                                checked={selectedAccounts.includes(account.id)}
                                                onChange={e => {
                                                    if (e.target.checked) setSelectedAccounts([...selectedAccounts, account.id]);
                                                    else setSelectedAccounts(selectedAccounts.filter(id => id !== account.id));
                                                }}
                                                style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb', flexShrink: 0, marginTop: '3px' }}
                                            />

                                            {getSubAccounts(account.id).length > 0 && (
                                                <button
                                                    onClick={() => toggleAccountExpanded(account.id)}
                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#2563eb', padding: '0', marginTop: '1px', flexShrink: 0 }}
                                                    title={expandedAccounts[account.id] ? 'Collapse' : 'Expand'}
                                                >{expandedAccounts[account.id] ? '▼' : '▶'}</button>
                                            )}

                                            <div style={{ flex: 1 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.625rem' }}>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                                            <h3 style={{ fontSize: '1.0625rem', fontWeight: '700', color: '#2563eb', margin: 0, cursor: 'pointer' }} onClick={() => setViewingAccount(account)}>{account.name}</h3>
                                                            {subCount > 0 && (() => {
                                                                const children = getSubAccounts(account.id);
                                                                const buCount = children.filter(c => c.accountTier !== 'site').length;
                                                                const siteCount = children.filter(c => c.accountTier === 'site').length;
                                                                return <>
                                                                    {buCount > 0 && <span style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '0.625rem', fontWeight: '700', padding: '0.125rem 0.4rem', borderRadius: '4px' }}>{buCount} BU</span>}
                                                                    {siteCount > 0 && <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '0.625rem', fontWeight: '700', padding: '0.125rem 0.4rem', borderRadius: '4px' }}>{siteCount} Site</span>}
                                                                </>;
                                                            })()}
                                                        </div>
                                                        {account.accountOwner && (
                                                            <div style={{ color: '#2563eb', fontSize: '0.8125rem', fontWeight: '600', marginTop: '0.125rem' }}>{account.accountOwner}</div>
                                                        )}
                                                    </div>
                                                    <div style={{ flexShrink: 0, display: 'flex', gap: '4px' }}>
                                                        <button onClick={() => handleEditAccount(account)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Edit</button>
                                                        <button onClick={() => handleAddSubAccount(account, 'business_unit')} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>+ BU</button>
                                                        <button onClick={() => handleAddSubAccount(account, 'site')} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>+ Site</button>
                                                        <button onClick={() => handleDeleteAccount(account.id, opportunities)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Delete</button>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.75rem', fontSize: '0.8125rem', flex: 1, minWidth: '0' }}>
                                                        {(account.address || account.city || account.state || account.zip) && (
                                                            <>
                                                                <span style={{ color: '#94a3b8', fontWeight: '600' }}>Address</span>
                                                                <span style={{ color: '#475569' }}>{[account.address, [account.city, account.state].filter(Boolean).join(', '), account.zip].filter(Boolean).join(', ')}</span>
                                                            </>
                                                        )}
                                                        {account.phone && (
                                                            <>
                                                                <span style={{ color: '#94a3b8', fontWeight: '600' }}>Phone</span>
                                                                <span style={{ color: '#475569' }}>{account.phone}</span>
                                                            </>
                                                        )}
                                                        {account.website && (
                                                            <>
                                                                <span style={{ color: '#94a3b8', fontWeight: '600' }}>Website</span>
                                                                <a href={account.website} target="_blank" style={{ color: '#2563eb', textDecoration: 'none', fontSize: '0.8125rem' }} onClick={e => e.stopPropagation()}>
                                                                    {account.website.replace(/^https?:/, '').replace(/^\/\//, '').replace(/^www\./, '')}
                                                                </a>
                                                            </>
                                                        )}
                                                        {account.verticalMarket && (
                                                            <>
                                                                <span style={{ color: '#94a3b8', fontWeight: '600' }}>Market</span>
                                                                <span style={{ color: '#475569' }}>{account.verticalMarket}</span>
                                                            </>
                                                        )}
                                                    </div>

                                                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                                        {(() => {
                                                            const rollup = subCount > 0 ? getAccountRollup(account) : null;
                                                            const displayActive = rollup ? rollup.openOpps.length : activeOppCount;
                                                            const displayWon = rollup ? rollup.wonOpps.length : wonCount;
                                                            const displayPipeline = rollup ? rollup.pipeline : pipelineValue;
                                                            const displayContacts = rollup ? rollup.allContacts.length : contactCount;
                                                            return (<>
                                                                {displayActive > 0 && (
                                                                    <div style={{ padding: '0.375rem 0.625rem', background: '#dbeafe', borderRadius: '6px', textAlign: 'center', minWidth: '60px' }}>
                                                                        <div style={{ fontSize: '1rem', fontWeight: '800', color: '#1e40af' }}>{displayActive}</div>
                                                                        <div style={{ fontSize: '0.5625rem', fontWeight: '600', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Active Opps</div>
                                                                        {rollup && subCount > 0 && activeOppCount !== displayActive && <div style={{ fontSize: '0.5rem', color: '#93c5fd', marginTop: '1px' }}>incl. {subCount} sub{subCount > 1 ? 's' : ''}</div>}
                                                                    </div>
                                                                )}
                                                                {displayWon > 0 && (
                                                                    <div style={{ padding: '0.375rem 0.625rem', background: '#dcfce7', borderRadius: '6px', textAlign: 'center', minWidth: '60px' }}>
                                                                        <div style={{ fontSize: '1rem', fontWeight: '800', color: '#166534' }}>{displayWon}</div>
                                                                        <div style={{ fontSize: '0.5625rem', fontWeight: '600', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Won</div>
                                                                    </div>
                                                                )}
                                                                {displayPipeline > 0 && (
                                                                    <div style={{ padding: '0.375rem 0.625rem', background: '#fef3c7', borderRadius: '6px', textAlign: 'center', minWidth: '70px' }}>
                                                                        <div style={{ fontSize: '1rem', fontWeight: '800', color: '#92400e' }}>${displayPipeline >= 1000 ? Math.round(displayPipeline / 1000) + 'K' : displayPipeline.toLocaleString()}</div>
                                                                        <div style={{ fontSize: '0.5625rem', fontWeight: '600', color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Pipeline</div>
                                                                        {rollup && subCount > 0 && pipelineValue !== displayPipeline && <div style={{ fontSize: '0.5rem', color: '#fcd34d', marginTop: '1px' }}>incl. {subCount} sub{subCount > 1 ? 's' : ''}</div>}
                                                                    </div>
                                                                )}
                                                                {displayContacts > 0 && (
                                                                    <div style={{ padding: '0.375rem 0.625rem', background: '#f3e8ff', borderRadius: '6px', textAlign: 'center', minWidth: '55px' }}>
                                                                        <div style={{ fontSize: '1rem', fontWeight: '800', color: '#6b21a8' }}>{displayContacts}</div>
                                                                        <div style={{ fontSize: '0.5625rem', fontWeight: '600', color: '#9333ea', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Contacts</div>
                                                                    </div>
                                                                )}
                                                            </>);
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    {expandedAccounts[account.id] && getSubAccounts(account.id).length > 0 && (
                                        <div style={{ 
                                            borderTop: '1px solid #e2e8f0',
                                            padding: '1rem 1.5rem 1.5rem 3.5rem',
                                            background: '#f1f3f5'
                                        }}>
                                            <h4 style={{ fontSize: '0.875rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', marginBottom: '1rem' }}>
                                                Business Units
                                            </h4>
                                            {getSubAccounts(account.id).map(subAccount => {
                                                const subName = subAccount.name.toLowerCase();
                                                const subOpps = opportunities.filter(o => o.account && o.account.toLowerCase() === subName);
                                                const subOpen = subOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                                                const subWon = subOpps.filter(o => o.stage === 'Closed Won');
                                                const subPipeline = subOpen.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
                                                const sites = getSubAccounts(subAccount.id);
                                                const isBuExpanded = expandedAccounts[subAccount.id];
                                                const subTier = getTier(subAccount);
                                                // Site = no children AND saved as site tier
                                                const detailBadgeIsSite = sites.length === 0 && subAccount.accountTier === 'site';
                                                return (
                                                <div key={subAccount.id} style={{ marginBottom: '0.625rem' }}>
                                                    {/* Business Unit or Site row */}
                                                    <div style={{ 
                                                        padding: '0.75rem 1rem',
                                                        background: '#ffffff', borderRadius: sites.length > 0 && isBuExpanded ? '6px 6px 0 0' : '6px', border: '1px solid #e2e8f0',
                                                        borderBottom: sites.length > 0 && isBuExpanded ? 'none' : '1px solid #e2e8f0',
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                                                                    {sites.length > 0 && (
                                                                        <button onClick={() => toggleAccountExpanded(subAccount.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '0.6875rem', padding: '0', lineHeight: 1 }}>
                                                                            {isBuExpanded ? '▼' : '▶'}
                                                                        </button>
                                                                    )}
                                                                    <span style={{ fontWeight: '600', color: '#2563eb', cursor: 'pointer', fontSize: '0.875rem' }}
                                                                        onClick={() => setViewingAccount(subAccount)}
                                                                        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                                                        onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                                                    >↳ {subAccount.name}</span>
                                                                    {detailBadgeIsSite
                                                                        ? <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '0.5rem', fontWeight: '700', padding: '0.1rem 0.35rem', borderRadius: '3px', textTransform: 'uppercase' }}>Site</span>
                                                                        : <span style={{ background: '#e0e7ff', color: '#4338ca', fontSize: '0.5rem', fontWeight: '700', padding: '0.1rem 0.35rem', borderRadius: '3px', textTransform: 'uppercase' }}>BU</span>
                                                                    }
                                                                    {subAccount.accountOwner && <span style={{ color: '#64748b', fontSize: '0.75rem' }}>{subAccount.accountOwner}</span>}
                                                                    {sites.length > 0 && <span style={{ background: '#f1f5f9', color: '#64748b', padding: '0.05rem 0.4rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: '700' }}>{sites.length} site{sites.length !== 1 ? 's' : ''}</span>}
                                                                    {subOpen.length > 0 && <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.05rem 0.4rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: '700' }}>{subOpen.length} active</span>}
                                                                    {subWon.length > 0 && <span style={{ background: '#dcfce7', color: '#166534', padding: '0.05rem 0.4rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: '700' }}>{subWon.length} won</span>}
                                                                    {subPipeline > 0 && <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.05rem 0.4rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: '700' }}>{subPipeline >= 1000000 ? '$'+(subPipeline/1000000).toFixed(1)+'M' : subPipeline >= 1000 ? '$'+Math.round(subPipeline/1000)+'K' : '$'+subPipeline.toLocaleString()} pipe</span>}
                                                                    {(() => { const wArr = subWon.reduce((s,o) => s+(parseFloat(o.arr)||0), 0); return wArr > 0 ? <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.05rem 0.4rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: '700' }}>{wArr >= 1000000 ? '$'+(wArr/1000000).toFixed(1)+'M' : wArr >= 1000 ? '$'+Math.round(wArr/1000)+'K' : '$'+wArr.toLocaleString()} won</span> : null; })()}
                                                                </div>
                                                                {(subAccount.city || subAccount.state) && (
                                                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem', paddingLeft: sites.length > 0 ? '1.25rem' : '0' }}>📍 {[subAccount.city, subAccount.state].filter(Boolean).join(', ')}</div>
                                                                )}
                                                            </div>
                                                            <div style={{ flexShrink: 0, display: 'flex', gap: '4px' }}>
                                                                <button onClick={() => handleEditAccount(subAccount, true)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Edit</button>
                                                                {!detailBadgeIsSite && <button onClick={() => handleAddSubAccount(subAccount)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>+ Site</button>}
                                                                <button onClick={() => handleDeleteSubAccount(account.id, subAccount.id, opportunities)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Delete</button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Sites (tier 3) — expanded under their Business Unit */}
                                                    {isBuExpanded && sites.length > 0 && (
                                                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '0.5rem 0.75rem 0.75rem 2rem' }}>
                                                            {sites.map((site, si) => {
                                                                const siteName = site.name.toLowerCase();
                                                                const siteOpps = opportunities.filter(o => o.account && o.account.toLowerCase() === siteName);
                                                                const siteOpen = siteOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
                                                                const siteWon = siteOpps.filter(o => o.stage === 'Closed Won');
                                                                const sitePipeline = siteOpen.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
                                                                return (
                                                                    <div key={site.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', marginBottom: si < sites.length - 1 ? '0.375rem' : 0, background: '#fff', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                                        <div style={{ flex: 1 }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                                                <span style={{ fontWeight: '600', color: '#475569', cursor: 'pointer', fontSize: '0.8125rem' }}
                                                                                    onClick={() => setViewingAccount(site)}
                                                                                    onMouseEnter={e => e.target.style.color = '#2563eb'}
                                                                                    onMouseLeave={e => e.target.style.color = '#475569'}
                                                                                >⇢ {site.name}</span>
                                                                                <span style={{ background: '#f0fdf4', color: '#16a34a', fontSize: '0.5rem', fontWeight: '700', padding: '0.1rem 0.35rem', borderRadius: '3px', textTransform: 'uppercase' }}>Site</span>
                                                                                {site.accountOwner && <span style={{ color: '#94a3b8', fontSize: '0.6875rem' }}>{site.accountOwner}</span>}
                                                                                {siteOpen.length > 0 && <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.05rem 0.4rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: '700' }}>{siteOpen.length} active</span>}
                                                                                {sitePipeline > 0 && <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.05rem 0.4rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: '700' }}>{sitePipeline >= 1000 ? '$'+Math.round(sitePipeline/1000)+'K' : '$'+sitePipeline.toLocaleString()} pipe</span>}
                                                                                {siteWon.length > 0 && <span style={{ background: '#dcfce7', color: '#15803d', padding: '0.05rem 0.4rem', borderRadius: '4px', fontSize: '0.625rem', fontWeight: '700' }}>{siteWon.length} won</span>}
                                                                            </div>
                                                                            {(site.city || site.state) && (
                                                                                <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.15rem' }}>📍 {[site.city, site.state].filter(Boolean).join(', ')}</div>
                                                                            )}
                                                                        </div>
                                                                        <div style={{ flexShrink: 0, display: 'flex', gap: '4px' }}>
                                                                            <button onClick={() => handleEditAccount(site, true)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #94a3b8', background: 'transparent', color: '#475569', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Edit</button>
                                                                            <button onClick={() => handleDeleteSubAccount(subAccount.id, site.id, opportunities)} style={{ padding: '4px 10px', borderRadius: '999px', border: '0.5px solid #fca5a5', background: 'transparent', color: '#dc2626', fontWeight: '500', fontSize: '0.6875rem', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>Delete</button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {selectedAccounts.includes(account.id) && (() => {
                                        const accountName = account.name.toLowerCase();
                                        const accountOpps = opportunities.filter(o => o.account && o.account.toLowerCase() === accountName);
                                        const oppIds = accountOpps.map(o => o.id);
                                        const accountActivities = activities.filter(a => {
                                            if (a.opportunityId && oppIds.includes(a.opportunityId)) return true;
                                            if (a.company && a.company.toLowerCase() === accountName) return true;
                                            return false;
                                        });
                                        const accountTasks = tasks.filter(t => t.title && t.title.toLowerCase().includes(accountName));
                                        const allItems = [
                                            ...accountActivities.map(a => {
                                                const opp = a.opportunityId ? opportunities.find(o => o.id === a.opportunityId) : null;
                                                return { ...a, itemType: 'activity', sortDate: a.date, oppName: opp ? (opp.opportunityName || opp.site || '') : '' };
                                            }),
                                            ...accountTasks.map(t => ({ ...t, itemType: 'task', sortDate: t.dueDate || t.createdDate || '2000-01-01' }))
                                        ].sort((a, b) => new Date(b.sortDate) - new Date(a.sortDate));

                                        return (
                                            <div style={{ borderTop: '1px solid #e2e8f0', padding: '0.75rem 1.25rem 0.75rem 3.25rem', background: '#f8f9fa' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                                    <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        Activity & Task History ({allItems.length})
                                                    </div>
                                                    {accountOpps.length > 0 && (
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                            {accountOpps.length} opportunit{accountOpps.length === 1 ? 'y' : 'ies'} linked
                                                        </div>
                                                    )}
                                                </div>
                                                {allItems.length === 0 ? (
                                                    <div style={{ fontSize: '0.8125rem', color: '#94a3b8', fontStyle: 'italic' }}>No activities or tasks found for this account.</div>
                                                ) : (
                                                    <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                                                        {allItems.map((item, idx) => (
                                                            <div key={idx} style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0', borderBottom: idx < allItems.length - 1 ? '1px solid #e2e8f0' : 'none', fontSize: '0.8125rem', alignItems: 'center' }}>
                                                                <div style={{ width: '70px', flexShrink: 0, color: '#94a3b8', fontSize: '0.75rem' }}>
                                                                    {item.sortDate ? new Date(item.sortDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '-'}
                                                                </div>
                                                                <div style={{
                                                                    padding: '0.125rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', flexShrink: 0, textTransform: 'uppercase',
                                                                    background: item.itemType === 'task' ? '#fef3c7' : '#dbeafe',
                                                                    color: item.itemType === 'task' ? '#92400e' : '#1e40af'
                                                                }}>
                                                                    {item.itemType === 'task' ? 'Task' : item.type || 'Activity'}
                                                                </div>
                                                                {item.oppName && (
                                                                    <div style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: '600', flexShrink: 0 }}>
                                                                        {item.oppName}
                                                                    </div>
                                                                )}
                                                                <div style={{ flex: 1, color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                    {item.itemType === 'task' ? item.title : (item.notes || item.subject || 'No details')}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                </div>
                            );
                            });
                            })()}
                            </div>
                            </>
                        )}
                    </div>
                </div>
                </div>
            
    );
}
