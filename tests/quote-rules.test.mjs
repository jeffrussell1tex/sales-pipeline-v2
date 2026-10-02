// tests/quote-rules.test.mjs
//
// Commit (C) of the rep / Dispatcher / quotes plan (state §0.155). The one rule for
// what may happen to a quote (src/utils/quoteRules.js) is RUN here — every move by
// role and by need for approval, what an edit does, the discount and its tier. The
// endpoints (quotes.mjs, quote-email.mjs, quote-to-job.mjs) and the Quotes tab are
// pinned by scan (§18b23: the endpoints import db/index.js and cannot load under
// `npm test`): they read this rule and the deal's access, and nothing else. The
// whole path against the test database: tests/integration/quotes-access.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    QUOTE_STATUSES, quoteIsLocked, canApproveQuotes, quoteDiscountPct, approvalTierFor, tierNeedsApproval,
    quoteNeedsApproval, quoteTransitionRefusal, quoteMoveAllowed, quoteEditOutcome, quoteTermsChanged, DEFAULT_QUOTE_APPROVAL_TIERS,
} from '../src/utils/quoteRules.js';
import { QUOTE_ACCEPTABLE_STATUSES } from '../src/utils/invoices.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const move = (from, to, role = 'User', needsApproval = false) => quoteTransitionRefusal({ from, to, role, needsApproval });

// ── the rule, RUN ────────────────────────────────────────────────────────────

test('the discount is the server\'s arithmetic — the average line discount, or the deal discount when larger; a tier that names an approver needs one', () => {
    assert.equal(quoteDiscountPct([{ discountPct: 10 }, { discountPct: 30 }], 0), 20);
    assert.equal(quoteDiscountPct([{ discountPct: 5 }], 15), 15, 'the deal-level discount when it is larger');
    assert.equal(quoteDiscountPct([], 0), 0);
    assert.equal(quoteDiscountPct([{ discountPct: 150 }, { discountPct: -20 }], '0.00'), 50, 'each clamped to 0–100');
    assert.equal(approvalTierFor(10).label, 'Rep');
    assert.equal(approvalTierFor(10.5).label, 'Mgr approval');
    assert.equal(approvalTierFor(25).label, 'VP approval');
    assert.equal(approvalTierFor(99).label, 'CFO approval');
    assert.equal(tierNeedsApproval(approvalTierFor(10)), false);
    assert.equal(tierNeedsApproval(approvalTierFor(15)), true);
    assert.equal(tierNeedsApproval({ label: 'New tier', approver: '' }), false, 'a tier saved without an approver routes nowhere');
    const custom = [{ maxDiscount: 0.05, label: 'Rep', approver: null }, { maxDiscount: 1, label: 'Owner', approver: 'Owner' }];
    assert.equal(quoteNeedsApproval({ lineItems: [{ discountPct: 6 }] }, custom), true, 'the org\'s own tiers');
    assert.equal(quoteNeedsApproval({ lineItems: [{ discountPct: 6 }] }), false, 'the defaults: 6% is the rep\'s to give');
    assert.ok(Object.isFrozen(DEFAULT_QUOTE_APPROVAL_TIERS));
});

test('only an Admin or a Manager approves, or sends back a quote waiting for approval', () => {
    for (const role of ['Admin', 'Manager']) {
        assert.equal(canApproveQuotes(role), true, role);
        assert.equal(move('Pending Approval', 'Approved', role), null, role);
        assert.equal(move('Pending Approval', 'Rejected / Lost', role), null, role);
    }
    for (const role of ['User', 'ReadOnly', 'Dispatcher', 'Technician', 'member', undefined]) {
        assert.equal(canApproveQuotes(role), false, String(role));
        assert.match(move('Pending Approval', 'Approved', role), /Only an Admin or a Manager approves/, String(role));
        assert.match(move('Pending Approval', 'Rejected / Lost', role), /Only an Admin or a Manager sends back/, String(role));
    }
    assert.match(move('Draft', 'Approved', 'Admin'), /Only a quote waiting for approval/, 'not even an Admin skips the queue');
});

