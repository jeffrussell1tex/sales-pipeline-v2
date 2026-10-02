// tests/approval-notices.test.mjs
//
// State §0.158 — the approval emails (Jeff, 2 Oct, each answer a): a submission tells
// the tier's approver(s) — the named person, the role's holders, or every Manager in
// an org that has not chosen; an approval or a send-back tells the person who
// submitted it; the notices are instant, each by its reader's own switch; a tier's
// SLA passed with no decision reminds the backup, else the approver again, once per
// submission. The rule (src/utils/approvalNotices.js) is RUN here; the save that
// sends, the hourly job, the templates and the screens are pinned by scan. The whole
// path against the test database, mail captured: tests/integration/approval-mail.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    APPROVAL_NOTICE_KEYS, wantsNotice, reachable, waitingRecipients, reminderRecipients, reminderDue, quoteLink,
    QUOTE_LINK_KEY, takeQuoteLink, dropQuoteLink,
} from '../src/utils/approvalNotices.js';
import { slaHours, cleanApprovalTiers, DEFAULT_QUOTE_APPROVAL_TIERS } from '../src/utils/quoteRules.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

const u = (id, role, extra = {}) => ({ id, role, name: id, email: `${id}@itest.local`, active: true, ...extra });
const roster = [
    u('usr_admin', 'Admin'), u('usr_bob', 'Manager'), u('usr_jane', 'Manager'), u('usr_karen', 'User'),
    u('usr_gone', 'Manager', { active: false }), u('usr_invite', 'Manager', { email: 'x@placeholder.local' }), u('usr_mute', 'Manager', { email: '' }),
];
const ids = (list) => list.map(x => x.id).sort();
const H = 3600000, NOW = Date.parse('2026-10-02T12:00:00Z');

test('the switches: the three approval notices, ON unless their reader turned them off', () => {
    assert.deepEqual({ ...APPROVAL_NOTICE_KEYS }, { waiting: 'quotePending', approved: 'quoteApproved', sentBack: 'quoteRejected' });
    assert.equal(wantsNotice({}, 'quotePending'), true, 'no preference: on');
    assert.equal(wantsNotice({ profile: { notificationPrefs: { quotePending: { enabled: false } } } }, 'quotePending'), false);
    assert.equal(wantsNotice({ profile: { notificationPrefs: { quotePending: { enabled: true, mode: 'digest' } } } }, 'quotePending'), true, 'a digest choice left from before still sends — instant (2a)');
    assert.equal(wantsNotice({ notificationPrefs: { quoteApproved: { enabled: false } } }, 'quoteApproved'), false, 'a flat row too');
    assert.equal(wantsNotice(null, 'quoteRejected'), true);
    assert.equal(reachable(roster[0]), true);
    for (const id of ['usr_gone', 'usr_invite', 'usr_mute']) assert.equal(reachable(roster.find(x => x.id === id)), false, id);
});

test('who is told a quote waits (1a): the named person; the role\'s holders; every Manager where no one is named — never the submitter; an empty group falls to the backup, then the Admins', () => {
    assert.deepEqual(ids(waitingRecipients({ approverUserId: 'usr_bob', backupUserId: 'usr_jane' }, roster)), ['usr_bob'], 'by person: the approver, not the backup');
    assert.deepEqual(ids(waitingRecipients({ approverRole: 'Manager' }, roster)), ['usr_bob', 'usr_jane'], 'by role: every reachable holder');
    assert.deepEqual(ids(waitingRecipients({ approverRole: 'Admin' }, roster)), ['usr_admin']);
    assert.deepEqual(ids(waitingRecipients({ approver: 'Sales Manager' }, roster)), ['usr_bob', 'usr_jane'], 'not chosen: every Manager');
    assert.deepEqual(ids(waitingRecipients({ approverRole: 'Manager' }, roster, { excludeId: 'usr_bob' })), ['usr_jane'], 'never the submitter');
    assert.deepEqual(ids(waitingRecipients({ approverUserId: 'usr_gone', backupUserId: 'usr_jane' }, roster)), ['usr_jane'], 'the approver left: the backup');
    assert.deepEqual(ids(waitingRecipients({ approverUserId: 'usr_karen' }, roster)), ['usr_admin'], 'a named person who is no longer an approver: the Admins');
    assert.deepEqual(ids(waitingRecipients({ approver: 'x' }, roster.filter(x => x.role !== 'Manager'))), ['usr_admin'], 'no Manager at all: the Admins — a quote never waits unseen');
    assert.deepEqual(waitingRecipients({ approverRole: 'Manager' }, null), []);
});

