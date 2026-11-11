// tests/quote-tax-screens.test.mjs — sales tax on quotes, batch A's screens (state §0.241; docs/design/sales-tax R1,
// R2, R3, R4, R6; Jeff's answers 10 Nov: Q2 per product, per line; Q3 the quote's "Tax exempt" switch; Q5 an org
// default rate changeable per quote). The pure helpers are RUN (src/utils/quoteMoneyRows.js — the totals block's rows,
// a card's tax words, the typed rate); the tab's calcLineTotals is lifted out of QuotesTab.jsx and RUN against a
// verbatim copy of the one it replaced (no deal discount, no tax: the same money); what the screens send is RUN
// through the edit lock (an older quote saved from the builder never reads as changed); the wiring is pinned by scan
// (§18b23 — the components need React and a DOM). The server: tests/sales-tax.test.mjs and
// tests/integration/sales-tax.itest.mjs; the arithmetic: tests/quote-totals.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quoteTotals } from '../src/utils/quoteTotals.js';
import { quoteMoneyRows, quoteTaxNote, taxRateFromInput, taxRateInputOf, productTaxable, TAX_RATE_REFUSAL } from '../src/utils/quoteMoneyRows.js';
import { quoteTermsChanged, quoteEditOutcome } from '../src/utils/quoteRules.js';
import { productForm, productChanges } from '../src/utils/productChanges.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, b); return s.slice(i, j); };
const count = (s, needle) => s.split(needle).length - 1;
const order = (s, ...needles) => {
    let at = -1;
    for (const n of needles) { const i = s.indexOf(n, at + 1); assert.ok(i > at, `in order: ${n}`); at = i; }
};

const TAB = 'src/Tabs/QuotesTab.jsx';
const DEFAULTS = 'src/Tabs/settings/quoting/QuoteTemplatesDetail.jsx';

// ── the totals block's rows, RUN ─────────────────────────────────────────────

test('the totals block: Subtotal, the deal discount where set, Tax (rate%) or "Tax exempt", Total — to the cent, adding up', () => {
    const lineItems = [{ productId: 'a', listPrice: 600, quantity: 1 }, { productId: 'b', listPrice: 400, quantity: 1, taxable: false }];
    const t = quoteTotals({ lineItems, dealDiscount: '10.00', taxRate: '8.25' });
    assert.deepEqual(quoteMoneyRows(t, '10.00'), [
        { key: 'subtotal', label: 'Subtotal', value: '$1,000.00' },
        { key: 'deal', label: 'Deal discount (10%)', value: '-$100.00' },
        { key: 'tax', label: 'Tax (8.25%)', value: '$44.55' },          // 8.25% of the taxable 600 less 10%
        { key: 'total', label: 'Total', value: '$944.55', total: true },
    ]);
    // Exempt: said, nothing taxed, the Total the pre-tax one.
    const ex = quoteTotals({ lineItems, taxRate: 8.25, taxExempt: true });
    assert.deepEqual(quoteMoneyRows(ex, 0).map((r) => [r.label, r.value]), [['Subtotal', '$1,000.00'], ['Tax exempt', '$0.00'], ['Total', '$1,000.00']]);
    // A rate of 0 is a rate: said as one.
    assert.deepEqual(quoteMoneyRows(quoteTotals({ lineItems, taxRate: '0.00' }), null).map((r) => r.label), ['Subtotal', 'Tax (0%)', 'Total']);
    // Cents, never whole dollars, in the block.
    assert.equal(quoteMoneyRows(quoteTotals({ lineItems: [{ listPrice: 19.99, quantity: 3 }], taxRate: 7.5 }), 0).at(-1).value, '$64.47');
});

