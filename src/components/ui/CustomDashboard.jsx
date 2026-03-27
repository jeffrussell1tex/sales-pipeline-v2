import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../AppContext';
import { dbFetch } from '../../utils/storage';

// ── Default widget config (shown for new users) ───────────────────────────────
const DEFAULT_WIDGETS = [
    { id: 'pipeline_value',     position: 0,  visible: true },
    { id: 'deals_by_stage',     position: 1,  visible: true },
    { id: 'quota_attainment',   position: 2,  visible: true },
    { id: 'top_reps',           position: 3,  visible: true },
    { id: 'activity_count',     position: 4,  visible: true },
    { id: 'win_rate',           position: 5,  visible: true },
    { id: 'forecast_vs_actual', position: 6,  visible: true },
    { id: 'open_tasks',         position: 7,  visible: true },
    { id: 'avg_deal_size',      position: 8,  visible: true },
    { id: 'closed_won_period',  position: 9,  visible: true },
];

const WIDGET_META = {
    pipeline_value:     { label: 'Pipeline Value',          icon: '💰', description: 'Total open ARR across all active deals' },
    deals_by_stage:     { label: 'Deals by Stage',          icon: '📊', description: 'Bar chart of deal count and ARR per stage' },
    quota_attainment:   { label: 'Quota Attainment',        icon: '🎯', description: 'Progress bars showing each rep vs their quota' },
    top_reps:           { label: 'Top Reps by ARR',         icon: '🏆', description: 'Leaderboard of reps ranked by closed ARR' },
    activity_count:     { label: 'Activity Count',          icon: '📋', description: 'Breakdown of logged activities by type' },
    win_rate:           { label: 'Win Rate',                icon: '✅', description: 'Closed Won / total closed deals' },
    forecast_vs_actual: { label: 'Forecast vs Actual',      icon: '📈', description: 'Current quarter pipeline vs closed won' },
    open_tasks:         { label: 'Open Tasks',              icon: '✏️',  description: 'Count of open and overdue tasks' },
    avg_deal_size:      { label: 'Avg Deal Size',           icon: '📐', description: 'Average ARR across active opportunities' },
    closed_won_period:  { label: 'Closed Won This Period',  icon: '🎉', description: 'Revenue closed in the selected time period' },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMoney = (v) => {
    const n = parseFloat(v) || 0;
    if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
    return '$' + Math.round(n).toLocaleString();
};

const fmtPct = (n) => (n == null ? '—' : Math.round(n) + '%');

// ── Individual widget renderers ───────────────────────────────────────────────
function PipelineValueWidget({ opportunities }) {
    const openOpps = opportunities.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage));
    const total = openOpps.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
    const count = openOpps.length;
    return (
        <div style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <div style={{ fontSize: '2.25rem', fontWeight: '800', color: '#2563eb', lineHeight: 1 }}>{fmtMoney(total)}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>{count} active deal{count !== 1 ? 's' : ''}</div>
        </div>
    );
}

function DealsByStageWidget({ opportunities, settings }) {
    const stages = (settings.funnelStages || []).map(s => s.name).filter(s => s !== 'Closed Lost');
    const stageColors = ['#6366f1', '#8b5cf6', '#0ea5e9', '#f59e0b', '#f97316', '#10b981', '#16a34a'];
    const data = stages.map((stage, i) => {
        const opps = opportunities.filter(o => o.stage === stage);
        return { stage, count: opps.length, arr: opps.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0), color: stageColors[i % stageColors.length] };
    }).filter(d => d.count > 0);
    const maxArr = Math.max(...data.map(d => d.arr), 1);
    return (
        <div style={{ padding: '0.75rem 0' }}>
            {data.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', padding: '1rem' }}>No active deals</div>
            ) : data.map(d => (
                <div key={d.stage} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '6px' }}>
                    <div style={{ width: '110px', fontSize: '0.6875rem', color: '#475569', fontWeight: '600', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.stage}</div>
                    <div style={{ flex: 1, height: '18px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: Math.max(4, (d.arr / maxArr) * 100) + '%', background: d.color, borderRadius: '4px', transition: 'width 0.4s' }} />
                    </div>
                    <div style={{ width: '50px', fontSize: '0.6875rem', color: '#64748b', textAlign: 'right', flexShrink: 0 }}>{fmtMoney(d.arr)}</div>
                    <div style={{ width: '18px', fontSize: '0.625rem', color: '#94a3b8', textAlign: 'right', flexShrink: 0 }}>{d.count}</div>
                </div>
            ))}
        </div>
    );
}

