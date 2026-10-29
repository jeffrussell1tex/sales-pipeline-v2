// tests/dispatch-customer.test.mjs
//
// A pick is saved as the record picked — Dispatch's customer (state §0.214; batch 2 of OPEN_ITEMS §1 item 1; Jeff,
// 28 Oct: "Refuse, name both", "Open, ask to pick", "Refuse it"). Run on made-up rows in the shapes the map found:
// UKG's twin "Shell - Port Allen" (a business unit and a site under Shell, one name), a customer made by typing
// beside an account of its name, two customers a merge left on one account (merge.mjs moves a customer's account
// to the survivor and renames nothing), and a deal with no account id. The pure rule (src/utils/dispatchCustomer.js)
// and pickLink.js's accountForDeal / openDealsByAccount run here; the screens and the two endpoints that read them
// are pinned to them here and proven against the test database by tests/integration/dispatch-customer.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    customerForDeal, customerForText, customerLabel, dealCustomerRefusal, typedCustomerRefusal, accountInDispatch, refusalLeads, DEAL_NEEDS_PICK,
} from '../src/utils/dispatchCustomer.js';
import { accountForDeal, openDealsByAccount, isMergeArchived } from '../src/utils/pickLink.js';
import { matchSearch, searchKey } from '../src/utils/searchMatch.js';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ids = (rows) => rows.map((r) => r.id);
// Two customers of one name, linked to no account (the second and third reviews of the list fix).
const twoAcmeOf = () => [{ id: 'c1', name: 'Acme', accountId: null, customerNumber: 'CUST-1' }, { id: 'c2', name: 'ACME.', accountId: null, customerNumber: 'CUST-2' }];

// Shell, its unit and its site (one name); Acme, a top-level account; "Resinall, Inc." merged into Resinall.
const ACCOUNTS = [
    { id: 'acc_shell', name: 'Shell' },
    { id: 'acc_unit', name: 'Shell - Port Allen', parentAccountId: 'acc_shell', accountTier: 'business_unit' },
    { id: 'acc_site', name: 'Shell - Port Allen', parentAccountId: 'acc_shell', accountTier: 'site' },
    { id: 'acc_acme', name: 'Acme, Inc.' },
    { id: 'acc_resinall', name: 'Resinall' },
    { id: 'acc_resinall_inc', name: 'Resinall, Inc.', mergeArchived: true, mergedIntoId: 'acc_resinall' },
    { id: 'acc_lone', name: 'Lone Star Pipe' },
];
// The site has a customer; Acme has one made by typing (no link) and nothing else; Resinall has two (a merge's).
const CUSTOMERS = [
    { id: 'c_site', name: 'Shell - Port Allen', accountId: 'acc_site', customerNumber: 'CUST-0001' },
    { id: 'c_acme_typed', name: 'Acme Inc', accountId: null, customerNumber: 'CUST-0002' },
    { id: 'c_res', name: 'Resinall', accountId: 'acc_resinall', customerNumber: 'CUST-0003' },
    { id: 'c_res_inc', name: 'Resinall, Inc.', accountId: 'acc_resinall', customerNumber: 'CUST-0004' },
];

// ── Rules 1-3: a deal's customer ─────────────────────────────────────────────

const forDeal = (deal, customers = CUSTOMERS, accounts = ACCOUNTS) => customerForDeal(customers, deal, accounts);

test('customerForDeal: the one customer linked to the deal\'s account — never a customer of its name linked to the twin', () => {
    // The unit's deal: the site's customer has the name, and is the SITE's — not the unit's (the old name step took it).
    assert.deepEqual(forDeal({ accountId: 'acc_unit', account: 'Shell - Port Allen' }), { how: 'none', accountId: 'acc_unit' }, 'a made customer links to the unit');
    assert.deepEqual(forDeal({ accountId: 'acc_site', account: 'Shell - Port Allen' }), { how: 'account', customer: CUSTOMERS[0], accountId: 'acc_site' });
    assert.equal(forDeal({ accountId: 'acc_site', account: 'something else' }).how, 'account', 'the id decides; the name is not read');
    // A deal still on a merged-away account by id: the account it was merged into.
    assert.equal(forDeal({ accountId: 'acc_resinall_inc' }, CUSTOMERS.slice(0, 3)).customer.id, 'c_res');
    // An id this list does not hold (deleted since, or outside a rep's list): the id itself — never a twin found by name.
    assert.deepEqual(forDeal({ accountId: 'acc_gone', account: 'Lone Star Pipe' }), { how: 'none', accountId: 'acc_gone' });
    // Two customers of its name on such a deal: on no account — quote -> job says to link the deal, never to link a
    // customer to an account that is gone (the ninth review).
    const gone2 = forDeal({ accountId: 'acc_gone', account: 'Gone Co' }, [{ id: 'g1', name: 'Gone Co', accountId: null, customerNumber: 'CUST-0021' }, { id: 'g2', name: 'GONE CO.', accountId: null, customerNumber: 'CUST-0022' }]);
    assert.deepEqual([gone2.refusal, gone2.by, gone2.noAccount], ['many', 'name', true]);
    assert.match(dealCustomerRefusal(gone2, 'server'), /The deal is linked to no account: link it to its account, or rename one of these customers/, 'REGRESSION: told to link a customer to an account that is gone');
    // A blank account text and a customer of no name: no key, nothing taken (the ninth review — '' read every '-' as it).
    assert.deepEqual(forDeal({ accountId: 'acc_lone', account: '' }, [{ id: 'c_dash', name: '-', accountId: null }]), { how: 'none', accountId: 'acc_lone' },
        'REGRESSION: a customer of no name taken for a deal of no name');
    // A deal on no id whose name is a merged-away account's: it stands on the survivor, and the customer linked to no
    // account, of the SURVIVOR's name, stands for it (the sixth review: by the deal's text alone none did, and Save made
    // a second customer beside it).
    const typedRes = [{ id: 'c_typed', name: 'Resinall', accountId: null, customerNumber: 'CUST-0009' }];
    assert.deepEqual(forDeal({ accountId: null, account: 'Resinall, Inc.' }, typedRes), { how: 'name', customer: typedRes[0], accountId: 'acc_resinall' },
        'REGRESSION: a merged-away name\'s deal makes a second customer beside its survivor\'s');
    // A deal on an id reads the name it holds alone — the screen and quote -> job alike, though a rep's list lacks
    // another rep's account (the eighth review: the account's own name parted them).
    const lsp = [{ id: 'c_lsp', name: 'Lone Star Pipe', accountId: null, customerNumber: 'CUST-0012' }];
    assert.deepEqual(forDeal({ accountId: 'acc_lone', account: 'LSP (old text)' }, lsp), { how: 'none', accountId: 'acc_lone' });
    assert.deepEqual(forDeal({ accountId: 'acc_lone', account: 'LSP (old text)' }, lsp), forDeal({ accountId: 'acc_lone', account: 'LSP (old text)' }, lsp, []),
        'REGRESSION: a rep\'s screen and the server part ways on a deal\'s customer');
    // Its words say each name the customers have, the deal's own spelling where it is one of them (the seventh review).
    const both = [{ id: 'c_old', name: 'Resinall, Inc.', accountId: null, customerNumber: 'CUST-0011' }, { id: 'c_new', name: 'Resinall', accountId: null, customerNumber: 'CUST-0012' }];
    const r2 = forDeal({ accountId: null, account: 'resinall inc' }, both);
    assert.deepEqual(ids(r2.matches), ['c_old', 'c_new'], 'one of each name: refused, naming both');
    assert.equal(dealCustomerRefusal(r2),
        'More than one dispatch customer is named “resinall inc” or “Resinall” — “Resinall, Inc.” (CUST-0011), “Resinall” (CUST-0012). Pick the one you mean from the list.',
        'REGRESSION: the deal\'s own spelling, or the other name, lost');
    // Two customers of one name spelt two ways, neither the deal's: the first's spelling, said once (the tenth review).
    const twoSpellings = [{ id: 's1', name: 'Resinall', accountId: null, customerNumber: 'CUST-0031' }, { id: 's2', name: 'RESINALL.', accountId: null, customerNumber: 'CUST-0032' }];
    assert.match(dealCustomerRefusal(forDeal({ accountId: null, account: 'Resinall, Inc.' }, twoSpellings)), /^More than one dispatch customer is named “Resinall” — /,
        'REGRESSION: one name said twice, or the last spelling for the first');
    // The old rule, as it stood (invoices.js resolveCustomerForOpp): the unit's deal took the site's customer.
    const old = (customers, opp) => {
        if (opp?.accountId) { const byAccount = customers.find((c) => c.accountId && c.accountId === opp.accountId); if (byAccount) return byAccount; }
        const name = String(opp?.account || '').trim().toLowerCase();
        return name ? customers.find((c) => String(c.name || '').trim().toLowerCase() === name) || null : null;
    };
    assert.equal(old(CUSTOMERS, { accountId: 'acc_unit', account: 'Shell - Port Allen' }).id, 'c_site', 'the old line: the twin\'s customer');
});