test('a quote written before tax (no rate, not exempt) shows no tax row, no deal discount row at 0, and its Total is its stored total', () => {
    const lineItems = [{ productId: 'a', listPrice: 1250, quantity: 2, discountPct: 10 }];
    for (const taxRate of [null, undefined]) {
        for (const taxExempt of [null, false, undefined]) {
            const t = quoteTotals({ lineItems, dealDiscount: '0.00', taxRate, taxExempt });
            const rows = quoteMoneyRows(t, '0.00');
            assert.deepEqual(rows.map((r) => r.key), ['subtotal', 'total'], `rate ${taxRate}, exempt ${taxExempt}`);
            assert.equal(rows[1].value, '$2,250.00');
            assert.equal(t.grandTotal, t.totalValue, 'no tax: the Total is the pre-tax total');
            assert.equal(quoteTaxNote(t), null, 'and a card says nothing of tax');
        }
    }
    assert.deepEqual(quoteMoneyRows(quoteTotals({ lineItems, dealDiscount: 5 }), 5).map((r) => r.key), ['subtotal', 'deal', 'total']);
});

test("a card's words of the tax beside its pre-tax value: none, \"Tax exempt\", or the amount at the rate", () => {
    const lineItems = [{ listPrice: 1000, quantity: 1 }];
    assert.equal(quoteTaxNote(quoteTotals({ lineItems })), null);
    assert.equal(quoteTaxNote(quoteTotals({ lineItems, taxRate: 8.25 })), '+ $82.50 tax (8.25%)');
    assert.equal(quoteTaxNote(quoteTotals({ lineItems, taxRate: 8.25, taxExempt: true })), 'Tax exempt');
    assert.equal(quoteTaxNote(quoteTotals({ lineItems, taxExempt: true })), 'Tax exempt', 'exempt with no rate is still said');
    assert.equal(quoteTaxNote(null), null);
});

test('the typed rate (the builder and Settings → Quotes, one rule): blank is none, 0-100 kept to two places, anything else refused in words', () => {
    assert.deepEqual(taxRateFromInput(''), { rate: null });
    assert.deepEqual(taxRateFromInput('   '), { rate: null });
    assert.deepEqual(taxRateFromInput(undefined), { rate: null });
    assert.deepEqual(taxRateFromInput('8.25'), { rate: 8.25 });
    assert.deepEqual(taxRateFromInput(' 8.25 '), { rate: 8.25 });
    assert.deepEqual(taxRateFromInput('6.55'), { rate: 6.55 });
    // A third decimal place is refused, never rounded without a word (the review, 10 Nov — the words say two places).
    assert.deepEqual(taxRateFromInput('6.555'), { error: TAX_RATE_REFUSAL }, 'REGRESSION: a third place rounded without a word');
    assert.deepEqual(taxRateFromInput('8.875'), { error: TAX_RATE_REFUSAL });
    assert.deepEqual(taxRateFromInput('.125'), { error: TAX_RATE_REFUSAL });
    assert.deepEqual(taxRateFromInput('0'), { rate: 0 });
    assert.deepEqual(taxRateFromInput('100'), { rate: 100 });
    assert.deepEqual(taxRateFromInput('.5'), { rate: 0.5 });
    assert.deepEqual(taxRateFromInput(7), { rate: 7 });
    for (const bad of ['100.01', '150', '-1', 'abc', '8,25', '1e1', '8.25%', 'Infinity', '0x10', '8.']) {
        assert.deepEqual(taxRateFromInput(bad), { error: TAX_RATE_REFUSAL }, `refused: ${bad}`);
    }
    assert.match(TAX_RATE_REFUSAL, /0 to 100/);
    // The stored rate in the input's words.
    assert.equal(taxRateInputOf(null), '');
    assert.equal(taxRateInputOf(undefined), '');
    assert.equal(taxRateInputOf(''), '');
    assert.equal(taxRateInputOf('8.25'), '8.25', 'the database answers "8.25"');
    assert.equal(taxRateInputOf('8.00'), '8');
    assert.equal(taxRateInputOf(0), '0');
    assert.equal(taxRateInputOf('abc'), '');
});

test("a new line's Taxable is its product's: none (a product saved before tax) is taxable, only false is not (Q2)", () => {
    assert.equal(productTaxable({}), true);
    assert.equal(productTaxable({ taxable: null }), true);
    assert.equal(productTaxable({ taxable: true }), true);
    assert.equal(productTaxable({ taxable: false }), false);
    assert.equal(productTaxable(null), true);
});