test('who is reminded (3a): the backup; with no backup, the approver again; then the Admins', () => {
    assert.deepEqual(ids(reminderRecipients({ approverUserId: 'usr_bob', backupUserId: 'usr_jane' }, roster)), ['usr_jane']);
    assert.deepEqual(ids(reminderRecipients({ approverRole: 'Manager', backupRole: 'Admin' }, roster)), ['usr_admin']);
    assert.deepEqual(ids(reminderRecipients({ approverUserId: 'usr_bob' }, roster)), ['usr_bob'], 'no backup: the approver again');
    assert.deepEqual(ids(reminderRecipients({ approverUserId: 'usr_gone', backupUserId: 'usr_invite' }, roster)), ['usr_admin']);
});

test('a reminder is due once the SLA has passed since the submission on record, and once per submission', () => {
    const base = { status: 'Pending Approval', sla: '24h', now: NOW };
    assert.equal(reminderDue({ ...base, submittedAt: NOW - 25 * H }), true);
    assert.equal(reminderDue({ ...base, submittedAt: NOW - 23 * H }), false, 'not yet');
    assert.equal(reminderDue({ ...base, submittedAt: NOW - 25 * H, remindedAt: NOW - H }), false, 'reminded since the submission');
    assert.equal(reminderDue({ ...base, submittedAt: NOW - 25 * H, remindedAt: NOW - 30 * H }), true, 'a reminder of an earlier submission does not count');
    assert.equal(reminderDue({ ...base, submittedAt: null }), false, 'submitted before the record began: nothing to time');
    assert.equal(reminderDue({ ...base, sla: null, submittedAt: NOW - 99 * H }), false, 'no SLA, no reminder');
    assert.equal(reminderDue({ ...base, status: 'Approved', submittedAt: NOW - 99 * H }), false, 'decided');
    assert.equal(reminderDue({ ...base, sla: '2d', submittedAt: NOW - 47 * H }), false);
    assert.equal(reminderDue({ ...base, sla: '2d', submittedAt: NOW - 49 * H }), true);
});

test('a tier\'s SLA reads as hours — "8h", "24 h", "2d" — and is saved that way; anything else is no reminder', () => {
    assert.equal(slaHours('8h'), 8);
    assert.equal(slaHours(' 24 h '), 24);
    assert.equal(slaHours('12'), 12);
    assert.equal(slaHours('2d'), 48);
    assert.equal(slaHours('3 days'), 72);
    for (const v of ['soon', '0h', '', null, undefined, '-4h', '1.5h']) assert.equal(slaHours(v), null, String(v));
    const clean = cleanApprovalTiers([{ maxDiscount: 0.2, sla: '2d' }, { maxDiscount: 1, sla: 'soon' }], 'role');
    assert.deepEqual(clean.map(t => t.sla), ['48h', null]);
    // An org that never saved its tiers is reminded at the times the page shows (Jeff, 2 Oct).
    assert.deepEqual(DEFAULT_QUOTE_APPROVAL_TIERS.map(t => t.sla), [null, '8h', '24h', '48h']);
    const [rep, mgr] = DEFAULT_QUOTE_APPROVAL_TIERS;
    assert.equal(reminderDue({ status: 'Pending Approval', submittedAt: NOW - 9 * H, sla: mgr.sla, now: NOW }), true, 'the default Mgr band: due after 8h');
    assert.equal(reminderDue({ status: 'Pending Approval', submittedAt: NOW - 99 * H, sla: rep.sla, now: NOW }), false, 'the rep\'s band needs no one');
    assert.equal(quoteLink('https://accelerep.netlify.app/', 'q_a b'), 'https://accelerep.netlify.app/?quote=q_a%20b');
});

// A tab's sessionStorage, and one a privacy setting has shut.
const memStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } }; };
const deadStore = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); }, removeItem() { throw new Error('SecurityError'); } };

