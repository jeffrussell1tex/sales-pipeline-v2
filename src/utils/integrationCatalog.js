// src/utils/integrationCatalog.js
//
// The ONE list of third-party apps a workspace may ask for (state §0.90, handoff
// item 24, Jeff: "option a"). None of these has an integration behind it yet; a
// row here is a REQUEST, never a Connect. The Connected Apps panel renders this
// list under "Request an integration", and integration-requests.mjs refuses an
// id that is not in it — one module, imported by both sides, the way users.mjs
// imports forecastCall.js.
//
// The integrations that ARE real (Slack via Incoming Webhook, Google and
// Microsoft 365 calendars via calendar-oauth-*, the email-logging BCC address)
// live in the panel itself, backed by their own endpoints — not here.
export const REQUESTABLE_APPS = Object.freeze([
    { id: 'gmail',      name: 'Gmail',           category: 'Email',        color: '#d93025', emoji: '✉',  desc: 'Log sent and received email on contact timelines automatically.' },
    { id: 'outlook',    name: 'Outlook mail',    category: 'Email',        color: '#0078d4', emoji: '📧', desc: 'Log sent and received email on contact timelines automatically.' },
    { id: 'zoom',       name: 'Zoom',            category: 'Video',        color: '#2d8cff', emoji: '📹', desc: 'Log meetings, recordings and transcripts to timelines.' },
    { id: 'docusign',   name: 'DocuSign',        category: 'eSign',        color: '#f4b100', emoji: '✍',  desc: 'Send quotes for signature and track their status.' },
    { id: 'hubspot',    name: 'HubSpot',         category: 'Marketing',    color: '#ff7a59', emoji: '🔶', desc: 'Two-way contact and deal sync with HubSpot.' },
    { id: 'salesforce', name: 'Salesforce',      category: 'CRM',          color: '#00a1e0', emoji: '☁',  desc: 'Mirror the pipeline to Salesforce objects.' },
    { id: 'quickbooks', name: 'QuickBooks',      category: 'Accounting',   color: '#2ca01c', emoji: '📗', desc: 'Match invoices and payments to closed-won deals.' },
    { id: 'stripe',     name: 'Stripe',          category: 'Billing',      color: '#635bff', emoji: '💳', desc: 'Match invoices and subscriptions to closed-won deals.' },
    { id: 'linkedin',   name: 'LinkedIn',        category: 'Prospecting',  color: '#0a66c2', emoji: 'in', desc: 'Enrich leads with company and role data.' },
    { id: 'zapier',     name: 'Zapier',          category: 'Automation',   color: '#ff4a00', emoji: '⚡', desc: 'Send pipeline events to thousands of other apps.' },
]);

export const REQUESTABLE_IDS = Object.freeze(REQUESTABLE_APPS.map(a => a.id));

export const isRequestableApp = (id) => typeof id === 'string' && REQUESTABLE_IDS.includes(id);

export const requestableApp = (id) => REQUESTABLE_APPS.find(a => a.id === id) || null;

// A request note is optional, short, and plain text.
export const NOTE_MAX = 500;
export const cleanNote = (v) => {
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, NOTE_MAX);
};