test('customerForDeal: two customers linked to one account — none taken, both named (Jeff: "Refuse, name both")', () => {
    const r = forDeal({ accountId: 'acc_resinall', account: 'Resinall' });
    assert.equal(r.refusal, 'many');
    assert.equal(r.by, 'account');
    assert.deepEqual(ids(r.matches), ['c_res', 'c_res_inc']);
    assert.equal(r.customer, undefined, 'no customer chosen');
    // One order whatever order the customers were read in — quote -> job's read is unordered.
    assert.deepEqual(ids(forDeal({ accountId: 'acc_resinall' }, [...CUSTOMERS].reverse()).matches), ['c_res', 'c_res_inc'], 'by number, read in any order');
    assert.equal(dealCustomerRefusal(r),
        'More than one dispatch customer is linked to this deal\'s account — “Resinall” (CUST-0003), “Resinall, Inc.” (CUST-0004). Pick the one you mean from the list.');
    assert.equal(dealCustomerRefusal(r, 'server'),
        'More than one dispatch customer is linked to this deal\'s account — “Resinall” (CUST-0003), “Resinall, Inc.” (CUST-0004). Unlink the wrong one under Dispatch → Customers, then create the job again.');
});

test('customerForDeal: with no customer linked, the one of the deal\'s account name linked to no account — by searchKey', () => {
    // A deal on Acme's id: the customer typed as "Acme Inc" reads as "Acme, Inc." and is linked to nothing.
    const r = forDeal({ accountId: 'acc_acme', account: 'Acme, Inc.' });
    assert.deepEqual([r.how, r.customer.id, r.accountId], ['name', 'c_acme_typed', 'acc_acme'], 'punctuation ignored — the old lower-case compare made a second');
    // Two of the name: refused, by name.
    const twins = [...CUSTOMERS, { id: 'c_acme_2', name: 'ACME INC.', accountId: null, customerNumber: 'CUST-0009' }];
    const many = forDeal({ accountId: 'acc_acme', account: 'Acme Inc' }, twins);
    assert.deepEqual([many.refusal, many.by, ids(many.matches)], ['many', 'name', ['c_acme_typed', 'c_acme_2']]);
    assert.equal(dealCustomerRefusal(many, 'server'),
        'More than one dispatch customer is named “Acme Inc” — “Acme Inc” (CUST-0002), “ACME INC.” (CUST-0009). Link the right one to the deal\'s account under Dispatch → Customers, then create the job again.');
});

test('customerForDeal: a deal with no account id stands on the one live account of its name — the screen and the server one answer (the review\'s two cases)', () => {
    // (a) One live account "Acme Co"; its customer has another name. The placeholder and quote -> job both take it —
    // quote -> job read no accounts and made a second, unlinked "Acme Co".
    const A = [{ id: 'acc_a', name: 'Acme Co' }, { id: 'acc_b', name: 'Acme Holdings' }];
    const a = forDeal({ accountId: null, account: 'acme co' }, [{ id: 'c1', name: 'Acme Field Services', accountId: 'acc_a' }], A);
    assert.deepEqual([a.how, a.customer.id, a.accountId], ['account', 'c1', 'acc_a']);
    // (b) A customer of the deal's name linked to ANOTHER account is that account's: none, and a made customer links to
    // the deal's own account — the job never lands on the other account.
    const b = forDeal({ accountId: null, account: 'Acme Co' }, [{ id: 'c2', name: 'Acme Co', accountId: 'acc_b' }], A);
    assert.deepEqual(b, { how: 'none', accountId: 'acc_a' });
    // A name only a merged-away account has: the account it was merged into.
    assert.deepEqual(forDeal({ account: 'Resinall, Inc.' }, CUSTOMERS.slice(0, 3)), { how: 'account', customer: CUSTOMERS[2], accountId: 'acc_resinall' });
});

test('customerForDeal: a deal with no account id and twin accounts of its name reads its name as a typed name — the customer of it, or a refusal; none: none', () => {
    // The site's customer has the twins' name: it (rule 4, the customer of the name).
    assert.deepEqual(forDeal({ account: 'shell - port allen' }), { how: 'name', customer: CUSTOMERS[0], accountId: '' });
    // No customer of the name: the twins are refused, by account — never the first or the last.
    const r = forDeal({ account: 'Shell - Port Allen' }, CUSTOMERS.slice(1));
    assert.deepEqual([r.refusal, r.by, r.of, ids(r.matches)], ['many', 'name', 'account', ['acc_unit', 'acc_site']]);
    assert.equal(dealCustomerRefusal(r, 'server'), 'More than one CRM account is named “Shell - Port Allen”, and the deal is linked to none of them. Link the deal to its account, then create the job again.');
    assert.equal(dealCustomerRefusal(r), 'More than one CRM account is named “Shell - Port Allen”, and the deal is linked to none of them. Pick the customer from the list.');
    // No record of the name, or none to read: none.
    assert.deepEqual(forDeal({ account: 'Brand New Co' }), { how: 'none', accountId: '' });
    assert.deepEqual(forDeal({ account: '   ' }), { how: 'none', accountId: '' });
    assert.deepEqual(forDeal(null), { how: 'none', accountId: '' });
    assert.deepEqual(customerForDeal(undefined, { account: 'Acme Inc' }, undefined), { how: 'none', accountId: '' });
});

test('customerForDeal: a deal on no account — its name two customers have, or only accounts merged into two others — refused, saying what to change (the second review)', () => {
    // Two customers of the name, the deal on no account (twin accounts of it): the server says link the DEAL — linking a
    // customer to one twin changes nothing (the name still reads as both).
    const twins = [{ id: 'p1', name: 'Port' }, { id: 'p2', name: 'Port' }];
    const custs = [{ id: 'c1', name: 'Port', customerNumber: 'CUST-0001' }, { id: 'c2', name: 'port', customerNumber: 'CUST-0002' }];
    const m = customerForDeal(custs, { accountId: null, account: 'Port' }, twins);
    assert.deepEqual([m.refusal, m.by, m.of, m.noAccount], ['many', 'name', 'customer', true]);
    assert.equal(dealCustomerRefusal(m, 'server'),
        'More than one dispatch customer is named “Port” — “Port” (CUST-0001), “port” (CUST-0002). The deal is linked to no account: link it to its account, or rename one of these customers under Dispatch → Customers, then create the job again.');
    // A name only accounts merged into two others have: refused as the field refuses it — never a customer of the name.
    const gone = [{ id: 's1', name: 'S One' }, { id: 's2', name: 'S Two' },
        { id: 'a1', name: 'Acme', mergeArchived: true, mergedIntoId: 's1' }, { id: 'a2', name: 'Acme', mergeArchived: true, mergedIntoId: 's2' }];
    const g = customerForDeal([], { accountId: null, account: 'Acme' }, gone);
    assert.equal(g.refusal, 'merged', 'REGRESSION: quote -> job made a customer of a merged-away name');
    assert.equal(dealCustomerRefusal(g), '“Acme” was merged into another account.');
    assert.equal(dealCustomerRefusal(g, 'server'), '“Acme” was merged into another account. Link the deal to its account, then create the job again.');
    // One survivor: the account branch, its customer.
    assert.equal(customerForDeal([{ id: 'c_s1', name: 'S One', accountId: 's1' }], { account: 'Acme' }, gone.filter((a) => a.id !== 'a2')).customer.id, 'c_s1');
});

test('dealCustomerRefusal names five and counts the rest; customerLabel names a customer with no number by name alone', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, name: 'Dup', accountId: 'acc_x', customerNumber: `CUST-000${i}` }));
    const r = customerForDeal(many, { accountId: 'acc_x' }, []);
    assert.match(dealCustomerRefusal(r), /“Dup” \(CUST-0004\) and 2 more\. Pick/);
    assert.equal(customerLabel({ name: ' Acme ' }), '“Acme”');
    assert.equal(dealCustomerRefusal({ how: 'none' }), '');
});

