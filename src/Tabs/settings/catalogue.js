// settings/catalogue.js
//
// DISPLAY ORDER IS NOT THIS FILE'S ORDER. AdminView alphabetizes the tab row
// (with 'All' pinned first) and the cards within every tab at render time
// (Jeff's call, 2 Sep) — keep this file grouped by category for editing and
// add new items to their category block; they sort themselves on screen.

export const SETTINGS_ITEMS = [
    // Personal
    // Company
    { id:'company-profile',  scope:'workspace', category:'Company', name:'Company profile',        desc:'Logo, address, phone, and default quote header',              status:'ok',      statusDetail:'Complete' },
    { id:'fiscal-year',      scope:'workspace', category:'Company', name:'Fiscal year',            desc:'Quarter starts and fiscal year alignment',                    status:'ok',      statusDetail:'Q1 starts Feb 1' },
    { id:'company-calendar', scope:'workspace', category:'Company', name:'Company calendar',       desc:'Shared org-wide holidays and events',                         status:'ok',      statusDetail:'12 holidays · 2026' },
    // Sales process
    { id:'pipelines',        scope:'workspace', category:'Sales process', name:'Pipelines',       desc:'Manage multiple pipelines and their stages',                  status:'ok',      statusDetail:'3 pipelines · 28 stages' },
    { id:'funnel-stages',    scope:'workspace', category:'Sales process', name:'Funnel stages',   desc:'Stage names and default win probability',                     status:'ok',      statusDetail:'8 stages' },
    { id:'custom-fields',    scope:'workspace', category:'Sales process', name:'Custom fields',   desc:'Custom fields on Accounts, Contacts, Leads, Opportunities',   status:'ok',      statusDetail:'18 custom fields', isNew:true },
    { id:'kpi-settings',     scope:'workspace', category:'Sales process', name:'KPI thresholds',  desc:'Thresholds, colors, and sparkline ranges for dashboards',     status:'ok',      statusDetail:'12 KPIs configured' },
    { id:'lead-conv-benchmarks', scope:'workspace', category:'Sales process', name:'Lead conversion benchmarks', desc:'Good / average / poor conversion rate targets by lead source', status:'ok', statusDetail:'8 sources configured' },
    { id:'pain-points',      scope:'workspace', category:'Sales process', name:'Pain points library', desc:'Reusable customer pain point templates',                  status:'ok',      statusDetail:'23 pain points' },
    { id:'customer-types',   scope:'workspace', category:'Sales process', name:'Customer types',  desc:'Account classification tags (SMB, Mid-market, Enterprise…)', status:'ok',      statusDetail:'5 tiers' },
    { id:'lead-scoring', scope:'workspace', category:'Sales process', name:'Lead scoring', desc:'Rule-based Fit + Engagement scoring for leads (sources, deal size, status, recency)', status:'ok', statusDetail:'Fit + Engagement' },
    { id:'lead-visibility', scope:'workspace', category:'Sales process', name:'Lead visibility', desc:'Whether sales reps can see unassigned leads — Admins and Managers always see all', status:'ok', statusDetail:'Unassigned visible to reps', isNew:true },
    { id:'account-segments', scope:'workspace', category:'Sales process', name:'Account segments', desc:'Account segment tiers (SMB, Mid-market, Enterprise…)', status:'ok', statusDetail:'5 tiers' },
    { id:'buyer-personas',    scope:'workspace', category:'Sales process', name:'Buyer personas',  desc:'Contact persona tags used in the contact form (e.g. Champion, Economic Buyer, End User)', status:'ok', statusDetail:'0 personas' },
    { id:'competitors',      scope:'workspace', category:'Sales process', name:'Competitors',     desc:'Competitor names shown in the opportunity form for win/loss tracking', status:'ok', statusDetail:'0 competitors' },
    { id:'reasons-won',      scope:'workspace', category:'Sales process', name:'Reasons won',     desc:'Win reason options shown when a deal is marked Closed Won',    status:'ok',      statusDetail:'0 reasons' },
    { id:'reasons-lost',     scope:'workspace', category:'Sales process', name:'Reasons lost',    desc:'Loss reason options shown when a deal is marked Closed Lost',  status:'ok',      statusDetail:'0 reasons' },
    { id:'industries',       scope:'workspace', category:'Sales process', name:'Industries',      desc:'Primary and sub-industry taxonomy',                           status:'ok',      statusDetail:'14 industries · 47 sub-types' },
    // Dispatch — field-service config (shown only when dispatchEnabled)
    { id:'dsp-skills',    scope:'workspace', category:'Dispatch', name:'Skills & certifications', desc:'Skills your techs hold, certs that gate work, and ordered license levels.', status:'ok', statusDetail:'Admin-defined', moved:true },
    { id:'dsp-vehicles',  scope:'workspace', category:'Dispatch', name:'Vehicles & equipment',    desc:'Fleet vehicles, tools, and shared assets that techs draw from when assigned.', status:'ok', statusDetail:'Admin-defined', moved:true },
    { id:'dsp-jobtypes', scope:'workspace', category:'Dispatch', name:'Job categories & types', desc:'Trades your team works (HVAC, Electrical…) and the specific job types within each.', status:'ok', statusDetail:'Admin-defined', isNew:true },
    { id:'dsp-blocktypes', scope:'workspace', category:'Dispatch', name:'Time off & availability', desc:'Reasons a tech is unavailable — PTO, sick, training, jury duty.', status:'ok', statusDetail:'Admin-defined', isNew:true },
    { id:'dsp-crews',     scope:'workspace', category:'Dispatch', name:'Crews',           desc:'Named groups of techs who work together — coverage area, default vehicle, crew lead.', status:'ok', statusDetail:'Admin-defined', isNew:true },
    { id:'dsp-proptypes', scope:'workspace', category:'Dispatch', name:'Property types',  desc:'What kind of premises a service customer is — commercial, residential, industrial and any you add.', status:'ok', statusDetail:'Admin-defined', isNew:true },
    { id:'dsp-plans',     scope:'workspace', category:'Dispatch', name:'Service plans',   desc:'Maintenance and service agreements — coverage, visit cadence, SLA, and pricing.', status:'ok', statusDetail:'Admin-defined', isNew:true },
    { id:'dsp-templates', scope:'workspace', category:'Dispatch', name:'Job templates',   desc:'Per Customer Type defaults — crew size, duration, required skills, license, and auto-create rule.', status:'ok', statusDetail:'Admin-defined', isNew:true },
    // Quoting
    { id:'price-book',       scope:'workspace', category:'Quoting', name:'Price book',            desc:'Product catalog for quotes — edit in Quotes tab',             status:'linked',  statusDetail:'15 products · 3 bundles',   link:true },
    { id:'approval-tiers',   scope:'workspace', category:'Quoting', name:'Approval tiers',        desc:'Discount thresholds that trigger manager or VP approval',     status:'ok',      statusDetail:'3 tiers' },
    { id:'quote-templates',  scope:'workspace', category:'Quoting', name:'Quote templates & branding', desc:'Templates, PDF header, terms, signature blocks',         status:'ok',      statusDetail:'4 templates' },
    // People & Teams
    { id:'users',            scope:'workspace', category:'People & Teams', name:'Users',           desc:'Invite, deactivate, and assign roles & permissions',         status:'ok',      statusDetail:'users · pending invites' },
    { id:'teams',            scope:'workspace', category:'People & Teams', name:'Teams & managers', desc:'Team structure, managers, and reporting hierarchy',          status:'ok',      statusDetail:'teams · managers' },
    { id:'territories',      scope:'workspace', category:'People & Teams', name:'Territories',     desc:'Sales territory definitions and rep assignments',             status:'ok',      statusDetail:'8 territories' },
    { id:'roles',            scope:'workspace', category:'People & Teams', name:'Roles & permissions', desc:'Custom roles with granular object-level permissions',    status:'ok',      statusDetail:'5 roles' },
    // Integrations
    { id:'apps',             scope:'workspace', category:'Integrations', name:'Connected apps',    desc:'Slack, Gmail, Outlook, Zoom, Docusign, LinkedIn',             status:'none',    statusDetail:null,  isNew:true },
    { id:'api-keys',         scope:'workspace', category:'Integrations', name:'API keys',          desc:'Workspace REST API credentials',                              status:'ok',      statusDetail:'3 active keys' },
    { id:'webhooks',         scope:'workspace', category:'Integrations', name:'Webhooks',          desc:'Subscribe to CRM events and push to endpoints',               status:'none',    statusDetail:null },
    { id:'automations',      scope:'workspace', category:'Integrations', name:'Automations',       desc:'Rules, triggers, and scheduled jobs',                         status:'ok',      statusDetail:'12 active · 3 paused',  isNew:true },
    // Security
    { id:'sso',              scope:'workspace', category:'Security', name:'Single sign-on (SSO)',  desc:'SAML 2.0 / OIDC identity provider',                           status:'none',    statusDetail:null,           isNew:true },
    { id:'mfa',              scope:'workspace', category:'Security', name:'Multi-factor auth',     desc:'A second factor on sign-in · policy and factors set in Clerk', status:'none', statusDetail:null, managedIn:'Clerk', attention:false, isNew:false },
    { id:'session',          scope:'workspace', category:'Security', name:'Session policy',        desc:'Idle timeout, device trust, IP allowlist',                    status:'none',    statusDetail:null },
    { id:'field-visibility', scope:'workspace', category:'Security', name:'Field-level visibility', desc:'Role-based access control for individual fields',            status:'ok',      statusDetail:'6 rules' },
    { id:'audit-log',        scope:'workspace', category:'Security', name:'Audit log',             desc:'Change history across all records and settings',               status:'ok',      statusDetail:'Last 30 days · 2,418 events' },
    // Data
    { id:'import',           scope:'workspace', category:'Data', name:'Import',                    desc:'CSV import for accounts, contacts, leads, opportunities',     status:'none',    statusDetail:null,  isNew:true },
    { id:'export',           scope:'workspace', category:'Data', name:'Export',                    desc:'Scheduled and ad-hoc exports; GDPR data requests',            status:'none',    statusDetail:null, isNew:true },
    { id:'duplicates',       scope:'workspace', category:'Data', name:'Find & merge duplicate accounts',    desc:'Scan accounts for likely duplicates and merge them — fully reversible', status:'ok',      statusDetail:'Scan on demand', isNew:true },
    { id:'contact-duplicates', scope:'workspace', category:'Data', name:'Find & merge duplicate contacts', desc:'Scan contacts for likely duplicates and merge them — fully reversible', status:'ok',      statusDetail:'Scan on demand', isNew:true },
    { id:'backup',           scope:'workspace', category:'Data', name:'Backup & restore',           desc:'Automated daily backups and point-in-time restore',           status:'ok',      statusDetail:'Daily · last: 03:14 UTC' },
    { id:'features',         scope:'workspace', category:'Data', name:'Features & AI',              desc:'Enable app features and AI (deal scoring, writing assist)',   status:'ok',      statusDetail:'14 of 18 on · AI enabled' },
];

export const WORKSPACE_TABS_BASE = ['All', 'Company', 'Sales process', 'Quoting', 'People & Teams', 'Integrations', 'Security', 'Data'];