// ── what the builder sends, through the edit lock, RUN ───────────────────────

// The builder's payload as its save builds it (LineItemEditor handleSave): the quote, its lines, the rate as typed
// from the stored one, the switch as set from the stored one.
const builderPayload = (stored) => {
    const typed = taxRateFromInput(taxRateInputOf(stored.taxRate));
    return { ...stored, lineItems: stored.lineItems.map((li) => ({ ...li })), taxRate: typed.rate, taxExempt: stored.taxExempt === true };
};

test('a quote saved from the builder unchanged never reads as changed — an older one (no rate, no switch, no line flags) stays Approved; a taxed one too', () => {
    const older = { status: 'Approved', lineItems: [{ productId: 'p1', quantity: '2', listPrice: 100, discountPct: 0 }], dealDiscount: '0.00', taxRate: null, taxExempt: null, notes: null, paymentTerms: 'Net 30' };
    assert.equal(quoteTermsChanged(older, builderPayload(older)), false);
    assert.equal(quoteEditOutcome({ status: 'Approved', termsChanged: quoteTermsChanged(older, builderPayload(older)) }).status, 'Approved');
    const taxed = { ...older, taxRate: '8.25', taxExempt: false, lineItems: [{ productId: 'p1', quantity: 1, listPrice: '100.00', discountPct: 0, taxable: false }] };
    assert.equal(quoteTermsChanged(taxed, builderPayload(taxed)), false, 'the database\'s "8.25" through the input and back');
    assert.equal(quoteTermsChanged({ ...taxed, taxRate: '8.00' }, builderPayload({ ...taxed, taxRate: '8.00' })), false, '"8.00" shown as 8');
    // A line switched on the builder is a change; so is the switch.
    const switched = builderPayload(taxed); switched.lineItems[0].taxable = true;
    assert.equal(quoteTermsChanged(taxed, switched), true);
    assert.equal(quoteTermsChanged(taxed, { ...builderPayload(taxed), taxExempt: true }), true);
});

// ── calcLineTotals, lifted out of the tab and RUN ────────────────────────────

// The tab's old copy, verbatim but for its name — it ignored the deal discount, and knew no tax.
function oldCalcLineTotals(lineItems = [], products = []) {
    let listTotal = 0, netTotal = 0, recurring = 0, oneTime = 0, costTotal = 0;
    const lines = (lineItems || []).map(item => {
        const p    = products.find(p => p.id === item.productId) || {};
        const qty  = Number(item.quantity) || 1;
        const list = Number(item.listPrice ?? p.listPrice ?? p.price) || 0;
        const disc = Math.min(Math.max(Number(item.discountPct) || 0, 0), 100);
        const net  = list * (1 - disc / 100);
        const lineList = list * qty;
        const lineNet  = net * qty;
        const cost     = (Number(p.cost) || 0) * qty;
        listTotal += lineList;
        netTotal  += lineNet;
        costTotal += cost;
        const normType = (item.productType || p.type || p.productType || '').replace('_', '-');
        if (normType === 'recurring') recurring += item.unit === 'month' ? lineNet * 12 : lineNet;
        else oneTime += lineNet;
        return { ...item, netPrice: net, lineTotal: lineNet, lineList, productName: item.productName || p.name || '' };
    });
    const avgDisc  = listTotal > 0 ? 1 - netTotal / listTotal : 0;
    const margin   = netTotal > 0 ? (netTotal - costTotal) / netTotal : 0;
    return { lines, listTotal, netTotal, totalValue: netTotal, recurringValue: recurring, oneTimeValue: oneTime, avgDisc, avgDiscPct: avgDisc * 100, margin };
}

const tabCalc = () => {
    const s = read(TAB);
    const body = between(s, 'function calcLineTotals(', '\n}\n') + '\n}';
    return new Function('quoteTotals', `${body}\nreturn calcLineTotals;`)(quoteTotals);
};

