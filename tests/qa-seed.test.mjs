// tests/qa-seed.test.mjs
//
// The QA org's seed plan (scripts/qa-seed-plan.mjs, state §0.153) is RUN here
// with a roster shaped like the real one, and every reference is checked to
// resolve — the reason the org exists is that the Test org's demo data did not
// (deals with no owner, in a pipeline the org never defined, §0.152). The
// runner's guards (scripts/seed-qa-org.mjs) are pinned by scan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildQaSeed, quoteTotals, approvalFor, QA_ID_MARK } from '../scripts/qa-seed-plan.mjs';
import { invoiceTotals } from '../src/utils/invoices.js';

const ROSTER = [
    { id: 'usr_admin', clerkUserId: 'user_admin', name: 'Jeff Russell', role: 'Admin' },
    { id: 'usr_mgr', clerkUserId: 'user_mgr', name: 'Bob Russell', role: 'Manager' },
    { id: 'usr_karen', clerkUserId: 'user_karen', name: 'Karen Russell', role: 'User' },
    { id: 'usr_jordan', clerkUserId: 'user_jordan', name: 'Jordan Rep', role: 'User' },
    { id: 'usr_ryan', clerkUserId: 'user_ryan', name: 'Ryan Algie', role: 'Dispatcher' },
    { id: 'usr_sav', clerkUserId: 'user_sav', name: 'Savannah Miller', role: 'Technician' },
];
const TODAY = '2026-10-01';
const plan = buildQaSeed({ orgId: 'org_qa_test', today: TODAY, roster: ROSTER });
const R = plan.rows;
const all = Object.values(R).flat();
const byId = (rows) => new Map(rows.map(r => [r.id, r]));
const rosterById = byId(ROSTER);

test('every row is in the org, carries the seed mark, and no id repeats', () => {
    assert.ok(all.length > 90);
    for (const r of all) {
        assert.equal(r.orgId, 'org_qa_test', r.id);
        assert.ok(r.id.includes(QA_ID_MARK), `${r.id} lacks ${QA_ID_MARK} — the runner could not tell it from someone else's row`);
    }
    assert.equal(new Set(all.map(r => r.id)).size, all.length, 'ids are unique across the plan');
});

test('every owned row is owned by a REAL roster user, with that user\'s name beside the id (§18b22); unowned rows have neither', () => {
    const owned = [['accounts', 'accountOwner'], ['contacts', 'assignedRep'], ['opportunities', 'salesRep'], ['leads', 'assignedTo'], ['tasks', 'assignedTo'], ['activities', 'author']];
    for (const [table, nameKey] of owned) {
        for (const r of R[table]) {
            if (r.ownerId) {
                const u = rosterById.get(r.ownerId);
                assert.ok(u, `${table} ${r.id}: owner ${r.ownerId} is not on the roster`);
                assert.equal(r[nameKey], u.name, `${table} ${r.id}: the name rides with the owner`);
                assert.equal(u.role, 'User', `${table} ${r.id}: owned by a sales rep`);
            } else {
                assert.equal(r[nameKey] || '', '', `${table} ${r.id}: no owner, no name`);
            }
        }
    }
    const owners = new Set(R.opportunities.map(o => o.ownerId));
    assert.ok(owners.has('usr_karen') && owners.has('usr_jordan') && owners.has(null), 'both reps own deals and some are unassigned (the visibility switch)');
});

test('every reference resolves — the Test org\'s failure, made impossible here', () => {
    const accts = byId(R.accounts), opps = byId(R.opportunities), quotes = byId(R.quotes), custs = byId(R.dispatchCustomers),
          jobs = byId(R.dispatchJobs), techs = byId(R.dispatchTechnicians), prods = byId(R.products), contacts = byId(R.contacts);
    for (const c of R.contacts) assert.ok(accts.has(c.accountId), c.id);
    for (const o of R.opportunities) {
        assert.ok(accts.has(o.accountId), o.id);
        assert.equal(o.account, accts.get(o.accountId).name);
        assert.equal(o.pipelineId, 'default', `${o.id}: a pipeline the org defines`);
        for (const cid of o.contactIds) assert.equal(contacts.get(cid)?.accountId, o.accountId, `${o.id}: its contacts are its account's`);
    }
    assert.deepEqual(plan.settings.extra.pipelines.map(p => p.id), ['default'], 'the one pipeline every deal names');
    for (const t of R.tasks) assert.ok(opps.has(t.opportunityId), t.id);
    for (const a of R.activities) assert.ok(opps.has(a.opportunityId), a.id);
    for (const q of R.quotes) {
        assert.ok(opps.has(q.opportunityId), q.id);
        for (const li of q.lineItems) assert.ok(prods.has(li.productId), `${q.id}: ${li.productId}`);
    }
    for (const j of R.dispatchJobs) {
        assert.ok(custs.has(j.customerId), j.id);
        if (j.quoteId) assert.equal(quotes.get(j.quoteId)?.status, 'Accepted', `${j.id}: only an accepted quote becomes a job`);
        if (j.assignedTechId) assert.ok(techs.has(j.assignedTechId), j.id);
    }
    for (const li of R.dispatchJobLineItems) assert.ok(jobs.has(li.jobId), li.id);
    for (const inv of R.invoices) assert.ok(jobs.has(inv.jobId), inv.id);
});

