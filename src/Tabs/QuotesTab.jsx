import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

// ─── Design tokens ────────────────────────────────────────────
const T = {
    bg: '#f0ece4', surface: '#fbf8f3', surface2: '#f5efe3',
    border: '#e6ddd0', borderStrong: '#d4c8b4',
    ink: '#2a2622', inkMid: '#5a544c', inkMuted: '#8a8378',
    gold: '#c8b99a', goldInk: '#7a6a48',
    ok: '#4d6b3d', warn: '#b87333', danger: '#9c3a2e', info: '#3a5a7a',
    sans: '"Plus Jakarta Sans", system-ui, sans-serif',
    serif: 'Georgia, serif',
    r: 3,
};

// ─── Helpers ──────────────────────────────────────────────────
const fmt = (n) => {
    const v = parseFloat(n) || 0;
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e4) return '$' + Math.round(v / 1e3) + 'K';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(v).toLocaleString();
};
const fmtFull = (n) => '$' + (parseFloat(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pct = (n) => (parseFloat(n) || 0).toFixed(1) + '%';
const eyebrow = (color) => ({ fontSize: 10, fontWeight: 700, color: color || T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans });

const relDate = (iso) => {
    if (!iso) return '—';
    const diff = Math.round((Date.now() - new Date(iso + (iso.includes('T') ? '' : 'T12:00:00')).getTime()) / 86400000);
    if (diff === 0) return 'today';
    if (diff === 1) return 'yesterday';
    if (diff < 0) return `in ${Math.abs(diff)}d`;
    if (diff < 7) return `${diff}d ago`;
    if (diff < 30) return `${Math.round(diff / 7)}w ago`;
    return `${Math.round(diff / 30)}mo ago`;
};

function genQuoteId() { return 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }

// ─── Approval tiers ───────────────────────────────────────────
// Fallback used before settings load or when not configured
const DEFAULT_APPROVAL_TIERS = [
    { maxDiscount: 0.10, approver: null,            label: 'Rep authority', color: T.ok      },
    { maxDiscount: 0.20, approver: 'Sales Manager', label: 'Mgr approval',  color: T.warn    },
    { maxDiscount: 0.30, approver: 'VP Sales',      label: 'VP approval',   color: '#b55634' },
    { maxDiscount: 1.00, approver: 'CFO',           label: 'CFO approval',  color: T.danger  },
];
// Used throughout the file — will be overridden per-component from settings
let APPROVAL_TIERS = DEFAULT_APPROVAL_TIERS;

const tierForDiscount = (d, tiers = APPROVAL_TIERS) => {
    for (const t of tiers) if (d <= t.maxDiscount) return t;
    return tiers[tiers.length - 1];
};

function buildApprovalTiers(settingsApprovalTiers) {
    if (!Array.isArray(settingsApprovalTiers) || settingsApprovalTiers.length === 0) {
        return DEFAULT_APPROVAL_TIERS;
    }
    const colorFallbacks = [T.ok, T.warn, '#b55634', T.danger];
    return settingsApprovalTiers.map((t, i) => ({
        maxDiscount: typeof t.maxDiscount === 'number' ? t.maxDiscount : parseFloat(t.maxDiscount) || 1,
        approver:    t.approver || null,
        label:       t.label || `Tier ${i+1}`,
        color:       t.color || colorFallbacks[i] || T.inkMid,
    }));
}

// ─── Quote math ───────────────────────────────────────────────
function calcLineTotals(lineItems = [], products = []) {
    let listTotal = 0, netTotal = 0, recurring = 0, oneTime = 0, costTotal = 0;
    const lines = (lineItems || []).map(item => {
        const p    = products.find(p => p.id === item.productId) || {};
        const qty  = Number(item.quantity) || 1;
        const list = Number(item.listPrice ?? p.listPrice ?? p.price) || 0;
        const disc = Math.min(Math.max(Number(item.discountPct) || 0, 0), 100);
        const net  = list * (1 - disc / 100);
        const lineList = list * qty;
        const lineNet  = net * qty;
        const cost     = (Number(p.cost) || 0) * qty;
        listTotal += lineList;
        netTotal  += lineNet;
        costTotal += cost;
        const normType = (item.productType || p.type || p.productType || '').replace('_', '-');
        if (normType === 'recurring') recurring += item.unit === 'month' ? lineNet * 12 : lineNet;
        else oneTime += lineNet;
        return { ...item, netPrice: net, lineTotal: lineNet, lineList, productName: item.productName || p.name || '' };
    });
    const avgDisc  = listTotal > 0 ? 1 - netTotal / listTotal : 0;
    const margin   = netTotal > 0 ? (netTotal - costTotal) / netTotal : 0;
    return { lines, listTotal, netTotal, totalValue: netTotal, recurringValue: recurring, oneTimeValue: oneTime, avgDisc, avgDiscPct: avgDisc * 100, margin };
}

// ─── Status colours ───────────────────────────────────────────
const STATUS_COLORS = {
    'Draft':            { bg: 'rgba(138,131,120,0.12)', fg: '#5a544c', dot: '#8a8378' },
    'Pending Approval': { bg: 'rgba(184,115,51,0.12)',  fg: '#b87333', dot: '#b87333' },
    'Approved':         { bg: 'rgba(77,107,61,0.15)',   fg: '#3a5530', dot: '#4d6b3d' },
    'Sent to Customer': { bg: 'rgba(58,90,122,0.12)',   fg: '#3a5a7a', dot: '#3a5a7a' },
    'Negotiating':      { bg: 'rgba(200,169,120,0.25)', fg: '#7a6a48', dot: '#c8a978' },
    'Accepted':         { bg: 'rgba(77,107,61,0.15)',   fg: '#3a5530', dot: '#4d6b3d' },
    'Rejected / Lost':  { bg: 'rgba(156,58,46,0.12)',   fg: '#9c3a2e', dot: '#9c3a2e' },
    'Superseded':       { bg: 'transparent',            fg: '#8a8378', dot: '#b0a088' },
    'Expired':          { bg: 'rgba(42,38,34,0.08)',    fg: '#8a8378', dot: '#8a8378' },
};

const QStatus = ({ status }) => {
    const c = STATUS_COLORS[status] || { bg: 'rgba(138,131,120,0.12)', fg: '#5a544c', dot: '#8a8378' };
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 10, fontSize: 9.5, fontWeight: 700, background: c.bg, color: c.fg, whiteSpace: 'nowrap', fontFamily: T.sans }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot }} />{status}
        </span>
    );
};

