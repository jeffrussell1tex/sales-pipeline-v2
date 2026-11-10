// tests/quote-pdf-pages.test.mjs
//
// The quote PDF paginates (state §0.235; guide §18b118). Until §0.235 netlify/functions/quote-pdf.mjs laid one page
// out by fixed positions and never started another itself; pdfkit starts a page for every text drawn below the page's
// bottom margin, so every quote had a second page holding only its number, and a 25-line quote came out as 31 pages
// of one fragment each (9 Nov 2026, dev and localhost, read back). The layout is netlify/functions/_quotePdf.mjs —
// no database, so it is rendered here and read back:
//   PAGES   a short quote is one page; a long one continues on full pages, every row once and in order, the
//           column header atop each page of rows, the header band on page 1 only
//   KEPT    the totals and the four figures together, after the last row, for every length of quote
//   BANDS   nothing of the body below CONTENT_BOTTOM — no text, no box; a continued page's body from its top; the
//           footer alone in its band, on every page, "Page i of N"
//           when there are more; no page without body
//   HEADER  the quote name in up to two lines, the org's address under it, never over it (Karen's own quote, 9 Nov);
//           the meta values in up to two lines
//   ROWS    a row as tall as its product name (up to three lines, then an ellipsis) — never over the next row, never
//           past the floor, never a page of pdfkit's own for a name's tail (the §0.235 review's case)
//   NOTES   wrapped here, line by line, onto new pages — every character and its spacing kept, in order; a tab printed
//           as spaces; the heading never alone
// The org's identity on it (two orgs apart, the body's profile ignored) is tests/integration/quote-branding.itest.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import PDFDocument from 'pdfkit';
import { buildPDF, wrapLines, printable, PAGE_H, FOOTER_H, CONTENT_TOP, CONTENT_BOTTOM, NAME_LINES } from '../netlify/functions/_quotePdf.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8').replace(/\r\n/g, '\n');

const ORG = { name: 'Alpha Co', addressLines: ['1 Alpha Way', 'Austin, TX 78701'], phone: '512-555-0101', email: 'help@alpha.test' };
const dayOf = (t) => new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
// The footer's left text: the org (when named) and the render's date — today's, or yesterday's across midnight.
const dated = (text, org = 'Alpha Co') => [Date.now(), Date.now() - 864e5].some((t) => text === (org ? org + ' · ' : '') + dayOf(t));
const BODY_FLOOR = PAGE_H - CONTENT_BOTTOM;   // 48: a body text's baseline, from the page's foot, is never below this

// n line items, one-time and recurring by turns (rows 22 and 28 points tall), each named "Line k".
const items = (n) => Array.from({ length: n }, (_, i) => ({
    productName: 'Line ' + (i + 1), productType: i % 2 ? 'recurring' : 'one-time', unit: 'month',
    quantity: 1, listPrice: 100 + i, discountPct: i % 3 ? 0 : 5,
}));
const quoteOf = (n, extra = {}) => ({ quoteNumber: 'Q-1', version: 2, name: 'Probe', status: 'Draft', lineItems: items(n), ...extra });

