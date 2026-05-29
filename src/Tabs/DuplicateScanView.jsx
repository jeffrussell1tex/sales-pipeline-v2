import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../AppContext';

// ── Theme (mirrors SettingsTab T) ──────────────────────────────────────────
const T = {
    bg: '#f0ece4', surface: '#fbf8f3', surface2: '#f5efe3',
    border: '#e6ddd0', borderStrong: '#d4c8b4',
    ink: '#2a2622', inkMid: '#5a544c', inkMuted: '#8a8378',
    gold: '#c8b99a', goldInk: '#7a6a48',
    danger: '#9c3a2e', warn: '#b87333', ok: '#4d6b3d', info: '#3a5a7a',
    sans: '"Plus Jakarta Sans", system-ui, sans-serif',
    serif: 'Georgia, serif',
    r: 3,
};

const REL_LABEL = {
    'different-location': 'Looks like different sites / locations',
};

const fmtLoc = (a) => [a.city, a.state].filter(Boolean).join(', ');
const ownerOf = (a) => a.accountOwner || a.assignedRep || '';

// ── One account's quick facts inside a compare card ─────────────────────────
function AccountFacts({ a }) {
    const rows = [
        ['Industry', a.industry],
        ['Owner', ownerOf(a)],
        ['Location', fmtLoc(a)],
        ['Website', a.website],
        ['Phone', a.phone],
    ].filter(([, v]) => v);
    return (
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: T.sans, wordBreak: 'break-word' }}>
                {a.name}
            </div>
            <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px' }}>
                {rows.map(([label, value]) => (
                    <React.Fragment key={label}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans, whiteSpace: 'nowrap' }}>{label}</div>
                        <div style={{ fontSize: 12, color: T.inkMid, fontFamily: T.sans, wordBreak: 'break-word' }}>{value}</div>
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}

// ── A single duplicate / related pair ───────────────────────────────────────
function PairCard({ pair, tier, onMerge }) {
    const reasons = (pair.reasons || []).join(' · ');
    const relLabel = pair.relationship ? REL_LABEL[pair.relationship] || pair.relationship : null;
    return (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: 16, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'stretch', gap: 16 }}>
                <AccountFacts a={pair.a} />
                <div style={{ width: 1, background: T.border, flexShrink: 0 }} />
                <AccountFacts a={pair.b} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
                {reasons && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.goldInk, background: 'rgba(200,185,154,0.22)', border: '1px solid rgba(200,185,154,0.5)', borderRadius: 999, padding: '2px 10px', fontFamily: T.sans }}>
                        {reasons}
                    </span>
                )}
                {relLabel && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.inkMid, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 999, padding: '2px 10px', fontFamily: T.sans }}>
                        {relLabel}
                    </span>
                )}
                <div style={{ flex: 1 }} />
                {tier === 'duplicate' ? (
                    <button onClick={() => onMerge(pair)}
                        style={{ padding: '7px 16px', background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                        Review &amp; merge
                    </button>
                ) : (
                    <span style={{ fontSize: 11, fontStyle: 'italic', color: T.inkMuted, fontFamily: T.sans }}>
                        Review only — not staged for merge
                    </span>
                )}
            </div>
        </div>
    );
}

