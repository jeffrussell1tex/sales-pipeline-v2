// settings/audit/AuditDetail.jsx
import React, { useState, useEffect, useRef } from 'react';
import { dbFetch } from '../../../utils/storage';
import { putSettings } from '../shared/saveSettings.js';
import { T } from '../shared/tokens.js';
import { SecCrumb, SecTitle, SecBtn, DropdownPanel, DropdownOption, PolicySelect } from '../security/shared.jsx';

const auditCatTone = (cat) => {
    if (cat === 'auth')     return 'info';
    if (cat === 'security') return 'warn';
    return 'neutral';
};

const auditCatStyle = (cat) => {
    const t = auditCatTone(cat);
    if (t === 'info')    return { bg:'rgba(58,90,122,0.10)',   fg:T.info };
    if (t === 'warn')    return { bg:'rgba(184,115,51,0.12)',  fg:T.warn };
    return { bg:'rgba(138,131,120,0.12)', fg:T.inkMid };
};

const SEC_AUDIT_EVENTS = [
    { when:'just now',     actor:'System',                action:'backup.completed',       target:'workspace',                   cat:'admin',    sev:'info',  ip:'—' },
    { when:'4 minutes ago',actor:'jeff@accelerep.com',    action:'user.invited',            target:'devon@accelerep.com',          cat:'admin',    sev:'info',  ip:'99.121.40.218' },
    { when:'12 minutes ago',actor:'priya@accelerep.com',  action:'pipeline.stage_edited',   target:'Stage "Demo"',                 cat:'data',     sev:'info',  ip:'45.287.55.188' },
    { when:'1 hour ago',   actor:'morgan@accelerep.com',  action:'apikey.created',          target:'Zapier production',            cat:'security', sev:'warn',  ip:'75.222.84.12' },
    { when:'3 hours ago',  actor:'jeff@accelerep.com',    action:'pricebook.edited',        target:'Enterprise plan — $/seat',    cat:'data',     sev:'info',  ip:'99.121.40.218' },
    { when:'4 hours ago',  actor:'theo@accelerep.com',    action:'login.failed',            target:'self — MFA wrong code',        cat:'auth',     sev:'warn',  ip:'24.18.86.44' },
    { when:'6 hours ago',  actor:'morgan@accelerep.com',  action:'webhook.created',         target:'Acme billing reconcile',       cat:'security', sev:'info',  ip:'75.222.84.12' },
    { when:'yesterday',    actor:'jeff@accelerep.com',    action:'role.permission_changed',  target:'Sales Rep · Quotes:edit',     cat:'admin',    sev:'warn',  ip:'99.121.40.218' },
    { when:'2 days ago',   actor:'morgan@accelerep.com',  action:'sso.test_login_failed',   target:'morgan@accelerep.com',         cat:'auth',     sev:'warn',  ip:'75.222.84.12' },
    { when:'3 days ago',   actor:'jeff@accelerep.com',    action:'mfa.policy_changed',      target:'Optional → Required (admins)', cat:'auth',     sev:'info',  ip:'99.121.40.218' },
    { when:'5 days ago',   actor:'System',                action:'apikey.revoked',          target:'Legacy webhook poller',        cat:'security', sev:'info',  ip:'—' },
    { when:'1 week ago',   actor:'priya@accelerep.com',   action:'territory.created',       target:'EMEA - mid-market',            cat:'admin',    sev:'info',  ip:'45.287.55.188' },
];

const AuditCategoryDropdown = ({ value, onChange }) => (
    <DropdownPanel width={260}>
        <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>Category</div>
        <DropdownOption label="All categories" sub="No filter applied" selected={value==='All categories'} onClick={() => onChange('All categories')}/>
        <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
        {[
            { v:'auth',     sub:'Login, MFA, SSO' },
            { v:'security', sub:'API keys, webhooks, allowlist' },
            { v:'admin',    sub:'Users, roles, territories' },
            { v:'data',     sub:'Pricebook, pipeline, custom fields' },
            { v:'billing',  sub:'Plan, seats, invoices' },
        ].map(c => (
            <DropdownOption key={c.v} label={c.v} sub={c.sub} selected={value===c.v} onClick={() => onChange(c.v)}/>
        ))}
        <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
        <DropdownOption label="Severity: warn only" sub="Across all categories" selected={value==='warn'} onClick={() => onChange('warn')}/>
    </DropdownPanel>
);

const AuditActorDropdown = ({ value, onChange, events = [] }) => {
    const actors = ['All actors', ...new Set(events.map(e => e.actor).filter(Boolean))].filter((v,i,a) => a.indexOf(v) === i);
    const [q, setQ] = React.useState('');
    const filtered = q ? actors.filter(a => a.toLowerCase().includes(q.toLowerCase())) : actors;
    return (
        <DropdownPanel width={300}>
            <div style={{ padding:'6px 8px 8px' }}>
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search actor…"
                    style={{ width:'100%', padding:'6px 8px', background:T.surface2, border:`1px solid ${T.border}`,
                        borderRadius:3, fontSize:11.5, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace',
                        outline:'none', boxSizing:'border-box' }}/>
            </div>
            <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>Top actors · last 30d</div>
            {filtered.map(a => (
                <DropdownOption key={a} label={a} selected={value===a} onClick={() => onChange(a)}/>
            ))}
        </DropdownPanel>
    );
};

