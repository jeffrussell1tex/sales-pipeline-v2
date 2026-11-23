// Dispatch, invoices, quote to job and the audit log — the requests tests/gate-matrix.test.mjs asks beside the plain ones (state §0.288): the refusals
// the plain requests do not reach, each with the caller it lets through where there is one. rows: what each table answers (by its SQL name), or a function
// of the operation; env: process.env for that request alone.
const ON = { settings: [{ extra: { dispatchEnabled: true } }] };
const OPEN = { settings: [{ extra: { dispatchEnabled: true, repsCanUseDispatch: true } }] };

// The org's rows, each as stored. tech_me is the caller's own technician row (its userId their Clerk id), on job x1.
const o = { orgId: 'org_a' };
const TECH = { dispatch_technicians: [{ id: 'tech_me', ...o, userId: 'user_me', firstName: 'Ana', lastName: 'Field', status: 'active' }] };
const CUST = { dispatch_customers: [{ id: 'x1', ...o, name: 'Acme Plant', customerNumber: 'CUST-0001' }] };
const LOC = { dispatch_service_locations: [{ id: 'x1', ...o, customerId: 'x1', name: 'Dock 4', address: '1 Main St', city: 'Dallas' }] };
const LOC_BODY = { id: 'x1', customerId: 'x1', name: 'Dock 4', address: '1 Main St', city: 'Dallas' };
const EQUIP = { dispatch_equipment: [{ id: 'x1', ...o, name: 'Recovery unit', category: 'hvac', status: 'available' }] };
const JOB = { dispatch_jobs: [{ id: 'x1', ...o, jobNumber: 'JOB-2026-0001', customerId: 'c1', title: 'Tune-up', trade: 'hvac', jobType: 'maintenance', status: 'scheduled', assignedTechId: 'tech_me', coTechIds: '[]', updatedAt: '2026-11-20 10:00:00', stamp: '2026-11-20 10:00:00' }] };
const JOB_OF_ANOTHER = { dispatch_jobs: [{ ...JOB.dispatch_jobs[0], assignedTechId: 'tech_other' }] };
const VISIT = { dispatch_plan_visits: [{ id: 'x1', ...o, customerId: 'x1', planId: 'plan_1', dueDate: '2026-11-20', action: 'skipped' }] };
const BLOCK = { dispatch_schedule_blocks: [{ id: 'x1', ...o, techId: 'tech_me', blockType: 'pto', startDate: '2026-12-01', endDate: '2026-12-01', allDay: true }] };
const PLAN = { dispatch_service_plans: [{ id: 'x1', ...o, name: 'Gold', cadence: 'annual', coveredJobTypes: [] }] };
const VEHICLE = { dispatch_vehicles: [{ id: 'x1', ...o, name: 'Van 1', status: 'available', assignedTechId: 'tech_me' }] };
const LINE = { dispatch_job_line_items: [{ id: 'x1', ...o, jobId: 'x1', itemType: 'part', description: 'Filter', quantity: '1', unitPrice: '10', totalPrice: '10' }] };
const DRAFT = { invoices: [{ id: 'x1', ...o, jobId: 'x1', invoiceNumber: 'INV-2026-0001', status: 'draft', total: '10.00', taxRate: '0', lineItems: [] }] };
const AUDIT = { audit_log: [{ id: 'aud_1', ...o, action: 'update', entityType: 'account', entityId: 'x1' }] };

