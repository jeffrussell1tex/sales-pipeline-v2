import React, { useState, useMemo, useRef } from 'react';
import { useApp } from '../AppContext';
import { dbFetch } from '../utils/storage';
import DuplicateScanView from './DuplicateScanView';
import ContactDuplicateScanView from './ContactDuplicateScanView';

// Shared settings primitives (extracted to ./settings/shared/)
import { T, eb, CATEGORY_TINT, STATUS_STYLES } from './settings/shared/tokens.js';
import { StatusChip, NewBadge, SettingIcon, Avatar, RToggle, RCheck, Ring, CategoryChip, LIcon, UserAvatar } from './settings/shared/ui.jsx';
import { CField, CInput, CTextarea, CSelect, CSectionCard, DetailPageChrome } from './settings/shared/form.jsx';
// Company detail panels (extracted to ./settings/company/)
import { CompanyProfileDetail } from './settings/company/CompanyProfileDetail.jsx';
import { FiscalYearDetail } from './settings/company/FiscalYearDetail.jsx';
import { CompanyCalendarDetail } from './settings/company/CompanyCalendarDetail.jsx';
// Sales-process shared primitives (extracted to ./settings/salesProcess/)
import { SPDetailPageChrome, SPTable, SPDrag, SPSparkline } from './settings/salesProcess/shared.jsx';
// Sales-process Group 1 detail panels (extracted to ./settings/salesProcess/)
import { PipelinesDetail } from './settings/salesProcess/PipelinesDetail.jsx';
import { FunnelStagesDetail } from './settings/salesProcess/FunnelStagesDetail.jsx';
import { KPIThresholdsDetail } from './settings/salesProcess/KPIThresholdsDetail.jsx';
import { LeadConversionDetail, LeadConvBenchmarks } from './settings/salesProcess/LeadConversionDetail.jsx';
// Sales-process Group 2 detail panels (extracted to ./settings/salesProcess/)
import { CustomFieldsDetail } from './settings/salesProcess/CustomFieldsDetail.jsx';
import { PainPointsDetail } from './settings/salesProcess/PainPointsDetail.jsx';
import { BuyerPersonasDetail } from './settings/salesProcess/BuyerPersonasDetail.jsx';
import { CustomerTypesDetail } from './settings/salesProcess/CustomerTypesDetail.jsx';
import { IndustriesDetail } from './settings/salesProcess/IndustriesDetail.jsx';
import { CompetitorsDetail, ReasonsWonDetail, ReasonsLostDetail } from './settings/salesProcess/FlatListDetail.jsx';
// Quoting shared primitives + Approval tiers (extracted to ./settings/quoting/)
import { QPill, ATToggle } from './settings/quoting/shared.jsx';
import { ApprovalTiersDetail } from './settings/quoting/ApprovalTiersDetail.jsx';
import { QuoteTemplatesDetail } from './settings/quoting/QuoteTemplatesDetail.jsx';
import { PriceBookDetail } from './settings/quoting/PriceBookDetail.jsx';
import { UsersDetail } from './settings/people/UsersDetail.jsx';
import { TeamsDetail } from './settings/people/TeamsDetail.jsx';
import { TerritoriesDetail } from './settings/people/TerritoriesDetail.jsx';
import { RolesDetail } from './settings/people/RolesDetail.jsx';
import { ConnectedAppsDetail } from './settings/integrations/ConnectedAppsDetail.jsx';
import { ApiKeysDetail } from './settings/integrations/ApiKeysDetail.jsx';
import { WebhooksDetail } from './settings/integrations/WebhooksDetail.jsx';
import { AutomationsDetail } from './settings/integrations/AutomationsDetail.jsx';
import { SsoDetail } from './settings/security/SsoDetail.jsx';
import { MfaDetail } from './settings/security/MfaDetail.jsx';
import { SessionDetail } from './settings/security/SessionDetail.jsx';
import { FlsDetail } from './settings/security/FlsDetail.jsx';
import { AuditDetail } from './settings/audit/AuditDetail.jsx';

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
    { id:'buyer-personas',    scope:'workspace', category:'Sales process', name:'Buyer personas',  desc:'Contact persona tags used in the contact form (e.g. Champion, Economic Buyer, End User)', status:'ok', statusDetail:'0 personas', updatedBy:'Admin', updatedAt:'never' },
    { id:'competitors',      scope:'workspace', category:'Sales process', name:'Competitors',     desc:'Competitor names shown in the opportunity form for win/loss tracking', status:'ok', statusDetail:'0 competitors',              updatedBy:'Admin', updatedAt:'never' },
    { id:'reasons-won',      scope:'workspace', category:'Sales process', name:'Reasons won',     desc:'Win reason options shown when a deal is marked Closed Won',    status:'ok',      statusDetail:'0 reasons',                   updatedBy:'Admin', updatedAt:'never' },
    { id:'reasons-lost',     scope:'workspace', category:'Sales process', name:'Reasons lost',    desc:'Loss reason options shown when a deal is marked Closed Lost',  status:'ok',      statusDetail:'0 reasons',                   updatedBy:'Admin', updatedAt:'never' },
    { id:'industries',       scope:'workspace', category:'Sales process', name:'Industries',      desc:'Primary and sub-industry taxonomy',                           status:'ok',      statusDetail:'14 industries · 47 sub-types', updatedBy:'Admin', updatedAt:'4 months ago' },
    // Dispatch — field-service config (shown only when dispatchEnabled)
    { id:'dsp-skills',    scope:'workspace', category:'Dispatch', name:'Skills & certifications', desc:'Skills your techs hold, certs that gate work, and ordered license levels.', status:'ok', statusDetail:'Admin-defined', updatedBy:'Admin', updatedAt:'never', moved:true },
    { id:'dsp-vehicles',  scope:'workspace', category:'Dispatch', name:'Vehicles & equipment',    desc:'Fleet vehicles, tools, and shared assets that techs draw from when assigned.', status:'ok', statusDetail:'Admin-defined', updatedBy:'Admin', updatedAt:'never', moved:true },
    { id:'dsp-crews',     scope:'workspace', category:'Dispatch', name:'Crews',           desc:'Named groups of techs who work together — coverage area, default vehicle, crew lead.', status:'ok', statusDetail:'Admin-defined', updatedBy:'Admin', updatedAt:'never', isNew:true },
    { id:'dsp-techs',     scope:'workspace', category:'Dispatch', name:'Tech profiles',   desc:'Dispatcher view of every user with dispatch enabled: skills, certs, license, vehicle, hours cap.', status:'ok', statusDetail:'Admin-defined', updatedBy:'Admin', updatedAt:'never', isNew:true },
    { id:'dsp-templates', scope:'workspace', category:'Dispatch', name:'Job templates',   desc:'Per Customer Type defaults — crew size, duration, required skills, license, and auto-create rule.', status:'ok', statusDetail:'Admin-defined', updatedBy:'Admin', updatedAt:'never', isNew:true },
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
    { id:'duplicates',       scope:'workspace', category:'Data', name:'Find & merge duplicates',    desc:'Scan accounts for likely duplicates and merge them — fully reversible', status:'ok',      statusDetail:'Scan on demand',              updatedBy:'Admin', updatedAt:'—', isNew:true },
    { id:'contact-duplicates', scope:'workspace', category:'Data', name:'Find & merge duplicate contacts', desc:'Scan contacts for likely duplicates and merge them — fully reversible', status:'ok',      statusDetail:'Scan on demand',              updatedBy:'Admin', updatedAt:'—', isNew:true },
    { id:'backup',           scope:'workspace', category:'Data', name:'Backup & restore',           desc:'Automated daily backups and point-in-time restore',           status:'ok',      statusDetail:'Daily · last: 03:14 UTC',     updatedBy:'System', updatedAt:'4 hours ago' },
    { id:'features',         scope:'workspace', category:'Data', name:'Features & AI',              desc:'Enable app features and AI (deal scoring, writing assist)',   status:'ok',      statusDetail:'14 of 18 on · AI enabled',    updatedBy:'Admin', updatedAt:'1 month ago' },
];

const WORKSPACE_TABS_BASE = ['All', 'Company', 'Sales process', 'Quoting', 'People & Teams', 'Integrations', 'Security', 'Data'];
// Dispatch tab injected at runtime when dispatchEnabled

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
// V2 Card for the workspace admin grid
// ─────────────────────────────────────────────────────────────
const V2Card = ({ item, onOpen, settings, liveCounts = {} }) => {
    const [hov, setHov] = useState(false);

    // ── Live badge enrichment ─────────────────────────────────────────────────
    // Rules: use real data when available; null = show nothing; keep static only
    // when the value is genuinely deterministic from settings (not counts of things
    // we don't track). Never show made-up numbers.
    let statusDetail = item.statusDetail;

    // ── People & Teams — from settings.users / settings.pipelines etc ─────────
    if (item.id === 'users' && settings?.users) {
        const active  = (settings.users||[]).filter(u => u.name && u.active !== false).length;
        const pending = (settings.users||[]).filter(u => u.status === 'Invited').length;
        statusDetail = `${active} user${active!==1?'s':''}${pending > 0 ? ` · ${pending} pending` : ''}`;
    }
    if (item.id === 'teams' && settings?.users) {
        const teamNames = [...new Set((settings.users||[]).filter(u=>u.team).map(u=>u.team))];
        statusDetail = teamNames.length > 0 ? `${teamNames.length} team${teamNames.length!==1?'s':''}` : null;
    }
    if (item.id === 'territories' && settings?.territories) {
        const count = (settings.territories||[]).length;
        statusDetail = count > 0 ? `${count} territor${count!==1?'ies':'y'}` : null;
    }
    if (item.id === 'roles' && settings?.roles) {
        const count = (settings.roles||[]).length;
        statusDetail = count > 0 ? `${count} role${count!==1?'s':''}` : null;
    }

    // ── Sales process ─────────────────────────────────────────────────────────
    if (item.id === 'pipelines' && settings?.pipelines) {
        const count  = (settings.pipelines||[]).length;
        const stages = (settings.pipelines||[]).reduce((a,p) => a + (p.stages?.length||0), 0);
        statusDetail = `${count} pipeline${count!==1?'s':''}${stages > 0 ? ` · ${stages} stages` : ''}`;
    }
    if (item.id === 'funnel-stages' && settings?.funnelStages) {
        const count = (settings.funnelStages||[]).length;
        statusDetail = count > 0 ? `${count} stage${count!==1?'s':''}` : null;
    }
    if (item.id === 'custom-fields' && settings?.customFields) {
        const count = (settings.customFields||[]).length;
        statusDetail = count > 0 ? `${count} custom field${count!==1?'s':''}` : null;
    }

    if (item.id === 'competitors') {
        const count = (settings?.competitors || []).length;
        statusDetail = `${count} competitor${count !== 1 ? 's' : ''}`;
    }
    if (item.id === 'reasons-won') {
        const count = (settings?.reasonsWon || []).length;
        statusDetail = `${count} reason${count !== 1 ? 's' : ''}`;
    }
    if (item.id === 'reasons-lost') {
        const count = (settings?.reasonsLost || []).length;
        statusDetail = `${count} reason${count !== 1 ? 's' : ''}`;
    }

    // ── Quoting ───────────────────────────────────────────────────────────────
    if (item.id === 'approval-tiers' && settings?.approvalTiers) {
        const count = (settings.approvalTiers||[]).length;
        statusDetail = count > 0 ? `${count} tier${count!==1?'s':''}` : null;
    }
    if (item.id === 'quote-templates' && settings?.quoteTemplates) {
        const count = (settings.quoteTemplates||[]).length;
        statusDetail = count > 0 ? `${count} template${count!==1?'s':''}` : null;
    }

    // ── Features & AI — count from featureFlags in settings ─────────────────
    if (item.id === 'features' && settings?.featureFlags) {
        const flags = settings.featureFlags || {};
        const on  = Object.values(flags).filter(Boolean).length;
        const tot = Object.keys(flags).length;
        statusDetail = tot > 0 ? `${on} of ${tot} on` : null;
    }

    // ── Security — only show what we actually know ────────────────────────────
    if (item.id === 'sso')     statusDetail = null; // no SSO config tracked yet
    if (item.id === 'mfa')     statusDetail = null; // no per-user MFA enrollment in DB
    if (item.id === 'session') statusDetail = null; // policy stored but no meaningful summary

    // ── Integrations — from liveCounts fetched on mount ──────────────────────
    if (item.id === 'api-keys') {
        if (liveCounts.apiKeysTotal !== undefined) {
            const a = liveCounts.apiKeysActive;
            statusDetail = a > 0 ? `${a} active key${a!==1?'s':''}` : 'No active keys';
        } else statusDetail = null;
    }
    if (item.id === 'webhooks') {
        if (liveCounts.webhooksTotal !== undefined) {
            const t = liveCounts.webhooksTotal;
            const f = liveCounts.webhooksFailing || 0;
            if (t === 0) statusDetail = 'No endpoints';
            else statusDetail = `${t} endpoint${t!==1?'s':''}${f > 0 ? ` · ${f} failing` : ''}`;
        } else statusDetail = null;
    }
    if (item.id === 'automations') {
        if (liveCounts.autosTotal !== undefined) {
            const a = liveCounts.autosActive;
            const t = liveCounts.autosTotal;
            if (t === 0) statusDetail = 'No rules yet';
            else statusDetail = `${a} active · ${t - a} paused`;
        } else statusDetail = null;
    }

    // ── Security — audit log real event count ─────────────────────────────────
    if (item.id === 'audit-log') {
        statusDetail = liveCounts.auditEvents !== undefined
            ? `${liveCounts.auditEvents} event${liveCounts.auditEvents!==1?'s':''} · last 30d`
            : null;
    }

    // ── Data — backup ─────────────────────────────────────────────────────────
    if (item.id === 'backup') {
        if (liveCounts.backupLastLabel) {
            statusDetail = `${liveCounts.backupFreq} · last: ${liveCounts.backupLastLabel}`;
        } else statusDetail = null;
    }

    // ── Data — import/export: no tracking table, show nothing rather than fake ─
    if (item.id === 'import') statusDetail = null;
    if (item.id === 'export') statusDetail = null;

    // ── Personal cards — no real per-user data available ─────────────────────
    if (item.id === 'my-calendar')      statusDetail = null;
    if (item.id === 'my-notifications') statusDetail = null;
    if (item.id === 'my-signature')     statusDetail = null;
    if (item.id === 'my-api')           statusDetail = null;

    // ── Company calendar ─────────────────────────────────────────────────────
    if (item.id === 'company-calendar' && settings?.holidays) {
        const count = (settings.holidays||[]).length;
        statusDetail = count > 0 ? `${count} holiday${count!==1?'s':''} · ${new Date().getFullYear()}` : null;
    }

    // ── Connected apps — no real connection tracking ──────────────────────────
    if (item.id === 'apps') statusDetail = null;
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

// SETTINGS → DATA — data fixtures + primitives + four detail pages + four modals
// ─────────────────────────────────────────────────────────────────────────────

// ── Fixtures ──────────────────────────────────────────────────

const DATA_IMPORT = {
    lastRun: { ts:'3 days ago', rows:812, errors:14, by:'morgan@accelerep.com', object:'Accounts' },
    history: [
        { id:'imp-014', ts:'3 days ago',  object:'Accounts',      rows:812,  errors:14, status:'partial',   by:'morgan@accelerep.com' },
        { id:'imp-013', ts:'1 week ago',  object:'Contacts',      rows:2410, errors:0,  status:'success',   by:'morgan@accelerep.com' },
        { id:'imp-012', ts:'2 weeks ago', object:'Leads',         rows:1680, errors:3,  status:'partial',   by:'jeff@accelerep.com'   },
        { id:'imp-011', ts:'3 weeks ago', object:'Opportunities', rows:248,  errors:0,  status:'success',   by:'morgan@accelerep.com' },
        { id:'imp-010', ts:'1 month ago', object:'Accounts',      rows:412,  errors:0,  status:'success',   by:'morgan@accelerep.com' },
    ],
    wizard: {
        step:'map',
        file:{ name:'salesforce-accounts-2026-q1.csv', size:'4.2 MB', rows:812, encoding:'UTF-8' },
        columns:[
            { csv:'Account Name',  target:'name',          type:'text',     sample:'Acme Corp',          confidence:0.99, required:true  },
            { csv:'Domain',        target:'domain',        type:'url',      sample:'acme.com',           confidence:0.97, required:true  },
            { csv:'Annual Revenue',target:'annualRevenue', type:'currency', sample:'$12,400,000',        confidence:0.94 },
            { csv:'Employees',     target:'employeeCount', type:'number',   sample:'320',                confidence:0.99 },
            { csv:'Industry',      target:'industry',      type:'enum',     sample:'Manufacturing',      confidence:0.91 },
            { csv:'Tier',          target:'customerTier',  type:'enum',     sample:'Enterprise',         confidence:0.84 },
            { csv:'Owner Email',   target:'ownerEmail',    type:'email',    sample:'morgan@accelerep…',  confidence:0.99 },
            { csv:'Created (UTC)', target:'createdAt',     type:'datetime', sample:'2024-04-12T10:14Z',  confidence:0.96 },
            { csv:'Notes',         target:'__skip__',      type:'text',     sample:'pricing call w/ CTO',confidence:0.42 },
            { csv:'Salesforce ID', target:'externalId',    type:'text',     sample:'0014x000abcd1234',   confidence:0.88 },
        ],
        dedupe:{ match:'domain', onMatch:'update', skipBlanks:true },
        preview:{ willCreate:612, willUpdate:186, willSkip:14, errors:[
            { row:47,  field:'domain',        msg:'Invalid format: "n/a"' },
            { row:112, field:'annualRevenue', msg:'Could not parse "TBD"' },
            { row:304, field:'industry',      msg:'"Crypto" not in industry taxonomy' },
        ]},
    },
};

// DATA_EXPORT removed — ExportDetail fetches live data from /.netlify/functions/
// DATA_BACKUP removed — BackupDetail loads live data from /.netlify/functions/backup

// Feature flag master list — source of truth for the UI.
// 'live' = wired to real functionality. 'coming-soon' = stored but UI-gated.
// Default 'on' value is the initial state written to DB on first toggle.
const FLAG_DEFS = [
    { id:'deal-scoring',      name:'Deal scoring',           desc:'Health score (0–100) on every opportunity based on activity, stage age, and close date.',   beta:false, new:false, live:true  },
    { id:'account-health-scores', name:'Account health scores', desc:'Aggregate health score per account rolled up from open opportunities.',                  beta:false, new:false, live:true  },
    { id:'territory-rules',   name:'Territory rules engine', desc:'Auto-assign accounts and opportunities to territories on create/update.',                    beta:false, new:false, live:true  },
    { id:'commit-categories', name:'Commit categories',      desc:'Pipeline / Best Case / Commit / Omit forecast buckets on every opportunity.',               beta:false, new:false, live:true  },
    { id:'writing-assist',    name:'Writing assist',         desc:'AI-assisted text drafting in notes, emails, and descriptions.',                             beta:true,  new:false, live:false },
    { id:'duplicate-merge',   name:'Smart duplicate merge',  desc:'Fuzzy match on account/contact create with merge UI to resolve conflicts.',                 beta:true,  new:false, live:false },
    { id:'meeting-summaries', name:'Meeting summaries',      desc:'Auto-summarize Zoom/Teams calls and post to the related record.',                           beta:true,  new:false, live:false },
    { id:'sentiment',         name:'Email sentiment',        desc:'Score reply sentiment on incoming email threads.',                                           beta:true,  new:true,  live:false },
    { id:'forecast-roll',     name:'Forecast rollup',        desc:'Hierarchical forecast with manager overrides and commit/best-case roll-up.',                beta:false, new:false, live:false },
    { id:'lead-routing',      name:'Lead routing',           desc:'Round-robin and skill-based lead distribution rules.',                                       beta:false, new:false, live:false },
    { id:'mobile-offline',    name:'Mobile offline mode',    desc:'Cache and sync recent records on iOS/Android when offline.',                                beta:false, new:false, live:false },
    { id:'mobile-voice',      name:'Mobile voice notes',     desc:'Dictate notes on the go with auto-transcription.',                                          beta:false, new:true,  live:false },
    { id:'quote-redlines',    name:'Quote redlines',         desc:'Track legal redline rounds on quote PDFs.',                                                  beta:false, new:false, live:false },
    { id:'esign-bulk',        name:'Bulk e-sign',            desc:'Send the same agreement to many counterparties at once.',                                   beta:false, new:false, live:false },
    { id:'public-api-v2',     name:'Public API v2',          desc:'New REST + webhooks; v1 deprecation in 90 days.',                                           beta:true,  new:false, live:false },
    { id:'graphql',           name:'GraphQL endpoint',       desc:'Read-only GraphQL on top of the v2 API.',                                                   beta:true,  new:false, live:false },
    { id:'audit-streaming',   name:'Audit log streaming',    desc:'Push audit events to Splunk / Datadog / S3.',                                               beta:false, new:false, live:false },
    { id:'workflows-loops',   name:'Workflow loops',         desc:'For-each automation steps over record collections.',                                         beta:true,  new:false, live:false },
];

// DATA_AI removed — FeaturesDetail reads aiSettings from live settings

// ── Shared primitives ─────────────────────────────────────────

// Step rail for the import wizard
const DataStepRail = ({ step }) => {
    const steps = [
        { id:'upload',  label:'Upload' },
        { id:'map',     label:'Map columns' },
        { id:'dedupe',  label:'Dedupe' },
        { id:'preview', label:'Preview' },
        { id:'done',    label:'Run' },
    ];
    const idx = steps.findIndex(s => s.id === step);
    return (
        <div style={{ display:'flex', alignItems:'center', background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'10px 16px', marginBottom:16, gap:0 }}>
            {steps.map((s,i) => {
                const done = i < idx; const active = i === idx;
                return (
                    <React.Fragment key={s.id}>
                        <span style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, fontWeight: active ? 700 : 500, color: active ? T.ink : done ? T.ok : T.inkMuted }}>
                            <span style={{ width:18, height:18, borderRadius:'50%', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700,
                                background: done ? T.ok : active ? T.goldInk : 'transparent',
                                color: (done||active) ? '#fbf8f3' : T.inkMuted,
                                border: (!done && !active) ? `1px solid ${T.border}` : 'none' }}>
                                {done ? '✓' : i+1}
                            </span>
                            {s.label}
                        </span>
                        {i < steps.length-1 && <span style={{ width:32, height:1, background:T.border, margin:'0 10px', flexShrink:0 }}/>}
                    </React.Fragment>
                );
            })}
        </div>
    );
};

// Stat card with serif italic numerals
const DataStatCard = ({ label, value, mono, warn }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:14 }}>
        <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase', marginBottom:6, fontFamily:T.sans }}>{label}</div>
        <div style={{ fontFamily: mono ? 'ui-monospace,Menlo,monospace' : T.serif, fontStyle: mono ? 'normal' : 'italic', fontWeight:700, fontSize: mono ? 18 : 26, color: warn ? T.warn : T.ink }}>{value}</div>
    </div>
);

// Feature flag row
const DataFlagRow = ({ f, last }) => {
    const [on, setOn] = useState(f.on);
    return (
        <div style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom: last ? 'none' : `1px solid ${T.border}` }}>
            <span onClick={()=>setOn(v=>!v)}
                style={{ width:30, height:18, borderRadius:9, background: on ? T.ok : T.border, position:'relative', flexShrink:0, cursor:'pointer', display:'inline-block' }}>
                <span style={{ position:'absolute', top:2, left: on ? 14 : 2, width:14, height:14, borderRadius:'50%', background:'#fbf8f3', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 100ms' }}/>
            </span>
            <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans, display:'flex', alignItems:'center', gap:6 }}>
                    {f.name}
                    {f.beta && <span style={{ padding:'1px 6px', borderRadius:10, background:'rgba(58,90,122,0.10)', color:T.info, fontSize:10.5, fontWeight:700 }}>Beta</span>}
                    {f.new  && <span style={{ padding:'1px 6px', borderRadius:10, background:'rgba(184,115,51,0.10)', color:T.warn, fontSize:10.5, fontWeight:700 }}>New</span>}
                </div>
                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>{f.desc}</div>
            </div>
            <div style={{ fontSize:11.5, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace', textAlign:'right', minWidth:160 }}>{f.scope}</div>
        </div>
    );
};

// Data section card (reuses same visual as SecCard but no dependency)
const DataCard = ({ title, desc, headAction, children }) => (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:20, marginBottom:16, fontFamily:T.sans }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
            <div>
                <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>{title}</div>
                {desc && <div style={{ fontSize:12.5, color:T.inkMid, marginTop:3 }}>{desc}</div>}
            </div>
            {headAction}
        </div>
        {children}
    </div>
);

// Table header row
const DTableHead = ({ cols }) => (
    <tr style={{ background:T.surface2, borderBottom:`1px solid ${T.border}` }}>
        {cols.map((h,i) => <th key={i} style={{ textAlign:'left', padding:'9px 12px', fontSize:10, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', color:T.inkMuted, fontFamily:T.sans }}>{h}</th>)}
    </tr>
);

// QPill equivalent for Data pages
const DPill = ({ tone='neutral', children }) => {
    const m = {
        ok:      { bg:'rgba(77,107,61,0.12)',   fg:T.ok      },
        warn:    { bg:'rgba(184,115,51,0.12)',  fg:T.warn    },
        danger:  { bg:'rgba(156,58,46,0.12)',   fg:T.danger  },
        info:    { bg:'rgba(58,90,122,0.10)',   fg:T.info    },
        neutral: { bg:'rgba(138,131,120,0.12)', fg:T.inkMid  },
    };
    const c = m[tone]||m.neutral;
    return <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:10, fontSize:11, fontWeight:700, background:c.bg, color:c.fg, fontFamily:T.sans, whiteSpace:'nowrap' }}>{children}</span>;
};

// Data page crumb
const DataCrumb = ({ page, onBack }) => (
    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:T.inkMuted, marginBottom:10, fontFamily:T.sans }}>
        <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Settings</button>
        <span>/</span>
        <button onClick={onBack} style={{ background:'none', border:'none', color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans, padding:0, fontSize:12 }}>Data</button>
        <span>/</span>
        <span style={{ color:T.ink, fontWeight:600 }}>{page}</span>
    </div>
);

