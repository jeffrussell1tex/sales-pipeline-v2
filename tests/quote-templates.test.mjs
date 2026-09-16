// tests/quote-templates.test.mjs
//
// The Start-quote picker shows only templates that can start a quote (state
// §0.142; Jeff: "It looks to me like all the templates are fake place holders
// … remove the fake ones and just add a place holder … and have that go away
// if actual templates are available"). Before: four hard-coded cards with
// invented win rates, and the parent ignored the pick — every card made the
// same blank quote. The pure helper is RUN here; the tab is a source scan
// (§18b23).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { usableQuoteTemplates, templateLineItems, NO_TEMPLATES_NOTE } from '../src/utils/quoteTemplates.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const code = (src) => src.split(/\r?\n/).filter(l => !l.trim().startsWith('//')).join('\n');

const products = [
    { id: 'p1', name: 'SchedulePro Enterprise Edition', category: 'platform', productType: 'recurring', listPrice: 12000, unit: 'year' },
    { id: 'p2', name: 'Shiftboard Enterprise', category: 'modules', type: 'one_time', price: 300, unit: 'flat' },
    { id: 'p3', name: 'Onboarding', category: 'services', customPrice: true },
];

test('usableQuoteTemplates: only a saved template with product ids that resolve in the catalog can start a quote; the library’s illustrative defaults never qualify', () => {
    assert.deepEqual(usableQuoteTemplates(undefined, products), []);
    assert.deepEqual(usableQuoteTemplates([], products), []);
    // the Settings panel's defaults: a name, a description, invented usage — no products
    const defaults = [
        { id: 'tpl1', name: 'SMB Starter — Annual', desc: 'Core + Pipeline…', usedTimes: 47, lastUsed: '3 days ago', avgWinRate: 0.48, createdByName: 'Bea Chen' },
        { id: 'tpl2', name: 'Growth Package', desc: '…', usedTimes: 28, avgWinRate: 0.44 },
    ];
    assert.deepEqual(usableQuoteTemplates(defaults, products), [], 'metadata-only templates are not offered');
    const real = usableQuoteTemplates([
        { id: 'tplA', name: 'Enterprise bundle', desc: 'Platform + module', productIds: ['p1', 'p2', 'p2', 'gone', 7] },
        { id: 'tplB', name: 'Nothing resolves', productIds: ['gone'] },
        { id: 'tplC', name: '', productIds: ['p1'] },
        { id: 'tplD', name: 'Services only', productIds: ['p3'] },
        null, 'x',
    ], products);
    assert.deepEqual(real, [
        { id: 'tplA', name: 'Enterprise bundle', desc: 'Platform + module', productIds: ['p1', 'p2'], products: [{ id: 'p1', name: 'SchedulePro Enterprise Edition' }, { id: 'p2', name: 'Shiftboard Enterprise' }] },
        { id: 'tplD', name: 'Services only', desc: '', productIds: ['p3'], products: [{ id: 'p3', name: 'Onboarding' }] },
    ], 'unknown ids dropped, duplicates collapsed, a template with nothing left or no name not offered');
    assert.deepEqual(usableQuoteTemplates(real, []), [], 'no catalog, no template');
});

test('templateLineItems: the configurator’s own line-item shape, one per resolved product, quantity 1, no discount, a custom price left blank', () => {
    const items = templateLineItems({ productIds: ['p1', 'p3', 'gone', 'p2'] }, products, 1000);
    assert.deepEqual(items, [
        { _key: 1000, productId: 'p1', productName: 'SchedulePro Enterprise Edition', productType: 'recurring', unit: 'year', listPrice: 12000, quantity: 1, discountPct: 0, customPrice: false },
        { _key: 1001, productId: 'p3', productName: 'Onboarding', productType: '', unit: 'flat', listPrice: '', quantity: 1, discountPct: 0, customPrice: true },
        { _key: 1002, productId: 'p2', productName: 'Shiftboard Enterprise', productType: 'one-time', unit: 'flat', listPrice: 300, quantity: 1, discountPct: 0, customPrice: false },
    ]);
    assert.deepEqual(templateLineItems(null, products), []);
    assert.deepEqual(templateLineItems({ productIds: ['p1'] }, undefined), []);
    assert.match(NO_TEMPLATES_NOTE, /Settings → Quoting → Quote templates/);
});