test("the tab's calcLineTotals is quoteTotals': no loop of its own; with no terms the same money as the copy it replaced", () => {
    const s = code(read(TAB));
    const fn = between(s, 'function calcLineTotals(', '\n}\n');
    assert.ok(fn.includes('const t = quoteTotals({ lineItems: lineItems || [], products: catalog, dealDiscount: terms?.dealDiscount, taxRate: terms?.taxRate ?? null, taxExempt: terms?.taxExempt });'));
    assert.ok(!fn.includes('1 - disc / 100') && !fn.includes('recurring +='), 'REGRESSION: a second copy of the money in the tab');
    const calc = tabCalc();
    const products = [{ id: 'p1', listPrice: 1200, cost: 300, type: 'recurring' }, { id: 'p2', price: 80, cost: 20, productType: 'one_time' }, { id: 'p3', listPrice: 50 }];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
    for (let i = 0; i < 500; i++) {
        const lineItems = Array.from({ length: Math.floor(rnd() * 5) }, () => ({
            productId: pick(['p1', 'p2', 'p3', 'gone', undefined]),
            // Prices whose nets are whole cents at every discount picked, as every stored quote's are: the old copy kept
            // a fraction of a cent, the rule since rounds each line (Jeff, 10 Nov: "Round each line" — tests/quote-totals).
            listPrice: pick([undefined, 0, 99.6, '250', 1234.4, '']),
            quantity: pick([1, 2, '3', 0, '', 'x', 7]),
            discountPct: pick([0, 5, '12.5', 150, -5, undefined]),
            productType: pick([undefined, 'recurring', 'one-time', 'one_time']),
            unit: pick(['month', 'year', 'flat']),
            taxable: pick([undefined, true, false]),
        }));
        const a = calc(lineItems, products), b = oldCalcLineTotals(lineItems, products);
        for (const k of ['listTotal', 'netTotal', 'totalValue', 'recurringValue', 'oneTimeValue']) {
            assert.ok(Math.abs(a[k] - b[k]) < 0.006, `#${i} ${k}: ${a[k]} vs ${b[k]}`);
        }
        // The ratios off the lines' total to the cent, as stored (the old copy's was unrounded): within a ten-thousandth.
        const near = (x, y) => Math.abs(x - y) <= 1e-4 * Math.max(1, Math.abs(y));
        assert.ok(near(a.margin, b.margin) && near(a.avgDisc, b.avgDisc), `#${i} margin/avgDisc: ${a.margin}/${a.avgDisc} vs ${b.margin}/${b.avgDisc}`);
        assert.equal(a.lines.length, b.lines.length);
        a.lines.forEach((li, j) => { assert.ok(Math.abs(li.lineTotal - b.lines[j].lineTotal) < 1e-9); assert.equal(li.productName, b.lines[j].productName); });
        assert.equal(a.grandTotal, a.totalValue, 'no terms: no tax');
    }
});

test("the tab's calcLineTotals with a quote's terms: the deal discount the server stores (the old copy left it out), the tax beside it, totalValue pre-tax", () => {
    const calc = tabCalc();
    const lineItems = [{ listPrice: 600, quantity: 1 }, { listPrice: 400, quantity: 1, taxable: false }];
    const t = calc(lineItems, [], { dealDiscount: '10.00', taxRate: '5.00', taxExempt: null });
    assert.equal(t.subtotal, 1000);
    assert.equal(t.netTotal, 1000, 'netTotal is the lines (the margin and average discount read it)');
    assert.equal(t.totalValue, 900, 'pre-tax, the deal discount taken — what the server stores');
    assert.equal(t.taxAmount, 27, '5% of the taxable 600 less 10%');
    assert.equal(t.grandTotal, 927);
    assert.equal(calc(lineItems, [], { taxRate: 5, taxExempt: true }).taxAmount, 0);
    assert.equal(calc(lineItems, [], undefined).totalValue, 1000);
    assert.deepEqual(t.lines.map((l) => l.taxable), [true, false]);
});

// ── the wiring, by scan ──────────────────────────────────────────────────────