// ── Rule 3: a name typed in New Job ──────────────────────────────────────────

test('customerForText: a customer\'s name typed in full saves as that customer, under its own spelling — never a second customer', () => {
    assert.deepEqual([customerForText('acme, inc', CUSTOMERS, ACCOUNTS).how, customerForText('acme, inc', CUSTOMERS, ACCOUNTS).customer.id], ['customer', 'c_acme_typed']);
    // A live account's name whose customer has another name: that customer (the account is in Dispatch as it).
    const r = customerForText('Resinall', CUSTOMERS.slice(0, 3), ACCOUNTS);
    assert.deepEqual([r.how, r.customer.id], ['customer', 'c_res']);
});

test('customerForText: two of the name — refused, the words naming what each row shows', () => {
    // The Shell twins: the site's customer by its name, and the unit has none — one customer: it.
    assert.equal(customerForText('Shell - Port Allen', CUSTOMERS, ACCOUNTS).customer.id, 'c_site');
    // Resinall's two customers (one by name, one through the account it stands for): refused.
    const r = customerForText('resinall', CUSTOMERS, ACCOUNTS);
    assert.deepEqual([r.refusal, r.of, ids(r.matches)], ['many', 'customer', ['c_res', 'c_res_inc']]);
    assert.equal(typedCustomerRefusal(r), 'More than one dispatch customer is named “resinall” or linked to the CRM account of that name — “Resinall” (CUST-0003), “Resinall, Inc.” (CUST-0004). Pick the one you mean from the list — each row names its number and account.',
        'one of them is named otherwise: linked, never "named" (the browser check, 28 Oct)');
    // Two live accounts of the name, neither in Dispatch: refused, by account.
    const noSite = CUSTOMERS.filter((c) => c.id !== 'c_site');
    const twins = customerForText('Shell - Port Allen', noSite, ACCOUNTS);
    assert.deepEqual([twins.refusal, twins.of, ids(twins.matches)], ['many', 'account', ['acc_unit', 'acc_site']]);
    assert.equal(typedCustomerRefusal(twins), 'More than one CRM account is named “Shell - Port Allen”. Pick the one you mean from the list — each row names its parent.');
    // One twin's customer of another name stands for that twin alone, never for the name (the review): still refused.
    const unitsOwn = [...noSite, { id: 'c_unit', name: 'Port Allen unit', accountId: 'acc_unit', customerNumber: 'CUST-0010' }];
    const r2 = customerForText('Shell - Port Allen', unitsOwn, ACCOUNTS);
    assert.deepEqual([r2.refusal, r2.of, ids(r2.matches)], ['many', 'account', ['acc_unit', 'acc_site']], 'REGRESSION: the unit\'s customer taken for the name');
    // With ONE live account of the name, its customer of another name is that name's customer.
    assert.equal(customerForText('Lone Star Pipe', [{ id: 'c_lone', name: 'LSP field', accountId: 'acc_lone' }], ACCOUNTS).customer.id, 'c_lone');
});