test('every deal carries its contacts\' names beside their ids, as the app stores them; no two contacts share a name', () => {
    // The Contacts tab and the buying committee read the deal's `contacts` TEXT; the
    // first cut wrote the ids alone and every deal read "No contacts linked yet." The
    // app links by name, so a name used twice is one contact to it (§0.154).
    const contacts = byId(R.contacts);
    for (const o of R.opportunities) {
        assert.ok(o.contactIds.length > 0, `${o.id}: a buying committee to show`);
        const want = o.contactIds.map(id => { const c = contacts.get(id); return `${c.firstName} ${c.lastName}${c.title ? ` (${c.title})` : ''}`; }).join(', ');
        assert.equal(o.contacts, want, `${o.id}: OpportunityModal's "First Last (Title)" form, in the ids' order`);
    }
    const names = R.contacts.map(c => `${c.firstName} ${c.lastName}`.toLowerCase());
    assert.equal(new Set(names).size, names.length, 'no contact name twice');
    const leadNames = new Set(R.leads.map(l => `${l.firstName} ${l.lastName}`.toLowerCase()));
    assert.ok(names.every(n => !leadNames.has(n)), 'no contact shares a lead\'s name');
});

test('the money adds up the way the app adds it', () => {
    for (const q of R.quotes) assert.deepEqual({ subtotal: q.subtotal, totalValue: q.totalValue, recurringValue: q.recurringValue, oneTimeValue: q.oneTimeValue }, quoteTotals(q.lineItems, 0), q.id);
    for (const q of R.quotes.filter(x => x.status === 'Accepted')) {
        assert.equal(R.opportunities.find(o => o.id === q.opportunityId).arr, q.totalValue, `${q.id}: an accepted quote's value is the deal's (syncToOpportunity)`);
    }
    for (const inv of R.invoices) {
        const t = invoiceTotals(inv.lineItems, Number(inv.taxRate));
        assert.equal(inv.total, t.total.toFixed(2), inv.id);
        const job = R.dispatchJobs.find(j => j.id === inv.jobId);
        assert.equal(job.invoiceStatus, inv.status, `${job.id}: the mirror (§18b44)`);
        assert.equal(Number(job.invoiceAmount), Number(inv.total));
    }
    const pending = R.quotes.find(q => q.status === 'Pending Approval');
    assert.deepEqual(approvalFor(pending.lineItems), { approvalTier: pending.approvalTier, approvalReason: pending.approvalReason });
    assert.equal(pending.approvalTier, 'VP approval', '25% is over the manager tier');
    assert.equal(R.quotes.find(q => q.status === 'Approved').approvedBy, 'Bob Russell', 'approved by the Manager — by name, as quotes.mjs stamps it (§0.155)');
    // A --reset rewrites only the keys a row names: every approval field is named, so a
    // send-back's note or an approval made while testing is put back too (§0.156).
    for (const q of R.quotes) {
        for (const k of ['approvalTier', 'approvalReason', 'approvedBy', 'approvedAt', 'approvalNote']) assert.ok(k in q, `${q.id} names ${k}`);
        assert.equal(q.approvalNote, null, `${q.id}: no seeded note`);
    }
    assert.equal(R.quotes.filter(q => q.approvedBy).length, 1, 'only the Approved quote carries an approver');
});

test('every status the next commit (quotes) needs is present, and the numbers are the app\'s formats', () => {
    const statuses = new Set(R.quotes.map(q => q.status));
    for (const s of ['Draft', 'Pending Approval', 'Approved', 'Sent to Customer', 'Accepted', 'Rejected / Lost']) assert.ok(statuses.has(s), s);
    const accepted = R.quotes.filter(q => q.status === 'Accepted');
    const jobQuotes = new Set(R.dispatchJobs.map(j => j.quoteId).filter(Boolean));
    assert.ok(accepted.some(q => !jobQuotes.has(q.id)), 'an accepted quote with no job yet — "Create dispatch job" has something to do');
    assert.ok(R.quotes.every(q => /^Q-2026-\d{3}$/.test(q.quoteNumber)));
    assert.ok(R.dispatchJobs.every(j => /^JOB-2026-\d{4}$/.test(j.jobNumber)));
    assert.ok(R.invoices.every(i => /^INV-2026-\d{4}$/.test(i.invoiceNumber)));
    assert.ok(R.dispatchCustomers.every(c => /^CUST-\d{4}$/.test(c.customerNumber)));
    assert.deepEqual(new Set(R.dispatchJobs.map(j => j.status)), new Set(['completed', 'scheduled', 'unscheduled']));
    assert.deepEqual(new Set(R.invoices.map(i => i.status)), new Set(['paid', 'issued']));
});