function QuotaAttainmentWidget({ opportunities, settings }) {
    const reps = (settings.users || []).filter(u => u.userType === 'User' && u.name);
    const wonByRep = {};
    opportunities.filter(o => o.stage === 'Closed Won').forEach(o => {
        const rep = o.salesRep;
        if (rep) wonByRep[rep] = (wonByRep[rep] || 0) + (parseFloat(o.arr) || 0);
    });
    const repData = reps.map(u => {
        const quota = (u.quotaType === 'quarterly')
            ? ((u.q1Quota || 0) + (u.q2Quota || 0) + (u.q3Quota || 0) + (u.q4Quota || 0)) / 4
            : (u.annualQuota || 0);
        const won = wonByRep[u.name] || 0;
        const pct = quota > 0 ? Math.round((won / quota) * 100) : null;
        return { name: u.name, quota, won, pct };
    }).filter(r => r.quota > 0);
    const color = (p) => p >= 100 ? '#16a34a' : p >= 75 ? '#2563eb' : p >= 50 ? '#f59e0b' : '#ef4444';
    return (
        <div style={{ padding: '0.5rem 0' }}>
            {repData.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', padding: '1rem' }}>No quota data configured</div>
            ) : repData.map(r => (
                <div key={r.name} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#1e293b' }}>{r.name}</span>
                        <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: r.pct != null ? color(r.pct) : '#94a3b8' }}>{fmtPct(r.pct)}</span>
                    </div>
                    <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: Math.min(100, r.pct || 0) + '%', background: r.pct != null ? color(r.pct) : '#e2e8f0', borderRadius: '3px', transition: 'width 0.4s' }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function TopRepsWidget({ opportunities }) {
    const repARR = {};
    opportunities.filter(o => o.stage === 'Closed Won').forEach(o => {
        const rep = o.salesRep;
        if (rep) repARR[rep] = (repARR[rep] || 0) + (parseFloat(o.arr) || 0);
    });
    const sorted = Object.entries(repARR).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const medals = ['🥇', '🥈', '🥉'];
    return (
        <div style={{ padding: '0.5rem 0' }}>
            {sorted.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', padding: '1rem' }}>No closed won deals yet</div>
            ) : sorted.map(([name, arr], i) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '5px 0', borderBottom: i < sorted.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                    <span style={{ fontSize: '1rem', width: '20px', flexShrink: 0 }}>{medals[i] || `${i + 1}.`}</span>
                    <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#2563eb', flexShrink: 0 }}>{fmtMoney(arr)}</span>
                </div>
            ))}
        </div>
    );
}