test('QuotesTab: every totals block draws the rows (preview, compare columns, builder), the print copy too — to the cent', () => {
    const s = code(read(TAB));
    assert.ok(s.includes("import { quoteTotals, lineTaxable } from '../utils/quoteTotals.js';"));
    assert.ok(s.includes("import { quoteMoneyRows, quoteTaxNote, taxRateFromInput, taxRateInputOf, productTaxable } from '../utils/quoteMoneyRows.js';"));
    assert.ok(s.includes("const moneyRowsOf = (totals, dealDiscount) => quoteMoneyRows(totals, dealDiscount).map(r => ({ l: r.label, v: r.value, bold: !!r.total }));"));
    const preview = between(s, 'const QuotePDFPreview = (', '\n};\n');
    assert.ok(preview.includes('const totals = calcLineTotals(quote.lineItems || [], products || [], quote);'), 'the preview reads the quote\'s own terms');
    assert.equal(count(preview, '...moneyRowsOf(totals, quote.dealDiscount),'), 1);
    assert.ok(!preview.includes("'Net total'"), 'the old Net row is the Total row now');
    const column = between(s, 'const QuoteColumn = (', '\n};\n');
    assert.ok(column.includes('const totals = calcLineTotals(quote.lineItems || [], products || [], quote);'));
    assert.ok(column.includes('const otherResult = otherQuote ? calcLineTotals(otherQuote.lineItems || [], products || [], otherQuote) : null;'), 'each version its own terms');
    assert.equal(count(column, '...moneyRowsOf(totals, quote.dealDiscount).map(r => ({ label: r.l, value: r.v, bold: r.bold })),'), 1);
    assert.ok(column.includes('{fmt(totalValue)}'), 'the column headline stays pre-tax');
    const editor = between(s, 'const LineItemEditor = (', '\n};\n');
    assert.equal(count(editor, '...moneyRowsOf(totals, quote.dealDiscount),'), 1);
    // Since §0.246 (docs/design/refusal-sweep 7a) the print copy is its own module-scope function, opened only by
    // "Print a copy instead" — the same text; its lines to the cent too (Q15).
    const print = between(s, 'const printQuoteCopy = ({ activeQuote, products, orgIdentity, configuratorOpp }) => {', '\n};\n');
    assert.ok(print.includes('const totals = calcLineTotals(activeQuote.lineItems || [], products || [], activeQuote);'));
    assert.ok(print.includes('const moneyHtml = quoteMoneyRows(totals, activeQuote.dealDiscount)'));
    assert.ok(print.includes('`<p><strong>${esc(r.label)}: ${esc(r.value)}</strong></p>` : `<p>${esc(r.label)}: ${esc(r.value)}</p>`'), 'the rows escaped');
    assert.ok(print.includes('</tbody></table>${moneyHtml}${activeQuote.paymentTerms'), 'the block where the Total was');
    assert.ok(!print.includes('Math.round(netTotal)'), 'REGRESSION: the print copy\'s whole-dollar pre-tax Total');
    assert.ok(print.includes('<td>${esc(fmtMoney(li.lineTotal))}</td>') && !print.includes('Math.round(li.lineTotal)'), 'REGRESSION (§0.246, Q15): the print copy\'s lines in whole dollars');
});