// The PDF read back, page by page in the Pages tree's order: each text with its baseline (points from the foot).
const pagesOf = (buf) => {
    const raw = buf.toString('latin1');
    const obj = (n) => {
        const at = raw.search(new RegExp(`(^|\\n)${n} 0 obj\\b`));
        assert.ok(at >= 0, `object ${n}`);
        return raw.slice(at, raw.indexOf('endobj', at));
    };
    const root = obj(raw.match(/\/Root (\d+) 0 R/)[1]);
    const kids = [...obj(root.match(/\/Pages (\d+) 0 R/)[1]).match(/\/Kids \[([^\]]*)\]/)[1].matchAll(/(\d+) 0 R/g)].map((m) => m[1]);
    return kids.map((k) => {
        const content = obj(obj(k).match(/\/Contents (\d+) 0 R/)[1]);
        const len = Number(content.match(/\/Length (\d+)/)[1]);
        const at = content.indexOf('stream') + 'stream'.length;
        const startAt = content[at] === '\r' ? at + 2 : at + 1;
        const bytes = Buffer.from(content.slice(startAt, startAt + len), 'latin1');
        const s = /\/FlateDecode/.test(content) ? inflateSync(bytes).toString('latin1') : bytes.toString('latin1');
        const texts = [];
        for (const m of s.matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm[\s\S]*?\[([^\]]*)\]\s*TJ/g)) {
            const text = [...m[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => Buffer.from(h[1], 'hex').toString('latin1')).join('');
            texts.push({ x: Number(m[1]), y: Number(m[2]), text });
        }
        // The boxes drawn (the bands, the row backgrounds, the summary's boxes), from the page's top: pdfkit writes a
        // rect in its top-down space.
        texts.rects = [...s.matchAll(/(?:^|\n)([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+) re\b/g)].map((m) => ({ y: Number(m[2]), h: Number(m[4]) }));
        return texts;
    });
};
const render = async (quote, identity = ORG, opportunity = null) => pagesOf(await buildPDF(quote, opportunity, null, identity));
// Every page within its bands: no body text below the floor; every box ends above it, or is the footer band itself;
// a continued page's body starts at its top (not lower, not over the edge).
const floorChecks = (pages, label) => pages.forEach((p, i) => {
    assert.deepEqual(p.filter((t) => t.y >= FOOTER_H && t.y < BODY_FLOOR).map((t) => t.text), [], `REGRESSION (§0.235): ${label}, page ${i + 1} — text below the floor`);
    const over = p.rects.filter((r) => !(r.y === PAGE_H - FOOTER_H && r.h === FOOTER_H) && r.y + r.h > CONTENT_BOTTOM + 0.01);
    assert.deepEqual(over, [], `REGRESSION (§0.235): ${label}, page ${i + 1} — a box past the floor, into the footer band`);
    if (i > 0) {
        const first = Math.min(...bodyOf(p).map((t) => PAGE_H - t.y));
        assert.ok(first >= CONTENT_TOP && first <= CONTENT_TOP + 40, `REGRESSION (§0.235): ${label}, page ${i + 1} — its body starts ${first.toFixed(1)} from the top`);
    }
});
const words = (page) => page.map((t) => t.text);
const footerOf = (page) => page.filter((t) => t.y < FOOTER_H);
const bodyOf = (page) => page.filter((t) => t.y >= FOOTER_H);
const COLUMN_HEAD = ['PRODUCT', 'TYPE', 'QTY', 'UNIT PRICE', 'DISC %', 'TOTAL'];
const rowNames = (page) => words(page).filter((w) => /^Line \d+$/.test(w));

// ── PAGES ────────────────────────────────────────────────────────────────────

test('PAGES: a short quote is one page — the quote number no longer makes a page of its own', async () => {
    for (const n of [0, 1, 2, 5, 10, 17]) {   // 17: the most one page holds with its summary (measured 9 Nov)
        const pages = await render(quoteOf(n));
        assert.equal(pages.length, 1, `REGRESSION (§0.235): a ${n}-line quote is ${pages.length} pages — got ${JSON.stringify(pages.slice(1).map(words))}`);
        const foot = footerOf(pages[0]).map((t) => t.text);
        assert.ok(foot.length === 2 && dated(foot[0]) && foot[1] === 'Q-1 · v2', `${n} lines: the footer, no page count on one page — got ${JSON.stringify(foot)}`);
    }
});