function ActivityCountWidget({ activities }) {
    const counts = {};
    activities.forEach(a => { if (a.type) counts[a.type] = (counts[a.type] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const total = activities.length;
    const typeColors = { Call: '#2563eb', Email: '#10b981', Meeting: '#8b5cf6', Note: '#f59e0b', Demo: '#f97316', Other: '#94a3b8' };
    return (
        <div style={{ padding: '0.5rem 0' }}>
            {sorted.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', padding: '1rem' }}>No activities logged yet</div>
            ) : (<>
                <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1.75rem', fontWeight: '800', color: '#1e293b' }}>{total}</span>
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', marginLeft: '0.375rem' }}>total activities</span>
                </div>
                {sorted.map(([type, count]) => {
                    const color = typeColors[type] || '#94a3b8';
                    const pct = Math.round((count / total) * 100);
                    return (
                        <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '5px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: '0.75rem', color: '#475569' }}>{type}</span>
                            <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#1e293b' }}>{count}</span>
                            <span style={{ fontSize: '0.625rem', color: '#94a3b8', width: '28px', textAlign: 'right' }}>{pct}%</span>
                        </div>
                    );
                })}
            </>)}
        </div>
    );
}

function WinRateWidget({ opportunities }) {
    const closed = opportunities.filter(o => ['Closed Won', 'Closed Lost'].includes(o.stage));
    const won = closed.filter(o => o.stage === 'Closed Won');
    const rate = closed.length > 0 ? Math.round((won.length / closed.length) * 100) : null;
    const color = rate == null ? '#94a3b8' : rate >= 60 ? '#16a34a' : rate >= 40 ? '#f59e0b' : '#ef4444';
    return (
        <div style={{ textAlign: 'center', padding: '1.25rem 1rem' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: '800', color, lineHeight: 1 }}>{rate != null ? rate + '%' : '—'}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                {won.length} won · {closed.length - won.length} lost · {closed.length} total closed
            </div>
            {closed.length > 0 && (
                <div style={{ margin: '0.875rem auto 0', width: '80%', height: '8px', background: '#fee2e2', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: (rate || 0) + '%', background: color, borderRadius: '4px', transition: 'width 0.4s' }} />
                </div>
            )}
        </div>
    );
}

function ForecastVsActualWidget({ opportunities, settings }) {
    const now = new Date();
    const fiscalStart = settings.fiscalYearStart || 1;
    const rawMonth = fiscalStart - 1;
    const qIdx = Math.floor(((now.getMonth() - rawMonth + 12) % 12) / 3);
    const qStart = new Date(now.getFullYear(), (rawMonth + qIdx * 3) % 12, 1);
    const qEnd = new Date(qStart.getFullYear(), qStart.getMonth() + 3, 0);
    const qLabel = `Q${qIdx + 1}`;
    const inQ = (d) => { if (!d) return false; const dt = new Date(d + 'T12:00:00'); return dt >= qStart && dt <= qEnd; };
    const forecast = opportunities.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage) && inQ(o.forecastedCloseDate)).reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
    const actual = opportunities.filter(o => o.stage === 'Closed Won' && inQ(o.wonDate || o.forecastedCloseDate)).reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
    const max = Math.max(forecast, actual, 1);
    return (
        <div style={{ padding: '0.75rem 0' }}>
            <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Current {qLabel}</div>
            {[{ label: 'Forecast', value: forecast, color: '#6366f1' }, { label: 'Closed Won', value: actual, color: '#10b981' }].map(({ label, value, color }) => (
                <div key={label} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '0.75rem', color: '#475569', fontWeight: '600' }}>{label}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color }}>{fmtMoney(value)}</span>
                    </div>
                    <div style={{ height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: Math.max(2, (value / max) * 100) + '%', background: color, borderRadius: '4px', transition: 'width 0.4s' }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function OpenTasksWidget({ tasks }) {
    const today = new Date().toISOString().split('T')[0];
    const open = tasks.filter(t => !t.completed && t.status !== 'Completed');
    const overdue = open.filter(t => t.dueDate && t.dueDate < today);
    const dueToday = open.filter(t => t.dueDate === today);
    return (
        <div style={{ padding: '0.75rem 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', textAlign: 'center' }}>
                {[
                    { label: 'Open', value: open.length, color: '#2563eb' },
                    { label: 'Due Today', value: dueToday.length, color: '#f59e0b' },
                    { label: 'Overdue', value: overdue.length, color: overdue.length > 0 ? '#ef4444' : '#94a3b8' },
                ].map(({ label, value, color }) => (
                    <div key={label} style={{ background: '#f8fafc', borderRadius: '8px', padding: '0.75rem 0.5rem' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: '800', color, lineHeight: 1 }}>{value}</div>
                        <div style={{ fontSize: '0.625rem', color: '#94a3b8', marginTop: '3px', fontWeight: '600' }}>{label}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function AvgDealSizeWidget({ opportunities }) {
    const open = opportunities.filter(o => !['Closed Won', 'Closed Lost'].includes(o.stage));
    const avg = open.length > 0 ? open.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0) / open.length : 0;
    const won = opportunities.filter(o => o.stage === 'Closed Won');
    const wonAvg = won.length > 0 ? won.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0) / won.length : 0;
    return (
        <div style={{ padding: '0.75rem 0' }}>
            {[{ label: 'Active Deals', value: avg, sub: `${open.length} deals` }, { label: 'Closed Won', value: wonAvg, sub: `${won.length} deals` }].map(({ label, value, sub }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: label === 'Active Deals' ? '1px solid #f1f5f9' : 'none' }}>
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#475569' }}>{label}</div>
                        <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{sub}</div>
                    </div>
                    <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#2563eb' }}>{fmtMoney(value)}</div>
                </div>
            ))}
        </div>
    );
}

function ClosedWonPeriodWidget({ opportunities }) {
    const won = opportunities.filter(o => o.stage === 'Closed Won');
    const total = won.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
    const now = new Date();
    const thisMonth = won.filter(o => {
        const d = o.wonDate || o.forecastedCloseDate;
        if (!d) return false;
        const dt = new Date(d + 'T12:00:00');
        return dt.getFullYear() === now.getFullYear() && dt.getMonth() === now.getMonth();
    });
    const monthTotal = thisMonth.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0);
    return (
        <div style={{ textAlign: 'center', padding: '1rem' }}>
            <div style={{ fontSize: '2rem', fontWeight: '800', color: '#16a34a', lineHeight: 1 }}>{fmtMoney(total)}</div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.375rem' }}>{won.length} deal{won.length !== 1 ? 's' : ''} closed</div>
            <div style={{ marginTop: '0.875rem', padding: '0.5rem 0.75rem', background: '#f0fdf4', borderRadius: '6px', display: 'inline-block' }}>
                <div style={{ fontSize: '0.6875rem', color: '#64748b' }}>This month</div>
                <div style={{ fontSize: '1rem', fontWeight: '700', color: '#16a34a' }}>{fmtMoney(monthTotal)}</div>
            </div>
        </div>
    );
}

const WIDGET_RENDERERS = {
    pipeline_value:     PipelineValueWidget,
    deals_by_stage:     DealsByStageWidget,
    quota_attainment:   QuotaAttainmentWidget,
    top_reps:           TopRepsWidget,
    activity_count:     ActivityCountWidget,
    win_rate:           WinRateWidget,
    forecast_vs_actual: ForecastVsActualWidget,
    open_tasks:         OpenTasksWidget,
    avg_deal_size:      AvgDealSizeWidget,
    closed_won_period:  ClosedWonPeriodWidget,
};

// ── Widget card wrapper ───────────────────────────────────────────────────────
function WidgetCard({ widget, data, dragging, dragOver, onDragStart, onDragEnd, onDragOver, onDrop, onDragLeave }) {
    const meta = WIDGET_META[widget.id];
    const Renderer = WIDGET_RENDERERS[widget.id];
    const isDragging = dragging === widget.id;
    const isDragOver = dragOver === widget.id;

    return (
        <div
            draggable
            onDragStart={() => onDragStart(widget.id)}
            onDragEnd={onDragEnd}
            onDragOver={e => { e.preventDefault(); onDragOver(widget.id); }}
            onDragLeave={onDragLeave}
            onDrop={() => onDrop(widget.id)}
            style={{
                background: '#fff',
                border: '1px solid ' + (isDragOver ? '#2563eb' : '#e2e8f0'),
                borderRadius: '12px',
                boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.12)' : '0 1px 3px rgba(0,0,0,0.06)',
                opacity: isDragging ? 0.5 : 1,
                transition: 'all 0.15s',
                cursor: 'grab',
                overflow: 'hidden',
                transform: isDragOver ? 'scale(1.01)' : 'scale(1)',
            }}
        >
            {/* Card header */}
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1rem' }}>{meta.icon}</span>
                <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1 }}>{meta.label}</span>
                <span style={{ fontSize: '0.75rem', color: '#cbd5e1', cursor: 'grab' }}>⠿</span>
            </div>
            {/* Card body */}
            <div style={{ padding: '0 1rem 0.75rem' }}>
                {Renderer ? <Renderer {...data} /> : <div style={{ color: '#94a3b8', fontSize: '0.8125rem', padding: '1rem 0' }}>Widget not found</div>}
            </div>
        </div>
    );
}