test('QuotesTab: money is set in the app’s face — no dollar amount in monospace; quote numbers and SKUs may stay monospace (Jeff, 15 Sep: "make the dollar amounts be the same font as the text in the rest of the app")', () => {
    const lines = read('src/Tabs/QuotesTab.jsx').split(/\r?\n/);
    // A line renders money when it prints a formatted amount or a totals row's
    // value. Its style is on that line or the one above it (the Catalog's list
    // price is a two-line element) — the harness proved a one-line read blind.
    const money = lines.map((l, i) => [i + 1, (lines[i - 1] || '') + '\n' + l]).filter(([, ctx]) => /\{fmtFull\(|\{fmt\(|\{r\.v\}|\{r\.value\}|toLocaleString\(\)\}/.test(ctx.split('\n')[1]));
    assert.ok(money.length >= 7, `expected the seven money sites, found ${money.length}`);
    for (const [n, ctx] of money) assert.ok(!/monospace/.test(ctx), `QuotesTab.jsx:${n} sets money in monospace: ${ctx.trim().slice(0, 160)}`);
    // Nineteen lines print money (stat-card literals and the print template
    // among them, which carry no style of their own); the six the batch moved
    // off monospace name the face explicitly.
    assert.ok(money.filter(([, ctx]) => ctx.includes('fontFamily: T.sans')).length >= 6, 'the six moved money sites name the app face explicitly');
    assert.ok(lines.some(l => l.includes('{quote.quoteNumber}') && l.includes('monospace')), 'an identifier (the quote number) keeps the monospace face');
});

test('PriceBookDetail: money in the app’s face too — every fmt$ and every $ sign free of monospace; SKUs and units keep it (Jeff, 16 Sep: "change it in price book")', () => {
    const lines = read('src/Tabs/settings/quoting/PriceBookDetail.jsx').split(/\r?\n/);
    const money = lines.map((l, i) => [i + 1, (lines[i - 1] || '') + '\n' + l]).filter(([, ctx]) => /fmt\$\(|>\$<\/span>/.test(ctx.split('\n')[1]));
    assert.ok(money.length >= 7, `expected the seven money sites, found ${money.length}`);
    for (const [n, ctx] of money) assert.ok(!/monospace/.test(ctx), `PriceBookDetail.jsx:${n} sets money in monospace: ${ctx.trim().slice(0, 160)}`);
    assert.ok(lines.some(l => l.includes('{product.sku}') && l.includes('monospace')), 'the SKU keeps the monospace face');
    assert.ok(lines.some(l => l.includes('{product.unit}') && l.includes('monospace')), 'the unit keeps the monospace face');
});

test('QuotesTab: the builder’s notes reach the customer on every surface — the preview, the print fallback (escaped), and the PDF function already had them; Edit in builder is a sand bar (Jeff, 16 Sep)', () => {
    const s = read('src/Tabs/QuotesTab.jsx');
    assert.ok(s.includes("{quote.notes?.trim() && (") && s.includes(">{quote.notes.trim()}</div>"), 'the customer preview prints the notes');
    assert.ok(s.includes("import { esc } from '../utils/customerNotifications';"), 'the print fallback escapes what it interpolates');
    assert.ok(s.includes("${activeQuote.notes?.trim() ? `<h3") && s.includes("${esc(activeQuote.notes.trim())}</p>` : ''}"), 'the print fallback carries the notes, escaped');
    assert.ok(s.includes("${activeQuote.paymentTerms ? `<p>Payment terms: ${esc(activeQuote.paymentTerms)}</p>` : ''}"), 'and the payment terms');
    const pdf = read('netlify/functions/quote-pdf.mjs');
    assert.ok(pdf.includes("const notesText = (quote.notes && quote.notes.trim()) ? quote.notes"), 'the PDF function renders the quote’s notes');
    assert.ok(s.includes("<button onClick={onEdit} style={{ marginTop: 10, width: '100%', background: T.gold, border: `1px solid ${T.goldInk}`"), 'Edit in builder is the sand bar, not a hairline');
});

test('QuotesTab: the picker lists the org’s usable templates or ONE placeholder, never the four invented cards; the pick seeds the quote', () => {
    const s = code(read('src/Tabs/QuotesTab.jsx'));
    assert.ok(s.includes("import { usableQuoteTemplates, templateLineItems, NO_TEMPLATES_NOTE } from '../utils/quoteTemplates';"));
    for (const fake of ["'SMB Starter'", "'Growth Package'", "'Trial → Paid'", 'winRate: 0.', 'avg win rate']) assert.ok(!s.includes(fake), `the invented card ${fake} is gone`);
    assert.ok(s.includes('const TemplatePickerModal = ({ opp, templates, onPick, onClose }) => {'), 'the picker is handed the usable templates — it invents none');
    assert.ok(s.includes('{templates.length === 0 && (') && s.includes('{NO_TEMPLATES_NOTE}'), 'no usable template: the one placeholder, in words');
    assert.ok(s.includes("templates={usableQuoteTemplates(settings?.quoteTemplates, products)}"), 'the org’s saved library, filtered to what can start a quote');
    assert.ok(s.includes("onPick={(pick) => { setTplOpp(null); handleNewQuoteForOpp(tplOpp.id, pick === 'blank' ? null : pick); }}"), 'the pick is honoured');
    assert.ok(s.includes('const handleNewQuoteForOpp = async (oppId, template = null) => {') && s.includes('lineItems: template ? templateLineItems(template, products) : [],'), 'a picked template seeds the line items; scratch is blank');
});