test('a quote whose discount needs approval is not sent until it is approved; one within the rep\'s discretion is', () => {
    assert.match(move('Draft', 'Sent to Customer', 'User', true), /needs approval before the quote is sent/);
    assert.equal(move('Draft', 'Sent to Customer', 'User', false), null);
    assert.equal(move('Approved', 'Sent to Customer', 'User', true), null, 'approved: it may go');
    assert.match(move('Pending Approval', 'Sent to Customer', 'User', true), /waiting for approval/);
    assert.equal(move('Draft', 'Pending Approval'), null);
    assert.match(move('Approved', 'Pending Approval'), /Only a draft is submitted/);
});

test('an accepted quote is final; a sent one moves only forward; a closed one is closed; the app\'s own statuses are not set by hand', () => {
    for (const to of QUOTE_STATUSES.filter(s => s !== 'Accepted')) assert.match(move('Accepted', to, 'Admin'), /accepted quote is final/, to);
    for (const from of ['Rejected / Lost', 'Rejected', 'Superseded', 'Expired']) assert.match(move(from, 'Draft', 'Admin'), /closed/, from);
    assert.equal(move('Sent to Customer', 'Accepted'), null);
    assert.equal(move('Sent to Customer', 'Negotiating'), null);
    assert.equal(move('Negotiating', 'Rejected / Lost'), null, 'the customer declined');
    assert.match(move('Sent to Customer', 'Draft'), /cannot go back to Draft/);
    assert.equal(move('Sent to Customer', 'Sent to Customer'), null, 'a save that keeps the status is not a move (quoteEditOutcome judges the edit)');
    assert.match(move('Draft', 'Accepted'), /Only a sent or approved quote can be accepted/);
    for (const s of ['Superseded', 'Expired']) assert.match(move('Draft', s, 'Admin'), /set by the app/, s);
    assert.match(move('Draft', 'Sent'), /is not a quote status/, 'the old word is not something to move to');
    // The accept card (invoices.js) and the rule agree on what can be accepted.
    for (const s of QUOTE_ACCEPTABLE_STATUSES) assert.equal(move(s, 'Accepted'), null, s);
});

test('a button offers a REAL move: not Submit on a quote already submitted, not Send on one already sent (caught in the pane, §0.155)', () => {
    assert.equal(quoteMoveAllowed({ from: 'Pending Approval', to: 'Pending Approval', role: 'User', needsApproval: true }), false);
    assert.equal(quoteMoveAllowed({ from: 'Sent to Customer', to: 'Sent to Customer', role: 'User' }), false);
    assert.equal(quoteMoveAllowed({ from: 'Draft', to: 'Sent to Customer', role: 'User', needsApproval: false }), true);
    assert.equal(quoteMoveAllowed({ from: 'Draft', to: 'Sent to Customer', role: 'User', needsApproval: true }), false);
    assert.equal(quoteMoveAllowed({ from: 'Draft', to: 'Pending Approval', role: 'User', needsApproval: true }), true);
    assert.equal(quoteMoveAllowed({ from: 'Approved', to: 'Sent to Customer', role: 'User', needsApproval: true }), true);
    assert.equal(quoteMoveAllowed({ from: undefined, to: 'Draft' }), false, 'no status is a Draft');
});

test('an edit: a sent or accepted quote\'s lines and terms are final; an approved one returns to Draft without its approval; a draft stays a draft', () => {
    assert.deepEqual(quoteEditOutcome({ status: 'Draft', termsChanged: true }), { status: 'Draft', refusal: null, approvalCleared: false });
    assert.deepEqual(quoteEditOutcome({ status: 'Approved', termsChanged: true }), { status: 'Draft', refusal: null, approvalCleared: true });
    assert.deepEqual(quoteEditOutcome({ status: 'Approved', termsChanged: false }), { status: 'Approved', refusal: null, approvalCleared: false }, 'a save that changes nothing keeps the approval');
    assert.match(quoteEditOutcome({ status: 'Accepted', termsChanged: true }).refusal, /accepted quote is final/);
    for (const s of ['Sent to Customer', 'Negotiating', 'Rejected / Lost', 'Superseded', 'Expired', 'Sent']) {
        assert.equal(quoteIsLocked(s), true, s);
        assert.match(quoteEditOutcome({ status: s, termsChanged: true }).refusal, /lines and terms are final/, s);
    }
    for (const s of ['Draft', 'Pending Approval', 'Approved']) assert.equal(quoteIsLocked(s), false, s);
});