test('PAGES: a long quote continues on full pages — every row once and in order, the column header atop each page of rows, the band on page 1 only', async () => {
    for (const n of [18, 25, 40, 45, 60, 120]) {   // 18: the first two-page quote; 45: the first three-page one
        const pages = await render(quoteOf(n));
        floorChecks(pages, `${n} lines`);
        assert.ok(pages.length > 1, `${n} lines fit no single page`);
        assert.ok(pages.length <= Math.ceil(n / 20) + 2, `REGRESSION (§0.235): ${n} lines spread over ${pages.length} pages — fragments a page again`);
        const rows = pages.flatMap(rowNames);
        assert.deepEqual(rows, items(n).map((it) => it.productName), `${n} lines: every row once, in order`);
        pages.forEach((p, i) => {
            if (rowNames(p).length === 0) return;
            const w = words(p);
            const head = COLUMN_HEAD.map((h) => w.indexOf(h));
            assert.ok(head.every((at) => at >= 0), `REGRESSION (§0.235): page ${i + 1} of a ${n}-line quote has rows and no column header`);
            assert.ok(Math.max(...head) < w.indexOf(rowNames(p)[0]), `page ${i + 1}: the column header written before its rows`);
            // And above them on the page — a row drawn over the header (its background painted on it) is written after it too.
            const headY = p.find((t) => t.text === 'PRODUCT').y, firstRowY = p.find((t) => t.text === rowNames(p)[0]).y;
            assert.ok(headY - firstRowY >= 12, `REGRESSION (§0.235): page ${i + 1} of a ${n}-line quote — its first row ${(headY - firstRowY).toFixed(1)} points under the column header, drawn over it`);
        });
        assert.ok(words(pages[0]).includes('ALPHA CO') && words(pages[0]).includes('Probe'), 'the band on page 1');
        for (const p of pages.slice(1)) assert.ok(!words(p).includes('ALPHA CO') && !words(p).includes('Probe'), 'the band on page 1 only');
        // A full page: a page whose rows continue on the next is filled to within a row (28) and a row's text inset;
        // one followed by the summary alone is left short only by less than the summary (128) and that inset.
        for (let i = 0; i < pages.length - 1; i++) {
            const gap = Math.min(...bodyOf(pages[i]).map((t) => t.y)) - BODY_FLOOR;
            const limit = rowNames(pages[i + 1]).length ? 50 : 160;
            assert.ok(gap < limit, `page ${i + 1} of a ${n}-line quote ends ${gap.toFixed(0)} points above the floor — not full (limit ${limit})`);
        }
    }
});

// ── KEPT ─────────────────────────────────────────────────────────────────────

test('KEPT: the totals and the four figures together, after the last row — for every length of quote, with and without a deal discount', async () => {
    const SUMMARY = ['Subtotal', 'Total', 'QUOTE TOTAL', 'ANNUAL RECURRING', 'ONE-TIME / SERVICES', 'AVG DISCOUNT'];
    for (const dealDiscount of [0, 10]) {
        for (let n = 0; n <= 45; n++) {
            const pages = await render(quoteOf(n, { dealDiscount }));
            floorChecks(pages, `${n} lines${dealDiscount ? ', a deal discount' : ''}`);
            const holders = SUMMARY.map((s) => pages.findIndex((p) => words(p).includes(s)));
            assert.ok(holders.every((h) => h >= 0), `${n} lines: the summary printed — ${JSON.stringify(holders)}`);
            assert.equal(new Set(holders).size, 1, `REGRESSION (§0.235): ${n} lines${dealDiscount ? ', a deal discount' : ''} — the totals and figures split across pages ${JSON.stringify(holders)}`);
            assert.equal(holders[0], pages.length - 1, `${n} lines: the summary on the last page (no notes)`);
            const lastRowPage = pages.reduce((at, p, i) => (rowNames(p).length ? i : at), 0);
            assert.ok(holders[0] >= lastRowPage, `${n} lines: after the last row`);
            // The row's words are the screens' since §0.241 (quoteMoneyRows.js): "Deal discount (10%)".
            if (dealDiscount) assert.ok(words(pages[holders[0]]).some((w) => w.startsWith('Deal discount (10%)')), 'the discount row with them');
            assert.equal(pages.flatMap(words).filter((w) => w === 'QUOTE TOTAL').length, 1, 'once');
        }
    }
});

// ── BANDS ────────────────────────────────────────────────────────────────────