// The browser check (28 Oct, Accelerep QA, made-up rows held in the page): a won deal's account had two customers of
// other names; New Job said "Pick the one you mean from the list", and the list was empty — the rows were found by
// the customer's own name alone. They are found by their CRM account's too now, ranked below, and the words name them;
// and (the review of that fix) the customers a refusal names lead the list by id, before its six — past the six, or
// on an account the screen does not hold (a rep's list, a deleted account), they were still not in it.
test('New Job\'s list holds the customers a refusal names: first, by id; the rest by their name, then their account\'s', () => {
    const accounts = [{ id: 'acc_undo', name: 'TEST Undo, Inc.' }, { id: 'acc_other', name: 'Other Co' }];
    const customers = [
        { id: 'c_n', name: 'TEST Undo North', accountId: 'acc_undo', customerNumber: 'CUST-0093' },
        { id: 'c_s', name: 'TEST Undo South', accountId: 'acc_undo', customerNumber: 'CUST-0094' },
        { id: 'c_own', name: 'TEST Undo, Inc. depot', accountId: 'acc_other', customerNumber: 'CUST-0095' },
        { id: 'c_x', name: 'Elsewhere', accountId: 'acc_other', customerNumber: 'CUST-0096' },
    ];
    const d = read('src/Tabs/DispatchTab.jsx');
    assert.ok(d.includes('const CustomerTypeahead = ({ customers, accounts, query, selectedId, selectedAccountId, placeholderRefusal, dealHold, placeholderLeads, onQueryChange,'));
    assert.ok(d.includes('const NO_LEADS = { customerIds: [], accountIds: [], hold: false };\n'));
    assert.ok(d.includes('    const byName = { text: x => x.name, limit: 6 };'));
    // The eight lines, run as written; the typed name is worked out before them (it was below the list).
    const start = d.indexOf('    const leads = refusal ? (placeholderLeads || NO_LEADS)\n');
    const end = d.indexOf('    const custMatches = [...leadRows, ...custFound];\n');
    assert.ok(start > 0 && end > start, 'REGRESSION: the list no longer led by the customers a refusal names');
    assert.ok(d.indexOf('    const typed = q ? customerForText(query, customers, accounts) : null;\n') < start, 'the typed name before the list that reads it');
    const lines = d.slice(start, d.indexOf('\n', end) + 1);
    assert.equal(lines.split('\n').filter(Boolean).length, 8);
    assert.ok(lines.includes('matchSearch((customers || []).filter(c => !leadSet.has(c.id)), query, { ...byName, also: c => [byId.get(c.accountId)?.name] });'),
        'REGRESSION: the rows found by the customer\'s own name alone');
    const NO = { customerIds: [], accountIds: [], hold: false };
    const list = ({ query, rows = customers, accts = accounts, refusal = '', placeholderLeads }) => {
        const typed = query.trim() ? customerForText(query, rows, accts) : null;
        const byId = new Map(accts.map((a) => [a.id, a]));
        return new Function('refusal', 'placeholderLeads', 'NO_LEADS', 'refusalLeads', 'typed', 'customers', 'accounts', 'query', 'matchSearch', 'byName', 'byId',
            `${lines}\nreturn { ids: custMatches.map((c) => c.id), more: custMore, leads };`)(
            refusal, placeholderLeads, NO, refusalLeads, typed, rows, accts, query, matchSearch, { text: (x) => x.name, limit: 6 }, byId);
    };
    // No refusal: own name first, the two linked to the account below; an account's name read only where the
    // customer's own does not answer.
    assert.deepEqual(list({ query: 'TEST Undo, Inc. depot' }).ids, ['c_own']);
    assert.deepEqual(list({ query: 'elsewhere' }).ids, ['c_x']);
    assert.deepEqual(list({ query: 'nothing like it' }).ids, []);
    // A part of an account's name, no record's name (Create): the customers linked to it, found by it alone — the
    // account-name search on its own (the second review: only a pin caught its loss).
    assert.equal(customerForText('other', customers, accounts).how, 'create');
    assert.deepEqual(list({ query: 'other' }).ids, ['c_x', 'c_own'], 'REGRESSION: a customer never found by its CRM account\'s name');
    // A typed name the rule saves as ONE customer, through the account it stands for: it leads — past six that hold the
    // name in their own (the second review: the line named it, the list cut it).
    const crowd1 = [customers[0], ...Array.from({ length: 7 }, (_, i) => ({ id: `c_d${i}`, name: `TEST Undo, Inc. dock ${i}`, accountId: 'acc_other', customerNumber: `CUST-03${i}0` }))];
    assert.equal(customerForText('TEST Undo, Inc.', crowd1, accounts).customer.id, 'c_n');
    assert.deepEqual(list({ query: 'TEST Undo, Inc.', rows: crowd1 }).ids.slice(0, 1), ['c_n'], 'REGRESSION: the customer the line saves as cut past the six');
    // Two twin accounts of the name, one held by a customer of another name: that customer leads (the twin it holds is
    // out of "not yet in Dispatch"), past six that hold the name in their own.
    const twinAccts = [{ id: 'tw_u', name: 'Port Allen', parentAccountId: 'p' }, { id: 'tw_s', name: 'Port Allen', parentAccountId: 'p' }, { id: 'p', name: 'Shell' }];
    const twinRows = [{ id: 'c_unit', name: 'Unit yard', accountId: 'tw_u', customerNumber: 'CUST-0400' },
        ...Array.from({ length: 7 }, (_, i) => ({ id: `c_pa${i}`, name: `Port Allen depot ${i}`, accountId: 'p', customerNumber: `CUST-04${i}1` }))];
    const tw = customerForText('Port Allen', twinRows, twinAccts);
    assert.deepEqual([tw.refusal, tw.of], ['many', 'account']);
    assert.deepEqual(list({ query: 'Port Allen', rows: twinRows, accts: twinAccts }).ids.slice(0, 1), ['c_unit'], 'REGRESSION: a twin reachable only through a customer cut past the six');
    // The typed name the rule refuses (the two linked to the one live account of it): they lead, the rest after.
    const r = customerForText('TEST Undo, Inc.', customers, accounts);
    assert.deepEqual([r.refusal, r.of, ids(r.matches)], ['many', 'customer', ['c_n', 'c_s']], 'a name that only holds the text is not the name');
    assert.deepEqual(list({ query: 'TEST Undo, Inc.' }).ids, ['c_n', 'c_s', 'c_own'], 'every customer the refusal names is a row, first; then the name that holds it');
    const r2 = customerForText('TEST Undo, Inc.', customers.slice(0, 2), accounts);
    assert.equal(typedCustomerRefusal(r2), 'More than one dispatch customer is named “TEST Undo, Inc.” or linked to the CRM account of that name — “TEST Undo North” (CUST-0093), “TEST Undo South” (CUST-0094). Pick the one you mean from the list — each row names its number and account.');
    // Past the six: eight customers whose own names hold the text came before the two linked ones (rank 3) — now
    // the two lead, and the six follow (the review: "2 more — keep typing", and no typing brought them up).
    const crowd = [...customers.slice(0, 2), ...Array.from({ length: 8 }, (_, i) => ({ id: `c_site${i}`, name: `TEST Undo, Inc. site ${i}`, accountId: 'acc_other', customerNumber: `CUST-02${i}0` }))];
    const past = list({ query: 'TEST Undo, Inc.', rows: crowd });
    assert.deepEqual(past.ids.slice(0, 2), ['c_n', 'c_s'], 'REGRESSION: the customers the refusal names cut past the six');
    assert.deepEqual([past.ids.length, past.more], [8, 2], 'the two, then the usual six and the rest counted');
    // A won deal's placeholder whose account this screen does not hold (a rep's list): its refusal's ids lead — no
    // name finds them. Its words stand until a pick or a keystroke.
    const deal = customerForDeal(customers, { accountId: 'acc_undo', account: 'TEST Undo, Inc.' }, []);
    assert.deepEqual([deal.refusal, deal.by, ids(deal.matches)], ['many', 'account', ['c_n', 'c_s']]);
    const dealLeads = { ...refusalLeads(deal, customers, []), hold: true };
    assert.deepEqual(list({ query: 'TEST Undo, Inc.', accts: [], refusal: dealCustomerRefusal(deal), placeholderLeads: dealLeads }).ids.slice(0, 2), ['c_n', 'c_s'],
        'REGRESSION: a rep\'s placeholder points at a list without the customers it names');
    assert.deepEqual(list({ query: 'TEST Undo, Inc.', accts: [], refusal: dealCustomerRefusal(deal) }).ids, ['c_own'], 'without the leads, no name found them (the defect)');
    // One of the placeholder's customers deleted since: the one left leads; nothing breaks (the seventh review).
    assert.deepEqual(list({ query: 'TEST Undo, Inc.', accts: [], refusal: dealCustomerRefusal(deal), placeholderLeads: { ...dealLeads, customerIds: ['c_deleted', 'c_s'] } }).ids.slice(0, 1), ['c_s'],
        'REGRESSION: a deleted customer\'s lead row');
    // A typed refusal holds no account (the hold is a placeholder's).
    assert.equal(list({ query: 'TEST Undo, Inc.' }).leads.hold, false, 'REGRESSION: a typed refusal holds the CRM accounts back');
    // A placeholder's refusal of two twin accounts, one held by a customer of another name: that customer leads, past
    // six that hold the name in their own (the fifth review — the placeholder carried no leads for twins).
    const twinDeal = customerForDeal(twinRows, { accountId: null, account: 'Port Allen' }, twinAccts);
    assert.deepEqual([twinDeal.refusal, twinDeal.of, twinDeal.noAccount], ['many', 'account', true]);
    const twinLeads = { ...refusalLeads(twinDeal, twinRows, twinAccts), hold: false };
    assert.deepEqual(list({ query: 'Port Allen', rows: twinRows, accts: twinAccts, refusal: dealCustomerRefusal(twinDeal), placeholderLeads: twinLeads }).ids.slice(0, 1), ['c_unit'],
        'REGRESSION: a twin a placeholder\'s refusal names reachable only through a customer cut past the six');
    // A typed merged-away name: the customers of the account it was merged into lead ("pick “Resinall”").
    const merged = list({ query: 'Resinall, Inc.', rows: CUSTOMERS.slice(0, 3), accts: ACCOUNTS });
    assert.deepEqual([merged.ids, merged.leads.accountIds], [['c_res'], ['acc_resinall']], 'REGRESSION: the survivor a merged-away name\'s refusal names not in the list');
    // The survivor in Dispatch through a customer linked to no account, of its name: that customer is the row.
    const typedRes = [{ id: 'c_typed', name: 'Resinall', accountId: null, customerNumber: 'CUST-0009' }];
    assert.deepEqual(list({ query: 'Resinall, Inc.', rows: typedRes, accts: ACCOUNTS }).ids, ['c_typed'], 'REGRESSION: the list shut under "pick “Resinall”" (the sixth review)');
    // The placeholder carries the rule's leads and its hold; the starter copies them; the field reads them; an empty
    // New Job has none.
    assert.ok(d.includes("                customerRefusalLeads: found.refusal ? { ...refusalLeads(found, customers, accounts), hold: found.refusal === 'many' && found.of !== 'account' } : null,\n"));
    assert.ok(d.includes('            customerRefusalLeads: row.customerRefusalLeads || null,\n'));
    assert.ok(d.includes('                                    placeholderLeads={newJobForm.customerRefusalLeads}\n'));
    assert.ok(d.includes("        customerRefusal: '', customerRefusalLeads: null, madeCustomerId: '', madeLocation: null, refusedDeal: '' };"));
    // "CRM accounts — not yet in Dispatch", its lines run as written: an account a customer links by id, or that a
    // customer linked to no account has the name of, is in Dispatch (the second review: under a refusal of two
    // unlinked "Acme" customers the account Acme was offered, and its pick saved a third "Acme").
    const g0 = d.indexOf('    const linkedAccountIds = new Set((customers || []).map(c => c.accountId).filter(Boolean));\n');
    const g1 = d.indexOf('    const acctMatches = [...acctLead, ...acctFound];\n', g0);
    assert.ok(g0 > 0 && g1 > g0);
    assert.ok(d.slice(g0, g1).includes('        .filter(a => !holdAccounts && !acctLeadSet.has(a.id) && !isMergeArchived(a) && !linkedAccountIds.has(a.id)), query, byName);\n'));
    const group2 = d.slice(g0, d.indexOf('\n', g1) + 1);
    assert.equal(group2.split('\n').filter(Boolean).length, 14, 'its seven statements, the loop, and their comments');
    // leads and leadRows: what the field's list leads with (the block above) — a placeholder's while its refusal stands;
    // dealHold: a won deal two customers stand for, which makes no new customer.
    const offered = (rows, accts, query, leads = NO, leadRows = [], dealHold = false) => new Function('customers', 'accounts', 'query', 'matchSearch', 'searchKey', 'isMergeArchived', 'byName', 'leads', 'leadRows', 'byId', 'dealHold',
        `${group2}\nreturn acctMatches.map((a) => a.id);`)(rows, accts, query, matchSearch, searchKey, isMergeArchived, { text: (x) => x.name, limit: 6 }, leads, leadRows, new Map(accts.map((a) => [a.id, a])), dealHold);
    // A won deal's placeholder refusal of two customers: no account offered (the third review — the deal's own account,
    // named otherwise than the deal's account text, was, and its pick saved a third customer for the deal).
    const holdings = [{ id: 'X', name: 'Acme Holdings' }];
    const held = customerForDeal(twoAcmeOf(), { accountId: 'X', account: 'Acme' }, holdings);
    assert.deepEqual([held.refusal, held.by], ['many', 'name']);
    const heldLeads = { ...refusalLeads(held, twoAcmeOf(), holdings), hold: true };
    assert.deepEqual(offered(twoAcmeOf(), holdings, 'Acme'), ['X'], 'the deal\'s own account, by its other name');
    assert.deepEqual(offered(twoAcmeOf(), holdings, 'Acme', heldLeads, twoAcmeOf(), true), [], 'REGRESSION: an account offered under the placeholder\'s refusal — its pick saves a third customer');
    assert.deepEqual(offered(twoAcmeOf(), holdings, 'Acme', heldLeads, [], true), [], 'REGRESSION: its customers deleted since, an account offered — its pick makes a customer Save refuses (the eighth review)');
    assert.deepEqual(offered(twoAcmeOf(), holdings, 'Acme', heldLeads, twoAcmeOf(), false), ['X'], 'the hold is the deal\'s alone: another deal picked, the accounts back');
    assert.deepEqual(offered(twoAcmeOf(), holdings, 'Acme', { ...NO, customerIds: ['c1'] }, [{ id: 'c1' }], true), [], 'a customer typed in full on a held deal: still no account');
    // A typed name's lead holds nothing (the fifth review: a hold on any lead emptied the accounts under a typed name).
    assert.deepEqual(offered([{ id: 'c3', name: 'Acme', accountId: 'a_other' }], [{ id: 'a_acme', name: 'Acme' }], 'Acme', { ...NO, customerIds: ['c3'] }, [{ id: 'c3' }]), ['a_acme'],
        'REGRESSION: the accounts held under a typed name that leads with a customer');
    // A placeholder's refusal of two twin accounts (a deal on no account, no customer of its name) names no customer:
    // the twins lead, and are what is picked (the docs pass: `!refusal` held them out — an empty list under it).
    const twins = customerForDeal([], { accountId: null, account: 'Shell - Port Allen' }, ACCOUNTS);
    assert.deepEqual([twins.refusal, twins.of], ['many', 'account']);
    assert.deepEqual(offered([], ACCOUNTS, 'Shell - Port Allen', { ...refusalLeads(twins, [], ACCOUNTS), hold: false }, []), ['acc_unit', 'acc_site'],
        'REGRESSION: the twin accounts a placeholder\'s refusal names held out of the list');
    // A merged-away name's survivor not yet in Dispatch leads the accounts, though its name is not what was typed.
    const mergedLeads = { ...refusalLeads(customerForText('Resinall, Inc.', [], ACCOUNTS), [], ACCOUNTS), hold: false };
    assert.deepEqual(offered([], ACCOUNTS, 'Resinall, Inc.', mergedLeads, [])[0], 'acc_resinall', 'REGRESSION: the survivor a merged-away name\'s refusal names not in the list');
    // In Dispatch already: its customer leads above, and the account is not offered to be made again.
    const inDispatch = CUSTOMERS.slice(0, 3);
    const mergedHeld = { ...refusalLeads(customerForText('Resinall, Inc.', inDispatch.slice(0, 2), ACCOUNTS), inDispatch, ACCOUNTS), hold: false };
    assert.deepEqual(offered(inDispatch, ACCOUNTS, 'Resinall, Inc.', mergedHeld, [inDispatch[2]]), [], 'REGRESSION: a survivor already in Dispatch offered as "not yet in Dispatch"');
    // A name of punctuation alone holds no account out: no record stands for it (customerForText: Create).
    assert.deepEqual(offered([{ id: 'c0', name: '', accountId: null }, { id: 'c00', name: '—', accountId: null }], [{ id: 'a0', name: '-' }], '-'), ['a0'],
        'REGRESSION: a customer of no name holds out every account of no name');
    const acme = [{ id: 'a_acme', name: 'Acme' }];
    const twoAcme = twoAcmeOf();
    assert.deepEqual(offered(twoAcme, acme, 'Acme'), [], 'REGRESSION: an account two unlinked customers of its name stand for offered — its pick saves a third');
    assert.equal(typedCustomerRefusal(customerForText('Acme', twoAcme, acme)).startsWith('More than one dispatch customer is named “Acme”'), true);
    assert.deepEqual(offered([], acme, 'Acme'), ['a_acme'], 'no customer of it: offered');
    assert.deepEqual(offered([{ id: 'c3', name: 'Acme', accountId: 'a_other' }], acme, 'Acme'), ['a_acme'], 'a customer of the name linked to ANOTHER account stands for that one, never this');
    assert.deepEqual(offered([{ id: 'c4', name: 'Bolt', accountId: 'a_acme' }], acme, 'Acme'), [], 'linked by id');
    // The twins: the site's customer is linked to the site — the unit is still offered (the reason linkedNames went).
    assert.deepEqual(offered([{ id: 'c_site', name: 'Shell - Port Allen', accountId: 'acc_site' }], ACCOUNTS, 'Shell - Port Allen'), ['acc_unit']);
    // Each of the name: "named", naming both.
    const two = [{ id: 'c_a', name: 'Lakeview Apartments', customerNumber: 'CUST-0004' }, { id: 'c_b', name: 'Lakeview apartments.', customerNumber: 'CUST-0091' }];
    assert.equal(typedCustomerRefusal(customerForText('Lakeview Apartments', two, [])),
        'More than one dispatch customer is named “Lakeview Apartments” — “Lakeview Apartments” (CUST-0004), “Lakeview apartments.” (CUST-0091). Pick the one you mean from the list — each row names its number and account.');
    // Six or more: the first five named, the rest counted.
    const many = Array.from({ length: 7 }, (_, i) => ({ id: `c${i}`, name: 'Acme', customerNumber: `CUST-010${i}` }));
    assert.match(typedCustomerRefusal(customerForText('Acme', many, [])), /\(CUST-0104\) and 2 more\. Pick/);
});