test('QuotesTab: the builder edits the rate and the "Tax exempt" switch, and each line\'s Taxable; a refused rate is said, never sent', () => {
    const editor = between(code(read(TAB)), 'const LineItemEditor = (', '\n};\n');
    assert.ok(editor.includes('const [taxRateInput,  setTaxRateInput]  = useState(() => taxRateInputOf(quote.taxRate));'));
    assert.ok(editor.includes('const [taxExempt,     setTaxExempt]     = useState(quote.taxExempt === true);'));
    assert.ok(editor.includes('const typedRate = taxRateFromInput(taxRateInput);'));
    assert.ok(editor.includes('const totals = calcLineTotals(lineItems, products || [], { dealDiscount: quote.dealDiscount, taxRate: typedRate.error ? quote.taxRate : typedRate.rate, taxExempt });'));
    // A text box: a number box hands the code '' for words it cannot read, saved as no tax without a word (the review).
    assert.ok(editor.includes('<input id="quote-tax-rate" type="text" inputMode="decimal" autoComplete="off" value={taxRateInput}'));
    assert.ok(!/id="quote-tax-rate" type="number"/.test(editor), 'REGRESSION: the rate a number box');
    assert.ok(editor.includes('onChange={e => setTaxRateInput(e.target.value)}'));
    assert.ok(editor.includes('<input type="checkbox" checked={taxExempt} onChange={e => setTaxExempt(e.target.checked)}'));
    assert.ok(editor.includes('<input type="checkbox" checked={item.taxable}') && editor.includes("onChange={e => updateLine(item._key, 'taxable', e.target.checked)}"), 'each line its Taxable');
    assert.ok(editor.includes("['Product', 'Type', 'Unit Price', 'Qty', 'Disc %', 'Taxable', '']"));
    assert.equal(count(editor, "'1.8fr 72px 88px 72px 72px 56px 28px'"), 2, 'the header and the rows one grid');
    // A product added copies its Taxable.
    assert.ok(between(editor, 'const addProduct = (prod) => {', '\n    };').includes('taxable:     productTaxable(prod),'));
    // The save: a refused rate stops it before the payload; the payload names the rate and the switch.
    const save = between(editor, 'const handleSave = async () => {', '\n    };');
    order(save,
        'if (typedRate.error) { setError(typedRate.error); return; }',
        'const payload = { ...quote, lineItems: lineItems.map(({ _key, ...li }) => li), paymentTerms, validUntil, notes, taxRate: typedRate.rate, taxExempt };',
        'await onSave(payload);');
});

test('QuotesTab: a New version copies the rate and the switch as stored — none named as none — and the lines with their Taxable (R2)', () => {
    const nv = between(code(read(TAB)), '    const handleNewVersion = async () => {', '\n    };');
    order(nv,
        'lineItems: (source.lineItems || []).map(li => ({ ...li })),',
        'dealDiscount: source.dealDiscount || 0,',
        'taxRate: source.taxRate ?? null,',
        'taxExempt: source.taxExempt ?? null,',
        'const saved = await handleSaveQuote(payload, null);');
    // A new quote names no rate: the server fills the org's default (R3).
    const nq = between(code(read(TAB)), '    const handleNewQuoteForOpp = async (oppId, template = null) => {', '\n    };');
    assert.ok(!nq.includes('taxRate') && !nq.includes('taxExempt'), 'a new quote takes the org default and the customer prefill');
});

test('QuotesTab: "Total quoted", the waiting value and the card headlines stay pre-tax; a card says its tax beside the value', () => {
    const s = code(read(TAB));
    assert.ok(s.includes("{ label: 'Total quoted',      value: fmt(oppQuoteSummaries.reduce((s, x) => s + (parseFloat(x.latest?.totalValue) || 0), 0)), sub: 'across active quotes' },"));
    assert.ok(s.includes('const waitingValue = pending.reduce((s, q) => s + (parseFloat(q.totalValue) || 0), 0);'));
    assert.ok(!/grandTotal/.test(s), 'no screen here sums or heads with the taxed total');
    assert.ok(s.includes('const qTotals = calcLineTotals(q.lineItems || [], [], q);') && s.includes('const taxNote = quoteTaxNote(qTotals);'));
    assert.ok(s.includes('const latestTotals = calcLineTotals(latest?.lineItems || [], products || [], latest);') && s.includes('const taxNote = quoteTaxNote(latestTotals);'));
    assert.equal(count(s, '{taxNote && <div style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: T.sans }}>{taxNote}</div>}'), 2);
});