// Data title band
const DataTitle = ({ title, sub, badge, updatedBy, updatedAt, actions, dirty }) => (
    <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', paddingBottom:16, borderBottom:`1px solid ${T.border}`, marginBottom:20, fontFamily:T.sans }}>
        <div style={{ borderLeft:`3px solid ${T.goldInk}`, paddingLeft:10 }}>
            <div style={{ fontSize:22, fontWeight:700, color:T.ink, letterSpacing:-0.3 }}>
                {title}{dirty && <span style={{ fontSize:12, fontWeight:500, color:T.warn, marginLeft:12 }}>● Unsaved</span>}
            </div>
            <div style={{ fontSize:13, color:T.inkMid, marginTop:3, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                <span>{sub}</span>
                {badge && <><span style={{ color:T.inkMuted }}>•</span><span style={{ color:T.ok, fontWeight:600 }}>✓ {badge}</span></>}
                {updatedBy && <><span style={{ color:T.inkMuted }}>•</span><span style={{ fontSize:11.5, color:T.inkMuted }}>Last: {updatedAt} by <b style={{ color:T.inkMid, fontWeight:500 }}>{updatedBy}</b></span></>}
            </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>{actions}</div>
    </div>
);

const DataBtn = ({ label, primary, danger:isDanger, onClick, disabled }) => (
    <button onClick={onClick} disabled={disabled}
        style={{ padding:'7px 14px', fontFamily:T.sans, fontSize:12.5, fontWeight:600, cursor:disabled?'default':'pointer', borderRadius:T.r, whiteSpace:'nowrap',
            background: isDanger ? T.danger : primary ? T.ink : T.surface,
            color: (isDanger||primary) ? '#fbf8f3' : T.ink,
            border: (isDanger||primary) ? 'none' : `1px solid ${T.borderStrong}`,
            opacity: disabled ? 0.6 : 1, transition:'opacity 100ms' }}>
        {label}
    </button>
);

// ── MODALS ────────────────────────────────────────────────────

// Shared modal shell (re-uses same pattern as IntModal from Integrations)
const DataModal = ({ width=640, onClose, children }) => (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.45)', zIndex:700, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:T.sans }}>
        <div onClick={e=>e.stopPropagation()} style={{ background:T.surface, borderRadius:8, width, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 56px rgba(20,16,12,0.28)' }}>
            {children}
        </div>
    </div>
);
const DataModalHead = ({ title, sub, onClose }) => (
    <div style={{ padding:'18px 22px 14px', borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
            <div>
                <div style={{ fontSize:16, fontWeight:700, color:T.ink }}>{title}</div>
                {sub && <div style={{ fontSize:12.5, color:T.inkMuted, marginTop:2 }}>{sub}</div>}
            </div>
            <button onClick={onClose} style={{ background:'none', border:'none', color:T.inkMuted, fontSize:20, cursor:'pointer', lineHeight:1, padding:'2px 4px' }}>×</button>
        </div>
    </div>
);
const DataModalFoot = ({ children }) => (
    <div style={{ padding:'12px 22px', borderTop:`1px solid ${T.border}`, background:T.surface2, display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>{children}</div>
);

// 1. New import modal
const NewImportModal = ({ onClose }) => (
    <DataModal onClose={onClose}>
        <DataModalHead title="New import" sub="Step 1 of 5 — upload a CSV." onClose={onClose}/>
        <div style={{ flex:1, overflowY:'auto', padding:22 }}>
            <div style={{ marginBottom:12 }}>
                <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Object</label>
                <select style={{ width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, appearance:'none', cursor:'pointer' }}>
                    <option>Accounts</option><option>Contacts</option><option>Leads</option><option>Opportunities</option>
                </select>
            </div>
            <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:8, fontFamily:T.sans }}>File</div>
            <div style={{ border:`2px dashed ${T.borderStrong}`, borderRadius:4, padding:'32px 20px', textAlign:'center', background:T.surface2, cursor:'pointer', marginBottom:14 }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=T.goldInk}
                onMouseLeave={e=>e.currentTarget.style.borderColor=T.borderStrong}>
                <div style={{ fontSize:28, color:T.inkMuted, marginBottom:8 }}>↑</div>
                <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>Drop CSV here, or <span style={{ color:T.goldInk, textDecoration:'underline' }}>browse</span></div>
                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:6 }}>UTF-8 · max 100 MB · max 250,000 rows</div>
            </div>
            <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:8, fontFamily:T.sans }}>Or start from a saved mapping</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {['Salesforce → Accounts','HubSpot → Contacts','Outreach → Leads','Apollo → Contacts'].map(p => (
                    <span key={p} style={{ padding:'5px 10px', borderRadius:3, background:T.surface2, border:`1px solid ${T.border}`, fontSize:11.5, cursor:'pointer', fontFamily:T.sans }}
                        onMouseEnter={e=>e.currentTarget.style.borderColor=T.goldInk}
                        onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}>{p}</span>
                ))}
            </div>
        </div>
        <DataModalFoot>
            <DataBtn label="Cancel" onClick={onClose}/>
            <DataBtn label="Continue → Map columns" primary onClick={onClose}/>
        </DataModalFoot>
    </DataModal>
);

