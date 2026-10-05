// settings/quoting/ApprovalTiersDetail.jsx — the discount bands that need approval,
// and WHO approves each (state §0.157 — Jeff, 2 Oct: "an admin setting for
// approvals. They can choose by role or by person. If by role they define the
// approver and backup, and if by person the admin sets the person and the backup").
//
// One choice for the workspace — by role or by person — and, per tier, an approver
// and a backup. The backup may act at any time; an Admin always may; only Admins
// and Managers approve. quotes.mjs enforces it (mayDecideQuote, quoteRules.js);
// settings.mjs cleans what is saved (cleanApprovalTiers) and refuses a person who is
// not an active Admin or Manager of this org.
//
// What this page offered and nothing did (found with §0.155, removed here): six
// approval "triggers" — only the average discount ever decided — "Switch to advanced
// rules", a free-text approver and fallback, "Add co-approver", "View quotes routed",
// "View pending now", "Move…", a drag handle, an "Active" pill, and a deal simulator
// whose value and term changed nothing. The discount cap's editor existed and
// nothing opened it. The SLA column is the reminder's time since §0.158: after it, with
// no decision, the backup is emailed (quote-reminders.mjs).
import React, { useState } from 'react';
import { useRegisterSave } from '../shared/useRegisterSave.js';
import { dbFetch } from '../../../utils/storage';
import { T } from '../shared/tokens.js';
import { putSettings } from '../shared/saveSettings.js';
import { CSectionCard } from '../shared/form.jsx';
import { CategoryDetailChrome } from '../shared/CategoryDetailChrome.jsx';
import { QPill } from './shared.jsx';
import {
    APPROVER_ROLES, cleanApprovalRouting, cleanApprovalTiers, tierNeedsApproval, decidedByWords, approvalTierFor, slaHours,
    DEFAULT_QUOTE_APPROVAL_TIERS,
} from '../../../utils/quoteRules.js';

const TIER_COLORS = ['#4d6b3d', '#b87333', '#9c3a2e', '#6b2a22', '#3a5a7a', '#7a6a48'];
// The page's starting tiers for an org that has saved none: quoteRules' defaults —
// the bands, the approvers and the reminder times quote-reminders.mjs reminds by —
// with ids and colours. One list, so the page never shows a reminder the job does
// not send (§0.158; it had its own copy, and the server's had no times).
const DEFAULT_APPROVAL_TIERS = DEFAULT_QUOTE_APPROVAL_TIERS.map((t, i) => ({ ...t, id: ['rep', 'mgr', 'vp', 'cfo'][i] || `tier_${i + 1}`, color: TIER_COLORS[i % TIER_COLORS.length] }));
const NONE = '__none__';
const byCap = (list) => {
    const sorted = [...list].sort((a, b) => (Number(a.maxDiscount) || 1) - (Number(b.maxDiscount) || 1));
    if (sorted.length) sorted[sorted.length - 1] = { ...sorted[sorted.length - 1], maxDiscount: 1 };
    return sorted;
};
const withIds = (list) => list.map((t, i) => ({ ...t, id: t.id || `tier_${i + 1}` }));

const NumStep = ({ value, onChange, suffix='', min=0, max=100 }) => (
    <div style={{ display:'inline-flex', alignItems:'center', border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, overflow:'hidden' }}>
        <button onClick={() => onChange && onChange(Math.max(min, value-1))} style={{ padding:'4px 8px', background:'none', border:'none', color:T.inkMuted, fontSize:14, cursor:'pointer', lineHeight:1 }}>−</button>
        <span style={{ borderLeft:`1px solid ${T.border}`, borderRight:`1px solid ${T.border}`, padding:'4px 10px', minWidth:56, textAlign:'center', fontFamily:'ui-monospace,Menlo,monospace', fontSize:13, color:T.ink }}>{value}{suffix}</span>
        <button onClick={() => onChange && onChange(Math.min(max, value+1))} style={{ padding:'4px 8px', background:'none', border:'none', color:T.inkMuted, fontSize:14, cursor:'pointer', lineHeight:1 }}>+</button>
    </div>
);