test('a change to the terms is a change in MEANING: jsonb key order, "0.00" and null-vs-empty are not; a line, the discount or the notes are', () => {
    const stored = { lineItems: [{ productId: 'p1', quantity: '2', listPrice: 100, discountPct: 0 }], dealDiscount: '0.00', notes: null, paymentTerms: 'Net 30' };
    assert.equal(quoteTermsChanged(stored, { ...stored, lineItems: [{ discountPct: 0, listPrice: '100', quantity: 2, productId: 'p1' }], dealDiscount: 0, notes: '' }), false);
    assert.equal(quoteTermsChanged(stored, { ...stored, lineItems: [{ productId: 'p1', quantity: 3, listPrice: 100, discountPct: 0 }] }), true);
    assert.equal(quoteTermsChanged(stored, { ...stored, dealDiscount: 5 }), true);
    assert.equal(quoteTermsChanged(stored, { ...stored, notes: 'New terms' }), true);
    assert.equal(quoteTermsChanged(stored, { ...stored, name: 'Renamed v1' }), false, 'the internal label is not a term');
});

// ── the wiring, by scan ──────────────────────────────────────────────────────

test('quotes.mjs: a quote reaches the caller where its deal does; a POST and a PUT need the deal\'s write; a PUT merges, never creates, and moves by the rule', () => {
    const s = code(read('netlify/functions/quotes.mjs'));
    assert.ok(s.includes("import { dealVisibleTo } from '../../src/utils/roles.js';") && s.includes("import { dealReadContext, dealAccess } from './_dealAccess.mjs';"));
    assert.ok(s.includes('const visible = new Set(deals.filter(d => dealVisibleTo(d, ctx)).map(d => d.id));'), 'the GET by the deal rule');
    assert.ok(s.includes('.filter(q => visible.has(q.opportunityId));') && s.includes('rows = visible.has(oppId)'), 'both GET shapes');
    assert.ok(s.includes("if (!canApproveQuotes(userRole)) return refuse(403, 'Forbidden: approval statistics are for an Admin or a Manager');"));
    const post = s.slice(s.indexOf("if (event.httpMethod === 'POST') {"), s.indexOf("if (event.httpMethod === 'PUT') {"));
    assert.ok(post.includes('const access = await dealAccess(auth, data.opportunityId);') && post.includes('if (!access.canWrite) return refuse(403,'), 'a quote only on a deal the caller may change');
    assert.ok(post.includes("status: 'Draft',") && post.includes('createdBy: (await getCallerName(auth.userId, orgId))'), 'a Draft, by the roster\'s name');
    const put = s.slice(s.indexOf("if (event.httpMethod === 'PUT') {"), s.indexOf("if (event.httpMethod === 'DELETE') {"));
    assert.ok(put.includes('if (!existing) return refuse(404, NOT_FOUND);'), 'a PUT never creates');
    assert.ok(!/onConflictDoUpdate|\.insert\(quotes\)/.test(put), 'no upsert');
    assert.ok(put.includes('const access = await dealAccess(auth, existing.opportunityId);'), 'the STORED deal decides');
    assert.ok(put.includes('...existing, ...sanitize(data),') && put.includes('opportunityId: existing.opportunityId'), 'merged over the stored row; the deal cannot move');
    assert.ok(put.includes('approvalTier: existing.approvalTier, approvalReason: existing.approvalReason,'), 'the approval stamp is the server\'s');
    assert.ok(put.includes('const edit = quoteEditOutcome({ status: from, termsChanged });') && put.includes('if (edit.refusal) return refuse(409, edit.refusal);'));
    assert.ok(put.includes('const moveRefusal = quoteTransitionRefusal({'));
    assert.ok(put.includes('await syncToOpportunity(orgId, existing.opportunityId, totals.totalValue);'), 'an accept syncs the stored deal');
    assert.ok(put.includes("stamps.approvedBy = (await getCallerName(auth.userId, orgId)) || 'Approver';"), 'the approver by name');
    assert.ok(put.includes("if (moved && to === 'Sent to Customer') stamps.sentAt = new Date();"));
    assert.ok(s.includes("'Sent to Customer': 'quote.sent',") && s.includes("'Rejected / Lost':  'quote.rejected',"), 'the audit words are the stored words');
});

