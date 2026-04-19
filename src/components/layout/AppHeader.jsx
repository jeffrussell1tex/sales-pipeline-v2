import React, { useState } from 'react';
import { OrganizationSwitcher, useOrganizationList } from '@clerk/clerk-react';
import { useApp } from '../../AppContext';
import { dbFetch } from '../../utils/storage';

// ── Design tokens (inline — mirrors tokens.js) ───────────────
const T = {
    surfaceInk:   '#2a2622',
    surfaceInkFg: '#e6ddd0',
    gold:         '#c8b99a',
    goldInk:      '#7a6a48',
    border:       '#e6ddd0',
    surface:      '#fbf8f3',
    surface2:     '#f5efe3',
    bg:           '#f0ece4',
    ink:          '#2a2622',
    inkMid:       '#5a544c',
    inkMuted:     '#8a8378',
    danger:       '#9c3a2e',
    warn:         '#b87333',
    ok:           '#4d6b3d',
    info:         '#3a5a7a',
    sans:         '"Plus Jakarta Sans", system-ui, sans-serif',
    r:            3,
};

// Role → accent colour (warm palette — no blue)
const roleAccent = (role) => ({
    Admin:    '#7a5a3c',   // warm brown
    Manager:  T.ok,        // forest green
    ReadOnly: T.inkMuted,  // muted
})[role] || T.inkMid;     // default for User

