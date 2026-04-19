import React from 'react';
import { useApp } from '../AppContext';

// ── Tokens — exact match to TOKENS in Funnel Redesign mockup ─
const T = {
    bg:           '#f0ece4',
    surface:      '#fbf8f3',
    surface2:     '#f5efe3',
    border:       '#e6ddd0',
    borderStrong: '#d4c8b4',
    ink:          '#2a2622',
    inkMid:       '#5a544c',
    inkMuted:     '#8a8378',
    gold:         '#c8b99a',
    goldInk:      '#7a6a48',
    danger:       '#9c3a2e',
    warn:         '#b87333',
    ok:           '#4d6b3d',
    // Stage colors — from TOKENS.stages in mockup
    stages: {
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
    },
    sans:  '"Plus Jakarta Sans", system-ui, sans-serif',
    serif: '"Source Serif 4", Georgia, serif',
    rSm: 3,
    rMd: 4,
};

const sc = (stage) => T.stages[stage] || T.inkMuted;

const fmtARR = (n) => {
    n = parseFloat(n) || 0;
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n.toLocaleString();
};

const relativeDay = (dateStr) => {
    if (!dateStr) return '—';
    const diff = Math.round((new Date(dateStr + 'T12:00:00') - new Date()) / 86400000);
    if (diff === 0) return 'today';
    if (diff < 0) return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (diff <= 14) return `${diff}d`;
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const eyebrowStyle = (color) => ({
    fontSize: 11, fontWeight: 600,
    color: color || T.inkMuted,
    letterSpacing: 0.8, textTransform: 'uppercase',
    fontFamily: T.sans,
});

// Arrow-right icon
const ArrowRIcon = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14M13 6l6 6-6 6"/>
    </svg>
);
const ChevronRight = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6"/>
    </svg>
);
const ChevronDown = () => (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9l6 6 6-6"/>
    </svg>
);
const AlertIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.danger} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l10 17H2L12 3z"/><path d="M12 10v5M12 18v.5" strokeWidth="1.8"/>
    </svg>
);