test('the quote link outlives the sign-in screen: kept in the tab through Clerk\'s reload of "/", used once, replaced by a new link', () => {
    const tab = memStore();
    assert.equal(takeQuoteLink('?quote=qt_6f1c-22ab', tab), 'qt_6f1c-22ab', 'opened signed out: read from the URL…');
    assert.equal(tab.getItem(QUOTE_LINK_KEY), 'qt_6f1c-22ab', '…and kept');
    assert.equal(takeQuoteLink('', tab), 'qt_6f1c-22ab', 'after sign-in the URL is "/": the kept id answers');
    assert.equal(takeQuoteLink('?calconnect=success&from=home', tab), 'qt_6f1c-22ab', 'another parameter leaves it be');
    dropQuoteLink(tab);
    assert.equal(takeQuoteLink('', tab), null, 'used: dropped — a later visit opens nothing');
    takeQuoteLink('?quote=q_qa_02', tab);
    assert.equal(takeQuoteLink('?quote=q_qa_03', tab), 'q_qa_03', 'a new link replaces a kept one');
    assert.equal(takeQuoteLink('?quote=%3Cimg%20src%3Dx%3E', tab), null, 'an id that could not be a quote\'s is refused…');
    assert.equal(takeQuoteLink('', tab), null, '…and the kept one goes with it');
    assert.equal(takeQuoteLink(`?quote=${'a'.repeat(81)}`, tab), null);
    assert.equal(takeQuoteLink('?quote=', tab), null, 'an empty link');
    assert.equal(takeQuoteLink('?quote=qt_9', null), 'qt_9', 'no storage: the URL still opens it');
    assert.equal(takeQuoteLink('?quote=qt_9', deadStore), 'qt_9', 'storage that throws: the same');
    assert.equal(takeQuoteLink('', deadStore), null);
    dropQuoteLink(deadStore);
    assert.equal(takeQuoteLink(undefined, tab), null);
});

// ── the wiring, by scan ──────────────────────────────────────────────────────

test('quotes.mjs: a submission, an approval or a send-back sends its notice — after the save and its audit row, never undoing it', () => {
    const s = code(read('netlify/functions/quotes.mjs'));
    const put = s.slice(s.indexOf("if (event.httpMethod === 'PUT') {"), s.indexOf("if (event.httpMethod === 'DELETE') {"));
    assert.ok(put.includes("const notice = sendBack ? 'sentBack'") && put.includes(": moved && to === 'Approved' ? 'approved'") && put.includes(": moved && to === 'Pending Approval' ? 'submitted' : null;"));
    assert.ok(put.indexOf('await auditAs(orgId, auth.userId, {') < put.indexOf('await sendApprovalNotices({'), 'after the record');
    assert.ok(put.includes("console.error('quotes: approval notices failed —', e.message);"), 'a failed send is logged, and the save stands');
    assert.ok(put.includes('actorId: await getCallerId(auth.userId, orgId), actorName: await getCallerName(auth.userId, orgId),'));
});

test('_approvalMail.mjs: this org\'s roster, the submitter from the record by Clerk id in this org, each reader\'s switch, never the actor', () => {
    const s = code(read('netlify/functions/_approvalMail.mjs'));
    assert.ok(s.includes('const roster = await db.select().from(users).where(eq(users.orgId, orgId));'));
    assert.ok(s.includes('.where(and(eq(opportunities.id, quote.opportunityId), eq(opportunities.orgId, orgId)))'));
    assert.ok(s.includes("eq(auditLog.orgId, orgId), eq(auditLog.entityType, 'quote'), eq(auditLog.entityId, quote.id), eq(auditLog.action, 'quote.submitted')"));
    assert.ok(s.includes('roster.find(u => u.clerkUserId === sub.userId)'), 'the Clerk id matched as a Clerk id');
    assert.ok(s.includes('waitingRecipients(tier, roster, { excludeId: actorId }).filter(u => wantsNotice(u, APPROVAL_NOTICE_KEYS.waiting))'));
    assert.ok(s.includes('if (submitter && submitter.id !== actorId && reachable(submitter) && wantsNotice(submitter, key)) {'));
});

