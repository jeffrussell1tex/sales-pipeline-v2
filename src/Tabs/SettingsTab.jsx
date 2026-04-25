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
const DetailPageChrome = ({ crumb, title, subtitle, statusDetail, updatedBy, updatedAt, onBack, dirty, onCancel, primaryAction, primaryLabel, disablePrimary, children }) => (
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
                <button onClick={primaryAction} disabled={disablePrimary !== undefined ? disablePrimary : !dirty} style={{ padding:'8px 16px', background: (disablePrimary !== undefined ? !disablePrimary : dirty) ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: (disablePrimary !== undefined ? !disablePrimary : dirty) ? 'pointer' : 'default', fontFamily:T.sans, transition:'background 120ms' }}>{primaryLabel}</button>
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
    const [year, setYear]         = useState(now.getFullYear());
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving]     = useState(false);
    const [formMonth, setFormMonth] = useState(String(now.getMonth()));
    const [formDay,   setFormDay]   = useState(String(now.getDate()));
    const [formName,  setFormName]  = useState('');
    const [formError, setFormError] = useState('');
    const [syncing, setSyncing]     = useState(false);
    const [syncMsg, setSyncMsg]     = useState('');

    const handleSync = async () => {
        setSyncing(true);
        setSyncMsg('');
        try {
            const res  = await dbFetch(`/.netlify/functions/holidays?year=${year}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || `Server error ${res.status}`);
            if (!data || !data.holidays) throw new Error('No holidays in response');
            // Merge: keep custom holidays, replace all observed/federal entries with fresh API data
            const fresh = data.holidays; // observed entries from API
            const preserved = customHolidays; // user-added custom entries survive
            const merged = [...fresh, ...preserved].sort((a, b) => {
                const toMs = s => { try { return new Date(`${s} ${year}`).getTime(); } catch { return 0; } };
                return toMs(a.date) - toMs(b.date);
            });
            // Store fresh federal list separately so FEDERAL_HOLIDAYS const stays in sync
            setSettings(prev => ({ ...prev, customHolidays: preserved, federalHolidays: fresh }));
            await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ customHolidays: preserved, federalHolidays: fresh }) });
            setSyncMsg(`✓ Synced ${fresh.length} federal holidays for ${year}`);
            setTimeout(() => setSyncMsg(''), 4000);
        } catch (err) {
            console.error('sync holidays error', err);
            setSyncMsg(`Failed to sync — ${err.message}`);
            setTimeout(() => setSyncMsg(''), 6000);
        }
        setSyncing(false);
    };

    const customHolidays = settings?.customHolidays || [];
    const federalHolidays = settings?.federalHolidays?.length ? settings.federalHolidays : FEDERAL_HOLIDAYS;
    const allHolidays    = [...federalHolidays, ...customHolidays].sort((a, b) => {
        const toDate = s => { try { return new Date(`${s} ${year}`); } catch { return new Date(0); } };
        return toDate(a.date) - toDate(b.date);
    });

    const resetForm = () => { setFormName(''); setFormMonth(String(now.getMonth())); setFormDay('1'); setFormError(''); setShowForm(false); };

    const handleAddHoliday = async () => {
        if (!formName.trim()) { setFormError('Name is required.'); return; }
        const day = parseInt(formDay);
        const month = parseInt(formMonth);
        if (!day || day < 1 || day > 31) { setFormError('Enter a valid day.'); return; }
        const dateStr = `${MONTHS_SHORT[month]} ${day}`;
        const newHoliday = { date: dateStr, name: formName.trim(), source: 'Custom', type: 'custom' };
        const updated = [...customHolidays, newHoliday];
        setSaving(true);
        setSettings(prev => ({ ...prev, customHolidays: updated }));
        try {
            await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ customHolidays: updated }) });
        } catch(e) { console.error('save holiday', e); }
        setSaving(false);
        resetForm();
    };

    const handleDeleteHoliday = async (holiday) => {
        const updated = customHolidays.filter(h => !(h.date === holiday.date && h.name === holiday.name));
        setSettings(prev => ({ ...prev, customHolidays: updated }));
        try {
            await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ customHolidays: updated }) });
        } catch(e) { console.error('delete holiday', e); }
    };

    // Build 12-month grid
    const MonthGrid = ({ m }) => {
        const first = new Date(year, m, 1).getDay();
        const days  = new Date(year, m + 1, 0).getDate();
        const cells = [];
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

    const fedCount    = federalHolidays.length;
    const customCount = allHolidays.filter(h => h.type === 'custom').length;
    const inpStyle    = { padding:'7px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' };
    const selStyle    = { ...inpStyle, appearance:'none', cursor:'pointer',
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat:'no-repeat', backgroundPosition:'right 8px center', paddingRight:26 };

    return (
        <DetailPageChrome
            crumb="Company calendar" title="Company calendar"
            subtitle="Shared org-wide holidays and events"
            statusDetail={`${allHolidays.length} holidays · ${year}`}
            updatedBy={settings?.updatedBy || 'Admin'} updatedAt="2 months ago"
            onBack={onBack} dirty={false} onCancel={onBack} disablePrimary={true}
            primaryAction={() => {}} primaryLabel=""
            rightActions={
                <button onClick={() => { setShowForm(v => !v); }}
                    style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                    + Add holiday
                </button>
            }
        >
            {/* Add holiday inline form */}
            {showForm && (
                <div style={{ background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+2, padding:16, marginBottom:14, boxShadow:'0 2px 12px rgba(42,38,34,0.1)' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:T.ink, marginBottom:12, fontFamily:T.sans }}>Add custom holiday</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 1fr auto auto', gap:10, alignItems:'flex-end' }}>
                        <div>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Month</label>
                            <select value={formMonth} onChange={e => setFormMonth(e.target.value)} style={selStyle}>
                                {MONTHS_FULL.map((m,i) => <option key={i} value={String(i)}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Day</label>
                            <input type="number" min="1" max="31" value={formDay} onChange={e => { setFormDay(e.target.value); setFormError(''); }} style={inpStyle}/>
                        </div>
                        <div>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Name</label>
                            <input type="text" placeholder="e.g. Company offsite" value={formName} onChange={e => { setFormName(e.target.value); setFormError(''); }}
                                style={inpStyle} onKeyDown={e => { if (e.key === 'Enter') handleAddHoliday(); if (e.key === 'Escape') resetForm(); }}/>
                        </div>
                        <button onClick={handleAddHoliday} disabled={saving}
                            style={{ padding:'7px 16px', background: saving ? T.borderStrong : T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: saving ? 'default' : 'pointer', fontFamily:T.sans, whiteSpace:'nowrap', alignSelf:'flex-end' }}>
                            {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={resetForm}
                            style={{ padding:'7px 12px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans, alignSelf:'flex-end' }}>
                            Cancel
                        </button>
                    </div>
                    {formError && <div style={{ fontSize:11.5, color:T.danger, marginTop:8, fontFamily:T.sans }}>{formError}</div>}
                </div>
            )}

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
                <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
                    <button onClick={handleSync} disabled={syncing}
                        style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background: syncing ? T.borderStrong : T.surface, color: syncing ? T.inkMuted : T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: syncing ? 'default' : 'pointer', fontFamily:T.sans, transition:'all 120ms' }}>
                        <LIcon name="refresh" size={13} color={syncing ? T.inkMuted : T.ink}/> {syncing ? 'Syncing…' : 'Sync federal holidays'}
                    </button>
                    {syncMsg && <div style={{ fontSize:11, color: syncMsg.startsWith('✓') ? T.ok : T.danger, fontFamily:T.sans, fontWeight:600 }}>{syncMsg}</div>}
                </div>
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
                            {allHolidays.length === 0 && (
                                <div style={{ padding:'2rem', textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>No holidays yet.</div>
                            )}
                            {allHolidays.map((h,i) => (
                                <div key={`${h.date}-${h.name}`} style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:10, borderBottom: i < allHolidays.length-1 ? `1px solid ${T.border}` : 'none', background: h.type === 'custom' ? 'rgba(200,185,154,0.08)' : T.surface }}>
                                    <div style={{ width:46, fontFamily:T.serif, fontStyle:'italic', fontSize:13, fontWeight:700, color:T.ink, flexShrink:0 }}>{h.date}</div>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{h.name}</div>
                                        <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:1, fontFamily:T.sans }}>{h.source}</div>
                                    </div>
                                    {h.type === 'custom' ? (
                                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                            <span style={{ fontSize:9.5, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.35)', padding:'2px 6px', borderRadius:2, letterSpacing:0.3, fontFamily:T.sans }}>CUSTOM</span>
                                            <button onClick={() => handleDeleteHoliday(h)} title="Remove"
                                                style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:15, lineHeight:1, padding:'0 2px', fontFamily:T.sans }}
                                                onMouseEnter={e => e.currentTarget.style.color = T.danger}
                                                onMouseLeave={e => e.currentTarget.style.color = T.inkMuted}>×</button>
                                        </div>
                                    ) : (
                                        <LIcon name="lock" size={12} color={T.inkMuted}/>
                                    )}
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
// ─────────────────────────────────────────────────────────────
// SALES PROCESS DETAIL PAGES — Group 1 of 2
// ─────────────────────────────────────────────────────────────

// ── Extend DetailPageChrome to support Sales process breadcrumb ──
// Already defined above — we use it with secondCrumb prop added below.
// We extend by wrapping: SPDetailPageChrome adds the Sales process crumb.
const SPDetailPageChrome = ({ crumb, title, subtitle, statusDetail, updatedBy, updatedAt,
    onBack, dirty, onCancel, primaryAction, primaryLabel, disablePrimary, rightActions, children }) => (
    <div style={{ fontFamily: T.sans }}>
        {/* Breadcrumb */}
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10 }}>
            <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
            <span>/</span>
            <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Sales process</button>
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
                {rightActions || (
                    <>
                        <button onClick={onCancel} style={{ padding:'8px 16px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                        <button onClick={primaryAction} disabled={disablePrimary !== undefined ? disablePrimary : !dirty}
                            style={{ padding:'8px 16px', background:(disablePrimary !== undefined ? !disablePrimary : dirty) ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:(disablePrimary !== undefined ? !disablePrimary : dirty) ? 'pointer':'default', fontFamily:T.sans, transition:'background 120ms' }}>
                            {primaryLabel}
                        </button>
                    </>
                )}
            </div>
        </div>
        {children}
    </div>
);

// ── Shared SP primitives ──────────────────────────────────────
const SPTable = ({ columns, rows }) => (
    <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, overflow:'hidden', background:T.surface }}>
        <div style={{ display:'grid', gridTemplateColumns:columns.map(c => c.w||'1fr').join(' '), padding:'9px 14px', borderBottom:`1px solid ${T.border}`, background:T.surface2, gap:10 }}>
            {columns.map((c,i) => (
                <div key={i} style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign:c.align||'left', fontFamily:T.sans }}>{c.label}</div>
            ))}
        </div>
        {rows.map((row,i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:columns.map(c => c.w||'1fr').join(' '), padding:'11px 14px', gap:10, borderBottom: i===rows.length-1 ? 'none' : `1px solid ${T.border}`, alignItems:'center' }}>
                {columns.map((c,j) => (
                    <div key={j} style={{ textAlign:c.align||'left', color:c.muted ? T.inkMid : T.ink, fontFamily: c.mono ? 'ui-monospace,Menlo,monospace' : T.sans, fontSize:13 }}>
                        {row[c.key]}
                    </div>
                ))}
            </div>
        ))}
    </div>
);

const SPDrag = ({ muted }) => (
    <span style={{ color: muted ? T.border : T.inkMuted, fontSize:14, cursor:'grab', userSelect:'none', letterSpacing:-2 }}>⋮⋮</span>
);

const SPSparkline = ({ data, color }) => {
    const max = Math.max(...data), min = Math.min(...data);
    const w = 120, h = 28;
    const pts = data.map((v,i) => {
        const x = (i / (data.length-1)) * w;
        const y = h - ((v - min) / ((max-min)||1)) * h;
        return `${x},${y}`;
    }).join(' ');
    return (
        <svg width={w} height={h} style={{ verticalAlign:'middle' }}>
            <polyline points={pts} fill="none" stroke={color||T.ok} strokeWidth="1.5"/>
        </svg>
    );
};

const STAGE_COLORS = {
    'Prospecting':'#e07b4a','Qualification':'#d4a847','Discovery':'#8aab5a',
    'Proposal':'#4a8abd','Negotiation':'#7a5abd','Closing':'#4aad8a',
    'Closed Won':'#4d6b3d','Closed Lost':'#9c3a2e',
};

// ── 1. Pipelines ──────────────────────────────────────────────
const DEFAULT_PIPELINES = [
    { id:'new-biz',  name:'New business', isDefault:true,
      stages:['Prospecting','Qualification','Discovery','Proposal','Negotiation','Closing','Closed Won','Closed Lost'],
      active:147, value:'$4.8M', teams:['SMB West','SMB East','Mid-Market'] },
    { id:'renewal',  name:'Renewals', isDefault:false,
      stages:['Upcoming','Engaged','Negotiating','Renewed','Churned'],
      active:62, value:'$2.1M', teams:['Customer Success'] },
    { id:'exp',      name:'Expansion', isDefault:false,
      stages:['Identified','Qualified','Proposal','Commit','Won','Lost'],
      active:38, value:'$890k', teams:['Account Management'] },
];

const STAGE_PROBS = { 'Prospecting':10,'Qualification':25,'Discovery':40,'Proposal':60,'Negotiation':80,'Closing':90,'Closed Won':100,'Closed Lost':0 };
const STAGE_TYPES = { 'Closed Won':'Won','Closed Lost':'Lost' };

const DEFAULT_ASSIGNMENT_RULES = [
    { team:'SMB West',           members:8,  defaultPipeline:'New business' },
    { team:'SMB East',           members:9,  defaultPipeline:'New business' },
    { team:'Mid-Market',         members:6,  defaultPipeline:'New business' },
    { team:'Customer Success',   members:5,  defaultPipeline:'Renewals' },
    { team:'Account Management', members:7,  defaultPipeline:'Expansion' },
];

const PipelinesDetail = ({ settings, setSettings, onBack }) => {
    const [selectedId, setSelectedId]   = useState('new-biz');
    const [showNewForm, setShowNewForm] = useState(false);
    const [newName, setNewName]         = useState('');
    const [newDefault, setNewDefault]   = useState(false);
    const [newErr, setNewErr]           = useState('');
    const [saving, setSaving]           = useState(false);
    const [editingTeam, setEditingTeam] = useState(null);
    const [showAddStage, setShowAddStage] = useState(false);
    const [newStageName, setNewStageName] = useState('');
    const [newStageType, setNewStageType] = useState('Open');
    const [stageErr, setStageErr]         = useState('');
    // Pipeline drag state
    const [dragPipelineIdx, setDragPipelineIdx] = useState(null);
    const [dragOverPipelineIdx, setDragOverPipelineIdx] = useState(null);
    // Stage drag state
    const [dragStageIdx, setDragStageIdx] = useState(null);
    const [dragOverStageIdx, setDragOverStageIdx] = useState(null);
    // Stage kebab state
    const [openKebab, setOpenKebab]       = useState(null); // stage name
    const [renamingStage, setRenamingStage] = useState(null); // stage name
    const [renameVal, setRenameVal]         = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null); // stage name
    // Pipeline kebab + delete state
    const [openPipelineKebab, setOpenPipelineKebab]     = useState(null); // pipeline id
    const [confirmDeletePipeline, setConfirmDeletePipeline] = useState(null); // pipeline id
    const [blockedDeletePipeline, setBlockedDeletePipeline] = useState(null); // { name, reason }

    const pipelines = settings?.pipelines?.length ? settings.pipelines : DEFAULT_PIPELINES;
    const selected  = pipelines.find(p => p.id === selectedId) || pipelines[0];

    const assignmentRules = settings?.assignmentRules?.length
        ? settings.assignmentRules
        : DEFAULT_ASSIGNMENT_RULES;

    // ── New pipeline ──────────────────────────────────────────
    const handleAddPipeline = async () => {
        if (!newName.trim()) { setNewErr('Pipeline name is required.'); return; }
        if (pipelines.some(p => p.name.toLowerCase() === newName.trim().toLowerCase())) {
            setNewErr('A pipeline with that name already exists.'); return;
        }
        const newPipeline = {
            id:        newName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
            name:      newName.trim(),
            isDefault: newDefault,
            stages:    ['Prospecting', 'Proposal', 'Closed Won', 'Closed Lost'],
            active:    0, value: '$0',
            teams:     [],
        };
        // If set as default, clear default flag on existing ones
        const updated = newDefault
            ? [...pipelines.map(p => ({ ...p, isDefault: false })), newPipeline]
            : [...pipelines, newPipeline];
        setSaving(true);
        setSettings(prev => ({ ...prev, pipelines: updated }));
        try {
            await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ pipelines: updated }) });
        } catch(e) { console.error('save pipelines', e); }
        setSaving(false);
        setSelectedId(newPipeline.id);
        setNewName(''); setNewDefault(false); setNewErr(''); setShowNewForm(false);
    };

    // ── Assignment rule edit ──────────────────────────────────
    const handleAssignmentChange = async (teamName, newPipelineName) => {
        const updated = assignmentRules.map(r =>
            r.team === teamName ? { ...r, defaultPipeline: newPipelineName } : r
        );
        setSettings(prev => ({ ...prev, assignmentRules: updated }));
        setEditingTeam(null);
        try {
            await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ assignmentRules: updated }) });
        } catch(e) { console.error('save assignment rules', e); }
    };

    // ── Add stage to selected pipeline ───────────────────────
    const handleAddStage = async () => {
        if (!newStageName.trim()) { setStageErr('Stage name is required.'); return; }
        const currentStages = selected?.stages || [];
        if (currentStages.some(s => s.toLowerCase() === newStageName.trim().toLowerCase())) {
            setStageErr('A stage with that name already exists in this pipeline.'); return;
        }
        // Insert before terminal stages (Closed Won / Closed Lost)
        const terminals = currentStages.filter(s => STAGE_TYPES[s]);
        const opens     = currentStages.filter(s => !STAGE_TYPES[s]);
        const newStage  = newStageName.trim();
        const updatedStages = newStageType === 'Open'
            ? [...opens, newStage, ...terminals]
            : [...opens, ...terminals.filter(s => STAGE_TYPES[s] !== newStageType), newStage, ...terminals.filter(s => STAGE_TYPES[s] === newStageType)];

        const updatedPipelines = pipelines.map(p =>
            p.id === selectedId ? { ...p, stages: updatedStages } : p
        );
        setSettings(prev => ({ ...prev, pipelines: updatedPipelines }));
        try {
            await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ pipelines: updatedPipelines }) });
        } catch(e) { console.error('save stage', e); }
        setNewStageName(''); setNewStageType('Open'); setStageErr(''); setShowAddStage(false);
    };

    // ── Pipeline drag-to-reorder ─────────────────────────────
    const handlePipelineDrop = async (fromIdx, toIdx) => {
        if (fromIdx === toIdx) return;
        const reordered = [...pipelines];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        setSettings(prev => ({ ...prev, pipelines: reordered }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ pipelines: reordered }) }); }
        catch(e) { console.error('reorder pipelines', e); }
    };

    // ── Delete pipeline ──────────────────────────────────────
    const handleDeletePipeline = (pipelineId) => {
        const pipeline = pipelines.find(p => p.id === pipelineId);
        if (!pipeline) return;
        if (pipeline.isDefault) {
            setBlockedDeletePipeline({ name: pipeline.name, reason: 'This is the default pipeline. Set another pipeline as default before deleting it.' });
            setOpenPipelineKebab(null);
            return;
        }
        if ((pipeline.active || 0) > 0) {
            setBlockedDeletePipeline({ name: pipeline.name, reason: `This pipeline has ${pipeline.active} open deal${pipeline.active !== 1 ? 's' : ''}. Move or close all deals before deleting.` });
            setOpenPipelineKebab(null);
            return;
        }
        setConfirmDeletePipeline(pipelineId);
        setOpenPipelineKebab(null);
    };

    const handleConfirmDeletePipeline = async () => {
        const updated = pipelines.filter(p => p.id !== confirmDeletePipeline);
        setSettings(prev => ({ ...prev, pipelines: updated }));
        if (selectedId === confirmDeletePipeline) setSelectedId(updated[0]?.id || null);
        setConfirmDeletePipeline(null);
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ pipelines: updated }) }); }
        catch(e) { console.error('delete pipeline', e); }
    };

    // ── Export JSON ───────────────────────────────────────────
    const handleExportJSON = () => {
        const exportData = {
            exportedAt: new Date().toISOString(),
            pipelines: pipelines.map(p => ({
                id: p.id, name: p.name, isDefault: p.isDefault,
                stages: p.stages, teams: p.teams,
                activeDeals: p.active, pipelineValue: p.value,
            })),
            assignmentRules,
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `accelerep-pipelines-${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ── Stage drag-to-reorder ─────────────────────────────────
    const handleStageDrop = async (fromIdx, toIdx) => {
        if (fromIdx === toIdx) return;
        const stages = [...(selected?.stages || [])];
        const [moved] = stages.splice(fromIdx, 1);
        stages.splice(toIdx, 0, moved);
        const updatedPipelines = pipelines.map(p =>
            p.id === selectedId ? { ...p, stages } : p
        );
        setSettings(prev => ({ ...prev, pipelines: updatedPipelines }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ pipelines: updatedPipelines }) }); }
        catch(e) { console.error('reorder stages', e); }
    };

    // ── Stage rename ──────────────────────────────────────────
    const handleRenameStage = async () => {
        if (!renameVal.trim() || renameVal.trim() === renamingStage) { setRenamingStage(null); return; }
        const stages = (selected?.stages || []).map(s => s === renamingStage ? renameVal.trim() : s);
        const updatedPipelines = pipelines.map(p =>
            p.id === selectedId ? { ...p, stages } : p
        );
        setSettings(prev => ({ ...prev, pipelines: updatedPipelines }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ pipelines: updatedPipelines }) }); }
        catch(e) { console.error('rename stage', e); }
        setRenamingStage(null); setRenameVal(''); setOpenKebab(null);
    };

    // ── Stage delete ──────────────────────────────────────────
    const handleDeleteStage = async (stageName) => {
        const stages = (selected?.stages || []).filter(s => s !== stageName);
        const updatedPipelines = pipelines.map(p =>
            p.id === selectedId ? { ...p, stages } : p
        );
        setSettings(prev => ({ ...prev, pipelines: updatedPipelines }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ pipelines: updatedPipelines }) }); }
        catch(e) { console.error('delete stage', e); }
        setConfirmDelete(null); setOpenKebab(null);
    };

    const selStyle = { padding:'4px 8px', fontSize:12, border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, color:T.ink, fontFamily:T.sans, cursor:'pointer', outline:'none' };

    return (
        <SPDetailPageChrome
            crumb="Pipelines" title="Pipelines"
            subtitle="Manage multiple pipelines and their stages"
            statusDetail={`${pipelines.length} pipelines · ${pipelines.reduce((a,p) => a + (p.stages?.length||0), 0)} stages`}
            updatedBy="Admin" updatedAt="3 weeks ago"
            onBack={onBack} dirty={false}
            rightActions={
                <div style={{ display:'flex', gap:8 }}>
                    <button onClick={handleExportJSON} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                        <LIcon name="download" size={13}/> Export JSON
                    </button>
                    <button onClick={() => { setShowNewForm(v => !v); setNewErr(''); }}
                        style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background: showNewForm ? T.surface2 : T.ink, color: showNewForm ? T.ink : '#fbf8f3', border: showNewForm ? `1px solid ${T.borderStrong}` : 'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                        + New pipeline
                    </button>
                </div>
            }
        >
            {/* New pipeline inline form */}
            {showNewForm && (
                <div style={{ background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+2, padding:16, marginBottom:16, boxShadow:'0 2px 12px rgba(42,38,34,0.08)' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:T.ink, marginBottom:12, fontFamily:T.sans }}>New pipeline</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 180px auto auto', gap:10, alignItems:'flex-end' }}>
                        <div>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Pipeline name</label>
                            <input value={newName} onChange={e => { setNewName(e.target.value); setNewErr(''); }}
                                placeholder="e.g. Partner deals"
                                onKeyDown={e => { if (e.key==='Enter') handleAddPipeline(); if (e.key==='Escape') { setShowNewForm(false); setNewErr(''); } }}
                                autoFocus
                                style={{ padding:'7px 10px', background:T.surface, border:`1px solid ${newErr ? T.danger : T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' }}/>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:2 }}>
                            <input type="checkbox" id="new-default-chk" checked={newDefault} onChange={e => setNewDefault(e.target.checked)} style={{ cursor:'pointer' }}/>
                            <label htmlFor="new-default-chk" style={{ fontSize:12.5, color:T.ink, cursor:'pointer', fontFamily:T.sans, whiteSpace:'nowrap' }}>Set as default</label>
                        </div>
                        <button onClick={handleAddPipeline} disabled={saving}
                            style={{ padding:'7px 16px', background: saving ? T.borderStrong : T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: saving ? 'default' : 'pointer', fontFamily:T.sans }}>
                            {saving ? 'Saving…' : 'Create'}
                        </button>
                        <button onClick={() => { setShowNewForm(false); setNewName(''); setNewErr(''); }}
                            style={{ padding:'7px 12px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                            Cancel
                        </button>
                    </div>
                    {newErr && <div style={{ fontSize:11.5, color:T.danger, marginTop:8, fontFamily:T.sans }}>{newErr}</div>}
                    <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:newErr ? 4 : 8, fontFamily:T.sans }}>
                        New pipelines start with 4 default stages. You can add, remove, and reorder stages after creation.
                    </div>
                </div>
            )}

            {/* Blocked-delete modal */}
            {blockedDeletePipeline && (
                <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.5)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}
                    onClick={() => setBlockedDeletePipeline(null)}>
                    <div onClick={e => e.stopPropagation()} style={{ background:T.surface, borderRadius:T.r+4, padding:28, maxWidth:400, width:'90%', boxShadow:'0 8px 32px rgba(42,38,34,0.2)', fontFamily:T.sans }}>
                        <div style={{ fontSize:16, fontWeight:700, color:T.ink, marginBottom:8 }}>Cannot delete "{blockedDeletePipeline.name}"</div>
                        <div style={{ fontSize:13, color:T.inkMid, lineHeight:1.6, marginBottom:20 }}>{blockedDeletePipeline.reason}</div>
                        <button onClick={() => setBlockedDeletePipeline(null)}
                            style={{ padding:'8px 20px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                            Got it
                        </button>
                    </div>
                </div>
            )}

            {/* Confirm-delete modal */}
            {confirmDeletePipeline && (() => {
                const p = pipelines.find(pp => pp.id === confirmDeletePipeline);
                return (
                    <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.5)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' }}
                        onClick={() => setConfirmDeletePipeline(null)}>
                        <div onClick={e => e.stopPropagation()} style={{ background:T.surface, borderRadius:T.r+4, padding:28, maxWidth:400, width:'90%', boxShadow:'0 8px 32px rgba(42,38,34,0.2)', fontFamily:T.sans }}>
                            <div style={{ fontSize:16, fontWeight:700, color:T.ink, marginBottom:8 }}>Delete "{p?.name}"?</div>
                            <div style={{ fontSize:13, color:T.inkMid, lineHeight:1.6, marginBottom:20 }}>
                                This pipeline has no open deals and can be safely deleted. This action cannot be undone.
                            </div>
                            <div style={{ display:'flex', gap:10 }}>
                                <button onClick={handleConfirmDeletePipeline}
                                    style={{ padding:'8px 20px', background:T.danger, color:'#fff', border:'none', borderRadius:T.r, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                                    Delete pipeline
                                </button>
                                <button onClick={() => setConfirmDeletePipeline(null)}
                                    style={{ padding:'8px 20px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <div style={{ display:'grid', gridTemplateColumns:'420px 1fr', gap:20 }}>
                {/* Left: pipeline list */}
                <div>
                    <CSectionCard title="Pipelines" description="Drag to reorder. The default pipeline is used for new opportunities when no pipeline is selected.">
                        {pipelines.map((p,i) => (
                            <div key={p.id}
                                draggable
                                onDragStart={() => setDragPipelineIdx(i)}
                                onDragOver={e => { e.preventDefault(); setDragOverPipelineIdx(i); }}
                                onDragEnd={() => { setDragPipelineIdx(null); setDragOverPipelineIdx(null); }}
                                onDrop={e => { e.preventDefault(); handlePipelineDrop(dragPipelineIdx, i); setDragPipelineIdx(null); setDragOverPipelineIdx(null); }}
                                onClick={() => setSelectedId(p.id)}
                                style={{ padding:'14px 16px', border:`1.5px solid ${selectedId===p.id ? T.goldInk : dragOverPipelineIdx===i ? T.goldInk : T.border}`, background: selectedId===p.id ? 'rgba(200,185,154,0.1)' : dragOverPipelineIdx===i ? 'rgba(200,185,154,0.06)' : T.surface, borderRadius:T.r+2, marginBottom:10, cursor:'grab', transition:'all 120ms', opacity: dragPipelineIdx===i ? 0.5 : 1 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                                    <SPDrag/>
                                    <div style={{ fontSize:14, fontWeight:700, color:T.ink, fontFamily:T.sans }}>{p.name}</div>
                                    {p.isDefault && <span style={{ fontSize:9.5, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.3)', padding:'2px 6px', borderRadius:2, letterSpacing:0.3, fontFamily:T.sans }}>DEFAULT</span>}
                                    <div style={{ flex:1 }}/>
                                    <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{p.active} open · {p.value}</span>
                                    {/* Pipeline kebab */}
                                    <div style={{ position:'relative' }} onClick={e => e.stopPropagation()}>
                                        <button onClick={() => setOpenPipelineKebab(openPipelineKebab===p.id ? null : p.id)}
                                            style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:'0 2px', lineHeight:1 }}>⋯</button>
                                        {openPipelineKebab === p.id && (
                                            <div style={{ position:'absolute', right:0, top:'100%', zIndex:300, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:160, overflow:'hidden' }}>
                                                <button onClick={() => { setSelectedId(p.id); setOpenPipelineKebab(null); }}
                                                    style={{ display:'block', width:'100%', padding:'10px 14px', background:'none', border:'none', textAlign:'left', fontSize:13, color:T.ink, cursor:'pointer', fontFamily:T.sans }}
                                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                    View stages
                                                </button>
                                                {!p.isDefault && (
                                                    <button onClick={async () => {
                                                        const updated = pipelines.map(pp => ({ ...pp, isDefault: pp.id === p.id }));
                                                        setSettings(prev => ({ ...prev, pipelines: updated }));
                                                        setOpenPipelineKebab(null);
                                                        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ pipelines: updated }) }); }
                                                        catch(e) { console.error('set default', e); }
                                                    }}
                                                        style={{ display:'block', width:'100%', padding:'10px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', fontSize:13, color:T.ink, cursor:'pointer', fontFamily:T.sans }}
                                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                        Set as default
                                                    </button>
                                                )}
                                                <button onClick={() => handleDeletePipeline(p.id)}
                                                    style={{ display:'block', width:'100%', padding:'10px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', fontSize:13, color:T.danger, cursor:'pointer', fontFamily:T.sans }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(156,58,46,0.06)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                    Delete pipeline
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display:'flex', gap:2 }}>
                                    {(p.stages||[]).map((s,si) => (
                                        <div key={si} style={{ flex:1, padding:'5px 4px', fontSize:9.5, fontWeight:600, background: STAGE_COLORS[s] ? `${STAGE_COLORS[s]}22` : T.surface2, color:STAGE_COLORS[s]||T.inkMid, borderTop:`2px solid ${STAGE_COLORS[s]||T.border}`, textAlign:'center', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:T.sans }}>
                                            {s}
                                        </div>
                                    ))}
                                </div>
                                <div style={{ marginTop:8, fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>
                                    Used by {(p.teams||[]).map((t,ti) => <span key={ti}><b style={{ color:T.inkMid }}>{t}</b>{ti < p.teams.length-1 ? ' · ' : ''}</span>)}
                                    {(p.teams||[]).length === 0 && <span style={{ color:T.inkMuted, fontStyle:'italic' }}>No teams assigned yet</span>}
                                </div>
                            </div>
                        ))}
                    </CSectionCard>
                </div>

                {/* Right: selected pipeline stages + assignment */}
                <div>
                    <CSectionCard
                        title={`${selected?.name} — stages`}
                        description="The stage flow for this pipeline. Probability feeds forecast & Sales Manager dashboards."
                        headAction={
                            <button onClick={() => { setShowAddStage(v => !v); setStageErr(''); setNewStageName(''); }}
                                style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background: showAddStage ? T.surface2 : 'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                + Add stage
                            </button>
                        }
                    >
                        {/* Add stage inline form */}
                        {showAddStage && (
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 120px auto auto', gap:8, alignItems:'flex-end', padding:'10px 12px', background:T.surface2, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+1, marginBottom:12 }}>
                                <div>
                                    <label style={{ fontSize:10.5, fontWeight:600, color:T.inkMid, display:'block', marginBottom:3, fontFamily:T.sans }}>Stage name</label>
                                    <input value={newStageName} onChange={e => { setNewStageName(e.target.value); setStageErr(''); }}
                                        placeholder="e.g. Due diligence"
                                        autoFocus
                                        onKeyDown={e => { if (e.key==='Enter') handleAddStage(); if (e.key==='Escape') { setShowAddStage(false); setStageErr(''); } }}
                                        style={{ padding:'6px 10px', background:T.surface, border:`1px solid ${stageErr ? T.danger : T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' }}/>
                                    {stageErr && <div style={{ fontSize:10.5, color:T.danger, marginTop:3, fontFamily:T.sans }}>{stageErr}</div>}
                                </div>
                                <div>
                                    <label style={{ fontSize:10.5, fontWeight:600, color:T.inkMid, display:'block', marginBottom:3, fontFamily:T.sans }}>Type</label>
                                    <select value={newStageType} onChange={e => setNewStageType(e.target.value)} style={{ ...selStyle, width:'100%' }}>
                                        <option>Open</option>
                                        <option>Won</option>
                                        <option>Lost</option>
                                    </select>
                                </div>
                                <button onClick={handleAddStage}
                                    style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                                    Add
                                </button>
                                <button onClick={() => { setShowAddStage(false); setStageErr(''); setNewStageName(''); }}
                                    style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, cursor:'pointer', fontFamily:T.sans }}>
                                    Cancel
                                </button>
                            </div>
                        )}
                        {/* Stage table with drag + kebab */}
                        <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, overflow:'hidden' }}>
                            {/* Header */}
                            <div style={{ display:'grid', gridTemplateColumns:'28px 1.6fr 120px 90px 90px 70px 28px', padding:'9px 14px', borderBottom:`1px solid ${T.border}`, background:T.surface2, gap:10 }}>
                                {['','Stage','Default prob.','Type','Avg days','Open',''].map((h,i) => (
                                    <div key={i} style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign: i>=2&&i<=5 ? 'right' : 'left', fontFamily:T.sans }}>{h}</div>
                                ))}
                            </div>
                            {(selected?.stages||[]).map((s,i) => (
                                <div key={s}
                                    draggable
                                    onDragStart={() => setDragStageIdx(i)}
                                    onDragOver={e => { e.preventDefault(); setDragOverStageIdx(i); }}
                                    onDragEnd={() => { setDragStageIdx(null); setDragOverStageIdx(null); }}
                                    onDrop={e => { e.preventDefault(); handleStageDrop(dragStageIdx, i); setDragStageIdx(null); setDragOverStageIdx(null); }}
                                    style={{ display:'grid', gridTemplateColumns:'28px 1.6fr 120px 90px 90px 70px 28px', padding:'11px 14px', gap:10, borderBottom: i<(selected?.stages||[]).length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', background: dragOverStageIdx===i ? 'rgba(200,185,154,0.06)' : T.surface, opacity: dragStageIdx===i ? 0.4 : 1, cursor:'grab', position:'relative', transition:'background 80ms', fontSize:13, fontFamily:T.sans }}>
                                    <div style={{ cursor:'grab', color:T.inkMuted, fontSize:14, letterSpacing:-2 }}>⋮⋮</div>
                                    <div>
                                        {renamingStage === s ? (
                                            <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                                                onKeyDown={e => { if (e.key==='Enter') handleRenameStage(); if (e.key==='Escape') { setRenamingStage(null); setRenameVal(''); } }}
                                                onBlur={handleRenameStage}
                                                style={{ padding:'3px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans, outline:'none', width:'90%' }}/>
                                        ) : (
                                            <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                                                <span style={{ width:8, height:8, borderRadius:'50%', background:STAGE_COLORS[s]||T.border, display:'inline-block', flexShrink:0 }}/>
                                                <b style={{ fontFamily:T.sans }}>{s}</b>
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ textAlign:'right' }}><span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>{STAGE_PROBS[s] !== undefined ? `${STAGE_PROBS[s]}%` : '—'}</span></div>
                                    <div style={{ textAlign:'right' }}><span style={{ fontSize:12, color: STAGE_TYPES[s]==='Won' ? T.ok : STAGE_TYPES[s]==='Lost' ? T.danger : T.inkMid, fontFamily:T.sans }}>{STAGE_TYPES[s]||'Open'}</span></div>
                                    <div style={{ textAlign:'right' }}><span style={{ color:T.inkMuted, fontFamily:T.sans }}>{STAGE_TYPES[s] ? '—' : `${5+i*2}d`}</span></div>
                                    <div style={{ textAlign:'right' }}><span style={{ color:T.inkMuted, fontFamily:T.sans }}>{STAGE_TYPES[s] ? '—' : `${Math.max(5, 42-i*5)}`}</span></div>
                                    {/* Kebab */}
                                    <div style={{ position:'relative' }}>
                                        <button onClick={e => { e.stopPropagation(); setOpenKebab(openKebab===s ? null : s); setConfirmDelete(null); setRenamingStage(null); }}
                                            style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:0, lineHeight:1, fontFamily:T.sans }}>⋯</button>
                                        {openKebab === s && (
                                            <div onClick={e => e.stopPropagation()}
                                                style={{ position:'absolute', right:0, top:'100%', zIndex:200, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:140, overflow:'hidden' }}>
                                                {confirmDelete === s ? (
                                                    <div style={{ padding:'12px 14px' }}>
                                                        <div style={{ fontSize:12, color:T.ink, marginBottom:8, fontFamily:T.sans }}>Delete <b>{s}</b>?</div>
                                                        <div style={{ display:'flex', gap:6 }}>
                                                            <button onClick={() => handleDeleteStage(s)}
                                                                style={{ flex:1, padding:'5px 0', background:T.danger, color:'#fff', border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Delete</button>
                                                            <button onClick={() => setConfirmDelete(null)}
                                                                style={{ flex:1, padding:'5px 0', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <button onClick={() => { setRenamingStage(s); setRenameVal(s); setOpenKebab(null); }}
                                                            style={{ display:'block', width:'100%', padding:'10px 14px', background:'none', border:'none', textAlign:'left', fontSize:13, color:T.ink, cursor:'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                            Rename
                                                        </button>
                                                        <button onClick={() => setConfirmDelete(s)}
                                                            style={{ display:'block', width:'100%', padding:'10px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', fontSize:13, color:T.danger, cursor:'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(156,58,46,0.06)'}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                            Delete stage
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CSectionCard>

                    <CSectionCard title="Assignment rules" description="Which teams and pipelines are paired. Reps see their assigned pipelines by default.">
                        <SPTable
                            columns={[
                                { key:'team',    label:'Team',    w:'2fr' },
                                { key:'members', label:'Members', w:'100px', align:'right' },
                                { key:'default', label:'Default', w:'200px' },
                                { key:'edit',    label:'',        w:'50px', align:'right' },
                            ]}
                            rows={assignmentRules.map(r => ({
                                team:    <span style={{ fontFamily:T.sans, fontWeight:500, color:T.ink }}>{r.team}</span>,
                                members: <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>{r.members}</span>,
                                default: editingTeam === r.team ? (
                                    <select autoFocus value={r.defaultPipeline}
                                        onChange={e => handleAssignmentChange(r.team, e.target.value)}
                                        onBlur={() => setEditingTeam(null)}
                                        style={selStyle}>
                                        {pipelines.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                                    </select>
                                ) : (
                                    <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{r.defaultPipeline}</span>
                                ),
                                edit: <button onClick={e => { e.stopPropagation(); setEditingTeam(r.team); }}
                                    style={{ background:'none', border:'none', color:T.goldInk, fontWeight:600, cursor:'pointer', fontSize:12, fontFamily:T.sans, padding:0 }}>
                                    {editingTeam === r.team ? 'Done' : 'Edit'}
                                </button>,
                            }))}
                        />
                    </CSectionCard>
                </div>
            </div>
        </SPDetailPageChrome>
    );
};

// ── 2. Funnel Stages ──────────────────────────────────────────
const DEFAULT_FUNNEL_STAGES = [
    { name:'Prospecting',  prob:10,  type:'Open', color:'#e07b4a' },
    { name:'Qualification',prob:25,  type:'Open', color:'#d4a847' },
    { name:'Discovery',    prob:40,  type:'Open', color:'#8aab5a' },
    { name:'Proposal',     prob:60,  type:'Open', color:'#4a8abd' },
    { name:'Negotiation',  prob:80,  type:'Open', color:'#7a5abd' },
    { name:'Closing',      prob:90,  type:'Open', color:'#4aad8a' },
    { name:'Closed Won',   prob:100, type:'Won',  color:'#4d6b3d' },
    { name:'Closed Lost',  prob:0,   type:'Lost', color:'#9c3a2e' },
];

const FunnelStagesDetail = ({ settings, setSettings, onBack }) => {
    const saved = settings?.funnelStages?.length ? settings.funnelStages : DEFAULT_FUNNEL_STAGES;
    const [stages, setStages] = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty]   = useState(false);
    const [saving, setSaving] = useState(false);

    const update = (i, field, val) => {
        setStages(prev => prev.map((s, si) => si === i ? { ...s, [field]: val } : s));
        setDirty(true);
    };
    const handleCancel = () => { setStages(JSON.parse(JSON.stringify(saved))); setDirty(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, funnelStages: stages }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body:JSON.stringify({ funnelStages: stages }) }); }
        catch(e) { console.error('save funnel stages', e); }
        setSaving(false); setDirty(false);
    };

    // Open stages only for probability curve
    const openStages = stages.filter(s => s.type === 'Open');

    return (
        <SPDetailPageChrome
            crumb="Funnel stages" title="Funnel stages"
            subtitle="Stage names and default win probability"
            statusDetail={`${stages.length} stages`}
            updatedBy="Admin" updatedAt="3 weeks ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:20 }}>
                {/* Left: stage table */}
                <div>
                    <CSectionCard
                        title="Canonical stages"
                        description="The master list of stages used across all pipelines. Disabling a stage removes it from any pipeline that references it."
                        headAction={<button style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>+ Add stage</button>}
                    >
                        <SPTable
                            columns={[
                                { key:'drag',  label:'',              w:'28px' },
                                { key:'name',  label:'Stage',         w:'1.4fr' },
                                { key:'prob',  label:'Default prob.',  w:'140px', align:'right' },
                                { key:'type',  label:'Type',           w:'90px' },
                                { key:'used',  label:'Used in',        w:'140px' },
                                { key:'state', label:'State',          w:'80px' },
                                { key:'more',  label:'',              w:'28px', align:'right' },
                            ]}
                            rows={stages.map((s,i) => ({
                                drag: <SPDrag muted={s.type !== 'Open'}/>,
                                name: <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                                    <input type="color" value={s.color} onChange={e => update(i,'color',e.target.value)}
                                        style={{ width:14, height:14, border:'none', borderRadius:'50%', padding:0, cursor:'pointer', flexShrink:0 }}/>
                                    <b style={{ fontFamily:T.sans }}>{s.name}</b>
                                </span>,
                                prob: <input type="number" min="0" max="100" value={s.prob}
                                    onChange={e => update(i,'prob',Math.max(0,Math.min(100,parseInt(e.target.value)||0)))}
                                    style={{ width:60, padding:'3px 6px', fontSize:12, border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', textAlign:'right' }}/>,
                                type: <select value={s.type} onChange={e => update(i,'type',e.target.value)}
                                    style={{ fontSize:12, padding:'3px 6px', border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, color:T.ink, fontFamily:T.sans, cursor:'pointer' }}>
                                    <option>Open</option><option>Won</option><option>Lost</option>
                                </select>,
                                used: <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{s.type!=='Open' ? 'All pipelines' : 'New business'}</span>,
                                state: <StatusChip status="ok" detail="Active" small/>,
                                more: <span style={{ color:T.inkMuted, cursor:'pointer' }}>⋯</span>,
                            }))}
                        />
                    </CSectionCard>

                    <CSectionCard title="Probability display" description="How win probability is shown to reps on opportunity cards and in forecasts.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                            {[
                                { k:'Stage default',   sub:'Use the default % for each stage', on:true  },
                                { k:'Rep-adjustable',  sub:'Allow reps to override per-deal',  on:false },
                            ].map((o,i) => (
                                <div key={i} style={{ padding:'12px 14px', border:`1.5px solid ${o.on ? T.goldInk : T.border}`, borderRadius:T.r+2, background: o.on ? 'rgba(200,185,154,0.10)' : T.surface }}>
                                    <div style={{ fontSize:13, fontWeight:700, color:T.ink, fontFamily:T.sans }}>{o.k}</div>
                                    <div style={{ fontSize:11.5, color:T.inkMid, marginTop:3, fontFamily:T.sans }}>{o.sub}</div>
                                    {o.on && <div style={{ marginTop:6, fontSize:10, fontWeight:700, color:T.goldInk, letterSpacing:0.4, fontFamily:T.sans }}>● ACTIVE</div>}
                                </div>
                            ))}
                        </div>
                    </CSectionCard>
                </div>

                {/* Right: live probability curve */}
                <div>
                    <div style={{ position:'sticky', top:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+4, overflow:'hidden' }}>
                        <div style={{ padding:'14px 16px', background:'#2a2622', color:'#fbf8f3' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:T.gold, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5, fontFamily:T.sans }}>Probability curve</div>
                            <div style={{ fontSize:13, color:'#fbf8f3', lineHeight:1.5, fontFamily:T.sans }}>How deals weight into your forecast as they move through stages.</div>
                        </div>
                        <div style={{ padding:'16px 16px 8px' }}>
                            <svg width="100%" height="160" viewBox="0 0 320 160" preserveAspectRatio="none">
                                {[0,25,50,75,100].map((v,i) => (
                                    <line key={i} x1="30" x2="310" y1={136 - i*28} y2={136-i*28} stroke={T.border} strokeWidth="1" strokeDasharray="3 3"/>
                                ))}
                                {openStages.length > 1 && (
                                    <path
                                        d={openStages.map((s,i) => {
                                            const x = 30 + (i/(openStages.length-1))*280;
                                            const y = 132 - (s.prob/100)*112;
                                            return `${i===0?'M':'L'}${x} ${y}`;
                                        }).join(' ')}
                                        stroke={T.goldInk} strokeWidth="2" fill="none"
                                    />
                                )}
                                {openStages.map((s,i) => {
                                    const x = 30 + (i/(Math.max(openStages.length-1,1)))*280;
                                    const y = 132 - (s.prob/100)*112;
                                    return <circle key={i} cx={x} cy={y} r="4" fill={s.color||T.goldInk}/>;
                                })}
                                {[0,25,50,75,100].map((v,i) => (
                                    <text key={i} x="22" y={140-i*28} fontSize="9" fill={T.inkMuted} textAnchor="end">{v}%</text>
                                ))}
                            </svg>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:T.inkMuted, padding:'0 4px 8px', fontFamily:T.sans }}>
                                {openStages.map((s,i) => <span key={i}>{s.name.split(' ')[0]}</span>)}
                            </div>
                        </div>
                        <div style={{ padding:'12px 14px', background:'rgba(77,107,61,0.08)', borderTop:`1px solid ${T.border}` }}>
                            <div style={{ fontSize:11.5, color:T.inkMid, lineHeight:1.55, fontFamily:T.sans }}>
                                <b style={{ color:T.ink }}>Forecast math.</b> A $100k deal at Proposal ({openStages.find(s=>s.name==='Proposal')?.prob||60}%) contributes ${Math.round((openStages.find(s=>s.name==='Proposal')?.prob||60))}k to weighted pipeline.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </SPDetailPageChrome>
    );
};

// ── 3. KPI Thresholds ─────────────────────────────────────────
const DEFAULT_KPI_THRESHOLDS = [
    { k:'Quota attainment',     unit:'%',  good:100, ok:80,  poor:60,  reverse:false, sample:[62,70,68,75,82,88,94,97,103] },
    { k:'Win rate',             unit:'%',  good:30,  ok:22,  poor:15,  reverse:false, sample:[22,24,19,25,26,28,31,30,29] },
    { k:'Avg deal size',        unit:'$k', good:50,  ok:35,  poor:25,  reverse:false, sample:[34,38,42,45,48,46,51,54,52] },
    { k:'Sales cycle length',   unit:'d',  good:35,  ok:50,  poor:70,  reverse:true,  sample:[65,62,58,55,50,48,45,42,40] },
    { k:'Activities per deal',  unit:'',   good:10,  ok:6,   poor:3,   reverse:false, sample:[4,5,6,6,7,8,9,9,10] },
    { k:'Opportunity pipeline', unit:'$M', good:4,   ok:2.5, poor:1.5, reverse:false, sample:[1.8,2.1,2.5,2.8,3.2,3.5,3.8,4.1,4.3] },
];

const CORE_KPI_IDS = new Set(['Quota attainment','Win rate','Avg deal size','Sales cycle length','Activities per deal','Opportunity pipeline']);

const KPIThresholdsDetail = ({ settings, setSettings, onBack }) => {
    const saved = settings?.kpiThresholds?.length ? settings.kpiThresholds : DEFAULT_KPI_THRESHOLDS;
    const [rows, setRows]     = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty]   = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});
    // Kebab menu state
    const [openKPI, setOpenKPI]       = useState(null); // index
    const [editingUnit, setEditingUnit] = useState(null); // index — inline unit editor
    // Add KPI form state
    const [showAdd, setShowAdd]   = useState(false);
    const [newKPI, setNewKPI]     = useState({ k:'', unit:'%', good:80, ok:60, poor:40, reverse:false, sample:[40,45,50,55,60,65,70,75,80], custom:true });
    const [addErr, setAddErr]     = useState('');

    const validate = (row, idx) => {
        if (!row.reverse && !(row.good > row.ok && row.ok > row.poor)) return 'Good > Ok > Poor required';
        if (row.reverse  && !(row.good < row.ok && row.ok < row.poor)) return 'Good < Ok < Poor required (lower is better)';
        return null;
    };

    const update = (i, field, val) => {
        const n = parseFloat(val);
        const updated = rows.map((r,ri) => ri===i ? { ...r, [field]: isNaN(n) ? val : n } : r);
        setRows(updated);
        setDirty(true);
        setErrors(prev => {
            const next = { ...prev };
            const err = validate(updated[i], i);
            if (err) next[i] = err; else delete next[i];
            return next;
        });
    };

    const hasErrors = Object.keys(errors).length > 0;

    const handleCancel = () => { setRows(JSON.parse(JSON.stringify(saved))); setDirty(false); setErrors({}); setShowAdd(false); };
    const handleSave   = async () => {
        if (hasErrors) return;
        setSaving(true);
        setSettings(prev => ({ ...prev, kpiThresholds: rows }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body:JSON.stringify({ kpiThresholds: rows }) }); }
        catch(e) { console.error('save kpi thresholds', e); }
        setSaving(false); setDirty(false);
    };

    // ── Kebab actions ─────────────────────────────────────────
    const handleResetToDefault = (i) => {
        const def = DEFAULT_KPI_THRESHOLDS.find(d => d.k === rows[i].k);
        if (!def) return;
        const updated = rows.map((r,ri) => ri===i ? { ...def } : r);
        setRows(updated); setDirty(true); setOpenKPI(null);
        setErrors(prev => { const next = {...prev}; delete next[i]; return next; });
    };

    const handleToggleHidden = (i) => {
        const updated = rows.map((r,ri) => ri===i ? { ...r, hidden: !r.hidden } : r);
        setRows(updated); setDirty(true); setOpenKPI(null);
    };

    const handleDuplicate = (i) => {
        const clone = { ...rows[i], k: rows[i].k + ' (copy)', custom: true };
        setRows(prev => [...prev, clone]); setDirty(true); setOpenKPI(null);
    };

    const handleRemove = (i) => {
        setRows(prev => prev.filter((_,ri) => ri !== i));
        setErrors(prev => {
            const next = {};
            Object.entries(prev).forEach(([k,v]) => { const ki = parseInt(k); if (ki < i) next[ki] = v; else if (ki > i) next[ki-1] = v; });
            return next;
        });
        setDirty(true); setOpenKPI(null);
    };

    // ── Add KPI ───────────────────────────────────────────────
    const handleAddKPI = () => {
        if (!newKPI.k.trim()) { setAddErr('KPI name is required.'); return; }
        if (rows.some(r => r.k.toLowerCase() === newKPI.k.trim().toLowerCase())) { setAddErr('A KPI with that name already exists.'); return; }
        const err = validate(newKPI, -1);
        if (err) { setAddErr(err); return; }
        setRows(prev => [...prev, { ...newKPI, k: newKPI.k.trim() }]);
        setNewKPI({ k:'', unit:'%', good:80, ok:60, poor:40, reverse:false, sample:[40,45,50,55,60,65,70,75,80], custom:true });
        setAddErr(''); setShowAdd(false); setDirty(true);
    };

    const numInp = (i, field, color) => (
        <input type="number" value={rows[i][field]} onChange={e => update(i, field, e.target.value)}
            style={{ width:64, padding:'4px 6px', fontSize:12, border:`1px solid ${errors[i] ? T.danger : T.border}`, borderRadius:T.r, background:T.surface, color, fontFamily:'ui-monospace,Menlo,monospace', textAlign:'right' }}/>
    );

    const UNITS = ['%', '$k', '$M', 'd', 'h', 'count', '$'];
    const inpSt = { padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' };

    return (
        <SPDetailPageChrome
            crumb="KPI thresholds" title="KPI thresholds"
            subtitle="Thresholds, colors, and sparkline ranges for dashboards"
            statusDetail={`${rows.filter(r=>!r.hidden).length} KPIs configured`}
            updatedBy="Admin" updatedAt="1 month ago"
            onBack={onBack} dirty={dirty && !hasErrors} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            disablePrimary={!dirty || hasErrors || saving}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20 }}>
                <div>
                    <CSectionCard
                        title="Core KPIs"
                        description="Thresholds determine the color (red / yellow / green) shown on Home, Sales Manager dashboards, and report cards."
                        headAction={
                            <button onClick={() => { setShowAdd(v => !v); setAddErr(''); }}
                                style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background: showAdd ? T.surface2 : 'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                + New KPI
                            </button>
                        }
                    >
                        {/* Add KPI inline form */}
                        {showAdd && (
                            <div style={{ padding:'12px 14px', background:T.surface2, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+1, marginBottom:14 }}>
                                <div style={{ fontSize:12.5, fontWeight:700, color:T.ink, marginBottom:10, fontFamily:T.sans }}>New KPI</div>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 80px 90px 90px 90px auto auto', gap:8, alignItems:'flex-end' }}>
                                    <div>
                                        <label style={{ fontSize:10.5, fontWeight:600, color:T.inkMid, display:'block', marginBottom:3, fontFamily:T.sans }}>Name</label>
                                        <input value={newKPI.k} onChange={e => { setNewKPI(p => ({ ...p, k:e.target.value })); setAddErr(''); }}
                                            placeholder="e.g. Emails per deal"
                                            style={{ ...inpSt, width:'100%' }}
                                            onKeyDown={e => { if (e.key==='Enter') handleAddKPI(); if (e.key==='Escape') { setShowAdd(false); setAddErr(''); } }}/>
                                    </div>
                                    <div>
                                        <label style={{ fontSize:10.5, fontWeight:600, color:T.inkMid, display:'block', marginBottom:3, fontFamily:T.sans }}>Unit</label>
                                        <select value={newKPI.unit} onChange={e => setNewKPI(p => ({ ...p, unit:e.target.value }))}
                                            style={{ ...inpSt, width:'100%', appearance:'none', cursor:'pointer' }}>
                                            {UNITS.map(u => <option key={u}>{u}</option>)}
                                        </select>
                                    </div>
                                    {[['Poor', 'poor', T.danger], ['Ok', 'ok', T.warn], ['Good', 'good', T.ok]].map(([lbl, field, color]) => (
                                        <div key={field}>
                                            <label style={{ fontSize:10.5, fontWeight:600, color, display:'block', marginBottom:3, fontFamily:T.sans }}>{lbl}</label>
                                            <input type="number" value={newKPI[field]}
                                                onChange={e => setNewKPI(p => ({ ...p, [field]: parseFloat(e.target.value)||0 }))}
                                                style={{ ...inpSt, width:'100%', fontFamily:'ui-monospace,Menlo,monospace', color, textAlign:'right' }}/>
                                        </div>
                                    ))}
                                    <button onClick={handleAddKPI}
                                        style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                                    <button onClick={() => { setShowAdd(false); setAddErr(''); }}
                                        style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                                </div>
                                <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
                                    <input type="checkbox" id="reverse-chk" checked={newKPI.reverse} onChange={e => setNewKPI(p => ({ ...p, reverse:e.target.checked }))} style={{ cursor:'pointer' }}/>
                                    <label htmlFor="reverse-chk" style={{ fontSize:12, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Lower is better (e.g. cycle length, churn rate)</label>
                                </div>
                                {addErr && <div style={{ fontSize:11.5, color:T.danger, marginTop:6, fontFamily:T.sans }}>{addErr}</div>}
                            </div>
                        )}

                        {/* KPI table — native div so each row can have relative positioning for the popover */}
                        <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, overflow:'hidden' }}>
                            {/* Header */}
                            <div style={{ display:'grid', gridTemplateColumns:'1.6fr 110px 110px 110px 140px 28px', padding:'9px 14px', borderBottom:`1px solid ${T.border}`, background:T.surface2, gap:10 }}>
                                {['KPI','Poor ≤','Ok ≥','Good ≥','Last 9 periods',''].map((h,i) => (
                                    <div key={i} style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign: i>0&&i<4 ? 'right' : 'left', fontFamily:T.sans }}>{h}</div>
                                ))}
                            </div>

                            {rows.map((k,i) => (
                                <div key={i} style={{ display:'grid', gridTemplateColumns:'1.6fr 110px 110px 110px 140px 28px', padding:'12px 14px', gap:10, borderBottom: i<rows.length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', background: k.hidden ? 'rgba(138,131,120,0.06)' : T.surface, position:'relative', opacity: k.hidden ? 0.6 : 1 }}>
                                    {/* Name cell */}
                                    <div>
                                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                            <b style={{ fontFamily:T.sans, color:T.ink }}>{k.k}</b>
                                            {k.custom && <span style={{ fontSize:9, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.25)', padding:'1px 5px', borderRadius:2, letterSpacing:0.4, fontFamily:T.sans }}>CUSTOM</span>}
                                            {k.hidden && <span style={{ fontSize:9, fontWeight:700, color:T.inkMuted, background:T.surface2, padding:'1px 5px', borderRadius:2, letterSpacing:0.4, fontFamily:T.sans }}>HIDDEN</span>}
                                        </div>
                                        {editingUnit === i ? (
                                            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:3 }}>
                                                <span style={{ fontSize:10.5, color:T.inkMuted, fontFamily:T.sans }}>Unit:</span>
                                                <select value={k.unit} onChange={e => { update(i,'unit',e.target.value); }} onBlur={() => setEditingUnit(null)}
                                                    autoFocus style={{ fontSize:11, padding:'2px 6px', border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, color:T.ink, fontFamily:T.sans, cursor:'pointer' }}>
                                                    {UNITS.map(u => <option key={u}>{u}</option>)}
                                                </select>
                                                <input type="checkbox" checked={k.reverse||false} onChange={e => update(i,'reverse',e.target.checked)} style={{ cursor:'pointer' }}/>
                                                <span style={{ fontSize:10.5, color:T.inkMuted, fontFamily:T.sans }}>Lower is better</span>
                                            </div>
                                        ) : (
                                            <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>
                                                Unit: {k.unit||'count'}{k.reverse ? ' · lower is better':''}
                                            </div>
                                        )}
                                        {errors[i] && <div style={{ fontSize:10.5, color:T.danger, marginTop:3, fontFamily:T.sans }}>⚠ {errors[i]}</div>}
                                    </div>
                                    {/* Threshold inputs */}
                                    <div style={{ textAlign:'right' }}>{numInp(i,'poor',T.danger)}</div>
                                    <div style={{ textAlign:'right' }}>{numInp(i,'ok',  T.warn)}</div>
                                    <div style={{ textAlign:'right' }}>{numInp(i,'good',T.ok)}</div>
                                    <div><SPSparkline data={k.sample||[40,50,60,65,70,72,75,78,80]} color={T.ok}/></div>
                                    {/* Kebab */}
                                    <div style={{ position:'relative' }}>
                                        <button onClick={e => { e.stopPropagation(); setOpenKPI(openKPI===i ? null : i); setEditingUnit(null); }}
                                            style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:0, lineHeight:1 }}>⋯</button>
                                        {openKPI === i && (
                                            <div onClick={e => e.stopPropagation()}
                                                style={{ position:'absolute', right:0, top:'100%', zIndex:300, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:200, overflow:'hidden' }}>
                                                {[
                                                    { label:'Edit unit & format', action: () => { setEditingUnit(i); setOpenKPI(null); } },
                                                    { label: k.hidden ? 'Show on dashboards' : 'Hide from dashboards', action: () => handleToggleHidden(i) },
                                                    { label:'Duplicate', action: () => handleDuplicate(i) },
                                                    ...(!k.custom ? [{ label:'Reset to default', action: () => handleResetToDefault(i) }] : []),
                                                    { label:'View usage', action: () => setOpenKPI(null), note:'Quota attainment appears on 3 dashboards' },
                                                    ...(k.custom ? [{ label:'Remove', action: () => handleRemove(i), danger: true }] : []),
                                                ].map((item, mi) => (
                                                    <button key={mi} onClick={item.action}
                                                        style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop: mi>0 ? `1px solid ${T.border}` : 'none', textAlign:'left', fontSize:13, color: item.danger ? T.danger : T.ink, cursor:'pointer', fontFamily:T.sans }}
                                                        onMouseEnter={e => e.currentTarget.style.background = item.danger ? 'rgba(156,58,46,0.06)' : T.surface2}
                                                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                        <div>{item.label}</div>
                                                        {item.note && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.note}</div>}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CSectionCard>

                    <CSectionCard title="Color palette" description="Applies to all KPI cards, sparklines, and bar fills.">
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                            {[{ k:'Good', c:T.ok, hex:'#4d6b3d' },{ k:'Ok', c:T.warn, hex:'#b87333' },{ k:'Poor', c:T.danger, hex:'#9c3a2e' }].map((s,i) => (
                                <div key={i} style={{ padding:'12px 14px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, display:'flex', alignItems:'center', gap:12 }}>
                                    <div style={{ width:28, height:28, background:s.c, borderRadius:T.r, flexShrink:0 }}/>
                                    <div>
                                        <div style={{ fontSize:13, fontWeight:700, color:T.ink, fontFamily:T.sans }}>{s.k}</div>
                                        <div style={{ fontSize:11, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{s.hex}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CSectionCard>
                </div>

                {/* Right: live preview card */}
                <div>
                    <div style={{ position:'sticky', top:20 }}>
                        <CSectionCard title="Preview — Home dashboard card" description="How a KPI card renders with current thresholds.">
                            <div style={{ padding:16, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.r+2 }}>
                                <div style={{ fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.8, textTransform:'uppercase', fontFamily:T.sans }}>QUOTA ATTAINMENT · Q1</div>
                                <div style={{ display:'flex', alignItems:'flex-end', gap:10, marginTop:6 }}>
                                    <div style={{ fontSize:34, fontWeight:700, color:T.ok, fontFamily:T.serif, fontStyle:'italic' }}>103%</div>
                                    <div style={{ fontSize:12, color:T.ok, marginBottom:10, fontWeight:600, fontFamily:T.sans }}>+6 vs LQ</div>
                                </div>
                                <SPSparkline data={rows[0]?.sample||DEFAULT_KPI_THRESHOLDS[0].sample} color={T.ok}/>
                                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:T.inkMuted, marginTop:4, fontFamily:T.sans }}>
                                    <span>Target {rows[0]?.good||100}{rows[0]?.unit||'%'}</span>
                                    <span>Poor &lt; {rows[0]?.poor||60}{rows[0]?.unit||'%'}</span>
                                </div>
                            </div>
                        </CSectionCard>
                        {hasErrors && (
                            <div style={{ padding:'12px 14px', background:'rgba(156,58,46,0.08)', border:`1px solid rgba(156,58,46,0.25)`, borderRadius:T.r+2, marginTop:10, fontSize:12.5, color:T.danger, fontFamily:T.sans, fontWeight:600 }}>
                                ⚠ Fix threshold errors before saving.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </SPDetailPageChrome>
    );
};

// ── 4. Lead Conversion Benchmarks (full-chrome wrapper) ───────
const LeadConversionDetail = ({ settings, setSettings, onBack }) => {
    return (
        <SPDetailPageChrome
            crumb="Lead conversion benchmarks" title="Lead conversion benchmarks"
            subtitle="Good / average / poor conversion rate targets by lead source"
            statusDetail="8 sources configured"
            updatedBy="Admin" updatedAt="today"
            onBack={onBack} dirty={false}
            rightActions={
                <div style={{ display:'flex', gap:8 }}>
                    <button style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                        <LIcon name="refresh" size={13}/> Recompute from history
                    </button>
                    <button style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                        Save changes
                    </button>
                </div>
            }
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:20 }}>
                <div>
                    <CSectionCard title="Conversion targets" description="Set lead→opportunity conversion thresholds per source. Reps see colored badges on lead queues; managers see variance in Sales Manager dashboards.">
                        <LeadConvBenchmarks settings={settings} setSettings={setSettings}/>
                    </CSectionCard>
                </div>
                <div>
                    <div style={{ position:'sticky', top:20, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+4, overflow:'hidden' }}>
                        <div style={{ padding:'14px 16px', background:'#2a2622', color:'#fbf8f3' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:T.gold, letterSpacing:0.8, textTransform:'uppercase', marginBottom:5, fontFamily:T.sans }}>Where these show up</div>
                            <div style={{ fontSize:13, color:'#fbf8f3', lineHeight:1.5, fontFamily:T.sans }}>Benchmarks drive the colored state on 3 surfaces.</div>
                        </div>
                        {[
                            { n:'Leads queue',               d:'Source column colors by target' },
                            { n:'Sales Manager · Sources',   d:'Variance vs good target' },
                            { n:'Lead scoring rules',        d:'Auto-route off-target sources' },
                        ].map((item,idx) => (
                            <div key={idx} style={{ padding:'11px 12px', borderBottom: idx<2 ? `1px solid ${T.border}` : 'none', display:'flex', gap:10, alignItems:'flex-start' }}>
                                <LIcon name="link" size={13} color={T.goldInk} style={{ marginTop:2, flexShrink:0 }}/>
                                <div>
                                    <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{item.n}</div>
                                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>{item.d}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </SPDetailPageChrome>
    );
};

// ─────────────────────────────────────────────────────────────
// SALES PROCESS DETAIL PAGES — Group 2 of 2
// Custom fields · Pain points · Customer types · Industries
// ─────────────────────────────────────────────────────────────

// ── 5. Custom Fields ─────────────────────────────────────────
const FIELD_OBJECTS = ['Accounts', 'Contacts', 'Leads', 'Opportunities'];
const DEFAULT_CUSTOM_FIELDS = {
    Accounts: [
        { label:'Primary industry',       api:'account.primary_industry',  type:'Picklist', required:true,  visibility:'Detail, Create' },
        { label:'Renewal month',          api:'account.renewal_month',     type:'Month',    required:false, visibility:'Detail' },
        { label:'ARR tier',               api:'account.arr_tier',          type:'Picklist', required:false, visibility:'Detail, List' },
        { label:'Regional preference',    api:'account.region_pref',       type:'Picklist', required:false, visibility:'Detail' },
        { label:'Decision-maker title',   api:'account.dm_title',          type:'Text',     required:false, visibility:'Detail' },
        { label:'Procurement portal URL', api:'account.procurement_url',   type:'URL',      required:false, visibility:'Detail', isNew:true },
    ],
    Contacts: [
        { label:'LinkedIn URL',           api:'contact.linkedin_url',      type:'URL',      required:false, visibility:'Detail' },
        { label:'Persona tag',            api:'contact.persona_tag',       type:'Picklist', required:false, visibility:'Detail' },
        { label:'Executive sponsor',      api:'contact.exec_sponsor',      type:'Toggle',   required:false, visibility:'Detail, List' },
    ],
    Leads: [
        { label:'Lead score override',    api:'lead.score_override',       type:'Number',   required:false, visibility:'Detail' },
        { label:'Referral source detail', api:'lead.referral_detail',      type:'Text',     required:false, visibility:'Detail' },
        { label:'Budget confirmed',       api:'lead.budget_confirmed',     type:'Toggle',   required:false, visibility:'Detail' },
        { label:'BANT notes',             api:'lead.bant_notes',           type:'Text',     required:false, visibility:'Detail' },
    ],
    Opportunities: [
        { label:'Decision date',          api:'opp.decision_date',         type:'Date',     required:false, visibility:'Detail' },
        { label:'Champion name',          api:'opp.champion_name',         type:'Text',     required:false, visibility:'Detail' },
        { label:'Competitors',            api:'opp.competitors',           type:'Picklist', required:false, visibility:'Detail' },
        { label:'Why we lose',            api:'opp.why_lose',              type:'Text',     required:false, visibility:'Detail' },
        { label:'Paper process',          api:'opp.paper_process',         type:'Text',     required:false, visibility:'Detail', isNew:true },
    ],
};

const CustomFieldsDetail = ({ settings, setSettings, onBack }) => {
    const saved     = settings?.customFieldsByObject || DEFAULT_CUSTOM_FIELDS;
    const [activeObj, setActiveObj] = useState('Accounts');
    const [fields, setFields]       = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty]         = useState(false);
    const [saving, setSaving]       = useState(false);
    const [search, setSearch]       = useState('');
    const [showAdd, setShowAdd]     = useState(false);
    const [newLabel, setNewLabel]   = useState('');
    const [newType, setNewType]     = useState('Text');
    const [newReq, setNewReq]       = useState(false);
    const [addErr, setAddErr]       = useState('');

    const handleCancel = () => { setFields(JSON.parse(JSON.stringify(saved))); setDirty(false); setShowAdd(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, customFieldsByObject: fields }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body:JSON.stringify({ customFieldsByObject: fields }) }); }
        catch(e) { console.error('save custom fields', e); }
        setSaving(false); setDirty(false);
    };

    const handleAddField = () => {
        if (!newLabel.trim()) { setAddErr('Label is required.'); return; }
        const apiKey = `${activeObj.toLowerCase().slice(0,3)}.${newLabel.trim().toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'')}`;
        const newField = { label: newLabel.trim(), api: apiKey, type: newType, required: newReq, visibility: 'Detail' };
        setFields(prev => ({ ...prev, [activeObj]: [...(prev[activeObj]||[]), newField] }));
        setNewLabel(''); setNewType('Text'); setNewReq(false); setAddErr(''); setShowAdd(false); setDirty(true);
    };

    const removeField = (idx) => {
        setFields(prev => ({ ...prev, [activeObj]: prev[activeObj].filter((_,i) => i !== idx) }));
        setDirty(true);
    };

    const allFields   = Object.values(fields).flat();
    const activeFields = (fields[activeObj]||[]).filter(f => !search || f.label.toLowerCase().includes(search.toLowerCase()));
    const totalFields  = allFields.length;
    const reqFields    = allFields.filter(f => f.required).length;

    const FIELD_TYPES = ['Text','Number','Date','Picklist','Toggle','URL','Month','Email','Phone'];

    return (
        <SPDetailPageChrome
            crumb="Custom fields" title="Custom fields"
            subtitle="Extend Accounts, Contacts, Leads, and Opportunities"
            statusDetail={`${totalFields} custom fields`}
            updatedBy="Admin" updatedAt="5 days ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            {/* Object tabs + search */}
            <div style={{ display:'flex', alignItems:'center', gap:4, borderBottom:`1px solid ${T.border}`, marginBottom:18 }}>
                {FIELD_OBJECTS.map((obj,i) => {
                    const cnt = (fields[obj]||[]).length;
                    const isNew = obj === 'Accounts' || obj === 'Opportunities';
                    return (
                        <div key={obj} onClick={() => { setActiveObj(obj); setShowAdd(false); setSearch(''); }}
                            style={{ padding:'10px 18px', fontSize:13, fontWeight:600, cursor:'pointer', color: obj===activeObj ? T.ink : T.inkMuted, borderBottom: obj===activeObj ? `2px solid ${T.goldInk}` : '2px solid transparent', marginBottom:-1, display:'flex', alignItems:'center', gap:8, fontFamily:T.sans }}>
                            {obj}
                            <span style={{ fontSize:11, fontWeight:600, color:T.inkMuted, background:T.surface2, padding:'1px 7px', borderRadius:8, fontFamily:T.sans }}>{cnt}</span>
                            {isNew && <span style={{ fontSize:9, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.25)', padding:'1px 5px', borderRadius:2, letterSpacing:0.4, fontFamily:T.sans }}>NEW</span>}
                        </div>
                    );
                })}
                <div style={{ flex:1 }}/>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, width:220, marginBottom:4 }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search fields…" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:12, color:T.ink, fontFamily:T.sans }}/>
                    {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:13, padding:0 }}>×</button>}
                </div>
            </div>

            {/* Inline add field form */}
            {showAdd && (
                <div style={{ background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+2, padding:16, marginBottom:14, boxShadow:'0 2px 12px rgba(42,38,34,0.08)' }}>
                    <div style={{ fontSize:13, fontWeight:700, color:T.ink, marginBottom:12, fontFamily:T.sans }}>New field — {activeObj}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 140px 120px auto auto', gap:10, alignItems:'flex-end' }}>
                        <div>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Label</label>
                            <input value={newLabel} onChange={e => { setNewLabel(e.target.value); setAddErr(''); }} placeholder="e.g. Partner tier" onKeyDown={e => { if (e.key==='Enter') handleAddField(); if (e.key==='Escape') { setShowAdd(false); setAddErr(''); } }}
                                style={{ padding:'7px 10px', background:T.surface, border:`1px solid ${addErr ? T.danger : T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' }}/>
                        </div>
                        <div>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Type</label>
                            <select value={newType} onChange={e => setNewType(e.target.value)}
                                style={{ padding:'7px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', cursor:'pointer' }}>
                                {FIELD_TYPES.map(t => <option key={t}>{t}</option>)}
                            </select>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:2 }}>
                            <input type="checkbox" id="req-chk" checked={newReq} onChange={e => setNewReq(e.target.checked)} style={{ cursor:'pointer' }}/>
                            <label htmlFor="req-chk" style={{ fontSize:12.5, color:T.ink, cursor:'pointer', fontFamily:T.sans }}>Required</label>
                        </div>
                        <button onClick={handleAddField} style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                        <button onClick={() => { setShowAdd(false); setAddErr(''); }} style={{ padding:'7px 12px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    </div>
                    {addErr && <div style={{ fontSize:11.5, color:T.danger, marginTop:8, fontFamily:T.sans }}>{addErr}</div>}
                </div>
            )}

            <CSectionCard
                title={`${activeObj} — custom fields`}
                description={`Fields show up on the ${activeObj} detail pane, are filterable in views, and appear as report columns.`}
                headAction={
                    <button onClick={() => setShowAdd(v => !v)} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background: showAdd ? T.surface2 : 'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                        + New field
                    </button>
                }
            >
                {activeFields.length === 0 ? (
                    <div style={{ padding:'2rem', textAlign:'center', color:T.inkMuted, fontSize:13, fontStyle:'italic', fontFamily:T.sans }}>
                        {search ? `No fields match "${search}".` : 'No custom fields yet.'}
                    </div>
                ) : (
                    <SPTable
                        columns={[
                            { key:'drag',  label:'',           w:'28px' },
                            { key:'label', label:'Label',      w:'1.6fr' },
                            { key:'api',   label:'API name',   w:'1.2fr', mono:true },
                            { key:'type',  label:'Type',       w:'110px' },
                            { key:'req',   label:'Required',   w:'90px' },
                            { key:'where', label:'Visible on', w:'150px' },
                            { key:'del',   label:'',           w:'28px' },
                        ]}
                        rows={activeFields.map((f,i) => ({
                            drag:  <SPDrag/>,
                            label: <span style={{ display:'inline-flex', alignItems:'center', gap:6, fontFamily:T.sans }}>
                                       <b>{f.label}</b>
                                       {f.isNew && <span style={{ fontSize:9, fontWeight:700, color:T.goldInk, background:'rgba(200,185,154,0.25)', padding:'1px 5px', borderRadius:2, letterSpacing:0.4, fontFamily:T.sans }}>NEW</span>}
                                   </span>,
                            api:   <span style={{ fontSize:12, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{f.api}</span>,
                            type:  <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{f.type}</span>,
                            req:   <span style={{ fontSize:12, color: f.required ? T.warn : T.inkMuted, fontWeight: f.required ? 600 : 400, fontFamily:T.sans }}>{f.required ? 'Yes' : 'No'}</span>,
                            where: <span style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>{f.visibility}</span>,
                            del:   <button onClick={() => removeField((fields[activeObj]||[]).findIndex(ff => ff.api === f.api))}
                                       style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:15, padding:0, lineHeight:1 }}
                                       onMouseEnter={e => e.currentTarget.style.color = T.danger}
                                       onMouseLeave={e => e.currentTarget.style.color = T.inkMuted}>×</button>,
                        }))}
                    />
                )}
            </CSectionCard>

            {/* Stats strip */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginTop:4 }}>
                {[
                    { k:'Total custom fields', v:String(totalFields),  sub:'across 4 objects',  acc:T.ink },
                    { k:'Required fields',      v:String(reqFields),    sub:'gate on save',       acc:T.warn },
                    { k:'Fields in reports',    v:String(Math.floor(totalFields * 0.6)), sub:'used as columns', acc:T.ok },
                    { k:'Orphaned fields',       v:'0',                 sub:'never referenced',  acc:T.ok },
                ].map((s,i) => (
                    <div key={i} style={{ padding:'14px 16px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2 }}>
                        <div style={{ fontSize:10.5, fontWeight:600, color:T.inkMuted, letterSpacing:0.5, textTransform:'uppercase', marginBottom:4, fontFamily:T.sans }}>{s.k}</div>
                        <div style={{ fontSize:22, fontWeight:700, color:s.acc, fontFamily:T.serif, fontStyle:'italic' }}>{s.v}</div>
                        <div style={{ fontSize:11, color:T.inkMid, marginTop:2, fontFamily:T.sans }}>{s.sub}</div>
                    </div>
                ))}
            </div>
        </SPDetailPageChrome>
    );
};

// ── 6. Pain Points Library ────────────────────────────────────
const DEFAULT_PAIN_POINTS = [
    { cat:'Cost & ROI',       items:['High TCO vs incumbent','Unpredictable renewal costs','Low ROI on current stack','Hidden implementation fees'] },
    { cat:'Efficiency',       items:['Manual data entry across tools','Reps hopping between 5+ apps','Reports take > 2 days to compile','Forecasting is a spreadsheet game'] },
    { cat:'Data & reporting', items:['Pipeline hygiene is poor','Leadership distrusts forecast','No single source of truth'] },
    { cat:'Team & adoption',  items:['Low CRM adoption','High rep turnover','Training onboarding > 30 days','Managers coach blind'] },
    { cat:'Integrations',     items:['Quote-to-cash is disjointed','Email sync is unreliable','Slack alerts are noisy'] },
    { cat:'Compliance',       items:['No audit trail','GDPR requests are manual','Field-level permissions are coarse'] },
];

const MOST_USED_PAIN_POINTS = [
    { k:'Manual data entry across tools',   n:38 },
    { k:'Forecasting is a spreadsheet game',n:31 },
    { k:'Low CRM adoption',                 n:27 },
    { k:'Reps hopping between 5+ apps',     n:24 },
    { k:'Pipeline hygiene is poor',         n:19 },
];

const PainPointsDetail = ({ settings, setSettings, onBack }) => {
    const saved    = settings?.painPoints?.length ? settings.painPoints : DEFAULT_PAIN_POINTS;
    const [groups, setGroups]   = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty]     = useState(false);
    const [saving, setSaving]   = useState(false);
    const [search, setSearch]   = useState('');
    const [addingCat, setAddingCat] = useState(false);
    const [newCat, setNewCat]   = useState('');
    const [addingItem, setAddingItem] = useState(null); // category name
    const [newItem, setNewItem] = useState('');

    const handleCancel = () => { setGroups(JSON.parse(JSON.stringify(saved))); setDirty(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, painPoints: groups }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body:JSON.stringify({ painPoints: groups }) }); }
        catch(e) { console.error('save pain points', e); }
        setSaving(false); setDirty(false);
    };

    const addCategory = () => {
        if (!newCat.trim()) return;
        if (groups.some(g => g.cat === newCat.trim())) return;
        setGroups(prev => [...prev, { cat: newCat.trim(), items: [] }]);
        setNewCat(''); setAddingCat(false); setDirty(true);
    };
    const addItem = (cat) => {
        if (!newItem.trim()) return;
        setGroups(prev => prev.map(g => g.cat === cat ? { ...g, items: [...g.items, newItem.trim()] } : g));
        setNewItem(''); setAddingItem(null); setDirty(true);
    };
    const removeItem = (cat, item) => {
        setGroups(prev => prev.map(g => g.cat === cat ? { ...g, items: g.items.filter(i => i !== item) } : g));
        setDirty(true);
    };

    const totalItems = groups.reduce((a,g) => a + g.items.length, 0);
    const filtered   = groups.map(g => ({
        ...g,
        items: search ? g.items.filter(item => item.toLowerCase().includes(search.toLowerCase())) : g.items,
    })).filter(g => !search || g.items.length > 0);

    return (
        <SPDetailPageChrome
            crumb="Pain points library" title="Pain points library"
            subtitle="Reusable customer pain point templates"
            statusDetail={`${totalItems} pain points`}
            updatedBy="Admin" updatedAt="2 weeks ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            rightActions={
                <div style={{ display:'flex', gap:8 }}>
                    <button style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                        <LIcon name="upload" size={13}/> Import CSV
                    </button>
                    <button onClick={() => setAddingCat(true)} style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                        + New pain point
                    </button>
                    <button onClick={handleCancel} disabled={!dirty} style={{ padding:'7px 14px', background:T.surface, color: dirty ? T.ink : T.inkMuted, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty ? 'pointer' : 'default', fontFamily:T.sans }}>Cancel</button>
                    <button onClick={handleSave} disabled={!dirty || saving} style={{ padding:'7px 14px', background: dirty ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty && !saving ? 'pointer' : 'default', fontFamily:T.sans }}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
            }
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:20 }}>
                {/* Left */}
                <div>
                    {/* Search + count */}
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r, width:260 }}>
                            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={T.inkMuted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search pain points…" style={{ flex:1, border:'none', outline:'none', background:'transparent', fontSize:12, color:T.ink, fontFamily:T.sans }}/>
                            {search && <button onClick={() => setSearch('')} style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:13, padding:0 }}>×</button>}
                        </div>
                        <div style={{ flex:1 }}/>
                        <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>Showing {totalItems} of {totalItems} · grouped by category</span>
                    </div>

                    {/* New category form */}
                    {addingCat && (
                        <div style={{ display:'flex', gap:8, marginBottom:14, padding:12, background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+2 }}>
                            <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Category name…" onKeyDown={e => { if (e.key==='Enter') addCategory(); if (e.key==='Escape') { setAddingCat(false); setNewCat(''); } }}
                                autoFocus style={{ flex:1, padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none' }}/>
                            <button onClick={addCategory} style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                            <button onClick={() => { setAddingCat(false); setNewCat(''); }} style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                        </div>
                    )}

                    {filtered.map((g,gi) => (
                        <CSectionCard
                            key={g.cat}
                            title={`${g.cat} · ${g.items.length}`}
                            description="Drag any pain point onto an opportunity to associate it."
                            headAction={
                                <button onClick={() => { setAddingItem(g.cat); setNewItem(''); }}
                                    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                    + Add
                                </button>
                            }
                        >
                            {addingItem === g.cat && (
                                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                                    <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Pain point description…" onKeyDown={e => { if (e.key==='Enter') addItem(g.cat); if (e.key==='Escape') { setAddingItem(null); setNewItem(''); } }}
                                        autoFocus style={{ flex:1, padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none' }}/>
                                    <button onClick={() => addItem(g.cat)} style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                                    <button onClick={() => { setAddingItem(null); setNewItem(''); }} style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                                </div>
                            )}
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                                {g.items.map((item, ii) => (
                                    <div key={ii} style={{ padding:'10px 12px', display:'flex', alignItems:'center', gap:10, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:T.r+2 }}>
                                        <SPDrag/>
                                        <div style={{ flex:1, fontSize:12.5, color:T.ink, fontWeight:500, fontFamily:T.sans }}>{item}</div>
                                        <button onClick={() => removeItem(g.cat, item)}
                                            style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:14, padding:0, lineHeight:1, flexShrink:0 }}
                                            onMouseEnter={e => e.currentTarget.style.color = T.danger}
                                            onMouseLeave={e => e.currentTarget.style.color = T.inkMuted}>×</button>
                                    </div>
                                ))}
                            </div>
                        </CSectionCard>
                    ))}
                </div>

                {/* Right */}
                <div>
                    <div style={{ position:'sticky', top:20 }}>
                        <CSectionCard title="Most-used pain points" description="Across all open opportunities this quarter.">
                            {MOST_USED_PAIN_POINTS.map((p,i) => (
                                <div key={i} style={{ padding:'9px 0', borderBottom: i<4 ? `1px solid ${T.border}` : 'none', display:'flex', gap:10, alignItems:'center' }}>
                                    <div style={{ fontSize:12.5, color:T.ink, flex:1, fontFamily:T.sans }}>{p.k}</div>
                                    <div style={{ fontFamily:T.serif, fontStyle:'italic', fontSize:15, fontWeight:700, color:T.goldInk }}>{p.n}</div>
                                </div>
                            ))}
                        </CSectionCard>
                        <CSectionCard title="Categories" description="Reorder or hide whole categories.">
                            {groups.map((g,i) => (
                                <div key={i} style={{ padding:'8px 0', borderBottom: i<groups.length-1 ? `1px solid ${T.border}` : 'none', display:'flex', alignItems:'center', gap:10 }}>
                                    <SPDrag/>
                                    <div style={{ flex:1, fontSize:12.5, color:T.ink, fontWeight:500, fontFamily:T.sans }}>{g.cat}</div>
                                    <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{g.items.length}</span>
                                </div>
                            ))}
                        </CSectionCard>
                    </div>
                </div>
            </div>
        </SPDetailPageChrome>
    );
};

// ── 7. Customer Types ─────────────────────────────────────────
const DEFAULT_CUST_TYPES = [
    { tier:'SMB',        hex:'#8a9a7a', range:'< $10M',       sla:'24h', owner:'SMB teams',   count:312 },
    { tier:'Mid-Market', hex:'#b87333', range:'$10M–$250M',   sla:'8h',  owner:'Mid-Market',  count:148 },
    { tier:'Enterprise', hex:'#7a5a3c', range:'$250M–$1B',    sla:'2h',  owner:'Enterprise',  count:42  },
    { tier:'Strategic',  hex:'#4d6b3d', range:'$1B+',         sla:'30m', owner:'Strategic',   count:11  },
    { tier:'Partner',    hex:'#3a5a7a', range:'n/a',          sla:'4h',  owner:'Channel',     count:18  },
];

const AUTO_CLASS_RULES = [
    { when:'Annual revenue < $10M',      then:'SMB' },
    { when:'Annual revenue $10M–$250M',  then:'Mid-Market' },
    { when:'Annual revenue $250M–$1B',   then:'Enterprise' },
    { when:'Annual revenue ≥ $1B',       then:'Strategic' },
    { when:'Account type = Partner',     then:'Partner' },
];

const CustomerTypesDetail = ({ settings, setSettings, onBack, setActiveTab, setAccountsDeepFilter }) => {
    const saved    = settings?.customerTypeTiers?.length ? settings.customerTypeTiers : DEFAULT_CUST_TYPES;
    const [tiers, setTiers]     = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty]     = useState(false);
    const [saving, setSaving]   = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [newTier, setNewTier] = useState({ tier:'', hex:'#7a6a48', range:'', sla:'', owner:'', count:0 });
    const [addErr, setAddErr]   = useState('');

    const handleCancel = () => { setTiers(JSON.parse(JSON.stringify(saved))); setDirty(false); setShowAdd(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, customerTypeTiers: tiers }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body:JSON.stringify({ customerTypeTiers: tiers }) }); }
        catch(e) { console.error('save customer types', e); }
        setSaving(false); setDirty(false);
    };

    const handleAddTier = () => {
        if (!newTier.tier.trim()) { setAddErr('Tier name is required.'); return; }
        setTiers(prev => [...prev, { ...newTier, count:0 }]);
        setNewTier({ tier:'', hex:'#7a6a48', range:'', sla:'', owner:'', count:0 });
        setAddErr(''); setShowAdd(false); setDirty(true);
    };

    // Kebab state
    const SYSTEM_TIERS = new Set(['SMB','Mid-Market','Enterprise','Strategic','Partner']);
    const [openTierKebab, setOpenTierKebab]   = useState(null); // tier index

    // Close kebab on click-outside
    React.useEffect(() => {
        if (openTierKebab === null) return;
        const handler = () => setOpenTierKebab(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [openTierKebab]);
    const [editingTierIdx, setEditingTierIdx] = useState(null); // inline edit
    const [editingTierVal, setEditingTierVal] = useState({}); // { tier, range, sla, owner, hex }

    const handleDuplicateTier = (i) => {
        const clone = { ...tiers[i], tier: tiers[i].tier + ' (copy)', count: 0 };
        setTiers(prev => [...prev, clone]); setDirty(true); setOpenTierKebab(null);
    };
    const handleDeleteTier = (i) => {
        setTiers(prev => prev.filter((_,ri) => ri !== i)); setDirty(true); setOpenTierKebab(null);
    };
    const handleEditTierSave = (i) => {
        setTiers(prev => prev.map((t,ri) => ri===i ? { ...t, ...editingTierVal } : t));
        setEditingTierIdx(null); setEditingTierVal({}); setDirty(true);
    };

    const inpSm = { padding:'4px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' };

    const total = tiers.reduce((a,t) => a+t.count, 0)||1;

    return (
        <SPDetailPageChrome
            crumb="Customer types" title="Customer types"
            subtitle="Account classification tags (SMB, Mid-market, Enterprise…)"
            statusDetail={`${tiers.length} tiers`}
            updatedBy="Admin" updatedAt="6 months ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            rightActions={
                <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setShowAdd(true)} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ New tier</button>
                    <button onClick={handleCancel} disabled={!dirty} style={{ padding:'7px 14px', background:T.surface, color: dirty ? T.ink : T.inkMuted, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty ? 'pointer' : 'default', fontFamily:T.sans }}>Cancel</button>
                    <button onClick={handleSave} disabled={!dirty || saving} style={{ padding:'7px 14px', background: dirty ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty && !saving ? 'pointer' : 'default', fontFamily:T.sans }}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
            }
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:20 }}>
                {/* Left */}
                <div>
                    {/* Add tier form */}
                    {showAdd && (
                        <div style={{ background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r+2, padding:16, marginBottom:14, boxShadow:'0 2px 12px rgba(42,38,34,0.08)' }}>
                            <div style={{ fontSize:13, fontWeight:700, color:T.ink, marginBottom:12, fontFamily:T.sans }}>New tier</div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 120px 80px 1fr auto auto', gap:10, alignItems:'flex-end' }}>
                                {[
                                    { label:'Tier name', key:'tier', placeholder:'e.g. Enterprise' },
                                    { label:'Revenue', key:'range', placeholder:'$250M+' },
                                    { label:'Owning team', key:'owner', placeholder:'e.g. Enterprise' },
                                    { label:'SLA', key:'sla', placeholder:'2h' },
                                ].map(f => (
                                    <div key={f.key}>
                                        <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>{f.label}</label>
                                        <input value={newTier[f.key]} onChange={e => setNewTier(p => ({ ...p, [f.key]:e.target.value }))} placeholder={f.placeholder}
                                            style={{ padding:'6px 10px', border:`1px solid ${f.key==='tier'&&addErr ? T.danger : T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', boxSizing:'border-box' }}/>
                                    </div>
                                ))}
                                <div>
                                    <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Color</label>
                                    <input type="color" value={newTier.hex} onChange={e => setNewTier(p => ({ ...p, hex:e.target.value }))}
                                        style={{ width:38, height:34, border:`1px solid ${T.border}`, borderRadius:T.r, padding:2, cursor:'pointer' }}/>
                                </div>
                                <button onClick={handleAddTier} style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans, alignSelf:'flex-end' }}>Add</button>
                                <button onClick={() => { setShowAdd(false); setAddErr(''); }} style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, cursor:'pointer', fontFamily:T.sans, alignSelf:'flex-end' }}>Cancel</button>
                            </div>
                            {addErr && <div style={{ fontSize:11.5, color:T.danger, marginTop:8, fontFamily:T.sans }}>{addErr}</div>}
                        </div>
                    )}

                    <CSectionCard title="Tiers" description="Drag to reorder. Classification drives auto-assignment rules, SLA, and dashboard grouping.">
                        <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, overflow:'visible' }}>
                            {/* Header */}
                            <div style={{ display:'grid', gridTemplateColumns:'28px 1.3fr 140px 90px 70px 130px 28px', padding:'9px 14px', borderBottom:`1px solid ${T.border}`, background:T.surface2, gap:10, borderRadius:`${T.r+2}px ${T.r+2}px 0 0` }}>
                                {['','Tier','Revenue','Accounts','SLA','Owning team',''].map((h,i) => (
                                    <div key={i} style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign: i===3||i===4 ? 'right' : 'left', fontFamily:T.sans }}>{h}</div>
                                ))}
                            </div>
                            {tiers.map((t,i) => (
                                <div key={i} style={{ display:'grid', gridTemplateColumns:'28px 1.3fr 140px 90px 70px 130px 28px', padding:'12px 14px', gap:10, borderBottom: i<tiers.length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', background:T.surface, fontSize:13, fontFamily:T.sans, position:'relative' }}>
                                    <div><SPDrag/></div>

                                    {/* Tier name — inline edit or display */}
                                    <div>
                                        {editingTierIdx === i ? (
                                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                                <input type="color" value={editingTierVal.hex||t.hex} onChange={e => setEditingTierVal(p => ({ ...p, hex:e.target.value }))}
                                                    style={{ width:24, height:24, border:`1px solid ${T.border}`, borderRadius:T.r, padding:1, cursor:'pointer', flexShrink:0 }}/>
                                                <input value={editingTierVal.tier??t.tier} onChange={e => setEditingTierVal(p => ({ ...p, tier:e.target.value }))}
                                                    autoFocus style={{ ...inpSm }} onKeyDown={e => { if (e.key==='Enter') handleEditTierSave(i); if (e.key==='Escape') { setEditingTierIdx(null); setEditingTierVal({}); } }}/>
                                            </div>
                                        ) : (
                                            <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                                                <span style={{ width:10, height:10, background:t.hex, borderRadius:2, flexShrink:0 }}/>
                                                <b>{t.tier}</b>
                                            </span>
                                        )}
                                    </div>

                                    {/* Revenue */}
                                    <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.inkMid }}>
                                        {editingTierIdx === i
                                            ? <input value={editingTierVal.range??t.range} onChange={e => setEditingTierVal(p => ({ ...p, range:e.target.value }))} style={{ ...inpSm, fontFamily:'ui-monospace,Menlo,monospace' }}/>
                                            : t.range}
                                    </div>

                                    {/* Accounts */}
                                    <div style={{ textAlign:'right', fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:14, color:T.ink }}>{t.count}</div>

                                    {/* SLA */}
                                    <div style={{ textAlign:'right', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>
                                        {editingTierIdx === i
                                            ? <input value={editingTierVal.sla??t.sla} onChange={e => setEditingTierVal(p => ({ ...p, sla:e.target.value }))} style={{ ...inpSm, textAlign:'right', fontFamily:'ui-monospace,Menlo,monospace', width:56 }}/>
                                            : t.sla}
                                    </div>

                                    {/* Owning team */}
                                    <div style={{ color:T.inkMid, fontSize:12 }}>
                                        {editingTierIdx === i
                                            ? <input value={editingTierVal.owner??t.owner} onChange={e => setEditingTierVal(p => ({ ...p, owner:e.target.value }))} style={{ ...inpSm }}/>
                                            : t.owner}
                                    </div>

                                    {/* Kebab */}
                                    <div style={{ position:'relative' }}>
                                        {editingTierIdx === i ? (
                                            <button onClick={() => handleEditTierSave(i)}
                                                style={{ background:T.ok, border:'none', color:'#fff', borderRadius:T.r, padding:'3px 8px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>✓</button>
                                        ) : (
                                            <>
                                                <button onClick={e => { e.stopPropagation(); setOpenTierKebab(openTierKebab===i ? null : i); }}
                                                    style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:0, lineHeight:1 }}>⋯</button>
                                                {openTierKebab === i && (
                                                    <div onClick={e => e.stopPropagation()}
                                                        style={{ position:'absolute', right:0, top:'100%', zIndex:400, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:200, overflow:'hidden' }}>
                                                        {[
                                                            { label:'Edit tier', action: () => { setEditingTierIdx(i); setEditingTierVal({}); setOpenTierKebab(null); } },
                                                            { label:'Duplicate',  action: () => handleDuplicateTier(i) },
                                                            { label:'View accounts', note:'Filter Accounts tab by this tier', action: () => {
                                                                setOpenTierKebab(null);
                                                                if (setAccountsDeepFilter && setActiveTab) {
                                                                    setAccountsDeepFilter({ accountSegment: t.tier });
                                                                    setActiveTab('accounts');
                                                                }
                                                            }},
                                                            { label:'Where this is used', note: AUTO_CLASS_RULES.filter(r => r.then === t.tier).length > 0 ? `${AUTO_CLASS_RULES.filter(r => r.then === t.tier).length} auto-classification rule${AUTO_CLASS_RULES.filter(r => r.then === t.tier).length!==1?'s':''}` : 'No rules reference this tier', action: () => setOpenTierKebab(null) },
                                                            { label:'Delete', danger:true, disabled: SYSTEM_TIERS.has(t.tier), note: SYSTEM_TIERS.has(t.tier) ? 'System tier' : null, action: () => { if (!SYSTEM_TIERS.has(t.tier)) handleDeleteTier(i); } },
                                                        ].map((item, mi) => (
                                                            <button key={mi} onClick={item.action} disabled={item.disabled}
                                                                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop: mi>0 ? `1px solid ${T.border}` : 'none', textAlign:'left', fontSize:13, color: item.disabled ? T.inkMuted : item.danger ? T.danger : T.ink, cursor: item.disabled ? 'default' : 'pointer', fontFamily:T.sans, opacity: item.disabled ? 0.5 : 1 }}
                                                                onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = item.danger ? 'rgba(156,58,46,0.06)' : T.surface2; }}
                                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                                <div>{item.label}</div>
                                                                {item.note && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.note}</div>}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CSectionCard>

                    <CSectionCard title="Auto-classification" description="Rules that assign a tier when an account is created or revenue changes.">
                        {AUTO_CLASS_RULES.map((r,i) => (
                            <div key={i} style={{ padding:'10px 0', borderBottom: i<AUTO_CLASS_RULES.length-1 ? `1px solid ${T.border}` : 'none', display:'flex', gap:14, alignItems:'center' }}>
                                <div style={{ flex:1, fontSize:12.5, color:T.ink, fontFamily:T.sans }}>
                                    <span style={{ color:T.inkMuted }}>When</span> <b>{r.when}</b>
                                    <span style={{ color:T.inkMuted }}> → tag as </span>
                                    <b style={{ color:T.goldInk }}>{r.then}</b>
                                </div>
                                <StatusChip status="ok" detail="Active" small/>
                                <span style={{ fontSize:11, color:T.goldInk, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Edit</span>
                            </div>
                        ))}
                    </CSectionCard>
                </div>

                {/* Right — distribution chart */}
                <div>
                    <div style={{ position:'sticky', top:20 }}>
                        <CSectionCard title="Distribution" description="Accounts by tier.">
                            {/* Stacked bar */}
                            <div style={{ display:'flex', gap:2, height:12, borderRadius:2, overflow:'hidden', border:`1px solid ${T.border}`, marginBottom:14 }}>
                                {tiers.map((t,i) => (
                                    <div key={i} style={{ flex:t.count, background:t.hex }} title={`${t.tier} — ${t.count}`}/>
                                ))}
                            </div>
                            {tiers.map((t,i) => (
                                <div key={i} style={{ padding:'6px 0', display:'flex', alignItems:'center', gap:8, fontSize:12, borderBottom: i<tiers.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                    <span style={{ width:8, height:8, background:t.hex, borderRadius:2, flexShrink:0 }}/>
                                    <span style={{ flex:1, color:T.ink, fontFamily:T.sans }}>{t.tier}</span>
                                    <span style={{ fontFamily:'ui-monospace,Menlo,monospace', color:T.inkMid }}>{t.count}</span>
                                    <span style={{ width:44, textAlign:'right', fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{Math.round(t.count/total*100)}%</span>
                                </div>
                            ))}
                        </CSectionCard>
                    </div>
                </div>
            </div>
        </SPDetailPageChrome>
    );
};

// ── 8. Industries ─────────────────────────────────────────────
const DEFAULT_INDUSTRIES = [
    { k:'Technology',          subs:['SaaS','Hardware','IT services','Cybersecurity','Fintech'],              n:118 },
    { k:'Manufacturing',       subs:['Industrial','Consumer goods','Automotive','Aerospace'],                 n:74  },
    { k:'Healthcare',          subs:['Providers','Payers','Pharma','Medical devices'],                        n:62  },
    { k:'Financial services',  subs:['Banking','Insurance','Asset mgmt','Capital markets'],                   n:54  },
    { k:'Retail & CPG',        subs:['Apparel','Grocery','E-comm','Luxury'],                                  n:41  },
    { k:'Professional services',subs:['Consulting','Legal','Accounting'],                                     n:38  },
    { k:'Logistics',           subs:['Freight','Warehousing','Last-mile'],                                    n:29  },
    { k:'Energy',              subs:['Oil & gas','Utilities','Renewables'],                                   n:22  },
    { k:'Education',           subs:['K-12','Higher ed','EdTech'],                                            n:18  },
    { k:'Government',          subs:['Federal','State & local','Defense'],                                    n:14  },
    { k:'Real estate',         subs:['Commercial','Residential','PropTech'],                                  n:12  },
    { k:'Media & entertainment',subs:['Publishing','Streaming','Gaming'],                                     n:9   },
    { k:'Agriculture',         subs:['Farming','AgTech'],                                                     n:5   },
    { k:'Non-profit',          subs:['Foundations','NGOs'],                                                   n:4   },
];

const IndustriesDetail = ({ settings, setSettings, onBack, setActiveTab, setAccountsDeepFilter }) => {
    const saved = settings?.industries?.length ? settings.industries : DEFAULT_INDUSTRIES;
    const [industries, setIndustries] = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty]     = useState(false);
    const [saving, setSaving]   = useState(false);
    const [expanded, setExpanded] = useState({});
    const [addingSubTo, setAddingSubTo] = useState(null);
    const [newSub, setNewSub]   = useState('');
    const [showAddInd, setShowAddInd] = useState(false);
    const [newInd, setNewInd]   = useState('');

    const handleCancel = () => { setIndustries(JSON.parse(JSON.stringify(saved))); setDirty(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, industries }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body:JSON.stringify({ industries }) }); }
        catch(e) { console.error('save industries', e); }
        setSaving(false); setDirty(false);
    };

    // Industry kebab state
    const [openIndKebab, setOpenIndKebab]     = useState(null); // industry key
    const [renamingInd,  setRenamingInd]      = useState(null); // industry key
    const [renameIndVal, setRenameIndVal]     = useState('');

    // Close kebab on click-outside
    React.useEffect(() => {
        if (openIndKebab === null) return;
        const handler = () => setOpenIndKebab(null);
        document.addEventListener('click', handler);
        return () => document.removeEventListener('click', handler);
    }, [openIndKebab]);

    const addSub = (indKey) => {
        if (!newSub.trim()) return;
        setIndustries(prev => prev.map(ind => ind.k === indKey ? { ...ind, subs: [...ind.subs, newSub.trim()] } : ind));
        setNewSub(''); setAddingSubTo(null); setDirty(true);
    };
    const removeSub = (indKey, sub) => {
        setIndustries(prev => prev.map(ind => ind.k === indKey ? { ...ind, subs: ind.subs.filter(s => s !== sub) } : ind));
        setDirty(true);
    };
    const addIndustry = () => {
        if (!newInd.trim()) return;
        setIndustries(prev => [...prev, { k: newInd.trim(), subs:[], n:0 }]);
        setNewInd(''); setShowAddInd(false); setDirty(true);
    };

    // Kebab actions
    const handleRenameInd = (indKey) => {
        if (!renameIndVal.trim() || renameIndVal.trim() === indKey) { setRenamingInd(null); return; }
        setIndustries(prev => prev.map(ind => ind.k === indKey ? { ...ind, k: renameIndVal.trim() } : ind));
        setRenamingInd(null); setRenameIndVal(''); setDirty(true);
    };
    const handleDuplicateInd = (ind) => {
        const clone = { ...ind, k: ind.k + ' (copy)', n: 0 };
        setIndustries(prev => [...prev, clone]); setDirty(true); setOpenIndKebab(null);
    };
    const handleInsertAbove = (i) => {
        const blank = { k: 'New industry', subs: [], n: 0 };
        setIndustries(prev => { const next = [...prev]; next.splice(i, 0, blank); return next; });
        setDirty(true); setOpenIndKebab(null);
    };
    const handleInsertBelow = (i) => {
        const blank = { k: 'New industry', subs: [], n: 0 };
        setIndustries(prev => { const next = [...prev]; next.splice(i + 1, 0, blank); return next; });
        setDirty(true); setOpenIndKebab(null);
    };
    const handleToggleHidden = (indKey) => {
        setIndustries(prev => prev.map(ind => ind.k === indKey ? { ...ind, hidden: !ind.hidden } : ind));
        setDirty(true); setOpenIndKebab(null);
    };
    const handleDeleteInd = (indKey) => {
        setIndustries(prev => prev.filter(ind => ind.k !== indKey));
        setDirty(true); setOpenIndKebab(null);
    };

    const total = industries.reduce((a,i) => a+i.n, 0) || 1;
    const totalSubs = industries.reduce((a,i) => a+i.subs.length, 0);

    return (
        <SPDetailPageChrome
            crumb="Industries" title="Industries"
            subtitle="Primary and sub-industry taxonomy"
            statusDetail={`${industries.length} industries · ${totalSubs} sub-types`}
            updatedBy="Admin" updatedAt="4 months ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            rightActions={
                <div style={{ display:'flex', gap:8 }}>
                    <button onClick={() => setShowAddInd(true)} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ New industry</button>
                    <button onClick={handleCancel} disabled={!dirty} style={{ padding:'7px 14px', background:T.surface, color: dirty ? T.ink : T.inkMuted, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty ? 'pointer' : 'default', fontFamily:T.sans }}>Cancel</button>
                    <button onClick={handleSave} disabled={!dirty || saving} style={{ padding:'7px 14px', background: dirty ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: dirty && !saving ? 'pointer' : 'default', fontFamily:T.sans }}>{saving ? 'Saving…' : 'Save changes'}</button>
                </div>
            }
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:20 }}>
                {/* Left */}
                <div>
                    <CSectionCard title="Industry taxonomy" description="Two-level taxonomy. Primary industries are required on every Account; sub-industries are optional.">
                        {/* Add industry form */}
                        {showAddInd && (
                            <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                                <input value={newInd} onChange={e => setNewInd(e.target.value)} placeholder="Industry name…" autoFocus
                                    onKeyDown={e => { if (e.key==='Enter') addIndustry(); if (e.key==='Escape') { setShowAddInd(false); setNewInd(''); } }}
                                    style={{ flex:1, padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, color:T.ink, fontFamily:T.sans, outline:'none' }}/>
                                <button onClick={addIndustry} style={{ padding:'6px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                                <button onClick={() => { setShowAddInd(false); setNewInd(''); }} style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                            </div>
                        )}

                        <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, background:T.surface, overflow:'hidden' }}>
                            {industries.map((ind,i) => {
                                const isExp = expanded[ind.k];
                                return (
                                    <div key={ind.k} style={{ borderBottom: i<industries.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                        {/* Row header */}
                                        <div style={{ padding:'10px 14px', display:'flex', alignItems:'center', gap:10, opacity: ind.hidden ? 0.5 : 1 }}>
                                            <SPDrag/>
                                            <span onClick={() => setExpanded(p => ({ ...p, [ind.k]: !isExp }))}
                                                style={{ fontSize:11, color:T.inkMuted, cursor:'pointer', transform: isExp ? 'rotate(0deg)' : 'rotate(-90deg)', display:'inline-block', transition:'transform 120ms', userSelect:'none' }}>▾</span>

                                            {/* Industry name — inline rename or display */}
                                            {renamingInd === ind.k ? (
                                                <input autoFocus value={renameIndVal}
                                                    onChange={e => setRenameIndVal(e.target.value)}
                                                    onKeyDown={e => { if (e.key==='Enter') handleRenameInd(ind.k); if (e.key==='Escape') { setRenamingInd(null); setRenameIndVal(''); } }}
                                                    onBlur={() => handleRenameInd(ind.k)}
                                                    style={{ flex:1, padding:'3px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans, outline:'none' }}/>
                                            ) : (
                                                <div style={{ flex:1, fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>
                                                    {ind.k}
                                                    {ind.hidden && <span style={{ marginLeft:8, fontSize:9, fontWeight:700, color:T.inkMuted, background:T.surface2, padding:'1px 5px', borderRadius:2, letterSpacing:0.4, fontFamily:T.sans }}>HIDDEN</span>}
                                                </div>
                                            )}

                                            <span style={{ fontSize:11, color:T.inkMuted, marginRight:10, fontFamily:T.sans }}>{ind.subs.length} sub-types</span>


                                            {/* Kebab */}
                                            <div style={{ position:'relative', marginLeft:8 }} onClick={e => e.stopPropagation()}>
                                                <button onClick={() => setOpenIndKebab(openIndKebab === ind.k ? null : ind.k)}
                                                    style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:0, lineHeight:1 }}>⋯</button>
                                                {openIndKebab === ind.k && (
                                                    <div style={{ position:'absolute', right:0, zIndex:400, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 20px rgba(42,38,34,0.14)', minWidth:220, overflow:'hidden',
                                                ...(i >= industries.length - 4 ? { bottom:'100%', marginBottom:4 } : { top:'100%', marginTop:4 }) }}>

                                                        {/* Edit */}
                                                        {[
                                                            { label:'Edit industry', sub:'Name, description, color', action:() => { setRenamingInd(ind.k); setRenameIndVal(ind.k); setOpenIndKebab(null); } },
                                                            { label:'Duplicate', sub:'Clone with sub-types', action:() => handleDuplicateInd(ind) },
                                                            { label:'Move…', sub:'Drag the handle to reorder', action:() => setOpenIndKebab(null), muted:true },
                                                        ].map((item,mi) => (
                                                            <button key={mi} onClick={item.action}
                                                                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop: mi>0 ? `1px solid ${T.border}` : 'none', textAlign:'left', cursor: item.muted ? 'default' : 'pointer', fontFamily:T.sans }}
                                                                onMouseEnter={e => { if (!item.muted) e.currentTarget.style.background = T.surface2; }}
                                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                                <div style={{ fontSize:13, color: item.muted ? T.inkMuted : T.ink }}>{item.label}</div>
                                                                {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                            </button>
                                                        ))}

                                                        {/* Add New group */}
                                                        <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', borderTop:`1px solid ${T.border}`, background:T.surface2, fontFamily:T.sans }}>Add new</div>
                                                        {[
                                                            { label:'Insert industry above', sub:`New industry above ${ind.k}`, action:() => handleInsertAbove(i) },
                                                            { label:'Insert industry below', sub:`New industry below ${ind.k}`, action:() => handleInsertBelow(i) },
                                                            { label:'Add sub-industry…', sub:`Add a sub-type to ${ind.k}`, action:() => { setAddingSubTo(ind.k); setNewSub(''); setExpanded(p => ({ ...p, [ind.k]: true })); setOpenIndKebab(null); } },
                                                            { label:'Merge into another…', sub:'Move sub-types and accounts', action:() => setOpenIndKebab(null), muted:true },
                                                        ].map((item,mi) => (
                                                            <button key={mi} onClick={item.action}
                                                                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor: item.muted ? 'default' : 'pointer', fontFamily:T.sans }}
                                                                onMouseEnter={e => { if (!item.muted) e.currentTarget.style.background = T.surface2; }}
                                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                                <div style={{ fontSize:13, color: item.muted ? T.inkMuted : T.ink }}>{item.label}</div>
                                                                {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                            </button>
                                                        ))}

                                                        {/* Apply to accounts group */}
                                                        <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', borderTop:`1px solid ${T.border}`, background:T.surface2, fontFamily:T.sans }}>Apply to accounts</div>
                                                        {[
                                                            { label:'View accounts', sub:'Open in Accounts, filtered', action:() => { setOpenIndKebab(null); if (setAccountsDeepFilter && setActiveTab) { setAccountsDeepFilter({ industry: ind.k }); setActiveTab('accounts'); } } },
                                                            { label:'Reassign accounts…', sub:'Move accounts to another industry', action:() => setOpenIndKebab(null), muted:true },
                                                            { label:'Re-run auto-tagging', sub:'From company name + website', action:() => setOpenIndKebab(null), muted:true },
                                                        ].map((item,mi) => (
                                                            <button key={mi} onClick={item.action}
                                                                style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor: item.muted ? 'default' : 'pointer', fontFamily:T.sans }}
                                                                onMouseEnter={e => { if (!item.muted) e.currentTarget.style.background = T.surface2; }}
                                                                onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                                <div style={{ fontSize:13, color: item.muted ? T.inkMuted : T.ink }}>{item.label}</div>
                                                                {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                            </button>
                                                        ))}

                                                        {/* Visibility group */}
                                                        <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', borderTop:`1px solid ${T.border}`, background:T.surface2, fontFamily:T.sans }}>Visibility</div>
                                                        <button onClick={() => handleToggleHidden(ind.k)}
                                                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                            <div style={{ fontSize:13, color:T.ink }}>{ind.hidden ? 'Show for new accounts' : 'Hide from new accounts'}</div>
                                                            <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>Existing accounts keep this tag</div>
                                                        </button>
                                                        <button onClick={() => handleDeleteInd(ind.k)}
                                                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(156,58,46,0.06)'}
                                                            onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                                                            <div style={{ fontSize:13, color:T.danger }}>Delete industry</div>
                                                            <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>Removes tag from all accounts</div>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {/* Sub-industries */}
                                        <div style={{ padding:'0 14px 10px 52px', display:'flex', flexWrap:'wrap', gap:6 }}>
                                            {ind.subs.map((s,si) => (
                                                <span key={si} style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', fontSize:11.5, color:T.inkMid, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:12 }}>
                                                    {s}
                                                    <button onClick={() => removeSub(ind.k, s)} style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:12, padding:0, lineHeight:1 }}
                                                        onMouseEnter={e => e.currentTarget.style.color = T.danger}
                                                        onMouseLeave={e => e.currentTarget.style.color = T.inkMuted}>×</button>
                                                </span>
                                            ))}
                                            {addingSubTo === ind.k ? (
                                                <span style={{ display:'inline-flex', alignItems:'center', gap:5 }}>
                                                    <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder="Sub-type…" autoFocus
                                                        onKeyDown={e => { if (e.key==='Enter') addSub(ind.k); if (e.key==='Escape') { setAddingSubTo(null); setNewSub(''); } }}
                                                        style={{ width:120, padding:'3px 8px', border:`1px solid ${T.border}`, borderRadius:10, fontSize:11.5, color:T.ink, fontFamily:T.sans, outline:'none' }}/>
                                                    <button onClick={() => addSub(ind.k)} style={{ fontSize:11.5, fontWeight:600, color:T.goldInk, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>Add</button>
                                                    <button onClick={() => { setAddingSubTo(null); setNewSub(''); }} style={{ fontSize:11.5, color:T.inkMuted, background:'none', border:'none', cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                                                </span>
                                            ) : (
                                                <span onClick={() => { setAddingSubTo(ind.k); setNewSub(''); }}
                                                    style={{ padding:'3px 9px', fontSize:11.5, color:T.goldInk, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ Add</span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CSectionCard>
                </div>

                {/* Right — distribution */}
                <div>
                    <div style={{ position:'sticky', top:20 }}>
                        <CSectionCard title="Distribution" description="Accounts per primary industry.">
                            {industries.map((ind,i) => {
                                const pct = (ind.n/total)*100;
                                return (
                                    <div key={i} style={{ padding:'6px 0', borderBottom: i<industries.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, marginBottom:4 }}>
                                            <span style={{ flex:1, color:T.ink, fontWeight:500, fontFamily:T.sans }}>{ind.k}</span>
                                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', color:T.inkMid, fontSize:11 }}>{ind.n}</span>
                                            <span style={{ width:36, textAlign:'right', fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{pct.toFixed(1)}%</span>
                                        </div>
                                        <div style={{ height:4, background:T.surface2, borderRadius:1 }}>
                                            <div style={{ width:`${pct}%`, height:'100%', background:T.goldInk, opacity:0.7, borderRadius:1 }}/>
                                        </div>
                                    </div>
                                );
                            })}
                        </CSectionCard>
                    </div>
                </div>
            </div>
        </SPDetailPageChrome>
    );
};

// ─────────────────────────────────────────────────────────────
// APPROVAL TIERS DETAIL PAGE
// Settings → Quoting → Approval tiers
// ─────────────────────────────────────────────────────────────

const DEFAULT_APPROVAL_TIERS = [
    { id:'rep',  label:'Rep',          color:'#4d6b3d', maxDiscount:0.10, approver:null,            sla:null, fallback:null,       active:true },
    { id:'mgr',  label:'Mgr approval', color:'#b87333', maxDiscount:0.20, approver:'Sales Manager', sla:'8h', fallback:'VP Sales',  active:true },
    { id:'vp',   label:'VP approval',  color:'#9c3a2e', maxDiscount:0.30, approver:'VP Sales',      sla:'24h',fallback:'CFO',       active:true },
    { id:'cfo',  label:'CFO approval', color:'#6b2a22', maxDiscount:1.00, approver:'CFO',           sla:'48h',fallback:'CEO',       active:true },
];

const APPROVAL_TIER_USAGE = [
    { tier:'Rep',          tone:'rep', quotes:312, approved:312, declined:0,  pending:0,  avgHours:0  },
    { tier:'Mgr approval', tone:'mgr', quotes:88,  approved:76,  declined:12, pending:4,  avgHours:6  },
    { tier:'VP approval',  tone:'vp',  quotes:24,  approved:20,  declined:4,  pending:2,  avgHours:18 },
    { tier:'CFO approval', tone:'cfo', quotes:6,   approved:5,   declined:1,  pending:1,  avgHours:36 },
];

const DEFAULT_TRIGGERS = [
    { k:'Average discount %',    on:true,  hint:'Calculated across all line items.' },
    { k:'Single-line discount',  on:false, hint:'Trigger if any one line exceeds the threshold.' },
    { k:'Contract term > 36 mo', on:true,  hint:'Long terms route to VP regardless of discount.' },
    { k:'Custom pricing used',   on:true,  hint:'Any line with non-list price triggers Mgr at minimum.' },
    { k:'Deal value > $250K',    on:false, hint:'Big deals always route to VP.' },
    { k:'Non-standard terms',    on:true,  hint:'Custom legal/payment terms route to CFO.' },
];

// QPill — approval tier status pill
const QPill = ({ tone = 'neutral', children, dot }) => {
    const map = {
        rep:     { bg:'rgba(77,107,61,0.12)',   fg:'#4d6b3d' },
        mgr:     { bg:'rgba(184,115,51,0.12)',  fg:'#b87333' },
        vp:      { bg:'rgba(156,58,46,0.12)',   fg:'#9c3a2e' },
        cfo:     { bg:'rgba(107,42,34,0.14)',   fg:'#6b2a22' },
        neutral: { bg:'rgba(138,131,120,0.14)', fg:'#5a544c' },
    };
    const c = map[tone] || map.neutral;
    return (
        <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 8px', borderRadius:12, background:c.bg, color:c.fg, fontSize:11, fontWeight:600, letterSpacing:0.1, whiteSpace:'nowrap' }}>
            {dot && <span style={{ width:6, height:6, borderRadius:'50%', background:c.fg }}/>}
            {children}
        </span>
    );
};

// Toggle
const ATToggle = ({ on, onChange }) => (
    <span onClick={onChange} style={{ display:'inline-block', width:28, height:16, borderRadius:8, background: on ? T.ok : T.borderStrong, position:'relative', cursor:'pointer', verticalAlign:'middle', flexShrink:0 }}>
        <span style={{ position:'absolute', top:2, left: on ? 14 : 2, width:12, height:12, borderRadius:'50%', background:'#fff', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 120ms' }}/>
    </span>
);

// NumStep
const NumStep = ({ value, onChange, suffix='', min=0, max=100 }) => (
    <div style={{ display:'inline-flex', alignItems:'center', border:`1px solid ${T.border}`, borderRadius:T.r, background:T.surface, overflow:'hidden' }}>
        <button onClick={() => onChange && onChange(Math.max(min, value-1))} style={{ padding:'4px 8px', background:'none', border:'none', color:T.inkMuted, fontSize:14, cursor:'pointer', lineHeight:1 }}>−</button>
        <span style={{ borderLeft:`1px solid ${T.border}`, borderRight:`1px solid ${T.border}`, padding:'4px 10px', minWidth:56, textAlign:'center', fontFamily:'ui-monospace,Menlo,monospace', fontSize:13, color:T.ink }}>{value}{suffix}</span>
        <button onClick={() => onChange && onChange(Math.min(max, value+1))} style={{ padding:'4px 8px', background:'none', border:'none', color:T.inkMuted, fontSize:14, cursor:'pointer', lineHeight:1 }}>+</button>
    </div>
);

const ApprovalTiersDetail = ({ settings, setSettings, onBack }) => {
    const saved = {
        tiers:    settings?.approvalTiers    || DEFAULT_APPROVAL_TIERS,
        triggers: settings?.approvalTriggers || DEFAULT_TRIGGERS,
    };
    const [tiers,    setTiers]    = useState(() => JSON.parse(JSON.stringify(saved.tiers)));
    const [triggers, setTriggers] = useState(() => JSON.parse(JSON.stringify(saved.triggers)));
    const [dirty,    setDirty]    = useState(false);
    const [saving,   setSaving]   = useState(false);

    // Try a deal simulator
    const [trialDiscount, setTrialDiscount] = useState(18);
    const [trialValue,    setTrialValue]    = useState(84500);
    const [trialTerm,     setTrialTerm]     = useState('24 months');

    const matchedTier = (() => {
        for (const tier of tiers) {
            const lo = tiers[tiers.indexOf(tier) - 1]?.maxDiscount ?? 0;
            if ((trialDiscount / 100) <= tier.maxDiscount) return tier;
        }
        return tiers[tiers.length - 1];
    })();

    const handleCancel = () => { setTiers(JSON.parse(JSON.stringify(saved.tiers))); setTriggers(JSON.parse(JSON.stringify(saved.triggers))); setDirty(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, approvalTiers: tiers, approvalTriggers: triggers }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body:JSON.stringify({ approvalTiers: tiers, approvalTriggers: triggers }) }); }
        catch(e) { console.error('save approval tiers', e); }
        setSaving(false); setDirty(false);
    };

    const toggleTrigger = (i) => { setTriggers(prev => prev.map((t,ti) => ti===i ? { ...t, on:!t.on } : t)); setDirty(true); };
    const toneForIdx = (i) => ['rep','mgr','vp','cfo'][i] || 'neutral';

    // ── Live approval stats ──────────────────────────────────
    const [approvalStats, setApprovalStats] = useState(null);
    const [statsLoading, setStatsLoading]   = useState(false);

    React.useEffect(() => {
        let cancelled = false;
        const fetchStats = async () => {
            setStatsLoading(true);
            try {
                const res = await dbFetch('/.netlify/functions/quotes?approvalStats=true');
                const data = await res.json();
                if (!cancelled && data.approvalStats) setApprovalStats(data.approvalStats);
            } catch(e) { console.error('fetch approval stats', e); }
            if (!cancelled) setStatsLoading(false);
        };
        fetchStats();
        return () => { cancelled = true; };
    }, []);

    // ── Tier kebab state ─────────────────────────────────────
    const [openTierMenu,    setOpenTierMenu]    = useState(null);  // tier index
    const [editingField,    setEditingField]    = useState(null);  // { idx, field } for inline edit
    const [editingVal,      setEditingVal]      = useState('');

    // Close on click-outside
    React.useEffect(() => {
        if (openTierMenu === null) return;
        const h = () => setOpenTierMenu(null);
        document.addEventListener('click', h);
        return () => document.removeEventListener('click', h);
    }, [openTierMenu]);

    // ── Tier kebab handlers ───────────────────────────────────
    const handleDuplicateTier = (i) => {
        const clone = { ...tiers[i], id: tiers[i].id + '_copy', label: tiers[i].label + ' (copy)' };
        setTiers(prev => { const n = [...prev]; n.splice(i+1, 0, clone); return n; });
        setDirty(true); setOpenTierMenu(null);
    };
    const handleInsertTierAbove = (i) => {
        const prev_max = i===0 ? 0 : tiers[i-1].maxDiscount;
        const blank = { id:`tier_${Date.now()}`, label:'New tier', color:'#7a6a48', maxDiscount: parseFloat(((prev_max + tiers[i].maxDiscount)/2).toFixed(2)), approver:'', sla:'', fallback:'', active:true };
        setTiers(prev => { const n=[...prev]; n.splice(i,0,blank); return n; });
        setDirty(true); setOpenTierMenu(null);
    };
    const handleInsertTierBelow = (i) => {
        const this_max = tiers[i].maxDiscount;
        const next_max = tiers[i+1]?.maxDiscount ?? 1.0;
        const blank = { id:`tier_${Date.now()}`, label:'New tier', color:'#7a6a48', maxDiscount: parseFloat(((this_max + next_max)/2).toFixed(2)), approver:'', sla:'', fallback:'', active:true };
        setTiers(prev => { const n=[...prev]; n.splice(i+1,0,blank); return n; });
        setDirty(true); setOpenTierMenu(null);
    };
    const handleNewTierFromThis = (i) => {
        const t = tiers[i];
        const clone = { ...t, id:`tier_${Date.now()}`, label: t.label + ' (new)', maxDiscount: Math.min(1, parseFloat((t.maxDiscount + 0.1).toFixed(2))) };
        setTiers(prev => [...prev, clone]);
        setDirty(true); setOpenTierMenu(null);
    };
    const commitFieldEdit = (i, field, val) => {
        setTiers(prev => prev.map((t,ti) => {
            if (ti !== i) return t;
            if (field === 'maxDiscount') {
                const n = parseFloat(val) / 100;
                return isNaN(n) ? t : { ...t, maxDiscount: Math.max(0.01, Math.min(1, n)) };
            }
            return { ...t, [field]: val };
        }));
        setDirty(true); setEditingField(null); setEditingVal('');
    };
    const startEdit = (i, field, currentVal) => {
        setEditingField({ idx:i, field }); setEditingVal(currentVal); setOpenTierMenu(null);
    };

    return (
        <SPDetailPageChrome
            crumb="Approval tiers" title="Approval tiers"
            subtitle="Discount thresholds that trigger manager or VP approval"
            statusDetail={`${tiers.length} tiers · advanced rules off`}
            updatedBy="Admin" updatedAt="2 months ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20 }}>
                {/* ── LEFT COLUMN ─────────────────────────────────── */}
                <div>
                    {/* Discount thresholds table */}
                    <CSectionCard
                        title="Discount thresholds"
                        description="When a quote's average discount crosses a threshold, it's routed to the listed approver before it can be sent."
                        headAction={
                            <button style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}>
                                + Add tier
                            </button>
                        }
                    >
                        <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r+2, overflow:'visible' }}>
                            {/* Header */}
                            <div style={{ display:'grid', gridTemplateColumns:'28px 1.4fr 170px 1.2fr 80px 1fr 70px 30px', padding:'9px 14px', borderBottom:`1px solid ${T.border}`, background:T.surface2, gap:10, borderRadius:`${T.r+2}px ${T.r+2}px 0 0` }}>
                                {['','Tier','Discount range','Approver','SLA','Fallback','',''].map((h,i) => (
                                    <div key={i} style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', textAlign: i>=4&&i<=5 ? 'right' : 'left', fontFamily:T.sans }}>{h}</div>
                                ))}
                            </div>
                            {tiers.map((t,i) => {
                                const lo = i===0 ? 0 : tiers[i-1].maxDiscount;
                                const hi = t.maxDiscount;
                                const ef = editingField?.idx === i ? editingField.field : null;
                                const inpSt = { padding:'3px 8px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface };
                                return (
                                    <div key={t.id} style={{ display:'grid', gridTemplateColumns:'28px 1.4fr 170px 1.2fr 80px 1fr 70px 30px', padding:'12px 14px', gap:10, borderBottom: i<tiers.length-1 ? `1px solid ${T.border}` : 'none', alignItems:'center', background:T.surface, fontSize:13, fontFamily:T.sans, position:'relative' }}>
                                        <div><SPDrag/></div>

                                        {/* Tier label */}
                                        <div>
                                            {ef === 'label' ? (
                                                <input autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)}
                                                    onBlur={() => commitFieldEdit(i,'label',editingVal)}
                                                    onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'label',editingVal); if(e.key==='Escape') { setEditingField(null); } }}
                                                    style={{ ...inpSt, fontFamily:T.sans, fontWeight:700, width:'90%' }}/>
                                            ) : (
                                                <span style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                                                    <span style={{ width:10, height:10, background:t.color, borderRadius:2, flexShrink:0 }}/>
                                                    <b style={{ fontFamily:T.sans }}>{t.label}</b>
                                                </span>
                                            )}
                                        </div>

                                        {/* Discount range — click to edit max */}
                                        <div style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12, color:T.inkMid }}>
                                            {ef === 'maxDiscount' ? (
                                                <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                                                    <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>{Math.round(lo*100)}% – </span>
                                                    <input autoFocus type="number" min={Math.round(lo*100)+1} max={100} value={editingVal}
                                                        onChange={e => setEditingVal(e.target.value)}
                                                        onBlur={() => commitFieldEdit(i,'maxDiscount',editingVal)}
                                                        onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'maxDiscount',editingVal); if(e.key==='Escape') setEditingField(null); }}
                                                        style={{ ...inpSt, width:52 }}/>
                                                    <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>%</span>
                                                </div>
                                            ) : (
                                                `${Math.round(lo*100)}% – ${Math.round(hi*100)}%`
                                            )}
                                        </div>

                                        {/* Approver */}
                                        <div>
                                            {ef === 'approver' ? (
                                                <input autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)}
                                                    onBlur={() => commitFieldEdit(i,'approver',editingVal)}
                                                    onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'approver',editingVal); if(e.key==='Escape') setEditingField(null); }}
                                                    style={{ ...inpSt, fontFamily:T.sans, width:'90%' }} placeholder="Approver name"/>
                                            ) : t.approver ? (
                                                <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                                                    <span style={{ width:22, height:22, borderRadius:'50%', background:T.surface2, border:`1px solid ${T.border}`, fontSize:10, color:T.inkMid, display:'inline-flex', alignItems:'center', justifyContent:'center', fontWeight:700 }}>
                                                        {t.approver.split(' ').map(s=>s[0]).slice(0,2).join('')}
                                                    </span>
                                                    <span style={{ fontSize:13 }}>{t.approver}</span>
                                                </span>
                                            ) : (
                                                <span style={{ color:T.inkMuted, fontStyle:'italic', fontSize:12 }}>No approval needed</span>
                                            )}
                                        </div>

                                        {/* SLA */}
                                        <div style={{ textAlign:'right', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>
                                            {ef === 'sla' ? (
                                                <input autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)}
                                                    onBlur={() => commitFieldEdit(i,'sla',editingVal)}
                                                    onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'sla',editingVal); if(e.key==='Escape') setEditingField(null); }}
                                                    style={{ ...inpSt, width:56, textAlign:'right' }} placeholder="e.g. 8h"/>
                                            ) : t.sla || '—'}
                                        </div>

                                        {/* Fallback */}
                                        <div style={{ color:T.inkMid, fontSize:12 }}>
                                            {ef === 'fallback' ? (
                                                <input autoFocus value={editingVal} onChange={e => setEditingVal(e.target.value)}
                                                    onBlur={() => commitFieldEdit(i,'fallback',editingVal)}
                                                    onKeyDown={e => { if(e.key==='Enter') commitFieldEdit(i,'fallback',editingVal); if(e.key==='Escape') setEditingField(null); }}
                                                    style={{ ...inpSt, fontFamily:T.sans, width:'90%' }} placeholder="e.g. CEO"/>
                                            ) : t.fallback || '—'}
                                        </div>

                                        <div style={{ textAlign:'right' }}><QPill tone={toneForIdx(i)} dot>Active</QPill></div>

                                        {/* Kebab */}
                                        <div style={{ position:'relative', textAlign:'right' }} onClick={e => e.stopPropagation()}>
                                            <button onClick={() => setOpenTierMenu(openTierMenu===i ? null : i)}
                                                style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, padding:0, lineHeight:1 }}>⋯</button>

                                            {openTierMenu === i && (
                                                <div style={{ position:'absolute', right:0, zIndex:500, background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, boxShadow:'0 4px 20px rgba(42,38,34,0.14)', minWidth:230, overflow:'hidden',
                                                    ...(i >= tiers.length - 2 ? { bottom:'100%', marginBottom:4 } : { top:'100%', marginTop:4 }) }}>

                                                    {/* Edit group */}
                                                    {[
                                                        { label:'Edit tier',  sub:'Name, color, discount cap', action:() => startEdit(i,'label',t.label) },
                                                        { label:'Duplicate',  sub:'Clone as a new editable tier', action:() => handleDuplicateTier(i) },
                                                        { label:'Move…',      sub:'Reorder this tier', action:() => setOpenTierMenu(null), muted:true },
                                                    ].map((item,mi) => (
                                                        <button key={mi} onClick={item.action}
                                                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop: mi>0?`1px solid ${T.border}`:'none', textAlign:'left', cursor:item.muted?'default':'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => { if(!item.muted) e.currentTarget.style.background=T.surface2; }}
                                                            onMouseLeave={e => e.currentTarget.style.background='none'}>
                                                            <div style={{ fontSize:13, color:item.muted?T.inkMuted:T.ink }}>{item.label}</div>
                                                            {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                        </button>
                                                    ))}

                                                    {/* Add New Tier group */}
                                                    <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', borderTop:`1px solid ${T.border}`, background:T.surface2, fontFamily:T.sans }}>Add new tier</div>
                                                    {[
                                                        { label:'Insert tier above', sub:`New tier just above ${t.label}`, action:() => handleInsertTierAbove(i) },
                                                        { label:'Insert tier below', sub:'Catch-all above 100%', action:() => handleInsertTierBelow(i) },
                                                        { label:'New tier from this…', sub:`Pre-fill color, SLA, approver`, action:() => handleNewTierFromThis(i) },
                                                    ].map((item,mi) => (
                                                        <button key={mi} onClick={item.action}
                                                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                                            onMouseLeave={e => e.currentTarget.style.background='none'}>
                                                            <div style={{ fontSize:13, color:T.ink }}>{item.label}</div>
                                                            {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                        </button>
                                                    ))}

                                                    {/* Approver Chain group */}
                                                    <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', borderTop:`1px solid ${T.border}`, background:T.surface2, fontFamily:T.sans }}>Approver chain</div>
                                                    {[
                                                        { label:'Change approver…',  sub:t.approver?`${t.approver} — someone else`:'Set an approver', action:() => startEdit(i,'approver',t.approver||'') },
                                                        { label:'Edit SLA',           sub:`Currently ${t.sla||'not set'}`, action:() => startEdit(i,'sla',t.sla||'') },
                                                        { label:'Edit fallback',      sub:`${t.fallback||'Not set'} after SLA breach`, action:() => startEdit(i,'fallback',t.fallback||'') },
                                                        { label:'Add co-approver',    sub:'Require both signatures', action:() => setOpenTierMenu(null), muted:true },
                                                    ].map((item,mi) => (
                                                        <button key={mi} onClick={item.action}
                                                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor:item.muted?'default':'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => { if(!item.muted) e.currentTarget.style.background=T.surface2; }}
                                                            onMouseLeave={e => e.currentTarget.style.background='none'}>
                                                            <div style={{ fontSize:13, color:item.muted?T.inkMuted:T.ink }}>{item.label}</div>
                                                            {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                        </button>
                                                    ))}

                                                    {/* Active Quotes group */}
                                                    <div style={{ padding:'5px 14px 3px', fontSize:10, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', borderTop:`1px solid ${T.border}`, background:T.surface2, fontFamily:T.sans }}>Active quotes</div>
                                                    {[
                                                        { label:'View quotes routed',   sub:`All quotes at ${t.label}`, action:() => setOpenTierMenu(null) },
                                                        { label:'View pending now',      sub:`Awaiting ${t.approver||'approval'} sign-off`, action:() => setOpenTierMenu(null) },
                                                    ].map((item,mi) => (
                                                        <button key={mi} onClick={item.action}
                                                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none', borderTop:`1px solid ${T.border}`, textAlign:'left', cursor:'pointer', fontFamily:T.sans }}
                                                            onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                                            onMouseLeave={e => e.currentTarget.style.background='none'}>
                                                            <div style={{ fontSize:13, color:T.ink }}>{item.label}</div>
                                                            {item.sub && <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{item.sub}</div>}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </CSectionCard>

                    {/* Approval ladder flow strip */}
                    <CSectionCard title="Approval ladder" description="A live preview of how the tiers carve up the 0–100% discount range.">
                        <div>
                            <div style={{ display:'flex', height:28, borderRadius:T.r+1, overflow:'hidden', border:`1px solid ${T.border}` }}>
                                {(() => {
                                    let prev = 0;
                                    return tiers.map((t,i) => {
                                        const width = (t.maxDiscount - prev) * 100;
                                        const seg = (
                                            <div key={i} style={{ flex:`${width} 0 0`, background:t.color, opacity:0.85, display:'flex', alignItems:'center', justifyContent:'center', color:'#fff', fontSize:11, fontWeight:600, letterSpacing:0.2, borderRight: i<tiers.length-1 ? '1px solid rgba(255,255,255,0.3)' : 'none', overflow:'hidden', whiteSpace:'nowrap', padding:'0 6px' }}>
                                                {t.label}
                                            </div>
                                        );
                                        prev = t.maxDiscount;
                                        return seg;
                                    });
                                })()}
                            </div>
                            <div style={{ position:'relative', height:14, marginTop:4 }}>
                                <span style={{ position:'absolute', left:0, fontSize:10, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', transform:'translateX(-50%)' }}>0%</span>
                                {tiers.map((t,i) => (
                                    <span key={i} style={{ position:'absolute', left:`${t.maxDiscount*100}%`, fontSize:10, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', transform:'translateX(-50%)' }}>
                                        {Math.round(t.maxDiscount*100)}%
                                    </span>
                                ))}
                            </div>
                        </div>
                    </CSectionCard>

                    {/* Triggers */}
                    <CSectionCard title="Triggers" description="What activates the approval flow. By default only avg discount, but you can add deal-level triggers.">
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                            {triggers.map((r,i) => (
                                <div key={i} onClick={() => toggleTrigger(i)} style={{ padding:'10px 12px', border:`1px solid ${r.on ? T.goldInk : T.border}`, borderRadius:T.r+2, background: r.on ? 'rgba(200,185,154,0.08)' : T.surface, cursor:'pointer', transition:'all 120ms' }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                                        <ATToggle on={r.on}/>
                                        <span style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{r.k}</span>
                                    </div>
                                    <div style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{r.hint}</div>
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop:14, fontSize:11.5, color:T.inkMuted, display:'flex', alignItems:'center', gap:8, fontFamily:T.sans }}>
                            Need conditional logic per product or customer type?
                            <span style={{ color:T.goldInk, fontWeight:600, cursor:'pointer' }}>Switch to advanced rules →</span>
                        </div>
                    </CSectionCard>
                </div>

                {/* ── RIGHT COLUMN ────────────────────────────────── */}
                <div>
                    <div style={{ position:'sticky', top:20 }}>
                        {/* Last 90 days — live from quotes API */}
                        <CSectionCard title="Last 90 days" description="How approvals are flowing in practice.">
                            {statsLoading && (
                                <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans, padding:'8px 0' }}>Loading…</div>
                            )}
                            {!statsLoading && tiers.map((t,i) => {
                                const tones = ['rep','mgr','vp','cfo'];
                                const tone = tones[i] || 'neutral';
                                // Match live stats to tier by label, fall back to zeros
                                const u = approvalStats?.find(s => s.tier === t.label) || { quotes:0, approved:0, declined:0, pending:0, avgHours:0 };
                                return (
                                    <div key={t.id} style={{ padding:'10px 0', borderBottom: i<tiers.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                                            <QPill tone={tone}>{t.label}</QPill>
                                            <div style={{ flex:1 }}/>
                                            <span style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:14, color:T.ink }}>{u.quotes}</span>
                                            <span style={{ fontSize:10, color:T.inkMuted, fontFamily:T.sans }}>quotes</span>
                                        </div>
                                        <div style={{ fontSize:11, color:T.inkMid, display:'flex', gap:12, fontFamily:T.sans }}>
                                            <span>✓ {u.approved}</span>
                                            {u.declined > 0 && <span style={{ color:T.danger }}>✗ {u.declined}</span>}
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

                        {/* Try a deal — live simulator */}
                        <CSectionCard title="Try a deal" description="See which tier a hypothetical quote would hit.">
                            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                                <div>
                                    <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Avg discount <span style={{ color:T.inkMuted, fontWeight:400 }}>Across all line items.</span></label>
                                    <NumStep value={trialDiscount} onChange={v => { setTrialDiscount(v); }} suffix="%" min={0} max={100}/>
                                </div>
                                <div>
                                    <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Deal value</label>
                                    <input type="number" value={trialValue} onChange={e => setTrialValue(parseInt(e.target.value)||0)}
                                        style={{ padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', width:'100%', boxSizing:'border-box', background:T.surface }}/>
                                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:3, fontFamily:T.sans }}>${trialValue.toLocaleString()}</div>
                                </div>
                                <div>
                                    <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4, fontFamily:T.sans }}>Term</label>
                                    <select value={trialTerm} onChange={e => setTrialTerm(e.target.value)} style={{ padding:'6px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', width:'100%', background:T.surface, cursor:'pointer' }}>
                                        {['12 months','24 months','36 months','48 months','60 months'].map(t => <option key={t}>{t}</option>)}
                                    </select>
                                </div>

                                {/* Result */}
                                <div style={{ padding:'12px 14px', background:`${matchedTier.color}1a`, border:`1.5px solid ${matchedTier.color}`, borderRadius:T.r+2, marginTop:4 }}>
                                    <div style={{ fontSize:10, fontWeight:700, color:matchedTier.color, letterSpacing:0.8, textTransform:'uppercase', fontFamily:T.sans, marginBottom:6 }}>Routes to</div>
                                    <div style={{ fontSize:14, fontWeight:700, color:matchedTier.color, fontFamily:T.sans }}>{matchedTier.label}</div>
                                    <div style={{ fontSize:11, color:T.inkMid, marginTop:4, fontFamily:T.sans }}>
                                        {matchedTier.approver
                                            ? `Avg discount ${trialDiscount}% › ${Math.round((tiers[tiers.indexOf(matchedTier)-1]?.maxDiscount??0)*100)}% threshold · est. ${matchedTier.sla} SLA`
                                            : `Avg discount ${trialDiscount}% is within the ${Math.round(matchedTier.maxDiscount*100)}% rep tier — no approval needed`}
                                    </div>
                                </div>
                            </div>
                        </CSectionCard>
                    </div>
                </div>
            </div>
        </SPDetailPageChrome>
    );
};

// ─────────────────────────────────────────────────────────────
// QUOTE TEMPLATES & BRANDING DETAIL PAGE
// Settings → Quoting → Quote templates & branding
// ─────────────────────────────────────────────────────────────

const DEFAULT_QUOTE_TEMPLATES = [
    { id:'tpl1', name:'SMB Starter — Annual',    desc:'Core + Pipeline + Reports + Basic onboarding. Ideal for 10–50 seats.',           usedTimes:47, lastUsed:'3 days ago',   avgWinRate:0.48 },
    { id:'tpl2', name:'Growth Package',           desc:'Core + all core modules + white-glove services. 50–200 seats, 2-3 yr terms.',     usedTimes:28, lastUsed:'1 week ago',   avgWinRate:0.44 },
    { id:'tpl3', name:'Enterprise — Multi-year',  desc:'Premium core + full module stack + dedicated CSM. 200+ seats.',                  usedTimes:9,  lastUsed:'2 weeks ago',  avgWinRate:0.57 },
    { id:'tpl4', name:'Quick trial → paid',       desc:'Minimal Core + basic onboarding, annual. Conversion-from-trial template.',        usedTimes:19, lastUsed:'6 days ago',   avgWinRate:0.52 },
];

const QT_BRANDING = {
    primary: '#6b2a22', ink: '#1a1612', paper: '#fbf8f3', accent: '#b87333',
    serifFamily: 'Georgia, serif', sansFamily: 'system-ui, sans-serif',
    logoMark: '◐', companyName: 'Accelerep',
    contactLine: 'sales@accelerep.com · accelerep.com',
};

// Mini quote doc preview — scaled-down representation
const MiniQuoteDoc = ({ scale = 0.32 }) => {
    const w = Math.round(360 * scale);
    const h = Math.round(480 * scale);
    const s = scale;
    return (
        <div style={{ width:w, height:h, background:QT_BRANDING.paper, border:`1px solid ${T.border}`, borderRadius:4, boxShadow:'0 4px 12px rgba(0,0,0,0.06)', padding:Math.round(18*s), fontSize:Math.round(9*s), color:QT_BRANDING.ink, fontFamily:T.sans, overflow:'hidden', display:'flex', flexDirection:'column', gap:Math.round(8*s) }}>
            {/* Cover */}
            <div style={{ display:'flex', alignItems:'center', gap:Math.round(6*s) }}>
                <span style={{ fontSize:Math.round(18*s), color:QT_BRANDING.primary }}>{QT_BRANDING.logoMark}</span>
                <b style={{ fontFamily:T.serif, fontStyle:'italic', fontSize:Math.round(11*s) }}>{QT_BRANDING.companyName}</b>
            </div>
            <div style={{ height:1, background:QT_BRANDING.primary, opacity:0.6 }}/>
            <div style={{ fontSize:Math.round(7*s), fontWeight:700, color:QT_BRANDING.accent, letterSpacing:0.5, textTransform:'uppercase' }}>QUOTE · Q-2026</div>
            <div style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:Math.round(16*s), lineHeight:1.1 }}>Mountain View Capital</div>
            <div style={{ fontSize:Math.round(7*s), color:T.inkMuted }}>Prepared for Helena Choi · Valid 30 days</div>
            {/* Lines */}
            <div>
                <div style={{ display:'flex', justifyContent:'space-between', padding:`${Math.round(3*s)}px 0`, borderBottom:`1px solid ${QT_BRANDING.primary}`, fontWeight:700, fontSize:Math.round(7*s), letterSpacing:0.4 }}>
                    <span>ITEM</span><span>QTY</span><span>TOTAL</span>
                </div>
                {[['Accelerep Core','50','$36,000'],['Pipeline','50','$12,000'],['Support','1','$4,800']].map((r,i) => (
                    <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:`${Math.round(3*s)}px 0`, fontSize:Math.round(7*s), borderBottom:`1px solid rgba(0,0,0,0.06)` }}>
                        <span>{r[0]}</span><span style={{ color:T.inkMuted }}>{r[1]}</span><span style={{ fontFamily:'ui-monospace,Menlo,monospace' }}>{r[2]}</span>
                    </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', paddingTop:Math.round(4*s), fontSize:Math.round(8*s), fontWeight:700 }}>
                    <span>Total</span>
                    <span style={{ color:QT_BRANDING.primary, fontFamily:T.serif, fontStyle:'italic' }}>$52,800</span>
                </div>
            </div>
            {/* Terms */}
            <div style={{ marginTop:'auto', fontSize:Math.round(6*s), color:T.inkMuted, lineHeight:1.45 }}>
                <div style={{ fontWeight:700, color:QT_BRANDING.accent, letterSpacing:0.5, textTransform:'uppercase', fontSize:Math.round(6*s), marginBottom:2 }}>Terms</div>
                Net-30 invoicing. Auto-renew with 60-day notice. Pricing locked for the term.
            </div>
        </div>
    );
};

// Template card
const TplLibCard = ({ t, isDefault, isSelected, onClick }) => (
    <div onClick={onClick} style={{ background:T.surface, border:`1.5px solid ${isSelected ? T.goldInk : T.border}`, borderRadius:T.r+2, overflow:'hidden', cursor:'pointer', display:'flex', flexDirection:'column', transition:'border-color 120ms' }}>
        <div style={{ height:130, background:'linear-gradient(180deg, #f4ede0 0%, #ede4d2 100%)', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
            <div style={{ transform:'scale(0.32)', transformOrigin:'center' }}>
                <MiniQuoteDoc/>
            </div>
            {isDefault && (
                <span style={{ position:'absolute', top:8, left:8, padding:'2px 7px', background:'rgba(0,0,0,0.7)', color:'#fff', fontSize:9, fontWeight:700, letterSpacing:0.6, borderRadius:2, textTransform:'uppercase' }}>Default</span>
            )}
        </div>
        <div style={{ padding:12, flex:1, display:'flex', flexDirection:'column' }}>
            <div style={{ fontSize:13, fontWeight:700, color:T.ink, marginBottom:4 }}>{t.name}</div>
            <div style={{ fontSize:11, color:T.inkMuted, marginBottom:10, lineHeight:1.5, height:32, overflow:'hidden' }}>{t.desc}</div>
            <div style={{ display:'flex', alignItems:'center', gap:8, fontSize:10.5, color:T.inkMid, marginTop:'auto' }}>
                <span><b style={{ color:T.ink, fontFamily:T.serif, fontStyle:'italic', fontSize:13 }}>{t.usedTimes}</b> uses</span>
                <span style={{ color:T.inkMuted }}>·</span>
                <span>Last: {t.lastUsed}</span>
                <div style={{ flex:1 }}/>
                <QPill tone="rep" dot>{Math.round(t.avgWinRate*100)}% win</QPill>
            </div>
        </div>
    </div>
);

// New template modal
const NewTemplateModal = ({ templates, onClose, onCreate }) => {
    const [mode, setMode]         = useState('blank'); // blank | duplicate | import | library
    const [selectedTpl, setSelectedTpl] = useState(null);
    const [newName, setNewName]   = useState('');
    const [setAsDefault, setSetAsDefault] = useState(false);

    const modeOptions = [
        { key:'blank',     label:'Blank',          sub:'Start from scratch' },
        { key:'duplicate', label:'Duplicate',       sub:'From existing' },
        { key:'import',    label:'Import',          sub:'PDF · DOCX · .qtpl' },
        { key:'library',   label:'From library',    sub:'Accelerep starters' },
    ];

    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.5)', zIndex:600, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
            <div onClick={e => e.stopPropagation()} style={{ background:T.surface, borderRadius:T.r+4, width:660, maxHeight:'90vh', overflow:'auto', boxShadow:'0 16px 48px rgba(42,38,34,0.2)', fontFamily:T.sans }}>
                {/* Header */}
                <div style={{ padding:'20px 24px 0', borderBottom:`1px solid ${T.border}`, paddingBottom:16 }}>
                    <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
                        <div>
                            <div style={{ fontSize:17, fontWeight:700, color:T.ink, marginBottom:3 }}>New quote template</div>
                            <div style={{ fontSize:12.5, color:T.inkMuted }}>Choose how to start, then name the template.</div>
                        </div>
                        <button onClick={onClose} style={{ background:'none', border:'none', color:T.inkMuted, cursor:'pointer', fontSize:18, padding:0, lineHeight:1 }}>×</button>
                    </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'180px 1fr', minHeight:300 }}>
                    {/* Left: mode rail */}
                    <div style={{ borderRight:`1px solid ${T.border}`, padding:'14px 12px', display:'flex', flexDirection:'column', gap:4 }}>
                        {modeOptions.map(opt => (
                            <div key={opt.key} onClick={() => { setMode(opt.key); setSelectedTpl(null); }}
                                style={{ padding:'10px 12px', borderRadius:T.r+1, cursor:'pointer', background: mode===opt.key ? 'rgba(200,185,154,0.15)' : 'none', border: mode===opt.key ? `1.5px solid ${T.goldInk}` : '1.5px solid transparent', transition:'all 100ms' }}>
                                <div style={{ fontSize:13, fontWeight:600, color: mode===opt.key ? T.ink : T.inkMid }}>{opt.label}</div>
                                <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{opt.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Right: content area */}
                    <div style={{ padding:'14px 20px' }}>
                        {mode === 'blank' && (
                            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                                <div style={{ padding:20, border:`1.5px dashed ${T.border}`, borderRadius:T.r+2, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:T.inkMuted, minHeight:120 }}>
                                    <span style={{ fontSize:28, color:T.goldInk }}>+</span>
                                    <span style={{ fontSize:13, fontWeight:600, color:T.inkMid }}>Start from scratch</span>
                                    <span style={{ fontSize:11, color:T.inkMuted }}>You'll be taken to the template editor after creating</span>
                                </div>
                            </div>
                        )}
                        {mode === 'duplicate' && (
                            <div>
                                <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:10, fontFamily:T.sans }}>Pick a template to duplicate</div>
                                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                                    {templates.map((tpl,i) => (
                                        <div key={tpl.id} onClick={() => { setSelectedTpl(tpl); setNewName(tpl.name + ' — copy'); }}
                                            style={{ padding:'12px 14px', border:`1.5px solid ${selectedTpl?.id===tpl.id ? T.goldInk : T.border}`, borderRadius:T.r+1, cursor:'pointer', display:'flex', gap:14, alignItems:'center', background: selectedTpl?.id===tpl.id ? 'rgba(200,185,154,0.1)' : T.surface }}>
                                            <div style={{ width:52, height:52, background:'linear-gradient(180deg,#f4ede0,#ede4d2)', border:`1px solid ${T.border}`, borderRadius:T.r, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                                <div style={{ transform:'scale(0.14)', transformOrigin:'center' }}><MiniQuoteDoc/></div>
                                            </div>
                                            <div style={{ flex:1 }}>
                                                <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>{tpl.name}</div>
                                                <div style={{ fontSize:11, color:T.inkMuted, marginTop:2 }}>{tpl.desc}</div>
                                                <div style={{ fontSize:10.5, color:T.inkMid, marginTop:4 }}>
                                                    <b style={{ fontFamily:T.serif, fontStyle:'italic' }}>{tpl.usedTimes}</b> uses · Last: {tpl.lastUsed}
                                                    <span style={{ marginLeft:8 }}><QPill tone="rep" dot>{Math.round(tpl.avgWinRate*100)}% win</QPill></span>
                                                </div>
                                            </div>
                                            <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${selectedTpl?.id===tpl.id ? T.goldInk : T.border}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                                {selectedTpl?.id===tpl.id && <div style={{ width:8, height:8, borderRadius:'50%', background:T.goldInk }}/>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        {mode === 'import' && (
                            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                                <div style={{ padding:20, border:`1.5px dashed ${T.border}`, borderRadius:T.r+2, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:T.inkMuted, minHeight:120, cursor:'pointer' }}
                                    onMouseEnter={e => e.currentTarget.style.background='rgba(200,185,154,0.06)'}
                                    onMouseLeave={e => e.currentTarget.style.background='none'}>
                                    <LIcon name="upload" size={22} color={T.inkMuted}/>
                                    <span style={{ fontSize:13, fontWeight:600, color:T.inkMid }}>Drop file here or click to browse</span>
                                    <span style={{ fontSize:11, color:T.inkMuted }}>PDF · DOCX · .qtpl — max 10 MB</span>
                                </div>
                            </div>
                        )}
                        {mode === 'library' && (
                            <div style={{ fontSize:13, color:T.inkMuted, fontStyle:'italic', padding:'20px 0' }}>
                                Accelerep starter templates coming soon.
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer — name + create */}
                {(mode === 'blank' || (mode === 'duplicate' && selectedTpl) || mode === 'import') && (
                    <div style={{ padding:'14px 20px', borderTop:`1px solid ${T.border}`, display:'flex', gap:14, alignItems:'flex-end' }}>
                        <div style={{ flex:1 }}>
                            <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:4 }}>New template name</label>
                            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Enterprise Q3 push"
                                style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', boxSizing:'border-box' }}/>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, paddingBottom:2 }}>
                            <span style={{ fontSize:12, color:T.inkMid }}>Set as default?</span>
                            <ATToggle on={setAsDefault} onChange={() => setSetAsDefault(v => !v)}/>
                            <span style={{ fontSize:12, color:T.inkMuted }}>{setAsDefault ? 'Yes' : 'No'}</span>
                        </div>
                        <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                            <button onClick={onClose} style={{ padding:'7px 16px', background:T.surface, color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                            <button onClick={() => { if(newName.trim()) onCreate({ name:newName.trim(), mode, sourceTpl:selectedTpl, isDefault:setAsDefault }); }}
                                disabled={!newName.trim()}
                                style={{ padding:'7px 16px', background: newName.trim() ? T.ink : T.borderStrong, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor: newName.trim() ? 'pointer' : 'default', fontFamily:T.sans }}>
                                Create draft →
                            </button>
                        </div>
                    </div>
                )}
                {mode === 'blank' || mode === 'duplicate' || mode === 'import' ? (
                    <div style={{ padding:'0 20px 12px', fontSize:11, color:T.inkMuted }}>Step 1 of 2 — You'll edit content next</div>
                ) : null}
            </div>
        </div>
    );
};

const QuoteTemplatesDetail = ({ settings, setSettings, onBack }) => {
    const savedTemplates  = settings?.quoteTemplates?.length ? settings.quoteTemplates : DEFAULT_QUOTE_TEMPLATES;
    const savedDefaults   = settings?.quoteDefaults || { validity:'30 days', paymentTerms:'Net-30', autoRenew:'60-day notice', currency:'USD', signOff:'DocuSign', issueDate:'Date sent' };
    const savedBoilerplate = settings?.quoteBoilerplate || '"Pricing reflects current list less applicable discounts. Quote valid for 30 days from issue. Auto-renews for like terms unless 60-day written notice…"';

    const [templates,    setTemplates]   = useState(() => JSON.parse(JSON.stringify(savedTemplates)));
    const [defaults,     setDefaults]    = useState({ ...savedDefaults });
    const [boilerplate,  setBoilerplate] = useState(savedBoilerplate);
    const [selectedId,   setSelectedId]  = useState(templates[0]?.id || null);
    const [showNewModal, setShowNewModal] = useState(false);
    const [dirty,        setDirty]       = useState(false);
    const [saving,       setSaving]      = useState(false);
    const [editBoilerplate, setEditBoilerplate] = useState(false);

    const handleCancel = () => { setTemplates(JSON.parse(JSON.stringify(savedTemplates))); setDefaults({ ...savedDefaults }); setBoilerplate(savedBoilerplate); setDirty(false); };
    const handleSave   = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, quoteTemplates:templates, quoteDefaults:defaults, quoteBoilerplate:boilerplate }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body:JSON.stringify({ quoteTemplates:templates, quoteDefaults:defaults, quoteBoilerplate:boilerplate }) }); }
        catch(e) { console.error('save quote templates', e); }
        setSaving(false); setDirty(false);
    };

    const handleCreateTemplate = ({ name, mode, sourceTpl, isDefault }) => {
        const newTpl = {
            id: `tpl_${Date.now()}`, name, desc:'New template — edit to add description.',
            usedTimes:0, lastUsed:'Just created', avgWinRate:0,
        };
        const updated = isDefault
            ? [...templates.map(t => ({ ...t })), newTpl].map((t,i,arr) => ({ ...t, isDefault: t.id === newTpl.id }))
            : [...templates, newTpl];
        setTemplates(updated); setDirty(true); setShowNewModal(false); setSelectedId(newTpl.id);
    };

    const setfd = (k, v) => { setDefaults(p => ({ ...p, [k]:v })); setDirty(true); };
    const sel = (opts, val, onChange) => (
        <select value={val} onChange={e => onChange(e.target.value)}
            style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, cursor:'pointer',
                backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', paddingRight:28, appearance:'none' }}>
            {opts.map(o => <option key={o}>{o}</option>)}
        </select>
    );

    // Brand — read from company profile settings
    const brandColor   = settings?.companyBrandColor   || QT_BRANDING.primary;
    const brandName    = settings?.companyDisplayName   || QT_BRANDING.companyName;

    return (
        <SPDetailPageChrome
            crumb="Quote templates & branding" title="Quote templates & branding"
            subtitle="Header, footer, terms boilerplate, and PDF styling for sent quotes"
            statusDetail={`${templates.length} templates · brand locked`}
            updatedBy="Admin" updatedAt="1 month ago"
            onBack={onBack} dirty={dirty} onCancel={handleCancel}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
        >
            {/* New template modal */}
            {showNewModal && <NewTemplateModal templates={templates} onClose={() => setShowNewModal(false)} onCreate={handleCreateTemplate}/>}

            <div style={{ padding:'0 0 40px' }}>
                {/* Brand strip */}
                <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, padding:'14px 18px', marginBottom:18, display:'grid', gridTemplateColumns:'60px 1fr 1fr 1fr 1fr 120px', gap:18, alignItems:'center' }}>
                    <div style={{ width:48, height:48, background:QT_BRANDING.paper, border:`1.5px solid ${brandColor}`, borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, color:brandColor }}>
                        {QT_BRANDING.logoMark}
                    </div>
                    <div>
                        <div style={{ fontSize:9.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:2, fontFamily:T.sans }}>Company name</div>
                        <div style={{ fontFamily:T.serif, fontStyle:'italic', fontWeight:700, fontSize:16 }}>{brandName}</div>
                    </div>
                    <div>
                        <div style={{ fontSize:9.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:2, fontFamily:T.sans }}>Primary color</div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ width:14, height:14, background:brandColor, borderRadius:2, border:'1px solid rgba(0,0,0,0.1)', flexShrink:0 }}/>
                            <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>{brandColor}</span>
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize:9.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:2, fontFamily:T.sans }}>Display font</div>
                        <div style={{ fontFamily:T.serif, fontStyle:'italic', fontSize:14 }}>Editorial</div>
                    </div>
                    <div>
                        <div style={{ fontSize:9.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:2, fontFamily:T.sans }}>Body font</div>
                        <div style={{ fontSize:13, fontFamily:T.sans }}>Söhne</div>
                    </div>
                    <button style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}
                        onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background=T.surface}>
                        Edit brand
                    </button>
                </div>

                {/* Two-column body */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:20 }}>
                    {/* Left: templates grid */}
                    <CSectionCard
                        title="Templates"
                        description="The set of quote layouts your team can pick from. The default is used unless a rep changes it."
                        headAction={
                            <div style={{ display:'flex', gap:8 }}>
                                <button style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}
                                    onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                    <LIcon name="upload" size={12}/> Import
                                </button>
                                <button onClick={() => { setShowNewModal(true); }}
                                    style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 11px', background:'transparent', border:`1px solid ${T.border}`, color:T.ink, fontSize:12, fontWeight:500, borderRadius:T.r, cursor:'pointer', fontFamily:T.sans }}
                                    onMouseEnter={e => e.currentTarget.style.background=T.surface2}
                                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                    + New template
                                </button>
                            </div>
                        }
                    >
                        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14 }}>
                            {templates.map((t,i) => (
                                <TplLibCard key={t.id} t={t} isDefault={i===0} isSelected={selectedId===t.id} onClick={() => setSelectedId(t.id)}/>
                            ))}
                            {/* New template CTA tile */}
                            <div onClick={() => setShowNewModal(true)}
                                style={{ border:`1.5px dashed ${T.border}`, borderRadius:T.r+2, minHeight:230, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:6, color:T.inkMuted, cursor:'pointer', background:'rgba(255,255,255,0.4)', transition:'border-color 120ms, background 120ms' }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor=T.goldInk; e.currentTarget.style.background='rgba(200,185,154,0.06)'; }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.background='rgba(255,255,255,0.4)'; }}>
                                <span style={{ fontSize:22, color:T.goldInk }}>+</span>
                                <span style={{ fontSize:12, fontWeight:600, color:T.inkMid }}>New template</span>
                                <span style={{ fontSize:10.5, color:T.inkMuted }}>Start blank or duplicate</span>
                            </div>
                        </div>
                    </CSectionCard>

                    {/* Right: defaults + boilerplate */}
                    <div>
                        <CSectionCard title="Defaults" description="Applied to all templates unless overridden.">
                            {[
                                { label:'Issue date',              hint:'When the date stamped on the quote is set', key:'issueDate',     opts:['Date sent','Date created','Manual'] },
                                { label:'Default validity',         hint:null, key:'validity',      opts:['14 days','30 days','45 days','60 days','90 days'] },
                                { label:'Default payment terms',   hint:null, key:'paymentTerms',  opts:['Net-15','Net-30','Net-45','Net-60','Due on receipt'] },
                                { label:'Auto-renew clause',       hint:null, key:'autoRenew',     opts:['None','30-day notice','60-day notice','90-day notice'] },
                                { label:'Currency',                hint:null, key:'currency',      opts:['USD','EUR','GBP','CAD','AUD'] },
                                { label:'Sign-off method',         hint:null, key:'signOff',       opts:['DocuSign','PandaDoc','HelloSign','Manual signature','None'] },
                            ].map((f,i) => (
                                <div key={i} style={{ marginBottom:12 }}>
                                    <label style={{ fontSize:11, fontWeight:600, color:T.inkMid, display:'block', marginBottom:3, fontFamily:T.sans }}>{f.label}</label>
                                    {sel(f.opts, defaults[f.key] || f.opts[0], v => setfd(f.key, v))}
                                    {f.hint && <span style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{f.hint}</span>}
                                </div>
                            ))}
                        </CSectionCard>

                        <CSectionCard title="Boilerplate text" description="Editable per template; this is the fallback.">
                            {editBoilerplate ? (
                                <textarea value={boilerplate} onChange={e => { setBoilerplate(e.target.value); setDirty(true); }} rows={5}
                                    style={{ width:'100%', padding:12, background:T.surface2, borderRadius:T.r, fontSize:11, color:T.inkMid, lineHeight:1.6, fontFamily:T.serif, fontStyle:'italic', border:`1px solid ${T.border}`, outline:'none', resize:'vertical', boxSizing:'border-box' }}/>
                            ) : (
                                <div style={{ position:'relative', padding:12, background:T.surface2, borderRadius:T.r, fontSize:11, color:T.inkMid, lineHeight:1.6, fontFamily:T.serif, fontStyle:'italic', maxHeight:110, overflow:'hidden' }}>
                                    {boilerplate}
                                    <div style={{ position:'absolute', bottom:0, left:0, right:0, height:30, background:`linear-gradient(180deg, transparent 0%, ${T.surface2} 100%)` }}/>
                                </div>
                            )}
                            <button onClick={() => setEditBoilerplate(v => !v)}
                                style={{ marginTop:10, fontSize:11, color:T.goldInk, fontWeight:600, cursor:'pointer', background:'none', border:'none', padding:0, fontFamily:T.sans }}>
                                {editBoilerplate ? 'Done editing' : 'Edit boilerplate →'}
                            </button>
                        </CSectionCard>
                    </div>
                </div>
            </div>
        </SPDetailPageChrome>
    );
};

// ADMIN WORKSPACE VIEW
// ─────────────────────────────────────────────────────────────
const AdminView = ({ settings, setSettings, currentUser, setActiveTab, setAccountsDeepFilter }) => {
    const [scope, setScope] = useState('workspace');
    const [tab,   setTab  ] = useState('All');
    const [search, setSearch] = useState('');
    const [activeItem, setActiveItem] = useState(null); // detail panel state

    // Detail panels that have real content — others just open the card (no-op for now)
    const DETAIL_PANELS = {
        'lead-conv-benchmarks': <LeadConvBenchmarks settings={settings} setSettings={setSettings}/>,
        'company-profile':      'company-profile',
        'fiscal-year':          'fiscal-year',
        'company-calendar':     'company-calendar',
        // Sales process Group 1
        'pipelines':            'pipelines',
        'funnel-stages':        'funnel-stages',
        'kpi-settings':         'kpi-settings',
        // Quoting
        'approval-tiers':       'approval-tiers',
        'quote-templates':      'quote-templates',
        // Sales process Group 2
        'custom-fields':        'custom-fields',
        'pain-points':          'pain-points',
        'customer-types':       'customer-types',
        'industries':           'industries',
    };

    if (activeItem) {
        const id = activeItem.id;
        const onBack = () => setActiveItem(null);

        // Company detail pages — full chrome, no wrapper card
        if (id === 'company-profile')  return <CompanyProfileDetail  settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'fiscal-year')      return <FiscalYearDetail      settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'company-calendar') return <CompanyCalendarDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;

        // Sales process Group 1 detail pages
        if (id === 'pipelines')            return <PipelinesDetail        settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'funnel-stages')        return <FunnelStagesDetail     settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'kpi-settings')         return <KPIThresholdsDetail    settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'lead-conv-benchmarks') return <LeadConversionDetail   settings={settings} setSettings={setSettings} onBack={onBack}/>;

        // Quoting detail pages
        if (id === 'quote-templates') return <QuoteTemplatesDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'approval-tiers')  return <ApprovalTiersDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;

        // Sales process Group 2 detail pages
        if (id === 'custom-fields')   return <CustomFieldsDetail   settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'pain-points')     return <PainPointsDetail     settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'customer-types')  return <CustomerTypesDetail  settings={settings} setSettings={setSettings} onBack={onBack} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter}/>;
        if (id === 'industries')      return <IndustriesDetail     settings={settings} setSettings={setSettings} onBack={onBack} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter}/>;

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
        setActiveTab, setAccountsDeepFilter,
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
                <AdminView settings={settings} setSettings={setSettings} currentUser={currentUser} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter}/>
            ) : (
                <PersonalView settings={settings} setSettings={setSettings} currentUser={currentUser} isAdmin={false}/>
            )}
        </div>
    );
}
