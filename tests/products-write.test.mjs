// tests/products-write.test.mjs — the Price Book's save (state §0.242, guide §18b125; docs/design/save-cleanup Part 1,
// Jeff's answers 10 Nov: Q1 "404, write nothing", Q2 "Add the column", Q4 "Refuse, name the line").
// RUN: productChanges / productForm (src/utils/productChanges.js) — an edit sends only what changed, a new product the
// whole form, '' never over a stored none, Custom / Variable Price and its list price together; the quote builder's
// line-discount refusal (lineDiscountRefusal, the server's own rule) on the lines as the builder holds them.
// WIRING (§18b23 — the screens need React and a DOM; the server needs a database): the products PUT is an update read
// in the org first and never names the maker; the POST stamps it; useQuotes.handleSaveProduct answers { ok, error |
// quiet } and the Price Book draws the error, closing only on success; the dead productModalError/Saving are gone; the
// builder refuses a line discount before it sends. The handler against a real database: tests/integration/
// save-cleanup.itest.mjs (its PRICE BOOK case runs these bodies through it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { productForm, productChanges, FORM_FIELDS } from '../src/utils/productChanges.js';
import { lineDiscountRefusal } from '../src/utils/quoteTotals.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src) => src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const between = (s, a, b) => { const i = s.indexOf(a); assert.ok(i >= 0, a); const j = s.indexOf(b, i + a.length); assert.ok(j > i, b); return s.slice(i, j); };
const count = (s, needle) => s.split(needle).length - 1;
const order = (s, ...needles) => {
    let at = -1;
    for (const n of needles) { const i = s.indexOf(n, at + 1); assert.ok(i > at, `in order: ${n}`); at = i; }
};

// A product as the products GET answers it: numeric columns as text, a column never set as null.
const STORED = Object.freeze({
    id: 'prod_1', orgId: 'org_A', name: 'Platform', sku: 'PL-1', description: null, productType: 'recurring',
    listPrice: '1200.00', minPrice: '900.00', unit: 'year', category: null, active: true, sortOrder: 3,
    taxable: null, customPrice: null, createdBy: 'Jeff', createdAt: '2026-11-01T10:00:00.000Z',
});
const DEFAULTS = { typeId: 'recurring', unit: 'flat' };

// ── productChanges, RUN ──────────────────────────────────────────────────────

test('an edit that changes nothing sends nothing — the form as it opened is the product as stored', () => {
    assert.deepEqual(productChanges(STORED, productForm(STORED, DEFAULTS), DEFAULTS), {});
    // The form shows a blank Category and Description for a stored none: the same value, never sent.
    const f = productForm(STORED, DEFAULTS);
    assert.equal(f.category, '');
    assert.equal(f.description, '');
    // A price typed as the same number is no change ("1200.00" stored, "1200" typed).
    assert.deepEqual(productChanges(STORED, { ...f, listPrice: '1200' }, DEFAULTS), {});
    // The form's first type and unit, shown for a product that holds none, are not sent unless picked anew.
    const bare = { ...STORED, productType: null, unit: null };
    const bf = productForm(bare, DEFAULTS);
    assert.equal(bf.productType, 'recurring');
    assert.equal(bf.unit, 'flat');
    assert.deepEqual(productChanges(bare, bf, DEFAULTS), {});
    assert.deepEqual(productChanges(bare, { ...bf, unit: 'month' }, DEFAULTS), { unit: 'month' });
});

