// tests/history-feed.test.mjs
//
// Audit batch 7 (0.68 tier 2): the Activity History tab read fields no writer
// sets and linked rows to accounts and contacts by name fields that do not
// exist. The helpers read real columns; the scan pins the wiring and the rest
// of the tier-2 label / escaping items that rode the same commit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { escapeHtml, taskDay, linkedToAccount, linkedToContact, contactTouch, monthsSpanned } from '../src/utils/historyFeed.js';

test('escapeHtml neutralises every markup-significant character', () => {
    assert.equal(escapeHtml(`<img onerror="x('y')">&`), '&lt;img onerror=&quot;x(&#39;y&#39;)&quot;&gt;&amp;');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml('plain — text'), 'plain — text');
});

test('taskDay reads completedDate (the column), then due, then created', () => {
    assert.equal(taskDay({ completedDate: '2026-08-30', dueDate: '2026-09-01', createdAt: '2026-08-01T10:00:00Z' }), '2026-08-30');
    assert.equal(taskDay({ dueDate: '2026-09-01', createdAt: '2026-08-01T10:00:00Z' }), '2026-09-01');
    assert.equal(taskDay({ createdAt: '2026-08-01T10:00:00Z' }), '2026-08-01T10:00:00Z');
    assert.equal(taskDay({ completedAt: '2026-08-30' }), '', 'completedAt is not a column');
});

test('rows link to an account through a deal or their own accountId, never a name field', () => {
    const acct = { id: 'acc_1', name: 'Beacon' };
    const oppIds = new Set(['opp_9']);
    assert.equal(linkedToAccount({ opportunityId: 'opp_9' }, acct, oppIds), true);
    assert.equal(linkedToAccount({ accountId: 'acc_1' }, acct, oppIds), true, 'logged on the account, no deal');
    assert.equal(linkedToAccount({ companyName: 'Beacon' }, acct, oppIds), false, 'companyName is not a column');
    assert.equal(linkedToAccount({ accountId: 'acc_2' }, acct, oppIds), false);
    assert.equal(linkedToAccount({ accountId: undefined }, { name: 'x' }, oppIds), false, 'no id on either side never matches');
});

test('rows link to a contact through a deal, contactId, contactIds, or a task contacts list', () => {
    const oppIds = new Set(['opp_9']);
    assert.equal(linkedToContact({ opportunityId: 'opp_9' }, 'c1', oppIds), true);
    assert.equal(linkedToContact({ contactId: 'c1' }, 'c1', oppIds), true);
    assert.equal(linkedToContact({ contactIds: ['c0', 'c1'] }, 'c1', oppIds), true);
    assert.equal(linkedToContact({ contacts: [{ id: 'c1', name: 'Ann' }] }, 'c1', oppIds), true, 'task contacts as objects');
    assert.equal(linkedToContact({ contacts: ['c1'] }, 'c1', oppIds), true, 'task contacts as ids');
    assert.equal(linkedToContact({ contactName: 'Ann Lee' }, 'c1', oppIds), false, 'contactName is not a column');
    assert.equal(linkedToContact({ contactId: 'c1' }, '', oppIds), false);
});

test('contactTouch derives last touch, count and a recency tier from the activities', () => {
    const acts = [
        { contactId: 'c1', date: '2026-08-30' },
        { contactIds: ['c1'], date: '2026-08-01T15:00:00Z' },
        { contactId: 'c2', date: '2026-09-01' },
    ];
    assert.deepEqual(contactTouch(acts, 'c1', '2026-09-02'), { lastTouch: '2026-08-30', count: 2, tier: 'hot' });
    assert.equal(contactTouch(acts, 'c1', '2026-09-20').tier, 'warm');
    assert.equal(contactTouch(acts, 'c1', '2026-11-20').tier, 'cool');
    assert.equal(contactTouch(acts, 'c1', '2027-01-20').tier, 'stale');
    assert.deepEqual(contactTouch(acts, 'c9', '2026-09-02'), { lastTouch: '', count: 0, tier: 'none' });
});

test('monthsSpanned is the period length, or the span of the events for all time, never under 1', () => {
    assert.equal(monthsSpanned([], '1month'), 1);
    assert.equal(monthsSpanned([], '6months'), 6);
    assert.equal(monthsSpanned([], '1year'), 12);
    assert.equal(monthsSpanned([], 'all', '2026-09-02'), 1);
    assert.equal(monthsSpanned([{ date: '2026-08-20' }], 'all', '2026-09-02'), 1, 'a two-week-old account is not divided by 12');
    assert.equal(monthsSpanned([{ date: '2024-09-02' }, { date: '2026-08-01' }], 'all', '2026-09-02'), 24);
});

