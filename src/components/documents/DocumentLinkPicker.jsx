// src/components/documents/DocumentLinkPicker.jsx
// Cross-entity link picker (handoff artboard 3). Centered modal mounted once in
// ModalLayer; opened via context (showDocLinkPicker + docLinkPickerContext).
//
// Two modes, both driven by docLinkPickerContext:
//   • Persist:   { documentId, currentLinks }  → on Done, diff and call
//                linkDocument / unlinkDocument (used by the detail rail).
//   • Selection: { mode:'select', currentLinks, onApply } → on Done, hand the
//                chosen links back via onApply (used by the upload rail, where
//                the document doesn't exist yet).

import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../AppContext';
import { useEscapeLayer } from '../../hooks/useEscapeLayer';
import { T, fmtDate, EntityGlyph, ENTITY_META } from './atoms';
import { unarchived, survivorOf, isMergeArchived, HIDDEN_ACCOUNT, HIDDEN_DEAL } from '../../utils/pickLink.js';

const ORDER = ['account', 'opportunity', 'contact', 'task', 'activity'];
const money = (v) => (Number(v) ? `$${Number(v).toLocaleString()}` : null);
const join = (parts) => parts.filter(Boolean).join(' · ');

// What a held link's row says when the offer leaves its record out (state §0.209): one merged into another names
// the record it was merged into (through the whole list), else the record is one the caller's list does not hold.
const CANT_OPEN = { account: HIDDEN_ACCOUNT, opportunity: HIDDEN_DEAL, contact: "A contact you can't open", task: "A task you can't open", activity: "An activity you can't open" };
const heldLinkSub = (link, accounts, contacts) => {
    const list = link.type === 'account' ? accounts : link.type === 'contact' ? contacts : null;
    const rec = list ? list.find((r) => r.id === link.recordId) : null;
    if (rec && isMergeArchived(rec)) {
        const into = survivorOf(rec, list);
        const label = (r) => (link.type === 'contact' ? `${r.firstName || ''} ${r.lastName || ''}`.trim() : r.name);
        return into ? `Merged into “${label(into)}”` : `Merged into another ${link.type}`;
    }
    return CANT_OPEN[link.type] || '';
};

const groupHead = { padding: '10px 18px 4px', fontSize: 10, fontWeight: 700, color: T.inkMuted, letterSpacing: '0.07em', textTransform: 'uppercase' };

