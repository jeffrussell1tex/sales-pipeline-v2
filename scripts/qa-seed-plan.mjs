// scripts/qa-seed-plan.mjs — the QA org's seed data, as a PURE plan.
//
// Jeff, 1 Oct 2026: "Should we create a clean set of test data for a new test
// instance" — after Karen's two accepted quotes turned out to sit on demo deals
// with no owner, in a pipeline the Test org never defined (state §0.152). This
// builds a coherent org for role testing: every owned row owned by a REAL roster
// user (ownerId and the display name together, guide §18b22), every deal in a
// pipeline that exists, close dates around today, quotes at every status, and the
// Dispatch module with customers, a technician linked to the Technician's login,
// jobs and invoices. scripts/seed-qa-org.mjs writes it; tests/qa-seed.test.mjs
// runs this and checks every reference resolves.
//
// Pure: no db, no Clerk, no clock — `today` and the roster are inputs, so the
// same inputs give the same plan (the runner's upserts depend on that). Every id
// carries `_qa_`, which is how the runner tells its own rows from anyone else's.
// Every email is @…example.com and every phone a 555-01xx fiction number, and
// the org's customer notifications are OFF: nothing seeded can reach a person.
import {
    addDaysYmd, quoteLineToJobItem, linesFromJobItems, invoiceTotals, dueDateFromTerms,
    mirrorForJob, jobFromQuote, DEFAULT_PRODUCT_TYPES,
} from '../src/utils/invoices.js';

export const QA_ID_MARK = '_qa_';
const pad = (n, w) => String(n).padStart(w, '0');
const at = (ymd) => new Date(`${ymd}T12:00:00.000Z`);   // a timestamp ON a calendar day, deterministic
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');

// quotes.mjs's calcTotals, the same arithmetic (it is not exported; the endpoint
// recomputes on every save, so a seeded quote matches what a save would write).
export function quoteTotals(lineItems = [], dealDiscountPct = 0) {
    let subtotal = 0, recurringValue = 0, oneTimeValue = 0;
    for (const item of lineItems) {
        const qty = Number(item.quantity) || 1;
        const listPrice = Number(item.listPrice) || 0;
        const discountPct = Math.min(Math.max(Number(item.discountPct) || 0, 0), 100);
        const total = listPrice * (1 - discountPct / 100) * qty;
        subtotal += total;
        if (item.productType === 'recurring') recurringValue += item.unit === 'month' ? total * 12 : total;
        else oneTimeValue += total;
    }
    const discountAmount = subtotal * (Number(dealDiscountPct) || 0) / 100;
    return {
        subtotal: subtotal.toFixed(2), totalValue: (subtotal - discountAmount).toFixed(2),
        recurringValue: recurringValue.toFixed(2), oneTimeValue: oneTimeValue.toFixed(2),
    };
}

// quotes.mjs's DEFAULT_APPROVAL_TIERS and its Pending Approval wording.
const TIERS = [
    { maxDiscount: 0.10, label: 'Rep' }, { maxDiscount: 0.20, label: 'Mgr approval' },
    { maxDiscount: 0.30, label: 'VP approval' }, { maxDiscount: 1.00, label: 'CFO approval' },
];
export function approvalFor(lineItems) {
    const avg = lineItems.length ? lineItems.reduce((s, li) => s + (Number(li.discountPct) || 0), 0) / lineItems.length : 0;
    const idx = TIERS.findIndex(t => avg / 100 <= t.maxDiscount);
    const tier = TIERS[idx < 0 ? TIERS.length - 1 : idx];
    const prev = TIERS[TIERS.indexOf(tier) - 1];
    return {
        approvalTier: tier.label,
        approvalReason: `Avg discount ${Math.round(avg)}% > ${prev ? Math.round(prev.maxDiscount * 100) : 0}% ${prev?.label || 'rep'} tier`,
    };
}

/**
 * @param {{ orgId: string, today: string,
 *           roster: { id: string, clerkUserId?: string|null, name: string, role: string }[] }} input
 */