// Small stroke icon
const Icon = ({ name, size = 16, color = 'currentColor', sw = 1.5 }) => {
    const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
    switch (name) {
        case 'search':   return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
        case 'x':        return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>;
        case 'bell':     return <svg {...p}><path d="M6 16V10a6 6 0 1112 0v6l2 2H4l2-2z"/><path d="M10 20a2 2 0 004 0"/></svg>;
        case 'keyboard': return <svg {...p}><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M10 14h4"/></svg>;
        case 'chevron-d':return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
        case 'logout':   return <svg {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>;
        case 'flash':    return <svg {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
        default: return null;
    }
};

// Deterministic avatar background from name
const _avatarBg = (name) => {
    const p = ['#9c6b4a','#7a5a3c','#5a6e5a','#6b5a7a','#8a5a5a','#5a7a8a','#7a6b5a','#4a6b5a'];
    let h = 0; for (let i = 0; i < (name||'').length; i++) h = (h * 31 + (name||'').charCodeAt(i)) | 0;
    return p[Math.abs(h) % p.length];
};

export default function AppHeader({
    globalSearch, setGlobalSearch,
    showSearchResults, setShowSearchResults,
    showProfilePanel, setShowProfilePanel,
    profileForm, setProfileForm,
    myProfile, setMyProfile,
    showShortcuts, setShowShortcuts,
    handleLogout,
    setShowModal, setEditingOpp,
    setViewingAccount, setViewingContact,
    dbOffline, setDbOffline,
    notifications,
    showNotifications, setShowNotifications,
}) {
    const {
        settings, currentUser, userRole, isAdmin,
        accounts, contacts, opportunities, tasks, activities, leads,
        activeTab, setActiveTab,
        activePipelineId, setActivePipelineId,
        allPipelines, getQuarter, getQuarterLabel,
        clerkUser, isMobile,
        exportToCSV, exportingCSV,
        setCsvImportType, setShowCsvImportModal,
        quickLogOpen, setQuickLogOpen,
    } = useApp();

    const isManager  = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';
    const { userMemberships } = useOrganizationList({ userMemberships: { infinite: true } });
    const [profilePanelTab, setProfilePanelTab] = useState('profile');
    const [profileSaving, setProfileSaving]     = useState(false);

    // ── Avatar initials ──────────────────────────────────────
    const userInitials = (currentUser || 'A').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    // ── Shared input style for profile panel ─────────────────
    const panelInputStyle = {
        width: '100%', padding: '0.5rem 0.75rem',
        border: `1px solid ${T.border}`, borderRadius: T.r,
        fontSize: '0.875rem', fontFamily: T.sans,
        boxSizing: 'border-box', background: T.bg,
        color: T.ink, outline: 'none',
    };
    const panelLabelStyle = {
        fontSize: '0.75rem', fontWeight: '600',
        color: T.inkMid, display: 'block', marginBottom: '4px',
        fontFamily: T.sans,
    };

    return (
        <>
            {/* ── HEADER BAR ──────────────────────────────────── */}
            <header className="header" style={{ fontFamily: T.sans }}>
                <div className="header-inner" style={{ position: 'relative' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 12 }}>

                        {/* ── LEFT: logo + date/quarter ─────────────── */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, minWidth: isMobile ? 80 : 156, flexShrink: 0 }}>
                            {settings.logoUrl ? (
                                <img src={settings.logoUrl} alt="Company Logo"
                                    style={{ height: 40, width: 'auto', maxWidth: 180, objectFit: 'contain' }}/>
                            ) : (
                                <img src="/accelerep-logo-transparent-large.svg" alt="Accelerep"
                                    style={{ height: 40, width: 'auto', maxWidth: 180, objectFit: 'contain', filter: 'brightness(0) invert(1)' }}/>
                            )}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 11, color: 'rgba(230,221,208,0.6)', fontFamily: T.sans }}>
                                    {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </span>
                                <span style={{
                                    fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase',
                                    letterSpacing: '0.06em', color: T.gold,
                                    background: 'rgba(200,185,154,0.15)',
                                    padding: '1px 7px', borderRadius: T.r,
                                    border: `1px solid rgba(200,185,154,0.3)`,
                                    lineHeight: 1.6, fontFamily: T.sans,
                                }}>
                                    {(() => { const q = getQuarter(new Date().toISOString()); return getQuarterLabel(q, new Date().toISOString()); })()}
                                </span>
                            </div>
                        </div>

                        {/* ── CENTER: search ─────────────────────────── */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '0 1rem' }}>
                            <div style={{ position: 'relative', zIndex: 200, width: '100%', maxWidth: isMobile ? '100%' : 360 }}>
                                {/* Search input */}
                                <div style={{
                                    display: 'flex', alignItems: 'center',
                                    background: 'rgba(255,255,255,0.07)',
                                    borderRadius: T.r,
                                    border: `1px solid rgba(230,221,208,0.2)`,
                                    padding: '0 12px', gap: 8, height: 34,
                                    transition: 'border-color 0.15s, background 0.15s',
                                }}
                                    onFocusCapture={e => { e.currentTarget.style.borderColor = T.gold; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                                    onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(230,221,208,0.2)'; e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}>
                                    <Icon name="search" size={13} color="rgba(230,221,208,0.45)"/>
                                    <input
                                        className="global-search-input"
                                        type="text"
                                        placeholder="Search accounts, contacts, deals…"
                                        value={globalSearch}
                                        onChange={e => { setGlobalSearch(e.target.value); setShowSearchResults(e.target.value.length > 0); }}
                                        onFocus={() => { if (globalSearch.length > 0) setShowSearchResults(true); }}
                                        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, color: T.surfaceInkFg, flex: 1, padding: 0, fontFamily: T.sans }}
                                    />
                                    {globalSearch ? (
                                        <button onClick={() => { setGlobalSearch(''); setShowSearchResults(false); }}
                                            style={{ background: 'none', border: 'none', color: 'rgba(230,221,208,0.5)', cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0, display: 'flex' }}>
                                            <Icon name="x" size={13} color="rgba(230,221,208,0.5)"/>
                                        </button>
                                    ) : (
                                        <span style={{ fontSize: 10, color: 'rgba(230,221,208,0.35)', background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(230,221,208,0.2)', borderRadius: 2, padding: '1px 5px', lineHeight: 1.5, flexShrink: 0, fontFamily: 'monospace' }}>/</span>
                                    )}
                                </div>

                                {/* Search results dropdown — logic fully preserved */}
                                {showSearchResults && globalSearch.length > 0 && (
                                    <>
                                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setShowSearchResults(false)} />
                                    <div className="spt-search-results" style={{
                                        position: 'absolute', top: '100%',
                                        left: isMobile ? '0' : '50%',
                                        transform: isMobile ? 'none' : 'translateX(-50%)',
                                        marginTop: 6,
                                        width: isMobile ? '100vw' : 420,
                                        maxWidth: isMobile ? '100vw' : 420,
                                        maxHeight: 420, overflowY: 'auto',
                                        background: T.surface,
                                        border: `1px solid ${T.border}`,
                                        borderRadius: 6,
                                        boxShadow: '0 8px 24px rgba(42,38,34,0.15)',
                                        zIndex: 9999,
                                    }} onClick={e => e.stopPropagation()}>
                                        {(() => {
                                            const q = globalSearch.toLowerCase();
                                            const matchedAccounts  = accounts.filter(a => (a.name||'').toLowerCase().includes(q) || (a.accountOwner||'').toLowerCase().includes(q)).slice(0, 5);
                                            const matchedContacts  = contacts.filter(c => ((c.firstName||'')+' '+(c.lastName||'')).toLowerCase().includes(q) || (c.company||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q)).slice(0, 5);
                                            const matchedOpps      = opportunities.filter(o => (o.opportunityName||'').toLowerCase().includes(q) || (o.account||'').toLowerCase().includes(q)).slice(0, 5);
                                            const total = matchedAccounts.length + matchedContacts.length + matchedOpps.length;

                                            if (total === 0) return (
                                                <div style={{ padding: '1.5rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>No results found</div>
                                            );

                                            const GroupHead = ({ label }) => (
                                                <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', background: T.bg, borderBottom: `1px solid ${T.border}`, fontFamily: T.sans }}>
                                                    {label}
                                                </div>
                                            );
                                            const ResultRow = ({ primary, secondary, meta, onClick }) => (
                                                <div style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                                    onClick={onClick}
                                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <div>
                                                        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{primary}</div>
                                                        {secondary && <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1, fontFamily: T.sans }}>{secondary}</div>}
                                                    </div>
                                                    {meta && <span style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans, flexShrink: 0, marginLeft: 8 }}>{meta}</span>}
                                                </div>
                                            );

                                            return (
                                                <>
                                                    {matchedAccounts.length > 0 && (
                                                        <div>
                                                            <GroupHead label="Accounts"/>
                                                            {matchedAccounts.map(a => {
                                                                const openDeals = opportunities.filter(o => (o.account||'').toLowerCase() === (a.name||'').toLowerCase() && o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').length;
                                                                return (
                                                                    <ResultRow key={'sa-'+a.id}
                                                                        primary={a.name}
                                                                        secondary={a.accountOwner ? `${a.accountOwner}${openDeals > 0 ? ` · ${openDeals} open deal${openDeals>1?'s':''}` : ''}` : undefined}
                                                                        meta="Account"
                                                                        onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('accounts'); setTimeout(() => setViewingAccount(a), 100); }}/>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                    {matchedContacts.length > 0 && (
                                                        <div>
                                                            <GroupHead label="Contacts"/>
                                                            {matchedContacts.map(c => (
                                                                <ResultRow key={'sc-'+c.id}
                                                                    primary={`${c.firstName} ${c.lastName}`}
                                                                    secondary={[c.title, c.company].filter(Boolean).join(' · ')}
                                                                    meta="Contact"
                                                                    onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('contacts'); setTimeout(() => setViewingContact(c), 100); }}/>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {matchedOpps.length > 0 && (
                                                        <div>
                                                            <GroupHead label="Opportunities"/>
                                                            {matchedOpps.map(o => (
                                                                <ResultRow key={'so-'+o.id}
                                                                    primary={o.opportunityName || o.account || 'Unnamed'}
                                                                    secondary={`${o.account} · ${o.stage}`}
                                                                    meta={`$${(o.arr||0).toLocaleString()}`}
                                                                    onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(o); setShowModal(true); }, 150); }}/>
                                                            ))}
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                    </>
                                )}
                            </div>

                            {/* Accelerep wordmark — centered below search */}
                            {!isMobile && (
                                <div style={{ display: 'flex', alignItems: 'center', opacity: 0.9 }}>
                                    <svg width="124" height="37" viewBox="0 0 1200 360" xmlns="http://www.w3.org/2000/svg">
                                        <g transform="translate(80, 76)">
                                            <rect x="0"   y="104" width="32" height="52"  rx="4" fill={T.gold} opacity="0.4"/>
                                            <rect x="42"  y="72"  width="32" height="84"  rx="4" fill={T.gold} opacity="0.6"/>
                                            <rect x="84"  y="36"  width="32" height="120" rx="4" fill={T.gold} opacity="0.8"/>
                                            <rect x="126" y="0"   width="32" height="156" rx="4" fill={T.gold}/>
                                            <polyline points="16,104 58,72 100,36 142,0" fill="none" stroke={T.gold} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                                            <circle cx="142" cy="0" r="8" fill={T.gold}/>
                                        </g>
                                        <text x="312" y="204" fontFamily="Arial, Helvetica, sans-serif" fontSize="116" fontWeight="500" fill="white" letterSpacing="-2" opacity="0.92">Accelerep</text>
                                        <text x="960" y="124" fontFamily="Arial, Helvetica, sans-serif" fontSize="32" fontWeight="400" fill="white" opacity="0.5">™</text>
                                    </svg>
                                </div>
                            )}
                        </div>

                        {/* ── RIGHT: user + icons ────────────────────── */}
                        <div className="header-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, justifyContent: 'center', minWidth: isMobile ? 80 : 160, flexShrink: 0 }}>

                            {/* ROW A: user pill */}
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div style={{ position: 'relative' }}>
                                    {/* User pill trigger */}
                                    <div onClick={() => {
                                            setShowProfilePanel(v => !v);
                                            setProfilePanelTab('profile');
                                            const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                                            if (detectedTz && myProfile && myProfile.timezone !== detectedTz) {
                                                import('../../utils/storage').then(({ dbFetch }) => {
                                                    const base = myProfile || {};
                                                    dbFetch('/.netlify/functions/users?me=true', { method: 'PUT', body: JSON.stringify({ ...base, timezone: detectedTz }) }).catch(() => {});
                                                });
                                            }
                                            setProfileForm({
                                                firstName: myProfile?.firstName || currentUser.split(' ')[0] || '',
                                                lastName:  myProfile?.lastName  || currentUser.split(' ').slice(1).join(' ') || '',
                                                email:     myProfile?.email     || clerkUser?.emailAddresses?.[0]?.emailAddress || '',
                                                phone:     myProfile?.phone     || '',
                                                mobile:    myProfile?.mobile    || '',
                                                title:     myProfile?.title     || '',
                                            });
                                        }}
                                        title="My profile & settings"
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 8,
                                            padding: '5px 10px 5px 12px',
                                            background: showProfilePanel ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.09)',
                                            borderRadius: T.r,
                                            border: `1px solid ${showProfilePanel ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)'}`,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s',
                                        }}>
                                        {/* Avatar */}
                                        <div style={{
                                            width: 26, height: 26, borderRadius: '50%',
                                            background: _avatarBg(currentUser),
                                            color: '#fef4e6',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 10, fontWeight: 700, flexShrink: 0,
                                        }}>
                                            {userInitials}
                                        </div>
                                        <div style={{ lineHeight: 1.25 }}>
                                            <div style={{ fontSize: 12.5, fontWeight: 600, color: T.surfaceInkFg, fontFamily: T.sans }}>{currentUser}</div>
                                            <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: T.gold, fontFamily: T.sans }}>
                                                {userRole === 'User' ? 'Sales Rep' : userRole === 'ReadOnly' ? 'Read-Only' : userRole}
                                            </div>
                                        </div>
                                        <Icon name="chevron-d" size={12} color="rgba(230,221,208,0.45)"/>
                                    </div>

                                    {/* ── Profile Panel ─────────────────────────── */}
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
                                            dealSilent:         { enabled: true,  mode: 'instant' },
                                            dealStuck:          { enabled: true,  mode: 'instant' },
                                            closeLapsed:        { enabled: true,  mode: 'instant' },
                                            dealMomentum:       { enabled: true,  mode: 'instant' },
                                            managerAlerts:      { enabled: true,  mode: 'instant' },
                                            quoteApproved:      { enabled: true,  mode: 'instant' },
                                            quoteRejected:      { enabled: true,  mode: 'instant' },
                                            quotePending:       { enabled: true,  mode: 'instant' },
                                            quoteAccepted:      { enabled: true,  mode: 'instant' },
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
                                            dealSilent:         'Deal gone silent (no activity 14d)',
                                            dealStuck:          'Deal stuck in stage too long',
                                            closeLapsed:        'Close date lapsed',
                                            dealMomentum:       'Deal momentum (stage advance)',
                                            managerAlerts:      'Manager escalation alerts',
                                            quoteApproved:      'Quote approved',
                                            quoteRejected:      'Quote rejected',
                                            quotePending:       'Quote submitted for approval',
                                            quoteAccepted:      'Quote accepted by customer',
                                        };
                                        const prefs        = myProfile?.notificationPrefs || DEFAULT_PREFS;
                                        const digestTime   = myProfile?.digestTime || '08:00';
                                        const userTimezone = myProfile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

                                        const saveProfile = async (updates) => {
                                            setProfileSaving(true);
                                            const updated = { ...(myProfile || {}), ...updates };
                                            setMyProfile(updated);
                                            try {
                                                const myDbUser = (settings.users || []).find(u =>
                                                    (myProfile?.id && u.id === myProfile.id) || u.name === currentUser
                                                );
                                                const basePayload = myDbUser || myProfile || {};
                                                const res = await dbFetch('/.netlify/functions/users?me=true', {
                                                    method: 'PUT',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ ...basePayload, ...updates }),
                                                });
                                                if (!res.ok) {
                                                    const errData = await res.json().catch(() => ({}));
                                                    console.error('saveProfile: server error', res.status, errData.error || '');
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
                                                padding: '0.5rem 1rem', border: 'none',
                                                borderBottom: profilePanelTab === tab ? `2px solid ${T.ink}` : '2px solid transparent',
                                                cursor: 'pointer', fontFamily: T.sans, background: 'transparent',
                                                fontSize: '0.8125rem', fontWeight: profilePanelTab === tab ? 700 : 500,
                                                color: profilePanelTab === tab ? T.ink : T.inkMid,
                                                transition: 'all 0.15s',
                                            }}>{label}</button>
                                        );

                                        return (
                                            <>
                                            <div style={{ position: 'fixed', inset: 0, zIndex: 1099 }} onClick={() => setShowProfilePanel(false)} />
                                            <div className="spt-profile-panel" style={{
                                                position: isMobile ? 'fixed' : 'absolute',
                                                top: isMobile ? 0 : 'calc(100% + 8px)',
                                                right: 0, left: isMobile ? 0 : 'auto',
                                                bottom: isMobile ? 0 : 'auto',
                                                width: isMobile ? '100%' : 420,
                                                background: T.surface,
                                                borderRadius: isMobile ? 0 : 6,
                                                border: `1px solid ${T.border}`,
                                                boxShadow: '0 12px 40px rgba(42,38,34,0.18)',
                                                zIndex: 1100,
                                                overflow: 'auto',
                                                fontFamily: T.sans,
                                            }} onClick={e => e.stopPropagation()}>

                                                {/* Panel header */}
                                                <div style={{ background: T.surfaceInk, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <div style={{ width: 44, height: 44, borderRadius: '50%', background: _avatarBg(currentUser), color: '#fef4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                                                        {userInitials}
                                                    </div>
                                                    <div>
                                                        <div style={{ color: T.surfaceInkFg, fontWeight: 700, fontSize: 15, fontFamily: T.sans }}>{currentUser}</div>
                                                        <div style={{ color: T.inkMuted, fontSize: 12, marginTop: 2, fontFamily: T.sans }}>{clerkUser?.emailAddresses?.[0]?.emailAddress}</div>
                                                        <div style={{ marginTop: 4 }}>
                                                            <span style={{ background: 'rgba(200,185,154,0.18)', color: T.gold, fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: T.r, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: T.sans, border: `1px solid rgba(200,185,154,0.3)` }}>
                                                                {userRole === 'User' ? 'Sales Rep' : userRole}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button onClick={handleLogout} title="Sign out"
                                                        style={{ marginLeft: 'auto', background: 'none', border: `1px solid rgba(255,255,255,0.18)`, color: 'rgba(230,221,208,0.6)', cursor: 'pointer', padding: '5px 10px', borderRadius: T.r, fontSize: 11, fontWeight: 600, fontFamily: T.sans, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 5 }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = T.danger; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = T.danger; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(230,221,208,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; }}>
                                                        <Icon name="logout" size={12} color="currentColor"/>
                                                        Sign out
                                                    </button>
                                                </div>

                                                {/* Panel tabs */}
                                                <div style={{ display: 'flex', gap: 0, padding: '0.5rem 1rem 0', borderBottom: `1px solid ${T.border}`, background: T.surface }}>
                                                    {panelTabBtn('profile',      '👤 Profile')}
                                                    {panelTabBtn('notifications','🔔 Notifications')}
                                                    {panelTabBtn('importexport', '⇅ Import / Export')}
                                                </div>

                                                <div style={{ padding: '1.25rem 1.5rem', maxHeight: '560px', overflowY: 'auto', background: T.surface }}>

                                                    {/* ── Profile Tab ── */}
                                                    {profilePanelTab === 'profile' && (
                                                        <div>
                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                                                                <div><label style={panelLabelStyle}>First Name</label><input style={panelInputStyle} value={profileForm.firstName} onChange={e => setProfileForm(p => ({ ...p, firstName: e.target.value }))}/></div>
                                                                <div><label style={panelLabelStyle}>Last Name</label><input style={panelInputStyle} value={profileForm.lastName} onChange={e => setProfileForm(p => ({ ...p, lastName: e.target.value }))}/></div>
                                                            </div>
                                                            <div style={{ marginBottom: '0.875rem' }}><label style={panelLabelStyle}>Work Email</label><input style={panelInputStyle} type="email" value={profileForm.email} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))}/></div>
                                                            <div style={{ marginBottom: '0.875rem' }}><label style={panelLabelStyle}>Phone</label><input style={panelInputStyle} type="tel" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}/></div>
                                                            <div style={{ marginBottom: '0.875rem' }}>
                                                                <label style={panelLabelStyle}>Mobile <span style={{ fontWeight: 400, color: T.inkMuted }}>(used for SMS notifications)</span></label>
                                                                <input style={panelInputStyle} type="tel" placeholder="+1 (555) 000-0000" value={profileForm.mobile || ''} onChange={e => setProfileForm(p => ({ ...p, mobile: e.target.value }))}/>
                                                            </div>
                                                            <div style={{ marginBottom: '1.25rem' }}><label style={panelLabelStyle}>Title</label><input style={panelInputStyle} value={profileForm.title} onChange={e => setProfileForm(p => ({ ...p, title: e.target.value }))}/></div>
                                                            <div style={{ padding: '0.75rem', background: T.bg, borderRadius: T.r, fontSize: 12, color: T.inkMid, marginBottom: '1rem', border: `1px solid ${T.border}`, fontFamily: T.sans }}>
                                                                🔑 Password is managed via Clerk. <a href="https://accounts.clerk.dev" target="_blank" rel="noreferrer" style={{ color: T.goldInk }}>Change password →</a>
                                                            </div>
                                                            <button onClick={() => saveProfile({ firstName: profileForm.firstName, lastName: profileForm.lastName, email: profileForm.email, phone: profileForm.phone, mobile: profileForm.mobile, title: profileForm.title })}
                                                                disabled={profileSaving}
                                                                style={{ width: '100%', padding: '0.625rem', background: T.ink, color: T.surfaceInkFg, border: 'none', borderRadius: T.r, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: T.sans }}>
                                                                {profileSaving ? 'Saving…' : 'Save Profile'}
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* ── Notifications Tab ── */}
                                                    {profilePanelTab === 'notifications' && (
                                                        <div>
                                                            <p style={{ fontSize: '0.8125rem', color: T.inkMid, margin: '0 0 1rem', lineHeight: 1.5, fontFamily: T.sans }}>
                                                                Choose which alerts you receive and whether they're sent immediately or bundled into a daily digest.
                                                            </p>

                                                            {/* Digest time picker */}
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: T.bg, borderRadius: T.r, border: `1px solid ${T.border}`, marginBottom: '1rem' }}>
                                                                <div>
                                                                    <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: T.ink, fontFamily: T.sans }}>Daily digest time</div>
                                                                    <div style={{ fontSize: '0.75rem', color: T.inkMid, marginTop: 2, fontFamily: T.sans }}>
                                                                        Your local time — <span style={{ fontWeight: 600, color: T.ink }}>{userTimezone}</span>
                                                                    </div>
                                                                </div>
                                                                <input type="time" value={digestTime} onChange={e => saveProfile({ digestTime: e.target.value, timezone: userTimezone })}
                                                                    style={{ padding: '0.375rem 0.5rem', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.875rem', fontFamily: T.sans, background: T.surface }}/>
                                                            </div>

                                                            {/* Alert rows — fully preserved */}
                                                            {Object.entries(ALERT_LABELS).map(([alertType, label]) => {
                                                                if (alertType === 'managerAlerts' && !isManager && !isAdmin) return null;
                                                                if (alertType === 'quotePending' && !isManager && !isAdmin) return null;
                                                                if ((alertType === 'quoteApproved' || alertType === 'quoteRejected') && (isManager || isAdmin)) return null;
                                                                const pref = prefs[alertType] || DEFAULT_PREFS[alertType] || { enabled: true, mode: 'instant' };
                                                                const isDigestOnly = alertType === 'taskDigest' || alertType === 'overdueTaskNudge';
                                                                const isFirstPipeline = alertType === 'dealSilent';
                                                                const isFirstQuote    = alertType === 'quoteApproved' || (alertType === 'quotePending' && (isManager || isAdmin));
                                                                const isPipelineAlert = ['dealSilent','dealStuck','closeLapsed','dealMomentum','managerAlerts'].includes(alertType);
                                                                const isQuoteAlert    = ['quoteApproved','quoteRejected','quotePending','quoteAccepted'].includes(alertType);
                                                                return (
                                                                    <React.Fragment key={alertType}>
                                                                        {isFirstPipeline && (
                                                                            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '1rem', paddingTop: '0.75rem', borderTop: `1px solid ${T.border}`, marginBottom: '0.375rem', fontFamily: T.sans }}>Pipeline health alerts</div>
                                                                        )}
                                                                        {isFirstQuote && (
                                                                            <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '1rem', paddingTop: '0.75rem', borderTop: `1px solid ${T.border}`, marginBottom: '0.375rem', fontFamily: T.sans }}>Quote alerts</div>
                                                                        )}
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: `1px solid ${T.border}` }}>
                                                                            <div style={{ flex: 1 }}>
                                                                                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: T.ink, fontFamily: T.sans }}>
                                                                                    {label}
                                                                                    {alertType === 'managerAlerts' && <span style={{ fontSize: 9.5, fontWeight: 700, background: 'rgba(122,90,60,0.12)', color: T.goldInk, padding: '1px 6px', borderRadius: T.r, marginLeft: 6, fontFamily: T.sans }}>Manager</span>}
                                                                                    {alertType === 'quotePending'  && <span style={{ fontSize: 9.5, fontWeight: 700, background: 'rgba(122,90,60,0.12)', color: T.goldInk, padding: '1px 6px', borderRadius: T.r, marginLeft: 6, fontFamily: T.sans }}>Manager</span>}
                                                                                </div>
                                                                                {isDigestOnly && <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1, fontFamily: T.sans }}>Digest only</div>}
                                                                            </div>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                                <button onClick={() => togglePref(alertType, 'enabled', !pref.enabled)}
                                                                                    style={{ width: 36, height: 20, borderRadius: '999px', border: 'none', cursor: 'pointer', background: pref.enabled ? T.ink : T.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}
                                                                                    title={pref.enabled ? 'Disable' : 'Enable'}>
                                                                                    <span style={{ position: 'absolute', top: 2, left: pref.enabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }}/>
                                                                                </button>
                                                                                {!isDigestOnly && pref.enabled && (
                                                                                    <select value={pref.mode} onChange={e => togglePref(alertType, 'mode', e.target.value)}
                                                                                        style={{ fontSize: 12, padding: '3px 6px', border: `1px solid ${T.border}`, borderRadius: T.r, fontFamily: T.sans, background: T.surface, cursor: 'pointer' }}>
                                                                                        <option value="instant">Instant</option>
                                                                                        <option value="digest">Digest</option>
                                                                                    </select>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </React.Fragment>
                                                                );
                                                            })}

                                                            {/* SMS Notifications — fully preserved */}
                                                            {(() => {
                                                                const sms = myProfile?.smsNotifications || {};
                                                                const smsEnabled = !!sms.enabled;
                                                                const setSms = (key, val) => saveProfile({ smsNotifications: { ...sms, [key]: val } });
                                                                const SmsToggle = ({ label, desc, smsKey }) => (
                                                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '0.5rem 0', borderBottom: `1px solid ${T.border}` }}>
                                                                        <div style={{ flex: 1 }}>
                                                                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: smsEnabled ? T.ink : T.inkMuted, fontFamily: T.sans }}>{label}</div>
                                                                            {desc && <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1, fontFamily: T.sans }}>{desc}</div>}
                                                                        </div>
                                                                        <button onClick={() => smsEnabled && setSms(smsKey, !sms[smsKey])}
                                                                            style={{ width: 36, height: 20, borderRadius: '999px', border: 'none', cursor: smsEnabled ? 'pointer' : 'not-allowed', background: sms[smsKey] && smsEnabled ? T.ink : T.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                                                            <span style={{ position: 'absolute', top: 2, left: sms[smsKey] && smsEnabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }}/>
                                                                        </button>
                                                                    </div>
                                                                );
                                                                return (
                                                                    <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${T.border}` }}>
                                                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem', fontFamily: T.sans }}>💬 SMS Notifications</div>
                                                                        {!(myProfile?.mobile || myProfile?.phone) && (
                                                                            <div style={{ fontSize: 12, color: T.warn, background: 'rgba(184,115,51,0.08)', border: `1px solid rgba(184,115,51,0.3)`, borderRadius: T.r, padding: '0.5rem 0.75rem', marginBottom: '0.75rem', lineHeight: 1.5, fontFamily: T.sans }}>
                                                                                Add a mobile number in the Profile tab to enable SMS.
                                                                            </div>
                                                                        )}
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: `1px solid ${T.border}` }}>
                                                                            <div>
                                                                                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: T.ink, fontFamily: T.sans }}>Enable SMS</div>
                                                                                <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1, fontFamily: T.sans }}>
                                                                                    {myProfile?.mobile || myProfile?.phone ? `Texts to ${myProfile?.mobile || myProfile?.phone}` : 'Set a mobile number in Profile first'}
                                                                                </div>
                                                                            </div>
                                                                            <button onClick={() => setSms('enabled', !smsEnabled)}
                                                                                style={{ width: 36, height: 20, borderRadius: '999px', border: 'none', cursor: 'pointer', background: smsEnabled ? T.ink : T.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                                                                <span style={{ position: 'absolute', top: 2, left: smsEnabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }}/>
                                                                            </button>
                                                                        </div>
                                                                        <div style={{ opacity: smsEnabled ? 1 : 0.45, transition: 'opacity 0.2s' }}>
                                                                            <SmsToggle label="Pipeline Alerts"           desc="Once daily · Silent deals, stuck stages, lapsed dates"   smsKey="pipelineAlerts"/>
                                                                            <SmsToggle label="Task Reminders"            desc="At due time · Text when a task comes due"                smsKey="taskReminders"/>
                                                                            <SmsToggle label="Daily Digest"              desc="Once daily · Morning summary of tasks & pipeline"        smsKey="digest"/>
                                                                            <SmsToggle label="Mentions & Assignments"    desc="On occurrence · When a deal or task is assigned to you" smsKey="mentions"/>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })()}

                                                            <button onClick={() => saveProfile({ notificationPrefs: prefs, digestTime, timezone: userTimezone, smsNotifications: myProfile?.smsNotifications })}
                                                                disabled={profileSaving}
                                                                style={{ width: '100%', padding: '0.625rem', background: T.ink, color: T.surfaceInkFg, border: 'none', borderRadius: T.r, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: T.sans, marginTop: '1rem' }}>
                                                                {profileSaving ? 'Saving…' : 'Save Notification Settings'}
                                                            </button>
                                                        </div>
                                                    )}

                                                    {/* ── Import / Export Tab ── */}
                                                    {profilePanelTab === 'importexport' && (() => {
                                                        const sectionHead = (icon, title) => (
                                                            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: T.ink, fontFamily: T.sans }}>{icon} {title}</div>
                                                        );
                                                        const importBtn = (type) => (
                                                            <button onClick={() => { setCsvImportType(type); setShowCsvImportModal(true); setShowProfilePanel(false); }}
                                                                style={{ padding: '0.35rem 0.875rem', border: 'none', borderRadius: T.r, background: T.ink, color: T.surfaceInkFg, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                                                                📥 Import
                                                            </button>
                                                        );
                                                        const exportBtn = (exportKey, filename, headers, rows) => (
                                                            <button disabled={exportingCSV === exportKey} onClick={() => exportToCSV(filename, headers, rows, exportKey)}
                                                                style={{ padding: '0.35rem 0.875rem', border: 'none', borderRadius: T.r, background: exportingCSV === exportKey ? T.inkMuted : T.ink, color: T.surfaceInkFg, fontSize: 12, fontWeight: 600, cursor: exportingCSV === exportKey ? 'default' : 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                                                                {exportingCSV === exportKey ? '⏳…' : '📤 Export'}
                                                            </button>
                                                        );
                                                        const row = (type, exportKey, filename, headers, rows) => (
                                                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                                {importBtn(type)}
                                                                {exportBtn(exportKey, filename, headers, rows)}
                                                            </div>
                                                        );
                                                        return (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                                {[
                                                                    { icon: '🏢', title: 'Accounts',     type: 'accounts',     exportKey: 'accounts',     filename: `accounts-${new Date().toISOString().slice(0,10)}.csv`,     headers: ['Account Name','Vertical Market','Account Owner','Phone','Website','Address','City','State','ZIP','Country'], rows: accounts.map(a => [a.name,a.verticalMarket,a.accountOwner,a.phone,a.website,a.address,a.city,a.state,a.zip,a.country]) },
                                                                    { icon: '👤', title: 'Contacts',     type: 'contacts',     exportKey: 'contacts',     filename: `contacts-${new Date().toISOString().slice(0,10)}.csv`,     headers: ['First Name','Last Name','Email','Phone','Mobile','Title','Company','Address','City','State','ZIP','Country'], rows: contacts.map(c => [c.firstName,c.lastName,c.email,c.phone,c.mobile,c.title,c.company,c.address,c.city,c.state,c.zip,c.country]) },
                                                                    { icon: '💼', title: 'Opportunities', type: 'opportunities', exportKey: 'opportunities', filename: `opportunities-${new Date().toISOString().slice(0,10)}.csv`, headers: ['Opportunity Name','Account','Sales Rep','Stage','ARR','Impl. Cost','Close Date','Products','Notes','Territory','Vertical'], rows: opportunities.map(o => [o.opportunityName,o.account,o.salesRep,o.stage,o.arr,o.implementationCost,o.forecastedCloseDate,o.products,o.notes,o.territory,o.vertical]) },
                                                                    { icon: '✅', title: 'Tasks',         type: 'tasks',        exportKey: 'tasks',        filename: `tasks-${new Date().toISOString().slice(0,10)}.csv`,        headers: ['Title','Type','Status','Due Date','Priority','Assigned To','Account','Notes'], rows: tasks.map(t => [t.title||'',t.type||'',t.status||'',t.dueDate||'',t.priority||'',t.assignedTo||'',t.account||'',t.notes||'']) },
                                                                ].map(({ icon, title, type, exportKey, filename, headers, rows: dataRows }) => (
                                                                    <div key={type} style={{ padding: '0.75rem 1rem', border: `1px solid ${T.border}`, borderRadius: T.r, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                        {sectionHead(icon, title)}
                                                                        {row(type, exportKey, filename, headers, dataRows)}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>

                                                {profileSaving && (
                                                    <div style={{ padding: '0.5rem 1.5rem', background: T.bg, borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.inkMid, fontWeight: 600, fontFamily: T.sans }}>
                                                        ✓ Saving preferences…
                                                    </div>
                                                )}
                                            </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>{/* end ROW A: user pill */}

                            {/* ROW B: ⚡ log + org switcher + keyboard + bell */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>

                                {/* Quick log */}
                                <button onClick={() => setQuickLogOpen(v => !v)} title="Quick-log an activity"
                                    style={{ height: 28, padding: '0 10px', borderRadius: T.r, border: `1px solid rgba(255,255,255,0.18)`, background: quickLogOpen ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.09)', color: T.surfaceInkFg, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s', flexShrink: 0 }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.18)'}
                                    onMouseLeave={e => e.currentTarget.style.background = quickLogOpen ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.09)'}>
                                    <Icon name="flash" size={11} color={T.gold}/>
                                    Log
                                </button>

                                {/* Org switcher — only if multi-org */}
                                {userMemberships?.data?.length > 1 && (
                                    <OrganizationSwitcher appearance={{
                                        elements: {
                                            rootBox: { display: 'flex', alignItems: 'center' },
                                            organizationSwitcherTrigger: {
                                                padding: '3px 10px', borderRadius: T.r,
                                                border: `1px solid rgba(255,255,255,0.18)`,
                                                background: 'rgba(255,255,255,0.09)',
                                                color: '#fff', fontSize: 11, fontWeight: 600,
                                            },
                                        },
                                    }}/>
                                )}

                                {/* Keyboard shortcuts */}
                                <button onClick={() => setShowShortcuts(v => !v)} title="Keyboard shortcuts"
                                    style={{ background: 'rgba(255,255,255,0.09)', color: T.surfaceInkFg, border: `1px solid rgba(255,255,255,0.18)`, borderRadius: T.r, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; e.currentTarget.style.transform = 'scale(1.08)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.transform = 'scale(1)'; }}>
                                    <Icon name="keyboard" size={14} color={T.surfaceInkFg}/>
                                </button>

                                {/* Notifications bell */}
                                <div style={{ position: 'relative' }}>
                                    <button onClick={() => setShowNotifications(!showNotifications)}
                                        style={{
                                            background: notifications.length > 0 ? T.danger : 'rgba(255,255,255,0.09)',
                                            color: T.surfaceInkFg,
                                            border: notifications.length > 0 ? 'none' : `1px solid rgba(255,255,255,0.18)`,
                                            borderRadius: T.r,
                                            width: 28, height: 28,
                                            cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0, transition: 'all 0.2s',
                                            position: 'relative',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
                                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                                        <Icon name="bell" size={14} color={T.surfaceInkFg}/>
                                        {notifications.length > 0 && (
                                            <span style={{ position: 'absolute', top: -3, right: -3, background: T.warn, color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.sans }}>
                                                {notifications.length}
                                            </span>
                                        )}
                                    </button>

                                    {/* Notifications dropdown — fully preserved */}
                                    {showNotifications && (
                                        <div style={{
                                            position: isMobile ? 'fixed' : 'absolute',
                                            top: isMobile ? 0 : 36, right: 0,
                                            left: isMobile ? 0 : 'auto',
                                            bottom: isMobile ? 0 : 'auto',
                                            background: T.surface,
                                            border: `1px solid ${T.border}`,
                                            borderRadius: 6,
                                            boxShadow: '0 8px 24px rgba(42,38,34,0.14)',
                                            minWidth: isMobile ? 'unset' : 350,
                                            maxWidth: isMobile ? 'unset' : 400,
                                            maxHeight: isMobile ? '100%' : 500,
                                            overflowY: 'auto',
                                            zIndex: 1000,
                                            fontFamily: T.sans,
                                        }}>
                                            <div style={{ padding: '0.875rem 1rem', borderBottom: `1px solid ${T.border}`, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: T.ink }}>
                                                <span>Notifications ({notifications.length})</span>
                                                <button onClick={() => setShowNotifications(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMuted, lineHeight: 1, fontSize: 18, padding: 0 }}>×</button>
                                            </div>
                                            {notifications.length === 0 ? (
                                                <div style={{ padding: '2rem', textAlign: 'center', color: T.inkMuted, fontSize: 13 }}>No notifications</div>
                                            ) : (
                                                <div>
                                                    {notifications.map(notif => (
                                                        <div key={notif.id}
                                                            style={{ padding: '0.875rem 1rem', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', transition: 'background 0.15s' }}
                                                            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                            onClick={() => { if (notif.opportunityId) { setActiveTab('pipeline'); setShowNotifications(false); } }}>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                                                <span style={{ fontSize: 16 }}>
                                                                    {notif.type === 'danger' ? '🔴' : notif.type === 'warning' ? '⚠️' : 'ℹ️'}
                                                                </span>
                                                                <div style={{ flex: 1, fontSize: 13, color: T.ink, lineHeight: 1.5 }}>
                                                                    {notif.message}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>{/* end ROW B */}

                        </div>{/* end header-actions */}
                    </div>{/* end outer row */}
                </div>
            </header>
        </>
    );
}