test('customerForText: the one live account of the name not yet in Dispatch; a merged-away name refused; no record of it — Create', () => {
    const r = customerForText('lone star pipe', CUSTOMERS, ACCOUNTS);
    assert.deepEqual([r.how, r.account.id], ['account', 'acc_lone']);
    const gone = customerForText('Resinall, Inc.', CUSTOMERS.filter((c) => !c.name.startsWith('Resinall')), ACCOUNTS);
    assert.equal(gone.refusal, 'merged');
    assert.equal(typedCustomerRefusal(gone), '“Resinall, Inc.” was merged into “Resinall” — pick “Resinall”.');
    assert.deepEqual(customerForText('Brand New Co', CUSTOMERS, ACCOUNTS), { how: 'create' });
    assert.deepEqual(customerForText('-', CUSTOMERS, ACCOUNTS), { how: 'create' }, 'punctuation alone: Create, as the field has offered');
    assert.deepEqual(customerForText('  ', CUSTOMERS, ACCOUNTS), { how: 'empty' });
    assert.equal(typedCustomerRefusal({ how: 'create' }), '');
});

test('refusalLeads: what each refusal names — two customers; two twins and the customers that hold them; a merged-away name\'s survivor and its customers', () => {
    const none = { customerIds: [], accountIds: [] };
    // Two customers (the typed name's, the deal's by its account): those customers, once each.
    assert.deepEqual(refusalLeads(customerForText('resinall', CUSTOMERS, ACCOUNTS), CUSTOMERS, ACCOUNTS), { customerIds: ['c_res', 'c_res_inc'], accountIds: [] });
    assert.deepEqual(refusalLeads(customerForDeal(CUSTOMERS, { accountId: 'acc_resinall' }, ACCOUNTS), CUSTOMERS, ACCOUNTS), { customerIds: ['c_res', 'c_res_inc'], accountIds: [] });
    // Two twin accounts and no customer of the name: the twins, and the customers that hold them.
    const unitsOwn = [{ id: 'c_unit', name: 'Port Allen unit', accountId: 'acc_unit' }];
    assert.deepEqual(refusalLeads(customerForText('Shell - Port Allen', unitsOwn, ACCOUNTS), unitsOwn, ACCOUNTS), { customerIds: ['c_unit'], accountIds: ['acc_unit', 'acc_site'] });
    // A merged-away name (its account merged into Resinall — a merged-away row): Resinall, and its customers.
    const gone = customerForText('Resinall, Inc.', CUSTOMERS.slice(0, 2), ACCOUNTS);
    assert.equal(gone.refusal, 'merged');
    assert.deepEqual(refusalLeads(gone, CUSTOMERS.slice(0, 3), ACCOUNTS), { customerIds: ['c_res'], accountIds: ['acc_resinall'] });
    assert.deepEqual(refusalLeads(gone, [], ACCOUNTS), { customerIds: [], accountIds: ['acc_resinall'] }, 'no customer of it: the account alone');
    assert.deepEqual(refusalLeads(gone, [], ACCOUNTS.filter((a) => a.id !== 'acc_resinall')), none, 'a survivor the list does not hold: nothing');
    // A survivor in Dispatch through a customer linked to no account, of its name: that customer leads (the sixth
    // review — by id alone it was in neither group, and the list never opened).
    const typedRes = [{ id: 'c_typed', name: 'RESINALL.', accountId: null, customerNumber: 'CUST-0009' }];
    assert.deepEqual(refusalLeads(gone, typedRes, ACCOUNTS), { customerIds: ['c_typed'], accountIds: ['acc_resinall'] },
        'REGRESSION: a survivor\'s unlinked customer of its name not led');
    assert.deepEqual(refusalLeads(gone, [{ id: 'c_elsewhere', name: 'Resinall', accountId: 'acc_lone' }], ACCOUNTS).customerIds, [],
        'a customer of its name linked to ANOTHER account stands for that one, never this');
    // The twins' too: a customer linked to no account, of a twin's name, stands for it.
    assert.deepEqual(refusalLeads({ refusal: 'many', of: 'account', matches: [ACCOUNTS[1], ACCOUNTS[2]] }, [{ id: 'c_spa', name: 'shell port allen', accountId: null }], ACCOUNTS).customerIds, ['c_spa']);
    // Two records merged away into one survivor: it leads once (the seventh review — the account row twice).
    const twiceGone = [{ id: 's', name: 'Res' }, { id: 'm1', name: 'Old Res', mergeArchived: true, mergedIntoId: 's' }, { id: 'm2', name: 'Old Res', mergeArchived: true, mergedIntoId: 's' }];
    const g2 = customerForText('Old Res', [], twiceGone);
    assert.deepEqual([g2.refusal, g2.matches.length], ['merged', 2]);
    assert.deepEqual(refusalLeads(g2, [], twiceGone), { customerIds: [], accountIds: ['s'] }, 'REGRESSION: a survivor led twice');
    // Anything else: nothing.
    assert.deepEqual(refusalLeads({ how: 'create' }, CUSTOMERS, ACCOUNTS), none);
    // A customer of no name (punctuation alone — Create allows it) stands for no account of no name (the ninth review).
    assert.deepEqual(refusalLeads({ refusal: 'many', of: 'account', matches: [{ id: 'a0', name: '—' }, { id: 'a1', name: '-' }] }, [{ id: 'c0', name: '-', accountId: null }], []).customerIds, [],
        'REGRESSION: a customer of no name led for accounts of no name');
    assert.deepEqual(refusalLeads(null, CUSTOMERS, ACCOUNTS), none);
});

