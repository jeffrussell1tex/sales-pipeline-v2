// src/components/ReportChart.jsx — draws what reportQuery's chartData() returns
// (state §0.133). Module-scope, prop-driven, no state: the builder's preview
// and an opened saved report both render through this one component, so a
// saved report looks exactly as it did when it was built.
import React from 'react';
import { T } from '../tokens.js';
import { chartData, formatMetric } from '../utils/reportQuery.js';

const PALETTE = ['#7a6a48', '#4d6b3d', '#3a5a7a', '#b87333', '#7a5a3c', '#5a7a8a', '#6b5a7a', '#8a5a5a', '#9c6b4a', '#5a6e5a'];
const sans = T.sans;

const Empty = ({ text }) => (
    <div style={{ textAlign: 'center', color: T.inkMuted, fontSize: 13, fontStyle: 'italic', padding: '2rem', fontFamily: sans }}>{text}</div>
);

const Note = ({ text }) => text ? (
    <div style={{ fontSize: 11.5, color: T.warn, fontFamily: sans, padding: '6px 10px', background: 'rgba(184,115,51,0.08)', borderLeft: `3px solid ${T.warn}`, borderRadius: 4 }}>{text}</div>
) : null;

const Bars = ({ labels, values, metric, funnel = false }) => {
    const max = Math.max(...values.map(v => Math.abs(Number(v) || 0)), 1);
    if (!labels.length) return <Empty text="Nothing in this period to chart." />;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {labels.map((l, i) => {
                const v = Number(values[i]) || 0;
                const pct = Math.max(0, (Math.abs(v) / max) * 100);
                return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 140, fontSize: 12, color: T.ink, fontWeight: 500, fontFamily: sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l}>{l}</div>
                        <div style={{ flex: 1, height: 20, background: T.surface2, borderRadius: 2, overflow: 'hidden', display: 'flex', justifyContent: funnel ? 'center' : 'flex-start' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: funnel ? PALETTE[i % PALETTE.length] : T.goldInk, opacity: 0.85 }} />
                        </div>
                        <div style={{ width: 64, fontSize: 12, fontWeight: 600, color: T.ink, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: sans }}>{formatMetric(values[i], metric?.format)}</div>
                    </div>
                );
            })}
        </div>
    );
};

const Stacked = ({ labels, series, metric }) => {
    if (!labels.length) return <Empty text="Nothing in this period to chart." />;
    const totals = labels.map((_, i) => series.reduce((s, ser) => s + (Number(ser.values[i]) || 0), 0));
    const max = Math.max(...totals, 1);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {labels.map((l, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 140, fontSize: 12, color: T.ink, fontWeight: 500, fontFamily: sans, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l}>{l}</div>
                    <div style={{ flex: 1, height: 20, background: T.surface2, borderRadius: 2, overflow: 'hidden', display: 'flex' }}>
                        {series.map((ser, j) => {
                            const v = Number(ser.values[i]) || 0;
                            return v > 0 ? <div key={j} title={`${ser.name}: ${formatMetric(v, metric?.format)}`} style={{ width: `${(v / max) * 100}%`, height: '100%', background: PALETTE[j % PALETTE.length], opacity: 0.9 }} /> : null;
                        })}
                    </div>
                    <div style={{ width: 64, fontSize: 12, fontWeight: 600, color: T.ink, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: sans }}>{formatMetric(totals[i], metric?.format)}</div>
                </div>
            ))}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, paddingTop: 6 }}>
                {series.map((ser, j) => (
                    <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.inkMid, fontFamily: sans }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: PALETTE[j % PALETTE.length], display: 'inline-block' }} />{ser.name}
                    </span>
                ))}
            </div>
        </div>
    );
};