test('an edit sends only the fields that changed — never a key the form does not show', () => {
    const f = productForm(STORED, DEFAULTS);
    assert.deepEqual(productChanges(STORED, { ...f, name: 'Platform Plus' }, DEFAULTS), { name: 'Platform Plus' });
    assert.deepEqual(productChanges(STORED, { ...f, active: false }, DEFAULTS), { active: false });
    assert.deepEqual(productChanges(STORED, { ...f, taxable: false }, DEFAULTS), { taxable: false });
    assert.deepEqual(productChanges(STORED, { ...f, listPrice: '1500' }, DEFAULTS), { listPrice: 1500 });
    assert.deepEqual(productChanges(STORED, { ...f, productType: 'one-time', category: 'Add-ons' }, DEFAULTS), { productType: 'one-time', category: 'Add-ons' });
    // Several at once, and nothing else: no SKU, minimum price, order, maker or id.
    const out = productChanges(STORED, { ...f, name: 'X', description: 'Y', unit: 'month' }, DEFAULTS);
    assert.deepEqual(out, { name: 'X', description: 'Y', unit: 'month' });
    for (const k of ['sku', 'minPrice', 'sortOrder', 'createdBy', 'createdAt', 'orgId', 'id']) assert.ok(!(k in out), k);
    // Every key an edit can send is a form field.
    const all = productChanges(STORED, { name: 'N', category: 'C', productType: 'one-time', listPrice: '1', unit: 'day', description: 'D', active: false, customPrice: true, taxable: false }, DEFAULTS);
    for (const k of Object.keys(all)) assert.ok(FORM_FIELDS.includes(k), k);
});

test("a blank Category or Description never writes '' — over a stored none it is no change; clearing a stored one sends none", () => {
    const f = productForm(STORED, DEFAULTS);
    assert.deepEqual(productChanges(STORED, { ...f, category: '', description: '   ' }, DEFAULTS), {}, "'' over none: unchanged");
    const held = { ...STORED, category: 'Platform', description: 'The core' };
    const hf = productForm(held, DEFAULTS);
    assert.deepEqual(productChanges(held, { ...hf, category: '', description: '' }, DEFAULTS), { category: null, description: null }, 'cleared: none, never ""');
    // The census's two rows that hold '' already: unchanged, nothing sent.
    const empty = { ...STORED, category: '', description: '' };
    assert.deepEqual(productChanges(empty, productForm(empty, DEFAULTS), DEFAULTS), {});
});

test('Custom / Variable Price: the switch and the price travel together, as the server wants them (Q2)', () => {
    const f = productForm(STORED, DEFAULTS);
    // Switched on: the price is none — the server stores 0.
    assert.deepEqual(productChanges(STORED, { ...f, customPrice: true, listPrice: '' }, DEFAULTS), { customPrice: true, listPrice: null });
    // A custom product as stored (list price 0, ticked) opens ticked with no price.
    const custom = { ...STORED, customPrice: true, listPrice: '0.00' };
    const cf = productForm(custom, DEFAULTS);
    assert.equal(cf.customPrice, true);
    assert.equal(cf.listPrice, '', 'its stored 0 is no price');
    assert.deepEqual(productChanges(custom, cf, DEFAULTS), {}, 'unchanged');
    // A custom product's other edits send no price.
    assert.deepEqual(productChanges(custom, { ...cf, name: 'Renamed' }, DEFAULTS), { name: 'Renamed' });
    // Switched off: always the price typed — a switch off naming none would keep the stored 0.
    assert.deepEqual(productChanges(custom, { ...cf, customPrice: false, listPrice: '250' }, DEFAULTS), { customPrice: false, listPrice: 250 });
    // A product saved before the column (none) is not custom.
    assert.equal(productForm({ ...STORED, customPrice: null }).customPrice, false);
});

test('a new product sends the whole form — a blank text as none, a custom one with no price', () => {
    const form = { name: 'New', category: '', productType: 'one-time', listPrice: '49.5', unit: 'flat', description: '', active: true, customPrice: false, taxable: true };
    assert.deepEqual(productChanges(null, form), { name: 'New', category: null, productType: 'one-time', listPrice: 49.5, unit: 'flat', description: null, active: true, customPrice: false, taxable: true });
    const custom = productChanges(null, { ...form, customPrice: true, listPrice: '' });
    assert.equal(custom.customPrice, true);
    assert.equal(custom.listPrice, null, 'the POST takes none for a custom product and stores 0');
    assert.equal(productChanges(null, { ...form, taxable: false, active: false }).taxable, false);
    assert.deepEqual(Object.keys(productChanges(null, form)).sort(), [...FORM_FIELDS].sort(), 'every form field');
});

// ── the server's wiring ──────────────────────────────────────────────────────

const handlerOf = (s) => ({
    post: between(s, "if (event.httpMethod === 'POST') {", "if (event.httpMethod === 'PUT') {"),
    put: between(s, "if (event.httpMethod === 'PUT') {", "if (event.httpMethod === 'DELETE') {"),
});