test('BANDS: nothing of the body below the content floor; the footer alone in its band, on every page, "Page i of N"; no page without body', async () => {
    const quotes = [quoteOf(0), quoteOf(2), quoteOf(16), quoteOf(25), quoteOf(33, { dealDiscount: 5 }), quoteOf(60),
        quoteOf(3, { notes: 'TEST note line. '.repeat(500) }), quoteOf(20, { notes: 'Terms apply.\n\n'.repeat(80) })];
    for (const q of quotes) {
        const pages = await render(q);
        const label = `${q.lineItems.length} lines${q.notes ? ' + notes' : ''}`;
        floorChecks(pages, label);
        pages.forEach((p, i) => {
            const foot = footerOf(p);
            const right = pages.length > 1 ? `Q-1 · v2 · Page ${i + 1} of ${pages.length}` : 'Q-1 · v2';
            assert.ok(foot.length === 2 && dated(foot[0].text) && foot[1].text === right, `REGRESSION (§0.235): ${label}, page ${i + 1} — its footer: ${JSON.stringify(foot.map((t) => t.text))}`);
            assert.ok(bodyOf(p).length > 0, `REGRESSION (§0.235): ${label}, page ${i + 1} holds only its footer — a page of its own for a stray text`);
        });
    }
});

test('BANDS: no org name — the footer is the date alone, still on every page; a long name or number is cut to its line, never a page', async () => {
    const none = await render(quoteOf(25), { name: '', addressLines: [], phone: '', email: '' });
    for (const p of none) assert.ok(dated(footerOf(p)[0].text, ''), 'the date alone, never a stand-in name');
    const long = await render(quoteOf(2, { quoteNumber: 'Q-' + '9'.repeat(200) }), { ...ORG, name: 'A'.repeat(300) });
    assert.equal(long.length, 1, 'REGRESSION (§0.235): a long footer text wraps onto a page of its own');
    assert.equal(footerOf(long[0]).length, 2, 'each footer text one line');
});

// ── NOTES ────────────────────────────────────────────────────────────────────

test('NOTES: wrapped onto new pages, every character kept in order; the heading never alone at a page\'s foot', async () => {
    const notes = 'Payment due in 30 days.\nWarranty: one year.\n\n' + 'Long terms clause number ' + 'x'.repeat(400) + ' end. ' + 'More words follow here. '.repeat(300);
    // Every length 0-60, with and without a deal discount: the heading's own case (it fits, its first line does not)
    // falls at one length only (43 lines with 10% off, for these notes — the §0.235 review's sweep).
    for (const [n, dealDiscount] of Array.from({ length: 61 }, (_, n) => [[n, 0], [n, 10]]).flat()) {
        const pages = await render(quoteOf(n, { notes, dealDiscount }));
        floorChecks(pages, `${n} lines + notes${dealDiscount ? ', a deal discount' : ''}`);
        const body = pages.map(bodyOf);
        const heading = body.findIndex((p) => p.some((t) => t.text === 'NOTES & TERMS'));
        assert.ok(heading >= 0, `${n} lines: the notes printed`);
        const onHeadingPage = body[heading].map((t) => t.text);
        assert.ok(onHeadingPage.indexOf('NOTES & TERMS') < onHeadingPage.length - 1, `REGRESSION (§0.235): ${n} lines — the notes' heading alone at a page's foot`);
        const headAt = body[heading].findIndex((t) => t.text === 'NOTES & TERMS');
        assert.ok(body[heading][headAt].y - body[heading][headAt + 1].y >= 8, `REGRESSION (§0.235): ${n} lines — the notes' heading over its first line`);
        const printed = body.slice(heading).flat().map((t) => t.text);
        const after = printed.slice(printed.indexOf('NOTES & TERMS') + 1).join('');
        assert.equal(after.replace(/\s+/g, ''), notes.replace(/\s+/g, ''), `REGRESSION (§0.235): ${n} lines — the notes lost or reordered characters`);
        assert.ok(pages.length > 1, 'they run past one page');
    }
    // The spacing as typed: runs of spaces and indentation kept, a tab as four spaces (pdfkit garbles a tab's run).
    const typed = (await render(quoteOf(1, { notes: 'Item:      $500\n  Indented\tTabbed\nA\u0001B' }))).flatMap(words);
    for (const want of ['Item:      $500', '  Indented    Tabbed', 'AB']) {
        assert.ok(typed.includes(want), `REGRESSION (§0.235): the notes print ${JSON.stringify(want)} otherwise — got ${JSON.stringify(typed.slice(typed.indexOf('NOTES & TERMS')))}`);
    }
});

