import React from 'react';
import { OrganizationSwitcher } from '@clerk/clerk-react';
import { useApp } from '../../AppContext';
import { dbFetch } from '../../utils/storage';

export default function AppHeader({
    globalSearch, setGlobalSearch,
    showSearchResults, setShowSearchResults,
    showProfilePanel, setShowProfilePanel,
    profileForm, setProfileForm,
    myProfile,
    showShortcuts, setShowShortcuts,
    handleLogout,
    setShowModal, setEditingOpp,
    setViewingAccount, setViewingContact,
    dbOffline, setDbOffline,
}) {
    const {
        settings, currentUser, userRole, isAdmin,
        accounts, contacts, opportunities,
        activeTab, setActiveTab,
        activePipelineId, setActivePipelineId,
        allPipelines, getQuarter, getQuarterLabel,
        clerkUser,
    } = useApp();
    const isManager = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';

    return (
        <>
            <header className="header">
                <div className="header-inner" style={{ position: 'relative' }}>
                    {/* ── SINGLE ROW: left=date/logo | center=search | right=user actions ── */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>

                    {/* LEFT: client logo + date/quarter */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', minWidth: '160px' }}>
                        {settings.logoUrl ? (
                            <img src={settings.logoUrl} alt="Company Logo"
                                style={{ height: '48px', width: 'auto', maxWidth: '200px', objectFit: 'contain' }} />
                        ) : (
                            <img src="/accelerep-logo-transparent-large.svg" alt="Accelerep"
                                style={{ height: '48px', width: 'auto', maxWidth: '200px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                            <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)' }}>
                                {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </span>
                            <span style={{ fontSize: '0.6rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(255,255,255,0.15)', color: '#fff', padding: '0.15rem 0.5rem', borderRadius: '999px', border: '1px solid rgba(255,255,255,0.25)', lineHeight: '1.4' }}>
                                {(() => { const q = getQuarter(new Date().toISOString()); return getQuarterLabel(q, new Date().toISOString()); })()}
                            </span>
                        </div>
                    </div>

                    {/* CENTER: search bar on top, Accelerep logo centered below */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '0 1.5rem' }}>
                        <div style={{ position: 'relative', zIndex: 200 }}>
                            <div style={{ display: 'flex', alignItems: 'center', background: '#f1f5f9', borderRadius: '999px', border: '1px solid #e2e8f0', padding: '0.35rem 1rem', gap: '0.5rem', width: '340px', transition: 'box-shadow 0.15s, border-color 0.15s' }}
                                onFocusCapture={e => { e.currentTarget.style.borderColor = '#93c5fd'; e.currentTarget.style.background = '#fff'; }}
                                onBlurCapture={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = '#f1f5f9'; }}>
                                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#94a3b8" strokeWidth="1.5" style={{ flexShrink: 0 }}><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L13 13" strokeLinecap="round"/></svg>
                                <input
                                    className="global-search-input"
                                    type="text"
                                    placeholder="Search accounts, contacts, deals..."
                                    value={globalSearch}
                                    onChange={e => { setGlobalSearch(e.target.value); setShowSearchResults(e.target.value.length > 0); }}
                                    onFocus={() => { if (globalSearch.length > 0) setShowSearchResults(true); }}
                                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.8125rem', color: '#1e293b', flex: 1, padding: 0, fontFamily: 'inherit' }}
                                />
                                {globalSearch ? (
                                    <button onClick={() => { setGlobalSearch(''); setShowSearchResults(false); }}
                                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.8125rem', padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
                                ) : (
                                    <span style={{ fontSize: '0.625rem', color: '#94a3b8', background: '#fff', border: '0.5px solid #e2e8f0', borderRadius: '3px', padding: '1px 5px', lineHeight: 1.4, flexShrink: 0 }}>/</span>
                                )}
                            </div>
                            {showSearchResults && globalSearch.length > 0 && (
                                <>
                                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setShowSearchResults(false)} />
                                <div className="spt-search-results" style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '0.375rem', width: '400px', maxHeight: '420px', overflowY: 'auto', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 9999 }} onClick={e => e.stopPropagation()}>
                                    {(() => {
                                        const q = globalSearch.toLowerCase();
                                        const matchedAccounts = accounts.filter(a => (a.name || '').toLowerCase().includes(q) || (a.accountOwner || '').toLowerCase().includes(q)).slice(0, 5);
                                        const matchedContacts = contacts.filter(c => ((c.firstName || '') + ' ' + (c.lastName || '')).toLowerCase().includes(q) || (c.company || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)).slice(0, 5);
                                        const matchedOpps = opportunities.filter(o => (o.opportunityName || '').toLowerCase().includes(q) || (o.account || '').toLowerCase().includes(q)).slice(0, 5);
                                        const total = matchedAccounts.length + matchedContacts.length + matchedOpps.length;
                                        if (total === 0) return (<div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>No results found</div>);
                                        return (<>
                                            {matchedAccounts.length > 0 && (<div>
                                                <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.625rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f8fafc', borderBottom: '1px solid #f1f3f5' }}>Accounts</div>
                                                {matchedAccounts.map(a => { const openDeals = opportunities.filter(o => (o.account||'').toLowerCase() === (a.name||'').toLowerCase() && o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').length; return (<div key={'sa-'+a.id} style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('accounts'); setTimeout(() => setViewingAccount(a), 100); }} onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background='transparent'}><div><div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{a.name}</div>{a.accountOwner && <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{a.accountOwner}{openDeals > 0 ? ` · ${openDeals} open deal${openDeals>1?'s':''}` : ''}</div>}</div><span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>Account</span></div>); })}
                                            </div>)}
                                            {matchedContacts.length > 0 && (<div>
                                                <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.625rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f8fafc', borderBottom: '1px solid #f1f3f5' }}>Contacts</div>
                                                {matchedContacts.map(c => (<div key={'sc-'+c.id} style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('contacts'); setTimeout(() => setViewingContact(c), 100); }} onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background='transparent'}><div><div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{c.firstName} {c.lastName}</div><div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{[c.title, c.company].filter(Boolean).join(' · ')}</div></div><span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>Contact</span></div>))}
                                            </div>)}
                                            {matchedOpps.length > 0 && (<div>
                                                <div style={{ padding: '0.5rem 0.75rem', fontSize: '0.625rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', background: '#f8fafc', borderBottom: '1px solid #f1f3f5' }}>Opportunities</div>
                                                {matchedOpps.map(o => (<div key={'so-'+o.id} style={{ padding: '0.4rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f9fafb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(o); setShowModal(true); }, 150); }} onMouseEnter={e => e.currentTarget.style.background='#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background='transparent'}><div><div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{o.opportunityName || o.account || 'Unnamed'}</div><div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{o.account} · {o.stage}</div></div><span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>${(o.arr||0).toLocaleString()}</span></div>))}
                                            </div>)}
                                        </>);
                                    })()}
                                </div>
                                </>
                            )}
                        </div>
                        {/* Accelerep logo centered below search — 15% larger: 108→124px */}
                        <div style={{ display: 'flex', alignItems: 'center', opacity: 0.92 }}>
                            <svg width="124" height="37" viewBox="0 0 1200 360" xmlns="http://www.w3.org/2000/svg">
                                <g transform="translate(80, 76)">
                                    <rect x="0"   y="104" width="32" height="52"  rx="6" fill="white" opacity="0.35"/>
                                    <rect x="42"  y="72"  width="32" height="84"  rx="6" fill="white" opacity="0.55"/>
                                    <rect x="84"  y="36"  width="32" height="120" rx="6" fill="white" opacity="0.75"/>
                                    <rect x="126" y="0"   width="32" height="156" rx="6" fill="white"/>
                                    <polyline points="16,104 58,72 100,36 142,0" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                                    <circle cx="142" cy="0" r="9" fill="white"/>
                                </g>
                                <text x="312" y="204" fontFamily="Arial, Helvetica, sans-serif" fontSize="116" fontWeight="500" fill="white" letterSpacing="-2">Accelerep</text>
                                <text x="960" y="124" fontFamily="Arial, Helvetica, sans-serif" fontSize="32" fontWeight="400" fill="white" opacity="0.7">™</text>
                            </svg>
                        </div>
                    </div>

                    {/* RIGHT: stacked — user pill on top, icons below, org switcher below that */}
                    <div className="header-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', justifyContent: 'center', minWidth: '160px' }}>
                        {/* ROW A: user pill */}
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ position: 'relative' }}>
                        <div
                            onClick={() => {
                                setShowProfilePanel(v => !v);
                                setProfilePanelTab('profile');
                                if (!myProfile) {
                                    setProfileForm({
                                        firstName: currentUser.split(' ')[0] || '',
                                        lastName:  currentUser.split(' ').slice(1).join(' ') || '',
                                        email:     clerkUser?.emailAddresses?.[0]?.emailAddress || '',
                                        phone:     '',
                                        title:     '',
                                    });
                                }
                            }}
                            title="My profile & settings"
                            style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '0.5rem',
                            padding: '0.375rem 0.5rem 0.375rem 0.875rem',
                            background: showProfilePanel ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.12)',
                            borderRadius: '20px',
                            border: showProfilePanel ? '1px solid rgba(255,255,255,0.4)' : '1px solid rgba(255,255,255,0.2)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                        }}>
                            <div style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '50%',
                                background: isAdmin ? '#7c3aed' : isManager ? '#059669' : isReadOnly ? '#94a3b8' : '#2563eb',
                                color: 'white',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.75rem',
                                fontWeight: '700'
                            }}>
                                {currentUser.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <div style={{ lineHeight: 1.2 }}>
                                <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#fff' }}>{currentUser}</div>
                                <div style={{ fontSize: '0.625rem', color: isAdmin ? '#c4b5fd' : isManager ? '#6ee7b7' : isReadOnly ? '#cbd5e1' : '#93c5fd', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {userRole === 'User' ? 'Sales Rep' : userRole === 'ReadOnly' ? 'Read-Only' : userRole}
                                </div>
                            </div>
                            <button
                                onClick={e => { e.stopPropagation(); handleLogout(); }}
                                title="Sign out"
                                style={{
                                    background: 'none',
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    color: 'rgba(255,255,255,0.7)',
                                    cursor: 'pointer',
                                    fontSize: '0.6875rem',
                                    fontWeight: '600',
                                    padding: '0.25rem 0.5rem',
                                    borderRadius: '4px',
                                    marginLeft: '0.25rem',
                                    fontFamily: 'inherit',
                                    transition: 'all 0.2s'
                                }}
                                onMouseEnter={e => { e.target.style.background = '#ef4444'; e.target.style.color = 'white'; e.target.style.borderColor = '#ef4444'; }}
                                onMouseLeave={e => { e.target.style.background = 'none'; e.target.style.color = 'rgba(255,255,255,0.7)'; e.target.style.borderColor = 'rgba(255,255,255,0.25)'; }}
                            >
                                Logout
                            </button>
                        </div>
                        {/* ── Profile Panel ─────────────────────────────────── */}
                        {showProfilePanel && (() => {
                            const DEFAULT_PREFS = {
                                stageChanged:       { enabled: true,  mode: 'instant' },
                                dealAssigned:       { enabled: true,  mode: 'instant' },
                                opportunityCreated: { enabled: true,  mode: 'instant' },
                                opportunityUpdated: { enabled: false, mode: 'digest'  },
                                dealClosed:         { enabled: true,  mode: 'instant' },
                                commentAdded:       { enabled: true,  mode: 'instant' },
                                taskDigest:         { enabled: true,  mode: 'digest'  },
                                overdueTaskNudge:   { enabled: true,  mode: 'digest'  },
                            };
                            const ALERT_LABELS = {
                                stageChanged:       'Deal stage changed',
                                dealAssigned:       'Deal assigned to me',
                                opportunityCreated: 'New opportunity created',
                                opportunityUpdated: 'Opportunity updated',
                                dealClosed:         'Deal closed (Won or Lost)',
                                commentAdded:       'Comment added to deal',
                                taskDigest:         'Daily task digest',
                                overdueTaskNudge:   'Overdue task reminder',
                            };
                            const prefs = myProfile?.notificationPrefs || DEFAULT_PREFS;
                            const digestTime = myProfile?.digestTime || '08:00';

                            const saveProfile = async (updates) => {
                                setProfileSaving(true);
                                const updated = { ...(myProfile || {}), ...updates };
                                setMyProfile(updated);
                                try {
                                    // Find user's DB record id
                                    const myDbUser = (settings.users || []).find(u => u.name === currentUser);
                                    if (myDbUser) {
                                        await dbFetch('/.netlify/functions/users?me=true', {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ ...myDbUser, ...updates }),
                                        });
                                    }
                                } catch (err) {
                                    console.error('Failed to save profile:', err);
                                } finally {
                                    setProfileSaving(false);
                                }
                            };

                            const togglePref = (alertType, field, value) => {
                                const newPrefs = { ...prefs, [alertType]: { ...(prefs[alertType] || DEFAULT_PREFS[alertType]), [field]: value } };
                                saveProfile({ notificationPrefs: newPrefs });
                            };

                            const panelTabBtn = (tab, label) => (
                                <button onClick={() => setProfilePanelTab(tab)} style={{
                                    padding: '0.5rem 1rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                    fontSize: '0.8125rem', fontWeight: '600', borderRadius: '6px',
                                    background: profilePanelTab === tab ? '#2563eb' : 'transparent',
                                    color: profilePanelTab === tab ? '#fff' : '#64748b',
                                    transition: 'all 0.15s',
                                }}>{label}</button>
                            );

                            return (
                                <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 1099 }} onClick={() => setShowProfilePanel(false)} />
                                <div className="spt-profile-panel" style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                                    width: '420px', background: '#fff', borderRadius: '12px',
                                    border: '1px solid #e2e8f0', boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                                    zIndex: 1100, overflow: 'hidden',
                                }} onClick={e => e.stopPropagation()}>

                                    {/* Header */}
                                    <div style={{ background: '#1a1a2e', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                                        <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: isAdmin ? '#7c3aed' : isManager ? '#059669' : '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.125rem', fontWeight: '700', flexShrink: 0 }}>
                                            {currentUser.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                        </div>
                                        <div>
                                            <div style={{ color: '#fff', fontWeight: '700', fontSize: '0.9375rem' }}>{currentUser}</div>
                                            <div style={{ color: '#8b92a9', fontSize: '0.75rem', marginTop: '2px' }}>{clerkUser?.emailAddresses?.[0]?.emailAddress}</div>
                                            <div style={{ marginTop: '4px' }}>
                                                <span style={{ background: isAdmin ? '#7c3aed' : isManager ? '#059669' : '#2563eb', color: '#fff', fontSize: '0.6rem', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    {userRole === 'User' ? 'Sales Rep' : userRole}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div style={{ display: 'flex', gap: '0.25rem', padding: '0.75rem 1rem 0', borderBottom: '1px solid #e2e8f0' }}>
                                        {panelTabBtn('profile', '👤 Profile')}
                                        {panelTabBtn('notifications', '🔔 Notifications')}
                                    </div>

                                    <div style={{ padding: '1.25rem 1.5rem', maxHeight: '460px', overflowY: 'auto' }}>

                                        {/* ── Profile Tab ─────────────────────────────── */}
                                        {profilePanelTab === 'profile' && (() => {
                                            const inputStyle = { width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box' };
                                            const labelStyle = { fontSize: '0.75rem', fontWeight: '600', color: '#374151', display: 'block', marginBottom: '4px' };
                                            return (
                                                <div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                                                        <div><label style={labelStyle}>First Name</label><input style={inputStyle} value={profileForm.firstName} onChange={e => setProfileForm(p => ({ ...p, firstName: e.target.value }))} /></div>
                                                        <div><label style={labelStyle}>Last Name</label><input style={inputStyle} value={profileForm.lastName} onChange={e => setProfileForm(p => ({ ...p, lastName: e.target.value }))} /></div>
                                                    </div>
                                                    <div style={{ marginBottom: '0.875rem' }}><label style={labelStyle}>Work Email</label><input style={inputStyle} type="email" value={profileForm.email} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))} /></div>
                                                    <div style={{ marginBottom: '0.875rem' }}><label style={labelStyle}>Phone</label><input style={inputStyle} type="tel" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} /></div>
                                                    <div style={{ marginBottom: '1.25rem' }}><label style={labelStyle}>Title</label><input style={inputStyle} value={profileForm.title} onChange={e => setProfileForm(p => ({ ...p, title: e.target.value }))} /></div>
                                                    <div style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '6px', fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem' }}>
                                                        🔑 Password is managed via Clerk. <a href="https://accounts.clerk.dev" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>Change password →</a>
                                                    </div>
                                                    <button
                                                        onClick={() => saveProfile({ firstName: profileForm.firstName, lastName: profileForm.lastName, email: profileForm.email, phone: profileForm.phone, title: profileForm.title })}
                                                        disabled={profileSaving}
                                                        style={{ width: '100%', padding: '0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                                                        {profileSaving ? 'Saving…' : 'Save Profile'}
                                                    </button>
                                                </div>
                                            );
                                        })()}

                                        {/* ── Notifications Tab ───────────────────────── */}
                                        {profilePanelTab === 'notifications' && (
                                            <div>
                                                <p style={{ fontSize: '0.8125rem', color: '#64748b', margin: '0 0 1rem', lineHeight: 1.5 }}>
                                                    Choose which alerts you receive and whether they're sent immediately or bundled into a daily digest.
                                                </p>

                                                {/* Digest time picker */}
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                                                    <div>
                                                        <div style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#1e293b' }}>Daily digest time</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>When to send your daily digest email (UTC)</div>
                                                    </div>
                                                    <input
                                                        type="time"
                                                        value={digestTime}
                                                        onChange={e => saveProfile({ digestTime: e.target.value })}
                                                        style={{ padding: '0.375rem 0.5rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'inherit', background: '#fff' }}
                                                    />
                                                </div>

                                                {/* Alert rows */}
                                                {Object.entries(ALERT_LABELS).map(([alertType, label]) => {
                                                    const pref = prefs[alertType] || DEFAULT_PREFS[alertType];
                                                    const isDigestOnly = alertType === 'taskDigest' || alertType === 'overdueTaskNudge';
                                                    return (
                                                        <div key={alertType} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: '1px solid #f1f3f5' }}>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{label}</div>
                                                                {isDigestOnly && <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '1px' }}>Digest only</div>}
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                                {/* Enabled toggle */}
                                                                <button
                                                                    onClick={() => togglePref(alertType, 'enabled', !pref.enabled)}
                                                                    style={{
                                                                        width: '36px', height: '20px', borderRadius: '999px', border: 'none', cursor: 'pointer',
                                                                        background: pref.enabled ? '#2563eb' : '#d1d5db',
                                                                        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
                                                                    }}
                                                                    title={pref.enabled ? 'Disable' : 'Enable'}
                                                                >
                                                                    <span style={{ position: 'absolute', top: '2px', left: pref.enabled ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }} />
                                                                </button>

                                                                {/* Mode selector — only show for non-digest-only alerts */}
                                                                {!isDigestOnly && pref.enabled && (
                                                                    <select
                                                                        value={pref.mode}
                                                                        onChange={e => togglePref(alertType, 'mode', e.target.value)}
                                                                        style={{ fontSize: '0.75rem', padding: '0.2rem 0.375rem', border: '1px solid #e2e8f0', borderRadius: '4px', fontFamily: 'inherit', background: '#fff', cursor: 'pointer' }}
                                                                    >
                                                                        <option value="instant">Instant</option>
                                                                        <option value="digest">Digest</option>
                                                                    </select>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                                <button
                                                    onClick={() => saveProfile({ notificationPrefs: prefs, digestTime })}
                                                    disabled={profileSaving}
                                                    style={{ width: '100%', padding: '0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit', marginTop: '1rem' }}>
                                                    {profileSaving ? 'Saving…' : 'Save Notification Settings'}
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {profileSaving && (
                                        <div style={{ padding: '0.5rem 1.5rem', background: '#f0fdf4', borderTop: '1px solid #bbf7d0', fontSize: '0.75rem', color: '#059669', fontWeight: '600' }}>
                                            ✓ Saving preferences…
                                        </div>
                                    )}
                                </div>
                                </>
                            );
                        })()}
                        </div>{/* end profile panel relative wrapper */}
                        </div>{/* end ROW A: user pill */}

                        {/* ROW B: org switcher + keyboard + bell — all centered under user pill */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        {userMemberships?.data?.length > 1 && (
                            <OrganizationSwitcher
                                appearance={{
                                    elements: {
                                        rootBox: { display: 'flex', alignItems: 'center' },
                                        organizationSwitcherTrigger: {
                                            padding: '0.2rem 0.625rem',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(255,255,255,0.2)',
                                            background: 'rgba(255,255,255,0.1)',
                                            color: '#fff',
                                            fontSize: '0.6875rem',
                                            fontWeight: '600',
                                        }
                                    }
                                }}
                            />
                        )}
                        <button
                            onClick={() => setShowShortcuts(v => !v)}
                            title="Keyboard shortcuts"
                            style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '50%',
                                width: '32px', height: '32px', cursor: 'pointer', fontSize: '1rem', fontWeight: '800',
                                transition: 'all 0.2s ease', fontFamily: 'inherit', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; e.currentTarget.style.transform = 'scale(1.1)'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; e.currentTarget.style.transform = 'scale(1)'; }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="6" width="20" height="13" rx="2"/>
                                <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M10 14h4"/>
                            </svg>
                        </button>
                        <div style={{ position: 'relative' }}>
                        <button
                            onClick={() => setShowNotifications(!showNotifications)}
                            style={{
                                background: notifications.length > 0 ? '#ef4444' : 'rgba(255,255,255,0.15)',
                                color: notifications.length > 0 ? 'white' : '#fff',
                                border: notifications.length > 0 ? 'none' : '1px solid rgba(255,255,255,0.25)',
                                borderRadius: '50%',
                                width: '32px',
                                height: '32px',
                                cursor: 'pointer',
                                fontSize: '1rem',
                                fontWeight: '700',
                                position: 'relative',
                                transition: 'all 0.2s ease',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            🔔
                            {notifications.length > 0 && (
                                <span style={{
                                    position: 'absolute',
                                    top: '-4px',
                                    right: '-4px',
                                    background: '#f59e0b',
                                    color: 'white',
                                    borderRadius: '50%',
                                    width: '16px',
                                    height: '16px',
                                    fontSize: '0.6rem',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {notifications.length}
                                </span>
                            )}
                        </button>
                        {showNotifications && (
                            <div style={{
                                position: 'absolute',
                                top: '50px',
                                right: '0',
                                background: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                                minWidth: '350px',
                                maxWidth: '400px',
                                maxHeight: '500px',
                                overflowY: 'auto',
                                zIndex: 1000
                            }}>
                                <div style={{
                                    padding: '1rem',
                                    borderBottom: '1px solid #e2e8f0',
                                    fontWeight: '700',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}>
                                    <span>Notifications ({notifications.length})</span>
                                    <button
                                        onClick={() => setShowNotifications(false)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            fontSize: '1.2rem',
                                            color: '#64748b'
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                                {notifications.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                                        No notifications
                                    </div>
                                ) : (
                                    <div>
                                        {notifications.map(notif => (
                                            <div key={notif.id} style={{
                                                padding: '1rem',
                                                borderBottom: '1px solid #e2e8f0',
                                                cursor: 'pointer',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            onClick={() => {
                                                if (notif.opportunityId) {
                                                    setActiveTab('pipeline');
                                                    setShowNotifications(false);
                                                }
                                            }}
                                            >
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'start',
                                                    gap: '0.5rem'
                                                }}>
                                                    <span style={{ fontSize: '1.2rem' }}>
                                                        {notif.type === 'danger' ? '🔴' : notif.type === 'warning' ? '⚠️' : 'ℹ️'}
                                                    </span>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                                                            {notif.message}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>{/* end notifications relative wrapper */}
                    </div>{/* end ROW B: icons */}

                    </div>{/* end header-actions */}

                    </div>{/* end outer single row */}
                </div>
            </header>
        </>
    );
}