// One tier's approver or backup — a role or a person, by the workspace's choice.
// Module scope, as every sub-component here (one defined inside its parent remounts
// on each render). `offerNone` adds an explicit "No approval needed" beside a
// "Choose an approver…" placeholder.
const ApproverSelect = ({ mode, value, onChange, people, placeholder, offerNone, exclude, disabled }) => (
    <select value={value || ''} disabled={disabled} onChange={e => onChange(e.target.value || null)}
        style={{ width:'100%', padding:'4px 6px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, color: value ? T.ink : T.inkMuted, fontFamily:T.sans, background: disabled ? T.surface2 : T.surface, cursor: disabled ? 'default' : 'pointer' }}>
        <option value="">{placeholder}</option>
        {offerNone && <option value={NONE}>No approval needed</option>}
        {mode === 'role'
            ? APPROVER_ROLES.filter(r => r !== exclude).map(r => <option key={r} value={r}>{r}</option>)
            : people.filter(p => p.id !== exclude).map(p => <option key={p.id} value={p.id}>{p.name}{p.eligible ? '' : ' — no longer an approver'}</option>)}
    </select>
);

const MenuItem = ({ label, sub, onClick, danger }) => (
    <button onClick={onClick}
        style={{ display:'block', width:'100%', padding:'9px 14px', background: danger ? T.surface2 : 'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer', fontFamily:T.sans }}
        onMouseEnter={e => { e.currentTarget.style.background = danger ? 'rgba(156,58,46,0.08)' : T.surface2; }}
        onMouseLeave={e => { e.currentTarget.style.background = danger ? T.surface2 : 'none'; }}>
        <div style={{ fontSize:13, color: danger ? T.danger : T.ink, fontWeight: danger ? 600 : 400 }}>{label}</div>
        {sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{sub}</div>}
    </button>
);

export const ApprovalTiersDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const savedTiers = withIds(settings?.approvalTiers || DEFAULT_APPROVAL_TIERS);
    const savedMode  = cleanApprovalRouting(settings?.approvalRouting);
    const [tiers,       setTiers]       = useState(() => JSON.parse(JSON.stringify(savedTiers)));
    const [mode,        setMode]        = useState(savedMode);
    // Tiers that needed approval when the Admin switched to "by person": a person
    // cannot be guessed, so each waits for a choice — a save is refused until every
    // one names a person or is set to "No approval needed" (a mode switch never
    // quietly lets a discount through).
    const [needsChoice, setNeedsChoice] = useState(() => new Set());
    const [dirty,       setDirty]       = useState(false);
    const [saving,      setSaving]      = useState(false);
    const [saveError,   setSaveError]   = useState('');
    const [trialDiscount, setTrialDiscount] = useState(18);

    // Who may be named: the org's active Admins and Managers. A name a tier already
    // holds that is no longer one stays listed and marked — the server refuses it.
    const roster   = settings?.users || [];
    const eligible = roster.filter(u => u.active !== false && APPROVER_ROLES.includes(u.role || u.userType));
    const nameOf   = (id) => roster.find(u => u.id === id)?.name || null;
    const heldIds  = [...new Set(tiers.flatMap(t => [t.approverUserId, t.backupUserId]).filter(Boolean))];
    const people   = [
        ...eligible.map(u => ({ id: u.id, name: u.name, eligible: true })),
        ...heldIds.filter(id => !eligible.some(u => u.id === id)).map(id => ({ id, name: nameOf(id) || 'A former user', eligible: false })),
    ];

    const setTier = (i, patch) => { setTiers(prev => prev.map((t, ti) => (ti === i ? { ...t, ...patch } : t))); setDirty(true); };
    const keyOf   = (m) => (m === 'role' ? ['approverRole', 'backupRole'] : ['approverUserId', 'backupUserId']);

    const chooseMode = (m) => {
        if (m === mode) return;
        const need = new Set();
        const next = tiers.map(t => {
            const wanted = tierNeedsApproval(t);   // a tier that needed approval still does
            const base = { ...t, approverRole: null, backupRole: null, approverUserId: null, backupUserId: null };
            if (!wanted) return base;
            if (m === 'role') return { ...base, approverRole: 'Manager' };
            need.add(t.id);
            return base;
        });
        setTiers(next); setNeedsChoice(need); setMode(m); setDirty(true); setSaveError('');
    };
    const setApprover = (i, v) => {
        const t = tiers[i];
        const [a, b] = keyOf(mode);
        const value = v === NONE ? null : v;
        if (v === NONE || value) setNeedsChoice(prev => { const n = new Set(prev); n.delete(t.id); return n; });
        setTier(i, { [a]: value, [b]: value && t[b] !== value ? t[b] : null });
    };
    const setBackup = (i, v) => { const [, b] = keyOf(mode); setTier(i, { [b]: v || null }); };

    const handleCancel = () => {
        setTiers(JSON.parse(JSON.stringify(savedTiers))); setMode(savedMode); setNeedsChoice(new Set());
        setDirty(false); setSaveError('');
    };
    const handleSave = async () => {
        if (mode === 'person' && tiers.some(t => needsChoice.has(t.id) && !t.approverUserId)) {
            // Thrown, not returned (state §0.170): the leave guard's "Save and
            // continue" runs this too, and a return let it move on, the edit lost.
            const e = new Error('Choose an approver for each tier marked "Choose an approver…", or set it to "No approval needed".');
            setSaveError(e.message);
            throw e;
        }
        const clean = cleanApprovalTiers(tiers, mode);
        setSaving(true);
        try {
            await putSettings({ approvalTiers: clean, approvalRouting: mode });
            setSettings(prev => ({ ...prev, approvalTiers: clean, approvalRouting: mode }));
            setTiers(JSON.parse(JSON.stringify(clean))); setNeedsChoice(new Set());
            setSaveError(''); setDirty(false);
        } catch (e) {
            // Keep the panel dirty: the change was NOT saved (a 400 names why).
            setSaveError(e.message);
            // Clear the spinner, then rethrow: the leave guard's "Save and
            // continue" runs this too, and only a throw keeps it from moving on.
            setSaving(false);
            throw e;
        }
        setSaving(false);
    };
    // Hand the leave guard this panel's unsaved state and its save (state §0.170).
    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    useRegisterSave(settingsSaveRef, dirty, handleSave);

    // ── Tier kebab and inline edits ──────────────────────────
    const [openTierMenu, setOpenTierMenu] = useState(null);
    const [editingField, setEditingField] = useState(null);   // { idx, field }
    const [editingVal,   setEditingVal]   = useState('');
    React.useEffect(() => {
        if (openTierMenu === null) return;
        const h = () => setOpenTierMenu(null);
        document.addEventListener('click', h);
        return () => document.removeEventListener('click', h);
    }, [openTierMenu]);
    const startEdit = (i, field, val) => { setEditingField({ idx: i, field }); setEditingVal(val); setOpenTierMenu(null); };
    const commitFieldEdit = (i, field, val) => {
        setTiers(prev => {
            const next = prev.map((t, ti) => {
                if (ti !== i) return t;
                if (field === 'maxDiscount') {
                    const n = parseFloat(val) / 100;
                    return isNaN(n) ? t : { ...t, maxDiscount: Math.max(0.01, Math.min(1, n)) };
                }
                // The reminder's time, as the reminder reads it (§0.158): "8h" — "2d"
                // reads as 48h — or none.
                if (field === 'sla') return { ...t, sla: slaHours(val) ? `${slaHours(val)}h` : null };
                return { ...t, [field]: val };
            });
            return field === 'maxDiscount' ? byCap(next) : next;
        });
        setDirty(true); setEditingField(null); setEditingVal('');
    };
    const blankTier = (cap) => ({ id: 'tier_' + crypto.randomUUID(), label: 'New tier', color: TIER_COLORS[tiers.length % TIER_COLORS.length], maxDiscount: cap, sla: null, approver: null, approverRole: null, backupRole: null, approverUserId: null, backupUserId: null });
    const addTier = () => { setTiers(prev => byCap([...prev, blankTier(1)])); setDirty(true); };
    const insertAbove = (i) => {
        const lo = i === 0 ? 0 : tiers[i - 1].maxDiscount;
        setTiers(prev => byCap([...prev, blankTier(parseFloat(((lo + tiers[i].maxDiscount) / 2).toFixed(2)))])); setDirty(true); setOpenTierMenu(null);
    };
    const insertBelow = (i) => {
        const hi = tiers[i + 1]?.maxDiscount ?? 1;
        setTiers(prev => byCap([...prev, blankTier(parseFloat(((tiers[i].maxDiscount + hi) / 2).toFixed(2)))])); setDirty(true); setOpenTierMenu(null);
    };
    const deleteTier = (i) => {
        if (tiers.length <= 1) return;
        setTiers(prev => byCap(prev.filter((_, idx) => idx !== i))); setDirty(true); setOpenTierMenu(null);
    };

    // ── Live approval stats (the record's — §0.156) ──────────
    const [approvalStats, setApprovalStats] = useState(null);
    const [statsLoading,  setStatsLoading]  = useState(false);
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            setStatsLoading(true);
            try {
                const res = await dbFetch('/.netlify/functions/quotes?approvalStats=true');
                const data = await res.json();
                if (!cancelled && data.approvalStats) setApprovalStats(data.approvalStats);
            } catch (e) { console.error('fetch approval stats', e); }
            if (!cancelled) setStatsLoading(false);
        })();
        return () => { cancelled = true; };
    }, []);

    const trialTier = approvalTierFor(trialDiscount, tiers);
    const trialWho  = decidedByWords(trialTier, nameOf);
    const modeWords = mode === 'role' ? 'approvers by role' : mode === 'person' ? 'approvers by person' : 'approvers not chosen';
    const toneForIdx = (i) => ['rep','mgr','vp','cfo'][i] || 'neutral';
    const grid = '1.3fr 130px 1.2fr 1.2fr 64px 30px';

    return (
        <CategoryDetailChrome error={saveError}
            crumb="Approval tiers" category="Quoting" title="Approval tiers"
            subtitle="Discount thresholds that need approval — and who approves each"
            statusDetail={`${tiers.length} tiers · ${modeWords}`}
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20 }}>
                {/* ── LEFT COLUMN ─────────────────────────────────── */}
                <div>
                    <CSectionCard title="Who approves" description="One choice for the whole workspace, then an approver and a backup for each tier. A backup can act at any time, and an Admin can always approve.">
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                            {[
                                { id:'role',   title:'By role',   sub:'Whoever holds the role — a Manager or an Admin.' },
                                { id:'person', title:'By person', sub:'A named Manager or Admin for each tier, and a backup.' },
                            ].map(o => (
                                <label key={o.id} style={{ display:'flex', alignItems:'baseline', gap:8, padding:'8px 10px', border:`1px solid ${mode === o.id ? T.goldInk : T.border}`, borderRadius:T.r+2, background: mode === o.id ? 'rgba(200,185,154,0.08)' : T.surface, cursor:'pointer', fontFamily:T.sans }}>
                                    <input type="radio" name="approval-routing" checked={mode === o.id} onChange={() => chooseMode(o.id)} />
                                    <span style={{ fontSize:13, fontWeight:600, color:T.ink }}>{o.title}</span>
                                    <span style={{ fontSize:11.5, color:T.inkMuted }}>{o.sub}</span>
                                </label>
                            ))}
                            {!mode && (
                                <div style={{ fontSize:11.5, color:T.inkMid, fontFamily:T.sans }}>
                                    Not chosen yet — any Manager or Admin approves a tier that needs approval.
                                </div>
                            )}
                        </div>
                    </CSectionCard>

                    {/* Discount thresholds table */}
                    <CSectionCard
                        title="Discount thresholds"
                        description="When a quote's average discount crosses a threshold, it waits for that tier's approver before it can be sent. After the reminder time with no decision, the backup is emailed — or the approver again, with no backup."
                        headAction={
                            <button onClick={addTier} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                + Add tier
                            </button>
                        }
                    >
                        <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, overflow:'visible' }}>
                            <div style={{ display:'grid', gridTemplateColumns:grid, padding:'9px 14px', borderBottom:`1px solid ${T.border}`, background:T.surface2, gap:10, borderRadius:`${T.r+2}px ${T.r+2}px 0 0` }}>
                                {['Tier','Discount range','Approver','Backup','Reminder after',''].map((h,i) => (
                                    <div key={i} style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign: i===4 ? 'right' : 'left', fontFamily:T.sans }}>{h}</div>
                                ))}
                            </div>
                            {tiers.map((t,i) => {
                                const lo = i===0 ? 0 : tiers[i-1].maxDiscount;
                                const hi = i===tiers.length-1 ? 1 : t.maxDiscount;
                                const ef = editingField?.idx === i ? editingField.field : null;
                                const inpSt = { padding:'3px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface };
                                const [aKey, bKey] = keyOf(mode);
                                const approverValue = mode ? t[aKey] : null;
                                const choosing = needsChoice.has(t.id);
                                return (
                                    <div key={t.id} style={{ display:'grid', gridTemplateColumns:grid, padding:'12px 14px', gap:10, borderBottom: i<tiers.length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', background:T.surface, fontSize:13, fontFamily:T.sans, position:'relative' }}>
                                        {/* Tier label */}
                                        <div>
                                            {ef === 'label' ? (
                                                <input autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)}
                                                    onBlur={() => commitFieldEdit(i,'label',editingVal)}
                                                    onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'label',editingVal); if(e.key==='Escape') setEditingField(null); }}
                                                    style={{ ...inpSt, fontFamily:T.sans, fontWeight:700, width:'90%' }}/>
                                            ) : (
                                                <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                                                    <span style={{ width:10, height:10, background:t.color || TIER_COLORS[i % TIER_COLORS.length], borderRadius:2, flexShrink:0 }}/>
                                                    <b style={{ fontFamily:T.sans }}>{t.label}</b>
                                                </span>
                                            )}
                                        </div>

                                        {/* Discount range — the cap is edited from here or the menu */}
                                        <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.inkMid }}>
                                            {ef === 'maxDiscount' ? (
                                                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                                    <span>{Math.round(lo*100)}% – </span>
                                                    <input autoFocus type="number" min={Math.round(lo*100)+1} max={100} value={editingVal}
                                                        onChange={e => setEditingVal(e.target.value)}
                                                        onBlur={() => commitFieldEdit(i,'maxDiscount',editingVal)}
                                                        onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'maxDiscount',editingVal); if(e.key==='Escape') setEditingField(null); }}
                                                        style={{ ...inpSt, width:52 }}/>
                                                    <span>%</span>
                                                </div>
                                            ) : i === tiers.length - 1 ? (
                                                `${Math.round(lo*100)}% – 100%`
                                            ) : (
                                                <button onClick={() => startEdit(i,'maxDiscount',String(Math.round(hi*100)))} title="Change the discount cap"
                                                    style={{ background:'none', border:'none', padding:0, cursor:'pointer', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.inkMid, textDecoration:'underline dotted' }}>
                                                    {`${Math.round(lo*100)}% – ${Math.round(hi*100)}%`}
                                                </button>
                                            )}
                                        </div>

                                        {/* Approver */}
                                        <div>
                                            {mode ? (
                                                <ApproverSelect mode={mode} value={approverValue} people={people}
                                                    placeholder={choosing ? 'Choose an approver…' : 'No approval needed'} offerNone={choosing}
                                                    onChange={v => setApprover(i, v)} />
                                            ) : t.approver ? (
                                                <span style={{ fontSize:12, color:T.inkMid }}>Any Manager or Admin <span style={{ color:T.inkMuted }}>(was “{t.approver}”)</span></span>
                                            ) : (
                                                <span style={{ color:T.inkMuted, fontStyle:'italic', fontSize:12 }}>No approval needed</span>
                                            )}
                                        </div>

                                        {/* Backup — may act at any time */}
                                        <div>
                                            {mode ? (
                                                <ApproverSelect mode={mode} value={t[bKey]} people={people} placeholder="No backup"
                                                    exclude={approverValue} disabled={!approverValue} onChange={v => setBackup(i, v)} />
                                            ) : (
                                                <span style={{ color:T.inkMuted, fontSize:12 }}>—</span>
                                            )}
                                        </div>

                                        {/* SLA */}
                                        <div style={{ textAlign:'right', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>
                                            {ef === 'sla' ? (
                                                <input autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)}
                                                    onBlur={() => commitFieldEdit(i,'sla',editingVal)}
                                                    onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'sla',editingVal); if(e.key==='Escape') setEditingField(null); }}
                                                    style={{ ...inpSt, width:52, textAlign:'right' }} placeholder="8h"/>
                                            ) : t.sla || '—'}
                                        </div>

                                        {/* Kebab */}
                                        <div style={{ position:'relative', textAlign:'right' }} onClick={e => e.stopPropagation()}>
                                            <button onClick={() => setOpenTierMenu(openTierMenu===i ? null : i)} aria-label={`${t.label} actions`}
                                                style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:0, lineHeight:1 }}>⋯</button>
                                            {openTierMenu === i && (
                                                <div style={{ position:'absolute', right:0, zIndex:500, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 20px rgba(42,38,34,0.14)', minWidth:230, overflow:'hidden',
                                                    ...(i >= tiers.length - 2 ? { bottom:'100%', marginBottom:4 } : { top:'100%', marginTop:4 }) }}>
                                                    <MenuItem label="Edit name" sub="What the tier is called" onClick={() => startEdit(i,'label',t.label)} />
                                                    {i < tiers.length - 1 && <MenuItem label="Edit discount cap" sub={`Currently ${Math.round(hi*100)}%`} onClick={() => startEdit(i,'maxDiscount',String(Math.round(hi*100)))} />}
                                                    <MenuItem label="Edit reminder time" sub={`The backup is emailed after ${t.sla || '— not set'}`} onClick={() => startEdit(i,'sla',t.sla || '')} />
                                                    <MenuItem label="Insert tier above" sub={`Splits ${Math.round(lo*100)}–${Math.round(hi*100)}%: the new tier takes the lower half`} onClick={() => insertAbove(i)} />
                                                    {i < tiers.length - 1 && <MenuItem label="Insert tier below" sub="Splits the next band: the new tier takes its lower half" onClick={() => insertBelow(i)} />}
                                                    {tiers.length > 1 && <MenuItem label="Delete tier" sub="Remove this approval tier" onClick={() => deleteTier(i)} danger />}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CSectionCard>

                    {/* Approval ladder flow strip */}
                    <CSectionCard title="Approval ladder" description="How the tiers carve up the 0–100% discount range.">
                        <div>
                            <div style={{ display:'flex', height:28, borderRadius:T.r+1, overflow:'hidden', border:`1px solid ${T.border}` }}>
                                {(() => {
                                    let prev = 0;
                                    return tiers.map((t,i) => {
                                        const cap = i === tiers.length - 1 ? 1 : t.maxDiscount;
                                        const width = (cap - prev) * 100;
                                        prev = cap;
                                        return (
                                            <div key={t.id} style={{ flex:`${width} 0 0`, background:t.color || TIER_COLORS[i % TIER_COLORS.length], opacity:0.85, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:600, letterSpacing:0.2, borderRight: i<tiers.length-1 ? '1px solid rgba(255,255,255,0.3)' : 'none', overflow:'hidden', whiteSpace:'nowrap', padding:'0 6px' }}>
                                                {t.label}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                            <div style={{ position:'relative', height:14, marginTop:4 }}>
                                <span style={{ position:'absolute', left:0, fontSize:10, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', transform:'translateX(-50%)' }}>0%</span>
                                {tiers.map((t,i) => {
                                    const cap = i === tiers.length - 1 ? 1 : t.maxDiscount;
                                    return (
                                        <span key={t.id} style={{ position:'absolute', left:`${cap*100}%`, fontSize:10, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', transform:'translateX(-50%)' }}>
                                            {Math.round(cap*100)}%
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    </CSectionCard>
                </div>

                {/* ── RIGHT COLUMN ────────────────────────────────── */}
                <div>
                    <div style={{ position:'sticky', top:20 }}>
                        {/* Last 90 days — the record's (§0.156) */}
                        <CSectionCard title="Last 90 days" description="How approvals are flowing in practice.">
                            {statsLoading && (
                                <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans, padding:'8px 0' }}>Loading…</div>
                            )}
                            {!statsLoading && tiers.map((t,i) => {
                                // The server's, from the record (state §0.156): approved and
                                // sent back in 90 days, waiting now, hours to a decision.
                                const u = approvalStats?.find(s => s.tier === t.label) || { quotes:0, approved:0, sentBack:0, pending:0, avgHours:0 };
                                return (
                                    <div key={t.id} style={{ padding:'10px 0', borderBottom: i<tiers.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                                            <QPill tone={toneForIdx(i)}>{t.label}</QPill>
                                            <div style={{ flex:1 }}/>
                                            <span style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:14, color:T.ink }}>{u.quotes}</span>
                                            <span style={{ fontSize:10, color:T.inkMuted, fontFamily:T.sans }}>quotes</span>
                                        </div>
                                        <div style={{ fontSize:11, color:T.inkMid, display:'flex', gap:12, fontFamily:T.sans }}>
                                            <span>✓ {u.approved}</span>
                                            {u.sentBack > 0 && <span style={{ color:T.warn }}>↩ {u.sentBack} sent back</span>}
                                            {u.pending  > 0 && <span style={{ color:T.warn }}>● {u.pending} pending</span>}
                                            {u.avgHours > 0 && <span style={{ marginLeft:'auto', color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>~{u.avgHours}h avg</span>}
                                        </div>
                                    </div>
                                );
                            })}
                            {!statsLoading && approvalStats && approvalStats.every(s => s.quotes === 0) && (
                                <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans, padding:'8px 0' }}>No approval activity in the last 90 days.</div>
                            )}
                        </CSectionCard>

                        {/* Try a discount — which tier, and who approves it */}
                        <CSectionCard title="Try a discount" description="Which tier a quote at this average discount falls in, and who approves it.">
                            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                                <NumStep value={trialDiscount} onChange={setTrialDiscount} suffix="%" min={0} max={100}/>
                                <div style={{ padding:'12px 14px', background:`${trialTier.color || T.inkMid}1a`, border:`1.5px solid ${trialTier.color || T.inkMid}`, borderRadius:T.r+2 }}>
                                    <div style={{ fontSize:10, fontWeight:700, color:trialTier.color || T.inkMid, letterSpacing:0.8, textTransform:'uppercase', fontFamily:T.sans, marginBottom:6 }}>Falls in</div>
                                    <div style={{ fontSize:14, fontWeight:700, color:trialTier.color || T.ink, fontFamily:T.sans }}>{trialTier.label}</div>
                                    <div style={{ fontSize:11, color:T.inkMid, marginTop:4, fontFamily:T.sans }}>
                                        {trialWho ? `Approved by ${trialWho}.` : 'Within the rep\'s discretion — no approval needed.'}
                                    </div>
                                </div>
                            </div>
                        </CSectionCard>
                    </div>
                </div>
            </div>
        </CategoryDetailChrome>
    );
};