// ── Main panel ──────────────────────────────────────────────────────────────
export default function DuplicateScanView({ onBack }) {
    const { findDuplicates, setMergeModal, accounts } = useApp();

    const [tier, setTier]       = useState('duplicate'); // 'duplicate' | 'related'
    const [data, setData]       = useState(null);        // { tier, pairs, counts, scanned, truncated }
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);

    // findDuplicates is recreated each App render; hold it in a ref so the scan
    // effect stays stable and doesn't loop.
    const fdRef = useRef(findDuplicates);
    useEffect(() => { fdRef.current = findDuplicates; });

    const acctCountRef = useRef(null);

    const runScan = useCallback(async (t) => {
        setLoading(true); setError(null);
        try {
            const d = await fdRef.current(t);
            setData(d);
        } catch (e) {
            setError(e?.message || 'Scan failed. Please try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial scan + re-scan whenever the tier toggles.
    useEffect(() => { runScan(tier); }, [tier, runScan]);

    // Re-scan after a merge: the accounts list shrinks when a row is archived.
    useEffect(() => {
        const n = (accounts || []).length;
        if (acctCountRef.current === null) { acctCountRef.current = n; return; }
        if (n !== acctCountRef.current) { acctCountRef.current = n; runScan(tier); }
    }, [accounts, tier, runScan]);

    const counts = data?.counts || { duplicate: 0, related: 0 };
    const pairs  = data?.pairs || [];

    const openMerge = (pair) => setMergeModal?.({ aId: pair.a.id, bId: pair.b.id });

    const pill = (value, label, count) => {
        const active = tier === value;
        return (
            <button onClick={() => setTier(value)}
                style={{
                    padding: '6px 14px', borderRadius: 999, cursor: 'pointer', fontFamily: T.sans,
                    fontSize: 12.5, fontWeight: 600,
                    border: `1px solid ${active ? T.ink : T.border}`,
                    background: active ? T.ink : T.surface,
                    color: active ? '#f5f1eb' : T.inkMid,
                }}>
                {label} <span style={{ opacity: 0.7, fontWeight: 700 }}>{count}</span>
            </button>
        );
    };

    return (
        <div>
            {/* Back breadcrumb */}
            <button onClick={onBack}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: T.info, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, padding: '0 0 14px' }}>
                ← Back to settings
            </button>

            <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 4, fontFamily: T.sans }}>Find &amp; merge duplicates</div>
                <div style={{ fontSize: 13, color: T.inkMid, fontFamily: T.sans }}>
                    Scan accounts for likely duplicates and merge them into one record. Every merge is fully reversible.
                </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                {pill('duplicate', 'Likely duplicates', counts.duplicate)}
                {pill('related', 'Possibly related', counts.related)}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 12, color: T.inkMuted, fontFamily: T.sans }}>
                    {data ? `${data.scanned} accounts scanned` : ''}
                </span>
                <button onClick={() => runScan(tier)} disabled={loading}
                    style={{ padding: '6px 14px', background: T.surface, color: T.ink, border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1, fontFamily: T.sans }}>
                    {loading ? 'Scanning…' : 'Re-scan'}
                </button>
            </div>

            {/* Tier helper text */}
            <div style={{ fontSize: 12, color: T.inkMid, fontFamily: T.sans, marginBottom: 14, lineHeight: 1.5 }}>
                {tier === 'duplicate'
                    ? 'Accounts whose names match exactly once normalized (case, punctuation, and Inc/LLC/Corp suffixes ignored). These are safe to merge.'
                    : 'Accounts that share a domain, phone, or near-identical name. Often distinct sites of the same company — shown for awareness, not staged for one-click merge.'}
            </div>

            {/* Body */}
            {error && (
                <div style={{ background: 'rgba(156,58,46,0.08)', border: `1px solid ${T.danger}`, borderRadius: T.r, padding: '10px 14px', color: T.danger, fontSize: 13, fontFamily: T.sans, marginBottom: 14 }}>
                    {error}
                </div>
            )}

            {data?.truncated && (
                <div style={{ background: 'rgba(184,115,51,0.08)', border: `1px solid ${T.warn}`, borderRadius: T.r, padding: '10px 14px', color: T.warn, fontSize: 12.5, fontFamily: T.sans, marginBottom: 14 }}>
                    Showing the first {pairs.length} pairs. Merge these and re-scan to see more.
                </div>
            )}

            {loading && !data && (
                <div style={{ color: T.inkMuted, fontSize: 13, fontStyle: 'italic', fontFamily: T.sans, padding: '20px 0' }}>Scanning accounts…</div>
            )}

            {!loading && data && pairs.length === 0 && (
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, padding: 24, textAlign: 'center', color: T.inkMid, fontSize: 13, fontFamily: T.sans }}>
                    {tier === 'duplicate'
                        ? 'No likely duplicates found — your accounts look clean.'
                        : 'No possibly-related accounts flagged.'}
                </div>
            )}

            {pairs.map((pair, i) => (
                <PairCard key={`${pair.a.id}::${pair.b.id}::${i}`} pair={pair} tier={tier} onMerge={openMerge} />
            ))}
        </div>
    );
}