test('NOTES: wrapLines — a line fits its width; paragraphs and blank lines kept; a word wider than a line broken where it must be', () => {
    const doc = new PDFDocument({ size: 'LETTER' });
    doc.fontSize(8.5).font('Helvetica');
    const W = 200;
    assert.deepEqual(wrapLines(doc, 'short', W), ['short']);
    assert.deepEqual(wrapLines(doc, 'one\n\ntwo', W), ['one', '', 'two'], 'a blank line kept');
    assert.deepEqual(wrapLines(doc, 'a\r\nb', W), ['a', 'b'], 'CRLF a line break');
    const long = wrapLines(doc, 'word '.repeat(80), W);
    assert.ok(long.length > 1 && long.every((l) => doc.widthOfString(l) <= W), 'every line within the width');
    assert.equal(long.join(' '), 'word '.repeat(80).trim(), 'the words kept, in order');
    const giant = wrapLines(doc, 'x'.repeat(500), W);
    assert.ok(giant.length > 1 && giant.every((l) => l.length > 0 && doc.widthOfString(l) <= W), 'a giant word broken into lines that fit');
    assert.equal(giant.join(''), 'x'.repeat(500));
    assert.deepEqual(wrapLines(doc, 'Item:      $500', W), ['Item:      $500'], 'REGRESSION (§0.235 review): a run of spaces collapsed');
    assert.deepEqual(wrapLines(doc, '    indented', W), ['    indented'], 'REGRESSION (§0.235 review): the indentation dropped');
    const spaced = wrapLines(doc, ('aligned   ' + 'w ').repeat(40), W);
    assert.ok(spaced.length > 1 && spaced.every((l, i) => !l.endsWith(' ') && (i === 0 || !l.startsWith(' '))), 'a break eats the spaces it falls on');
    assert.deepEqual(wrapLines(doc, 'a\tb', W), ['a    b'], 'a tab printed as four spaces');
    assert.equal(printable('x\u0000y\u001Fz\u007F\n'), 'xyz\n', 'control characters gone, the line break kept');
    doc.end();
});

// ── HEADER ───────────────────────────────────────────────────────────────────

test('HEADER: a quote name in up to two lines, the org\'s address under it — never over it; a one-line name where it always was', async () => {
    const top = (t) => PAGE_H - t.y;   // a baseline, from the page's top
    const bandOf = async (name, identity = ORG) => {
        const [p] = await render(quoteOf(2, { name }), identity);
        const meta = p.find((t) => t.text === 'OPPORTUNITY');
        return { p, meta, col: p.filter((t) => t.x === 62 && top(t) < top(meta)).sort((a, b) => top(a) - top(b)) };
    };
    for (const name of ['Probe', 'Northwind Facilities Group — Facilities Platform Rollout v1', 'A very long quote name '.repeat(8)]) {
        for (const identity of [ORG, { ...ORG, addressLines: [], phone: '', email: '' }]) {
            const { meta, col } = await bandOf(name, identity);
            const label = `${JSON.stringify(name.slice(0, 30))}${identity.addressLines.length ? '' : ', no address'}`;
            // Each line clears the one above it by the lower line's own size: 18 for the name, 7.5 for the address.
            col.slice(1).forEach((t, k) => {
                const size = t.text.startsWith('1 Alpha') || t.text.startsWith('Austin') || t.text.startsWith('512-') ? 7.5 : 18;
                assert.ok(top(t) - top(col[k]) >= size, `REGRESSION (§0.235): ${label} — "${t.text.slice(0, 20)}" printed over "${col[k].text.slice(0, 20)}" (${(top(t) - top(col[k])).toFixed(1)} apart)`);
            });
            const nameLines = col.filter((t) => !/^(ALPHA CO|1 Alpha|Austin|512-)/.test(t.text));
            assert.ok(nameLines.length >= 1 && nameLines.length <= 2, `${label}: the quote name in ${nameLines.length} lines — up to two`);
            assert.ok(top(meta) - top(col[col.length - 1]) >= 30, `REGRESSION (§0.235): ${label} — the band ends ${(top(meta) - top(col[col.length - 1])).toFixed(1)} under its last line: not grown with the name`);
        }
    }
    // The meta values: two lines, then an ellipsis — never past the divider, never a page of their own.
    for (const opp of ['Northwind Facilities Group — Commercial Rooftop Units Service Contract Renewal 2027', 'Very long opportunity name '.repeat(60)]) {
        const pages = await render(quoteOf(2, { paymentTerms: opp }), ORG, { opportunityName: opp });
        assert.equal(pages.length, 1, `REGRESSION (§0.235 review): a ${opp.length}-character opportunity name — ${pages.length} pages`);
        const p = pages[0];
        const metaTop = p.find((t) => t.text === 'OPPORTUNITY').y, tableTop = p.find((t) => t.text === 'PRODUCT').y;
        const lines = p.filter((t) => t.x === 48 && t.y < metaTop && t.y > tableTop);
        assert.ok(lines.length <= 2, `REGRESSION (§0.235 review): a ${opp.length}-character opportunity name in ${lines.length} lines — past the divider`);
    }
    // One line: the address at its old place (its first line's baseline 65.4 from the top, as before §0.235).
    const { col } = await bandOf('Probe');
    assert.equal(+top(col.find((t) => t.text === '1 Alpha Way')).toFixed(1), 65.4, 'a one-line name moves nothing');
});