test('quote-reminders.mjs: hourly, behind the heartbeat; org by org; once per submission, recorded even when no one is emailed', () => {
    const s = code(read('netlify/functions/quote-reminders.mjs'));
    assert.ok(s.includes("export const handler = withHeartbeat('quote-reminders', run);"));
    assert.ok(s.includes("inArray(auditLog.entityId, list.map(q => q.id)), inArray(auditLog.action, ['quote.submitted', 'quote.reminded'])"), 'its record, this org\'s');
    assert.ok(s.includes('roster = roster || await db.select().from(users).where(eq(users.orgId, org));'));
    assert.ok(s.includes('const tiers = s?.extra?.approvalTiers?.length ? s.extra.approvalTiers : DEFAULT_QUOTE_APPROVAL_TIERS;'), 'an org that never saved: the defaults, with their times');
    assert.ok(s.includes("if (!reminderDue({ status: q.status, submittedAt, remindedAt: latestAt(events, q.id, 'quote.reminded'), sla: tier?.sla, now })) { notDue++; continue; }"));
    assert.ok(s.includes('const to = reminderRecipients(tier, roster).filter(u => wantsNotice(u, APPROVAL_NOTICE_KEYS.waiting));'));
    assert.ok(s.includes("action: 'quote.reminded'") && s.includes("|| 'no one (the notice is switched off)'"), 'the record, written whoever was emailed');
    assert.ok(read('netlify.toml').includes('[functions."quote-reminders"]'));
});

test('the templates escape what a person typed; the header menu: instant, "Quote sent back", no switch nothing reads; the link opens the quote', () => {
    const m = code(read('netlify/functions/send-email.mjs'));
    const tpl = m.slice(m.indexOf('    quoteWaiting({'), m.indexOf('    reportDelivery({'));
    for (const v of ['escHtml(name)', 'escHtml(quoteNumber)', 'escHtml(submittedBy)', "escHtml(account || '—')", "escHtml(dealName || '—')", 'escHtml(decidedBy)', 'escHtml(note)', 'escHtml(url)']) {
        assert.ok(tpl.includes(v), v);
    }
    // A subject is a plain-text header, not HTML; the page title it becomes is escaped.
    const htmlOnly = tpl.replace(/const subject = [\s\S]*?;/g, '');
    assert.ok(!/\$\{(name|account|dealName|note|decidedBy|submittedBy|quoteNumber)\}/.test(htmlOnly), 'nothing typed by a person reaches the HTML raw');
    assert.ok(tpl.includes('layout(escHtml(subject),'), 'the title escaped');
    const h = code(read('src/components/layout/AppHeader.jsx'));
    assert.ok(h.includes("const isInstantOnly = alertType === 'quotePending' || alertType === 'quoteApproved' || alertType === 'quoteRejected';"));
    assert.ok(h.includes('{!isDigestOnly && !isInstantOnly && pref.enabled && ('), 'no digest choice for them');
    assert.ok(h.includes("quoteRejected: 'Quote sent back'") && !h.includes('quoteAccepted'), 'renamed; the switch nothing ever sent removed');
    assert.ok(!/alertType === 'quote(Approved|Rejected)'[^\n]*\) return null;/.test(h), 'every role has the approved / sent-back switches — any role may submit a quote');
    assert.ok(h.includes("{alertType === 'quoteApproved' && <div style=") && !h.includes("(alertType === 'quotePending' && (isManager || isAdmin))"), 'one "Quote alerts" heading, above every role\'s first quote switch');
    const a = code(read('src/App.jsx'));
    assert.ok(a.includes('if (quoteLinkRef.current === undefined) quoteLinkRef.current = takeQuoteLink(window.location.search);') && a.includes("setActiveTab('quotes');"), 'taken once, from the URL or the tab');
    assert.ok(a.includes('        quoteLinkRef.current = null;\n        dropQuoteLink();'), 'dropped once used');
    const t = code(read('src/Tabs/QuotesTab.jsx'));
    assert.ok(t.includes("'quote.reminded':  ['reminded',  'sent a reminder'],"), 'a reminder in the quote\'s history');
    const p = code(read('src/Tabs/settings/quoting/ApprovalTiersDetail.jsx'));
    assert.ok(p.includes("'Reminder after'") && p.includes("if (field === 'sla') return { ...t, sla: slaHours(val) ? `${slaHours(val)}h` : null };"));
    assert.ok(p.includes("const DEFAULT_APPROVAL_TIERS = DEFAULT_QUOTE_APPROVAL_TIERS.map((t, i) => ({ ...t, id: ['rep', 'mgr', 'vp', 'cfo'][i] || `tier_${i + 1}`, color: TIER_COLORS[i % TIER_COLORS.length] }));"), 'the page starts from the job\'s list');
    assert.ok(!/sla:\s*'\d+h'/.test(p), 'and keeps no reminder times of its own');
});
