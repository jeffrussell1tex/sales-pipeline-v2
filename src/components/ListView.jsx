import React, { useState } from 'react';
import { useApp } from '../AppContext';

// ── Tokens — exact match to PipelineTab ──────────────────────
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
    sans:  '"Plus Jakarta Sans", system-ui, sans-serif',
    serif: 'Georgia, "Source Serif 4", serif',
    rSm: 3, rMd: 4, rLg: 6,
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
};

const stageColor = (s) => T.stages[s] || T.inkMuted;
const eyebrow = { fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans };

// ── Quarter helpers ───────────────────────────────────────────
// Uses forecastedCloseDate (production field name) not closeDate (mock field name)

function quarterOf(isoDate) {
    if (!isoDate) return null;
    const d = new Date(isoDate + 'T12:00:00');
    if (isNaN(d)) return null;
    const q = Math.floor(d.getMonth() / 3) + 1;
    const y = d.getFullYear();
    return { key: `${y}-Q${q}`, longLabel: `Q${q} ${y}`, year: y, q };
}

function quarterRange(year, q) {
    const start = new Date(year, (q - 1) * 3, 1);
    const end   = new Date(year, q * 3, 0);
    const fmt   = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
}

function groupByQuarter(opps) {
    const map = new Map();
    for (const o of opps) {
        const qk = quarterOf(o.forecastedCloseDate);
        if (!qk) continue; // skip opps with no close date
        if (!map.has(qk.key)) map.set(qk.key, { ...qk, opps: [] });
        map.get(qk.key).opps.push(o);
    }
    // Sort chronologically
    return [...map.values()].sort((a, b) => a.year - b.year || a.q - b.q);
}

function qSummary(opps) {
    const commitStages = ['Negotiation', 'Negotiation/Review', 'Contracts', 'Closing'];
    const total    = opps.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
    const weighted = opps.reduce((s, o) => s + (parseFloat(o.arr) || 0) * ((parseFloat(o.probability) || 0) / 100), 0);
    const commit   = opps.filter(o => commitStages.includes(o.stage)).reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
    return { total, weighted, commit, count: opps.length };
}

function fmtMoney(n) {
    if (!n) return '$0';
    return n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : '$' + Math.round(n / 1000) + 'K';
}

function relativeDay(isoDate) {
    if (!isoDate) return '—';
    const diff = Math.round((new Date(isoDate + 'T12:00:00') - new Date()) / 86400000);
    if (diff === 0)   return 'today';
    if (diff < 0)     return new Date(isoDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (diff <= 14)   return diff + 'd';
    return new Date(isoDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Stage pill ────────────────────────────────────────────────
function StagePill({ stage }) {
    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 7px',
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.rSm,
            fontSize: 11, fontWeight: 500, fontFamily: T.sans,
            whiteSpace: 'nowrap',
        }}>
            <div style={{ width: 6, height: 6, borderRadius: 1, background: stageColor(stage), flexShrink: 0 }}/>
            {stage}
        </div>
    );
}

// ── Table header ──────────────────────────────────────────────
// Grid mirrors PipelineTab's list view but without checkbox/rep/days cols —
// the quarter rail already organises by date so Days is redundant here.
// canSeeAll adds a Rep column.
function TableHeader({ canSeeAll }) {
    const cols = canSeeAll
        ? '1.4fr 0.9fr 100px 100px 90px 90px 60px 70px 24px'
        : '1.6fr 1fr 100px 90px 90px 60px 70px 24px';

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: cols,
            alignItems: 'center',
            padding: '0 14px', height: 34,
            background: T.surface2,
            borderBottom: `1px solid ${T.border}`,
            ...eyebrow,
            position: 'sticky', top: 0, zIndex: 1,
        }}>
            <div>Deal</div>
            <div>Account</div>
            {canSeeAll && <div>Rep</div>}
            <div>Stage</div>
            <div style={{ textAlign: 'right' }}>Revenue</div>
            <div>Close</div>
            <div>AI</div>
            <div>Health</div>
            <div/>
        </div>
    );
}