// ── FV1StageRow — direct translation of FV1StageRow from mockup ─
function StageRow({ sd, idx, total, prevCount, widthPct, color, expanded, onToggle, onEditDeal }) {
    const H = 58;
    const maxW = 560;
    const w = Math.max(80, widthPct * maxW);
    const dropPct = prevCount > 0 && idx > 0 ? (1 - sd.count / prevCount) : null;

    const today = new Date();

    return (
        <div style={{
            borderBottom: idx === total - 1 ? 'none' : `1px solid ${T.border}`,
            background: expanded ? 'rgba(200,185,154,0.08)' : 'transparent',
            transition: 'background 120ms',
        }}>
            {/* Main row */}
            <div onClick={onToggle} style={{
                display: 'grid', gridTemplateColumns: '170px 1fr 260px',
                alignItems: 'center', cursor: 'pointer', padding: '4px 0',
            }}>
                {/* Left: stage label */}
                <div style={{ paddingLeft: 24, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {expanded ? <ChevronDown/> : <ChevronRight/>}
                    <div>
                        <div style={{ fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: T.inkMuted, fontWeight: 600, marginBottom: 3, fontFamily: T.sans }}>
                            Stage {idx + 1}
                        </div>
                        <div style={{ fontFamily: T.serif, fontSize: 19, fontStyle: 'italic', color: T.ink, lineHeight: 1 }}>
                            {sd.stage}
                        </div>
                    </div>
                </div>

                {/* Center: trapezoid funnel slice */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', height: H + 20 }}>
                    <div style={{
                        width: w,
                        height: H,
                        background: color,
                        // First stage: full trapezoid. Rest: narrower trapezoid. Matches mockup exactly.
                        clipPath: idx === 0
                            ? 'polygon(0 0, 100% 0, 92% 100%, 8% 100%)'
                            : 'polygon(8% 0, 92% 0, 84% 100%, 16% 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fbf8f3',
                    }}>
                        <div style={{ textAlign: 'center', lineHeight: 1.1 }}>
                            <div style={{ fontSize: 20, fontWeight: 700, fontFamily: T.sans, letterSpacing: -0.3 }}>
                                {sd.count}
                            </div>
                            <div style={{ fontSize: 10, opacity: 0.8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                deals
                            </div>
                        </div>
                    </div>
                    {/* Drop % badge — only shown when >30% drop, matches mockup */}
                    {dropPct !== null && dropPct > 0.3 && (
                        <div style={{
                            position: 'absolute', right: -16, top: -4,
                            fontSize: 10, fontWeight: 700,
                            color: T.danger, letterSpacing: 0.4,
                            fontFamily: T.sans,
                        }}>
                            −{Math.round(dropPct * 100)}%
                        </div>
                    )}
                </div>

                {/* Right: value + velocity */}
                <div style={{ paddingRight: 24, textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: T.ink, letterSpacing: -0.3, fontFamily: T.sans }}>
                        {fmtARR(sd.value)}
                    </div>
                    <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2, fontFamily: T.sans }}>
                        avg{' '}
                        <span style={{ color: sd.avgDays > 21 ? T.danger : T.inkMid, fontWeight: 500 }}>
                            {sd.avgDays}d
                        </span>
                        {' '}in stage
                    </div>
                </div>
            </div>

            {/* Expanded deal list — matches mockup grid exactly */}
            {expanded && (
                <div style={{ padding: '4px 24px 14px 52px', background: 'rgba(251,248,243,0.5)' }}>
                    {sd.deals.length === 0 ? (
                        <div style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic', padding: '8px 0', fontFamily: T.sans }}>
                            No deals in this stage.
                        </div>
                    ) : (
                        <>
                            {/* Column headers */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1.6fr 100px 90px 100px 110px',
                                gap: 12, padding: '6px 10px',
                                borderBottom: `1px solid ${T.border}`,
                            }}>
                                {['Deal', 'ARR', 'In stage', 'Close', ''].map((h, i) => (
                                    <div key={i} style={{ ...eyebrowStyle(T.inkMuted), fontSize: 10, textAlign: i >= 1 && i <= 3 ? 'right' : 'left' }}>
                                        {h}
                                    </div>
                                ))}
                            </div>
                            {/* Deal rows */}
                            {sd.deals.map(opp => {
                                const days = Math.round((today - new Date(opp.stageChangedDate + 'T12:00:00')) / 86400000);
                                const stale = days > 14;
                                const closeDays = opp.forecastedCloseDate
                                    ? Math.round((new Date(opp.forecastedCloseDate + 'T12:00:00') - today) / 86400000)
                                    : null;
                                const overdue = closeDays !== null && closeDays < 0;
                                return (
                                    <div key={opp.id} style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1.6fr 100px 90px 100px 110px',
                                        gap: 12, padding: '8px 10px', alignItems: 'center',
                                        borderBottom: `1px solid ${T.border}`,
                                        fontFamily: T.sans, cursor: 'pointer',
                                        transition: 'background 100ms',
                                    }}
                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,185,154,0.08)'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        onClick={() => onEditDeal(opp)}>
                                        {/* Deal name + account */}
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {opp.opportunityName || opp.account}
                                            </div>
                                            <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {opp.account}
                                            </div>
                                        </div>
                                        {/* ARR */}
                                        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                            {fmtARR(opp.arr)}
                                        </div>
                                        {/* Days in stage */}
                                        <div style={{ fontSize: 12, color: stale ? T.danger : T.inkMid, fontWeight: stale ? 600 : 400, textAlign: 'right' }}>
                                            {days}d
                                        </div>
                                        {/* Close date */}
                                        <div style={{ fontSize: 12, color: overdue ? T.danger : T.inkMid, fontWeight: overdue ? 600 : 400, textAlign: 'right' }}>
                                            {relativeDay(opp.forecastedCloseDate)}
                                        </div>
                                        {/* Advance button — GhostBtn from mockup */}
                                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={e => { e.stopPropagation(); onEditDeal(opp); }}
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 5,
                                                    padding: '5px 10px', background: 'transparent',
                                                    border: `1px solid ${T.border}`, color: T.ink,
                                                    fontSize: 12, fontWeight: 500, borderRadius: T.rSm,
                                                    cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap',
                                                    transition: 'background 120ms',
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <ArrowRIcon/> Advance
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Main FunnelView — direct translation of FV1Home from mockup ─
export default function FunnelView({
    pipelineFilteredOpps,
    funnelExpandedStage,
    setFunnelExpandedStage,
    handleEdit,
    handleDelete,
}) {
    const { stages, settings, activities } = useApp();

    // Multi-expand state — matches mockup's expandedStages object
    const [expandedStages, setExpandedStages] = React.useState({});

    // Sync with funnelExpandedStage prop (single-stage expand from PipelineTab)
    React.useEffect(() => {
        if (funnelExpandedStage) {
            setExpandedStages(prev => ({ ...prev, [funnelExpandedStage]: true }));
        }
    }, [funnelExpandedStage]);

    const today = new Date();

    // Build stage data — mirrors FV1Home stageData computation
    const visibleStages = stages.filter(s => s !== 'Closed Lost');
    const stageData = visibleStages.map(s => {
        const deals = pipelineFilteredOpps.filter(o => o.stage === s);
        const avgDays = deals.length === 0 ? 0 : Math.round(
            deals.reduce((sum, d) => {
                const days = d.stageChangedDate
                    ? Math.round((today - new Date(d.stageChangedDate + 'T12:00:00')) / 86400000)
                    : 0;
                return sum + days;
            }, 0) / deals.length
        );
        return {
            stage: s,
            count: deals.length,
            value: deals.reduce((sum, d) => sum + (parseFloat(d.arr) || 0), 0),
            avgDays,
            deals,
        };
    });

    const maxCount = Math.max(...stageData.map(s => s.count), 1);

    // Stalled deals — open deals with no stage change in 14+ days
    const allStuck = pipelineFilteredOpps.filter(o => {
        if (['Closed Won', 'Closed Lost'].includes(o.stage)) return false;
        if (!o.stageChangedDate) return false;
        const days = Math.round((today - new Date(o.stageChangedDate + 'T12:00:00')) / 86400000);
        return days > 14;
    }).sort((a, b) => new Date(a.stageChangedDate) - new Date(b.stageChangedDate));

    const totalPipeline = stageData.reduce((s, d) => s + d.value, 0);
    const totalCount    = stageData.reduce((s, d) => s + d.count, 0);
    const topStage      = stageData[0];
    const bottomStage   = stageData[stageData.length - 1];
    const topToBottomConv = topStage && topStage.count > 0
        ? Math.round((bottomStage.count / topStage.count) * 100)
        : 0;

    const anyExpanded = Object.values(expandedStages).some(Boolean);

    const toggleStage = (stage) => {
        setExpandedStages(prev => ({ ...prev, [stage]: !prev[stage] }));
        // keep PipelineTab's single-expand state in sync
        setFunnelExpandedStage(expandedStages[stage] ? null : stage);
    };
    const expandAll   = () => setExpandedStages(Object.fromEntries(visibleStages.map(s => [s, true])));
    const collapseAll = () => { setExpandedStages({}); setFunnelExpandedStage(null); };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, fontFamily: T.sans, color: T.ink }}>

            {/* ── Page subtitle row (inside funnel view, below view tabs) ── */}
            <div style={{ padding: '0 32px 6px', fontSize: 12, color: T.inkMuted, lineHeight: 1.4 }}>
                <span style={{ fontWeight: 600, color: T.ink }}>{totalCount}</span> open deals
                <span style={{ margin: '0 8px', color: T.border }}>·</span>
                <span style={{ fontWeight: 600, color: T.ink }}>{fmtARR(totalPipeline)}</span> in flight
                <span style={{ margin: '0 8px', color: T.border }}>·</span>
                <span style={{ fontWeight: 600, color: T.ink }}>{topToBottomConv}%</span> top-to-close conversion
            </div>

            {/* ── Collapse all / Expand all row ── */}
            <div style={{ padding: '0 32px 0', display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                <button onClick={anyExpanded ? collapseAll : expandAll}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.inkMid, fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontFamily: T.sans }}>
                    {anyExpanded ? <ChevronDown/> : <ChevronRight/>}
                    {anyExpanded ? 'Collapse all' : 'Expand all'}
                </button>
            </div>

            {/* ── Main body: two-column grid (funnel + right rail) ── */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 300px', minHeight: 0, overflow: 'hidden' }}>

                {/* LEFT: funnel rows + conversion strip */}
                <div style={{ padding: '20px 0 0', minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                    <div style={{ padding: '0 20px' }}>
                        {stageData.map((sd, i) => (
                            <StageRow
                                key={sd.stage}
                                sd={sd}
                                idx={i}
                                total={stageData.length}
                                prevCount={i > 0 ? stageData[i - 1].count : sd.count}
                                widthPct={maxCount > 0 ? sd.count / maxCount : 0}
                                color={sc(sd.stage)}
                                expanded={!!expandedStages[sd.stage]}
                                onToggle={() => toggleStage(sd.stage)}
                                onEditDeal={handleEdit}
                            />
                        ))}
                    </div>

                    {/* Conversion strip — stage-to-stage percentages */}
                    <div style={{
                        margin: '16px 24px 16px',
                        padding: '14px 18px',
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        borderRadius: T.rSm,
                    }}>
                        <div style={{ ...eyebrowStyle(T.goldInk), marginBottom: 10 }}>
                            Stage-to-stage conversion
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            {stageData.slice(0, -1).map((sd, i) => {
                                const next = stageData[i + 1];
                                const conv = sd.count === 0 ? 0 : Math.round((next.count / sd.count) * 100);
                                const leak = conv < 50;
                                return (
                                    <React.Fragment key={sd.stage}>
                                        <div style={{
                                            flex: 1, textAlign: 'center', padding: '6px 4px',
                                            background: leak ? 'rgba(156,58,46,0.08)' : 'transparent',
                                            borderRadius: T.rSm,
                                        }}>
                                            <div style={{ fontSize: 18, fontWeight: 600, color: leak ? T.danger : T.ink, letterSpacing: -0.3, fontFamily: T.sans }}>
                                                {conv}%
                                            </div>
                                            <div style={{ fontSize: 10, color: T.inkMuted, marginTop: 2, letterSpacing: 0.3, lineHeight: 1.3, fontFamily: T.sans }}>
                                                {sd.stage.slice(0, 4)} → {next.stage.slice(0, 4)}
                                            </div>
                                        </div>
                                        {i < stageData.length - 2 && (
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M9 6l6 6-6 6"/>
                                            </svg>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* RIGHT: stalled deals rail */}
                <div style={{
                    borderLeft: `1px solid ${T.border}`,
                    background: T.surface,
                    padding: '20px 18px',
                    overflowY: 'auto',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                        <AlertIcon/>
                        <div style={{ ...eyebrowStyle(T.danger) }}>
                            {allStuck.length} stalled deal{allStuck.length !== 1 ? 's' : ''}
                        </div>
                    </div>
                    <div style={{ fontSize: 11, color: T.inkMuted, marginBottom: 14, lineHeight: 1.5, fontFamily: T.sans }}>
                        Open deals with no stage change in 14+ days.
                    </div>
                    {allStuck.length === 0 ? (
                        <div style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>
                            No stalled deals — pipeline is moving.
                        </div>
                    ) : (
                        allStuck.slice(0, 10).map(opp => {
                            const days = Math.round((today - new Date(opp.stageChangedDate + 'T12:00:00')) / 86400000);
                            return (
                                <div key={opp.id}
                                    style={{ padding: '10px 0', borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}
                                    onClick={() => handleEdit(opp)}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,185,154,0.06)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, lineHeight: 1.3, fontFamily: T.sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                            {(opp.opportunityName || opp.account).split(' — ')[0]}
                                        </div>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: T.danger, whiteSpace: 'nowrap', fontFamily: T.sans }}>
                                            {days}d
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: sc(opp.stage) }}/>
                                            <span style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>{opp.stage}</span>
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: T.ink, fontFamily: T.sans, fontVariantNumeric: 'tabular-nums' }}>
                                            {fmtARR(opp.arr)}
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
