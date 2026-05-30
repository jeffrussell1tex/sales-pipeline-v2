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

// Resolvable / gap-fill fields. Name parts are intentionally excluded — the
// survivor's identity is fixed by which record you keep, and the composite
// `name` field is not rewritten by the merge. Keys must match CONTACT_FIELDS.
const FIELDS = [
    ['Title', 'title'], ['Company', 'company'], ['Department', 'department'], ['Work location', 'workLocation'],
    ['Email', 'email'], ['Personal email', 'personalEmail'],
    ['Phone', 'phone'], ['Mobile', 'mobile'],
    ['Address', 'address'], ['Address 2', 'address2'], ['City', 'city'], ['State', 'state'], ['ZIP', 'zip'], ['Country', 'country'],
    ['Assistant', 'assistantName'], ['Home address', 'homeAddress'],
    ['Assigned rep', 'assignedRep'], ['Territory', 'assignedTerritory'],
    ['Buyer persona', 'buyerPersona'], ['Notes', 'notes'],
];

const norm = (v) => String(v ?? '').trim().toLowerCase();
const has = (v) => String(v ?? '').trim() !== '';
const displayName = (c) =>
    (c?.name || [c?.firstName, c?.lastName].filter(Boolean).join(' ') || c?.email || 'Contact').toString().trim();

function StatRow({ counts }) {
    return (
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 12, color: C.ink2, flexWrap: 'wrap' }}>
            <span><b style={{ fontWeight: 700, color: C.ink }}>{counts.opps}</b> opps</span>
            <span><b style={{ fontWeight: 700, color: C.ink }}>{counts.activities}</b> activities</span>
            <span><b style={{ fontWeight: 700, color: C.ink }}>{counts.tasks}</b> tasks</span>
            {counts.orgChart > 0 && <span><b style={{ fontWeight: 700, color: C.ink }}>{counts.orgChart}</b> org links</span>}
        </div>
    );
}

export default function ContactMergeReviewModal() {
    const {
        contactMergeModal, setContactMergeModal,
        contacts, opportunities, activities, tasks,
        handleContactMerge, mergeSaving, mergeError, setMergeError,
    } = useApp();

    const aId = contactMergeModal?.aId;
    const bId = contactMergeModal?.bId;

    const cA = useMemo(() => (contacts || []).find(c => c.id === aId) || null, [contacts, aId]);
    const cB = useMemo(() => (contacts || []).find(c => c.id === bId) || null, [contacts, bId]);

    const countsFor = useMemo(() => (c) => {
        if (!c) return { opps: 0, activities: 0, tasks: 0, orgChart: 0, total: 0 };
        const opps = (opportunities || []).filter(o => Array.isArray(o.contactIds) && o.contactIds.includes(c.id)).length;
        const acts = (activities || []).filter(x => x.contactId === c.id).length;
        const tsk = (tasks || []).filter(t => t.contactId === c.id).length;
        const orgChart = (contacts || []).filter(other =>
            other.id !== c.id && (
                (Array.isArray(other.managers) && other.managers.some(m => (m?.id ?? m) === c.id)) ||
                (Array.isArray(other.directReports) && other.directReports.some(d => (d?.id ?? d) === c.id))
            )).length;
        return { opps, activities: acts, tasks: tsk, orgChart, total: opps + acts + tsk + orgChart };
    }, [opportunities, activities, tasks, contacts]);

    // Default survivor = the richer record (more linked items), tie-break older.
    const defaultSurvivorId = useMemo(() => {
        if (!cA || !cB) return aId;
        const ta = countsFor(cA).total, tb = countsFor(cB).total;
        if (ta !== tb) return ta >= tb ? cA.id : cB.id;
        return new Date(cA.createdAt || 0) <= new Date(cB.createdAt || 0) ? cA.id : cB.id;
    }, [cA, cB, countsFor, aId]);

    const [survivorId, setSurvivorId] = useState(defaultSurvivorId);
    const [choices, setChoices] = useState({}); // field -> 'survivor' | 'archived'

    useEffect(() => { setSurvivorId(defaultSurvivorId); }, [defaultSurvivorId]);
    useEffect(() => { setChoices({}); setMergeError?.(null); }, [survivorId, aId, bId, setMergeError]);

    if (!contactMergeModal || !cA || !cB) return null;

    const survivor = survivorId === cB.id ? cB : cA;
    const archived = survivorId === cB.id ? cA : cB;
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
        const result = await handleContactMerge?.({
            survivorId: survivor.id,
            archivedId: archived.id,
            survivorName: displayName(survivor),
            archivedName: displayName(archived),
            resolvedFields: resolved,
            survivorUpdatedAt: survivor.updatedAt,
            archivedUpdatedAt: archived.updatedAt,
        });
        if (result) setContactMergeModal(null);
    };

    const close = () => { setMergeError?.(null); setContactMergeModal(null); };

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

    const subtitle = (c) => {
        const email = c.email || c.personalEmail || 'No email';
        return c.company ? `${email} · ${c.company}` : email;
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(28,25,23,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '3vh 1rem', overflowY: 'auto', fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
            <div style={{ width: 640, maxWidth: '100%', background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.15)' }}>

                {/* Header */}
                <div style={{ background: C.headerBg, color: C.onDark, padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Review &amp; merge contacts</div>
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
                        {[cA, cB].map(c => {
                            const isSurvivor = c.id === survivor.id;
                            const counts = countsFor(c);
                            return (
                                <div key={c.id} style={cardStyle(isSurvivor)} onClick={() => setSurvivorId(c.id)}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <span style={tagStyle(isSurvivor)}>{isSurvivor ? 'Survivor' : 'Archive'}</span>
                                        <span style={{ fontSize: 10, color: C.faint }}>{counts.total} linked</span>
                                    </div>
                                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(c)}</div>
                                    <div style={{ fontSize: 12, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle(c)}</div>
                                    {c.title ? <div style={{ fontSize: 11, color: C.faint, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</div> : null}
                                    <StatRow counts={counts} />
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
                    Merging re-links <b style={{ fontWeight: 700 }}>{aCounts.opps} opportunities</b>, <b style={{ fontWeight: 700 }}>{aCounts.activities} activities</b>, <b style={{ fontWeight: 700 }}>{aCounts.tasks} tasks</b>{aCounts.orgChart ? <>, and <b style={{ fontWeight: 700 }}>{aCounts.orgChart} org-chart link{aCounts.orgChart > 1 ? 's' : ''}</b></> : null} from “{displayName(archived)}” to “{displayName(survivor)}”, then archives “{displayName(archived)}”.
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '1rem 1.25rem 1.2rem' }}>
                    <button onClick={close} disabled={mergeSaving} style={{ marginLeft: 'auto', background: C.stone, color: C.muted, border: `1px solid ${C.border2}`, borderRadius: C.r, padding: '0.5rem 1rem', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={onMerge} disabled={mergeSaving} style={{ background: C.ink, color: C.onDark, border: 'none', borderRadius: C.r, padding: '0.5rem 1.1rem', fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: mergeSaving ? 'default' : 'pointer', opacity: mergeSaving ? 0.7 : 1 }}>
                        {mergeSaving ? 'Merging…' : 'Merge contacts'}
                    </button>
                </div>

            </div>
        </div>
    );
}
