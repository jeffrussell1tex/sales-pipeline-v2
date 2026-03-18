import React, { useState } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

function QuotaRepCard({ u, quotaMode, quarters, dotBg, dotTxt, inputSt, updateRepField, compactInput }) {
    const initials = (name) => (name||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
    const cardStyle = { background:'#fff', border:'1px solid #e2e8f0', borderRadius:'10px', overflow:'hidden' };
    const topStyle  = { display:'flex', alignItems:'center', gap:'10px', padding:'0.75rem 1rem', borderBottom:'1px solid #f1f5f9' };
    const bodyStyle = { padding:'0.875rem 1rem', display:'flex', flexDirection:'column', gap:'8px' };
    const lblStyle  = { fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'3px' };
    const qGridStyle = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' };

    // Use local state for the input values so typing feels instant.
    // Only persist to DB on blur (when user leaves the field) to avoid
    // writing partial/zero values on every keystroke.
    const [localAnnual, setLocalAnnual] = React.useState(u.annualQuota != null ? String(u.annualQuota) : '');
    const [localQ, setLocalQ] = React.useState(() => {
        const out = {};
        ['q1','q2','q3','q4'].forEach(q => { out[q] = u[q+'Quota'] != null ? String(u[q+'Quota']) : ''; });
        return out;
    });

    // Sync local state when the user record updates from outside (e.g. initial DB load)
    React.useEffect(() => { setLocalAnnual(u.annualQuota != null ? String(u.annualQuota) : ''); }, [u.annualQuota]);
    React.useEffect(() => {
        setLocalQ(prev => {
            const out = { ...prev };
            ['q1','q2','q3','q4'].forEach(q => { out[q] = u[q+'Quota'] != null ? String(u[q+'Quota']) : ''; });
            return out;
        });
    }, [u.q1Quota, u.q2Quota, u.q3Quota, u.q4Quota]);

    const commitAnnual = (rawVal) => {
        const val = parseFloat(rawVal);
        if (!isNaN(val) && val >= 0) updateRepField(u.id, 'annualQuota', val);
    };
    const commitQ = (qKey, rawVal) => {
        const val = parseFloat(rawVal);
        if (!isNaN(val) && val >= 0) updateRepField(u.id, qKey + 'Quota', val);
    };

    // compactInput mode — renders only the input(s), no card wrapper
    // Used by the Option C list layout where the card chrome is handled by the row
    if (compactInput) {
        if (quotaMode === 'annual') {
            return (
                <input type="number" value={localAnnual} placeholder="0"
                    onChange={e => setLocalAnnual(e.target.value)}
                    onBlur={e => { e.target.style.borderColor='#e2e8f0'; commitAnnual(e.target.value); }}
                    onFocus={e => e.target.style.borderColor='#2563eb'}
                    style={inputSt} />
            );
        }
        return (
            <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
                {[['Q1','Q2'],['Q3','Q4']].map((pair, pi) => (
                    <div key={pi} style={{ display:'flex', gap:'4px' }}>
                        {pair.map(q => {
                            const qKey = q.toLowerCase();
                            return (
                                <div key={q} style={{ display:'flex', flexDirection:'column', gap:'1px' }}>
                                    <div style={{ fontSize:'0.5rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase' }}>{q}</div>
                                    <input type="number" value={localQ[qKey]||''} placeholder="0"
                                        onChange={e => setLocalQ(prev => ({ ...prev, [qKey]: e.target.value }))}
                                        onBlur={e => { e.target.style.borderColor='#e2e8f0'; commitQ(qKey, e.target.value); }}
                                        onFocus={e => e.target.style.borderColor='#2563eb'}
                                        style={inputSt} />
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div style={cardStyle}>
            <div style={topStyle}>
                <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:dotBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', fontWeight:'700', color:dotTxt, flexShrink:0 }}>
                    {initials(u.name)}
                </div>
                <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:'0.8125rem', fontWeight:'700', color:'#1e293b', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{u.name}</div>
                    <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'1px' }}>{u.team || u.territory || 'No team'}</div>
                </div>
            </div>
            <div style={bodyStyle}>
                {quotaMode === 'annual' ? (
                    <div>
                        <div style={lblStyle}>Annual quota</div>
                        <input type="number" value={localAnnual} placeholder="0"
                            onChange={e => setLocalAnnual(e.target.value)}
                            onBlur={e => { e.target.style.borderColor='#e2e8f0'; commitAnnual(e.target.value); }}
                            onFocus={e => e.target.style.borderColor='#2563eb'}
                            style={inputSt} />
                    </div>
                ) : (
                    <div style={qGridStyle}>
                        {quarters.map(q => {
                            const qKey = q.toLowerCase();
                            return (
                                <div key={q}>
                                    <div style={lblStyle}>{q}</div>
                                    <input type="number" value={localQ[qKey]||''} placeholder="0"
                                        onChange={e => setLocalQ(prev => ({ ...prev, [qKey]: e.target.value }))}
                                        onBlur={e => { e.target.style.borderColor='#e2e8f0'; commitQ(qKey, e.target.value); }}
                                        onFocus={e => e.target.style.borderColor='#2563eb'}
                                        style={{ ...inputSt, fontSize:'0.8125rem' }} />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function SalesManagerTab() {
    const {
        settings, setSettings,
        opportunities,
        currentUser, userRole,
        getQuarter, getQuarterLabel,
        exportToCSV,
        showConfirm,
        activeTab, setActiveTab,
        spiffClaims, setSpiffClaims,
    } = useApp();

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';

    if (!isAdmin && !isManager) return null;

    return (

                <div className="tab-page">
                    <div className="tab-page-header">
                        <div className="tab-page-header-bar"></div>
                        <div>
                            <h2>Sales Manager</h2>
                            <p>Set rep quotas by territory — territory totals roll up automatically</p>
                        </div>
                    </div>
                    {(() => {
                        const allUsers = (settings.users || []).filter(u => u.name && u.userType !== 'ReadOnly');
                        const quarters = ['Q1','Q2','Q3','Q4'];
                        const quotaMode = allUsers.find(u => u.quotaType)?.quotaType || 'annual';

                        // ── helpers ──────────────────────────────────────────
                        const getRepTotal = (u) => {
                            if ((u.quotaType || quotaMode) === 'annual') return u.annualQuota || 0;
                            return (u.q1Quota||0)+(u.q2Quota||0)+(u.q3Quota||0)+(u.q4Quota||0);
                        };

                        const updateRepField = (userId, field, value) => {
                            setSettings(prev => {
                                const updatedUsers = (prev.users||[]).map(u =>
                                    u.id === userId ? { ...u, [field]: value } : u
                                );
                                // Persist quota field change to /users DB endpoint immediately.
                                // Without this, quota values only live in React state and are
                                // lost on logout because the settings save effect strips users.
                                const updatedUser = updatedUsers.find(u => u.id === userId);
                                if (updatedUser) {
                                    dbFetch('/.netlify/functions/users', {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(updatedUser),
                                    }).catch(err => console.error('Failed to persist quota for user', userId, err));
                                }
                                return { ...prev, users: updatedUsers };
                            });
                        };

                        const setAllQuotaMode = (mode) => {
                            setSettings(prev => {
                                const updatedUsers = (prev.users||[]).map(u =>
                                    u.userType !== 'ReadOnly' ? { ...u, quotaType: mode } : u
                                );
                                // Persist quotaType change to DB for all affected users
                                updatedUsers.filter(u => u.userType !== 'ReadOnly').forEach(u => {
                                    dbFetch('/.netlify/functions/users', {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(u),
                                    }).catch(err => console.error('Failed to persist quotaType for user', u.id, err));
                                });
                                return { ...prev, users: updatedUsers };
                            });
                        };

                        // Won revenue per rep name (kept for commission plan below)
                        const repWon = {};
                        opportunities.filter(o => o.stage === 'Closed Won').forEach(o => {
                            const rep = o.salesRep || o.assignedTo;
                            if (rep) repWon[rep] = (repWon[rep] || 0) + (o.arr||0) + (o.implementationCost||0);
                        });

                        const calcCommission = (revenue, quota) => {
                            if (quota <= 0 || revenue <= 0) return 0;
                            let commission = 0;
                            [...((settings.quotaData||{}).commissionTiers||[])].sort((a,b)=>a.minPercent-b.minPercent).forEach(tier => {
                                const mn = (tier.minPercent/100)*quota;
                                const mx = tier.maxPercent >= 999 ? Infinity : (tier.maxPercent/100)*quota;
                                if (revenue > mn) commission += (Math.min(revenue,mx)-mn)*(tier.rate/100);
                            });
                            return commission;
                        };

                        // ── role-based rep scoping ────────────────────────────
                        // currentUser is the logged-in user object from settings
                        const currentUserObj = (settings.users||[]).find(u => u.name === currentUser);
                        const viewerIsAdmin  = isAdmin;

                        // Reps visible to this viewer:
                        // Admin → all reps (userType === 'User')
                        // Manager → only reps on their team(s) (matched by teamId or team name)
                        const allReps = allUsers.filter(u => u.userType === 'User');
                        const visibleReps = viewerIsAdmin
                            ? allReps
                            : allReps.filter(u => {
                                if (!currentUserObj) return false;
                                // match by teamId first, fall back to team name
                                return (currentUserObj.teamId && u.teamId === currentUserObj.teamId) ||
                                       (currentUserObj.team && u.team === currentUserObj.team);
                              });

                        // Unassigned reps (no territory) — warn admin only
                        const unassignedReps = viewerIsAdmin
                            ? visibleReps.filter(u => !u.territory || !u.territory.trim())
                            : [];

                        // All territories present in visible reps
                        const visibleTerritories = [...new Set(
                            visibleReps.filter(u => u.territory && u.territory.trim()).map(u => u.territory.trim())
                        )].sort();

                        // Admin territory filter state (stored in component-level state via a ref trick —
                        // we use a module-level variable keyed to this render since this is an IIFE)
                        // We piggyback on a settings key that won't affect data: __qbTerrFilter
                        const terrFilter = (settings.__qbTerrFilter) || 'all';
                        const setTerrFilter = (val) => setSettings(prev => ({ ...prev, __qbTerrFilter: val }));

                        // Reps to actually show after filter
                        const filteredReps = (viewerIsAdmin && terrFilter !== 'all')
                            ? visibleReps.filter(u => u.territory && u.territory.trim() === terrFilter)
                            : visibleReps;

                        // Territories to render (for divider labels in all-view)
                        const renderTerritories = (viewerIsAdmin && terrFilter === 'all')
                            ? visibleTerritories
                            : (terrFilter !== 'all' ? [terrFilter] : [...new Set(visibleReps.filter(u=>u.territory).map(u=>u.territory.trim()))].sort());

                        // Running total of assigned quota across filtered reps
                        const filteredTotal = filteredReps.reduce((s,u) => s + getRepTotal(u), 0);

                        // ── avatar color by territory ─────────────────────────
                        const terrColors = ['#B5D4F4:#185FA5','#9FE1CB:#0F6E56','#CECBF6:#534AB7','#FAC775:#854F0B','#F4C0D1:#993556'];
                        const terrColorMap = {};
                        visibleTerritories.forEach((t, i) => { terrColorMap[t] = terrColors[i % terrColors.length].split(':'); });

                        const smCard  = { background:'#fff', borderRadius:'12px', boxShadow:'0 1px 3px rgba(0,0,0,0.08)', border:'1px solid #e2e8f0', marginBottom:'1.5rem', overflow:'hidden' };
                        const smHdr   = { padding:'1rem 1.5rem', borderBottom:'1px solid #f1f5f9', display:'flex', alignItems:'center', justifyContent:'space-between' };
                        const smTitle = { fontSize:'0.6875rem', fontWeight:'800', color:'#475569', textTransform:'uppercase', letterSpacing:'0.08em' };
                        const inputSt = { width:'100%', padding:'0.5rem 0.625rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.9375rem', fontWeight:'600', fontFamily:'inherit', background:'#f8fafc', outline:'none', textAlign:'right', boxSizing:'border-box' };

                        return (
                            <>
                            {/* ── UNASSIGNED WARNING (admin only) ─────────── */}
                            {unassignedReps.length > 0 && (
                                <div style={{ background:'#fffbeb', border:'1.5px solid #fbbf24', borderRadius:'10px', padding:'0.875rem 1.25rem', marginBottom:'1.25rem', display:'flex', alignItems:'center', gap:'0.875rem' }}>
                                    <span style={{ fontSize:'1.25rem' }}>⚠️</span>
                                    <div style={{ flex:1 }}>
                                        <div style={{ fontWeight:'700', color:'#92400e', fontSize:'0.8125rem' }}>
                                            {unassignedReps.length} rep{unassignedReps.length > 1 ? 's have' : ' has'} no territory assigned:
                                            {' '}<strong>{unassignedReps.map(u=>u.name).join(', ')}</strong>
                                        </div>
                                        <div style={{ fontSize:'0.75rem', color:'#b45309', marginTop:'0.25rem' }}>
                                            Assign a territory via <strong>Settings → Team Builder</strong> to include them below.
                                        </div>
                                    </div>
                                    <button onClick={() => setActiveTab('settings')}
                                        style={{ padding:'0.4rem 0.875rem', background:'#f59e0b', color:'#fff', border:'none', borderRadius:'6px', fontWeight:'700', fontSize:'0.75rem', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>
                                        Go to Settings
                                    </button>
                                </div>
                            )}

                            {/* ── QUOTA BOARD ─────────────────────────────── */}
                            <div style={smCard}>
                                {/* ── Header ── */}
                                <div style={{ ...smHdr, flexWrap:'wrap', gap:'0.5rem' }}>
                                    <div>
                                        <div style={smTitle}>Assign Quotas</div>
                                        <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:'0.125rem' }}>
                                            ${filteredTotal.toLocaleString()} assigned
                                            {viewerIsAdmin ? '' : ` · your team · ${visibleReps.length} rep${visibleReps.length !== 1 ? 's' : ''}`}
                                        </div>
                                    </div>
                                    <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', flexWrap:'wrap' }}>
                                        {/* Territory filter pills */}
                                        {viewerIsAdmin && visibleTerritories.length > 1 && (
                                            <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                                                {['all', ...visibleTerritories].map(t => (
                                                    <button key={t} onClick={() => setTerrFilter(t)} style={{
                                                        padding:'3px 10px', borderRadius:'999px', border:'1px solid', cursor:'pointer',
                                                        fontFamily:'inherit', fontSize:'0.6875rem', fontWeight:'600', transition:'all 0.15s',
                                                        background: terrFilter === t ? '#185FA5' : 'transparent',
                                                        color:      terrFilter === t ? '#fff' : '#475569',
                                                        borderColor: terrFilter === t ? '#185FA5' : '#d1d5db',
                                                    }}>{t === 'all' ? 'All' : t}</button>
                                                ))}
                                            </div>
                                        )}
                                        <div style={{ width:'1px', height:'16px', background:'#e2e8f0' }} />
                                        {/* Annual / Quarterly toggle */}
                                        <div style={{ display:'flex', background:'#f1f5f9', borderRadius:'6px', padding:'2px', gap:'2px' }}>
                                            {['annual','quarterly'].map(t => (
                                                <button key={t} onClick={() => setAllQuotaMode(t)} style={{
                                                    padding:'3px 10px', borderRadius:'4px', border:'none', cursor:'pointer',
                                                    fontFamily:'inherit', fontSize:'0.6875rem', fontWeight:'700', transition:'all 0.15s',
                                                    background: quotaMode === t ? '#fff' : 'transparent',
                                                    color:      quotaMode === t ? '#1e293b' : '#64748b',
                                                    boxShadow:  quotaMode === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                                                }}>{t === 'annual' ? 'Annual' : 'Quarterly'}</button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* ── Column headers ── */}
                                {visibleReps.length > 0 && (
                                    <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'0', padding:'6px 1.5rem', background:'#f8fafc', borderBottom:'1px solid #f1f5f9' }}>
                                        <div style={{ fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>Rep</div>
                                        <div style={{ fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>
                                            {quotaMode === 'annual' ? 'Annual quota' : 'Total quota'}
                                        </div>
                                        <div style={{ fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.06em' }}>Attainment</div>

                                    </div>
                                )}

                                {/* ── Empty states ── */}
                                {allReps.length === 0 ? (
                                    <div style={{ padding:'2.5rem', textAlign:'center', color:'#94a3b8' }}>
                                        No sales reps configured yet. Add users in <strong>Settings → Manage Users</strong>.
                                    </div>
                                ) : visibleReps.length === 0 ? (
                                    <div style={{ padding:'2.5rem', textAlign:'center', color:'#94a3b8' }}>
                                        No reps assigned to your team yet. Go to <strong>Settings → Team Builder</strong> to assign reps.
                                    </div>
                                ) : (
                                    <>
                                        {/* ── Rep rows grouped by territory ── */}
                                        {renderTerritories.map(terr => {
                                            const terrReps = filteredReps.filter(u => u.territory && u.territory.trim() === terr);
                                            if (terrReps.length === 0) return null;
                                            const [dotBg, dotTxt] = terrColorMap[terr] || ['#e2e8f0','#475569'];
                                            const terrTotal = terrReps.reduce((s,u) => s + getRepTotal(u), 0);
                                            return (
                                                <div key={terr}>
                                                    {/* Territory section header — only shown in all-view */}
                                                    {viewerIsAdmin && terrFilter === 'all' && (
                                                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 1.5rem', background:dotBg, borderBottom:'1px solid '+dotBg, borderTop:'1px solid '+dotBg }}>
                                                            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                                                                <div style={{ width:'4px', height:'16px', borderRadius:'2px', background:dotTxt }} />
                                                                <span style={{ fontSize:'0.6875rem', fontWeight:'800', color:dotTxt, textTransform:'uppercase', letterSpacing:'0.08em' }}>{terr}</span>
                                                            </div>
                                                            <span style={{ fontSize:'0.6875rem', color:dotTxt, opacity:0.8 }}>
                                                                {terrReps.length} rep{terrReps.length !== 1 ? 's' : ''} · <strong>${terrTotal.toLocaleString()}</strong>
                                                            </span>
                                                        </div>
                                                    )}
                                                    {/* Rep rows */}
                                                    {terrReps.map((u, ui) => {
                                                        const repWon = (opportunities||[]).filter(o => o.stage === 'Closed Won' && (o.salesRep === u.name || o.assignedTo === u.name))
                                                            .reduce((s,o) => s+(parseFloat(o.arr)||0)+(parseFloat(o.implementationCost)||0), 0);
                                                        const quota = getRepTotal(u);
                                                        const attainPct = quota > 0 ? Math.min((repWon / quota) * 100, 100) : 0;
                                                        const attainColor = attainPct >= 100 ? '#10b981' : attainPct >= 75 ? '#f59e0b' : attainPct >= 40 ? '#185FA5' : '#94a3b8';
                                                        const initials = (u.name||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
                                                        const isLast = ui === terrReps.length - 1;
                                                        return (
                                                            <div key={u.id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'0', padding:'10px 1.5rem', borderBottom: isLast && terrFilter !== 'all' ? 'none' : '1px solid #f1f5f9', alignItems:'center', transition:'background 0.1s' }}
                                                                onMouseEnter={e => e.currentTarget.style.background='#fafafa'}
                                                                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                                                {/* Rep name + avatar */}
                                                                <div style={{ display:'flex', alignItems:'center', gap:'10px', minWidth:0 }}>
                                                                    <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:dotBg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', fontWeight:'700', color:dotTxt, flexShrink:0 }}>
                                                                        {initials}
                                                                    </div>
                                                                    <div style={{ minWidth:0 }}>
                                                                        <div style={{ fontSize:'0.875rem', fontWeight:'600', color:'#1e293b', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.name}</div>
                                                                        <div style={{ fontSize:'0.6875rem', color:'#94a3b8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.team || u.territory || '—'}</div>
                                                                    </div>
                                                                </div>
                                                                {/* Quota input */}
                                                                <div>
                                                                    {quotaMode === 'annual' ? (
                                                                        <QuotaRepCard u={u} quotaMode="annual" quarters={quarters} dotBg={dotBg} dotTxt={dotTxt} inputSt={{ padding:'4px 8px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', background:'#f8fafc', color:'#1e293b', width:'110px' }} updateRepField={updateRepField} compactInput />
                                                                    ) : (
                                                                        <QuotaRepCard u={u} quotaMode="quarterly" quarters={quarters} dotBg={dotBg} dotTxt={dotTxt} inputSt={{ padding:'4px 6px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.75rem', fontFamily:'inherit', background:'#f8fafc', color:'#1e293b', width:'80px' }} updateRepField={updateRepField} compactInput />
                                                                    )}
                                                                </div>
                                                                {/* Attainment bar */}
                                                                <div style={{ display:'flex', alignItems:'center', gap:'8px', paddingRight:'0.5rem' }}>
                                                                    <div style={{ flex:1, height:'6px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}>
                                                                        <div style={{ height:'100%', width:attainPct+'%', background:attainColor, borderRadius:'3px', transition:'width 0.4s ease' }} />
                                                                    </div>
                                                                    <span style={{ fontSize:'0.75rem', fontWeight:'700', color:attainColor, minWidth:'36px', textAlign:'right' }}>
                                                                        {quota > 0 ? attainPct.toFixed(1)+'%' : '—'}
                                                                    </span>
                                                                </div>

                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })}

                                        {/* Unassigned reps */}
                                        {viewerIsAdmin && filteredReps.filter(u => !u.territory || !u.territory.trim()).length > 0 && (
                                            <div>
                                                <div style={{ display:'flex', alignItems:'center', padding:'6px 1.5rem', background:'#fffbeb', borderBottom:'1px solid #fef3c7' }}>
                                                    <span style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#b45309', textTransform:'uppercase', letterSpacing:'0.06em' }}>No territory assigned</span>
                                                </div>
                                                {filteredReps.filter(u => !u.territory || !u.territory.trim()).map((u, ui, arr) => {
                                                    const repWon = (opportunities||[]).filter(o => o.stage === 'Closed Won' && (o.salesRep === u.name || o.assignedTo === u.name))
                                                        .reduce((s,o) => s+(parseFloat(o.arr)||0)+(parseFloat(o.implementationCost)||0), 0);
                                                    const quota = getRepTotal(u);
                                                    const attainPct = quota > 0 ? Math.min((repWon/quota)*100,100) : 0;
                                                    const attainColor = attainPct >= 100 ? '#10b981' : attainPct >= 75 ? '#f59e0b' : attainPct >= 40 ? '#185FA5' : '#94a3b8';
                                                    const initials = (u.name||'').split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase();
                                                    return (
                                                        <div key={u.id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'0', padding:'10px 1.5rem', borderBottom: ui < arr.length-1 ? '1px solid #f1f5f9' : 'none', alignItems:'center' }}
                                                            onMouseEnter={e => e.currentTarget.style.background='#fafafa'}
                                                            onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                                            <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                                                                <div style={{ width:'32px', height:'32px', borderRadius:'50%', background:'#e2e8f0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6875rem', fontWeight:'700', color:'#64748b', flexShrink:0 }}>{initials}</div>
                                                                <div><div style={{ fontSize:'0.875rem', fontWeight:'600', color:'#1e293b' }}>{u.name}</div><div style={{ fontSize:'0.6875rem', color:'#94a3b8' }}>No territory</div></div>
                                                            </div>
                                                            <div><QuotaRepCard u={u} quotaMode={quotaMode} quarters={quarters} dotBg="#e2e8f0" dotTxt="#64748b" inputSt={{ padding:'4px 8px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', background:'#f8fafc', color:'#1e293b', width:'110px' }} updateRepField={updateRepField} compactInput /></div>
                                                            <div style={{ display:'flex', alignItems:'center', gap:'8px', paddingRight:'0.5rem' }}>
                                                                <div style={{ flex:1, height:'6px', background:'#f1f5f9', borderRadius:'3px', overflow:'hidden' }}><div style={{ height:'100%', width:attainPct+'%', background:attainColor, borderRadius:'3px' }} /></div>
                                                                <span style={{ fontSize:'0.75rem', fontWeight:'700', color:attainColor, minWidth:'36px', textAlign:'right' }}>{quota > 0 ? attainPct.toFixed(1)+'%' : '—'}</span>
                                                            </div>

                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* ── Footer total ── */}
                                {filteredReps.length > 0 && (
                                    <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', padding:'10px 1.5rem', background:'#f8fafc', borderTop:'1px solid #e2e8f0', alignItems:'center' }}>
                                        <div style={{ fontSize:'0.6875rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                                            {viewerIsAdmin && terrFilter !== 'all' ? `${terrFilter} total` : 'Total assigned'}
                                        </div>
                                        <div style={{ fontSize:'1rem', fontWeight:'700', color:'#1e293b' }}>${filteredTotal.toLocaleString()}</div>
                                        <div />

                                    </div>
                                )}
                            </div>

                            {/* ── COMMISSION PLAN + PREVIEW ─────────────── */}
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.5rem' }}>
                                <div style={smCard}>
                                    <div style={smHdr}>
                                        <div>
                                            <div style={smTitle}>Commission Plan</div>
                                            <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:'0.125rem' }}>Tiered rates applied to all reps based on quota attainment %</div>
                                        </div>
                                    </div>
                                    <div style={{ padding:'1.25rem 1.5rem' }}>
                                        {((settings.quotaData||{}).commissionTiers||[]).map((tier, idx) => (
                                            <div key={idx} style={{ display:'flex', gap:'0.5rem', marginBottom:'0.625rem', alignItems:'center', padding:'0.5rem 0.75rem', background:'#f8fafc', borderRadius:'10px', border:'1px solid #f1f3f5' }}>
                                                <input type="number" value={tier.minPercent}
                                                    onChange={e => { const t=[...(settings.quotaData||{}).commissionTiers||[]]; t[idx]={...t[idx],minPercent:parseFloat(e.target.value)||0}; setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:t}})); }}
                                                    style={{ width:'60px', padding:'0.4rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.8125rem', textAlign:'center', fontFamily:'inherit', background:'#fff', outline:'none' }}
                                                    onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
                                                <span style={{ color:'#94a3b8', fontSize:'0.6875rem', fontWeight:'600', flexShrink:0 }}>% to</span>
                                                <input type="number" value={tier.maxPercent >= 999 ? '' : tier.maxPercent} placeholder="∞"
                                                    onChange={e => { const t=[...(settings.quotaData||{}).commissionTiers||[]]; t[idx]={...t[idx],maxPercent:parseFloat(e.target.value)||999}; setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:t}})); }}
                                                    style={{ width:'60px', padding:'0.4rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.8125rem', textAlign:'center', fontFamily:'inherit', background:'#fff', outline:'none' }}
                                                    onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
                                                <span style={{ color:'#94a3b8', fontSize:'0.6875rem', fontWeight:'600', flexShrink:0 }}>% →</span>
                                                <input type="number" value={tier.rate}
                                                    onChange={e => { const t=[...(settings.quotaData||{}).commissionTiers||[]]; t[idx]={...t[idx],rate:parseFloat(e.target.value)||0}; setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:t}})); }}
                                                    style={{ width:'60px', padding:'0.4rem', border:'1.5px solid #e2e8f0', borderRadius:'8px', fontSize:'0.8125rem', textAlign:'center', fontFamily:'inherit', background:'#fff', outline:'none' }}
                                                    onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
                                                <span style={{ color:'#94a3b8', fontSize:'0.6875rem', fontWeight:'600', flexShrink:0 }}>% rate</span>
                                                {((settings.quotaData||{}).commissionTiers||[]).length > 1 && (
                                                    <button onClick={() => setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:(prev.quotaData||{}).commissionTiers.filter((_,i)=>i!==idx)}}))}
                                                        style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'1.125rem', padding:'0 0.25rem', opacity:0.6, marginLeft:'auto' }}
                                                        onMouseEnter={e=>e.target.style.opacity='1'} onMouseLeave={e=>e.target.style.opacity='0.6'}>×</button>
                                                )}
                                            </div>
                                        ))}
                                        <button onClick={() => setSettings(prev=>({...prev,quotaData:{...prev.quotaData,commissionTiers:[...((prev.quotaData||{}).commissionTiers||[]),{minPercent:0,maxPercent:999,rate:0}]}}))}
                                            style={{ marginTop:'0.375rem', background:'#f8fafc', border:'1.5px dashed #cbd5e1', borderRadius:'10px', padding:'0.5rem 1rem', cursor:'pointer', fontSize:'0.75rem', fontWeight:'700', color:'#475569', fontFamily:'inherit', width:'100%' }}
                                            onMouseEnter={e=>{e.target.style.background='#f1f5f9';e.target.style.borderColor='#94a3b8';}}
                                            onMouseLeave={e=>{e.target.style.background='#f8fafc';e.target.style.borderColor='#cbd5e1';}}>
                                            + Add Tier
                                        </button>
                                    </div>
                                </div>

                                {/* Commission Preview by rep */}
                                <div style={smCard}>
                                    <div style={smHdr}>
                                        <div style={smTitle}>Commission Preview by Rep</div>
                                        <button onClick={() => {
                                            const smActiveSpiffs2 = (settings.spiffs||[]).filter(s => s.active);
                                            const hasSmSpiffs2 = smActiveSpiffs2.length > 0;
                                            const hdrs = ['Rep','Territory','Quota','50%','75%','100%','125%','150%',...(hasSmSpiffs2?['+SPIFFs (est @100%)']:[])];
                                            const rows = allReps.filter(u => getRepTotal(u) > 0).map(u => {
                                                const tq = getRepTotal(u);
                                                const spiffEst = smActiveSpiffs2.reduce((tot,s) => {
                                                    const amt = parseFloat(s.amount)||0;
                                                    if (s.type==='flat') return tot+amt;
                                                    if (s.type==='pct') return tot+tq*amt/100;
                                                    if (s.type==='multiplier') return tot+calcCommission(tq,tq)*(amt-1);
                                                    return tot;
                                                },0);
                                                return [u.name, u.territory||'—', tq,
                                                    ...[50,75,100,125,150].map(p=>Math.round(calcCommission((p/100)*tq,tq))),
                                                    ...(hasSmSpiffs2?[Math.round(spiffEst)]:[])];
                                            });
                                            const esc = v => `"${String(v).replace(/"/g,'""')}"`;
                                            const csv = [hdrs.map(esc).join(','), ...rows.map(r=>r.map(esc).join(','))].join('\n');
                                            const blob = new Blob([csv],{type:'text/csv'});
                                            const url = URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href=url; a.download='commission-preview.csv'; a.click(); URL.revokeObjectURL(url);
                                        }} style={{ background:'#f1f5f9', border:'1px solid #e2e8f0', borderRadius:'6px', padding:'0.25rem 0.625rem', fontSize:'0.6875rem', fontWeight:'600', color:'#475569', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap', transition:'background 0.15s', flexShrink:0 }} onMouseEnter={e=>e.currentTarget.style.background='#e2e8f0'} onMouseLeave={e=>e.currentTarget.style.background='#f1f5f9'}>📤 Export CSV</button>
                                    </div>
                                    <div style={{ padding:'1.25rem 1.5rem' }}>
                                        {(() => {
                                            const smActiveSpiffs = (settings.spiffs||[]).filter(s => s.active);
                                            const hasSmSpiffs = smActiveSpiffs.length > 0;
                                            const colSpanTotal = 2 + 5 + (hasSmSpiffs ? 1 : 0);
                                            return (
                                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8125rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom:'2px solid #e2e8f0' }}>
                                                    <th style={{ textAlign:'left', padding:'0.5rem 0', fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.04em' }}>Rep</th>
                                                    <th style={{ textAlign:'left', padding:'0.5rem 0.375rem', fontSize:'0.625rem', fontWeight:'700', color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.04em' }}>Territory</th>
                                                    {[50,75,100,125,150].map(p => (
                                                        <th key={p} style={{ textAlign:'right', padding:'0.5rem 0.375rem', fontSize:'0.625rem', fontWeight:'700', color: p===100 ? '#2563eb' : '#94a3b8', textTransform:'uppercase', letterSpacing:'0.04em' }}>{p}%</th>
                                                    ))}
                                                    {hasSmSpiffs && <th style={{ textAlign:'right', padding:'0.5rem 0.375rem', fontSize:'0.625rem', fontWeight:'700', color:'#7c3aed', textTransform:'uppercase', letterSpacing:'0.04em' }}>+SPIFFs</th>}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {allReps.filter(u => getRepTotal(u) > 0)
                                                    .sort((a,b) => (a.territory||'').localeCompare(b.territory||''))
                                                    .map((u, i, arr) => {
                                                        const tq = getRepTotal(u);
                                                        const showTerrHeader = i === 0 || u.territory !== arr[i-1].territory;
                                                        // Estimate SPIFF at 100% attainment (1 deal avg)
                                                        const spiffAt100 = smActiveSpiffs.reduce((tot, s) => {
                                                            const amt = parseFloat(s.amount)||0;
                                                            if (s.type === 'flat') return tot + amt;
                                                            if (s.type === 'pct') return tot + tq * amt / 100;
                                                            if (s.type === 'multiplier') return tot + calcCommission(tq, tq) * (amt - 1);
                                                            return tot;
                                                        }, 0);
                                                        return (
                                                            <React.Fragment key={u.id}>
                                                                {showTerrHeader && (
                                                                    <tr>
                                                                        <td colSpan={colSpanTotal} style={{ padding:'0.5rem 0 0.25rem', fontSize:'0.625rem', fontWeight:'800', color:'#64748b', textTransform:'uppercase', letterSpacing:'0.08em', borderTop: i > 0 ? '1px solid #e2e8f0' : 'none' }}>
                                                                            📍 {u.territory}
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                                <tr style={{ borderBottom:'1px solid #f8fafc' }}>
                                                                    <td style={{ padding:'0.375rem 0 0.375rem 0.75rem', fontWeight:'600', color:'#1e293b' }}>{u.name}</td>
                                                                    <td style={{ padding:'0.375rem 0.375rem', color:'#94a3b8', fontSize:'0.75rem' }}>{u.territory}</td>
                                                                    {[50,75,100,125,150].map(p => {
                                                                        const comm = calcCommission((p/100)*tq, tq);
                                                                        return (
                                                                            <td key={p} style={{ textAlign:'right', padding:'0.375rem 0.375rem', fontWeight: p===100 ? '800' : '500', color: p===100 ? '#2563eb' : p>100 ? '#10b981' : '#475569' }}>
                                                                                ${Math.round(comm).toLocaleString()}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                    {hasSmSpiffs && (
                                                                        <td style={{ textAlign:'right', padding:'0.375rem 0.375rem', fontWeight:'600', color:'#7c3aed', fontSize:'0.75rem' }} title="Estimated SPIFF at 100% attainment">
                                                                            +${Math.round(spiffAt100).toLocaleString()}
                                                                        </td>
                                                                    )}
                                                                </tr>
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                {allReps.every(u => getRepTotal(u) === 0) && (
                                                    <tr><td colSpan={colSpanTotal} style={{ padding:'1.5rem 0', color:'#94a3b8', textAlign:'center' }}>Set quotas to see commission projections.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                            );
                                        })()}
                                        {(settings.spiffs||[]).filter(s=>s.active).length > 0 && (
                                            <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'0.5rem' }}>* SPIFF column shows estimated bonus at 100% attainment</div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ── SPIFF Claims ── */}
                            <div style={smCard}>
                                <div style={smHdr}>
                                    <div>
                                        <div style={smTitle}>SPIFF Claims</div>
                                        <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:'0.125rem' }}>Review and approve SPIFF claims submitted by reps</div>
                                    </div>
                                    <div style={{ display:'flex', gap:'0.375rem' }}>
                                        {['all','pending','approved','rejected','paid'].map(s => (
                                            <button key={s} onClick={() => setSettings(prev => ({ ...prev, _spiffClaimFilter: s }))}
                                                style={{ padding:'0.2rem 0.5rem', borderRadius:'999px', border:'none', cursor:'pointer', fontSize:'0.625rem', fontWeight:'700', fontFamily:'inherit',
                                                    background: (settings._spiffClaimFilter||'pending') === s ? '#2563eb' : '#e2e8f0',
                                                    color: (settings._spiffClaimFilter||'pending') === s ? '#fff' : '#64748b' }}>
                                                {s.charAt(0).toUpperCase()+s.slice(1)}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div style={{ padding:'1.25rem 1.5rem' }}>
                                    {(() => {
                                        const filter = settings._spiffClaimFilter || 'pending';
                                        const filtered = spiffClaims.filter(c => filter === 'all' || c.status === filter)
                                            .sort((a,b) => new Date(b.claimedAt) - new Date(a.claimedAt));
                                        if (filtered.length === 0) return (
                                            <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.8125rem', background:'#f8fafc', borderRadius:'8px', border:'1.5px dashed #e2e8f0' }}>
                                                No {filter === 'all' ? '' : filter} SPIFF claims yet.
                                            </div>
                                        );
                                        return (
                                            <div style={{ display:'flex', flexDirection:'column', gap:'0' }}>
                                                {filtered.map((claim, ci) => (
                                                    <div key={claim.id} style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.625rem 0', borderBottom: ci < filtered.length-1 ? '1px solid #f1f5f9' : 'none', flexWrap:'wrap' }}>
                                                        <div style={{ flex:1, minWidth:0 }}>
                                                            <div style={{ fontWeight:'600', fontSize:'0.8125rem', color:'#1e293b' }}>{claim.spiffName}</div>
                                                            <div style={{ fontSize:'0.6875rem', color:'#94a3b8', marginTop:'1px' }}>
                                                                {claim.repName} · {claim.opportunityName} · {claim.account}
                                                                <span style={{ marginLeft:'0.5rem' }}>{new Date(claim.claimedAt).toLocaleDateString()}</span>
                                                            </div>
                                                        </div>
                                                        <div style={{ fontWeight:'700', color: claim.spiffType==='multiplier'?'#7c3aed':'#059669', fontSize:'0.875rem', flexShrink:0 }}>
                                                            {claim.spiffType==='multiplier' ? `${claim.multiplier}×` : `$${claim.amount.toLocaleString()}`}
                                                        </div>
                                                        <span style={{ fontSize:'0.625rem', padding:'2px 7px', borderRadius:'999px', fontWeight:'700', flexShrink:0,
                                                            background: claim.status==='approved'?'#d1fae5':claim.status==='rejected'?'#fee2e2':claim.status==='paid'?'#dbeafe':'#fef3c7',
                                                            color: claim.status==='approved'?'#065f46':claim.status==='rejected'?'#dc2626':claim.status==='paid'?'#1e40af':'#92400e' }}>
                                                            {claim.status.toUpperCase()}
                                                        </span>
                                                        {claim.status === 'pending' && (
                                                            <div style={{ display:'flex', gap:'0.25rem', flexShrink:0 }}>
                                                                <button onClick={() => setSpiffClaims(prev => prev.map(c => c.id===claim.id ? {...c, status:'approved', approvedAt:new Date().toISOString(), approvedBy:currentUser} : c))}
                                                                    style={{ padding:'0.2rem 0.625rem', background:'#10b981', color:'#fff', border:'none', borderRadius:'5px', fontSize:'0.6875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>✓ Approve</button>
                                                                <button onClick={() => setSpiffClaims(prev => prev.map(c => c.id===claim.id ? {...c, status:'rejected', approvedAt:new Date().toISOString(), approvedBy:currentUser} : c))}
                                                                    style={{ padding:'0.2rem 0.625rem', background:'#ef4444', color:'#fff', border:'none', borderRadius:'5px', fontSize:'0.6875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit' }}>✕ Reject</button>
                                                            </div>
                                                        )}
                                                        {claim.status === 'approved' && (
                                                            <button onClick={() => setSpiffClaims(prev => prev.map(c => c.id===claim.id ? {...c, status:'paid', paidAt:new Date().toISOString()} : c))}
                                                                style={{ padding:'0.2rem 0.625rem', background:'#2563eb', color:'#fff', border:'none', borderRadius:'5px', fontSize:'0.6875rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>💳 Mark Paid</button>
                                                        )}
                                                        {(claim.status === 'rejected' || claim.status === 'paid') && (
                                                            <button onClick={() => { if (window.confirm('Remove this claim?')) setSpiffClaims(prev => prev.filter(c => c.id !== claim.id)); }}
                                                                style={{ background:'none', border:'none', color:'#94a3b8', cursor:'pointer', fontSize:'0.875rem', padding:'0', lineHeight:1, flexShrink:0 }}>×</button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* ── SPIFF Board ── */}
                            <div style={smCard}>
                                <div style={smHdr}>
                                    <div>
                                        <div style={smTitle}>SPIFF Board</div>
                                        <div style={{ fontSize:'0.75rem', color:'#94a3b8', marginTop:'0.125rem' }}>One-time incentive bonuses for specific deals, products, or behaviors</div>
                                    </div>
                                    <button onClick={() => setSettings(prev => ({ ...prev, spiffs: [...(prev.spiffs||[]), { id: 'spiff_'+Date.now(), name: '', amount: '', type: 'flat', condition: '', active: true }] }))}
                                        style={{ padding:'0.3rem 0.75rem', background:'#2563eb', color:'#fff', border:'none', borderRadius:'6px', fontSize:'0.75rem', fontWeight:'700', cursor:'pointer', fontFamily:'inherit', whiteSpace:'nowrap' }}>+ Add SPIFF</button>
                                </div>
                                <div style={{ padding:'1.25rem 1.5rem' }}>
                                    {(settings.spiffs||[]).length === 0 ? (
                                        <div style={{ textAlign:'center', padding:'2rem', color:'#94a3b8', fontSize:'0.8125rem', background:'#f8fafc', borderRadius:'8px', border:'1.5px dashed #e2e8f0' }}>
                                            No SPIFFs defined yet. Click + Add SPIFF to create your first incentive.
                                        </div>
                                    ) : (
                                        <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
                                            {(settings.spiffs||[]).map((spiff, si) => (
                                                <div key={spiff.id} style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:'10px', padding:'0.75rem 1rem', display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                                                    <div style={{ display:'flex', gap:'0.5rem', alignItems:'center', flexWrap:'wrap' }}>
                                                        <input type="text" value={spiff.name} placeholder="SPIFF name (e.g. Q1 New Logo Bonus)"
                                                            onChange={e => setSettings(prev => ({ ...prev, spiffs: (prev.spiffs||[]).map((s,i) => i===si ? {...s, name: e.target.value} : s) }))}
                                                            style={{ flex: 2, minWidth:'160px', padding:'0.375rem 0.625rem', border:'1.5px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', background:'#fff', outline:'none' }}
                                                            onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
                                                        <select value={spiff.type}
                                                            onChange={e => setSettings(prev => ({ ...prev, spiffs: (prev.spiffs||[]).map((s,i) => i===si ? {...s, type: e.target.value} : s) }))}
                                                            style={{ padding:'0.375rem 0.5rem', border:'1.5px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', background:'#fff', cursor:'pointer', outline:'none' }}>
                                                            <option value="flat">Flat $ bonus</option>
                                                            <option value="pct">% of deal ARR</option>
                                                            <option value="multiplier">Commission multiplier</option>
                                                        </select>
                                                        <input type="number" value={spiff.amount} placeholder={spiff.type==='multiplier'?'e.g. 1.5':spiff.type==='pct'?'e.g. 5':'e.g. 500'}
                                                            onChange={e => setSettings(prev => ({ ...prev, spiffs: (prev.spiffs||[]).map((s,i) => i===si ? {...s, amount: e.target.value} : s) }))}
                                                            style={{ width:'90px', padding:'0.375rem 0.5rem', border:'1.5px solid #e2e8f0', borderRadius:'6px', fontSize:'0.8125rem', fontFamily:'inherit', background:'#fff', textAlign:'right', outline:'none' }}
                                                            onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
                                                        <span style={{ fontSize:'0.75rem', color:'#94a3b8', flexShrink:0 }}>{spiff.type==='flat'?'$':spiff.type==='pct'?'%':'×'}</span>
                                                        <label style={{ display:'flex', alignItems:'center', gap:'4px', cursor:'pointer', flexShrink:0 }}>
                                                            <input type="checkbox" checked={!!spiff.active} onChange={e => setSettings(prev => ({ ...prev, spiffs: (prev.spiffs||[]).map((s,i) => i===si ? {...s, active: e.target.checked} : s) }))} style={{ accentColor:'#2563eb' }} />
                                                            <span style={{ fontSize:'0.75rem', color:'#64748b' }}>Active</span>
                                                        </label>
                                                        <button onClick={() => showConfirm(`Remove SPIFF "${spiff.name||'this SPIFF'}"?`, () => setSettings(prev => ({ ...prev, spiffs: (prev.spiffs||[]).filter((_,i)=>i!==si) })))}
                                                            style={{ background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'1rem', padding:'0', lineHeight:1, marginLeft:'auto' }}>×</button>
                                                    </div>
                                                    <div style={{ display:'flex', alignItems:'center', gap:'0.375rem' }}>
                                                        <span style={{ fontSize:'0.6875rem', color:'#94a3b8', flexShrink:0 }}>Condition:</span>
                                                        <input type="text" value={spiff.condition} placeholder="e.g. New logo deal, Product X included, Deal > $50K..."
                                                            onChange={e => setSettings(prev => ({ ...prev, spiffs: (prev.spiffs||[]).map((s,i) => i===si ? {...s, condition: e.target.value} : s) }))}
                                                            style={{ flex:1, padding:'0.3rem 0.625rem', border:'1.5px solid #e2e8f0', borderRadius:'6px', fontSize:'0.75rem', fontFamily:'inherit', background:'#fff', outline:'none' }}
                                                            onFocus={e=>e.target.style.borderColor='#2563eb'} onBlur={e=>e.target.style.borderColor='#e2e8f0'} />
                                                    </div>
                                                    <div style={{ fontSize:'0.6875rem', color:'#2563eb', background:'#eff6ff', padding:'4px 8px', borderRadius:'4px', display:'inline-block' }}>
                                                        {spiff.type==='flat' ? `Pays $${parseFloat(spiff.amount||0).toLocaleString()} per qualifying deal` : spiff.type==='pct' ? `Pays ${spiff.amount||0}% of deal ARR` : `Multiplies commission by ${spiff.amount||1}×`}
                                                        {!spiff.active && <span style={{ color:'#94a3b8', marginLeft:'6px' }}>(inactive)</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            </>
                        );
                    })()}
                </div>
            
    );
}