// One record of the list, ticked while linked (module scope: declared inside the picker, every row would be a new
// component on each render).
const LinkRow = ({ c, on, onToggle }) => (
    <div onClick={() => onToggle(c)}
        style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 18px', cursor: 'pointer', background: on ? 'rgba(200,185,154,0.1)' : 'transparent' }}>
        <div style={{ width: 28, height: 28, borderRadius: T.r, background: T.surface2, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <EntityGlyph type={c.type} size={14} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
            {c.sub && <div style={{ fontSize: 11, color: T.inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.sub}</div>}
        </div>
        <div style={{ width: 18, height: 18, borderRadius: T.r, border: `1.5px solid ${on ? T.ink : T.border}`, background: on ? T.ink : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {on && <span style={{ color: '#f5f1eb', fontSize: 12, lineHeight: 1 }}>✓</span>}
        </div>
    </div>
);

export default function DocumentLinkPicker() {
    const {
        showDocLinkPicker, setShowDocLinkPicker,
        docLinkPickerContext, setDocLinkPickerContext,
        accounts: allAccounts = [], contacts: allContacts = [], opportunities = [], tasks = [], activities = [],
        linkDocument, unlinkDocument,
        escapeBlocked,
    } = useApp();

    const ctx = docLinkPickerContext || {};
    const [selected, setSelected] = useState({}); // key -> link object
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');

    // Seed selection from the caller's current links each time the picker opens.
    useEffect(() => {
        if (!showDocLinkPicker) return;
        const seed = {};
        (ctx.currentLinks || []).forEach((l) => {
            seed[`${l.type}:${l.recordId}`] = { type: l.type, recordId: l.recordId, name: l.name, sub: l.sub, id: l.id };
        });
        setSelected(seed);
        setSearch('');
        setTypeFilter('all');
    }, [showDocLinkPicker]); // eslint-disable-line react-hooks/exhaustive-deps

    // The records a link can name anew: none merged into another (guide §18b91 rule 5; state §0.209). A document
    // already linked to one keeps that link (seeded from currentLinks, above); the app's lists keep every row (§18b99).
    const accounts = useMemo(() => unarchived(allAccounts), [allAccounts]);
    const contacts = useMemo(() => unarchived(allContacts), [allContacts]);

    // Each record is offered by its own fields (state §0.181): a task by its title, an
    // activity by its subject (its type when it has none), a deal's amount from its arr.
    // The picker read `name` for the first two and `value` for the third — none of them a
    // column — so every task was offered as "Task" and stored so on its link, every
    // activity by its type, and no deal with its amount. tests/document-link-names.test.mjs
    // checks every field read here against db/schema.ts.
    const candidates = useMemo(() => {
        const out = [];
        accounts.forEach((a) => out.push({ type: 'account', recordId: a.id, name: a.name, sub: join([a.verticalMarket || a.industry, join([a.city, a.state])]) }));
        opportunities.forEach((o) => out.push({ type: 'opportunity', recordId: o.id, name: o.opportunityName || o.account || 'Opportunity', sub: join([o.stage, money(o.arr)]) }));
        contacts.forEach((c) => out.push({ type: 'contact', recordId: c.id, name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Contact', sub: join([c.title, c.company]) }));
        tasks.forEach((t) => out.push({ type: 'task', recordId: t.id, name: t.title || 'Task', sub: t.dueDate ? `Due ${fmtDate(t.dueDate)}` : '' }));
        activities.forEach((a) => out.push({ type: 'activity', recordId: a.id, name: a.subject || a.type || 'Activity', sub: join([a.type, a.date ? fmtDate(a.date) : null]) }));
        return out.filter((x) => x.recordId).map((x) => ({ ...x, key: `${x.type}:${x.recordId}` }));
    }, [accounts, opportunities, contacts, tasks, activities]);

    // A link the document holds that the offer leaves out — a record merged into another, or one the caller's list does
    // not hold — is drawn, ticked, so it can be removed here; never only counted in "N linked" (§18b91 rule 4; state
    // §0.209). Not narrowed by the search or the type pills: a document holds a few.
    const heldRows = useMemo(() => {
        const offered = new Set(candidates.map((c) => c.key));
        return (ctx.currentLinks || [])
            .filter((l) => l.recordId && !offered.has(`${l.type}:${l.recordId}`))
            .map((l) => {
                const sub = heldLinkSub(l, allAccounts, allContacts);
                return { key: `${l.type}:${l.recordId}`, type: l.type, recordId: l.recordId, name: l.name || sub, sub: l.name ? sub : '' };
            });
    }, [docLinkPickerContext, candidates, allAccounts, allContacts]); // eslint-disable-line react-hooks/exhaustive-deps

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return candidates.filter((c) => {
            if (typeFilter !== 'all' && c.type !== typeFilter) return false;
            if (q && !(`${c.name} ${c.sub}`.toLowerCase().includes(q))) return false;
            return true;
        });
    }, [candidates, search, typeFilter]);

    const grouped = useMemo(() => {
        const g = {};
        filtered.forEach((c) => { (g[c.type] = g[c.type] || []).push(c); });
        return ORDER.filter((t) => g[t] && g[t].length).map((t) => [t, g[t]]);
    }, [filtered]);

    const close = () => { setShowDocLinkPicker(false); setDocLinkPickerContext && setDocLinkPickerContext(null); };

    // Escape closes the picker as its backdrop does, the links left as they were (state
    // §0.180) — while no layer above it is open: the one order (escapeBlocked, state
    // §0.189), not the app's confirm and prompt alone.
    useEscapeLayer(showDocLinkPicker, close, escapeBlocked('linkPicker'));

    if (!showDocLinkPicker) return null;

    const selectedCount = Object.keys(selected).length;
    const toggle = (cand) => setSelected((prev) => {
        const next = { ...prev };
        if (next[cand.key]) delete next[cand.key];
        else next[cand.key] = { type: cand.type, recordId: cand.recordId, name: cand.name, sub: cand.sub };
        return next;
    });

    const done = async () => {
        const chosen = Object.values(selected);
        if (ctx.onApply) {
            ctx.onApply(chosen);
        } else if (ctx.documentId) {
            const curKeys = new Set((ctx.currentLinks || []).map((l) => `${l.type}:${l.recordId}`));
            const selKeys = new Set(Object.keys(selected));
            const added = chosen.filter((l) => !curKeys.has(`${l.type}:${l.recordId}`));
            const removed = (ctx.currentLinks || []).filter((l) => !selKeys.has(`${l.type}:${l.recordId}`));
            // A refused link or unlink says so in the app's message (useDocuments) and leaves
            // the picker open with the choice, to try again or close (state §0.181). It was
            // logged to the console, and the picker closed as if it had saved.
            if (added.length && linkDocument && !(await linkDocument(ctx.documentId, added)).ok) return;
            for (const r of removed) {
                if (r.id && unlinkDocument && !(await unlinkDocument(ctx.documentId, r.id)).ok) return;
            }
        }
        close();
    };

    const filterPill = (key, label) => {
        const active = typeFilter === key;
        return (
            <button key={key} onClick={() => setTypeFilter(key)}
                style={{ background: active ? T.ink : T.surface, color: active ? '#f5f1eb' : T.inkMid, border: `1px solid ${active ? T.ink : T.border}`, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                {label}
            </button>
        );
    };

    return (
        <>
            <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 11104, background: 'rgba(42,38,34,0.35)' }} />
            <div style={{
                position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
                width: 'min(520px, calc(100vw - 32px))', maxHeight: '82vh', background: T.surface,
                border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: '0 24px 64px rgba(42,38,34,0.28)',
                zIndex: 11105, display: 'flex', flexDirection: 'column', fontFamily: T.sans, overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{ padding: '16px 18px 12px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>Link this document to…</div>
                        <button onClick={close} style={{ background: 'none', border: 'none', color: T.inkMuted, fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 2 }}>×</button>
                    </div>
                    <div style={{ position: 'relative', marginTop: 12 }}>
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search records…" autoFocus
                            style={{ width: '100%', padding: '8px 12px', border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 13, background: T.surface2, color: T.ink, fontFamily: T.sans, boxSizing: 'border-box', outline: 'none' }} />
                        {selectedCount > 0 && <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: T.inkMuted }}>{selectedCount} linked</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                        {filterPill('all', 'All')}
                        {ORDER.map((t) => filterPill(t, `${ENTITY_META[t].label}s`))}
                    </div>
                </div>

                {/* Results */}
                <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, borderTop: `1px solid ${T.border}` }}>
                    {heldRows.length > 0 && (
                        <div>
                            <div style={groupHead}>Already linked</div>
                            {heldRows.map((c) => <LinkRow key={c.key} c={c} on={!!selected[c.key]} onToggle={toggle} />)}
                        </div>
                    )}
                    {grouped.length === 0 ? (
                        <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: 13, color: T.inkMuted }}>No matching records.</div>
                    ) : grouped.map(([type, rows]) => (
                        <div key={type}>
                            <div style={groupHead}>{ENTITY_META[type].label}s</div>
                            {rows.map((c) => <LinkRow key={c.key} c={c} on={!!selected[c.key]} onToggle={toggle} />)}
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: `1px solid ${T.border}`, background: T.surface2, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: T.inkMuted }}>One document can link to any number of records.</span>
                    <button onClick={done} style={{ background: T.ink, color: '#f5f1eb', border: 'none', borderRadius: T.r, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Done</button>
                </div>
            </div>
        </>
    );
}
