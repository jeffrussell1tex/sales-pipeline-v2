import React, { useState } from 'react';
import { OrganizationSwitcher, useOrganizationList } from '@clerk/clerk-react';
import { useApp } from '../../AppContext';
import { dbFetch } from '../../utils/storage';

// ── Design tokens ────────────────────────────────────────────
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
    sans:         '"Plus Jakarta Sans", system-ui, sans-serif',
    r:            3,
};

const Icon = ({ name, size = 16, color = 'currentColor', sw = 1.5 }) => {
    const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
    switch (name) {
        case 'search':    return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>;
        case 'x':         return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>;
        case 'bell':      return <svg {...p}><path d="M6 16V10a6 6 0 1112 0v6l2 2H4l2-2z"/><path d="M10 20a2 2 0 004 0"/></svg>;
        case 'keyboard':  return <svg {...p}><rect x="2" y="6" width="20" height="13" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M10 14h4"/></svg>;
        case 'logout':    return <svg {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>;
        case 'flash':     return <svg {...p}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
        default: return null;
    }
};

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
    // Badge counts computed in App.jsx from visibleTasks / feedLastRead
    overdueTaskCount,
    mentionCount,
}) {
    const {
        settings, currentUser, userRole, clerkUser, isMobile,
        accounts, contacts, opportunities, tasks,
        activeTab, setActiveTab,
        getQuarter, getQuarterLabel,
        exportToCSV, exportingCSV,
        setCsvImportType, setShowCsvImportModal,
        quickLogOpen, setQuickLogOpen,
    } = useApp();

    const isAdmin    = userRole === 'Admin';
    const isManager  = userRole === 'Manager';
    const isReadOnly = userRole === 'ReadOnly';

    const { userMemberships } = useOrganizationList({ userMemberships: { infinite: true } });
    const [profilePanelTab, setProfilePanelTab] = useState('profile');
    const [profileSaving, setProfileSaving]     = useState(false);

    const userInitials = (currentUser || 'A').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    const panelInput = { width: '100%', padding: '0.5rem 0.75rem', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.875rem', fontFamily: T.sans, boxSizing: 'border-box', background: T.bg, color: T.ink, outline: 'none' };
    const panelLabel = { fontSize: '0.75rem', fontWeight: 600, color: T.inkMid, display: 'block', marginBottom: 4, fontFamily: T.sans };

    // ── Tab definitions (conditional visibility) ─────────────
    const tabs = [
        { id: 'home',         label: 'Home'         },
        { id: 'pipeline',     label: 'Pipeline'     },
        { id: 'accounts',     label: 'Accounts'     },
        { id: 'tasks',        label: 'Tasks'        },
        { id: 'contacts',     label: 'Contacts'     },
        ...(settings.leadsEnabled  !== false ? [{ id: 'leads',        label: 'Leads'        }] : []),
        ...(settings.quotesEnabled !== false ? [{ id: 'quotes',       label: 'Quotes'       }] : []),
        { id: 'reports',      label: 'Reports'      },
        ...((isAdmin || isManager) ? [{ id: 'salesManager', label: 'Sales Manager' }] : []),
        ...(isAdmin             ? [{ id: 'settings',     label: 'Settings'     }] : []),
    ];

    // ── Profile panel logic ──────────────────────────────────
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
        stageChanged: 'Deal stage changed', dealAssigned: 'Deal assigned to me',
        opportunityCreated: 'New opportunity created', opportunityUpdated: 'Opportunity updated',
        dealClosed: 'Deal closed (Won or Lost)', commentAdded: 'Comment added to deal',
        taskDigest: 'Daily task digest', overdueTaskNudge: 'Overdue task reminder',
        dealSilent: 'Deal gone silent (no activity 14d)', dealStuck: 'Deal stuck in stage too long',
        closeLapsed: 'Close date lapsed', dealMomentum: 'Deal momentum (stage advance)',
        managerAlerts: 'Manager escalation alerts', quoteApproved: 'Quote approved',
        quoteRejected: 'Quote rejected', quotePending: 'Quote submitted for approval',
        quoteAccepted: 'Quote accepted by customer',
    };

    const prefs        = myProfile?.notificationPrefs || DEFAULT_PREFS;
    const digestTime   = myProfile?.digestTime || '08:00';
    const userTimezone = myProfile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    const saveProfile = async (updates) => {
        setProfileSaving(true);
        setMyProfile(prev => ({ ...(prev||{}), ...updates }));
        try {
            const myDbUser = (settings.users || []).find(u => (myProfile?.id && u.id === myProfile.id) || u.name === currentUser);
            const res = await dbFetch('/.netlify/functions/users?me=true', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...(myDbUser || myProfile || {}), ...updates }),
            });
            if (!res.ok) console.error('saveProfile failed', res.status);
        } catch (err) {
            console.error('Failed to save profile:', err);
        } finally {
            setProfileSaving(false);
        }
    };

    const togglePref = (alertType, field, value) => {
        saveProfile({ notificationPrefs: { ...prefs, [alertType]: { ...(prefs[alertType] || DEFAULT_PREFS[alertType]), [field]: value } } });
    };

    const panelTabBtn = (tab, label) => (
        <button onClick={() => setProfilePanelTab(tab)} style={{
            padding: '0.5rem 1rem', border: 'none',
            borderBottom: profilePanelTab === tab ? `2px solid ${T.ink}` : '2px solid transparent',
            cursor: 'pointer', fontFamily: T.sans, background: 'transparent',
            fontSize: '0.8125rem', fontWeight: profilePanelTab === tab ? 700 : 500,
            color: profilePanelTab === tab ? T.ink : T.inkMid, transition: 'all 0.15s',
        }}>{label}</button>
    );

    // ─────────────────────────────────────────────────────────
    return (
        <>
        {/* ── Single 48px flat header bar ──────────────────── */}
        <header style={{
            height: 48, background: T.surfaceInk,
            display: 'flex', alignItems: 'center',
            padding: '0 20px', gap: 0, flexShrink: 0,
            fontFamily: T.sans, position: 'sticky', top: 0, zIndex: 150,
        }}>

            {/* LEFT: wordmark */}
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1.4, color: T.gold, flexShrink: 0, marginRight: 24, userSelect: 'none' }}>
                ACCELEREP
            </div>

            {/* CENTER: nav tabs */}
            <div style={{ display: 'flex', alignItems: 'stretch', flex: 1, height: 48 }}>
                {tabs.map(tab => {
                    const active = activeTab === tab.id;
                    return (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            style={{
                                position: 'relative', padding: '0 14px', height: 48,
                                border: 'none',
                                borderBottom: active ? `2px solid ${T.gold}` : '2px solid transparent',
                                background: 'transparent',
                                color: active ? '#fbf8f3' : 'rgba(230,221,208,0.55)',
                                fontSize: 13, fontWeight: active ? 600 : 400,
                                cursor: 'pointer', fontFamily: T.sans,
                                transition: 'color 120ms, border-color 120ms',
                                whiteSpace: 'nowrap', flexShrink: 0,
                            }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'rgba(230,221,208,0.85)'; }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'rgba(230,221,208,0.55)'; }}>
                            {tab.label}
                            {/* Overdue badge on Tasks */}
                            {tab.id === 'tasks' && overdueTaskCount > 0 && (
                                <span style={{ position: 'absolute', top: 8, right: 4, background: T.danger, color: '#fff', borderRadius: '999px', fontSize: 8, fontWeight: 800, minWidth: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>
                                    {overdueTaskCount > 99 ? '99+' : overdueTaskCount}
                                </span>
                            )}
                            {tab.id === 'tasks' && mentionCount > 0 && overdueTaskCount === 0 && (
                                <span style={{ position: 'absolute', top: 9, right: 5, background: T.danger, color: '#fff', borderRadius: '999px', fontSize: 8, fontWeight: 800, minWidth: 13, height: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px', lineHeight: 1 }}>!</span>
                            )}
                        </button>
                    );
                })}
                {isReadOnly && (
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 8, fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, fontStyle: 'italic' }}>
                        👁 View Only
                    </div>
                )}
            </div>

            {/* RIGHT: search + bell + avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>

                {/* Search */}
                <div style={{ position: 'relative', zIndex: 200 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: 'rgba(255,255,255,0.06)',
                        padding: '5px 12px', borderRadius: T.r,
                        width: isMobile ? 160 : 280,
                        border: '1px solid rgba(255,255,255,0.08)',
                        transition: 'border-color 150ms, background 150ms',
                    }}
                        onFocusCapture={e => { e.currentTarget.style.borderColor = T.gold; e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; }}
                        onBlurCapture={e =>  { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}>
                        <Icon name="search" size={14} color="rgba(230,221,208,0.5)"/>
                        <input
                            className="global-search-input"
                            type="text"
                            placeholder="Search accounts, deals, contacts"
                            value={globalSearch}
                            onChange={e => { setGlobalSearch(e.target.value); setShowSearchResults(e.target.value.length > 0); }}
                            onFocus={() => { if (globalSearch.length > 0) setShowSearchResults(true); }}
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: 'rgba(230,221,208,0.9)', flex: 1, padding: 0, fontFamily: T.sans }}
                        />
                        {globalSearch ? (
                            <button onClick={() => { setGlobalSearch(''); setShowSearchResults(false); }}
                                style={{ background: 'none', border: 'none', color: 'rgba(230,221,208,0.5)', cursor: 'pointer', padding: 0, lineHeight: 1, flexShrink: 0, display: 'flex' }}>
                                <Icon name="x" size={12} color="rgba(230,221,208,0.5)"/>
                            </button>
                        ) : (
                            <span style={{ fontSize: 10, color: 'rgba(230,221,208,0.4)', fontFamily: 'monospace', flexShrink: 0 }}>⌘K</span>
                        )}
                    </div>

                    {/* Search results */}
                    {showSearchResults && globalSearch.length > 0 && (
                        <>
                        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setShowSearchResults(false)}/>
                        <div className="spt-search-results" style={{
                            position: 'absolute', top: '100%', right: 0, marginTop: 6,
                            width: isMobile ? '100vw' : 420, maxHeight: 420, overflowY: 'auto',
                            background: T.surface, border: `1px solid ${T.border}`,
                            borderRadius: 6, boxShadow: '0 8px 24px rgba(42,38,34,0.15)', zIndex: 9999,
                        }} onClick={e => e.stopPropagation()}>
                            {(() => {
                                const q = globalSearch.toLowerCase();
                                const mA = accounts.filter(a => (a.name||'').toLowerCase().includes(q) || (a.accountOwner||'').toLowerCase().includes(q)).slice(0,5);
                                const mC = contacts.filter(c => ((c.firstName||'')+' '+(c.lastName||'')).toLowerCase().includes(q) || (c.company||'').toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q)).slice(0,5);
                                const mO = opportunities.filter(o => (o.opportunityName||'').toLowerCase().includes(q) || (o.account||'').toLowerCase().includes(q)).slice(0,5);
                                if (!mA.length && !mC.length && !mO.length) return <div style={{ padding: '1.5rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>No results found</div>;
                                const GH = ({ label }) => <div style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', background: T.bg, borderBottom: `1px solid ${T.border}`, fontFamily: T.sans }}>{label}</div>;
                                const RR = ({ primary, secondary, meta, onClick }) => (
                                    <div style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                        onClick={onClick} onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{primary}</div>
                                            {secondary && <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1, fontFamily: T.sans }}>{secondary}</div>}
                                        </div>
                                        {meta && <span style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans, flexShrink: 0, marginLeft: 8 }}>{meta}</span>}
                                    </div>
                                );
                                return (
                                    <>
                                        {mA.length > 0 && <div><GH label="Accounts"/>{mA.map(a => { const od = opportunities.filter(o => (o.account||'').toLowerCase() === (a.name||'').toLowerCase() && o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').length; return <RR key={'sa-'+a.id} primary={a.name} secondary={a.accountOwner ? `${a.accountOwner}${od > 0 ? ` · ${od} open deal${od>1?'s':''}` : ''}` : undefined} meta="Account" onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('accounts'); setTimeout(() => setViewingAccount(a), 100); }}/>; })}</div>}
                                        {mC.length > 0 && <div><GH label="Contacts"/>{mC.map(c => <RR key={'sc-'+c.id} primary={`${c.firstName} ${c.lastName}`} secondary={[c.title,c.company].filter(Boolean).join(' · ')} meta="Contact" onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('contacts'); setTimeout(() => setViewingContact(c), 100); }}/>)}</div>}
                                        {mO.length > 0 && <div><GH label="Opportunities"/>{mO.map(o => <RR key={'so-'+o.id} primary={o.opportunityName || o.account || 'Unnamed'} secondary={`${o.account} · ${o.stage}`} meta={`$${(o.arr||0).toLocaleString()}`} onClick={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(o); setShowModal(true); }, 150); }}/>)}</div>}
                                    </>
                                );
                            })()}
                        </div>
                        </>
                    )}
                </div>

                {/* Bell */}
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowNotifications(!showNotifications)}
                        style={{ background: notifications.length > 0 ? T.danger : 'transparent', color: T.surfaceInkFg, border: 'none', borderRadius: T.r, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative', transition: 'background 150ms' }}
                        onMouseEnter={e => { if (!notifications.length) e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
                        onMouseLeave={e => { if (!notifications.length) e.currentTarget.style.background = 'transparent'; }}>
                        <Icon name="bell" size={16} color="rgba(230,221,208,0.75)"/>
                        {notifications.length > 0 && (
                            <span style={{ position: 'absolute', top: -3, right: -3, background: T.warn, color: '#fff', borderRadius: '50%', width: 14, height: 14, fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.sans }}>
                                {notifications.length}
                            </span>
                        )}
                    </button>
                    {showNotifications && (
                        <div style={{ position: isMobile ? 'fixed' : 'absolute', top: isMobile ? 0 : 40, right: 0, left: isMobile ? 0 : 'auto', bottom: isMobile ? 0 : 'auto', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, boxShadow: '0 8px 24px rgba(42,38,34,0.14)', minWidth: isMobile ? 'unset' : 350, maxWidth: isMobile ? 'unset' : 400, maxHeight: isMobile ? '100%' : 500, overflowY: 'auto', zIndex: 1000, fontFamily: T.sans }}>
                            <div style={{ padding: '0.875rem 1rem', borderBottom: `1px solid ${T.border}`, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: T.ink }}>
                                <span>Notifications ({notifications.length})</span>
                                <button onClick={() => setShowNotifications(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMuted, fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>
                            </div>
                            {notifications.length === 0
                                ? <div style={{ padding: '2rem', textAlign: 'center', color: T.inkMuted, fontSize: 13 }}>No notifications</div>
                                : notifications.map(n => (
                                    <div key={n.id} style={{ padding: '0.875rem 1rem', borderBottom: `1px solid ${T.border}`, cursor: 'pointer', transition: 'background 0.15s' }}
                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        onClick={() => { if (n.opportunityId) { setActiveTab('pipeline'); setShowNotifications(false); } }}>
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                            <span style={{ fontSize: 14 }}>{n.type === 'danger' ? '🔴' : n.type === 'warning' ? '⚠️' : 'ℹ️'}</span>
                                            <div style={{ flex: 1, fontSize: 13, color: T.ink, lineHeight: 1.5 }}>{n.message}</div>
                                        </div>
                                    </div>
                                ))
                            }
                        </div>
                    )}
                </div>

                {/* Avatar → profile panel */}
                <div style={{ position: 'relative' }}>
                    <div onClick={() => {
                            setShowProfilePanel(v => !v);
                            setProfilePanelTab('profile');
                            const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                            if (tz && myProfile && myProfile.timezone !== tz) {
                                import('../../utils/storage').then(({ dbFetch: df }) => df('/.netlify/functions/users?me=true', { method: 'PUT', body: JSON.stringify({ ...(myProfile||{}), timezone: tz }) }).catch(() => {}));
                            }
                            setProfileForm({ firstName: myProfile?.firstName || currentUser.split(' ')[0] || '', lastName: myProfile?.lastName || currentUser.split(' ').slice(1).join(' ') || '', email: myProfile?.email || clerkUser?.emailAddresses?.[0]?.emailAddress || '', phone: myProfile?.phone || '', mobile: myProfile?.mobile || '', title: myProfile?.title || '' });
                        }}
                        title={`${currentUser} · click for profile`}
                        style={{ width: 30, height: 30, borderRadius: '50%', background: _avatarBg(currentUser), color: '#fef4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, cursor: 'pointer', userSelect: 'none', flexShrink: 0, border: showProfilePanel ? `2px solid ${T.gold}` : '2px solid transparent', transition: 'border-color 150ms' }}>
                        {userInitials}
                    </div>

                    {/* Profile panel */}
                    {showProfilePanel && (
                        <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 1099 }} onClick={() => setShowProfilePanel(false)}/>
                        <div className="spt-profile-panel" style={{ position: isMobile ? 'fixed' : 'absolute', top: isMobile ? 0 : 40, right: 0, left: isMobile ? 0 : 'auto', bottom: isMobile ? 0 : 'auto', width: isMobile ? '100%' : 420, background: T.surface, borderRadius: isMobile ? 0 : 6, border: `1px solid ${T.border}`, boxShadow: '0 12px 40px rgba(42,38,34,0.18)', zIndex: 1100, overflow: 'auto', fontFamily: T.sans }} onClick={e => e.stopPropagation()}>

                            {/* Panel header */}
                            <div style={{ background: T.surfaceInk, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 44, height: 44, borderRadius: '50%', background: _avatarBg(currentUser), color: '#fef4e6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>{userInitials}</div>
                                <div>
                                    <div style={{ color: T.surfaceInkFg, fontWeight: 700, fontSize: 15, fontFamily: T.sans }}>{currentUser}</div>
                                    <div style={{ color: T.inkMuted, fontSize: 12, marginTop: 2, fontFamily: T.sans }}>{clerkUser?.emailAddresses?.[0]?.emailAddress}</div>
                                    <div style={{ marginTop: 4 }}>
                                        <span style={{ background: 'rgba(200,185,154,0.18)', color: T.gold, fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: T.r, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: T.sans, border: '1px solid rgba(200,185,154,0.3)' }}>
                                            {userRole === 'User' ? 'Sales Rep' : userRole}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <button onClick={() => { setQuickLogOpen(v => !v); setShowProfilePanel(false); }} title="Quick-log" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: T.surfaceInkFg, cursor: 'pointer', padding: '4px 10px', borderRadius: T.r, fontSize: 11, fontWeight: 600, fontFamily: T.sans, display: 'flex', alignItems: 'center', gap: 4 }}>
                                        <Icon name="flash" size={11} color={T.gold}/> Log
                                    </button>
                                    {userMemberships?.data?.length > 1 && (
                                        <OrganizationSwitcher appearance={{ elements: { rootBox: { display: 'flex', alignItems: 'center' }, organizationSwitcherTrigger: { padding: '3px 8px', borderRadius: T.r, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 11, fontWeight: 600 } }}}/>
                                    )}
                                    <button onClick={() => { setShowShortcuts(v => !v); setShowProfilePanel(false); }} title="Keyboard shortcuts" style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', color: T.surfaceInkFg, borderRadius: T.r, width: 28, height: 28, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <Icon name="keyboard" size={14} color={T.surfaceInkFg}/>
                                    </button>
                                    <button onClick={handleLogout} title="Sign out" style={{ background: 'none', border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(230,221,208,0.6)', cursor: 'pointer', padding: '4px 10px', borderRadius: T.r, fontSize: 11, fontWeight: 600, fontFamily: T.sans, display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = T.danger; e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = T.danger; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'rgba(230,221,208,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; }}>
                                        <Icon name="logout" size={12} color="currentColor"/> Sign out
                                    </button>
                                </div>
                            </div>

                            {/* Panel tabs */}
                            <div style={{ display: 'flex', gap: 0, padding: '0.5rem 1rem 0', borderBottom: `1px solid ${T.border}`, background: T.surface }}>
                                {panelTabBtn('profile','👤 Profile')}
                                {panelTabBtn('notifications','🔔 Notifications')}
                                {panelTabBtn('importexport','⇅ Import / Export')}
                            </div>

                            <div style={{ padding: '1.25rem 1.5rem', maxHeight: 560, overflowY: 'auto', background: T.surface }}>

                                {/* Profile Tab */}
                                {profilePanelTab === 'profile' && (
                                    <div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '0.875rem' }}>
                                            <div><label style={panelLabel}>First Name</label><input style={panelInput} value={profileForm.firstName} onChange={e => setProfileForm(p => ({ ...p, firstName: e.target.value }))}/></div>
                                            <div><label style={panelLabel}>Last Name</label><input style={panelInput} value={profileForm.lastName} onChange={e => setProfileForm(p => ({ ...p, lastName: e.target.value }))}/></div>
                                        </div>
                                        <div style={{ marginBottom: '0.875rem' }}><label style={panelLabel}>Work Email</label><input style={panelInput} type="email" value={profileForm.email} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))}/></div>
                                        <div style={{ marginBottom: '0.875rem' }}><label style={panelLabel}>Phone</label><input style={panelInput} type="tel" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}/></div>
                                        <div style={{ marginBottom: '0.875rem' }}><label style={panelLabel}>Mobile <span style={{ fontWeight: 400, color: T.inkMuted }}>(SMS notifications)</span></label><input style={panelInput} type="tel" placeholder="+1 (555) 000-0000" value={profileForm.mobile || ''} onChange={e => setProfileForm(p => ({ ...p, mobile: e.target.value }))}/></div>
                                        <div style={{ marginBottom: '1.25rem' }}><label style={panelLabel}>Title</label><input style={panelInput} value={profileForm.title} onChange={e => setProfileForm(p => ({ ...p, title: e.target.value }))}/></div>
                                        <div style={{ padding: '0.75rem', background: T.bg, borderRadius: T.r, fontSize: 12, color: T.inkMid, marginBottom: '1rem', border: `1px solid ${T.border}`, fontFamily: T.sans }}>
                                            🔑 Password managed via Clerk. <a href="https://accounts.clerk.dev" target="_blank" rel="noreferrer" style={{ color: T.goldInk }}>Change password →</a>
                                        </div>
                                        <button onClick={() => saveProfile({ firstName: profileForm.firstName, lastName: profileForm.lastName, email: profileForm.email, phone: profileForm.phone, mobile: profileForm.mobile, title: profileForm.title })} disabled={profileSaving}
                                            style={{ width: '100%', padding: '0.625rem', background: T.ink, color: T.surfaceInkFg, border: 'none', borderRadius: T.r, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: T.sans }}>
                                            {profileSaving ? 'Saving…' : 'Save Profile'}
                                        </button>
                                    </div>
                                )}

                                {/* Notifications Tab */}
                                {profilePanelTab === 'notifications' && (
                                    <div>
                                        <p style={{ fontSize: '0.8125rem', color: T.inkMid, margin: '0 0 1rem', lineHeight: 1.5, fontFamily: T.sans }}>Choose which alerts you receive and whether they're sent immediately or bundled into a daily digest.</p>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: T.bg, borderRadius: T.r, border: `1px solid ${T.border}`, marginBottom: '1rem' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '0.8125rem', color: T.ink, fontFamily: T.sans }}>Daily digest time</div>
                                                <div style={{ fontSize: '0.75rem', color: T.inkMid, marginTop: 2, fontFamily: T.sans }}>Your local time — <span style={{ fontWeight: 600, color: T.ink }}>{userTimezone}</span></div>
                                            </div>
                                            <input type="time" value={digestTime} onChange={e => saveProfile({ digestTime: e.target.value, timezone: userTimezone })} style={{ padding: '0.375rem 0.5rem', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.875rem', fontFamily: T.sans, background: T.surface }}/>
                                        </div>
                                        {Object.entries(ALERT_LABELS).map(([alertType, label]) => {
                                            if (alertType === 'managerAlerts' && !isManager && !isAdmin) return null;
                                            if (alertType === 'quotePending' && !isManager && !isAdmin) return null;
                                            if ((alertType === 'quoteApproved' || alertType === 'quoteRejected') && (isManager || isAdmin)) return null;
                                            const pref = prefs[alertType] || DEFAULT_PREFS[alertType] || { enabled: true, mode: 'instant' };
                                            const isDigestOnly = alertType === 'taskDigest' || alertType === 'overdueTaskNudge';
                                            return (
                                                <React.Fragment key={alertType}>
                                                    {alertType === 'dealSilent' && <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '1rem', paddingTop: '0.75rem', borderTop: `1px solid ${T.border}`, marginBottom: '0.375rem', fontFamily: T.sans }}>Pipeline health alerts</div>}
                                                    {(alertType === 'quoteApproved' || (alertType === 'quotePending' && (isManager || isAdmin))) && <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '1rem', paddingTop: '0.75rem', borderTop: `1px solid ${T.border}`, marginBottom: '0.375rem', fontFamily: T.sans }}>Quote alerts</div>}
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.625rem 0', borderBottom: `1px solid ${T.border}` }}>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: T.ink, fontFamily: T.sans }}>
                                                                {label}
                                                                {(alertType === 'managerAlerts' || alertType === 'quotePending') && <span style={{ fontSize: 9.5, fontWeight: 700, background: 'rgba(122,90,60,0.12)', color: T.goldInk, padding: '1px 6px', borderRadius: T.r, marginLeft: 6, fontFamily: T.sans }}>Manager</span>}
                                                            </div>
                                                            {isDigestOnly && <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1, fontFamily: T.sans }}>Digest only</div>}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <button onClick={() => togglePref(alertType, 'enabled', !pref.enabled)} style={{ width: 36, height: 20, borderRadius: '999px', border: 'none', cursor: 'pointer', background: pref.enabled ? T.ink : T.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }} title={pref.enabled ? 'Disable' : 'Enable'}>
                                                                <span style={{ position: 'absolute', top: 2, left: pref.enabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }}/>
                                                            </button>
                                                            {!isDigestOnly && pref.enabled && (
                                                                <select value={pref.mode} onChange={e => togglePref(alertType, 'mode', e.target.value)} style={{ fontSize: 12, padding: '3px 6px', border: `1px solid ${T.border}`, borderRadius: T.r, fontFamily: T.sans, background: T.surface, cursor: 'pointer' }}>
                                                                    <option value="instant">Instant</option>
                                                                    <option value="digest">Digest</option>
                                                                </select>
                                                            )}
                                                        </div>
                                                    </div>
                                                </React.Fragment>
                                            );
                                        })}
                                        {/* SMS */}
                                        {(() => {
                                            const sms = myProfile?.smsNotifications || {};
                                            const smsEnabled = !!sms.enabled;
                                            const setSms = (k, v) => saveProfile({ smsNotifications: { ...sms, [k]: v } });
                                            const ST = ({ label, desc, smsKey }) => (
                                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '0.5rem 0', borderBottom: `1px solid ${T.border}` }}>
                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: smsEnabled ? T.ink : T.inkMuted, fontFamily: T.sans }}>{label}</div>
                                                        {desc && <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1, fontFamily: T.sans }}>{desc}</div>}
                                                    </div>
                                                    <button onClick={() => smsEnabled && setSms(smsKey, !sms[smsKey])} style={{ width: 36, height: 20, borderRadius: '999px', border: 'none', cursor: smsEnabled ? 'pointer' : 'not-allowed', background: sms[smsKey] && smsEnabled ? T.ink : T.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                                        <span style={{ position: 'absolute', top: 2, left: sms[smsKey] && smsEnabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }}/>
                                                    </button>
                                                </div>
                                            );
                                            return (
                                                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: `1px solid ${T.border}` }}>
                                                    <div style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem', fontFamily: T.sans }}>💬 SMS Notifications</div>
                                                    {!(myProfile?.mobile || myProfile?.phone) && <div style={{ fontSize: 12, color: T.warn, background: 'rgba(184,115,51,0.08)', border: '1px solid rgba(184,115,51,0.3)', borderRadius: T.r, padding: '0.5rem 0.75rem', marginBottom: '0.75rem', lineHeight: 1.5, fontFamily: T.sans }}>Add a mobile number in the Profile tab to enable SMS.</div>}
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: `1px solid ${T.border}` }}>
                                                        <div>
                                                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: T.ink, fontFamily: T.sans }}>Enable SMS</div>
                                                            <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 1, fontFamily: T.sans }}>{myProfile?.mobile || myProfile?.phone ? `Texts to ${myProfile?.mobile || myProfile?.phone}` : 'Set a mobile number in Profile first'}</div>
                                                        </div>
                                                        <button onClick={() => setSms('enabled', !smsEnabled)} style={{ width: 36, height: 20, borderRadius: '999px', border: 'none', cursor: 'pointer', background: smsEnabled ? T.ink : T.border, position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                                                            <span style={{ position: 'absolute', top: 2, left: smsEnabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', display: 'block' }}/>
                                                        </button>
                                                    </div>
                                                    <div style={{ opacity: smsEnabled ? 1 : 0.45, transition: 'opacity 0.2s' }}>
                                                        <ST label="Pipeline Alerts"        desc="Once daily · Silent deals, stuck stages, lapsed dates"  smsKey="pipelineAlerts"/>
                                                        <ST label="Task Reminders"         desc="At due time · Text when a task comes due"               smsKey="taskReminders"/>
                                                        <ST label="Daily Digest"           desc="Once daily · Morning summary of tasks & pipeline"       smsKey="digest"/>
                                                        <ST label="Mentions & Assignments" desc="On occurrence · When a deal or task is assigned to you" smsKey="mentions"/>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        <button onClick={() => saveProfile({ notificationPrefs: prefs, digestTime, timezone: userTimezone, smsNotifications: myProfile?.smsNotifications })} disabled={profileSaving}
                                            style={{ width: '100%', padding: '0.625rem', background: T.ink, color: T.surfaceInkFg, border: 'none', borderRadius: T.r, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: T.sans, marginTop: '1rem' }}>
                                            {profileSaving ? 'Saving…' : 'Save Notification Settings'}
                                        </button>
                                    </div>
                                )}

                                {/* Import / Export Tab */}
                                {profilePanelTab === 'importexport' && (() => {
                                    const IB = (type) => <button onClick={() => { setCsvImportType(type); setShowCsvImportModal(true); setShowProfilePanel(false); }} style={{ padding: '0.35rem 0.875rem', border: 'none', borderRadius: T.r, background: T.ink, color: T.surfaceInkFg, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>📥 Import</button>;
                                    const EB = (key, file, headers, rows) => <button disabled={exportingCSV === key} onClick={() => exportToCSV(file, headers, rows, key)} style={{ padding: '0.35rem 0.875rem', border: 'none', borderRadius: T.r, background: exportingCSV === key ? T.inkMuted : T.ink, color: T.surfaceInkFg, fontSize: 12, fontWeight: 600, cursor: exportingCSV === key ? 'default' : 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>{exportingCSV === key ? '⏳…' : '📤 Export'}</button>;
                                    return (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            {[
                                                { icon: '🏢', title: 'Accounts',      type: 'accounts',      key: 'accounts',      file: `accounts-${new Date().toISOString().slice(0,10)}.csv`,      headers: ['Account Name','Vertical Market','Account Owner','Phone','Website','Address','City','State','ZIP','Country'],                                              rows: accounts.map(a => [a.name,a.verticalMarket,a.accountOwner,a.phone,a.website,a.address,a.city,a.state,a.zip,a.country]) },
                                                { icon: '👤', title: 'Contacts',      type: 'contacts',      key: 'contacts',      file: `contacts-${new Date().toISOString().slice(0,10)}.csv`,      headers: ['First Name','Last Name','Email','Phone','Mobile','Title','Company','Address','City','State','ZIP','Country'],                                           rows: contacts.map(c => [c.firstName,c.lastName,c.email,c.phone,c.mobile,c.title,c.company,c.address,c.city,c.state,c.zip,c.country]) },
                                                { icon: '💼', title: 'Opportunities', type: 'opportunities', key: 'opportunities', file: `opportunities-${new Date().toISOString().slice(0,10)}.csv`, headers: ['Opportunity Name','Account','Sales Rep','Stage','ARR','Impl. Cost','Close Date','Products','Notes','Territory','Vertical'],                            rows: opportunities.map(o => [o.opportunityName,o.account,o.salesRep,o.stage,o.arr,o.implementationCost,o.forecastedCloseDate,o.products,o.notes,o.territory,o.vertical]) },
                                                { icon: '✅', title: 'Tasks',         type: 'tasks',         key: 'tasks',         file: `tasks-${new Date().toISOString().slice(0,10)}.csv`,         headers: ['Title','Type','Status','Due Date','Priority','Assigned To','Account','Notes'],                                                                       rows: tasks.map(t => [t.title||'',t.type||'',t.status||'',t.dueDate||'',t.priority||'',t.assignedTo||'',t.account||'',t.notes||'']) },
                                            ].map(({ icon, title, type, key, file, headers, rows }) => (
                                                <div key={type} style={{ padding: '0.75rem 1rem', border: `1px solid ${T.border}`, borderRadius: T.r, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <div style={{ fontWeight: 700, fontSize: '0.875rem', color: T.ink, fontFamily: T.sans }}>{icon} {title}</div>
                                                    <div style={{ display: 'flex', gap: 6 }}>{IB(type)}{EB(key, file, headers, rows)}</div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}

                            </div>
                            {profileSaving && <div style={{ padding: '0.5rem 1.5rem', background: T.bg, borderTop: `1px solid ${T.border}`, fontSize: 12, color: T.inkMid, fontWeight: 600, fontFamily: T.sans }}>✓ Saving preferences…</div>}
                        </div>
                        </>
                    )}
                </div>

            </div>{/* end RIGHT */}
        </header>
        </>
    );
}