// ── Customize panel ───────────────────────────────────────────────────────────
function CustomizePanel({ widgets, onToggle, onClose }) {
    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }} onClick={onClose}>
            <div style={{ background: '#fff', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: '520px', padding: '1.5rem', boxShadow: '0 -8px 32px rgba(0,0,0,0.12)' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <div>
                        <div style={{ fontWeight: '800', fontSize: '1rem', color: '#1e293b' }}>Customize Dashboard</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>Toggle widgets on or off. Drag to reorder.</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#94a3b8', cursor: 'pointer' }}>✕</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
                    {widgets.map(w => {
                        const meta = WIDGET_META[w.id];
                        return (
                            <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 0.875rem', background: w.visible ? '#f8fafc' : '#fff', border: '1px solid ' + (w.visible ? '#e2e8f0' : '#f1f5f9'), borderRadius: '8px' }}>
                                <span style={{ fontSize: '1.125rem', flexShrink: 0 }}>{meta.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#1e293b' }}>{meta.label}</div>
                                    <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>{meta.description}</div>
                                </div>
                                <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', flexShrink: 0 }}>
                                    <input type="checkbox" checked={w.visible} onChange={() => onToggle(w.id)} style={{ opacity: 0, width: 0, height: 0 }} />
                                    <span style={{
                                        position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: '999px',
                                        background: w.visible ? '#2563eb' : '#e2e8f0', transition: '0.2s',
                                    }}>
                                        <span style={{
                                            position: 'absolute', height: '14px', width: '14px', left: w.visible ? '19px' : '3px', bottom: '3px',
                                            background: '#fff', borderRadius: '50%', transition: '0.2s',
                                        }} />
                                    </span>
                                </label>
                            </div>
                        );
                    })}
                </div>
                <button onClick={onClose} style={{ marginTop: '1rem', width: '100%', padding: '0.625rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Done
                </button>
            </div>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function CustomDashboard() {
    const { opportunities, activities, tasks, settings, currentUser } = useApp();

    const [widgets, setWidgets] = useState(DEFAULT_WIDGETS);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showCustomize, setShowCustomize] = useState(false);
    const [dragging, setDragging] = useState(null);
    const [dragOver, setDragOver] = useState(null);
    const saveTimeoutRef = useRef(null);

    // Listen for Customize button click from parent (ReportsTab period bar)
    useEffect(() => {
        const handler = () => setShowCustomize(true);
        document.addEventListener('accelerep:openCustomize', handler);
        return () => document.removeEventListener('accelerep:openCustomize', handler);
    }, []);

    // Load saved config on mount
    useEffect(() => {
        dbFetch('/.netlify/functions/dashboard-configs')
            .then(r => r.json())
            .then(data => {
                if (data.config?.widgets?.length) {
                    // Merge saved config with DEFAULT_WIDGETS to handle new widgets added after save
                    const savedMap = {};
                    data.config.widgets.forEach(w => { savedMap[w.id] = w; });
                    const merged = DEFAULT_WIDGETS.map(dw => savedMap[dw.id] ? { ...dw, ...savedMap[dw.id] } : dw);
                    // Sort by saved position
                    merged.sort((a, b) => a.position - b.position);
                    setWidgets(merged);
                }
            })
            .catch(() => {}) // Use defaults on error
            .finally(() => setLoading(false));
    }, []);

    // Debounced save to DB whenever widgets change (after initial load)
    const persistWidgets = (newWidgets) => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(async () => {
            setSaving(true);
            try {
                await dbFetch('/.netlify/functions/dashboard-configs', {
                    method: 'PUT',
                    body: JSON.stringify({ widgets: newWidgets }),
                });
            } catch (e) {
                console.error('Failed to save dashboard config:', e);
            } finally {
                setSaving(false);
            }
        }, 800);
    };

    const updateWidgets = (newWidgets) => {
        setWidgets(newWidgets);
        if (!loading) persistWidgets(newWidgets);
    };

    // Toggle visibility
    const handleToggle = (id) => {
        const updated = widgets.map(w => w.id === id ? { ...w, visible: !w.visible } : w);
        updateWidgets(updated);
    };

    // Drag-and-drop reorder
    const handleDragStart = (id) => setDragging(id);
    const handleDragEnd = () => { setDragging(null); setDragOver(null); };
    const handleDragOver = (id) => { if (id !== dragging) setDragOver(id); };
    const handleDragLeave = () => setDragOver(null);
    const handleDrop = (targetId) => {
        if (!dragging || dragging === targetId) { setDragging(null); setDragOver(null); return; }
        const from = widgets.findIndex(w => w.id === dragging);
        const to = widgets.findIndex(w => w.id === targetId);
        const reordered = [...widgets];
        const [moved] = reordered.splice(from, 1);
        reordered.splice(to, 0, moved);
        const withPositions = reordered.map((w, i) => ({ ...w, position: i }));
        updateWidgets(withPositions);
        setDragging(null);
        setDragOver(null);
    };

    const visibleWidgets = widgets.filter(w => w.visible);
    const data = { opportunities, activities, tasks, settings };

    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '4rem', color: '#94a3b8' }}>
            <div style={{ width: '24px', height: '24px', border: '2px solid #e2e8f0', borderTopColor: '#2563eb', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        </div>
    );

    return (
        <>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

            {/* Saving indicator — toolbar moved to ReportsTab period bar */}
            {saving && <div style={{ fontSize: '0.75rem', color: '#2563eb', marginBottom: '0.75rem' }}>· Saving…</div>}

            {/* Widget grid */}
            {visibleWidgets.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', color: '#94a3b8', border: '1.5px dashed #e2e8f0', borderRadius: '12px' }}>
                    <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>📊</div>
                    <div style={{ fontWeight: '600', fontSize: '0.9375rem', marginBottom: '0.375rem', color: '#64748b' }}>No widgets visible</div>
                    <div style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>Click Customize to add widgets to your dashboard.</div>
                    <button onClick={() => setShowCustomize(true)} style={{ padding: '0.5rem 1.25rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '700', fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                        + Add Widgets
                    </button>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                    {visibleWidgets.map(widget => (
                        <WidgetCard
                            key={widget.id}
                            widget={widget}
                            data={data}
                            dragging={dragging}
                            dragOver={dragOver}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            onDragOver={handleDragOver}
                            onDrop={handleDrop}
                            onDragLeave={handleDragLeave}
                        />
                    ))}
                </div>
            )}

            {/* Customize panel */}
            {showCustomize && (
                <CustomizePanel
                    widgets={widgets}
                    onToggle={handleToggle}
                    onClose={() => setShowCustomize(false)}
                />
            )}
        </>
    );
}
