// tests/approval-routing.test.mjs
//
// State §0.157 — who approves a quote is the Admin's choice (Jeff, 2 Oct): by ROLE or
// by PERSON, an approver and a backup per tier; the backup may act at any time; an
// Admin always may; only Admins and Managers approve. The rule (src/utils/quoteRules.js)
// is RUN here; the settings PUT that stores it, the quotes PUT that enforces it and
// the screens that read it are pinned by scan. The whole path against the test
// database: tests/integration/approval-routing.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    APPROVAL_ROUTING_MODES, APPROVER_ROLES, cleanApprovalRouting, cleanApprovalTiers, mayDecideQuote,
    tierApproverWords, decidedByWords, tierNeedsApproval, approvalTierFor, DEFAULT_QUOTE_APPROVAL_TIERS,
} from '../src/utils/quoteRules.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

const byPerson = { label: 'Mgr approval', maxDiscount: 0.2, approverUserId: 'usr_bob', backupUserId: 'usr_jane' };
const byRole   = { label: 'VP approval',  maxDiscount: 0.3, approverRole: 'Admin', backupRole: null };
const names = { usr_bob: 'Bob Russell', usr_jane: 'Jane Doe' };
const nameOf = (id) => names[id] || null;

test('the choices: by role or by person; only Managers and Admins approve', () => {
    assert.deepEqual([...APPROVAL_ROUTING_MODES], ['role', 'person']);
    assert.deepEqual([...APPROVER_ROLES], ['Manager', 'Admin']);
    assert.equal(cleanApprovalRouting('role'), 'role');
    assert.equal(cleanApprovalRouting('person'), 'person');
    for (const v of ['Role', 'boss', '', null, undefined, 1]) assert.equal(cleanApprovalRouting(v), null, String(v));
});

test('who decides: an Admin always; a non-approver never; the tier\'s person, role or backup; anyone who approves where no one is named', () => {
    for (const tier of [byPerson, byRole, DEFAULT_QUOTE_APPROVAL_TIERS[2], {}]) {
        assert.equal(mayDecideQuote({ tier, role: 'Admin', userId: 'usr_nobody' }), true, 'an Admin — a quote is never stuck behind an approver who left');
        for (const role of ['User', 'ReadOnly', 'Dispatcher', 'Technician', undefined]) {
            assert.equal(mayDecideQuote({ tier, role, userId: 'usr_bob' }), false, `${role} never, even holding a named id`);
        }
    }
    assert.equal(mayDecideQuote({ tier: byPerson, role: 'Manager', userId: 'usr_bob' }), true, 'the approver');
    assert.equal(mayDecideQuote({ tier: byPerson, role: 'Manager', userId: 'usr_jane' }), true, 'the backup, at any time');
    assert.equal(mayDecideQuote({ tier: byPerson, role: 'Manager', userId: 'usr_ann' }), false, 'another Manager');
    assert.equal(mayDecideQuote({ tier: byPerson, role: 'Manager', userId: null }), false, 'an unresolvable caller names no one');
    assert.equal(mayDecideQuote({ tier: byRole, role: 'Manager', userId: 'usr_bob' }), false, 'an Admin-only tier');
    assert.equal(mayDecideQuote({ tier: { approverRole: 'Admin', backupRole: 'Manager' }, role: 'Manager' }), true, 'the backup role');
    assert.equal(mayDecideQuote({ tier: DEFAULT_QUOTE_APPROVAL_TIERS[2], role: 'Manager' }), true, 'an org that has not chosen: any Manager, as before');
});

test('the words that name who decides — a name, a role, the backup; never a raw id', () => {
    assert.equal(tierApproverWords(byPerson, nameOf), 'Bob Russell (backup: Jane Doe)');
    assert.equal(tierApproverWords(byRole, nameOf), 'an Admin');
    assert.equal(tierApproverWords({ approverRole: 'Manager', backupRole: 'Admin' }), 'a Manager (backup: an Admin)');
    assert.equal(tierApproverWords({ approverUserId: 'usr_gone' }, nameOf), 'a former approver', 'an id the roster cannot name');
    assert.equal(tierApproverWords(DEFAULT_QUOTE_APPROVAL_TIERS[1]), 'a Manager or an Admin', 'unrouted');
    assert.equal(tierApproverWords(DEFAULT_QUOTE_APPROVAL_TIERS[0]), null, 'the rep\'s band needs no one');
    assert.equal(decidedByWords(byPerson, nameOf), 'Bob Russell (backup: Jane Doe), or an Admin', 'the Admin who always may, named once');
    assert.equal(decidedByWords(byRole, nameOf), 'an Admin', 'not "an Admin, or an Admin"');
    assert.equal(decidedByWords(DEFAULT_QUOTE_APPROVAL_TIERS[0]), null);
    assert.equal(tierNeedsApproval(byPerson), true);
    assert.equal(tierNeedsApproval(byRole), true);
    assert.equal(tierNeedsApproval({ label: 'x', approverRole: null, approverUserId: null, approver: '' }), false);
});

