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
import { ImportDetail } from './settings/data/ImportDetail.jsx';
import { ExportDetail } from './settings/data/ExportDetail.jsx';
import { BackupDetail } from './settings/data/BackupDetail.jsx';
import { FeaturesDetail } from './settings/data/FeaturesDetail.jsx';

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