// Jeff, 29 Oct ("No new customer"): a keystroke cleared a won deal's refusal of two customers, and New Job then offered
// Create — or the deal's own account — and made a third customer for the deal quote -> job refuses (the seventh review).
test('A won deal two customers stand for makes no new customer while New Job carries it — a keystroke clears its words, never that', () => {
    const d = read('src/Tabs/DispatchTab.jsx');
    // The placeholder's refusal belongs to its deal (placeholderOn); the hold, to a refusal that names customers.
    const defs = "const placeholderOn = (form) => !!form?.refusedDeal && form.refusedDeal === form.opportunityId;\n"
        + 'const dealHolds = (form) => placeholderOn(form) && !!form.customerRefusalLeads?.hold;\n';
    assert.ok(d.includes(defs), 'REGRESSION: no mark that outlasts a keystroke');
    const { placeholderOn, dealHolds } = new Function(`${defs}return { placeholderOn, dealHolds };`)();
    const HELD = { customerIds: ['c1', 'c2'], accountIds: [], hold: true };
    assert.equal(dealHolds({ refusedDeal: 'opp_1', opportunityId: 'opp_1', customerRefusalLeads: HELD }), true);
    assert.equal(dealHolds({ refusedDeal: 'opp_1', opportunityId: 'opp_2', customerRefusalLeads: HELD }), false, 'another deal picked: the job is not that deal\'s');
    assert.equal(placeholderOn({ refusedDeal: 'opp_1', opportunityId: 'opp_2' }), false, 'REGRESSION: the first deal\'s words over the next (the eighth review)');
    assert.equal(dealHolds({ refusedDeal: 'opp_1', opportunityId: '', customerRefusalLeads: HELD }), false, 'no deal');
    assert.equal(dealHolds({ refusedDeal: 'opp_1', opportunityId: 'opp_1', customerRefusalLeads: { ...HELD, hold: false } }), false, 'a refusal of twin accounts or a merged-away name: no hold');
    assert.equal(dealHolds({ refusedDeal: '', opportunityId: '' }), false);
    // An account picked, then the held deal picked again: the field says the deal's words, as Save refuses it (the
    // ninth review: it promised a customer).
    assert.ok(d.includes("                    {dealHold ? DEAL_NEEDS_PICK : 'CRM account — a linked dispatch customer will be created on save'}\n"),
        'REGRESSION: the field promises a customer Save refuses');
    // The starter marks the deal for any placeholder refusal; the hold is the leads'.
    assert.ok(d.includes("            refusedDeal:    row.customerRefusal ? (row.opportunityId || '') : '',\n"));
    // The field: the placeholder's words while its deal stands; the hold apart.
    assert.ok(d.includes("                                    placeholderRefusal={placeholderOn(newJobForm) ? newJobForm.customerRefusal : ''}\n                                    dealHold={dealHolds(newJobForm)}\n"));
    // Save, its refusals run as written: nothing picked and no customer typed in full — refused in the deal's words,
    // before a typed name's (the eighth review: those pointed at accounts the held list does not show).
    const s0 = d.indexOf('        let typed = null;\n        if (!newJobForm.customerId && !newJobForm.accountId) {\n');
    const s1 = d.indexOf('        if (typed?.refusal) { setNewJobError(typedCustomerRefusal(typed)); return; }\n', s0);
    assert.ok(s0 > 0 && s1 > s0, 'REGRESSION: Save makes a customer for a refused deal');
    const block = d.slice(s0, d.indexOf('\n', s1) + 1);
    const accounts = [{ id: 'acc_x', name: 'Acme Holdings' }, { id: 'tw1', name: 'Port Allen' }, { id: 'tw2', name: 'Port Allen' }];
    const customers = [{ id: 'c1', name: 'Acme North', accountId: 'acc_x' }, { id: 'c2', name: 'Acme South', accountId: 'acc_x' }];
    const save = (form) => {
        let said = null;
        const out = new Function('newJobForm', 'custName', 'customers', 'accounts', 'customerForText', 'typedCustomerRefusal', 'setNewJobError', 'placeholderOn', 'dealHolds', 'DEAL_NEEDS_PICK',
            `${block}return 'sent';`)({ customerId: '', accountId: '', customerRefusal: '', refusedDeal: 'opp_1', opportunityId: 'opp_1', customerRefusalLeads: HELD, ...form }, form.customer || '', customers, accounts,
            customerForText, typedCustomerRefusal, (m) => { said = m; }, placeholderOn, dealHolds, DEAL_NEEDS_PICK);
        return [out ?? 'refused', said];
    };
    assert.deepEqual(save({ customer: 'Acme' }), ['refused', DEAL_NEEDS_PICK], 'REGRESSION: the name typed over — Create made a third customer');
    assert.deepEqual(save({ customer: 'Brand New' }), ['refused', DEAL_NEEDS_PICK]);
    assert.deepEqual(save({ customer: 'Port Allen' }), ['refused', DEAL_NEEDS_PICK], 'REGRESSION: a typed name\'s words first — twin accounts the held list does not show');
    assert.deepEqual(save({ customer: 'Acme Holdings', accountId: 'acc_x' }), ['refused', DEAL_NEEDS_PICK], 'an account picked: it would make one');
    assert.deepEqual(save({ customer: 'Acme North', customerId: 'c1' }), ['sent', null], 'a customer picked');
    assert.deepEqual(save({ customer: 'acme south' }), ['sent', null], 'a customer typed in full: that customer');
    assert.deepEqual(save({ customer: 'Brand New', opportunityId: 'opp_2' }), ['sent', null], 'another deal: no hold');
    assert.deepEqual(save({ customer: 'Brand New', opportunityId: 'opp_2', customerRefusal: 'More than one…' }), ['sent', null], 'REGRESSION: the first deal\'s refusal refuses the next deal\'s Save');
    assert.deepEqual(save({ customer: 'Brand New', customerRefusal: 'More than one…' }), ['refused', 'More than one…'], 'the placeholder\'s own words while its deal stands');
    assert.deepEqual(save({ customer: 'Brand New', refusedDeal: '' }), ['sent', null], 'no refused deal: Create as ever');
    assert.deepEqual(save({ customer: 'Port Allen', refusedDeal: '' }), ['refused', 'More than one CRM account is named “Port Allen”. Pick the one you mean from the list — each row names its parent.'], 'no hold: the typed name\'s words');
    assert.equal(DEAL_NEEDS_PICK, 'More than one dispatch customer stands for this won deal, so no new customer is made for it. Pick one from the list.');
});