test('what is saved is cleaned for its mode: the bands ascend, the last is open-ended, each keeps only its own mode\'s approver and backup', () => {
    const raw = [
        { id: 't3', label: '  VP  ', maxDiscount: 0.3, approverRole: 'Admin', backupRole: 'Admin', approverUserId: 'usr_bob', fallback: 'CEO', active: true },
        { id: 't1', label: 'Rep', maxDiscount: 0.1, approverRole: null, color: '#4d6b3d' },
        { id: 't2', label: 'Mgr', maxDiscount: '0.2', approverRole: 'Manager', backupRole: 'Admin', approver: 'Sales Manager' },
        { id: 't4', label: '', maxDiscount: 0.9, approverRole: 'Owner', backupRole: 'Admin', color: 'red' },
    ];
    const role = cleanApprovalTiers(raw, 'role');
    assert.deepEqual(role.map(t => t.id), ['t1', 't2', 't3', 't4'], 'ascending');
    assert.equal(role[3].maxDiscount, 1, 'the last band is open-ended');
    assert.deepEqual(role.map(t => [t.approverRole, t.backupRole]), [[null, null], ['Manager', 'Admin'], ['Admin', null], [null, null]],
        'a backup equal to the approver is dropped; a role that does not approve names no one, and its backup with it');
    assert.ok(role.every(t => t.approverUserId === null && t.backupUserId === null && t.approver === null), 'no names from the other mode, no old text');
    assert.equal(role[2].label, 'VP');
    assert.equal(role[3].label, 'Tier 4');
    assert.equal(role[3].color, null, 'a colour that is not a hex is dropped');
    assert.ok(!('fallback' in role[2]) && !('active' in role[2]), 'nothing the page no longer offers');
    const person = cleanApprovalTiers([
        { id: 'a', maxDiscount: 0.15, approverUserId: 'usr_bob', backupUserId: 'usr_bob', approverRole: 'Manager' },
        { id: 'b', maxDiscount: 1, approverUserId: 'user_2abc', backupUserId: 'usr_jane' },
        { id: 'c', maxDiscount: 0.05, approverUserId: null, backupUserId: 'usr_jane' },
    ], 'person');
    assert.deepEqual(person.map(t => [t.id, t.approverUserId, t.backupUserId, t.approverRole]), [['c', null, null, null], ['a', 'usr_bob', null, null], ['b', null, null, null]],
        'app ids only (a Clerk id is not one); a backup needs an approver and is not the approver');
    const legacy = cleanApprovalTiers([{ maxDiscount: 0.1 }, { maxDiscount: 1, approver: ' CFO ', approverRole: 'Admin' }], null);
    assert.equal(legacy[1].approver, 'CFO', 'no mode chosen: the old text stays, unrouted');
    assert.equal(legacy[1].approverRole, null);
    assert.equal(cleanApprovalTiers([], 'role'), null);
    assert.equal(cleanApprovalTiers(null, 'role'), null);
    assert.equal(cleanApprovalTiers(Array.from({ length: 20 }, (_, i) => ({ maxDiscount: (i + 1) / 20 })), 'role').length, 12, 'at most twelve bands');
    for (const cap of [-1, 0, 0.004]) assert.equal(cleanApprovalTiers([{ maxDiscount: cap }, { maxDiscount: 1 }], 'role')[0].maxDiscount, 0.01, `a cap of ${cap} becomes 1%`);
    assert.equal(approvalTierFor(18, person).id, 'b', 'the cleaned bands route as stored');
});

// ── the wiring, by scan ──────────────────────────────────────────────────────

test('settings.mjs: the mode in both halves; the tiers cleaned for it; a named person must be an active Admin or Manager of THIS org; the triggers gone', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes('approvalRouting:      cleanApprovalRouting(row.extra?.approvalRouting),'), 'GET');
    assert.ok(s.includes("approvalRouting:      'approvalRouting'      in data ? cleanApprovalRouting(data.approvalRouting) : cleanApprovalRouting(existingExtra.approvalRouting),"), 'PUT');
    assert.ok(!s.includes('approvalTriggers'), 'the six triggers nothing read');
    assert.ok(s.includes("const tiers = cleanApprovalTiers('approvalTiers' in data ? data.approvalTiers : existingExtra.approvalTiers, mode);"));
    assert.ok(s.includes('.where(and(eq(users.orgId, orgId), inArray(users.id, named)));'), 'the roster of THIS org');
    assert.ok(s.includes('const eligible = new Set(rows.filter(r => r.active !== false && canApproveQuotes(r.role)).map(r => r.id));'));
    assert.ok(s.includes("error: 'An approver must be an active Admin or Manager in this workspace.'"));
    assert.ok(s.includes("error: 'Choose who approves: by role or by person.'"));
    const put = s.slice(s.indexOf("if (event.httpMethod === 'PUT') {"));
    assert.ok(put.indexOf("const forbidden = requireRole(auth, ['Admin'], headers);") < put.indexOf("if ('approvalTiers' in data || 'approvalRouting' in data) {"), 'an Admin\'s save');
});

