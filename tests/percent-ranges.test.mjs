// tests/percent-ranges.test.mjs — a percent a request names anew is none or a number 0-100, else refused naming the
// field and nothing written (state §0.242, guide §18b125 rule 3; docs/design/save-cleanup Part 3 — Jeff, 10 Nov:
// "Refuse it"). The value the row already holds is never asked again (§0.204). RUN for the one rule
// (src/utils/quoteTotals.js: cleanDealDiscount, percentRefused, lineDiscountRefusal); the endpoints import
// db/index.js and cannot load under `npm test` (§18b23), so where each refusal sits — before the totals, the deal's
// sync and any write — is pinned by scan. The whole path against the test database:
// tests/integration/save-cleanup.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanDealDiscount, percentRefused, samePercent, lineDiscountRefusal, cleanTaxRate, defaultTaxRateOf, heldDealDiscount } from '../src/utils/quoteTotals.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, b); return s.slice(i, j); };
const order = (s, ...needles) => {
    let at = -1;
    for (const n of needles) { const i = s.indexOf(n, at + 1); assert.ok(i > at, `in order: ${n}`); at = i; }
};

// ── the rule, RUN ────────────────────────────────────────────────────────────

test('cleanDealDiscount: a number 0-100 to two places; none (null, blank, left out) is 0; anything else is refused (null)', () => {
    for (const bad of [-1, 100.001, 'abc', true, false, [], [5], {}, 1e999, -1e999, NaN, '8,25', '  ']) {
        assert.equal(cleanDealDiscount(bad), null, `refused: ${String(bad)}`);
    }
    for (const none of ['', null, undefined]) assert.equal(cleanDealDiscount(none), 0, `none is 0: ${JSON.stringify(none)}`);
    assert.equal(cleanDealDiscount(12.345), 12.35, 'two places, half up');
    assert.equal(cleanDealDiscount('12.5'), 12.5);
    assert.equal(cleanDealDiscount(0), 0);
    assert.equal(cleanDealDiscount(100), 100, 'the top of the range stands');
    assert.equal(cleanDealDiscount('0.00'), 0, 'the stored shape');
});

test('percentRefused: none or 0-100 stands; out of range or not a number is refused — unless it is the value the row holds', () => {
    for (const ok of [null, undefined, '', 0, 100, '8.25', 99.99]) assert.equal(percentRefused(ok, null), false, `stands: ${JSON.stringify(ok)}`);
    for (const bad of [-50, 150, 100.01, 'abc', true, [], {}]) assert.equal(percentRefused(bad, null), true, `refused: ${JSON.stringify(bad)}`);
    // Never asked again (§0.204): the stored value named again stands, by meaning — the database answers "-50.00".
    assert.equal(percentRefused(-50, '-50.00'), false, 'the stored -50 re-sent stands');
    assert.equal(percentRefused('150', '150.00'), false);
    assert.equal(percentRefused(-50, '-40.00'), true, 'a different out-of-range value is asked');
    assert.equal(percentRefused(true, '1.00'), true, 'a boolean is never the stored number (Number(true) is 1)');
    assert.equal(percentRefused([], '0.00'), true, 'a list is never the stored 0 (Number([]) is 0)');
    assert.equal(samePercent('12.50', 12.5), true);
    assert.equal(samePercent(null, null), false, 'none is not compared — it stands on its own');
    // A held value that is no number (stored before §0.242) re-sent as it stands is the row's own (the review, 10 Nov).
    assert.equal(percentRefused('8,25', '8,25'), false, 'REGRESSION: a held non-number asked again');
    assert.equal(percentRefused('abc', 'abc'), false);
    assert.equal(percentRefused('8,26', '8,25'), true, 'a different text is asked');
    assert.equal(percentRefused({}, '[object Object]'), true, 'an object is never the stored text');
    // The rule is cleanTaxRate's range: the refusal and the clean never disagree on a value named anew.
    for (const v of [-1, 0, 50, 100, 101, 'x', '7']) assert.equal(percentRefused(v, null), cleanTaxRate(v) == null, String(v));
});