test('ReportsTab: the History tab reads real columns; PDF export escapes; labels are honest', () => {
    const src = readFileSync(new URL('../src/Tabs/ReportsTab.jsx', import.meta.url), 'utf8');
    for (const phantom of ['t.completedAt', 't.notes', 'a.companyName', 't.companyName', 'a.contactName', 't.contactName', 'c.engagement', 'c.lastTouch', 'account.warmthStatus', 'account.status', 'account.employees', '__accountsRef', 'o.verticalMarket']) {
        assert.ok(!src.includes(phantom), `${phantom} is not a column`);
    }
    assert.ok(!src.includes('Active customer'), 'an invented status');
    assert.ok(!src.includes("'still open'"), 'a Tasks Done card captioned "still open"');
    assert.ok(!src.includes('Showing {totalCount} of {totalCount}'));
    assert.ok(src.includes('Showing {shown} of {total} events'));
    assert.ok(src.includes('<FilterBar shown={0} total={events.length}/>'), 'an empty filter keeps the bar (the way back to All)');
    assert.ok(src.includes("`No ${showFilter} in this period — ${events.length} under All.`"), 'an empty filter names the filter, not "no events"');
    assert.ok(src.includes('/ mo avg over ${monthsSpanned('), 'the monthly average divides by the real span');
    assert.ok(!src.includes("period==='1year'?12:12"), 'all-time divided by 12');
    // PDF export: every interpolated user value passes through esc()
    const pdfRows = src.match(/return `<tr><td[^\n]*<\/tr>`;/g) || [];
    assert.equal(pdfRows.length, 2, 'two PDF row builders');
    for (const row of pdfRows) {
        const raw = [...row.matchAll(/\$\{([^}]*)\}/g)].map(m => m[1]).filter(x => /\be\.(label|sub|rep|ts|title|who)\b/.test(x));
        assert.ok(raw.length >= 3, 'the row interpolates event text');
        for (const x of raw) assert.match(x, /^esc\(/, `unescaped interpolation: ${x}`);
    }
    assert.ok(src.includes('<h1>${esc(title)}</h1>'), 'the PDF title is escaped');
    assert.equal((src.match(/<h1>\$\{esc\(title\)\}<\/h1>/g) || []).length, 2, 'both PDF writers');
    assert.ok(src.includes('${esc(opp.stage||\'—\')}'), 'the deal PDF escapes the stage');
    // territory template: a deal's own territory column wins; industry from the accounts prop
    assert.ok(src.includes('territory: o.territory || repToTerr[o.salesRep||o.assignedTo] || null'));
    assert.ok(src.includes("const ind = o.vertical || acctByName.get((o.account||'').toLowerCase())?.verticalMarket || 'Other';"));
    assert.ok(src.includes('accounts={accounts}\n                                reportsOpps={reportsOpps}') || src.includes('accounts={accounts}\r\n                                reportsOpps={reportsOpps}'), 'SavedReportsTab receives accounts');
    // forecast-vs-actual says quota where it reads quota
    assert.ok(src.includes('Current quarter quota</div>'));
    assert.ok(!src.includes('% of forecast · '));
    assert.ok(!src.includes('to hit forecast · '));
    // the AI builder no longer claims to have interpreted the prompt
    assert.ok(!src.includes('I built a <strong>horizontal bar chart'));
    assert.ok(src.includes('does not interpret prompts yet'));
    // dead state gone
    assert.ok(!src.includes('actPeriod') && !src.includes('commissionReportFilter'));
    // helper wiring
    assert.ok(src.includes("from '../utils/historyFeed'"));
    assert.ok(src.includes('date: taskDay(t),'));
    assert.ok(src.includes('sub: t.description || \'\','));
    assert.ok(src.includes('if (!linkedToAccount(a, selectedAccount, accOppIds)) return;'));
    assert.ok(src.includes('if (!linkedToAccount(t, selectedAccount, accOppIds)) return;'));
    assert.ok(src.includes('if (!linkedToContact(a, cId, conOppIds)) return;'));
    assert.ok(src.includes('if (!linkedToContact(t, cId, conOppIds)) return;'));
    assert.ok(src.includes('const touch = contactTouch(activities, c.id);'));
});