test('QuotesTab → Price Book: a Taxable switch per product — on for a new one, the stored one (none: on) on an edit, sent on every save', () => {
    const cat = between(code(read(TAB)), 'function CatalogTab(', '\n}\n');
    assert.ok(cat.includes("description: '', active: true, customPrice: false, taxable: true };"), 'a new product is taxable');
    // Moved in §0.242: the form an edit opens with is productForm (src/utils/productChanges.js), the body productChanges.
    assert.ok(cat.includes('const openEdit = (p) => { setForm(productForm(p, formDefaults)); setEditing(p.id); setError(null); };'), 'an edit opens with the stored Taxable');
    assert.equal(productForm({ id: 'p1', name: 'A', taxable: false }).taxable, false);
    assert.equal(productForm({ id: 'p1', name: 'A', taxable: null }).taxable, true, 'none reads taxable');
    assert.ok(cat.includes('<input type="checkbox" id="prod-taxable" checked={form.taxable !== false} onChange={e => setForm(f => ({ ...f, taxable: e.target.checked }))} />'));
    assert.ok(cat.includes('<label htmlFor="prod-taxable"'));
    assert.ok(cat.includes('const changes = productChanges(stored, form, formDefaults);') && cat.includes('await onSave(stored ? { ...changes, id: stored.id } : changes, stored);'), 'the form, Taxable with it, is the body');
    // A new product sends its Taxable; an edit sends it when switched (§0.242: only what changed).
    const NEW = { name: 'A', category: '', productType: 'recurring', listPrice: '10', unit: 'flat', description: '', active: true, customPrice: false, taxable: false };
    assert.equal(productChanges(null, NEW).taxable, false);
    assert.deepEqual(productChanges({ id: 'p1', name: 'A', productType: 'recurring', listPrice: '10.00', unit: 'flat', taxable: true }, { ...NEW }), { taxable: false });
    assert.ok(cat.includes('{!productTaxable(prod) && <span'), 'the list says which products are not taxed');
});

test('quoteTemplates: a template\'s lines copy each product\'s Taxable by the one rule', () => {
    const s = code(read('src/utils/quoteTemplates.js'));
    assert.ok(s.includes("import { lineTaxable } from './quoteTotals.js';"));
    assert.ok(s.includes('taxable:     lineTaxable(prod),'));
});

test('Settings → Quote templates: a "Default tax rate %" in the panel\'s defaults, saved in quoteDefaults by the panel\'s one save with its tokens; no load of its own', () => {
    const s = code(read(DEFAULTS));
    assert.ok(s.includes("import { defaultTaxRateOf } from '../../../utils/quoteTotals.js';"));
    assert.ok(s.includes("import { taxRateFromInput, taxRateInputOf } from '../../../utils/quoteMoneyRows.js';"));
    assert.ok(s.includes('const [taxRateText,  setTaxRateText] = useState(() => taxRateInputOf(defaultTaxRateOf(savedDefaults)));'), 'seeded through the one clamped reader');
    assert.ok(s.includes('setTaxRateText(taxRateInputOf(defaultTaxRateOf(savedDefaults)));'), 'Cancel puts it back');
    const onText = between(s, '    const onTaxRateText = (text) => {', '\n    };');
    order(onText, 'setTaxRateText(text);', 'const typed = taxRateFromInput(text);', "if (typed.error) setDirty(true); else setfd('taxRate', typed.rate);");
    assert.ok(s.includes('<input id="qd-tax-rate" type="text" inputMode="decimal" autoComplete="off" value={taxRateText} placeholder="None"'));
    assert.ok(!/id="qd-tax-rate" type="number"/.test(s), 'REGRESSION: the default rate a number box');
    assert.ok(s.includes('onChange={e => onTaxRateText(e.target.value)}'));
    assert.ok(s.includes('>Default tax rate %</label>'));
    // The save: the typed words checked first — refused, said and thrown (the leave guard stays), nothing sent; then
    // the panel's own send, with the tokens it opened with.
    const save = between(s, '    const handleSave = once(async () => {', '\n    });');
    order(save,
        'const typedRate = taxRateFromInput(taxRateText);',
        'if (typedRate.error) { setSaveError(typedRate.error); throw new Error(typedRate.error); }',
        'setSaving(true);',
        'await putSettings({ quoteTemplates:templates, quoteDefaults:defaults, quoteBoilerplate:boilerplate }, opened);');
    assert.equal(count(s, 'putSettings('), 1, 'one save');
    assert.ok(!/functions\/settings/.test(s), 'no load or send of the settings of its own');
});
