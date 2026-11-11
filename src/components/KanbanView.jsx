import React from 'react';
import { useApp } from '../AppContext';
import { dbWrite, requestOrg, stillOrg } from '../utils/storage';
import { pressNoticeOf } from '../utils/pressNotice.js';
import { T } from '../tokens.js';
import { todayLocal, daysSince, calendarDays } from '../utils/dateLocal';

// ── Tokens — exact match to TOKENS in mockup ─────────────────

const sc = (stage) => T.stages[stage] || T.inkMuted;

// Relative day helper matching mockup's relativeDay()
const relDay = (dateStr) => {
    if (!dateStr) return '—';
    // Signed calendar days (state §0.240), the count the card's daysSince keeps beside it.
    const diff = calendarDays(todayLocal(), dateStr);
    if (diff === null) return '—';
    if (diff === 0) return 'today';
    if (diff < 0) return `${Math.abs(diff)}d ago`;
    if (diff === 1) return 'tmrw';
    if (diff <= 14) return `${diff}d`;
    if (diff <= 60) return `${Math.round(diff / 7)}w`;
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const fmtARR = (v) => {
    const n = parseFloat(v) || 0;
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return '$' + n.toLocaleString();
};

// Spark icon matching mockup's Icon name="spark"
const SparkIcon = ({ size = 9, color = 'currentColor' }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>
    </svg>
);

const CheckIcon = ({ size = 11 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={T.surface} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12l5 5L20 6"/>
    </svg>
);

// ── KanbanCard — pixel-exact from PV1KanbanCard in mockup ────
function KanbanCard({ opp, isSelected, onSelect, onOpen, isDragging, activities, selectMode }) {
    const [hover, setHover] = React.useState(false);
    const { calculateDealHealth } = useApp();

    const health = calculateDealHealth(opp);
    const hColor = health.score >= 65 ? T.ok : health.score >= 45 ? T.warn : T.danger;

    const daysInStage = opp.stageChangedDate
        ? daysSince(opp.stageChangedDate)   // calendar days (state §0.240): from the day's noon it ran one low
        : null;
    const stale = daysInStage !== null && daysInStage > 14;

    const closedays = opp.forecastedCloseDate
        ? calendarDays(todayLocal(), opp.forecastedCloseDate)   // signed calendar days: overdue from the next morning (§0.240)
        : null;

    const atRisk = opp.aiScore && opp.aiScore.score < 50;

    // Each side by itself, not the `border` shorthand: React re-sets only what changed,
    // and a changed shorthand overwrote the stage's top edge when a card was ticked
    // (state §0.179).
    const edge = `1px solid ${isSelected ? T.ink : T.border}`;

    // Last activity date
    const oppActivities = (activities || []).filter(a => a.opportunityId === opp.id);
    const lastAct = oppActivities.length > 0
        ? oppActivities.reduce((latest, a) => (!latest || new Date(a.date) > new Date(latest.date)) ? a : latest, null)
        : null;

    return (
        <div
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={() => selectMode ? onSelect(opp.id) : onOpen(opp)}
            style={{
                background: T.surface,
                borderTop: `2px solid ${sc(opp.stage)}`,
                borderRight: edge, borderBottom: edge, borderLeft: edge,
                borderRadius: T.rMd,
                padding: '10px 11px',
                marginBottom: 8,
                cursor: 'pointer',
                position: 'relative',
                opacity: isDragging ? 0.45 : 1,
                transition: 'border-color 120ms, box-shadow 120ms, transform 120ms',
                boxShadow: hover ? '0 4px 14px -6px rgba(42,38,34,0.2)' : 'none',
                transform: hover ? 'translateY(-1px)' : 'none',
                userSelect: 'none',
                fontFamily: T.sans,
            }}>

            {/* Checkbox — in Select mode only (state §0.179; Jeff: "Only in Select mode"). It
                showed on hover for everyone and ticked a card outside Select mode, where
                nothing acts on a selection. */}
            {selectMode && (
                <div
                    onClick={e => { e.stopPropagation(); onSelect(opp.id); }}
                    style={{
                        position: 'absolute', top: 8, right: 8,
                        width: 16, height: 16, borderRadius: 3,
                        border: `1px solid ${isSelected ? T.ink : T.borderStrong}`,
                        background: isSelected ? T.ink : T.surface,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                    {isSelected && <CheckIcon/>}
                </div>
            )}

            {/* Deal name — from mockup: fontSize 13, fontWeight 600, 2-line clamp */}
            <div style={{
                fontSize: 13, fontWeight: 600, color: T.ink, lineHeight: 1.3,
                paddingRight: selectMode ? 22 : 0,
                marginBottom: 2,
                textOverflow: 'ellipsis', overflow: 'hidden',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            }}>
                {opp.opportunityName || opp.account}
            </div>

            {/* Account */}
            <div style={{
                fontSize: 11, color: T.inkMuted, marginBottom: 8,
                textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap',
            }}>
                {opp.account}{opp.site ? ` · ${opp.site}` : ''}
            </div>

            {/* ARR + close date row */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{
                    fontSize: 14, fontWeight: 700, color: T.ink,
                    fontVariantNumeric: 'tabular-nums',
                }}>
                    {fmtARR(opp.arr)}
                </div>
                <div style={{
                    fontSize: 10,
                    color: closedays !== null && closedays < 0 ? T.danger : T.inkMuted,
                    fontWeight: closedays !== null && closedays < 0 ? 600 : 400,
                }}>
                    {relDay(opp.forecastedCloseDate)}
                </div>
            </div>

            {/* Bottom meta row — matches mockup: health · AI · spacer · days · lastAct */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 10, color: T.inkMuted,
                borderTop: `1px solid ${T.border}`, paddingTop: 6,
            }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: hColor, flexShrink: 0 }}
                    title={`Health: ${health.status} (${health.score}/100)`}/>

                {opp.aiScore && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        color: atRisk ? T.danger : T.inkMid, fontWeight: 500,
                    }}>
                        <SparkIcon color="currentColor"/>
                        {opp.aiScore.score}
                    </span>
                )}

                <span style={{ flex: 1 }}/>

                {daysInStage !== null && (
                    <span style={{ color: stale ? T.danger : T.inkMuted, fontWeight: stale ? 600 : 400 }}>
                        {daysInStage}d
                    </span>
                )}

                {lastAct && (
                    <span style={{ color: T.inkMuted }}>
                        · {relDay(lastAct.date)}
                    </span>
                )}
            </div>
        </div>
    );
}