test('quotes.mjs: an approval or a send-back is the tier\'s approver\'s, backup\'s or an Admin\'s — by the caller\'s APP id', () => {
    const s = code(read('netlify/functions/quotes.mjs'));
    const put = s.slice(s.indexOf("if (event.httpMethod === 'PUT') {"), s.indexOf("if (event.httpMethod === 'DELETE') {"));
    assert.ok(put.includes("if (sendBack || (moved && to === 'Approved')) {"));
    assert.ok(put.includes('const tier = approvalTierFor(quoteDiscountPct(lineItems, merged.dealDiscount), tiers);'));
    assert.ok(put.includes('if (!mayDecideQuote({ tier, role: userRole, userId: await getCallerId(auth.userId, orgId) })) {'), 'the app id, never the Clerk id');
    assert.ok(put.includes("return refuse(403, `Forbidden: ${tier.label} is decided by ${decidedByWords(tier, nameOf)}.`);"));
    assert.ok(put.includes('where(and(eq(users.orgId, orgId), inArray(users.id, ids)))'), 'names from this org only');
});

test('the Quotes tab decides by the same rule and names who decides; the gauge is the org\'s tiers', () => {
    const s = code(read('src/Tabs/QuotesTab.jsx'));
    assert.ok(s.includes('const mineToDecide = (q) => mayDecideQuote({ tier: tierOf(q), role: userRole, userId });'));
    assert.ok(s.includes("value: pending.filter(mineToDecide).length"), 'Waiting for you counts what is yours');
    assert.ok(s.includes("{decides ? 'Yours to decide' : <>Waiting for {approverWordsLive(tier)}</>}"));
    assert.ok(s.includes("const decides   = status === 'Pending Approval' && !!canEdit && mayDecideQuote({ tier, role: userRole, userId }) && !!onApprove && !!onSendBack;"));
    assert.ok(s.includes('Approver: {approverWordsLive(tier)}'));
    for (const k of ['approverRole:   t.approverRole   || null,', 'backupRole:     t.backupRole     || null,', 'approverUserId: t.approverUserId || null,', 'backupUserId:   t.backupUserId   || null,']) {
        assert.ok(s.includes(k), `the tiers carry ${k}`);
    }
    assert.ok(s.includes('userId={currentUserId}'), 'the caller\'s app id from the app');
    const gauge = s.slice(s.indexOf('const ApprovalGauge'), s.indexOf('// ─── Activity log'));
    assert.ok(gauge.includes('const tiers = APPROVAL_TIERS;') && !gauge.includes('30% VP') && !gauge.includes('[0.10, 0.20, 0.30]'), 'no fixed bands');
    assert.ok(s.includes('{tierNeedsApproval(tier) && <span') && s.includes('{approverWordsLive(tier)}</span>}'), 'the quote card names the routed approver, not the old text');
});

test('the Approval tiers page: the choice, an approver and a backup per tier; nothing it offered that nothing did', () => {
    const s = code(read('src/Tabs/settings/quoting/ApprovalTiersDetail.jsx'));
    assert.ok(s.includes('await putSettings({ approvalTiers: clean, approvalRouting: mode });') && s.includes('const clean = cleanApprovalTiers(tiers, mode);'));
    assert.ok(s.includes("onChange={() => chooseMode(o.id)}") && s.includes("{ id:'role',") && s.includes("{ id:'person',"));
    assert.ok(s.includes("if (mode === 'person' && tiers.some(t => needsChoice.has(t.id) && !t.approverUserId)) {"), 'a mode switch never quietly lets a discount through');
    assert.ok(s.includes("if (m === 'role') return { ...base, approverRole: 'Manager' };"), 'a tier that needed approval still does');
    for (const gone of ['approvalTriggers', 'Switch to advanced rules', 'Add co-approver', 'View quotes routed', 'View pending now', "'Move…'", 'fallback', 'ATToggle', 'SPDrag', 'trialValue', 'trialTerm']) {
        assert.ok(!s.includes(gone), `gone: ${gone}`);
    }
    assert.ok(/\nconst ApproverSelect = \(/.test(s) && /\nconst MenuItem = \(/.test(s), 'module scope (the focus rule)');
    assert.ok(s.includes("startEdit(i,'maxDiscount',String(Math.round(hi*100)))"), 'the discount cap can be edited — its editor was unreachable');
});