// ── ROWS ─────────────────────────────────────────────────────────────────────

const LONG_NAME = 'Annual Maintenance Contract - Commercial HVAC Rooftop Units Tier 2 Coverage';   // 75 characters, 3 lines
const NAME_X = 52;   // the product column's text (cols[0].x + 4)

test('ROWS: a row as tall as its product name — at every place near a page\'s foot, never past the floor, never a page of pdfkit\'s own', async () => {
    for (const n of [20, 24, 26, 30, 47, 50]) {
        for (let at = Math.max(0, n - 9); at < n; at++) {
            const lineItems = items(n).map((it, i) => (i === at ? { ...it, productName: LONG_NAME, listPrice: 777 } : it));
            const pages = await render({ ...quoteOf(n), lineItems });
            const label = `${n} lines, the long name at row ${at + 1}`;
            floorChecks(pages, label);
            pages.forEach((p, i) => {
                assert.deepEqual(p.filter((t) => t.y >= FOOTER_H && t.y < BODY_FLOOR), [], `REGRESSION (§0.235 review): ${label}, page ${i + 1} — text below the floor`);
                if (i > 0) assert.ok(bodyOf(p).every((t) => t.y < PAGE_H - CONTENT_TOP), `REGRESSION (§0.235 review): ${label}, page ${i + 1} — text above the page's body: a page pdfkit added itself`);
                const col = p.filter((t) => t.x === NAME_X && t.y >= FOOTER_H).map((t) => t.y).sort((a, b) => b - a);
                col.slice(1).forEach((y, k) => assert.ok(col[k] - y >= 7, `REGRESSION (§0.235 review): ${label}, page ${i + 1} — the product column's lines overlap (${col[k].toFixed(1)}, ${y.toFixed(1)}): a name over the next row`));
            });
            const holder = pages.findIndex((p) => words(p).includes('Annual Maintenance Contract - '));
            assert.ok(holder >= 0 && words(pages[holder]).includes('Coverage') && words(pages[holder]).includes('$777'), `${label}: the name whole, with its row's cells, on one page`);
            assert.ok(words(pages[holder]).includes('PRODUCT'), `${label}: under a column header`);
            assert.deepEqual(pages.flatMap(rowNames), items(n).map((it) => it.productName).filter((_, i) => i !== at), `${label}: every other row once, in order`);
        }
    }
});