// ── Table row ─────────────────────────────────────────────────
function TableRow({ opp, canSeeAll, calculateDealHealth, onEdit }) {
    const [hover, setHover] = useState(false);

    const cols = canSeeAll
        ? '1.4fr 0.9fr 100px 100px 90px 90px 60px 70px 24px'
        : '1.6fr 1fr 100px 90px 90px 60px 70px 24px';

    const health    = calculateDealHealth(opp);
    const hColor    = health.score >= 65 ? T.ok : health.score >= 45 ? T.warn : T.danger;
    const closeDays = opp.forecastedCloseDate
        ? Math.round((new Date(opp.forecastedCloseDate + 'T12:00:00') - new Date()) / 86400000)
        : null;
    const overdue   = closeDays !== null && closeDays < 0;
    const aiRisk    = opp.aiScore && opp.aiScore.score < 50;

    return (
        <div
            onClick={() => onEdit(opp)}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
                display: 'grid',
                gridTemplateColumns: cols,
                alignItems: 'center',
                padding: '0 14px', height: 42,
                borderBottom: `1px solid ${T.border}`,
                background: hover ? T.surface2 : 'transparent',
                fontSize: 12, color: T.ink,
                cursor: 'pointer', fontFamily: T.sans,
                transition: 'background 100ms',
            }}
        >
            {/* Deal name + next step hint */}
            <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}
                title={opp.nextStep ? `Next step: ${opp.nextStep}` : undefined}>
                {opp.opportunityName || opp.account}
                {opp.nextStep && (
                    <span style={{ marginLeft: 5, fontSize: 10, color: T.goldInk, fontWeight: 400 }}>
                        → {opp.nextStep.length > 40 ? opp.nextStep.slice(0, 40) + '…' : opp.nextStep}
                    </span>
                )}
            </div>

            {/* Account */}
            <div style={{ color: T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 12 }}>
                {opp.account}
            </div>

            {/* Rep — admins/managers only */}
            {canSeeAll && (
                <div style={{ color: T.inkMid, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8, fontSize: 11 }}>
                    {opp.salesRep || opp.assignedTo || '—'}
                </div>
            )}

            {/* Stage */}
            <div><StagePill stage={opp.stage}/></div>

            {/* Revenue */}
            <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', textAlign: 'right', color: T.ink }}>
                {fmtMoney(parseFloat(opp.arr) || 0)}
            </div>

            {/* Close date */}
            <div style={{ fontSize: 11, color: overdue ? T.danger : T.inkMid, fontWeight: overdue ? 600 : 400 }}>
                {relativeDay(opp.forecastedCloseDate)}
            </div>

            {/* AI score */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                {opp.aiScore ? (
                    <>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                            stroke={aiRisk ? T.danger : T.inkMid}
                            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>
                        </svg>
                        <span style={{ fontSize: 11, color: aiRisk ? T.danger : T.inkMid, fontVariantNumeric: 'tabular-nums' }}>
                            {opp.aiScore.score}
                        </span>
                    </>
                ) : (
                    <span style={{ fontSize: 11, color: T.inkMuted }}>—</span>
                )}
            </div>

            {/* Health */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: hColor, flexShrink: 0 }}/>
                <span style={{ fontSize: 11, color: T.inkMid, fontVariantNumeric: 'tabular-nums' }}>{health.score}</span>
            </div>

            {/* Row action — ⋯ on hover */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {hover && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.inkMuted}
                        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>
                    </svg>
                )}
            </div>
        </div>
    );
}

