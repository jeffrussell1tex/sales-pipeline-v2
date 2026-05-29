import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../AppContext';

// ── Palette (Accelerep warm-stone, per style guide) ───────────────────────────
const C = {
    surface: '#fbf8f3', white: '#ffffff', stone: '#f0ece4', stone2: '#f5efe3',
    ink: '#1c1917', ink2: '#57534e', muted: '#78716c', faint: '#a8a29e',
    border: '#e5e2db', border2: '#ddd8cf', headerBg: '#1c1917', onDark: '#f5f1eb',
    ok: '#4d6b3d', warn: '#b87333', warnBg: '#fdf4e7', warnBorder: '#f0d9b5',
    r: 8,
};

// Fields offered for conflict resolution (label + account key).
const FIELDS = [
    ['Company name', 'name'], ['Website', 'website'], ['Phone', 'phone'],
    ['Industry', 'industry'], ['Vertical market', 'verticalMarket'],
    ['Segment', 'accountSegment'], ['Owner', 'accountOwner'], ['Assigned rep', 'assignedRep'],
    ['Address', 'address'], ['City', 'city'], ['State', 'state'], ['ZIP', 'zip'],
    ['Country', 'country'], ['Description', 'description'], ['Employees', 'totalEmployees'],
    ['Annual revenue', 'annualRevenue'], ['LinkedIn', 'linkedInUrl'],
];

const norm = (v) => String(v ?? '').trim().toLowerCase();
const has = (v) => String(v ?? '').trim() !== '';

function StatRow({ acc, counts }) {
    return (
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12, color: C.ink2 }}>
            <span><b style={{ fontWeight: 700, color: C.ink }}>{counts.opps}</b> opps</span>
            <span><b style={{ fontWeight: 700, color: C.ink }}>{counts.contacts}</b> contacts</span>
            <span><b style={{ fontWeight: 700, color: C.ink }}>{counts.activities}</b> activities</span>
            {counts.subs > 0 && <span><b style={{ fontWeight: 700, color: C.ink }}>{counts.subs}</b> subs</span>}
        </div>
    );
}

