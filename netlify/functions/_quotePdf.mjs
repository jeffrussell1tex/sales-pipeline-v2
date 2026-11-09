/**
 * _quotePdf.mjs — the quote PDF's layout (state §0.235): what quote-pdf.mjs draws, apart from its handler, so a unit
 * suite can render it (tests/quote-pdf-pages.test.mjs) — no database, no auth, only pdfkit and the org identity rule.
 *
 * The PDF paginates. Until §0.235 it laid one page out by fixed positions and never started another itself; pdfkit
 * starts a page for every text drawn below the page's bottom margin, so the quote number alone made a second page
 * on every quote, and a quote of ~16 lines or more, or long notes, came out as one fragment a page (a 25-line quote:
 * 31 pages). Now:
 *   - the header band (the org, the quote name, the status) on page 1 only;
 *   - a row that does not fit goes to a new page, under the table's column header drawn again;
 *   - the totals and the four figures kept together — a new page whole when they do not fit;
 *   - the notes wrapped here, line by line, onto new pages as they need — never over the footer;
 *   - every page's footer: the org and the date; the quote number and version, and "Page i of N" when there are more;
 *   - nothing of the body below CONTENT_BOTTOM, and every footer text bounded (no page of its own).
 */

import PDFDocument from 'pdfkit';
import { contactLineOf } from '../../src/utils/orgIdentity.js';

// ── Colour palette (the house warm stone) ────────────────────────────────────
const COLOR = {
    nearBlack:  '#1c1917',
    cream:      '#f5f1eb',
    stone:      '#f0ece4',
    gold:       '#c8b99a',
    border:     '#ddd8cf',
    muted:      '#78716c',
    dimmed:     '#a8a29e',
    blue:       '#2563eb',
    green:      '#16a34a',
    amber:      '#d97706',
    purple:     '#7c3aed',
    red:        '#dc2626',
    white:      '#ffffff',
};

// The page (LETTER, in points) and its bands.
export const PAGE_H         = 792;
export const FOOTER_H       = 36;                        // the footer band, at the foot of every page
export const CONTENT_TOP    = 36;                        // where a continued page's body starts
export const CONTENT_BOTTOM = PAGE_H - FOOTER_H - 12;    // 744 — nothing of the body is drawn below this
export const NAME_LINES     = 3;                         // a product name prints in up to three lines, then an ellipsis
export const TITLE_LINES    = 2;                         // the quote name, in the header band: two lines, then an ellipsis
export const META_LINES     = 2;                         // a meta value (the opportunity, the rep, …): two lines, then an ellipsis

// Convert hex to [r, g, b] 0-255
function hex(h) {
    const c = h.replace('#', '');
    return [parseInt(c.slice(0,2),16), parseInt(c.slice(2,4),16), parseInt(c.slice(4,6),16)];
}