// ─── Input / label styles ─────────────────────────────────────
const inp = { width: '100%', padding: '0.4rem 0.6rem', border: '1px solid #e5e2db', borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit', background: '#f0ece4', color: '#1c1917', outline: 'none', boxSizing: 'border-box' };
const lbl = { display: 'block', fontSize: '0.6875rem', fontWeight: '600', color: '#57534e', marginBottom: '0.25rem' };

// ─── Type badge ───────────────────────────────────────────────
const TYPE_COLORS = {
    recurring:  { bg: '#dbeafe', color: '#1e40af', label: 'Recurring' },
    'one-time': { bg: '#fef3c7', color: '#92400e', label: 'One-time' },
    one_time:   { bg: '#fef3c7', color: '#92400e', label: 'One-time' },
    service:    { bg: '#f3e8ff', color: '#6b21a8', label: 'Service' },
};
const TypeBadge = ({ type }) => {
    const c = TYPE_COLORS[type] || { bg: '#f1f5f9', color: '#64748b', label: type || '—' };
    return <span style={{ background: c.bg, color: c.color, fontSize: '0.5625rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.15rem 0.4rem', borderRadius: 4 }}>{c.label}</span>;
};

// ─── Approval gauge ───────────────────────────────────────────
const ApprovalGauge = ({ discount }) => {
    const pctVal = Math.min(1, discount / 0.4);
    const color  = discount <= 0.10 ? T.ok : discount <= 0.20 ? T.warn : discount <= 0.30 ? '#b55634' : T.danger;
    return (
        <div>
            <div style={{ position: 'relative', height: 10, background: T.surface2, borderRadius: 5, overflow: 'hidden' }}>
                {[0.10, 0.20, 0.30].map(t => (
                    <div key={t} style={{ position: 'absolute', left: `${t / 0.4 * 100}%`, top: 0, bottom: 0, width: 1, background: 'rgba(0,0,0,0.15)' }} />
                ))}
                <div style={{ width: `${pctVal * 100}%`, height: '100%', background: color, transition: 'width 240ms ease-out' }} />
                <div style={{ position: 'absolute', left: `${pctVal * 100}%`, top: -2, bottom: -2, width: 2, background: T.ink, transform: 'translateX(-1px)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 9, color: T.inkMuted, letterSpacing: 0.3, fontFamily: T.sans }}>
                <span>0%</span><span>10% Rep</span><span>20% Mgr</span><span>30% VP</span><span>40%+</span>
            </div>
        </div>
    );
};

// ─── Activity log ─────────────────────────────────────────────
const ACTIVITY_META = {
    created:   { color: T.inkMuted, icon: '+' },
    cloned:    { color: T.inkMuted, icon: '⎘' },
    edit:      { color: T.warn,     icon: '✎' },
    submitted: { color: T.warn,     icon: '↑' },
    sent:      { color: T.info,     icon: '→' },
    opened:    { color: T.ok,       icon: '◉' },
    accepted:  { color: T.ok,       icon: '✓' },
    expired:   { color: T.danger,   icon: '×' },
};

function buildActivityLog(quote) {
    const log = [];
    const d = quote.createdAt || quote.updatedAt || '';
    log.push({ type: 'created', actor: quote.createdBy || 'Rep', date: d, note: `Created v${quote.version || 1}` });
    if ((quote.version || 1) > 1) log.push({ type: 'cloned', actor: quote.createdBy || 'Rep', date: d, note: `Cloned from v${(quote.version || 1) - 1}` });
    const heavy = (quote.lineItems || []).filter(li => (Number(li.discountPct) || 0) >= 10);
    if (heavy.length) log.push({ type: 'edit', actor: quote.createdBy || 'Rep', date: d, note: `Applied discount on ${heavy.length} item${heavy.length === 1 ? '' : 's'}` });
    if (quote.status === 'Pending Approval') log.push({ type: 'submitted', actor: quote.createdBy || 'Rep', date: quote.updatedAt || d, note: 'Submitted for approval', detail: 'Avg discount exceeds rep tier' });
    if (quote.status === 'Sent to Customer' || quote.status === 'Negotiating') log.push({ type: 'sent', actor: quote.createdBy || 'Rep', date: quote.updatedAt || d, note: 'Sent to customer' });
    if (quote.status === 'Accepted') log.push({ type: 'accepted', actor: 'Customer', date: quote.updatedAt || d, note: 'Accepted quote' });
    if (quote.status === 'Expired') log.push({ type: 'expired', actor: 'System', date: quote.validUntil || d, note: 'Quote expired without acceptance' });
    return log.filter(e => e.date);
}

const QuoteActivityLog = ({ quote }) => {
    const log = buildActivityLog(quote);
    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ ...eyebrow(T.inkMid), fontSize: 10.5 }}>Activity — v{quote.version || 1}</div>
                <span style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>{log.length} event{log.length === 1 ? '' : 's'}</span>
            </div>
            {log.length === 0
                ? <div style={{ fontSize: 12, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>No recorded activity yet.</div>
                : (
                    <div style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 9, top: 6, bottom: 6, width: 1, background: T.border }} />
                        {log.map((e, i) => {
                            const m = ACTIVITY_META[e.type] || ACTIVITY_META.edit;
                            return (
                                <div key={i} style={{ display: 'flex', gap: 12, paddingBottom: i === log.length - 1 ? 0 : 12, position: 'relative' }}>
                                    <div style={{ width: 19, height: 19, borderRadius: 10, background: T.surface, border: `1.5px solid ${m.color}`, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0, zIndex: 1, fontFamily: T.sans }}>{m.icon}</div>
                                    <div style={{ flex: 1, paddingTop: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                                            <div style={{ fontSize: 12, color: T.ink, lineHeight: 1.35, fontFamily: T.sans }}>
                                                <b style={{ fontWeight: 600 }}>{e.actor}</b> <span style={{ color: T.inkMid }}>{e.note}</span>
                                            </div>
                                            <span style={{ fontSize: 10.5, color: T.inkMuted, flexShrink: 0, fontFamily: T.sans }}>{relDate(e.date)}</span>
                                        </div>
                                        {e.detail && <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2, fontStyle: 'italic', fontFamily: T.sans }}>"{e.detail}"</div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )
            }
        </div>
    );
};

// ─── PDF preview ──────────────────────────────────────────────
const QuotePDFPreview = ({ quote, opp, products }) => {
    const { lines, listTotal, totalValue, avgDisc } = calcLineTotals(quote.lineItems || [], products || []);
    return (
        <div style={{ background: '#fafaf7', padding: '20px 24px 24px', border: `1px solid ${T.border}`, borderRadius: T.r }}>
            <div style={{ background: '#fff', border: `1px solid ${T.border}`, boxShadow: '0 2px 8px rgba(26,22,18,0.06)', padding: '40px 44px', fontFamily: 'Georgia,"Times New Roman",serif', color: '#2a2622', minHeight: 600 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: 18, borderBottom: '2px solid #2a2622', marginBottom: 24 }}>
                    <div>
                        <div style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 700, letterSpacing: 2, color: T.goldInk, marginBottom: 4 }}>ACCELEREP</div>
                        <div style={{ fontFamily: T.sans, fontSize: 10.5, color: T.inkMid, lineHeight: 1.55 }}>500 Market Street, Suite 800<br />San Francisco, CA 94103</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: T.inkMuted }}>QUOTE</div>
                        <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 13, fontWeight: 600, color: '#2a2622', marginTop: 2 }}>{quote.quoteNumber || quote.id}</div>
                        <div style={{ fontFamily: T.sans, fontSize: 10.5, color: T.inkMuted, marginTop: 4 }}>Valid until: {quote.validUntil || '—'}</div>
                    </div>
                </div>
                <div style={{ marginBottom: 24 }}>
                    <div style={{ fontFamily: T.sans, fontSize: 9.5, fontWeight: 700, letterSpacing: 1, color: T.inkMuted, textTransform: 'uppercase', marginBottom: 6 }}>Bill to</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#2a2622' }}>{opp?.account || '—'}</div>
                    {quote.billingContact && <div style={{ fontFamily: T.sans, fontSize: 12, color: T.inkMid, marginTop: 2 }}>{quote.billingContact}</div>}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontFamily: T.sans }}>
                    <thead>
                        <tr style={{ borderBottom: '1.5px solid #2a2622' }}>
                            {['Product', 'Type', 'Qty', 'Unit Price', 'Total'].map((h, i) => (
                                <th key={i} style={{ padding: '6px 8px 8px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: T.inkMuted, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((li, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${T.border}` }}>
                                <td style={{ padding: '8px', fontSize: 12.5, color: '#2a2622', fontWeight: 500 }}>{li.productName}</td>
                                <td style={{ padding: '8px', fontSize: 11 }}><TypeBadge type={li.productType} /></td>
                                <td style={{ padding: '8px', fontSize: 12.5, textAlign: 'right', color: T.inkMid }}>{li.quantity || 1}</td>
                                <td style={{ padding: '8px', fontSize: 12.5, textAlign: 'right', fontFamily: 'ui-monospace,Menlo,monospace' }}>{fmtFull(li.netPrice)}</td>
                                <td style={{ padding: '8px', fontSize: 13, textAlign: 'right', fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 600, color: '#2a2622' }}>{fmtFull(li.lineTotal)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
                    <div style={{ width: 280 }}>
                        {[
                            { l: 'List total', v: fmtFull(listTotal), muted: true },
                            { l: `Discount (${Math.round(avgDisc * 100)}%)`, v: '-' + fmtFull(listTotal - totalValue), muted: true },
                            { l: 'Net total', v: fmtFull(totalValue), bold: true },
                        ].map(r => (
                            <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: r.bold ? '1.5px solid #2a2622' : undefined, marginTop: r.bold ? 4 : 0 }}>
                                <span style={{ fontFamily: T.sans, fontSize: r.bold ? 13 : 11.5, fontWeight: r.bold ? 700 : 400, color: r.muted ? T.inkMid : '#2a2622' }}>{r.l}</span>
                                <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: r.bold ? 14 : 11.5, fontWeight: r.bold ? 700 : 400, color: r.muted ? T.inkMid : '#2a2622' }}>{r.v}</span>
                            </div>
                        ))}
                    </div>
                </div>
                {quote.paymentTerms && <div style={{ fontFamily: T.sans, fontSize: 11, color: T.inkMid, marginBottom: 20 }}>Payment terms: {quote.paymentTerms}</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, marginTop: 30, fontFamily: T.sans }}>
                    {['Customer signature', 'Accelerep signature'].map(s => (
                        <div key={s}>
                            <div style={{ borderBottom: `1px solid #2a2622`, height: 40, marginBottom: 6 }} />
                            <div style={{ fontSize: 10, color: T.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase' }}>{s}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ─── Template picker modal ────────────────────────────────────
const TemplatePickerModal = ({ opp, products, onPick, onClose }) => {
    const [selected, setSelected] = useState(null);
    const templates = useMemo(() => [
        { id: 'smb',    name: 'SMB Starter',     desc: 'Core + Pipeline + Reports + Basic onboarding. 10–50 seats.', productIds: (products || []).filter(p => ['platform', 'modules'].includes(p.category)).slice(0, 4).map(p => p.id), winRate: 0.48 },
        { id: 'growth', name: 'Growth Package',  desc: 'Full core modules + white-glove services. 50–200 seats.',   productIds: (products || []).filter(p => ['platform', 'modules', 'services'].includes(p.category)).slice(0, 6).map(p => p.id), winRate: 0.44 },
        { id: 'ent',    name: 'Enterprise',      desc: 'Premium stack + dedicated CSM. 200+ seats, multi-year.',    productIds: (products || []).slice(0, 8).map(p => p.id), winRate: 0.57 },
        { id: 'trial',  name: 'Trial → Paid',    desc: 'Minimal Core + basic onboarding. Conversion template.',     productIds: (products || []).slice(0, 2).map(p => p.id), winRate: 0.52 },
    ], [products]);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(26,22,18,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 6, width: 820, boxShadow: '0 30px 80px rgba(26,22,18,0.35)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
                <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ ...eyebrow(T.inkMuted), marginBottom: 4 }}>Start quote · {opp?.account}</div>
                            <div style={{ fontSize: 20, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, color: T.ink }}>Pick a template to begin</div>
                            <div style={{ fontSize: 12, color: T.inkMid, marginTop: 2, fontFamily: T.sans }}>{opp?.opportunityName || opp?.account} · {fmt(opp?.arr)} target</div>
                        </div>
                        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: T.inkMid, fontSize: 18 }}>×</button>
                    </div>
                </div>
                <div style={{ padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, overflowY: 'auto' }}>
                    {templates.map(t => {
                        const isSel = selected === t.id;
                        return (
                            <div key={t.id} onClick={() => setSelected(t.id)} style={{ background: T.surface, border: `1.5px solid ${isSel ? T.ink : T.border}`, borderRadius: T.r + 1, padding: 16, cursor: 'pointer', position: 'relative', transition: 'border-color 120ms' }}>
                                {isSel && <div style={{ position: 'absolute', top: 12, right: 12, width: 18, height: 18, borderRadius: 9, background: T.ink, color: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>✓</div>}
                                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 4, fontFamily: T.sans }}>{t.name}</div>
                                <div style={{ fontSize: 11.5, color: T.inkMid, lineHeight: 1.45, marginBottom: 12, fontFamily: T.sans }}>{t.desc}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${T.border}` }}>
                                    {(products || []).filter(p => t.productIds.includes(p.id)).slice(0, 4).map(p => (
                                        <div key={p.id} style={{ fontSize: 11, color: T.inkMid, display: 'flex', alignItems: 'center', gap: 6, fontFamily: T.sans }}>
                                            <span style={{ width: 4, height: 4, borderRadius: 2, background: T.inkMuted }} />{p.name}
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>
                                    <span>{Math.round(t.winRate * 100)}% avg win rate</span>
                                    <span style={{ color: T.inkMid, fontWeight: 600 }}>{t.productIds.length} line items</span>
                                </div>
                            </div>
                        );
                    })}
                    <div onClick={() => setSelected('blank')} style={{ background: 'transparent', border: `1.5px dashed ${selected === 'blank' ? T.ink : T.border}`, borderRadius: T.r + 1, padding: 16, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 140, color: T.inkMid, gridColumn: '1 / -1' }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>+</div>
                        <div style={{ fontSize: 13, fontWeight: 500, fontFamily: T.sans }}>Start from scratch</div>
                        <div style={{ fontSize: 11, color: T.inkMuted, marginTop: 2, fontFamily: T.sans }}>Blank quote, add line items manually</div>
                    </div>
                </div>
                <div style={{ padding: '14px 20px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans }}>You can edit anything after the quote is created.</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={onClose} style={{ background: 'transparent', color: T.inkMid, border: `1px solid ${T.border}`, padding: '8px 14px', fontSize: 12.5, fontWeight: 500, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
                        <button onClick={() => selected && onPick(selected)} disabled={!selected} style={{ background: selected ? T.ink : T.surface2, color: selected ? T.surface : T.inkMuted, border: 'none', padding: '8px 16px', fontSize: 12.5, fontWeight: 600, borderRadius: T.r, cursor: selected ? 'pointer' : 'not-allowed', fontFamily: T.sans }}>
                            Create quote →
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Quote column — side-by-side comparator ───────────────────
const QuoteColumn = ({ quote, otherQuote, label, readOnly, editable, products, onEdit }) => {
    const { lines, listTotal, totalValue, avgDisc, margin } = calcLineTotals(quote.lineItems || [], products || []);
    const otherResult = otherQuote ? calcLineTotals(otherQuote.lineItems || [], products || []) : null;
    const otherIds    = new Set((otherQuote?.lineItems || []).map(li => li.productId));
    const myIds       = new Set((quote.lineItems || []).map(li => li.productId));
    const tier        = tierForDiscount(avgDisc);

    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, display: 'flex', flexDirection: 'column', opacity: readOnly ? 0.85 : 1 }}>
            {/* Column header */}
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, background: readOnly ? T.surface2 : T.surface }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ ...eyebrow(T.inkMid), fontSize: 10.5 }}>{label} · v{quote.version || 1}</span>
                        <QStatus status={quote.status} />
                        {editable && (() => {
                            const color = tier.approver ? tier.color : T.ok;
                            const labelText = tier.approver ? `Needs ${tier.label}` : 'Within rep authority';
                            return (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 10, fontSize: 9.5, fontWeight: 700, background: `${color}18`, color, border: `1px solid ${color}40`, fontFamily: T.sans }}>
                                    {tier.approver ? '⚠' : '✓'} {labelText}
                                </span>
                            );
                        })()}
                    </div>
                    <span style={{ fontSize: 10, color: T.inkMuted, fontFamily: 'ui-monospace,Menlo,monospace' }}>{quote.quoteNumber}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
                    <div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: T.ink, letterSpacing: -0.5, fontFamily: T.sans }}>{fmt(totalValue)}</div>
                        <div style={{ fontSize: 11, color: T.inkMid, fontFamily: T.sans }}>{quote.paymentTerms || 'Annual'} · TCV {fmt(totalValue * ((quote.termMonths || 12) / 12))}</div>
                    </div>
                    {otherResult && (
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: totalValue > otherResult.totalValue ? T.ok : totalValue < otherResult.totalValue ? T.danger : T.inkMuted, fontFamily: T.sans }}>
                                {totalValue > otherResult.totalValue ? '▲' : totalValue < otherResult.totalValue ? '▼' : '–'} {fmt(Math.abs(totalValue - otherResult.totalValue))}
                            </div>
                            <div style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>vs prev</div>
                        </div>
                    )}
                </div>
                {editable && !readOnly && onEdit && (
                    <button onClick={onEdit} style={{ marginTop: 10, width: '100%', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: T.r, padding: 6, fontSize: 12, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans }}>
                        Edit in builder →
                    </button>
                )}
            </div>

            {/* Line items with diff */}
            <div style={{ padding: 4 }}>
                {lines.map((li, i) => {
                    const otherLi   = (otherQuote?.lineItems || []).find(oli => oli.productId === li.productId);
                    const isNew     = otherQuote && !otherIds.has(li.productId);
                    const discChg   = otherLi && (Number(otherLi.discountPct) || 0) !== (Number(li.discountPct) || 0);
                    const qtyChg    = otherLi && (Number(otherLi.quantity) || 1) !== (Number(li.quantity) || 1);
                    const changed   = discChg || qtyChg;
                    const p         = (products || []).find(p => p.id === li.productId) || {};
                    return (
                        <div key={li.productId + i} style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: '1fr 48px 52px 76px', gap: 6, alignItems: 'center', fontSize: 11.5, fontFamily: T.sans, background: isNew ? 'rgba(77,107,61,0.08)' : changed ? 'rgba(200,185,154,0.15)' : 'transparent', borderLeft: isNew ? `2px solid ${T.ok}` : changed ? `2px solid ${T.gold}` : '2px solid transparent', marginBottom: 2 }}>
                            <div>
                                <div style={{ color: T.ink, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 5 }}>
                                    {li.productName || p.name}
                                    {isNew && <span style={{ fontSize: 8.5, fontWeight: 700, color: T.ok, background: `${T.ok}20`, padding: '1px 4px', borderRadius: 2 }}>ADDED</span>}
                                </div>
                                <div style={{ fontSize: 9.5, color: T.inkMuted, fontFamily: 'ui-monospace,Menlo,monospace' }}>{p.sku || ''}</div>
                            </div>
                            <div style={{ textAlign: 'center', color: T.inkMid }}>
                                {li.quantity || 1}
                                {qtyChg && <div style={{ fontSize: 9, color: T.inkMuted, textDecoration: 'line-through' }}>{otherLi.quantity || 1}</div>}
                            </div>
                            <div style={{ textAlign: 'center', color: (Number(li.discountPct) || 0) > 10 ? T.warn : T.inkMid, fontWeight: 500 }}>
                                {(Number(li.discountPct) || 0) > 0 ? `-${Number(li.discountPct)}%` : '—'}
                                {discChg && <div style={{ fontSize: 9, color: T.inkMuted, textDecoration: 'line-through' }}>{Number(otherLi.discountPct) || 0}%</div>}
                            </div>
                            <div style={{ textAlign: 'right', color: T.ink, fontWeight: 600, fontFamily: 'ui-monospace,Menlo,monospace' }}>{fmt(li.lineTotal)}</div>
                        </div>
                    );
                })}
                {/* Removed items */}
                {otherQuote && (otherQuote.lineItems || []).filter(oli => !myIds.has(oli.productId)).map((oli, i) => {
                    const p = (products || []).find(p => p.id === oli.productId) || {};
                    return (
                        <div key={'rm' + i} style={{ padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: 0.5, textDecoration: 'line-through', fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans }}>
                            <span>{oli.productName || p.name}</span><span>removed</span>
                        </div>
                    );
                })}
            </div>

            {/* Footer totals */}
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.border}`, background: T.surface2, fontSize: 11.5, fontFamily: T.sans }}>
                {[
                    { label: 'List total',              value: fmtFull(listTotal),                 muted: true },
                    { label: `Discount (${Math.round(avgDisc * 100)}%)`, value: '-' + fmtFull(listTotal - totalValue), color: T.warn },
                    { label: 'Net',                     value: fmtFull(totalValue),                bold: true },
                    { label: 'Est. margin',             value: null, extra: <span style={{ color: margin > 0.5 ? T.ok : margin > 0.35 ? T.inkMid : T.warn, fontWeight: 600 }}>{Math.round(margin * 100)}%</span> },
                ].map(r => (
                    <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: r.bold ? 12.5 : 11.5, fontWeight: r.bold ? 600 : 400, color: r.color || (r.bold ? T.ink : T.inkMid) }}>
                        <span>{r.label}</span>
                        <span style={{ fontFamily: r.value ? 'ui-monospace,Menlo,monospace' : 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {r.value}{r.extra}
                        </span>
                    </div>
                ))}
                <div style={{ marginTop: 8, padding: '6px 8px', background: `${tier.color}12`, border: `1px solid ${tier.color}40`, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: tier.color }} />
                    <span style={{ fontSize: 10.5, color: tier.color, fontWeight: 600, fontFamily: T.sans }}>{tier.label}</span>
                    {tier.approver && <span style={{ fontSize: 10.5, color: T.inkMid, marginLeft: 'auto', fontFamily: T.sans }}>{tier.approver}</span>}
                </div>
            </div>
        </div>
    );
};

// ─── Inline line item editor — opens when "Edit in builder" is clicked ────────
const LineItemEditor = ({ quote, products, onSave, onClose, saving }) => {
    const [lineItems,     setLineItems]     = useState(() => (quote.lineItems || []).map((li, i) => ({ ...li, _key: li._key || (Date.now() + i) })));
    const [catalogSearch, setCatalogSearch] = useState('');
    const [paymentTerms,  setPaymentTerms]  = useState(quote.paymentTerms || 'Net 30 · Annual');
    const [validUntil,    setValidUntil]    = useState(quote.validUntil || '');
    const [notes,         setNotes]         = useState(quote.notes || '');
    const [error,         setError]         = useState(null);

    const { lines, listTotal, totalValue, avgDisc, avgDiscPct } = calcLineTotals(lineItems, products || []);
    const tier = tierForDiscount(avgDisc);

    // Catalog — grouped by category, filtered
    const catalogGroups = useMemo(() => {
        const groups = {};
        [...(products || [])].filter(p => p.active !== false)
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .forEach(p => {
                if (catalogSearch.trim()) {
                    const q = catalogSearch.toLowerCase();
                    if (!(p.name || '').toLowerCase().includes(q) && !(p.category || '').toLowerCase().includes(q)) return;
                }
                const cat = p.category || 'Other';
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(p);
            });
        return groups;
    }, [products, catalogSearch]);

    const addProduct = (prod) => {
        if (lineItems.some(li => li.productId === prod.id)) return; // already added
        const normType = (prod.productType || prod.type || '').replace('_', '-');
        setLineItems(prev => [...prev, {
            _key:        Date.now() + Math.random(),
            productId:   prod.id,
            productName: prod.name,
            productType: normType,
            unit:        prod.unit || 'flat',
            listPrice:   prod.customPrice ? '' : (Number(prod.listPrice || prod.price) || 0),
            quantity:    1,
            discountPct: 0,
            customPrice: prod.customPrice === true,
        }]);
    };

    const updateLine = (key, field, val) => {
        setLineItems(prev => prev.map(li => li._key === key ? { ...li, [field]: val } : li));
    };

    const removeLine = (key) => setLineItems(prev => prev.filter(li => li._key !== key));

    const handleSave = async () => {
        setError(null);
        const payload = { ...quote, lineItems: lineItems.map(({ _key, ...li }) => li), paymentTerms, validUntil, notes };
        try { await onSave(payload); onClose(); }
        catch (err) { setError(err.message || 'Failed to save.'); }
    };

    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Editor header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${T.border}`, background: T.ink }}>
                <div style={{ width: 3, height: 22, background: T.gold, borderRadius: 2 }} />
                <div style={{ fontSize: 13, fontWeight: 600, color: T.surface, fontFamily: T.sans }}>
                    Line items — {quote.name || quote.quoteNumber}
                </div>
                <div style={{ flex: 1 }} />
                {tier.approver && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.warn, background: `${T.warn}25`, border: `1px solid ${T.warn}50`, padding: '2px 8px', borderRadius: 10, fontFamily: T.sans }}>
                        ⚠ {tier.label} — {Math.round(avgDiscPct)}% avg disc
                    </span>
                )}
                <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', color: T.surface, borderRadius: T.r, padding: '5px 10px', fontSize: 12, cursor: 'pointer', fontFamily: T.sans }}>✕ Close</button>
            </div>

            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                {/* LEFT: Product catalog */}
                <div style={{ width: 240, flexShrink: 0, background: '#1c1917', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                    <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(245,241,235,0.1)' }}>
                        <div style={{ fontSize: '0.625rem', fontWeight: 700, color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Product Catalog</div>
                        <input
                            value={catalogSearch}
                            onChange={e => setCatalogSearch(e.target.value)}
                            placeholder="Search products…"
                            style={{ width: '100%', padding: '5px 8px', background: 'rgba(245,241,235,0.08)', border: '1px solid rgba(245,241,235,0.12)', borderRadius: T.r, color: '#f5f1eb', fontSize: 12, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
                        {Object.keys(catalogGroups).length === 0 && (
                            <div style={{ padding: '1rem', fontSize: 12, color: '#a8a29e', textAlign: 'center', fontFamily: T.sans }}>
                                {(products || []).length === 0 ? 'No products in catalog yet.' : 'No products match.'}
                            </div>
                        )}
                        {Object.entries(catalogGroups).map(([cat, prods]) => (
                            <div key={cat}>
                                <div style={{ padding: '6px 12px 3px', fontSize: '0.5625rem', fontWeight: 700, color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: T.sans }}>{cat}</div>
                                {prods.map(prod => {
                                    const alreadyAdded = lineItems.some(li => li.productId === prod.id);
                                    return (
                                        <div key={prod.id}
                                            style={{ padding: '6px 12px', cursor: alreadyAdded ? 'default' : 'pointer', opacity: alreadyAdded ? 0.45 : 1, transition: 'background 80ms' }}
                                            onMouseEnter={e => { if (!alreadyAdded) e.currentTarget.style.background = 'rgba(245,241,235,0.06)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#f5f1eb', lineHeight: 1.3, fontFamily: T.sans }}>{prod.name}</div>
                                                    <div style={{ fontSize: 10.5, color: '#a8a29e', marginTop: 1, fontFamily: T.sans }}>
                                                        {prod.customPrice ? 'Custom price' : ('$' + Number(prod.listPrice || prod.price || 0).toLocaleString() + (prod.unit === 'month' ? '/mo' : prod.unit === 'year' ? '/yr' : ''))}
                                                    </div>
                                                </div>
                                                {!alreadyAdded && (
                                                    <button onClick={() => addProduct(prod)}
                                                        style={{ background: 'rgba(245,241,235,0.12)', border: '1px solid rgba(245,241,235,0.15)', color: '#f5f1eb', borderRadius: T.r, padding: '2px 7px', fontSize: '0.625rem', fontWeight: 700, cursor: 'pointer', fontFamily: T.sans, flexShrink: 0 }}>
                                                        + Add
                                                    </button>
                                                )}
                                                {alreadyAdded && <span style={{ fontSize: '0.5625rem', color: '#78716c', fontFamily: T.sans }}>Added</span>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                {/* RIGHT: Line items + meta */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '12px 16px', gap: 12 }}>
                    {/* Meta row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                        <div>
                            <label style={lbl}>Payment Terms</label>
                            <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} style={inp}>
                                {['Net 30 · Annual', 'Net 30 · Monthly', 'Net 60 · Annual', 'Net 15 · Annual', 'Due on Receipt'].map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={lbl}>Valid Until</label>
                            <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={inp} />
                        </div>
                        <div>
                            <label style={lbl}>Notes</label>
                            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes…" style={inp} />
                        </div>
                    </div>

                    {/* Line items table */}
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                        {/* Column headers */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 72px 88px 72px 72px 28px', gap: 8, padding: '7px 12px', background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
                            {['Product', 'Type', 'Unit Price', 'Qty', 'Disc %', ''].map((h, i) => (
                                <div key={i} style={{ fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, textAlign: i >= 2 ? 'right' : 'left', fontFamily: T.sans }}>{h}</div>
                            ))}
                        </div>
                        {lines.length === 0 ? (
                            <div style={{ padding: '2rem', textAlign: 'center', color: T.inkMuted, fontSize: 12.5, fontStyle: 'italic', fontFamily: T.sans }}>
                                ← Add products from the catalog on the left
                            </div>
                        ) : (
                            lines.map((item) => (
                                <div key={item._key} style={{ display: 'grid', gridTemplateColumns: '1.8fr 72px 88px 72px 72px 28px', gap: 8, padding: '8px 12px', alignItems: 'center', borderBottom: `1px solid ${T.border}` }}>
                                    <div>
                                        <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{item.productName}</div>
                                        {item.customPrice && <div style={{ fontSize: 10.5, color: '#7c3aed', fontFamily: T.sans }}>Custom price — enter below</div>}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <TypeBadge type={item.productType} />
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <input type="number" min="0" value={item.listPrice}
                                            onChange={e => updateLine(item._key, 'listPrice', Number(e.target.value))}
                                            style={{ ...inp, width: '100%', textAlign: 'right', padding: '3px 6px', borderColor: item.customPrice ? '#7c3aed' : undefined, boxShadow: item.customPrice ? '0 0 0 2px rgba(124,58,237,0.1)' : undefined }}
                                            placeholder={item.customPrice ? 'Enter $' : '0'}
                                        />
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <input type="number" min="1" value={item.quantity}
                                            onChange={e => updateLine(item._key, 'quantity', Number(e.target.value))}
                                            style={{ ...inp, width: '100%', textAlign: 'right', padding: '3px 6px' }}
                                        />
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <input type="number" min="0" max="100" value={item.discountPct}
                                            onChange={e => updateLine(item._key, 'discountPct', Number(e.target.value))}
                                            style={{ ...inp, width: '100%', textAlign: 'right', padding: '3px 6px', borderColor: Number(item.discountPct) >= 10 ? T.warn : undefined }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <button onClick={() => removeLine(item._key)} style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Totals + actions */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20, alignItems: 'flex-start' }}>
                        {/* Totals */}
                        <div style={{ width: 260, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                            {[
                                { l: 'Subtotal',                               v: fmtFull(listTotal),                muted: true },
                                { l: `Avg discount (${Math.round(avgDiscPct)}%)`, v: '-' + fmtFull(listTotal - totalValue), color: avgDiscPct > 0 ? T.warn : T.inkMuted },
                                { l: 'Net total',                              v: fmtFull(totalValue),               bold: true },
                            ].map(r => (
                                <div key={r.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderBottom: r.bold ? 'none' : `1px solid ${T.border}`, background: r.bold ? T.surface2 : 'transparent' }}>
                                    <span style={{ fontSize: r.bold ? 13 : 11.5, fontWeight: r.bold ? 700 : 400, color: r.color || (r.muted ? T.inkMid : T.ink), fontFamily: T.sans }}>{r.l}</span>
                                    <span style={{ fontSize: r.bold ? 15 : 12, fontWeight: r.bold ? 800 : 600, color: r.color || (r.bold ? T.ink : T.inkMid), fontFamily: 'ui-monospace,Menlo,monospace' }}>{r.v}</span>
                                </div>
                            ))}
                        </div>
                        {/* Action buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140 }}>
                            {error && <div style={{ fontSize: 11.5, color: T.danger, fontFamily: T.sans }}>{error}</div>}
                            <button onClick={handleSave} disabled={saving}
                                style={{ background: T.ink, color: T.surface, border: 'none', borderRadius: T.r, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: T.sans, opacity: saving ? 0.6 : 1 }}>
                                {saving ? 'Saving…' : 'Save quote'}
                            </button>
                            <button onClick={onClose}
                                style={{ background: 'transparent', color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '7px 16px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.sans }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
const ConfiguratorPanel = ({ quote, products, onSubmitApproval, onSendToCustomer, onPreviewPDF, onSaveDraft, saving }) => {
    const { avgDisc, margin } = calcLineTotals(quote.lineItems || [], products || []);
    const tier = tierForDiscount(avgDisc);
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '14px 16px' }}>
                <div style={{ ...eyebrow(T.inkMid), fontSize: 10.5, marginBottom: 10 }}>Approval threshold</div>
                <ApprovalGauge discount={avgDisc} />
                <div style={{ fontSize: 11.5, color: T.inkMid, lineHeight: 1.45, marginTop: 10, fontFamily: T.sans }}>
                    <b style={{ color: T.ink }}>{Math.round(avgDisc * 100)}% avg discount.</b>{' '}
                    {tier.approver
                        ? <><b style={{ color: tier.color }}>{tier.approver}</b> sign-off required before send.</>
                        : <>Within your discretion — no approval needed.</>}
                </div>
            </div>

            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '14px 16px' }}>
                <div style={{ ...eyebrow(T.inkMid), fontSize: 10.5, marginBottom: 8 }}>Margin</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: 26, fontWeight: 600, color: margin > 0.5 ? T.ok : margin > 0.35 ? T.ink : T.warn, letterSpacing: -0.5, fontFamily: T.sans }}>{Math.round(margin * 100)}%</div>
                    <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>gross margin</div>
                </div>
                <div style={{ fontSize: 11, color: T.inkMid, lineHeight: 1.4, fontFamily: T.sans }}>
                    Target: 40%. This quote is {margin > 0.4
                        ? <b style={{ color: T.ok }}>above target</b>
                        : <b style={{ color: T.warn }}>below target</b>}.
                </div>
            </div>

            {(quote.status === 'Sent to Customer' || quote.status === 'Negotiating' || quote.status === 'Accepted') && (
                <div style={{ background: 'rgba(77,107,61,0.08)', border: `1px solid rgba(77,107,61,0.25)`, borderRadius: T.r, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, color: T.ok, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 4, fontFamily: T.sans }}>• Customer signal</div>
                    <div style={{ fontSize: 11.5, color: T.inkMid, lineHeight: 1.4, fontFamily: T.sans }}>
                        Quote delivered to customer.{quote.status === 'Accepted' ? ' Customer has accepted.' : ' Awaiting response.'}
                    </div>
                </div>
            )}

            <div style={{ background: T.ink, borderRadius: T.r, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button onClick={tier.approver ? onSubmitApproval : onSendToCustomer} disabled={saving} style={{ background: T.gold, color: T.ink, border: 'none', padding: '10px 14px', fontSize: 13, fontWeight: 600, borderRadius: T.r, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: T.sans, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}>
                    {saving ? 'Saving…' : tier.approver ? `Submit for ${tier.label}` : 'Send to customer'} →
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    <button onClick={onSaveDraft} disabled={saving} style={{ background: 'transparent', color: T.surface, border: `1px solid rgba(255,255,255,0.2)`, padding: '7px 10px', fontSize: 11.5, fontWeight: 500, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>Save draft</button>
                    <button onClick={onPreviewPDF} style={{ background: 'transparent', color: T.surface, border: `1px solid rgba(255,255,255,0.2)`, padding: '7px 10px', fontSize: 11.5, fontWeight: 500, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>Preview PDF</button>
                </div>
            </div>
        </div>
    );
};

// ─── Catalog tab (Price Book with intelligence) ───────────────
function calcProductIntelligence(products, quotes, opportunities) {
    const total = (quotes || []).length;
    const map   = {};
    (products || []).forEach(p => {
        const containing = (quotes || []).filter(q => (q.lineItems || []).some(li => li.productId === p.id));
        const discs = [];
        (quotes || []).forEach(q => { (q.lineItems || []).filter(li => li.productId === p.id).forEach(li => discs.push(Number(li.discountPct) || 0)); });
        const avgDiscount = discs.length > 0 ? discs.reduce((a, b) => a + b, 0) / discs.length : 0;
        const wins = containing.filter(q => { const opp = (opportunities || []).find(o => o.id === q.opportunityId); return opp?.stage === 'Closed Won'; });
        const oppArrs = containing.map(q => { const opp = (opportunities || []).find(o => o.id === q.opportunityId); return parseFloat(opp?.arr) || 0; }).filter(v => v > 0);
        const avgDealSize = oppArrs.length > 0 ? oppArrs.reduce((a, b) => a + b, 0) / oppArrs.length : 0;
        map[p.id] = { attachRate: total > 0 ? containing.length / total : 0, avgDiscount: avgDiscount / 100, winRate: containing.length > 0 ? wins.length / containing.length : 0, avgDealSize, quoteCount: containing.length, margin: p.cost && p.listPrice ? (Number(p.listPrice) - Number(p.cost)) / Number(p.listPrice) : 0 };
    });
    return map;
}

function CatalogTab({ products, settings, userRole, quotes, opportunities, onSave, onDelete, showConfirm }) {
    const isAdmin   = userRole === 'Admin';
    const pbCfg     = settings?.priceBookConfig || {};
    const unitOpts  = pbCfg.units      || ['flat', 'month', 'year', 'user', 'hour', 'day'];
    const typeOpts  = pbCfg.types      || ['recurring', 'one_time', 'service'];
    const catOpts   = [...new Set([...(pbCfg.categories || ['Platform', 'Add-ons', 'Services', 'Hardware']), ...(products || []).map(p => p.category).filter(Boolean)])].sort();

    const [editing,   setEditing]   = useState(null);
    const [form,      setForm]      = useState({});
    const [saving,    setSaving]    = useState(false);
    const [error,     setError]     = useState(null);
    const [search,    setSearch]    = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [sortBy,    setSortBy]    = useState('name');

    const EMPTY = { name: '', category: '', productType: typeOpts[0] || 'recurring', listPrice: '', unit: unitOpts[0] || 'flat', description: '', active: true, customPrice: false };

    const intelligence = useMemo(() => calcProductIntelligence(products, quotes, opportunities), [products, quotes, opportunities]);
    const activeP   = (products || []).filter(p => p.active !== false);
    const topAttach = [...activeP].sort((a, b) => (intelligence[b.id]?.attachRate || 0) - (intelligence[a.id]?.attachRate || 0))[0];
    const mostDisc  = [...activeP].filter(p => (intelligence[p.id]?.quoteCount || 0) > 0).sort((a, b) => (intelligence[b.id]?.avgDiscount || 0) - (intelligence[a.id]?.avgDiscount || 0))[0];
    const bestWin   = [...activeP].filter(p => (intelligence[p.id]?.quoteCount || 0) > 0).sort((a, b) => (intelligence[b.id]?.winRate || 0) - (intelligence[a.id]?.winRate || 0))[0];

    const sorted   = useMemo(() => {
        let list = [...(products || [])];
        if (search.trim()) list = list.filter(p => (p.name || '').toLowerCase().includes(search.toLowerCase()) || (p.category || '').toLowerCase().includes(search.toLowerCase()) || (p.sku || '').toLowerCase().includes(search.toLowerCase()));
        if (filterCat) list = list.filter(p => p.category === filterCat);
        list.sort((a, b) => {
            if (sortBy === 'attach')   return (intelligence[b.id]?.attachRate  || 0) - (intelligence[a.id]?.attachRate  || 0);
            if (sortBy === 'discount') return (intelligence[b.id]?.avgDiscount || 0) - (intelligence[a.id]?.avgDiscount || 0);
            if (sortBy === 'winrate')  return (intelligence[b.id]?.winRate     || 0) - (intelligence[a.id]?.winRate     || 0);
            if (sortBy === 'price')    return (Number(b.listPrice || b.price) || 0) - (Number(a.listPrice || a.price) || 0);
            return (a.name || '').localeCompare(b.name || '');
        });
        return list;
    }, [products, search, filterCat, sortBy, intelligence]);
    const filtered = sorted;

    const openNew  = () => { setForm(EMPTY); setEditing('new'); setError(null); };
    const openEdit = (p) => { setForm({ name: p.name || '', category: p.category || '', productType: p.productType || p.type || typeOpts[0] || 'recurring', listPrice: p.listPrice || p.price || '', unit: p.unit || unitOpts[0] || 'flat', description: p.description || '', active: p.active !== false, customPrice: p.customPrice === true }); setEditing(p.id); setError(null); };
    const cancel   = () => { setEditing(null); setError(null); };

    const handleSave = async () => {
        if (!form.name.trim()) { setError('Product name is required.'); return; }
        if (!form.customPrice && (form.listPrice === '' || isNaN(Number(form.listPrice)))) { setError('A valid list price is required.'); return; }
        setSaving(true);
        try {
            const payload = { ...form, listPrice: form.customPrice ? null : Number(form.listPrice), id: editing === 'new' ? undefined : editing };
            await onSave(payload, editing === 'new' ? null : (products || []).find(p => p.id === editing) || null);
            cancel();
        } catch (err) { setError(err.message || 'Failed to save.'); }
        finally { setSaving(false); }
    };
    const handleDelete = (id) => { showConfirm && showConfirm('Delete this product?', async () => { await onDelete(id); }); };

    const MiniBar = ({ value, max, color }) => {
        const p2 = Math.min(1, max > 0 ? value / max : 0);
        return (
            <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 500, color: T.ink, marginBottom: 2, fontFamily: T.sans }}>{Math.round(value * 100)}%</div>
                <div style={{ height: 3, background: T.surface2, borderRadius: 1, overflow: 'hidden', width: 48 }}>
                    <div style={{ width: `${p2 * 100}%`, height: '100%', background: color }} />
                </div>
            </div>
        );
    };

    // Inline bar cell for the grouped catalog table
    const BarCell = ({ value, max, color }) => {
        if (value === null || value === undefined) return <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>—</span>;
        const p2 = Math.min(1, max > 0 ? value / max : 0);
        return (
            <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: T.ink, marginBottom: 3, fontFamily: T.sans }}>{Math.round(value * 100)}%</div>
                <div style={{ height: 3, background: T.border, borderRadius: 1, overflow: 'hidden' }}>
                    <div style={{ width: `${p2 * 100}%`, height: '100%', background: color }} />
                </div>
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Insight cards */}
            {(quotes || []).length > 0 && (topAttach || mostDisc || bestWin) && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.625rem' }}>
                    {[
                        { label: 'Highest attach rate',     product: topAttach, metric: 'attachRate',  sub: 'of all quotes include this',       accent: T.info },
                        { label: 'Most-discounted product', product: mostDisc,  metric: 'avgDiscount', sub: 'avg discount — review list price?', accent: T.warn },
                        { label: 'Boosts win rate',         product: bestWin,   metric: 'winRate',     sub: 'win rate when included',           accent: T.ok },
                    ].filter(c => c.product).map(card => {
                        const intel = intelligence[card.product?.id] || {};
                        const val   = intel[card.metric] || 0;
                        return (
                            <div key={card.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '0.875rem 1rem', position: 'relative', overflow: 'hidden' }}>
                                <span style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: card.accent }} />
                                <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.375rem', fontFamily: T.sans }}>{card.label}</div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: T.ink, marginBottom: '0.25rem', lineHeight: 1.3, fontFamily: T.sans }}>{card.product.name}</div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                    <span style={{ fontSize: '1.375rem', fontWeight: 700, color: card.accent, letterSpacing: '-0.02em', lineHeight: 1, fontFamily: T.sans }}>{Math.round(val * 100)}%</span>
                                    <span style={{ fontSize: '0.6875rem', color: T.inkMuted, fontFamily: T.sans }}>{card.sub}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                {/* Search */}
                <div style={{ position: 'relative', minWidth: 220, maxWidth: 300 }}>
                    <span style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: T.inkMuted, fontSize: 12, pointerEvents: 'none' }}>🔍</span>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products, SKUs, categories…"
                        style={{ width: '100%', paddingLeft: '1.875rem', paddingRight: search ? '1.75rem' : '0.6rem', paddingTop: '0.375rem', paddingBottom: '0.375rem', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.8125rem', fontFamily: T.sans, background: T.bg, color: T.ink, outline: 'none', boxSizing: 'border-box' }} />
                    {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: T.inkMuted, cursor: 'pointer', fontSize: '0.875rem', lineHeight: 1, padding: 0 }}>×</button>}
                </div>
                {/* Category filter */}
                <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                    style={{ padding: '0.375rem 0.6rem', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.8125rem', fontFamily: T.sans, background: T.bg, color: T.ink, outline: 'none', cursor: 'pointer' }}>
                    <option value="">All categories</option>
                    {catOpts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {/* Sort by */}
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                    style={{ padding: '0.375rem 0.6rem', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.8125rem', fontFamily: T.sans, background: T.bg, color: T.ink, outline: 'none', cursor: 'pointer' }}>
                    <option value="name">Sort by: Name</option>
                    <option value="attach">Sort by: Attach rate</option>
                    <option value="discount">Sort by: Avg discount</option>
                    <option value="winrate">Sort by: Win rate</option>
                    <option value="price">Sort by: Price</option>
                </select>
                <div style={{ flex: 1 }} />
                {/* View bundles — ghost button */}
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.375rem 0.75rem', background: 'transparent', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: '0.8125rem', fontWeight: 500, color: T.ink, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                    ☰ View bundles
                </button>
                {/* Add product — primary button */}
                {isAdmin && (
                    <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0.375rem 0.75rem', background: T.ink, border: 'none', borderRadius: T.r, fontSize: '0.8125rem', fontWeight: 600, color: T.surface, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                        + Add product
                    </button>
                )}
            </div>

            {/* Edit form */}
            {isAdmin && editing && (
                <div className="table-container" style={{ padding: '1.25rem' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: T.ink, marginBottom: '1rem', fontFamily: T.sans }}>{editing === 'new' ? 'New Product' : 'Edit Product'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div><label style={lbl}>Product Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} placeholder="e.g. Enterprise Platform" /></div>
                        <div><label style={lbl}>Category</label><select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inp}><option value="">— Select —</option>{catOpts.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                        <div><label style={lbl}>Type</label><select value={form.productType} onChange={e => setForm(f => ({ ...f, productType: e.target.value }))} style={inp}>{typeOpts.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                        <div><label style={lbl}>Price ($)</label>{form.customPrice ? <div style={{ ...inp, color: '#94a3b8', fontStyle: 'italic', display: 'flex', alignItems: 'center', fontSize: '0.75rem' }}>Rep enters on quote</div> : <input type="number" min="0" value={form.listPrice} onChange={e => setForm(f => ({ ...f, listPrice: e.target.value }))} style={inp} placeholder="0" />}</div>
                        <div><label style={lbl}>Unit</label><select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={inp}>{unitOpts.map(u => <option key={u} value={u}>{u}</option>)}</select></div>
                    </div>
                    <div style={{ marginBottom: '0.75rem' }}><label style={lbl}>Description</label><input value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={inp} placeholder="Brief description" /></div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', background: T.bg, border: '1px solid #e5e2db', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '0.75rem' }}>
                        <input type="checkbox" id="pb-custom" checked={!!form.customPrice} onChange={e => setForm(f => ({ ...f, customPrice: e.target.checked, listPrice: e.target.checked ? '' : f.listPrice }))} style={{ marginTop: 2, cursor: 'pointer' }} />
                        <label htmlFor="pb-custom" style={{ cursor: 'pointer' }}><div style={{ fontSize: '0.8125rem', fontWeight: 600, color: T.ink, fontFamily: T.sans }}>Custom / Variable Price</div><div style={{ fontSize: '0.75rem', color: '#78716c', marginTop: 2, fontFamily: T.sans }}>Rep enters price directly on the quote.</div></label>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <input type="checkbox" id="prod-active" checked={form.active !== false} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                        <label htmlFor="prod-active" style={{ fontSize: '0.8125rem', color: '#44403c', cursor: 'pointer', fontFamily: T.sans }}>Active (visible in quote builder)</label>
                    </div>
                    {error && <div style={{ color: '#dc2626', fontSize: '0.8125rem', marginBottom: '0.5rem', fontFamily: T.sans }}>{error}</div>}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={cancel} style={{ background: '#e8e3da', color: '#78716c', border: '1px solid #ddd8cf', borderRadius: 8, padding: '0.4rem 1rem', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
                        <button onClick={handleSave} disabled={saving} style={{ background: T.ink, color: T.surface, border: 'none', borderRadius: 8, padding: '0.4rem 1rem', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', fontFamily: T.sans, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save Product'}</button>
                    </div>
                </div>
            )}

            {/* Products table — grouped by category */}
            {filtered.length === 0 ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: T.inkMuted, fontSize: '0.875rem', fontStyle: 'italic', fontFamily: T.sans }}>
                    {search ? <>No products match <strong>"{search}"</strong>.</> : isAdmin ? 'No products yet. Click "+ Add product" to build your catalog.' : 'Contact your admin to add products.'}
                </div>
            ) : (() => {
                // Group filtered products by category, preserving category order
                const catOrder = [...new Set((products || []).map(p => p.category || 'Other'))];
                const groups = {};
                filtered.forEach(p => {
                    const cat = p.category || 'Other';
                    if (!groups[cat]) groups[cat] = [];
                    groups[cat].push(p);
                });
                const colHeader = (label, right) => (
                    <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: right ? 'right' : 'left', fontFamily: T.sans }}>{label}</div>
                );
                return catOrder.filter(cat => groups[cat]).map(cat => (
                    <div key={cat} style={{ marginBottom: 16 }}>
                        {/* Category header */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '0 2px 8px' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{cat}</div>
                            <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{groups[cat].length} product{groups[cat].length !== 1 ? 's' : ''}</div>
                        </div>
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                            {/* Column headers */}
                            <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 90px 90px 90px 80px 50px', padding: '7px 14px', gap: 10, background: T.surface2, borderBottom: `1px solid ${T.border}`, alignItems: 'center' }}>
                                {colHeader('SKU')}
                                {colHeader('Name')}
                                {colHeader('List price')}
                                {colHeader('Attach')}
                                {colHeader('Avg disc')}
                                {colHeader('Win rate')}
                                {colHeader('Margin')}
                                <div style={{ textAlign: 'right', fontSize: '0.5625rem', fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: T.sans }}>Edit</div>
                            </div>
                            {/* Product rows */}
                            {groups[cat].map((prod, i) => {
                                const intel = intelligence[prod.id] || {};
                                const discColor = (intel.avgDiscount || 0) > 0.12 ? T.warn : (intel.avgDiscount || 0) > 0.08 ? T.inkMid : T.ok;
                                const margin    = intel.margin || 0;
                                const hasData   = intel.quoteCount > 0;
                                const isLast    = i === groups[cat].length - 1;
                                const normType  = (prod.productType || prod.type || '').replace('_', '-');
                                const typeLabel = normType === 'recurring' ? 'Recurring' : normType === 'one-time' ? 'One-time' : normType === 'service' ? 'Service' : normType || '';
                                const unitLabel = prod.unit === 'month' ? '/mo' : prod.unit === 'year' ? '/yr' : prod.unit === 'user' ? '/user' : prod.unit ? `/${prod.unit}` : '';
                                return (
                                    <div key={prod.id}
                                        style={{ display: 'grid', gridTemplateColumns: '90px 1fr 90px 90px 90px 90px 80px 50px', padding: '10px 14px', gap: 10, alignItems: 'center', borderBottom: isLast ? 'none' : `1px solid ${T.border}`, background: 'transparent', transition: 'background 80ms' }}
                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        {/* SKU */}
                                        <div style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 11, color: T.inkMid }}>{prod.sku || '—'}</div>
                                        {/* Name + type subtitle */}
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 500, color: T.ink, fontFamily: T.sans, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {prod.name}
                                                {prod.customPrice && <span style={{ fontSize: 8.5, fontWeight: 700, color: '#7c3aed', background: '#f3e8ff', padding: '1px 4px', borderRadius: 2, textTransform: 'uppercase' }}>Custom</span>}
                                                {prod.isNew && <span style={{ fontSize: 8.5, fontWeight: 700, color: T.info, background: `${T.info}18`, padding: '1px 5px', borderRadius: 2, textTransform: 'uppercase' }}>NEW</span>}
                                            </div>
                                            <div style={{ fontSize: 10.5, color: T.inkMuted, marginTop: 1, fontFamily: T.sans }}>{typeLabel}{unitLabel ? ` · ${unitLabel}` : ''}</div>
                                        </div>
                                        {/* List price */}
                                        <div style={{ fontSize: 12, fontWeight: 600, color: prod.customPrice ? '#7c3aed' : T.ink, fontFamily: 'ui-monospace,Menlo,monospace', fontStyle: prod.customPrice ? 'italic' : 'normal' }}>
                                            {prod.customPrice ? 'Variable' : '$' + Number(prod.listPrice || prod.price || 0).toLocaleString()}
                                        </div>
                                        {/* Attach */}
                                        <BarCell value={hasData ? intel.attachRate : null} max={1} color={T.info} />
                                        {/* Avg disc */}
                                        <BarCell value={hasData ? intel.avgDiscount : null} max={0.3} color={discColor} />
                                        {/* Win rate */}
                                        <BarCell value={hasData ? intel.winRate : null} max={0.7} color={T.ok} />
                                        {/* Margin */}
                                        <BarCell value={hasData && margin > 0 ? margin : null} max={1} color={margin > 0.5 ? T.ok : margin > 0.35 ? T.inkMid : T.warn} />
                                        {/* Edit */}
                                        <div style={{ textAlign: 'right' }}>
                                            {isAdmin && <button onClick={() => openEdit(prod)} style={{ background: 'none', border: 'none', color: T.info, cursor: 'pointer', fontSize: '0.75rem', fontFamily: T.sans, padding: 0 }}>Edit</button>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ));
            })()}
        </div>
    );
}

// ─── Approvals tab ────────────────────────────────────────────
function ApprovalsTab({ quotes, opportunities, currentUser, userRole, settings, onApprove, onReject, onEdit }) {
    const isManager = userRole === 'Manager' || userRole === 'Admin';
    const pending   = useMemo(() => (quotes || []).filter(q => q.status === 'Pending Approval'), [quotes]);
    const [notice,  setNotice] = useState(null);

    // Recent decisions — approved/rejected in last 30 days (simulate from status)
    const recentDecisions = useMemo(() => (quotes || []).filter(q =>
        q.status === 'Approved' || q.status === 'Rejected / Lost' || q.status === 'Sent to Customer'
    ).slice(0, 5), [quotes]);

    // Compute KPI stats
    const pendingARR     = pending.reduce((s, q) => s + (parseFloat(q.totalValue) || 0), 0);
    const approvalRate   = recentDecisions.length > 0
        ? Math.round(recentDecisions.filter(q => q.status !== 'Rejected / Lost').length / recentDecisions.length * 100)
        : 0;
    const myQueue        = pending.filter(q => {
        const opp = (opportunities || []).find(o => o.id === q.opportunityId);
        return isManager || q.createdBy === currentUser;
    }).length;
    const userTitle      = isManager ? 'as Sales Manager' : 'for my review';

    const handleSend = async (quote) => {
        try {
            const res  = await dbFetch('/.netlify/functions/quote-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quoteId: quote.id }) });
            const data = await res.json();
            if (!res.ok) { setNotice({ type: 'error', title: 'Send Failed', message: data.error || 'Could not send.' }); return; }
            setNotice({ type: 'success', title: 'Quote Sent!', message: 'Delivered to customer successfully.' });
        } catch { setNotice({ type: 'error', title: 'Send Failed', message: 'Network error. Please try again.' }); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Notice modal */}
            {notice && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setNotice(null)}>
                    <div style={{ background: T.surface, borderRadius: 12, padding: '2rem', maxWidth: 400, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.18)', textAlign: 'center', border: `1.5px solid ${notice.type === 'success' ? '#bbf7d0' : '#fecaca'}` }} onClick={e => e.stopPropagation()}>
                        <div style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{notice.type === 'success' ? '✓' : '⚠'}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: T.ink, marginBottom: '0.5rem', fontFamily: T.sans }}>{notice.title}</div>
                        <div style={{ fontSize: '0.875rem', color: T.inkMid, lineHeight: 1.6, marginBottom: '1.5rem', fontFamily: T.sans }}>{notice.message}</div>
                        <button onClick={() => setNotice(null)} style={{ background: T.ink, color: T.surface, border: 'none', borderRadius: T.r, padding: '0.6rem 2rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Got it</button>
                    </div>
                </div>
            )}

            {/* KPI strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {[
                    { label: 'Pending approval', value: pending.length, sub: pending.length > 0 ? `${fmt(pendingARR)} revenue` : 'all clear' },
                    { label: 'Avg approval time', value: '—', sub: '0.7× baseline' },
                    { label: 'Approval rate', value: approvalRate > 0 ? `${approvalRate}%` : '—', sub: '5% error bars for my role' },
                    { label: 'Your approval queue', value: myQueue, sub: userTitle },
                ].map(kpi => (
                    <div key={kpi.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '0.75rem 1rem' }}>
                        <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem', fontFamily: T.sans }}>{kpi.label}</div>
                        <div style={{ fontSize: '1.375rem', fontWeight: 700, color: T.ink, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: T.sans }}>{kpi.value}</div>
                        <div style={{ fontSize: '0.6875rem', color: T.inkMuted, marginTop: '0.25rem', fontFamily: T.sans }}>{kpi.sub}</div>
                    </div>
                ))}
            </div>

            {/* Pending your approval */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>Pending your approval</div>
                    {pending.length > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.warn, background: `${T.warn}15`, border: `1px solid ${T.warn}40`, padding: '2px 8px', borderRadius: 10, fontFamily: T.sans }}>
                            {pending.length} quotes needing
                        </span>
                    )}
                </div>

                {pending.length === 0 ? (
                    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '2.5rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontStyle: 'italic', fontFamily: T.sans }}>
                        No quotes pending approval. 🎉
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {pending.map(q => {
                            const opp = (opportunities || []).find(o => o.id === q.opportunityId);
                            const { avgDisc, avgDiscPct, totalValue: tv } = calcLineTotals(q.lineItems || [], []);
                            const tier = tierForDiscount(avgDisc);
                            const reason = q.approvalReason || `Avg discount ${Math.round(avgDiscPct)}% — exceeds ${tier.approver ? Math.round((APPROVAL_TIERS[APPROVAL_TIERS.indexOf(tier) - 1]?.maxDiscount || 0) * 100) : 10}% rep tier`;
                            return (
                                <div key={q.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                                    {/* Card header strip */}
                                    <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 10, background: T.surface2 }}>
                                        <span style={{ fontFamily: 'ui-monospace,Menlo,monospace', fontSize: 10, color: T.inkMuted }}>{q.quoteNumber || q.id}</span>
                                        <span style={{ fontSize: 9.5, fontWeight: 700, color: T.warn, background: `${T.warn}15`, border: `1px solid ${T.warn}40`, padding: '1px 7px', borderRadius: 10, fontFamily: T.sans, letterSpacing: 0.3, textTransform: 'uppercase' }}>Pending approval</span>
                                        {q.billingContact && <span style={{ fontSize: 10, color: T.inkMuted, fontFamily: T.sans }}>mailing id</span>}
                                        <div style={{ flex: 1 }} />
                                        <span style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{q.createdBy || '—'}</span>
                                    </div>
                                    {/* Card body */}
                                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: 16, fontWeight: 600, color: T.ink, lineHeight: 1.2, marginBottom: 2, fontFamily: T.sans }}>{opp?.account || '—'}</div>
                                            <div style={{ fontSize: 12, color: T.inkMid, marginBottom: 6, fontFamily: T.sans }}>{opp?.opportunityName || opp?.account || '—'} — {q.name || q.quoteNumber}</div>
                                            <div style={{ fontSize: 11, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans }}>Reason: {reason}</div>
                                        </div>
                                        {/* Right: Revenue + actions */}
                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                            <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, letterSpacing: -0.3, fontFamily: T.sans }}>{fmt(q.totalValue || tv || 0)}</div>
                                            <div style={{ fontSize: 10.5, color: T.inkMuted, marginBottom: 10, fontFamily: T.sans }}>{Math.round(avgDiscPct)}% disc · {tier.label}</div>
                                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                                <button onClick={() => onEdit(q)}
                                                    style={{ background: 'transparent', color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.sans }}>
                                                    Sendback
                                                </button>
                                                {isManager && (
                                                    <button onClick={() => onApprove(q)}
                                                        style={{ background: T.ok, color: '#fff', border: 'none', borderRadius: T.r, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                                                        Approve
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Recent decisions */}
            <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>Recent decisions</div>
                    <span style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>Last 30 days</span>
                </div>
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                    {recentDecisions.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontStyle: 'italic', fontFamily: T.sans }}>No recent decisions.</div>
                    ) : (
                        recentDecisions.map((q, i) => {
                            const opp = (opportunities || []).find(o => o.id === q.opportunityId);
                            const isApproved = q.status === 'Approved' || q.status === 'Sent to Customer';
                            const isSentback = q.status === 'Rejected / Lost';
                            const statusLabel = isApproved ? 'APPROVED' : isSentback ? 'SENT BACK' : q.status.toUpperCase();
                            const statusColor = isApproved ? T.ok : isSentback ? T.danger : T.inkMuted;
                            return (
                                <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderBottom: i < recentDecisions.length - 1 ? `1px solid ${T.border}` : 'none', cursor: 'pointer' }}
                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                    onClick={() => onEdit(q)}>
                                    {/* Status tag */}
                                    <div style={{ width: 72, flexShrink: 0 }}>
                                        <span style={{ fontSize: 9.5, fontWeight: 700, color: statusColor, textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: T.sans }}>{statusLabel}</span>
                                    </div>
                                    {/* Account + quote number */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{opp?.account || '—'}</div>
                                        <div style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: 'ui-monospace,Menlo,monospace', marginTop: 1 }}>{q.quoteNumber || q.id}</div>
                                        {isSentback && q.approvalReason && (
                                            <div style={{ fontSize: 10.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans, marginTop: 2 }}>"{q.approvalReason}"</div>
                                        )}
                                    </div>
                                    {/* Right: approver + date + Revenue */}
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: T.sans }}>{fmt(q.totalValue || 0)}</div>
                                        <div style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans, marginTop: 1 }}>
                                            {q.approvedBy || (isManager ? 'Sales Manager' : 'Rep')} · {(q.updatedAt || q.createdAt || '').slice(0, 10) || '—'}
                                        </div>
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

// ─── Main QuotesTab ───────────────────────────────────────────
export default function QuotesTab() {
    const {
        quotes, setQuotes, products, opportunities, settings, currentUser, userRole,
        handleSaveQuote, handleDeleteQuote, handleSaveProduct, handleDeleteProduct,
        loadQuotes, getNextQuoteNumber, showConfirm,
        quotesDeepLinkOppId, setQuotesDeepLinkOppId,
    } = useApp();

    const isAdmin   = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const isReadOnly= userRole === 'ReadOnly';
    const canEdit   = !isReadOnly;

    // ── Tab state ─────────────────────────────────────────────
    const [subTab,             setSubTabRaw]        = useState(() => localStorage.getItem('tab:quotes:subTab') || 'deals');
    const [configuratorOppId,  setConfiguratorOppId] = useState(null);
    const [configuratorQId,    setConfiguratorQId]   = useState(null);
    const [editingQuoteId,     setEditingQuoteId]    = useState(null); // line item editor open
    const [viewMode,           setViewMode]          = useState('build');
    const [tplOpp,             setTplOpp]            = useState(null);
    const [saving,             setSaving]            = useState(false);
    const [error,              setError]             = useState(null);

    const setTab = (t) => { setSubTabRaw(t); localStorage.setItem('tab:quotes:subTab', t); };

    // Consume deep link from opp modal
    useEffect(() => {
        if (quotesDeepLinkOppId) {
            setConfiguratorOppId(quotesDeepLinkOppId);
            setConfiguratorQId(null);
            setViewMode('build');
            setQuotesDeepLinkOppId(null);
            setTab('configurator');
        }
    }, [quotesDeepLinkOppId]);

    // ── Visibility filter ─────────────────────────────────────
    // Build approval tiers from settings, overriding the module-level fallback
    const approvalTiers = useMemo(() => buildApprovalTiers(settings?.approvalTiers), [settings?.approvalTiers]);
    // Keep module-level reference in sync for components that use APPROVAL_TIERS directly
    React.useEffect(() => { APPROVAL_TIERS = approvalTiers; }, [approvalTiers]);

    const managedReps = useMemo(() => new Set((settings?.users || []).filter(u => u.managedBy === currentUser || u.manager === currentUser).map(u => u.name)), [settings, currentUser]);

    const visibleQuotes = useMemo(() => (quotes || []).filter(q => {
        if (isAdmin) return true;
        if (isManager) {
            const opp = (opportunities || []).find(o => o.id === q.opportunityId);
            if (!opp) return q.createdBy === currentUser;
            return managedReps.has(opp.salesRep) || opp.salesRep === currentUser || q.createdBy === currentUser;
        }
        return q.createdBy === currentUser;
    }), [quotes, opportunities, userRole, currentUser, managedReps]);

    // ── Deal summaries ────────────────────────────────────────
    const oppQuoteSummaries = useMemo(() => {
        const oppIds = [...new Set(visibleQuotes.map(q => q.opportunityId).filter(Boolean))];
        return oppIds.map(oid => {
            const opp    = (opportunities || []).find(o => o.id === oid);
            const qs     = visibleQuotes.filter(q => q.opportunityId === oid);
            const active = qs.filter(q => !['Superseded', 'Expired', 'Rejected / Lost'].includes(q.status));
            const latest = [...active].sort((a, b) => (b.version || 1) - (a.version || 1))[0] || qs[0];
            return { opp, quotes: qs, active, latest };
        }).filter(s => s.opp);
    }, [visibleQuotes, opportunities]);

    const quotedOppIds = useMemo(() => new Set(visibleQuotes.map(q => q.opportunityId)), [visibleQuotes]);
    const needsQuote   = useMemo(() => (opportunities || [])
        .filter(o => ['Discovery', 'Proposal', 'Negotiation', 'Closing'].includes(o.stage) && !quotedOppIds.has(o.id))
        .sort((a, b) => new Date(a.forecastedCloseDate || '9999') - new Date(b.forecastedCloseDate || '9999')),
    [opportunities, quotedOppIds]);

    // ── Configurator state ────────────────────────────────────
    const configuratorOpp    = configuratorOppId ? (opportunities || []).find(o => o.id === configuratorOppId) : null;
    const configuratorQuotes = useMemo(() =>
        visibleQuotes.filter(q => q.opportunityId === configuratorOppId).sort((a, b) => (a.version || 1) - (b.version || 1)),
    [visibleQuotes, configuratorOppId]);
    const activeQuote = useMemo(() =>
        (configuratorQId ? configuratorQuotes.find(q => q.id === configuratorQId) : null) ||
        configuratorQuotes[configuratorQuotes.length - 1] || null,
    [configuratorQuotes, configuratorQId]);
    const prevQuote = useMemo(() => {
        if (!activeQuote) return null;
        const idx = configuratorQuotes.indexOf(activeQuote);
        return idx > 0 ? configuratorQuotes[idx - 1] : null;
    }, [activeQuote, configuratorQuotes]);

    const pendingCount = (quotes || []).filter(q => q.status === 'Pending Approval').length;

    // ── Navigation ────────────────────────────────────────────
    const openConfigurator = (oppId, quoteId = null) => {
        setConfiguratorOppId(oppId);
        setConfiguratorQId(quoteId);
        setEditingQuoteId(null);
        setViewMode('build');
        setTab('configurator');
    };

    // ── Handlers ──────────────────────────────────────────────
    const handleNewQuoteForOpp = async (oppId) => {
        if (!canEdit) return;
        setSaving(true); setError(null);
        try {
            const opp     = (opportunities || []).find(o => o.id === oppId);
            const payload = {
                id: genQuoteId(),
                quoteNumber: getNextQuoteNumber(),
                version: 1,
                name: (opp?.opportunityName || opp?.account || 'Quote') + ' v1',
                opportunityId: oppId,
                lineItems: [],
                status: 'Draft',
                createdBy: currentUser,
                paymentTerms: 'Net 30 · Annual',
            };
            await handleSaveQuote(payload, null);
            openConfigurator(oppId, payload.id);
        } catch (err) { setError(err.message || 'Failed to create quote.'); }
        finally { setSaving(false); }
    };

    const handleNewVersion = async () => {
        if (!activeQuote || !canEdit) return;
        setSaving(true);
        try {
            const maxV = Math.max(...configuratorQuotes.map(q => q.version || 1));
            if (maxV >= 3) { setError('Maximum 3 versions per quote.'); setSaving(false); return; }
            const payload = {
                id: genQuoteId(),
                quoteNumber: activeQuote.quoteNumber,
                version: maxV + 1,
                name: (activeQuote.name || '').replace(/\s+v\d+$/, '') + ' v' + (maxV + 1),
                opportunityId: activeQuote.opportunityId,
                validUntil: activeQuote.validUntil,
                paymentTerms: activeQuote.paymentTerms,
                lineItems: [...(activeQuote.lineItems || [])],
                notes: activeQuote.notes,
                billingContact: activeQuote.billingContact || '',
                status: 'Draft',
                createdBy: currentUser,
            };
            await handleSaveQuote(payload, null);
            setConfiguratorQId(payload.id);
        } catch (err) { setError(err.message || 'Failed to create version.'); }
        finally { setSaving(false); }
    };

    const handleSubmitApproval  = async () => { if (!activeQuote) return; setSaving(true); try { await handleSaveQuote({ ...activeQuote, status: 'Pending Approval' }, activeQuote); } catch (err) { setError(err.message); } finally { setSaving(false); } };
    const handleSendToCustomer  = async () => { if (!activeQuote) return; setSaving(true); try { await handleSaveQuote({ ...activeQuote, status: 'Sent to Customer' }, activeQuote); } catch (err) { setError(err.message); } finally { setSaving(false); } };
    const handleSaveDraft       = async () => { if (!activeQuote) return; setSaving(true); try { await handleSaveQuote({ ...activeQuote }, activeQuote); } catch (err) { setError(err.message); } finally { setSaving(false); } };
    const handleSaveLineItems   = async (payload) => { setSaving(true); try { await handleSaveQuote(payload, payload); } catch (err) { throw err; } finally { setSaving(false); } };
    const handleApprove         = async (q) => { await handleSaveQuote({ ...q, status: 'Approved' }, q); };
    const handleReject          = async (q) => { await handleSaveQuote({ ...q, status: 'Rejected / Lost' }, q); };
    const handleSaveProductLocal  = async (data) => { await handleSaveProduct(data, data.id ? (products || []).find(p => p.id === data.id) || null : null); };
    const handleDeleteProductLocal = async (id) => { await handleDeleteProduct(id); };

    const handleExportPDF = async () => {
        if (!activeQuote) return;
        const { lines, netTotal } = calcLineTotals(activeQuote.lineItems || [], products || []);
        try {
            const res = await dbFetch('/.netlify/functions/quote-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quote: activeQuote, opportunity: configuratorOpp, lines }) });
            if (!res.ok) throw new Error('PDF generation failed');
            const blob = await res.blob();
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a'); a.href = url; a.download = (activeQuote.quoteNumber || 'quote') + '-v' + (activeQuote.version || 1) + '.pdf'; a.click(); URL.revokeObjectURL(url);
        } catch {
            const w = window.open('', '_blank');
            if (!w) return;
            w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${activeQuote.quoteNumber || 'Quote'}</title><style>body{font-family:system-ui,sans-serif;color:#1c1917;padding:2rem}table{width:100%;border-collapse:collapse;margin-top:1.5rem}th,td{padding:0.5rem 0.75rem;border-bottom:1px solid #e2e8f0;font-size:0.875rem}th{background:#f8fafc;font-weight:700;text-transform:uppercase;font-size:0.75rem}</style></head><body><h1>${activeQuote.name || activeQuote.quoteNumber || 'Quote'}</h1><p>${configuratorOpp?.account || ''}</p><table><thead><tr><th>Product</th><th>Qty</th><th>Total</th></tr></thead><tbody>${lines.map(li => `<tr><td>${li.productName}</td><td>${li.quantity || 1}</td><td>$${Math.round(li.lineTotal).toLocaleString()}</td></tr>`).join('')}</tbody></table><p><strong>Total: $${Math.round(netTotal).toLocaleString()}</strong></p></body></html>`);
            w.document.close(); setTimeout(() => w.print(), 400);
        }
    };

    // ── Stage colour map ──────────────────────────────────────
    const stageColors = { 'Prospecting': '#b0a088', 'Qualification': '#c8a978', 'Discovery': '#b07a55', 'Proposal': '#b87333', 'Negotiation': '#7a5a3c', 'Closing': '#4d6b3d', 'Closed Won': '#3a5530', 'Closed Lost': '#9c3a2e' };

    // ── RENDER ────────────────────────────────────────────────
    return (
        <div className="tab-page" style={{ fontFamily: T.sans }}>

            {/* Page header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, paddingBottom: 12 }}>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 28, fontFamily: T.serif, fontStyle: 'italic', fontWeight: 300, letterSpacing: -0.8, color: T.ink, lineHeight: 1, marginBottom: 5 }}>Quotes</div>
                    <div style={{ fontSize: 12, color: T.inkMuted }}>
                        <span style={{ fontWeight: 600, color: T.ink }}>{oppQuoteSummaries.length}</span> deals with quotes
                        {needsQuote.length > 0 && <><span style={{ margin: '0 6px', color: T.border }}>·</span><span style={{ color: T.warn, fontWeight: 600 }}>{needsQuote.length}</span> need a quote</>}
                        {pendingCount > 0 && <><span style={{ margin: '0 6px', color: T.border }}>·</span><span style={{ color: T.warn, fontWeight: 600 }}>{pendingCount}</span> pending approval</>}
                    </div>
                </div>
                {canEdit && (
                    <button onClick={() => setTab('deals')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: T.ink, border: 'none', color: T.surface, borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                        + New Quote
                    </button>
                )}
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.border}`, marginBottom: 12 }}>
                {[
                    { id: 'deals',        label: 'Deals' },
                    { id: 'configurator', label: 'Configurator' },
                    { id: 'catalog',      label: 'Catalog' },
                    { id: 'approvals',    label: 'Approvals', badge: pendingCount > 0 ? pendingCount : null },
                ].map(v => {
                    const active = subTab === v.id;
                    return (
                        <button key={v.id} onClick={() => setTab(v.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '8px 16px', border: 'none', borderBottom: active ? `2px solid ${T.ink}` : '2px solid transparent', background: 'transparent', color: active ? T.ink : T.inkMuted, fontSize: 12, fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: T.sans, transition: 'color 120ms, border-color 120ms', whiteSpace: 'nowrap', marginBottom: -1 }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.color = T.inkMid; }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.color = T.inkMuted; }}>
                            {v.label}
                            {v.badge && <span style={{ background: T.warn, color: '#fff', borderRadius: '999px', fontSize: '0.5rem', fontWeight: 800, minWidth: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>{v.badge}</span>}
                        </button>
                    );
                })}
            </div>

            {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '0.625rem 0.875rem', fontSize: '0.8125rem', color: '#dc2626', marginBottom: 12, fontFamily: T.sans }}>{error}</div>}

            {/* ── DEALS ──────────────────────────────────────── */}
            {subTab === 'deals' && (
                <div>
                    {/* KPI strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
                        {[
                            { label: 'Deals with quotes', value: oppQuoteSummaries.length, sub: `of ${(opportunities || []).filter(o => !o.stage.startsWith('Closed')).length} active opps` },
                            { label: 'Need a quote',      value: needsQuote.length,         sub: `${fmt(needsQuote.reduce((s, o) => s + (parseFloat(o.arr) || 0), 0))} in open revenue` },
                            { label: 'Total quoted',      value: fmt(oppQuoteSummaries.reduce((s, x) => s + (parseFloat(x.latest?.totalValue) || 0), 0)), sub: 'across active quotes' },
                            { label: 'Pending approval',  value: pendingCount,              sub: pendingCount > 0 ? 'need manager action' : 'all clear' },
                        ].map(kpi => (
                            <div key={kpi.label} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '0.75rem 1rem' }}>
                                <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.25rem', fontFamily: T.sans }}>{kpi.label}</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: T.ink, lineHeight: 1, letterSpacing: '-0.02em', fontFamily: T.sans }}>{kpi.value}</div>
                                <div style={{ fontSize: '0.6875rem', color: '#64748b', marginTop: '0.2rem', fontFamily: T.sans }}>{kpi.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Needs a quote */}
                    {needsQuote.length > 0 && (
                        <div style={{ marginBottom: 22 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                                <div style={{ ...eyebrow(T.warn) }}>Needs a quote</div>
                                <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{needsQuote.length} opportunit{needsQuote.length === 1 ? 'y' : 'ies'} in advanced stages with no quote</div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px,1fr))', gap: 10 }}>
                                {needsQuote.map(opp => {
                                    const stageColor = stageColors[opp.stage] || T.inkMid;
                                    const closeIn    = opp.forecastedCloseDate ? Math.round((new Date(opp.forecastedCloseDate + 'T12:00:00') - Date.now()) / 86400000) : null;
                                    const urgent     = closeIn !== null && closeIn >= 0 && closeIn <= 14;
                                    const overdue    = closeIn !== null && closeIn < 0;
                                    return (
                                        <div key={opp.id} onClick={() => canEdit && setTplOpp(opp)}
                                            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '14px 16px', cursor: canEdit ? 'pointer' : 'default', position: 'relative', display: 'flex', flexDirection: 'column', gap: 10, transition: 'border-color 120ms' }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = T.borderStrong; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; }}>
                                            <span style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: overdue ? T.danger : urgent ? T.warn : T.gold, borderRadius: `${T.r}px 0 0 ${T.r}px` }} />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: stageColor }} />
                                                <span style={{ fontSize: 10.5, color: T.inkMuted, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: 600, fontFamily: T.sans }}>{opp.stage}</span>
                                                {closeIn !== null && <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 600, color: overdue ? T.danger : urgent ? T.warn : T.inkMuted, fontFamily: T.sans }}>{overdue ? `${Math.abs(closeIn)}d overdue` : closeIn === 0 ? 'closes today' : `closes in ${closeIn}d`}</span>}
                                            </div>
                                            <div>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, lineHeight: 1.25, fontFamily: T.sans }}>{opp.account}</div>
                                                <div style={{ fontSize: 11.5, color: T.inkMid, marginTop: 2, lineHeight: 1.35, fontFamily: T.sans }}>{opp.opportunityName || opp.account}</div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                                                <div>
                                                    <div style={{ fontSize: 16, fontWeight: 600, color: T.ink, letterSpacing: -0.3, fontFamily: T.sans }}>{fmt(opp.arr)}</div>
                                                    <div style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>Revenue · {opp.probability || 0}% probability</div>
                                                </div>
                                                {canEdit && <button style={{ background: T.ink, color: T.surface, border: 'none', padding: '6px 12px', fontSize: 11.5, fontWeight: 600, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>Start quote →</button>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Quotes in flight */}
                    {oppQuoteSummaries.length > 0 && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
                                <div style={{ ...eyebrow(T.inkMid) }}>Quotes in flight</div>
                                <div style={{ fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{oppQuoteSummaries.length} deal{oppQuoteSummaries.length === 1 ? '' : 's'} with active quote versions</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {oppQuoteSummaries.map(s => {
                                    const { opp, quotes: qs, latest } = s;
                                    const { totalValue, avgDisc, margin } = calcLineTotals(latest?.lineItems || [], products || []);
                                    const sc = stageColors[opp.stage] || T.inkMid;
                                    return (
                                        <div key={opp.id} onClick={() => openConfigurator(opp.id, latest?.id)}
                                            style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '14px 18px', display: 'grid', gridTemplateColumns: '1.5fr 1fr auto', gap: 20, alignItems: 'center', cursor: 'pointer', transition: 'border-color 120ms' }}
                                            onMouseEnter={e => e.currentTarget.style.borderColor = T.borderStrong}
                                            onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc }} />
                                                    <span style={{ fontSize: 10.5, color: T.inkMuted, fontWeight: 600, letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: T.sans }}>{opp.stage}</span>
                                                    {opp.forecastedCloseDate && <span style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>· closes {opp.forecastedCloseDate}</span>}
                                                </div>
                                                <div style={{ fontSize: 14, fontWeight: 600, color: T.ink, marginBottom: 2, fontFamily: T.sans }}>{opp.account}</div>
                                                <div style={{ fontSize: 12, color: T.inkMid, fontFamily: T.sans }}>{opp.opportunityName || opp.account}</div>
                                            </div>
                                            {/* Version timeline */}
                                            <div>
                                                <div style={{ ...eyebrow(T.inkMuted), fontSize: 10.5, marginBottom: 6 }}>Quote history · {qs.length} version{qs.length !== 1 ? 's' : ''}</div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    {[...qs].sort((a, b) => (a.version || 1) - (b.version || 1)).map((q, i, arr) => {
                                                        const sc2 = STATUS_COLORS[q.status] || { bg: 'rgba(138,131,120,0.12)', fg: '#5a544c', dot: '#8a8378' };
                                                        const isLatest = q.id === latest?.id;
                                                        const faded    = ['Superseded', 'Expired', 'Rejected / Lost'].includes(q.status);
                                                        return (
                                                            <React.Fragment key={q.id}>
                                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, opacity: faded ? 0.5 : 1 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 13, background: isLatest ? sc2.dot : T.bg, border: `1.5px solid ${sc2.dot}`, color: isLatest ? '#fff' : sc2.fg, fontSize: 10, fontWeight: 700, letterSpacing: 0.3, fontFamily: T.sans }}>v{q.version || 1}</div>
                                                                    <div style={{ fontSize: 9.5, color: T.inkMuted, letterSpacing: 0.3, fontFamily: T.sans }}>{(q.updatedAt || q.createdAt || '').slice(5, 10)}</div>
                                                                </div>
                                                                {i < arr.length - 1 && <div style={{ width: 12, height: 1, background: T.border }} />}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 10.5, color: T.inkMuted, marginBottom: 2, fontFamily: T.sans }}>latest quote</div>
                                                <div style={{ fontSize: 18, fontWeight: 600, color: T.ink, letterSpacing: -0.3, fontFamily: T.sans }}>{fmt(latest?.totalValue || totalValue || 0)}</div>
                                                <div style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>{Math.round(avgDisc * 100)}% off list · {Math.round(margin * 100)}% margin</div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {oppQuoteSummaries.length === 0 && needsQuote.length === 0 && (
                        <div style={{ padding: '4rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>No quotes yet. Start by opening a deal from the Pipeline tab.</div>
                    )}
                </div>
            )}

            {/* ── CONFIGURATOR ───────────────────────────────── */}
            {subTab === 'configurator' && (
                <div>
                    {!configuratorOpp ? (
                        <div style={{ padding: '4rem', textAlign: 'center' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚙</div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: T.ink, marginBottom: '0.5rem', fontFamily: T.sans }}>Configurator</div>
                            <div style={{ fontSize: '0.875rem', color: T.inkMuted, marginBottom: '1.5rem', fontFamily: T.sans }}>Select a deal from the Deals tab to open the CPQ workspace.</div>
                            <button onClick={() => setTab('deals')} style={{ background: T.ink, color: T.surface, border: 'none', borderRadius: T.r, padding: '0.625rem 1.5rem', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Go to Deals →</button>
                        </div>
                    ) : (
                        <div>
                            {/* Opp context bar */}
                            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 16 }}>
                                <button onClick={() => setTab('deals')} style={{ background: 'transparent', border: 'none', color: T.inkMid, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, padding: 0, fontSize: 12, fontFamily: T.sans }}>← All deals</button>
                                <div style={{ width: 1, height: 24, background: T.border }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 11, color: T.inkMuted, marginBottom: 2, fontFamily: T.sans }}>{configuratorOpp.stage} · closes {configuratorOpp.forecastedCloseDate || '—'}</div>
                                    <div style={{ fontSize: 16, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{configuratorOpp.account}</div>
                                    <div style={{ fontSize: 12, color: T.inkMid, marginTop: 2, fontFamily: T.sans }}>{configuratorOpp.opportunityName || configuratorOpp.account}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>opp revenue target</div>
                                    <div style={{ fontSize: 18, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{fmt(configuratorOpp.arr)}</div>
                                </div>
                            </div>

                            {/* Version switcher + Build/Preview toggle */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                                <div style={{ ...eyebrow(T.inkMid), fontSize: 11 }}>Compare versions</div>
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                    {configuratorQuotes.map(q => (
                                        <button key={q.id} onClick={() => { setConfiguratorQId(q.id); setEditingQuoteId(null); }}
                                            style={{ padding: '6px 12px', background: q.id === activeQuote?.id ? T.ink : T.surface, color: q.id === activeQuote?.id ? T.surface : T.ink, border: `1px solid ${q.id === activeQuote?.id ? T.ink : T.border}`, borderRadius: T.r, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.sans, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            v{q.version || 1}<span style={{ fontSize: 10, opacity: 0.7 }}>· {q.status}</span>
                                        </button>
                                    ))}
                                    {canEdit && configuratorQuotes.length < 3 && (
                                        <button onClick={handleNewVersion} disabled={saving}
                                            style={{ padding: '6px 12px', background: 'transparent', color: T.inkMid, border: `1px dashed ${T.border}`, borderRadius: T.r, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.sans, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                            + New version
                                        </button>
                                    )}
                                </div>
                                <div style={{ flex: 1 }} />
                                <div style={{ display: 'inline-flex', border: `1px solid ${T.border}`, borderRadius: T.r, background: T.surface, padding: 2 }}>
                                    {[{ id: 'build', label: 'Build' }, { id: 'preview', label: 'Customer preview' }].map(opt => (
                                        <button key={opt.id} onClick={() => setViewMode(opt.id)}
                                            style={{ padding: '5px 12px', fontSize: 11.5, fontWeight: 500, background: viewMode === opt.id ? T.ink : 'transparent', color: viewMode === opt.id ? T.surface : T.inkMid, border: 'none', borderRadius: T.r - 1, cursor: 'pointer', fontFamily: T.sans }}>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {configuratorQuotes.length === 0 && (
                                <div style={{ padding: '3rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontFamily: T.sans }}>
                                    No quotes for this deal yet.{canEdit && <> <button onClick={() => handleNewQuoteForOpp(configuratorOpp.id)} style={{ background: 'none', border: 'none', color: T.info, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: T.sans }}>Create one →</button></>}
                                </div>
                            )}

                            {/* Build mode */}
                            {configuratorQuotes.length > 0 && viewMode === 'build' && (
                                <>
                                    {/* Inline line item editor — shown when "Edit in builder" is clicked */}
                                    {editingQuoteId && (() => {
                                        const editQ = configuratorQuotes.find(q => q.id === editingQuoteId);
                                        if (!editQ) return null;
                                        return (
                                            <div style={{ marginBottom: 14 }}>
                                                <LineItemEditor
                                                    quote={editQ}
                                                    products={products || []}
                                                    onSave={handleSaveLineItems}
                                                    onClose={() => setEditingQuoteId(null)}
                                                    saving={saving}
                                                />
                                            </div>
                                        );
                                    })()}

                                    {/* Side-by-side columns — always visible, editor is above */}
                                    <div style={{ display: 'grid', gridTemplateColumns: prevQuote ? '1fr 1fr 280px' : '1fr 280px', gap: 10, alignItems: 'flex-start' }}>
                                        {prevQuote && <QuoteColumn quote={prevQuote} otherQuote={activeQuote} label="Previous" readOnly products={products || []} />}
                                        {activeQuote && (
                                            <QuoteColumn
                                                quote={activeQuote}
                                                otherQuote={prevQuote}
                                                label={prevQuote ? 'Current' : 'Active'}
                                                editable
                                                products={products || []}
                                                onEdit={() => setEditingQuoteId(activeQuote.id)}
                                            />
                                        )}
                                        {activeQuote && <ConfiguratorPanel quote={activeQuote} products={products || []} onSubmitApproval={handleSubmitApproval} onSendToCustomer={handleSendToCustomer} onPreviewPDF={() => setViewMode('preview')} onSaveDraft={handleSaveDraft} saving={saving} />}
                                    </div>
                                    {activeQuote && <div style={{ marginTop: 14 }}><QuoteActivityLog quote={activeQuote} /></div>}
                                </>
                            )}

                            {/* Preview mode */}
                            {configuratorQuotes.length > 0 && viewMode === 'preview' && activeQuote && (
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 10, alignItems: 'flex-start' }}>
                                    <QuotePDFPreview quote={activeQuote} opp={configuratorOpp} products={products || []} />
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r, padding: '14px 16px' }}>
                                            <div style={{ ...eyebrow(T.inkMid), fontSize: 10.5, marginBottom: 10 }}>Customer preview</div>
                                            <div style={{ fontSize: 12, color: T.inkMid, lineHeight: 1.5, marginBottom: 12, fontFamily: T.sans }}>
                                                This is what the customer sees when you send v{activeQuote.version || 1}. No internal margin or approval details.
                                            </div>
                                            {(() => {
                                                const { avgDisc } = calcLineTotals(activeQuote.lineItems || [], products || []);
                                                const tier = tierForDiscount(avgDisc);
                                                return tier.approver
                                                    ? <div style={{ fontSize: 11, color: tier.color, fontWeight: 600, fontFamily: T.sans }}>⚠ Needs {tier.approver} approval before send.</div>
                                                    : <div style={{ fontSize: 11, color: T.ok, fontWeight: 600, fontFamily: T.sans }}>✓ Good to send — within rep authority.</div>;
                                            })()}
                                        </div>
                                        <div style={{ background: T.ink, borderRadius: T.r, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <button onClick={handleSendToCustomer} disabled={saving} style={{ background: T.gold, color: T.ink, border: 'none', padding: '10px 14px', fontSize: 13, fontWeight: 600, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}>Send to customer →</button>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                                                <button onClick={handleExportPDF} style={{ background: 'transparent', color: T.surface, border: `1px solid rgba(255,255,255,0.2)`, padding: '7px 10px', fontSize: 11.5, fontWeight: 500, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>Download PDF</button>
                                                <button onClick={() => setViewMode('build')} style={{ background: 'transparent', color: T.surface, border: `1px solid rgba(255,255,255,0.2)`, padding: '7px 10px', fontSize: 11.5, fontWeight: 500, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>← Back to build</button>
                                            </div>
                                        </div>
                                        <QuoteActivityLog quote={activeQuote} />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── CATALOG ────────────────────────────────────── */}
            {subTab === 'catalog' && (
                <CatalogTab
                    products={products}
                    settings={settings}
                    userRole={userRole}
                    quotes={quotes}
                    opportunities={opportunities}
                    onSave={handleSaveProductLocal}
                    onDelete={handleDeleteProductLocal}
                    showConfirm={showConfirm}
                />
            )}

            {/* ── APPROVALS ──────────────────────────────────── */}
            {subTab === 'approvals' && (
                <ApprovalsTab
                    quotes={quotes}
                    opportunities={opportunities}
                    currentUser={currentUser}
                    userRole={userRole}
                    settings={settings}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEdit={(q) => openConfigurator(q.opportunityId, q.id)}
                />
            )}

            {/* Template picker */}
            {tplOpp && (
                <TemplatePickerModal
                    opp={tplOpp}
                    products={products || []}
                    onClose={() => setTplOpp(null)}
                    onPick={() => { setTplOpp(null); handleNewQuoteForOpp(tplOpp.id); }}
                />
            )}
        </div>
    );
}