test('ROWS: a name past three lines is cut with an ellipsis; a one-line row keeps its height; a service row holds its line', async () => {
    const giant = 'Product ' + 'name '.repeat(400);
    const [page] = await render({ ...quoteOf(2), lineItems: [{ productName: giant, productType: 'service', quantity: 1, listPrice: 5 }, ...items(2)] });
    const nameLines = page.filter((t) => t.x === NAME_X && t.y >= FOOTER_H && /^(Product )?(name ?)+/.test(t.text));
    assert.equal(nameLines.length, NAME_LINES, `REGRESSION (§0.235 review): a long name printed in ${nameLines.length} lines`);
    const flat = page.find((t) => t.text === 'flat fee');
    assert.ok(flat && nameLines.every((t) => t.y - flat.y >= 7), 'the service line under the name, not over it');
    // One-line rows: 22 and 28 points, as before §0.235 — the first row of each kind starts where the last one ends.
    const [one] = await render(quoteOf(3));
    const ys = ['Line 1', 'Line 2', 'Line 3'].map((w) => one.find((t) => t.text === w).y);
    assert.equal(+(ys[0] - ys[1]).toFixed(3), 22, 'a one-time row 22 points');
    assert.equal(+(ys[1] - ys[2]).toFixed(3), 28, 'a recurring row 28 points');
    // A service row 28 points: its "flat fee" line (16 down, 7 points) ran 2.5 points out of the old 22 (§0.235 review).
    const [svc] = await render({ ...quoteOf(0), lineItems: [{ productName: 'Svc', productType: 'service', quantity: 1, listPrice: 5 }, { productName: 'After', productType: 'one-time', quantity: 1, listPrice: 5 }] });
    assert.equal(+(svc.find((t) => t.text === 'Svc').y - svc.find((t) => t.text === 'After').y).toFixed(3), 28, 'REGRESSION (§0.235 review): a service row 22 points, its line out of it');
});

// ── TAX (state §0.241; docs/design/sales-tax R6) ─────────────────────────────
// The quote as stored: numerics as strings ("10.00", "8.25"), a line with no flag taxable, one switched off.

const TAXED_LINES = [
    { productName: 'Taxed thing', productType: 'one_time', unit: 'flat', quantity: 1, listPrice: 600, discountPct: 0 },
    { productName: 'Untaxed thing', productType: 'one_time', unit: 'flat', quantity: 1, listPrice: 400, discountPct: 0, taxable: false },
];
const taxedQuote = (extra = {}) => quoteOf(0, { lineItems: TAXED_LINES, dealDiscount: '10.00', taxRate: '8.25', taxExempt: false, ...extra });
// The totals block's words in the order written: from "Subtotal" to the four figures.
const totalsBlock = (page) => { const w = words(page); return w.slice(w.indexOf('Subtotal'), w.indexOf('QUOTE TOTAL')); };

test('TAX: the totals block — Subtotal, Deal discount, Tax (rate%), Total with the tax, to the cent; "Tax exempt"; no tax row on a quote with no rate', async () => {
    // 600 taxed + 400 not, 10% off, 8.25%: the tax on the taxed line's share after the discount (540) — 44.55.
    const [taxed] = await render(taxedQuote());
    assert.deepEqual(totalsBlock(taxed), ['Subtotal', '$1,000.00', 'Deal discount (10%)', '-$100.00', 'Tax (8.25%)', '$44.55', 'Total', '$944.55'],
        'REGRESSION (§0.241): the PDF\'s totals block is not the quote\'s, to the cent');
    const kpi = words(taxed);
    assert.equal(kpi[kpi.indexOf('QUOTE TOTAL') + 1], '$945', 'the Quote Total figure is the Total, with the tax (whole dollars, as the four figures are)');
    const [exempt] = await render(taxedQuote({ taxExempt: true }));
    assert.deepEqual(totalsBlock(exempt), ['Subtotal', '$1,000.00', 'Deal discount (10%)', '-$100.00', 'Tax exempt', '$0.00', 'Total', '$900.00'], 'an exempt quote says so, and is taxed nothing');
    // Written before tax: no rate, no switch, no flags — no tax row, its Total its pre-tax total, as before.
    const [older] = await render(taxedQuote({ taxRate: null, taxExempt: null, lineItems: TAXED_LINES.map(({ taxable, ...li }) => li) }));
    assert.deepEqual(totalsBlock(older), ['Subtotal', '$1,000.00', 'Deal discount (10%)', '-$100.00', 'Total', '$900.00'], 'REGRESSION (§0.241): a quote with no rate gains a tax row');
    const [zero] = await render(taxedQuote({ taxRate: '0.00', dealDiscount: '0.00' }));
    assert.deepEqual(totalsBlock(zero), ['Subtotal', '$1,000.00', 'Tax (0%)', '$0.00', 'Total', '$1,000.00'], 'a rate of 0 is a rate: shown, nothing added');
    // The rows add up: the Subtotal less the discount, plus the tax, is the Total.
    const cents = (s) => Math.round(Number(s.replace(/[$,]/g, '')) * 100);
    const b = totalsBlock(taxed);
    assert.equal(cents(b[1]) + cents(b[3]) + cents(b[5]), cents(b[7]));
});

