// settings/audit/AuditDetail.jsx
//
// The audit log, honest by construction, and audit streaming built for real
// (state §0.87, handoff item 21 — Jeff's call: "build audit streaming").
//
// Kept from before because it was real: the event stream (audit-log GET, the
// last 500 rows), the filters and search, the row popover with facet chips, the
// export of the current view as CSV / JSON / NDJSON.
//
// Streaming now reads and writes /.netlify/functions/audit-stream: a
// destination is created with a secret shown ONCE (and again on rotate), every
// audit write is POSTed to it signed with HMAC-SHA256, and each row's status,
// last delivery and failure count are the endpoint's real columns. Row actions
// are Send test event, Pause / Resume, Rotate secret and Remove.
//
// Removed because it was invented: a "Streaming to Splunk · 2 alerts triggered
// today" badge, "retention 13 months", a Manage alerts modal that saved and
// fired nothing, "Export all 12,847 events…" / "Schedule recurring export…",
// "Create alert from event", a destination row menu whose items did nothing,
// "View delivery logs", a globals drawer promising "Buffer & retry", an IP
// column the schema has no value for, and a "Related · same actor" list built
// from a hardcoded array instead of the loaded rows.
import React from 'react';
import { useLocalLayer } from '../../../hooks/useLocalLayer';
import { dbFetch } from '../../../utils/storage';
import { readRefusal, refusalWords, failureWords } from '../../../utils/refusalWords.js';
import { todayLocal } from '../../../utils/dateLocal';
import { useApp } from '../../../AppContext';
import { T } from '../shared/tokens.js';
import { SecCrumb, SecTitle, SecBtn, DropdownPanel, DropdownOption, PolicySelect } from '../security/shared.jsx';

const STREAM_URL = '/.netlify/functions/audit-stream';

// ── filters ──────────────────────────────────────────────────────────────────

const AuditCategoryDropdown = ({ value, onChange }) => (
    <DropdownPanel width={260}>
        <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>Category</div>
        <DropdownOption label="All categories" sub="No filter applied" selected={value==='All categories'} onClick={() => onChange('All categories')}/>
        <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
        {[
            { v:'auth',     sub:'Login, MFA, SSO' },
            { v:'security', sub:'API keys, webhooks, streaming' },
            { v:'admin',    sub:'Users, roles, territories' },
            { v:'data',     sub:'Records, pipeline, custom fields' },
            { v:'billing',  sub:'Plan, seats, invoices' },
        ].map(c => (
            <DropdownOption key={c.v} label={c.v} sub={c.sub} selected={value===c.v} onClick={() => onChange(c.v)}/>
        ))}
        <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
        <DropdownOption label="Severity: warn only" sub="Across all categories" selected={value==='warn'} onClick={() => onChange('warn')}/>
    </DropdownPanel>
);