export default function MergeReviewModal() {
    const {
        mergeModal, setMergeModal,
        accounts, opportunities, contacts, activities, tasks,
        handleMerge, mergeSaving, mergeError, setMergeError,
    } = useApp();

    const aId = mergeModal?.aId;
    const bId = mergeModal?.bId;

    const accA = useMemo(() => (accounts || []).find(a => a.id === aId) || null, [accounts, aId]);
    const accB = useMemo(() => (accounts || []).find(a => a.id === bId) || null, [accounts, bId]);

    const countsFor = useMemo(() => (acc) => {
        if (!acc) return { opps: 0, contacts: 0, activities: 0, subs: 0, total: 0 };
        const opps = (opportunities || []).filter(o => o.account === acc.name).length;
        const cts = (contacts || []).filter(c => c.company === acc.name).length;
        const acts = (activities || []).filter(x => x.accountId === acc.id).length;
        const subs = (accounts || []).filter(x => (x.parentAccountId) === acc.id).length;
        const tsk = (tasks || []).filter(t => t.accountId === acc.id).length;
        return { opps, contacts: cts, activities: acts, subs, tasks: tsk, total: opps + cts + acts + subs + tsk };
    }, [opportunities, contacts, activities, accounts, tasks]);

    // Default survivor = the richer record (more linked items), tie-break older.
    const defaultSurvivorId = useMemo(() => {
        if (!accA || !accB) return aId;
        const ta = countsFor(accA).total, tb = countsFor(accB).total;
        if (ta !== tb) return ta >= tb ? accA.id : accB.id;
        return new Date(accA.createdAt || 0) <= new Date(accB.createdAt || 0) ? accA.id : accB.id;
    }, [accA, accB, countsFor, aId]);

    const [survivorId, setSurvivorId] = useState(defaultSurvivorId);
    const [choices, setChoices] = useState({}); // field -> 'survivor' | 'archived'

    useEffect(() => { setSurvivorId(defaultSurvivorId); }, [defaultSurvivorId]);
    useEffect(() => { setChoices({}); setMergeError?.(null); }, [survivorId, aId, bId, setMergeError]);

    if (!mergeModal || !accA || !accB) return null;

    const survivor = survivorId === accB.id ? accB : accA;
    const archived = survivorId === accB.id ? accA : accB;
    const sCounts = countsFor(survivor);
    const aCounts = countsFor(archived);

    // Field analysis relative to the chosen survivor.
    const conflicts = []; // both non-empty + differ -> user picks
    const fills = [];     // survivor empty + archived has value -> auto-applied
    for (const [label, key] of FIELDS) {
        const sv = survivor[key], av = archived[key];
        if (has(sv) && has(av) && norm(sv) !== norm(av)) conflicts.push({ label, key, sv, av });
        else if (!has(sv) && has(av)) fills.push({ label, key, av });
    }

    const buildResolved = () => {
        const resolved = {};
        for (const f of conflicts) {
            if ((choices[f.key] || 'survivor') === 'archived') resolved[f.key] = f.av;
        }
        for (const f of fills) resolved[f.key] = f.av; // fill gaps from the archived record
        return resolved;
    };

    const onMerge = async () => {
        const resolved = buildResolved();
        const survivorName = (resolved.name != null && String(resolved.name).trim()) ? resolved.name : survivor.name;
        const result = await handleMerge?.({
            survivorId: survivor.id,
            archivedId: archived.id,
            survivorName,
            archivedName: archived.name,
            resolvedFields: resolved,
            survivorUpdatedAt: survivor.updatedAt,
            archivedUpdatedAt: archived.updatedAt,
        });
        if (result) setMergeModal(null);
    };

    const close = () => { setMergeError?.(null); setMergeModal(null); };

    const cardStyle = (isSurvivor) => ({
        background: C.white,
        border: isSurvivor ? `2px solid ${C.ink}` : `1px solid ${C.border2}`,
        borderRadius: C.r, padding: '0.8rem 0.9rem', cursor: 'pointer', flex: 1, minWidth: 0,
    });
    const tagStyle = (isSurvivor) => ({
        background: isSurvivor ? C.ink : C.stone, color: isSurvivor ? C.onDark : C.muted,
        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        padding: '2px 7px', borderRadius: 4,
    });
    const radioLabel = (active) => ({
        display: 'flex', alignItems: 'center', gap: 7, fontSize: 13,
        color: active ? C.ink : C.faint, cursor: 'pointer', minWidth: 0,
    });

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(28,25,23,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 1rem', overflowY: 'auto', fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <div style={{ width: 640, maxWidth: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.15)' }}>

                {/* Header */}
                <div style={{ background: C.headerBg, color: C.onDark, padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Review &amp; merge accounts</div>
                    <button onClick={close} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.onDark, fontSize: 20, lineHeight: 1, cursor: 'pointer', opacity: 0.85 }}>×</button>
                </div>

                <div style={{ padding: '1.1rem 1.25rem 0.5rem' }}>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: '0.75rem' }}>
                        Choose the record that survives. The other is archived and its related items are re-linked to the survivor. Reversible afterward.
                    </div>

                    {mergeError && (
                        <div style={{ background: '#fef2f2', border: '1px solid #9c3a2e', borderRadius: C.r, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#9c3a2e' }}>
                            {mergeError}
                        </div>
                    )}

                    {/* Survivor / archive cards */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        {[accA, accB].map(acc => {
                            const isSurvivor = acc.id === survivor.id;
                            const c = countsFor(acc);
                            return (
                                <div key={acc.id} style={cardStyle(isSurvivor)} onClick={() => setSurvivorId(acc.id)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <span style={tagStyle(isSurvivor)}>{isSurvivor ? 'Survivor' : 'Archive'}</span>
                                        <span style={{ fontSize: 10, color: C.faint }}>{c.total} linked</span>
                                    </div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.name}</div>
                                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{(acc.accountOwner || acc.assignedRep || 'Unassigned')}{acc.industry ? ` · ${acc.industry}` : ''}</div>
                                    <StatRow acc={acc} counts={c} />
                                </div>
                            );
                        })}
                    </div>

                    {/* Conflicting fields */}
                    {conflicts.length > 0 && (
                        <>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', margin: '1rem 0 0.4rem' }}>Resolve conflicting fields</div>
                            <div style={{ border: `1px solid ${C.border}`, borderRadius: C.r, overflow: 'hidden' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', padding: '0.5rem 0.75rem', borderBottom: `1px solid #efe9df`, background: C.stone2 }}>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: C.ink2 }}>Field</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: C.ink2 }}>Survivor</span>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: C.ink2 }}>Archive</span>
                                </div>
                                {conflicts.map((f, i) => {
                                    const choice = choices[f.key] || 'survivor';
                                    return (
                                        <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', alignItems: 'center', padding: '0.55rem 0.75rem', borderBottom: i < conflicts.length - 1 ? `1px solid #efe9df` : 'none' }}>
                                            <span style={{ fontSize: 12, color: C.muted }}>{f.label}</span>
                                            <label style={radioLabel(choice === 'survivor')} onClick={() => setChoices(p => ({ ...p, [f.key]: 'survivor' }))}>
                                                <input type="radio" readOnly checked={choice === 'survivor'} style={{ accentColor: C.ink }} />
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(f.sv)}</span>
                                            </label>
                                            <label style={radioLabel(choice === 'archived')} onClick={() => setChoices(p => ({ ...p, [f.key]: 'archived' }))}>
                                                <input type="radio" readOnly checked={choice === 'archived'} style={{ accentColor: C.ink }} />
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(f.av)}</span>
                                            </label>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {fills.length > 0 && (
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
                            {fills.length} empty field{fills.length > 1 ? 's' : ''} on the survivor will be filled from the archived record ({fills.map(f => f.label.toLowerCase()).join(', ')}).
                        </div>
                    )}
                </div>

                {/* Re-link summary */}
                <div style={{ margin: '0.9rem 1.25rem 0', padding: '0.6rem 0.8rem', background: C.warnBg, border: `1px solid ${C.warnBorder}`, borderRadius: C.r, fontSize: 12, color: '#7a5a2c', lineHeight: 1.45 }}>
                    Merging re-links <b style={{ fontWeight: 700 }}>{aCounts.opps} opportunities</b>, <b style={{ fontWeight: 700 }}>{aCounts.contacts} contacts</b>, <b style={{ fontWeight: 700 }}>{aCounts.activities} activities</b>{aCounts.tasks ? <>, <b style={{ fontWeight: 700 }}>{aCounts.tasks} tasks</b></> : null}{aCounts.subs ? <>, and <b style={{ fontWeight: 700 }}>{aCounts.subs} sub-accounts</b></> : null} from “{archived.name}” to “{survivor.name}”, then archives “{archived.name}”.
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '1rem 1.25rem 1.2rem' }}>
                    <button onClick={close} disabled={mergeSaving} style={{ marginLeft: 'auto', background: C.stone, color: C.muted, border: `1px solid ${C.border2}`, borderRadius: C.r, padding: '0.5rem 1rem', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={onMerge} disabled={mergeSaving} style={{ background: C.ink, color: C.onDark, border: 'none', borderRadius: C.r, padding: '0.5rem 1.1rem', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: mergeSaving ? 'default' : 'pointer', opacity: mergeSaving ? 0.7 : 1 }}>
                        {mergeSaving ? 'Merging…' : 'Merge accounts'}
                    </button>
                </div>

            </div>
        </div>
    );
}