export function buildQaSeed({ orgId, today, roster }) {
    if (!/^org_/.test(orgId || '')) throw new Error('buildQaSeed: an org id is required');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) throw new Error('buildQaSeed: today must be YYYY-MM-DD');
    const list = (Array.isArray(roster) ? roster : []).filter(u => u?.id && u?.name);
    const byRole = (r) => list.filter(u => u.role === r).sort((a, b) => a.name.localeCompare(b.name));
    // Karen first when she is on the roster — she is the rep every earlier pass used.
    const reps = byRole('User').sort((a, b) => (b.name === 'Karen Russell') - (a.name === 'Karen Russell'));
    if (!reps.length) throw new Error('buildQaSeed: the roster has no Sales Rep (role User) — sync the QA org first');
    const repA = reps[0], repB = reps[1] || reps[0];
    const admin = byRole('Admin')[0] || null;
    const manager = byRole('Manager')[0] || null;
    const technician = byRole('Technician')[0] || null;
    const year = today.slice(0, 4);
    const d = (n) => addDaysYmd(today, n);
    const own = (u) => (u ? { ownerId: u.id, name: u.name } : { ownerId: null, name: '' });

    // ── settings ────────────────────────────────────────────────────────────
    // Keys MERGED into the org's own settings row, which the APP writes (an
    // Admin's first change saves the whole object). The runner never writes the
    // row: one written here would be partial, and the GET hands back null or []
    // for each key it lacks, spread OVER the client's defaults (useSettings) —
    // pain points, quotas, KPIs and field visibility blank, unlike any real org.
    const settings = {
        extra: {
            dispatchEnabled: true,
            repsCanUseDispatch: false,              // §0.152 — reps out of Dispatch
            unassignedDealsVisibleToReps: false,    // §0.151 — reps see their own deals
            unassignedLeadsVisibleToReps: true,     // the leads default
            leadsEnabled: true,
            quotesEnabled: true,
            pipelines: [{ id: 'default', name: 'New Business', color: '#2563eb' }],
            customerNotifications: { enabled: false },   // nothing seeded may email a customer
        },
    };

    // ── the price book ──────────────────────────────────────────────────────
    const products = [
        ['Field Service Platform',      'FSP-100',  'recurring', 400,  'month', 'Platform'],
        ['Per-Technician License',      'FSP-TECH', 'recurring', 45,   'month', 'Platform'],
        ['Implementation Package',      'IMP-STD',  'one_time',  5000, 'flat',  'Services'],
        ['On-site Training Day',        'SVC-TRN',  'service',   1200, 'flat',  'Services'],
        ['Preventive Maintenance Visit','SVC-PM',   'service',   250,  'flat',  'Field'],
        ['Replacement Sensor Kit',      'PRT-SNS',  'one_time',  180,  'flat',  'Parts'],
    ].map(([name, sku, productType, listPrice, unit, category], i) => ({
        id: `prod${QA_ID_MARK}${pad(i + 1, 2)}`, orgId, name, sku, productType, listPrice: listPrice.toFixed(2),
        unit, category, active: true, sortOrder: i, createdBy: admin?.name || null,
    }));
    const P = Object.fromEntries(products.map(p => [p.sku, p]));

    // ── accounts and contacts ───────────────────────────────────────────────
    const acctSpec = [
        ['Northwind Facilities Group',      'Facilities Management', 'Chicago',      'IL', repA],
        ['Bluebird HVAC Supply',            'Wholesale',             'Milwaukee',    'WI', repA],
        ['Cedar Ridge Property Management', 'Real Estate',           'Naperville',   'IL', repA],
        ['Harbor Point Hospitality',        'Hospitality',           'Indianapolis', 'IN', repB],
        ['Summit Cold Storage',             'Logistics',             'Columbus',     'OH', repB],
        ['Prairie Health Clinics',          'Healthcare',            'Des Moines',   'IA', repB],
        ['Ironwood Manufacturing',          'Manufacturing',         'Detroit',      'MI', null],
        ['Lakeside School District',        'Education',             'Madison',      'WI', null],
    ];
    const accounts = acctSpec.map(([name, industry, city, state, owner], i) => {
        const o = own(owner);
        return {
            id: `acct${QA_ID_MARK}${pad(i + 1, 2)}`, orgId, name, industry, verticalMarket: industry, city, state, country: 'United States',
            phone: `+1 312-555-01${pad(10 + i, 2)}`, website: `https://www.${slug(name)}.example.com`,
            accountOwner: o.name, assignedRep: o.name, ownerId: o.ownerId, accountTier: 'account',
        };
    });
    const people = [['Dana', 'Whitaker', 'Facilities Director'], ['Luis', 'Ortega', 'Operations Manager'],
                    ['Priya', 'Shah', 'Procurement Lead'], ['Tom', 'Becker', 'Plant Manager'],
                    ['Grace', 'Kim', 'VP Operations'], ['Omar', 'Haddad', 'IT Director'],
                    ['Elena', 'Novak', 'Controller'], ['Sam', 'Reyes', 'Maintenance Supervisor']];
    const contacts = [];
    accounts.forEach((a, i) => {
        for (let k = 0; k < 2; k++) {
            const [first, last, title] = people[(i * 2 + k) % people.length];
            contacts.push({
                id: `con${QA_ID_MARK}${pad(i * 2 + k + 1, 2)}`, orgId, firstName: first, lastName: last, title,
                company: a.name, accountId: a.id, email: `${first}.${last}@${slug(a.name)}.example.com`.toLowerCase(),
                phone: `+1 312-555-01${pad(30 + i * 2 + k, 2)}`, city: a.city, state: a.state, country: a.country,
                assignedRep: a.accountOwner, ownerId: a.ownerId,
            });
        }
    });
    const contactsOf = (acctId) => contacts.filter(c => c.accountId === acctId).map(c => c.id);

    // ── deals ────────────────────────────────────────────────────────────────
    // [account#, name, stage, arr, closeIn, probability, products]
    const PROB = { Qualification: 10, Discovery: 20, 'Evaluation (Demo)': 40, Proposal: 50, 'Negotiation/Review': 70, Contracts: 90, 'Closed Won': 100, 'Closed Lost': 0 };
    const dealSpec = [
        [1, 'Facilities Platform Rollout', 'Proposal',           48000,  20],
        [2, 'Warehouse Scheduling',        'Negotiation/Review', 36000,  35],
        [3, 'Maintenance Dispatch Pilot',  'Discovery',          18000,  60],
        [1, 'Service Desk Expansion',      'Contracts',          60000,  10],
        [2, 'Annual Renewal',              'Closed Won',         24000, -12],
        [3, 'Tenant Portal',               'Closed Lost',        15000, -20],
        [4, 'Guest Services Scheduling',   'Qualification',      30000,  75],
        [5, 'Cold Chain Monitoring',       'Proposal',           42000,  28],
        [6, 'Clinic Staffing Suite',       'Evaluation (Demo)',  54000,  45],
        [5, 'Dock Scheduling Add-on',      'Negotiation/Review', 12000,  15],
        [4, 'Banquet Crew Scheduling',     'Closed Won',         20000,  -5],
        [7, 'Plant Shift Optimization',    'Qualification',      70000,  90],
        [8, 'Facilities Work Orders',      'Discovery',          25000, 100],
        [7, 'Safety Compliance Module',    'Proposal',           22000,  40],
    ];
    const opportunities = dealSpec.map(([acctNo, title, stage, arr, closeIn], i) => {
        const a = accounts[acctNo - 1];
        const closed = stage === 'Closed Won' || stage === 'Closed Lost';
        const close = d(closeIn);
        return {
            id: `opp${QA_ID_MARK}${pad(i + 1, 2)}`, orgId, pipelineId: 'default',
            opportunityName: `${a.name} — ${title}`, account: a.name, accountId: a.id,
            salesRep: a.accountOwner, ownerId: a.ownerId, stage, arr: arr.toFixed(2),
            forecastedCloseDate: close, probability: PROB[stage], products: 'Field Service Platform',
            contactIds: contactsOf(a.id), vertical: a.industry,
            createdDate: d(-60 + i), stageChangedDate: closed ? close : d(-10 + (i % 7)),
            wonDate: stage === 'Closed Won' ? close : null,
            lostDate: stage === 'Closed Lost' ? close : null,
            lostReason: stage === 'Closed Lost' ? 'Chose a lower-priced competitor' : null,
            lostCategory: stage === 'Closed Lost' ? 'Price' : null,
            createdBy: admin?.name || null, stageHistory: [], comments: [],
        };
    });
    const O = (n) => opportunities[n - 1];

    // ── leads, tasks, activities ────────────────────────────────────────────
    const leadSpec = [
        ['Ava', 'Brooks', 'Metro Parking Systems', 'Website', 'New', repA, 72],
        ['Ben', 'Carter', 'Riverbend Apartments', 'Referral', 'Contacted', repA, 64],
        ['Chloe', 'Diaz', 'Granite Peak Resorts', 'Trade Show', 'Qualified', repA, 81],
        ['Derek', 'Ellis', 'Sunrise Senior Living', 'LinkedIn', 'Working', repB, 58],
        ['Fiona', 'Grant', 'Keystone Logistics', 'Webinar', 'New', repB, 45],
        ['Gabe', 'Hill', 'Oak Valley Schools', 'Website', 'Contacted', repB, 52],
        ['Hana', 'Ito', 'Copperline Utilities', 'Cold Outreach', 'New', null, 38],
        ['Ivan', 'Jones', 'Redwood Medical Group', 'Partner Referral', 'New', null, 47],
    ];
    const leads = leadSpec.map(([first, last, company, source, status, owner, score], i) => {
        const o = own(owner);
        return {
            id: `lead${QA_ID_MARK}${pad(i + 1, 2)}`, orgId, firstName: first, lastName: last, company, title: 'Operations Manager',
            email: `${first}.${last}@${slug(company)}.example.com`.toLowerCase(), phone: `+1 312-555-01${pad(60 + i, 2)}`,
            source, status, score, estimatedARR: (15000 + i * 2500).toFixed(2), assignedTo: o.name, ownerId: o.ownerId,
            firstTouchDate: d(-20 + i),
        };
    });
    const taskSpec = [
        ['Follow up on the rollout proposal', 'Follow-up', -2, '10:00', 'High',   1, false],
        ['Call about warehouse scheduling',   'Call',       0, '14:30', 'Medium', 2, false],
        ['Contract review meeting',           'Meeting',    3, '11:00', 'High',   4, false],
        ['Send the renewal summary',          'Email',     -5, '09:00', 'Low',    5, true],
        ['Call about cold chain monitoring',  'Call',      -1, '15:00', 'High',   8, false],
        ['Follow up on the clinic demo',      'Follow-up',  0, '13:00', 'Medium', 9, false],
        ['Dock scheduling pricing meeting',   'Meeting',    5, '10:30', 'Medium', 10, false],
        ['Find an owner for Ironwood',        'Admin',      2, '09:30', 'Low',    12, false],
    ];
    const tasks = taskSpec.map(([title, type, dueIn, dueTime, priority, oppNo, done], i) => {
        const o = O(oppNo);
        return {
            id: `task${QA_ID_MARK}${pad(i + 1, 2)}`, orgId, title, type, dueDate: d(dueIn), dueTime, priority,
            status: done ? 'Completed' : 'Open', completed: done, completedDate: done ? d(dueIn) : null,
            opportunityId: o.id, accountId: o.accountId, assignedTo: o.salesRep, ownerId: o.ownerId,
        };
    });
    const actSpec = [
        ['Call', 1, -1, 'Connected', 15], ['Email', 2, -2, 'Sent', null], ['Meeting', 4, -3, 'Completed', 45],
        ['Call', 5, -14, 'Connected', 10], ['Meeting', 8, -4, 'Completed', 30], ['Call', 9, -2, 'Left voicemail', 3],
        ['Email', 10, -6, 'Sent', null], ['Call', 11, -8, 'Connected', 20],
    ];
    const activities = actSpec.map(([type, oppNo, dayIn, outcome, duration], i) => {
        const o = O(oppNo);
        return {
            id: `act${QA_ID_MARK}${pad(i + 1, 2)}`, orgId, type, date: d(dayIn), subject: `${type} — ${o.opportunityName}`,
            notes: `${type} with the customer about ${o.opportunityName}.`, outcome, duration,
            opportunityId: o.id, accountId: o.accountId, contactIds: o.contactIds.slice(0, 1),
            author: o.salesRep, ownerId: o.ownerId,
        };
    });

    // ── quotes ──────────────────────────────────────────────────────────────
    const line = (sku, quantity, discountPct = 0) => {
        const p = P[sku];
        return { productId: p.id, productName: p.name, productType: p.productType, unit: p.unit,
                 quantity, listPrice: Number(p.listPrice), discountPct, customPrice: false };
    };
    // [deal#, status, lines]
    const quoteSpec = [
        [1,  'Sent to Customer', [line('FSP-100', 1, 5), line('IMP-STD', 1, 5)]],
        [2,  'Pending Approval', [line('FSP-100', 1, 25), line('FSP-TECH', 20, 25)]],
        [3,  'Draft',            [line('FSP-100', 1), line('SVC-TRN', 2)]],
        [4,  'Accepted',         [line('FSP-100', 1), line('FSP-TECH', 30), line('IMP-STD', 1)]],
        [5,  'Accepted',         [line('FSP-100', 1), line('SVC-PM', 4)]],
        [6,  'Rejected / Lost',  [line('FSP-100', 1), line('IMP-STD', 1)]],
        [8,  'Approved',         [line('FSP-100', 1, 15), line('SVC-TRN', 1, 15)]],
        [9,  'Draft',            [line('FSP-100', 1), line('FSP-TECH', 12)]],
        [10, 'Sent to Customer', [line('FSP-TECH', 10), line('SVC-PM', 2)]],
        [11, 'Accepted',         [line('SVC-TRN', 2), line('SVC-PM', 2), line('PRT-SNS', 4)]],
        [14, 'Draft',            [line('FSP-100', 1), line('SVC-TRN', 1)]],
    ];
    const quotes = quoteSpec.map(([oppNo, status, lineItems], i) => {
        const o = O(oppNo);
        const totals = quoteTotals(lineItems, 0);
        const pending = status === 'Pending Approval' ? approvalFor(lineItems) : {};
        const approved = status === 'Approved' ? { ...approvalFor(lineItems), approvedBy: manager?.clerkUserId || admin?.clerkUserId || null, approvedAt: at(d(-1)) } : {};
        return {
            id: `q${QA_ID_MARK}${pad(i + 1, 2)}`, orgId, opportunityId: o.id, quoteNumber: `Q-${year}-${pad(i + 1, 3)}`, version: 1,
            name: `${o.opportunityName} v1`, status, validUntil: d(30), paymentTerms: 'Net 30', billingContact: null,
            lineItems, dealDiscount: '0', ...totals, ...pending, ...approved,
            sentAt: status === 'Sent to Customer' ? at(d(-2)) : null,
            acceptedAt: status === 'Accepted' ? at(o.wonDate || d(-1)) : null,
            syncedToOpp: status === 'Accepted', createdBy: o.salesRep || admin?.name || null,
            notes: null,
        };
    });
    // An accepted quote's value is the deal's (quotes.mjs syncToOpportunity).
    for (const q of quotes) if (q.status === 'Accepted') opportunities.find(o => o.id === q.opportunityId).arr = q.totalValue;
    const Q = (n) => quotes[n - 1];

    // ── Dispatch: technicians, customers, jobs, invoices ────────────────────
    const technicians = [
        technician
            ? { first: technician.name.split(' ')[0], last: technician.name.split(' ').slice(1).join(' ') || 'Tech', userId: technician.clerkUserId || null }
            : { first: 'Taylor', last: 'Morgan', userId: null },
        { first: 'Marco', last: 'Diaz', userId: null },   // a subcontractor with no login
    ].map((t, i) => ({
        id: `dtech${QA_ID_MARK}${pad(i + 1, 2)}`, orgId, userId: t.userId, firstName: t.first, lastName: t.last,
        email: `${t.first}.${t.last}@fieldtech.example.com`.toLowerCase(), phone: `+1 312-555-01${pad(80 + i, 2)}`,
        employmentType: i === 0 ? 'employee' : 'subcontractor', status: 'active', licenseLevel: 'Journeyman',
        avatarInitials: `${t.first[0]}${t.last[0]}`.toUpperCase(),
    }));
    const custFor = (acct, n) => {
        const c = contacts.find(x => x.accountId === acct.id);
        return {
            id: `dcust${QA_ID_MARK}${pad(n, 2)}`, orgId, accountId: acct.id, customerNumber: `CUST-${pad(n, 4)}`, name: acct.name,
            contactName: `${c.firstName} ${c.lastName}`, contactEmail: c.email, contactPhone: c.phone, customerType: 'commercial',
            serviceAddress: `${100 + n} Main Street`, serviceCity: acct.city, serviceState: acct.state, serviceZip: '60601',
            billingAddress: `${100 + n} Main Street`, billingCity: acct.city, billingState: acct.state, billingZip: '60601',
        };
    };
    const dispatchCustomers = [custFor(accounts[1], 1), custFor(accounts[3], 2), custFor(accounts[4], 3), {
        id: `dcust${QA_ID_MARK}04`, orgId, accountId: null, customerNumber: 'CUST-0004', name: 'Lakeview Apartments',
        contactName: 'Jordan Lee', contactEmail: 'jordan.lee@lakeviewapts.example.com', contactPhone: '+1 312-555-0190',
        customerType: 'residential', serviceAddress: '410 Lakeview Drive', serviceCity: 'Evanston', serviceState: 'IL', serviceZip: '60201',
    }];
    const C = (n) => dispatchCustomers[n - 1];
    const byProductId = Object.fromEntries(products.map(p => [p.id, p]));
    const jobItemsFor = (jobId, lineItems) => lineItems.map((li, i) => ({
        id: `djli${QA_ID_MARK}${jobId.slice(-2)}${pad(i + 1, 2)}`, orgId, jobId,
        ...quoteLineToJobItem(li, i, byProductId[li.productId] || null, DEFAULT_PRODUCT_TYPES),
    }));
    const jobFromQ = (n, q, customer, extra) => {
        const o = opportunities.find(x => x.id === q.opportunityId);
        const { title, description } = jobFromQuote(q, o);
        return {
            id: `djob${QA_ID_MARK}${pad(n, 2)}`, orgId, jobNumber: `JOB-${year}-${pad(n, 4)}`, customerId: customer.id,
            accountId: o.accountId, opportunityId: o.id, quoteId: q.id, title, description,
            trade: '', jobType: '', priority: 'normal', timeSlot: 'anytime', invoiceStatus: 'none',
            createdBy: admin?.clerkUserId || null, ...extra,
        };
    };
    const dispatchJobs = [
        // The renewal (deal 5): done last week by the linked technician; invoiced and paid.
        jobFromQ(1, Q(5), C(1), { status: 'completed', scheduledDate: d(-7), scheduledStart: '09:00', scheduledEnd: '12:00', timeSlot: 'exact', assignedTechId: technicians[0].id }),
        // The banquet crew job (deal 11): scheduled next week for the linked technician — their My Jobs.
        jobFromQ(2, Q(10), C(2), { status: 'scheduled', scheduledDate: d(5), scheduledStart: '08:00', scheduledEnd: '11:00', timeSlot: 'exact', assignedTechId: technicians[0].id }),
        // A service call with no quote: an emergency repair, done, invoiced, not yet paid.
        { id: `djob${QA_ID_MARK}03`, orgId, jobNumber: `JOB-${year}-0003`, customerId: C(3).id, accountId: C(3).accountId,
          title: 'Freezer compressor failure', description: 'Emergency repair — walk-in freezer 2.', trade: '', jobType: '',
          status: 'completed', priority: 'high', scheduledDate: d(-3), scheduledStart: '07:00', scheduledEnd: '10:00', timeSlot: 'exact',
          assignedTechId: technicians[1].id, invoiceStatus: 'none', createdBy: admin?.clerkUserId || null },
        // A residential maintenance visit, waiting to be scheduled — the Queue.
        { id: `djob${QA_ID_MARK}04`, orgId, jobNumber: `JOB-${year}-0004`, customerId: C(4).id, accountId: null,
          title: 'Quarterly preventive maintenance', description: 'Two rooftop units.', trade: '', jobType: '',
          status: 'unscheduled', priority: 'normal', timeSlot: 'anytime', invoiceStatus: 'none', createdBy: admin?.clerkUserId || null },
    ];
    const dispatchJobLineItems = [
        ...jobItemsFor(dispatchJobs[0].id, Q(5).lineItems),
        ...jobItemsFor(dispatchJobs[1].id, Q(10).lineItems),
        ...jobItemsFor(dispatchJobs[2].id, [line('SVC-PM', 3), line('PRT-SNS', 2)]),
        ...jobItemsFor(dispatchJobs[3].id, [line('SVC-PM', 2)]),
    ];
    const invoiceFor = (n, job, { status, issueIn, paidIn, terms }) => {
        const lines = linesFromJobItems(dispatchJobLineItems.filter(li => li.jobId === job.id));
        const t = invoiceTotals(lines, 0);
        const issueDate = d(issueIn);
        return {
            id: `inv${QA_ID_MARK}${pad(n, 2)}`, orgId, invoiceNumber: `INV-${year}-${pad(n, 4)}`, jobId: job.id,
            quoteId: job.quoteId || null, customerId: job.customerId, accountId: job.accountId || null, opportunityId: job.opportunityId || null,
            status, issueDate, dueDate: dueDateFromTerms(issueDate, terms), paymentTerms: terms,
            lineItems: lines, subtotal: t.subtotal.toFixed(2), taxRate: t.taxRate.toFixed(2), taxAmount: t.taxAmount.toFixed(2), total: t.total.toFixed(2),
            amountPaid: status === 'paid' ? t.total.toFixed(2) : null, paidAt: status === 'paid' ? d(paidIn) : null,
            issuedAt: at(issueDate), createdBy: admin?.clerkUserId || null,
        };
    };
    const invoices = [
        invoiceFor(1, dispatchJobs[0], { status: 'paid', issueIn: -6, paidIn: -2, terms: 'Net 30' }),
        invoiceFor(2, dispatchJobs[2], { status: 'issued', issueIn: -2, terms: 'Net 15' }),
    ];
    // The job's three invoice columns mirror its live invoice (guide §18b44).
    for (const inv of invoices) Object.assign(dispatchJobs.find(j => j.id === inv.jobId), mirrorForJob({ ...inv, total: Number(inv.total) }));

    return {
        orgId, today,
        roles: { repA: repA.name, repB: repB.name, admin: admin?.name || null, manager: manager?.name || null, technician: technician?.name || null },
        settings,
        rows: { products, accounts, contacts, opportunities, leads, tasks, activities, quotes, dispatchTechnicians: technicians, dispatchCustomers, dispatchJobs, dispatchJobLineItems, invoices },
    };
}
