import React, { useState, useMemo } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';

// ── Design tokens ────────────────────────────────────────────
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

const eb = (color) => ({ fontSize: 11, fontWeight: 700, color: color || T.inkMuted, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: T.sans });

// ── Category colours ─────────────────────────────────────────
const CATEGORY_TINT = {
    'Profile & Account': { bg: '#f0f4ea', fg: '#4d6b3d' },
    'Company':           { bg: '#ede7db', fg: '#7a6a48' },
    'Sales process':     { bg: '#ece7f2', fg: '#5e4e7a' },
    'Quoting':           { bg: '#f0ece1', fg: '#8a6a3a' },
    'People & Teams':    { bg: '#e6eef0', fg: '#3a5a6a' },
    'Integrations':      { bg: '#eaf0e6', fg: '#4d6b3d' },
    'Security':          { bg: '#f4ebe4', fg: '#9c5a3a' },
    'Data':              { bg: '#ede7db', fg: '#7a6a48' },
};

// ── Status chip ───────────────────────────────────────────────
const STATUS_STYLES = {
    ok:        { bg: 'rgba(77,107,61,0.10)',   fg: '#4d6b3d', icon: '✓' },
    connected: { bg: 'rgba(77,107,61,0.10)',   fg: '#4d6b3d', icon: '●' },
    partial:   { bg: 'rgba(184,115,51,0.10)',  fg: '#b87333', icon: '◐' },
    warning:   { bg: 'rgba(156,58,46,0.10)',   fg: '#9c3a2e', icon: '⚠' },
    none:      { bg: 'rgba(138,131,120,0.12)', fg: '#5a544c', icon: '○' },
    linked:    { bg: 'rgba(58,90,122,0.10)',   fg: '#3a5a7a', icon: '↗' },
    fail:      { bg: 'rgba(156,58,46,0.10)',   fg: '#9c3a2e', icon: '✕' },
};
const StatusChip = ({ status, detail, small }) => {
    const s = STATUS_STYLES[status] || STATUS_STYLES.ok;
    return (
        <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding: small ? '1px 6px' : '2px 8px', background:s.bg, color:s.fg, borderRadius:T.r, fontSize: small ? 10.5 : 11, fontWeight:600, letterSpacing:0.2, whiteSpace:'nowrap', fontFamily:T.sans }}>
            <span style={{ fontSize: small ? 9 : 10 }}>{s.icon}</span>
            {detail || status}
        </span>
    );
};

// ── NEW badge ────────────────────────────────────────────────
const NewBadge = () => (
    <span style={{ display:'inline-block', padding:'1px 5px', fontSize:9, fontWeight:700, letterSpacing:0.6, color:'#7a6a48', background:'rgba(200,185,154,0.25)', border:'1px solid rgba(200,185,154,0.5)', borderRadius:2, verticalAlign:'middle', fontFamily:T.sans }}>NEW</span>
);

