import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '../../AppContext';
import { dbFetch } from '../../utils/storage';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ResizeHandles from '../../hooks/ResizeHandles';



export default function ViewingAccountPanel({
    setEditingOpp, setShowModal,
    setEditingContact, setShowContactModal,
    setEditingAccount, setEditingSubAccount, setShowAccountModal,
    setEditingTask, setShowTaskModal,
    setEditingActivity, setShowActivityModal, setActivityInitialContext,
    setShowCsvImportModal, setShowLeadImportModal, setShowOutlookImportModal,
    setShowSpiffClaimModal, setSpiffClaimContext,
    setShowShortcuts,
}) {
    const {
        opportunities, accounts, contacts, tasks, activities, settings,
        currentUser, userRole, canSeeAll,
        getStageColor, calculateDealHealth, getQuarter, getQuarterLabel,
        showConfirm, softDelete, addAudit,
        setActiveTab,
        handleDelete, handleSave,
        handleDeleteContact, handleSaveContact,
        handleDeleteTask, handleCompleteTask,
        handleSaveActivity, handleDeleteActivity,
        handleDeleteAccount, handleDeleteSubAccount, getSubAccounts, getAccountRollup,
        visibleOpportunities, stages,
        viewingContact, setViewingContact,
        viewingAccount, setViewingAccount,
        viewingTask, setViewingTask,
        setMeetingPrepOpen, setMeetingPrepEvent, setMeetingPrepOppId,
        accShowAllClosed, setAccShowAllClosed,
        accShowAllContacts, setAccShowAllContacts,
    } = useApp();

    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;
    const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherStyle, containerRef, isMobile } = useDraggable();
    const { size, getResizeHandleProps } = useResizable(860, 600, 520, 400);

    const handleEditContact = (c) => { setEditingContact(c); setShowContactModal(true); };
    const handleEditAccount = (a, isSub) => {
        if (isSub) { setEditingSubAccount(a); setEditingAccount(null); }
        else        { setEditingAccount(a); setEditingSubAccount(null); }
        setShowAccountModal(true);
    };
    const handleEditTask    = (t) => { setEditingTask(t); setShowTaskModal(true); };
    const handleEditOpp     = (o) => { setEditingOpp(o); setShowModal(true); };
    const handleAddActivity = (ctx) => { setActivityInitialContext(ctx || null); setEditingActivity(null); setShowActivityModal(true); };

    const [panelTab, setPanelTab] = React.useState(
        () => localStorage.getItem('panel:account:tab') || 'overview'
    );
    const switchPanelTab = (t) => { setPanelTab(t); localStorage.setItem('panel:account:tab', t); };

    const panelTabStyle = (t) => ({
        padding: '0.5rem 1.25rem',
        border: 'none',
        borderBottom: panelTab === t ? '2px solid #2563eb' : '2px solid transparent',
        background: 'transparent',
        color: panelTab === t ? '#2563eb' : '#64748b',
        fontWeight: panelTab === t ? '700' : '500',
        fontSize: '0.875rem',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
    });

    if (!viewingAccount) return null;

    const acc     = viewingAccount;
    const accName = acc.name.toLowerCase();
    const accOpps     = opportunities.filter(o => o.account && o.account.toLowerCase() === accName);
    const accContacts = contacts.filter(c => c.company && c.company.toLowerCase() === accName);
    const pv          = accOpps.reduce((sum, o) => sum + (parseFloat(o.arr) || 0), 0);
    const openOpps    = accOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
    const closedOpps  = accOpps.filter(o => o.stage === 'Closed Won' || o.stage === 'Closed Lost');
    const wonOpps     = accOpps.filter(o => o.stage === 'Closed Won');
    const wonValue    = wonOpps.reduce((sum, o) => sum + (parseFloat(o.arr) || 0) + (parseFloat(o.implementationCost) || 0), 0);

    const subs    = getSubAccounts(acc.id);
    const hasSubs = subs.length > 0;
    const rollup  = hasSubs ? getAccountRollup(acc) : null;

    const subData = subs.map(sub => {
        const sn        = sub.name.toLowerCase();
        const subOpps   = opportunities.filter(o => o.account && o.account.toLowerCase() === sn);
        const subOpen   = subOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
        const subWon    = subOpps.filter(o => o.stage === 'Closed Won');
        const subPipeline  = subOpen.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
        const subWonValue  = subWon.reduce((s, o) => s + (parseFloat(o.arr) || 0) + (parseFloat(o.implementationCost) || 0), 0);
        const subContacts  = contacts.filter(c => c.company && c.company.toLowerCase() === sn);
        return { sub, subOpps, subOpen, subWon, subPipeline, subWonValue, subContacts };
    });

    const allOpps       = hasSubs ? [...accOpps, ...subData.flatMap(d => d.subOpps)] : accOpps;
    const allOpenOpps   = allOpps.filter(o => o.stage !== 'Closed Won' && o.stage !== 'Closed Lost');
    const allClosedOpps = allOpps.filter(o => o.stage === 'Closed Won' || o.stage === 'Closed Lost');
    const allWonOpps    = allOpps.filter(o => o.stage === 'Closed Won');
    const totalPipeline = hasSubs ? rollup.pipeline : pv;
    const totalWonValue = hasSubs ? rollup.wonArr   : wonValue;
    const totalContacts = hasSubs ? rollup.allContacts : accContacts;

    const CLOSED_LIMIT  = 5;
    const CONTACT_LIMIT = 8;

    return (
        <>
        {/* Dimmed backdrop — click outside closes */}
        <div
            style={{ ...overlayStyle }}
        />
        <div style={clickCatcherStyle} />

        {/* Floating panel — fixed-positioned, draggable, resizable */}
        <div
            ref={containerRef}
            onClick={e => e.stopPropagation()}
            style={{
                ...dragOffsetStyle,
                width:  isMobile ? '100%' : size.w,
                height: isMobile ? '100%' : size.h,
                minWidth:  isMobile ? 'unset' : 520,
                minHeight: isMobile ? 'unset' : 400,
                display: 'flex',
                flexDirection: 'column',
                background: '#f8fafc',
                borderRadius: isMobile ? 0 : '12px',
                boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
            }}
        >
            {/* ── Drag-handle header ── */}
            <div
                {...dragHandleProps}
                style={{
                    ...dragHandleProps.style,
                    background: '#1c1917',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    padding: '0.875rem 1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: isMobile ? 0 : '12px 12px 0 0',
                    minHeight: '52px',
                    flexShrink: 0,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0, flex: 1 }}>
                    <button
                        onClick={() => setViewingAccount(null)}
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', fontWeight: '600', color: '#f5f1eb', fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap' }}
                    >← Back</button>
                    <div style={{ minWidth: 0 }}>
                        <h1 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: '700', color: '#f5f1eb', userSelect: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</h1>
                        {(acc.verticalMarket || acc.city || acc.state) && (
                            <div style={{ fontSize: '0.75rem', color: 'rgba(245,241,235,0.55)', marginTop: '0.125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {[acc.verticalMarket, [acc.city, acc.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                            </div>
                        )}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'center' }}>
                    <button
                        onClick={() => { setActivityInitialContext({ companyName: acc.name }); setEditingActivity(null); setShowActivityModal(true); }}
                        style={{ height: '32px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)', color: '#f5f1eb', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                        title="Quick log activity">⚡ Log</button>
                    {openOpps.length > 0 && (
                        <button
                            onClick={() => { setMeetingPrepEvent({ summary: acc.name, start: { date: new Date().toISOString().split('T')[0] }, attendeeCount: 0 }); setMeetingPrepOppId(openOpps[0].id); setMeetingPrepOpen(true); }}
                            style={{ height: '32px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#f5f1eb', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                            title="Meeting prep">📋 Prep</button>
                    )}
                    <button
                        onClick={() => { setViewingAccount(null); handleEditAccount(acc); }}
                        style={{ height: '32px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#f5f1eb', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Edit Account</button>
                    <span style={{ fontSize: '0.6875rem', color: 'rgba(245,241,235,0.35)', fontWeight: '500', letterSpacing: '0.03em', marginLeft: '0.25rem' }}>⠿ drag</span>
                </div>
            </div>

            {/* ── Sub-tab row ── */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', background: '#ffffff', flexShrink: 0, paddingLeft: '0.25rem' }}>
                <button style={panelTabStyle('overview')} onClick={() => switchPanelTab('overview')}>Overview</button>
                <button style={panelTabStyle('account_info')} onClick={() => switchPanelTab('account_info')}>Account Info</button>
            </div>

            {/* ── Scrollable body ── */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>

                {panelTab === 'overview' && (<>
                {/* Account metadata + sub-accounts */}
                {(acc.verticalMarket || acc.country || hasSubs) && (
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.25rem 1.5rem', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        {(acc.verticalMarket || acc.country) && (
                            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.875rem', marginBottom: hasSubs ? '1rem' : 0, paddingBottom: hasSubs ? '1rem' : 0, borderBottom: hasSubs ? '1px solid #f1f3f5' : 'none' }}>
                                {acc.verticalMarket && (
                                    <div>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Vertical</div>
                                        <div style={{ color: '#1e293b', fontWeight: '500' }}>{acc.verticalMarket}</div>
                                    </div>
                                )}
                                {acc.country && (
                                    <div>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Country</div>
                                        <div style={{ color: '#1e293b', fontWeight: '500' }}>{acc.country}</div>
                                    </div>
                                )}
                            </div>
                        )}
                        {hasSubs && (
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Sub-Accounts ({subs.length})</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {subData.map(({ sub, subOpen, subWon, subPipeline, subContacts }) => (
                                        <div key={sub.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '0.5rem' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>↳</span>
                                                <span style={{ fontWeight: '700', color: '#4338ca', fontSize: '0.875rem', cursor: 'pointer' }}
                                                    onClick={() => setViewingAccount(sub)}
                                                    onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                                    onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                                >{sub.name}</span>
                                                {sub.accountOwner && <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{sub.accountOwner}</span>}
                                            </div>
                                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                {subOpen.length > 0    && <span style={{ background: '#dbeafe', color: '#1e40af', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{subOpen.length} active</span>}
                                                {subWon.length > 0     && <span style={{ background: '#dcfce7', color: '#166534', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{subWon.length} won</span>}
                                                {subPipeline > 0       && <span style={{ background: '#fef3c7', color: '#92400e', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>${subPipeline >= 1000 ? Math.round(subPipeline / 1000) + 'K' : subPipeline.toLocaleString()} pipeline</span>}
                                                {subContacts.length > 0 && <span style={{ background: '#f3e8ff', color: '#6b21a8', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{subContacts.length} contacts</span>}
                                                {subOpen.length === 0 && subWon.length === 0 && <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontStyle: 'italic' }}>No opportunities</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* KPI cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    {[
                        { value: allOpenOpps.length,  sub: hasSubs && openOpps.length !== allOpenOpps.length ? `${openOpps.length} direct` : null, label: 'Active Opps',   accent: '#2563eb', textColor: '#1e40af', subColor: '#3b82f6' },
                        { value: allWonOpps.length,   sub: hasSubs && wonOpps.length  !== allWonOpps.length  ? `${wonOpps.length} direct`  : null, label: 'Won',          accent: '#16a34a', textColor: '#166534', subColor: '#16a34a' },
                        { value: '$' + (totalPipeline >= 1000 ? Math.round(totalPipeline / 1000) + 'K' : totalPipeline.toLocaleString()), sub: hasSubs && pv !== totalPipeline ? `$${pv >= 1000 ? Math.round(pv / 1000) + 'K' : pv.toLocaleString()} direct` : null, label: hasSubs ? 'Total Pipeline' : 'Pipeline', accent: '#f59e0b', textColor: '#92400e', subColor: '#b45309' },
                        { value: totalContacts.length, sub: hasSubs && accContacts.length !== totalContacts.length ? `${accContacts.length} direct` : null, label: 'Contacts', accent: '#8b5cf6', textColor: '#6b21a8', subColor: '#9333ea' },
                    ].map(({ value, sub, label, accent, textColor, subColor }) => (
                        <div key={label} style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', textAlign: 'center', borderLeft: `4px solid ${accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                            <div style={{ fontSize: '1.75rem', fontWeight: '800', color: textColor, lineHeight: 1.1 }}>{value}</div>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: subColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>{label}</div>
                            {sub     && <div style={{ fontSize: '0.5625rem', color: '#94a3b8', marginTop: '0.2rem', fontWeight: '500' }}>{sub}</div>}
                            {hasSubs && <div style={{ fontSize: '0.5625rem', color: accent,    marginTop: '0.1rem', fontWeight: '600', opacity: 0.7 }}>incl. {subs.length} sub{subs.length > 1 ? 's' : ''}</div>}
                        </div>
                    ))}
                </div>

                {/* Won Revenue banner */}
                {hasSubs && totalWonValue > 0 && (
                    <div style={{ background: 'linear-gradient(135deg, #166534, #16a34a)', borderRadius: '10px', padding: '1rem 1.5rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Won Revenue (Parent + All Subs)</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#ffffff', marginTop: '0.125rem' }}>${totalWonValue.toLocaleString()}</div>
                        </div>
                        {wonValue > 0 && wonValue !== totalWonValue && (
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.7)', fontWeight: '600' }}>This account direct</div>
                                <div style={{ fontSize: '1.125rem', fontWeight: '800', color: 'rgba(255,255,255,0.9)' }}>${wonValue.toLocaleString()}</div>
                            </div>
                        )}
                    </div>
                )}

                {/* Open Opportunities */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                            Open Opportunities ({allOpenOpps.length})
                            {hasSubs && allOpenOpps.length !== openOpps.length && <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500', marginLeft: '0.5rem' }}>across all business units & sites</span>}
                        </h3>
                        {totalPipeline > 0 && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#b45309' }}>${totalPipeline >= 1000 ? Math.round(totalPipeline / 1000) + 'K' : totalPipeline.toLocaleString()} pipeline</span>}
                    </div>
                    {allOpenOpps.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No open opportunities</div>
                    ) : (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: hasSubs ? '1fr 120px 130px 100px 90px' : '1fr 130px 110px 100px', padding: '0.5rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #f1f3f5', fontSize: '0.6875rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <span>Opportunity</span>{hasSubs && <span>Account</span>}<span>Stage</span><span style={{ textAlign: 'right' }}>Revenue</span><span style={{ textAlign: 'center' }}>Close</span>
                            </div>
                            {[...allOpenOpps].sort((a, b) => new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999')).map((opp, idx) => {
                                const sc = getStageColor(opp.stage);
                                const isSubOpp = opp.account && opp.account.toLowerCase() !== accName;
                                return (
                                    <div key={opp.id}
                                        style={{ display: 'grid', gridTemplateColumns: hasSubs ? '1fr 120px 130px 100px 90px' : '1fr 130px 110px 100px', padding: '0.625rem 1.5rem', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem', alignItems: 'center', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc', cursor: 'pointer' }}
                                        onClick={() => { setViewingAccount(null); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(opp); setShowModal(true); }, 150); }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                                    >
                                        <div>
                                            <div style={{ fontWeight: '600', color: '#1e293b' }}>{opp.opportunityName || 'Unnamed'}</div>
                                            {opp.salesRep && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{opp.salesRep}</div>}
                                        </div>
                                        {hasSubs && <span style={{ fontSize: '0.6875rem', color: isSubOpp ? '#4338ca' : '#64748b', fontWeight: isSubOpp ? '700' : '400' }}>{isSubOpp ? '↳ ' : ''}{opp.account}</span>}
                                        <span style={{ background: sc.bg, color: sc.text, padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700' }}>{opp.stage}</span>
                                        <span style={{ textAlign: 'right', fontWeight: '700', color: '#1e293b' }}>${(parseFloat(opp.arr) || 0).toLocaleString()}</span>
                                        <span style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8125rem' }}>{opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Closed Opportunities */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                            Closed Opportunities ({allClosedOpps.length})
                        </h3>
                        {totalWonValue > 0 && !hasSubs && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#16a34a' }}>Won: ${wonValue.toLocaleString()}</span>}
                    </div>
                    {allClosedOpps.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No closed opportunities</div>
                    ) : (
                        <div>
                            {[...allClosedOpps].sort((a, b) => new Date(b.forecastedCloseDate || '0') - new Date(a.forecastedCloseDate || '0')).slice(0, accShowAllClosed ? allClosedOpps.length : CLOSED_LIMIT).map((opp, idx) => {
                                const isWon    = opp.stage === 'Closed Won';
                                const isSubOpp = opp.account && opp.account.toLowerCase() !== accName;
                                return (
                                    <div key={opp.id}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 1.5rem', borderBottom: '1px solid #f1f3f5', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc', cursor: 'pointer' }}
                                        onClick={() => { setViewingAccount(null); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(opp); setShowModal(true); }, 150); }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.875rem' }}>{opp.opportunityName || 'Unnamed'}</div>
                                            <div style={{ fontSize: '0.75rem', color: isSubOpp ? '#4338ca' : '#94a3b8' }}>{isSubOpp ? `↳ ${opp.account}` : (opp.salesRep || '')}</div>
                                        </div>
                                        <span style={{ background: isWon ? '#dcfce7' : '#fef2f2', color: isWon ? '#166534' : '#991b1b', padding: '0.2rem 0.625rem', borderRadius: '4px', fontSize: '0.6875rem', fontWeight: '700', marginRight: '1rem' }}>{opp.stage}</span>
                                        <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '0.875rem', minWidth: '80px', textAlign: 'right' }}>${(parseFloat(opp.arr) || 0).toLocaleString()}</span>
                                    </div>
                                );
                            })}
                            {allClosedOpps.length > CLOSED_LIMIT && (
                                <div style={{ padding: '0.75rem 1.5rem', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
                                    <button onClick={() => setAccShowAllClosed(!accShowAllClosed)}
                                        style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                    >{accShowAllClosed ? 'Show Less' : `See More (${allClosedOpps.length - CLOSED_LIMIT} more)`}</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Contacts */}
                <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>
                            Contacts ({totalContacts.length})
                            {hasSubs && totalContacts.length !== accContacts.length && <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: '500', marginLeft: '0.5rem' }}>across all business units & sites</span>}
                        </h3>
                    </div>
                    {totalContacts.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem' }}>No contacts linked to this account</div>
                    ) : (
                        <div>
                            {[...totalContacts].sort((a, b) => ((a.lastName || '') + (a.firstName || '')).localeCompare((b.lastName || '') + (b.firstName || ''))).slice(0, accShowAllContacts ? totalContacts.length : CONTACT_LIMIT).map((c, idx) => {
                                const isSubContact = c.company && c.company.toLowerCase() !== accName;
                                return (
                                    <div key={c.id}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 1rem', borderBottom: '1px solid #f1f3f5', cursor: 'pointer', background: idx % 2 === 0 ? '#ffffff' : '#fafbfc' }}
                                        onClick={() => { setViewingAccount(null); setActiveTab('contacts'); setTimeout(() => setViewingContact(c), 100); }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafbfc'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: '700', color: '#2563eb', fontSize: '0.75rem', whiteSpace: 'nowrap', minWidth: '130px' }}>{c.firstName} {c.lastName}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.title || ''}</div>
                                            {isSubContact && <span style={{ fontSize: '0.625rem', color: '#4338ca', fontWeight: '700', background: '#e0e7ff', padding: '0.05rem 0.35rem', borderRadius: '3px', flexShrink: 0 }}>↳ {c.company}</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '1rem', flexShrink: 0, alignItems: 'center' }}>
                                            {c.email && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.email}</div>}
                                            {c.phone && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{c.phone}</div>}
                                        </div>
                                    </div>
                                );
                            })}
                            {totalContacts.length > CONTACT_LIMIT && (
                                <div style={{ padding: '0.75rem 1.5rem', textAlign: 'center', borderTop: '1px solid #e2e8f0' }}>
                                    <button onClick={() => setAccShowAllContacts(!accShowAllContacts)}
                                        style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                    >{accShowAllContacts ? 'Show Less' : `See More (${totalContacts.length - CONTACT_LIMIT} more)`}</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                </>)}

                {panelTab === 'account_info' && (
                    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

                            {/* Company Name — full width */}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Company Name</div>
                                <div style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#1e293b' }}>{acc.name || '—'}</div>
                            </div>

                            {/* Address */}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Address</div>
                                <div style={{ fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.5 }}>
                                    {acc.address || acc.address2 || acc.city || acc.state || acc.zip || acc.country ? (<>
                                        {acc.address  && <div>{acc.address}</div>}
                                        {acc.address2 && <div>{acc.address2}</div>}
                                        {(acc.city || acc.state || acc.zip) && <div>{[acc.city, acc.state, acc.zip].filter(Boolean).join(', ')}</div>}
                                        {acc.country  && <div>{acc.country}</div>}
                                    </>) : <span style={{ color: '#94a3b8' }}>—</span>}
                                </div>
                            </div>

                            {/* Phone */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Phone</div>
                                <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>{acc.phone || <span style={{ color: '#94a3b8' }}>—</span>}</div>
                            </div>

                            {/* Website */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Website</div>
                                {acc.linkedInUrl ? (
                                    <a href={/^https?:\/\//i.test(acc.linkedInUrl) ? acc.linkedInUrl : 'https://' + acc.linkedInUrl}
                                        target="_blank" rel="noopener noreferrer"
                                        style={{ fontSize: '0.875rem', color: '#2563eb', textDecoration: 'none', wordBreak: 'break-all' }}
                                        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                        onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                    >{acc.linkedInUrl}</a>
                                ) : <span style={{ fontSize: '0.875rem', color: '#94a3b8' }}>—</span>}
                            </div>

                            {/* Company Description — full width */}
                            {acc.description && (
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Company Description</div>
                                    <div style={{ fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{acc.description}</div>
                                </div>
                            )}

                            {/* Total Employees */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Total Employees</div>
                                <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                                    {acc.totalEmployees
                                        ? Number(String(acc.totalEmployees).replace(/,/g, '')).toLocaleString('en-US')
                                        : <span style={{ color: '#94a3b8' }}>—</span>}
                                </div>
                            </div>

                            {/* Annual Revenue */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Annual Revenue</div>
                                <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                                    {acc.annualRevenue
                                        ? '$' + Number(String(acc.annualRevenue).replace(/,/g, '')).toLocaleString('en-US')
                                        : <span style={{ color: '#94a3b8' }}>—</span>}
                                </div>
                            </div>

                            {/* Fiscal Year End */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Fiscal Year End</div>
                                <div style={{ fontSize: '0.875rem', color: '#1e293b' }}>
                                    {acc.fiscalYearEnd
                                        ? new Date(2000, parseInt(acc.fiscalYearEnd, 10) - 1, 1).toLocaleString('en-US', { month: 'long' })
                                        : <span style={{ color: '#94a3b8' }}>—</span>}
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </div>

            <ResizeHandles getResizeHandleProps={getResizeHandleProps} />
        </div>
        </>
    );
}