// ── Quarter rail ──────────────────────────────────────────────
function QuarterRail({ groups, activeKey, onSelect, totalAll, currentKey }) {
    return (
        <div style={{
            width: 220,
            flexShrink: 0,
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.rMd,
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            overflowY: 'auto',
        }}>
            <div style={{ ...eyebrow, padding: '6px 10px 8px' }}>Quarters</div>

            {groups.map(g => {
                const s       = qSummary(g.opps);
                const isActive  = g.key === activeKey;
                const isCurrent = g.key === currentKey;
                const pct       = totalAll > 0 ? Math.min(100, (s.total / totalAll) * 100) : 0;

                return (
                    <button
                        key={g.key}
                        onClick={() => onSelect(g.key)}
                        style={{
                            background: isActive ? T.surface2 : 'transparent',
                            border: 'none',
                            borderLeft: `3px solid ${isActive ? T.gold : 'transparent'}`,
                            padding: '10px 10px 10px 12px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontFamily: T.sans,
                            borderRadius: T.rSm,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                            transition: 'background 100ms',
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.surface2; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    >
                        {/* Label + CURRENT tag */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                            <div style={{ fontFamily: T.serif, fontStyle: 'italic', fontSize: 15, fontWeight: 600, color: T.ink }}>
                                {g.longLabel}
                            </div>
                            {isCurrent && (
                                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.goldInk }}>
                                    Current
                                </div>
                            )}
                        </div>

                        {/* Date range */}
                        <div style={{ fontSize: 10, color: T.inkMuted }}>
                            {quarterRange(g.year, g.q)}
                        </div>

                        {/* Total + count */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 2 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: T.ink }}>
                                {fmtMoney(s.total)}
                            </div>
                            <div style={{ fontSize: 10, color: T.inkMuted }}>· {s.count} deals</div>
                        </div>

                        {/* Mini bar */}
                        <div style={{ height: 3, background: T.border, borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: isActive ? T.gold : T.borderStrong, transition: 'width 200ms' }}/>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

// ── Stat strip ────────────────────────────────────────────────
function StatStrip({ sum, activeGroup }) {
    const cells = [
        { label: 'Pipeline',  value: fmtMoney(sum.total),    sub: `${sum.count} deals`,         accent: T.borderStrong },
        { label: 'Weighted',  value: fmtMoney(sum.weighted), sub: 'probability-adjusted',        accent: T.borderStrong },
        { label: 'Commit',    value: fmtMoney(sum.commit),   sub: 'Negotiation + Closing',       accent: T.ok           },
        { label: 'Quarter',   value: activeGroup ? activeGroup.longLabel : '—',
                                                              sub: activeGroup ? quarterRange(activeGroup.year, activeGroup.q) : '',
                                                                                                  accent: T.gold         },
    ];

    return (
        <div style={{
            display: 'flex',
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.rMd,
            overflow: 'hidden',
            flexShrink: 0,
        }}>
            {cells.map((c, i) => (
                <div key={c.label} style={{
                    flex: 1,
                    padding: '13px 16px',
                    borderRight: i < 3 ? `1px solid ${T.border}` : 'none',
                    borderTop: `2px solid ${c.accent}`,
                }}>
                    <div style={eyebrow}>{c.label}</div>
                    <div style={{
                        fontFamily: T.serif, fontStyle: 'italic',
                        fontSize: 20, fontWeight: 600,
                        color: T.ink, marginTop: 4,
                        fontVariantNumeric: 'tabular-nums',
                    }}>{c.value}</div>
                    <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2 }}>{c.sub}</div>
                </div>
            ))}
        </div>
    );
}

// ── ListView — exported component ─────────────────────────────
// Props passed from PipelineTab, same pattern as KanbanView/FunnelView.
export default function ListView({ pipelineFilteredOpps, handleEdit }) {
    const { canSeeAll, calculateDealHealth } = useApp();

    // Exclude closed deals (same as other views)
    const openOpps = pipelineFilteredOpps.filter(
        o => !['Closed Won', 'Closed Lost'].includes(o.stage)
    );

    // Group by close quarter using forecastedCloseDate
    const groups = groupByQuarter(openOpps);

    // Determine current calendar quarter key
    const todayIso  = new Date().toISOString().split('T')[0];
    const currentQk = quarterOf(todayIso);
    const currentKey = currentQk ? currentQk.key : null;

    // Default active quarter: current quarter if it has deals, else first group
    const defaultKey = groups.find(g => g.key === currentKey)?.key || groups[0]?.key || null;
    const [activeKey, setActiveKey] = useState(defaultKey);

    // If the active quarter disappears from the filtered set (e.g. smart view changes),
    // fall back gracefully. We derive this on every render — no stale state.
    const validKey    = groups.find(g => g.key === activeKey)?.key || groups[0]?.key || null;
    const activeGroup = groups.find(g => g.key === validKey) || null;
    const sum         = activeGroup ? qSummary(activeGroup.opps) : { total: 0, weighted: 0, commit: 0, count: 0 };
    const totalAll    = openOpps.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);

    // ── Empty state ───────────────────────────────────────────
    if (openOpps.length === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
                No deals match the current filter.
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', gap: 12, flex: 1, overflow: 'hidden', fontFamily: T.sans }}>

            {/* Quarter rail */}
            <QuarterRail
                groups={groups}
                activeKey={validKey}
                onSelect={setActiveKey}
                totalAll={totalAll}
                currentKey={currentKey}
            />

            {/* Detail panel */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden', minWidth: 0 }}>

                {/* Stat strip */}
                <StatStrip sum={sum} activeGroup={activeGroup}/>

                {/* Table */}
                <div style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: T.rMd,
                    flex: 1,
                    overflow: 'auto',
                }}>
                    <TableHeader canSeeAll={canSeeAll}/>

                    {activeGroup && activeGroup.opps.length > 0 ? (
                        activeGroup.opps
                            .slice()
                            .sort((a, b) => new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999'))
                            .map(opp => (
                                <TableRow
                                    key={opp.id}
                                    opp={opp}
                                    canSeeAll={canSeeAll}
                                    calculateDealHealth={calculateDealHealth}
                                    onEdit={handleEdit}
                                />
                            ))
                    ) : (
                        <div style={{ padding: '2rem', textAlign: 'center', color: T.inkMuted, fontSize: 13 }}>
                            No deals closing this quarter.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
