// tests/approval-stats.test.mjs
//
// State §0.156 — the Approvals numbers come from the RECORD of what happened (the
// audit log's quote events), not from a quote's current status or a constant. The
// arithmetic (src/utils/approvalStats.js) is RUN here; the endpoint that reads the
// record, and who may read which events: tests/integration/quote-approvals.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    APPROVAL_EVENT, APPROVAL_FLOW_ACTIONS, SENT_BACK_MARK, sendBackNoteOf,
    decisionsFrom, approvalSummary, formatHours, approvalTierStats,
} from '../src/utils/approvalStats.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b));

const H = 3600000, D = 24 * H;
const NOW = Date.parse('2026-10-02T12:00:00Z');
const at = (msAgo) => new Date(NOW - msAgo).toISOString();
const ev = (quoteId, action, msAgo, extra = {}) => ({ quoteId, action, at: at(msAgo), by: extra.by || 'Someone', detail: extra.detail || null });
const { submitted, approved, sentBack, withdrawn } = APPROVAL_EVENT;

test('the events are the server\'s audit words', () => {
    assert.deepEqual([...APPROVAL_FLOW_ACTIONS].sort(), ['quote.approved', 'quote.sentback', 'quote.submitted', 'quote.withdrawn']);
    assert.ok(Object.isFrozen(APPROVAL_EVENT) && Object.isFrozen(APPROVAL_FLOW_ACTIONS));
});

test('a send-back\'s note survives in its audit detail — the whole note, after the mark', () => {
    const note = 'Bring it under 20% · then resubmit';
    assert.equal(sendBackNoteOf(`Q-1 v1 · Pending Approval → Draft${SENT_BACK_MARK}${note}`), note, 'a " · " inside the note stays');
    assert.equal(sendBackNoteOf('Q-1 v1 · Draft → Pending Approval · VP approval'), null);
    assert.equal(sendBackNoteOf(null), null);
});

test('a decision answers the quote\'s latest submission: timed from it, by whom, with a send-back\'s note', () => {
    const events = [
        ev('q1', approved, 1 * H, { by: 'Bob' }),                       // out of order on purpose
        ev('q1', submitted, 7 * H),
        ev('q2', submitted, 30 * H),
        ev('q2', sentBack, 28 * H, { by: 'Bob', detail: `Q-2 v1 · Pending Approval → Draft${SENT_BACK_MARK}Too deep` }),
        ev('q2', submitted, 5 * H),                                     // resubmitted
        ev('q2', approved, 2 * H, { by: 'Jeff' }),
        ev('q3', approved, 3 * H),                                      // its submission is older than the record
        { quoteId: 'q4', action: 'quote.updated', at: at(1 * H) },      // not a decision
    ];
    const d = decisionsFrom(events);
    assert.deepEqual(d.map(x => [x.quoteId, x.kind]), [['q2', 'sentBack'], ['q3', 'approved'], ['q2', 'approved'], ['q1', 'approved']], 'oldest first');
    assert.equal(d[0].hours, 2);
    assert.equal(d[0].note, 'Too deep');
    assert.equal(d[0].by, 'Bob');
    assert.equal(d[1].hours, null, 'no submission in the record: not timed, still counted');
    assert.equal(d[2].hours, 3, 'the RESUBMISSION is what the approval answered, not the first');
    assert.equal(d[3].hours, 6);
    assert.equal(d[3].note, null, 'an approval carries no note');
});

test('a withdrawal ends a submission unanswered; a second decision without a new submission is not timed', () => {
    const d = decisionsFrom([
        ev('q1', submitted, 10 * H), ev('q1', withdrawn, 9 * H), ev('q1', approved, 8 * H),
        ev('q2', submitted, 6 * H), ev('q2', approved, 5 * H), ev('q2', approved, 4 * H),
        { quoteId: 'q3', action: approved, at: 'not a date' },
    ]);
    assert.equal(d.length, 3, 'three decisions; the event without a readable time is dropped');
    assert.equal(d[0].hours, null, 'withdrawn, then decided: nothing to time it from');
    assert.equal(d[1].hours, 1);
    assert.equal(d[2].hours, null, 'the second approval answered no new submission');
    assert.equal(decisionsFrom([ev('q1', submitted, 1 * H), ev('q1', approved, 2 * H)])[0].hours, null, 'a decision before its submission (clock skew) is not timed');
    assert.deepEqual(decisionsFrom(null), []);
});