test('products PUT: an update read in the org first, 404 for an id it does not hold, no insert, never the maker (Q1)', () => {
    const s = code(read('netlify/functions/products.mjs'));
    const { put } = handlerOf(s);
    assert.ok(!put.includes('.insert('), 'REGRESSION: the PUT an upsert');
    assert.ok(!put.includes('onConflictDoUpdate'), 'REGRESSION: the PUT an upsert');
    assert.ok(!/createdBy|createdAt/.test(put), 'who made it, and when, are never written by a PUT');
    order(put,
        'const [stored] = await db.select().from(products)',
        '.where(and(eq(products.id, String(data.id)), eq(products.orgId, orgId))).limit(1);',
        "if (!stored) return { statusCode: 404,",
        'const refused = productRefused(data, stored.customPrice);',
        'const { id: _id, ...named } = sanitize(data);',
        'db.update(products).set(changes)',
        '.where(and(eq(products.id, stored.id), eq(products.orgId, orgId)))',
        "action: 'product.updated'");
    assert.equal(count(put, 'db.update(products)'), 1);
    // ALLOWED_FIELDS: the switch the Price Book saves; never the maker.
    const allowed = between(s, 'const ALLOWED_FIELDS = [', '];');
    assert.ok(allowed.includes("'customPrice',"));
    assert.ok(!allowed.includes("'createdBy'"), 'the maker is the server\'s');
});

test('products POST: the maker stamped by the server, a taken id a 409', () => {
    const { post } = handlerOf(code(read('netlify/functions/products.mjs')));
    assert.ok(post.includes('createdBy: (await getCallerName(auth.userId, orgId)) || null,'));
    order(post, '...sanitize(data),', 'createdBy: (await getCallerName(auth.userId, orgId)) || null,');
    assert.ok(post.includes('.onConflictDoNothing({ target: products.id }).returning();'));
    assert.ok(post.includes("if (!inserted) return { statusCode: 409,"));
});

// ── the screen's wiring ──────────────────────────────────────────────────────

test('useQuotes.handleSaveProduct answers { ok, error | quiet }: the server\'s words, else its status; quiet for another org', () => {
    const s = code(read('src/hooks/useQuotes.js'));
    const save = between(s, 'const handleSaveProduct = useCallback(async (formData, editingProduct = null) => {', '}, []);');
    order(save,
        'const askedOrg = requestOrg();',
        "const res = await dbFetch('/.netlify/functions/products', {",
        'const data = await res.json().catch(() => ({}));',
        'if (!stillOrg(askedOrg)) return { ok: false, quiet: true };',
        'if (!res.ok) return { ok: false, error: data.error || `The server returned ${res.status}.` };',
        'setProducts(prev =>',
        'return { ok: true, product: saved };',
        '} catch (err) {',
        'if (!stillOrg(askedOrg)) return { ok: false, quiet: true };',
        "return { ok: false, error: 'The product was not saved — check your connection.' };");
    assert.ok(!/return null/.test(save), 'REGRESSION: a refusal answered as null and said nowhere');
});

test('the dead productModalError / productModalSaving are gone — from the hook and App.jsx', () => {
    const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
    const walk = (dir, out = []) => { for (const n of readdirSync(dir)) { const p = join(dir, n); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(jsx?|mjs)$/.test(n)) out.push(p); } return out; };
    const hits = walk(srcDir).filter((f) => /productModal(?:Error|Saving)/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(srcDir.length));
    assert.deepEqual(hits, []);
});