test('TAX: the block with its tax row kept with the four figures, after the last row, at every length; within the floor', async () => {
    for (const exempt of [false, true]) {
        for (let n = 0; n <= 45; n++) {
            const lineItems = items(n).map((it, i) => (i % 4 === 1 ? { ...it, taxable: false } : it));
            const pages = await render(quoteOf(n, { lineItems, dealDiscount: '10.00', taxRate: '8.25', taxExempt: exempt }));
            const label = `${n} lines, taxed${exempt ? ' (exempt)' : ''}`;
            floorChecks(pages, label);
            const SUMMARY = ['Subtotal', exempt ? 'Tax exempt' : 'Tax (8.25%)', 'Total', 'QUOTE TOTAL', 'AVG DISCOUNT'];
            const holders = SUMMARY.map((s) => pages.findIndex((p) => words(p).includes(s)));
            assert.ok(holders.every((h) => h >= 0), `${label}: the summary printed — ${JSON.stringify(holders)}`);
            assert.equal(new Set(holders).size, 1, `REGRESSION (§0.241): ${label} — the tax row and the figures split across pages ${JSON.stringify(holders)}`);
            assert.equal(holders[0], pages.length - 1, `${label}: the summary on the last page`);
            assert.deepEqual(pages.flatMap(rowNames), items(n).map((it) => it.productName), `${label}: every row once, in order`);
        }
    }
});

test('TAX: a total too wide for its column is cut to its one line — never a second line, never a page of pdfkit\'s own', async () => {
    const pages = await render(quoteOf(0, { lineItems: [{ productName: 'Big', productType: 'one_time', quantity: 1, listPrice: 99999999 }], taxRate: '8.25' }));
    assert.equal(pages.length, 1, 'REGRESSION (§0.241): a long total made a page');
    floorChecks(pages, 'a long total');
    const block = totalsBlock(pages[0]);
    assert.equal(block.length, 6, `REGRESSION (§0.241): a totals text wrapped onto a second line — ${JSON.stringify(block)}`);
    assert.equal(block[4], 'Total');
});

// ── WIRING ───────────────────────────────────────────────────────────────────

test('WIRING: the handler renders through this layout, and the layout is the only pdfkit importer', () => {
    const fn = read('netlify/functions/quote-pdf.mjs');
    assert.ok(fn.includes("import { buildPDF } from './_quotePdf.mjs';"), 'the handler imports the paginated layout');
    assert.ok(!fn.includes('function buildPDF') && !fn.includes("from 'pdfkit'"), 'REGRESSION (§0.235): a second layout in the handler');
    const layout = read('netlify/functions/_quotePdf.mjs');
    assert.ok(layout.includes("import PDFDocument from 'pdfkit';") && layout.includes('bufferPages: true,'), 'pdfkit, every page kept for its footer');
    assert.equal(CONTENT_BOTTOM, PAGE_H - FOOTER_H - 12, 'the content floor above the footer band');
});

test('the suites: this file is graded by the harness', () => {
    const suites = read('scripts/mutate-import.mjs').match(/^const SUITES = '([^'\n]*)';$/m)?.[1].split(' ') ?? [];
    assert.ok(suites.includes('tests/quote-pdf-pages.test.mjs'), 'SUITES runs this file');
});