// Who the Dispatch gate lets in, per method: a rep refused, Admin, Manager and Dispatcher in, a Technician and ReadOnly
// reading only; then a rep let in where the org opens Dispatch to reps. own: the table a create asks whether the org holds its
// id already (state §0.290) — its reads answer none and its insert the row made.
const creating = (own, rows) => (own ? ({ kind, table }) => (kind === 'select' && table === own ? [] : rows[table] || []) : rows);
const gate = (what, rows, { post, put, del, get = {}, own } = {}) => [
    { what: `${what}: Dispatch on - reads`, method: 'GET', qs: get, rows: { ...ON, ...TECH, ...JOB, ...rows } },
    ...(post ? [{ what: `${what}: Dispatch on - creates`, method: 'POST', qs: {}, body: post, rows: creating(own, { ...ON, ...TECH, ...rows }) }] : []),
    ...(put ? [{ what: `${what}: Dispatch on - changes`, method: 'PUT', qs: { id: 'x1' }, body: put, rows: { ...ON, ...TECH, ...rows } }] : []),
    ...(del ? [{ what: `${what}: Dispatch on - deletes`, method: 'DELETE', qs: { id: 'x1' }, rows: { ...ON, ...TECH, ...rows } }] : []),
    { what: `${what}: Dispatch open to reps - a rep in`, method: post ? 'POST' : 'GET', qs: {}, body: post, rows: creating(own, { ...OPEN, ...TECH, ...JOB, ...rows }) },
];
const unlinked = (what, rows, qs = {}) => ({ what: `${what}: a Technician with no technician row linked reads nothing`, method: 'GET', qs, rows: { ...ON, ...rows, dispatch_technicians: [] } });

// Accepted quote x1 on deal opp1 (on no account, of no customer's name), no job made of it yet.
const QUOTE = {
    quotes: [{ id: 'x1', ...o, quoteNumber: 'Q-0001', version: 1, name: 'Chiller', status: 'Accepted', opportunityId: 'opp1', lineItems: [] }],
    opportunities: [{ id: 'opp1', ...o, ownerId: 'usr_q2j', salesRep: 'Quinn Jay', account: 'Acme Plant', opportunityName: 'Chiller' }],
    users: [{ id: 'usr_q2j', ...o, clerkUserId: 'user_q2j', name: 'Quinn Jay', role: 'User', active: true }],
};
const OTHERS_QUOTE = { ...QUOTE, opportunities: [{ ...QUOTE.opportunities[0], ownerId: 'usr_other', salesRep: 'Olive Other' }] };
// The job's table answers a read with none and the insert with the job made.
const quoteRows = (settings, quote = QUOTE) => ({ kind, table }) => {
    if (table === 'dispatch_jobs') return kind === 'insert' ? JOB.dispatch_jobs : [];
    return { ...settings, ...quote }[table] || [];
};
// The job has no invoice yet; the insert answers the one made.
const firstInvoice = ({ kind, table }) => (kind === 'select' && table === 'invoices' ? [] : { ...ON, ...JOB, ...DRAFT }[table] || []);

const off = { what: 'Dispatch off: everyone refused, an Admin too', method: 'GET', rows: {} };