test('the Price Book sends productChanges, closes only on success and draws a refusal until Cancel', () => {
    const tab = code(read('src/Tabs/QuotesTab.jsx'));
    assert.ok(tab.includes("import { productForm, productChanges } from '../utils/productChanges.js';"));
    // The page's handler throws the answer's words; a quiet answer (another org) does not.
    const local = between(tab, 'const handleSaveProductLocal  = async (data, stored) => {', '\n    };');
    order(local, 'const result = await handleSaveProduct(data, stored);', "if (!result?.ok && !result?.quiet) throw new Error(result?.error || 'The product was not saved.');");
    const cat = between(tab, 'function CatalogTab(', '\n}\n');
    const save = between(cat, '    const handleSave = async () => {', '\n    };');
    order(save,
        "if (!form.name.trim()) { setError('Product name is required.'); return; }",
        'const stored = editing === \'new\' ? null : (products || []).find(p => p.id === editing) || null;',
        'const changes = productChanges(stored, form, formDefaults);',
        'if (stored && !Object.keys(changes).length) { cancel(); return; }',
        'setSaving(true);',
        'await onSave(stored ? { ...changes, id: stored.id } : changes, stored);',
        'cancel();',
        "} catch (err) { setError(err.message || 'Failed to save.'); }");
    assert.equal(count(save, 'cancel();'), 2, 'nothing changed, or saved — never after a refusal');
    assert.ok(!save.includes('...form'), 'REGRESSION: the whole form sent on an edit');
    assert.ok(cat.includes("{error && <div style={{ color: T.danger, fontSize: '0.8125rem', marginBottom: '0.5rem', fontFamily: T.sans }}>{error}</div>}"), 'the refusal drawn');
    assert.ok(cat.includes('const cancel   = () => { setEditing(null); setError(null); };'), 'Cancel clears it');
    assert.ok(cat.includes('onSave={handleSaveProductLocal}') || tab.includes('onSave={handleSaveProductLocal}'));
});

// ── the quote builder's line discount (Q4) ───────────────────────────────────

test('the builder refuses a line discount outside 0-100 in words naming the line; a line the quote holds is not asked again', () => {
    // The lines as the builder holds them: a _key each, the discount a number from the box.
    const lines = [
        { _key: 1, productId: 'p1', listPrice: 100, quantity: 1, discountPct: 10 },
        { _key: 2, productId: 'p2', listPrice: 100, quantity: 1, discountPct: 150 },
    ];
    assert.equal(lineDiscountRefusal(lines, []), 'Line 2: discount must be a number from 0 to 100.');
    assert.equal(lineDiscountRefusal([{ ...lines[0], discountPct: -5 }], []), 'Line 1: discount must be a number from 0 to 100.');
    assert.equal(lineDiscountRefusal([lines[0], { ...lines[1], discountPct: 100 }], []), null, '100 stands');
    assert.equal(lineDiscountRefusal([{ ...lines[0], discountPct: 0 }], []), null, '0 stands (an empty box reads 0)');
    // Held as stored (a restore could land it): the same product at the same discount is never asked again.
    assert.equal(lineDiscountRefusal(lines, [{ productId: 'p2', discountPct: '150' }]), null);
    assert.equal(lineDiscountRefusal(lines, [{ productId: 'p2', discountPct: 120 }]), 'Line 2: discount must be a number from 0 to 100.', 'a new value is asked');
});

test('the builder checks the lines at Save, after the rate and before anything is sent — the typed value kept', () => {
    const tab = code(read('src/Tabs/QuotesTab.jsx'));
    assert.ok(tab.includes("import { lineDiscountRefusal } from '../utils/quoteTotals.js';"));
    const editor = between(tab, 'const LineItemEditor = ({ quote, products, onSave, onClose, saving }) => {', '\n};\n');
    const save = between(editor, '    const handleSave = async () => {', '\n    };');
    order(save,
        'setError(null);',
        'if (typedRate.error) { setError(typedRate.error); return; }',
        'const lineRefusal = lineDiscountRefusal(lineItems, quote.lineItems);',
        'if (lineRefusal) { setError(lineRefusal); return; }',
        'const payload = { ...quote, lineItems: lineItems.map(({ _key, ...li }) => li),',
        'try { await onSave(payload); onClose(); }');
    assert.ok(!/setLineItems/.test(save), 'the typed value is kept — never clamped at Save');
    // The box keeps what was typed (no clamp on change), and the refusal is drawn beside Save.
    assert.ok(editor.includes("onChange={e => updateLine(item._key, 'discountPct', Number(e.target.value))}"));
    assert.ok(editor.includes('{error && <div style={{ fontSize: 11.5, color: T.danger, fontFamily: T.sans }}>{error}</div>}'));
});