test('the summary counts the decisions of the window — the rate and the time are the record\'s, and absent rather than zero when there is none', () => {
    const events = [
        ev('old', submitted, 40 * D), ev('old', approved, 39 * D),      // outside 30 days
        ev('a', submitted, 3 * D), ev('a', approved, 3 * D - 4 * H),
        ev('b', submitted, 2 * D), ev('b', sentBack, 2 * D - 10 * H, { detail: `x${SENT_BACK_MARK}Fix the term` }),
        ev('c', submitted, 1 * D), ev('c', approved, 1 * D - 4 * H),
        ev('d', approved, 1 * H),                                        // not timed
    ];
    const s = approvalSummary(events, { now: NOW, days: 30 });
    assert.equal(s.total, 4);
    assert.equal(s.approved, 3);
    assert.equal(s.sentBack, 1);
    assert.equal(s.rate, 75);
    assert.equal(s.avgHours, 6, '(4 + 10 + 4) / 3 — the untimed one does not count as zero');
    assert.deepEqual(s.decisions.map(x => x.quoteId), ['d', 'c', 'b', 'a'], 'newest first');
    assert.equal(s.decisions[2].note, 'Fix the term');
    const none = approvalSummary([], { now: NOW });
    assert.equal(none.rate, null, 'no decisions: no rate — never "0%"');
    assert.equal(none.avgHours, null);
    assert.equal(none.total, 0);
    // The audit time reads five hours late on a machine off UTC: a decision made this
    // hour can read as the future, and must still count.
    assert.equal(approvalSummary([ev('f', approved, -2 * H)], { now: NOW }).total, 1, 'a window has a start and no end');
});

test('a duration a card can hold', () => {
    assert.equal(formatHours(null), '—');
    assert.equal(formatHours(undefined), '—');
    assert.equal(formatHours(NaN), '—');
    assert.equal(formatHours(0), '1m', 'never "0m" for a real decision');
    assert.equal(formatHours(0.58), '35m');
    assert.equal(formatHours(6.2), '6h');
    assert.equal(formatHours(47), '47h');
    assert.equal(formatHours(48), '2d');
    assert.equal(formatHours(60), '2.5d');
    assert.equal(formatHours(24 * 12.4), '12d');
});

test('the tier panel: per tier, the quotes touched in the window or waiting now, approved, sent back, waiting, the mean hours', () => {
    const tiers = [{ label: 'Rep' }, { label: 'Mgr approval' }, { label: 'VP approval' }];
    const quotes = [
        { id: 'a', status: 'Approved', approvalTier: 'Mgr approval' },
        { id: 'b', status: 'Draft', approvalTier: 'Mgr approval' },
        { id: 'c', status: 'Pending Approval', approvalTier: 'VP approval' },
        { id: 'e', status: 'Pending Approval', approvalTier: 'VP approval' },
        { id: 'old', status: 'Approved', approvalTier: 'VP approval' },
    ];
    const events = [
        ev('a', submitted, 10 * H), ev('a', approved, 4 * H),
        ev('b', submitted, 20 * H), ev('b', sentBack, 10 * H),
        ev('c', submitted, 2 * H),
        ev('old', submitted, 100 * D), ev('old', approved, 99 * D),
    ];
    const [rep, mgr, vp] = approvalTierStats(events, quotes, tiers, { now: NOW, days: 90 });
    assert.deepEqual(rep, { tier: 'Rep', quotes: 0, approved: 0, sentBack: 0, pending: 0, avgHours: 0 });
    assert.deepEqual(mgr, { tier: 'Mgr approval', quotes: 2, approved: 1, sentBack: 1, pending: 0, avgHours: 8 });
    assert.deepEqual(vp, { tier: 'VP approval', quotes: 2, approved: 0, sentBack: 0, pending: 2, avgHours: 0 }, 'waiting now counts; a decision outside 90 days does not');
    assert.deepEqual(approvalTierStats(null, null, null), []);
});

// ── the wiring, by scan (the endpoints import db/index.js — §18b23) ──────────

