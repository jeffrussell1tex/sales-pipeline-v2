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