test('lineDiscountRefusal: names the first line out of range, counted from 1; a line the stored lines hold is never asked again', () => {
    const line = (productId, discountPct) => ({ productId, listPrice: 100, quantity: 1, discountPct });
    assert.equal(lineDiscountRefusal([line('p1', 10), line('p2', 150)]), 'Line 2: discount must be a number from 0 to 100.');
    assert.equal(lineDiscountRefusal([line('p1', -5)]), 'Line 1: discount must be a number from 0 to 100.');
    assert.equal(lineDiscountRefusal([line('p1', 'abc')]), 'Line 1: discount must be a number from 0 to 100.');
    assert.equal(lineDiscountRefusal([line('p1', 0), line('p2', 100), line('p3', ''), line('p4', null), { productId: 'p5' }]), null, 'none or 0-100');
    // Held: the same product at the same discount, by meaning — a quote re-sent as stored stands.
    assert.equal(lineDiscountRefusal([line('p1', 150)], [line('p1', '150')]), null, 'the stored line re-sent');
    assert.equal(lineDiscountRefusal([line('p1', 150)], [line('p2', 150)]), 'Line 1: discount must be a number from 0 to 100.', 'another product\'s discount is not this line\'s');
    assert.equal(lineDiscountRefusal([line('p1', 160)], [line('p1', 150)]), 'Line 1: discount must be a number from 0 to 100.', 'a new value is asked');
    // Not a list of lines: linesMalformed's to refuse, never this one's.
    for (const v of [null, undefined, '', 'x', {}]) assert.equal(lineDiscountRefusal(v), null);
    assert.equal(lineDiscountRefusal([null, 5, line('p1', 5)]), null);
});

test('the readers keep their clamps (Q3: no new clamps, none taken away)', () => {
    assert.equal(defaultTaxRateOf({ taxRate: 150 }), 100, 'the default reader clamps a stored 150');
    assert.equal(defaultTaxRateOf({ taxRate: -3 }), 0);
});

// A new version's copied deal discount (state §0.244): "§0.242 review: a new version's copied deal discount asked as
// new" survived the scoped run of 11 Nov — the rule sat in quotes.mjs, which `npm test` cannot load. It is
// heldDealDiscount's now, RUN here; where it is read is pinned by the scan below.
test('heldDealDiscount: the value a source version holds is held, never asked again; a value named anew is asked', () => {
    const versions = [{ dealDiscount: '150' }, { dealDiscount: '10' }];
    assert.equal(heldDealDiscount('150', versions), '150', 'the source\'s out-of-range value, held');
    assert.equal(percentRefused('150', heldDealDiscount('150', versions)), false, 'so the copy is not refused');
    assert.equal(heldDealDiscount(150, versions), '150', 'the same percent as a number');
    assert.equal(heldDealDiscount('10.00', versions), '10', 'the same percent, written apart');
    assert.equal(heldDealDiscount('200', versions), null, 'a value no version holds is not held');
    assert.equal(percentRefused('200', heldDealDiscount('200', versions)), true, 'so it is asked, and refused');
    assert.equal(heldDealDiscount('150', []), null, 'a first version holds nothing');
    assert.equal(heldDealDiscount('150', undefined), null);
    assert.equal(heldDealDiscount('150', [null, 'x', { dealDiscount: '150' }]), '150', 'a row that is not a quote is passed over');
});

// ── where each refusal sits, by scan ─────────────────────────────────────────