test('the record\'s words are the ones quotes.mjs writes — literals there (tests/audit-coverage), the same here; a send-back\'s note ends its detail', () => {
    assert.deepEqual({ ...APPROVAL_EVENT }, { submitted: 'quote.submitted', approved: 'quote.approved', sentBack: 'quote.sentback', withdrawn: 'quote.withdrawn' });
    const s = code(read('netlify/functions/quotes.mjs'));
    assert.ok(s.includes("'Pending Approval': 'quote.submitted',") && s.includes("Approved:           'quote.approved',"));
    assert.ok(s.includes("const action = sendBack ? 'quote.sentback'") && s.includes(": moved && from === 'Pending Approval' && to === 'Draft' ? 'quote.withdrawn'"), 'a send-back and a withdrawal told apart');
    assert.ok(s.includes("${sendBack ? SENT_BACK_MARK + stamps.approvalNote : ''}`,"), 'the note after the mark, last in the detail');
});

test('quotes.mjs: a send-back is an approver\'s, from the queue, with a note, the quote as it is; the note is the server\'s, settled by the approval', () => {
    const s = code(read('netlify/functions/quotes.mjs'));
    const put = between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    assert.ok(put.includes('const sendBack = data.sendBack === true;'));
    assert.ok(put.includes('const refusal = quoteSendBackRefusal({ from, role: userRole, note: data.sendBackNote });'));
    assert.ok(put.includes("if (refusal) return refuse(from !== 'Pending Approval' ? 409 : !canApproveQuotes(userRole) ? 403 : 400, refusal);"));
    // A send-back that edits the lines is refused by the HOLD before it gets here
    // (quoteEditOutcome — tests/quote-rules.test.mjs; the 409 in the integration suite).
    assert.ok(put.indexOf('if (edit.refusal) return refuse(409, edit.refusal);') < put.indexOf('const sendBack = data.sendBack === true;'), 'the hold is judged first');
    assert.ok(put.includes("const requested = sendBack ? 'Draft' : (data.status ?? from);"));
    assert.ok(put.includes('approvalTier: existing.approvalTier, approvalReason: existing.approvalReason, approvalNote: existing.approvalNote,'), 'a save cannot write the note');
    assert.ok(put.includes('stamps.approvalNote = null;') && put.includes('if (sendBack) stamps.approvalNote = String(data.sendBackNote).trim();'));
    const post = between(s, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    assert.ok(post.includes('approvalTier: null, approvalReason: null, approvalNote: null,'), 'a new quote carries no note');
});

test('quotes.mjs: the record reaches a caller for the quotes she can see — one quote\'s history 404s like a missing quote; the flow is filtered to hers; the tier statistics are the record\'s', () => {
    const s = code(read('netlify/functions/quotes.mjs'));
    const get = between(s, "if (event.httpMethod === 'GET') {", "if (event.httpMethod === 'POST') {");
    assert.ok(get.indexOf('const visible = new Set(') < get.indexOf("if (qs.activity === 'true') {"), 'the deal rule first');
    assert.ok(get.includes('if (!q || !visible.has(q.opportunityId)) return refuse(404, NOT_FOUND);'));
    assert.ok(get.includes("eq(auditLog.orgId, orgId), eq(auditLog.entityType, 'quote'), eq(auditLog.entityId, String(qs.quoteId))"));
    assert.ok(get.includes('.filter(q => visible.has(q.opportunityId)).map(q => q.id));') && get.includes('.filter(e => seen.has(e.quoteId));'));
    assert.ok(get.includes('approvalTierStats(await approvalEvents(orgId), orgQuotes, await getApprovalTiers(orgId), { days: APPROVAL_EVENTS_DAYS })'));
    assert.ok(!get.includes("'Declined'"), 'no status nothing sets');
    assert.ok(s.includes("where(and(eq(auditLog.orgId, orgId), eq(auditLog.entityType, 'quote'),") && s.includes('inArray(auditLog.action, [...APPROVAL_FLOW_ACTIONS]), gte(auditLog.timestamp, since)'), 'this org, the flow, the window');
    assert.ok(s.includes('const eventOf = (r) => ({ quoteId: r.entityId, action: r.action, at: r.timestamp, by: r.userName || null, detail: r.detail || null });'), 'the Clerk id stays on the server');
});

test('audit-log.mjs: a member cannot post a quote event — the record the numbers read is the server\'s', () => {
    const s = code(read('netlify/functions/audit-log.mjs'));
    assert.ok(s.includes("const isQuoteEvent = String(data.action).trim().toLowerCase().startsWith('quote.') || String(data.entityType).trim().toLowerCase() === 'quote';"));
    assert.ok(s.indexOf('if (isQuoteEvent) {') > 0 && s.indexOf('if (isQuoteEvent) {') < s.indexOf('const [inserted] = await db.insert(auditLog)'), 'refused before anything is written');
});

test('the Approvals tab and a quote\'s history read the record; the words say who acts; a move names only its status', () => {
    const s = code(read('src/Tabs/QuotesTab.jsx'));
    const tab = between(s, 'function ApprovalsTab(', 'export default function QuotesTab(');
    assert.ok(tab.includes('const summary  = useMemo(() => approvalSummary(events || [], { days: 30 }), [events]);'));
    for (const gone of ['0.7× baseline', '5% error bars', 'Pending your approval', 'for my review', 'mailing id', "q.status === 'Sent to Customer'", "'Sales Manager' : 'Rep'", 'handleSend', 'onReject']) {
        assert.ok(!tab.includes(gone), `gone: ${gone}`);
    }
    assert.ok(tab.split('{isApprover && (').length - 1 === 2 && tab.includes('onClick={() => onApprove(q)}'), 'Send back and Approve for an approver only');
    assert.ok(tab.includes('<SendBackForm saving={saving} onCancel={() => setSendingBackId(null)}'));
    assert.ok(tab.includes("{isApprover ? 'Waiting for your approval' : 'Your quotes waiting for approval'}"));
    assert.ok(s.includes("const handleSendBack        = async (q, note) => !!(await moveQuote(q, 'Draft', { sendBack: true, sendBackNote: note }));"));
    assert.ok(s.includes("const handleApprove         = (q) => moveQuote(q, 'Approved');") && s.includes("const handleWithdraw        = (q) => moveQuote(q, 'Draft');"));
    assert.ok(s.includes('try { return await handleSaveQuote({ id: q.id, status, ...extra }, q); }'));
    assert.ok(!/handleSaveQuote\(\{ \.\.\.(activeQuote|q), status:/.test(s), 'no move sends the screen\'s copy of the lines');
    assert.ok(!s.includes('function buildActivityLog') && s.includes('const log = historyLines(events);'), 'the history is the record\'s');
    assert.ok(s.includes("await dbFetch('/.netlify/functions/quotes?activity=true')") && s.includes("'/.netlify/functions/quotes?activity=true&quoteId=' + encodeURIComponent(activeQuote.id)"));
    assert.ok(s.includes("setApprovalEvents(null); setApprovalEventsError('');") && s.includes("setQuoteHistory({ events: null, error: '' });"), 'cleared before each read (§0.125)');
    const panel = between(s, 'const ConfiguratorPanel', 'function calcProductIntelligence');
    assert.ok(panel.includes("const decides   = status === 'Pending Approval' && !!canEdit && canApproveQuotes(userRole) && !!onApprove && !!onSendBack;"));
    assert.ok(panel.includes('Waiting for Approval.') && panel.includes('Withdraw to make changes'));
    for (const gone of ['sign-off required before send', 'approval before send.', 'Quote delivered to customer.']) assert.ok(!s.includes(gone), `gone: ${gone}`);
    assert.ok(/\nconst SendBackForm = \(/.test(s), 'the form at module scope (the focus rule)');
    assert.ok(s.includes("<title>${esc(activeQuote.quoteNumber || 'Quote')}</title>") && s.includes("<h1>${esc(activeQuote.name || activeQuote.quoteNumber || 'Quote')}</h1><p>${esc(configuratorOpp?.account || '')}</p>") && s.includes('<td>${esc(li.productName)}</td>'), 'the print window escapes what a person typed');
    const tiers = code(read('src/Tabs/settings/quoting/ApprovalTiersDetail.jsx'));
    assert.ok(tiers.includes('u.sentBack > 0') && !tiers.includes('declined') && !tiers.includes('APPROVAL_TIER_USAGE'), 'the tier panel reads the record, and no table of invented usage');
});