function fmtMoney(n) {
    return '$' + (parseFloat(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function pct(n) {
    return (parseFloat(n) || 0).toFixed(1) + '%';
}

function calcTotals(lineItems = [], dealDiscountPct = 0) {
    let subtotal = 0, recurring = 0, oneTime = 0;
    const lines = lineItems.map(item => {
        const qty  = Number(item.quantity)   || 1;
        const list = Number(item.listPrice)  || 0;
        const disc = Math.min(Math.max(Number(item.discountPct) || 0, 0), 100);
        const net  = list * (1 - disc / 100);
        const total = net * qty;
        subtotal += total;
        if (item.productType === 'recurring') {
            recurring += item.unit === 'month' ? total * 12 : total;
        } else {
            oneTime += total;
        }
        return { ...item, netPrice: net, lineTotal: total };
    });
    const discAmt  = subtotal * (Number(dealDiscountPct) || 0) / 100;
    const total    = subtotal - discAmt;
    const avgDisc  = lineItems.length > 0
        ? lineItems.reduce((a, i) => a + (Number(i.discountPct) || 0), 0) / lineItems.length
        : 0;
    return { lines, subtotal, totalValue: total, recurringValue: recurring, oneTimeValue: oneTime, avgDisc };
}

// What pdfkit can print of a typed text: a tab as four spaces, any other control character gone. pdfkit 0.18 writes
// a character below 0x10 as ONE hex digit, which throws every later byte of its run out of step — "Col A\tCol B"
// printed "Col A6öÂ…" (§0.235 review).
export const printable = (text) => String(text).replace(/\t/g, '    ').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '');

// The notes as the lines they print in, `width` wide in the doc's current font and size: each paragraph of the text
// wrapped where it has spaces, its own spacing and indentation kept (aligned terms stay aligned); a break eats the
// spaces it falls on; a word wider than a line broken where it must be; a blank line kept.
export function wrapLines(doc, text, width) {
    const out = [];
    const fitsIn = (s) => doc.widthOfString(s) <= width;
    for (const para of printable(String(text).replace(/\r\n?/g, '\n')).split('\n')) {
        let line = '';
        for (const tok of para.match(/ +|[^ ]+/g) || []) {
            if (fitsIn(line + tok)) { line += tok; continue; }
            if (tok.startsWith(' ')) { out.push(line); line = ''; continue; }   // the break falls on these spaces
            if (line.trim()) { out.push(line.trimEnd()); line = tok; } else line += tok;   // indentation stays with its word
            while (!fitsIn(line)) {
                let cut = line.length - 1;
                while (cut > 1 && !fitsIn(line.slice(0, cut))) cut--;
                out.push(line.slice(0, cut));
                line = line.slice(cut);
            }
        }
        out.push(line.trimEnd());
    }
    return out;
}

// ── PDF builder ───────────────────────────────────────────────────────────────
// `identity` is the sending org's (src/utils/orgIdentity.js): its name, address lines, phone and email. Rendered and
// read back by tests/quote-pdf-pages.test.mjs (the pages) and tests/integration/quote-branding.itest.mjs (the org).
export function buildPDF(quote, opportunity, inputLines, identity) {
    return new Promise((resolve, reject) => {
        const org = identity || { name: '', addressLines: [], phone: '', email: '' };
        const doc = new PDFDocument({
            size: 'LETTER',
            margins: { top: 0, bottom: 40, left: 0, right: 0 },
            bufferPages: true,   // every page kept until the end, so each gets its footer and its "Page i of N"
            info: {
                Title:   quote.name || quote.quoteNumber || 'Quote',
                ...(org.name ? { Author: org.name } : {}),
                Subject: 'Sales Quote',
            },
        });

        const bufs = [];
        doc.on('data', d => bufs.push(d));
        doc.on('end',  () => resolve(Buffer.concat(bufs)));
        doc.on('error', reject);

        const PW = doc.page.width;   // 612
        const PH = doc.page.height;  // 792
        const ML = 48;  // margin left
        const MR = PW - 48; // margin right
        const CW = MR - ML; // content width = 516

        const { lines, subtotal, totalValue, recurringValue, oneTimeValue, avgDisc } =
            calcTotals(inputLines || quote.lineItems || [], quote.dealDiscount || 0);

        const oppName  = opportunity ? (opportunity.opportunityName || opportunity.account || '') : '';
        const repName  = quote.createdBy || '';

        // ── HEADER BAND (page 1) ───────────────────────────────────────────
        // The sending org's address lines, then its phone · email, under the quote name; taller when there are any.
        const contactLines = [...(org.addressLines || []), contactLineOf(org)].map(printable).filter(Boolean).slice(0, 3);
        const hasContactInfo = contactLines.length > 0;
        // The quote name in up to two lines (then an ellipsis); what its second line takes moves the contact lines and
        // the band down — at a fixed 60 a wrapped name printed over the org's address (§0.235, Karen's own quote).
        const quoteName = printable(quote.name || quote.quoteNumber || 'Sales Quote');
        doc.fontSize(18).font('Helvetica-Bold');
        const titleLineH = doc.currentLineHeight(true);
        const titleLines = Math.min(TITLE_LINES, Math.max(1, Math.round(doc.heightOfString(quoteName, { width: CW - 160 }) / titleLineH)));
        const titleExtra = (titleLines - 1) * titleLineH;
        const headerH = (hasContactInfo ? 110 : 88) + titleExtra;
        doc.rect(0, 0, PW, headerH).fill(hex(COLOR.nearBlack));

        // Gold accent bar
        doc.rect(ML, 20, 4, (hasContactInfo ? 68 : 48) + titleExtra).fill(hex(COLOR.gold));

        // The sending org's name — never the app's (state §0.234); none, no line.
        if (org.name) {
            doc.fillColor(hex(COLOR.gold)).fontSize(9).font('Helvetica-Bold')
                .text(org.name.toUpperCase(), ML + 14, 22, { characterSpacing: 1.5, width: CW - 160, height: 11, ellipsis: true });
        }

        // Quote name, bounded to its lines
        doc.fillColor(hex(COLOR.cream)).fontSize(18).font('Helvetica-Bold')
            .text(quoteName, ML + 14, 36, { width: CW - 160, height: titleLines * titleLineH + 1, ellipsis: true });

        // The org's address and contact below the quote name
        contactLines.forEach((line, i) => {
            doc.fillColor(hex(COLOR.dimmed)).fontSize(7.5).font('Helvetica')
                .text(line, ML + 14, 60 + titleExtra + i * 11, { width: CW - 160, height: 10, ellipsis: true });
        });

        // Quote number + version top-right
        doc.fillColor(hex(COLOR.dimmed)).fontSize(8).font('Helvetica')
            .text(quote.quoteNumber || '', MR - 120, 22, { width: 120, align: 'right' });
        doc.fillColor(hex(COLOR.dimmed)).fontSize(8)
            .text('Version ' + (quote.version || 1), MR - 120, 34, { width: 120, align: 'right' });

        // Status badge (top right)
        const statusColors = {
            'Draft':            { bg: COLOR.dimmed,  fg: COLOR.cream },
            'Pending Approval': { bg: COLOR.amber,   fg: COLOR.white },
            'Approved':         { bg: COLOR.green,   fg: COLOR.white },
            'Sent to Customer': { bg: COLOR.blue,    fg: COLOR.white },
            'Accepted':         { bg: COLOR.green,   fg: COLOR.white },
            'Rejected / Lost':  { bg: COLOR.red,     fg: COLOR.white },
        };
        const sc = statusColors[quote.status] || statusColors['Draft'];
        doc.roundedRect(MR - 100, 48, 100, 18, 4).fill(hex(sc.bg));
        doc.fillColor(hex(sc.fg)).fontSize(7).font('Helvetica-Bold')
            .text((quote.status || 'DRAFT').toUpperCase(), MR - 100, 53, { width: 100, align: 'center', characterSpacing: 0.8 });

        // ── META ROW ───────────────────────────────────────────────────────
        let y = headerH + 12;
        // The body's room: does `h` more fit above the footer? If not, a new page, its body from the top.
        const fits    = (h) => y + h <= CONTENT_BOTTOM;
        const newPage = () => { doc.addPage(); y = CONTENT_TOP; };

        const metaItems = [
            ['Opportunity',   oppName   || '—'],
            ['Rep',           repName   || '—'],
            ['Valid Until',   quote.validUntil   || '—'],
            ['Payment Terms', quote.paymentTerms || '—'],
        ];
        const metaW = CW / metaItems.length;
        metaItems.forEach(([label, value], i) => {
            const x = ML + i * metaW;
            doc.fillColor(hex(COLOR.dimmed)).fontSize(7).font('Helvetica-Bold')
                .text(label.toUpperCase(), x, y, { width: metaW - 8, characterSpacing: 0.8 });
            // A value in up to two lines, then an ellipsis: a third ran past the divider into the table, and a very long
            // one gave the whole body a page of pdfkit's own (§0.235 review).
            doc.fillColor(hex(COLOR.nearBlack)).fontSize(9).font('Helvetica')
                .text(printable(value), x, y + 12, { width: metaW - 8, height: META_LINES * doc.currentLineHeight(true) + 1, ellipsis: true });
        });

        // Divider
        y += 34;
        doc.moveTo(ML, y).lineTo(MR, y).lineWidth(0.5).strokeColor(hex(COLOR.border)).stroke();
        y += 12;

        // ── LINE ITEMS TABLE ───────────────────────────────────────────────
        const cols = [
            { label: 'Product',    x: ML,       w: 170, align: 'left'  },
            { label: 'Type',       x: ML + 170, w: 72,  align: 'left'  },
            { label: 'Qty',        x: ML + 242, w: 36,  align: 'right' },
            { label: 'Unit Price', x: ML + 278, w: 76,  align: 'right' },
            { label: 'Disc %',     x: ML + 354, w: 52,  align: 'right' },
            { label: 'Total',      x: ML + 406, w: CW - 406, align: 'right' },
        ];

        // The column header — at the table's top, and again atop every page its rows continue on.
        const TABLE_HEAD_H = 18;
        const tableHead = () => {
            doc.rect(ML, y, CW, TABLE_HEAD_H).fill(hex(COLOR.stone));
            cols.forEach(col => {
                doc.fillColor(hex(COLOR.muted)).fontSize(7).font('Helvetica-Bold')
                    .text(col.label.toUpperCase(), col.x + 4, y + 5, { width: col.w - 4, align: col.align, characterSpacing: 0.6 });
            });
            y += TABLE_HEAD_H;
        };
        tableHead();

        // Line rows
        if (lines.length === 0) {
            doc.rect(ML, y, CW, 28).fill(hex(COLOR.white));
            doc.fillColor(hex(COLOR.dimmed)).fontSize(9).font('Helvetica')
                .text('No line items', ML + 4, y + 10, { width: CW - 8, align: 'center' });
            y += 28;
        } else {
            lines.forEach((item, idx) => {
                // The row is as tall as its product name (up to NAME_LINES lines, the rest cut with an ellipsis) and
                // the line under it — never a fixed height a long name runs out of: over the next row, or past the
                // floor, where pdfkit gave the name's tail a page of its own (§0.235 review).
                const name = printable(item.productName || '—');
                const sub  = item.productType === 'recurring' ? '/mo × 12 months' : item.productType === 'service' ? 'flat fee' : null;
                doc.fontSize(8.5).font('Helvetica-Bold');
                const nameW = cols[0].w - 8;
                const lineH = doc.currentLineHeight(true);
                // Counted in lines: heightOfString lands a hair off a whole number of lines, and a ceil of that hair
                // grew every row by a point (§0.235's own suite caught it).
                const nameLines = Math.min(NAME_LINES, Math.max(1, Math.round(doc.heightOfString(name, { width: nameW }) / lineH)));
                const nameH = nameLines * lineH;
                const extra = (nameLines - 1) * lineH;             // what a name past its first line adds; 0 for one line
                const subAt = 16 + extra;
                const rowH  = (sub ? 28 : 22) + Math.ceil(extra);   // a one-line row as before §0.235; a service row 28, its line inside it
                // A row that does not fit: a new page, under the column header again.
                if (!fits(rowH)) { newPage(); tableHead(); }
                // Alternating row bg
                doc.rect(ML, y, CW, rowH).fill(hex(idx % 2 === 0 ? COLOR.white : COLOR.stone));

                // Product name, bounded to its lines
                doc.fillColor(hex(COLOR.nearBlack)).fontSize(8.5).font('Helvetica-Bold')
                    .text(name, cols[0].x + 4, y + 5, { width: nameW, height: nameH + 1, ellipsis: true });
                if (sub) {
                    doc.fillColor(hex(COLOR.dimmed)).fontSize(7).font('Helvetica')
                        .text(sub, cols[0].x + 4, y + subAt, { width: nameW, height: 9, ellipsis: true });
                }

                // Type badge (text only, no box — keeps it clean in PDF)
                const typeLabel = item.productType === 'recurring' ? 'Recurring'
                    : item.productType === 'service' ? 'Service' : 'One-time';
                const typeColor = item.productType === 'recurring' ? COLOR.blue
                    : item.productType === 'service' ? COLOR.purple : COLOR.amber;
                doc.fillColor(hex(typeColor)).fontSize(7).font('Helvetica-Bold')
                    .text(typeLabel, cols[1].x + 4, y + 7, { width: cols[1].w - 4 });

                // Qty
                doc.fillColor(hex(COLOR.nearBlack)).fontSize(8.5).font('Helvetica')
                    .text(String(item.quantity || 1), cols[2].x, y + 7, { width: cols[2].w - 4, align: 'right' });

                // Unit price
                doc.fillColor(hex(COLOR.nearBlack)).fontSize(8.5).font('Helvetica')
                    .text(fmtMoney(item.listPrice), cols[3].x, y + 7, { width: cols[3].w - 4, align: 'right' });

                // Discount
                const discVal = Number(item.discountPct) || 0;
                doc.fillColor(discVal > 0 ? hex(COLOR.amber) : hex(COLOR.dimmed)).fontSize(8.5).font('Helvetica')
                    .text(discVal > 0 ? discVal + '%' : '—', cols[4].x, y + 7, { width: cols[4].w - 4, align: 'right' });

                // Line total
                doc.fillColor(hex(COLOR.nearBlack)).fontSize(8.5).font('Helvetica-Bold')
                    .text(fmtMoney(item.lineTotal), cols[5].x, y + 7, { width: cols[5].w - 4, align: 'right' });

                y += rowH;
            });
        }

        // Table bottom border
        doc.moveTo(ML, y).lineTo(MR, y).lineWidth(0.5).strokeColor(hex(COLOR.border)).stroke();

        // ── TOTALS BLOCK + KPI STRIP — kept together ───────────────────────
        const totalsX = ML + CW - 220;

        const totalsRows = [
            { label: 'Subtotal',           value: fmtMoney(subtotal),       bold: false },
        ];
        if (Number(quote.dealDiscount) > 0) {
            totalsRows.push({ label: 'Deal Discount (' + quote.dealDiscount + '%)', value: '−' + fmtMoney(subtotal * Number(quote.dealDiscount) / 100), bold: false, color: COLOR.amber });
        }
        totalsRows.push({ label: 'Total',   value: fmtMoney(totalValue),    bold: true });

        // The whole block's height: the gap, the totals rows, the rule, the four figures.
        const KPI_H = 52;
        const summaryH = 16 + totalsRows.reduce((h, row) => h + (row.bold ? 18 : 14), 0) + 12 + 16 + KPI_H;
        if (!fits(summaryH)) newPage();
        y += 16;

        totalsRows.forEach(row => {
            doc.fillColor(hex(row.color || COLOR.muted)).fontSize(8).font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
                .text(row.label, totalsX, y, { width: 130 });
            doc.fillColor(hex(row.bold ? COLOR.nearBlack : COLOR.muted)).fontSize(row.bold ? 11 : 8).font(row.bold ? 'Helvetica-Bold' : 'Helvetica')
                .text(row.value, totalsX + 130, y, { width: 90, align: 'right' });
            y += row.bold ? 18 : 14;
        });

        y += 12;
        doc.moveTo(ML, y).lineTo(MR, y).lineWidth(0.5).strokeColor(hex(COLOR.border)).stroke();
        y += 16;

        const kpis = [
            { label: 'Quote Total',        value: fmtMoney(totalValue),    color: COLOR.blue   },
            { label: 'Annual Recurring',   value: fmtMoney(recurringValue), color: COLOR.purple },
            { label: 'One-time / Services',value: fmtMoney(oneTimeValue),  color: COLOR.amber  },
            { label: 'Avg Discount',       value: pct(avgDisc),            color: avgDisc >= 15 ? COLOR.red : COLOR.green },
        ];
        const kpiW = CW / kpis.length;

        kpis.forEach((kpi, i) => {
            const kx = ML + i * kpiW;
            // Left accent bar
            doc.rect(kx, y, 3, 40).fill(hex(kpi.color));
            // Box outline
            doc.rect(kx, y, kpiW - 6, 40).lineWidth(0.5).strokeColor(hex(COLOR.border)).stroke();
            // Label
            doc.fillColor(hex(COLOR.dimmed)).fontSize(6.5).font('Helvetica-Bold')
                .text(kpi.label.toUpperCase(), kx + 10, y + 8, { width: kpiW - 20, characterSpacing: 0.5 });
            // Value
            doc.fillColor(hex(COLOR.nearBlack)).fontSize(14).font('Helvetica-Bold')
                .text(kpi.value, kx + 10, y + 18, { width: kpiW - 20 });
        });
        y += KPI_H;

        // ── NOTES / TERMS — line by line, onto new pages as they need ──────
        const notesText = (quote.notes && quote.notes.trim()) ? quote.notes : null;
        if (notesText) {
            y += 8;
            doc.fontSize(8.5).font('Helvetica');
            const noteLineH = doc.currentLineHeight() + 2;
            // Blank lines before the first and after the last dropped; the first line's indentation kept, as before §0.235.
            const noteLines = wrapLines(doc, notesText.replace(/^(?:[ \t]*\r?\n)+/, '').trimEnd(), CW);
            // The heading never stands alone at a page's foot: it goes with its first line.
            if (!fits(12 + noteLineH)) newPage();
            doc.fillColor(hex(COLOR.muted)).fontSize(7.5).font('Helvetica-Bold')
                .text('NOTES & TERMS', ML, y, { characterSpacing: 0.8 });
            y += 12;
            doc.fillColor(hex(COLOR.nearBlack)).fontSize(8.5).font('Helvetica');
            for (const line of noteLines) {
                if (!fits(noteLineH)) { newPage(); doc.fillColor(hex(COLOR.nearBlack)).fontSize(8.5).font('Helvetica'); }
                // Drawn as measured: with a width, pdfkit's own wrapper re-measures each word with its trailing space
                // and can push a line's last word below it — over the footer (§0.235's own test caught it).
                if (line) doc.text(line, ML, y, { lineBreak: false });
                y += noteLineH;
            }
        }

        // ── FOOTER — on every page ─────────────────────────────────────────
        const footerY = PH - FOOTER_H;
        const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        const qNum = quote.quoteNumber || '';
        const ver  = 'v' + (quote.version || 1);
        const { start, count } = doc.bufferedPageRange();
        for (let i = start; i < start + count; i++) {
            doc.switchToPage(i);
            doc.rect(0, footerY, PW, FOOTER_H).fill(hex(COLOR.stone));
            doc.moveTo(0, footerY).lineTo(PW, footerY).lineWidth(0.5).strokeColor(hex(COLOR.border)).stroke();

            // Both texts sit below the page's bottom margin: each bounded to its line, or pdfkit gives it a page.
            doc.fillColor(hex(COLOR.dimmed)).fontSize(7.5).font('Helvetica')
                .text((org.name ? org.name + ' · ' : '') + date,
                    ML, footerY + 12, { width: CW / 2, height: 10, ellipsis: true });

            const pageOf = count > 1 ? ' · Page ' + (i - start + 1) + ' of ' + count : '';
            doc.fillColor(hex(COLOR.dimmed)).fontSize(7.5).font('Helvetica')
                .text(qNum + ' · ' + ver + pageOf, MR - CW / 2, footerY + 12, { width: CW / 2, align: 'right', height: 10, ellipsis: true });
        }

        doc.end();
    });
}