const AuditTimeDropdown = ({ value, onChange }) => {
    const ranges = [
        { v:'Last 1 hour',    sub:null },
        { v:'Last 24 hours',  sub:null },
        { v:'Last 7 days',    sub:'Current' },
        { v:'Last 30 days',   sub:null },
        { v:'Last 90 days',   sub:'Covered by retention', rec:true },
        { v:'Last 13 months', sub:'Full retention window' },
    ];
    return (
        <DropdownPanel width={280}>
            <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>Time range</div>
            {ranges.map(r => (
                <DropdownOption key={r.v} label={r.v} sub={r.sub} recommended={r.rec} selected={value===r.v} onClick={() => onChange(r.v)}/>
            ))}
            <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
            <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>Custom</div>
            <div style={{ padding:'4px 10px 10px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                <input type="date" style={{ padding:'6px 8px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:3, fontSize:11, fontFamily:'ui-monospace,Menlo,monospace', color:T.inkMuted, outline:'none' }}/>
                <input type="date" style={{ padding:'6px 8px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:3, fontSize:11, fontFamily:'ui-monospace,Menlo,monospace', color:T.inkMuted, outline:'none' }}/>
            </div>
        </DropdownPanel>
    );
};

const AuditExportDropdown = ({ events, onClose }) => {
    const download = (fmt) => {
        let content, mime, ext;
        if (fmt === 'JSON') {
            content = JSON.stringify(events, null, 2);
            mime = 'application/json'; ext = 'json';
        } else if (fmt === 'NDJSON') {
            content = events.map(e => JSON.stringify(e)).join(String.fromCharCode(10));
            mime = 'application/x-ndjson'; ext = 'ndjson';
        } else {
            // CSV
            const cols = ['when','actor','action','target','cat','sev','ip'];
            const header = cols.join(',');
            const esc = (v) => '"' + String(v||'').replace(/"/g, '""') + '"';
            const rows = events.map(e => cols.map(c => esc(e[c])).join(','));
            content = [header, ...rows].join(String.fromCharCode(13)+String.fromCharCode(10));
            mime = 'text/csv'; ext = 'csv';
        }
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `accelerep-audit-${new Date().toISOString().split('T')[0]}.${ext}`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        onClose();
    };
    return (
        <DropdownPanel width={280}>
            <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>Download current view</div>
            <DropdownOption label="CSV" selected sub={`${events.length} events · spreadsheet-friendly`} onClick={() => download('CSV')}/>
            <DropdownOption label="JSON" sub="Full event payload" onClick={() => download('JSON')}/>
            <DropdownOption label="NDJSON" sub="One event per line · for log tools" onClick={() => download('NDJSON')}/>
            <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
            <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>Larger exports</div>
            <DropdownOption label="Export all 12,847 events…" sub="Async — emailed when ready" onClick={onClose}/>
            <DropdownOption label="Schedule recurring export…" sub="Daily / weekly to S3 or email" onClick={onClose}/>
        </DropdownPanel>
    );
};

const AuditEventPopover = ({ event, onClose, onAddFilter }) => {
    const sevColor = event.sev === 'warn' ? T.warn : event.sev === 'error' ? T.danger : T.ok;
    const facets = [
        { lbl:'actor',  val: event.actor },
        { lbl:'action', val: event.action },
        { lbl:'cat',    val: event.cat },
        { lbl:'ip',     val: event.ip !== '—' ? event.ip : null },
    ].filter(f => f.val);

    const related = SEC_AUDIT_EVENTS.filter(e =>
        e.actor === event.actor && e !== event
    ).slice(0, 3);

    return (
        <div style={{ width:360, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:4,
            boxShadow:'0 8px 24px rgba(42,38,34,0.12), 0 2px 4px rgba(42,38,34,0.06)', fontFamily:T.sans, overflow:'hidden' }}>
            <div style={{ padding:'14px 16px 12px', borderBottom:`1px solid ${T.border}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{ width:8, height:8, background:sevColor, borderRadius:'50%', flexShrink:0 }}/>
                    <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:13.5, fontWeight:700, color:sevColor, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{event.action}</span>
                    <span style={{ fontSize:10.5, color:T.inkMuted, flexShrink:0 }}>{event.when}</span>
                </div>
                <div style={{ fontSize:12, color:T.ink, lineHeight:1.5 }}>
                    <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontWeight:600 }}>{event.actor}</span>
                    {event.target && <><span style={{ color:T.inkMid }}> → </span><span style={{ fontWeight:600 }}>{event.target}</span></>}
                </div>
            </div>
            {/* Facet chips */}
            <div style={{ padding:'10px 12px 6px', display:'flex', gap:6, flexWrap:'wrap' }}>
                {facets.map((c,i) => (
                    <span key={i} onClick={() => { onAddFilter && onAddFilter(c.lbl, c.val); onClose(); }}
                        style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:12, fontSize:11,
                            background:T.surface2, border:`1px solid ${T.border}`, color:T.inkMid, cursor:'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = T.borderStrong}
                        onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                        <span style={{ color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', fontSize:10 }}>{c.lbl}:</span>
                        <span style={{ fontFamily:'ui-monospace,Menlo,monospace' }}>{c.val}</span>
                        <span style={{ color:T.inkMuted, marginLeft:2, fontSize:10 }}>+</span>
                    </span>
                ))}
            </div>
            {/* Related events */}
            {related.length > 0 && (
                <div style={{ padding:'8px 16px 12px' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:6, fontFamily:T.sans }}>Related · same actor</div>
                    {related.map((r,i) => (
                        <div key={i} style={{ display:'flex', gap:8, padding:'4px 0', fontSize:11.5, alignItems:'baseline' }}>
                            <span style={{ width:76, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', fontSize:10.5, flexShrink:0 }}>{r.when}</span>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontWeight:600, color:T.ink, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.action}</span>
                        </div>
                    ))}
                </div>
            )}
            <div style={{ padding:'10px 16px', borderTop:`1px solid ${T.border}`, background:T.surface2, display:'flex', gap:8 }}>
                <button onClick={() => { navigator.clipboard?.writeText(event.action + ' · ' + event.when); onClose(); }}
                    style={{ fontSize:11.5, fontWeight:600, color:T.inkMid, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>Copy event ID</button>
                <span style={{ flex:1 }}/>
                <SecBtn label="View full event" onClick={onClose}/>
            </div>
        </div>
    );
};

const AuditEventRowMenu = ({ event, onViewDetails, onFilterAction, onCreateAlert, onClose }) => {
    const MenuRow = ({ icon, label, kbd, onClick }) => (
        <div onClick={() => { onClick && onClick(); onClose(); }}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:3, cursor:'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,185,154,0.10)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ width:16, textAlign:'center', fontSize:13, flexShrink:0 }}>{icon}</span>
            <span style={{ flex:1, fontSize:12.5, fontWeight:500, color:T.ink }}>{label}</span>
            {kbd && <span style={{ fontSize:10.5, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', flexShrink:0 }}>{kbd}</span>}
        </div>
    );
    return (
        <div style={{ width:208, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:4,
            boxShadow:'0 8px 24px rgba(42,38,34,0.12), 0 2px 4px rgba(42,38,34,0.06)', padding:4, fontFamily:T.sans }}>
            <div style={{ position:'absolute', top:-6, right:10, width:12, height:12,
                background:T.surface, border:`1px solid ${T.borderStrong}`,
                borderRight:'none', borderBottom:'none', transform:'rotate(45deg)' }}/>
            <MenuRow icon="◫" label="View details" kbd="↵" onClick={onViewDetails}/>
            <MenuRow icon="⌕" label="Investigate actor" onClick={() => onFilterAction && onFilterAction('actor', event.actor)}/>
            <MenuRow icon="≡" label="Filter to this action" onClick={() => onFilterAction && onFilterAction('action', event.action)}/>
            <MenuRow icon="⚠" label="Create alert from event" onClick={onCreateAlert}/>
            <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
            <MenuRow icon="⎘" label="Copy event ID" kbd="⌘C" onClick={() => navigator.clipboard?.writeText(event.action)}/>
        </div>
    );
};

const AuditDestRowMenu = ({ dest, onRemove, onClose }) => {
    const MenuRow = ({ icon, label, danger:isDanger, onClick }) => (
        <div onClick={() => { onClick && onClick(); onClose(); }}
            style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', borderRadius:3, cursor:'pointer', color: isDanger ? T.danger : T.ink }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(200,185,154,0.10)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <span style={{ width:16, textAlign:'center', fontSize:13, flexShrink:0 }}>{icon}</span>
            <span style={{ flex:1, fontSize:12.5, fontWeight:500 }}>{label}</span>
        </div>
    );
    return (
        <div style={{ width:196, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:4,
            boxShadow:'0 8px 24px rgba(42,38,34,0.12), 0 2px 4px rgba(42,38,34,0.06)', padding:4, fontFamily:T.sans, position:'relative' }}>
            <div style={{ position:'absolute', top:-6, right:10, width:12, height:12,
                background:T.surface, border:`1px solid ${T.borderStrong}`,
                borderRight:'none', borderBottom:'none', transform:'rotate(45deg)' }}/>
            <MenuRow icon="✎" label="Edit" onClick={() => {}}/>
            <MenuRow icon="↻" label="Send test event" onClick={() => {}}/>
            <MenuRow icon="⏸" label="Pause" onClick={() => {}}/>
            <MenuRow icon="⌕" label="Delivery log" onClick={() => {}}/>
            <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
            <MenuRow icon="🗑" label="Remove" danger onClick={() => onRemove && onRemove(dest)}/>
        </div>
    );
};

const AuditAnchoredMenu = ({ children, btnRef, onClose, alignRight=true }) => {
    const ref    = React.useRef(null);
    const [style, setStyle] = React.useState({ position:'fixed', zIndex:9999, top:-9999, left:-9999, visibility:'hidden' });

    // Two-pass positioning: measure after first render, then lock position
    const positionedRef = React.useRef(false);
    React.useLayoutEffect(() => {
        if (!btnRef?.current || !ref.current) return;
        if (positionedRef.current) return; // already positioned — don't re-run
        positionedRef.current = true;
        const r       = btnRef.current.getBoundingClientRect();
        const menuH   = ref.current.offsetHeight || 320;
        const menuW   = ref.current.offsetWidth  || 260;
        const vw      = window.innerWidth;
        const vh      = window.innerHeight;
        const GAP     = 4;
        const EDGE    = 8;

        // Vertical: prefer below button, flip above if it clips the bottom
        const topBelow  = r.bottom + GAP;
        const topAbove  = r.top - menuH - GAP;
        const top = (topBelow + menuH > vh - EDGE) ? Math.max(EDGE, topAbove) : topBelow;

        // Horizontal: prefer right-anchor (right edge of menu = right edge of button)
        // Fall back to left-anchor if that would clip
        let computed;
        if (alignRight) {
            const leftIfRightAnchored = r.right - menuW;
            if (leftIfRightAnchored < EDGE) {
                // Would clip left — anchor left side of menu to left side of button instead
                computed = { left: Math.max(EDGE, r.left) };
            } else {
                computed = { right: Math.max(EDGE, vw - r.right) };
            }
        } else {
            const rightIfLeftAnchored = r.left + menuW;
            if (rightIfLeftAnchored > vw - EDGE) {
                computed = { right: EDGE };
            } else {
                computed = { left: Math.max(EDGE, r.left) };
            }
        }

        setStyle({ position:'fixed', zIndex:9999, top, ...computed, visibility:'visible' });
    });

    React.useEffect(() => {
        const onDoc = (e) => {
            if (ref.current && !ref.current.contains(e.target) &&
                btnRef?.current && !btnRef.current.contains(e.target)) onClose();
        };
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
    }, []);

    return (
        <div ref={ref} style={style}>
            {children}
        </div>
    );
};

const ManageAlertsModal = ({ alertCount, onClose }) => {
    const [alerts, setAlerts] = React.useState([
        { id:1, name:'Failed login spike',      condition:'login.failed > 5 in 10 min',      channel:'Email + Slack', active:true  },
        { id:2, name:'API key created',         condition:'action = apikey.created',          channel:'Email',         active:true  },
        { id:3, name:'Role permission changed', condition:'action = role.permission_changed',  channel:'Email',         active:true  },
        { id:4, name:'MFA disabled',            condition:'action = mfa.disabled',            channel:'Email + Slack', active:false },
    ]);
    const [showNew,    setShowNew]    = React.useState(false);
    const [newName,    setNewName]    = React.useState('');
    const [newCond,    setNewCond]    = React.useState('');
    const [newChannel, setNewChannel] = React.useState('Email');
    const [confirmDel, setConfirmDel] = React.useState(null); // id to confirm delete

    const toggleAlert  = (id) => setAlerts(prev => prev.map(a => a.id === id ? {...a, active:!a.active} : a));
    const deleteAlert  = (id) => { setAlerts(prev => prev.filter(a => a.id !== id)); setConfirmDel(null); };
    const addAlert     = () => {
        if (!newName.trim() || !newCond.trim()) return;
        setAlerts(prev => [...prev, { id: Date.now(), name:newName.trim(), condition:newCond.trim(), channel:newChannel, active:true }]);
        setNewName(''); setNewCond(''); setShowNew(false);
    };

    const inpSt = { padding:'6px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, width:'100%', boxSizing:'border-box' };
    const rowSt = { display:'grid', gridTemplateColumns:'1fr 1fr 110px 52px 36px', gap:10, padding:'10px 16px', alignItems:'center', borderBottom:`1px solid ${T.border}`, fontFamily:T.sans };

    return (
        <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.40)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background:T.surface, borderRadius:8, width:740, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 56px rgba(20,16,12,0.28)', maxHeight:'85vh' }}>
                {/* Header */}
                <div style={{ padding:'16px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                        <div style={{ fontSize:16, fontWeight:700, color:T.ink }}>Manage alerts</div>
                        <div style={{ fontSize:12, color:T.inkMuted, marginTop:2 }}>{alertCount} alert{alertCount!==1?'s':''} triggered today · rules fire on matching audit events</div>
                    </div>
                    <button onClick={onClose} style={{ background:'none', border:'none', color:T.inkMuted, fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
                </div>

                {/* Table */}
                <div style={{ flex:1, overflowY:'auto' }}>
                    {/* Header row */}
                    <div style={{ ...rowSt, background:T.surface2, borderTop:'none', padding:'8px 16px' }}>
                        {['RULE NAME','CONDITION','CHANNEL','ON',''].map((h,i) => (
                            <div key={i} style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase' }}>{h}</div>
                        ))}
                    </div>

                    {alerts.map(a => (
                        <div key={a.id} style={rowSt}>
                            <span style={{ fontSize:13, fontWeight:600, color:T.ink }}>{a.name}</span>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, color:T.inkMid, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.condition}</span>
                            <span style={{ fontSize:12, color:T.inkMid }}>{a.channel}</span>
                            {/* Toggle */}
                            <div onClick={() => toggleAlert(a.id)}
                                style={{ width:30, height:18, borderRadius:9, background:a.active?T.ok:T.border, position:'relative', cursor:'pointer', transition:'background 120ms', flexShrink:0 }}>
                                <span style={{ position:'absolute', top:2, left:a.active?14:2, width:14, height:14, borderRadius:'50%', background:'#fbf8f3', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 100ms' }}/>
                            </div>
                            {/* Delete */}
                            {confirmDel === a.id ? (
                                <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                                    <button onClick={() => deleteAlert(a.id)}
                                        style={{ fontSize:10, fontWeight:700, color:'#fbf8f3', background:T.danger, border:'none', borderRadius:3, padding:'2px 6px', cursor:'pointer', fontFamily:T.sans }}>Del</button>
                                    <button onClick={() => setConfirmDel(null)}
                                        style={{ fontSize:10, color:T.inkMid, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>✕</button>
                                </div>
                            ) : (
                                <button onClick={() => setConfirmDel(a.id)}
                                    title="Delete rule"
                                    style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:24, height:24, borderRadius:4, border:`1px solid ${T.border}`, background:'none', color:T.inkMuted, cursor:'pointer', fontSize:13, fontFamily:T.sans, flexShrink:0 }}>
                                    🗑
                                </button>
                            )}
                        </div>
                    ))}

                    {/* New rule inline form */}
                    {showNew && (
                        <div style={{ ...rowSt, background:'rgba(200,185,154,0.08)', borderTop:`1px solid ${T.border}` }}>
                            <input value={newName} onChange={e => setNewName(e.target.value)}
                                placeholder="Rule name…" style={inpSt} autoFocus/>
                            <input value={newCond} onChange={e => setNewCond(e.target.value)}
                                placeholder="e.g. action = login.failed" style={{ ...inpSt, fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}
                                onKeyDown={e => { if (e.key === 'Enter') addAlert(); if (e.key === 'Escape') setShowNew(false); }}/>
                            <select value={newChannel} onChange={e => setNewChannel(e.target.value)}
                                style={{ ...inpSt, appearance:'none', cursor:'pointer' }}>
                                <option>Email</option>
                                <option>Slack</option>
                                <option>Email + Slack</option>
                            </select>
                            <div style={{ display:'flex', gap:6 }}>
                                <button onClick={addAlert} disabled={!newName.trim() || !newCond.trim()}
                                    style={{ fontSize:11, fontWeight:700, color:'#fbf8f3', background:T.ok, border:'none', borderRadius:3, padding:'4px 8px', cursor:'pointer', fontFamily:T.sans, opacity:(!newName.trim()||!newCond.trim())?0.5:1 }}>Add</button>
                                <button onClick={() => setShowNew(false)}
                                    style={{ fontSize:11, color:T.inkMid, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>✕</button>
                            </div>
                            <div/>
                        </div>
                    )}

                    {alerts.length === 0 && !showNew && (
                        <div style={{ padding:'32px', textAlign:'center', color:T.inkMuted, fontSize:13, fontFamily:T.sans }}>No alert rules. Add one below.</div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding:'12px 20px', borderTop:`1px solid ${T.border}`, background:T.surface2, display:'flex', gap:8, justifyContent:'space-between', alignItems:'center' }}>
                    <button onClick={() => { setShowNew(true); setConfirmDel(null); }}
                        style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 12px', background:'none',
                            border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600,
                            color:T.ink, cursor:'pointer', fontFamily:T.sans }}>
                        + New alert rule
                    </button>
                    <SecBtn label="Done" primary onClick={onClose}/>
                </div>
            </div>
        </div>
    );
};

const AddDestinationModal = ({ onClose, onSave }) => {
    const [dest,   setDest]   = React.useState('');
    const [url,    setUrl]    = React.useState('');
    const [fmt,    setFmt]    = React.useState('JSON');
    const [saving, setSaving] = React.useState(false);
    const [err,    setErr]    = React.useState('');

    const PRESET_DESTS = [
        { label:'Datadog Logs',   url:'https://http-intake.logs.datadoghq.com/api/v/logs',  fmt:'JSON' },
        { label:'Splunk HEC',     url:'https://splunk.example.com:8088/services/collector', fmt:'JSON' },
        { label:'S3 archive',     url:'s3://your-bucket/accelerep-audit/',                  fmt:'NDJSON.gz' },
        { label:'SIEM webhook',   url:'https://siem.example.com/ingest',                    fmt:'JSON' },
    ];

    const inpSt = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' };
    const FL = ({ label:lbl, hint, children }) => (
        <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5, fontFamily:T.sans }}>{lbl}</label>
            {children}
            {hint && <div style={{ fontSize:11, color:T.inkMuted, marginTop:4, fontFamily:T.sans }}>{hint}</div>}
        </div>
    );

    const handleSave = async () => {
        if (!dest.trim()) { setErr('Destination name is required'); return; }
        if (!url.trim())  { setErr('Endpoint URL is required'); return; }
        setSaving(true);
        const newDest = { dest: dest.trim(), url: url.trim(), fmt, status:'Active', lastDelivered:'Never' };
        await onSave(newDest);
        setSaving(false);
    };

    return (
        <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.40)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background:T.surface, borderRadius:8, width:540, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 56px rgba(20,16,12,0.28)' }}>
                <div style={{ padding:'16px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                        <div style={{ fontSize:16, fontWeight:700, color:T.ink }}>Add streaming destination</div>
                        <div style={{ fontSize:12, color:T.inkMuted, marginTop:2 }}>Audit events will be forwarded in real-time</div>
                    </div>
                    <button onClick={onClose} style={{ background:'none', border:'none', color:T.inkMuted, fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
                </div>
                <div style={{ padding:'18px 20px' }}>
                    {/* Presets */}
                    <div style={{ fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:8, fontFamily:T.sans }}>Quick presets</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
                        {PRESET_DESTS.map(p => (
                            <button key={p.label} onClick={() => { setDest(p.label); setUrl(p.url); setFmt(p.fmt); }}
                                style={{ padding:'5px 10px', fontSize:12, fontWeight:500, background:dest===p.label?T.ink:T.surface2,
                                    color:dest===p.label?'#fbf8f3':T.inkMid, border:`1px solid ${dest===p.label?T.ink:T.border}`,
                                    borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <FL label="Destination name">
                        <input value={dest} onChange={e => { setDest(e.target.value); setErr(''); }} placeholder="e.g. Datadog production" style={{ ...inpSt, fontFamily:T.sans }}/>
                    </FL>
                    <FL label="Endpoint URL" hint="HTTP/HTTPS URL or s3:// path">
                        <input value={url} onChange={e => { setUrl(e.target.value); setErr(''); }} placeholder="https://..." style={inpSt}/>
                    </FL>
                    <FL label="Format">
                        <div style={{ display:'flex', gap:8 }}>
                            {['JSON','NDJSON','NDJSON.gz'].map(f => (
                                <button key={f} onClick={() => setFmt(f)}
                                    style={{ flex:1, padding:'8px 0', fontSize:12.5, fontWeight:600, textAlign:'center',
                                        background:fmt===f?T.ink:T.surface2, color:fmt===f?'#fbf8f3':T.inkMid,
                                        border:`1px solid ${fmt===f?T.ink:T.border}`, borderRadius:T.r, cursor:'pointer',
                                        fontFamily:'ui-monospace,Menlo,monospace' }}>
                                    {f}
                                </button>
                            ))}
                        </div>
                    </FL>
                    {err && <div style={{ fontSize:12, color:T.danger, fontFamily:T.sans, marginBottom:8 }}>{err}</div>}
                    <div style={{ padding:'10px 12px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:4, fontSize:12, color:T.inkMid, fontFamily:T.sans }}>
                        Events are forwarded with HMAC-SHA256 signatures. Verify the <code>X-Accelerep-Signature</code> header on your endpoint.
                    </div>
                </div>
                <div style={{ padding:'12px 20px', borderTop:`1px solid ${T.border}`, background:T.surface2, display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <SecBtn label="Cancel" onClick={onClose}/>
                    <SecBtn label={saving?'Adding…':'Add destination'} primary onClick={handleSave} disabled={saving}/>
                </div>
            </div>
        </div>
    );
};

// Module scope. Declared inside ConfigureStreamingPopover it was a new component
// type on every render, so changing one setting remounted every <select> in the
// popover — closing any open dropdown mid-choice. It reads only props and the
// module-level tokens, so nothing needed re-threading.
const SSelect = ({ value, options, onChange, width=130 }) => (
    <select value={value} onChange={e => onChange(e.target.value)}
        style={{ padding:'4px 8px', background:T.surface, border:`1px solid ${T.borderStrong}`,
            borderRadius:T.r, fontSize:11.5, color:T.ink, outline:'none', cursor:'pointer',
            fontFamily:T.sans, minWidth:width, appearance:'none' }}>
        {options.map(o => <option key={o}>{o}</option>)}
    </select>
);

const ConfigureStreamingPopover = ({ streams, streamError, onClose, onAddDest, onTogglePause, onRemoveDest, onSaveGlobals, btnRef }) => {
    const ref = React.useRef(null);
    const posRef = React.useRef(false);
    const [style, setStyle] = React.useState({ position:'fixed', zIndex:9999, top:-9999, left:-9999, visibility:'hidden' });
    const [globalsOpen, setGlobalsOpen] = React.useState(false);
    const [globals, setGlobals] = React.useState({
        retention:  '13 months',
        redactPII:  true,
        signing:    'hmac-sha256',
        onFailure:  'Buffer & retry',
    });

    // Two-pass positioning — same pattern as AuditAnchoredMenu
    React.useLayoutEffect(() => {
        if (!btnRef?.current || !ref.current || posRef.current) return;
        posRef.current = true;
        const r    = btnRef.current.getBoundingClientRect();
        const menuW = ref.current.offsetWidth  || 480;
        const menuH = ref.current.offsetHeight || 400;
        const vw   = window.innerWidth;
        const vh   = window.innerHeight;
        const GAP  = 6;
        const EDGE = 8;
        const top  = (r.bottom + GAP + menuH > vh - EDGE)
            ? Math.max(EDGE, r.top - menuH - GAP)
            : r.bottom + GAP;
        // Left-anchor (aligns to button left edge), clamp if it would overflow right
        const left = Math.min(r.left, vw - menuW - EDGE);
        setStyle({ position:'fixed', zIndex:9999, top, left: Math.max(EDGE, left), visibility:'visible' });
    });

    React.useEffect(() => {
        const onDoc = (e) => {
            if (ref.current && !ref.current.contains(e.target) &&
                btnRef?.current && !btnRef.current.contains(e.target)) onClose();
        };
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown',   onKey);
        return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
    }, []);

    const activeCount  = streams.filter(s => s.status === 'Active'  && !s.paused).length;
    const failingCount = streams.filter(s => s.status === 'Failing').length;

    const SRow = ({ label, sub, control, divider=true }) => (
        <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:16, alignItems:'center',
            padding:'10px 16px', borderBottom:divider?`1px solid ${T.border}`:'none' }}>
            <div>
                <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{label}</div>
                {sub && <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:2, lineHeight:1.4, fontFamily:T.sans }}>{sub}</div>}
            </div>
            {control}
        </div>
    );

    const SToggle = ({ on, onChange }) => (
        <div onClick={onChange}
            style={{ width:32, height:18, borderRadius:9, background:on?T.ok:T.borderStrong,
                position:'relative', cursor:'pointer', transition:'background 120ms', flexShrink:0 }}>
            <span style={{ position:'absolute', top:2, left:on?16:2, width:14, height:14, borderRadius:'50%',
                background:'#fbf8f3', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 100ms' }}/>
        </div>
    );

    return (
        <div ref={ref} style={style}>
            {/* Pointer caret */}
            <div style={{ position:'absolute', top:-7, left:32, width:12, height:12,
                background:T.surface, border:`1px solid ${T.borderStrong}`,
                borderRight:'none', borderBottom:'none', transform:'rotate(45deg)', zIndex:1 }}/>

            <div style={{ width:480, background:T.surface, border:`1px solid ${T.borderStrong}`,
                borderRadius:8, boxShadow:'0 8px 28px rgba(42,38,34,0.14), 0 2px 4px rgba(42,38,34,0.06)',
                fontFamily:T.sans, overflow:'hidden' }}>

                {/* Header */}
                <div style={{ padding:'13px 16px 11px', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                        <span style={{ fontSize:14, fontWeight:700, color:T.ink }}>Streaming destinations</span>
                        <span style={{ flex:1 }}/>
                        <span style={{ fontSize:10.5, color:T.inkMuted }}>
                            {activeCount} active{failingCount > 0 ? ` · ${failingCount} failing` : ''}
                        </span>
                        <button onClick={onClose} style={{ background:'none', border:'none', color:T.inkMuted, fontSize:18, cursor:'pointer', lineHeight:1, padding:0 }}>×</button>
                    </div>
                    <div style={{ fontSize:11, color:T.inkMid, lineHeight:1.5 }}>
                        Toggle a row to pause its stream. Events buffer for 24h while paused.
                    </div>
                </div>

                {/* A failed save must be visible here, not only in the console. The
                    optimistic state is reverted alongside this, so what is on screen
                    always matches what is stored. */}
                {streamError && (
                    <div style={{ padding:'9px 16px', background:'rgba(156,58,46,0.08)',
                        borderBottom:`1px solid ${T.border}`, color:T.danger,
                        fontSize:11.5, lineHeight:1.5 }}>
                        {streamError}
                    </div>
                )}

                {/* Destination rows */}
                <div>
                    {streams.length === 0 ? (
                        <div style={{ padding:'24px 16px', textAlign:'center', color:T.inkMuted, fontSize:13 }}>
                            No destinations configured. Add one below.
                        </div>
                    ) : streams.map((s, i) => {
                        const isActive  = s.status === 'Active'  && !s.paused;
                        const isFailing = s.status === 'Failing';
                        const dotColor  = s.paused ? T.inkMuted : isFailing ? T.warn : T.ok;
                        return (
                            <div key={s.dest || i} style={{ display:'grid', gridTemplateColumns:'14px 1fr auto auto',
                                gap:10, alignItems:'center', padding:'10px 16px',
                                borderBottom:`1px solid ${T.border}` }}>
                                {/* Status dot */}
                                <span style={{ width:8, height:8, borderRadius:'50%', background:dotColor,
                                    boxShadow:isFailing && !s.paused ? `0 0 0 3px ${T.warn}33` : 'none',
                                    flexShrink:0 }}/>
                                <div style={{ minWidth:0 }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                                        <span style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{s.dest}</span>
                                        <span style={{ padding:'1px 5px', borderRadius:3, fontSize:10, fontWeight:700,
                                            background:'rgba(138,131,120,0.12)', color:T.inkMid,
                                            fontFamily:'ui-monospace,Menlo,monospace' }}>{s.fmt}</span>
                                        {s.paused && <span style={{ fontSize:9.5, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.5 }}>paused</span>}
                                    </div>
                                    <div style={{ fontSize:10.5, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace',
                                        overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.url}</div>
                                    <div style={{ fontSize:10, color:isFailing && !s.paused ? T.warn : T.inkMuted, marginTop:2 }}>
                                        {s.paused ? 'Buffering · resume to flush'
                                            : isFailing ? `⚠ Last delivery ${s.lastDelivered}`
                                            : `Last delivered ${s.lastDelivered || 'never'}`}
                                    </div>
                                </div>
                                {/* Pause/resume toggle */}
                                <SToggle on={isActive} onChange={() => onTogglePause && onTogglePause(s)}/>
                                {/* ⋯ remove button */}
                                <button onClick={() => onRemoveDest && onRemoveDest(s)}
                                    title="Remove destination"
                                    style={{ background:'none', border:'none', color:T.inkMuted, fontSize:13,
                                        cursor:'pointer', padding:'2px 4px', fontFamily:T.sans, lineHeight:1 }}>🗑</button>
                            </div>
                        );
                    })}
                </div>

                {/* Add destination row */}
                <div onClick={() => { onClose(); onAddDest && onAddDest(); }}
                    style={{ padding:'10px 16px', borderBottom:`1px solid ${T.border}`,
                        display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                        background:T.surface }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                    onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                    <span style={{ width:18, height:18, borderRadius:3, border:`1px dashed ${T.borderStrong}`,
                        display:'inline-flex', alignItems:'center', justifyContent:'center',
                        fontSize:12, color:T.inkMuted, flexShrink:0 }}>+</span>
                    <span style={{ fontSize:12, fontWeight:600, color:T.ink }}>Add destination</span>
                    <span style={{ fontSize:10.5, color:T.inkMuted }}>· Splunk, Datadog, S3, generic webhook…</span>
                </div>

                {/* Stream-wide settings — collapsible drawer */}
                <div style={{ background:T.surface2 }}>
                    <div onClick={() => setGlobalsOpen(o => !o)}
                        style={{ padding:'10px 16px', display:'flex', alignItems:'center', gap:8, cursor:'pointer',
                            borderBottom: globalsOpen ? `1px solid ${T.border}` : 'none' }}>
                        <span style={{ fontSize:10, color:T.inkMuted, display:'inline-block',
                            transform:globalsOpen?'rotate(90deg)':'rotate(0)', transition:'transform 150ms' }}>▶</span>
                        <span style={{ fontSize:11.5, fontWeight:700, color:T.ink, letterSpacing:0.3 }}>Stream-wide settings</span>
                        <span style={{ fontSize:10.5, color:T.inkMuted }}>
                            Retention {globals.retention} · {globals.redactPII ? 'PII redacted' : 'PII not redacted'} · {globals.signing}
                        </span>
                    </div>
                    {globalsOpen && (
                        <div>
                            <SRow label="Retention"
                                sub="How long Accelerep keeps events queryable in this UI."
                                control={<SSelect value={globals.retention} options={['13 months','6 months','3 months','1 month']} onChange={v => setGlobals(g=>({...g,retention:v}))} width={120}/>}/>
                            <SRow label="Redact PII before streaming"
                                sub="Mask matching fields in event payloads before sending."
                                control={<SToggle on={globals.redactPII} onChange={() => setGlobals(g=>({...g,redactPII:!g.redactPII}))}/>}/>
                            <SRow label="Payload signing"
                                sub="Sign each request with HMAC key. Receivers verify on intake."
                                control={<SSelect value={globals.signing} options={['hmac-sha256','none']} onChange={v => setGlobals(g=>({...g,signing:v}))} width={130}/>}/>
                            <SRow label="On delivery failure"
                                control={<SSelect value={globals.onFailure} options={['Buffer & retry','Drop events','Alert only']} onChange={v => setGlobals(g=>({...g,onFailure:v}))} width={140}/>}
                                divider={false}/>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding:'10px 16px', borderTop:`1px solid ${T.border}`, background:T.surface,
                    display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ fontSize:11, color:T.inkMid, cursor:'pointer', fontWeight:600,
                        fontFamily:T.sans, textDecoration:'none' }}>View delivery logs</span>
                    <span style={{ flex:1 }}/>
                    {globalsOpen && (
                        <SecBtn label="Save settings" primary onClick={() => { onSaveGlobals && onSaveGlobals(globals); setGlobalsOpen(false); }}/>
                    )}
                    <SecBtn label="Done" primary={!globalsOpen} onClick={onClose}/>
                </div>
            </div>
        </div>
    );
};

const fmtEventAge = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.round((now - d) / 60000);
    if (diffMin < 1)    return 'just now';
    if (diffMin < 60)   return diffMin + ' minutes ago';
    if (diffMin < 120)  return '1 hour ago';
    if (diffMin < 1440) return Math.round(diffMin/60) + ' hours ago';
    if (diffMin < 2880) return 'yesterday';
    if (diffMin < 10080) return Math.round(diffMin/1440) + ' days ago';
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
};

const mapEntityTypeToCat = (entityType) => {
    const map = {
        user:'admin', role:'admin', territory:'admin', team:'admin',
        opportunity:'data', account:'data', contact:'data', lead:'data',
        task:'data', activity:'data', pipeline:'data', stage:'data',
        pricebook:'data', quote:'data',
        apikey:'security', webhook:'security', setting:'security', export:'security',
        login:'auth', mfa:'auth', sso:'auth', session:'auth',
        billing:'billing', plan:'billing', seat:'billing',
    };
    const key = (entityType||'').toLowerCase();
    return map[key] || 'admin';
};

const mapActionToSev = (action) => {
    const a = (action||'').toLowerCase();
    // Exact-suffix matches — look for 'failed', 'deleted', 'revoked', 'disabled', 'blocked'
    const warnSuffixes = ['failed','deleted','revoked','disabled','blocked','unauthorized','denied','error'];
    // Exact action matches
    const warnExact = ['apikey.created','webhook.created','role.permission_changed','user.invited',
        'export.bulk','setting.security_changed','mfa.policy_changed','sso.activated'];
    if (warnExact.includes(a)) return 'warn';
    if (warnSuffixes.some(s => a.endsWith('.' + s) || a.endsWith('_' + s))) return 'warn';
    return 'info';
};

export const AuditDetail = ({ onBack }) => {
    const [catFilter,   setCatFilter]   = React.useState('All categories');
    const [actorFilter, setActorFilter] = React.useState('All actors');
    const [timeFilter,  setTimeFilter]  = React.useState('Last 7 days');
    const [search,      setSearch]      = React.useState('');

    // Popover/menu state — which row is active and what's showing
    const [activeRow,   setActiveRow]   = React.useState(null); // index
    const [activeMode,  setActiveMode]  = React.useState(null); // 'popover' | 'menu'
    const [activeDestRow, setActiveDestRow] = React.useState(null);

    // Export split button state
    const [exportOpen,   setExportOpen]   = React.useState(false);
    const [showAlerts,     setShowAlerts]     = React.useState(false);
    const [showAddDest,   setShowAddDest]   = React.useState(false);
    const [showStreaming,  setShowStreaming]  = React.useState(false);
    const streamingBtnRef = React.useRef(null);

    // Live audit events from DB — start empty, never fall back to mock
    const [events,      setEvents]      = React.useState([]);
    const [eventsLoading, setEventsLoading] = React.useState(true);
    const [eventsError, setEventsError] = React.useState(null);

    // Streaming destinations — live from settings (never use mock as default)
    const [streams, setStreams] = React.useState([]);
    const [streamsLoading, setStreamsLoading] = React.useState(true);
    // Every write below was fire-and-forget into a catch that only logged, and
    // the keys were not in the settings whitelist either, so nothing persisted
    // and nothing said so. This surfaces the failure and reverts the optimistic
    // state, so the panel never shows a change the database does not have.
    const [streamError, setStreamError] = React.useState('');

    // Button refs for anchoring
    const rowMenuRefs    = React.useRef({});
    const destSectionRef = React.useRef(null);
    const exportBtnRef = React.useRef(null);
    const destMenuRefs = React.useRef({});

    // Load real audit events and streaming destinations from DB on mount
    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const [auditRes, settingsRes] = await Promise.all([
                    dbFetch('/.netlify/functions/audit-log'),
                    dbFetch('/.netlify/functions/settings'),
                ]);
                if (cancelled) return;
                const [auditData, settingsData] = await Promise.all([auditRes.json(), settingsRes.json()]);
                if (auditRes.ok && auditData.entries?.length > 0) {
                    // Map DB shape → display shape
                    const mapped = auditData.entries.map(e => ({
                        when:   fmtEventAge(e.timestamp),
                        rawTs:  e.timestamp, // keep for time filter
                        actor:  e.userName || e.userId || 'System',
                        action: e.action,
                        target: e.entityName || e.entityId || '—',
                        cat:    mapEntityTypeToCat(e.entityType),
                        sev:    mapActionToSev(e.action),
                        ip:     '—', // IP not stored in current schema
                    }));
                    setEvents(mapped);
                }
                if (settingsRes.ok) {
                    // Always replace — even empty array overwrites the default []
                    setStreams(settingsData.settings?.streamingDestinations || []);
                }
                setStreamsLoading(false);
            } catch (e) {
                console.error('AuditDetail load error:', e.message);
                if (!cancelled) setEventsError(e.message);
            } finally {
                if (!cancelled) setEventsLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    // Alert badge count (warn events)
    const alertCount = events.filter(e => e.sev === 'warn').length;

    // Filter logic
    const visible = events.filter(e => {
        if (catFilter === 'warn') { if (e.sev !== 'warn') return false; }
        else if (catFilter !== 'All categories' && e.cat !== catFilter) return false;
        if (actorFilter !== 'All actors' && e.actor !== actorFilter) return false;
        // Time filter — applied to e.rawTs (ISO string) stored during mapping
        if (timeFilter !== 'All time' && e.rawTs) {
            const evMs  = new Date(e.rawTs).getTime();
            const nowMs = Date.now();
            const limitMap = {
                'Last 1 hour':    60 * 60 * 1000,
                'Last 24 hours':  24 * 60 * 60 * 1000,
                'Last 7 days':    7  * 24 * 60 * 60 * 1000,
                'Last 30 days':   30 * 24 * 60 * 60 * 1000,
                'Last 90 days':   90 * 24 * 60 * 60 * 1000,
                'Last 13 months': 395 * 24 * 60 * 60 * 1000,
            };
            const limit = limitMap[timeFilter];
            if (limit && (nowMs - evMs) > limit) return false;
        }
        const q = search.toLowerCase();
        return !q || e.action.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q) || (e.target||'').toLowerCase().includes(q);
    });

    const handleAddFilter = (key, val) => {
        if (key === 'actor')  setActorFilter(val);
        if (key === 'cat')    setCatFilter(val);
        if (key === 'action') setSearch(val);
        setActiveRow(null); setActiveMode(null);
    };

    // Optimistic update, then revert on failure. `putSettings` throws a readable
    // Error on any non-2xx — dbFetch itself never throws on 4xx/5xx (guide 18b1),
    // which is why the previous bare try/catch could not see a 403.
    const saveStreams = async (next, label) => {
        const prev = streams;
        setStreams(next);
        setStreamError('');
        try {
            await putSettings({ streamingDestinations: next });
            return true;
        } catch (e) {
            setStreams(prev);                       // never show what was not stored
            setStreamError(`${label} not saved — ${e.message}`);
            return false;
        }
    };

    const handleTogglePause = (dest) =>
        saveStreams(
            streams.map(s => s.dest === dest.dest ? { ...s, paused: !s.paused } : s),
            dest.paused ? 'Resume' : 'Pause',
        );

    const handleRemoveDest = async (dest) => {
        setActiveDestRow(null);
        await saveStreams(streams.filter(d => d.dest !== dest.dest), 'Destination removal');
    };

    const handleSaveDest = async (newDest) => {
        setShowAddDest(false);
        await saveStreams([...streams, newDest], 'Destination');
    };

    const handleSaveGlobals = async (globals) => {
        setStreamError('');
        try {
            await putSettings({ streamingGlobals: globals });
            return true;
        } catch (e) {
            setStreamError(`Streaming settings not saved — ${e.message}`);
            return false;
        }
    };

    const auditCatStyle = (cat) => {
        const map = { auth:'rgba(58,90,122,0.12)', security:'rgba(156,58,46,0.10)', admin:'rgba(77,107,61,0.10)', data:'rgba(200,185,154,0.20)', billing:'rgba(184,115,51,0.10)' };
        const col = { auth:T.info, security:T.danger, admin:T.ok, data:T.goldInk, billing:T.warn };
        return { bg: map[cat] || 'rgba(138,131,120,0.10)', fg: col[cat] || T.inkMid };
    };

    return (
        <div style={{ fontFamily:T.sans }}>
            {showAlerts  && <ManageAlertsModal alertCount={alertCount} onClose={() => setShowAlerts(false)}/>}
            {showAddDest && <AddDestinationModal onClose={() => setShowAddDest(false)} onSave={handleSaveDest}/>}
            {showStreaming && (
                <ConfigureStreamingPopover
                    streams={streams}
                    streamError={streamError}
                    btnRef={streamingBtnRef}
                    onClose={() => setShowStreaming(false)}
                    onAddDest={() => { setShowStreaming(false); setShowAddDest(true); }}
                    onTogglePause={handleTogglePause}
                    onRemoveDest={handleRemoveDest}
                    onSaveGlobals={handleSaveGlobals}
                />
            )}
            <SecCrumb page="Audit log" onBack={onBack}/>
            <SecTitle
                title="Audit log"
                sub={`${visible.length} events · ${timeFilter} · retention 13 months`}
                badge="Streaming to Splunk · 2 alerts triggered today"
                updatedAt="Real-time"
                actions={[
                    <button ref={streamingBtnRef} key="str" onClick={() => setShowStreaming(o => !o)}
                        style={{ padding:'6px 12px', background:showStreaming?T.surface2:T.surface, border:`1px solid ${showStreaming?T.goldInk:T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, color:T.ink, cursor:'pointer', fontFamily:T.sans, display:'inline-flex', alignItems:'center', gap:5 }}>
                        Configure streaming <span style={{ fontSize:9, color:T.inkMuted }}>▾</span>
                    </button>,,

                    <div key="exp" style={{ display:'inline-flex', position:'relative' }}>
                        <button onClick={() => {
                            // Body click — download CSV directly
                            const cols = ['when','actor','action','target','cat','sev','ip'];
                            const header = cols.join(',');
                            const esc2 = (v) => '"' + String(v||'').replace(/"/g, '""') + '"';
                            const rows = visible.map(e => cols.map(c => esc2(e[c])).join(','));
                            const blob = new Blob([[header,...rows].join(String.fromCharCode(10))], { type:'text/csv' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = `accelerep-audit-${new Date().toISOString().split('T')[0]}.csv`;
                            document.body.appendChild(a); a.click(); document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                        }} style={{ padding:'7px 12px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRight:'none',
                            borderRadius:`${T.r}px 0 0 ${T.r}px`, fontSize:12.5, fontWeight:600, color:T.ink, cursor:'pointer', fontFamily:T.sans }}>
                            Export CSV
                        </button>
                        <button ref={exportBtnRef} onClick={() => setExportOpen(o => !o)}
                            style={{ padding:'7px 8px', background: exportOpen ? T.surface2 : T.surface, border:`1px solid ${T.borderStrong}`,
                                borderRadius:`0 ${T.r}px ${T.r}px 0`, fontSize:10, color:T.inkMid, cursor:'pointer',
                                display:'inline-flex', alignItems:'center', fontFamily:T.sans }}>▾</button>
                        {exportOpen && (
                            <AuditAnchoredMenu btnRef={exportBtnRef} onClose={() => setExportOpen(false)} alignRight={true}>
                                <AuditExportDropdown events={visible} onClose={() => setExportOpen(false)}/>
                            </AuditAnchoredMenu>
                        )}
                    </div>,

                    <button key="ale" onClick={() => setShowAlerts(true)} style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'7px 14px',
                        background:T.ink, color:'#fbf8f3', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer',
                        border:'none', fontFamily:T.sans }}>
                        Manage alerts
                        {alertCount > 0 && (
                            <span style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                                minWidth:18, height:18, padding:'0 5px', background:T.warn, color:'#fbf8f3',
                                borderRadius:9, fontSize:10.5, fontWeight:700, lineHeight:1 }}>{alertCount}</span>
                        )}
                    </button>,
                ]}/>

            {/* ── Filters ── */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:'14px 16px', marginBottom:16 }}>
                <div style={{ fontSize:13.5, fontWeight:700, color:T.ink, marginBottom:12 }}>Filters</div>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    <input value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Search action, actor, target…"
                        style={{ flex:1, minWidth:180, padding:'7px 12px', border:`1px solid ${T.border}`, borderRadius:T.r,
                            fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface }}/>
                    <PolicySelect label="" value={catFilter} width={260}>
                        <AuditCategoryDropdown value={catFilter} onChange={v => { setCatFilter(v); }}/>
                    </PolicySelect>
                    <PolicySelect label="" value={actorFilter} width={300}>
                        <AuditActorDropdown value={actorFilter} onChange={v => { setActorFilter(v); }} events={events}/>
                    </PolicySelect>
                    <PolicySelect label="" value={timeFilter} width={280}>
                        <AuditTimeDropdown value={timeFilter} onChange={v => { setTimeFilter(v); }}/>
                    </PolicySelect>
                    {(catFilter !== 'All categories' || actorFilter !== 'All actors' || search) && (
                        <button onClick={() => { setCatFilter('All categories'); setActorFilter('All actors'); setSearch(''); }}
                            style={{ fontSize:12, color:T.danger, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, fontWeight:600, whiteSpace:'nowrap' }}>
                            Clear filters
                        </button>
                    )}
                    <span style={{ fontSize:12.5, color:T.inkMuted, whiteSpace:'nowrap', marginLeft:'auto' }}>Showing {visible.length} of {events.length} {eventsLoading ? '(loading…)' : ''}</span>
                </div>
            </div>

            {/* ── Event stream ── */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden', marginBottom:16 }}>
                <div style={{ padding:'12px 16px 8px', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>Event stream</div>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:T.sans }}>
                    <thead>
                        <tr style={{ background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                            {['WHEN','ACTOR','ACTION','TARGET','CATEGORY','IP',''].map((h,i) => (
                                <th key={i} style={{ padding:'8px 14px', fontSize:10, fontWeight:700, color:T.inkMuted,
                                    letterSpacing:0.6, textTransform:'uppercase', textAlign:'left',
                                    width: i===6 ? 36 : 'auto' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {!eventsLoading && events.length === 0 && (
                            <tr><td colSpan={7} style={{ padding:'48px', textAlign:'center', color:T.inkMuted, fontSize:13, fontFamily:T.sans }}>
                                <div style={{ marginBottom:8, fontSize:24, opacity:0.3 }}>📋</div>
                                <div style={{ fontWeight:600, color:T.ink, marginBottom:4 }}>No audit events yet</div>
                                <div>Events will appear here as users take actions in the app.</div>
                                {eventsError && <div style={{ color:T.danger, marginTop:8, fontSize:12 }}>Load error: {eventsError}</div>}
                            </td></tr>
                        )}
                        {visible.length === 0 && events.length > 0 && (
                            <tr><td colSpan={7} style={{ padding:'32px', textAlign:'center', color:T.inkMuted, fontSize:13, fontFamily:T.sans }}>
                                No events match these filters.
                            </td></tr>
                        )}
                        {visible.map((ev, i) => {
                            const cs = auditCatStyle(ev.cat);
                            const isWarn = ev.sev === 'warn';
                            const isActiveRow = activeRow === i;
                            return (
                                <tr key={i} style={{ borderBottom:`1px solid ${T.border}`,
                                    background: isActiveRow ? 'rgba(200,185,154,0.18)' : isWarn ? 'rgba(184,115,51,0.05)' : 'transparent',
                                    cursor:'pointer', position:'relative' }}
                                    onClick={() => { setActiveRow(i); setActiveMode('popover'); setActiveDestRow(null); }}>
                                    <td style={{ padding:'9px 14px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, color:T.inkMuted, whiteSpace:'nowrap' }}>{ev.when}</td>
                                    <td style={{ padding:'9px 14px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.ink, whiteSpace:'nowrap' }}>{ev.actor}</td>
                                    <td style={{ padding:'9px 14px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12.5, fontWeight:600, color:isWarn?T.warn:T.ink, whiteSpace:'nowrap' }}>{ev.action}</td>
                                    <td style={{ padding:'9px 14px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.inkMid, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.target}</td>
                                    <td style={{ padding:'9px 14px' }}>
                                        <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:3, fontSize:11, fontWeight:700, background:cs.bg, color:cs.fg }}>{ev.cat}</span>
                                    </td>
                                    <td style={{ padding:'9px 14px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, color:T.inkMuted }}>{ev.ip}</td>
                                    <td style={{ padding:'9px 14px', textAlign:'right' }} onClick={e => { e.stopPropagation(); setActiveRow(i); setActiveMode('menu'); setActiveDestRow(null); }}>
                                        <button ref={el => rowMenuRefs.current[i] = el}
                                            style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                                                width:22, height:22, borderRadius:3, fontSize:16, fontWeight:700, border:'none',
                                                cursor:'pointer', lineHeight:1,
                                                color: isActiveRow && activeMode==='menu' ? T.goldInk : T.inkMuted,
                                                background: isActiveRow && activeMode==='menu' ? 'rgba(200,185,154,0.30)' : 'transparent' }}>⋯</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* Event popover — anchored below-left of the row */}
                {activeRow !== null && activeMode === 'popover' && visible[activeRow] && (
                    <AuditAnchoredMenu
                        btnRef={{ current: rowMenuRefs.current[activeRow] }}
                        onClose={() => { setActiveRow(null); setActiveMode(null); }}
                        alignRight={false}>
                        <AuditEventPopover
                            event={visible[activeRow]}
                            onClose={() => { setActiveRow(null); setActiveMode(null); }}
                            onAddFilter={handleAddFilter}/>
                    </AuditAnchoredMenu>
                )}

                {/* Row ⋯ menu — anchored top-right of ⋯ button */}
                {activeRow !== null && activeMode === 'menu' && visible[activeRow] && (
                    <AuditAnchoredMenu
                        btnRef={{ current: rowMenuRefs.current[activeRow] }}
                        onClose={() => { setActiveRow(null); setActiveMode(null); }}
                        alignRight={true}>
                        <div style={{ position:'relative' }}>
                            <AuditEventRowMenu
                                event={visible[activeRow]}
                                onViewDetails={() => { setActiveMode('popover'); }}
                                onFilterAction={(key,val) => { handleAddFilter(key,val); }}
                                onCreateAlert={() => { setActiveRow(null); setActiveMode(null); }}
                                onClose={() => { setActiveRow(null); setActiveMode(null); }}/>
                        </div>
                    </AuditAnchoredMenu>
                )}
            </div>

            {/* ── Streaming destinations ── */}
            <div ref={destSectionRef} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px 8px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>Streaming destinations</div>
                    <SecBtn label="+ Add destination" onClick={() => setShowAddDest(true)}/>
                </div>
                <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:T.sans }}>
                    <thead>
                        <tr style={{ background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                            {['DESTINATION','ENDPOINT','FORMAT','STATUS','LAST DELIVERED',''].map((h,i) => (
                                <th key={i} style={{ padding:'8px 14px', fontSize:10, fontWeight:700, color:T.inkMuted,
                                    letterSpacing:0.6, textTransform:'uppercase', textAlign:'left', width:i===5?36:'auto' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {streams.map((s, i) => (
                            <tr key={s.dest} style={{ borderBottom:i<streams.length-1?`1px solid ${T.border}`:'none',
                                background: activeDestRow===i ? 'rgba(200,185,154,0.18)' : 'transparent' }}>
                                <td style={{ padding:'10px 14px', fontWeight:600, color:T.ink, fontSize:13 }}>{s.dest}</td>
                                <td style={{ padding:'10px 14px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, color:T.inkMuted, maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.url}</td>
                                <td style={{ padding:'10px 14px' }}>
                                    <span style={{ display:'inline-block', padding:'2px 6px', borderRadius:3, fontSize:11, fontWeight:600,
                                        background:'rgba(138,131,120,0.12)', color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace' }}>{s.fmt}</span>
                                </td>
                                <td style={{ padding:'10px 14px' }}>
                                    <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700,
                                        background:s.status==='Active'?'rgba(77,107,61,0.12)':s.status==='Failing'?'rgba(156,58,46,0.12)':'rgba(138,131,120,0.12)',
                                        color:s.status==='Active'?T.ok:s.status==='Failing'?T.danger:T.inkMid }}>
                                        {s.status}
                                    </span>
                                </td>
                                <td style={{ padding:'10px 14px', fontSize:12, color:s.status==='Failing'?T.danger:T.inkMid }}>{s.lastDelivered}</td>
                                <td style={{ padding:'10px 14px', textAlign:'right' }}>
                                    <button ref={el => destMenuRefs.current[i] = el}
                                        onClick={e => { e.stopPropagation(); setActiveDestRow(activeDestRow===i ? null : i); setActiveRow(null); }}
                                        style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
                                            width:22, height:22, borderRadius:3, fontSize:16, fontWeight:700, border:'none',
                                            cursor:'pointer', lineHeight:1,
                                            color: activeDestRow===i ? T.goldInk : T.inkMuted,
                                            background: activeDestRow===i ? 'rgba(200,185,154,0.30)' : 'transparent' }}>⋯</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Destination ⋯ menu */}
                {activeDestRow !== null && streams[activeDestRow] && (
                    <AuditAnchoredMenu
                        btnRef={{ current: destMenuRefs.current[activeDestRow] }}
                        onClose={() => setActiveDestRow(null)}
                        alignRight={true}>
                        <AuditDestRowMenu
                            dest={streams[activeDestRow]}
                            onRemove={handleRemoveDest}
                            onClose={() => setActiveDestRow(null)}/>
                    </AuditAnchoredMenu>
                )}
            </div>
        </div>
    );
};