const AuditActorDropdown = ({ value, onChange, events = [] }) => {
    const actors = ['All actors', ...new Set(events.map(e => e.actor).filter(Boolean))];
    const [q, setQ] = React.useState('');
    const filtered = q ? actors.filter(a => a.toLowerCase().includes(q.toLowerCase())) : actors;
    return (
        <DropdownPanel width={300}>
            <div style={{ padding:'6px 8px 8px' }}>
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search actor…"
                    style={{ width:'100%', padding:'6px 8px', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:3, fontSize:11.5, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', boxSizing:'border-box' }}/>
            </div>
            <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>Actors in the loaded events</div>
            {filtered.map(a => <DropdownOption key={a} label={a} selected={value===a} onClick={() => onChange(a)}/>)}
        </DropdownPanel>
    );
};

const TIME_LIMITS = {
    'Last 1 hour':   60 * 60 * 1000,
    'Last 24 hours': 24 * 60 * 60 * 1000,
    'Last 7 days':   7  * 24 * 60 * 60 * 1000,
    'Last 30 days':  30 * 24 * 60 * 60 * 1000,
    'Last 90 days':  90 * 24 * 60 * 60 * 1000,
};
const AuditTimeDropdown = ({ value, onChange }) => (
    <DropdownPanel width={260}>
        <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>Time range</div>
        {[...Object.keys(TIME_LIMITS), 'All loaded'].map(v => (
            <DropdownOption key={v} label={v} sub={v === 'All loaded' ? 'Everything in the last 500 events' : null} selected={value===v} onClick={() => onChange(v)}/>
        ))}
    </DropdownPanel>
);

// ── export of the current view ───────────────────────────────────────────────

const EXPORT_COLS = ['when', 'timestamp', 'actor', 'action', 'target', 'cat', 'sev'];
const downloadEvents = (events, fmt) => {
    let content, mime, ext;
    if (fmt === 'JSON') { content = JSON.stringify(events.map(e => ({ ...e, rawTs: undefined })), null, 2); mime = 'application/json'; ext = 'json'; }
    else if (fmt === 'NDJSON') { content = events.map(e => JSON.stringify({ ...e, rawTs: undefined })).join('\n'); mime = 'application/x-ndjson'; ext = 'ndjson'; }
    else {
        const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
        content = [EXPORT_COLS.join(','), ...events.map(e => EXPORT_COLS.map(c => esc(c === 'timestamp' ? e.rawTs : e[c])).join(','))].join('\r\n');
        mime = 'text/csv'; ext = 'csv';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `accelerep-audit-${todayLocal()}.${ext}`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
};

const AuditExportDropdown = ({ events, onClose }) => (
    <DropdownPanel width={280}>
        <div style={{ padding:'4px 10px 2px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', fontFamily:T.sans }}>Download the current view</div>
        <DropdownOption label="CSV" sub={`${events.length} events · spreadsheet-friendly`} onClick={() => { downloadEvents(events, 'CSV'); onClose(); }}/>
        <DropdownOption label="JSON" sub="Full event payload" onClick={() => { downloadEvents(events, 'JSON'); onClose(); }}/>
        <DropdownOption label="NDJSON" sub="One event per line · for log tools" onClick={() => { downloadEvents(events, 'NDJSON'); onClose(); }}/>
    </DropdownPanel>
);

// ── the row popover ──────────────────────────────────────────────────────────

const AuditEventPopover = ({ event, events, onClose, onAddFilter }) => {
    const sevColor = event.sev === 'warn' ? T.warn : T.ok;
    const facets = [
        { lbl:'actor',  val: event.actor },
        { lbl:'action', val: event.action },
        { lbl:'cat',    val: event.cat },
    ].filter(f => f.val);
    // Related rows come from what is loaded, never from a typed list.
    const related = events.filter(e => e.actor === event.actor && e !== event).slice(0, 3);
    return (
        <div style={{ width:360, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:4, boxShadow:'0 8px 24px rgba(42,38,34,0.12), 0 2px 4px rgba(42,38,34,0.06)', fontFamily:T.sans, overflow:'hidden' }}>
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
                {event.detail && <div style={{ fontSize:11.5, color:T.inkMid, marginTop:6, lineHeight:1.5 }}>{event.detail}</div>}
                {event.rawTs && <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:6, fontFamily:'ui-monospace,Menlo,monospace' }}>{new Date(event.rawTs).toLocaleString()}</div>}
            </div>
            <div style={{ padding:'10px 12px 6px', display:'flex', gap:6, flexWrap:'wrap' }}>
                {facets.map((c,i) => (
                    <span key={i} onClick={() => { onAddFilter && onAddFilter(c.lbl, c.val); onClose(); }}
                        style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:12, fontSize:11, background:T.surface2, border:`1px solid ${T.border}`, color:T.inkMid, cursor:'pointer' }}>
                        <span style={{ color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', fontSize:10 }}>{c.lbl}:</span>
                        <span style={{ fontFamily:'ui-monospace,Menlo,monospace' }}>{c.val}</span>
                        <span style={{ color:T.inkMuted, marginLeft:2, fontSize:10 }}>+</span>
                    </span>
                ))}
            </div>
            {related.length > 0 && (
                <div style={{ padding:'8px 16px 12px' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:6, fontFamily:T.sans }}>Related · same actor</div>
                    {related.map((r,i) => (
                        <div key={i} style={{ display:'flex', gap:8, padding:'4px 0', fontSize:11.5, alignItems:'baseline' }}>
                            <span style={{ width:90, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', fontSize:10.5, flexShrink:0 }}>{r.when}</span>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontWeight:600, color:T.ink, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.action}</span>
                        </div>
                    ))}
                </div>
            )}
            <div style={{ padding:'10px 16px', borderTop:`1px solid ${T.border}`, background:T.surface2, display:'flex', gap:8 }}>
                <button onClick={() => { navigator.clipboard?.writeText(event.id || ''); onClose(); }}
                    style={{ fontSize:11.5, fontWeight:600, color:T.inkMid, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>Copy event ID</button>
                <span style={{ flex:1 }}/>
                <SecBtn label="Close" onClick={onClose}/>
            </div>
        </div>
    );
};

// Anchors a floating panel to a button, flipping when it would clip.
const AuditAnchoredMenu = ({ children, btnRef, onClose, alignRight=true }) => {
    const ref = React.useRef(null);
    const [style, setStyle] = React.useState({ position:'fixed', zIndex:9999, top:-9999, left:-9999, visibility:'hidden' });
    const positionedRef = React.useRef(false);
    React.useLayoutEffect(() => {
        if (!btnRef?.current || !ref.current || positionedRef.current) return;
        positionedRef.current = true;
        const r = btnRef.current.getBoundingClientRect();
        const menuH = ref.current.offsetHeight || 320, menuW = ref.current.offsetWidth || 260;
        const vw = window.innerWidth, vh = window.innerHeight, GAP = 4, EDGE = 8;
        const top = (r.bottom + GAP + menuH > vh - EDGE) ? Math.max(EDGE, r.top - menuH - GAP) : r.bottom + GAP;
        let computed;
        if (alignRight) computed = (r.right - menuW < EDGE) ? { left: Math.max(EDGE, r.left) } : { right: Math.max(EDGE, vw - r.right) };
        else computed = (r.left + menuW > vw - EDGE) ? { right: EDGE } : { left: Math.max(EDGE, r.left) };
        setStyle({ position:'fixed', zIndex:9999, top, ...computed, visibility:'visible' });
    });
    React.useEffect(() => {
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target) && btnRef?.current && !btnRef.current.contains(e.target)) onClose(); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, []);
    // Escape closes it, the one on top only, and marks it (state §0.232).
    useLocalLayer(true, { onClose });
    return <div ref={ref} style={style}>{children}</div>;
};

// ── streaming: add, reveal, rows ─────────────────────────────────────────────

const FL = ({ label:lbl, hint, children }) => (
    <div style={{ marginBottom:14 }}>
        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5, fontFamily:T.sans }}>{lbl}</label>
        {children}
        {hint && <div style={{ fontSize:11, color:T.inkMuted, marginTop:4, fontFamily:T.sans }}>{hint}</div>}
    </div>
);

const PRESET_DESTS = [
    { label:'Datadog Logs', url:'https://http-intake.logs.datadoghq.com/api/v2/logs', fmt:'NDJSON' },
    { label:'Splunk HEC',   url:'https://splunk.example.com:8088/services/collector', fmt:'JSON' },
    { label:'Webhook',      url:'https://',                                             fmt:'JSON' },
];

const AddDestinationModal = ({ onClose, onSave }) => {
    const [dest, setDest] = React.useState('');
    const [url, setUrl] = React.useState('');
    const [fmt, setFmt] = React.useState('JSON');
    const [saving, setSaving] = React.useState(false);
    const [err, setErr] = React.useState('');
    // One close for Escape, the backdrop, × and Cancel (state §0.232): a destination typed or a preset picked asks
    // "Discard changes?"; nothing while it is being added — its × was live then.
    const requestClose = useLocalLayer(true, { onClose, dirty: !!(dest.trim() || url.trim()) || fmt !== 'JSON', busy: saving });
    const inpSt = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' };
    const handleSave = async () => {
        setSaving(true); setErr('');
        const r = await onSave({ name: dest, url, fmt });
        setSaving(false);
        if (!r.ok) setErr(r.error || 'Not saved.');
    };
    return (
        <div onClick={requestClose} style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.40)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background:T.surface, borderRadius:8, width:540, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 56px rgba(20,16,12,0.28)' }}>
                <div style={{ padding:'16px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                        <div style={{ fontSize:16, fontWeight:700, color:T.ink }}>Add streaming destination</div>
                        <div style={{ fontSize:12, color:T.inkMuted, marginTop:2 }}>Every audit event is POSTed here as it is written, signed with a secret you will see once.</div>
                    </div>
                    <button onClick={requestClose} style={{ background:'none', border:'none', color:T.inkMuted, fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
                </div>
                <div style={{ padding:'18px 20px' }}>
                    <div style={{ fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:8, fontFamily:T.sans }}>Quick presets</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
                        {PRESET_DESTS.map(p => (
                            <button key={p.label} onClick={() => { setDest(p.label); setUrl(p.url); setFmt(p.fmt); }}
                                style={{ padding:'5px 10px', fontSize:12, fontWeight:500, background:dest===p.label?T.ink:T.surface2, color:dest===p.label?'#fbf8f3':T.inkMid, border:`1px solid ${dest===p.label?T.ink:T.border}`, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                {p.label}
                            </button>
                        ))}
                    </div>
                    <FL label="Destination name">
                        <input value={dest} onChange={e => { setDest(e.target.value); setErr(''); }} placeholder="e.g. Datadog production" style={{ ...inpSt, fontFamily:T.sans }}/>
                    </FL>
                    <FL label="Endpoint URL" hint="https:// only, on a public host — an HTTP intake or a webhook receiver">
                        <input value={url} onChange={e => { setUrl(e.target.value); setErr(''); }} placeholder="https://…" style={inpSt}/>
                    </FL>
                    <FL label="Format">
                        <div style={{ display:'flex', gap:8 }}>
                            {['JSON','NDJSON'].map(f => (
                                <button key={f} onClick={() => setFmt(f)}
                                    style={{ flex:1, padding:'8px 0', fontSize:12.5, fontWeight:600, textAlign:'center', background:fmt===f?T.ink:T.surface2, color:fmt===f?'#fbf8f3':T.inkMid, border:`1px solid ${fmt===f?T.ink:T.border}`, borderRadius:T.r, cursor:'pointer', fontFamily:'ui-monospace,Menlo,monospace' }}>
                                    {f}
                                </button>
                            ))}
                        </div>
                    </FL>
                    {err && <div style={{ fontSize:12, color:T.danger, fontFamily:T.sans, marginBottom:8, fontWeight:600 }}>{err}</div>}
                    <div style={{ padding:'10px 12px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:4, fontSize:12, color:T.inkMid, fontFamily:T.sans, lineHeight:1.5 }}>
                        Each request carries <code>X-Accelerep-Signature: sha256=…</code>, an HMAC-SHA256 of the exact body keyed by the destination's secret. Verify it on your endpoint. One attempt per event, 4 s timeout; after 10 consecutive failures the destination pauses itself.
                    </div>
                </div>
                <div style={{ padding:'12px 20px', borderTop:`1px solid ${T.border}`, background:T.surface2, display:'flex', gap:8, justifyContent:'flex-end' }}>
                    <SecBtn label="Cancel" onClick={requestClose} disabled={saving}/>
                    <SecBtn label={saving?'Adding…':'Add destination'} primary onClick={handleSave} disabled={saving}/>
                </div>
            </div>
        </div>
    );
};

// The secret, once. Shown after create and after rotate; never retrievable again.
const SecretRevealModal = ({ dest, secret, rotated, onClose }) => {
    const [copied, setCopied] = React.useState(false);
    // A secret shown once closes only by "I have stored it" (state §0.232; Jeff, 4 Nov: "Only "I've stored it""): Escape
    // is taken and does nothing — held as a save is.
    useLocalLayer(true, { onClose, busy: true });
    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.40)', zIndex:950, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background:T.surface, borderRadius:8, width:560, overflow:'hidden', boxShadow:'0 20px 56px rgba(20,16,12,0.28)', fontFamily:T.sans }}>
                <div style={{ padding:'16px 20px', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:16, fontWeight:700, color:T.ink }}>{rotated ? 'New signing secret' : 'Signing secret'} — {dest?.name}</div>
                    <div style={{ fontSize:12, color:T.inkMuted, marginTop:2 }}>Shown once. Store it where your receiver verifies signatures; Accelerep keeps only an encrypted copy and cannot show it again.</div>
                </div>
                <div style={{ padding:'18px 20px' }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <input readOnly value={secret} onClick={e => e.currentTarget.select()}
                            style={{ flex:1, padding:'9px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', background:T.bg, outline:'none' }}/>
                        <SecBtn label={copied ? '✓ Copied' : 'Copy'} primary onClick={() => { navigator.clipboard?.writeText(secret); setCopied(true); }}/>
                    </div>
                    {rotated && <div style={{ marginTop:12, fontSize:12, color:T.warn, fontWeight:600 }}>The previous secret stopped verifying the moment it was rotated.</div>}
                </div>
                <div style={{ padding:'12px 20px', borderTop:`1px solid ${T.border}`, background:T.surface2, display:'flex', justifyContent:'flex-end' }}>
                    <SecBtn label="I have stored it" primary onClick={onClose}/>
                </div>
            </div>
        </div>
    );
};

const fmtEventAge = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso), now = new Date();
    const diffMin = Math.round((now - d) / 60000);
    if (diffMin < 1)     return 'just now';
    if (diffMin < 60)    return diffMin + ' minutes ago';
    if (diffMin < 120)   return '1 hour ago';
    if (diffMin < 1440)  return Math.round(diffMin/60) + ' hours ago';
    if (diffMin < 2880)  return 'yesterday';
    if (diffMin < 10080) return Math.round(diffMin/1440) + ' days ago';
    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
};

const mapEntityTypeToCat = (entityType) => {
    const map = {
        user:'admin', role:'admin', territory:'admin', team:'admin',
        opportunity:'data', account:'data', contact:'data', lead:'data', task:'data', activity:'data', pipeline:'data', stage:'data', pricebook:'data', quote:'data', coaching_note:'data',
        // §0.143 — every write path writes the log; each new entity type has a home.
        saved_report:'data', report_delivery:'data', product:'data', document:'data', dashboard:'data', spiff_claim:'data', recommendation:'data',
        invoice:'data',   // §0.149 — the invoice a job produces
        dispatch_job:'data', dispatch_customer:'data', dispatch_technician:'data', dispatch_vehicle:'data', dispatch_equipment:'data', dispatch_plan:'data', dispatch_block:'data', lead_model:'data',
        apikey:'security', webhook:'security', setting:'security', settings:'security', export:'security', audit_stream:'security',
        ai_reading:'security', dsr:'security', export_schedule:'security', backup:'security', calendar_connection:'security',
        automation:'admin',
        login:'auth', mfa:'auth', sso:'auth', session:'auth',
        billing:'billing', plan:'billing', seat:'billing',
    };
    return map[(entityType||'').toLowerCase()] || 'admin';
};

const mapActionToSev = (action) => {
    const a = (action||'').toLowerCase();
    const warnSuffixes = ['failed','deleted','revoked','disabled','blocked','unauthorized','denied','error','cleared'];
    const warnExact = ['apikey.created','webhook.created','role.permission_changed','user.invited','export.bulk','setting.security_changed','mfa.policy_changed','sso.activated','audit_stream.created'];
    if (warnExact.includes(a)) return 'warn';
    if (warnSuffixes.some(s => a.endsWith('.' + s) || a.endsWith('_' + s))) return 'warn';
    return 'info';
};

const destStatusStyle = (status) => {
    if (status === 'Active')  return { bg:'rgba(77,107,61,0.12)',   fg:T.ok };
    if (status === 'Failing') return { bg:'rgba(156,58,46,0.12)',   fg:T.danger };
    if (status === 'Paused')  return { bg:'rgba(184,115,51,0.12)',  fg:T.warn };
    return { bg:'rgba(138,131,120,0.12)', fg:T.inkMid };
};

// Only the server's own refusal proves a destination's PUT or test wrote nothing (the review's fixes, round 3; its create
// and delete since round 4):
// audit-stream.mjs answers each refusal it words in the 4xx range (400, 403, 404) before its update or its delivery. A
// 5xx may come after them — the audit write and the caller's name follow the update, and the row is read again after a
// test's delivery — and a gateway's page, a 4xx without the server's words or a request that threw (it may have reached
// the server first) proves nothing: said as maybe, as the quota board's save says it (SalesManagerTab sendQuotas).
const destRefusedOwn = (res, body) => res.status >= 400 && res.status < 500 && typeof body?.error === 'string' && !!body.error.trim();
// A delete's 404 in the server's words proves the row is gone (the review's fixes, last pass): audit-stream.mjs answers
// "Destination not found." only when it finds no such row in this org, before its delete — on a first press, or on a
// second after a Remove that may have landed. A 404 page without the server's words proves nothing.
const destGone = (res, body) => res.status === 404 && destRefusedOwn(res, body);

export const AuditDetail = ({ onBack }) => {
    const { showConfirm } = useApp();
    const [catFilter,   setCatFilter]   = React.useState('All categories');
    const [actorFilter, setActorFilter] = React.useState('All actors');
    const [timeFilter,  setTimeFilter]  = React.useState('Last 7 days');
    const [search,      setSearch]      = React.useState('');
    const [activeRow,   setActiveRow]   = React.useState(null);
    const [exportOpen,  setExportOpen]  = React.useState(false);
    const rowBtnRefs   = React.useRef({});
    const exportBtnRef = React.useRef(null);

    // Live audit events — the last 500, newest first; never a mock.
    const [events, setEvents] = React.useState([]);
    const [eventsLoading, setEventsLoading] = React.useState(true);
    const [eventsError, setEventsError] = React.useState(null);

    // Streaming destinations — the endpoint's rows; never a mock.
    const [dests, setDests] = React.useState([]);
    const [destsLoading, setDestsLoading] = React.useState(true);
    const [destsRead, setDestsRead] = React.useState(false);     // the list was read: "No destinations." and the count only then
    const [destsUnread, setDestsUnread] = React.useState('');    // why the list is not known — kept until a read lands, never cleared by an action
    const [destError, setDestError] = React.useState('');
    const [showAddDest, setShowAddDest] = React.useState(false);
    const [reveal, setReveal] = React.useState(null);           // { dest, secret, rotated }
    const [busyId, setBusyId] = React.useState(null);           // a row with an action in flight
    const [testResult, setTestResult] = React.useState(null);   // { id, ok, status, error }
    const [statusUnread, setStatusUnread] = React.useState([]); // ids of rows whose status a landed answer could not show

    const loadDests = React.useCallback(async () => {
        const res = await dbFetch(STREAM_URL);
        // A refusal in readRefusal's words, its ref kept (docs/design/refusal-sweep Part 12, the review's fixes): said on
        // its own line, which an action's banner never clears — the list stays unknown until a read lands.
        if (!res.ok) { setDestsUnread(`Destinations did not load — ${await readRefusal(res)}`); return; }
        const listed = await res.json();
        // An answer with no list is no answer (docs/design/refusal-sweep Part 12): never drawn as "No destinations."
        if (!Array.isArray(listed?.destinations)) throw new Error('Its answer could not be read.');
        setDests(listed.destinations);
        setDestsRead(true);
        setDestsUnread('');
    }, []);

    // The ok check before the body (docs/design/refusal-sweep Part 12): the audit log's read said the server's words
    // without their ref, or "Unexpected token '<'" over a 502's page; a refusal says readRefusal's words, a failure
    // failureWords — the event stream says "The audit log did not load" over them, never a count of none.
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const auditRes = await dbFetch('/.netlify/functions/audit-log');
                if (cancelled) return;
                if (!auditRes.ok) throw new Error(await readRefusal(auditRes));
                const auditData = await auditRes.json();
                if (cancelled) return;
                if (!Array.isArray(auditData?.entries)) throw new Error('Its answer could not be read.');
                setEvents(auditData.entries.map(e => ({
                    id:     e.id,
                    when:   fmtEventAge(e.timestamp),
                    rawTs:  e.timestamp,
                    actor:  e.userName || e.userId || 'System',
                    action: e.action,
                    target: e.entityName || e.entityId || '—',
                    detail: e.detail || '',
                    cat:    mapEntityTypeToCat(e.entityType),
                    sev:    mapActionToSev(e.action),
                })));
            } catch (e) {
                if (!cancelled) setEventsError(failureWords(e));
            } finally {
                if (!cancelled) setEventsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);
    // The destinations are read at once, beside the audit log (the review's fixes, round 3): they waited for the log's
    // read, so a slow log held both Adds off, "still loading", with no request out. Neither read uses the other's answer.
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try { await loadDests(); } catch (e) { if (!cancelled) setDestsUnread(`Destinations did not load — ${failureWords(e)}`); }
            if (!cancelled) setDestsLoading(false);
        })();
        return () => { cancelled = true; };
    }, [loadDests]);

    const visible = events.filter(e => {
        if (catFilter === 'warn') { if (e.sev !== 'warn') return false; }
        else if (catFilter !== 'All categories' && e.cat !== catFilter) return false;
        if (actorFilter !== 'All actors' && e.actor !== actorFilter) return false;
        const limit = TIME_LIMITS[timeFilter];
        if (limit && e.rawTs && (Date.now() - new Date(e.rawTs).getTime()) > limit) return false;
        const q = search.toLowerCase();
        return !q || e.action.toLowerCase().includes(q) || e.actor.toLowerCase().includes(q) || (e.target||'').toLowerCase().includes(q) || (e.detail||'').toLowerCase().includes(q);
    });
    // The export offers only a log that was read (docs/design/refusal-sweep Part 12, the review's fixes): while it loads or
    // after its read failed, Export CSV and ▾ are off and say why — never "0 events", never a file of none.
    const eventsRead = !eventsLoading && !eventsError;
    const exportWhy = eventsError ? 'The audit log did not load — there is nothing to export' : eventsLoading ? 'The audit log is still loading' : undefined;

    const handleAddFilter = (key, val) => {
        if (key === 'actor')  setActorFilter(val);
        if (key === 'cat')    setCatFilter(val);
        if (key === 'action') setSearch(val);
        setActiveRow(null);
    };

    // ── destination actions — every one reads res.ok and adopts the server's row ──
    // A request that never left, or a landed answer that cannot be read, is said in plain words (docs/design/refusal-sweep
    // Part 12): each action rejected offline — the Add window stayed "Adding…" and the row busy, nothing said. A landed
    // answer that cannot be read is said as landed: the destination and its secret are the server's, and cannot be shown.
    const createDest = async (input) => {
        setDestError('');
        // An answer that proves nothing (the review's fixes, round 4) — never "not saved" over a destination the server may
        // have made: audit-stream.mjs answers each refusal it words in the 4xx range before its insert, a 5xx may come after
        // it (the audit write and the caller's name follow the insert), and a gateway's page or a request that threw proves
        // nothing. The window closes — a second press could make a second destination — and the list may be missing one.
        const maybeAdded = (words) => {
            setShowAddDest(false);
            setDestsRead(false);
            setDestsUnread(u => u || 'A destination may be missing from the list — reload the page to see every destination.');
            setDestError(`The destination may have been added — reload the page to see whether it was: ${words}`);
            return { ok: true };
        };
        try {
            const res = await dbFetch(STREAM_URL, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(input) });
            if (!res.ok) {
                const refused = await res.json().catch(() => null);
                if (destRefusedOwn(res, refused)) return { ok: false, error: refusalWords(res, refused) };
                return maybeAdded(refusalWords(res, refused));
            }
            const made = await res.json().catch(() => null);
            setShowAddDest(false);
            if (!made?.destination) {
                // The list no longer holds every destination (the review's fixes): no "No destinations." and no count under
                // it; a load's own failure, already said, is kept.
                setDestsRead(false);
                setDestsUnread(u => u || 'The list may be missing the destination just added — reload the page to see every destination.');
                setDestError('Destination added — Its answer could not be read, so its secret cannot be shown. Reload the page, then rotate its secret to see a new one.');
                return { ok: true };
            }
            setDests(prev => [...prev, made.destination]);
            setReveal({ dest: made.destination, secret: made.secret, rotated: false });
            return { ok: true };
        } catch (e) {
            return maybeAdded(failureWords(e));
        }
    };
    const putDest = async (body, label) => {
        setDestError(''); setBusyId(body.id);
        // An answer that proves nothing (the review's fixes, round 3) — never "not saved" over a Pause the server may have
        // made: a Pause / Resume leaves its row's status not known; a Rotate moves no status, and says its secret may be new.
        const maybeSaved = (words) => {
            if ('paused' in body) setStatusUnread(ids => [...ids, body.id]);
            setDestError(body.rotateSecret
                ? `The secret may have been rotated — reload the page to see whether it was, and rotate again to see a new one: ${words}`
                : `${label} may have been saved — reload the page to see whether it was: ${words}`);
        };
        try {
            const res = await dbFetch(STREAM_URL, { method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) {
                const refused = await res.json().catch(() => null);
                if (destRefusedOwn(res, refused)) setDestError(`${label} not saved — ${refusalWords(res, refused)}`);
                else maybeSaved(refusalWords(res, refused));
                return null;
            }
            const saved = await res.json().catch(() => null);
            if (!saved?.destination) {
                // A Pause / Resume that landed unread leaves its row's status unknown (the review's fixes, round 2): never
                // drawn as the old status, counted in the badge or offered as its old Pause / Resume.
                if ('paused' in body) setStatusUnread(ids => [...ids, body.id]);
                setDestError(`${label} saved — Its answer could not be read${body.rotateSecret ? ', so the new secret cannot be shown; rotate again to see one' : ''}. Reload the page to see the destination.`);
                return null;
            }
            setDests(prev => prev.map(d => d.id === saved.destination.id ? saved.destination : d));
            setStatusUnread(ids => ids.filter(id => id !== saved.destination.id));
            return saved;
        } catch (e) {
            maybeSaved(failureWords(e));
            return null;
        } finally { setBusyId(null); }
    };
    // The ok check before the body (docs/design/refusal-sweep Part 12): a refusal said its words without the ref, and
    // offline the test rejected with nothing said (try/finally, no catch).
    const sendTest = async (dest) => {
        setDestError(''); setBusyId(dest.id); setTestResult(null);
        // An answer that proves nothing (the review's fixes, round 3): the test may have gone out, moving the row's status.
        const maybeSent = (words) => {
            setStatusUnread(ids => [...ids, dest.id]);
            setDestError(`The test may have been sent — reload the page to see whether it was: ${words}`);
        };
        try {
            const res = await dbFetch(`${STREAM_URL}?test=${encodeURIComponent(dest.id)}`, { method:'POST' });
            if (!res.ok) {
                const refused = await res.json().catch(() => null);
                if (destRefusedOwn(res, refused)) setDestError(`Test not sent — ${refusalWords(res, refused)}`);
                else maybeSent(refusalWords(res, refused));
                return;
            }
            const tested = await res.json().catch(() => null);
            // A test that landed unread leaves the row's status unknown (a delivery or a failure moves it).
            if (!tested) { setStatusUnread(ids => [...ids, dest.id]); setDestError('Test sent — Its answer could not be read, so whether it was delivered is not known.'); return; }
            setTestResult({ id: dest.id, ok: tested.ok, status: tested.status, error: tested.error });
            if (tested.destination) {
                setDests(prev => prev.map(d => d.id === tested.destination.id ? tested.destination : d));
                setStatusUnread(ids => ids.filter(id => id !== tested.destination.id));
            }
        } catch (e) {
            maybeSent(failureWords(e));
        } finally { setBusyId(null); }
    };
    const rotate = (dest) => showConfirm(`Rotate the signing secret for "${dest.name}"? The current secret stops verifying immediately; you will see the new one once.`, async () => {
        const data = await putDest({ id: dest.id, rotateSecret: true }, 'Rotate secret');
        if (data?.newSecret) setReveal({ dest: data.destination, secret: data.newSecret, rotated: true });
    }, true);
    const remove = (dest) => showConfirm(`Remove destination "${dest.name}"? Audit events stop going there at once.`, async () => {
        setDestError(''); setBusyId(dest.id);
        // An answer that proves nothing (the review's fixes, round 4): audit-stream.mjs answers each refusal it words (400,
        // 403, 404) before its delete, and a 5xx may come after it (the audit write and the caller's name follow the delete).
        // The row is kept, its status not known — never drawn as a live destination with a Pause.
        const maybeRemoved = (words) => {
            setStatusUnread(ids => [...ids, dest.id]);
            setDestError(`The destination may have been removed — reload the page to see whether it was: ${words}`);
        };
        try {
            const res = await dbFetch(`${STREAM_URL}?id=${encodeURIComponent(dest.id)}`, { method:'DELETE' });
            if (!res.ok) {
                const refused = await res.json().catch(() => null);
                if (destGone(res, refused)) {
                    setDests(rows => rows.filter(row => row.id !== dest.id));
                    setStatusUnread(ids => ids.filter(id => id !== dest.id));
                    setDestError('The destination was already removed.');
                }
                else if (destRefusedOwn(res, refused)) setDestError(`Remove destination failed — ${refusalWords(res, refused)}`);
                else maybeRemoved(refusalWords(res, refused));
                return;
            }
            setDests(prev => prev.filter(d => d.id !== dest.id));
        } catch (e) {
            maybeRemoved(failureWords(e));
        } finally { setBusyId(null); }
    }, true);

    // A count only over a list that was read (the review's fixes): a failed load, or a create whose answer could not be
    // read, leaves the list unknown — "Streaming to 1 destination" over it would be a count of what is not known.
    // A row whose status a landed answer could not show (the review's fixes, round 2) is counted as not known — never
    // as delivering or not delivering.
    const unknownCount = dests.filter(d => statusUnread.includes(d.id)).length;
    const activeCount = dests.filter(d => d.status === 'Active' && !statusUnread.includes(d.id)).length;
    const notDelivering = dests.length - activeCount - unknownCount;
    const streamingBadge = destsRead && dests.length ? `Streaming to ${dests.length} destination${dests.length === 1 ? '' : 's'}${notDelivering ? ` · ${notDelivering} not delivering` : ''}${unknownCount ? ` · ${unknownCount} status not known` : ''}` : undefined;
    // No green ✓ beside a status not known (the review's fixes, round 3): a warning mark while any row's is (§0.247).
    const streamingTone = unknownCount ? 'warn' : 'ok';

    const catStyle = (cat) => {
        const map = { auth:'rgba(58,90,122,0.12)', security:'rgba(156,58,46,0.10)', admin:'rgba(77,107,61,0.10)', data:'rgba(200,185,154,0.20)', billing:'rgba(184,115,51,0.10)' };
        const col = { auth:T.info, security:T.danger, admin:T.ok, data:T.goldInk, billing:T.warn };
        return { bg: map[cat] || 'rgba(138,131,120,0.10)', fg: col[cat] || T.inkMid };
    };
    const fmtWhen = (iso) => iso ? new Date(iso).toLocaleString() : 'never';
    // No Add while the list is loading (the review's fixes, round 2): a landed Add could not then race its first read.
    const addWhy = destsLoading ? 'The destinations are still loading' : undefined;

    return (
        <div style={{ fontFamily:T.sans }}>
            {showAddDest && <AddDestinationModal onClose={() => setShowAddDest(false)} onSave={createDest}/>}
            {reveal && <SecretRevealModal dest={reveal.dest} secret={reveal.secret} rotated={reveal.rotated} onClose={() => setReveal(null)}/>}

            <SecCrumb page="Audit log" onBack={onBack}/>
            <SecTitle
                title="Audit log"
                sub={eventsError ? 'The audit log did not load' : eventsLoading ? 'The audit log is still loading…' : `${visible.length} of ${events.length} events · ${timeFilter} · the last 500 events are loaded`}
                badge={streamingBadge}
                badgeTone={streamingTone}
                updatedAt="Events are written by the server as things happen"
                actions={[
                    <div key="exp" style={{ display:'inline-flex', position:'relative' }}>
                        <button disabled={!eventsRead} title={exportWhy} onClick={() => { if (eventsRead) downloadEvents(visible, 'CSV'); }}
                            style={{ padding:'7px 12px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRight:'none', borderRadius:`${T.r}px 0 0 ${T.r}px`, fontSize:12.5, fontWeight:600, color: eventsRead ? T.ink : T.inkMuted, cursor: eventsRead ? 'pointer' : 'not-allowed', fontFamily:T.sans }}>
                            Export CSV
                        </button>
                        <button ref={exportBtnRef} disabled={!eventsRead} title={exportWhy} onClick={() => { if (eventsRead) setExportOpen(o => !o); }}
                            style={{ padding:'7px 8px', background: exportOpen ? T.surface2 : T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:`0 ${T.r}px ${T.r}px 0`, fontSize:10, color: eventsRead ? T.inkMid : T.inkMuted, cursor: eventsRead ? 'pointer' : 'not-allowed', display:'inline-flex', alignItems:'center', fontFamily:T.sans }}>▾</button>
                        {exportOpen && eventsRead && (
                            <AuditAnchoredMenu btnRef={exportBtnRef} onClose={() => setExportOpen(false)} alignRight={true}>
                                <AuditExportDropdown events={visible} onClose={() => setExportOpen(false)}/>
                            </AuditAnchoredMenu>
                        )}
                    </div>,
                    <span key="add" title={addWhy} style={{ display:'inline-flex' }}><SecBtn label="+ Add destination" primary disabled={destsLoading} onClick={() => { if (!destsLoading) setShowAddDest(true); }}/></span>,
                ]}/>

            {/* ── Filters ── */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:'14px 16px', marginBottom:16 }}>
                <div style={{ fontSize:13.5, fontWeight:700, color:T.ink, marginBottom:12 }}>Filters</div>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search action, actor, target, detail…"
                        style={{ flex:1, minWidth:180, padding:'7px 12px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface }}/>
                    <PolicySelect label="" value={catFilter} width={260}><AuditCategoryDropdown value={catFilter} onChange={setCatFilter}/></PolicySelect>
                    <PolicySelect label="" value={actorFilter} width={300}><AuditActorDropdown value={actorFilter} onChange={setActorFilter} events={events}/></PolicySelect>
                    <PolicySelect label="" value={timeFilter} width={260}><AuditTimeDropdown value={timeFilter} onChange={setTimeFilter}/></PolicySelect>
                    {(catFilter !== 'All categories' || actorFilter !== 'All actors' || search) && (
                        <button onClick={() => { setCatFilter('All categories'); setActorFilter('All actors'); setSearch(''); }}
                            style={{ fontSize:12, color:T.danger, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans, fontWeight:600, whiteSpace:'nowrap' }}>Clear filters</button>
                    )}
                    <span style={{ fontSize:12.5, color:T.inkMuted, whiteSpace:'nowrap', marginLeft:'auto' }}>{eventsError ? 'Not loaded' : eventsLoading ? 'Loading…' : <>Showing {visible.length} of {events.length}</>}</span>
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
                            {['WHEN','ACTOR','ACTION','TARGET','CATEGORY'].map((h,i) => (
                                <th key={i} style={{ padding:'8px 14px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign:'left' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {!eventsLoading && events.length === 0 && (
                            <tr><td colSpan={5} style={{ padding:'48px', textAlign:'center', color:T.inkMuted, fontSize:13, fontFamily:T.sans }}>
                                <div style={{ fontWeight:600, color:T.ink, marginBottom:4 }}>{eventsError ? 'The audit log did not load' : 'No audit events yet'}</div>
                                <div>{eventsError ? eventsError : 'Events appear here as users take actions in the app.'}</div>
                            </td></tr>
                        )}
                        {visible.length === 0 && events.length > 0 && (
                            <tr><td colSpan={5} style={{ padding:'32px', textAlign:'center', color:T.inkMuted, fontSize:13, fontFamily:T.sans }}>No events match these filters.</td></tr>
                        )}
                        {visible.map((ev, i) => {
                            const cs = catStyle(ev.cat);
                            const isWarn = ev.sev === 'warn';
                            const isActive = activeRow === i;
                            return (
                                <tr key={ev.id || i} ref={el => rowBtnRefs.current[i] = el}
                                    style={{ borderBottom:`1px solid ${T.border}`, background: isActive ? 'rgba(200,185,154,0.18)' : isWarn ? 'rgba(184,115,51,0.05)' : 'transparent', cursor:'pointer' }}
                                    onClick={() => setActiveRow(isActive ? null : i)}>
                                    <td style={{ padding:'9px 14px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, color:T.inkMuted, whiteSpace:'nowrap' }}>{ev.when}</td>
                                    <td style={{ padding:'9px 14px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.ink, whiteSpace:'nowrap' }}>{ev.actor}</td>
                                    <td style={{ padding:'9px 14px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12.5, fontWeight:600, color:isWarn?T.warn:T.ink, whiteSpace:'nowrap' }}>{ev.action}</td>
                                    <td style={{ padding:'9px 14px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.inkMid, maxWidth:260, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ev.target}</td>
                                    <td style={{ padding:'9px 14px' }}>
                                        <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:3, fontSize:11, fontWeight:700, background:cs.bg, color:cs.fg }}>{ev.cat}</span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {activeRow !== null && visible[activeRow] && (
                    <AuditAnchoredMenu btnRef={{ current: rowBtnRefs.current[activeRow] }} onClose={() => setActiveRow(null)} alignRight={false}>
                        <AuditEventPopover event={visible[activeRow]} events={events} onClose={() => setActiveRow(null)} onAddFilter={handleAddFilter}/>
                    </AuditAnchoredMenu>
                )}
            </div>

            {/* ── Streaming destinations ── */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px 8px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
                    <div>
                        <div style={{ fontSize:13.5, fontWeight:700, color:T.ink }}>Streaming destinations</div>
                        <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>Every audit event is POSTed to each destination as it is written, signed with HMAC-SHA256. One attempt, 4 s timeout, no queue; ten consecutive failures pause a destination.</div>
                    </div>
                    <span title={addWhy} style={{ display:'inline-flex' }}><SecBtn label="+ Add destination" disabled={destsLoading} onClick={() => { if (!destsLoading) setShowAddDest(true); }}/></span>
                </div>
                {!destsLoading && !destsRead && (
                    <div style={{ padding:'9px 16px', background:'rgba(156,58,46,0.08)', borderBottom:`1px solid ${T.border}`, color:T.danger, fontSize:12, fontWeight:600 }}>{destsUnread || 'The destinations could not be read — reload the page to see every destination.'}</div>
                )}
                {destError && (
                    <div style={{ padding:'9px 16px', background:'rgba(156,58,46,0.08)', borderBottom:`1px solid ${T.border}`, color:T.danger, fontSize:12, fontWeight:600 }}>{destError}</div>
                )}
                <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:T.sans }}>
                    <thead>
                        <tr style={{ background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
                            {['DESTINATION','ENDPOINT','FORMAT','STATUS','LAST DELIVERED','ACTIONS'].map((h,i) => (
                                <th key={i} style={{ padding:'8px 14px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign: i===5 ? 'right' : 'left' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {destsLoading && <tr><td colSpan={6} style={{ padding:'20px', textAlign:'center', color:T.inkMuted, fontSize:12.5 }}>Loading…</td></tr>}
                        {!destsLoading && destsRead && dests.length === 0 && (
                            <tr><td colSpan={6} style={{ padding:'28px', textAlign:'center', color:T.inkMuted, fontSize:13 }}>No destinations. Audit events are kept here and go nowhere else until you add one.</td></tr>
                        )}
                        {dests.map((s, i) => {
                            const unknown = statusUnread.includes(s.id);
                            const st = destStatusStyle(unknown ? null : s.status);
                            const busy = busyId === s.id;
                            const tr = testResult?.id === s.id ? testResult : null;
                            return (
                                <tr key={s.id} style={{ borderBottom:i<dests.length-1?`1px solid ${T.border}`:'none', verticalAlign:'top' }}>
                                    <td style={{ padding:'10px 14px' }}>
                                        <div style={{ fontWeight:600, color:T.ink, fontSize:13 }}>{s.name}</div>
                                        <div style={{ fontSize:10.5, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', marginTop:2 }}>secret …{s.secretHint || '????'}</div>
                                    </td>
                                    <td style={{ padding:'10px 14px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, color:T.inkMuted, maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={s.url}>{s.url}</td>
                                    <td style={{ padding:'10px 14px' }}>
                                        <span style={{ display:'inline-block', padding:'2px 6px', borderRadius:3, fontSize:11, fontWeight:600, background:'rgba(138,131,120,0.12)', color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace' }}>{s.fmt}</span>
                                    </td>
                                    <td style={{ padding:'10px 14px' }}>
                                        <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700, background:st.bg, color:st.fg }}>{unknown ? 'Not known' : s.status}</span>
                                        {unknown && <div style={{ fontSize:10.5, color:T.danger, marginTop:4, maxWidth:220, lineHeight:1.4 }}>Its status could not be read — reload the page to see it.</div>}
                                        {!unknown && s.lastError && <div style={{ fontSize:10.5, color:s.status==='Paused'?T.warn:T.danger, marginTop:4, maxWidth:220, lineHeight:1.4 }}>{s.lastError}</div>}
                                        {tr && <div style={{ fontSize:10.5, color:tr.ok?T.ok:T.danger, marginTop:4, fontWeight:600 }}>{tr.ok ? `Test delivered · ${tr.status}` : `Test failed · ${tr.error || tr.status}`}</div>}
                                    </td>
                                    <td style={{ padding:'10px 14px', fontSize:12, color:T.inkMid }}>
                                        {fmtWhen(s.lastDeliveredAt)}
                                        {s.deliveredCount > 0 && <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:2 }}>{s.deliveredCount} delivered</div>}
                                    </td>
                                    <td style={{ padding:'10px 14px', textAlign:'right', whiteSpace:'nowrap' }}>
                                        <div style={{ display:'inline-flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                                            <SecBtn label={busy ? '…' : 'Send test event'} disabled={busy} onClick={() => sendTest(s)}/>
                                            <SecBtn label={unknown ? 'Pause / Resume' : s.paused ? 'Resume' : 'Pause'} disabled={busy || unknown} onClick={() => putDest({ id: s.id, paused: !s.paused }, s.paused ? 'Resume' : 'Pause')}/>
                                            <SecBtn label="Rotate secret" disabled={busy} onClick={() => rotate(s)}/>
                                            <SecBtn label="Remove" warn disabled={busy} onClick={() => remove(s)}/>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
