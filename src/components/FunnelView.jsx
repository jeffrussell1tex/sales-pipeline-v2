import React from 'react';
import { useApp } from '../AppContext';

// ── Tokens — exact match to TOKENS in Pipeline mockup ────────
const T = {
    bg:           '#f0ece4',
    surface:      '#fbf8f3',
    surface2:     '#f5efe3',
    border:       '#e6ddd0',
    borderStrong: '#d4c8b4',
    ink:          '#2a2622',
    inkMid:       '#5a544c',
    inkMuted:     '#8a8378',
    danger:       '#9c3a2e',
    warn:         '#b87333',
    ok:           '#4d6b3d',
    // Stage colors — desaturated accents, matching mockup TOKENS.stages
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
    sans: '"Plus Jakarta Sans", system-ui, sans-serif',
    rSm: 3,
    rMd: 4,
};

const sc = (stage) => T.stages[stage] || T.inkMuted;

const fmtARR = (n) => {
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n.toLocaleString();
};

export default function FunnelView({
    pipelineFilteredOpps,
    funnelExpandedStage,
    setFunnelExpandedStage,
    handleEdit,
    handleDelete,
}) {
    const { stages, settings } = useApp();

    const maxCount = Math.max(
        ...stages.map(s => pipelineFilteredOpps.filter(o => o.stage === s).length),
        1
    );

    return (
        <div style={{ padding: '4px 24px 24px', fontFamily: T.sans }}>
            {stages.map(stage => {
                const stageOpps = pipelineFilteredOpps.filter(o => o.stage === stage);
                const stageARR  = stageOpps.reduce((sum, o) => sum + (parseFloat(o.arr) || 0), 0);
                const pct       = stageOpps.length === 0
                    ? 4
                    : Math.max(7, Math.round((stageOpps.length / maxCount) * 100));
                const color      = sc(stage);
                const isExpanded = funnelExpandedStage === stage;
                const stDef      = (settings.funnelStages || []).find(s2 => s2.name === stage);

                return (
                    <div key={stage} style={{ marginBottom: isExpanded ? 6 : 2 }}>
                        {/* Stage bar row */}
                        <div
                            onClick={() => setFunnelExpandedStage(isExpanded ? null : stage)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '5px 8px', borderRadius: T.rSm,
                                cursor: 'pointer', transition: 'background 120ms',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>

                            {/* Stage label */}
                            <div style={{
                                width: 'clamp(90px, 22vw, 160px)', flexShrink: 0,
                                textAlign: 'right', paddingRight: 10,
                            }}>
                                <div style={{
                                    fontSize: 12.5, fontWeight: 600, color: T.ink,
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                    {stage}
                                </div>
                                <div style={{
                                    fontSize: 11, color, fontWeight: 600, marginTop: 1,
                                    fontVariantNumeric: 'tabular-nums',
                                }}>
                                    {fmtARR(stageARR)} · {stageOpps.length}
                                </div>
                            </div>

                            {/* Bar — stage color fill, matches token palette */}
                            <div style={{ flex: 1, height: 36, display: 'flex', alignItems: 'center' }}>
                                <div style={{
                                    width: pct + '%',
                                    height: '100%',
                                    borderRadius: T.rSm,
                                    background: color,
                                    opacity: stageOpps.length === 0 ? 0.12 : 0.78,
                                    display: 'flex', alignItems: 'center',
                                    paddingLeft: 9, minWidth: 28,
                                    transition: 'width 400ms ease',
                                }}>
                                    {stageOpps.length > 0 && (
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>
                                            {stageOpps.length}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Right: win% + chevron */}
                            <div style={{
                                width: 72, flexShrink: 0,
                                display: 'flex', alignItems: 'center',
                                justifyContent: 'flex-end', gap: 10,
                            }}>
                                {stDef && (
                                    <span style={{ fontSize: 11, color: T.inkMuted }}>
                                        {stDef.weight}%
                                    </span>
                                )}
                                <span style={{
                                    fontSize: 10, color: T.inkMuted,
                                    display: 'inline-block',
                                    transform: isExpanded ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 200ms',
                                }}>▼</span>
                            </div>
                        </div>

                        {/* Expanded deal rows */}
                        {isExpanded && stageOpps.length > 0 && (
                            <div style={{
                                marginLeft: 'clamp(90px, 22vw, 160px)',
                                marginBottom: 6,
                                border: `1px solid ${T.border}`,
                                borderRadius: T.rMd,
                                overflow: 'hidden',
                                background: T.surface,
                                overflowX: 'auto',
                            }}>
                                {/* Header */}
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '2fr 1fr 90px 100px 80px',
                                    padding: '5px 12px',
                                    background: T.surface2,
                                    borderBottom: `1px solid ${T.border}`,
                                    gap: 12,
                                }}>
                                    {['Opportunity', 'Account', 'ARR', 'Close', 'Actions'].map((h, i) => (
                                        <span key={h} style={{
                                            fontSize: 10, fontWeight: 700, color: T.inkMuted,
                                            textTransform: 'uppercase', letterSpacing: '0.07em',
                                            textAlign: i >= 2 ? 'right' : 'left',
                                        }}>{h}</span>
                                    ))}
                                </div>

                                {/* Rows */}
                                {stageOpps.map(opp => (
                                    <div
                                        key={opp.id}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: '2fr 1fr 90px 100px 80px',
                                            padding: '8px 12px',
                                            borderBottom: `1px solid ${T.border}`,
                                            fontSize: 12.5, alignItems: 'center', gap: 12,
                                            cursor: 'pointer', transition: 'background 120ms',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        onClick={() => handleEdit(opp)}>
                                        <span style={{ fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {opp.opportunityName || opp.account}
                                        </span>
                                        <span style={{ color: T.inkMid, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {opp.account}
                                        </span>
                                        <span style={{ fontWeight: 700, color: T.ink, fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                            ${(parseFloat(opp.arr) || 0).toLocaleString()}
                                        </span>
                                        <span style={{ color: T.inkMuted, fontSize: 11, whiteSpace: 'nowrap', textAlign: 'right' }}>
                                            {opp.forecastedCloseDate
                                                ? new Date(opp.forecastedCloseDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                                                : '—'}
                                        </span>
                                        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleEdit(opp); }}
                                                style={{
                                                    padding: '3px 8px', border: `1px solid ${T.border}`,
                                                    borderRadius: T.rSm, background: T.surface,
                                                    color: T.inkMid, fontSize: 11, fontWeight: 500,
                                                    cursor: 'pointer', fontFamily: T.sans,
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                                                Edit
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); handleDelete(opp.id); }}
                                                style={{
                                                    padding: '3px 8px',
                                                    border: '1px solid rgba(156,58,46,0.3)',
                                                    borderRadius: T.rSm,
                                                    background: 'rgba(156,58,46,0.06)',
                                                    color: T.danger, fontSize: 11, fontWeight: 500,
                                                    cursor: 'pointer', fontFamily: T.sans,
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(156,58,46,0.14)'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(156,58,46,0.06)'}>
                                                Del
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {isExpanded && stageOpps.length === 0 && (
                            <div style={{
                                marginLeft: 'clamp(90px, 22vw, 160px)',
                                marginBottom: 6,
                                padding: '0.75rem', background: T.bg,
                                borderRadius: T.rMd, fontSize: 12, color: T.inkMuted,
                                textAlign: 'center', border: `1px dashed ${T.border}`,
                                fontStyle: 'italic',
                            }}>
                                No deals in this stage
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
