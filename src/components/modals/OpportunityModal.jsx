import React, { useState, useEffect, useRef } from 'react';
import { stages } from '../../utils/constants';
import { dbFetch } from '../../utils/storage';
import { useApp } from '../../AppContext';
import { useDraggable } from '../../hooks/useDraggable';

// ─────────────────────────────────────────────────────────────
//  Deal History Tab
// ─────────────────────────────────────────────────────────────
function DealHistoryTab({ opportunity, oppActivities, stages, settings, contacts, activityTypeIcon, onSaveActivity, onDeleteActivity, currentUser, onClose, saving, onUpdate }) {
    const [showLogActivity, setShowLogActivity] = React.useState(false);
    const [newActivity, setNewActivity] = React.useState({
        type: 'Call',
        date: [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'),
        notes: ''
    });
    const activityTypes = ['Call', 'Email', 'Meeting', 'Demo', 'Proposal Sent', 'Follow-up', 'Other'];

    // ── Journey map: build ordered stage list with dates from stageHistory ──
    const stageHistory = opportunity.stageHistory || [];
    const allStages = stages && stages.length > 0 ? stages : ['Qualification','Discovery','Evaluation (Demo)','Proposal','Negotiation/Review','Contracts','Closed Won','Closed Lost'];

    // Build a map of stage → first date reached
    const stageDateMap = {};
    if (opportunity.createdDate) {
        const firstStage = stageHistory.length > 0 ? stageHistory[0].prevStage : opportunity.stage;
        if (firstStage) stageDateMap[firstStage] = opportunity.createdDate;
    }
    stageHistory.forEach(h => { if (!stageDateMap[h.stage]) stageDateMap[h.stage] = h.date; });

    // Determine which stages are done/active/future
    const currentStageIdx = allStages.indexOf(opportunity.stage);
    const journeyStages = allStages.map((s, i) => ({
        name: s,
        date: stageDateMap[s] || null,
        status: i < currentStageIdx ? 'done' : i === currentStageIdx ? 'active' : 'future',
    }));

    // ── Swim lane: position activities on a 0-100% timeline ──
    const allDates = [
        opportunity.createdDate,
        ...oppActivities.map(a => a.date),
        ...stageHistory.map(h => h.date),
    ].filter(Boolean).map(d => new Date(d + 'T12:00:00').getTime());
    const minTs = allDates.length ? Math.min(...allDates) : Date.now();
    const maxTs = allDates.length ? Math.max(...allDates) : Date.now() + 86400000;
    const tspan = maxTs - minTs || 1;
    const pct = (dateStr) => Math.max(2, Math.min(96, ((new Date(dateStr + 'T12:00:00').getTime() - minTs) / tspan) * 96 + 2));

    // Group activities by type for swim lanes
    const byType = { Call: [], Email: [], Meeting: [], Demo: [], 'Proposal Sent': [], 'Follow-up': [], Other: [] };
    oppActivities.forEach(a => { const k = byType[a.type] ? a.type : 'Other'; byType[k].push(a); });
    const swimLanes = Object.entries(byType).filter(([, acts]) => acts.length > 0);

    // Stage change events for swim lane
    const stageEvents = stageHistory.map(h => ({ date: h.date, label: `→ ${h.stage}`, prev: h.prevStage, next: h.stage }));
    if (opportunity.createdDate) stageEvents.unshift({ date: opportunity.createdDate, label: 'Deal opened', prev: null, next: allStages[0] });

    // ── Stats ──
    const today = new Date();
    const dealAge = opportunity.createdDate ? Math.floor((today - new Date(opportunity.createdDate + 'T12:00:00')) / 86400000) : null;
    const timeInStage = opportunity.stageChangedDate ? Math.floor((today - new Date(opportunity.stageChangedDate + 'T12:00:00')) / 86400000) : null;
    const actCounts = oppActivities.reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {});

    // Contact engagement
    const contactEngagement = {};
    oppActivities.forEach(a => {
        if (a.contactName) {
            if (!contactEngagement[a.contactName]) contactEngagement[a.contactName] = { calls: 0, emails: 0, meetings: 0, last: a.date };
            if (a.type === 'Call' || a.type === 'Follow-up') contactEngagement[a.contactName].calls++;
            else if (a.type === 'Email' || a.type === 'Proposal Sent') contactEngagement[a.contactName].emails++;
            else contactEngagement[a.contactName].meetings++;
            if (a.date > contactEngagement[a.contactName].last) contactEngagement[a.contactName].last = a.date;
        }
    });
    // Also include contacts listed on the opportunity
    const oppContactNames = (opportunity.contacts || '').split(', ').filter(Boolean).map(c => c.split(' (')[0]);
    oppContactNames.forEach(n => { if (!contactEngagement[n]) contactEngagement[n] = { calls: 0, emails: 0, meetings: 0, last: null }; });

    const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

    const [tooltip, setTooltip] = React.useState(null); // { x, y, title, sub }

    // ── Color helpers ──
    const typeColors = {
        Call: { bg: '#EAF3DE', text: '#3B6D11', dot: '#639922' },
        Email: { bg: '#E6F1FB', text: '#185FA5', dot: '#378ADD' },
        Meeting: { bg: '#EEEDFE', text: '#534AB7', dot: '#7F77DD' },
        Demo: { bg: '#FAEEDA', text: '#854F0B', dot: '#EF9F27' },
        'Proposal Sent': { bg: '#FBEAF0', text: '#993556', dot: '#D4537E' },
        'Follow-up': { bg: '#E1F5EE', text: '#0F6E56', dot: '#1D9E75' },
        Other: { bg: '#F1EFE8', text: '#5F5E5A', dot: '#888780' },
    };

    return (
        <div style={{ paddingBottom: '1rem' }}>

            {/* ── Stats row ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '1.25rem' }}>
                {[
                    { val: dealAge !== null ? `${dealAge}d` : '—', lbl: 'Deal age', color: dealAge > 90 ? '#ef4444' : dealAge > 60 ? '#f59e0b' : '#10b981' },
                    { val: timeInStage !== null ? `${timeInStage}d` : '—', lbl: 'In this stage', color: timeInStage > 30 ? '#ef4444' : timeInStage > 14 ? '#f59e0b' : '#10b981' },
                    { val: oppActivities.length, lbl: 'Activities', color: '#2563eb' },
                    { val: Object.keys(contactEngagement).length, lbl: 'Contacts engaged', color: '#7c3aed' },
                ].map(({ val, lbl, color }) => (
                    <div key={lbl} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
                        <div style={{ fontSize: '1.25rem', fontWeight: '700', color }}>{val}</div>
                        <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '2px' }}>{lbl}</div>
                    </div>
                ))}
            </div>

            {/* ── Journey map + swim lanes — dark panel ── */}
            <div style={{ background: '#1e293b', borderRadius: '10px', padding: '1.25rem', marginBottom: '1.5rem' }}>

            {/* ── Journey map ── */}
            <div style={{ marginBottom: '0.75rem', fontSize: '0.6875rem', fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Deal journey</div>
            {/* ── Journey map (SVG) ── */}
            {(() => {
                const count = journeyStages.length;
                const svgW = 760;
                const padX = 30;
                const trackY = 28;
                const spacing = (svgW - padX * 2) / Math.max(count - 1, 1);
                return (
                    <svg width="100%" viewBox={`0 0 ${svgW} 80`} style={{ display: 'block', marginBottom: oppActivities.length > 0 ? '1.25rem' : '0' }}>
                        {/* Track segments */}
                        {journeyStages.map((s, i) => {
                            if (i === 0) return null;
                            const x1 = padX + (i - 1) * spacing + 8;
                            const x2 = padX + i * spacing - 8;
                            const isDone = journeyStages[i - 1].status === 'done' || journeyStages[i - 1].status === 'active';
                            const color = isDone ? (s.status === 'future' ? 'rgba(255,255,255,0.15)' : '#4ade80') : 'rgba(255,255,255,0.15)';
                            return <rect key={`t-${i}`} x={x1} y={trackY - 2} width={Math.max(x2 - x1, 0)} height={4} rx={2} fill={color} opacity={s.status === 'future' ? 0.4 : 1} />;
                        })}
                        {/* Dots + labels */}
                        {journeyStages.map((s, i) => {
                            const cx = padX + i * spacing;
                            const isDone = s.status === 'done';
                            const isActive = s.status === 'active';
                            const dotFill = isDone ? '#4ade80' : isActive ? '#60a5fa' : 'rgba(255,255,255,0.2)';
                            const labelColor = isDone ? '#86efac' : isActive ? '#93c5fd' : 'rgba(255,255,255,0.3)';
                            const r = isActive ? 9 : 7;
                            return (
                                <g key={`d-${i}`}>
                                    {isActive && <circle cx={cx} cy={trackY} r={13} fill="none" stroke="#3b82f6" strokeWidth={2} opacity={0.5} />}
                                    <circle cx={cx} cy={trackY} r={r} fill={dotFill} />
                                    <text x={cx} y={52} textAnchor="middle" fill={labelColor} fontSize={9} fontWeight={isActive ? '700' : '500'} fontFamily="inherit">
                                        {s.name.length > 12 ? s.name.replace('/', '/\u200B') : s.name}
                                    </text>
                                    {s.date && <text x={cx} y={65} textAnchor="middle" fill="rgba(255,255,255,0.25)" fontSize={8} fontFamily="inherit">{fmtDate(s.date)}</text>}
                                </g>
                            );
                        })}
                    </svg>
                );
            })()}

            {/* ── Activity swim lanes ── */}
            {oppActivities.length > 0 && (
                <>
                <div style={{ marginBottom: '0.5rem', fontSize: '0.6875rem', fontWeight: '700', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Activity map</div>
                <div style={{ position: 'relative', marginBottom: '0' }}>
                    {/* Stage change row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '10px' }}>
                        <div style={{ width: '72px', fontSize: '0.625rem', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>Stages</div>
                        <div style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.12)', borderRadius: '1px', position: 'relative' }}>
                            {stageEvents.map((ev, i) => (
                                <div key={i}
                                    style={{ position: 'absolute', left: `${pct(ev.date)}%`, top: '50%', transform: 'translate(-50%,-50%) rotate(45deg)', width: '10px', height: '10px', background: 'rgba(255,255,255,0.55)', borderRadius: '2px', cursor: 'pointer', border: '1.5px solid #1e293b' }}
                                    title={`${ev.label} · ${fmtDate(ev.date)}`}
                                    onMouseEnter={() => setTooltip({ title: ev.label, sub: fmtDate(ev.date) })}
                                    onMouseLeave={() => setTooltip(null)}
                                />
                            ))}
                        </div>
                    </div>
                    {/* Activity type lanes */}
                    {swimLanes.map(([type, acts]) => {
                        const c = typeColors[type] || typeColors.Other;
                        return (
                            <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0', marginBottom: '10px' }}>
                                <div style={{ width: '72px', fontSize: '0.625rem', color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{type}</div>
                                <div style={{ flex: 1, height: '2px', background: 'rgba(255,255,255,0.12)', borderRadius: '1px', position: 'relative' }}>
                                    {acts.map((act, i) => (
                                        <div key={i}
                                            style={{ position: 'absolute', left: `${pct(act.date)}%`, top: '50%', transform: 'translate(-50%,-50%)', width: '12px', height: '12px', borderRadius: '50%', background: c.dot, border: '2px solid #1e293b', cursor: 'pointer' }}
                                            onMouseEnter={() => setTooltip({ title: `${act.type} · ${fmtDate(act.date)}`, sub: act.notes ? act.notes.slice(0, 60) + (act.notes.length > 60 ? '…' : '') : '' })}
                                            onMouseLeave={() => setTooltip(null)}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {/* Tooltip */}
                    {tooltip && (
                        <div style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: '80px', background: '#0f172a', color: '#fff', borderRadius: '6px', padding: '6px 10px', fontSize: '0.75rem', pointerEvents: 'none', zIndex: 50, maxWidth: '260px', whiteSpace: 'normal', lineHeight: 1.4, border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div style={{ fontWeight: '700' }}>{tooltip.title}</div>
                            {tooltip.sub && <div style={{ opacity: 0.65, marginTop: '2px' }}>{tooltip.sub}</div>}
                        </div>
                    )}
                    {/* Legend */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px', paddingLeft: '72px' }}>
                        {swimLanes.map(([type]) => {
                            const c = typeColors[type] || typeColors.Other;
                            return (
                                <span key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)' }}>
                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: c.dot, display: 'inline-block' }} />
                                    {type}
                                </span>
                            );
                        })}
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)' }}>
                            <span style={{ width: '8px', height: '8px', background: 'rgba(255,255,255,0.5)', display: 'inline-block', transform: 'rotate(45deg)', borderRadius: '1px' }} />
                            Stage change
                        </span>
                    </div>
                </div>
                </>
            )}

            </div>{/* end dark panel */}

            {/* ── Activity timeline feed ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Activity history {oppActivities.length > 0 && <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '999px', padding: '0.1rem 0.45rem', fontSize: '0.625rem', marginLeft: '4px' }}>{oppActivities.length}</span>}
                </div>
                <button type="button" onClick={() => setShowLogActivity(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.3rem 0.75rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                    + Log Activity
                </button>
            </div>

            {/* Quick-log form */}
            {showLogActivity && (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '1rem', marginBottom: '0.875rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>Type</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                {activityTypes.map(t => (
                                    <button key={t} type="button" onClick={() => setNewActivity(a => ({ ...a, type: t }))}
                                        style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', fontFamily: 'inherit', fontSize: '0.6875rem', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s',
                                            border: '1px solid ' + (newActivity.type === t ? '#2563eb' : '#e2e8f0'),
                                            background: newActivity.type === t ? '#eff6ff' : '#fff',
                                            color: newActivity.type === t ? '#2563eb' : '#64748b' }}>
                                        {activityTypeIcon[t] || '📝'} {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>Date</div>
                            <input type="date" value={newActivity.date}
                                onChange={e => setNewActivity(a => ({ ...a, date: e.target.value }))}
                                style={{ width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                    </div>
                    <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>Notes</div>
                        <textarea value={newActivity.notes}
                            onChange={e => setNewActivity(a => ({ ...a, notes: e.target.value }))}
                            placeholder="What happened? Key takeaways, next actions..."
                            rows={3}
                            style={{ width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: '1.5' }} />
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button type="button" onClick={() => setShowLogActivity(false)}
                            style={{ padding: '0.4rem 0.875rem', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                        <button type="button" onClick={() => {
                            if (!newActivity.type) return;
                            onSaveActivity && onSaveActivity({ ...newActivity, opportunityId: opportunity.id, companyName: opportunity.account || '' });
                            setNewActivity({ type: 'Call', date: [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'), notes: '' });
                            setShowLogActivity(false);
                        }}
                            style={{ padding: '0.4rem 0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>Save Activity</button>
                    </div>
                </div>
            )}

            {/* Activity feed — combined activities + stage changes, sorted newest first */}
            {oppActivities.length === 0 && !showLogActivity ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8', fontSize: '0.8125rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                    No activities logged yet. Click <strong>+ Log Activity</strong> to start tracking this deal's history.
                </div>
            ) : (
                <div style={{ position: 'relative', paddingLeft: '28px' }}>
                    {/* Vertical line */}
                    <div style={{ position: 'absolute', left: '9px', top: '6px', bottom: '6px', width: '1.5px', background: '#e2e8f0' }} />

                    {/* Build merged timeline: activities + stage changes */}
                    {(() => {
                        const items = [
                            ...oppActivities.map(a => ({ ...a, _type: 'activity' })),
                            ...stageHistory.map(h => ({ ...h, _type: 'stage', date: h.date })),
                        ].sort((a, b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00'));

                        return items.map((item, i) => {
                            if (item._type === 'stage') {
                                return (
                                    <div key={`stage-${i}`} style={{ position: 'relative', marginBottom: '12px' }}>
                                        <div style={{ position: 'absolute', left: '-28px', top: '2px', width: '18px', height: '18px', background: '#f1f5f9', border: '1.5px solid #e2e8f0', borderRadius: '3px', transform: 'rotate(45deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} />
                                        <div style={{ background: 'none', border: '1px dashed #e2e8f0', borderRadius: '8px', padding: '7px 12px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '999px', background: '#f1f5f9', color: '#64748b', fontWeight: '500' }}>{item.prevStage || '—'}</span>
                                            <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>→</span>
                                            <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '999px', background: '#eff6ff', color: '#2563eb', fontWeight: '600' }}>{item.stage}</span>
                                            <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', color: '#94a3b8' }}>{fmtDate(item.date)}</span>
                                        </div>
                                    </div>
                                );
                            }
                            const c = typeColors[item.type] || typeColors.Other;
                            return (
                                <div key={item.id || `act-${i}`} style={{ position: 'relative', marginBottom: '12px' }}>
                                    <div style={{ position: 'absolute', left: '-28px', top: '6px', width: '18px', height: '18px', borderRadius: '50%', background: c.bg, border: `1.5px solid ${c.dot}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '700', color: c.text }}>
                                        {item.type === 'Call' ? 'C' : item.type === 'Email' ? 'E' : item.type === 'Meeting' ? 'M' : item.type === 'Demo' ? 'D' : item.type === 'Proposal Sent' ? 'P' : item.type === 'Follow-up' ? 'F' : '•'}
                                    </div>
                                    <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '8px', padding: '10px 12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: item.notes ? '4px' : '0' }}>
                                            <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#1e293b' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                    <span style={{ background: c.bg, color: c.text, borderRadius: '4px', padding: '1px 7px', fontSize: '0.6875rem', fontWeight: '700' }}>{item.type}</span>
                                                    {item.contactName && <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>· {item.contactName}</span>}
                                                </span>
                                            </span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '8px' }}>
                                                <span style={{ fontSize: '0.6875rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(item.date)}</span>
                                                {onDeleteActivity && (
                                                    <button type="button" onClick={() => onDeleteActivity(item.id)}
                                                        style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', fontSize: '0.8125rem', padding: 0, lineHeight: 1 }}
                                                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                                        onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}>✕</button>
                                                )}
                                            </div>
                                        </div>
                                        {item.notes && (
                                            <div style={{ fontSize: '0.8125rem', color: '#475569', lineHeight: '1.45', wordBreak: 'break-word' }}>{item.notes}</div>
                                        )}
                                    </div>
                                </div>
                            );
                        });
                    })()}
                </div>
            )}

            {/* ── Cancel / Update buttons ── */}
            <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0' }}>
                <button type="button" onClick={onClose}
                    style={{ padding: '0.5rem 1.25rem', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                </button>
                <button type="button" onClick={() => onUpdate && onUpdate()}
                    style={{ padding: '0.5rem 1.25rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {saving && <span style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                    {saving ? 'Saving…' : 'Update'}
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  AI Score Tab
// ─────────────────────────────────────────────────────────────
function AiScoreTab({ opportunity, oppActivities, currentUser, onClose, onUpdate }) {
    const [score, setScore] = React.useState(opportunity.aiScore || null);
    const [scoreHistory, setScoreHistory] = React.useState(opportunity.aiScoreHistory || []);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState(null);

    // Auto-load if no cached score exists
    React.useEffect(() => {
        if (!score) fetchScore(false);
    }, []);

    const fetchScore = async (forceRefresh = false) => {
        setLoading(true); setError(null);
        try {
            const res = await dbFetch('/.netlify/functions/ai-score', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ opportunityId: opportunity.id, forceRefresh }),
            });
            const data = await res.json();
            if (data.disabled) {
                setError('AI scoring is disabled. Enable it in Settings → AI Features.');
            } else {
                // Append previous score to history before replacing
                if (forceRefresh && score && score.score !== undefined) {
                    const histEntry = { score: score.score, verdict: score.verdict, scoredAt: score.scoredAt };
                    setScoreHistory(prev => {
                        const updated = [histEntry, ...prev].slice(0, 10);
                        opportunity.aiScoreHistory = updated;
                        return updated;
                    });
                }
                setScore(data);
            }
        } catch (err) {
            setError('Failed to generate score: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const verdictConfig = {
        'Strong':   { color: '#27500A', bg: '#EAF3DE', border: '#C0DD97', bar: '#639922' },
        'On Track': { color: '#185FA5', bg: '#E6F1FB', border: '#B5D4F4', bar: '#378ADD' },
        'At Risk':  { color: '#854F0B', bg: '#FAEEDA', border: '#FAC775', bar: '#BA7517' },
        'Critical': { color: '#A32D2D', bg: '#FCEBEB', border: '#F7C1C1', bar: '#E24B4A' },
    };
    const sentimentConfig = {
        positive: { dot: '#639922', bg: '#EAF3DE', text: '#27500A' },
        warning:  { dot: '#BA7517', bg: '#FAEEDA', text: '#854F0B' },
        negative: { dot: '#E24B4A', bg: '#FCEBEB', text: '#A32D2D' },
    };

    const vc = score?.verdict ? verdictConfig[score.verdict] || verdictConfig['At Risk'] : null;
    const scoredAge = score?.scoredAt
        ? Math.floor((Date.now() - new Date(score.scoredAt).getTime()) / 60000)
        : null;
    const ageLabel = scoredAge !== null
        ? scoredAge < 60 ? `${scoredAge}m ago` : scoredAge < 1440 ? `${Math.floor(scoredAge/60)}h ago` : `${Math.floor(scoredAge/1440)}d ago`
        : null;

    return (
        <div style={{ padding: '0.25rem 0 1rem' }}>
            {/* Loading */}
            {loading && (
                <div style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🤖</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>Analyzing deal health…</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Claude is reviewing activity history, stage velocity, and contact engagement</div>
                </div>
            )}

            {/* Error */}
            {!loading && error && (
                <div style={{ textAlign: 'center', padding: '2rem' }}>
                    <div style={{ fontSize: '0.875rem', color: '#ef4444', marginBottom: '1rem' }}>{error}</div>
                    <button onClick={() => fetchScore(false)} style={{ fontSize: '0.8125rem', padding: '0.5rem 1.25rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#f8fafc', color: '#1e293b', cursor: 'pointer', fontFamily: 'inherit' }}>Try again</button>
                </div>
            )}

            {/* Score display */}
            {!loading && !error && score && vc && (
                <div>
                    {/* Header row — score ring + verdict + headline */}
                    <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start', padding: '1rem 1.25rem', background: vc.bg, border: `1px solid ${vc.border}`, borderRadius: '10px', marginBottom: '1rem' }}>
                        {/* Score ring */}
                        <div style={{ position: 'relative', width: '72px', height: '72px', flexShrink: 0 }}>
                            <svg width="72" height="72" viewBox="0 0 72 72">
                                <circle cx="36" cy="36" r="30" fill="none" stroke={vc.border} strokeWidth="6"/>
                                <circle cx="36" cy="36" r="30" fill="none" stroke={vc.bar} strokeWidth="6"
                                    strokeDasharray={`${(score.score/100)*188} 188`}
                                    strokeDashoffset="47" strokeLinecap="round"/>
                            </svg>
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ fontSize: '18px', fontWeight: '700', color: vc.color, lineHeight: 1 }}>{score.score}</div>
                                <div style={{ fontSize: '9px', fontWeight: '600', color: vc.color, opacity: 0.7, marginTop: '1px' }}>/100</div>
                            </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: '700', color: vc.color, background: '#fff', padding: '2px 10px', borderRadius: '999px', border: `1px solid ${vc.border}` }}>{score.verdict}</span>
                                {ageLabel && <span style={{ fontSize: '0.6875rem', color: vc.color, opacity: 0.7 }}>Scored {ageLabel}</span>}
                                {score.fromCache && <span style={{ fontSize: '0.6875rem', color: vc.color, opacity: 0.6 }}>· cached</span>}
                            </div>
                            <div style={{ fontSize: '0.875rem', fontWeight: '600', color: vc.color, lineHeight: 1.4 }}>{score.headline}</div>
                        </div>
                    </div>

                    {/* Signals */}
                    {score.signals?.length > 0 && (
                        <div style={{ marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Signals</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {score.signals.map((sig, i) => {
                                    const sc = sentimentConfig[sig.sentiment] || sentimentConfig.warning;
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 12px', background: sc.bg, borderRadius: '8px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: sc.dot, flexShrink: 0, marginTop: '4px' }}/>
                                            <div style={{ fontSize: '0.8125rem', color: sc.text, lineHeight: 1.5 }}>{sig.text}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Recommendation */}
                    {score.recommendation && (
                        <div style={{ marginBottom: '1rem', padding: '0.875rem 1rem', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: '1rem', flexShrink: 0, lineHeight: 1 }}>→</div>
                            <div>
                                <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>Recommended next action</div>
                                <div style={{ fontSize: '0.875rem', color: '#1e293b', fontWeight: '500', lineHeight: 1.5 }}>{score.recommendation}</div>
                            </div>
                        </div>
                    )}

                    {/* Refresh button + disclaimer */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '0.6875rem', color: '#94a3b8', lineHeight: 1.5 }}>
                            Powered by Claude AI · Deal data is sent to Anthropic's API to generate this score
                        </div>
                        <button
                            onClick={() => fetchScore(true)}
                            style={{ fontSize: '0.75rem', padding: '0.375rem 1rem', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#fff', color: '#475569', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            ↻ Refresh score
                        </button>
                    </div>
                    {/* Score history */}
                    {scoreHistory.length > 0 && (
                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #f1f5f9' }}>
                            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Score history</div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {scoreHistory.map((h, i) => {
                                    const hvc = verdictConfig[h.verdict] || verdictConfig['At Risk'];
                                    const delta = i < scoreHistory.length - 1
                                        ? h.score - scoreHistory[i + 1].score
                                        : score ? h.score - score.score : null;
                                    const currentDelta = i === 0 && score ? score.score - h.score : null;
                                    const ageLabel = h.scoredAt ? (() => {
                                        const m = Math.floor((Date.now() - new Date(h.scoredAt).getTime()) / 60000);
                                        return m < 60 ? m + 'm ago' : m < 1440 ? Math.floor(m/60) + 'h ago' : Math.floor(m/1440) + 'd ago';
                                    })() : null;
                                    return (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', background: hvc.bg, border: `0.5px solid ${hvc.border}`, borderRadius: '6px' }}>
                                            <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: hvc.color }}>{h.score}</span>
                                            <span style={{ fontSize: '0.6875rem', color: hvc.color, opacity: 0.75 }}>{h.verdict}</span>
                                            {ageLabel && <span style={{ fontSize: '0.625rem', color: '#94a3b8' }}>· {ageLabel}</span>}
                                        </div>
                                    );
                                })}
                            </div>
                            {scoreHistory.length > 0 && score && (() => {
                                const oldest = scoreHistory[scoreHistory.length - 1];
                                const delta = score.score - oldest.score;
                                const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
                                const col = delta > 0 ? '#27500A' : delta < 0 ? '#A32D2D' : '#64748b';
                                const bg  = delta > 0 ? '#EAF3DE' : delta < 0 ? '#FCEBEB' : '#f8fafc';
                                return (
                                    <div style={{ marginTop: '6px', fontSize: '0.75rem', fontWeight: '600', color: col, background: bg, padding: '4px 10px', borderRadius: '6px', display: 'inline-block' }}>
                                        {arrow} {Math.abs(delta)} pts vs first scored
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {/* Cancel / Update buttons */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                        <button type="button" onClick={onClose}
                            style={{ padding: '0.5rem 1.25rem', border: '1px solid #e2e8f0', borderRadius: '7px', background: '#fff', color: '#64748b', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Cancel
                        </button>
                        <button type="button" onClick={() => onUpdate && onUpdate()}
                            style={{ padding: '0.5rem 1.5rem', border: 'none', borderRadius: '7px', background: '#2563eb', color: '#fff', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Update
                        </button>
                    </div>
                </div>
            )}

            {/* Empty state — no score yet, not loading */}
            {!loading && !error && !score && (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🤖</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>No score yet</div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '1.25rem' }}>Generate an AI health assessment for this deal</div>
                    <button onClick={() => fetchScore(false)}
                        style={{ fontSize: '0.875rem', padding: '0.5rem 1.5rem', border: 'none', borderRadius: '8px', background: '#2563eb', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: '600' }}>
                        Score this deal
                    </button>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0' }}>
                        <button type="button" onClick={onClose}
                            style={{ padding: '0.5rem 1.25rem', border: '1px solid #e2e8f0', borderRadius: '7px', background: '#fff', color: '#64748b', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Cancel
                        </button>
                        <button type="button" onClick={() => onUpdate && onUpdate()}
                            style={{ padding: '0.5rem 1.5rem', border: 'none', borderRadius: '7px', background: '#2563eb', color: '#fff', fontSize: '0.875rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Update
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  Contact Engagement Tab
// ─────────────────────────────────────────────────────────────
function ContactEngagementTab({ opportunity, oppActivities, contacts, onClose, onUpdate, saving }) {
    const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

    // Build engagement map
    const contactEngagement = {};
    oppActivities.forEach(a => {
        if (a.contactName) {
            if (!contactEngagement[a.contactName]) contactEngagement[a.contactName] = { calls: 0, emails: 0, meetings: 0, demos: 0, other: 0, last: a.date, firstContact: a.date };
            if (a.type === 'Call' || a.type === 'Follow-up') contactEngagement[a.contactName].calls++;
            else if (a.type === 'Email' || a.type === 'Proposal Sent') contactEngagement[a.contactName].emails++;
            else if (a.type === 'Meeting') contactEngagement[a.contactName].meetings++;
            else if (a.type === 'Demo') contactEngagement[a.contactName].demos++;
            else contactEngagement[a.contactName].other++;
            if (a.date > contactEngagement[a.contactName].last) contactEngagement[a.contactName].last = a.date;
            if (a.date < contactEngagement[a.contactName].firstContact) contactEngagement[a.contactName].firstContact = a.date;
        }
    });
    // Add contacts listed on the opp with no activities
    (opportunity.contacts || '').split(', ').filter(Boolean).forEach(n => {
        const name = n.split(' (')[0];
        if (!contactEngagement[name]) contactEngagement[name] = { calls: 0, emails: 0, meetings: 0, demos: 0, other: 0, last: null, firstContact: null };
    });

    const entries = Object.entries(contactEngagement);
    const typeColors = ['#2563eb','#7c3aed','#059669','#d97706','#dc2626','#0891b2'];
    const avatarColor = (name) => typeColors[name.charCodeAt(0) % typeColors.length];

    // Find full contact record for role info
    const findContact = (name) => (contacts || []).find(c => `${c.firstName} ${c.lastName}` === name || `${c.firstName} ${c.lastName}`.startsWith(name.split(' ')[0]));

    return (
        <div style={{ paddingBottom: '1rem' }}>
            {entries.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8', fontSize: '0.875rem', background: '#f8fafc', borderRadius: '10px', border: '1px dashed #e2e8f0' }}>
                    No contacts linked to this deal yet. Add contacts on the Details tab or log activities with contact names.
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {entries.sort((a, b) => {
                        const totalA = a[1].calls + a[1].emails + a[1].meetings + a[1].demos + a[1].other;
                        const totalB = b[1].calls + b[1].emails + b[1].meetings + b[1].demos + b[1].other;
                        return totalB - totalA;
                    }).map(([name, eng]) => {
                        const total = eng.calls + eng.emails + eng.meetings + eng.demos + eng.other;
                        const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                        const color = avatarColor(name);
                        const contactRec = findContact(name);
                        return (
                            <div key={name} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px' }}>
                                {/* Header row */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: total > 0 ? '12px' : 0 }}>
                                    <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '700', flexShrink: 0 }}>{initials}</div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1e293b' }}>{name}</div>
                                        {contactRec?.title && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '1px' }}>{contactRec.title}{contactRec.company ? ` · ${contactRec.company}` : ''}</div>}
                                        {total === 0 && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px', fontStyle: 'italic' }}>No interactions logged yet</div>}
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: '1.125rem', fontWeight: '700', color: total > 0 ? '#1e293b' : '#cbd5e1' }}>{total}</div>
                                        <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>interactions</div>
                                    </div>
                                </div>
                                {/* Breakdown + dates */}
                                {total > 0 && (
                                    <div style={{ paddingLeft: '48px' }}>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                            {[
                                                { key: 'calls', label: 'Calls', bg: '#EAF3DE', text: '#3B6D11' },
                                                { key: 'emails', label: 'Emails', bg: '#E6F1FB', text: '#185FA5' },
                                                { key: 'meetings', label: 'Meetings', bg: '#EEEDFE', text: '#534AB7' },
                                                { key: 'demos', label: 'Demos', bg: '#FAEEDA', text: '#854F0B' },
                                                { key: 'other', label: 'Other', bg: '#F1EFE8', text: '#5F5E5A' },
                                            ].filter(t => eng[t.key] > 0).map(t => (
                                                <span key={t.key} style={{ padding: '2px 10px', borderRadius: '999px', background: t.bg, color: t.text, fontSize: '0.75rem', fontWeight: '600' }}>
                                                    {eng[t.key]} {t.label.toLowerCase()}
                                                </span>
                                            ))}
                                        </div>
                                        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.6875rem', color: '#94a3b8' }}>
                                            {eng.firstContact && <span>First contact: <strong style={{ color: '#64748b' }}>{fmtDate(eng.firstContact)}</strong></span>}
                                            {eng.last && <span>Last activity: <strong style={{ color: '#64748b' }}>{fmtDate(eng.last)}</strong></span>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Cancel / Update buttons ── */}
            <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #e2e8f0' }}>
                <button type="button" onClick={onClose}
                    style={{ padding: '0.5rem 1.25rem', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                </button>
                <button type="button" onClick={() => onUpdate && onUpdate()}
                    style={{ padding: '0.5rem 1.25rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {saving && <span style={{ width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                    {saving ? 'Saving…' : 'Update'}
                </button>
            </div>
        </div>
    );
}


// ─── OppQuotesPanel ──────────────────────────────────────────────────────────
// Shown inside the Opportunity modal's Quotes tab.
// Displays existing quotes for this opp + a "Build Quote" button that deep-links
// into the Quotes tab with this opportunity pre-selected.

function OppQuotesPanel({ opportunity, contacts, onClose }) {
    const { quotes, opportunities, setActiveTab, setQuotesDeepLinkOppId } = useApp();

    const oppQuotes = React.useMemo(() =>
        (quotes || [])
            .filter(q => q.opportunityId === opportunity?.id)
            .sort((a, b) => (b.version || 1) - (a.version || 1)),
        [quotes, opportunity?.id]
    );

    const fmtCurrency = (v) => v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

    const statusColors = {
        'Draft':            { bg: '#f1f5f9', color: '#64748b' },
        'Pending Approval': { bg: '#fef3c7', color: '#d97706' },
        'Approved':         { bg: '#dcfce7', color: '#16a34a' },
        'Sent to Customer': { bg: '#dbeafe', color: '#2563eb' },
        'Accepted':         { bg: '#d1fae5', color: '#059669' },
        'Rejected / Lost':  { bg: '#fee2e2', color: '#dc2626' },
    };

    const handleNavigate = () => {
        if (setQuotesDeepLinkOppId) setQuotesDeepLinkOppId(opportunity?.id);
        if (setActiveTab) setActiveTab('quotes');
        if (onClose) onClose();
    };

    // Pre-fill context for the primary contact on this opp
    const primaryContact = React.useMemo(() => {
        const contactNames = (opportunity?.contacts || '').split(', ').filter(Boolean);
        if (!contactNames.length) return null;
        const firstName = contactNames[0].split(' (')[0];
        return (contacts || []).find(c => `${c.firstName} ${c.lastName}` === firstName) || null;
    }, [opportunity, contacts]);

    return (
        <div style={{ padding: '0.5rem 0' }}>
            {/* Opp / account / contact summary strip */}
            <div style={{ background: '#f8f6f3', border: '1px solid #e8e3da', borderRadius: '10px', padding: '0.875rem 1.125rem', marginBottom: '1.25rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: '600', color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Opportunity</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1c1917' }}>{opportunity?.opportunityName || opportunity?.account || '—'}</div>
                </div>
                <div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: '600', color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Account</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#44403c' }}>{opportunity?.account || '—'}</div>
                </div>
                {primaryContact && (
                    <div>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '600', color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Primary Contact</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: '600', color: '#44403c' }}>{primaryContact.firstName} {primaryContact.lastName}{primaryContact.title ? ` · ${primaryContact.title}` : ''}</div>
                    </div>
                )}
                <div>
                    <div style={{ fontSize: '0.6875rem', fontWeight: '600', color: '#a8a29e', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Est. ARR</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1c1917' }}>{fmtCurrency(opportunity?.arr)}</div>
                </div>
            </div>

            {/* Quote list */}
            {oppQuotes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#94a3b8', fontSize: '0.875rem' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
                    <div style={{ fontWeight: '600', marginBottom: '0.25rem', color: '#64748b' }}>No quotes yet</div>
                    <div>Click below to open the Quote Builder for this opportunity.</div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                    {oppQuotes.map(q => {
                        const sc = statusColors[q.status] || { bg: '#f1f5f9', color: '#64748b' };
                        return (
                            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#fff', border: '1px solid #e8e3da', borderRadius: '8px' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#1c1917' }}>{q.name || q.quoteNumber} <span style={{ fontWeight: '400', color: '#94a3b8' }}>v{q.version || 1}</span></div>
                                    {q.updatedAt && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '1px' }}>Updated {new Date(q.updatedAt).toLocaleDateString()}</div>}
                                </div>
                                <span style={{ background: sc.bg, color: sc.color, fontSize: '0.6875rem', fontWeight: '700', padding: '0.2rem 0.6rem', borderRadius: '999px', whiteSpace: 'nowrap' }}>{q.status}</span>
                                <div style={{ fontWeight: '700', fontSize: '0.9375rem', color: '#1c1917', flexShrink: 0 }}>{fmtCurrency(q.total ?? q.subtotal)}</div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Navigate button */}
            <button onClick={handleNavigate} style={{ width: '100%', background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '10px', padding: '0.75rem', fontSize: '0.9375rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                📋 {oppQuotes.length === 0 ? 'Build First Quote' : 'Open in Quote Builder'} →
            </button>
        </div>
    );
}

export default function OpportunityModal({ opportunity, accounts, contacts, settings, pipelines, activePipelineId, currentUser, activities, onSaveActivity, onDeleteActivity, onSaveComment, onEditComment, onDeleteComment, onClose, onSave, onAddAccount, onSaveNewContact, onSaveNewAccount, onAddContact, lastCreatedAccountName, onAddRep, lastCreatedRepName, errorMessage, onDismissError, saving }) {
    const stages = (settings.funnelStages && settings.funnelStages.length > 0)
        ? settings.funnelStages.filter(s => s.name.trim()).map(s => s.name)
        : ['Qualification', 'Discovery', 'Evaluation (Demo)', 'Proposal', 'Negotiation/Review', 'Contracts', 'Closed Won', 'Closed Lost'];
    const allPipelines = (pipelines && pipelines.length > 0) ? pipelines : [{ id: 'default', name: 'New Business', color: '#2563eb' }];
    // Field-level visibility (mirrors App-level helper)
    const modalUserRecord = (settings.users || []).find(u => u.name === currentUser);
    const modalUserRole = modalUserRecord ? (modalUserRecord.userType || 'User') : (settings.users || []).length === 0 ? 'Admin' : 'User';
    const canViewField = (fieldKey) => {
        const fv = settings.fieldVisibility || {};
        const rules = fv[fieldKey];
        if (!rules) return true;
        return rules[modalUserRole] !== false;
    };
    const [formData, setFormData] = useState(() => {
        const base = opportunity || {
            opportunityName: '',
            account: '',
            site: '',
            salesRep: '',
            painPoints: '',
            contacts: '',
            stage: 'Qualification',
            probability: null,
            arr: 0,
            implementationCost: 0,
            forecastedCloseDate: [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'),
            products: '',
            unionized: 'No',
            notes: '',
            nextSteps: '',
            pipelineId: activePipelineId || 'default'
        };
        return {
            ...base,
            // Guarantee no null/undefined ever reaches a controlled input
            opportunityName: base.opportunityName ?? '',
            account:         base.account ?? '',
            site:            base.site ?? '',
            salesRep:        base.salesRep ?? '',
            painPoints:      base.painPoints ?? '',
            contacts:        base.contacts ?? '',
            stage:           base.stage ?? 'Qualification',
            notes:           base.notes ?? '',
            nextSteps:       base.nextSteps ?? '',
            products:        base.products ?? '',
            unionized:       base.unionized ?? 'No',
            forecastedCloseDate: base.forecastedCloseDate ?? [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'),
            pipelineId:      base.pipelineId ?? activePipelineId ?? 'default',
            arr:             parseFloat(base.arr) || 0,
            implementationCost: parseFloat(base.implementationCost) || 0,
            productRevenues: (base.productRevenues && typeof base.productRevenues === 'object') ? base.productRevenues : {},
        };
    });

    // Compute total deal size from per-product revenues
    const computedArr = (() => {
        const revs = formData.productRevenues || {};
        const selectedProducts = formData.products ? formData.products.split(',').map(p => p.trim()).filter(Boolean) : [];
        if (selectedProducts.length === 0) return parseFloat(formData.arr) || 0;
        const total = selectedProducts.reduce((sum, p) => sum + (parseFloat(revs[p]) || 0), 0);
        return total;
    })();

    const [contactSearch, setContactSearch] = useState('');
    const [showContactSuggestions, setShowContactSuggestions] = useState(false);
    const [accountSearch, setAccountSearch] = useState(opportunity?.account || '');
    const [showAccountSuggestions, setShowAccountSuggestions] = useState(false);
    const [siteSearch, setSiteSearch] = useState(opportunity?.site || '');
    const [showSiteSuggestions, setShowSiteSuggestions] = useState(false);
    const [repSearch, setRepSearch] = useState(opportunity?.salesRep || '');
    const [showRepSuggestions, setShowRepSuggestions] = useState(false);

    // Auto-populate account when a new one is created
    useEffect(() => {
        if (lastCreatedAccountName) {
            setAccountSearch(lastCreatedAccountName);
            setFormData(prev => ({ ...prev, account: lastCreatedAccountName }));
        }
    }, [lastCreatedAccountName]);

    // Auto-populate sales rep when a new one is created
    useEffect(() => {
        if (lastCreatedRepName) {
            setRepSearch(lastCreatedRepName);
            setFormData(prev => ({ ...prev, salesRep: lastCreatedRepName }));
        }
    }, [lastCreatedRepName]);
    const [selectedContacts, setSelectedContacts] = useState(
        opportunity?.contacts ? opportunity.contacts.split(', ').filter(c => c) : []
    );
    const [selectedContactIds, setSelectedContactIds] = useState(
        opportunity?.contactIds || []
    );
    const [nestedModal, setNestedModal] = useState(null);
    const [validationErrors, setValidationErrors] = useState({});
    const [productSearch, setProductSearch] = useState('');
    const [showProductDropdown, setShowProductDropdown] = useState(false);

    // Auto-calculate close quarter based on forecasted close date and fiscal year settings
    const calculateCloseQuarter = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const month = date.getMonth() + 1; // 1-12
        const year = date.getFullYear();
        const fiscalStart = settings?.fiscalYearStart || 10;
        
        // Calculate which quarter this month falls into
        // Quarter 1 starts at fiscalStart, Quarter 2 starts 3 months later, etc.
        let monthsFromFiscalStart = month - fiscalStart;
        if (monthsFromFiscalStart < 0) {
            monthsFromFiscalStart += 12; // Wrap around to previous fiscal year
        }
        
        // Determine quarter (0-2 = Q1, 3-5 = Q2, 6-8 = Q3, 9-11 = Q4)
        const quarter = Math.floor(monthsFromFiscalStart / 3) + 1;
        
        // Determine fiscal year
        let fiscalYear;
        if (month >= fiscalStart) {
            fiscalYear = year + 1;
        } else {
            fiscalYear = year;
        }
        
        return `FY${fiscalYear} Q${quarter}`;
    };

    const closeQuarter = calculateCloseQuarter(formData.forecastedCloseDate);

    // Build flat account options list — all tiers, using parentAccountId
    const allAccountOptions = [];
    const topLevel = (accounts || []).filter(a => !a.parentAccountId);
    topLevel.forEach(account => {
        allAccountOptions.push({ value: account.name, label: account.name, tier: 'account', id: account.id });
        const bus = (accounts || []).filter(a => a.parentAccountId === account.id);
        bus.forEach(bu => {
            allAccountOptions.push({ value: bu.name, label: `${account.name} › ${bu.name}`, tier: 'business_unit', id: bu.id, parentName: account.name });
            const sites = (accounts || []).filter(a => a.parentAccountId === bu.id);
            sites.forEach(site => {
                allAccountOptions.push({ value: site.name, label: `${account.name} › ${bu.name} › ${site.name}`, tier: 'site', id: site.id, parentName: bu.name });
            });
        });
        // Sites directly under the account (no BU layer)
        const directSites = (accounts || []).filter(a => a.parentAccountId === account.id && a.accountTier === 'site');
        directSites.forEach(site => {
            if (!allAccountOptions.find(o => o.id === site.id)) {
                allAccountOptions.push({ value: site.name, label: `${account.name} › ${site.name}`, tier: 'site', id: site.id, parentName: account.name });
            }
        });
    });

    // Get sites available for the currently selected account
    // Works regardless of whether accountTier is set — uses parentAccountId depth
    const getSitesForAccount = (accountName) => {
        if (!accountName) return [];
        const matched = (accounts || []).find(a => a.name.toLowerCase() === accountName.toLowerCase());
        if (!matched) return [];
        // Any child of this account that is itself a leaf (has no children) or has accountTier==='site'
        const directChildren = (accounts || []).filter(a => a.parentAccountId === matched.id);
        // If matched is a BU (has a parent itself), its direct children are sites
        if (matched.parentAccountId) {
            return directChildren; // all children of a BU are sites
        }
        // Matched is a top-level account — direct children that are sites (have accountTier==='site' OR are leaves)
        const directSites = directChildren.filter(a =>
            a.accountTier === 'site' ||
            !(accounts || []).some(x => x.parentAccountId === a.id) // leaf = no children
        );
        // Also get sites under BUs
        const bus = directChildren.filter(a =>
            a.accountTier === 'business_unit' ||
            (accounts || []).some(x => x.parentAccountId === a.id) // has children = BU
        );
        const viaBU = bus.flatMap(bu => (accounts || []).filter(a => a.parentAccountId === bu.id));
        return [...directSites, ...viaBU];
    };

    const handleChange = (field, value) => {
        if (validationErrors[field]) setValidationErrors(prev => { const n = {...prev}; delete n[field]; return n; });
        if (field === 'stage') {
            const stageDefault = (settings?.funnelStages || []).find(s => s.name === value);
            const defaultProb = stageDefault ? stageDefault.weight : null;
            const prevStageDefault = (settings?.funnelStages || []).find(s => s.name === formData.stage);
            const prevDefaultProb = prevStageDefault ? prevStageDefault.weight : null;
            const probIsDefault = formData.probability === null || formData.probability === prevDefaultProb;
            setFormData({ ...formData, [field]: value, probability: probIsDefault ? defaultProb : formData.probability });
        } else {
            setFormData({ ...formData, [field]: value });
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const errors = {};
        if (!formData.opportunityName || !formData.opportunityName.trim())
            errors.opportunityName = 'Opportunity name is required';
        if (!formData.account || !formData.account.trim())
            errors.account = 'Account name is required';
        if (!formData.salesRep || !formData.salesRep.trim())
            errors.salesRep = 'Sales rep is required';
        if (!formData.forecastedCloseDate)
            errors.forecastedCloseDate = 'Close date is required';
        if (formData.arr === '' || formData.arr === null || formData.arr === undefined || parseFloat(formData.arr) < 0) {
            // arr is now computed from productRevenues — only validate if no products selected
            const selectedProducts = formData.products ? formData.products.split(',').map(p => p.trim()).filter(Boolean) : [];
            if (selectedProducts.length === 0 && (formData.arr === '' || formData.arr === null || formData.arr === undefined || parseFloat(formData.arr) < 0))
                errors.arr = 'Enter revenue for at least one product, or add a manual total';
        }

        // Warn if account name doesn't match an existing account
if (formData.account && formData.account.trim()) {
    const isJustCreated = lastCreatedAccountName &&
        lastCreatedAccountName.toLowerCase() === formData.account.trim().toLowerCase();
    if (!isJustCreated) {
        const accountExists = (accounts || []).some(a =>
            a.name && a.name.toLowerCase() === formData.account.trim().toLowerCase()
        );
        if (!accountExists) {
            errors.account = '__not_found__';
        }
    }
}

        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            setTimeout(() => {
                const el = document.querySelector('.field-error');
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
            return;
        }
        setValidationErrors({});
        // Serialize productRevenues as numbers (inputs store strings)
        const cleanRevenues = Object.fromEntries(
            Object.entries(formData.productRevenues || {}).map(([k, v]) => [k, parseFloat(v) || 0])
        );
        onSave({
            ...formData,
            arr: isNaN(computedArr) ? 0 : computedArr,
            probability: (formData.probability !== null && formData.probability !== undefined && !isNaN(formData.probability)) ? formData.probability : null,
            productRevenues: cleanRevenues,
            closeQuarter: closeQuarter,
            contactIds: selectedContactIds
        });
    };

    // Modal tab state
    const [modalTab, setModalTab] = React.useState('details');
    const { dragHandleProps, dragOffsetStyle } = useDraggable();

    // Activity log state (inside modal)
    const [showLogActivity, setShowLogActivity] = React.useState(false);
    const [newActivity, setNewActivity] = React.useState({ type: 'Call', date: [new Date().getFullYear(), String(new Date().getMonth()+1).padStart(2,'0'), String(new Date().getDate()).padStart(2,'0')].join('-'), notes: '' });
    // Comment thread state
    const [commentDraft, setCommentDraft] = React.useState('');
    const [editingCommentId, setEditingCommentId] = React.useState(null);
    const [editingCommentText, setEditingCommentText] = React.useState('');
    const [mentionQuery, setMentionQuery] = React.useState(null); // null = closed, string = query after @
    const [mentionAnchorPos, setMentionAnchorPos] = React.useState(0); // cursor position of the @ sign
    const commentTextareaRef = React.useRef(null);
    const comments = (opportunity?.comments || []).slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const teamMembers = (settings?.users || []).map(u => u.name).filter(Boolean).sort();

    // @mention helpers
    const extractMentions = (text) => {
        if (!text) return [];
        const found = [];
        const parts = text.split('@');
        for (let i = 1; i < parts.length; i++) {
            for (const name of [...teamMembers].sort((a, b) => b.length - a.length)) {
                if (parts[i].startsWith(name)) {
                    found.push(name);
                    break;
                }
            }
        }
        return [...new Set(found)];
    };
    const renderCommentText = (text) => {
        if (!text) return null;
        const parts = text.split(/(@[\w][\w\s]*)/g);
        return parts.map((part, i) => {
            if (part.startsWith('@')) {
                const name = part.slice(1).trim();
                const isValid = teamMembers.includes(name);
                return isValid ? (
                    <span key={i} style={{ background: '#dbeafe', color: '#1d4ed8', borderRadius: '4px', padding: '0.0625rem 0.375rem', fontWeight: '700', fontSize: '0.8125rem' }}>{part}</span>
                ) : <span key={i}>{part}</span>;
            }
            return <span key={i}>{part}</span>;
        });
    };
    // Handle @mention detection in textarea
    const handleCommentDraftChange = (e) => {
        const val = e.target.value;
        const cursor = e.target.selectionStart;
        setCommentDraft(val);
        // Find if cursor is inside an @mention word
        const textBeforeCursor = val.slice(0, cursor);
        const atMatch = textBeforeCursor.match(/@([\w\s]*)$/);
        if (atMatch) {
            setMentionQuery(atMatch[1]);
            setMentionAnchorPos(textBeforeCursor.lastIndexOf('@'));
        } else {
            setMentionQuery(null);
        }
    };
    const insertMention = (name) => {
        const before = commentDraft.slice(0, mentionAnchorPos);
        const after = commentDraft.slice(mentionAnchorPos).replace(/@[\w\s]*/, '');
        const newVal = before + '@' + name + ' ' + after;
        setCommentDraft(newVal);
        setMentionQuery(null);
        if (commentTextareaRef.current) commentTextareaRef.current.focus();
    };
    const filteredMentions = mentionQuery !== null
        ? teamMembers.filter(m => m.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0, 6)
        : [];
    const activityTypes = ['Call', 'Email', 'Meeting', 'Demo', 'Proposal Sent', 'Follow-up', 'Other'];
    const oppActivities = opportunity
        ? (activities || []).filter(a => a.opportunityId === opportunity.id).sort((a, b) => new Date(b.date + 'T12:00:00') - new Date(a.date + 'T12:00:00'))
        : [];
    const activityTypeIcon = { Call: '📞', Email: '✉️', Meeting: '🤝', Demo: '🖥️', 'Proposal Sent': '📄', 'Follow-up': '🔄', Other: '📝' };

    // Deal age info for header strip
    const dealAgeInfo = opportunity ? (() => {
        const today = new Date();
        const dealAge = opportunity.createdDate ? Math.floor((today - new Date(opportunity.createdDate + 'T12:00:00')) / 86400000) : null;
        const timeInStage = opportunity.stageChangedDate ? Math.floor((today - new Date(opportunity.stageChangedDate + 'T12:00:00')) / 86400000) : null;
        return { dealAge, timeInStage };
    })() : null;

    return (
        <>
        {errorMessage && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}
                 onClick={e => e.stopPropagation()}>
                <div style={{ background: '#fff', borderRadius: '12px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: '2rem', maxWidth: '420px', width: '90%', textAlign: 'center' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem' }}>⚠️</div>
                    <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.0625rem', fontWeight: '700', color: '#1e293b' }}>Failed to Save Opportunity</h3>
                    <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: '#64748b', lineHeight: 1.6 }}>{errorMessage}</p>
                    <button
                        onClick={onDismissError}
                        style={{ padding: '0.5rem 1.5rem', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', color: '#1e293b', fontWeight: '600', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                        OK
                    </button>
                </div>
            </div>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div className="modal-overlay">
            <div className="modal" onClick={e => e.stopPropagation()} style={{ ...dragOffsetStyle, maxWidth: '860px', padding: 0, overflow: 'hidden' }}>
                {/* ── Drag handle header bar ── */}
                <div {...dragHandleProps} style={{ ...dragHandleProps.style, background: '#1c1917', padding: '0.875rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '12px 12px 0 0', minHeight: '52px' }}>
                    <h2 style={{ margin: 0, fontSize: '1.0625rem', fontWeight: '700', color: '#f5f1eb', cursor: 'inherit', userSelect: 'none' }}>
                        {opportunity ? 'Edit Opportunity' : 'New Opportunity'}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        {opportunity && (
                            <span style={{ fontSize: '0.6875rem', fontWeight: '600', color: 'rgba(245,241,235,0.5)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '6px', padding: '0.2rem 0.625rem', fontFamily: 'monospace', letterSpacing: '0.03em' }}>
                                ID: {opportunity.id}
                            </span>
                        )}
                        <span style={{ fontSize: '0.6875rem', color: 'rgba(245,241,235,0.35)', fontWeight: '500', letterSpacing: '0.03em' }}>⠿ drag</span>
                    </div>
                </div>
                <div style={{ padding: '1.5rem' }}>

                {/* ── Tab bar (only for existing opportunities) ── */}
                {opportunity && (
                    <div style={{ display: 'flex', gap: '2px', borderBottom: '1.5px solid #e2e8f0', marginBottom: '1.25rem', marginTop: '0.25rem' }}>
                        {[
                            { id: 'details', label: 'Details' },
                            { id: 'history', label: `History${oppActivities.length > 0 ? ` (${oppActivities.length})` : ''}` },
                            { id: 'contacts', label: `Contacts${Object.keys((() => { const ce = {}; oppActivities.forEach(a => { if (a.contactName) ce[a.contactName] = true; }); (opportunity.contacts||'').split(', ').filter(Boolean).forEach(n => { ce[n.split(' (')[0]] = true; }); return ce; })()).length > 0 ? ` (${Object.keys((() => { const ce = {}; oppActivities.forEach(a => { if (a.contactName) ce[a.contactName] = true; }); (opportunity.contacts||'').split(', ').filter(Boolean).forEach(n => { ce[n.split(' (')[0]] = true; }); return ce; })()).length})` : ''}` },
                            ...(settings?.aiScoringEnabled ? [{ id: 'ai-score', label: '🤖 AI Score' }] : []),
                            { id: 'quotes', label: '📋 Quotes' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setModalTab(tab.id)}
                                style={{
                                    padding: '0.5rem 1rem',
                                    fontSize: '0.8125rem',
                                    fontWeight: '600',
                                    fontFamily: 'inherit',
                                    cursor: 'pointer',
                                    border: 'none',
                                    borderBottom: modalTab === tab.id ? '2px solid #2563eb' : '2px solid transparent',
                                    marginBottom: '-1.5px',
                                    background: 'transparent',
                                    color: modalTab === tab.id ? '#2563eb' : '#64748b',
                                    transition: 'all 0.15s',
                                }}
                            >{tab.label}</button>
                        ))}
                    </div>
                )}

                {/* ══ HISTORY TAB ══ */}
                {opportunity && modalTab === 'history' && (
                    <DealHistoryTab
                        opportunity={opportunity}
                        oppActivities={oppActivities}
                        stages={stages}
                        settings={settings}
                        contacts={contacts}
                        activityTypeIcon={activityTypeIcon}
                        onSaveActivity={onSaveActivity}
                        onDeleteActivity={onDeleteActivity}
                        currentUser={currentUser}
                        onClose={onClose}
                        saving={saving}
                        onUpdate={() => { const f = document.getElementById('opp-form'); if (f) f.requestSubmit(); }}
                    />
                )}

                {/* ══ CONTACT ENGAGEMENT TAB ══ */}
                {opportunity && modalTab === 'contacts' && (
                    <ContactEngagementTab
                        opportunity={opportunity}
                        oppActivities={oppActivities}
                        contacts={contacts}
                        onClose={onClose}
                        saving={saving}
                        onUpdate={() => { const f = document.getElementById('opp-form'); if (f) f.requestSubmit(); }}
                    />
                )}

                {/* ══ AI SCORE TAB ══ */}
                {opportunity && modalTab === 'quotes' && (
                    <OppQuotesPanel
                        opportunity={opportunity}
                        contacts={contacts}
                        onClose={onClose}
                    />
                )}

                {opportunity && modalTab === 'ai-score' && (
                    <AiScoreTab
                        opportunity={opportunity}
                        oppActivities={oppActivities}
                        currentUser={currentUser}
                        onClose={onClose}
                        onUpdate={() => { const f = document.getElementById('opp-form'); if (f) f.requestSubmit(); }}
                    />
                )}

                {/* ══ DETAILS TAB (existing content) ══ */}
                <div style={{ display: opportunity && (modalTab === 'history' || modalTab === 'contacts' || modalTab === 'ai-score') ? 'none' : 'block' }}>

                {/* Deal age / time in stage info strip */}
                {opportunity && dealAgeInfo && (dealAgeInfo.dealAge !== null || dealAgeInfo.timeInStage !== null) && (
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '1rem', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', gap: '1rem', padding: '0.625rem 0.875rem', flexWrap: 'wrap' }}>
                            {dealAgeInfo.dealAge !== null && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Deal Age</span>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: dealAgeInfo.dealAge > 90 ? '#ef4444' : dealAgeInfo.dealAge > 60 ? '#f59e0b' : '#10b981' }}>
                                        {dealAgeInfo.dealAge}d
                                    </span>
                                </div>
                            )}
                            {dealAgeInfo.dealAge !== null && dealAgeInfo.timeInStage !== null && <span style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>|</span>}
                            {dealAgeInfo.timeInStage !== null && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                    <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time in Stage</span>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: dealAgeInfo.timeInStage > 30 ? '#ef4444' : dealAgeInfo.timeInStage > 14 ? '#f59e0b' : '#10b981' }}>
                                        {dealAgeInfo.timeInStage}d
                                    </span>
                                    {dealAgeInfo.timeInStage > 14 && opportunity.stage !== 'Closed Won' && opportunity.stage !== 'Closed Lost' && (
                                        <span style={{ fontSize: '0.625rem', color: dealAgeInfo.timeInStage > 30 ? '#ef4444' : '#f59e0b', fontWeight: '700', background: dealAgeInfo.timeInStage > 30 ? '#fef2f2' : '#fffbeb', padding: '0.1rem 0.375rem', borderRadius: '4px', border: `1px solid ${dealAgeInfo.timeInStage > 30 ? '#fecaca' : '#fde68a'}` }}>⚠ Stale</span>
                                    )}
                                </div>
                            )}
                            {oppActivities.length > 0 && (
                                <>
                                    <span style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>|</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                        <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last Activity</span>
                                        <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#475569' }}>
                                            {new Date(oppActivities[0].date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {oppActivities[0].type}
                                        </span>
                                    </div>
                                </>
                            )}
                            {oppActivities.length === 0 && opportunity.stage !== 'Closed Won' && opportunity.stage !== 'Closed Lost' && (
                                <>
                                    <span style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>|</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#ef4444', background: '#fef2f2', padding: '0.1rem 0.5rem', borderRadius: '4px', border: '1px solid #fecaca' }}>⚠ No activities logged</span>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {/* Lost reason banner for Closed Lost opps */}
                {opportunity && opportunity.stage === 'Closed Lost' && (opportunity.lostCategory || opportunity.lostReason) && (
                    <div style={{ padding: '0.75rem 0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Loss Reason</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {opportunity.lostCategory && (
                                <span style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '0.2rem 0.625rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: '700' }}>
                                    {opportunity.lostCategory}
                                </span>
                            )}
                            {opportunity.lostDate && (
                                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                    {new Date(opportunity.lostDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                            )}
                        </div>
                        {opportunity.lostReason && (
                            <div style={{ fontSize: '0.8125rem', color: '#7f1d1d', marginTop: '0.375rem', lineHeight: '1.4' }}>{opportunity.lostReason}</div>
                        )}
                    </div>
                )}
                <form id="opp-form" onSubmit={handleSubmit}>
                    <div className="form-grid">
                        <div className="form-group full">
                            <label>Opportunity Name*</label>
                            <input
                                type="text"
                                value={formData.opportunityName}
                                onChange={e => handleChange('opportunityName', e.target.value)}
                                placeholder="e.g., Q1 2025 Implementation"
                                style={validationErrors.opportunityName ? { borderColor: '#dc2626', background: '#fff8f8' } : {}}
                            />
                            {validationErrors.opportunityName && <div className="field-error" style={{ color: '#dc2626', fontSize: '0.6875rem', fontWeight: '600', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>⚠ {validationErrors.opportunityName}</div>}
                        </div>
                        {allPipelines.length > 1 && (
                            <div className="form-group full">
                                <label>Pipeline</label>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {allPipelines.map(p => {
                                        const sel = (formData.pipelineId || 'default') === p.id;
                                        return (
                                            <button key={p.id} type="button" onClick={() => handleChange('pipelineId', p.id)} style={{
                                                padding: '0.375rem 0.875rem', borderRadius: '999px', border: 'none', cursor: 'pointer',
                                                fontFamily: 'inherit', fontSize: '0.8125rem', fontWeight: '700', transition: 'all 0.15s',
                                                background: sel ? p.color : '#f1f5f9',
                                                color: sel ? '#fff' : '#64748b',
                                                boxShadow: sel ? `0 2px 6px ${p.color}50` : 'none',
                                            }}>{p.name}</button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        <div className="form-group" style={{ position: 'relative' }}>
                            <label>Account Name*</label>
                            <input
                                type="text"
                                value={accountSearch}
                                onChange={e => {
                                    setAccountSearch(e.target.value);
                                    setShowAccountSuggestions(e.target.value.length > 0);
                                    handleChange('account', e.target.value);
                                    if (validationErrors.account) setValidationErrors(prev => { const n={...prev}; delete n.account; return n; });
                                }}
                                onFocus={() => setShowAccountSuggestions(accountSearch.length > 0)}
                                onBlur={() => setTimeout(() => setShowAccountSuggestions(false), 200)}
                                placeholder="Start typing account name..."
                                autoComplete="off"
                                style={validationErrors.account ? { borderColor: '#dc2626', background: '#fff8f8' } : {}}
                            />
                            {validationErrors.account && validationErrors.account !== '__not_found__' && (
                                <div className="field-error" style={{ color: '#dc2626', fontSize: '0.6875rem', fontWeight: '600', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>⚠ {validationErrors.account}</div>
                            )}
                            {validationErrors.account === '__not_found__' && (
                                <div style={{ marginTop: '0.375rem', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: '6px', padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                                    <span style={{ color: '#92400e', fontSize: '0.75rem', fontWeight: '600' }}>
                                        ⚠ "{formData.account}" doesn't exist in your accounts list.
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => { setValidationErrors(prev => { const n = {...prev}; delete n.account; return n; }); onAddAccount(formData); }}
                                        style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '5px', padding: '0.25rem 0.625rem', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                                    >+ Create Account</button>
                                </div>
                            )}
                            {showAccountSuggestions && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0,
                                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px',
                                    marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', zIndex: 1000,
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}>
                                    {allAccountOptions
                                        .filter(opt => opt.tier !== 'site') // Sites only appear in the Site Name field
                                        .filter(opt => !accountSearch || opt.value.toLowerCase().includes(accountSearch.toLowerCase()) || opt.label.toLowerCase().includes(accountSearch.toLowerCase()))
                                        .map(opt => (
                                            <div key={opt.id || opt.value}
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => {
                                                    // Store just the account name, not the breadcrumb label
                                                    setAccountSearch(opt.value);
                                                    handleChange('account', opt.value);
                                                    setShowAccountSuggestions(false);
                                                    // Clear site when account changes
                                                    setSiteSearch('');
                                                    handleChange('site', '');
                                                    // Auto-open site suggestions if this account has sites
                                                    const sites = getSitesForAccount(opt.value);
                                                    if (sites.length > 0) setShowSiteSuggestions(true);
                                                }}
                                                style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                {/* Show just the name in bold, with breadcrumb context below if it has a parent */}
                                                <div style={{ fontWeight: '600', color: '#1e293b' }}>{opt.value}</div>
                                                {opt.parentName && (
                                                    <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '1px' }}>{opt.label}</div>
                                                )}
                                            </div>
                                        ))}
                                    <div onMouseDown={e => e.preventDefault()}
                                        onClick={() => { setShowAccountSuggestions(false); onAddAccount(formData); }}
                                        style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >+ New Account</div>
                                </div>
                            )}
                        </div>
                        <div className="form-group" style={{ position: 'relative' }}>
                            <label>Site Name</label>
                            <input
                                type="text"
                                value={siteSearch}
                                onChange={e => {
                                    setSiteSearch(e.target.value);
                                    handleChange('site', e.target.value);
                                    setShowSiteSuggestions(true);
                                }}
                                onFocus={() => setShowSiteSuggestions(true)}
                                onBlur={() => setTimeout(() => setShowSiteSuggestions(false), 200)}
                                placeholder="Site name or plant/location..."
                                autoComplete="off"
                            />
                            {showSiteSuggestions && (() => {
                                const available = getSitesForAccount(formData.account);
                                const filtered = available.filter(s =>
                                    !siteSearch || s.name.toLowerCase().includes(siteSearch.toLowerCase())
                                );
                                if (filtered.length === 0) return null;
                                return (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0,
                                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px',
                                        marginTop: '0.25rem', maxHeight: '180px', overflowY: 'auto', zIndex: 1000,
                                        boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                    }}>
                                        {filtered.map(site => (
                                            <div key={site.id}
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => { setSiteSearch(site.name); handleChange('site', site.name); setShowSiteSuggestions(false); }}
                                                style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontSize: '0.875rem', fontWeight: '600', color: '#1e293b' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                {site.name}
                                                {site.city && <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.5rem' }}>📍 {[site.city, site.state].filter(Boolean).join(', ')}</span>}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="form-group" style={{ position: 'relative' }}>
                            <label>Sales Rep*</label>
                            <input
                                type="text"
                                value={repSearch}
                                onChange={e => {
                                    setRepSearch(e.target.value);
                                    setShowRepSuggestions(e.target.value.length > 0);
                                    handleChange('salesRep', e.target.value);
                                    if (validationErrors.salesRep) setValidationErrors(prev => { const n={...prev}; delete n.salesRep; return n; });
                                }}
                                onFocus={() => setShowRepSuggestions(repSearch.length > 0)}
                                onBlur={() => setTimeout(() => setShowRepSuggestions(false), 200)}
                                style={validationErrors.salesRep ? { borderColor: '#dc2626', background: '#fff8f8' } : {}}
                                placeholder="Start typing rep name..."
                                required
                                autoComplete="off"
                            />
                            {showRepSuggestions && (
                                <div style={{
                                    position: 'absolute', top: '100%', left: 0, right: 0,
                                    background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '6px',
                                    marginTop: '0.25rem', maxHeight: '200px', overflowY: 'auto', zIndex: 1000,
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}>
                                    {(settings?.users || [])
                                        .filter(u => u.name.toLowerCase().startsWith(repSearch.toLowerCase()))
                                        .map(user => (
                                            <div key={user.id}
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => { setRepSearch(user.name); handleChange('salesRep', user.name); setShowRepSuggestions(false); }}
                                                style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid #f1f3f5', fontWeight: '600', fontSize: '0.875rem' }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                            >{user.name}</div>
                                        ))}
                                    <div onMouseDown={e => e.preventDefault()}
                                        onClick={() => { setShowRepSuggestions(false); if (onAddRep) onAddRep(); }}
                                        style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', color: '#2563eb', fontWeight: '600', fontSize: '0.875rem' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >+ New Rep</div>
                                </div>
                            )}
                            {validationErrors.salesRep && <div className="field-error" style={{ color: '#dc2626', fontSize: '0.6875rem', fontWeight: '600', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>⚠ {validationErrors.salesRep}</div>}
                        </div>
                        <div className="form-group">
                            <label>Stage*</label>
                            <select
                                value={formData.stage}
                                onChange={e => handleChange('stage', e.target.value)}
                                required
                            >
                                {stages.map(stage => (
                                    <option key={stage} value={stage}>{stage}</option>
                                ))}
                            </select>
                        </div>
                        {/* Probability field */}
                        {(() => {
                            const stageDefault = (settings?.funnelStages || []).find(s => s.name === formData.stage);
                            const rawWeight = stageDefault ? parseFloat(stageDefault.weight) : NaN;
                            const defaultProb = !isNaN(rawWeight) ? rawWeight : null;
                            const effectiveProb = (formData.probability !== null && formData.probability !== undefined && !isNaN(formData.probability)) ? formData.probability : defaultProb;
                            const isOverridden = formData.probability !== null && formData.probability !== undefined && !isNaN(formData.probability) && formData.probability !== defaultProb;
                            if (!canViewField('probability')) return null;
                            return (
                                <div className="form-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        Probability (%)
                                        {isOverridden && (
                                            <span style={{ fontSize: '0.625rem', fontWeight: '700', color: '#f59e0b', background: '#fffbeb', border: '1px solid #fde68a', padding: '0.1rem 0.4rem', borderRadius: '999px', letterSpacing: '0.03em' }}>
                                                ✎ OVERRIDDEN
                                            </span>
                                        )}
                                        {!isOverridden && defaultProb !== null && (
                                            <span style={{ fontSize: '0.625rem', color: '#94a3b8', fontWeight: '500' }}>stage default</span>
                                        )}
                                    </label>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <input
                                            type="number"
                                            min="0" max="100"
                                            value={(effectiveProb !== null && effectiveProb !== undefined && !isNaN(effectiveProb)) ? effectiveProb : ''}
                                            placeholder={defaultProb !== null ? String(defaultProb) : '0'}
                                            onChange={e => {
                                                const val = e.target.value === '' ? null : Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                                                handleChange('probability', val);
                                            }}
                                            style={{ flex: 1 }}
                                        />
                                        {isOverridden && (
                                            <button
                                                type="button"
                                                onClick={() => handleChange('probability', defaultProb)}
                                                title="Reset to stage default"
                                                style={{ padding: '0.5rem 0.75rem', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
                                            >↺ Reset</button>
                                        )}
                                    </div>
                                    {isOverridden && defaultProb !== null && (
                                        <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                                            Stage default: {defaultProb}% — your override: {formData.probability}%
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                        <div className="form-group full">
                            <label>Products & Revenue</label>
                            {(() => {
                                const selectedProducts = formData.products
                                    ? formData.products.split(',').map(p => p.trim()).filter(Boolean)
                                    : [];
                                const availableProducts = (settings?.products || []);
                                const filtered = availableProducts.filter(p =>
                                    p.toLowerCase().includes(productSearch.toLowerCase()) &&
                                    !selectedProducts.includes(p)
                                );
                                const toggleProduct = (product) => {
                                    const current = formData.products
                                        ? formData.products.split(',').map(p => p.trim()).filter(Boolean)
                                        : [];
                                    const updated = current.includes(product)
                                        ? current.filter(p => p !== product)
                                        : [...current, product];
                                    handleChange('products', updated.join(', '));
                                };
                                const setProductRevenue = (product, value) => {
                                    const revs = { ...(formData.productRevenues || {}), [product]: value };
                                    handleChange('productRevenues', revs);
                                };
                                return (
                                    <div style={{ position: 'relative' }}>
                                        {/* Search input */}
                                        <input
                                            type="text"
                                            value={productSearch}
                                            onChange={e => { setProductSearch(e.target.value); setShowProductDropdown(true); }}
                                            onFocus={() => setShowProductDropdown(true)}
                                            onBlur={() => setTimeout(() => setShowProductDropdown(false), 150)}
                                            placeholder={availableProducts.length ? "Search or select products…" : "No products defined in Settings yet"}
                                            style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box' }}
                                        />
                                        {/* Dropdown */}
                                        {showProductDropdown && filtered.length > 0 && (
                                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '180px', overflowY: 'auto', marginTop: '2px' }}>
                                                {filtered.map(p => (
                                                    <div key={p} onMouseDown={() => { toggleProduct(p); setProductSearch(''); }}
                                                        style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.875rem', color: '#1e293b' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                                                        {p}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {/* Per-product revenue rows */}
                                        {selectedProducts.length > 0 && (
                                            <div style={{ marginTop: '0.75rem', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', padding: '0.375rem 0.75rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                    <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Product</span>
                                                    <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginRight: '2rem' }}>Annual Revenue ($)</span>
                                                    <span />
                                                </div>
                                                {selectedProducts.map(p => (
                                                    <div key={p} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', padding: '0.5rem 0.75rem', borderBottom: '1px solid #f1f5f9', gap: '0.75rem' }}>
                                                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{p}</span>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={String((formData.productRevenues || {})[p] ?? '')}
                                                            onChange={e => setProductRevenue(p, e.target.value)}
                                                            placeholder="0"
                                                            style={{ width: '140px', padding: '0.35rem 0.625rem', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.8125rem', fontFamily: 'inherit', textAlign: 'right' }}
                                                        />
                                                        <span onClick={() => toggleProduct(p)} style={{ cursor: 'pointer', fontSize: '1rem', lineHeight: 1, color: '#cbd5e1', padding: '0.125rem' }}
                                                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                                            onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}>×</span>
                                                    </div>
                                                ))}
                                                {/* Total row */}
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', alignItems: 'center', padding: '0.5rem 0.75rem', background: '#f0fdf4', gap: '0.75rem' }}>
                                                    <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#15803d' }}>Total ARR</span>
                                                    <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#15803d', textAlign: 'right', minWidth: '140px' }}>
                                                        ${(isNaN(computedArr) ? 0 : computedArr).toLocaleString()}
                                                    </span>
                                                    <span />
                                                </div>
                                            </div>
                                        )}
                                        {/* Fallback manual ARR if no products */}
                                        {selectedProducts.length === 0 && (
                                            <div style={{ marginTop: '0.625rem' }}>
                                                <label style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '0.375rem' }}>Total ARR ($) — no products selected</label>
                                                <input
                                                    type="number"
                                                    value={formData.arr ?? 0}
                                                    onChange={e => handleChange('arr', e.target.value)}
                                                    placeholder="0"
                                                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: validationErrors.arr ? '1px solid #dc2626' : '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box', background: validationErrors.arr ? '#fff8f8' : '#fff' }}
                                                />
                                                {validationErrors.arr && <div className="field-error" style={{ color: '#dc2626', fontSize: '0.6875rem', fontWeight: '600', marginTop: '0.25rem' }}>⚠ {validationErrors.arr}</div>}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                        <div className="form-group">
                            <label>Forecasted Close Date*</label>
                            <input
                                type="date"
                                value={formData.forecastedCloseDate}
                                onChange={e => handleChange('forecastedCloseDate', e.target.value)}
                                style={validationErrors.forecastedCloseDate ? { borderColor: '#dc2626', background: '#fff8f8' } : {}}
                            />
                            {validationErrors.forecastedCloseDate && <div className="field-error" style={{ color: '#dc2626', fontSize: '0.6875rem', fontWeight: '600', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>⚠ {validationErrors.forecastedCloseDate}</div>}
                        </div>
                        <div className="form-group">
                            <label>Close Quarter (Auto-calculated)</label>
                            <input
                                type="text"
                                value={closeQuarter}
                                readOnly
                                style={{ 
                                    background: '#f1f3f5', 
                                    color: '#64748b',
                                    cursor: 'not-allowed'
                                }}
                            />
                        </div>
                        <div className="form-group">
                            <label>Site Unionized*</label>
                            <select
                                value={formData.unionized}
                                onChange={e => handleChange('unionized', e.target.value)}
                                required
                            >
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                                <option value="Mix">Mix</option>
                            </select>
                        </div>
                        <div className="form-group full" style={{ position: 'relative' }}>
                            <label>Key Contacts</label>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                {selectedContacts.map((contact, idx) => {
                                    const contactId = selectedContactIds[idx];
                                    const contactRecord = contactId ? contacts.find(c => c.id === contactId) : null;
                                    return (
                                    <span key={idx} style={{
                                        background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe',
                                        padding: '0.3rem 0.5rem', borderRadius: '6px', fontSize: '0.8125rem',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                                    }}>
                                        <span>
                                            <div style={{ fontWeight: '600', lineHeight: 1.2 }}>{contact.split(' (')[0]}</div>
                                            {contactRecord?.title && <div style={{ fontSize: '0.6875rem', color: '#3b82f6', fontWeight: '500' }}>{contactRecord.title}</div>}
                                        </span>
                                        <button type="button"
                                            onClick={() => {
                                                const newContacts = selectedContacts.filter((_, i) => i !== idx);
                                                const newIds = selectedContactIds.filter((_, i) => i !== idx);
                                                setSelectedContacts(newContacts);
                                                setSelectedContactIds(newIds);
                                                handleChange('contacts', newContacts.join(', '));
                                            }}
                                            style={{ background: 'none', border: 'none', color: '#93c5fd', cursor: 'pointer', fontSize: '1rem', padding: 0, lineHeight: 1 }}
                                            onMouseEnter={e => e.target.style.color = '#1e40af'}
                                            onMouseLeave={e => e.target.style.color = '#93c5fd'}
                                        >×</button>
                                    </span>
                                    );
                                })}
                            </div>
                            <input
                                type="text"
                                value={contactSearch}
                                onChange={e => {
                                    setContactSearch(e.target.value);
                                    setShowContactSuggestions(e.target.value.length > 0);
                                }}
                                onFocus={() => setShowContactSuggestions(contactSearch.length > 0)}
                                onBlur={() => setTimeout(() => setShowContactSuggestions(false), 200)}
                                placeholder="Start typing contact name..."
                                autoComplete="off"
                            />
                            {showContactSuggestions && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    right: 0,
                                    background: '#ffffff',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '6px',
                                    marginTop: '0.25rem',
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    zIndex: 1000,
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                }}>
                                    {contacts
                                        .filter(contact => {
                                            const fullName = `${contact.firstName} ${contact.lastName}`;
                                            const searchLower = contactSearch.toLowerCase();
                                            return fullName.toLowerCase().startsWith(searchLower) ||
                                                   contact.firstName?.toLowerCase().startsWith(searchLower) ||
                                                   contact.lastName?.toLowerCase().startsWith(searchLower);
                                        })
                                        .map(contact => {
                                            const contactDisplay = `${contact.firstName} ${contact.lastName}${contact.title ? ` (${contact.title})` : ''}`;
                                            return (
                                                <div
                                                    key={contact.id}
                                                    onMouseDown={e => e.preventDefault()}
                                                    onClick={() => {
                                                        if (!selectedContactIds.includes(contact.id)) {
                                                            const newContacts = [...selectedContacts, contactDisplay];
                                                            const newIds = [...selectedContactIds, contact.id];
                                                            setSelectedContacts(newContacts);
                                                            setSelectedContactIds(newIds);
                                                            handleChange('contacts', newContacts.join(', '));
                                                        }
                                                        setContactSearch('');
                                                        setShowContactSuggestions(false);
                                                    }}
                                                    style={{
                                                        padding: '0.625rem 0.75rem',
                                                        cursor: 'pointer',
                                                        borderBottom: '1px solid #f1f3f5',
                                                        fontWeight: '600',
                                                        fontSize: '0.875rem'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <div>{contact.firstName} {contact.lastName}</div>
                                                    {contact.title && (
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '400' }}>{contact.title}</div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    <div
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => {
                                            setShowContactSuggestions(false);
                                            setNestedModal({ type: 'contact', firstName: contactSearch.split(/\s+/)[0] || '', lastName: contactSearch.split(/\s+/).slice(1).join(' ') || '' });
                                            setContactSearch('');
                                        }}
                                        style={{
                                            padding: '0.625rem 0.75rem',
                                            cursor: 'pointer',
                                            color: '#2563eb',
                                            fontWeight: '600',
                                            fontSize: '0.875rem'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f1f3f5'}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    >
                                        + New Contact
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="form-group full" style={{ position: 'relative' }}>
                            <label>Pain Points</label>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                                {(() => {
                                    const selectedPainPoints = formData.painPoints ? formData.painPoints.split(', ').filter(p => p) : [];
                                    return selectedPainPoints.map((painPoint, idx) => (
                                        <span key={idx} style={{
                                            background: '#f59e0b',
                                            color: 'white',
                                            padding: '0.25rem 0.5rem',
                                            borderRadius: '4px',
                                            fontSize: '0.8125rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem'
                                        }}>
                                            {painPoint}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newPainPoints = selectedPainPoints.filter((_, i) => i !== idx);
                                                    handleChange('painPoints', newPainPoints.join(', '));
                                                }}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'white',
                                                    cursor: 'pointer',
                                                    fontSize: '1rem',
                                                    padding: 0,
                                                    lineHeight: 1
                                                }}
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ));
                                })()}
                            </div>
                            <select
                                value=""
                                onChange={e => {
                                    const value = e.target.value;
                                    if (value) {
                                        const currentPainPoints = formData.painPoints ? formData.painPoints.split(', ').filter(p => p) : [];
                                        if (!currentPainPoints.includes(value)) {
                                            const newPainPoints = [...currentPainPoints, value];
                                            handleChange('painPoints', newPainPoints.join(', '));
                                        }
                                    }
                                }}
                                style={{ width: '100%' }}
                            >
                                <option value="">Click to add a pain point...</option>
                                {(settings?.painPoints || ['High Turnover', 'Scheduling Complexity', 'Compliance Issues', 'Manual Processes', 'Poor Visibility']).map(painPoint => {
                                    const selectedPainPoints = formData.painPoints ? formData.painPoints.split(', ').filter(p => p) : [];
                                    const isSelected = selectedPainPoints.includes(painPoint);
                                    return (
                                        <option key={painPoint} value={painPoint} disabled={isSelected}>
                                            {painPoint} {isSelected ? '(already added)' : ''}
                                        </option>
                                    );
                                })}
                            </select>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                                Select pain points from the dropdown. Click × to remove.
                            </div>
                        </div>
{canViewField('notes') && (
                        <div className="form-group full">
                            <label>Description / Background</label>
                            <textarea
                                value={formData.notes}
                                onChange={e => handleChange('notes', e.target.value)}
                                placeholder="Deal context, background, key details..."
                                rows="3"
                            />
                        </div>
)}
{canViewField('nextSteps') && (
                        <div className="form-group full">
                            <label>Next Steps</label>
                            <textarea
                                value={formData.nextSteps}
                                onChange={e => handleChange('nextSteps', e.target.value)}
                                placeholder="Actions to move forward..."
                            />
                        </div>
)}
                    </div>

                    {/* ── Comments Thread ─────────────────────────── */}
                    <div style={{ borderTop: '2px solid #e2e8f0', marginTop: '1.25rem', paddingTop: '1.25rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1e293b' }}>💬 Team Notes</span>
                            {comments.length > 0 && (
                                <span style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '0.1rem 0.45rem', borderRadius: '999px', fontSize: '0.625rem', fontWeight: '700' }}>
                                    {comments.length}
                                </span>
                            )}
                            <span style={{ fontSize: '0.6875rem', color: '#94a3b8', marginLeft: '0.25rem' }}>Visible to all team members · timestamped</span>
                        </div>

                        {/* Compose box */}
                        <div style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#2563eb', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: '800', flexShrink: 0, marginTop: '0.125rem' }}>
                                {(currentUser || 'A').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                            </div>
                            <div style={{ flex: 1, position: 'relative' }}>
                                <textarea
                                    ref={commentTextareaRef}
                                    value={commentDraft}
                                    onChange={handleCommentDraftChange}
                                    onKeyDown={e => {
                                        if (mentionQuery !== null && filteredMentions.length > 0) {
                                            if (e.key === 'Escape') { e.preventDefault(); setMentionQuery(null); return; }
                                            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); insertMention(filteredMentions[0]); return; }
                                        }
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && commentDraft.trim()) {
                                            e.preventDefault();
                                            if (!opportunity) return;
                                            const text = commentDraft.trim();
                                            const comment = {
                                                id: 'c_' + Date.now(),
                                                text,
                                                author: currentUser || 'Anonymous',
                                                timestamp: new Date().toISOString(),
                                                mentions: extractMentions(text)
                                            };
                                            onSaveComment && onSaveComment(opportunity.id, comment);
                                            setCommentDraft('');
                                            setMentionQuery(null);
                                        }
                                    }}
                                    placeholder={opportunity ? `Add a note... Type @ to mention someone (⌘/Ctrl+Enter to post)` : 'Save the opportunity first to add team notes'}
                                    disabled={!opportunity}
                                    rows={2}
                                    style={{ width: '100%', padding: '0.5rem 0.75rem', border: '1.5px solid #e2e8f0', borderRadius: '8px', fontSize: '0.8125rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: '1.5', transition: 'border-color 0.15s', background: opportunity ? '#fff' : '#f8fafc', color: opportunity ? '#1e293b' : '#94a3b8' }}
                                    onFocus={e => e.target.style.borderColor = '#2563eb'}
                                    onBlur={e => { e.target.style.borderColor = '#e2e8f0'; setTimeout(() => setMentionQuery(null), 150); }}
                                />
                                {/* @mention dropdown */}
                                {mentionQuery !== null && filteredMentions.length > 0 && (
                                    <div style={{ position: 'absolute', bottom: 'calc(100% - 0.5rem)', left: 0, zIndex: 300, background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: '180px', overflow: 'hidden' }}>
                                        <div style={{ padding: '0.375rem 0.625rem', fontSize: '0.625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #f1f5f9' }}>Mention a teammate</div>
                                        {filteredMentions.map(name => {
                                            const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                                            const avatarColors = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ec4899','#0891b2','#ef4444'];
                                            const color = avatarColors[name.charCodeAt(0) % avatarColors.length];
                                            return (
                                                <div key={name} onMouseDown={e => { e.preventDefault(); insertMention(name); }}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.625rem', cursor: 'pointer', transition: 'background 0.1s' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f7ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5625rem', fontWeight: '800', flexShrink: 0 }}>{initials}</div>
                                                    <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{name}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                {commentDraft.trim() && opportunity && (
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.375rem', gap: '0.375rem' }}>
                                        <button type="button" onClick={() => { setCommentDraft(''); setMentionQuery(null); }}
                                            style={{ padding: '0.3rem 0.75rem', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            Discard
                                        </button>
                                        <button type="button" onClick={() => {
                                                if (!commentDraft.trim() || !opportunity) return;
                                                const text = commentDraft.trim();
                                                const comment = {
                                                    id: 'c_' + Date.now(),
                                                    text,
                                                    author: currentUser || 'Anonymous',
                                                    timestamp: new Date().toISOString(),
                                                    mentions: extractMentions(text)
                                                };
                                                onSaveComment && onSaveComment(opportunity.id, comment);
                                                setCommentDraft('');
                                                setMentionQuery(null);
                                            }}
                                            style={{ padding: '0.3rem 0.875rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                            Post Note
                                        </button>
                                    </div>
                                )}
                                {!opportunity && (
                                    <div style={{ fontSize: '0.6875rem', color: '#94a3b8', marginTop: '0.25rem' }}>Create this opportunity first, then you can add team notes.</div>
                                )}
                            </div>
                        </div>

                        {/* Comments list */}
                        {comments.length === 0 && opportunity && (
                            <div style={{ textAlign: 'center', padding: '1.25rem', color: '#94a3b8', fontSize: '0.8125rem', background: '#f8fafc', borderRadius: '8px', border: '1px dashed #e2e8f0' }}>
                                No team notes yet. Be the first to leave a note.
                            </div>
                        )}
                        {comments.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                                {comments.map(c => {
                                    const isOwn = c.author === currentUser;
                                    const initials = (c.author || 'A').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
                                    const avatarColors = ['#2563eb','#10b981','#f59e0b','#8b5cf6','#ec4899','#0891b2','#ef4444'];
                                    const avatarColor = avatarColors[c.author.charCodeAt(0) % avatarColors.length];
                                    const ts = new Date(c.timestamp);
                                    const now = new Date();
                                    const diffMs = now - ts;
                                    const diffMins = Math.floor(diffMs / 60000);
                                    const diffHours = Math.floor(diffMs / 3600000);
                                    const diffDays = Math.floor(diffMs / 86400000);
                                    const timeAgo = diffMins < 1 ? 'just now'
                                        : diffMins < 60 ? `${diffMins}m ago`
                                        : diffHours < 24 ? `${diffHours}h ago`
                                        : diffDays < 7 ? `${diffDays}d ago`
                                        : ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: ts.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
                                    const fullDate = ts.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
                                    const isEditing = editingCommentId === c.id;

                                    return (
                                        <div key={c.id} style={{ display: 'flex', gap: '0.625rem', padding: '0.625rem 0.75rem', background: isOwn ? '#f0f7ff' : '#fff', border: '1px solid ' + (isOwn ? '#bfdbfe' : '#f1f5f9'), borderRadius: '10px', alignItems: 'flex-start' }}>
                                            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: avatarColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6875rem', fontWeight: '800', flexShrink: 0 }}>
                                                {initials}
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#1e293b' }}>{c.author}</span>
                                                    <span title={fullDate} style={{ fontSize: '0.6875rem', color: '#94a3b8', cursor: 'default' }}>{timeAgo}</span>
                                                    {c.edited && <span style={{ fontSize: '0.625rem', color: '#94a3b8', fontStyle: 'italic' }}>(edited)</span>}
                                                </div>
                                                {isEditing ? (
                                                    <div>
                                                        <textarea
                                                            autoFocus
                                                            value={editingCommentText}
                                                            onChange={e => setEditingCommentText(e.target.value)}
                                                            rows={2}
                                                            style={{ width: '100%', padding: '0.375rem 0.625rem', border: '1.5px solid #2563eb', borderRadius: '6px', fontSize: '0.8125rem', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: '1.5' }}
                                                        />
                                                        <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.375rem', justifyContent: 'flex-end' }}>
                                                            <button type="button" onClick={() => setEditingCommentId(null)}
                                                                style={{ padding: '0.25rem 0.625rem', background: '#fff', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '0.6875rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                                                            <button type="button" onClick={() => {
                                                                    if (editingCommentText.trim()) {
                                                                        onEditComment && onEditComment(opportunity.id, c.id, editingCommentText.trim());
                                                                    }
                                                                    setEditingCommentId(null);
                                                                }}
                                                                style={{ padding: '0.25rem 0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '5px', fontSize: '0.6875rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>Save</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div style={{ fontSize: '0.8125rem', color: '#334155', lineHeight: '1.5', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{renderCommentText(c.text)}</div>
                                                )}
                                            </div>
                                            {isOwn && !isEditing && (
                                                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                                                    <button type="button" onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.text); }}
                                                        title="Edit"
                                                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.75rem', padding: '0.125rem 0.25rem', lineHeight: 1, borderRadius: '3px' }}
                                                        onMouseEnter={e => e.currentTarget.style.color = '#2563eb'}
                                                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>✏️</button>
                                                    <button type="button" onClick={() => onDeleteComment && onDeleteComment(opportunity.id, c.id)}
                                                        title="Delete"
                                                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.75rem', padding: '0.125rem 0.25rem', lineHeight: 1, borderRadius: '3px' }}
                                                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                                                        onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}>✕</button>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {Object.keys(validationErrors).length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', marginTop: '1rem', color: '#dc2626', fontSize: '0.8125rem', fontWeight: '600' }}>
                            ⚠ Please fill in all required fields before saving.
                        </div>
                    )}
                    <div className="modal-actions">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
                            Cancel
                        </button>
                        <button type="submit" className="btn" disabled={saving} style={{ opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {saving && <span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />}
                            {saving ? 'Saving…' : (opportunity ? 'Update' : 'Create')}
                        </button>
                    </div>
                </form>
                </div>{/* end details tab */}
                </div>{/* end padding wrapper */}
            </div>

            {nestedModal && nestedModal.type === 'contact' && (
                <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={() => setNestedModal(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <h2 style={{ marginBottom: '1rem' }}>New Contact</h2>
                        <NestedNewContactForm firstName={nestedModal.firstName} lastName={nestedModal.lastName}
                            onSave={(data) => {
                                if (onSaveNewContact) {
                                    const saved = onSaveNewContact(data);
                                    if (saved) {
                                        const display = `${saved.firstName} ${saved.lastName}${saved.title ? ` (${saved.title})` : ''}`;
                                        const newContacts = [...selectedContacts, display];
                                        const newIds = [...selectedContactIds, saved.id];
                                        setSelectedContacts(newContacts);
                                        setSelectedContactIds(newIds);
                                        handleChange('contacts', newContacts.join(', '));
                                    }
                                }
                                setNestedModal(null);
                            }}
                            onCancel={() => setNestedModal(null)} />
                    </div>
                </div>
            )}
        </div>
        </>
    );
}