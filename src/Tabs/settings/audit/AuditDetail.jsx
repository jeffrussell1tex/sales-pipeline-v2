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
import { dbFetch } from '../../../utils/storage';
import { useApp } from '../../../AppContext';
import { T } from '../shared/tokens.js';
import { SecCrumb, SecTitle, SecBtn, DropdownPanel, DropdownOption, PolicySelect } from '../security/shared.jsx';

const STREAM_URL = '/.netlify/functions/audit-stream';
const errorOf = async (res, fallback) => { try { const b = await res.json(); return b?.error || fallback; } catch { return fallback; } };

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
    a.href = url; a.download = `accelerep-audit-${new Date().toISOString().split('T')[0]}.${ext}`;
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
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
    }, []);
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
    const inpSt = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' };
    const handleSave = async () => {
        setSaving(true); setErr('');
        const r = await onSave({ name: dest, url, fmt });
        setSaving(false);
        if (!r.ok) setErr(r.error || 'Not saved.');
    };
    return (
        <div onClick={saving ? undefined : onClose} style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.40)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background:T.surface, borderRadius:8, width:540, display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 56px rgba(20,16,12,0.28)' }}>
                <div style={{ padding:'16px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                        <div style={{ fontSize:16, fontWeight:700, color:T.ink }}>Add streaming destination</div>
                        <div style={{ fontSize:12, color:T.inkMuted, marginTop:2 }}>Every audit event is POSTed here as it is written, signed with a secret you will see once.</div>
                    </div>
                    <button onClick={onClose} style={{ background:'none', border:'none', color:T.inkMuted, fontSize:20, cursor:'pointer', lineHeight:1 }}>×</button>
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
                    <SecBtn label="Cancel" onClick={onClose} disabled={saving}/>
                    <SecBtn label={saving?'Adding…':'Add destination'} primary onClick={handleSave} disabled={saving}/>
                </div>
            </div>
        </div>
    );
};

