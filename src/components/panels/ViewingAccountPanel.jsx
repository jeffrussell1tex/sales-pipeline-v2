import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useApp } from '../../AppContext';
import { dbFetch } from '../../utils/storage';
import { useDraggable, useResizable } from '../../hooks/useDraggable';
import ActivityModal from '../modals/ActivityModal';
import ResizeHandles from '../../hooks/ResizeHandles';



export default function ViewingAccountPanel({
    setEditingOpp, setShowModal,
    setEditingContact, setShowContactModal,
    setEditingAccount, setEditingSubAccount, setShowAccountModal,
    setEditingTask, setShowTaskModal,
    setEditingActivity,
    setShowCsvImportModal, setShowLeadImportModal, setShowOutlookImportModal,
    setShowSpiffClaimModal, setSpiffClaimContext,
    setShowShortcuts,
}) {
    const {
        opportunities, accounts, contacts, tasks, activities, settings,
        currentUser, userRole, canSeeAll,
        getStageColor, calculateDealHealth, getQuarter, getQuarterLabel,
        showConfirm, softDelete, addAudit,
        setShowActivityModal,
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
        meetingPrepOpen, setMeetingPrepOpen, setMeetingPrepEvent, setMeetingPrepOppId,
        accShowAllClosed, setAccShowAllClosed,
        accShowAllContacts, setAccShowAllContacts,
    } = useApp();

    const isReadOnly = userRole === 'ReadOnly';
    const canEdit = !isReadOnly;

    // V1 stage color map — desaturated warm tones, left-border accent only for badges
    const STAGE_COLORS = {
        'Prospecting':        '#b0a088',
        'Qualification':      '#c8a978',
        'Discovery':          '#b07a55',
        'Evaluation (Demo)':  '#b07a55',
        'Proposal':           '#b87333',
        'Negotiation':        '#7a5a3c',
        'Negotiation/Review': '#7a5a3c',
        'Contracts':          '#4d6b3d',
        'Closing':            '#4d6b3d',
        'Closed Won':         '#3a5530',
        'Closed Lost':        '#9c3a2e',
    };
    const getStageBadgeStyle = (stage) => {
        const c = STAGE_COLORS[stage] || '#8a8378';
        return {
            display: 'inline-block',
            padding: '0.2rem 0.625rem',
            borderRadius: 3,
            fontSize: '0.6875rem',
            fontWeight: 600,
            fontFamily: 'inherit',
            background: c + '22',
            color: c,
            border: `1px solid ${c}44`,
        };
    };
    // Reset any stale global activity modal state when this panel mounts
    useEffect(() => { setShowActivityModal(false); }, []);

        const { dragHandleProps, dragOffsetStyle, overlayStyle, clickCatcherStyle, containerRef, zIndex } = useDraggable({ transparent: meetingPrepOpen });
    const [panelActivityContext, setPanelActivityContext] = useState(null);
    const { size, getResizeHandleProps } = useResizable(860, 600, 520, 400);

    const handleEditContact = (c) => { setEditingContact(c); setShowContactModal(true); };
    const handleEditAccount = (a, isSub) => {
        if (isSub) { setEditingSubAccount(a); setEditingAccount(null); }
        else        { setEditingAccount(a); setEditingSubAccount(null); }
        setShowAccountModal(true);
    };
    const handleEditTask    = (t) => { setEditingTask(t); setShowTaskModal(true); };
    const handleEditOpp     = (o) => { setEditingOpp(o); setShowModal(true); };

    const [panelTab, setPanelTab] = React.useState(
        () => localStorage.getItem('panel:account:tab') || 'overview'
    );
    const switchPanelTab = (t) => { setPanelTab(t); localStorage.setItem('panel:account:tab', t); };

    const panelTabStyle = (t) => ({
        padding: '0.5rem 1.25rem',
        border: 'none',
        borderBottom: panelTab === t ? '2px solid #3a5a7a' : '2px solid transparent',
        background: 'transparent',
        color: panelTab === t ? '#3a5a7a' : '#8a8378',
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
                width:  size.w,
                height: size.h,
                minWidth:  520,
                minHeight: 400,
                display: 'flex',
                flexDirection: 'column',
                background: '#fbf8f3',
                borderRadius: '12px',
                boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
                border: '1px solid #e6ddd0',
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
                    borderRadius: '12px 12px 0 0',
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
                        onClick={() => setPanelActivityContext({ companyName: acc.name })}
                        style={{ height: '32px', padding: '0 0.875rem', borderRadius: '8px', border: '1px solid #c8b99a', background: '#c8b99a', color: '#7a6a48', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 0 rgba(0,0,0,0.15) inset' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#d4c8a8'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#c8b99a'; e.currentTarget.style.boxShadow = '0 1px 0 rgba(0,0,0,0.15) inset'; }}
                        onMouseDown={e => { e.currentTarget.style.background = '#bca984'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2) inset'; }}
                        onMouseUp={e => { e.currentTarget.style.background = '#d4c8a8'; e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.2)'; }}
                        title="Log activity"
                    >
                        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                            stroke="#7a6a48" strokeWidth="1.6" strokeLinecap="round">
                            <path d="M8 3v10M3 8h10" />
                        </svg>
                        Log activity
                    </button>
                    {openOpps.length > 0 && (
                        <button
                            onClick={() => { setMeetingPrepEvent({ summary: acc.name, start: { date: new Date().toISOString().split('T')[0] }, attendeeCount: 0 }); setMeetingPrepOppId(openOpps[0].id); setMeetingPrepOpen(true); }}
                            style={{ height: '32px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#f5f1eb', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
                            title="Meeting prep"
                        >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"
                                stroke="#f5f1eb" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="10" height="11" rx="1.5"/>
                                <path d="M6 2.5h4v2H6z" fill="#f5f1eb" stroke="none"/>
                                <path d="M6 8h4M6 11h3"/>
                            </svg>
                            Prep
                        </button>
                    )}
                    <button
                        onClick={() => { setViewingAccount(null); handleEditAccount(acc); }}
                        style={{ height: '32px', padding: '0 0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#f5f1eb', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Edit Account</button>
                    <span style={{ fontSize: '0.6875rem', color: 'rgba(245,241,235,0.35)', fontWeight: '500', letterSpacing: '0.03em', marginLeft: '0.25rem' }}>⠿ drag</span>
                </div>
            </div>

            {/* ── Sub-tab row ── */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e6ddd0', background: '#fbf8f3', flexShrink: 0, paddingLeft: '0.25rem' }}>
                <button style={panelTabStyle('overview')} onClick={() => switchPanelTab('overview')}>Overview</button>
                <button style={panelTabStyle('account_info')} onClick={() => switchPanelTab('account_info')}>Account Info</button>
            </div>

            {/* ── Scrollable body ── */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '1.25rem 1.5rem', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}>

                {panelTab === 'overview' && (<>
                {/* Account metadata + sub-accounts */}
                {(acc.verticalMarket || acc.country) && (
                    <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', padding: '1.25rem 1.5rem', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        {(acc.verticalMarket || acc.country) && (
                            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', fontSize: '0.875rem' }}>
                                {acc.verticalMarket && (
                                    <div>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Vertical</div>
                                        <div style={{ color: '#2a2622', fontWeight: '500' }}>{acc.verticalMarket}</div>
                                    </div>
                                )}
                                {acc.country && (
                                    <div>
                                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Country</div>
                                        <div style={{ color: '#2a2622', fontWeight: '500' }}>{acc.country}</div>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                )}

                {/* KPI cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
                    {[
                        { value: allOpenOpps.length,  sub: hasSubs && openOpps.length !== allOpenOpps.length ? `${openOpps.length} direct` : null, label: 'Active Opps',   accent: '#3a5a7a', textColor: '#2a2622', subColor: '#7a6a48' },
                        { value: allWonOpps.length,   sub: hasSubs && wonOpps.length  !== allWonOpps.length  ? `${wonOpps.length} direct`  : null, label: 'Won',          accent: '#4d6b3d', textColor: '#2e4a24', subColor: '#4d6b3d' },
                        { value: '$' + (totalPipeline >= 1000 ? Math.round(totalPipeline / 1000) + 'K' : totalPipeline.toLocaleString()), sub: hasSubs && pv !== totalPipeline ? `$${pv >= 1000 ? Math.round(pv / 1000) + 'K' : pv.toLocaleString()} direct` : null, label: hasSubs ? 'Total Pipeline' : 'Pipeline', accent: '#b87333', textColor: '#6b4820', subColor: '#7a6a48' },
                        { value: totalContacts.length, sub: hasSubs && accContacts.length !== totalContacts.length ? `${accContacts.length} direct` : null, label: 'Contacts', accent: '#8b5cf6', textColor: '#5a4a7a', subColor: '#5a4a7a' },
                    ].map(({ value, sub, label, accent, textColor, subColor }) => (
                        <div key={label} style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', padding: '1rem', textAlign: 'center', borderLeft: `4px solid ${accent}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                            <div style={{ fontSize: '1.75rem', fontWeight: '800', color: textColor, lineHeight: 1.1 }}>{value}</div>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: subColor, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '0.25rem' }}>{label}</div>
                            {sub     && <div style={{ fontSize: '0.5625rem', color: '#8a8378', marginTop: '0.2rem', fontWeight: '500' }}>{sub}</div>}
                            {hasSubs && <div style={{ fontSize: '0.5625rem', color: accent,    marginTop: '0.1rem', fontWeight: '600', opacity: 0.7 }}>incl. {subs.length} sub{subs.length > 1 ? 's' : ''}</div>}
                        </div>
                    ))}
                </div>

                {/* Won Revenue banner */}
                {hasSubs && totalWonValue > 0 && (
                    <div style={{ background: 'linear-gradient(135deg, #2e4a24, #4d6b3d)', borderRadius: '10px', padding: '1rem 1.5rem', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Won Revenue (Parent + All Subs)</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#fbf8f3', marginTop: '0.125rem' }}>${totalWonValue.toLocaleString()}</div>
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
                <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e6ddd0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#2a2622' }}>
                            Open Opportunities ({allOpenOpps.length})
                            {hasSubs && allOpenOpps.length !== openOpps.length && <span style={{ fontSize: '0.75rem', color: '#8a8378', fontWeight: '500', marginLeft: '0.5rem' }}>across all business units & sites</span>}
                        </h3>
                        {totalPipeline > 0 && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#7a6a48' }}>${totalPipeline >= 1000 ? Math.round(totalPipeline / 1000) + 'K' : totalPipeline.toLocaleString()} pipeline</span>}
                    </div>
                    {allOpenOpps.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#8a8378', fontSize: '0.875rem' }}>No open opportunities</div>
                    ) : (
                        <div>
                            <div style={{ display: 'grid', gridTemplateColumns: hasSubs ? '1fr 120px 130px 100px 90px' : '1fr 130px 110px 100px', padding: '0.5rem 1.5rem', background: '#fbf8f3', borderBottom: '1px solid #f1f3f5', fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <span>Opportunity</span>{hasSubs && <span>Account</span>}<span>Stage</span><span style={{ textAlign: 'right' }}>Revenue</span><span style={{ textAlign: 'center' }}>Close</span>
                            </div>
                            {[...allOpenOpps].sort((a, b) => new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999')).map((opp, idx) => {
                                const isSubOpp = opp.account && opp.account.toLowerCase() !== accName;
                                return (
                                    <div key={opp.id}
                                        style={{ display: 'grid', gridTemplateColumns: hasSubs ? '1fr 120px 130px 100px 90px' : '1fr 130px 110px 100px', padding: '0.625rem 1.5rem', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem', alignItems: 'center', background: idx % 2 === 0 ? '#fbf8f3' : '#fafbfc', cursor: 'pointer' }}
                                        onClick={() => { setViewingAccount(null); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(opp); setShowModal(true); }, 150); }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f5efe3'}
                                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fbf8f3' : '#fafbfc'}
                                    >
                                        <div>
                                            <div style={{ fontWeight: '600', color: '#2a2622' }}>{opp.opportunityName || 'Unnamed'}</div>
                                            {opp.salesRep && <div style={{ fontSize: '0.75rem', color: '#8a8378' }}>{opp.salesRep}</div>}
                                        </div>
                                        {hasSubs && <span style={{ fontSize: '0.6875rem', color: isSubOpp ? '#3a5a7a' : '#8a8378', fontWeight: isSubOpp ? '700' : '400' }}>{isSubOpp ? '↳ ' : ''}{opp.account}</span>}
                                        <span style={getStageBadgeStyle(opp.stage)}>{opp.stage}</span>
                                        <span style={{ textAlign: 'right', fontWeight: '700', color: '#2a2622' }}>${(parseFloat(opp.arr) || 0).toLocaleString()}</span>
                                        <span style={{ textAlign: 'center', color: '#8a8378', fontSize: '0.8125rem' }}>{opp.forecastedCloseDate ? new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Closed Opportunities */}
                <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e6ddd0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#2a2622' }}>
                            Closed Opportunities ({allClosedOpps.length})
                        </h3>
                        {totalWonValue > 0 && !hasSubs && <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#4d6b3d' }}>Won: ${wonValue.toLocaleString()}</span>}
                    </div>
                    {allClosedOpps.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#8a8378', fontSize: '0.875rem' }}>No closed opportunities</div>
                    ) : (
                        <div>
                            {[...allClosedOpps].sort((a, b) => new Date(b.forecastedCloseDate || '0') - new Date(a.forecastedCloseDate || '0')).slice(0, accShowAllClosed ? allClosedOpps.length : CLOSED_LIMIT).map((opp, idx) => {
                                const isWon    = opp.stage === 'Closed Won';
                                const isSubOpp = opp.account && opp.account.toLowerCase() !== accName;
                                return (
                                    <div key={opp.id}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 1.5rem', borderBottom: '1px solid #f1f3f5', background: idx % 2 === 0 ? '#fbf8f3' : '#fafbfc', cursor: 'pointer' }}
                                        onClick={() => { setViewingAccount(null); setActiveTab('pipeline'); setTimeout(() => { setEditingOpp(opp); setShowModal(true); }, 150); }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f5efe3'}
                                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fbf8f3' : '#fafbfc'}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: '600', color: '#2a2622', fontSize: '0.875rem' }}>{opp.opportunityName || 'Unnamed'}</div>
                                            <div style={{ fontSize: '0.75rem', color: isSubOpp ? '#3a5a7a' : '#8a8378' }}>{isSubOpp ? `↳ ${opp.account}` : (opp.salesRep || '')}</div>
                                        </div>
                                        <span style={{ ...getStageBadgeStyle(opp.stage), marginRight: '1rem' }}>{opp.stage}</span>
                                        <span style={{ fontWeight: '700', color: '#2a2622', fontSize: '0.875rem', minWidth: '80px', textAlign: 'right' }}>${(parseFloat(opp.arr) || 0).toLocaleString()}</span>
                                    </div>
                                );
                            })}
                            {allClosedOpps.length > CLOSED_LIMIT && (
                                <div style={{ padding: '0.75rem 1.5rem', textAlign: 'center', borderTop: '1px solid #e6ddd0' }}>
                                    <button onClick={() => setAccShowAllClosed(!accShowAllClosed)}
                                        style={{ background: 'none', border: 'none', color: '#3a5a7a', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                    >{accShowAllClosed ? 'Show Less' : `See More (${allClosedOpps.length - CLOSED_LIMIT} more)`}</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Contacts */}
                <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e6ddd0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#2a2622' }}>
                            Contacts ({totalContacts.length})
                            {hasSubs && totalContacts.length !== accContacts.length && <span style={{ fontSize: '0.75rem', color: '#8a8378', fontWeight: '500', marginLeft: '0.5rem' }}>across all business units & sites</span>}
                        </h3>
                    </div>
                    {totalContacts.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#8a8378', fontSize: '0.875rem' }}>No contacts linked to this account</div>
                    ) : (
                        <div>
                            {[...totalContacts].sort((a, b) => ((a.lastName || '') + (a.firstName || '')).localeCompare((b.lastName || '') + (b.firstName || ''))).slice(0, accShowAllContacts ? totalContacts.length : CONTACT_LIMIT).map((c, idx) => {
                                const isSubContact = c.company && c.company.toLowerCase() !== accName;
                                return (
                                    <div key={c.id}
                                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 1rem', borderBottom: '1px solid #f1f3f5', cursor: 'pointer', background: idx % 2 === 0 ? '#fbf8f3' : '#fafbfc' }}
                                        onClick={() => { setViewingAccount(null); setActiveTab('contacts'); setTimeout(() => setViewingContact(c), 100); }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f5efe3'}
                                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? '#fbf8f3' : '#fafbfc'}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: '700', color: '#3a5a7a', fontSize: '0.75rem', whiteSpace: 'nowrap', minWidth: '130px' }}>{c.firstName} {c.lastName}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#8a8378', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{c.title || ''}</div>
                                            {isSubContact && <span style={{ fontSize: '0.625rem', color: '#3a5a7a', fontWeight: '700', background: 'rgba(58,90,122,0.1)', padding: '0.05rem 0.35rem', borderRadius: '3px', flexShrink: 0 }}>↳ {c.company}</span>}
                                        </div>
                                        <div style={{ display: 'flex', gap: '1rem', flexShrink: 0, alignItems: 'center' }}>
                                            {c.email && <div style={{ fontSize: '0.75rem', color: '#8a8378' }}>{c.email}</div>}
                                            {c.phone && <div style={{ fontSize: '0.75rem', color: '#8a8378' }}>{c.phone}</div>}
                                        </div>
                                    </div>
                                );
                            })}
                            {totalContacts.length > CONTACT_LIMIT && (
                                <div style={{ padding: '0.75rem 1.5rem', textAlign: 'center', borderTop: '1px solid #e6ddd0' }}>
                                    <button onClick={() => setAccShowAllContacts(!accShowAllContacts)}
                                        style={{ background: 'none', border: 'none', color: '#3a5a7a', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}
                                    >{accShowAllContacts ? 'Show Less' : `See More (${totalContacts.length - CONTACT_LIMIT} more)`}</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                </>)}

                {panelTab === 'account_info' && (
                    <div style={{ background: '#fbf8f3', border: '1px solid #e6ddd0', borderRadius: '10px', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

                            {/* Company Name + Assigned Rep — side by side */}
                            <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                                <div>
                                    <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Company Name</div>
                                    <div style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#2a2622' }}>{acc.name || '—'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Assigned Rep</div>
                                    <div style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#2a2622' }}>{acc.assignedRep || acc.accountOwner || <span style={{ fontWeight: 400, color: '#8a8378' }}>—</span>}</div>
                                </div>
                            </div>

                            {/* Address */}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Address</div>
                                <div style={{ fontSize: '0.875rem', color: '#2a2622', lineHeight: 1.5 }}>
                                    {acc.address || acc.address2 || acc.city || acc.state || acc.zip || acc.country ? (<>
                                        {acc.address  && <div>{acc.address}</div>}
                                        {acc.address2 && <div>{acc.address2}</div>}
                                        {(acc.city || acc.state || acc.zip) && <div>{[acc.city, acc.state, acc.zip].filter(Boolean).join(', ')}</div>}
                                        {acc.country  && <div>{acc.country}</div>}
                                    </>) : <span style={{ color: '#8a8378' }}>—</span>}
                                </div>
                            </div>

                            {/* Phone */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Phone</div>
                                <div style={{ fontSize: '0.875rem', color: '#2a2622' }}>{acc.phone || <span style={{ color: '#8a8378' }}>—</span>}</div>
                            </div>

                            {/* Website */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Website</div>
                                {acc.linkedInUrl ? (
                                    <a href={/^https?:\/\//i.test(acc.linkedInUrl) ? acc.linkedInUrl : 'https://' + acc.linkedInUrl}
                                        target="_blank" rel="noopener noreferrer"
                                        style={{ fontSize: '0.875rem', color: '#3a5a7a', textDecoration: 'none', wordBreak: 'break-all' }}
                                        onMouseEnter={e => e.target.style.textDecoration = 'underline'}
                                        onMouseLeave={e => e.target.style.textDecoration = 'none'}
                                    >{acc.linkedInUrl}</a>
                                ) : <span style={{ fontSize: '0.875rem', color: '#8a8378' }}>—</span>}
                            </div>

                            {/* Company Description — full width */}
                            {acc.description && (
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Company Description</div>
                                    <div style={{ fontSize: '0.875rem', color: '#2a2622', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{acc.description}</div>
                                </div>
                            )}

                            {/* Total Employees */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Total Employees</div>
                                <div style={{ fontSize: '0.875rem', color: '#2a2622' }}>
                                    {acc.totalEmployees
                                        ? Number(String(acc.totalEmployees).replace(/,/g, '')).toLocaleString('en-US')
                                        : <span style={{ color: '#8a8378' }}>—</span>}
                                </div>
                            </div>

                            {/* Annual Revenue */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Annual Revenue</div>
                                <div style={{ fontSize: '0.875rem', color: '#2a2622' }}>
                                    {acc.annualRevenue
                                        ? '$' + Number(String(acc.annualRevenue).replace(/,/g, '')).toLocaleString('en-US')
                                        : <span style={{ color: '#8a8378' }}>—</span>}
                                </div>
                            </div>

                            {/* Fiscal Year End */}
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8a8378', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem' }}>Fiscal Year End</div>
                                <div style={{ fontSize: '0.875rem', color: '#2a2622' }}>
                                    {acc.fiscalYearEnd
                                        ? new Date(2000, parseInt(acc.fiscalYearEnd, 10) - 1, 1).toLocaleString('en-US', { month: 'long' })
                                        : <span style={{ color: '#8a8378' }}>—</span>}
                                </div>
                            </div>

                        </div>
                    </div>
                )}
            </div>

            <ResizeHandles getResizeHandleProps={getResizeHandleProps} />
        </div>

        {/* ActivityModal via Portal — renders at document.body to escape panel stacking context */}
        {panelActivityContext && ReactDOM.createPortal(
            <ActivityModal
                activity={null}
                opportunities={opportunities}
                contacts={contacts}
                accounts={accounts}
                initialContext={panelActivityContext}
                zIndexBase={zIndex + 1}
                onClose={() => setPanelActivityContext(null)}
                onSave={(activityData) => {
                    handleSaveActivity(activityData, {
                        editingActivity: null,
                        currentUser,
                        opportunities,
                        setShowActivityModal: () => setPanelActivityContext(null),
                        setFollowUpPrompt: () => {},
                        setQuickLogOpen: () => {},
                        setQuickLogForm: () => {},
                        setQuickLogContactResults: () => {},
                    });
                }}
                onSaveNewContact={(data) => {
                    const newId = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                    const nc = { ...data, id: newId, createdAt: new Date().toISOString() };
                    setContacts(prev => [...prev, nc]);
                    dbFetch('/.netlify/functions/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nc) })
                        .catch(err => console.error('inline contact save failed:', err));
                    return nc;
                }}
            />,
            document.body
        )}
        </>
    );
}