test('accountInDispatch: the server\'s words for a second customer on one account', () => {
    assert.equal(accountInDispatch({ name: 'Shell - Port Allen', customerNumber: 'CUST-0001' }),
        'That CRM account is already in Dispatch as “Shell - Port Allen” (CUST-0001) — add this site to it as a service location instead.');
});

// ── The account a deal stands on, and the header's count ──────────────────────

test('accountForDeal: by id (one merged away: its survivor); with none, the one live account of the name — never the first or the last of two', () => {
    assert.equal(accountForDeal({ accountId: 'acc_site', account: 'Shell - Port Allen' }, ACCOUNTS).id, 'acc_site');
    assert.equal(accountForDeal({ accountId: 'acc_resinall_inc' }, ACCOUNTS).id, 'acc_resinall');
    assert.equal(accountForDeal({ account: 'Shell - Port Allen' }, ACCOUNTS), null, 'twins: none');
    assert.equal(accountForDeal({ account: 'acme inc' }, ACCOUNTS).id, 'acc_acme');
    assert.equal(accountForDeal({ account: 'Resinall, Inc.' }, ACCOUNTS).id, 'acc_resinall', 'a name only a merged-away account has: its survivor');
    assert.equal(accountForDeal({ account: 'Nobody' }, ACCOUNTS), null);
    assert.equal(accountForDeal({ account: '' }, ACCOUNTS), null);
    assert.equal(accountForDeal(null, ACCOUNTS), null);
    // The old placeholder's find took the first of a name before the deal's own id.
    const oldFind = (o) => ACCOUNTS.find((a) => a.id === o.accountId || a.name === o.account);
    assert.equal(oldFind({ accountId: 'acc_site', account: 'Shell - Port Allen' }).id, 'acc_unit', 'the old line: the unit, for the site\'s deal');
});

test('openDealsByAccount: each open deal once — by its link, or by the one live account of its name; twins no longer both count an id-less deal', () => {
    const deals = [
        { id: 'd1', accountId: 'acc_unit', stage: 'Proposal' },
        { id: 'd2', accountId: 'acc_site', stage: 'Proposal' },
        { id: 'd3', account: 'Shell - Port Allen', stage: 'Qualify' },          // id-less, twins: no account
        { id: 'd4', accountId: 'acc_resinall_inc', stage: 'Proposal' },        // merged away: the survivor
        { id: 'd5', account: 'Acme Inc', stage: 'Proposal' },                 // id-less, one account
        { id: 'd6', accountId: 'acc_acme', stage: 'Closed Won' },
        { id: 'd7', accountId: 'acc_acme', stage: 'Closed Lost' },
    ];
    const m = openDealsByAccount(deals, ACCOUNTS);
    assert.deepEqual(Object.fromEntries(m), { acc_unit: 1, acc_site: 1, acc_resinall: 1, acc_acme: 1 });
    assert.equal(openDealsByAccount(undefined, ACCOUNTS).size, 0);
});

// ── The pins: every reader reads the rule ────────────────────────────────────