test('quotes.mjs: the deal discount and each line\'s discount are refused, naming the field, before the totals, the deal\'s sync and any write', () => {
    const s = code(read('netlify/functions/quotes.mjs'));
    assert.ok(s.includes("const dealDiscountRefused = (data, stored) => 'dealDiscount' in data && percentRefused(data.dealDiscount, stored);"));
    const DEAL = "return { statusCode: 400, headers, body: JSON.stringify({ error: DEAL_DISCOUNT_REFUSED, field: 'dealDiscount' }) };";
    const LINE = "if (lineDiscount) return { statusCode: 400, headers, body: JSON.stringify({ error: lineDiscount, field: 'lineItems' }) };";
    const post = between(s, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    order(post,
        "if (linesMalformed(data)) return",
        'const heldDeal = heldDealDiscount(data.dealDiscount, versions);',
        'const lineDiscount = lineDiscountRefusal(data.lineItems, heldLines);',
        LINE,
        'if (dealDiscountRefused(data, heldDeal)) ' + DEAL,
        'const dealDiscount = cleanDealDiscount(data.dealDiscount) ?? heldDeal;',
        'const totals = calcTotals(lineItems, dealDiscount, taxRate, taxExempt);',
        'dealDiscount: String(dealDiscount),',
        'db.insert(quotes)');
    assert.ok(!post.includes('data.dealDiscount ||'), 'REGRESSION: the body\'s deal discount taken unchecked');
    const put = between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    order(put,
        'if (!existing) return refuse(404, NOT_FOUND);',
        "const lineDiscount = 'lineItems' in data ? lineDiscountRefusal(data.lineItems, existing.lineItems) : null;",
        LINE,
        'if (dealDiscountRefused(data, existing.dealDiscount)) ' + DEAL,
        '...existing, ...sanitize(data),',
        "merged.dealDiscount = 'dealDiscount' in data ? (cleanDealDiscount(data.dealDiscount) ?? existing.dealDiscount) : (existing.dealDiscount ?? 0);",
        'const totals = calcTotals(lineItems, merged.dealDiscount ?? 0, merged.taxRate, merged.taxExempt);',
        'const termsChanged = quoteTermsChanged(existing, merged);',
        'await syncToOpportunity(orgId, existing.opportunityId, totals.totalValue);',
        'dealDiscount: String(merged.dealDiscount ?? 0),',
        'db.update(quotes).set(payload)');
    assert.ok(!put.includes('merged.dealDiscount ||'), 'REGRESSION: a refused discount read as 0 and written');
});

test('settings.mjs: a default tax rate named out of range is refused naming quoteDefaults — after the stale check, before the write; the stored rate never asked again', () => {
    const s = code(read('netlify/functions/settings.mjs'));
    assert.ok(s.includes("import { percentRefused } from '../../src/utils/quoteTotals.js';"));
    assert.ok(s.includes("const quoteDefaultRateRefused = (data, existingExtra) => 'quoteDefaults' in data && !!data.quoteDefaults && typeof data.quoteDefaults === 'object'\n    && percentRefused(data.quoteDefaults.taxRate, existingExtra?.quoteDefaults?.taxRate);"));
    const put = between(s, "if (event.httpMethod === 'PUT') {", 'const upsert = db.insert(settings)');
    order(put,
        "if (stale.length) return { statusCode: 409,",
        "if (quoteDefaultRateRefused(data, existingExtra)) return { statusCode: 400, headers, body: JSON.stringify({ error: QUOTE_DEFAULT_RATE_REFUSED, field: 'quoteDefaults' }) };",
        "quoteDefaults:        'quoteDefaults'        in data ?");
});

test('dispatch-service-plans.mjs: a discount named out of range is refused naming discountPercent before the create\'s upsert and the update; blank is none', () => {
    const s = code(read('netlify/functions/dispatch-service-plans.mjs'));
    const REFUSED = "return { statusCode: 400, headers, body: JSON.stringify({ error: DISCOUNT_REFUSED, field: 'discountPercent' }) };";
    const post = between(s, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {");
    order(post,
        'discountPercent: dispatchServicePlans.discountPercent,',
        'if (percentRefused(data.discountPercent, prior?.discountPercent)) ' + REFUSED,
        "discountPercent: data.discountPercent === '' ? null : data.discountPercent ?? null,",
        'await db.insert(dispatchServicePlans)');
    const put = between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {");
    order(put,
        "if (!current) return { statusCode: 404,",
        "if ('discountPercent' in data && percentRefused(data.discountPercent, current.discountPercent)) " + REFUSED,
        "if (updates.discountPercent === '') updates.discountPercent = null;",
        'await db.update(dispatchServicePlans).set(updates)');
});
