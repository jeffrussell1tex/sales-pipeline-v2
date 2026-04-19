import React from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

// ── Design tokens ────────────────────────────────────────────
const T = {
    bg: '#f0ece4', surface: '#fbf8f3', surface2: '#f5efe3',
    border: '#e6ddd0', borderStrong: '#d4c8b4',
    ink: '#2a2622', inkMid: '#5a544c', inkMuted: '#8a8378',
    gold: '#c8b99a', danger: '#9c3a2e', warn: '#b87333', ok: '#4d6b3d',
    stages: {
        'Prospecting': '#b0a088', 'Qualification': '#c8a978', 'Discovery': '#b07a55',
        'Evaluation (Demo)': '#b07a55', 'Proposal': '#b87333',
        'Negotiation': '#7a5a3c', 'Negotiation/Review': '#7a5a3c',
        'Contracts': '#4d6b3d', 'Closing': '#4d6b3d',
        'Closed Won': '#3a5530', 'Closed Lost': '#9c3a2e',
    },
    sans: '"Plus Jakarta Sans", system-ui, sans-serif',
    r: 3, rMd: 4,
};
const stageColor = (s) => T.stages[s] || T.inkMuted;

const relativeDay = (d) => {
    if (!d) return '—';
    const diff = Math.round((new Date(d + 'T12:00:00') - new Date()) / 86400000);
    if (diff === 0) return 'today';
    if (diff < 0) return Math.abs(diff) + 'd over';
    if (diff <= 7) return diff + 'd';
    return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fmtARR = (v) => {
    const n = parseFloat(v) || 0;
    if (n >= 1000000) return '$' + (n/1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + Math.round(n/1000) + 'K';
    return '$' + n.toLocaleString();
};

// ── Single Kanban card ───────────────────────────────────────
function KanbanCard({ opp, isSelected, onSelect, onOpen, isDragging }) {
    const [hover, setHover] = React.useState(false);
    const { calculateDealHealth } = useApp();
    const health = calculateDealHealth(opp);
    const hColor = health.score >= 65 ? T.ok : health.score >= 45 ? T.warn : T.danger;
    const color  = stageColor(opp.stage);
    const daysInStage = opp.stageChangedDate
        ? Math.max(0, Math.floor((Date.now() - new Date(opp.stageChangedDate + 'T12:00:00').getTime()) / 86400000))
        : null;
    const stale = daysInStage !== null && daysInStage > 14;
    const closedays = opp.forecastedCloseDate
        ? Math.round((new Date(opp.forecastedCloseDate + 'T12:00:00') - new Date()) / 86400000)
        : null;
    const aiRisk = opp.aiScore && opp.aiScore.score < 50;

    return (
        <div
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={() => onOpen(opp)}
            style={{
                background: T.surface,
                border: `1px solid ${isSelected ? T.ink : hover ? T.borderStrong : T.border}`,
                borderTop: `2px solid ${color}`,
                borderRadius: T.rMd,
                padding: '10px 11px',
                cursor: 'pointer',
                position: 'relative',
                opacity: isDragging ? 0.45 : 1,
                transition: 'border-color 120ms, box-shadow 120ms, transform 120ms',
                boxShadow: hover ? '0 4px 14px -6px rgba(42,38,34,0.22)' : 'none',
                transform: hover ? 'translateY(-1px)' : 'none',
                userSelect: 'none',
                fontFamily: T.sans,
            }}>
            {/* Hover checkbox */}
            {(hover || isSelected) && (
                <div onClick={e => { e.stopPropagation(); onSelect(opp.id); }}
                    style={{ position: 'absolute', top: 8, right: 8, width: 15, height: 15, borderRadius: 3,
                        border: `1px solid ${isSelected ? T.ink : T.borderStrong}`,
                        background: isSelected ? T.ink : T.surface,
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isSelected && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.surface} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12l5 5L20 6"/></svg>}
                </div>
            )}
            {/* Deal name */}
            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, lineHeight: 1.35, paddingRight: (hover || isSelected) ? 22 : 0, marginBottom: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {opp.opportunityName || opp.account}
            </div>
            {/* Account */}
            <div style={{ fontSize: 11, color: T.inkMuted, marginBottom: 8, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {opp.account}{opp.site ? ` · ${opp.site}` : ''}
            </div>
            {/* ARR + close date */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtARR(opp.arr)}
                </div>
                <div style={{ fontSize: 10, color: closedays !== null && closedays < 0 ? T.danger : T.inkMuted, fontWeight: closedays !== null && closedays < 0 ? 600 : 400 }}>
                    {relativeDay(opp.forecastedCloseDate)}
                </div>
            </div>
            {/* Meta row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.inkMuted, borderTop: `1px solid ${T.border}`, paddingTop: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: hColor, flexShrink: 0 }} title={health.status}/>
                {opp.aiScore?.score != null && (
                    <span style={{ color: aiRisk ? T.danger : T.inkMid, fontWeight: 500 }}>✦ {opp.aiScore.score}</span>
                )}
                {opp.salesRep && (
                    <span style={{ fontSize: 9.5, color: T.inkMuted }}>
                        {opp.salesRep.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2)}
                    </span>
                )}
                <span style={{ flex: 1 }}/>
                {daysInStage !== null && (
                    <span style={{ color: stale ? T.danger : T.inkMuted, fontWeight: stale ? 700 : 400 }}>
                        {daysInStage}d
                    </span>
                )}
            </div>
        </div>
    );
}

// ── Main KanbanView ──────────────────────────────────────────
export default function KanbanView({
    pipelineFilteredOpps,
    kanbanDragging, kanbanDragOver,
    setKanbanDragging, setKanbanDragOver,
    handleEdit,
    selectedOpps = [], setSelectedOpps,
}) {
    const { stages, opportunities, setOpportunities, currentUser } = useApp();

    const handleKanbanDrop = (toStage) => {
        if (!kanbanDragging || kanbanDragging.fromStage === toStage) {
            setKanbanDragging(null); setKanbanDragOver(null); return;
        }
        const today = [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-');
        const updatedOpp = opportunities.find(o => o.id === kanbanDragging.oppId);
        if (!updatedOpp) return;
        const newOpp = {
            ...updatedOpp, stage: toStage, stageChangedDate: today,
            stageHistory: [...(updatedOpp.stageHistory||[]), { stage: toStage, date: today, prevStage: updatedOpp.stage, author: currentUser||'', timestamp: new Date().toISOString() }],
        };
        setOpportunities(prev => prev.map(o => o.id === kanbanDragging.oppId ? newOpp : o));
        dbFetch('/.netlify/functions/opportunities', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(newOpp) }).catch(console.error);
        setKanbanDragging(null); setKanbanDragOver(null);
    };

    const toggleSelect = (id) => {
        if (!setSelectedOpps) return;
        setSelectedOpps(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    };

    const visibleStages = stages.filter(s => s !== 'Closed Lost');

    return (
        <div style={{ padding: '0 24px 24px', overflowX: 'auto', display: 'flex', gap: 10, alignItems: 'flex-start', fontFamily: T.sans }}>
            {visibleStages.map(stage => {
                const colOpps   = pipelineFilteredOpps.filter(o => o.stage === stage);
                const colARR    = colOpps.reduce((s, o) => s + (parseFloat(o.arr)||0), 0);
                const isDragOver = kanbanDragOver === stage;
                const color     = stageColor(stage);
                return (
                    <div key={stage}
                        onDragOver={e => { e.preventDefault(); setKanbanDragOver(stage); }}
                        onDragLeave={() => setKanbanDragOver(null)}
                        onDrop={() => handleKanbanDrop(stage)}
                        onTouchMove={e => { e.preventDefault(); setKanbanDragOver(stage); }}
                        onTouchEnd={() => handleKanbanDrop(stage)}
                        style={{ width: 200, flexShrink: 0 }}>
                        {/* Lane header */}
                        <div style={{
                            background: isDragOver ? T.bg : T.surface2,
                            borderRadius: T.r,
                            padding: '8px 10px',
                            marginBottom: 8,
                            borderTop: `2px solid ${color}`,
                            border: `1px solid ${isDragOver ? T.borderStrong : T.border}`,
                            borderTopWidth: 2,
                            transition: 'border-color 120ms, background 120ms',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 2 }}>
                                <div style={{ fontSize: 11, fontWeight: 600, color: T.ink, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1, paddingRight: 6 }}>
                                    {stage}
                                </div>
                                <div style={{ fontSize: 10, color: T.inkMuted, fontWeight: 500, flexShrink: 0 }}>{colOpps.length}</div>
                            </div>
                            <div style={{ fontSize: 11, color: T.inkMuted, fontVariantNumeric: 'tabular-nums' }}>
                                {fmtARR(colARR)}
                            </div>
                        </div>
                        {/* Cards */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, minHeight: 80 }}>
                            {colOpps.map(opp => (
                                <div key={opp.id}
                                    draggable
                                    onDragStart={() => setKanbanDragging({ oppId: opp.id, fromStage: stage })}
                                    onDragEnd={() => { setKanbanDragging(null); setKanbanDragOver(null); }}
                                    onTouchStart={() => setKanbanDragging({ oppId: opp.id, fromStage: stage })}
                                    onTouchEnd={() => { setKanbanDragging(null); setKanbanDragOver(null); }}
                                    style={{ marginBottom: 8 }}>
                                    <KanbanCard
                                        opp={opp}
                                        isSelected={selectedOpps.includes(opp.id)}
                                        onSelect={toggleSelect}
                                        onOpen={handleEdit}
                                        isDragging={kanbanDragging?.oppId === opp.id}
                                    />
                                </div>
                            ))}
                            {colOpps.length === 0 && (
                                <div style={{ fontSize: 11, color: isDragOver ? T.inkMid : T.border, textAlign: 'center', padding: '20px 0', fontStyle: 'italic', transition: 'color 120ms' }}>
                                    {isDragOver ? 'Drop here' : 'Empty'}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