// The secret, once. Shown after create and after rotate; never retrievable again.
const SecretRevealModal = ({ dest, secret, rotated, onClose }) => {
    const [copied, setCopied] = React.useState(false);
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
        apikey:'security', webhook:'security', setting:'security', settings:'security', export:'security', audit_stream:'security',
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
    const [destError, setDestError] = React.useState('');
    const [showAddDest, setShowAddDest] = React.useState(false);
    const [reveal, setReveal] = React.useState(null);           // { dest, secret, rotated }
    const [busyId, setBusyId] = React.useState(null);           // a row with an action in flight
    const [testResult, setTestResult] = React.useState(null);   // { id, ok, status, error }

    const loadDests = React.useCallback(async () => {
        const res = await dbFetch(STREAM_URL);
        if (!res.ok) { setDestError(await errorOf(res, `Destinations did not load (${res.status}).`)); return; }
        const data = await res.json();
        setDests(Array.isArray(data?.destinations) ? data.destinations : []);
    }, []);

    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const auditRes = await dbFetch('/.netlify/functions/audit-log');
                if (cancelled) return;
                const auditData = await auditRes.json();
                if (auditRes.ok && Array.isArray(auditData.entries)) {
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
                } else if (!auditRes.ok) {
                    setEventsError(auditData?.error || `The audit log did not load (${auditRes.status}).`);
                }
            } catch (e) {
                if (!cancelled) setEventsError(e.message);
            } finally {
                if (!cancelled) setEventsLoading(false);
            }
            try { await loadDests(); } catch (e) { if (!cancelled) setDestError(e.message); }
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

    const handleAddFilter = (key, val) => {
        if (key === 'actor')  setActorFilter(val);
        if (key === 'cat')    setCatFilter(val);
        if (key === 'action') setSearch(val);
        setActiveRow(null);
    };

    // ── destination actions — every one reads res.ok and adopts the server's row ──
    const createDest = async (input) => {
        setDestError('');
        const res = await dbFetch(STREAM_URL, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(input) });
        if (!res.ok) return { ok: false, error: await errorOf(res, `The server returned ${res.status}.`) };
        const data = await res.json();
        setDests(prev => [...prev, data.destination]);
        setShowAddDest(false);
        setReveal({ dest: data.destination, secret: data.secret, rotated: false });
        return { ok: true };
    };
    const putDest = async (body, label) => {
        setDestError(''); setBusyId(body.id);
        try {
            const res = await dbFetch(STREAM_URL, { method:'PUT', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) { setDestError(`${label} not saved — ${await errorOf(res, `the server returned ${res.status}`)}`); return null; }
            const data = await res.json();
            setDests(prev => prev.map(d => d.id === data.destination.id ? data.destination : d));
            return data;
        } finally { setBusyId(null); }
    };
    const sendTest = async (dest) => {
        setDestError(''); setBusyId(dest.id); setTestResult(null);
        try {
            const res = await dbFetch(`${STREAM_URL}?test=${encodeURIComponent(dest.id)}`, { method:'POST' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { setDestError(`Test not sent — ${data?.error || `the server returned ${res.status}`}`); return; }
            setTestResult({ id: dest.id, ok: data.ok, status: data.status, error: data.error });
            if (data.destination) setDests(prev => prev.map(d => d.id === data.destination.id ? data.destination : d));
        } finally { setBusyId(null); }
    };
    const rotate = (dest) => showConfirm(`Rotate the signing secret for "${dest.name}"? The current secret stops verifying immediately; you will see the new one once.`, async () => {
        const data = await putDest({ id: dest.id, rotateSecret: true }, 'Rotate secret');
        if (data?.newSecret) setReveal({ dest: data.destination, secret: data.newSecret, rotated: true });
    }, true);
    const remove = (dest) => showConfirm(`Remove destination "${dest.name}"? Audit events stop going there at once.`, async () => {
        setDestError(''); setBusyId(dest.id);
        try {
            const res = await dbFetch(`${STREAM_URL}?id=${encodeURIComponent(dest.id)}`, { method:'DELETE' });
            if (!res.ok) { setDestError(`Remove destination failed — ${await errorOf(res, `the server returned ${res.status}`)}`); return; }
            setDests(prev => prev.filter(d => d.id !== dest.id));
        } finally { setBusyId(null); }
    }, true);

    const activeCount = dests.filter(d => d.status === 'Active').length;
    const streamingBadge = dests.length ? `Streaming to ${dests.length} destination${dests.length === 1 ? '' : 's'}${activeCount < dests.length ? ` · ${dests.length - activeCount} not delivering` : ''}` : undefined;

    const catStyle = (cat) => {
        const map = { auth:'rgba(58,90,122,0.12)', security:'rgba(156,58,46,0.10)', admin:'rgba(77,107,61,0.10)', data:'rgba(200,185,154,0.20)', billing:'rgba(184,115,51,0.10)' };
        const col = { auth:T.info, security:T.danger, admin:T.ok, data:T.goldInk, billing:T.warn };
        return { bg: map[cat] || 'rgba(138,131,120,0.10)', fg: col[cat] || T.inkMid };
    };
    const fmtWhen = (iso) => iso ? new Date(iso).toLocaleString() : 'never';

    return (
        <div style={{ fontFamily:T.sans }}>
            {showAddDest && <AddDestinationModal onClose={() => setShowAddDest(false)} onSave={createDest}/>}
            {reveal && <SecretRevealModal dest={reveal.dest} secret={reveal.secret} rotated={reveal.rotated} onClose={() => setReveal(null)}/>}

            <SecCrumb page="Audit log" onBack={onBack}/>
            <SecTitle
                title="Audit log"
                sub={`${visible.length} of ${events.length} events · ${timeFilter} · the last 500 events are loaded`}
                badge={streamingBadge}
                updatedAt="Events are written by the server as things happen"
                actions={[
                    <div key="exp" style={{ display:'inline-flex', position:'relative' }}>
                        <button onClick={() => downloadEvents(visible, 'CSV')}
                            style={{ padding:'7px 12px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRight:'none', borderRadius:`${T.r}px 0 0 ${T.r}px`, fontSize:12.5, fontWeight:600, color:T.ink, cursor:'pointer', fontFamily:T.sans }}>
                            Export CSV
                        </button>
                        <button ref={exportBtnRef} onClick={() => setExportOpen(o => !o)}
                            style={{ padding:'7px 8px', background: exportOpen ? T.surface2 : T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:`0 ${T.r}px ${T.r}px 0`, fontSize:10, color:T.inkMid, cursor:'pointer', display:'inline-flex', alignItems:'center', fontFamily:T.sans }}>▾</button>
                        {exportOpen && (
                            <AuditAnchoredMenu btnRef={exportBtnRef} onClose={() => setExportOpen(false)} alignRight={true}>
                                <AuditExportDropdown events={visible} onClose={() => setExportOpen(false)}/>
                            </AuditAnchoredMenu>
                        )}
                    </div>,
                    <SecBtn key="add" label="+ Add destination" primary onClick={() => setShowAddDest(true)}/>,
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
                    <span style={{ fontSize:12.5, color:T.inkMuted, whiteSpace:'nowrap', marginLeft:'auto' }}>Showing {visible.length} of {events.length}{eventsLoading ? ' (loading…)' : ''}</span>
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
                    <SecBtn label="+ Add destination" onClick={() => setShowAddDest(true)}/>
                </div>
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
                        {!destsLoading && dests.length === 0 && (
                            <tr><td colSpan={6} style={{ padding:'28px', textAlign:'center', color:T.inkMuted, fontSize:13 }}>No destinations. Audit events are kept here and go nowhere else until you add one.</td></tr>
                        )}
                        {dests.map((s, i) => {
                            const st = destStatusStyle(s.status);
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
                                        <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700, background:st.bg, color:st.fg }}>{s.status}</span>
                                        {s.lastError && <div style={{ fontSize:10.5, color:s.status==='Paused'?T.warn:T.danger, marginTop:4, maxWidth:220, lineHeight:1.4 }}>{s.lastError}</div>}
                                        {tr && <div style={{ fontSize:10.5, color:tr.ok?T.ok:T.danger, marginTop:4, fontWeight:600 }}>{tr.ok ? `Test delivered · ${tr.status}` : `Test failed · ${tr.error || tr.status}`}</div>}
                                    </td>
                                    <td style={{ padding:'10px 14px', fontSize:12, color:T.inkMid }}>
                                        {fmtWhen(s.lastDeliveredAt)}
                                        {s.deliveredCount > 0 && <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:2 }}>{s.deliveredCount} delivered</div>}
                                    </td>
                                    <td style={{ padding:'10px 14px', textAlign:'right', whiteSpace:'nowrap' }}>
                                        <div style={{ display:'inline-flex', gap:6, flexWrap:'wrap', justifyContent:'flex-end' }}>
                                            <SecBtn label={busy ? '…' : 'Send test event'} disabled={busy} onClick={() => sendTest(s)}/>
                                            <SecBtn label={s.paused ? 'Resume' : 'Pause'} disabled={busy} onClick={() => putDest({ id: s.id, paused: !s.paused }, s.paused ? 'Resume' : 'Pause')}/>
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