export const REQUESTS = {
    'dispatch-customers': [
        off,
        ...gate('customers', CUST, { post: { id: 'x1', name: 'Acme Plant' }, put: { name: 'Acme Plant 2' }, del: true, own: 'dispatch_customers' }),
        { what: 'locations: Dispatch on - reads', method: 'GET', qs: { resource: 'locations' }, rows: { ...ON, ...TECH, ...JOB, ...LOC } },
        unlinked('customers', CUST),
        // A create's id the org holds (state §0.290): its record before any link is asked — the account and the customer these
        // name are none of the org's, which a link asked first would answer 404; a caller the gate refuses is refused all the same.
        { what: 'customers: a create whose id the org holds (409)', method: 'POST', qs: {}, body: { id: 'x1', name: 'Acme Plant', accountId: 'acc_gone' }, rows: { ...ON, ...TECH, ...CUST } },
        { what: 'customers: a create whose id the org holds (409), Dispatch open to reps', method: 'POST', qs: {}, body: { id: 'x1', name: 'Acme Plant', accountId: 'acc_gone' }, rows: { ...OPEN, ...TECH, ...CUST } },
        { what: 'locations: Dispatch on - creates', method: 'POST', qs: { resource: 'locations' }, body: LOC_BODY, rows: creating('dispatch_service_locations', { ...ON, ...TECH, ...CUST, ...LOC }) },
        { what: 'locations: Dispatch open to reps - a rep in', method: 'POST', qs: { resource: 'locations' }, body: LOC_BODY, rows: creating('dispatch_service_locations', { ...OPEN, ...TECH, ...CUST, ...LOC }) },
        { what: 'locations: a create for a customer the org does not hold (404)', method: 'POST', qs: { resource: 'locations' }, body: LOC_BODY, rows: creating('dispatch_service_locations', { ...ON, ...TECH, ...LOC }) },
        { what: 'locations: a create whose id the org holds (409)', method: 'POST', qs: { resource: 'locations' }, body: LOC_BODY, rows: { ...ON, ...TECH, ...LOC } },
        { what: 'locations: a create whose id the org holds (409), Dispatch open to reps', method: 'POST', qs: { resource: 'locations' }, body: LOC_BODY, rows: { ...OPEN, ...TECH, ...LOC } },
    ],
    'dispatch-equipment': [
        off,
        ...gate('equipment', EQUIP, { post: { id: 'x1', name: 'Recovery unit' }, put: { name: 'Recovery unit 2' }, del: true }),
        unlinked('equipment', EQUIP),
    ],
    'dispatch-jobs': [
        off,
        // The customer a create names is the org's: a new job's is asked (state §0.290).
        ...gate('jobs', { ...JOB, dispatch_customers: [{ id: 'c1', ...o, name: 'Acme Plant' }] }, { post: { id: 'x1', customerId: 'c1', title: 'Tune-up' }, put: { title: 'Tune-up 2' }, del: true, own: 'dispatch_jobs' }),
        unlinked('jobs', JOB),
        // As the customers': the account it names is none of the org's, and is never asked.
        { what: 'a create whose id the org holds (409)', method: 'POST', qs: {}, body: { id: 'x1', customerId: 'c1', title: 'Tune-up', accountId: 'acc_gone' }, rows: { ...ON, ...TECH, ...JOB } },
        { what: 'a create whose id the org holds (409), Dispatch open to reps', method: 'POST', qs: {}, body: { id: 'x1', customerId: 'c1', title: 'Tune-up', accountId: 'acc_gone' }, rows: { ...OPEN, ...TECH, ...JOB } },
        { what: 'a Technician reads no job they are not on (404)', method: 'GET', qs: { id: 'x1' }, rows: { ...ON, ...TECH, ...JOB_OF_ANOTHER } },
        { what: 'a Technician reads a job they are on', method: 'GET', qs: { id: 'x1' }, rows: { ...ON, ...TECH, ...JOB } },
        { what: 'line items: a Technician reads none of a job they are not on', method: 'GET', qs: { resource: 'lineitems', jobId: 'x1' }, rows: { ...ON, ...TECH, ...JOB_OF_ANOTHER, ...LINE } },
        { what: 'history: a Technician reads none of a job they are not on', method: 'GET', qs: { resource: 'history', jobId: 'x1' }, rows: { ...ON, ...TECH, ...JOB_OF_ANOTHER } },
        { what: 'line items: a Technician adds none', method: 'POST', qs: { resource: 'lineitems' }, body: { id: 'x1', jobId: 'x1', description: 'Filter' }, rows: { ...ON, ...TECH, ...JOB, ...LINE } },
        { what: 'line items: a Technician deletes none', method: 'DELETE', qs: { resource: 'lineitems', id: 'x1' }, rows: { ...ON, ...TECH, ...JOB, ...LINE } },
        { what: 'a Technician sends no crew field on their own job', method: 'PUT', qs: { id: 'x1' }, body: { assignedTechId: 'tech_me' }, rows: { ...ON, ...TECH, ...JOB } },
        { what: 'a Technician cannot cancel their own job', method: 'PUT', qs: { id: 'x1' }, body: { status: 'cancelled' }, rows: { ...ON, ...TECH, ...JOB } },
        { what: 'a Technician moves their own job on (en route)', method: 'PUT', qs: { id: 'x1' }, body: { status: 'en_route' }, rows: { ...ON, ...TECH, ...JOB } },
        { what: 'a Technician writes notes on their own job', method: 'PUT', qs: { id: 'x1' }, body: { techNotes: 'Filter changed' }, rows: { ...ON, ...TECH, ...JOB } },
        { what: 'a Technician not on the job: 404, before its fields are read', method: 'PUT', qs: { id: 'x1' }, body: { title: 'Tune-up 2' }, rows: { ...ON, ...TECH, ...JOB_OF_ANOTHER } },
    ],
    'dispatch-plan-visits': [
        off,
        ...gate('plan visits', { ...VISIT, ...CUST, dispatch_service_plans: [{ id: 'plan_1', ...o, name: 'Gold' }] }, { post: { customerId: 'x1', planId: 'plan_1', dueDate: '2026-11-20', action: 'skipped' }, del: true }),
        unlinked('plan visits', VISIT),
    ],
    'dispatch-schedule-blocks': [
        off,
        ...gate('time off', BLOCK, { post: { id: 'x1', techId: 'tech_me', startDate: '2026-12-01' }, put: { title: 'Holiday' }, del: true }),
        unlinked('time off', BLOCK),
    ],
    'dispatch-service-plans': [
        off,
        ...gate('service plans', PLAN, { post: { id: 'x1', name: 'Gold' }, put: { name: 'Gold 2' }, del: true }),
        unlinked('service plans', PLAN),
    ],
    'dispatch-technicians': [off, ...gate('technicians', {}, { post: { id: 'tech_me', firstName: 'Ana', lastName: 'Field' }, put: { phone: '555-0100' }, del: true })],
    'dispatch-vehicles': [
        off,
        ...gate('vehicles', VEHICLE, { post: { id: 'x1', name: 'Van 1' }, put: { name: 'Van 2' }, del: true }),
        unlinked('vehicles', VEHICLE),
    ],
    invoices: [
        off,
        ...gate('invoices', { ...DRAFT, ...JOB }, { put: { notes: 'PO to follow' } }),
        { what: 'invoices: Dispatch on - creates', method: 'POST', qs: {}, body: { jobId: 'x1', lineItems: [] }, rows: firstInvoice },
        { what: 'invoices: only an Admin deletes a draft', method: 'DELETE', qs: { id: 'x1' }, rows: { ...ON, ...JOB, ...DRAFT } },
    ],
    'quote-to-job': [
        { ...off, method: 'POST', qs: {}, body: { quoteId: 'x1' } },
        { what: 'a job made from an accepted quote: Dispatch on', method: 'POST', qs: {}, body: { quoteId: 'x1' }, rows: quoteRows(ON) },
        { what: 'a job made from a quote of the rep: Dispatch open to reps', method: 'POST', userId: 'user_q2j', qs: {}, body: { quoteId: 'x1' }, rows: quoteRows(OPEN) },
        { what: "the job of another rep's quote: a rep does not find it", method: 'GET', userId: 'user_q2j', qs: { quoteId: 'x1' }, rows: { ...ON, ...OTHERS_QUOTE } },
        { what: "a job made from another rep's quote, Dispatch open to reps: a rep does not find it", method: 'POST', userId: 'user_q2j', qs: {}, body: { quoteId: 'x1' }, rows: quoteRows(OPEN, OTHERS_QUOTE) },
        { what: 'the job of a quote: read by whoever sees its deal, Dispatch closed to reps', method: 'GET', userId: 'user_q2j', qs: { quoteId: 'x1' }, rows: { ...ON, ...QUOTE } },
    ],
    'audit-log': [
        { what: 'the trail: Admin and Manager read it', method: 'GET', qs: {}, rows: { ...AUDIT } },
        { what: 'a CRM entry: the CRM write roles', method: 'POST', qs: {}, body: { id: 'aud_1', action: 'update', entityType: 'account', entityId: 'x1' }, rows: { ...ON, ...AUDIT } },
        { what: 'a Dispatch entry: the Dispatch gate (a Dispatcher in, a rep out)', method: 'POST', qs: {}, body: { id: 'aud_1', action: 'dispatch.schedule', entityType: 'dispatch_job', entityId: 'x1' }, rows: { ...ON, ...AUDIT } },
        { what: 'a Dispatch entry: Dispatch open to reps', method: 'POST', qs: {}, body: { id: 'aud_1', action: 'dispatch.schedule', entityType: 'dispatch_job', entityId: 'x1' }, rows: { ...OPEN, ...AUDIT } },
        { what: 'an entry of no screen of the app: refused everyone', method: 'POST', qs: {}, body: { id: 'aud_1', action: 'user.role', entityType: 'user', entityId: 'x1' }, rows: { ...ON, ...AUDIT } },
    ],
};