test('quote-email.mjs: the writers, the deal\'s writer, the send rule; every value escaped; the signature by the Clerk id', () => {
    const s = code(read('netlify/functions/quote-email.mjs'));
    assert.ok(s.includes('const forbidden = requireWrite(auth, event, responseHeaders);'));
    assert.ok(s.includes('const access = await dealAccess(auth, quote.opportunityId);'));
    assert.ok(s.includes("from: quote.status, to: 'Sent to Customer', role: auth.userRole,"));
    assert.ok(s.includes('eq(users.clerkUserId, userId)') && !s.includes('eq(users.id, userId)'), 'the signature lookup in the right identity space');
    for (const v of ['esc(customerName)', 'esc(accountName)', 'esc(quote.paymentTerms)', 'esc(quote.notes)', "esc(li.name || li.productName || '—')", 'esc(raw)']) {
        assert.ok(s.includes(v), v);
    }
    const html = s.replace(/subject:[^\n]*/g, '').replace(/detail:[^\n]*/g, '');
    assert.ok(!/\$\{(quote\.notes|customerName|accountName|quote\.paymentTerms|raw)\}/.test(html), 'nothing typed by a person reaches the HTML raw');
    assert.ok(s.includes('sentAt: new Date()'));
});

test('quote-to-job.mjs: the card\'s GET and the POST answer only for a quote whose deal the caller can see', () => {
    const s = code(read('netlify/functions/quote-to-job.mjs'));
    assert.ok(s.includes("import { dealAccess } from './_dealAccess.mjs';"));
    const get = s.slice(s.indexOf("if (event.httpMethod === 'GET') {"), s.indexOf("if (event.httpMethod !== 'POST') return reply(405"));
    assert.ok(get.includes("if (!q || !(await dealAccess(auth, q.opportunityId)).canRead) return reply(404, { error: 'Quote not found' });"));
    assert.ok(s.includes("if (!(await dealAccess(auth, quote.opportunityId)).canRead) return reply(404, { error: 'Quote not found' });"), 'the POST too');
});

test('the Quotes tab: a rep\'s list is what the server sends; the buttons and the words read the rule; a refused save is shown', () => {
    const s = code(read('src/Tabs/QuotesTab.jsx'));
    assert.ok(s.includes("from '../utils/quoteRules.js';"));
    assert.ok(!s.includes('return q.createdBy === currentUser;\n    }), [quotes'), 'no longer filtered by the creator\'s name');
    assert.ok(s.includes('quotes={visibleQuotes}') && s.includes("const pendingCount = visibleQuotes.filter(q => q.status === 'Pending Approval').length;"), 'Approvals and the count read the list');
    assert.ok(s.includes("const canSend   = !!canEdit && quoteMoveAllowed({ from: status, to: 'Sent to Customer', role: userRole, needsApproval });"));
    assert.ok(s.includes("const canSubmit = !!canEdit && needsApproval && quoteMoveAllowed({ from: status, to: 'Pending Approval', role: userRole, needsApproval });"), 'never "Submit" on a quote already submitted');
    assert.ok(s.includes('const activeCanSend = !!activeQuote && canEdit && quoteMoveAllowed({'), 'nor the preview\'s Send on one already sent');
    assert.ok(s.includes('{(canSend || canSubmit) && (') && s.includes('{canSave && <button onClick={onSaveDraft}'), 'Send / Submit / Save only where the rule allows');
    assert.ok(!s.includes('onClick={tier.approver ? onSubmitApproval : onSendToCustomer}'), 'the Send that showed on an accepted quote is gone');
    assert.ok(s.includes('{activeCanSend && <button onClick={handleSendToCustomer}'), 'the preview\'s Send too');
    assert.ok(s.includes('editable={canEdit && !quoteIsLocked(activeQuote.status)}'), 'a locked quote opens no editor');
    assert.ok(s.includes('const isManager = canApproveQuotes(userRole);'), 'Approve by the server\'s rule');
    assert.ok(s.includes('{(error || quoteModalError) && <div'), 'a refused save says why');
    const panel = s.slice(s.indexOf('const ConfiguratorPanel'), s.indexOf('function calcProductIntelligence'));
    assert.ok(panel.includes('const tier = approvalTierFor(discPct, tiers);') && !panel.includes('tierForDiscount('), 'the configurator decides by the server\'s discount');
});