test('the readers: quote -> job, the placeholder, New Job\'s field and Save, the customer form, the server\'s create and edit, the header', () => {
    const q = read('netlify/functions/quote-to-job.mjs');
    assert.ok(q.includes("import { customerForDeal, dealCustomerRefusal } from '../../src/utils/dispatchCustomer.js';"));
    assert.ok(q.includes('        const found = customerForDeal(orgCustomers, opp, orgAccounts);\n        // The 409 names what it refuses over: the customers, or — a deal on no account whose name two live accounts\n        // have, or only accounts merged into others — those accounts.\n        if (found.refusal) {'), 'refused, nothing written, before the customer or the job');
    assert.ok(q.indexOf('const found = customerForDeal(orgCustomers, opp, orgAccounts);') < q.indexOf('await db.insert(dispatchCustomers)'));
    assert.ok(q.includes("        const orgAccounts = await db.select({ id: accounts.id, name: accounts.name, mergeArchived: accounts.mergeArchived,\n            mergedIntoId: accounts.mergedIntoId, parentAccountId: accounts.parentAccountId })\n            .from(accounts).where(eq(accounts.orgId, orgId));"), "the deal's account from THIS org's accounts, merge marks included, as the screen finds it");
    assert.ok(q.includes("[found.refusal === 'many' && found.of !== 'account' ? 'customers' : 'accounts']: named });"), 'the 409 names customers, or the accounts it refuses over');
    assert.ok(q.includes('        const linkTo = orgAccounts.some((a) => a.id === found.accountId && a.mergeArchived !== true) ? found.accountId : null;'),
        'REGRESSION: a deleted account\'s id stored on what quote -> job makes (the eighth review)');
    assert.equal(q.split('accountId: linkTo').length - 1, 3, 'a made customer links to the account the deal stands on, where the org still holds it live');
    assert.ok(q.includes('                accountId: linkTo || customer.accountId || null,'), 'and the job');
    assert.ok(!read('src/utils/invoices.js').includes('resolveCustomerForOpp'), 'the first-of-a-name rule is gone');

    const d = read('src/Tabs/DispatchTab.jsx');
    assert.ok(d.includes('            const account = accountForDeal(o, accounts);'));
    assert.ok(d.includes('            const found = customerForDeal(customers, o, accounts);'), "the server's call, on the screen's accounts");
    assert.ok(d.includes('                accountId:       found.accountId || cust?.accountId || null,'), "the deal's own account — by its link where the screen does not hold it");
    assert.ok(d.includes("                customerRefusal: found.refusal ? dealCustomerRefusal(found) : '',"));
    assert.ok(d.includes("            accountId:      row.customerRefusal ? '' : (row.accountId || ''),"), 'the placeholder two customers stand for carries no account');
    assert.ok(d.includes('        .filter(a => !holdAccounts && !acctLeadSet.has(a.id) && !isMergeArchived(a) && !linkedAccountIds.has(a.id)), query, byName);'), 'an account is in Dispatch by id — or by an unlinked customer of its name (run below)');
    assert.ok(!d.includes('linkedNames'), 'never by a customer\'s name');
    assert.ok(d.includes('    const typed = q ? customerForText(query, customers, accounts) : null;\n'));
    assert.ok(d.includes("            if (newJobForm.customerRefusal && placeholderOn(newJobForm)) { setNewJobError(newJobForm.customerRefusal); return; }\n            typed = customerForText(custName, customers, accounts);\n        }\n"));
    assert.ok(d.includes("            let customerId  = newJobForm.customerId || typed?.customer?.id || '';"), 'a customer typed in full is that customer');
    assert.ok(d.includes("            const custAccountId = newJobForm.accountId || typed?.customer?.accountId || typed?.account?.id || '';"), 'a live account typed in full saves linked to it');
    assert.ok(d.includes('            const custLabel = typed?.customer?.name || typed?.account?.name || custName;   // a record typed in full, under its own spelling'), 'under its own spelling');
    // The placeholder's refusal goes when a customer is picked, an account picked, Create pressed or the name typed over.
    assert.ok(d.includes("    const refusal = placeholderRefusal || (dealHold && typed?.how !== 'customer' ? DEAL_NEEDS_PICK : '');\n"),
        'the deal\'s words once the placeholder\'s are typed over (Jeff, 29 Oct: "No new customer") — but a customer typed in full reads as itself (the eighth review)');
    const refusalOf = new Function('placeholderRefusal', 'dealHold', 'typed', 'DEAL_NEEDS_PICK',
        "const refusal = placeholderRefusal || (dealHold && typed?.how !== 'customer' ? DEAL_NEEDS_PICK : '');\nreturn refusal;");
    assert.equal(refusalOf('', true, { how: 'create' }, DEAL_NEEDS_PICK), DEAL_NEEDS_PICK);
    assert.equal(refusalOf('', true, { how: 'customer', customer: {} }, DEAL_NEEDS_PICK), '', 'REGRESSION: a customer typed in full reads refused, though Save takes it');
    assert.equal(refusalOf('Placeholder words', true, null, DEAL_NEEDS_PICK), 'Placeholder words');
    assert.equal(refusalOf('', false, { how: 'create' }, DEAL_NEEDS_PICK), '');
    assert.ok(d.includes("onQueryChange={v => setNewJobForm(f => ({ ...f, customer: v, customerId: '', accountId: '', customerRefusal: '' }))}"));
    assert.ok(d.includes("onPick={c => setNewJobForm(f => ({ ...f, customer: c.name, customerId: c.id, accountId: c.accountId || '', customerRefusal: '' }))}"));
    assert.ok(d.includes("                                        accountId:  a.id,\n                                        customerRefusal: '',"));
    assert.ok(d.includes("onCreateIntent={() => setNewJobForm(f => ({ ...f, customerId: '', accountId: '', customerRefusal: '' }))} />"));
    // A template's Undo, or a switch, puts back its own fields alone — the made customer and location stay.
    assert.ok(d.includes("const TEMPLATE_FIELDS = ['crewSize', 'durationHrs', 'priority', 'minLicense', 'needSkills', 'equipCategories', 'requiredVehicleType'];"));
    assert.ok(d.includes('const base = appliedTemplate ? withoutTemplate(appliedTemplate.prevForm, newJobForm) : newJobForm;'));
    assert.ok(d.includes('setNewJobForm(f => withoutTemplate(appliedTemplate.prevForm, f)); setAppliedTemplate(null);'));
    assert.ok(d.includes('    const takenBy = new Map((customers || []).filter(c => c.accountId && c.id !== draft?.id).map(c => [c.accountId, c]));'), 'the customer being edited never takes its own account');
    assert.ok(d.includes('            if (address && newJobForm.madeLocation?.key === locKey) locationId = newJobForm.madeLocation.id;'), 'a retry reuses the location');
    assert.ok(d.includes("                    setNewJobForm(f => ({ ...f, customer: createdCust?.name || custLabel, customerId, accountId: createdCust?.accountId || custAccountId || '',"),
        'the made customer is the form\'s: a retry reuses it');
    assert.ok(d.includes('                if (stillOrg(askedOrg)) setNewJobForm(f => ({ ...f, madeLocation: { id: locationId, key: locKey } }));'), 'and the made location');
    assert.ok(d.includes('{unarchived(accounts).map(a => <option key={a.id} value={a.id} disabled={takenBy.has(a.id)}>{accountOptionLabel(a, accountsById, takenBy)}</option>)}'));

    // The rule's own lines a slice runs: a template's Undo and switch put back its seven fields alone.
    const tf = d.match(/^const TEMPLATE_FIELDS = (\[[^\n]*\]);$/m)?.[1];
    const wt = d.match(/^const withoutTemplate = (\(prevForm, form\) => [^\n]*);$/m)?.[1];
    assert.ok(tf && wt, 'TEMPLATE_FIELDS and withoutTemplate at module scope');
    const withoutTemplate = new Function('TEMPLATE_FIELDS', `return ${wt};`)(new Function(`return ${tf};`)());
    const before = { crewSize: 1, durationHrs: 2, priority: 'normal', minLicense: 'Journeyman', needSkills: [], equipCategories: [], requiredVehicleType: '', customer: '', customerId: '', title: '' };
    const now = { ...before, crewSize: 3, durationHrs: 6, needSkills: ['hvac'], customer: 'Acme', customerId: 'dcust_1', madeCustomerId: 'dcust_1', madeLocation: { id: 'dloc_1', key: 'k' }, title: 'Typed since' };
    assert.deepEqual(withoutTemplate(before, now), { ...now, crewSize: 1, durationHrs: 2, needSkills: [] }, "the template's fields back; the made customer, its location and the title typed since kept");
    // Both starters keep the form from BEFORE the template as its Undo's (it held the templated form: Undo undid nothing).
    assert.equal(d.split('                equip: (next.equipCategories || []).join(\', \'), prevForm: before };').length - 1, 2, 'the won deal and the plan visit');
    assert.ok(!d.includes('prevForm: form };'));
    // The retry's bookkeeping, as written.
    assert.ok(d.includes("            const locKey = [customerId, address, city, newJobForm.state.trim(), newJobForm.zip.trim()].join('\\n');"), 'reused only for the same customer and address');
    assert.ok(d.includes('                        isDefault: !!createdCust || (newJobForm.madeCustomerId === customerId && !newJobForm.madeLocation),'), 'the made customer\'s first location alone is its default');
    assert.ok(d.includes("                        customerRefusal: '', madeCustomerId: customerId }));"));
    assert.ok(d.includes("                    if (!stillOrg(askedOrg)) return undefined;\n                    const r = await dbFetch('/.netlify/functions/dispatch-customers', { method: 'POST'"),
        'an org switch stops the customer\'s send, the second after a refused account too');
    assert.ok(d.includes("                if (!stillOrg(askedOrg)) return;   // the next POST would carry the new org's token\n                if (!cans.ok)"),
        'an org switch after the customer\'s POST stops the rest of the Save');
    assert.ok(d.includes("                }, { id: newCustId, name: custLabel, accountId: custAccountId || null }, newJobForm.opportunityCopied ? ['accountId'] : []);"), "a won deal's copied account left off when deleted since (a 404 alone)");
    assert.ok(d.includes('                accountId:       createdCust ? (createdCust.accountId || null) : (custAccountId || null),'), "the job on the made customer's account as the server kept it");
    // New Job stays open while its Save runs; no Create under the placeholder's refusal.
    assert.ok(d.includes('    const closeNewJob = () => { if (!newJobSaving) setShowNewJobForm(false); };'));
    assert.equal(d.split('onClick={closeNewJob}').length - 1, 3, 'the backdrop, the × and Cancel');
    assert.ok(!d.includes('onClick={() => setShowNewJobForm(false)}'));
    assert.ok(d.includes("    const showCreate = !refusal && typed?.how === 'create';"));
    // What each row and option says.
    assert.ok(d.includes("    ? `Saves as the dispatch customer “${r.customer.name}”${r.customer.customerNumber ? ` (${r.customer.customerNumber})` : ''}`"));
    assert.ok(d.includes("        ? `Saves as the CRM account “${r.account.name}” — a linked dispatch customer will be created`"));
    assert.ok(d.includes("        : 'New customer — will be created on save';"));
    assert.ok(d.includes("<span style={{ marginLeft: 8, fontSize: 11, color: T.inkMuted }}>{`${acct.name}${parentNote(acct, byId)}`}</span>"), "a customer row's account and its parent");
    assert.ok(d.includes('<span style={{ fontSize: 11, color: T.inkMuted }}>{parentNote(a, byId)}</span>'), "an account row's parent");
    assert.ok(d.includes("    return `${a.name}${parentNote(a, byId)}${other ? ` — in Dispatch as ${other.customerNumber || other.name}` : ''}`;"), "an option's parent and the customer that holds it");

    const s = read('netlify/functions/dispatch-customers.mjs');
    assert.equal(s.split('if (other) return takenReply(other);').length - 1, 2, 'the create and the edit');
    assert.ok(s.includes("const takenReply = (other) => ({ statusCode: 409, headers, body: JSON.stringify({ error: accountInDispatch(other), field: 'accountId' }) });"), 'refused: 409, naming the customer, on the account field');
    assert.ok(s.includes('.where(and(eq(dispatchCustomers.orgId, orgId), eq(dispatchCustomers.accountId, accountId), ne(dispatchCustomers.id, selfId)))'),
        "another customer of THIS org — never the customer being saved");
    assert.ok(s.includes('            if (data.accountId && data.accountId !== priorCust?.accountId) {'), 'the create: an account named anew');
    assert.ok(s.includes('                if (data.accountId && data.accountId !== held.accountId) {'), 'the edit: an account named anew');

    const h = read('src/components/layout/AppHeader.jsx');
    assert.ok(h.includes('    const openDealsOf = React.useMemo(() => openDealsByAccount(opportunities, accounts), [opportunities, accounts]);'));
    assert.ok(h.includes("const od = openDealsOf.get(a.id) || 0; const sub = [parentLabel(a, accountsById.get(a.parentAccountId)), a.accountOwner, od > 0 ? `${od} open deal${od>1?'s':''}` : ''].filter(Boolean).join(' · ');"));
});