// A drag of a deal whose last drag is still unanswered begins from that drag's own copy: a refusal of both put back
// drag 2's start — drag 1's copy, a stage the server never stored (state §0.245, the review). Each copy names the copy
// its chain began from, and a refusal puts back that.
const dragBase = new WeakMap();   // an optimistic drag copy -> the copy its chain of drags began from

// ── Main KanbanView ──────────────────────────────────────────
export default function KanbanView({
    pipelineFilteredOpps,
    kanbanDragging,
    kanbanDragOver,
    setKanbanDragging,
    setKanbanDragOver,
    handleEdit,
    selectedOpps = [],
    setSelectedOpps,
    selectMode = false,
    canEdit = false,   // canEditCrm(userRole), PipelineTab's: only a member who may change deals is offered the drag (§0.245, Q2)
}) {
    const { stages, opportunities, setOpportunities, currentUser, activities, promptSpiffClaim, setPressNotices } = useApp();

    const handleKanbanDrop = (toStage) => {
        if (!kanbanDragging || kanbanDragging.fromStage === toStage) {
            setKanbanDragging(null); setKanbanDragOver(null); return;
        }
        const today = todayLocal();   // the member's day (state §0.245, docs/design/refusal-sweep 1d)
        const updatedOpp = opportunities.find(o => o.id === kanbanDragging.oppId);
        if (!updatedOpp) { setKanbanDragging(null); setKanbanDragOver(null); return; }   // a deal gone since: the drag ends
        const newOpp = {
            ...updatedOpp,
            stage: toStage,
            stageChangedDate: today,
            stageHistory: [
                ...(updatedOpp.stageHistory || []),
                { stage: toStage, date: today, prevStage: updatedOpp.stage, author: currentUser || '', timestamp: new Date().toISOString() },
            ],
        };
        dragBase.set(newOpp, dragBase.get(updatedOpp) ?? updatedOpp);
        setOpportunities(prev => prev.map(o => o.id === kanbanDragging.oppId ? newOpp : o));
        // The drag sends what it changes — the stage, its date and its history — and nothing
        // else: the server merges a PUT over the stored row, so the rest stays as stored. It sent
        // the whole row this list holds, and a list loaded before another session's save wrote
        // that save back: a deal D22 moved up from a site went back onto the site's name with no
        // id (state §0.198; the critics, 12 Oct).
        // Not its history (state §0.236): the server appends the move to the history as stored — a list this board
        // built from its own copy dropped a move made elsewhere since. The board shows the move at once and takes the
        // deal as stored from the answer — once the org is still the one it asked in (state §0.175).
        // A refused or unsent move is said and put back (state §0.245, docs/design/refusal-sweep 1a; Jeff's Q1): the card
        // went back to nothing, and the deal window opened on the list's copy sent the refused stage with the next save.
        // Put back by identity — this drag's own copy only: a list read again since, or a later drag of the deal, keeps
        // what it holds. What it puts back is the copy this drag's chain began from (dragBase): a second drag made while
        // the first is unanswered began from the first's copy, never stored. Said in a press notice, kept until its ✕ or an
        // org switch — the toast is one slot a later toast replaces. dbWrite never throws, so the catch sees only a throw
        // in what follows a landed move.
        const askedOrg = requestOrg();
        dbWrite('/.netlify/functions/opportunities', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: newOpp.id, stage: newOpp.stage, stageChangedDate: newOpp.stageChangedDate }),
        }).then(r => {
            if (!stillOrg(askedOrg)) return;
            if (!r.ok) {
                const base = dragBase.get(newOpp);   // the copy this chain of drags began from
                setOpportunities(prev => prev.map(o => (o === newOpp ? base : o)));   // this drag's copy only
                setPressNotices(list => [...list, pressNoticeOf(updatedOpp.opportunityName || updatedOpp.account || 'A deal', `Not moved to ${toStage}: ${r.error}`)]);
                return;
            }
            const stored = r.data?.opportunity;
            if (stored) setOpportunities(prev => prev.map(o => (o.id === stored.id ? stored : o)));
            if (toStage === 'Closed Won') promptSpiffClaim?.(stored || newOpp);
        }).catch(console.error);   // a throw in what follows a landed move; dbWrite itself never throws
        setKanbanDragging(null);
        setKanbanDragOver(null);
    };

    const toggleSelect = (id) => {
        if (!setSelectedOpps) return;
        setSelectedOpps(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // Mockup uses specific visible stages, excluding Closed Lost
    const visibleStages = stages.filter(s => s !== 'Closed Lost');

    return (
        // Matches PV1Kanban layout exactly: flex row, gap 10, padding 0 24px 24px, overflowX auto
        <div style={{
            display: 'flex',
            gap: 10,
            padding: '0 24px 24px',
            overflowX: 'auto',
            flex: 1,
            alignItems: 'flex-start',
            fontFamily: T.sans,
        }}>
            {visibleStages.map(stage => {
                const colOpps  = pipelineFilteredOpps.filter(o => o.stage === stage);
                const colTotal = colOpps.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
                const isDragOver = kanbanDragOver === stage;

                return (
                    <div
                        key={stage}
                        onDragOver={e => { e.preventDefault(); setKanbanDragOver(stage); }}
                        onDragLeave={() => setKanbanDragOver(null)}
                        onDrop={() => handleKanbanDrop(stage)}
                        onTouchMove={e => { e.preventDefault(); setKanbanDragOver(stage); }}
                        onTouchEnd={() => handleKanbanDrop(stage)}
                        style={{ width: 200, flexShrink: 0 }}>

                        {/* Lane header — from PV1Kanban in mockup */}
                        <div style={{
                            background: isDragOver ? T.bg : T.surface2,
                            borderRadius: T.rSm,
                            padding: '8px 10px',
                            marginBottom: 8,
                            borderTop: `2px solid ${sc(stage)}`,
                            transition: 'background 120ms',
                            // Note: NO outer border on lane header — matches mockup
                        }}>
                            <div style={{
                                display: 'flex', alignItems: 'baseline',
                                justifyContent: 'space-between', marginBottom: 2,
                            }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, paddingRight: 6 }}>
                                    {stage}
                                </div>
                                <div style={{ fontSize: 10, color: T.inkMuted, fontWeight: 500, flexShrink: 0 }}>
                                    {colOpps.length}
                                </div>
                            </div>
                            <div style={{ fontSize: 11, color: T.inkMuted, fontVariantNumeric: 'tabular-nums' }}>
                                {fmtARR(colTotal)}
                            </div>
                        </div>

                        {/* Cards — each draggable, marginBottom: 8 between them */}
                        <div style={{ minHeight: 80 }}>
                            {colOpps.map(opp => (
                                <div
                                    key={opp.id}
                                    draggable={canEdit}
                                    onDragStart={() => { if (canEdit) setKanbanDragging({ oppId: opp.id, fromStage: stage }); }}
                                    onDragEnd={() => { setKanbanDragging(null); setKanbanDragOver(null); }}
                                    onTouchStart={() => { if (canEdit) setKanbanDragging({ oppId: opp.id, fromStage: stage }); }}
                                    onTouchEnd={() => { setKanbanDragging(null); setKanbanDragOver(null); }}>
                                    <KanbanCard
                                        opp={opp}
                                        isSelected={selectedOpps.includes(opp.id)}
                                        onSelect={toggleSelect}
                                        onOpen={handleEdit}
                                        isDragging={kanbanDragging?.oppId === opp.id}
                                        activities={activities}
                                        selectMode={selectMode}
                                    />
                                </div>
                            ))}

                            {colOpps.length === 0 && (
                                <div style={{
                                    fontSize: 11,
                                    color: isDragOver ? T.inkMid : T.border,
                                    textAlign: 'center',
                                    padding: '20px 0',
                                    fontStyle: 'italic',
                                    transition: 'color 120ms',
                                }}>
                                    {isDragOver ? 'Drop here' : '—'}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