test('nothing seeded can reach a real person', () => {
    const emails = [], phones = [];
    for (const r of all) for (const [k, v] of Object.entries(r)) {
        if (/email/i.test(k) && v) emails.push(v);
        if (/phone/i.test(k) && v) phones.push(v);
    }
    assert.ok(emails.length > 20 && phones.length > 20);
    for (const e of emails) assert.match(e, /@([a-z0-9-]+\.)*example\.com$/, e);
    for (const p of phones) assert.match(p, /555-01\d\d$/, p);
    assert.deepEqual(plan.settings.extra.customerNotifications, { enabled: false });
});

test('the technician record is linked to the Technician\'s LOGIN (the Clerk id dispatch-jobs resolves), the second has none; the settings match the decisions', () => {
    assert.equal(R.dispatchTechnicians[0].userId, 'user_sav');
    assert.equal(R.dispatchTechnicians[1].userId, null);
    assert.ok(R.dispatchJobs.some(j => j.assignedTechId === R.dispatchTechnicians[0].id && j.status === 'scheduled'), 'their My Jobs has a job to show');
    const x = plan.settings.extra;
    assert.equal(x.dispatchEnabled, true);
    assert.equal(x.repsCanUseDispatch, false, '§0.152');
    assert.equal(x.unassignedDealsVisibleToReps, false, '§0.151');
    assert.deepEqual(Object.keys(plan.settings), ['extra'], 'keys merged into the app\'s own settings row: the seed never writes the row');
});

test('the same inputs give the same plan; a roster with no rep is refused; dates follow today', () => {
    assert.deepEqual(buildQaSeed({ orgId: 'org_qa_test', today: TODAY, roster: ROSTER }), plan);
    assert.throws(() => buildQaSeed({ orgId: 'org_qa_test', today: TODAY, roster: ROSTER.filter(u => u.role !== 'User') }), /no Sales Rep/);
    assert.throws(() => buildQaSeed({ orgId: 'nope', today: TODAY, roster: ROSTER }), /org id/);
    const later = buildQaSeed({ orgId: 'org_qa_test', today: '2027-01-15', roster: ROSTER });
    assert.notEqual(later.rows.opportunities[0].forecastedCloseDate, R.opportunities[0].forecastedCloseDate, 'close dates move with today');
    assert.equal(plan.roles.repA, 'Karen Russell', 'Karen first — the rep every earlier pass used');
});

test('the runner: Clerk must name the org, no foreign rows, columns checked, the app\'s settings row first, insert-only by default, never a delete', () => {
    const s = readFileSync(new URL('../scripts/seed-qa-org.mjs', import.meta.url), 'utf8').split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
    assert.ok(s.includes("if (clerkOrg.name !== expectName) die("));
    assert.ok(s.includes("const expectName = typeof args['expect-name'] === 'string' ? args['expect-name'] : 'Accelerep QA';"));
    assert.ok(s.includes('notLike(table.id, QA_ID_LIKE)') && s.includes('if (foreign.length && !ALLOW_EXISTING) die('));
    // The mark's underscores escaped for LIKE, where `_` is a wildcard.
    assert.ok(s.includes("const QA_ID_LIKE = `%${QA_ID_MARK.replace(/_/g, '\\\\_')}%`;"), 'the LIKE pattern escapes the mark');
    assert.ok(s.includes('const cols = new Set(Object.keys(getTableColumns(table)));'));
    assert.ok(s.includes("if (!APPLY) { console.log('\\nDry run — nothing written."), 'a dry run unless --apply');
    assert.ok(s.includes('.onConflictDoNothing({ target: table.id })'), 'insert-only by default');
    assert.ok(s.includes('setWhere: and(eq(table.orgId, orgId), like(table.id, QA_ID_LIKE)),'), '--reset rewrites only the seed\'s own rows in this org');
    assert.ok(!/\.delete\(|DELETE FROM|TRUNCATE/i.test(s), 'it never deletes');
    assert.ok(s.includes('const mergedExtra = { ...plan.settings.extra, ...(existingSettings?.extra || {}) };'), 'a key already set in the org wins');
    // The settings row is the APP's: a partial one written here reads back blank
    // wherever a key is missing (the GET's null/[] spread over the defaults).
    assert.ok(s.includes('if (!existingSettings) die('), 'no settings row: refused, the app writes it');
    assert.ok(s.includes('if (existingSettings.extra?.dispatchEnabled !== true) die('), 'Dispatch off: refused');
    assert.ok(s.includes('!Object.keys(existingSettings.fieldVisibility || {}).length) die('), 'a partial row (no stages, no field visibility): refused');
    assert.ok(s.indexOf('if (!existingSettings) die(') < s.indexOf('if (!APPLY) {'), 'refused on a dry run too');
    assert.ok(!/insert\(S\.settings\)/.test(s), 'the seed never inserts a settings row');
    assert.ok(s.includes('.where(and(eq(S.settings.id, existingSettings.id), eq(S.settings.orgId, orgId)));'), 'the merge lands on the row the app reads, in this org');
});