const Line = ({ labels, values, metric }) => {
    if (labels.length < 2) return <Empty text={labels.length ? 'One point is not a trend — add a longer period.' : 'Nothing in this period to chart.'} />;
    const w = 600, h = 180, padL = 8, padR = 8, padT = 10, padB = 24;
    const nums = values.map(v => Number(v) || 0);
    const max = Math.max(...nums, 1), min = Math.min(...nums, 0), range = Math.max(max - min, 1);
    const x = (i) => padL + (i / (labels.length - 1)) * (w - padL - padR);
    const y = (v) => padT + (1 - (v - min) / range) * (h - padT - padB);
    const path = nums.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    return (
        <div>
            <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
                <path d={`${path} L${x(labels.length - 1)} ${h - padB} L${x(0)} ${h - padB} Z`} fill={T.goldInk} opacity={0.12} />
                <path d={path} fill="none" stroke={T.goldInk} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                {nums.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={T.goldInk} />)}
                {labels.map((l, i) => (labels.length <= 12 || i % Math.ceil(labels.length / 12) === 0) && (
                    <text key={i} x={x(i)} y={h - 6} fontSize={10} fill={T.inkMuted} textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'} fontFamily={sans}>{l}</text>
                ))}
            </svg>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.inkMuted, fontFamily: sans, marginTop: 4 }}>
                <span>{metric?.label}</span>
                <span>peak {formatMetric(max, metric?.format)}</span>
            </div>
        </div>
    );
};

const Table = ({ dims, metrics, rows }) => {
    if (!rows.length) return <Empty text="Nothing in this period." />;
    const cols = `${dims.map(() => 'minmax(120px, 1.4fr)').join(' ')} ${metrics.map(() => 'minmax(80px, 1fr)').join(' ')}`.trim();
    return (
        <div style={{ overflowX: 'auto' }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols || '1fr', gap: 8, padding: '6px 4px', borderBottom: `1px solid ${T.border}`, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: T.inkMuted, fontFamily: sans }}>
                {dims.map(d => <div key={d.id}>{d.label}</div>)}
                {metrics.map(m => <div key={m.id} style={{ textAlign: 'right' }}>{m.label}</div>)}
            </div>
            {rows.map((row, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: cols || '1fr', gap: 8, padding: '7px 4px', borderBottom: `1px solid ${T.border}`, fontSize: 12.5, color: T.ink, fontFamily: sans }}>
                    {row.cells.map((c, j) => <div key={j} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c}>{c}</div>)}
                    {row.values.map(v => <div key={v.id} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatMetric(v.value, v.format)}</div>)}
                </div>
            ))}
        </div>
    );
};

const Kpi = ({ cards }) => {
    if (!cards.length) return <Empty text="Pick a measure." />;
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(cards.length, 4)}, 1fr)`, gap: 10 }}>
            {cards.map(c => (
                <div key={c.label} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '14px 16px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: T.inkMuted, fontFamily: sans }}>{c.label}</div>
                    <div style={{ fontSize: 26, fontWeight: 700, color: T.ink, letterSpacing: -0.5, lineHeight: 1.1, marginTop: 4, fontVariantNumeric: 'tabular-nums', fontFamily: sans }}>{formatMetric(c.value, c.format)}</div>
                </div>
            ))}
        </div>
    );
};

/**
 * <ReportChart result={runReport(...)} chartType="bar" />
 * Every chart type reportQuery names, plus the fallback note when the
 * definition cannot support the one asked for.
 */
export default function ReportChart({ result, chartType }) {
    const c = chartData(result, chartType);
    let body = null;
    if (c.kind === 'kpi')          body = <Kpi cards={c.cards} />;
    else if (c.kind === 'table')   body = <Table dims={c.dims} metrics={c.metrics} rows={c.rows} />;
    else if (c.kind === 'stacked') body = <Stacked labels={c.labels} series={c.series} metric={c.metric} />;
    else if (c.kind === 'line')    body = <Line labels={c.labels} values={c.values} metric={c.metric} />;
    else if (c.kind === 'funnel')  body = <Bars labels={c.labels} values={c.values} metric={c.metric} funnel />;
    else                           body = <Bars labels={c.labels} values={c.values} metric={c.metric} />;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Note text={c.note} />
            {(result?.warnings || []).map((w, i) => <Note key={i} text={w} />)}
            {body}
        </div>
    );
}