// 2. New scheduled export modal
const NewExportModal = ({ onClose, onSave, existing }) => {
    const selStyle = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, appearance:'none', cursor:'pointer' };
    const inpStyle = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' };
    const FL = ({ label, children }) => (<div><label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>{label}</label>{children}</div>);
    const nameRef  = React.useRef(null);
    const [scope,  setScope]  = React.useState(existing?.scope       || 'accounts');
    const [fmt,    setFmt]    = React.useState(existing?.format      || 'CSV');
    const [cadence,setCadence]= React.useState(existing?.cadence     || 'Weekly · Mondays 06:00 UTC');
    const [dest,   setDest]   = React.useState(existing?.destination || 'download');
    const [saving, setSaving] = React.useState(false);

    const handleSave = async () => {
        const name = nameRef.current?.value?.trim();
        if (!name) return;
        setSaving(true);
        await onSave({ id: existing?.id || null, name, scope, format:fmt, cadence, destination:dest, enabled:true, status:'ok' });
        setSaving(false);
    };

    return (
        <DataModal onClose={onClose}>
            <DataModalHead title={existing ? 'Edit scheduled export' : 'New scheduled export'} sub="Define a recurring export. Manual trigger available immediately." onClose={onClose}/>
            <div style={{ flex:1, overflowY:'auto', padding:22 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                    <FL label="Name"><input ref={nameRef} defaultValue={existing?.name || ''} placeholder="e.g. Weekly accounts" style={inpStyle}/></FL>
                    <FL label="Entity (scope)">
                        <select value={scope} onChange={e => setScope(e.target.value)} style={selStyle}>
                            {['accounts','contacts','opportunities','tasks','activities','leads'].map(s => (
                                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                        </select>
                    </FL>
                    <FL label="Format">
                        <select value={fmt} onChange={e => setFmt(e.target.value)} style={selStyle}>
                            <option>CSV</option><option>JSON</option>
                        </select>
                    </FL>
                    <FL label="Cadence">
                        <select value={cadence} onChange={e => setCadence(e.target.value)} style={selStyle}>
                            <option>Daily · 02:00 UTC</option>
                            <option>Weekly · Mondays 06:00 UTC</option>
                            <option>Weekly · Fridays 22:00 UTC</option>
                            <option>Monthly · 1st 00:00 UTC</option>
                            <option>Quarterly · 1st 00:00 UTC</option>
                            <option>On request</option>
                        </select>
                    </FL>
                    <FL label="Destination" style={{ gridColumn:'span 2' }}>
                        <select value={dest} onChange={e => setDest(e.target.value)} style={selStyle}>
                            <option value="download">Browser download (manual trigger)</option>
                            <option value="email">Email</option>
                            <option value="webhook">Webhook</option>
                        </select>
                    </FL>
                </div>
                <div style={{ marginTop:12, padding:'10px 12px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:3, fontSize:12, color:T.inkMid }}>
                    <b style={{ color:T.info }}>Note:</b> Automated delivery (S3, SFTP, Snowflake) is on the roadmap. Schedules created today can be triggered manually from the export page.
                </div>
            </div>
            <DataModalFoot>
                <DataBtn label="Cancel" onClick={onClose}/>
                <DataBtn label={saving ? 'Saving…' : (existing ? 'Save changes' : 'Create schedule')} primary disabled={saving} onClick={handleSave}/>
            </DataModalFoot>
        </DataModal>
    );
};

// 2b. Import from backup file modal
// Lets the user upload a JSON backup file exported from any org and restore
// its entities into the current org. Safe to run on a fresh empty org.
const ImportBackupModal = ({ onClose, onSuccess }) => {
    const [file,      setFile]      = useState(null);
    const [parsed,    setParsed]    = useState(null);
    const [parseErr,  setParseErr]  = useState('');
    const [loading,   setLoading]   = useState(false);
    const [result,    setResult]    = useState(null);
    const [error,     setError]     = useState('');
    const fileRef = useRef();

    const handleFile = e => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        setParsed(null);
        setParseErr('');
        setResult(null);
        setError('');
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const data = JSON.parse(ev.target.result);
                if (!data.entities || typeof data.entities !== 'object') {
                    setParseErr('This file does not look like an Accelerep backup (missing "entities" key).');
                    return;
                }
                setParsed(data);
            } catch {
                setParseErr('Could not parse file — make sure it is a valid JSON backup.');
            }
        };
        reader.readAsText(f);
    };

    const handleImport = async () => {
        if (!parsed) return;
        setLoading(true);
        setError('');
        try {
            const res = await dbFetch('/.netlify/functions/backup', {
                method: 'PATCH',
                body: JSON.stringify(parsed),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Import failed');
            setResult(data);
            onSuccess && onSuccess(data);
        } catch (e) {
            setError(e.message || 'Import failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Summary counts from the parsed file
    const counts = parsed ? Object.entries(parsed.entities)
        .filter(([, v]) => Array.isArray(v) && v.length > 0)
        .map(([k, v]) => `${v.length} ${k}`)
        : [];

    return (
        <DataModal width={520} onClose={onClose}>
            <DataModalHead onClose={onClose}
                title="Import from backup file"
                sub="Upload a JSON backup to restore data into this workspace."/>
            <div style={{ flex:1, overflowY:'auto', padding:22 }}>

                {/* File picker */}
                {!result && (
                    <>
                        <div
                            onClick={() => fileRef.current?.click()}
                            style={{
                                border: `2px dashed ${file && !parseErr ? T.ok : T.border}`,
                                borderRadius: T.r, padding: '24px 16px', textAlign: 'center',
                                cursor: 'pointer', marginBottom: 14, background: T.surface2,
                                transition: 'border-color 150ms',
                            }}>
                            <LIcon name="upload" size={22} color={T.inkMuted}/>
                            <div style={{ fontSize:13, fontWeight:600, color:T.ink, marginTop:8 }}>
                                {file ? file.name : 'Click to choose a backup file'}
                            </div>
                            <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:4 }}>
                                {file ? `${(file.size / 1024).toFixed(1)} KB` : 'JSON files only · exported from Accelerep'}
                            </div>
                            <input ref={fileRef} type="file" accept=".json,application/json"
                                style={{ display:'none' }} onChange={handleFile}/>
                        </div>

                        {parseErr && (
                            <div style={{ fontSize:12.5, color:T.danger, fontWeight:600, marginBottom:12 }}>
                                ✕ {parseErr}
                            </div>
                        )}

                        {/* Preview what will be imported */}
                        {parsed && counts.length > 0 && (
                            <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'12px 14px', marginBottom:14, fontSize:12 }}>
                                <div style={{ fontWeight:700, color:T.ink, marginBottom:8 }}>File contents</div>
                                {counts.map(c => (
                                    <div key={c} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                                        <span style={{ color:T.inkMid }}>{c.split(' ').slice(1).join(' ')}</span>
                                        <span style={{ fontWeight:600, color:T.ink }}>{c.split(' ')[0]}</span>
                                    </div>
                                ))}
                                {parsed.exportedAt && (
                                    <div style={{ marginTop:8, paddingTop:8, borderTop:`1px solid ${T.border}`, color:T.inkMuted, fontSize:11 }}>
                                        Exported {new Date(parsed.exportedAt).toLocaleString()}
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ padding:'10px 12px', background:'rgba(58,90,122,0.08)', borderLeft:`3px solid ${T.info}`, borderRadius:3, marginBottom:14, fontSize:12, color:T.inkMid }}>
                            <b style={{ color:T.info }}>Safe to run on empty orgs.</b> Existing records with matching IDs will be updated. Records not in the file are left untouched.
                        </div>

                        {error && (
                            <div style={{ fontSize:12.5, color:T.danger, fontWeight:600, marginBottom:8 }}>
                                ✕ {error}
                            </div>
                        )}
                    </>
                )}

                {/* Success state */}
                {result && (
                    <div style={{ textAlign:'center', padding:'16px 0' }}>
                        <div style={{ fontSize:32, marginBottom:12 }}>✓</div>
                        <div style={{ fontSize:15, fontWeight:700, color:T.ok, marginBottom:6 }}>
                            Import complete
                        </div>
                        <div style={{ fontSize:13, color:T.inkMid }}>
                            {result.imported.toLocaleString()} records restored into this workspace.
                        </div>
                        {result.errors?.length > 0 && (
                            <div style={{ marginTop:12, fontSize:12, color:T.warn }}>
                                Some entities had errors: {result.errors.join(', ')}
                            </div>
                        )}
                    </div>
                )}
            </div>
            <DataModalFoot>
                <DataBtn label={result ? 'Close' : 'Cancel'} onClick={onClose}/>
                {!result && (
                    <DataBtn
                        label={loading ? 'Importing…' : 'Import records'}
                        primary
                        disabled={!parsed || !!parseErr || loading}
                        onClick={handleImport}/>
                )}
            </DataModalFoot>
        </DataModal>
    );
};


// Downloads the stored JSON payload so the admin has the data file.
// A destructive server-side overwrite is intentionally not supported —
// the safe flow is: download JSON → verify → reimport via Settings → Import.
const RestoreModal = ({ snap, onClose }) => {
    const [confirm, setConfirm] = useState('');
    const [notify, setNotify]   = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');
    const ready = confirm.trim().toUpperCase() === 'RESTORE';

    const handleDownload = async () => {
        if (!ready) return;
        setLoading(true);
        setError('');
        try {
            const dlRes = await dbFetch(
                `/.netlify/functions/backup?id=${encodeURIComponent(snap.id)}&download=1`
            );
            if (!dlRes.ok) throw new Error('Server error');
            const text = await dlRes.text();
            const blob = new Blob([text], { type: 'application/json' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = `${snap.id}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            onClose();
        } catch (e) {
            setError('Download failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <DataModal width={540} onClose={onClose}>
            <DataModalHead onClose={onClose}
                title={<span style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ width:32, height:32, borderRadius:4, background:'rgba(156,58,46,0.12)', color:T.danger, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, flexShrink:0 }}>⚠</span>
                    Restore from snapshot?
                </span>}
                sub={`Download the complete data export from ${snap?.ts || 'this snapshot'}.`}/>
            <div style={{ flex:1, overflowY:'auto', padding:22 }}>
                <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'12px 14px', marginBottom:14, fontSize:12 }}>
                    {[
                        { label:'Snapshot',        value: snap?.id || '—',                                         mono:true  },
                        { label:'Records',         value: snap?.recordCount != null ? snap.recordCount.toLocaleString() : '—', bold:true },
                        { label:'Size',            value: snap?.sizeLabel || '—'                                              },
                        { label:'Download format', value: 'JSON · all entities',                                   color:T.ok },
                    ].map((r,i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: i<3?5:0 }}>
                            <span style={{ color:T.inkMid }}>{r.label}</span>
                            <span style={{ fontFamily:r.mono?'ui-monospace,Menlo,monospace':'inherit', fontWeight:r.bold?600:500, color:r.color||T.ink }}>{r.value}</span>
                        </div>
                    ))}
                </div>
                <div style={{ padding:'10px 12px', background:'rgba(58,90,122,0.08)', borderLeft:`3px solid ${T.info}`, borderRadius:3, marginBottom:14, fontSize:12, color:T.inkMid }}>
                    <b style={{ color:T.info }}>How restore works:</b> This downloads the full snapshot as a JSON file. To reimport records use Settings → Data → Import after reviewing the file.
                </div>
                <div style={{ marginBottom:12 }}>
                    <label style={{ display:'block', fontSize:12, fontWeight:600, color:T.inkMid, marginBottom:6 }}>
                        Type <b style={{ fontFamily:'ui-monospace,Menlo,monospace', color:T.ink }}>RESTORE</b> to confirm download
                    </label>
                    <input value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="RESTORE"
                        style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${ready?T.danger:T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' }}/>
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, cursor:'pointer' }} onClick={()=>setNotify(v=>!v)}>
                    <span style={{ width:14, height:14, border:`1.5px solid ${notify?T.ok:T.border}`, borderRadius:2, background:notify?T.ok:'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {notify && <span style={{ color:'#fff', fontSize:9 }}>✓</span>}
                    </span>
                    Notify workspace admins after download
                </label>
                {error && <div style={{ marginTop:10, fontSize:12, color:T.danger, fontWeight:600 }}>{error}</div>}
            </div>
            <DataModalFoot>
                <DataBtn label="Cancel" onClick={onClose}/>
                <DataBtn label={loading ? 'Downloading…' : 'Download snapshot'} danger disabled={!ready || loading} onClick={handleDownload}/>
            </DataModalFoot>
        </DataModal>
    );
};

// 4. Reset AI training data modal (type-to-confirm RESET)
const ResetAiModal = ({ onClose }) => {
    const [confirm, setConfirm] = useState('');
    const [notify, setNotify]   = useState(true);
    const ready = confirm.trim().toUpperCase() === 'RESET';
    return (
        <DataModal width={540} onClose={onClose}>
            <DataModalHead onClose={onClose}
                title={<span style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ width:32, height:32, borderRadius:4, background:'rgba(156,58,46,0.12)', color:T.danger, display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, flexShrink:0 }}>⚠</span>
                    Reset AI training data?
                </span>}
                sub="Permanently delete this workspace's prompts and outputs from the AI provider."/>
            <div style={{ flex:1, overflowY:'auto', padding:22 }}>
                <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:4, padding:'12px 14px', marginBottom:14, fontSize:12 }}>
                    {[
                        { label:'Workspace',       value:'accelerep · acme', mono:true },
                        { label:'Records to purge',value:'~84,200 prompts / outputs', bold:true },
                        { label:'Provider',        value:'Anthropic · Claude Sonnet 4.5', mono:true },
                        { label:'SLA',             value:'Up to 30 days to propagate' },
                    ].map((r,i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: i<3?5:0 }}>
                            <span style={{ color:T.inkMid }}>{r.label}</span>
                            <span style={{ fontFamily:r.mono?'ui-monospace,Menlo,monospace':'inherit', fontWeight:r.bold?600:400, color:T.ink }}>{r.value}</span>
                        </div>
                    ))}
                </div>
                <div style={{ padding:'10px 12px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:3, marginBottom:14, fontSize:12 }}>
                    <span style={{ fontWeight:700, color:T.danger }}>This cannot be undone.</span>
                    <span style={{ color:T.inkMid }}> Past AI suggestions referenced from records will continue to display, but the underlying training corpus will be erased.</span>
                </div>
                <div style={{ marginBottom:12 }}>
                    <label style={{ display:'block', fontSize:12, fontWeight:600, color:T.inkMid, marginBottom:6 }}>
                        Type <b style={{ fontFamily:'ui-monospace,Menlo,monospace', color:T.ink }}>RESET</b> to confirm
                    </label>
                    <input value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="RESET"
                        style={{ width:'100%', padding:'8px 10px', border:`1.5px solid ${ready?T.danger:T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' }}/>
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12.5, cursor:'pointer' }} onClick={()=>setNotify(v=>!v)}>
                    <span style={{ width:14, height:14, border:`1.5px solid ${notify?T.ok:T.border}`, borderRadius:2, background:notify?T.ok:'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {notify && <span style={{ color:'#fff', fontSize:9 }}>✓</span>}
                    </span>
                    Open a tracking ticket and email the workspace owner
                </label>
            </div>
            <DataModalFoot>
                <DataBtn label="Cancel" onClick={onClose}/>
                <DataBtn label="Request reset" danger disabled={!ready} onClick={()=>{ if(ready) onClose(); }}/>
            </DataModalFoot>
        </DataModal>
    );
};

// ── ① Import Detail ───────────────────────────────────────────

// Importable fields per object — derived from schema.ts
const IMPORT_FIELDS = {
    Accounts: [
        { value:'name',              label:'Name *'            },
        { value:'website',           label:'Website'           },
        { value:'phone',             label:'Phone'             },
        { value:'industry',          label:'Industry'          },
        { value:'verticalMarket',    label:'Vertical market'   },
        { value:'annualRevenue',     label:'Annual revenue'    },
        { value:'totalEmployees',    label:'Total employees'   },
        { value:'address',           label:'Address'           },
        { value:'city',              label:'City'              },
        { value:'state',             label:'State'             },
        { value:'zip',               label:'ZIP'               },
        { value:'country',           label:'Country'           },
        { value:'accountSegment',    label:'Segment'           },
        { value:'accountOwner',      label:'Account owner'     },
        { value:'assignedRep',       label:'Assigned rep'      },
        { value:'assignedTerritory', label:'Territory'         },
        { value:'description',       label:'Description'       },
        { value:'notes',             label:'Notes'             },
        { value:'linkedInUrl',       label:'LinkedIn URL'      },
        { value:'foundedYear',       label:'Founded year'      },
        { value:'externalId',        label:'External ID'       },
    ],
    Contacts: [
        { value:'firstName',         label:'First name *'      },
        { value:'lastName',          label:'Last name *'       },
        { value:'email',             label:'Email *'           },
        { value:'phone',             label:'Phone'             },
        { value:'mobile',            label:'Mobile'            },
        { value:'title',             label:'Title'             },
        { value:'company',           label:'Company'           },
        { value:'department',        label:'Department'        },
        { value:'address',           label:'Address'           },
        { value:'city',              label:'City'              },
        { value:'state',             label:'State'             },
        { value:'zip',               label:'ZIP'               },
        { value:'country',           label:'Country'           },
        { value:'assignedRep',       label:'Assigned rep'      },
        { value:'assignedTerritory', label:'Territory'         },
        { value:'notes',             label:'Notes'             },
        { value:'externalId',        label:'External ID'       },
    ],
    Leads: [
        { value:'firstName',         label:'First name *'      },
        { value:'lastName',          label:'Last name *'       },
        { value:'email',             label:'Email *'           },
        { value:'phone',             label:'Phone'             },
        { value:'company',           label:'Company'           },
        { value:'title',             label:'Title'             },
        { value:'source',            label:'Lead source'       },
        { value:'status',            label:'Status'            },
        { value:'notes',             label:'Notes'             },
        { value:'assignedRep',       label:'Assigned rep'      },
        { value:'externalId',        label:'External ID'       },
    ],
    Opportunities: [
        { value:'opportunityName',   label:'Opportunity name *'},
        { value:'account',           label:'Account'           },
        { value:'stage',             label:'Stage *'           },
        { value:'arr',               label:'ARR'               },
        { value:'forecastedCloseDate',label:'Close date'       },
        { value:'salesRep',          label:'Sales rep'         },
        { value:'probability',       label:'Probability'       },
        { value:'territory',         label:'Territory'         },
        { value:'team',              label:'Team'              },
        { value:'notes',             label:'Notes'             },
        { value:'externalId',        label:'External ID'       },
    ],
};

const REQUIRED_FIELDS = {
    Accounts:      ['name'],
    Contacts:      ['firstName','lastName','email'],
    Leads:         ['firstName','lastName','email'],
    Opportunities: ['opportunityName','stage'],
};

// Auto-map a CSV column name to a field value using similarity heuristics
function autoMap(csvName, objectType) {
    const fields = IMPORT_FIELDS[objectType] || [];
    const n = csvName.toLowerCase().replace(/[^a-z0-9]/g,'');
    const exact = fields.find(f => f.value.toLowerCase() === n || f.label.toLowerCase().replace(/[^a-z0-9]/g,'') === n);
    if (exact) return { target: exact.value, confidence: 0.98 };
    const partial = fields.find(f => n.includes(f.value.toLowerCase()) || f.value.toLowerCase().includes(n));
    if (partial) return { target: partial.value, confidence: 0.80 };
    // Common aliases
    const aliases = {
        accountname:'name', company:'name', companyname:'name', organization:'name',
        domain:'website', url:'website', web:'website', homepage:'website',
        revenue:'annualRevenue', annrev:'annualRevenue',
        employees:'totalEmployees', headcount:'totalEmployees', emp:'totalEmployees',
        firstname:'firstName', first:'firstName', givenname:'firstName',
        lastname:'lastName', last:'lastName', surname:'lastName', familyname:'lastName',
        dealname:'opportunityName', opportunity:'opportunityName', deal:'opportunityName',
        closedate:'forecastedCloseDate', closingdate:'forecastedCloseDate',
        amount:'arr', value:'arr', dealsize:'arr', dealvalue:'arr',
        sfid:'externalId', salesforceid:'externalId', crmid:'externalId', hubspotid:'externalId',
        owner:'accountOwner', rep:'salesRep',
        segment:'accountSegment', tier:'accountSegment',
        vertical:'verticalMarket', industry:'industry',
        leadsource:'source', source:'source',
    };
    const mapped = aliases[n];
    if (mapped && fields.find(f => f.value === mapped)) return { target: mapped, confidence: 0.88 };
    return { target: '__skip__', confidence: 0.0 };
}

// Parse a CSV file in the browser — returns { headers, rows, sample }
function parseCSVHeaders(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return { headers: [], sample: [] };
    const parseRow = (line) => {
        const out = []; let cur = ''; let inQ = false;
        for (const ch of line) {
            if (ch === '"') { inQ = !inQ; }
            else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; }
            else cur += ch;
        }
        out.push(cur.trim());
        return out;
    };
    const headers = parseRow(lines[0]);
    const sample  = lines.slice(1, 4).map(parseRow);
    return { headers, rows: lines.length - 1, sample };
}

// Save mapping preset modal
const SavePresetModal = ({ columns, object, onClose }) => {
    const [name,   setName]   = useState('');
    const [saving, setSaving] = useState(false);
    const [saved,  setSaved]  = useState(false);

    const handleSave = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            await dbFetch('/.netlify/functions/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    importPresets: [{ name: name.trim(), object, columns: columns.map(c => ({ csv: c.csv, target: c.target })) }],
                }),
            });
            setSaved(true); setTimeout(onClose, 800);
        } catch(e) { /* silent */ } finally { setSaving(false); }
    };

    const inp = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, background:T.surface, fontFamily:T.sans, outline:'none', boxSizing:'border-box' };
    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, width:420, boxShadow:'0 8px 32px rgba(42,38,34,0.18)', fontFamily:T.sans }} onClick={e=>e.stopPropagation()}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>Save mapping as preset</div>
                    <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18, color:T.inkMuted, cursor:'pointer' }}>×</button>
                </div>
                <div style={{ padding:'20px' }}>
                    <div style={{ fontSize:12, color:T.inkMid, marginBottom:12 }}>Save this column mapping so you can reuse it for future <b>{object}</b> imports.</div>
                    <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Preset name</label>
                    <input value={name} onChange={e=>setName(e.target.value)} placeholder={`e.g. Salesforce → ${object}`} style={inp} autoFocus onKeyDown={e=>e.key==='Enter'&&handleSave()}/>
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'14px 20px', borderTop:`1px solid ${T.border}` }}>
                    <button onClick={onClose} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    <button onClick={handleSave} disabled={!name.trim()||saving||saved} style={{ padding:'7px 16px', background: saved ? T.ok : T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>
                        {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save preset'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// Run import confirmation modal
const RunImportModal = ({ wizard, object, onClose, onComplete }) => {
    const [running, setRunning] = useState(false);
    const [result,  setResult]  = useState(null);
    const [err,     setErr]     = useState('');
    const mapped = wizard.columns.filter(c => c.target !== '__skip__');

    const handleRun = async () => {
        setRunning(true); setErr('');
        try {
            const res  = await dbFetch('/.netlify/functions/import', {
                method: 'POST',
                body: JSON.stringify({
                    object,
                    dedupe:  wizard.dedupe,
                    columns: mapped.map(c => ({ csv: c.csv, target: c.target })),
                    preview: wizard.preview,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Import failed');
            setResult(data);
        } catch(e) {
            setErr(e.message || 'Import failed. Please try again.');
        } finally { setRunning(false); }
    };

    return (
        <div style={{ position:'fixed', inset:0, background:'rgba(42,38,34,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={!result ? onClose : undefined}>
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, width:480, boxShadow:'0 8px 32px rgba(42,38,34,0.18)', fontFamily:T.sans }} onClick={e=>e.stopPropagation()}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px', borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ fontSize:15, fontWeight:700, color:T.ink }}>{result ? 'Import complete' : 'Run import'}</div>
                    <button onClick={result ? onComplete : onClose} style={{ background:'none', border:'none', fontSize:18, color:T.inkMuted, cursor:'pointer' }}>×</button>
                </div>
                <div style={{ padding:'20px' }}>
                    {result ? (
                        <div>
                            <div style={{ fontSize:13, color:T.ok, fontWeight:700, marginBottom:12 }}>✓ Import completed successfully</div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                                {[
                                    { label:'Created', value: result.created ?? wizard.preview.willCreate },
                                    { label:'Updated', value: result.updated ?? wizard.preview.willUpdate },
                                    { label:'Skipped', value: result.skipped ?? wizard.preview.willSkip  },
                                    { label:'Errors',  value: result.errors  ?? 0, warn: true             },
                                ].map((s,i) => (
                                    <div key={i} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'10px 14px' }}>
                                        <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:4 }}>{s.label}</div>
                                        <div style={{ fontSize:22, fontWeight:700, color: s.warn && s.value > 0 ? T.warn : T.ink }}>{s.value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div>
                            <div style={{ padding:'10px 14px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:4, marginBottom:14, fontSize:12.5, color:T.inkMid }}>
                                This will import <b>{wizard.file.rows.toLocaleString()} rows</b> into <b>{object}</b> using your column mapping and dedupe rules. This action cannot be undone.
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                                {[
                                    { label:'Will create', value: wizard.preview.willCreate },
                                    { label:'Will update', value: wizard.preview.willUpdate },
                                    { label:'Will skip',   value: wizard.preview.willSkip   },
                                    { label:'Errors',      value: wizard.preview.errors.length, warn: true },
                                ].map((s,i) => (
                                    <div key={i} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:'10px 14px' }}>
                                        <div style={{ fontSize:10.5, fontWeight:700, color:T.inkMuted, letterSpacing:0.6, textTransform:'uppercase', marginBottom:4 }}>{s.label}</div>
                                        <div style={{ fontSize:22, fontWeight:700, color: s.warn && s.value > 0 ? T.warn : T.ink }}>{s.value}</div>
                                    </div>
                                ))}
                            </div>
                            {err && <div style={{ fontSize:12, color:T.danger, fontWeight:600, marginBottom:10 }}>{err}</div>}
                        </div>
                    )}
                </div>
                <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'14px 20px', borderTop:`1px solid ${T.border}` }}>
                    {result ? (
                        <button onClick={onComplete} style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>Done</button>
                    ) : (
                        <>
                            <button onClick={onClose} style={{ padding:'7px 14px', background:T.surface, color:T.ink, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                            <button onClick={handleRun} disabled={running} style={{ padding:'7px 16px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:700, cursor:'pointer', fontFamily:T.sans, opacity:running?0.7:1 }}>
                                {running ? 'Running…' : 'Run import now'}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const ImportDetail = ({ onBack }) => {
    const fileInputRef   = React.useRef(null);
    const [showPreset,   setShowPreset]   = useState(false);
    const [showRun,      setShowRun]      = useState(false);
    const [showHistory,  setShowHistory]  = useState(false);
    const [object,       setObject]       = useState('Accounts');
    const [uploading,    setUploading]    = useState(false);
    const [uploadErr,    setUploadErr]    = useState('');

    // Wizard state — starts from mock data, becomes live after file upload
    const initWizard = () => ({
        step:    'map',
        file:    DATA_IMPORT.wizard.file,
        columns: DATA_IMPORT.wizard.columns.map(c => ({ ...c })),
        dedupe:  { ...DATA_IMPORT.wizard.dedupe },
        preview: { ...DATA_IMPORT.wizard.preview, errors: [...DATA_IMPORT.wizard.preview.errors] },
    });
    const [wizard, setWizard] = useState(initWizard);

    const STEPS = ['upload','map','dedupe','preview','done'];
    const stepIdx    = STEPS.indexOf(wizard.step);
    const mapped     = wizard.columns.filter(c => c.target !== '__skip__').length;
    const fields     = IMPORT_FIELDS[object] || [];
    const reqFields  = REQUIRED_FIELDS[object] || [];
    const reqMapped  = reqFields.every(f => wizard.columns.some(c => c.target === f));
    const canContinue = reqMapped && wizard.step !== 'done';

    // ── Helpers ───────────────────────────────────────────────────
    const setColumnTarget = (csv, target) => {
        setWizard(w => ({ ...w, columns: w.columns.map(c => c.csv === csv ? { ...c, target } : c) }));
    };
    const toggleSkip = (csv) => {
        setWizard(w => ({
            ...w,
            columns: w.columns.map(c => {
                if (c.csv !== csv) return c;
                if (c.target === '__skip__') {
                    const { target } = autoMap(csv, object);
                    return { ...c, target: target || '__skip__' };
                }
                return { ...c, target: '__skip__' };
            }),
        }));
    };
    const autoMapAll = () => {
        setWizard(w => ({
            ...w,
            columns: w.columns.map(c => {
                if (c.confidence >= 0.85 && c.target !== '__skip__') return c;
                const { target, confidence } = autoMap(c.csv, object);
                return { ...c, target, confidence };
            }),
        }));
    };
    const setDedupe = (patch) => setWizard(w => ({ ...w, dedupe: { ...w.dedupe, ...patch } }));

    const advance = () => {
        const next = STEPS[stepIdx + 1];
        if (next) setWizard(w => ({ ...w, step: next }));
    };

    const continueLabel = () => {
        if (wizard.step === 'map')     return 'Continue → Dedupe';
        if (wizard.step === 'dedupe')  return 'Continue → Preview';
        if (wizard.step === 'preview') return 'Run import ▶';
        return 'Continue';
    };

    // ── File upload ───────────────────────────────────────────────
    const handleFile = async (file) => {
        if (!file) return;
        if (file.size > 100 * 1024 * 1024) { setUploadErr('File exceeds 100 MB limit.'); return; }
        setUploading(true); setUploadErr('');
        try {
            const text    = await file.text();
            const { headers, rows, sample } = parseCSVHeaders(text);
            if (!headers.length) { setUploadErr('Could not read CSV headers.'); return; }
            if (rows > 250000)   { setUploadErr('File exceeds 250,000 row limit. Use the API for larger imports.'); return; }

            const columns = headers.map((csv, i) => {
                const { target, confidence } = autoMap(csv, object);
                const sampleVal = sample.map(row => row[i]).find(v => v) || '';
                const type = /\d{4}-\d{2}-\d{2}/.test(sampleVal) ? 'datetime'
                    : /^\$[\d,]+/.test(sampleVal) ? 'currency'
                    : /^[\d,]+$/.test(sampleVal) ? 'number'
                    : /^https?:\/\//.test(sampleVal) ? 'url'
                    : /@/.test(sampleVal) ? 'email' : 'text';
                const required = (REQUIRED_FIELDS[object]||[]).includes(target);
                return { csv, target, type, sample: sampleVal, confidence, required };
            });

            const sizeKB = file.size / 1024;
            const sizeLbl = sizeKB > 1024 ? `${(sizeKB/1024).toFixed(1)} MB` : `${sizeKB.toFixed(1)} KB`;

            setWizard(w => ({
                ...w,
                step:    'map',
                file:    { name: file.name, size: sizeLbl, rows, encoding: 'UTF-8' },
                columns,
                preview: { willCreate: 0, willUpdate: 0, willSkip: 0, errors: [] },
            }));
        } catch(e) {
            setUploadErr('Failed to read file. Ensure it is a valid UTF-8 CSV.');
        } finally { setUploading(false); }
    };

    const onFileInput = (e) => { const f = e.target.files?.[0]; if (f) handleFile(f); };
    const onDrop = (e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); };

    const inp = { padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, cursor:'pointer', appearance:'none', width:'100%', boxSizing:'border-box' };
    const lbl = { display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 };
    const thSt = { padding:'9px 12px', fontSize:10, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', color:T.inkMuted, fontFamily:T.sans, textAlign:'left' };
    const tdSt = (extra={}) => ({ padding:'8px 12px', fontFamily:T.sans, ...extra });

    // ── History view ──────────────────────────────────────────────
    if (showHistory) {
        const totalRows   = DATA_IMPORT.history.reduce((a,b)=>a+b.rows, 0);
        const totalErrors = DATA_IMPORT.history.reduce((a,b)=>a+b.errors, 0);
        return (
            <div style={{ fontFamily:T.sans }}>
                <DataCrumb page="Import history" onBack={onBack}/>
                <DataTitle title="Import history" sub="All CSV imports for this workspace"
                    actions={[
                        <DataBtn key="back" label="← Back to wizard" onClick={()=>setShowHistory(false)}/>,
                        <DataBtn key="new" label="+ New import" primary onClick={()=>setShowHistory(false)}/>,
                    ]}/>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:18 }}>
                    {[
                        { label:'Total runs',   value: DATA_IMPORT.history.length },
                        { label:'Total rows',   value: totalRows.toLocaleString() },
                        { label:'Total errors', value: totalErrors, warn: totalErrors > 0 },
                        { label:'Success rate', value: `${(100 - (totalErrors/totalRows)*100).toFixed(1)}%` },
                    ].map((s,i) => <DataStatCard key={i} label={s.label} value={s.value} warn={s.warn}/>)}
                </div>
                <DataCard title="Recent imports">
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:T.sans }}>
                        <thead><tr style={{ background:T.surface2 }}>{['Run ID','When','Object','Rows','Errors','Status','Actor'].map((h,i)=><th key={i} style={thSt}>{h}</th>)}</tr></thead>
                        <tbody>
                            {DATA_IMPORT.history.map((h,i) => {
                                const tone  = h.status==='success'?'ok':h.status==='partial'?'warn':'neutral';
                                const label = h.status==='success'?'Success':h.status==='partial'?'Partial':'Cancelled';
                                return (
                                    <tr key={h.id} style={{ borderBottom:i<DATA_IMPORT.history.length-1?`1px solid ${T.border}`:'none', background:h.errors>0?`rgba(184,115,51,0.06)`:'transparent' }}>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{h.id}</td>
                                        <td style={{ padding:'10px 12px', color:T.inkMid }}>{h.ts}</td>
                                        <td style={{ padding:'10px 12px' }}>{h.object}</td>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{h.rows.toLocaleString()}</td>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, color:h.errors>0?T.warn:T.inkMid }}>{h.errors||'—'}</td>
                                        <td style={{ padding:'10px 12px' }}><DPill tone={tone}>{label}</DPill></td>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>{h.by}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </DataCard>
            </div>
        );
    }

    return (
        <div style={{ fontFamily:T.sans }}>
            {/* Hidden file input */}
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display:'none' }} onChange={onFileInput}/>

            {/* Modals */}
            {showPreset && <SavePresetModal columns={wizard.columns} object={object} onClose={()=>setShowPreset(false)}/>}
            {showRun && (
                <RunImportModal
                    wizard={wizard} object={object}
                    onClose={()=>setShowRun(false)}
                    onComplete={() => { setShowRun(false); setWizard(w => ({ ...w, step:'done' })); }}/>
            )}

            <DataCrumb page="Import" onBack={onBack}/>
            <DataTitle
                title="Import data"
                sub="CSV import for accounts, contacts, leads, opportunities"
                badge={`Last: ${DATA_IMPORT.lastRun.rows} rows · ${DATA_IMPORT.lastRun.errors} errors · ${DATA_IMPORT.lastRun.ts}`}
                updatedBy={DATA_IMPORT.lastRun.by}
                updatedAt={DATA_IMPORT.lastRun.ts}
                actions={[
                    <DataBtn key="h" label="View history" onClick={()=>setShowHistory(true)}/>,
                    <DataBtn key="m" label="Save mapping as preset" onClick={()=>setShowPreset(true)}/>,
                    <DataBtn key="c"
                        label={wizard.step === 'preview' ? 'Run import ▶' : continueLabel()}
                        primary
                        disabled={!canContinue}
                        onClick={() => wizard.step === 'preview' ? setShowRun(true) : advance()}
                    />,
                ]}/>

            {/* Error callout */}
            {uploadErr && (
                <div style={{ padding:'11px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ color:T.danger, fontSize:15 }}>⚠</span>
                    <div style={{ flex:1, fontSize:12.5, color:T.inkMid }}><b style={{ color:T.danger }}>Upload error.</b> {uploadErr}</div>
                    <DataBtn label="Dismiss" onClick={()=>setUploadErr('')}/>
                </div>
            )}

            {/* Last-run errors callout */}
            {!uploadErr && DATA_IMPORT.lastRun.errors > 0 && wizard.step !== 'done' && (
                <div style={{ padding:'11px 16px', background:'rgba(184,115,51,0.09)', borderLeft:`3px solid ${T.warn}`, borderRadius:4, marginBottom:16, display:'flex', alignItems:'center', gap:12 }}>
                    <span style={{ color:T.warn, fontSize:15 }}>⚠</span>
                    <div style={{ flex:1, fontSize:12.5, color:T.inkMid }}>
                        <b style={{ color:T.warn }}>Last import had {DATA_IMPORT.lastRun.errors} row errors.</b> Review the error report before re-running, or load that mapping to retry.
                    </div>
                    <DataBtn label="Download error report"/>
                    <DataBtn label="Reload mapping"/>
                </div>
            )}

            {/* Step rail */}
            <DataStepRail step={wizard.step}/>

            {/* ── Step 1: File ── */}
            <DataCard title="File" desc={wizard.file.name ? 'Step 1 — uploaded.' : 'Step 1 — upload a CSV file.'}>
                {wizard.file.name ? (
                    // File uploaded — show info row
                    <div style={{ display:'flex', alignItems:'center', gap:14, padding:'4px 0' }}>
                        <div style={{ width:44, height:56, borderRadius:3, background:T.surface2, border:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace', flexShrink:0 }}>CSV</div>
                        <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, fontFamily:'ui-monospace,Menlo,monospace' }}>{wizard.file.name}</div>
                            <div style={{ fontSize:11.5, color:T.inkMid, marginTop:2 }}>{wizard.file.size} · {wizard.file.rows.toLocaleString()} rows · {wizard.file.encoding}</div>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            <label style={{ ...lbl, marginBottom:2 }}>Object</label>
                            <select value={object} onChange={e => { setObject(e.target.value); autoMapAll(); }} style={{ ...inp, width:160 }}>
                                {['Accounts','Contacts','Leads','Opportunities'].map(o => <option key={o}>{o}</option>)}
                            </select>
                        </div>
                        <DataBtn label={uploading ? 'Reading…' : 'Replace file'} disabled={uploading} onClick={()=>fileInputRef.current?.click()}/>
                    </div>
                ) : (
                    // No file — drop zone
                    <div
                        onDrop={onDrop}
                        onDragOver={e=>e.preventDefault()}
                        onClick={()=>fileInputRef.current?.click()}
                        style={{ border:`2px dashed ${T.border}`, borderRadius:6, padding:'40px 24px', textAlign:'center', background:T.surface2, cursor:'pointer' }}>
                        <div style={{ fontSize:28, color:T.inkMuted, marginBottom:8 }}>↑</div>
                        <div style={{ fontSize:13, fontWeight:600, color:T.ink }}>Drop CSV here, or <span style={{ color:T.info, textDecoration:'underline' }}>browse</span></div>
                        <div style={{ fontSize:11.5, color:T.inkMid, marginTop:6 }}>UTF-8 · max 100 MB · max 250,000 rows</div>
                    </div>
                )}
            </DataCard>

            {/* ── Step 2: Map columns ── */}
            <DataCard
                title={`Map columns (${mapped} of ${wizard.columns.length} mapped)`}
                desc="Step 2 — confirm Accelerep field for each CSV column. Low-confidence rows are highlighted."
                headAction={
                    <span onClick={autoMapAll} style={{ fontSize:11.5, color:T.info, cursor:'pointer', fontWeight:600 }}>Auto-map all →</span>
                }>
                {wizard.columns.length === 0 ? (
                    <div style={{ color:T.inkMuted, fontSize:13, textAlign:'center', padding:'24px 0' }}>Upload a CSV file to see column mapping.</div>
                ) : (
                <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:T.sans }}>
                        <thead><tr style={{ background:T.surface2 }}>
                            {['CSV column','Sample value','Type','Accelerep field','Confidence',''].map((h,i)=><th key={i} style={thSt}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                            {wizard.columns.map((c,i) => {
                                const low  = c.confidence < 0.85;
                                const skip = c.target === '__skip__';
                                return (
                                    <tr key={c.csv} style={{ borderBottom: i<wizard.columns.length-1?`1px solid ${T.border}`:'none', background: low&&!skip?'rgba(184,115,51,0.06)':'transparent', opacity: skip?0.55:1 }}>
                                        <td style={{ ...tdSt(), fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5, fontWeight:600 }}>
                                            {c.csv}
                                            {c.required && !skip && <span style={{ marginLeft:6, padding:'1px 5px', borderRadius:10, background:'rgba(184,115,51,0.12)', color:T.warn, fontSize:10, fontWeight:700 }}>Required</span>}
                                        </td>
                                        <td style={{ ...tdSt(), fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, color:T.inkMid, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.sample}</td>
                                        <td style={tdSt()}>
                                            <span style={{ padding:'2px 7px', borderRadius:10, background:'rgba(138,131,120,0.12)', color:T.inkMid, fontSize:11, fontWeight:600 }}>{c.type}</span>
                                        </td>
                                        <td style={tdSt()}>
                                            <select
                                                value={skip ? '__skip__' : c.target}
                                                onChange={e => setColumnTarget(c.csv, e.target.value)}
                                                style={{ ...inp, width:200, fontSize:12 }}>
                                                <option value="__skip__">— Skip column —</option>
                                                <optgroup label={`${object} fields`}>
                                                    {fields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                                </optgroup>
                                            </select>
                                        </td>
                                        <td style={tdSt()}>
                                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                                <div style={{ width:60, height:5, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:3, overflow:'hidden', flexShrink:0 }}>
                                                    <div style={{ width:`${Math.round(c.confidence*100)}%`, height:'100%', background: c.confidence>0.9?T.ok:c.confidence>0.7?T.warn:T.danger }}/>
                                                </div>
                                                <span style={{ fontFamily:'ui-monospace,Menlo,monospace', fontSize:10.5, color:T.inkMid, flexShrink:0 }}>{Math.round(c.confidence*100)}%</span>
                                            </div>
                                        </td>
                                        <td style={{ ...tdSt(), textAlign:'right' }}>
                                            <button onClick={() => toggleSkip(c.csv)} style={{ fontSize:11, color:T.inkMid, cursor:'pointer', fontWeight:600, background:'none', border:'none', fontFamily:T.sans }}>
                                                {skip ? 'Map →' : 'Skip'}
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                )}
                {!reqMapped && wizard.columns.length > 0 && (
                    <div style={{ marginTop:10, padding:'8px 12px', background:'rgba(184,115,51,0.08)', borderLeft:`3px solid ${T.warn}`, borderRadius:4, fontSize:12, color:T.inkMid }}>
                        <b style={{ color:T.warn }}>Required fields missing.</b> Please map: {reqFields.filter(f => !wizard.columns.some(c => c.target===f)).join(', ')} before continuing.
                    </div>
                )}
            </DataCard>

            {/* ── Step 3: Dedupe ── */}
            <DataCard title="Dedupe rules" desc="Step 3 — what to do when an incoming row matches an existing record.">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16, marginBottom:14 }}>
                    <div>
                        <label style={lbl}>Match on</label>
                        <select value={wizard.dedupe.match} onChange={e=>setDedupe({match:e.target.value})} style={inp}>
                            <option value="domain">Domain (case-insensitive)</option>
                            <option value="email">Email address</option>
                            <option value="externalId">External ID (Salesforce / HubSpot)</option>
                            <option value="name">Name (fuzzy)</option>
                        </select>
                    </div>
                    <div>
                        <label style={lbl}>On match</label>
                        <select value={wizard.dedupe.onMatch} onChange={e=>setDedupe({onMatch:e.target.value})} style={inp}>
                            <option value="update">Update existing record</option>
                            <option value="create">Create duplicate</option>
                            <option value="skip">Skip — keep existing</option>
                        </select>
                    </div>
                    <div>
                        <label style={lbl}>Blank values in CSV</label>
                        <select value={wizard.dedupe.skipBlanks ? 'skip' : 'overwrite'} onChange={e=>setDedupe({skipBlanks:e.target.value==='skip'})} style={inp}>
                            <option value="skip">Skip — keep existing</option>
                            <option value="overwrite">Overwrite with blank</option>
                        </select>
                    </div>
                </div>
                <div style={{ padding:'10px 14px', background:'rgba(58,90,122,0.07)', borderLeft:`3px solid ${T.info}`, borderRadius:4, fontSize:12, color:T.inkMid }}>
                    <span style={{ fontWeight:700, color:T.info }}>Note.</span> Falls back to External ID when the chosen key is blank on a row.
                </div>
            </DataCard>

            {/* ── Step 4: Preview ── */}
            <DataCard title="Preview" desc="Step 4 — inspect what the import will do before committing.">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:16 }}>
                    <DataStatCard label="Will create" value={wizard.preview.willCreate}/>
                    <DataStatCard label="Will update" value={wizard.preview.willUpdate}/>
                    <DataStatCard label="Will skip"   value={wizard.preview.willSkip}/>
                    <DataStatCard label="Errors"      value={wizard.preview.errors.length} warn={wizard.preview.errors.length > 0}/>
                </div>
                {wizard.step === 'preview' ? (
                    wizard.preview.errors.length > 0 ? (
                        <div style={{ border:`1px solid ${T.border}`, borderRadius:6, overflow:'hidden' }}>
                            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:T.sans }}>
                                <thead><tr style={{ background:T.surface2 }}>{['Row','Field','Message'].map((h,i)=><th key={i} style={thSt}>{h}</th>)}</tr></thead>
                                <tbody>
                                    {wizard.preview.errors.map((e,i) => (
                                        <tr key={i} style={{ borderBottom:i<wizard.preview.errors.length-1?`1px solid ${T.border}`:'none' }}>
                                            <td style={{ padding:'8px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, color:T.inkMuted }}>{e.row}</td>
                                            <td style={{ padding:'8px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:12 }}>{e.field}</td>
                                            <td style={{ padding:'8px 12px', fontSize:12.5, color:T.warn }}>{e.msg}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ padding:'12px 16px', background:'rgba(77,107,61,0.08)', borderLeft:`3px solid ${T.ok}`, borderRadius:4, fontSize:12.5, color:T.inkMid }}>
                            <b style={{ color:T.ok }}>✓ No errors detected.</b> Ready to import.
                        </div>
                    )
                ) : (
                    <div style={{ padding:'12px 16px', background:T.surface2, borderRadius:4, fontSize:12.5, color:T.inkMuted, textAlign:'center' }}>
                        Preview computed from last run. Click <b>Continue → Preview</b> to generate a fresh dry-run.
                    </div>
                )}
            </DataCard>

            {/* ── Step 5: Done ── */}
            {wizard.step === 'done' && (
                <DataCard title="Import complete" desc="Your data has been imported successfully.">
                    <div style={{ padding:'20px', textAlign:'center' }}>
                        <div style={{ fontSize:32, marginBottom:8 }}>✓</div>
                        <div style={{ fontSize:15, fontWeight:700, color:T.ok, marginBottom:6 }}>Import complete</div>
                        <div style={{ fontSize:13, color:T.inkMid, marginBottom:16 }}>Records have been imported into <b>{object}</b>.</div>
                        <button onClick={()=>setWizard(initWizard())} style={{ padding:'8px 20px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:T.sans }}>
                            Start new import
                        </button>
                    </div>
                </DataCard>
            )}
        </div>
    );
};

// ── ② Export Detail ───────────────────────────────────────────
const ExportDetail = ({ onBack }) => {
    // dbFetch is imported at the top of this file from ../utils/storage
    const [schedules,  setSchedules]  = React.useState([]);
    const [runs,       setRuns]       = React.useState([]);
    const [dsrItems,   setDsrItems]   = React.useState([]);
    const [loading,    setLoading]    = React.useState(true);
    const [error,      setError]      = React.useState(null);
    const [showModal,  setShowModal]  = React.useState(false);
    const [showDsrModal, setShowDsrModal] = React.useState(false);
    const [adHocScope, setAdHocScope] = React.useState('accounts');
    const [adHocFmt,   setAdHocFmt]   = React.useState('CSV');
    const [adhocLoading, setAdhocLoading] = React.useState(false);
    const [adhocError,   setAdhocError]   = React.useState(null);
    const [editingSched, setEditingSched] = React.useState(null); // schedule being edited

    // ── load all three endpoints on mount ─────────────────────
    React.useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const [schRes, runRes, dsrRes] = await Promise.all([
                    dbFetch('/.netlify/functions/export-schedules'),
                    dbFetch('/.netlify/functions/export-runs'),
                    dbFetch('/.netlify/functions/export-dsr'),
                ]);
                if (cancelled) return;
                const [schData, runData, dsrData] = await Promise.all([
                    schRes.json(), runRes.json(), dsrRes.json(),
                ]);
                if (!schRes.ok)  throw new Error(schData.error || 'Failed to load schedules');
                if (!runRes.ok)  throw new Error(runData.error || 'Failed to load runs');
                if (!dsrRes.ok)  throw new Error(dsrData.error || 'Failed to load DSR queue');
                setSchedules(schData.schedules || []);
                setRuns(runData.runs || []);
                setDsrItems(dsrData.dsrQueue || []);
            } catch (e) {
                if (!cancelled) setError(e.message);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();
        return () => { cancelled = true; };
    }, []);

    const failing    = schedules.find(s => s.status === 'failing');
    const activeCount = schedules.filter(s => s.enabled).length;
    const openDsr    = dsrItems.filter(d => d.status !== 'completed').length;
    const th         = { padding:'9px 12px', fontSize:10, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', color:T.inkMuted, fontFamily:T.sans, textAlign:'left' };

    // ── toggle schedule enabled/disabled ──────────────────────
    const handleToggle = async (sched) => {
        const updated = { ...sched, enabled: !sched.enabled };
        setSchedules(prev => prev.map(s => s.id === sched.id ? updated : s));
        try {
            const res  = await dbFetch('/.netlify/functions/export-schedules', { method:'PUT', body: JSON.stringify(updated) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setSchedules(prev => prev.map(s => s.id === sched.id ? (data.schedule || updated) : s));
        } catch (e) {
            // Revert on error
            setSchedules(prev => prev.map(s => s.id === sched.id ? sched : s));
        }
    };

    // ── delete schedule ───────────────────────────────────────
    const handleDeleteSched = async (id) => {
        setSchedules(prev => prev.filter(s => s.id !== id));
        try {
            await dbFetch(`/.netlify/functions/export-schedules?id=${id}`, { method:'DELETE' });
        } catch (e) {
            console.error('Delete schedule failed:', e.message);
        }
    };

    // ── ad-hoc export ─────────────────────────────────────────
    const handleAdHoc = async () => {
        setAdhocLoading(true);
        setAdhocError(null);
        try {
            const id  = 'run_' + crypto.randomUUID();
            const res = await dbFetch('/.netlify/functions/export-runs', {
                method: 'POST',
                body: JSON.stringify({ id, scope: adHocScope, format: adHocFmt }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Export failed');

            // Trigger browser download from base64 payload
            const dl  = data.download;
            const bin = atob(dl.data);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            const blob = new Blob([arr], { type: dl.contentType });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href     = url;
            a.download = dl.filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Add run to recent list
            if (data.run) setRuns(prev => [data.run, ...prev].slice(0, 20));
        } catch (e) {
            setAdhocError(e.message);
        } finally {
            setAdhocLoading(false);
        }
    };

    // ── update DSR status ─────────────────────────────────────
    const handleDsrStatus = async (dsr, newStatus) => {
        const updated = { ...dsr, status: newStatus };
        setDsrItems(prev => prev.map(d => d.id === dsr.id ? updated : d));
        try {
            const res  = await dbFetch('/.netlify/functions/export-dsr', { method:'PUT', body: JSON.stringify(updated) });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setDsrItems(prev => prev.map(d => d.id === dsr.id ? (data.dsr || updated) : d));
        } catch (e) {
            setDsrItems(prev => prev.map(d => d.id === dsr.id ? dsr : d));
        }
    };

    // ── format helpers ────────────────────────────────────────
    const fmtTs = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        const now = new Date();
        const diffMs = now - d;
        const diffMin = Math.round(diffMs / 60000);
        if (diffMin < 1)   return 'just now';
        if (diffMin < 60)  return diffMin + 'm ago';
        const diffH = Math.round(diffMin / 60);
        if (diffH < 24)    return diffH + 'h ago';
        const diffD = Math.round(diffH / 24);
        if (diffD === 1)   return 'yesterday';
        if (diffD < 7)     return diffD + 'd ago';
        return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
    };

    const fmtSize = (bytes) => {
        if (!bytes || bytes === 0) return '—';
        if (bytes < 1024)        return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    if (loading) return (
        <div style={{ fontFamily:T.sans }}>
            <DataCrumb page="Export" onBack={onBack}/>
            <div style={{ padding:'60px 0', textAlign:'center', color:T.inkMuted, fontSize:13 }}>Loading export data…</div>
        </div>
    );

    if (error) return (
        <div style={{ fontFamily:T.sans }}>
            <DataCrumb page="Export" onBack={onBack}/>
            <div style={{ padding:'12px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, fontSize:13, color:T.danger }}>{error}</div>
        </div>
    );

    return (
        <div style={{ fontFamily:T.sans }}>
            {showModal    && <NewExportModal onClose={() => { setShowModal(false); setEditingSched(null); }} existing={editingSched} onSave={async (payload) => {
                try {
                    const isEdit = !!payload.id && schedules.find(s => s.id === payload.id);
                    const method = isEdit ? 'PUT' : 'POST';
                    if (!isEdit) payload.id = 'sch_' + crypto.randomUUID();
                    const res  = await dbFetch('/.netlify/functions/export-schedules', { method, body: JSON.stringify(payload) });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    if (isEdit) setSchedules(prev => prev.map(s => s.id === payload.id ? data.schedule : s));
                    else        setSchedules(prev => [data.schedule, ...prev]);
                    setShowModal(false); setEditingSched(null);
                } catch(e) { alert('Save failed: ' + e.message); }
            }}/>}
            {showDsrModal && <NewDsrModal onClose={() => setShowDsrModal(false)} onSave={async (payload) => {
                try {
                    payload.id = 'dsr_' + crypto.randomUUID();
                    const res  = await dbFetch('/.netlify/functions/export-dsr', { method:'POST', body: JSON.stringify(payload) });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error);
                    setDsrItems(prev => [data.dsr, ...prev]);
                    setShowDsrModal(false);
                } catch(e) { alert('Save failed: ' + e.message); }
            }}/>}

            <DataCrumb page="Export" onBack={onBack}/>
            <DataTitle
                title="Export"
                sub="Scheduled and ad-hoc exports; GDPR data subject requests"
                badge={`${activeCount} active schedule${activeCount !== 1 ? 's' : ''} · ${openDsr} open DSR`}
                updatedBy={runs[0] ? (runs[0].triggeredBy || 'system') : null}
                updatedAt={runs[0] ? fmtTs(runs[0].createdAt) : null}
                actions={[
                    <DataBtn key="adhoc" label={adhocLoading ? 'Exporting…' : 'Run ad-hoc export'} disabled={adhocLoading} onClick={() => {
                        // Show inline ad-hoc panel by toggling a flag
                        setAdHocScope('accounts'); setAdHocFmt('CSV'); setAdhocError(null);
                        setShowModal(false);
                    }}/>,
                    <DataBtn key="new" label="+ New scheduled export" primary onClick={() => { setEditingSched(null); setShowModal(true); }}/>,
                ]}
            />

            {/* Failing callout */}
            {failing && (
                <div style={{ padding:'11px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:13 }}>
                    <b style={{ color:T.danger }}>"{failing.name}" is failing.</b>
                    <span style={{ color:T.inkMid, marginLeft:6 }}>Last run: {fmtTs(failing.lastRunAt)}. {failing.lastError || ''}</span>
                </div>
            )}

            {/* ── Ad-hoc export panel ── */}
            <DataCard title="Ad-hoc export" desc="Download a one-time export of any entity directly to your browser.">
                <div style={{ display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Entity</label>
                        <select value={adHocScope} onChange={e => setAdHocScope(e.target.value)}
                            style={{ padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, appearance:'none', minWidth:180, cursor:'pointer' }}>
                            {['accounts','contacts','opportunities','tasks','activities','leads'].map(s => (
                                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Format</label>
                        <select value={adHocFmt} onChange={e => setAdHocFmt(e.target.value)}
                            style={{ padding:'7px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, appearance:'none', minWidth:100, cursor:'pointer' }}>
                            <option>CSV</option>
                            <option>JSON</option>
                        </select>
                    </div>
                    <DataBtn label={adhocLoading ? 'Exporting…' : '↓ Download now'} primary disabled={adhocLoading} onClick={handleAdHoc}/>
                </div>
                {adhocError && <div style={{ marginTop:10, fontSize:12, color:T.danger, fontWeight:600 }}>{adhocError}</div>}
            </DataCard>

            {/* ── Scheduled exports table ── */}
            <DataCard
                title={`Scheduled exports (${schedules.length})`}
                desc="Recurring exports — manual trigger only in this release; automated delivery coming soon."
                headAction={<DataBtn label="+ New" onClick={() => { setEditingSched(null); setShowModal(true); }}/>}
            >
                {schedules.length === 0 ? (
                    <div style={{ padding:'24px 0', textAlign:'center', fontSize:12.5, color:T.inkMuted }}>
                        No schedules yet. Create one to get started.
                    </div>
                ) : (
                    <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:T.sans }}>
                            <thead><tr style={{ background:T.surface2 }}>{['Name','Scope','Cadence','Destination','Format','Last run','Status',''].map((h,i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                            <tbody>
                                {schedules.map((s,i) => {
                                    const tone  = !s.enabled ? 'neutral' : s.status === 'failing' ? 'danger' : 'ok';
                                    const label = !s.enabled ? 'Paused' : s.status === 'failing' ? 'Failing' : 'Active';
                                    return (
                                        <tr key={s.id} style={{ borderBottom: i < schedules.length-1 ? `1px solid ${T.border}` : 'none', opacity: s.enabled ? 1 : 0.62 }}>
                                            <td style={{ padding:'10px 12px', fontWeight:600 }}>{s.name}</td>
                                            <td style={{ padding:'10px 12px', fontSize:12, color:T.inkMid }}>{s.scope}</td>
                                            <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>{s.cadence}</td>
                                            <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.destination}</td>
                                            <td style={{ padding:'10px 12px' }}><DPill tone="neutral">{s.format}</DPill></td>
                                            <td style={{ padding:'10px 12px', color:T.inkMid, fontSize:12 }}>{s.lastRunAt ? fmtTs(s.lastRunAt) : '—'}{s.lastSize ? ' · ' + s.lastSize : ''}</td>
                                            <td style={{ padding:'10px 12px' }}><DPill tone={tone}>{label}</DPill></td>
                                            <td style={{ padding:'10px 12px' }}>
                                                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                                                    <span onClick={() => handleToggle(s)} style={{ fontSize:11, color:T.info, cursor:'pointer', fontWeight:600 }}>
                                                        {s.enabled ? 'Pause' : 'Enable'}
                                                    </span>
                                                    <span onClick={() => { setEditingSched(s); setShowModal(true); }} style={{ fontSize:11, color:T.info, cursor:'pointer', fontWeight:600 }}>Edit</span>
                                                    <span onClick={() => handleDeleteSched(s.id)} style={{ fontSize:11, color:T.danger, cursor:'pointer', fontWeight:600 }}>Delete</span>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </DataCard>

            {/* ── Recent runs ── */}
            <DataCard title="Recent activity" desc="Ad-hoc and scheduled runs (last 20).">
                {runs.length === 0 ? (
                    <div style={{ padding:'24px 0', textAlign:'center', fontSize:12.5, color:T.inkMuted }}>No export runs yet.</div>
                ) : (
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:T.sans }}>
                        <thead><tr style={{ background:T.surface2 }}>{['When','Name','By','Rows','Format','Size','Duration'].map((h,i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {runs.map((r,i) => (
                                <tr key={r.id} style={{ borderBottom: i < runs.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                    <td style={{ padding:'10px 12px', color:T.inkMuted }}>{fmtTs(r.createdAt)}</td>
                                    <td style={{ padding:'10px 12px', fontWeight:500 }}>{r.name}</td>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>{r.triggeredBy || 'system'}</td>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{(r.rowCount || 0).toLocaleString()}</td>
                                    <td style={{ padding:'10px 12px' }}><DPill tone="neutral">{r.format}</DPill></td>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{fmtSize(r.sizeBytes)}</td>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>{r.durationMs ? r.durationMs + 'ms' : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </DataCard>

            {/* ── GDPR / DSR queue ── */}
            <DataCard
                title={`GDPR / DSR queue (${openDsr} open)`}
                desc="Data Subject Requests — respond within 30 days per GDPR Art. 15–17."
                headAction={<DataBtn label="+ New DSR" onClick={() => setShowDsrModal(true)}/>}
            >
                {dsrItems.length === 0 ? (
                    <div style={{ padding:'24px 0', textAlign:'center', fontSize:12.5, color:T.inkMuted }}>No DSR requests on record.</div>
                ) : (
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:T.sans }}>
                        <thead><tr style={{ background:T.surface2 }}>{['Ticket','Subject','Type','Submitted','SLA','Status',''].map((h,i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
                        <tbody>
                            {dsrItems.map((d,i) => (
                                <tr key={d.id} style={{ borderBottom: i < dsrItems.length-1 ? `1px solid ${T.border}` : 'none' }}>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{d.id}</td>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{d.subject}</td>
                                    <td style={{ padding:'10px 12px' }}><DPill tone={d.type === 'erasure' ? 'danger' : 'neutral'}>{d.type === 'erasure' ? 'Erasure' : 'Access'}</DPill></td>
                                    <td style={{ padding:'10px 12px', color:T.inkMid }}>{fmtTs(d.createdAt)}</td>
                                    <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11, color: d.slaLabel === 'Overdue' ? T.danger : T.inkMid }}>{d.slaLabel}</td>
                                    <td style={{ padding:'10px 12px' }}><DPill tone={d.status === 'completed' ? 'ok' : 'info'}>{d.status === 'completed' ? 'Completed' : 'In progress'}</DPill></td>
                                    <td style={{ padding:'10px 12px', textAlign:'right' }}>
                                        {d.status !== 'completed' && (
                                            <span onClick={() => handleDsrStatus(d, 'completed')} style={{ fontSize:11, color:T.ok, cursor:'pointer', fontWeight:600 }}>Mark complete</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </DataCard>
        </div>
    );
};

// ── New DSR modal ─────────────────────────────────────────────────────────────
const NewDsrModal = ({ onClose, onSave }) => {
    const [subject, setSubject] = React.useState('');
    const [type,    setType]    = React.useState('access');
    const [notes,   setNotes]   = React.useState('');
    const [saving,  setSaving]  = React.useState(false);
    const inpStyle = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' };
    const FL = ({ label, children }) => (<div style={{ marginBottom:14 }}><label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>{label}</label>{children}</div>);
    const handleSave = async () => {
        if (!subject.trim()) return;
        setSaving(true);
        await onSave({ subject: subject.trim(), type, notes: notes.trim() || null });
        setSaving(false);
    };
    return (
        <DataModal onClose={onClose}>
            <DataModalHead title="New DSR request" sub="Log a GDPR Data Subject Request. 30-day SLA starts today." onClose={onClose}/>
            <div style={{ flex:1, overflowY:'auto', padding:22 }}>
                <FL label="Subject (email or identifier)"><input value={subject} onChange={e => setSubject(e.target.value)} placeholder="user@example.com" style={inpStyle}/></FL>
                <FL label="Request type">
                    <select value={type} onChange={e => setType(e.target.value)} style={{ ...inpStyle, appearance:'none', cursor:'pointer' }}>
                        <option value="access">Access — provide a copy of their data</option>
                        <option value="erasure">Erasure — delete all their data (Right to be forgotten)</option>
                    </select>
                </FL>
                <FL label="Notes (optional)"><textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any context…" style={{ ...inpStyle, resize:'vertical' }}/></FL>
            </div>
            <DataModalFoot>
                <DataBtn label="Cancel" onClick={onClose}/>
                <DataBtn label={saving ? 'Saving…' : 'Create request'} primary disabled={!subject.trim() || saving} onClick={handleSave}/>
            </DataModalFoot>
        </DataModal>
    );
};

const BackupDetail = ({ onBack }) => {
    // ── Data state
    const [snapshots,    setSnapshots]    = useState([]);
    const [schedule,     setSchedule]     = useState({ frequency:'Daily', timeUtc:'03:00', retentionDays:30, notifyOnFailure:'' });
    const [loading,      setLoading]      = useState(true);
    const [loadError,    setLoadError]    = useState('');

    // ── Action state
    const [restoreSnap,  setRestoreSnap]  = useState(null);
    const [showImport,   setShowImport]   = useState(false);
    const [runningBackup,setRunningBackup]= useState(false);
    const [backupError,  setBackupError]  = useState('');
    const [backupSuccess,setBackupSuccess]= useState('');

    // ── Schedule edit state
    const [schedDirty,   setSchedDirty]   = useState(false);
    const [schedSaving,  setSchedSaving]  = useState(false);
    const [schedError,   setSchedError]   = useState('');
    const [schedSaved,   setSchedSaved]   = useState(false);
    const [editSched,    setEditSched]    = useState(null); // working copy while editing

    // Derived from snapshots
    const totalSizeBytes = snapshots.reduce((sum, s) => sum + (s.sizeBytes || 0), 0);
    const totalSizeLabel = totalSizeBytes === 0 ? '—'
        : totalSizeBytes < 1024 * 1024 ? `${(totalSizeBytes / 1024).toFixed(1)} KB`
        : `${(totalSizeBytes / (1024 * 1024)).toFixed(1)} MB`;

    const lastSnap = snapshots[0] || null;

    // ── Load on mount
    React.useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setLoadError('');
            try {
                const res  = await dbFetch('/.netlify/functions/backup');
                const data = await res.json();
                if (cancelled) return;
                setSnapshots(data.snapshots || []);
                if (data.schedule) {
                    setSchedule(data.schedule);
                    setEditSched(data.schedule);
                }
            } catch (e) {
                if (!cancelled) setLoadError('Failed to load backup data. Please refresh.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Format helpers (client-side display)
    const fmtWhen = (isoString) => {
        if (!isoString) return '—';
        const d   = new Date(isoString);
        const now = new Date();
        const diffMs  = now - d;
        const diffMin = Math.round(diffMs / 60000);
        const diffH   = Math.round(diffMs / 3600000);
        const diffD   = Math.round(diffMs / 86400000);
        if (diffMin < 2)  return 'just now';
        if (diffMin < 60) return `${diffMin} minutes ago`;
        if (diffH < 24)   return `${diffH} hour${diffH===1?'':'s'} ago`;
        if (diffD === 1)  return 'yesterday, ' + d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit', timeZone:'UTC' });
        if (diffD < 7)    return `${diffD} days ago`;
        if (diffD < 14)   return '1 week ago';
        return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
    };

    // ── Run backup now
    const handleRunBackup = async () => {
        if (runningBackup) return;
        setRunningBackup(true);
        setBackupError('');
        setBackupSuccess('');
        try {
            // POST creates the snapshot row and returns metadata (no payload inline
            // to stay within Netlify's 6MB response limit)
            const res  = await dbFetch('/.netlify/functions/backup', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Backup failed');

            // Prepend new snapshot to list immediately
            setSnapshots(prev => [{
                id:            data.id,
                createdAt:     data.createdAt,
                type:          'manual',
                recordCount:   data.recordCount,
                sizeBytes:     data.sizeBytes,
                sizeLabel:     data.sizeLabel,
                durationMs:    data.durationMs,
                durationLabel: data.durationLabel,
                status:        'ready',
            }, ...prev]);

            setBackupSuccess(`Backup complete · ${data.recordCount?.toLocaleString() || '—'} records · ${data.sizeLabel || '—'} · ${data.id}`);

            // Fetch the export as raw text — must use res.text() so the JSON string
            // reaches the Blob constructor untouched (dbFetch returns a raw Response).
            try {
                const dlRes  = await dbFetch(
                    `/.netlify/functions/backup?id=${encodeURIComponent(data.id)}&download=1`
                );
                const text = await dlRes.text();
                const blob = new Blob([text], { type: 'application/json' });
                const url  = URL.createObjectURL(blob);
                const a    = document.createElement('a');
                a.href     = url;
                a.download = `${data.id}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch {
                // Download failed but backup succeeded — user can download from the table
            }
        } catch (e) {
            setBackupError(e.message || 'Backup failed. Please try again.');
        } finally {
            setRunningBackup(false);
        }
    };

    // ── Save schedule
    const handleSaveSchedule = async () => {
        if (schedSaving) return;
        setSchedSaving(true);
        setSchedError('');
        setSchedSaved(false);
        try {
            const res  = await dbFetch('/.netlify/functions/backup', {
                method: 'PUT',
                body: JSON.stringify(editSched),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Save failed');
            setSchedule(editSched);
            setSchedDirty(false);
            setSchedSaved(true);
            setTimeout(() => setSchedSaved(false), 3000);
        } catch (e) {
            setSchedError(e.message || 'Failed to save schedule.');
        } finally {
            setSchedSaving(false);
        }
    };

    const updateSched = (field, value) => {
        setEditSched(() => ({ ...(editSched || schedule), [field]: value }));
        setSchedDirty(true);
        setSchedSaved(false);
    };

    const th = { padding:'9px 12px', fontSize:10, fontWeight:700, letterSpacing:0.6, textTransform:'uppercase', color:T.inkMuted, fontFamily:T.sans, textAlign:'left' };
    const inpSt = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' };
    const selSt = { ...inpSt, cursor:'pointer', appearance:'none',
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' viewBox='0 0 24 24' fill='none' stroke='%238a8378' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center', paddingRight:28 };

    const curSched = editSched || schedule;

    return (
        <div style={{ fontFamily:T.sans }}>
            {restoreSnap && <RestoreModal snap={restoreSnap} onClose={()=>setRestoreSnap(null)}/>}
            {showImport  && <ImportBackupModal onClose={()=>setShowImport(false)} onSuccess={() => { setShowImport(false); }}/>}

            <DataCrumb page="Backup & restore" onBack={onBack}/>
            <DataTitle
                title="Backup & restore"
                sub="Automated daily snapshots and point-in-time restore"
                badge={lastSnap ? `Daily · last: ${fmtWhen(lastSnap.createdAt)} · ${lastSnap.sizeLabel || '—'}` : undefined}
                updatedBy="System"
                updatedAt={lastSnap ? fmtWhen(lastSnap.createdAt) : '—'}
                actions={[
                    <DataBtn key="imp"
                        label="Import from file"
                        onClick={() => setShowImport(true)}/>,
                    <DataBtn key="res"
                        label="Restore from backup"
                        disabled={!lastSnap}
                        onClick={() => lastSnap && setRestoreSnap(lastSnap)}/>,
                    <DataBtn key="run"
                        label={runningBackup ? 'Running…' : 'Run backup now'}
                        primary
                        disabled={runningBackup}
                        onClick={handleRunBackup}/>,
                ]}/>

            {/* Feedback banners */}
            {backupSuccess && (
                <div style={{ padding:'10px 16px', background:'rgba(77,107,61,0.10)', borderLeft:`3px solid ${T.ok}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.ok, fontWeight:600 }}>
                    ✓ {backupSuccess}
                </div>
            )}
            {backupError && (
                <div style={{ padding:'10px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger, fontWeight:600 }}>
                    ✕ {backupError}
                </div>
            )}
            {loadError && (
                <div style={{ padding:'10px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger }}>
                    {loadError}
                </div>
            )}

            {/* KPI stat cards */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:12, marginBottom:16 }}>
                <DataStatCard label="Last backup"
                    value={loading ? '…' : lastSnap ? fmtWhen(lastSnap.createdAt) : 'Never'} mono/>
                <DataStatCard label="Backups stored"
                    value={loading ? '…' : snapshots.length}/>
                <DataStatCard label="Total size"
                    value={loading ? '…' : totalSizeLabel}/>
                <DataStatCard label="Retention"
                    value={`${schedule.retentionDays} days`}/>
            </div>

            {/* Schedule form */}
            <DataCard title="Schedule"
                desc="Backups are automated; you can also run a snapshot at any time."
                headAction={
                    schedDirty ? (
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                            {schedSaved && <span style={{ fontSize:12, color:T.ok, fontWeight:600 }}>✓ Saved</span>}
                            {schedError && <span style={{ fontSize:12, color:T.danger, fontWeight:600 }}>{schedError}</span>}
                            <DataBtn label="Cancel" onClick={() => { setEditSched(schedule); setSchedDirty(false); setSchedError(''); }}/>
                            <DataBtn label={schedSaving ? 'Saving…' : 'Save schedule'} primary disabled={schedSaving} onClick={handleSaveSchedule}/>
                        </div>
                    ) : schedSaved ? (
                        <span style={{ fontSize:12, color:T.ok, fontWeight:600 }}>✓ Saved</span>
                    ) : null
                }>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16 }}>
                    {/* Frequency */}
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Frequency</label>
                        <select value={curSched.frequency || 'Daily'} onChange={e => updateSched('frequency', e.target.value)} style={selSt}>
                            <option>Daily</option>
                            <option>Weekly</option>
                            <option>Every 12 hours</option>
                        </select>
                    </div>
                    {/* Time of day */}
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Time of day (UTC)</label>
                        <input type="text" value={curSched.timeUtc || '03:00'} onChange={e => updateSched('timeUtc', e.target.value)}
                            placeholder="03:00" style={{ ...inpSt, fontFamily:'ui-monospace,Menlo,monospace' }}/>
                    </div>
                    {/* Retention */}
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Retention</label>
                        <select value={String(curSched.retentionDays || 30)} onChange={e => updateSched('retentionDays', Number(e.target.value))} style={selSt}>
                            <option value="7">7 days</option>
                            <option value="14">14 days</option>
                            <option value="30">30 days</option>
                            <option value="60">60 days</option>
                            <option value="90">90 days</option>
                        </select>
                    </div>
                    {/* Region — read-only (infra-level) */}
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Region</label>
                        <input readOnly value="us-east-1 (primary) · eu-west-1 (replica)"
                            style={{ ...inpSt, color:T.inkMuted, cursor:'default' }}/>
                    </div>
                    {/* Encryption — read-only */}
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Encryption</label>
                        <input readOnly value="AES-256 · workspace key"
                            style={{ ...inpSt, color:T.inkMuted, cursor:'default' }}/>
                    </div>
                    {/* Notify on failure */}
                    <div>
                        <label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5 }}>Notify on failure</label>
                        <input type="text" value={curSched.notifyOnFailure || ''} onChange={e => updateSched('notifyOnFailure', e.target.value)}
                            placeholder="email or Slack handle" style={inpSt}/>
                    </div>
                </div>
            </DataCard>

            {/* Snapshots table */}
            <DataCard title="Recent snapshots"
                desc="Each snapshot is a complete point-in-time copy of all CRM data and settings."
                headAction={<span style={{ fontSize:11.5, color:T.inkMuted, fontStyle:'italic' }}>Storage: Neon PostgreSQL</span>}>
                {loading ? (
                    <div style={{ padding:'2rem', textAlign:'center', color:T.inkMuted, fontSize:13 }}>Loading snapshots…</div>
                ) : snapshots.length === 0 ? (
                    <div style={{ padding:'2rem', textAlign:'center', color:T.inkMuted, fontSize:13 }}>
                        No backups yet. Click <b>Run backup now</b> to create your first snapshot.
                    </div>
                ) : (
                    <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12.5, fontFamily:T.sans, minWidth:700 }}>
                            <thead>
                                <tr style={{ background:T.surface2 }}>
                                    {['Snapshot ID','When','Type','Size','Records','Duration','Status',''].map((h,i) =>
                                        <th key={i} style={th}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {snapshots.map((s, i) => (
                                    <tr key={s.id} style={{ borderBottom: i < snapshots.length - 1 ? `1px solid ${T.border}` : 'none' }}>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>{s.id}</td>
                                        <td style={{ padding:'10px 12px', color:T.inkMid }}>{fmtWhen(s.createdAt)}</td>
                                        <td style={{ padding:'10px 12px' }}>
                                            <DPill tone={s.type === 'manual' ? 'info' : 'neutral'}>
                                                {s.type === 'manual' ? 'Manual' : 'Automated'}
                                            </DPill>
                                        </td>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>
                                            {s.sizeLabel || '—'}
                                        </td>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11.5 }}>
                                            {s.recordCount != null ? s.recordCount.toLocaleString() : '—'}
                                        </td>
                                        <td style={{ padding:'10px 12px', fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>
                                            {s.durationLabel || '—'}
                                        </td>
                                        <td style={{ padding:'10px 12px' }}>
                                            <DPill tone={s.status === 'ready' ? 'ok' : s.status === 'running' ? 'info' : 'danger'}>
                                                {s.status === 'ready' ? 'Ready' : s.status === 'running' ? 'Running…' : 'Failed'}
                                            </DPill>
                                        </td>
                                        <td style={{ padding:'10px 12px', textAlign:'right' }}>
                                            <span style={{ display:'flex', gap:12, justifyContent:'flex-end' }}>
                                                <button onClick={() => setRestoreSnap(s)}
                                                    style={{ fontSize:11, color:T.info, background:'none', border:'none', cursor:'pointer', fontWeight:600, fontFamily:T.sans }}>
                                                    Restore
                                                </button>
                                                <button onClick={async () => {
                                                    try {
                                                        const dlRes = await dbFetch(`/.netlify/functions/backup?id=${encodeURIComponent(s.id)}&download=1`);
                                                        const text  = await dlRes.text();
                                                        const blob  = new Blob([text], { type:'application/json' });
                                                        const url   = URL.createObjectURL(blob);
                                                        const a     = document.createElement('a');
                                                        a.href = url; a.download = `${s.id}.json`;
                                                        document.body.appendChild(a); a.click();
                                                        document.body.removeChild(a);
                                                        URL.revokeObjectURL(url);
                                                    } catch { /* silent */ }
                                                }} style={{ fontSize:11, color:T.inkMid, background:'none', border:'none', cursor:'pointer', fontWeight:600, fontFamily:T.sans }}>
                                                    Download
                                                </button>
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </DataCard>
        </div>
    );
};

// ── ④ Features & AI Detail ────────────────────────────────────
const FeaturesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const [flags,      setFlags]      = React.useState({});      // { [flagId]: boolean }
    const [tabViz,     setTabViz]     = React.useState({ leadsEnabled: true, quotesEnabled: true, dispatchEnabled: false });
    const [aiSettings, setAiSettings] = React.useState({});
    const [loading,    setLoading]    = React.useState(true);
    const [saving,     setSaving]     = React.useState(false);
    const [dirty,      setDirty]      = React.useState(false);
    const [showReset,  setShowReset]  = React.useState(false);
    const [error,      setError]      = React.useState(null);
    const [filterCat,  setFilterCat]  = React.useState('All');


    // ── Initialise from settings prop (same pattern as all other panels) ───────
    const AI_DEFAULTS = {
        model: 'claude-sonnet-4-6',
        fallback: 'claude-haiku-4-5-20251001',
        region: 'US · us-east-2',
        tokenBudget: 25000000,
        trainingOptIn: false,
        zeroRetention: true,
        piiRedaction: true,
        byok: false,
        byokProvider: '',
        dpaSignedAt: '',
        auditLogging: 'All AI requests · 13mo retention',
        blockList: '',
        budgetExceed: 'Throttle to 1 req/s',
        availableTo: 'All roles',
    };
    React.useEffect(() => {
        if (!settings) return;
        // Don't overwrite local state while user has unsaved changes
        if (!dirty) {
            setFlags(settings.featureFlags || {});
            setTabViz({
                leadsEnabled:   settings.leadsEnabled  !== false,
                quotesEnabled:  settings.quotesEnabled !== false,
                dispatchEnabled: settings.dispatchEnabled === true,
            });
            setAiSettings(settings.aiSettings || AI_DEFAULTS);
        }
        setLoading(false);
    }, [settings]);

    // ── Toggle a flag — marks dirty, saved via Save changes button ──────────────
    const handleToggle = (flagId, isLive) => {
        if (!isLive) return; // coming-soon flags are not togglable
        setFlags(prev => ({ ...prev, [flagId]: !(prev[flagId] !== false) }));
        setDirty(true);
    };

    // ── Toggle tab visibility — marks dirty, saved via Save changes button ──────
    const handleTabVizToggle = (key) => {
        setTabViz(prev => ({ ...prev, [key]: !prev[key] }));
        setDirty(true);
    };

    // ── Save all — AI settings + feature flags + tab visibility ─────────────────
    const handleSaveAi = async () => {
        setSaving(true);
        try {
            const res = await dbFetch('/.netlify/functions/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    aiSettings,
                    featureFlags: flags,
                    leadsEnabled:   tabViz.leadsEnabled,
                    quotesEnabled:  tabViz.quotesEnabled,
                    dispatchEnabled: tabViz.dispatchEnabled,
                }),
            });
            if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
            setSettings(prev => ({
                ...prev,
                aiSettings,
                featureFlags: flags,
                leadsEnabled:   tabViz.leadsEnabled,
                quotesEnabled:  tabViz.quotesEnabled,
                dispatchEnabled: tabViz.dispatchEnabled,
            }));
            setDirty(false);
        } catch (e) {
            setError('Failed to save: ' + e.message);
        } finally {
            setSaving(false);
        }
    };
    // Sync dirty state to app-level nav guard
    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSaveAi : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    // ── Export config ─────────────────────────────────────────
    const handleExportConfig = () => {
        const payload = JSON.stringify({ featureFlags: flags, aiSettings }, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'accelerep-feature-config.json';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    };

    const isOn = (flagId) => flags[flagId] !== false;
    const onCount  = FLAG_DEFS.filter(f => isOn(f.id)).length;
    const betaOn   = FLAG_DEFS.filter(f => f.beta && isOn(f.id)).length;
    const aiRegion = aiSettings.region || 'US · us-east-2';

    const selSt = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:T.sans, outline:'none', background:T.surface, appearance:'none', cursor:'pointer' };
    const inpSt = { width:'100%', padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' };
    const FL = ({ label, children }) => (<div><label style={{ display:'block', fontSize:11.5, fontWeight:600, color:T.inkMid, marginBottom:5, fontFamily:T.sans }}>{label}</label>{children}</div>);

    const CAT_FILTERS = ['All', 'Live', 'Coming soon', 'Beta'];
    const visibleFlags = FLAG_DEFS.filter(f => {
        if (filterCat === 'Live')        return f.live;
        if (filterCat === 'Coming soon') return !f.live;
        if (filterCat === 'Beta')        return f.beta;
        return true;
    });

    if (loading) return (
        <div style={{ fontFamily:T.sans }}>
            <DataCrumb page="Features & AI" onBack={onBack}/>
            <div style={{ padding:'60px 0', textAlign:'center', color:T.inkMuted, fontSize:13 }}>Loading…</div>
        </div>
    );

    return (
        <div style={{ fontFamily:T.sans }}>
            {showReset && <ResetAiModal onClose={() => setShowReset(false)}/>}

            <DataCrumb page="Features & AI" onBack={onBack}/>
            <DataTitle
                title="Features & AI"
                sub="App-wide feature flags and AI controls (model, Residency, Training, redaction)"
                badge={`${onCount} of ${FLAG_DEFS.length} on · AI · ${aiRegion}`}
                dirty={dirty}
                actions={[
                    <DataBtn key="exp" label="Export config" onClick={handleExportConfig}/>,
                    <DataBtn key="sav" label={saving ? 'Saving…' : 'Save changes'} primary disabled={saving || !dirty} onClick={handleSaveAi}/>,
                ]}
            />

            {error && (
                <div style={{ padding:'11px 16px', background:'rgba(156,58,46,0.08)', borderLeft:`3px solid ${T.danger}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.danger }}>{error}</div>
            )}

            {betaOn > 0 && (
                <div style={{ padding:'11px 16px', background:'rgba(58,90,122,0.08)', borderLeft:`3px solid ${T.info}`, borderRadius:4, marginBottom:16, fontSize:12.5, color:T.inkMid }}>
                    <b style={{ color:T.info }}>Beta features active.</b> Workspace has {betaOn} beta flag{betaOn>1?'s':''} enabled. Behavior may change between releases.
                </div>
            )}

            {/* ── Tab visibility ── */}
            <DataCard title="Tab visibility" desc="Show or hide top-level navigation tabs for all users in this workspace.">
                {[
                    { key: 'leadsEnabled',   name: 'Leads tab',     desc: 'Show the Leads tab in the top navigation bar.' },
                    { key: 'quotesEnabled',  name: 'Quotes tab',    desc: 'Show the Quotes tab in the top navigation bar.' },
                    { key: 'dispatchEnabled', name: 'Dispatch tab',  desc: 'Show the Dispatch scheduling tab. For field-service businesses that dispatch technicians to jobs.' },
                ].map((item, i, arr) => {
                    const on = tabViz[item.key];
                    return (
                        <div key={item.key} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom: i < arr.length-1 ? `1px solid ${T.border}` : 'none' }}>
                            <div onClick={() => handleTabVizToggle(item.key)}
                                style={{ width:30, height:18, borderRadius:9, background: on ? T.ok : T.border, position:'relative', flexShrink:0, cursor:'pointer', transition:'background 120ms' }}>
                                <span style={{ position:'absolute', top:2, left: on ? 14 : 2, width:14, height:14, borderRadius:'50%', background:'#fbf8f3', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 100ms' }}/>
                            </div>
                            <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans, display:'flex', alignItems:'center', gap:6 }}>
                                    {item.name}
                                    <span style={{ padding:'1px 6px', borderRadius:10, background:'rgba(77,107,61,0.12)', color:T.ok, fontSize:10.5, fontWeight:700 }}>Live</span>
                                </div>
                                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>{item.desc}</div>
                            </div>
                            <div style={{ fontSize:11, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace', textAlign:'right', minWidth:80 }}>
                                {on ? 'Visible' : 'Hidden'}
                            </div>
                        </div>
                    );
                })}
            </DataCard>

            {/* ── Feature flags ── */}
            <DataCard title={`Feature flags (${onCount} / ${FLAG_DEFS.length} on)`} desc="Toggle workspace-wide features. Live flags take effect immediately. Coming soon flags are stored but not yet active.">
                <div style={{ display:'flex', gap:6, marginBottom:12 }}>
                    {CAT_FILTERS.map(cat => (
                        <span key={cat} onClick={() => setFilterCat(cat)}
                            style={{ padding:'4px 10px', borderRadius:3, background:filterCat===cat?T.ink:T.surface2, color:filterCat===cat?'#fbf8f3':T.inkMid, fontSize:11.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                            {cat}
                        </span>
                    ))}
                </div>
                {visibleFlags.map((flag, i) => {
                    const on = isOn(flag.id);
                    return (
                        <div key={flag.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom: i < visibleFlags.length-1 ? `1px solid ${T.border}` : 'none', opacity: flag.live ? 1 : 0.72 }}>
                            {/* Toggle — disabled for coming-soon */}
                            <div onClick={() => handleToggle(flag.id, flag.live)} title={flag.live ? (on ? 'Click to disable' : 'Click to enable') : 'Coming soon'}
                                style={{ width:30, height:18, borderRadius:9, background: on ? (flag.live ? T.ok : T.border) : T.border, position:'relative', flexShrink:0, cursor: flag.live ? 'pointer' : 'not-allowed', transition:'background 120ms' }}>
                                <span style={{ position:'absolute', top:2, left: on ? 14 : 2, width:14, height:14, borderRadius:'50%', background:'#fbf8f3', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 100ms' }}/>
                            </div>
                            <div style={{ flex:1 }}>
                                <div style={{ fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans, display:'flex', alignItems:'center', gap:6 }}>
                                    {flag.name}
                                    {flag.live && <span style={{ padding:'1px 6px', borderRadius:10, background:'rgba(77,107,61,0.12)', color:T.ok, fontSize:10.5, fontWeight:700 }}>Live</span>}
                                    {!flag.live && <span style={{ padding:'1px 6px', borderRadius:10, background:'rgba(138,131,120,0.12)', color:T.inkMuted, fontSize:10.5, fontWeight:700 }}>Coming soon</span>}
                                    {flag.beta && <span style={{ padding:'1px 6px', borderRadius:10, background:'rgba(58,90,122,0.10)', color:T.info, fontSize:10.5, fontWeight:700 }}>Beta</span>}
                                    {flag.new  && <span style={{ padding:'1px 6px', borderRadius:10, background:'rgba(184,115,51,0.10)', color:T.warn, fontSize:10.5, fontWeight:700 }}>New</span>}
                                </div>
                                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2, fontFamily:T.sans }}>{flag.desc}</div>
                            </div>
                            <div style={{ fontSize:11, color:T.inkMid, fontFamily:'ui-monospace,Menlo,monospace', textAlign:'right', minWidth:80 }}>
                                {flag.live ? (on ? 'Enabled' : 'Disabled') : '—'}
                            </div>
                        </div>
                    );
                })}
            </DataCard>

            {/* ── AI model & access ── */}
            <DataCard title="AI · Model & access" desc="Which model powers AI features and which roles can use them.">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16 }}>
                    <FL label="Model">
                        <select style={selSt} value={aiSettings.model || 'claude-sonnet-4-6'} onChange={e => { setAiSettings(p => ({...p, model:e.target.value})); setDirty(true); }}>
                            <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                            <option value="claude-opus-4-6">claude-opus-4-6</option>
                            <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
                        </select>
                    </FL>
                    <FL label="Fallback">
                        <select style={selSt} value={aiSettings.fallback || 'claude-haiku-4-5-20251001'} onChange={e => { setAiSettings(p => ({...p, fallback:e.target.value})); setDirty(true); }}>
                            <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
                            <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                        </select>
                    </FL>
                    <FL label="Available to">
                        <select style={selSt} value={aiSettings.availableTo || 'All roles'} onChange={e => { setAiSettings(p => ({...p, availableTo:e.target.value})); setDirty(true); }}>
                            <option>All roles</option>
                            <option>Admin + Manager only</option>
                            <option>Admin only</option>
                        </select>
                    </FL>
                    <FL label="Daily token budget">
                        <input style={inpSt} value={(aiSettings.tokenBudget || 25000000).toLocaleString()} onChange={e => { setAiSettings(p => ({...p, tokenBudget: parseInt(e.target.value.replace(/,/g,''))||25000000})); setDirty(true); }}/>
                    </FL>
                    <FL label="On budget exceed">
                        <select style={selSt} value={aiSettings.budgetExceed || 'Throttle to 1 req/s'} onChange={e => { setAiSettings(p => ({...p, budgetExceed:e.target.value})); setDirty(true); }}>
                            <option>Throttle to 1 req/s</option>
                            <option>Block all AI requests</option>
                            <option>Allow with warning</option>
                        </select>
                    </FL>
                </div>
            </DataCard>

            {/* ── AI Data Residency & Training ── */}
            <DataCard title="AI · Data Residency & Training" desc="Where requests are processed and whether your data trains the model.">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                    {[
                        { id:'us', region:'US · us-east-2', latency:'+0ms'            },
                        { id:'eu', region:'EU · eu-west-1', latency:'+82ms (from US)'  },
                    ].map(r => {
                        const sel = aiRegion === r.region;
                        return (
                            <div key={r.id} onClick={() => { setAiSettings(p => ({...p, region:r.region})); setDirty(true); }}
                                style={{ border:`1px solid ${sel?T.goldInk:T.border}`, background:sel?'rgba(200,185,154,0.10)':T.surface, borderRadius:6, padding:'12px 14px', cursor:'pointer', transition:'border-color 100ms' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                    <span style={{ width:14, height:14, borderRadius:'50%', border:`1.5px solid ${sel?T.goldInk:T.inkMuted}`, position:'relative', flexShrink:0 }}>
                                        {sel && <span style={{ position:'absolute', inset:3, borderRadius:'50%', background:T.goldInk }}/>}
                                    </span>
                                    <span style={{ fontSize:13, fontWeight:600, color:T.ink }}>{r.region}</span>
                                </div>
                                <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:4, marginLeft:22 }}>Latency: {r.latency}</div>
                            </div>
                        );
                    })}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    {[
                        { key:'trainingOptIn',  invert:true,  label:'Training opt-out',        desc:'Your prompts and outputs do not train the model.' },
                        { key:'zeroRetention',  invert:false, label:'Zero data retention',     desc:'AI provider stores no request data after response.' },
                        { key:'piiRedaction',   invert:false, label:'PII redaction',            desc:'Personal email, phone, SSN replaced with placeholders pre-prompt.' },
                        { key:'byok',           invert:false, label:'BYOK (bring your own key)',desc: aiSettings.byok ? `Active · ${aiSettings.byokProvider||''}` : 'Use your own model API key for AI requests.' },
                    ].map(t => {
                        const rawVal = aiSettings[t.key] ?? (t.key === 'zeroRetention' || t.key === 'piiRedaction' ? true : false);
                        const on = t.invert ? !rawVal : rawVal;
                        return (
                            <div key={t.key} onClick={() => { setAiSettings(p => ({...p, [t.key]: !p[t.key]})); setDirty(true); }}
                                style={{ border:`1px solid ${T.border}`, borderRadius:4, padding:'12px 14px', background: on ? 'rgba(77,107,61,0.07)' : T.surface, display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer' }}>
                                <span style={{ width:18, height:18, borderRadius:3, border:`1.5px solid ${on?T.ok:T.border}`, background:on?T.ok:'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', color:'#fbf8f3', fontSize:11, fontWeight:700, flexShrink:0, marginTop:1 }}>
                                    {on ? '✓' : ''}
                                </span>
                                <div>
                                    <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{t.label}</div>
                                    <div style={{ fontSize:11.5, color:T.inkMuted, marginTop:2 }}>{t.desc}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                {/* BYOK key input — shown when BYOK is enabled */}
                {aiSettings.byok && (
                    <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:6 }}>
                        <label style={{ fontSize:11.5, fontWeight:600, color:T.inkMid, fontFamily:T.sans }}>
                            Your Anthropic API key
                        </label>
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                            <input
                                type="password"
                                value={aiSettings.byokProvider || ''}
                                onChange={e => { setAiSettings(p => ({...p, byokProvider: e.target.value})); setDirty(true); }}
                                placeholder="sk-ant-..."
                                style={{ flex:1, padding:'8px 10px', border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:13, color:T.ink, fontFamily:'ui-monospace,Menlo,monospace', outline:'none', background:T.surface, boxSizing:'border-box' }}
                            />
                            {aiSettings.byokProvider && (
                                <span style={{ fontSize:11, color:T.ok, fontWeight:600, fontFamily:T.sans, whiteSpace:'nowrap' }}>✓ Key set</span>
                            )}
                        </div>
                        <div style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>
                            Your key is encrypted with AES-256-GCM before storage. It is never logged or transmitted in plaintext.
                        </div>
                    </div>
                )}
            </DataCard>

            {/* ── AI governance ── */}
            <DataCard title="AI · Governance" desc="Compliance metadata and danger-zone actions.">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:16, marginBottom:16 }}>
                    <FL label="DPA signed">
                        <input style={{ ...inpSt, cursor:'text' }} value={aiSettings.dpaSignedAt || ''} placeholder="YYYY-MM-DD" onChange={e => { setAiSettings(p => ({...p, dpaSignedAt:e.target.value})); setDirty(true); }}/>
                    </FL>
                    <FL label="Audit logging">
                        <select style={selSt} value={aiSettings.auditLogging || 'All AI requests · 13mo retention'} onChange={e => { setAiSettings(p => ({...p, auditLogging:e.target.value})); setDirty(true); }}>
                            <option>All AI requests · 13mo retention</option>
                            <option>Errors only</option>
                            <option>Disabled</option>
                        </select>
                    </FL>
                    <FL label="Block list (regex, comma-separated)">
                        <input style={inpSt} value={aiSettings.blockList || ''} placeholder="e.g. \bSSN\b, \bpassword\b" onChange={e => { setAiSettings(p => ({...p, blockList:e.target.value})); setDirty(true); }}/>
                    </FL>
                </div>
                <div style={{ padding:'14px 16px', background:'rgba(156,58,46,0.06)', borderLeft:`3px solid ${T.danger}`, borderRadius:4 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:T.danger, marginBottom:4 }}>Reset training data</div>
                    <div style={{ fontSize:12.5, color:T.inkMid, marginBottom:10 }}>Removes any data your workspace has contributed to model training. Takes up to 30 days at the provider.</div>
                    <DataBtn label="Request reset" danger onClick={() => setShowReset(true)}/>
                </div>
            </DataCard>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Dispatch — Skills & Certifications Detail
// ─────────────────────────────────────────────────────────────────────────────
// ── Shared dispatch row kebab (fixed-position, escapes overflow:hidden) ──────
// ── Module-scope components (must NOT be defined inside hooks or components) ──
const DspKebabBtn = ({ id, openId, onOpen }) => (
    <button onClick={e => onOpen(e, id)}
        style={{ background:'none', border:'none', cursor:'pointer', color:T.inkMuted, fontSize:16, fontWeight:700, padding:'0 2px', lineHeight:1, fontFamily:T.sans }}
        onMouseEnter={e=>e.currentTarget.style.color=T.ink}
        onMouseLeave={e=>e.currentTarget.style.color=T.inkMuted}>⋯</button>
);

const DspKebabMenu = ({ id, items, openId, rect, onClose }) => {
    if (openId !== id || !rect) return null;
    return (
        <>
            <div style={{ position:'fixed', inset:0, zIndex:9998 }} onClick={onClose}/>
            <div style={{ position:'fixed', top:rect.top, right:rect.right, zIndex:9999,
                background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2,
                boxShadow:'0 4px 16px rgba(42,38,34,0.12)', minWidth:148, overflow:'hidden' }}>
                {items.map((item, i) => (
                    item === 'divider' ? (
                        <div key={i} style={{ height:1, background:T.border }}/>
                    ) : (
                        <button key={i} disabled={item.disabled}
                            onClick={() => { if (!item.disabled) { item.action(); onClose(); } }}
                            style={{ display:'block', width:'100%', padding:'9px 14px', background:'none', border:'none',
                                borderTop: i>0 ? `1px solid ${T.border}` : 'none',
                                textAlign:'left', fontSize:13, cursor:item.disabled?'default':'pointer', fontFamily:T.sans,
                                color:item.danger ? T.danger : item.disabled ? T.inkMuted : T.ink, opacity:item.disabled?0.5:1 }}
                            onMouseEnter={e=>{ if(!item.disabled) e.currentTarget.style.background=T.surface2; }}
                            onMouseLeave={e=>e.currentTarget.style.background='none'}>
                            {item.label}
                            {item.disabled && item.disabledReason && (
                                <div style={{ fontSize:10.5, color:T.inkMuted, marginTop:2 }}>{item.disabledReason}</div>
                            )}
                        </button>
                    )
                ))}
            </div>
        </>
    );
};

// Hook returns state + open/close handlers only — components are at module scope above
const useDspKebab = () => {
    const [openId, setOpenId] = React.useState(null);
    const [rect,   setRect]   = React.useState(null);

    const open = React.useCallback((e, id) => {
        e.stopPropagation();
        if (openId === id) { setOpenId(null); setRect(null); return; }
        const r = e.currentTarget.getBoundingClientRect();
        setRect({ top: r.bottom + 4, right: window.innerWidth - r.right });
        setOpenId(id);
    }, [openId]);

    const close = React.useCallback(() => { setOpenId(null); setRect(null); }, []);

    // Convenience wrappers that bind the hook state — still module-scope components under the hood
    const KebabBtn  = React.useCallback(({ id }) => <DspKebabBtn  id={id} openId={openId} onOpen={open}/>,  [openId, open]);
    const KebabMenu = React.useCallback(({ id, items }) => <DspKebabMenu id={id} items={items} openId={openId} rect={rect} onClose={close}/>, [openId, rect, close]);

    return { openId, open, close, KebabBtn, KebabMenu };
};

const DispatchSkillsDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const savedSkills   = settings?.dispatchSkills   || [];
    const savedCerts    = settings?.dispatchCerts    || [];
    const savedLicenses = settings?.dispatchLicenses || ['Apprentice','Journeyman','Master','Lead'];
    const [skills,   setSkills]   = useState(() => JSON.parse(JSON.stringify(savedSkills)));
    const [certs,    setCerts]    = useState(() => JSON.parse(JSON.stringify(savedCerts)));
    const [licenses, setLicenses] = useState(() => [...savedLicenses]);
    const [dirty,    setDirty]    = useState(false);
    const [saving,   setSaving]   = useState(false);
    const [addingSkill, setAddingSkill] = useState(false);
    const [addingCert,  setAddingCert]  = useState(false);
    const [newSkill, setNewSkill] = useState({ name:'', category:'Field', color:'#7a5a3c' });
    const [editingSkill, setEditingSkill] = useState(null);
    const [editingCert,  setEditingCert]  = useState(null);
    // Kebab state — one per section, rendered outside the table to escape overflow:hidden
    const [skillMenu, setSkillMenu] = useState(null); // { id, idx, rect }
    const [certMenu,  setCertMenu]  = useState(null);
    const [licMenu,   setLicMenu]   = useState(null);
    const [newCert,  setNewCert]  = useState({ name:'', renewalDays:365 });

    const handleSave = async () => {
        setSaving(true);
        const payload = { dispatchSkills: skills, dispatchCerts: certs, dispatchLicenses: licenses };
        setSettings(prev => ({ ...prev, ...payload }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify(payload) }); }
        catch(e) { console.error('save dispatch skills', e); }
        setSaving(false); setDirty(false);
    };

    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    const SKILL_CATS = ['Field','Electrical','Plumbing','HVAC','Solar','Role','Other'];
    const COLORS = ['#7a5a3c','#3a5a7a','#b87333','#4d6b3d','#9c3a2e','#7a6a48','#2a2622'];

    return (
        <SPDetailPageChrome crumb="Skills & certifications" title="Skills & certifications"
            subtitle="Skills, certs, and license levels your dispatchers schedule around."
            onBack={onBack} dirty={dirty}
            onCancel={() => { setSkills(JSON.parse(JSON.stringify(savedSkills))); setCerts(JSON.parse(JSON.stringify(savedCerts))); setLicenses([...savedLicenses]); setDirty(false); }}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            extraActions={<button style={{ padding:'7px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:500, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Import preset</button>}>

            <CSectionCard title="Skills" desc="Skill names your crews are dispatched around (e.g. Refrigeration, Solar install, Panel upgrade).">
                <SPTable columns={[
                    { key:'name',  label:'Skill',         w:'1fr' },
                    { key:'cat',   label:'Category',      w:'110px' },
                    { key:'cert',  label:'Requires cert', w:'130px' },
                    { key:'color', label:'Color',         w:'50px' },
                    { key:'techs', label:'Techs',         w:'55px' },
                    { key:'more',  label:'',              w:'28px' },
                ]} rows={skills.map((s,i) => ({
                    name:  editingSkill===s.id ? <input autoFocus value={s.name} onChange={e=>{ const n=[...skills]; n[i]={...n[i],name:e.target.value}; setSkills(n); setDirty(true); }} onBlur={()=>setEditingSkill(null)} onKeyDown={e=>e.key==='Enter'&&setEditingSkill(null)} style={{ padding:'3px 7px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', width:'100%' }}/> : <span style={{ fontWeight:600, color:T.ink, fontFamily:T.sans }}>{s.name}</span>,
                    cat:   <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{s.category}</span>,
                    cert:  s.cert ? <span style={{ fontSize:11, padding:'1px 7px', borderRadius:8, background:`${T.info}14`, color:T.info, fontWeight:600 }}>{s.cert}</span> : <span style={{ fontSize:11, color:T.inkMuted, fontStyle:'italic' }}>—</span>,
                    color: <span style={{ display:'inline-block', width:18, height:18, borderRadius:3, background:s.color, border:`1px solid ${T.border}` }}/>,
                    techs: <span style={{ fontSize:12, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{s.techs||0}</span>,
                    more:  <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setSkillMenu(skillMenu?.id===s.id?null:{id:s.id,idx:i,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>,
                }))}/>
                    <div style={{ display:'flex', gap:8, alignItems:'center', padding:'10px 0', flexWrap:'wrap' }}>
                        <input value={newSkill.name} onChange={e=>setNewSkill(p=>({...p,name:e.target.value}))} placeholder="Skill name" autoFocus
                            style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', flex:1, minWidth:120 }}/>
                        <select value={newSkill.category} onChange={e=>setNewSkill(p=>({...p,category:e.target.value}))}
                            style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}>
                            {SKILL_CATS.map(c=><option key={c}>{c}</option>)}
                        </select>
                        <div style={{ display:'flex', gap:4 }}>
                            {COLORS.map(c=>(
                                <div key={c} onClick={()=>setNewSkill(p=>({...p,color:c}))}
                                    style={{ width:20, height:20, borderRadius:3, background:c, cursor:'pointer', outline:newSkill.color===c?`2px solid ${T.ink}`:'none', outlineOffset:1 }}/>
                            ))}
                        </div>
                        <button onClick={()=>{ if(!newSkill.name.trim()) return; setSkills(p=>[...p,{id:'sk_'+Date.now(),...newSkill}]); setNewSkill({name:'',category:'Field',color:'#7a5a3c'}); setAddingSkill(false); setDirty(true); }}
                            style={{ padding:'6px 12px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                        <button onClick={()=>setAddingSkill(false)}
                            style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    </div>
                ) : (
                    <button onClick={()=>setAddingSkill(true)}
                        style={{ marginTop:10, padding:'6px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, fontWeight:600, color:T.ink, borderRadius:T.r, fontSize:12.5, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>
                        + Add skill
                    </button>
                )}
            </CSectionCard>

            <CSectionCard title="Certifications" desc="Certs with expiry tracking. Expired certs block auto-scheduling.">
                <SPTable columns={[
                    { key:'name',    label:'Cert',         w:'1fr' },
                    { key:'gates',   label:'Gates skill',  w:'1fr' },
                    { key:'renewal', label:'Renewal',      w:'100px' },
                    { key:'holding', label:'Techs',        w:'60px' },
                    { key:'exp30',   label:'Expiring 30d', w:'90px' },
                    { key:'more',    label:'',             w:'28px' },
                ]} rows={certs.map((c,i) => ({
                    name:    editingCert===c.id ? <input autoFocus value={c.name} onChange={e=>{ const n=[...certs]; n[i]={...n[i],name:e.target.value}; setCerts(n); setDirty(true); }} onBlur={()=>setEditingCert(null)} onKeyDown={e=>e.key==='Enter'&&setEditingCert(null)} style={{ padding:'3px 7px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', width:'100%' }}/> : <span style={{ fontWeight:600, color:T.ink, fontFamily:T.sans }}>{c.name}</span>,
                    gates:   c.gatesSkill ? <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{c.gatesSkill}</span> : <span style={{ fontSize:11, color:T.inkMuted, fontStyle:'italic' }}>none — informational</span>,
                    renewal: <span style={{ fontSize:12, fontFamily:'ui-monospace,Menlo,monospace', color:T.inkMid }}>{Math.round((c.renewalDays||365)/30)} months</span>,
                    holding: <span style={{ fontSize:12, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{c.techsHolding||0}</span>,
                    exp30:   (c.expiringIn30d||0)>0 ? <span style={{ fontSize:12, fontWeight:700, color:T.warn }}>{c.expiringIn30d} ⚠</span> : <span style={{ fontSize:12, color:T.inkMuted }}>0</span>,
                    more:    <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setCertMenu(certMenu?.id===c.id?null:{id:c.id,idx:i,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>,
                }))}/>
                    <div style={{ display:'flex', gap:8, alignItems:'center', padding:'10px 0' }}>
                        <input value={newCert.name} onChange={e=>setNewCert(p=>({...p,name:e.target.value}))} placeholder="Cert name e.g. EPA 608" autoFocus
                            style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', flex:1 }}/>
                        <input type="number" value={newCert.renewalDays} onChange={e=>setNewCert(p=>({...p,renewalDays:parseInt(e.target.value)||365}))}
                            style={{ width:70, padding:'6px 8px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}/>
                        <span style={{ fontSize:12, color:T.inkMid }}>days</span>
                        <button onClick={()=>{ if(!newCert.name.trim()) return; setCerts(p=>[...p,{id:'cert_'+Date.now(),...newCert}]); setNewCert({name:'',renewalDays:365}); setAddingCert(false); setDirty(true); }}
                            style={{ padding:'6px 12px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                        <button onClick={()=>setAddingCert(false)}
                            style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    </div>
                ) : (
                    <button onClick={()=>setAddingCert(true)}
                        style={{ marginTop:10, padding:'6px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, fontWeight:600, color:T.ink, borderRadius:T.r, fontSize:12.5, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>
                        + Add certification
                    </button>
                )}
            </CSectionCard>

            <CSectionCard title="License levels" desc="Ordered hierarchy. Jobs specify a minimum level required.">
                <div style={{ border:`1px solid ${T.border}`, borderRadius:T.r, overflow:'visible' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 70px 100px 28px', gap:12, padding:'8px 14px', background:T.surface2, fontSize:10, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.5, fontFamily:T.sans, borderBottom:`1px solid ${T.border}` }}>
                        <div>Rank</div><div>Name</div><div>Techs</div><div>Jobs requiring</div><div/>
                    </div>
                    {licenses.map((l,i)=>(
                        <div key={i} style={{ display:'grid', gridTemplateColumns:'40px 1fr 70px 100px 28px', gap:12, padding:'10px 14px', alignItems:'center', borderBottom:i<licenses.length-1?`1px solid ${T.border}`:'none', fontSize:13, fontFamily:T.sans }}>
                            <span style={{ fontSize:11, fontWeight:700, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>{i+1}</span>
                            <input value={l} onChange={e=>{ const n=[...licenses]; n[i]=e.target.value; setLicenses(n); setDirty(true); }}
                                style={{ border:'none', outline:'none', background:'transparent', fontSize:13, fontWeight:600, color:T.ink, fontFamily:T.sans, width:'100%' }}/>
                            <span style={{ fontSize:12, color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace' }}>—</span>
                            <span style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>—</span>
                            <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setLicMenu(licMenu?.id===`lic_${i}`?null:{id:`lic_${i}`,idx:i,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>
                        </div>
                    ))}
                </div>
                <button onClick={()=>{ setLicenses(p=>[...p,'New level']); setDirty(true); }}
                    style={{ marginTop:8, padding:'6px 12px', background:T.surface, border:`1px solid ${T.borderStrong}`, fontWeight:600, color:T.ink, borderRadius:T.r, fontSize:12.5, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>
                    + Add level
                </button>
            </CSectionCard>

            {/* ── Skill row kebab dropdown ── */}
            {skillMenu && skillMenu.rect && (() => {
                const s = skills[skillMenu.idx];
                if (!s) return null;
                return (
                    <>
                        <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setSkillMenu(null)}/>
                        <div style={{position:'fixed',top:skillMenu.rect.top,right:skillMenu.rect.right,zIndex:9999,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.r+2,boxShadow:'0 4px 16px rgba(42,38,34,0.12)',minWidth:140,overflow:'hidden'}}>
                            <button onClick={()=>{setEditingSkill(s.id);setSkillMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Edit</button>
                            <button onClick={()=>{if((s.techs||0)>0)return;setSkills(prev=>prev.filter((_,ri)=>ri!==skillMenu.idx));setDirty(true);setSkillMenu(null);}} disabled={(s.techs||0)>0} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:(s.techs||0)>0?T.inkMuted:T.danger,cursor:(s.techs||0)>0?'default':'pointer',fontFamily:T.sans,opacity:(s.techs||0)>0?0.5:1}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                Delete{(s.techs||0)>0 && <div style={{fontSize:10.5,color:T.inkMuted,marginTop:2}}>Used by {s.techs} tech{s.techs===1?'':'s'}</div>}
                            </button>
                        </div>
                    </>
                );
            })()}

            {/* ── Cert row kebab dropdown ── */}
            {certMenu && certMenu.rect && (() => {
                const c = certs[certMenu.idx];
                if (!c) return null;
                return (
                    <>
                        <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setCertMenu(null)}/>
                        <div style={{position:'fixed',top:certMenu.rect.top,right:certMenu.rect.right,zIndex:9999,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.r+2,boxShadow:'0 4px 16px rgba(42,38,34,0.12)',minWidth:140,overflow:'hidden'}}>
                            <button onClick={()=>{setEditingCert(c.id);setCertMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Edit</button>
                            <button onClick={()=>{if((c.techsHolding||0)>0)return;setCerts(prev=>prev.filter((_,ri)=>ri!==certMenu.idx));setDirty(true);setCertMenu(null);}} disabled={(c.techsHolding||0)>0} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:(c.techsHolding||0)>0?T.inkMuted:T.danger,cursor:(c.techsHolding||0)>0?'default':'pointer',fontFamily:T.sans,opacity:(c.techsHolding||0)>0?0.5:1}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                Delete{(c.techsHolding||0)>0 && <div style={{fontSize:10.5,color:T.inkMuted,marginTop:2}}>Held by {c.techsHolding} tech{c.techsHolding===1?'':'s'}</div>}
                            </button>
                        </div>
                    </>
                );
            })()}

            {/* ── License row kebab dropdown ── */}
            {licMenu && licMenu.rect && (() => {
                const i = licMenu.idx;
                return (
                    <>
                        <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setLicMenu(null)}/>
                        <div style={{position:'fixed',top:licMenu.rect.top,right:licMenu.rect.right,zIndex:9999,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.r+2,boxShadow:'0 4px 16px rgba(42,38,34,0.12)',minWidth:140,overflow:'hidden'}}>
                            <button onClick={()=>setLicMenu(null)} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Rename</button>
                            <button onClick={()=>{if(licenses.length<=1)return;setLicenses(p=>p.filter((_,ri)=>ri!==i));setDirty(true);setLicMenu(null);}} disabled={licenses.length<=1} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:licenses.length<=1?T.inkMuted:T.danger,cursor:licenses.length<=1?'default':'pointer',fontFamily:T.sans,opacity:licenses.length<=1?0.5:1}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                                Delete{licenses.length<=1 && <div style={{fontSize:10.5,color:T.inkMuted,marginTop:2}}>Need at least one level</div>}
                            </button>
                        </div>
                    </>
                );
            })()}
        </SPDetailPageChrome>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Dispatch — Vehicles & Equipment Detail
// ─────────────────────────────────────────────────────────────────────────────
const DispatchVehiclesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved = settings?.dispatchVehicles || [];
    const [vehicles, setVehicles] = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty,    setDirty]    = useState(false);
    const [saving,   setSaving]   = useState(false);
    const [showAdd,  setShowAdd]  = useState(false);
    const [newV,     setNewV]     = useState({ name:'', type:'Van', plate:'', notes:'' });
    const savedEquipment = settings?.dispatchEquipment || [];
    const [equipment, setEquipment] = useState(() => JSON.parse(JSON.stringify(savedEquipment)));
    const [showAddEquip, setShowAddEquip] = useState(false);
    const [newEquip, setNewEquip] = useState({ name:'', qty:1, share:true, notes:'' });
    const [vehMenu,   setVehMenu]   = useState(null);
    const [equipMenu, setEquipMenu] = useState(null);

    const handleSave = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, dispatchVehicles: vehicles }));
        try { await dbFetch('/.netlify/functions/settings', { method:'PUT', body: JSON.stringify({ dispatchVehicles: vehicles }) }); }
        catch(e) { console.error('save vehicles', e); }
        setSaving(false); setDirty(false);
    };

    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    const TYPES = ['Van','Truck','Car','Trailer','Other'];
    return (
        <SPDetailPageChrome crumb="Vehicles & equipment" title="Vehicles & equipment"
            subtitle="Fleet vehicles available to assign to techs."
            onBack={onBack} dirty={dirty}
            onCancel={() => { setVehicles(JSON.parse(JSON.stringify(saved))); setDirty(false); }}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            extraActions={
                <>
                    <button style={{ padding:'7px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:500, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Export CSV</button>
                    <button onClick={()=>setShowAdd(true)} style={{ padding:'7px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ Add vehicle</button>
                </>
            }>
            <CSectionCard title="Fleet vehicles" desc="Assign vehicles to techs in Settings → People & Teams.">
                <SPTable columns={[
                    { key:'name',   label:'Vehicle',          w:'1.2fr' },
                    { key:'kind',   label:'Kind',             w:'110px' },
                    { key:'payload',label:'Payload',          w:'90px' },
                    { key:'tech',   label:'Assigned to',      w:'1fr' },
                    { key:'equip',  label:'On-board equipment', w:'1.5fr' },
                    { key:'status', label:'Status',           w:'80px' },
                    { key:'more',   label:'',                 w:'28px' },
                ]} rows={vehicles.map((v,i)=>({
                    name:   <span style={{ fontWeight:600, color:T.ink, fontFamily:T.sans }}>{v.name}</span>,
                    kind:   <span style={{ fontSize:12, color:T.inkMid, fontFamily:T.sans }}>{v.type||v.kind||'—'}</span>,
                    payload:<span style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans }}>{v.payload||'—'}</span>,
                    tech:   v.assignedTo && v.assignedTo!=='—' ? <span style={{ fontSize:12, fontWeight:500, color:T.ink, fontFamily:T.sans }}>{v.assignedTo}</span> : <span style={{ fontSize:11.5, color:T.inkMuted, fontStyle:'italic' }}>Unassigned</span>,
                    equip:  <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>{(v.equip||[]).map(e=><span key={e} style={{ fontSize:10.5, padding:'1px 6px', borderRadius:4, background:T.surface2, border:`1px solid ${T.border}`, color:T.inkMid }}>{e}</span>)}</div>,
                    status: <span style={{ fontSize:11, padding:'2px 8px', borderRadius:3, fontWeight:600, background:v.status==='Active'?`${T.ok}14`:`${T.warn}14`, color:v.status==='Active'?T.ok:T.warn }}>{v.status||'Active'}</span>,
                    more:   <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setVehMenu(vehMenu?.id===v.id?null:{id:v.id,idx:i,v,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>,
                }))}/>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 90px 100px 1.5fr auto auto', gap:8, alignItems:'center', padding:'10px 0' }}>
                        <input value={newV.name} onChange={e=>setNewV(p=>({...p,name:e.target.value}))} placeholder="Van 1, Truck A…" autoFocus
                            style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none' }}/>
                        <select value={newV.type} onChange={e=>setNewV(p=>({...p,type:e.target.value}))}
                            style={{ padding:'6px 8px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}>
                            {TYPES.map(t=><option key={t}>{t}</option>)}
                        </select>
                        <input value={newV.plate} onChange={e=>setNewV(p=>({...p,plate:e.target.value}))} placeholder="Plate #"
                            style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}/>
                        <input value={newV.notes} onChange={e=>setNewV(p=>({...p,notes:e.target.value}))} placeholder="e.g. Recovery cart, MC4 kit"
                            style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}/>
                        <button onClick={()=>{ if(!newV.name.trim()) return; setVehicles(p=>[...p,{id:'v_'+Date.now(),...newV}]); setNewV({name:'',type:'Van',plate:'',notes:''}); setShowAdd(false); setDirty(true); }}
                            style={{ padding:'6px 12px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                        <button onClick={()=>setShowAdd(false)}
                            style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    </div>
                ) : null}
            </CSectionCard>

            <CSectionCard title="Shared equipment" desc="Tools/kits stored at HQ or shared across vehicles. Match scoring deducts when a job needs an item that isn't available.">
                <SPTable columns={[
                    { key:'name',  label:'Item',           w:'1.5fr' },
                    { key:'qty',   label:'Quantity',       w:'80px' },
                    { key:'share', label:'Shared / Per-van', w:'110px' },
                    { key:'notes', label:'Notes',          w:'1.5fr' },
                    { key:'more',  label:'',               w:'28px' },
                ]} rows={equipment.map((eq,i)=>({name:  <span style={{ fontWeight:600, color:T.ink, fontFamily:T.sans }}>{eq.name}</span>,
                    qty:   <span style={{ fontSize:12, fontFamily:'ui-monospace,Menlo,monospace', color:T.inkMid }}>{eq.qty||1}</span>,
                    share: <span style={{ fontSize:11, padding:'2px 8px', borderRadius:3, fontWeight:600, background:eq.share?`${T.info}14`:`${T.ok}14`, color:eq.share?T.info:T.ok }}>{eq.share?'Shared':'Per-van'}</span>,
                    notes: <span style={{ fontSize:11.5, color:T.inkMuted, fontFamily:T.sans }}>{eq.notes||'—'}</span>,
                    more:  <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setEquipMenu(equipMenu?.id===eq.id?null:{id:eq.id,idx:i,eq,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>,
                }))}/>
                {showAddEquip ? (
                    <div style={{ display:'grid', gridTemplateColumns:'1.5fr 70px 110px 1.5fr auto auto', gap:8, alignItems:'center', padding:'10px 0' }}>
                        <input value={newEquip.name} onChange={e=>setNewEquip(p=>({...p,name:e.target.value}))} placeholder="Item name" autoFocus style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none' }}/>
                        <input type="number" value={newEquip.qty} onChange={e=>setNewEquip(p=>({...p,qty:parseInt(e.target.value)||1}))} style={{ padding:'6px 8px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}/>
                        <select value={newEquip.share?'Shared':'Per-van'} onChange={e=>setNewEquip(p=>({...p,share:e.target.value==='Shared'}))} style={{ padding:'6px 8px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}><option>Shared</option><option>Per-van</option></select>
                        <input value={newEquip.notes} onChange={e=>setNewEquip(p=>({...p,notes:e.target.value}))} placeholder="Notes" style={{ padding:'6px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12, fontFamily:T.sans, outline:'none' }}/>
                        <button onClick={()=>{if(!newEquip.name.trim())return;setEquipment(p=>[...p,{id:'eq_'+Date.now(),...newEquip}]);setNewEquip({name:'',qty:1,share:true,notes:''});setShowAddEquip(false);setDirty(true);}} style={{ padding:'6px 12px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>Add</button>
                        <button onClick={()=>setShowAddEquip(false)} style={{ padding:'6px 10px', background:'transparent', color:T.inkMid, border:`1px solid ${T.border}`, borderRadius:T.r, fontSize:12, cursor:'pointer', fontFamily:T.sans }}>Cancel</button>
                    </div>
                ) : (
                    <button onClick={()=>setShowAddEquip(true)} style={{ marginTop:10, padding:'6px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:600, color:T.ink, cursor:'pointer', fontFamily:T.sans }}>+ Add item</button>
                )}
            </CSectionCard>

            {/* ── Vehicle row kebab ── */}
            {vehMenu && vehMenu.rect && (() => {
                const {idx, v} = vehMenu;
                const assigned = v.assignedTo && v.assignedTo !== '—';
                return (<>
                    <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setVehMenu(null)}/>
                    <div style={{position:'fixed',top:vehMenu.rect.top,right:vehMenu.rect.right,zIndex:9999,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.r+2,boxShadow:'0 4px 16px rgba(42,38,34,0.12)',minWidth:148,overflow:'hidden'}}>
                        <button onClick={()=>setVehMenu(null)} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Edit</button>
                        <button onClick={()=>{const n=[...vehicles];n[idx]={...n[idx],status:v.status==='Active'?'In shop':'Active'};setVehicles(n);setDirty(true);setVehMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>{v.status==='Active'?'Mark in shop':'Mark active'}</button>
                        <button onClick={()=>{if(assigned)return;setVehicles(p=>p.filter((_,ri)=>ri!==idx));setDirty(true);setVehMenu(null);}} disabled={assigned} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:assigned?T.inkMuted:T.danger,cursor:assigned?'default':'pointer',fontFamily:T.sans,opacity:assigned?0.5:1}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>
                            Delete{assigned&&<div style={{fontSize:10.5,color:T.inkMuted,marginTop:2}}>Assigned to {v.assignedTo}</div>}
                        </button>
                    </div>
                </>);
            })()}

            {/* ── Equipment row kebab ── */}
            {equipMenu && equipMenu.rect && (() => {
                const {idx, eq} = equipMenu;
                return (<>
                    <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setEquipMenu(null)}/>
                    <div style={{position:'fixed',top:equipMenu.rect.top,right:equipMenu.rect.right,zIndex:9999,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.r+2,boxShadow:'0 4px 16px rgba(42,38,34,0.12)',minWidth:148,overflow:'hidden'}}>
                        <button onClick={()=>setEquipMenu(null)} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Edit</button>
                        <button onClick={()=>{const n=[...equipment];n[idx]={...n[idx],share:!eq.share};setEquipment(n);setDirty(true);setEquipMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Toggle shared / per-van</button>
                        <button onClick={()=>{setEquipment(p=>p.filter((_,ri)=>ri!==idx));setDirty(true);setEquipMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:T.danger,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>Delete</button>
                    </div>
                </>);
            })()}
        </SPDetailPageChrome>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Dispatch — Crews Detail
// ─────────────────────────────────────────────────────────────────────────────
const DispatchCrewsDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved = settings?.dispatchCrews || [];
    const skills = settings?.dispatchSkills || [];
    const vehicles = settings?.dispatchVehicles || [];
    const users = (settings?.users || []).filter(u => u.dispatchEnabled);

    const [crews, setCrews] = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty, setDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [selectedId, setSelectedId] = useState(saved[0]?.id || null);
    const [showAddMember, setShowAddMember] = useState(false);
    const [showAdd, setShowAdd] = useState(false);
    const [newCrew, setNewCrew] = useState({ name: '', area: '', color: '#3a5a7a', defaultVehicle: '' });

    const selectedCrew = crews.find(c => c.id === selectedId);

    const handleSave = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, dispatchCrews: crews }));
        try { await dbFetch('/.netlify/functions/settings', { method: 'PUT', body: JSON.stringify({ dispatchCrews: crews }) }); }
        catch(e) { console.error('save crews', e); }
        setSaving(false); setDirty(false);
    };

    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    const CREW_COLORS = ['#3a5a7a','#4d6b3d','#b87333','#9c3a2e','#7a6a48','#8a8378','#2a2622'];

    const addCrew = () => {
        if (!newCrew.name.trim()) return;
        const id = 'crew_' + crypto.randomUUID();
        setCrews(prev => [...prev, { id, ...newCrew, members: [], lead: null, activeJobs: 0, hoursWeek: 0 }]);
        setSelectedId(id);
        setNewCrew({ name: '', area: '', color: '#3a5a7a', defaultVehicle: '' });
        setShowAdd(false); setDirty(true);
    };

    const updateCrew = (field, val) => {
        setCrews(prev => prev.map(c => c.id === selectedId ? { ...c, [field]: val } : c));
        setDirty(true);
    };

    const toggleMember = (userId) => {
        setCrews(prev => prev.map(c => {
            if (c.id !== selectedId) return c;
            const members = c.members || [];
            const next = members.includes(userId) ? members.filter(m => m !== userId) : [...members, userId];
            return { ...c, members: next };
        }));
        setDirty(true);
    };

    return (
        <SPDetailPageChrome crumb="Dispatch · Crews" title="Crews"
            subtitle="Named groups of techs who work together in the field. Distinct from CRM Sales teams (which structure reps for reporting)."
            onBack={onBack} dirty={dirty}
            onCancel={() => { setCrews(JSON.parse(JSON.stringify(saved))); setDirty(false); }}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            extraActions={
                <>
                    <button style={{ padding:'7px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:500, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Import preset</button>
                    <button onClick={()=>setShowAdd(true)} style={{ padding:'7px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ New crew</button>
                </>
            }>

            {/* Disambiguation banner */}
            <div style={{ background: `${T.info}0e`, border: `1px solid ${T.info}30`, borderRadius: T.r, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: T.inkMid, fontFamily: T.sans }}>
                <strong style={{ color: T.ink }}>Crews ≠ Sales teams.</strong> A crew is an operational group of techs who share vehicles and coverage. Sales teams group reps for reporting and live under People & Teams. A user can belong to both.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16 }}>
                {/* Left — crew list */}
                <div>
                    <div style={{ fontFamily: T.sans }}>
                        {crews.map(crew => (
                            <div key={crew.id} onClick={() => setSelectedId(crew.id)}
                                style={{ padding: '12px 14px', marginBottom: 6, borderRadius: T.r, cursor: 'pointer',
                                    background: T.surface, border: `1.5px solid ${selectedId === crew.id ? T.goldInk : T.border}`,
                                    borderLeft: `4px solid ${crew.color || T.inkMuted}`,
                                    boxShadow: selectedId === crew.id ? '0 2px 8px rgba(42,38,34,0.08)' : 'none' }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 3 }}>{crew.name}</div>
                                <div style={{ fontSize: 11, color: T.inkMuted, marginBottom: 6 }}>{crew.area || 'No area set'}</div>
                                <div style={{ display: 'flex', gap: 4 }}>
                                    {(crew.members || []).slice(0, 4).map(uid => {
                                        const u = users.find(u => u.id === uid || u.name === uid);
                                        return u ? (
                                            <div key={uid} style={{ width: 22, height: 22, borderRadius: '50%', background: T.ink, color: '#fbf8f3', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {(u.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}
                                            </div>
                                        ) : null;
                                    })}
                                    {(crew.members || []).length > 4 && <span style={{ fontSize: 10, color: T.inkMuted }}>+{crew.members.length - 4}</span>}
                                </div>
                                <div style={{ fontSize: 10.5, color: T.inkMuted, marginTop: 6 }}>
                                    {crew.activeJobs || 0} jobs · {crew.hoursWeek || 0}h
                                </div>
                            </div>
                        ))}
                        {showAdd ? (
                            <div style={{ padding: '10px 12px', background: T.surface, border: `1px solid ${T.borderStrong}`, borderRadius: T.r }}>
                                <input value={newCrew.name} onChange={e => setNewCrew(p => ({...p, name: e.target.value}))} placeholder="Crew name" autoFocus
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 13, fontFamily: T.sans, outline: 'none', marginBottom: 6, boxSizing: 'border-box' }}/>
                                <input value={newCrew.area} onChange={e => setNewCrew(p => ({...p, area: e.target.value}))} placeholder="Coverage area"
                                    style={{ width: '100%', padding: '6px 8px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 12, fontFamily: T.sans, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }}/>
                                <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                                    {CREW_COLORS.map(c => <div key={c} onClick={() => setNewCrew(p=>({...p,color:c}))}
                                        style={{ width: 18, height: 18, borderRadius: 3, background: c, cursor: 'pointer', outline: newCrew.color===c?`2px solid ${T.ink}`:'none', outlineOffset: 1 }}/>)}
                                </div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={addCrew} style={{ flex: 1, padding: '5px 0', background: T.ink, color: '#fbf8f3', border: 'none', borderRadius: T.r, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>Add</button>
                                    <button onClick={() => setShowAdd(false)} style={{ flex: 1, padding: '5px 0', background: 'transparent', color: T.inkMid, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, cursor: 'pointer', fontFamily: T.sans }}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <button onClick={() => setShowAdd(true)}
                                style={{ width: '100%', padding: '8px 0', background: 'transparent', border: `1px dashed ${T.borderStrong}`, borderRadius: T.r, fontSize: 12.5, color: T.inkMid, cursor: 'pointer', fontFamily: T.sans }}>
                                + New crew
                            </button>
                        )}
                    </div>
                </div>

                {/* Right — crew detail */}
                {selectedCrew ? (
                    <div>
                        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2, padding: '16px 18px', marginBottom: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                                <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, fontFamily: T.sans }}>{selectedCrew.name}</div>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => { const clone = {...selectedCrew, id:'crew_'+Date.now(), name:selectedCrew.name+' (copy)', members:[]}; setCrews(p=>[...p,clone]); setSelectedId(clone.id); setDirty(true); }}
                                        style={{ padding: '5px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, cursor: 'pointer', fontFamily: T.sans, color: T.ink }}>Duplicate</button>
                                    <button onClick={() => { setCrews(p=>p.filter(c=>c.id!==selectedId)); setSelectedId(crews.find(c=>c.id!==selectedId)?.id||null); setDirty(true); }}
                                        style={{ padding: '5px 12px', background: T.surface2, border: `1px solid ${T.border}`, borderRadius: T.r, fontSize: 12, cursor: 'pointer', fontFamily: T.sans, color: T.danger }}>Archive</button>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>Crew name</div>
                                    <input value={selectedCrew.name} onChange={e => updateCrew('name', e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box', background: T.surface }}/>
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>Color</div>
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                        {CREW_COLORS.map(c => <div key={c} onClick={() => updateCrew('color', c)}
                                            style={{ width: 22, height: 22, borderRadius: 3, background: c, cursor: 'pointer', outline: selectedCrew.color===c?`2px solid ${T.ink}`:'none', outlineOffset: 1 }}/>)}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>Default coverage area</div>
                                    <input value={selectedCrew.area || ''} onChange={e => updateCrew('area', e.target.value)}
                                        placeholder="e.g. Berkeley · Oakland · Alameda"
                                        style={{ width: '100%', padding: '7px 10px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 13, fontFamily: T.sans, outline: 'none', boxSizing: 'border-box', background: T.surface }}/>
                                </div>
                                <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 5, fontFamily: T.sans }}>Default vehicle</div>
                                    <select value={selectedCrew.defaultVehicle || ''} onChange={e => updateCrew('defaultVehicle', e.target.value)}
                                        style={{ width: '100%', padding: '7px 10px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 13, fontFamily: T.sans, outline: 'none', background: T.surface, boxSizing: 'border-box' }}>
                                        <option value="">— None —</option>
                                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.type})</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Members card — matching design spec */}
                        {(() => {
                            const memberIds = selectedCrew.members || [];
                            const memberUsers = memberIds.map(id => users.find(u => (u.id||u.name) === id)).filter(Boolean);
                            const nonMembers = users.filter(u => !memberIds.includes(u.id||u.name));

                            return (
                                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2, padding: '16px 18px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: T.sans }}>Members</div>
                                            <div style={{ fontSize: 11.5, color: T.inkMuted, fontFamily: T.sans }}>Techs assigned to this crew. Crew lead is starred.</div>
                                        </div>
                                        <button onClick={() => setShowAddMember(p => !p)}
                                            style={{ padding: '5px 12px', background: T.surface2, border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 12.5, fontWeight: 600, color: T.ink, cursor: 'pointer', fontFamily: T.sans }}>
                                            + Add member
                                        </button>
                                    </div>

                                    {memberUsers.length === 0 ? (
                                        <div style={{ padding: '1.5rem', textAlign: 'center', color: T.inkMuted, fontSize: 12.5, fontStyle: 'italic', fontFamily: T.sans, border: `1px dashed ${T.borderStrong}`, borderRadius: T.r }}>
                                            No members yet. Click "+ Add member" to assign techs to this crew.
                                        </div>
                                    ) : (
                                        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                                            {/* Header */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 110px 100px 1.2fr 80px 28px', gap: 10, padding: '8px 12px', background: T.surface2, fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans }}>
                                                <div>Tech</div><div>Role</div><div>License</div><div>Top skills</div><div>Hours</div><div/>
                                            </div>
                                            {/* Member rows */}
                                            {memberUsers.map((u, i) => {
                                                const uid = u.id || u.name;
                                                const isLead = selectedCrew.lead === uid;
                                                const userSkills = (u.dispatchSkills || []).slice(0, 3).map(id => skills.find(s => s.id === id)).filter(Boolean);
                                                const hoursUsed = u.hoursThisWeek || 0;
                                                const hoursCap  = u.hoursCap || 40;
                                                const over = hoursUsed > hoursCap;
                                                return (
                                                    <div key={uid} style={{ display: 'grid', gridTemplateColumns: '1.4fr 110px 100px 1.2fr 80px 28px', gap: 10, padding: '11px 12px', alignItems: 'center', fontSize: 12.5, fontFamily: T.sans, borderTop: i > 0 ? `1px solid ${T.border}` : 'none', background: T.surface }}>
                                                        {/* Tech name + avatar */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                            <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.ink, color: '#fbf8f3', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                {(u.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 600, color: T.ink }}>
                                                                    {u.name} {isLead && <span style={{ color: T.goldInk, fontSize: 13 }}>★</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {/* Role / make lead */}
                                                        <div>
                                                            <button onClick={() => updateCrew('lead', isLead ? null : uid)}
                                                                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3,
                                                                    border: `1px solid ${isLead ? T.goldInk : T.border}`,
                                                                    background: isLead ? `${T.goldInk}14` : 'transparent',
                                                                    color: isLead ? T.goldInk : T.inkMid, cursor: 'pointer', fontFamily: T.sans }}>
                                                                {isLead ? 'Crew lead' : 'Tech'}
                                                            </button>
                                                        </div>
                                                        {/* License */}
                                                        <div>
                                                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 3, background: `${T.info}14`, color: T.info, fontWeight: 600 }}>
                                                                {u.dispatchLicense || 'Apprentice'}
                                                            </span>
                                                        </div>
                                                        {/* Skills */}
                                                        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                                            {userSkills.map(s => (
                                                                <span key={s.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${s.color}14`, color: s.color, fontWeight: 600, border: `1px solid ${s.color}30` }}>{s.name}</span>
                                                            ))}
                                                            {(u.dispatchSkills||[]).length > 3 && <span style={{ fontSize: 10, color: T.inkMuted }}>+{(u.dispatchSkills||[]).length - 3}</span>}
                                                        </div>
                                                        {/* Hours bar */}
                                                        <div>
                                                            <div style={{ fontSize: 10.5, fontFamily: 'ui-monospace,Menlo,monospace', color: over ? T.danger : T.inkMid, marginBottom: 2 }}>
                                                                {hoursUsed}/{hoursCap}h
                                                            </div>
                                                            <div style={{ height: 3, background: T.surface2, borderRadius: 2, overflow: 'hidden' }}>
                                                                <div style={{ height: '100%', width: `${Math.min(hoursUsed/hoursCap,1)*100}%`, background: over ? T.danger : hoursUsed >= hoursCap*0.9 ? T.warn : T.ok }}/>
                                                            </div>
                                                        </div>
                                                        {/* Kebab — remove from crew */}
                                                        <button onClick={() => toggleMember(uid)}
                                                            title="Remove from crew"
                                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkMuted, fontSize: 13, padding: 0, fontFamily: T.sans }}
                                                            onMouseEnter={e=>e.currentTarget.style.color=T.danger}
                                                            onMouseLeave={e=>e.currentTarget.style.color=T.inkMuted}>×</button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Add member picker — inline expandable */}
                                    {showAddMember && (
                                        <div style={{ marginTop: 12 }}>
                                            {nonMembers.length === 0 ? (
                                                <div style={{ fontSize: 12.5, color: T.inkMuted, fontStyle: 'italic', fontFamily: T.sans, padding: '8px 0' }}>All dispatch-enabled techs are already in this crew.</div>
                                            ) : (
                                                <div style={{ border: `1px solid ${T.borderStrong}`, borderRadius: T.r, overflow: 'hidden', background: T.surface }}>
                                                    <div style={{ padding: '8px 12px', background: T.surface2, fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans }}>
                                                        Available techs — click to add
                                                    </div>
                                                    {nonMembers.map((u, i) => {
                                                        const userSkills = (u.dispatchSkills || []).slice(0, 2).map(id => skills.find(s => s.id === id)).filter(Boolean);
                                                        return (
                                                            <div key={u.id||u.name}
                                                                onClick={() => { toggleMember(u.id||u.name); }}
                                                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: i > 0 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', transition: 'background 80ms' }}
                                                                onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                                                                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.ink, color: '#fbf8f3', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                                    {(u.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}
                                                                </div>
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, fontFamily: T.sans }}>{u.name}</div>
                                                                    <div style={{ display: 'flex', gap: 5, marginTop: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                                                                        <span style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>{u.dispatchLicense || 'Apprentice'}</span>
                                                                        {userSkills.map(s => (
                                                                            <span key={s.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${s.color}14`, color: s.color, fontWeight: 600, border: `1px solid ${s.color}30` }}>{s.name}</span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <span style={{ fontSize: 12, color: T.ok, fontWeight: 700, fontFamily: T.sans, flexShrink: 0 }}>+ Add</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2, color: T.inkMuted, fontSize: 13, fontStyle: 'italic', fontFamily: T.sans }}>
                        Select a crew to edit its members and settings.
                    </div>
                )}
            </div>
        </SPDetailPageChrome>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Dispatch — Tech Profiles Detail
// ─────────────────────────────────────────────────────────────────────────────
const DispatchTechDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const users = (settings?.users || []).filter(u => u.dispatchEnabled);
    const skills = settings?.dispatchSkills || [];
    const certs  = settings?.dispatchCerts  || [];
    const licenses = settings?.dispatchLicenses || ['Apprentice','Journeyman','Master','Lead'];
    const vehicles = settings?.dispatchVehicles || [];
    const crews  = settings?.dispatchCrews  || [];

    const [filter, setFilter] = useState('All techs');
    const [dirty, setDirty] = useState(false);
    const techKebab = useDspKebab();

    const handleSave = async () => {};
    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);

    const activeTechs = users.filter(u => u.dispatchEnabled);
    const overHours   = users.filter(u => (u.hoursThisWeek||0) > (u.hoursCap||40));
    const certsExp30  = users.filter(u => (u.dispatchCerts||[]).some(c => c.expiresIn <= 30));

    const getStatus = (u) => {
        if ((u.hoursThisWeek||0) > (u.hoursCap||40)) return { label: 'Over hours', color: T.danger };
        if (u.status === 'training') return { label: 'Training', color: T.info };
        if (u.status === 'pto')     return { label: 'PTO', color: T.inkMuted };
        return { label: 'Active', color: T.ok };
    };

    const saveUserDispatch = async (userId, updates) => {
        const updatedUsers = (settings?.users || []).map(u =>
            (u.id === userId || u.name === userId) ? { ...u, ...updates } : u
        );
        setSettings(prev => ({ ...prev, users: updatedUsers }));
        try { await dbFetch('/.netlify/functions/settings', { method: 'PUT', body: JSON.stringify({ users: updatedUsers }) }); }
        catch(e) { console.error('save tech profile', e); }
    };

    return (
        <SPDetailPageChrome crumb="Dispatch · Tech profiles" title="Tech profiles"
            subtitle="Dispatcher view of every user with dispatch enabled. Edit skills, certs, license, vehicle, and hours cap in one place."
            onBack={onBack} dirty={false} onCancel={onBack}
            disablePrimary={true} primaryLabel="Auto-saved"
            primaryAction={() => {}}
            extraActions={
                <>
                    <button style={{ padding:'7px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:500, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Export CSV</button>
                    <button style={{ padding:'7px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ Enable dispatch for user</button>
                </>
            }>

            {/* Source-of-truth banner */}
            <div style={{ background: `${T.goldInk}0e`, border: `1px solid ${T.goldInk}30`, borderRadius: T.r, padding: '10px 14px', marginBottom: 16, fontSize: 12.5, color: T.inkMid, fontFamily: T.sans, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 14 }}>↺</span>
                User identity (name, email, role) lives in <strong style={{ color: T.ink }}>People & Teams → Users</strong>. This page edits only the dispatch fields — changes here sync both ways.
            </div>

            {/* Quick-stat strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 16 }}>
                {[
                    { label: 'Active', value: activeTechs.length, color: T.ok },
                    { label: 'Over hours this week', value: overHours.length, color: overHours.length > 0 ? T.danger : T.inkMuted },
                    { label: 'In training', value: users.filter(u=>u.status==='training').length, color: T.info },
                    { label: 'Certs expiring 30d', value: certsExp30.length, color: certsExp30.length > 0 ? T.warn : T.inkMuted },
                    { label: 'Avg utilization', value: users.length > 0 ? Math.round(users.reduce((a,u)=>(a+(u.hoursThisWeek||0)/(u.hoursCap||40)),0)/users.length*100)+'%' : '—', color: T.ink },
                ].map((s,i) => (
                    <div key={i} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2, padding: '12px 14px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4, fontFamily: T.sans }}>{s.label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>{s.value}</div>
                    </div>
                ))}
            </div>

            {/* Filter chips */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {['All techs', 'By crew', 'By skill', 'By license', 'Status any'].map(f => (
                    <span key={f} onClick={() => setFilter(f)}
                        style={{ padding: '4px 10px', borderRadius: 3, background: filter===f ? T.ink : T.surface2, color: filter===f ? '#fbf8f3' : T.inkMid, fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans }}>
                        {f}
                    </span>
                ))}
            </div>

            {users.length === 0 ? (
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2, padding: '3rem', textAlign: 'center', color: T.inkMuted, fontSize: 13, fontStyle: 'italic', fontFamily: T.sans }}>
                    No dispatch-enabled users. Enable dispatch for a user in People & Teams → their profile.
                </div>
            ) : (
                <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: T.r+2, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 100px 100px 1.5fr 1fr 90px 100px 100px 28px', gap: 10, padding: '8px 14px', background: T.surface2, fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans }}>
                        <div>Tech</div><div>Status</div><div>License</div><div>Skills</div><div>Certs</div><div>Hours</div><div>Vehicle</div><div>Crew</div><div/>
                    </div>
                    {users.map((u, i) => {
                        const st = getStatus(u);
                        const userSkills = (u.dispatchSkills||[]).map(id => skills.find(s=>s.id===id)).filter(Boolean);
                        const userCerts  = (u.dispatchCerts||[]);
                        const hoursUsed  = u.hoursThisWeek||0;
                        const hoursCap   = u.hoursCap||40;
                        const over       = hoursUsed > hoursCap;
                        const userCrew   = crews.find(c => (c.members||[]).includes(u.id||u.name));
                        return (
                            <div key={u.id||u.name} style={{ display: 'grid', gridTemplateColumns: '1.5fr 100px 100px 1.5fr 1fr 90px 100px 100px 28px', gap: 10, padding: '11px 14px', alignItems: 'center', fontSize: 12.5, fontFamily: T.sans, borderTop: i>0 ? `1px solid ${T.border}` : 'none' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: T.ink, color: '#fbf8f3', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        {(u.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, color: T.ink }}>{u.name}</div>
                                    </div>
                                </div>
                                <div><span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: 3, background: `${st.color}18`, color: st.color, fontWeight: 700 }}>{st.label}</span></div>
                                <div>
                                    <select value={u.dispatchLicense || licenses[0] || 'Apprentice'}
                                        onChange={e => saveUserDispatch(u.id||u.name, { dispatchLicense: e.target.value })}
                                        style={{ padding: '3px 7px', border: `1px solid ${T.borderStrong}`, borderRadius: T.r, fontSize: 11.5, fontFamily: T.sans, outline: 'none', background: T.surface }}>
                                        {licenses.map(l => <option key={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {userSkills.slice(0,3).map(s => (
                                        <span key={s.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: `${s.color}14`, color: s.color, fontWeight: 600, border: `1px solid ${s.color}30` }}>{s.name}</span>
                                    ))}
                                    {userSkills.length > 3 && <span style={{ fontSize: 10, color: T.inkMuted }}>+{userSkills.length-3}</span>}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                    {userCerts.map(c => {
                                        const cert = certs.find(ct => ct.id === c.id || ct.name === c.id);
                                        const expiring = (c.expiresIn||0) <= 30;
                                        return cert ? (
                                            <span key={c.id} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 3, background: expiring?`${T.warn}18`:T.surface2, color: expiring?T.warn:T.inkMid, fontWeight: 600, border: `1px solid ${expiring?T.warn:T.border}` }}>
                                                {expiring ? '⚠ ' : ''}{cert.name}
                                            </span>
                                        ) : null;
                                    })}
                                </div>
                                <div>
                                    <div style={{ fontSize: 10.5, fontFamily: 'ui-monospace,Menlo,monospace', color: over?T.danger:T.inkMid, marginBottom: 2 }}>{hoursUsed}/{hoursCap}h</div>
                                    <div style={{ height: 3, background: T.surface2, borderRadius: 2, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${Math.min(hoursUsed/hoursCap,1)*100}%`, background: over?T.danger:(hoursUsed>=hoursCap*0.9?T.warn:T.ok) }}/>
                                    </div>
                                </div>
                                <div style={{ fontSize: 11.5, color: T.inkMid }}>{u.vehicle || '—'}</div>
                                <div style={{ fontSize: 11.5, color: T.inkMid }}>{userCrew?.name || '—'}</div>
                                <><techKebab.KebabBtn id={u.id||u.name}/><techKebab.KebabMenu id={u.id||u.name} items={[{label:'View in People & Teams',action:()=>{}},{label:'Disable dispatch',danger:true,action:()=>saveUserDispatch(u.id||u.name,{dispatchEnabled:false})}]}/></>
                            </div>
                        );
                    })}
                </div>
            )}
        </SPDetailPageChrome>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
//  Dispatch — Job Templates Detail
// ─────────────────────────────────────────────────────────────────────────────
const DispatchJobTemplatesDetail = ({ settings, setSettings, onBack, setSettingsDirty, settingsSaveRef }) => {
    const saved = settings?.dispatchJobTemplates || [];
    const skills   = settings?.dispatchSkills   || [];
    const licenses = settings?.dispatchLicenses || ['Apprentice','Journeyman','Master','Lead'];
    const custTypes = settings?.customerTypes   || [];

    const [templates, setTemplates] = useState(() => JSON.parse(JSON.stringify(saved)));
    const [dirty,    setDirty]    = useState(false);
    const [saving,   setSaving]   = useState(false);
    const [selectedId, setSelectedId] = useState(saved[0]?.id || null);
    const [showAdd,  setShowAdd]  = useState(false);
    const [tmplMenu, setTmplMenu] = useState(null);

    const selected = templates.find(t => t.id === selectedId);

    const handleSave = async () => {
        setSaving(true);
        setSettings(prev => ({ ...prev, dispatchJobTemplates: templates }));
        try { await dbFetch('/.netlify/functions/settings', { method: 'PUT', body: JSON.stringify({ dispatchJobTemplates: templates }) }); }
        catch(e) { console.error('save job templates', e); }
        setSaving(false); setDirty(false);
    };

    React.useEffect(() => { if (setSettingsDirty) setSettingsDirty(dirty); return () => { if (setSettingsDirty) setSettingsDirty(false); }; }, [dirty]);
    React.useEffect(() => {
        if (!settingsSaveRef) return;
        settingsSaveRef.current = dirty ? handleSave : null;
        return () => { if (settingsSaveRef) settingsSaveRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    const updateTemplate = (field, val) => {
        setTemplates(prev => prev.map(t => t.id === selectedId ? { ...t, [field]: val } : t));
        setDirty(true);
    };

    const toggleSkill = (skillId) => {
        if (!selected) return;
        const next = (selected.skills||[]).includes(skillId)
            ? (selected.skills||[]).filter(s => s !== skillId)
            : [...(selected.skills||[]), skillId];
        updateTemplate('skills', next);
    };

    const prioColor = (p) => ({ urgent: T.danger, standard: T.warn, low: T.inkMuted }[p] || T.inkMuted);

    // Sanity checks for selected template
    const sanityChecks = selected ? [
        {
            ok: (selected.skills||[]).every(id => skills.find(s=>s.id===id)),
            label: 'All required skills exist',
            detail: `${(selected.skills||[]).filter(id=>skills.find(s=>s.id===id)).length} of ${(selected.skills||[]).length} skills referenced`,
        },
        {
            ok: licenses.includes(selected.minLicense),
            label: 'Min license exists',
            detail: `"${selected.minLicense}" is rank ${licenses.indexOf(selected.minLicense)+1} of ${licenses.length}`,
        },
        {
            ok: true,
            label: 'Customer type linked',
            detail: selected.ctype || 'No customer type',
        },
    ] : [];

    return (
        <SPDetailPageChrome crumb="Dispatch · Job templates" title="Job templates"
            subtitle="When an opportunity moves to Closed Won, Accelerep can auto-create a Job using the template tied to the customer's type. Defaults pre-fill — dispatchers can still edit before scheduling."
            onBack={onBack} dirty={dirty}
            onCancel={() => { setTemplates(JSON.parse(JSON.stringify(saved))); setDirty(false); }}
            primaryAction={handleSave} primaryLabel={saving ? 'Saving…' : 'Save changes'}
            extraActions={
                <>
                    <button style={{ padding:'7px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:12.5, fontWeight:500, color:T.inkMid, cursor:'pointer', fontFamily:T.sans }}>Test auto-create</button>
                    <button onClick={()=>{ const id='tmpl_'+Date.now(); setTemplates(p=>[...p,{id,ctype:'',crew:1,hrs:2,skills:[],minLicense:licenses[0]||'Apprentice',equip:'',autojob:true,priority:'standard',used:0}]); setSelectedId(id); setDirty(true); }} style={{ padding:'7px 14px', background:T.ink, color:'#fbf8f3', border:'none', borderRadius:T.r, fontSize:12.5, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>+ New template</button>
                </>
            }>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20 }}>
                {/* Left — templates + form */}
                <div>
                    {/* Templates table */}
                    <CSectionCard title="Templates" desc="One per Customer Type. Reach the Customer Types list at Settings → Sales process → Customer types.">
                        <div style={{ border: `1px solid ${T.border}`, borderRadius: T.r, overflow: 'hidden' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 60px 60px 1.2fr 100px 80px 80px 80px 28px', gap: 8, padding: '8px 12px', background: T.surface2, fontSize: 10, fontWeight: 700, color: T.inkMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: T.sans }}>
                                <div>Customer type</div><div>Crew</div><div>Hours</div><div>Required skills</div><div>Min license</div><div>Priority</div><div>Auto-create</div><div>Used 30d</div><div/>
                            </div>
                            {templates.map((t, i) => (
                                <div key={t.id} onClick={() => setSelectedId(t.id)}
                                    style={{ display: 'grid', gridTemplateColumns: '1.5fr 60px 60px 1.2fr 100px 80px 80px 80px 28px', gap: 8, padding: '10px 12px', alignItems: 'center', fontSize: 12, fontFamily: T.sans, cursor: 'pointer',
                                        borderTop: i>0?`1px solid ${T.border}`:'none',
                                        background: selectedId===t.id ? `${T.goldInk}08` : T.surface,
                                        borderLeft: selectedId===t.id ? `3px solid ${T.goldInk}` : '3px solid transparent' }}>
                                    <div style={{ fontWeight: selectedId===t.id ? 700 : 400, color: T.ink }}>{t.ctype || '—'}</div>
                                    <div style={{ color: T.inkMid }}>{t.crew}p</div>
                                    <div style={{ color: T.inkMid }}>{t.hrs}h</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                        {(t.skills||[]).map(id => { const s=skills.find(sk=>sk.id===id); return s?<span key={id} style={{ fontSize:9.5, padding:'1px 5px', borderRadius:8, background:`${s.color}14`, color:s.color, fontWeight:600 }}>{s.name}</span>:null; })}
                                    </div>
                                    <div><span style={{ fontSize:11, padding:'2px 7px', borderRadius:3, background:`${T.info}14`, color:T.info, fontWeight:600 }}>{t.minLicense}</span></div>
                                    <div><span style={{ fontSize:11, padding:'2px 7px', borderRadius:3, background:`${prioColor(t.priority)}14`, color:prioColor(t.priority), fontWeight:600 }}>{t.priority}</span></div>
                                    <div><span style={{ fontSize:11, padding:'2px 7px', borderRadius:3, background:t.autojob?`${T.ok}14`:`${T.inkMuted}14`, color:t.autojob?T.ok:T.inkMuted, fontWeight:600 }}>{t.autojob?'On':'Off'}</span></div>
                                    <div style={{ color:T.inkMuted, fontFamily:'ui-monospace,Menlo,monospace', fontSize:11 }}>{t.used||0}</div>
                                    <button onClick={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setTmplMenu(tmplMenu?.id===t.id?null:{id:t.id,t,rect:{top:r.bottom+4,right:window.innerWidth-r.right}});}} style={{background:'none',border:'none',cursor:'pointer',color:T.inkMuted,fontSize:16,fontWeight:700,padding:'0 2px',lineHeight:1}}>⋯</button>
                                </div>
                            ))}
                        </div>

                    </CSectionCard>
                    {/* Selected template form */}
                    {selected && (
                        <CSectionCard title={selected.ctype || 'New template'} desc="Edit the template fields below.">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Template name</div>
                                    <input value={selected.ctype||''} onChange={e=>updateTemplate('ctype',e.target.value)} placeholder="e.g. Emergency · same-day"
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', boxSizing:'border-box', background:T.surface }}/>
                                </div>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Tied to customer type</div>
                                    <select value={selected.ctype||''} onChange={e=>updateTemplate('ctype',e.target.value)}
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' }}>
                                        <option value="">— Select customer type —</option>
                                        {custTypes.map((ct,i)=><option key={i} value={typeof ct==='string'?ct:ct.name}>{typeof ct==='string'?ct:ct.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Default crew size</div>
                                    <input type="number" min={1} max={10} value={selected.crew||1} onChange={e=>updateTemplate('crew',parseInt(e.target.value)||1)}
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', boxSizing:'border-box', background:T.surface }}/>
                                </div>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Default duration</div>
                                    <input value={selected.hrs ? selected.hrs + ' hours' : ''} onChange={e=>updateTemplate('hrs',parseFloat(e.target.value)||2)}
                                        placeholder="e.g. 4 hours"
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', boxSizing:'border-box', background:T.surface }}/>
                                </div>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Minimum license</div>
                                    <select value={selected.minLicense||licenses[0]} onChange={e=>updateTemplate('minLicense',e.target.value)}
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' }}>
                                        {licenses.map(l=><option key={l}>{l}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Default priority</div>
                                    <select value={selected.priority||'standard'} onChange={e=>updateTemplate('priority',e.target.value)}
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', background:T.surface, boxSizing:'border-box' }}>
                                        <option>urgent</option><option>standard</option><option>low</option>
                                    </select>
                                </div>
                                <div style={{ gridColumn:'1 / -1' }}>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:8, fontFamily:T.sans }}>Required skills</div>
                                    <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                                        {skills.map(s => {
                                            const active = (selected.skills||[]).includes(s.id);
                                            return (
                                                <span key={s.id} onClick={()=>toggleSkill(s.id)} style={{ fontSize:11, padding:'3px 9px', borderRadius:8, cursor:'pointer',
                                                    background:active?`${s.color}20`:T.surface2, border:`1px solid ${active?s.color:T.border}`,
                                                    color:active?s.color:T.inkMuted, fontWeight:active?700:400, fontFamily:T.sans, transition:'all 100ms' }}>{s.name}</span>
                                            );
                                        })}
                                    </div>
                                    {skills.length===0 && <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>No skills configured. Add in Settings → Dispatch → Skills.</div>}
                                </div>
                                <div style={{ gridColumn:'1 / -1' }}>
                                    <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:5, fontFamily:T.sans }}>Default equipment</div>
                                    <input value={selected.equip||''} onChange={e=>updateTemplate('equip',e.target.value)} placeholder="e.g. Recovery cart, spares"
                                        style={{ width:'100%', padding:'7px 10px', border:`1px solid ${T.borderStrong}`, borderRadius:T.r, fontSize:13, fontFamily:T.sans, outline:'none', boxSizing:'border-box', background:T.surface }}/>
                                    <div style={{ fontSize:11, color:T.inkMuted, marginTop:4, fontFamily:T.sans }}>Comma-separated. Each item must exist in Vehicles & equipment.</div>
                                </div>
                            </div>

                            {/* Auto-create rule card */}
                            <div style={{ marginTop:16, background:`${T.warn}0a`, border:`1px solid ${T.warn}30`, borderRadius:T.r, padding:'14px 16px' }}>
                                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                                    <div style={{ fontSize:10, fontWeight:700, color:T.warn, textTransform:'uppercase', letterSpacing:0.8, fontFamily:T.sans }}>Auto-create</div>
                                    <div onClick={()=>updateTemplate('autojob',!selected.autojob)}
                                        style={{ width:30, height:18, borderRadius:9, background:selected.autojob?T.ok:T.border, position:'relative', cursor:'pointer', transition:'background 120ms', flexShrink:0 }}>
                                        <span style={{ position:'absolute', top:2, left:selected.autojob?14:2, width:14, height:14, borderRadius:'50%', background:'#fbf8f3', boxShadow:'0 1px 2px rgba(0,0,0,0.15)', transition:'left 100ms' }}/>
                                    </div>
                                    <span style={{ fontSize:12, fontWeight:600, color:selected.autojob?T.ok:T.inkMuted, fontFamily:T.sans }}>{selected.autojob?'ON':'OFF'}</span>
                                </div>
                                <div style={{ fontSize:12.5, color:T.inkMid, lineHeight:1.55, fontFamily:T.sans }}>
                                    When an opportunity of this customer type moves to <strong style={{ color:T.ink }}>Closed Won</strong>, Accelerep auto-creates a Job in the Dispatch queue with these defaults pre-filled. Dispatchers can still edit before scheduling.
                                </div>
                            </div>
                        </CSectionCard>
                    )}
                </div>

                {/* Right rail — preview + sanity checks */}
                <div>
                    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, padding:'14px 16px', marginBottom:12 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:10, fontFamily:T.sans }}>Preview · what gets created</div>
                        {selected ? (
                            <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:T.r, padding:'10px 12px' }}>
                                <div style={{ fontSize:12, fontWeight:700, color:T.ink, marginBottom:4, fontFamily:T.sans }}>New Customer · {selected.ctype || 'Unknown type'}</div>
                                <div style={{ fontSize:11, color:T.inkMuted, marginBottom:8, fontFamily:T.sans }}>123 Main St · ASAP · same day</div>
                                <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:8 }}>
                                    {(selected.skills||[]).map(id=>{ const s=skills.find(sk=>sk.id===id); return s?<span key={id} style={{ fontSize:10, padding:'1px 6px', borderRadius:8, background:`${s.color}14`, color:s.color, fontWeight:600, border:`1px solid ${s.color}30` }}>{s.name}</span>:null; })}
                                </div>
                                <div style={{ fontSize:11, color:T.inkMid, fontFamily:T.sans }}>Crew × hours: <strong>{selected.crew||1} × {selected.hrs||2}h</strong></div>
                                <div style={{ fontSize:11, color:T.inkMid, fontFamily:T.sans }}>Min license: <strong>{selected.minLicense}</strong></div>
                                <div style={{ fontSize:11, color:T.inkMid, fontFamily:T.sans }}>Priority: <strong style={{ color:prioColor(selected.priority) }}>{selected.priority}</strong></div>
                                {selected.equip && <div style={{ fontSize:11, color:T.inkMid, fontFamily:T.sans }}>Equipment: <strong>{selected.equip}</strong></div>}
                            </div>
                        ) : (
                            <div style={{ fontSize:12, color:T.inkMuted, fontStyle:'italic', fontFamily:T.sans }}>Select a template to preview.</div>
                        )}
                    </div>

                    {selected && (
                        <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:T.r+2, padding:'14px 16px' }}>
                            <div style={{ fontSize:11, fontWeight:700, color:T.inkMuted, textTransform:'uppercase', letterSpacing:0.6, marginBottom:10, fontFamily:T.sans }}>Sanity checks</div>
                            {sanityChecks.map((c,i) => (
                                <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', marginBottom:10 }}>
                                    <span style={{ fontSize:14, color:c.ok?T.ok:T.warn, flexShrink:0 }}>{c.ok?'✓':'⚠'}</span>
                                    <div>
                                        <div style={{ fontSize:12, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{c.label}</div>
                                        <div style={{ fontSize:11, color:T.inkMuted, fontFamily:T.sans }}>{c.detail}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Job template row kebab ── */}
            {tmplMenu && tmplMenu.rect && (() => {
                const {t} = tmplMenu;
                return (<>
                    <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={()=>setTmplMenu(null)}/>
                    <div style={{position:'fixed',top:tmplMenu.rect.top,right:tmplMenu.rect.right,zIndex:9999,background:T.surface,border:`1px solid ${T.border}`,borderRadius:T.r+2,boxShadow:'0 4px 16px rgba(42,38,34,0.12)',minWidth:180,overflow:'hidden'}}>
                        <button onClick={()=>{const clone={...t,id:'tmpl_'+Date.now(),ctype:t.ctype+' (copy)',used:0};setTemplates(p=>[...p,clone]);setSelectedId(clone.id);setDirty(true);setTmplMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>Duplicate</button>
                        <button onClick={()=>{setTemplates(p=>p.map(tm=>tm.id===t.id?{...tm,autojob:!tm.autojob}:tm));setDirty(true);setTmplMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:T.ink,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background='none'}>{t.autojob?'Disable auto-create':'Enable auto-create'}</button>
                        <button onClick={()=>{setTemplates(p=>p.filter(tm=>tm.id!==t.id));if(selectedId===t.id)setSelectedId(templates.find(tm=>tm.id!==t.id)?.id||null);setDirty(true);setTmplMenu(null);}} style={{display:'block',width:'100%',padding:'9px 14px',background:'none',border:'none',borderTop:`1px solid ${T.border}`,textAlign:'left',fontSize:13,color:T.danger,cursor:'pointer',fontFamily:T.sans}} onMouseEnter={e=>e.currentTarget.style.background='rgba(156,58,46,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='none'}>Delete</button>
                    </div>
                </>);
            })()}
        </SPDetailPageChrome>
    );
};

const AdminView = ({ settings, setSettings, currentUser, setActiveTab, setAccountsDeepFilter, setSettingsDirty, settingsSaveRef }) => {
    const [scope, setScope] = useState('workspace');
    const [tab,   setTab  ] = useState('All');
    const [search, setSearch] = useState('');
    const [activeItem, setActiveItem] = useState(null); // detail panel state

    // ── Needs Attention snooze/dismiss ───────────────────────────────────────
    const [naMenuOpen,   setNaMenuOpen]   = React.useState(null);
    // naHidden persisted to localStorage so dismissals survive refresh/relogin
    const NA_STORAGE_KEY = 'accelerep_na_hidden';
    const [naHidden, setNaHiddenRaw] = React.useState(() => {
        try {
            const stored = localStorage.getItem(NA_STORAGE_KEY);
            if (stored) return JSON.parse(stored);
        } catch (e) {}
        return {};
    });
    const setNaHidden = (updater) => {
        setNaHiddenRaw(prev => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            try { localStorage.setItem(NA_STORAGE_KEY, JSON.stringify(next)); } catch (e) {}
            return next;
        });
    };
    const [naShowHidden, setNaShowHidden] = React.useState(false);
    const now = Date.now();

    const isHidden = (id) => {
        const h = naHidden[id];
        if (!h) return false;
        if (h.until === 'forever') return true;
        return new Date(h.until).getTime() > now;
    };

    const handleNaSnooze = (item, days) => {
        const until = new Date(now + days * 86400000);
        const label = until.toLocaleDateString('en-US', { month:'short', day:'numeric' });
        setNaHidden(prev => ({ ...prev, [item.id]: { until: until.toISOString(), name: item.name, snoozedUntilLabel: label } }));
        setNaMenuOpen(null);
    };

    const handleNaDismiss = (item) => {
        setNaHidden(prev => ({ ...prev, [item.id]: { until: 'forever', name: item.name, snoozedUntilLabel: null } }));
        setNaMenuOpen(null);
    };

    const handleNaRestore = (id) => {
        setNaHidden(prev => { const n = {...prev}; delete n[id]; return n; });
    };

    React.useEffect(() => {
        if (!naMenuOpen) return;
        const onDoc = (e) => {
            const menu = document.getElementById('na-menu-' + naMenuOpen);
            const btn  = document.getElementById('na-btn-'  + naMenuOpen);
            if (menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) setNaMenuOpen(null);
        };
        const onKey = (e) => { if (e.key === 'Escape') setNaMenuOpen(null); };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown',   onKey);
        return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
    }, [naMenuOpen]);

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
        'price-book':           'price-book',
        // Data
        'import':   'import',
        'export':   'export',
        'backup':   'backup',
        'features': 'features',
        // Security
        'sso':              'sso',
        'mfa':              'mfa',
        'session':          'session',
        'field-visibility': 'field-visibility',
        'audit-log':        'audit-log',
        // Integrations
        'apps':         'apps',
        'api-keys':     'api-keys',
        'webhooks':     'webhooks',
        'automations':  'automations',
        // People & Teams
        'users':        'users',
        'teams':        'teams',
        'territories':  'territories',
        'roles':        'roles',
        // Sales process Group 2
        'custom-fields':        'custom-fields',
        'pain-points':          'pain-points',
        'customer-types':       'customer-types',
        'industries':           'industries',
        'duplicates':           'duplicates',
        'contact-duplicates':   'contact-duplicates',
        'competitors':          'competitors',
        'reasons-won':          'reasons-won',
        'reasons-lost':         'reasons-lost',
        'buyer-personas':       'buyer-personas',
        // Dispatch
        'dsp-skills':           'dsp-skills',
        'dsp-vehicles':         'dsp-vehicles',
        'dsp-crews':            'dsp-crews',
        'dsp-techs':            'dsp-techs',
        'dsp-templates':        'dsp-templates',
        'dispatch-skills':      'dispatch-skills',
        'dispatch-vehicles':    'dispatch-vehicles',
    };

    // ── Live card badge counts — fetched once on mount ────────────────────────
    const [liveCounts, setLiveCounts] = React.useState({});
    React.useEffect(() => {
        let cancelled = false;
        const fetchCounts = async () => {
            try {
                const [keysRes, webhooksRes, autosRes, auditRes, backupRes] = await Promise.allSettled([
                    dbFetch('/.netlify/functions/api-keys'),
                    dbFetch('/.netlify/functions/webhooks'),
                    dbFetch('/.netlify/functions/automations'),
                    dbFetch('/.netlify/functions/audit-log'),
                    dbFetch('/.netlify/functions/backup'),
                ]);
                if (cancelled) return;
                const counts = {};
                if (keysRes.status === 'fulfilled') {
                    const d = await keysRes.value.json().catch(() => ({}));
                    const keys = d.keys || [];
                    counts.apiKeysActive  = keys.filter(k => !k.revokedAt).length;
                    counts.apiKeysTotal   = keys.length;
                }
                if (webhooksRes.status === 'fulfilled') {
                    const d = await webhooksRes.value.json().catch(() => ({}));
                    const subs = d.subscriptions || [];
                    counts.webhooksTotal   = subs.length;
                    counts.webhooksActive  = subs.filter(s => s.active).length;
                    counts.webhooksFailing = subs.filter(s => s.active && s.lastStatus && s.lastStatus >= 400).length;
                }
                if (autosRes.status === 'fulfilled') {
                    const d = await autosRes.value.json().catch(() => ({}));
                    const autos = d.automations || [];
                    counts.autosTotal  = autos.length;
                    counts.autosActive = autos.filter(a => a.active).length;
                }
                if (auditRes.status === 'fulfilled') {
                    const d = await auditRes.value.json().catch(() => ({}));
                    counts.auditEvents = (d.entries || []).length;
                }
                if (backupRes.status === 'fulfilled') {
                    const d = await backupRes.value.json().catch(() => ({}));
                    const snaps = d.snapshots || [];
                    if (snaps[0]) {
                        const last = snaps[0];
                        const diffH = Math.round((Date.now() - new Date(last.createdAt)) / 3600000);
                        counts.backupLastLabel = diffH < 1 ? 'just now' : diffH < 24 ? diffH + 'h ago' : Math.round(diffH/24) + 'd ago';
                        counts.backupFreq = d.schedule?.frequency || 'Daily';
                    }
                }
                setLiveCounts(counts);
            } catch (e) { /* silent — badges just stay empty */ }
        };
        fetchCounts();
        return () => { cancelled = true; };
    }, []);

    // Recently changed feed — loaded from audit log (must be before early return)
    const [recentFeed, setRecentFeed] = React.useState([]);
    React.useEffect(() => {
        let cancelled = false;
        dbFetch('/.netlify/functions/audit-log')
            .then(r => r.json())
            .then(data => {
                if (cancelled) return;
                const entries = data.entries || [];
                const fmtAge = (iso) => {
                    if (!iso) return '—';
                    const d = new Date(iso);
                    const diffMin = Math.round((Date.now() - d) / 60000);
                    if (diffMin < 1)    return 'just now';
                    if (diffMin < 60)   return diffMin + 'm ago';
                    if (diffMin < 1440) return Math.round(diffMin/60) + 'h ago';
                    if (diffMin < 2880) return 'yesterday';
                    if (diffMin < 10080) return Math.round(diffMin/1440) + 'd ago';
                    return d.toLocaleDateString('en-US', { month:'short', day:'numeric' });
                };
                const mapped = entries.slice(0, 4).map(e => ({
                    who:  e.userName || e.userId || 'System',
                    what: (e.action || '').replace(/[._]/g, ' '),
                    when: fmtAge(e.timestamp),
                }));
                if (mapped.length > 0) setRecentFeed(mapped);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

        if (activeItem) {
        const id = activeItem.id;
        const onBack = () => {
            if (typeof setSettingsDirty === 'function') setSettingsDirty(false);
            setActiveItem(null);
        };

        // Company detail pages — full chrome, no wrapper card
        if (id === 'company-profile')  return <CompanyProfileDetail  settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'fiscal-year')      return <FiscalYearDetail      settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'company-calendar') return <CompanyCalendarDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;

        // Sales process Group 1 detail pages
        if (id === 'pipelines')            return <PipelinesDetail        settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'funnel-stages')        return <FunnelStagesDetail     settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'kpi-settings')         return <KPIThresholdsDetail    settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'lead-conv-benchmarks') return <LeadConversionDetail   settings={settings} setSettings={setSettings} onBack={onBack}/>;

        // Quoting detail pages
        if (id === 'quote-templates') return <QuoteTemplatesDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'approval-tiers')  return <ApprovalTiersDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'price-book')      return <PriceBookDetail     settings={settings} setSettings={setSettings} onBack={onBack}/>;

        // Data detail pages
        if (id === 'import')   return <ImportDetail   onBack={onBack}/>;
        if (id === 'export')   return <ExportDetail   onBack={onBack}/>;
        if (id === 'backup')   return <BackupDetail   onBack={onBack}/>;
        if (id === 'features') return <FeaturesDetail settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;

        // Security detail pages
        if (id === 'sso')              return <SsoDetail       onBack={onBack}/>;
        if (id === 'mfa')              return <MfaDetail       onBack={onBack}/>;
        if (id === 'session')          return <SessionDetail   onBack={onBack}/>;
        if (id === 'field-visibility') return <FlsDetail       onBack={onBack}/>;
        if (id === 'audit-log')        return <AuditDetail     onBack={onBack}/>;

        // Integrations detail pages
        if (id === 'apps')        return <ConnectedAppsDetail onBack={onBack}/>;
        if (id === 'api-keys')    return <ApiKeysDetail      onBack={onBack}/>;
        if (id === 'webhooks')    return <WebhooksDetail     onBack={onBack}/>;
        if (id === 'automations') return <AutomationsDetail  onBack={onBack}/>;

        // People & Teams detail pages
        if (id === 'users')       return <UsersDetail       settings={settings} onBack={onBack}/>;
        if (id === 'teams')       return <TeamsDetail        settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'territories') return <TerritoriesDetail settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'roles')       return <RolesDetail       settings={settings} onBack={onBack}/>;

        // Sales process Group 2 detail pages
        if (id === 'custom-fields')   return <CustomFieldsDetail   settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'pain-points')     return <PainPointsDetail     settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'competitors')     return <CompetitorsDetail     settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'reasons-won')     return <ReasonsWonDetail      settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'reasons-lost')    return <ReasonsLostDetail     settings={settings} setSettings={setSettings} onBack={onBack}/>;
        if (id === 'customer-types')  return <CustomerTypesDetail  settings={settings} setSettings={setSettings} onBack={onBack} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter}/>;
        if (id === 'buyer-personas')  return <BuyerPersonasDetail  settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        // Dispatch detail pages
        if (id === 'dsp-skills'    || id === 'dispatch-skills')   return <DispatchSkillsDetail   settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'dsp-vehicles'  || id === 'dispatch-vehicles') return <DispatchVehiclesDetail  settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'dsp-crews')     return <DispatchCrewsDetail    settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'dsp-techs')     return <DispatchTechDetail      settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'dsp-templates') return <DispatchJobTemplatesDetail settings={settings} setSettings={setSettings} onBack={onBack} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>;
        if (id === 'industries')      return <IndustriesDetail     settings={settings} setSettings={setSettings} onBack={onBack} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter}/>;
        if (id === 'duplicates')      return <DuplicateScanView onBack={onBack}/>;
        if (id === 'contact-duplicates') return <ContactDuplicateScanView onBack={onBack}/>;

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

    const WORKSPACE_TABS = [...WORKSPACE_TABS_BASE.slice(0, 5), ...(settings?.dispatchEnabled ? ['Dispatch'] : []), ...WORKSPACE_TABS_BASE.slice(5)];
    const tabs = scope === 'workspace' ? WORKSPACE_TABS : ['All', 'Profile & Account'];
    const scopeItems = SETTINGS_ITEMS.filter(i => i.scope === scope);
    const filteredByTab = (tab === 'All' ? scopeItems : scopeItems.filter(i => i.category === tab))
        .filter(i => i.category !== 'Dispatch' || settings?.dispatchEnabled);
    const items = search.trim()
        ? scopeItems.filter(i => (i.name + ' ' + i.desc + ' ' + i.category).toLowerCase().includes(search.toLowerCase()))
        : filteredByTab;

    // Workspace health — from real data + static checks
    const users = settings?.users || [];
    const pipelines = settings?.pipelines || [];
    const funnelStages = settings?.funnelStages || [];
    const calConnected = settings?.googleCalendarConnected || false;
    const allAttentionItems = SETTINGS_ITEMS.filter(i => i.attention);
    const visibleAttention  = allAttentionItems.filter(it => !isHidden(it.id));
    const hiddenAttention   = allAttentionItems.filter(it =>  isHidden(it.id));
    const attentionItems    = visibleAttention; // alias for any remaining references
    const hiddenCount       = hiddenAttention.length;
    const lastHidden        = hiddenAttention.length > 0 ? hiddenAttention[hiddenAttention.length - 1] : null;
    const lastHiddenInfo    = lastHidden ? naHidden[lastHidden.id] : null;
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
    // Exclude hidden attention items from health denominator
    const activeHealthChecks = healthChecks.filter(h => {
        if (h.label === 'SSO configured'       && isHidden('sso'))      return false;
        if (h.label === 'MFA enforced'         && isHidden('mfa'))      return false;
        if (h.label === 'Webhooks all healthy' && isHidden('webhooks')) return false;
        return true;
    });
    const healthOk  = activeHealthChecks.filter(h => h.ok).length;
    const healthPct = Math.round((healthOk / activeHealthChecks.length) * 100);


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
                            <div style={{ fontSize:14, fontWeight:700, color:T.ink, marginBottom:4, fontFamily:T.sans }}>{healthOk} of {activeHealthChecks.length} checks passing</div>
                            <div style={{ fontSize:11.5, color:T.inkMid, lineHeight:1.5, fontFamily:T.sans }}>Set up SSO and enforce MFA to reach 90%+ — standard for multi-rep workspaces.</div>
                        </div>
                    </div>
                    {/* Needs attention */}
                    <div style={{ background:'rgba(156,58,46,0.04)', border:'1px solid rgba(156,58,46,0.2)', borderRadius:6, padding:16 }}>
                        {/* Header */}
                        <div style={{ ...eb('#9c3a2e'), marginBottom:10, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                                <span>⚠</span> NEEDS ATTENTION
                            </span>
                            {hiddenCount > 0 && (
                                <span style={{ fontSize:9.5, color:T.inkMuted, letterSpacing:0, textTransform:'none', fontWeight:400, fontFamily:T.sans }}>
                                    {hiddenCount} hidden · <span onClick={() => setNaShowHidden(v => !v)}
                                        style={{ color:T.info, fontWeight:600, cursor:'pointer' }}>
                                        {naShowHidden ? 'Hide' : 'Show'}
                                    </span>
                                </span>
                            )}
                        </div>

                        {/* Visible attention rows */}
                        {visibleAttention.slice(0,3).map((it, i) => {
                            const isOpen  = naMenuOpen === it.id;
                            const fixable = it.id !== 'sso';
                            return (
                                <div key={it.id} style={{ padding:'8px 0',
                                    borderBottom: i < Math.min(visibleAttention.length,3)-1 ? `1px dashed rgba(156,58,46,0.15)` : 'none',
                                    display:'flex', alignItems:'center', gap:8, position:'relative',
                                    background: isOpen ? 'rgba(200,185,154,0.07)' : 'transparent' }}>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans }}>{it.name}</div>
                                        <div style={{ fontSize:11, color:T.inkMid, marginTop:1, fontFamily:T.sans }}>{it.statusDetail}</div>
                                    </div>
                                    {/* Fix button */}
                                    <button onClick={() => fixable && setActiveItem(SETTINGS_ITEMS.find(s => s.id===it.id)||it)}
                                        style={{ padding:'4px 10px', fontSize:11, fontWeight:600,
                                            background: fixable ? T.danger : 'rgba(156,58,46,0.35)',
                                            color:'#fbf8f3', border:'none', borderRadius:T.r,
                                            cursor: fixable ? 'pointer' : 'not-allowed', fontFamily:T.sans,
                                            display:'inline-flex', alignItems:'center', gap:4 }}>
                                        Fix <span style={{ fontSize:10 }}>→</span>
                                    </button>
                                    {/* Kebab ⋯ */}
                                    <button id={'na-btn-' + it.id}
                                        onClick={() => setNaMenuOpen(isOpen ? null : it.id)}
                                        style={{ width:24, height:24, display:'inline-flex', alignItems:'center', justifyContent:'center',
                                            borderRadius:3, cursor:'pointer', border:'none', padding:0,
                                            color: isOpen ? T.goldInk : T.inkMuted,
                                            background: isOpen ? 'rgba(200,185,154,0.30)' : 'transparent',
                                            fontSize:15, fontWeight:700, lineHeight:1 }}>⋯</button>
                                    {/* Kebab menu */}
                                    {isOpen && (
                                        <div id={'na-menu-' + it.id}
                                            style={{ position:'absolute', right:0, zIndex:50, ...(i >= 1 ? { bottom:'100%', marginBottom:4 } : { top:'100%', marginTop:4 }),
                                                width:220, background:T.surface, border:`1px solid ${T.borderStrong}`,
                                                borderRadius:4, padding:4, fontFamily:T.sans,
                                                boxShadow:'0 8px 24px rgba(42,38,34,0.12), 0 2px 4px rgba(42,38,34,0.06)' }}>
                                            <div style={{ position:'absolute', top:-6, right:10, width:12, height:12,
                                                background:T.surface, border:`1px solid ${T.borderStrong}`,
                                                borderRight:'none', borderBottom:'none', transform:'rotate(45deg)' }}/>
                                            <div style={{ padding:'6px 12px 4px', fontSize:9.5, fontWeight:800,
                                                color:T.inkMuted, letterSpacing:0.7, textTransform:'uppercase' }}>
                                                Remind me later
                                            </div>
                                            {[
                                                { days:7,  label:'Snooze 7 days',  sub:'Until next Monday' },
                                                { days:30, label:'Snooze 30 days', sub:'Recommended'       },
                                                { days:90, label:'Snooze 90 days', sub:'Once a quarter'    },
                                            ].map(o => (
                                                <div key={o.days} onClick={() => handleNaSnooze(it, o.days)}
                                                    style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', borderRadius:3, cursor:'pointer' }}
                                                    onMouseEnter={e => e.currentTarget.style.background='rgba(200,185,154,0.10)'}
                                                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                                    <span style={{ fontSize:12, color:T.inkMid, flexShrink:0 }}>◷</span>
                                                    <div>
                                                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink }}>{o.label}</div>
                                                        <div style={{ fontSize:10.5, color:T.inkMuted }}>{o.sub}</div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div style={{ height:1, background:T.border, margin:'2px 6px' }}/>
                                            <div onClick={() => handleNaDismiss(it)}
                                                style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', borderRadius:3, cursor:'pointer' }}
                                                onMouseEnter={e => e.currentTarget.style.background='rgba(200,185,154,0.10)'}
                                                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                                                <span style={{ fontSize:12, color:T.danger, flexShrink:0 }}>🗑</span>
                                                <div>
                                                    <div style={{ fontSize:12.5, fontWeight:600, color:T.danger }}>Dismiss permanently</div>
                                                    <div style={{ fontSize:10.5, color:T.inkMuted }}>Won't show again on this workspace</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Hidden items — shown when "Show" toggled */}
                        {naShowHidden && hiddenAttention.map(it => {
                            const info = naHidden[it.id];
                            return (
                                <div key={it.id} style={{ padding:'8px 0',
                                    borderTop:`1px dashed rgba(156,58,46,0.15)`,
                                    display:'flex', alignItems:'center', gap:10, opacity:0.55 }}>
                                    <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:12.5, fontWeight:600, color:T.ink, fontFamily:T.sans,
                                            textDecoration:'line-through', textDecorationColor:'rgba(42,38,34,0.35)' }}>
                                            {it.name}
                                        </div>
                                        <div style={{ fontSize:11, color:T.inkMid, marginTop:1, fontFamily:T.sans }}>
                                            <span style={{ padding:'1px 5px', borderRadius:2, fontSize:9.5, fontWeight:700,
                                                background:'rgba(58,90,122,0.12)', color:T.info, marginRight:6,
                                                textTransform:'uppercase', letterSpacing:0.5 }}>
                                                {info?.until === 'forever' ? 'Dismissed' : 'Snoozed'}
                                            </span>
                                            {info?.until !== 'forever' && info?.snoozedUntilLabel
                                                ? 'Until ' + info.snoozedUntilLabel
                                                : 'Permanently hidden'}
                                        </div>
                                    </div>
                                    <span onClick={() => handleNaRestore(it.id)}
                                        style={{ fontSize:10.5, color:T.info, fontWeight:600, cursor:'pointer', fontFamily:T.sans }}>
                                        Restore
                                    </span>
                                </div>
                            );
                        })}

                        {/* All clear states */}
                        {visibleAttention.length === 0 && hiddenCount === 0 && (
                            <div style={{ fontSize:12, color:T.ok, fontFamily:T.sans }}>All checks passing ✓</div>
                        )}
                        {visibleAttention.length === 0 && hiddenCount > 0 && (
                            <div style={{ fontSize:12, color:T.inkMuted, fontFamily:T.sans, fontStyle:'italic' }}>
                                All visible checks passing — {hiddenCount} hidden.
                            </div>
                        )}

                        {/* Info strip — most recently hidden item */}
                        {lastHidden && lastHiddenInfo && !naShowHidden && (
                            <div style={{ marginTop:10, padding:'8px 10px',
                                background:'rgba(58,90,122,0.06)', borderRadius:3,
                                fontSize:10.5, color:T.inkMid, display:'flex', alignItems:'center', gap:6, fontFamily:T.sans }}>
                                <span style={{ fontSize:11, color:T.info }}>◷</span>
                                <span>
                                    <b style={{ color:T.ink }}>{lastHiddenInfo.name}</b>
                                    {lastHiddenInfo.until === 'forever'
                                        ? ' dismissed permanently.'
                                        : ` snoozed until ${lastHiddenInfo.snoozedUntilLabel}.`}
                                    {' '}
                                    <span onClick={() => handleNaRestore(lastHidden.id)}
                                        style={{ color:T.info, fontWeight:600, cursor:'pointer' }}>Restore</span>
                                </span>
                            </div>
                        )}
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
                                    {list.map(it => <V2Card key={it.id} item={it} settings={settings} liveCounts={liveCounts} onOpen={DETAIL_PANELS[it.id] ? () => setActiveItem(it) : undefined}/>)}
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
        setSettingsDirty = () => {}, settingsSaveRef = { current: null },
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
                <AdminView settings={settings} setSettings={setSettings} currentUser={currentUser} setActiveTab={setActiveTab} setAccountsDeepFilter={setAccountsDeepFilter} setSettingsDirty={setSettingsDirty} settingsSaveRef={settingsSaveRef}/>
            ) : (
                <PersonalView settings={settings} setSettings={setSettings} currentUser={currentUser} isAdmin={false}/>
            )}
        </div>
    );
}