// ── Setting icon tile ────────────────────────────────────────
const SettingIcon = ({ category, size = 34 }) => {
    const t = CATEGORY_TINT[category] || { bg: '#eee', fg: '#555' };
    return (
        <div style={{ width:size, height:size, background:t.bg, borderRadius:6, display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <div style={{ width:14, height:14, background:t.fg, borderRadius:2, opacity:0.85 }}/>
        </div>
    );
};

// ── Avatar ───────────────────────────────────────────────────
const avatarBg = (name) => {
    const p = ['#9c6b4a','#7a5a3c','#5a6e5a','#6b5a7a','#8a5a5a','#5a7a8a','#7a6b5a','#4a6b5a'];
    let h = 0; for (const c of (name||'')) h = (h * 31 + c.charCodeAt(0)) | 0;
    return p[Math.abs(h) % p.length];
};
const Avatar = ({ name, size = 28 }) => {
    const initials = (name||'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
    return (
        <div style={{ width:size, height:size, borderRadius:'50%', background:avatarBg(name), color:'#fef4e6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*0.33, fontWeight:700, flexShrink:0 }}>{initials}</div>
    );
};

// ── Toggle (visual only) ──────────────────────────────────────
const RToggle = ({ on, onChange }) => (
    <div onClick={() => onChange && onChange(!on)} style={{ width:28, height:16, borderRadius:10, padding:2, flexShrink:0, background: on ? T.ink : '#d4c8b4', transition:'background 120ms', cursor:'pointer' }}>
        <div style={{ width:12, height:12, borderRadius:'50%', background:'#fbf8f3', transform: on ? 'translateX(12px)' : 'translateX(0)', transition:'transform 120ms' }}/>
    </div>
);

// ── Checkbox ─────────────────────────────────────────────────
const RCheck = ({ on, onChange }) => (
    <div style={{ display:'flex', justifyContent:'center' }}>
        <div onClick={() => onChange && onChange(!on)} style={{ width:16, height:16, borderRadius:3, border:`1.5px solid ${on ? T.ink : '#d4c8b4'}`, background: on ? T.ink : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:'#fbf8f3', fontWeight:700, cursor:'pointer' }}>
            {on ? '✓' : ''}
        </div>
    </div>
);

// ── Ring (quota/health gauge) ─────────────────────────────────
const Ring = ({ value=0, max=100, size=72, stroke=7, color='#4d6b3d', trackColor }) => {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const pct = Math.max(0, Math.min(1, value / max));
    return (
        <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
            <svg width={size} height={size}>
                <circle cx={size/2} cy={size/2} r={r} stroke={trackColor || T.border} strokeWidth={stroke} fill="none"/>
                <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={c*(1-pct)} strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}/>
            </svg>
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:Math.round(size*0.22), fontWeight:700, color:T.ink, fontFamily:T.sans }}>
                {Math.round(pct*100)}%
            </div>
        </div>
    );
};

// ── Category chip ─────────────────────────────────────────────
const CategoryChip = ({ category }) => {
    const t = CATEGORY_TINT[category] || { bg:'#eee', fg:'#555' };
    return (
        <span style={{ display:'inline-block', padding:'2px 7px', background:t.bg, color:t.fg, borderRadius:T.r, fontSize:10.5, fontWeight:600, letterSpacing:0.2, fontFamily:T.sans }}>{category}</span>
    );
};

// ── SETTINGS_ITEMS ─────────────────────────────────────────────
// Static catalogue matching the design's settings-shared.jsx
const SETTINGS_ITEMS = [
    // Personal
    { id:'my-calendar',      scope:'personal', category:'Profile & Account', name:'Calendar sync',              desc:'Connect Google or Outlook to sync meetings and availability', status:'connected', statusDetail:'Google · connected', updatedBy:'You', updatedAt:'3 days ago',   isNew:false },
    { id:'my-notifications', scope:'personal', category:'Profile & Account', name:'Notifications',              desc:'Email, in-app, and push for mentions, approvals, quote opens', status:'partial',   statusDetail:'5 of 12 channels on', updatedBy:'You', updatedAt:'2 weeks ago', isNew:true  },
    { id:'my-signature',     scope:'personal', category:'Profile & Account', name:'Email signature & templates', desc:'Signature block and your saved email templates',               status:'ok',        statusDetail:'3 templates · signature set', updatedBy:'You', updatedAt:'1 month ago', isNew:true },
    { id:'my-api',           scope:'personal', category:'Profile & Account', name:'My API tokens',              desc:'Personal access tokens for API calls',                         status:'none',      statusDetail:'No tokens', updatedBy:'—', updatedAt:'—',                     isNew:false },
    // Company
    { id:'company-profile',  scope:'workspace', category:'Company', name:'Company profile',        desc:'Logo, address, phone, and default quote header',              status:'ok',      statusDetail:'Complete',                    updatedBy:'Admin', updatedAt:'2 months ago' },
    { id:'fiscal-year',      scope:'workspace', category:'Company', name:'Fiscal year',            desc:'Quarter starts and fiscal year alignment',                    status:'ok',      statusDetail:'Q1 starts Feb 1',             updatedBy:'Admin', updatedAt:'11 months ago' },
    { id:'company-calendar', scope:'workspace', category:'Company', name:'Company calendar',       desc:'Shared org-wide holidays and events',                         status:'ok',      statusDetail:'12 holidays · 2026',          updatedBy:'Admin', updatedAt:'2 months ago' },
    // Sales process
    { id:'pipelines',        scope:'workspace', category:'Sales process', name:'Pipelines',       desc:'Manage multiple pipelines and their stages',                  status:'ok',      statusDetail:'3 pipelines · 28 stages',     updatedBy:'Admin', updatedAt:'3 weeks ago' },
    { id:'funnel-stages',    scope:'workspace', category:'Sales process', name:'Funnel stages',   desc:'Stage names and default win probability',                     status:'ok',      statusDetail:'8 stages',                    updatedBy:'Admin', updatedAt:'3 weeks ago' },
    { id:'custom-fields',    scope:'workspace', category:'Sales process', name:'Custom fields',   desc:'Custom fields on Accounts, Contacts, Leads, Opportunities',   status:'ok',      statusDetail:'18 custom fields',            updatedBy:'Admin', updatedAt:'5 days ago', isNew:true },
    { id:'kpi-settings',     scope:'workspace', category:'Sales process', name:'KPI thresholds',  desc:'Thresholds, colors, and sparkline ranges for dashboards',     status:'ok',      statusDetail:'12 KPIs configured',          updatedBy:'Admin', updatedAt:'1 month ago' },
    { id:'lead-conv-benchmarks', scope:'workspace', category:'Sales process', name:'Lead conversion benchmarks', desc:'Good / average / poor conversion rate targets by lead source', status:'ok', statusDetail:'8 sources configured', updatedBy:'Admin', updatedAt:'today' },
    { id:'pain-points',      scope:'workspace', category:'Sales process', name:'Pain points library', desc:'Reusable customer pain point templates',                  status:'ok',      statusDetail:'23 pain points',              updatedBy:'Admin', updatedAt:'2 weeks ago' },
    { id:'customer-types',   scope:'workspace', category:'Sales process', name:'Customer types',  desc:'Account classification tags (SMB, Mid-market, Enterprise…)', status:'ok',      statusDetail:'5 tiers',                     updatedBy:'Admin', updatedAt:'6 months ago' },
    { id:'industries',       scope:'workspace', category:'Sales process', name:'Industries',      desc:'Primary and sub-industry taxonomy',                           status:'ok',      statusDetail:'14 industries · 47 sub-types', updatedBy:'Admin', updatedAt:'4 months ago' },
    // Quoting
    { id:'price-book',       scope:'workspace', category:'Quoting', name:'Price book',            desc:'Product catalog for quotes — edit in Quotes tab',             status:'linked',  statusDetail:'15 products · 3 bundles',     updatedBy:'Admin', updatedAt:'1 week ago',   link:true },
    { id:'approval-tiers',   scope:'workspace', category:'Quoting', name:'Approval tiers',        desc:'Discount thresholds that trigger manager or VP approval',     status:'ok',      statusDetail:'3 tiers',                     updatedBy:'Admin', updatedAt:'2 months ago' },
    { id:'quote-templates',  scope:'workspace', category:'Quoting', name:'Quote templates & branding', desc:'Templates, PDF header, terms, signature blocks',         status:'ok',      statusDetail:'4 templates',                 updatedBy:'Admin', updatedAt:'1 month ago' },
    // People & Teams
    { id:'users',            scope:'workspace', category:'People & Teams', name:'Users',           desc:'Invite, deactivate, and assign roles & permissions',         status:'ok',      statusDetail:'users · pending invites',      updatedBy:'Admin', updatedAt:'yesterday' },
    { id:'teams',            scope:'workspace', category:'People & Teams', name:'Teams & managers', desc:'Team structure, managers, and reporting hierarchy',          status:'ok',      statusDetail:'teams · managers',             updatedBy:'Admin', updatedAt:'2 weeks ago' },
    { id:'territories',      scope:'workspace', category:'People & Teams', name:'Territories',     desc:'Sales territory definitions and rep assignments',             status:'ok',      statusDetail:'8 territories',               updatedBy:'Admin', updatedAt:'3 months ago' },
    { id:'roles',            scope:'workspace', category:'People & Teams', name:'Roles & permissions', desc:'Custom roles with granular object-level permissions',    status:'ok',      statusDetail:'5 roles',                     updatedBy:'Admin', updatedAt:'2 months ago' },
    // Integrations
    { id:'apps',             scope:'workspace', category:'Integrations', name:'Connected apps',    desc:'Slack, Gmail, Outlook, Zoom, Docusign, LinkedIn',             status:'partial', statusDetail:'3 of 6 connected',            updatedBy:'Admin', updatedAt:'1 week ago',  isNew:true },
    { id:'api-keys',         scope:'workspace', category:'Integrations', name:'API keys',          desc:'Workspace REST API credentials',                              status:'ok',      statusDetail:'3 active keys',               updatedBy:'Admin', updatedAt:'2 months ago' },
    { id:'webhooks',         scope:'workspace', category:'Integrations', name:'Webhooks',          desc:'Subscribe to CRM events and push to endpoints',               status:'partial', statusDetail:'4 endpoints · 1 failing',     updatedBy:'Admin', updatedAt:'1 week ago',  attention:true },
    { id:'automations',      scope:'workspace', category:'Integrations', name:'Automations',       desc:'Rules, triggers, and scheduled jobs',                         status:'ok',      statusDetail:'12 active · 3 paused',        updatedBy:'Admin', updatedAt:'4 days ago',  isNew:true },
    // Security
    { id:'sso',              scope:'workspace', category:'Security', name:'Single sign-on (SSO)',  desc:'SAML 2.0 / OIDC identity provider',                           status:'warning', statusDetail:'Not configured',              updatedBy:'—', updatedAt:'—',           attention:true, isNew:true },
    { id:'mfa',              scope:'workspace', category:'Security', name:'Multi-factor auth',     desc:'Enforce MFA for all users',                                   status:'partial', statusDetail:'Optional · not all enrolled', updatedBy:'Admin', updatedAt:'3 months ago', attention:true, isNew:true },
    { id:'session',          scope:'workspace', category:'Security', name:'Session policy',        desc:'Idle timeout, device trust, IP allowlist',                    status:'ok',      statusDetail:'8h timeout · no IP rules',    updatedBy:'Admin', updatedAt:'3 months ago' },
    { id:'field-visibility', scope:'workspace', category:'Security', name:'Field-level visibility', desc:'Role-based access control for individual fields',            status:'ok',      statusDetail:'6 rules',                     updatedBy:'Admin', updatedAt:'2 months ago' },
    { id:'audit-log',        scope:'workspace', category:'Security', name:'Audit log',             desc:'Change history across all records and settings',               status:'ok',      statusDetail:'Last 30 days · 2,418 events', updatedBy:'System', updatedAt:'just now' },
    // Data
    { id:'import',           scope:'workspace', category:'Data', name:'Import',                    desc:'CSV import for accounts, contacts, leads, opportunities',     status:'ok',      statusDetail:'Last: 812 rows',              updatedBy:'Admin', updatedAt:'3 days ago',  isNew:true },
    { id:'export',           scope:'workspace', category:'Data', name:'Export',                    desc:'Scheduled and ad-hoc exports; GDPR data requests',            status:'ok',      statusDetail:'Weekly export · Mondays',     updatedBy:'Admin', updatedAt:'3 months ago', isNew:true },
    { id:'backup',           scope:'workspace', category:'Data', name:'Backup & restore',           desc:'Automated daily backups and point-in-time restore',           status:'ok',      statusDetail:'Daily · last: 03:14 UTC',     updatedBy:'System', updatedAt:'4 hours ago' },
    { id:'features',         scope:'workspace', category:'Data', name:'Features & AI',              desc:'Enable app features and AI (deal scoring, writing assist)',   status:'ok',      statusDetail:'14 of 18 on · AI enabled',    updatedBy:'Admin', updatedAt:'1 month ago' },
];

const WORKSPACE_TABS = ['All', 'Company', 'Sales process', 'Quoting', 'People & Teams', 'Integrations', 'Security', 'Data'];

// ─────────────────────────────────────────────────────────────
// Personal prefs detail panels
// ─────────────────────────────────────────────────────────────
const PersonalCalendar = ({ settings }) => {
    const calConnected = settings.googleCalendarConnected || settings.calendarConnected || false;
    const [toggles, setToggles] = useState({ twoWay:true, autoLog:true, availability:true, privacyMode:false });
    return (
        <div>
            <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>CONNECTED CALENDAR</div>
            <div style={{ padding:14, background:T.bg, border:`1px solid ${T.border}`, borderRadius:T.r, display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
                <div style={{ width:40, height:40, background:'#fff', border:`1px solid ${T.border}`, borderRadius:T.r, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#4285f4' }}>G</div>
                <div style={{ flex:1 }}>
                    <div style={{ fontSize:13.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>Google Calendar</div>
                    <div style={{ fontSize:11.5, color:T.inkMuted, fontFamily:T.sans }}>{calConnected ? 'Connected · syncing' : 'Not connected'}</div>
                </div>
                <StatusChip status={calConnected ? 'connected' : 'none'} detail={calConnected ? 'Connected' : 'Not connected'}/>
                <button style={{ padding:'5px 10px', fontSize:11, fontWeight:600, background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                    {calConnected ? 'Disconnect' : 'Connect'}
                </button>
            </div>
            <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>SYNC OPTIONS</div>
            {[
                { key:'twoWay',       label:'Two-way event sync',                   sub:'Changes in Accelerep push to Google, and vice versa.' },
                { key:'autoLog',      label:'Auto-log meetings to opportunities',    sub:'Detects attendees and attaches to matching deals.' },
                { key:'availability', label:'Show availability on booking links',    sub:'Your calendar busy blocks hide those slots.' },
                { key:'privacyMode',  label:'Pull in free/busy only (no event titles)', sub:"Privacy mode — Accelerep can't read event details." },
            ].map((c, i) => (
                <div key={c.key} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'10px 0', borderBottom: i < 3 ? `1px dashed ${T.border}` : 'none' }}>
                    <RToggle on={toggles[c.key]} onChange={v => setToggles(p => ({ ...p, [c.key]: v }))}/>
                    <div style={{ flex:1 }}>
                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{c.label}</div>
                        <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:1, fontFamily:T.sans }}>{c.sub}</div>
                    </div>
                </div>
            ))}
        </div>
    );
};

const PersonalNotifications = ({ settings, setSettings }) => {
    const prefs = settings.notificationPreferences || {};
    const channels = [
        { key:'mentions',  name:'@Mentions in comments',       email:true, push:true, inapp:true },
        { key:'approvals', name:'Quote approval requests',      email:true, push:false, inapp:true },
        { key:'quoteOpen', name:'Quote viewed by customer',     email:true, push:false, inapp:true },
        { key:'leads',     name:'New lead assigned',            email:false, push:true, inapp:true },
        { key:'tasks',     name:'Task due soon',                email:false, push:true, inapp:true },
        { key:'digest',    name:'Daily digest',                 email:true, push:false, inapp:false },
    ];
    const [local, setLocal] = useState(() => {
        const out = {};
        channels.forEach(c => { out[c.key] = { email: prefs[c.key]?.email ?? c.email, push: prefs[c.key]?.push ?? c.push, inapp: prefs[c.key]?.inapp ?? c.inapp }; });
        return out;
    });
    const toggle = (key, field) => setLocal(p => ({ ...p, [key]: { ...p[key], [field]: !p[key][field] } }));
    return (
        <div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 60px 60px', gap:8, ...eb(T.inkMuted), marginBottom:10 }}>
                <span>EVENT</span><span style={{ textAlign:'center' }}>EMAIL</span><span style={{ textAlign:'center' }}>PUSH</span><span style={{ textAlign:'center' }}>IN-APP</span>
            </div>
            {channels.map((c, i) => (
                <div key={c.key} style={{ display:'grid', gridTemplateColumns:'1fr 60px 60px 60px', gap:8, padding:'10px 0', borderBottom: i < channels.length-1 ? `1px dashed ${T.border}` : 'none', alignItems:'center' }}>
                    <span style={{ fontSize:12.5, color:T.ink, fontFamily:T.sans }}>{c.name}</span>
                    <RCheck on={local[c.key]?.email} onChange={() => toggle(c.key, 'email')}/>
                    <RCheck on={local[c.key]?.push}  onChange={() => toggle(c.key, 'push')}/>
                    <RCheck on={local[c.key]?.inapp} onChange={() => toggle(c.key, 'inapp')}/>
                </div>
            ))}
            <div style={{ marginTop:16, padding:12, background:T.bg, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:11.5, color:T.inkMid, fontFamily:T.sans }}>
                Quiet hours: <strong>mute push 7pm – 8am</strong> (your local time).{' '}
                <span style={{ color:T.info, fontWeight:600, cursor:'pointer' }}>Edit →</span>
            </div>
            <div style={{ marginTop:14, display:'flex', justifyContent:'flex-end' }}>
                <button onClick={() => {
                    const updated = { ...settings, notificationPreferences: local };
                    setSettings(updated);
                    dbFetch('/.netlify/functions/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(updated) }).catch(console.error);
                }} style={{ padding:'7px 14px', fontSize:12, fontWeight:600, background:T.ink, color:T.surface, border:'none', borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                    Save preferences
                </button>
            </div>
        </div>
    );
};

const PersonalSignature = ({ currentUser }) => {
    const templates = [
        { name:'Intro — cold outreach', uses:42, open:38 },
        { name:'Follow-up · no response', uses:28, open:24 },
        { name:'Quote sent · check-in', uses:12, open:67 },
    ];
    return (
        <div>
            <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>EMAIL SIGNATURE</div>
            <div style={{ padding:16, border:`1px solid ${T.border}`, borderRadius:T.r, background:T.bg, marginBottom:14, fontFamily:T.sans }}>
                <div style={{ fontSize:13, color:T.ink, marginBottom:6, fontWeight:600 }}>{currentUser}</div>
                <div style={{ fontSize:12, color:T.inkMid, marginBottom:2 }}>Account Executive · Accelerep</div>
                <div style={{ fontSize:12, color:T.inkMid, marginBottom:8 }}>Accelerep · {(currentUser||'').toLowerCase().replace(' ','.')}@accelerep.com</div>
                <div style={{ fontSize:11, color:T.inkMuted, fontStyle:'italic' }}>"The best way to predict revenue is to make it happen."</div>
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:22 }}>
                <button style={{ padding:'7px 14px', fontSize:12, fontWeight:600, background:T.ink, color:T.surface, border:'none', borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>Edit signature</button>
                <button style={{ padding:'7px 14px', fontSize:12, fontWeight:600, background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>Append to all sent mail</button>
            </div>
            <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>YOUR EMAIL TEMPLATES · {templates.length}</div>
            {templates.map((t, i) => (
                <div key={t.name} style={{ display:'grid', gridTemplateColumns:'1fr 100px 100px 60px', gap:12, padding:'10px 0', borderBottom: i < templates.length-1 ? `1px dashed ${T.border}` : 'none', alignItems:'center' }}>
                    <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{t.name}</div>
                    <div style={{ fontSize:11.5, color:T.inkMid, fontFamily:T.sans }}>{t.uses} uses</div>
                    <div style={{ fontSize:11.5, color:T.inkMid, fontFamily:T.sans }}>{t.open}% open rate</div>
                    <div style={{ fontSize:11.5, color:T.info, fontWeight:600, textAlign:'right', cursor:'pointer', fontFamily:T.sans }}>Edit →</div>
                </div>
            ))}
            <button style={{ marginTop:14, padding:'7px 12px', fontSize:12, fontWeight:600, width:'100%', background:'transparent', color:T.inkMid, border:`1px dashed ${T.borderStrong}`, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>+ New template</button>
        </div>
    );
};

const PersonalApiTokens = () => (
    <div>
        <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>PERSONAL API TOKENS</div>
        <div style={{ padding:24, background:T.bg, border:`1px dashed ${T.borderStrong}`, borderRadius:T.r, textAlign:'center' }}>
            <div style={{ fontSize:13, color:T.inkMid, marginBottom:10, fontFamily:T.sans }}>No tokens yet. Create one to call the Accelerep API on your behalf.</div>
            <button style={{ padding:'8px 16px', fontSize:12, fontWeight:600, background:T.ink, color:T.surface, border:'none', borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>+ Generate token</button>
        </div>
        <div style={{ marginTop:14, fontSize:11.5, color:T.inkMuted, lineHeight:1.55, fontFamily:T.sans }}>
            Personal tokens carry <strong>your</strong> permissions. For server-to-server keys, ask your admin about workspace API keys in Settings → Integrations.
        </div>
    </div>
);

// ─────────────────────────────────────────────────────────────
// LEAD CONVERSION BENCHMARKS panel
// ─────────────────────────────────────────────────────────────
const DEFAULT_LEAD_CONV_BENCHMARKS = [
    { source: 'Referral / Partner',  good: 30, avg: 15, poor: 15 },
    { source: 'Inbound',             good: 20, avg: 10, poor: 10 },
    { source: 'Trade Show',          good: 15, avg:  8, poor:  8 },
    { source: 'LinkedIn / Social',   good: 10, avg:  5, poor:  5 },
    { source: 'Cold Outreach',       good:  5, avg:  2, poor:  2 },
    { source: 'Webinar',             good: 15, avg:  8, poor:  8 },
    { source: 'Partner Referral',    good: 30, avg: 15, poor: 15 },
    { source: 'Website',             good: 20, avg: 10, poor: 10 },
    // Blended / fallback — used for any source not listed above
    { source: '_default',            good: 20, avg: 10, poor: 10 },
];

const LeadConvBenchmarks = ({ settings, setSettings }) => {
    const saved = settings?.leadConvBenchmarks || null;
    const [rows, setRows] = useState(() =>
        saved ? JSON.parse(JSON.stringify(saved)) : JSON.parse(JSON.stringify(DEFAULT_LEAD_CONV_BENCHMARKS))
    );
    const [saving, setSaving] = useState(false);
    const [saved2, setSaved2] = useState(false);
    const [newSource, setNewSource] = useState('');

    const update = (i, field, val) => {
        setRows(prev => prev.map((r, ri) => ri === i ? { ...r, [field]: val } : r));
    };

    const addRow = () => {
        const src = newSource.trim();
        if (!src) return;
        if (rows.some(r => r.source.toLowerCase() === src.toLowerCase())) return;
        setRows(prev => [...prev, { source: src, good: 20, avg: 10, poor: 10 }]);
        setNewSource('');
    };

    const removeRow = (i) => {
        setRows(prev => prev.filter((_, ri) => ri !== i));
    };

    const handleSave = async () => {
        setSaving(true);
        const updated = { ...settings, leadConvBenchmarks: rows };
        setSettings(updated);
        try {
            await dbFetch('/.netlify/functions/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updated),
            });
            setSaved2(true);
            setTimeout(() => setSaved2(false), 2000);
        } catch (e) {
            console.error('Failed to save lead conv benchmarks', e);
        } finally {
            setSaving(false);
        }
    };

    const defaultRow = rows.find(r => r.source === '_default');
    const sourceRows = rows.filter(r => r.source !== '_default');

    const inputSt = { width: 54, padding: '4px 6px', fontSize: 12, border: `1px solid ${T.border}`, borderRadius: T.r, background: T.bg, color: T.ink, fontFamily: T.sans, textAlign: 'right' };
    const pctLabel = (v) => v + '%';

    return (
        <div>
            <div style={{ fontSize: 13, color: T.inkMid, marginBottom: 16, lineHeight: 1.55, fontFamily: T.sans }}>
                These thresholds drive the colour coding in <strong>Reports → Leads → Source ROI</strong>.
                Each source shows <span style={{ color: T.ok, fontWeight: 700 }}>green</span> when conversion rate ≥ Good,{' '}
                <span style={{ color: T.warn, fontWeight: 700 }}>amber</span> when ≥ Poor threshold, and{' '}
                <span style={{ color: T.danger, fontWeight: 700 }}>red</span> below Poor.
                The <em>All other sources</em> row is the fallback for any source not listed.
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 32px', gap: 10, padding: '6px 0', borderBottom: `1px solid ${T.border}`, marginBottom: 4 }}>
                {['Source', 'Good ≥', 'Avg ≥', 'Poor <', ''].map((h, i) => (
                    <div key={i} style={{ ...eb(T.inkMuted), textAlign: i === 0 ? 'left' : 'right' }}>{h}</div>
                ))}
            </div>

            {/* Source rows */}
            {sourceRows.map((r, i) => (
                <div key={r.source} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 32px', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.surface2}`, alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: T.ink, fontFamily: T.sans }}>{r.source}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                        <input type="number" min="0" max="100" value={r.good}
                            onChange={e => update(rows.indexOf(r), 'good', Math.max(0, Math.min(100, parseInt(e.target.value)||0)))}
                            style={{ ...inputSt, color: T.ok }}/>
                        <span style={{ fontSize: 11, color: T.inkMuted }}>%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                        <input type="number" min="0" max="100" value={r.avg}
                            onChange={e => update(rows.indexOf(r), 'avg', Math.max(0, Math.min(100, parseInt(e.target.value)||0)))}
                            style={{ ...inputSt, color: T.warn }}/>
                        <span style={{ fontSize: 11, color: T.inkMuted }}>%</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                        <input type="number" min="0" max="100" value={r.poor}
                            onChange={e => update(rows.indexOf(r), 'poor', Math.max(0, Math.min(100, parseInt(e.target.value)||0)))}
                            style={{ ...inputSt, color: T.danger }}/>
                        <span style={{ fontSize: 11, color: T.inkMuted }}>%</span>
                    </div>
                    <button onClick={() => removeRow(rows.indexOf(r))}
                        style={{ background: 'none', border: 'none', color: T.inkMuted, fontSize: 16, cursor: 'pointer', padding: 0, lineHeight: 1, fontFamily: T.sans }}>×</button>
                </div>
            ))}

            {/* Default fallback row — always shown, source name not editable */}
            {defaultRow && (
                <>
                    <div style={{ padding: '8px 0 4px', fontSize: 11, color: T.inkMuted, fontWeight: 600, letterSpacing: 0.4, fontFamily: T.sans }}>
                        FALLBACK — ALL OTHER SOURCES
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px 32px', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.border}`, alignItems: 'center', background: T.surface2, borderRadius: T.r, paddingLeft: 8, paddingRight: 8 }}>
                        <div style={{ fontSize: 13, fontStyle: 'italic', color: T.inkMid, fontFamily: T.sans }}>All other sources</div>
                        {['good','avg','poor'].map((field, fi) => (
                            <div key={field} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                                <input type="number" min="0" max="100" value={defaultRow[field]}
                                    onChange={e => update(rows.indexOf(defaultRow), field, Math.max(0, Math.min(100, parseInt(e.target.value)||0)))}
                                    style={{ ...inputSt, color: [T.ok, T.warn, T.danger][fi] }}/>
                                <span style={{ fontSize: 11, color: T.inkMuted }}>%</span>
                            </div>
                        ))}
                        <div/>
                    </div>
                </>
            )}

            {/* Add new source row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
                <input
                    value={newSource}
                    onChange={e => setNewSource(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addRow()}
                    placeholder="Add a source (e.g. Conference)…"
                    style={{ flex: 1, padding: '7px 10px', fontSize: 12.5, border: `1px dashed ${T.borderStrong}`, borderRadius: T.r, background: T.bg, color: T.ink, fontFamily: T.sans, outline: 'none' }}
                />
                <button onClick={addRow}
                    style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans, whiteSpace: 'nowrap' }}>
                    + Add source
                </button>
            </div>

            {/* Legend */}
            <div style={{ marginTop: 16, padding: '10px 14px', background: T.bg, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 11.5, color: T.inkMid, lineHeight: 1.6, fontFamily: T.sans }}>
                <strong style={{ color: T.ink }}>How thresholds work:</strong>{' '}
                Conv rate ≥ Good → <span style={{ color: T.ok, fontWeight: 700 }}>green</span> ·{' '}
                ≥ Avg → <span style={{ color: T.warn, fontWeight: 700 }}>amber</span> ·{' '}
                &lt; Poor → <span style={{ color: T.danger, fontWeight: 700 }}>red</span> ·{' '}
                0% (no conversions) → muted grey
            </div>

            {/* Save */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
                {saved2 && <span style={{ fontSize: 12, color: T.ok, fontWeight: 600, fontFamily: T.sans }}>✓ Saved</span>}
                <button onClick={() => setRows(JSON.parse(JSON.stringify(DEFAULT_LEAD_CONV_BENCHMARKS)))}
                    style={{ padding: '7px 14px', fontSize: 12, fontWeight: 600, background: 'transparent', color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, cursor: 'pointer', fontFamily: T.sans }}>
                    Reset to defaults
                </button>
                <button onClick={handleSave} disabled={saving}
                    style={{ padding: '7px 16px', fontSize: 12, fontWeight: 600, background: saving ? T.borderStrong : T.ink, color: T.surface, border: 'none', borderRadius: T.r, cursor: saving ? 'default' : 'pointer', fontFamily: T.sans }}>
                    {saving ? 'Saving…' : 'Save benchmarks'}
                </button>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// V2 Card for the workspace admin grid
// ─────────────────────────────────────────────────────────────
const V2Card = ({ item, onOpen, settings }) => {
    const [hov, setHov] = useState(false);
    // Enrich live data where we have it
    let statusDetail = item.statusDetail;
    if (item.id === 'users'  && settings?.users)   statusDetail = `${(settings.users||[]).filter(u=>u.name).length} users`;
    if (item.id === 'teams'  && settings?.users)   statusDetail = `${[...new Set((settings.users||[]).filter(u=>u.team).map(u=>u.team))].length} teams`;
    if (item.id === 'pipelines' && settings?.pipelines) statusDetail = `${(settings.pipelines||[]).length} pipeline${(settings.pipelines||[]).length!==1?'s':''}`;
    if (item.id === 'funnel-stages' && settings?.funnelStages) statusDetail = `${(settings.funnelStages||[]).length} stages`;
    if (item.id === 'custom-fields' && settings?.customFields) statusDetail = `${(settings.customFields||[]).length} custom fields`;
    return (
        <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
            onClick={() => onOpen && onOpen(item)}
            style={{ background:T.surface, border:`1px solid ${hov ? T.borderStrong : T.border}`, borderRadius:6, padding:14, cursor:'pointer', position:'relative', boxShadow: hov ? '0 2px 0 rgba(0,0,0,0.02)' : 'none', transition:'border-color 120ms, box-shadow 120ms' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:10 }}>
                <SettingIcon category={item.category} size={34}/>
                <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2, flexWrap:'wrap' }}>
                        <div style={{ fontSize:13.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{item.name}</div>
                        {item.isNew && <NewBadge/>}
                        {item.link && <span style={{ fontSize:11, color:T.info }}>↗</span>}
                    </div>
                    <div style={{ fontSize:11.5, color:T.inkMid, lineHeight:1.45, fontFamily:T.sans }}>{item.desc}</div>
                </div>
            </div>
            <div style={{ padding:'8px 10px', background:T.bg, border:`1px solid ${T.border}`, borderRadius:T.r, marginBottom:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <StatusChip status={item.status} detail={statusDetail} small/>
                {item.attention && <span style={{ fontSize:10, color:T.danger, fontWeight:700, fontFamily:T.sans }}>Needs attention</span>}
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:10.5, color:T.inkMuted, fontFamily:T.sans }}>
                <span>{item.updatedBy === '—' ? 'Never changed' : `Edited ${item.updatedAt} by ${(item.updatedBy||'').split(' ')[0]}`}</span>
                <span style={{ color:T.info, fontWeight:600 }}>{item.link ? 'Open in Quotes →' : 'Open →'}</span>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// PERSONAL VIEW — for non-admin/manager users
// ─────────────────────────────────────────────────────────────
const PersonalView = ({ settings, setSettings, currentUser, isAdmin }) => {
    const items = SETTINGS_ITEMS.filter(i => i.scope === 'personal');
    const [active, setActive] = useState(items[0]);
    return (
        <div style={{ display:'grid', gridTemplateColumns:'260px 1fr', gap:24, padding:'0 0 40px' }}>
            {/* Side rail */}
            <div style={{ paddingTop:4 }}>
                <div style={{ ...eb(T.inkMuted), marginBottom:10 }}>MY ACCOUNT</div>
                {items.map(it => (
                    <div key={it.id} onClick={() => setActive(it)} style={{ padding:'10px 12px', borderRadius:T.r+1, cursor:'pointer', display:'flex', alignItems:'center', gap:10, background: active?.id === it.id ? T.surface : 'transparent', border: active?.id === it.id ? `1px solid ${T.border}` : '1px solid transparent', marginBottom:4, transition:'background 80ms' }}>
                        <SettingIcon category={it.category} size={28}/>
                        <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, display:'flex', alignItems:'center', gap:5, fontFamily:T.sans }}>
                                {it.name} {it.isNew && <NewBadge/>}
                            </div>
                            <div style={{ fontSize:11, color:T.inkMuted, marginTop:1, fontFamily:T.sans }}>{it.statusDetail}</div>
                        </div>
                    </div>
                ))}
                {isAdmin && (
                    <>
                        <div style={{ height:1, background:T.border, margin:'14px 0 10px' }}/>
                        <div style={{ ...eb(T.inkMuted), marginBottom:8 }}>WORKSPACE</div>
                        <div style={{ padding:'10px 12px', borderRadius:T.r+1, display:'flex', alignItems:'center', gap:10, border:`1px dashed ${T.borderStrong}`, cursor:'pointer' }}
                            onClick={() => document.dispatchEvent(new CustomEvent('accelerep:settings:showAdmin'))}>
                            <div style={{ width:28, height:28, borderRadius:T.r+1, background:T.ink, color:T.gold, fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>A</div>
                            <div style={{ flex:1 }}>
                                <div style={{ fontSize:12, fontWeight:600, color:T.ink, fontFamily:T.sans }}>Admin settings →</div>
                                <div style={{ fontSize:10.5, color:T.inkMuted, fontFamily:T.sans }}>Opens the workspace console</div>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Detail panel */}
            {active && (
                <div>
                    <div style={{ marginBottom:14 }}>
                        <div style={{ fontSize:20, fontWeight:700, color:T.ink, marginBottom:4, fontFamily:T.sans }}>{active.name}</div>
                        <div style={{ fontSize:13, color:T.inkMid, fontFamily:T.sans }}>{active.desc}</div>
                    </div>
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:20 }}>
                        {active.id === 'my-calendar'      && <PersonalCalendar settings={settings}/>}
                        {active.id === 'my-notifications' && <PersonalNotifications settings={settings} setSettings={setSettings}/>}
                        {active.id === 'my-signature'     && <PersonalSignature currentUser={currentUser}/>}
                        {active.id === 'my-api'           && <PersonalApiTokens/>}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// COMPANY DETAIL PAGES — shared chrome + three pages
// ─────────────────────────────────────────────────────────────

// Extra icon paths not in the main Icon set
const EXTRA_ICON_PATHS = {
    'link':     <g><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 10-5.66-5.66l-1.5 1.5"/><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 105.66 5.66l1.5-1.5"/></g>,
    'upload':   <g><path d="M12 16V4M6 10l6-6 6 6"/><path d="M4 20h16"/></g>,
    'download': <g><path d="M12 4v12M6 10l6 6 6-6"/><path d="M4 20h16"/></g>,
    'refresh':  <g><path d="M4 12a8 8 0 0114-5.3L20 8"/><path d="M20 4v4h-4"/><path d="M20 12a8 8 0 01-14 5.3L4 16"/><path d="M4 20v-4h4"/></g>,
    'lock':     <g><rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 018 0v3"/></g>,
    'info':     <g><circle cx="12" cy="12" r="9"/><path d="M12 8v.5M12 11v5"/></g>,
    'chevron-down': <path d="M6 9l6 6 6-6"/>,
};
const LIcon = ({ name, size = 16, color = 'currentColor', sw = 1.5, style: st }) => {
    if (EXTRA_ICON_PATHS[name]) {
        return (
            <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={st}>
                {EXTRA_ICON_PATHS[name]}
            </svg>
        );
    }
    return null;
};

// Shared form primitives
const CField = ({ label, hint, children, half }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:5, ...(half ? { gridColumn:'span 1' } : {}) }}>
        <label style={{ fontSize:11.5, fontWeight:600, color:T.inkMid, letterSpacing:0.2, fontFamily:T.sans }}>{label}</label>
        {children}
        {hint && <span style={{ fontSize:11, color:T.inkMuted, lineHeight:1.45, fontFamily:T.sans }}>{hint}</span>}
    </div>
);
const CInput = ({ value, onChange, placeholder, mono }) => (
    <input
        value={value || ''}
        onChange={e => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        style={{ padding:'8px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily: mono ? 'ui-monospace,Menlo,monospace' : T.sans, outline:'none', width:'100%', boxSizing:'border-box' }}
    />
);
const CTextarea = ({ value, onChange, rows = 4 }) => (
    <textarea
        value={value || ''}
        onChange={e => onChange && onChange(e.target.value)}
        rows={rows}
        style={{ padding:'8px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box', resize:'vertical', lineHeight:1.5 }}
    />
);
const CSelect = ({ value, onChange, options }) => (
    <select value={value || ''} onChange={e => onChange && onChange(e.target.value)}
        style={{ padding:'8px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', appearance:'none', cursor:'pointer',
            backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', paddingRight:28 }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
);
const CSectionCard = ({ title, description, children, headAction }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:20, marginBottom:14 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:16 }}>
            <div style={{ flex:1 }}>
                <div style={{ fontSize:15, fontWeight:700, color:T.ink, marginBottom:3, fontFamily:T.sans }}>{title}</div>
                {description && <div style={{ fontSize:12.5, color:T.inkMid, lineHeight:1.5, fontFamily:T.sans }}>{description}</div>}
            </div>
            {headAction}
        </div>
        {children}
    </div>
);

// Shared chrome wrapper for all three detail pages
const DetailPageChrome = ({ crumb, title, subtitle, statusDetail, updatedBy, updatedAt, onBack, dirty, onCancel, primaryAction, primaryLabel, children }) => (
    <div style={{ fontFamily:T.sans }}>
        {/* Breadcrumb */}
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10 }}>
            <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
            <span>/</span>
            <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Company</button>
            <span>/</span>
            <span style={{ color:T.ink, fontWeight:600 }}>{crumb}</span>
        </div>

        {/* Title band */}
        <div style={{ display:'flex', alignItems:'flex-end', gap:24, paddingBottom:18, borderBottom:`1px solid ${T.border}`, marginBottom:20 }}>
            <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10, flex:1 }}>
                <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3, fontFamily:T.sans }}>
                    {title}
                    {dirty && <span style={{ fontSize:12, fontWeight:500, color:T.warn, marginLeft:12, fontFamily:T.sans }}>● Unsaved changes</span>}
                </div>
                <div style={{ fontSize:13, color:T.inkMid, marginTop:4, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', fontFamily:T.sans }}>
                    <span>{subtitle}</span>
                    <span style={{ color:T.inkMuted }}>•</span>
                    <StatusChip status="ok" detail={statusDetail} small/>
                    <span style={{ color:T.inkMuted }}>•</span>
                    <span style={{ fontSize:11.5, color:T.inkMuted }}>Last edited {updatedAt} by <span style={{ color:T.inkMid, fontWeight:500 }}>{updatedBy}</span></span>
                </div>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                <button onClick={onCancel} style={{ padding:'8px 16px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                <button onClick={primaryAction} disabled={!dirty} style={{ padding:'8px 16px', background: dirty ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty ? 'pointer' : 'default', fontFamily:T.sans, transition:'background 120ms' }}>{primaryLabel}</button>
            </div>
        </div>

        {children}
    </div>
);

// ── 1. Company Profile ─────────────────────────────────────────
const CompanyProfileDetail = ({ settings, setSettings, onBack }) => {
    const saved = {
        displayName:   settings?.companyDisplayName  || settings?.companyName || '',
        legalName:     settings?.companyLegalName    || '',
        brandColor:    settings?.companyBrandColor   || T.goldInk,
        address:       settings?.companyAddress      || '',
        city:          settings?.companyCity         || '',
        state:         settings?.companyState        || '',
        zip:           settings?.companyZip          || '',
        country:       settings?.companyCountry      || 'United States',
        phone:         settings?.companyPhone        || '',
        supportEmail:  settings?.companySupportEmail || '',
        quoteHeader:   settings?.quoteHeader         || '',
    };
    const [form, setForm]   = useState({ ...saved });
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);

    const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setDirty(true); };
    const handleCancel = () => { setForm({ ...saved }); setDirty(false); };
    const handleSave = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev,
            companyDisplayName:  form.displayName,
            companyLegalName:    form.legalName,
            companyBrandColor:   form.brandColor,
            companyAddress:      form.address,
            companyCity:         form.city,
            companyState:        form.state,
            companyZip:          form.zip,
            companyCountry:      form.country,
            companyPhone:        form.phone,
            companySupportEmail: form.supportEmail,
            quoteHeader:         form.quoteHeader,
        }));
        try {
            await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({
                companyDisplayName:  form.displayName,
                companyLegalName:    form.legalName,
                companyBrandColor:   form.brandColor,
                companyAddress:      form.address,
                companyCity:         form.city,
                companyState:        form.state,
                companyZip:          form.zip,
                companyCountry:      form.country,
                companyPhone:        form.phone,
                companySupportEmail: form.supportEmail,
                quoteHeader:         form.quoteHeader,
            })});
        } catch(e) { console.error('save company profile', e); }
        setSaving(false);
        setDirty(false);
    };

    const COUNTRIES = ['United States','Canada','United Kingdom','Australia','Germany','France','Other'].map(c => ({ value:c, label:c }));

    return (
        <DetailPageChrome
            crumb="Company profile" title="Company profile"
            subtitle="Logo, address, phone, and default quote header"
            statusDetail="Complete" updatedBy={settings?.updatedBy || 'Admin'} updatedAt="2 months ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 420px', gap:20 }}>
                {/* LEFT */}
                <div>
                    <CSectionCard title="Brand" description="Your logo appears on quote PDFs, shared report exports, and in the workspace header for every user.">
                        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                            <CField label="Brand color" hint="Used as the accent on quote PDFs and report headers.">
                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <input type="color" value={form.brandColor} onChange={e => set('brandColor', e.target.value)}
                                        style={{ width:34, height:34, padding:2, border:`1px solid ${T.border}`, borderRadius:T.r, cursor:'pointer', background:'none' }}/>
                                    <CInput value={form.brandColor} onChange={v => set('brandColor', v)} mono/>
                                </div>
                            </CField>
                            <CField label="Display name" hint="Appears in the top nav and on all exported documents.">
                                <CInput value={form.displayName} onChange={v => set('displayName', v)} placeholder="Your company name"/>
                            </CField>
                            <CField label="Legal name" hint="Full legal entity name for contracts and invoices.">
                                <CInput value={form.legalName} onChange={v => set('legalName', v)} placeholder="Legal entity name"/>
                            </CField>
                        </div>
                    </CSectionCard>

                    <CSectionCard title="Address & contact" description="The registered office address shown on quotes. For multi-location, set up locations under Sales process → Territories.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                            <div style={{ gridColumn:'1 / 3' }}>
                                <CField label="Street address"><CInput value={form.address} onChange={v => set('address', v)} placeholder="123 Main St, Suite 100"/></CField>
                            </div>
                            <CField label="City"><CInput value={form.city} onChange={v => set('city', v)}/></CField>
                            <CField label="State / Region"><CInput value={form.state} onChange={v => set('state', v)}/></CField>
                            <CField label="ZIP / Postal code"><CInput value={form.zip} onChange={v => set('zip', v)}/></CField>
                            <CField label="Country"><CSelect value={form.country} onChange={v => set('country', v)} options={COUNTRIES}/></CField>
                            <CField label="Main phone"><CInput value={form.phone} onChange={v => set('phone', v)} placeholder="+1 (555) 000-0000"/></CField>
                            <CField label="Support email"><CInput value={form.supportEmail} onChange={v => set('supportEmail', v)} placeholder="support@yourcompany.com"/></CField>
                        </div>
                    </CSectionCard>

                    <CSectionCard
                        title="Default quote header"
                        description="This block prints at the top of every new quote PDF. Reps can override per-quote if Quote templates allow it."
                        headAction={<span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>Supports {'{{rep.name}}'}, {'{{account.name}}'}, {'{{quote.number}}'}</span>}
                    >
                        <CTextarea value={form.quoteHeader} onChange={v => set('quoteHeader', v)} rows={5}/>
                    </CSectionCard>
                </div>

                {/* RIGHT — live PDF preview */}
                <div>
                    <div style={{ position:'sticky', top:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
                        <div style={{ padding:'10px 14px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', background:T.surface2 }}>
                            <span style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.8, fontFamily:T.sans }}>Live preview · Quote PDF</span>
                            <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>Updates as you type</span>
                        </div>
                        <div style={{ padding:14, background:'#d9d2c1' }}>
                            <div style={{ background:'#fff', boxShadow:'0 2px 10px rgba(0,0,0,0.08)', borderRadius:2, padding:24, fontFamily:T.serif }}>
                                <div style={{ display:'flex', alignItems:'flex-start', gap:14, paddingBottom:14, borderBottom:`2px solid ${form.brandColor || T.goldInk}` }}>
                                    <div style={{ width:44, height:44, background:form.brandColor || T.gold, borderRadius:3, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:700, color:'#fff', flexShrink:0 }}>
                                        {(form.displayName || 'A')[0].toUpperCase()}
                                    </div>
                                    <div style={{ flex:1 }}>
                                        <div style={{ fontSize:15, fontWeight:700, color:T.ink, letterSpacing:-0.2 }}>{form.displayName || 'Your Company'}</div>
                                        <div style={{ fontSize:10, color:T.inkMid, lineHeight:1.5, fontFamily:T.sans, marginTop:2 }}>
                                            {form.address && <>{form.address}<br/></>}
                                            {(form.city || form.state || form.zip) && <>{[form.city, form.state, form.zip].filter(Boolean).join(', ')}<br/></>}
                                            {form.phone && <>{form.phone}{form.supportEmail ? ' · ' : ''}</>}
                                            {form.supportEmail}
                                        </div>
                                    </div>
                                    <div style={{ textAlign:'right' }}>
                                        <div style={{ fontSize:9, fontFamily:T.sans, color:T.inkMuted, letterSpacing:1, fontWeight:600 }}>QUOTE</div>
                                        <div style={{ fontSize:13, fontWeight:700, color:T.ink, fontFamily:T.serif }}>Q-2026-0001</div>
                                    </div>
                                </div>
                                <div style={{ fontSize:11, color:T.inkMid, marginTop:12, lineHeight:1.55, fontFamily:T.sans }}>
                                    {form.quoteHeader
                                        ? form.quoteHeader.replace('{{account.name}}','<b>Acme Corp.</b>').replace('{{rep.name}}','<b>Jamie Chen</b>').replace('{{quote.expires}}','<b>Dec 31, 2026</b>').replace('{{quote.number}}','<b>Q-2026-0001</b>')
                                        : <em style={{ color:T.inkMuted }}>No quote header set — add one above.</em>}
                                </div>
                                <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:4 }}>
                                    {[80,60,75,50,65].map((w,i) => <div key={i} style={{ height:6, width:`${w}%`, background:T.border, borderRadius:1 }}/>)}
                                </div>
                                <div style={{ marginTop:16, paddingTop:10, borderTop:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between', fontSize:10, color:T.inkMuted, fontFamily:T.sans }}>
                                    <span>{form.supportEmail || 'yourcompany.com'}</span>
                                    <span>Page 1 of 3</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DetailPageChrome>
    );
};

// ── 2. Fiscal Year ─────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const QUARTER_COLORS = ['#ede7db','#f0ece4','#ece7f2','#f0f4ea'];
const QUARTER_INKS   = [T.goldInk,'#5a544c','#5e4e7a','#4d6b3d'];

const FiscalRibbon = ({ startMonth }) => {
    const quarters = [];
    for (let q = 0; q < 4; q++) {
        const start = (startMonth + q * 3) % 12;
        quarters.push({ label:`Q${q+1}`, months:[start,(start+1)%12,(start+2)%12], start });
    }
    return (
        <div>
            <div style={{ display:'flex', gap:2, marginBottom:6 }}>
                {Array.from({ length:12 }).map((_, m) => {
                    const q = quarters.findIndex(qq => qq.months.includes(m));
                    return (
                        <div key={m} style={{ flex:1, padding:'20px 0 12px', textAlign:'center', background:QUARTER_COLORS[q], borderTop:`2px solid ${QUARTER_INKS[q]}`, position:'relative' }}>
                            <div style={{ fontSize:10, fontWeight:600, color:T.inkMid, fontFamily:T.sans }}>{MONTHS_SHORT[m]}</div>
                            {quarters[q].start === m && (
                                <div style={{ position:'absolute', top:4, left:5, fontSize:9, fontWeight:700, color:QUARTER_INKS[q], letterSpacing:0.4, fontFamily:T.sans }}>{quarters[q].label}</div>
                            )}
                            {m === 0 && (
                                <div style={{ position:'absolute', bottom:-14, left:'50%', transform:'translateX(-50%)', fontSize:8, color:T.inkMuted, fontWeight:600, letterSpacing:0.3, whiteSpace:'nowrap', fontFamily:T.sans }}>CAL YR START</div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div style={{ marginTop:22, display:'flex', alignItems:'center', gap:14, fontSize:11, color:T.inkMuted, flexWrap:'wrap', fontFamily:T.sans }}>
                {quarters.map((q, i) => (
                    <div key={i} style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                        <div style={{ width:10, height:10, background:QUARTER_COLORS[i], border:`1px solid ${QUARTER_INKS[i]}` }}/>
                        <span><b style={{ color:T.ink }}>{q.label}</b> · {MONTHS_SHORT[q.start]}–{MONTHS_SHORT[(q.start+2)%12]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const FiscalYearDetail = ({ settings, setSettings, onBack }) => {
    const savedStart = parseInt(settings?.fiscalYearStart) || 0;
    const [startMonth, setStartMonth] = useState(savedStart);
    const [dirty, setDirty]   = useState(false);
    const [saving, setSaving] = useState(false);

    const handleCancel = () => { setStartMonth(savedStart); setDirty(false); };
    const handleSave = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, fiscalYearStart: startMonth }));
        try {
            await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ fiscalYearStart: startMonth }) });
        } catch(e) { console.error('save fiscal year', e); }
        setSaving(false);
        setDirty(false);
    };

    // Compute current period display
    const now = new Date();
    const calYear = now.getFullYear();
    const fyEndMonth = (startMonth + 11) % 12;
    const fyEndYear  = startMonth <= fyEndMonth ? calYear : calYear + 1;
    const fyStartYear = startMonth > now.getMonth() ? calYear - 1 : calYear;
    const fyLabel = `FY${String(fyStartYear + 1).slice(-2)}`;
    const currentQ = Math.floor(((now.getMonth() - startMonth + 12) % 12) / 3) + 1;
    const qStartM  = (startMonth + (currentQ - 1) * 3) % 12;
    const qEndM    = (qStartM + 2) % 12;
    const nextQStartM = (qStartM + 3) % 12;
    const nextQDate = new Date(calYear, nextQStartM, 1);
    const fyEndDate = new Date(fyEndYear, fyEndMonth + 1, 0);
    const daysToNextQ = Math.round((nextQDate - now) / 86400000);
    const daysToFYEnd = Math.round((fyEndDate - now) / 86400000);

    return (
        <DetailPageChrome
            crumb="Fiscal year" title="Fiscal year"
            subtitle="Quarter starts and fiscal year alignment"
            statusDetail={`Q1 starts ${MONTHS_SHORT[startMonth]} 1`}
            updatedBy={settings?.updatedBy || 'Admin'} updatedAt="11 months ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20 }}>
                {/* LEFT */}
                <div>
                    <CSectionCard title="Fiscal calendar" description={'Choose the month your fiscal year begins. Pipeline, forecast, and every report that says "this quarter" or "this FY" derives from this setting.'}>
                        <div style={{ display:'flex', gap:20, alignItems:'flex-start', marginBottom:24, flexWrap:'wrap' }}>
                            <CField label="Fiscal year starts">
                                <CSelect value={String(startMonth)} onChange={v => { setStartMonth(parseInt(v)); setDirty(true); }}
                                    options={MONTHS_FULL.map((m, i) => ({ value:String(i), label:m }))}/>
                            </CField>
                        </div>
                        <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.8, marginBottom:10, fontFamily:T.sans }}>Current quarter map · Calendar {calYear}</div>
                        <FiscalRibbon startMonth={startMonth}/>
                    </CSectionCard>

                    <CSectionCard title="Current period" description={"What Accelerep considers 'today' for every fiscal calculation."}>
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
                            {[
                                { k:'Current fiscal year', v:fyLabel,              sub:`${MONTHS_SHORT[startMonth]} 1, ${fyStartYear} → ${MONTHS_SHORT[fyEndMonth]} ${fyEndDate.getDate()}, ${fyEndYear}` },
                                { k:'Current quarter',     v:`Q${currentQ} ${fyLabel}`, sub:`${MONTHS_SHORT[qStartM]}–${MONTHS_SHORT[qEndM]}` },
                                { k:'Next quarter start',  v:MONTHS_SHORT[nextQStartM]+' 1', sub:`in ${daysToNextQ} days` },
                                { k:'Fiscal year-end',     v:`${MONTHS_SHORT[fyEndMonth]} ${fyEndDate.getDate()}`, sub:`in ${daysToFYEnd} days` },
                            ].map((c, i) => (
                                <div key={i} style={{ padding:'12px 14px', background:T.surface2, borderRadius:T.r, border:`1px solid ${T.border}` }}>
                                    <div style={{ fontSize:10, fontWeight:600, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', marginBottom:4, fontFamily:T.sans }}>{c.k}</div>
                                    <div style={{ fontSize:17, fontWeight:700, color:T.ink, fontFamily:T.serif, fontStyle:'italic' }}>{c.v}</div>
                                    <div style={{ fontSize:11, color:T.inkMid, marginTop:3, fontFamily:T.sans }}>{c.sub}</div>
                                </div>
                            ))}
                        </div>
                    </CSectionCard>

                    <CSectionCard title="Reporting adjustments" description="Advanced — how weeks and months roll up inside a quarter. Default 3-4-4 is standard for retail; 4-4-5 is common for financial services.">
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                            {[
                                { k:'3-4-4', on:true,  hint:'Standard calendar-month quarter' },
                                { k:'4-4-5', on:false, hint:'13-week quarter, weekly alignment' },
                                { k:'4-5-4', on:false, hint:'Retail 4-5-4 calendar' },
                            ].map((o, i) => (
                                <div key={i} style={{ padding:'12px 14px', border:`1.5px solid ${o.on ? T.goldInk : T.border}`, borderRadius:T.r, background: o.on ? 'rgba(200,185,154,0.12)' : T.surface, position:'relative' }}>
                                    <div style={{ fontSize:14, fontWeight:700, color:T.ink, fontFamily:T.serif }}>{o.k}</div>
                                    <div style={{ fontSize:11.5, color:T.inkMid, marginTop:3, fontFamily:T.sans }}>{o.hint}</div>
                                    {o.on && <div style={{ position:'absolute', top:8, right:10, fontSize:10, fontWeight:700, color:T.goldInk, letterSpacing:0.4, fontFamily:T.sans }}>● ACTIVE</div>}
                                </div>
                            ))}
                        </div>
                    </CSectionCard>
                </div>

                {/* RIGHT — impact panel */}
                <div>
                    <div style={{ position:'sticky', top:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, overflow:'hidden' }}>
                        <div style={{ padding:'14px 16px', background:'#2a2622', color:'#fbf8f3' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:T.gold, letterSpacing:0.8, textTransform:'uppercase', marginBottom:6, fontFamily:T.sans }}>What this controls</div>
                            <div style={{ fontSize:13, color:'#fbf8f3', lineHeight:1.5, fontFamily:T.sans }}>
                                Changing fiscal year realigns <b style={{ color:T.gold }}>6 areas</b> of the app. Preview before saving.
                            </div>
                        </div>
                        <div style={{ padding:4 }}>
                            {[
                                { name:'Pipeline & Forecast',     items:'"This quarter" / "This FY" filters' },
                                { name:'Sales Manager dashboard', items:'Quota attainment windows' },
                                { name:'Opportunity close date',  items:'Auto-calculated quarter badge' },
                                { name:'Reports & dashboards',    items:'12 reports use fiscal periods' },
                                { name:'Automations',             items:'3 rules scheduled per quarter' },
                                { name:'Leaderboards',            items:'Team rankings reset boundary' },
                            ].map((item, i) => (
                                <div key={i} style={{ padding:'11px 12px', borderBottom: i < 5 ? `1px solid ${T.border}` : 'none', display:'flex', alignItems:'flex-start', gap:10 }}>
                                    <LIcon name="link" size={13} color={T.goldInk} style={{ marginTop:2, flexShrink:0 }}/>
                                    <div>
                                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{item.name}</div>
                                        <div style={{ fontSize:11, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>{item.items}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div style={{ padding:'10px 12px', borderTop:`1px solid ${T.border}`, background:T.surface2 }}>
                            <div style={{ fontSize:11, color:T.inkMuted, lineHeight:1.5, fontFamily:T.sans }}>
                                <LIcon name="info" size={11} color={T.inkMuted}/>{' '}
                                Historical reports stay stable. Existing reports keep the fiscal year they were generated with.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </DetailPageChrome>
    );
};

// ── 3. Company Calendar ────────────────────────────────────────
const FEDERAL_HOLIDAYS = [
    { date:'Jan 1',  name:"New Year's Day",                source:'US · Federal', type:'observed' },
    { date:'Jan 20', name:'Martin Luther King Jr. Day',    source:'US · Federal', type:'observed' },
    { date:'Feb 17', name:"Presidents' Day",               source:'US · Federal', type:'observed' },
    { date:'May 26', name:'Memorial Day',                  source:'US · Federal', type:'observed' },
    { date:'Jun 19', name:'Juneteenth',                    source:'US · Federal', type:'observed' },
    { date:'Jul 4',  name:'Independence Day (obs.)',       source:'US · Federal', type:'observed' },
    { date:'Sep 1',  name:'Labor Day',                     source:'US · Federal', type:'observed' },
    { date:'Nov 27', name:'Thanksgiving',                  source:'US · Federal', type:'observed' },
    { date:'Dec 25', name:'Christmas Day',                 source:'US · Federal', type:'observed' },
];

const CompanyCalendarDetail = ({ settings, setSettings, onBack }) => {
    const now = new Date();
    const [year, setYear]       = useState(now.getFullYear());
    const customHolidays        = settings?.customHolidays || [];
    const allHolidays           = [...FEDERAL_HOLIDAYS, ...customHolidays].sort((a, b) => {
        const toDate = s => new Date(`${s} ${year}`);
        return toDate(a.date) - toDate(b.date);
    });

    // Build 12-month grid
    const MonthGrid = ({ m }) => {
        const first  = new Date(year, m, 1).getDay();
        const days   = new Date(year, m + 1, 0).getDate();
        const cells  = [];
        for (let i = 0; i < first; i++) cells.push({ empty:true });
        for (let d = 1; d <= days; d++) {
            const dateStr = `${MONTHS_SHORT[m]} ${d}`;
            const hit = allHolidays.find(h => h.date === dateStr);
            cells.push({ d, hit });
        }
        const DAYS = ['S','M','T','W','T','F','S'];
        return (
            <div style={{ minWidth:0 }}>
                <div style={{ fontSize:10.5, fontWeight:700, color:T.ink, marginBottom:5, fontFamily:T.sans }}>{MONTHS_SHORT[m]} <span style={{ color:T.inkMuted, fontWeight:500 }}>{year}</span></div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1, fontSize:9, color:T.inkMuted, marginBottom:2 }}>
                    {DAYS.map((d,i) => <div key={i} style={{ textAlign:'center', padding:'1px 0', fontFamily:T.sans }}>{d}</div>)}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:1 }}>
                    {cells.map((c,ci) => (
                        <div key={ci} style={{ aspectRatio:'1', textAlign:'center', fontSize:9.5, display:'flex', alignItems:'center', justifyContent:'center', borderRadius:2, fontFamily:T.sans,
                            color: c.hit ? (c.hit.type === 'custom' ? T.goldInk : T.ink) : T.inkMid,
                            fontWeight: c.hit ? 700 : 400,
                            background: c.hit ? (c.hit.type === 'custom' ? 'rgba(200,185,154,0.35)' : 'rgba(77,107,61,0.18)') : 'transparent',
                        }}>
                            {c.empty ? '' : c.d}
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const fedCount    = allHolidays.filter(h => h.type === 'observed').length;
    const customCount = allHolidays.filter(h => h.type === 'custom').length;

    return (
        <DetailPageChrome
            crumb="Company calendar" title="Company calendar"
            subtitle="Shared org-wide holidays and events"
            statusDetail={`${allHolidays.length} holidays · ${year}`}
            updatedBy={settings?.updatedBy || 'Admin'} updatedAt="2 months ago"
            onBack={onBack} dirty={false} onCancel={() => {}}
            primaryAction={() => {}} primaryLabel="Add holiday"
        >
            {/* Year strip */}
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:14, padding:'12px 16px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, flexWrap:'wrap' }}>
                <div style={{ display:'inline-flex', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:20, padding:2 }}>
                    {[year-1, year, year+1].map(y => (
                        <div key={y} onClick={() => setYear(y)} style={{ padding:'5px 14px', fontSize:12.5, fontWeight:600, cursor:'pointer', borderRadius:20, fontFamily:T.sans,
                            color: y === year ? '#fbf8f3' : T.inkMid,
                            background: y === year ? T.ink : 'transparent' }}>{y}</div>
                    ))}
                </div>
                <div style={{ width:1, height:20, background:T.border }}/>
                <div style={{ display:'flex', gap:18 }}>
                    {[{ k:'Total holidays', v:String(allHolidays.length), c:T.ink },{ k:'Federal (US)', v:String(fedCount), c:T.ok },{ k:'Custom', v:String(customCount), c:T.goldInk }].map((s,i) => (
                        <div key={i}>
                            <div style={{ fontSize:10, fontWeight:600, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', fontFamily:T.sans }}>{s.k}</div>
                            <div style={{ fontSize:15, fontWeight:700, color:s.c, fontFamily:T.serif, fontStyle:'italic' }}>{s.v}</div>
                        </div>
                    ))}
                </div>
                <div style={{ flex:1 }}/>
                <button style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                    <LIcon name="refresh" size={13}/> Sync federal holidays
                </button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 440px', gap:20 }}>
                {/* Calendar grid */}
                <CSectionCard title={`Calendar ${year}`} description="Federal holidays auto-sync from the US holiday list. Custom entries are highlighted in gold.">
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
                        {Array.from({ length:12 }).map((_,m) => <MonthGrid key={m} m={m}/>)}
                    </div>
                    <div style={{ marginTop:14, display:'flex', gap:18, fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                            <span style={{ width:10, height:10, background:'rgba(77,107,61,0.4)', borderRadius:2, display:'inline-block' }}/>Observed holiday
                        </span>
                        <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                            <span style={{ width:10, height:10, background:'rgba(200,185,154,0.7)', borderRadius:2, display:'inline-block' }}/>Custom company event
                        </span>
                    </div>
                </CSectionCard>

                <div>
                    {/* Holiday list */}
                    <CSectionCard title="Holidays & events" description={null}>
                        <div style={{ maxHeight:520, overflowY:'auto', border:`1px solid ${T.border}`, borderRadius:T.r }}>
                            {allHolidays.map((h,i) => (
                                <div key={i} style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:10, borderBottom: i < allHolidays.length-1 ? `1px solid ${T.border}` : 'none', background: h.type === 'custom' ? 'rgba(200,185,154,0.08)' : T.surface }}>
                                    <div style={{ width:46, fontFamily:T.serif, fontStyle:'italic', fontSize:13, fontWeight:700, color:T.ink, flexShrink:0 }}>{h.date}</div>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{h.name}</div>
                                        <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:1, fontFamily:T.sans }}>{h.source}</div>
                                    </div>
                                    {h.type === 'custom'
                                        ? <span style={{ fontSize:9.5, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.35)', padding:'2px 6px', borderRadius:2, letterSpacing:0.3, fontFamily:T.sans }}>CUSTOM</span>
                                        : <LIcon name="lock" size={12} color={T.inkMuted}/>
                                    }
                                </div>
                            ))}
                        </div>
                    </CSectionCard>

                    {/* Connected sources */}
                    <CSectionCard title="Connected holiday sources" description="Auto-populate federal holidays by region. Manually added custom events stay on top.">
                        {[
                            { name:'United States · Federal',  on:true,  count:'9 holidays' },
                            { name:'Canada · Federal',         on:false, count:'—' },
                            { name:'United Kingdom · Bank',    on:false, count:'—' },
                            { name:`Google Calendar · ${settings?.companySupportEmail || 'holidays@accelerep.com'}`, on:!!(settings?.googleCalendarConnected), count: settings?.googleCalendarConnected ? 'Synced recently' : '—' },
                        ].map((s,i) => (
                            <div key={i} style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:10, borderBottom: i < 3 ? `1px solid ${T.border}` : 'none' }}>
                                <div style={{ width:8, height:8, borderRadius:'50%', background: s.on ? T.ok : T.border, flexShrink:0 }}/>
                                <div style={{ flex:1, fontSize:12.5, color:T.ink, fontWeight:500, fontFamily:T.sans }}>{s.name}</div>
                                <div style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{s.count}</div>
                                <span style={{ fontSize:11, fontWeight:600, color: s.on ? T.inkMid : T.goldInk, cursor:'pointer', fontFamily:T.sans }}>{s.on ? 'Disconnect' : 'Connect'}</span>
                            </div>
                        ))}
                    </CSectionCard>
                </div>
            </div>
        </DetailPageChrome>
    );
};

// ─────────────────────────────────────────────────────────────
// ADMIN WORKSPACE VIEW
// ─────────────────────────────────────────────────────────────
const AdminView = ({ settings, setSettings, currentUser }) => {
    const [scope, setScope] = useState('workspace');
    const [tab,   setTab  ] = useState('All');
    const [search, setSearch] = useState('');
    const [activeItem, setActiveItem] = useState(null); // detail panel state

    // Detail panels that have real content — others just open the card (no-op for now)
    const DETAIL_PANELS = {
        'lead-conv-benchmarks': <LeadConvBenchmarks settings={settings} setSettings={setSettings}/>,
        'company-profile':  'company-profile',
        'fiscal-year':      'fiscal-year',
        'company-calendar': 'company-calendar',
    };

    if (activeItem) {
        const id = activeItem.id;
        const onBack = () => setActiveItem(null);

        // Company detail pages — full chrome, no wrapper card
        if (id === 'company-profile')  return <CompanyProfileDetail  settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'fiscal-year')      return <FiscalYearDetail      settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'company-calendar') return <CompanyCalendarDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;

        // Generic wrapper for all other panels
        const panel = DETAIL_PANELS[id];
        return (
            <div>
                {/* Back breadcrumb */}
                <button onClick={onBack}
                    style={{ display:'inline-flex', alignItems:'center', gap:6, background:'none', border:'none', color:T.info, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:'0 0 14px' }}>
                    ← Back to settings
                </button>
                <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:20, fontWeight:700, color:T.ink, marginBottom:4, fontFamily:T.sans }}>{activeItem.name}</div>
                    <div style={{ fontSize:13, color:T.inkMid, fontFamily:T.sans }}>{activeItem.desc}</div>
                </div>
                <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:20 }}>
                    {panel || (
                        <div style={{ color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>
                            This setting panel is not yet implemented.
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const tabs = scope === 'workspace' ? WORKSPACE_TABS : ['All', 'Profile & Account'];
    const scopeItems = SETTINGS_ITEMS.filter(i => i.scope === scope);
    const filteredByTab = tab === 'All' ? scopeItems : scopeItems.filter(i => i.category === tab);
    const items = search.trim()
        ? scopeItems.filter(i => (i.name + ' ' + i.desc + ' ' + i.category).toLowerCase().includes(search.toLowerCase()))
        : filteredByTab;

    // Workspace health — from real data + static checks
    const users = settings?.users || [];
    const pipelines = settings?.pipelines || [];
    const funnelStages = settings?.funnelStages || [];
    const calConnected = settings?.googleCalendarConnected || false;
    const attentionItems = SETTINGS_ITEMS.filter(i => i.attention);
    const healthChecks = [
        { label:'SSO configured',          ok: false                       },
        { label:'MFA enforced',            ok: false                       },
        { label:'Webhooks all healthy',    ok: !attentionItems.some(i=>i.id==='webhooks') },
        { label:'Backups running',         ok: true                        },
        { label:'Default pipeline set',    ok: pipelines.length > 0       },
        { label:'Team members assigned',   ok: users.filter(u=>u.team).length === users.filter(u=>u.name).length },
        { label:'Session policy set',      ok: true                        },
        { label:'Quote branding configured', ok: true                      },
    ];
    const healthOk = healthChecks.filter(h => h.ok).length;
    const healthPct = Math.round((healthOk / healthChecks.length) * 100);

    // Recently changed feed (static + real user count)
    const recentFeed = [
        { who: currentUser || 'Admin', what:'Invited new users', when:'recently' },
        { who: currentUser || 'Admin', what:'Updated pipeline stages', when:'this week' },
        { who: currentUser || 'Admin', what:'Edited price book', when:'last week' },
        { who: 'System',               what:'Ran automated backup', when:'4 hours ago' },
    ];

    // Group items by category
    const grouped = {};
    for (const it of items) (grouped[it.category] ||= []).push(it);

    return (
        <div>
            {/* Scope switch + search row */}
            <div style={{ display:'flex', alignItems:'center', gap:14, padding:'4px 0 14px', flexWrap:'wrap' }}>
                <div style={{ display:'inline-flex', padding:3, background:T.surface, border:`1px solid ${T.border}`, borderRadius:20 }}>
                    {['workspace','personal'].map(s => (
                        <div key={s} onClick={() => { setScope(s); setTab('All'); }} style={{ padding:'5px 14px', fontSize:12.5, fontWeight:600, borderRadius:20, cursor:'pointer', color: scope===s ? '#fbf8f3' : T.inkMid, background: scope===s ? T.ink : 'transparent', transition:'background 120ms', fontFamily:T.sans }}>
                            {s === 'workspace' ? 'Workspace' : 'Personal'}
                        </div>
                    ))}
                </div>
                <span style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>
                    {scope === 'workspace' ? 'Admin settings · affects all users' : 'Only you'}
                </span>
                <div style={{ flex:1 }}/>
                {/* Search */}
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, width:300, fontFamily:T.sans }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search settings…" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:13, color:T.ink, fontFamily:T.sans }}/>
                    {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:14, padding:0 }}>×</button>}
                    <span style={{ fontSize:10, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', padding:'1px 5px', background:T.surface2, borderRadius:2, border:`1px solid ${T.border}` }}>⌘.</span>
                </div>
            </div>

            {/* Health + attention + recent strip — workspace only, no search */}
            {scope === 'workspace' && !search.trim() && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1.1fr', gap:14, marginBottom:18 }}>
                    {/* Health ring */}
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:16, display:'flex', alignItems:'center', gap:14 }}>
                        <Ring value={healthPct} size={72} stroke={7} color={T.ok} trackColor={T.border}/>
                        <div style={{ flex:1 }}>
                            <div style={{ ...eb(T.ok), marginBottom:4 }}>WORKSPACE HEALTH</div>
                            <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:4, fontFamily:T.sans }}>{healthOk} of {healthChecks.length} checks passing</div>
                            <div style={{ fontSize:11.5, color:T.inkMid, lineHeight:1.5, fontFamily:T.sans }}>Set up SSO and enforce MFA to reach 90%+ — standard for multi-rep workspaces.</div>
                        </div>
                    </div>
                    {/* Needs attention */}
                    <div style={{ background:'rgba(156,58,46,0.04)', border:'1px solid rgba(156,58,46,0.2)', borderRadius:6, padding:16 }}>
                        <div style={{ ...eb('#9c3a2e'), marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                            <span>⚠</span> NEEDS ATTENTION
                        </div>
                        {attentionItems.slice(0,3).map((it, i) => (
                            <div key={it.id} style={{ padding:'8px 0', borderBottom: i < Math.min(attentionItems.length,3)-1 ? `1px dashed rgba(156,58,46,0.15)` : 'none', display:'flex', alignItems:'center', gap:10 }}>
                                <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{it.name}</div>
                                    <div style={{ fontSize:11, color:T.inkMid, marginTop:1, fontFamily:T.sans }}>{it.statusDetail}</div>
                                </div>
                                <button style={{ padding:'4px 10px', fontSize:11, fontWeight:600, background:T.danger, color:'#fbf8f3', border:'none', borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>Fix</button>
                            </div>
                        ))}
                        {attentionItems.length === 0 && <div style={{ fontSize:12, color:T.ok, fontFamily:T.sans }}>All checks passing ✓</div>}
                    </div>
                    {/* Recently changed */}
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:16 }}>
                        <div style={{ ...eb(T.inkMuted), marginBottom:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <span>RECENTLY CHANGED</span>
                            <span style={{ fontSize:10.5, color:T.info, cursor:'pointer', fontWeight:600, letterSpacing:0, textTransform:'none', fontFamily:T.sans }}>View audit log →</span>
                        </div>
                        {recentFeed.slice(0,4).map((r, i) => (
                            <div key={i} style={{ padding:'6px 0', borderBottom: i < 3 ? `1px dashed ${T.border}` : 'none', display:'flex', alignItems:'center', gap:10 }}>
                                <Avatar name={r.who} size={22}/>
                                <div style={{ flex:1, minWidth:0 }}>
                                    <div style={{ fontSize:12, color:T.ink, lineHeight:1.3, fontFamily:T.sans }}><strong>{(r.who||'').split(' ')[0]}</strong> {r.what.toLowerCase()}</div>
                                    <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:1, fontFamily:T.sans }}>{r.when}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Personal view if scope = personal */}
            {scope === 'personal' && (
                <PersonalView settings={settings} setSettings={setSettings} currentUser={currentUser} isAdmin={true}/>
            )}

            {/* Workspace: category tabs + card grid */}
            {scope === 'workspace' && (
                <>
                    <div style={{ borderBottom:`1px solid ${T.border}`, display:'flex', gap:26, overflowX:'auto', marginBottom:18 }}>
                        {tabs.map(t => (
                            <div key={t} onClick={() => setTab(t)} style={{ fontSize:13, fontWeight: t===tab ? 600 : 400, color: t===tab ? T.info : T.inkMid, borderBottom: t===tab ? `2px solid ${T.info}` : '2px solid transparent', paddingBottom:10, cursor:'pointer', whiteSpace:'nowrap', fontFamily:T.sans, transition:'color 120ms, border-color 120ms' }}>
                                {t}
                                {t !== 'All' && (
                                    <span style={{ marginLeft:6, fontSize:10.5, color:T.inkMuted, fontWeight:500, fontFamily:T.sans }}>
                                        {SETTINGS_ITEMS.filter(i => i.scope==='workspace' && i.category===t).length}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>

                    <div>
                        {search.trim() && <div style={{ fontSize:13, color:T.inkMid, marginBottom:14, fontFamily:T.sans }}>{items.length} results for <strong>{search}</strong></div>}
                        {Object.entries(grouped).map(([cat, list]) => (
                            <div key={cat} style={{ marginBottom:24 }}>
                                {(tab === 'All' || search.trim()) && (
                                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                                        <CategoryChip category={cat}/>
                                        <span style={{ fontSize:11.5, color:T.inkMuted, fontFamily:T.sans }}>{list.length} setting{list.length===1?'':'s'}</span>
                                    </div>
                                )}
                                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                                    {list.map(it => <V2Card key={it.id} item={it} settings={settings} onOpen={DETAIL_PANELS[it.id] ? () => setActiveItem(it) : undefined}/>)}
                                </div>
                            </div>
                        ))}
                        {Object.keys(grouped).length === 0 && (
                            <div style={{ padding:'3rem', textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>
                                {search ? `No settings match "${search}".` : 'No settings in this category.'}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────
export default function SettingsTab() {
    const {
        settings, setSettings,
        currentUser, userRole,
    } = useApp();

    const isAdmin   = userRole === 'Admin';
    const isManager = userRole === 'Manager';
    const canAdmin  = isAdmin || isManager;

    return (
        <div className="tab-page" style={{ fontFamily:T.sans }}>
            {/* Page header */}
            <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16 }}>
                <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
                    <div style={{ fontSize:26, fontWeight:700, color:T.ink, letterSpacing:-0.3, fontFamily:T.sans }}>
                        {canAdmin ? 'Settings' : 'My account'}
                    </div>
                    <div style={{ fontSize:13, color:T.inkMid, marginTop:4, fontFamily:T.sans }}>
                        {canAdmin
                            ? 'Workspace admin console · manage users, pipelines, security, and integrations'
                            : 'Your personal preferences · not shared with your team'}
                    </div>
                </div>
            </div>

            {/* Body — role-gated */}
            {canAdmin ? (
                <AdminView settings={settings} setSettings={setSettings} currentUser={currentUser}/>
            ) : (
                <PersonalView settings={settings} setSettings={setSettings} currentUser={currentUser} isAdmin={false}/>
            )}
        </div>
    );
}
