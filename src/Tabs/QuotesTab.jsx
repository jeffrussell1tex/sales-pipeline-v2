import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n) => {
    const num = parseFloat(n) || 0;
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return '$' + Math.round(num / 1000) + 'K';
    return '$' + Math.round(num).toLocaleString();
};
const fmtFull = (n) => '$' + (parseFloat(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pct = (n) => (parseFloat(n) || 0).toFixed(1) + '%';

function calcLineTotals(lineItems = [], dealDiscountPct = 0) {
    let subtotal = 0, recurring = 0, oneTime = 0;
    const lines = lineItems.map(item => {
        const qty = Number(item.quantity) || 1;
        const list = Number(item.listPrice) || 0;
        const disc = Math.min(Math.max(Number(item.discountPct) || 0, 0), 100);
        const net = list * (1 - disc / 100);
        const total = net * qty;
        subtotal += total;
        if (item.productType === 'recurring') {
            recurring += item.unit === 'month' ? total * 12 : total;
        } else {
            oneTime += total;
        }
        return { ...item, netPrice: net, lineTotal: total };
    });
    const discAmt = subtotal * (Number(dealDiscountPct) || 0) / 100;
    const totalValue = subtotal - discAmt;
    const avgDisc = subtotal > 0
        ? lineItems.reduce((acc, item) => acc + (Number(item.discountPct) || 0), 0) / (lineItems.length || 1)
        : 0;
    return { lines, subtotal, totalValue, recurringValue: recurring, oneTimeValue: oneTime, avgDisc };
}

function genQuoteId() {
    return 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

// ─── Sub-tab style ────────────────────────────────────────────────────────────

const subTabStyle = (active, current) => ({
    padding: '0.5rem 1.25rem',
    border: 'none',
    borderBottom: active === current ? '2px solid #2563eb' : '2px solid transparent',
    background: 'transparent',
    color: active === current ? '#2563eb' : '#64748b',
    fontWeight: active === current ? '700' : '500',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'all 0.15s',
    whiteSpace: 'nowrap',
});

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_COLORS = {
    'Draft':            { bg: '#f1f5f9', color: '#64748b' },
    'Pending Approval': { bg: '#fef3c7', color: '#92400e' },
    'Approved':         { bg: '#d1fae5', color: '#065f46' },
    'Sent to Customer': { bg: '#dbeafe', color: '#1e40af' },
    'Accepted':         { bg: '#d1fae5', color: '#047857' },
    'Rejected / Lost':  { bg: '#fee2e2', color: '#b91c1c' },
};

function StatusBadge({ status }) {
    const c = STATUS_COLORS[status] || { bg: '#f1f5f9', color: '#64748b' };
    return (
        <span style={{ background: c.bg, color: c.color, fontSize: '0.625rem', fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.2rem 0.5rem',
            borderRadius: '4px', whiteSpace: 'nowrap' }}>
            {status}
        </span>
    );
}

// ─── Product type badge ───────────────────────────────────────────────────────

const TYPE_COLORS = {
    recurring:  { bg: '#dbeafe', color: '#1e40af', label: 'Recurring' },
    'one-time': { bg: '#fef3c7', color: '#92400e', label: 'One-time' },
    one_time:   { bg: '#fef3c7', color: '#92400e', label: 'One-time' },
    service:    { bg: '#f3e8ff', color: '#6b21a8', label: 'Service' },
};

function TypeBadge({ type }) {
    const c = TYPE_COLORS[type] || { bg: '#f1f5f9', color: '#64748b', label: type };
    return (
        <span style={{ background: c.bg, color: c.color, fontSize: '0.5625rem', fontWeight: '700',
            textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
            {c.label}
        </span>
    );
}

// ─── Input style ─────────────────────────────────────────────────────────────

const inp = {
    width: '100%', padding: '0.45rem 0.65rem', border: '1px solid #e5e2db',
    borderRadius: '8px', fontSize: '0.8125rem', fontFamily: 'inherit',
    background: '#f0ece4', color: '#1c1917', outline: 'none', boxSizing: 'border-box',
};
const lbl = {
    display: 'block', fontSize: '0.6875rem', fontWeight: '600',
    color: '#57534e', marginBottom: '0.25rem',
};

// ─── APPROVAL DISCOUNT THRESHOLD (configurable — could come from settings later) ──
const DISCOUNT_APPROVAL_THRESHOLD = 15; // percent

// ─── QUOTE BUILDER ────────────────────────────────────────────────────────────

function QuoteBuilder({ quote, onSave, onClose, opportunities, products, settings, currentUser, userRole, quotes, getNextQuoteNumber }) {
    const isNew = !quote;
    const versions = useMemo(() =>
        isNew ? [] : (quotes || []).filter(q => q.quoteNumber === quote?.quoteNumber).sort((a, b) => a.version - b.version),
        [quotes, quote]
    );

    // Which version are we editing?
    const [activeVersion, setActiveVersion] = useState(quote?.version || 1);
    const editingQuote = useMemo(() => versions.find(v => v.version === activeVersion) || quote, [versions, activeVersion, quote]);

    // Form state
    const [name, setName] = useState(editingQuote?.name || '');
    const [oppId, setOppId] = useState(editingQuote?.opportunityId || '');
    const [validUntil, setValidUntil] = useState(editingQuote?.validUntil || '');
    const [paymentTerms, setPaymentTerms] = useState(editingQuote?.paymentTerms || 'Net 30 · Annual');
    // dealDiscount removed — avg line discount is now read-only computed from line items
    const [lineItems, setLineItems] = useState(editingQuote?.lineItems || []);
    const [notes, setNotes] = useState(editingQuote?.notes || '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [compareMode, setCompareMode] = useState(false);
    const [compareVersions, setCompareVersions] = useState([]);
    const [catalogSearch, setCatalogSearch] = useState('');
    const [dragOver, setDragOver] = useState(false);

    // Sync form when switching versions
    useEffect(() => {
        if (editingQuote) {
            setName(editingQuote.name || '');
            setOppId(editingQuote.opportunityId || '');
            setValidUntil(editingQuote.validUntil || '');
            setPaymentTerms(editingQuote.paymentTerms || 'Net 30 · Annual');
            // dealDiscount no longer in state
            setLineItems(editingQuote.lineItems || []);
            setNotes(editingQuote.notes || '');
        }
    }, [editingQuote?.id]);

    const { lines, subtotal, totalValue, recurringValue, oneTimeValue, avgDisc } = useMemo(
        () => calcLineTotals(lineItems, 0),
        [lineItems]
    );

    const needsApproval = avgDisc >= DISCOUNT_APPROVAL_THRESHOLD;
    const linkedOpp = (opportunities || []).find(o => o.id === oppId);

    // Group products for catalog
    const catalogGroups = useMemo(() => {
        const groups = {};
        (products || []).filter(p => p.active !== false).forEach(p => {
            const cat = p.category || 'Other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(p);
        });
        return groups;
    }, [products]);

    const filteredGroups = useMemo(() => {
        if (!catalogSearch.trim()) return catalogGroups;
        const q = catalogSearch.toLowerCase();
        const out = {};
        Object.entries(catalogGroups).forEach(([cat, prods]) => {
            const f = prods.filter(p => p.name?.toLowerCase().includes(q) || cat.toLowerCase().includes(q));
            if (f.length) out[cat] = f;
        });
        return out;
    }, [catalogGroups, catalogSearch]);

    const addProduct = (product) => {
        // DB uses productType (with value 'one_time') and listPrice
        const rawType = product.productType || product.type || 'one_time';
        const normType = rawType === 'one_time' ? 'one-time' : rawType;
        setLineItems(prev => [...prev, {
            _key: Date.now() + Math.random(),
            productId: product.id,
            productName: product.name,
            productType: normType,
            unit: product.unit || (normType === 'recurring' ? 'month' : 'flat'),
            listPrice: Number(product.listPrice || product.price) || 0,
            quantity: 1,
            discountPct: 0,
        }]);
    };

    const updateLine = (idx, field, val) => {
        setLineItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item));
    };

    const removeLine = (idx) => {
        setLineItems(prev => prev.filter((_, i) => i !== idx));
    };

    const handleSaveVersion = async (statusOverride) => {
        if (!oppId) { setError('Please link this quote to an opportunity.'); return; }
        if (!name.trim()) { setError('Please enter a quote name.'); return; }
        setError(null);
        setSaving(true);
        try {
            const quoteNumber = isNew ? getNextQuoteNumber() : editingQuote.quoteNumber;
            const versionNum = isNew ? 1 : (editingQuote?.version || 1);
            const status = statusOverride || editingQuote?.status || 'Draft';
            const payload = {
                id: editingQuote?.id || genQuoteId(),
                quoteNumber,
                version: versionNum,
                name: name.trim(),
                opportunityId: oppId,
                validUntil,
                paymentTerms,
                dealDiscount: 0,
                lineItems,
                notes,
                status,
                createdBy: editingQuote?.createdBy || currentUser,
            };
            await onSave(payload);
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to save.');
        } finally {
            setSaving(false);
        }
    };

    const handleNewVersion = async () => {
        if (!editingQuote) return;
        const maxV = Math.max(...versions.map(v => v.version));
        if (maxV >= 3) { setError('Maximum 3 versions per quote.'); return; }
        setSaving(true);
        try {
            const payload = {
                id: genQuoteId(),
                quoteNumber: editingQuote.quoteNumber,
                version: maxV + 1,
                name: editingQuote.name + ' v' + (maxV + 1),
                opportunityId: editingQuote.opportunityId,
                validUntil: editingQuote.validUntil,
                paymentTerms: editingQuote.paymentTerms,
                dealDiscount: 0,
                lineItems: [...(editingQuote.lineItems || [])],
                notes: editingQuote.notes,
                status: 'Draft',
                createdBy: currentUser,
            };
            await onSave(payload);
            setActiveVersion(maxV + 1);
        } catch (err) {
            setError(err.message || 'Failed to create version.');
        } finally {
            setSaving(false);
        }
    };

    const handleSubmitApproval = () => handleSaveVersion('Pending Approval');
    const handleExportPDF = async () => {
        try {
            const opp = linkedOpp;
            const res = await dbFetch('/.netlify/functions/quote-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quote: editingQuote, opportunity: opp, lines }),
            });
            if (!res.ok) throw new Error('PDF generation failed');
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = (editingQuote?.quoteNumber || 'quote') + '-v' + (editingQuote?.version || 1) + '.pdf';
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            // Fallback: open print dialog on a styled page
            const w = window.open('', '_blank');
            if (!w) return;
            w.document.write(buildPrintHTML(editingQuote, linkedOpp, lines, subtotal, totalValue, recurringValue, oneTimeValue, dealDiscount));
            w.document.close();
            setTimeout(() => w.print(), 400);
        }
    };

    // ── Compare mode ──────────────────────────────────────────────────────────
    const toggleCompareVersion = (v) => {
        setCompareVersions(prev => {
            if (prev.includes(v)) return prev.filter(x => x !== v);
            if (prev.length >= 3) return prev; // max 3
            return [...prev, v];
        });
    };

    if (compareMode && versions.length > 1) {
        const displayVersions = compareVersions.length >= 2
            ? versions.filter(v => compareVersions.includes(v.version))
            : versions.slice(0, 3);
        return (
            <VersionCompareView
                versions={displayVersions}
                allVersions={versions}
                compareVersions={compareVersions}
                onToggle={toggleCompareVersion}
                onClose={() => setCompareMode(false)}
                onBack={() => setCompareMode(false)}
                onSelectVersion={(v) => { setActiveVersion(v); setCompareMode(false); }}
                linkedOpp={linkedOpp}
            />
        );
    }

    return (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: '#f0ece4' }}>

            {/* ── LEFT: Product Catalog ───────────────────────────────────── */}
            <div style={{ width: '260px', flexShrink: 0, background: '#1c1917', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ padding: '1rem', borderBottom: '1px solid rgba(245,241,235,0.1)' }}>
                    <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#c8b99a', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>Product Catalog</div>
                    <input
                        value={catalogSearch}
                        onChange={e => setCatalogSearch(e.target.value)}
                        placeholder="Search products..."
                        style={{ ...inp, background: 'rgba(245,241,235,0.08)', border: '1px solid rgba(245,241,235,0.12)', color: '#f5f1eb', fontSize: '0.75rem' }}
                    />
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0' }}>
                    {Object.keys(filteredGroups).length === 0 && (
                        <div style={{ padding: '1.5rem 1rem', fontSize: '0.75rem', color: '#a8a29e', textAlign: 'center' }}>
                            {(products || []).length === 0 ? 'No products in Price Book yet.' : 'No products match your search.'}
                        </div>
                    )}
                    {Object.entries(filteredGroups).map(([cat, prods]) => (
                        <div key={cat}>
                            <div style={{ padding: '0.5rem 1rem 0.25rem', fontSize: '0.5625rem', fontWeight: '700', color: '#78716c', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{cat}</div>
                            {prods.map(prod => (
                                <div key={prod.id}
                                    draggable
                                    onDragStart={e => e.dataTransfer.setData('productId', prod.id)}
                                    style={{ padding: '0.5rem 1rem', cursor: 'grab', transition: 'background 0.1s' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,241,235,0.06)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '0.8125rem', fontWeight: '600', color: '#f5f1eb', lineHeight: 1.3 }}>{prod.name}</div>
                                            <div style={{ fontSize: '0.6875rem', color: '#a8a29e', marginTop: '0.15rem' }}>
                                                ${Number(prod.listPrice || prod.price || 0).toLocaleString()} {prod.unit === 'month' ? '/mo' : prod.unit === 'year' ? '/yr' : 'flat'}
                                            </div>
                                            <TypeBadge type={prod.productType || prod.type} />
                                        </div>
                                        <button
                                            onClick={() => addProduct(prod)}
                                            style={{ background: 'rgba(245,241,235,0.12)', border: '1px solid rgba(245,241,235,0.15)', color: '#f5f1eb', borderRadius: '6px', padding: '0.2rem 0.5rem', fontSize: '0.625rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                                        >+ Add</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── RIGHT: Quote Canvas ─────────────────────────────────────── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

                {/* Canvas header */}
                <div style={{ background: '#fff', borderBottom: '1px solid #ddd8cf', padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: '1rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            {!isNew && <span style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#78716c' }}>{editingQuote?.quoteNumber}</span>}
                            <span style={{ fontSize: '0.8125rem', color: '#44403c', fontWeight: '600' }}>{linkedOpp ? linkedOpp.opportunityName || linkedOpp.account : '—'}</span>
                            {editingQuote?.status && <StatusBadge status={editingQuote.status} />}
                            {needsApproval && <span style={{ fontSize: '0.5625rem', fontWeight: '700', background: '#fef3c7', color: '#92400e', padding: '0.15rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase' }}>⚠ Approval Required</span>}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <button onClick={handleExportPDF}
                            style={{ background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '8px', padding: '0.4rem 0.875rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Export PDF
                        </button>
                        {userRole === 'Manager' && editingQuote?.status === 'Pending Approval' ? (
                            <button onClick={() => handleSaveVersion('Approved')}
                                style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.4rem 0.875rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>
                                ✓ Approve
                            </button>
                        ) : (
                            <button onClick={handleSubmitApproval} disabled={saving}
                                style={{ background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '8px', padding: '0.4rem 0.875rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                                {needsApproval ? '⚠ Submit for Approval' : 'Submit for Approval'}
                            </button>
                        )}
                    </div>
                </div>

                {/* Version pills */}
                {!isNew && versions.length > 0 && (
                    <div style={{ background: '#fff', borderBottom: '1px solid #ddd8cf', padding: '0.5rem 1.25rem', display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                        <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', marginRight: '0.25rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Versions:</span>
                        {versions.map(v => {
                            const tv = parseFloat(v.totalValue) || 0;
                            const isActive = v.version === activeVersion;
                            return (
                                <button key={v.version} onClick={() => setActiveVersion(v.version)}
                                    style={{ padding: '0.2rem 0.625rem', borderRadius: '999px', border: isActive ? 'none' : '1px solid #e2e8f0',
                                        background: isActive ? '#2563eb' : '#f1f5f9', color: isActive ? '#fff' : '#64748b',
                                        fontSize: '0.6875rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    v{v.version} — {fmt(tv)}
                                </button>
                            );
                        })}
                        {versions.length < 3 && (
                            <button onClick={handleNewVersion} disabled={saving}
                                style={{ padding: '0.2rem 0.625rem', borderRadius: '999px', border: '1px dashed #c8b99a',
                                    background: 'transparent', color: '#a8a29e', fontSize: '0.6875rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                + New
                            </button>
                        )}
                        {versions.length > 1 && (
                            <button onClick={() => { setCompareVersions(versions.map(v => v.version).slice(0, 3)); setCompareMode(true); }}
                                style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                                Compare versions →
                            </button>
                        )}
                    </div>
                )}

                {/* Quote meta fields */}
                <div style={{ padding: '1rem 1.25rem', background: '#fff', borderBottom: '1px solid #ddd8cf', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.75rem', flexShrink: 0 }}>
                    <div>
                        <label style={lbl}>Quote Name</label>
                        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Acme ERP Enterprise v1" style={inp} />
                    </div>
                    <div>
                        <label style={lbl}>Linked Opportunity *</label>
                        <select value={oppId} onChange={e => setOppId(e.target.value)} style={inp}>
                            <option value="">— Select —</option>
                            {(opportunities || []).filter(o => o.stage !== 'Closed Lost').map(o => (
                                <option key={o.id} value={o.id}>{o.opportunityName || o.account}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={lbl}>Valid Until</label>
                        <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={inp} />
                    </div>
                    <div>
                        <label style={lbl}>Payment Terms</label>
                        <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} style={inp}>
                            {['Net 30 · Annual', 'Net 30 · Monthly', 'Net 60 · Annual', 'Net 15 · Annual', 'Due on Receipt', 'Custom'].map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Line items table */}
                <div style={{ flex: 1, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                    <div style={{ background: '#fff', border: '1px solid #ddd8cf', borderRadius: '12px', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8f7f5' }}>
                                    {['Product', 'Type', 'Qty', 'Unit Price', 'Disc %', 'Total', ''].map((h, i) => (
                                        <th key={i} style={{ padding: '0.5rem 0.75rem', fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: i >= 2 ? 'right' : 'left', borderBottom: '1px solid #e8e3da', whiteSpace: 'nowrap' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody
                                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                                onDragLeave={() => setDragOver(false)}
                                onDrop={e => {
                                    e.preventDefault();
                                    setDragOver(false);
                                    const pid = e.dataTransfer.getData('productId');
                                    const prod = (products || []).find(p => p.id === pid);
                                    if (prod) addProduct(prod);
                                }}
                            >
                                {lines.map((item, idx) => (
                                    <tr key={item._key || idx} style={{ borderBottom: '1px solid #f0ece4' }}>
                                        <td style={{ padding: '0.5rem 0.75rem', minWidth: '160px' }}>
                                            <div style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#1c1917' }}>{item.productName}</div>
                                            {item.productType === 'recurring' && <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>/mo × 12 months</div>}
                                            {item.productType === 'service' && <div style={{ fontSize: '0.6875rem', color: '#94a3b8' }}>flat fee</div>}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem' }}><TypeBadge type={item.productType} /></td>
                                        <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right' }}>
                                            <input type="number" min="1" value={item.quantity}
                                                onChange={e => updateLine(idx, 'quantity', Number(e.target.value))}
                                                style={{ ...inp, width: '60px', textAlign: 'right', padding: '0.3rem 0.4rem' }} />
                                        </td>
                                        <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right' }}>
                                            <input type="number" min="0" value={item.listPrice}
                                                onChange={e => updateLine(idx, 'listPrice', Number(e.target.value))}
                                                style={{ ...inp, width: '90px', textAlign: 'right', padding: '0.3rem 0.4rem' }} />
                                        </td>
                                        <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right' }}>
                                            <input type="number" min="0" max="100" value={item.discountPct}
                                                onChange={e => updateLine(idx, 'discountPct', Number(e.target.value))}
                                                style={{ ...inp, width: '60px', textAlign: 'right', padding: '0.3rem 0.4rem', borderColor: Number(item.discountPct) >= DISCOUNT_APPROVAL_THRESHOLD ? '#d97706' : '#e5e2db' }} />
                                        </td>
                                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: '700', fontSize: '0.875rem', color: '#1c1917', whiteSpace: 'nowrap' }}>
                                            {fmtFull(item.lineTotal)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.5rem', textAlign: 'right' }}>
                                            <button onClick={() => removeLine(idx)}
                                                style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.875rem', lineHeight: 1, padding: '0.25rem' }}>✕</button>
                                        </td>
                                    </tr>
                                ))}
                                {lines.length === 0 && (
                                    <tr>
                                        <td colSpan={7}>
                                            <div style={{ padding: '2rem', textAlign: 'center', color: dragOver ? '#2563eb' : '#94a3b8', fontSize: '0.8125rem', fontStyle: 'italic', borderRadius: '8px', border: dragOver ? '2px dashed #2563eb' : '2px dashed transparent', transition: 'all 0.15s', margin: '0.5rem' }}>
                                                ← Click + Add from catalog to add products, or drag here
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Deal-level discount + totals */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ width: '320px', background: '#fff', border: '1px solid #ddd8cf', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0ece4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Subtotal</span>
                                <span style={{ fontSize: '0.875rem', fontWeight: '600', color: '#1c1917' }}>{fmtFull(subtotal)}</span>
                            </div>
                            <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #f0ece4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontSize: '0.8125rem', color: '#64748b', flexShrink: 0 }}>Avg Line Discount</span>
                                <span style={{ fontSize: '0.875rem', fontWeight: '700', color: avgDisc >= DISCOUNT_APPROVAL_THRESHOLD ? '#dc2626' : '#1c1917' }}>{pct(avgDisc)}</span>
                            </div>
                            <div style={{ padding: '0.75rem 1rem', background: '#f8f7f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1c1917' }}>Total</span>
                                <span style={{ fontSize: '1.125rem', fontWeight: '800', color: '#1c1917' }}>{fmtFull(totalValue)}</span>
                            </div>
                        </div>
                    </div>

                    {/* KPI strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                        {[
                            { label: 'Quote Total', value: fmtFull(totalValue), color: '#2563eb' },
                            { label: 'Annual Recurring', value: fmtFull(recurringValue), color: '#7c3aed' },
                            { label: 'One-time / Services', value: fmtFull(oneTimeValue), color: '#d97706' },
                            { label: 'Avg Discount', value: pct(avgDisc), color: needsApproval ? '#dc2626' : '#16a34a' },
                        ].map(kpi => (
                            <div key={kpi.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderLeft: '3px solid ' + kpi.color, borderRadius: '10px', padding: '0.75rem 1rem' }}>
                                <div style={{ fontSize: '0.5625rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '0.2rem' }}>{kpi.label}</div>
                                <div style={{ fontSize: '1.375rem', fontWeight: '800', color: '#1c1917', letterSpacing: '-0.02em', lineHeight: 1 }}>{kpi.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Notes */}
                    <div style={{ background: '#fff', border: '1px solid #ddd8cf', borderRadius: '12px', padding: '0.875rem 1rem' }}>
                        <label style={{ ...lbl, marginBottom: '0.375rem' }}>Notes / Terms</label>
                        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                            placeholder="Add quote notes, terms, or conditions..."
                            style={{ ...inp, resize: 'vertical' }} />
                    </div>

                    {/* Save actions */}
                    {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '0.625rem 0.875rem', fontSize: '0.8125rem', color: '#dc2626' }}>{error}</div>}
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingBottom: '1rem' }}>
                        <button onClick={onClose}
                            style={{ background: '#e8e3da', color: '#78716c', border: '1px solid #ddd8cf', borderRadius: '8px', padding: '0.4rem 1rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>
                            Cancel
                        </button>
                        <button onClick={() => handleSaveVersion()} disabled={saving}
                            style={{ background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '8px', padding: '0.4rem 1rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                            {saving ? 'Saving…' : 'Save Draft'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── VERSION COMPARE VIEW ─────────────────────────────────────────────────────

function VersionCompareView({ versions, allVersions, compareVersions, onToggle, onClose, onSelectVersion, linkedOpp }) {
    const displayV = versions.slice(0, 3);

    const colColor = ['#2563eb', '#7c3aed', '#d97706'];

    return (
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflowY: 'auto', background: '#f0ece4' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.875rem', fontFamily: 'inherit' }}>← Back</button>
                    <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1c1917' }}>Version Comparison</span>
                </div>
                <div style={{ display: 'flex', gap: '0.375rem' }}>
                    {allVersions.map(v => (
                        <button key={v.version} onClick={() => onToggle(v.version)}
                            style={{ padding: '0.2rem 0.625rem', borderRadius: '999px', border: compareVersions.includes(v.version) ? 'none' : '1px solid #e2e8f0',
                                background: compareVersions.includes(v.version) ? '#2563eb' : '#f1f5f9',
                                color: compareVersions.includes(v.version) ? '#fff' : '#64748b',
                                fontSize: '0.6875rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                            v{v.version}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${displayV.length}, 1fr)`, gap: '1rem' }}>
                {displayV.map((v, ci) => {
                    const { lines, subtotal, totalValue, recurringValue, oneTimeValue, avgDisc } = calcLineTotals(v.lineItems || [], v.dealDiscount || 0);
                    const color = colColor[ci];
                    return (
                        <div key={v.version} style={{ background: '#fff', border: '2px solid ' + color + '22', borderRadius: '12px', overflow: 'hidden' }}>
                            <div style={{ background: color, padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#fff' }}>v{v.version}</div>
                                    <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.8)', marginTop: '1px' }}>{v.name}</div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <div style={{ fontSize: '1.125rem', fontWeight: '800', color: '#fff' }}>{fmt(totalValue)}</div>
                                    <StatusBadge status={v.status || 'Draft'} />
                                </div>
                            </div>
                            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #f0ece4' }}>
                                {lines.map((item, i) => (
                                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.25rem 0', fontSize: '0.75rem' }}>
                                        <span style={{ color: '#44403c', fontWeight: '500' }}>{item.productName}</span>
                                        <span style={{ color: '#1c1917', fontWeight: '700' }}>{fmtFull(item.lineTotal)}</span>
                                    </div>
                                ))}
                                {lines.length === 0 && <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic' }}>No line items</div>}
                            </div>
                            <div style={{ padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                                {[
                                    ['Total', fmtFull(totalValue), true],
                                    ['ARR Recurring', fmtFull(recurringValue), false],
                                    ['One-time', fmtFull(oneTimeValue), false],
                                    ['Avg Discount', pct(avgDisc), false],
                                ].map(([label, val, bold]) => (
                                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                                        <span style={{ color: '#64748b' }}>{label}</span>
                                        <span style={{ fontWeight: bold ? '800' : '600', color: '#1c1917' }}>{val}</span>
                                    </div>
                                ))}
                            </div>
                            <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #f0ece4' }}>
                                <button onClick={() => onSelectVersion(v.version)}
                                    style={{ width: '100%', padding: '0.4rem', background: color, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit' }}>
                                    Edit v{v.version}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── PRINT HTML for PDF fallback ──────────────────────────────────────────────

function buildPrintHTML(quote, opp, lines, subtotal, totalValue, recurringValue, oneTimeValue, dealDiscount) {
    const safeQ = quote || {};
    const rows = (lines || []).map(item =>
        '<tr><td>' + (item.productName || '') + '</td><td>' + (item.productType || '') + '</td><td style="text-align:right">' + (item.quantity || 1) + '</td><td style="text-align:right">$' + Number(item.listPrice || 0).toLocaleString() + '</td><td style="text-align:right">' + (item.discountPct || 0) + '%</td><td style="text-align:right">$' + Math.round(item.lineTotal || 0).toLocaleString() + '</td></tr>'
    ).join('');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + (safeQ.quoteNumber || 'Quote') + '</title>' +
        '<style>body{font-family:system-ui,sans-serif;color:#1c1917;padding:2rem}h1{font-size:1.5rem;margin-bottom:0.25rem}' +
        'table{width:100%;border-collapse:collapse;margin-top:1.5rem}th,td{padding:0.5rem 0.75rem;border-bottom:1px solid #e2e8f0;font-size:0.875rem}' +
        'th{background:#f8fafc;font-weight:700;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.04em}' +
        '.totals{margin-top:1rem;text-align:right}.totals td{border:none}.big{font-size:1.25rem;font-weight:800}' +
        '</style></head><body>' +
        '<h1>' + (safeQ.name || safeQ.quoteNumber || 'Quote') + '</h1>' +
        '<p style="color:#64748b;margin:0">' + (opp ? (opp.opportunityName || opp.account || '') : '') + ' · Valid until ' + (safeQ.validUntil || '—') + ' · ' + (safeQ.paymentTerms || '') + '</p>' +
        '<table><thead><tr><th>Product</th><th>Type</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit Price</th><th style="text-align:right">Disc%</th><th style="text-align:right">Total</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
        '<table class="totals"><tr><td>Subtotal</td><td>$' + Math.round(subtotal || 0).toLocaleString() + '</td></tr>' +
        '' +
        '<tr><td class="big">Total</td><td class="big">$' + Math.round(totalValue || 0).toLocaleString() + '</td></tr></table>' +
        '</body></html>';
}

// ─── ALL QUOTES LIST ──────────────────────────────────────────────────────────

function AllQuotesList({ quotes, opportunities, currentUser, userRole, settings, onEdit, onDelete, onNewQuote, loadQuotes }) {
    const managedReps = new Set((settings?.users || [])
        .filter(u => u.managedBy === currentUser || u.manager === currentUser)
        .map(u => u.name));

    const [filterRep, setFilterRep] = useState('');
    const [filterPeriod, setFilterPeriod] = useState('all');
    const [filterStatus, setFilterStatus] = useState('');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [sortField, setSortField] = useState('createdAt');
    const [sortDir, setSortDir] = useState('desc');

    const isAdmin = userRole === 'Admin';
    const isManager = userRole === 'Manager';

    // Role-based filtering
    const roleFiltered = useMemo(() => {
        return (quotes || []).filter(q => {
            if (isAdmin) return true;
            if (isManager) {
                // Manager sees their reps' quotes
                const opp = (opportunities || []).find(o => o.id === q.opportunityId);
                if (!opp) return q.createdBy === currentUser;
                return managedReps.has(opp.salesRep) || opp.salesRep === currentUser || q.createdBy === currentUser;
            }
            // Rep sees own quotes
            return q.createdBy === currentUser;
        });
    }, [quotes, opportunities, userRole, currentUser, managedReps]);

    // Period filtering
    const periodFiltered = useMemo(() => {
        const now = new Date();
        return roleFiltered.filter(q => {
            const created = q.createdAt ? new Date(q.createdAt) : null;
            if (!created) return true;
            if (filterPeriod === 'q1') { const m = created.getMonth(); return m >= 0 && m <= 2; }
            if (filterPeriod === 'q2') { const m = created.getMonth(); return m >= 3 && m <= 5; }
            if (filterPeriod === 'q3') { const m = created.getMonth(); return m >= 6 && m <= 8; }
            if (filterPeriod === 'q4') { const m = created.getMonth(); return m >= 9 && m <= 11; }
            if (filterPeriod === 'custom' && customFrom && customTo) {
                return created >= new Date(customFrom) && created <= new Date(customTo + 'T23:59:59');
            }
            return true;
        });
    }, [roleFiltered, filterPeriod, customFrom, customTo]);

    const displayed = useMemo(() => {
        let out = periodFiltered;
        if (filterRep) out = out.filter(q => {
            const opp = (opportunities || []).find(o => o.id === q.opportunityId);
            return opp?.salesRep === filterRep || q.createdBy === filterRep;
        });
        if (filterStatus) out = out.filter(q => q.status === filterStatus);
        out = [...out].sort((a, b) => {
            let av = a[sortField] || '', bv = b[sortField] || '';
            if (sortField === 'totalValue') { av = parseFloat(av) || 0; bv = parseFloat(bv) || 0; }
            if (sortDir === 'asc') return av > bv ? 1 : -1;
            return av < bv ? 1 : -1;
        });
        // De-duplicate — show only latest version per quoteNumber
        const seen = new Set();
        return out.filter(q => {
            if (seen.has(q.quoteNumber)) return false;
            seen.add(q.quoteNumber);
            return true;
        });
    }, [periodFiltered, filterRep, filterStatus, sortField, sortDir, opportunities]);

    const th = (label, field) => (
        <th onClick={() => { setSortField(field); setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }}
            style={{ padding: '0.5rem 0.75rem', fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #e8e3da', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}>
            {label} {sortField === field ? (sortDir === 'asc' ? '↑' : '↓') : ''}
        </th>
    );

    const allReps = [...new Set((settings?.users || []).map(u => u.name).filter(Boolean))].sort();

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Toolbar */}
            <div className="table-container" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.625rem 1.25rem', flexWrap: 'wrap' }}>
                    {(isAdmin || isManager) && (
                        <select value={filterRep} onChange={e => setFilterRep(e.target.value)}
                            style={{ ...inp, width: 'auto', fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
                            <option value="">All Reps</option>
                            {allReps.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    )}
                    <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
                        style={{ ...inp, width: 'auto', fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
                        <option value="all">All Time</option>
                        <option value="q1">Q1</option>
                        <option value="q2">Q2</option>
                        <option value="q3">Q3</option>
                        <option value="q4">Q4</option>
                        <option value="custom">Custom…</option>
                    </select>
                    {filterPeriod === 'custom' && (
                        <>
                            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                                style={{ ...inp, width: 'auto', fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} />
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>to</span>
                            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                                style={{ ...inp, width: 'auto', fontSize: '0.75rem', padding: '0.3rem 0.6rem' }} />
                        </>
                    )}
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                        style={{ ...inp, width: 'auto', fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
                        <option value="">All Statuses</option>
                        {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={onNewQuote}
                        style={{ marginLeft: 'auto', background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '8px', padding: '0.4rem 0.875rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>
                        + New Quote
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="table-container">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f8f7f5' }}>
                            {th('Quote #', 'quoteNumber')}
                            {th('Name', 'name')}
                            {th('Opportunity', 'opportunityId')}
                            {(isAdmin || isManager) && th('Rep', 'createdBy')}
                            {th('Status', 'status')}
                            {th('Total', 'totalValue')}
                            {th('Valid Until', 'validUntil')}
                            {th('Versions', 'version')}
                            <th style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid #e8e3da' }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayed.map(q => {
                            const opp = (opportunities || []).find(o => o.id === q.opportunityId);
                            // All versions for this quote number
                            const allV = (quotes || []).filter(x => x.quoteNumber === q.quoteNumber).sort((a, b) => b.version - a.version);
                            const latestV = allV[0] || q;
                            return (
                                <tr key={q.id} style={{ borderBottom: '1px solid #f0ece4', cursor: 'pointer' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#faf9f7'}
                                    onMouseLeave={e => e.currentTarget.style.background = ''}
                                    onClick={() => onEdit(latestV)}>
                                    <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.8125rem', fontWeight: '700', color: '#1c1917' }}>{q.quoteNumber}</td>
                                    <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.8125rem', color: '#1c1917' }}>{latestV.name || q.name}</td>
                                    <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.8125rem', color: '#44403c' }}>{opp ? (opp.opportunityName || opp.account) : '—'}</td>
                                    {(isAdmin || isManager) && <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.8125rem', color: '#64748b' }}>{q.createdBy || '—'}</td>}
                                    <td style={{ padding: '0.625rem 0.75rem' }}><StatusBadge status={latestV.status || 'Draft'} /></td>
                                    <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.875rem', fontWeight: '700', color: '#1c1917' }}>{fmtFull(latestV.totalValue || 0)}</td>
                                    <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.75rem', color: '#64748b' }}>{latestV.validUntil || '—'}</td>
                                    <td style={{ padding: '0.625rem 0.75rem' }}>
                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                            {allV.slice(0, 3).map(v => (
                                                <span key={v.version} onClick={e => { e.stopPropagation(); onEdit(v); }}
                                                    style={{ fontSize: '0.5625rem', fontWeight: '700', padding: '0.15rem 0.375rem', borderRadius: '999px',
                                                        background: v.version === latestV.version ? '#2563eb' : '#f1f5f9',
                                                        color: v.version === latestV.version ? '#fff' : '#64748b', cursor: 'pointer' }}>
                                                    v{v.version}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                                        <button onClick={e => { e.stopPropagation(); if (window.confirm('Delete this quote?')) onDelete(q.id); }}
                                            style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' }}>Delete</button>
                                    </td>
                                </tr>
                            );
                        })}
                        {displayed.length === 0 && (
                            <tr><td colSpan={9} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem', fontStyle: 'italic' }}>
                                No quotes found. Click "+ New Quote" to get started.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── PRICE BOOK (product management) ─────────────────────────────────────────

function PriceBook({ products, onSave, onDelete }) {
    const EMPTY = { name: '', category: 'Platform', productType: 'recurring', listPrice: '', unit: 'month', description: '', active: true };
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const openNew = () => { setForm(EMPTY); setEditing('new'); setError(null); };
    const openEdit = (p) => {
        setForm({
            name: p.name || '',
            category: p.category || 'Platform',
            productType: p.productType || p.type || 'recurring',
            listPrice: p.listPrice || p.price || '',
            unit: p.unit || 'month',
            description: p.description || '',
            active: p.active !== false,
            sku: p.sku || '',
            minPrice: p.minPrice || '',
        });
        setEditing(p.id);
        setError(null);
    };
    const cancel = () => { setEditing(null); setError(null); };

    const handleSave = async () => {
        if (!form.name.trim()) { setError('Product name is required.'); return; }
        if (!form.listPrice || isNaN(Number(form.listPrice))) { setError('Valid price is required.'); return; }
        setSaving(true);
        setError(null);
        try {
            await onSave({ ...form, listPrice: Number(form.listPrice), id: editing === 'new' ? undefined : editing });
            cancel();
        } catch (err) {
            setError(err.message || 'Failed to save.');
        } finally {
            setSaving(false);
        }
    };

    const categories = [...new Set((products || []).map(p => p.category).filter(Boolean)), 'Platform', 'Add-ons', 'Services', 'Hardware'].filter((v, i, a) => a.indexOf(v) === i);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Toolbar */}
            <div className="table-container" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', padding: '0.625rem 1.25rem' }}>
                    <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>{(products || []).length} product{(products || []).length !== 1 ? 's' : ''} in Price Book</span>
                    <button onClick={openNew}
                        style={{ marginLeft: 'auto', background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '8px', padding: '0.4rem 0.875rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>
                        + Add Product
                    </button>
                </div>
            </div>

            {/* Edit form */}
            {editing && (
                <div className="table-container" style={{ padding: '1.25rem' }}>
                    <div style={{ fontWeight: '700', fontSize: '0.9375rem', color: '#1c1917', marginBottom: '1rem' }}>{editing === 'new' ? 'New Product' : 'Edit Product'}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                        <div>
                            <label style={lbl}>Product Name</label>
                            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} placeholder="e.g. Enterprise Platform" />
                        </div>
                        <div>
                            <label style={lbl}>Category</label>
                            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inp}>
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={lbl}>Type</label>
                            <select value={form.productType} onChange={e => setForm(f => ({ ...f, productType: e.target.value }))} style={inp}>
                                <option value="recurring">Recurring</option>
                                <option value="one_time">One-time</option>
                                <option value="service">Service</option>
                            </select>
                        </div>
                        <div>
                            <label style={lbl}>Price ($)</label>
                            <input type="number" min="0" value={form.listPrice} onChange={e => setForm(f => ({ ...f, listPrice: e.target.value }))} style={inp} placeholder="0" />
                        </div>
                        <div>
                            <label style={lbl}>Unit</label>
                            <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} style={inp}>
                                <option value="month">/month</option>
                                <option value="year">/year</option>
                                <option value="flat">flat fee</option>
                                <option value="unit">per unit</option>
                            </select>
                        </div>
                    </div>
                    <div style={{ marginBottom: '0.75rem' }}>
                        <label style={lbl}>Description (optional)</label>
                        <input value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={inp} placeholder="Brief description shown in quotes" />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                        <input type="checkbox" id="prod-active" checked={form.active !== false} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
                        <label htmlFor="prod-active" style={{ fontSize: '0.8125rem', color: '#44403c', cursor: 'pointer' }}>Active (visible in quote builder)</label>
                    </div>
                    {error && <div style={{ color: '#dc2626', fontSize: '0.8125rem', marginBottom: '0.5rem' }}>{error}</div>}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={cancel} style={{ background: '#e8e3da', color: '#78716c', border: '1px solid #ddd8cf', borderRadius: '8px', padding: '0.4rem 1rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                        <button onClick={handleSave} disabled={saving} style={{ background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '8px', padding: '0.4rem 1rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>
                            {saving ? 'Saving…' : 'Save Product'}
                        </button>
                    </div>
                </div>
            )}

            {/* Products table */}
            <div className="table-container">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f8f7f5' }}>
                            {['Name', 'Category', 'Type', 'Price', 'Unit', 'Status', ''].map((h, i) => (
                                <th key={i} style={{ padding: '0.5rem 0.75rem', fontSize: '0.6875rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', borderBottom: '1px solid #e8e3da' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {(products || []).map(prod => (
                            <tr key={prod.id} style={{ borderBottom: '1px solid #f0ece4' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#faf9f7'}
                                onMouseLeave={e => e.currentTarget.style.background = ''}>
                                <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.8125rem', fontWeight: '600', color: prod.active !== false ? '#1c1917' : '#94a3b8' }}>{prod.name}</td>
                                <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.8125rem', color: '#64748b' }}>{prod.category || '—'}</td>
                                <td style={{ padding: '0.625rem 0.75rem' }}><TypeBadge type={prod.type} /></td>
                                <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.875rem', fontWeight: '700', color: '#1c1917' }}>${Number(prod.price || 0).toLocaleString()}</td>
                                <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.75rem', color: '#64748b' }}>{prod.unit === 'month' ? '/mo' : prod.unit === 'year' ? '/yr' : prod.unit || 'flat'}</td>
                                <td style={{ padding: '0.625rem 0.75rem' }}>
                                    <span style={{ fontSize: '0.625rem', fontWeight: '700', padding: '0.15rem 0.4rem', borderRadius: '4px', textTransform: 'uppercase',
                                        background: prod.active !== false ? '#d1fae5' : '#f1f5f9',
                                        color: prod.active !== false ? '#065f46' : '#94a3b8' }}>
                                        {prod.active !== false ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                                    <button onClick={() => openEdit(prod)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit', marginRight: '0.75rem' }}>Edit</button>
                                    <button onClick={() => { if (window.confirm('Delete this product?')) onDelete(prod.id); }} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' }}>Delete</button>
                                </td>
                            </tr>
                        ))}
                        {(products || []).length === 0 && (
                            <tr><td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem', fontStyle: 'italic' }}>
                                No products yet. Click "+ Add Product" to build your Price Book.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── APPROVALS SUB-TAB ────────────────────────────────────────────────────────

function ApprovalsView({ quotes, opportunities, currentUser, userRole, onApprove, onReject, onEdit }) {
    const isManager = userRole === 'Manager';
    const isAdmin = userRole === 'Admin';

    const pending = useMemo(() => (quotes || []).filter(q => q.status === 'Pending Approval'), [quotes]);

    const handleSendToCustomer = async (quote) => {
        try {
            await dbFetch('/.netlify/functions/quote-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quoteId: quote.id }),
            });
            alert('Quote sent to customer successfully.');
        } catch {
            alert('Failed to send email. Please try again.');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="table-container">
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #f0ece4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1c1917' }}>
                        Pending Approval <span style={{ background: '#fef3c7', color: '#92400e', fontSize: '0.625rem', fontWeight: '700', padding: '0.15rem 0.5rem', borderRadius: '999px', marginLeft: '0.375rem' }}>{pending.length}</span>
                    </span>
                </div>
                {pending.length === 0 ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.875rem', fontStyle: 'italic' }}>No quotes pending approval.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                        {pending.map(q => {
                            const opp = (opportunities || []).find(o => o.id === q.opportunityId);
                            const { totalValue, avgDisc } = calcLineTotals(q.lineItems || [], q.dealDiscount || 0);
                            const canAct = isManager;
                            return (
                                <div key={q.id} style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f0ece4', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: '700', fontSize: '0.875rem', color: '#1c1917' }}>{q.name || q.quoteNumber}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                                            {opp ? (opp.opportunityName || opp.account) : '—'} · Rep: {q.createdBy || '—'} · Avg Discount: {pct(avgDisc)}
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '1rem', fontWeight: '800', color: '#1c1917', flexShrink: 0 }}>{fmtFull(totalValue)}</div>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                        <button onClick={() => onEdit(q)} style={{ background: '#e8e3da', color: '#78716c', border: '1px solid #ddd8cf', borderRadius: '8px', padding: '0.35rem 0.75rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>View</button>
                                        {canAct && (
                                            <>
                                                <button onClick={() => onApprove(q)} style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.35rem 0.75rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>✓ Approve</button>
                                                <button onClick={() => onReject(q)} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: '8px', padding: '0.35rem 0.75rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>✕ Reject</button>
                                            </>
                                        )}
                                        <button onClick={() => handleSendToCustomer(q)} style={{ background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '8px', padding: '0.35rem 0.75rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>📧 Send</button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Approved quotes ready to send */}
            <div className="table-container">
                <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #f0ece4' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1c1917' }}>Approved — Ready to Send</span>
                </div>
                {(quotes || []).filter(q => q.status === 'Approved').length === 0 ? (
                    <div style={{ padding: '1.5rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem', fontStyle: 'italic' }}>No approved quotes awaiting delivery.</div>
                ) : (
                    <div>
                        {(quotes || []).filter(q => q.status === 'Approved').map(q => {
                            const opp = (opportunities || []).find(o => o.id === q.opportunityId);
                            const { totalValue } = calcLineTotals(q.lineItems || [], q.dealDiscount || 0);
                            return (
                                <div key={q.id} style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid #f0ece4', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '600', fontSize: '0.8125rem', color: '#1c1917' }}>{q.name || q.quoteNumber}</div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.15rem' }}>{opp ? (opp.opportunityName || opp.account) : '—'}</div>
                                    </div>
                                    <div style={{ fontWeight: '700', color: '#1c1917' }}>{fmtFull(totalValue)}</div>
                                    <button onClick={() => handleSendToCustomer(q)} style={{ background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '8px', padding: '0.35rem 0.875rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>📧 Send to Customer</button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── MAIN QUOTES TAB ──────────────────────────────────────────────────────────

export default function QuotesTab() {
    const {
        quotes, setQuotes, products, opportunities, settings, currentUser, userRole,
        handleSaveQuote, handleDeleteQuote, handleSaveProduct, handleDeleteProduct,
        loadQuotes, getNextQuoteNumber,
    } = useApp();

    const [subTab, setSubTab] = useState(() => localStorage.getItem('tab:quotes:subTab') || 'builder');
    const [builderMode, setBuilderMode] = useState(false); // true = showing builder canvas
    const [editingQuote, setEditingQuote] = useState(null);

    const setTab = (t) => { setSubTab(t); localStorage.setItem('tab:quotes:subTab', t); };

    const openBuilder = (quote = null) => {
        setEditingQuote(quote);
        setBuilderMode(true);
        setTab('builder');
    };

    const closeBuilder = () => {
        setBuilderMode(false);
        setEditingQuote(null);
    };

    const handleSave = async (payload) => {
        // payload.id exists when editing — pass it as editingQuote so hook uses PUT
        const existing = payload.id ? (quotes || []).find(q => q.id === payload.id) : null;
        await handleSaveQuote(payload, existing || null);
    };

    const handleApprove = async (quote) => {
        await handleSaveQuote({ ...quote, status: 'Approved' }, quote);
    };

    const handleReject = async (quote) => {
        await handleSaveQuote({ ...quote, status: 'Rejected / Lost' }, quote);
    };

    const handleSaveProductLocal = async (data) => {
        const existing = data.id ? (products || []).find(p => p.id === data.id) : null;
        await handleSaveProduct(data, existing || null);
    };

    const handleDeleteProductLocal = async (id) => {
        await handleDeleteProduct(id);
    };

    // ── Builder mode: full-width split panel ──────────────────────────────────
    if (builderMode && subTab === 'builder') {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 100px)', overflow: 'hidden' }}>
                {/* Header bar */}
                <div style={{ background: '#fff', borderBottom: '1px solid #ddd8cf', padding: '0.625rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '4px', height: '28px', background: '#c8b99a', borderRadius: '2px' }} />
                        <h2 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#1c1917', margin: 0 }}>Quote Builder</h2>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '0.875rem' }}>
                        {editingQuote ? (editingQuote.name || editingQuote.quoteNumber) : 'New Quote'}
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.375rem' }}>
                        {['builder', 'quotes', 'pricebook', 'approvals'].map(t => (
                            <button key={t} onClick={() => { if (t !== 'builder') { setBuilderMode(false); setTab(t); } else setTab(t); }}
                                style={subTabStyle(subTab, t)}>
                                {t === 'builder' ? 'Builder' : t === 'quotes' ? 'All Quotes' : t === 'pricebook' ? 'Price Book' : 'Approvals'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Builder body */}
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    <QuoteBuilder
                        quote={editingQuote}
                        onSave={handleSave}
                        onClose={closeBuilder}
                        opportunities={opportunities}
                        products={products}
                        settings={settings}
                        currentUser={currentUser}
                        userRole={userRole}
                        quotes={quotes}
                        getNextQuoteNumber={getNextQuoteNumber}
                    />
                </div>
            </div>
        );
    }

    // ── Standard tab-page layout ──────────────────────────────────────────────
    return (
        <div className="tab-page">
            <div className="tab-page-header">
                <div style={{ width: '4px', height: '28px', background: '#c8b99a', borderRadius: '2px' }} />
                <h2 style={{ fontSize: '1.375rem', fontWeight: '700', color: '#1c1917' }}>Quotes</h2>
            </div>

            {/* Sub-tabs */}
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e2e8f0', marginBottom: '0.25rem' }}>
                <button style={subTabStyle(subTab, 'builder')} onClick={() => { setTab('builder'); setBuilderMode(false); }}>Builder</button>
                <button style={subTabStyle(subTab, 'quotes')} onClick={() => setTab('quotes')}>All Quotes</button>
                <button style={subTabStyle(subTab, 'pricebook')} onClick={() => setTab('pricebook')}>Price Book</button>
                <button style={subTabStyle(subTab, 'approvals')} onClick={() => setTab('approvals')}>
                    Approvals
                    {(() => {
                        const pendingCount = (quotes || []).filter(q => q.status === 'Pending Approval').length;
                        return pendingCount > 0 ? (
                            <span style={{ marginLeft: '0.375rem', background: '#f59e0b', color: '#fff', borderRadius: '999px', fontSize: '0.5rem', fontWeight: '800', minWidth: '14px', height: '14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                                {pendingCount}
                            </span>
                        ) : null;
                    })()}
                </button>
                <button onClick={() => openBuilder(null)}
                    style={{ marginLeft: 'auto', background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '8px', padding: '0.375rem 0.875rem', fontSize: '0.75rem', fontWeight: '500', cursor: 'pointer', fontFamily: 'inherit' }}>
                    + New Quote
                </button>
            </div>

            {/* Builder placeholder when not in builder mode */}
            {subTab === 'builder' && (
                <div className="table-container" style={{ padding: '3rem', textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
                    <div style={{ fontSize: '1rem', fontWeight: '700', color: '#1c1917', marginBottom: '0.5rem' }}>Quote Builder</div>
                    <div style={{ fontSize: '0.875rem', color: '#94a3b8', marginBottom: '1.5rem' }}>
                        Create professional CPQ quotes with product catalog, version control, and approval workflows.
                    </div>
                    <button onClick={() => openBuilder(null)}
                        style={{ background: '#1c1917', color: '#f5f1eb', border: 'none', borderRadius: '8px', padding: '0.625rem 1.5rem', fontSize: '0.875rem', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}>
                        + New Quote
                    </button>
                </div>
            )}

            {subTab === 'quotes' && (
                <AllQuotesList
                    quotes={quotes}
                    opportunities={opportunities}
                    currentUser={currentUser}
                    userRole={userRole}
                    settings={settings}
                    onEdit={(q) => openBuilder(q)}
                    onDelete={handleDeleteQuote}
                    onNewQuote={() => openBuilder(null)}
                    loadQuotes={loadQuotes}
                />
            )}

            {subTab === 'pricebook' && (
                <PriceBook
                    products={products}
                    onSave={handleSaveProductLocal}
                    onDelete={handleDeleteProductLocal}
                />
            )}

            {subTab === 'approvals' && (
                <ApprovalsView
                    quotes={quotes}
                    opportunities={opportunities}
                    currentUser={currentUser}
                    userRole={userRole}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    onEdit={(q) => openBuilder(q)}
                />
            )}
        </div>
    );
}
