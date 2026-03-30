/**
 * quote-pdf.mjs
 * Netlify serverless function — generates a polished quote PDF via pdfkit.
 *
 * POST body: { quote, opportunity, lines }
 *   quote       — the quote record from the DB
 *   opportunity — the linked opportunity record
 *   lines       — calculated line items array (from calcLineTotals in QuotesTab)
 *
 * Returns: application/pdf binary response
 *
 * Install dependency: npm install pdfkit
 */

import PDFDocument from 'pdfkit';
import { verifyAuth } from './auth.mjs';

const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Colour palette (matches Accelerep warm stone) ────────────────────────────
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

// ── PDF builder ───────────────────────────────────────────────────────────────
function buildPDF(quote, opportunity, inputLines) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'LETTER',
            margins: { top: 0, bottom: 40, left: 0, right: 0 },
            info: {
                Title:   quote.name || quote.quoteNumber || 'Quote',
                Author:  'Accelerep CRM',
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

        // ── HEADER BAND ────────────────────────────────────────────────────
        doc.rect(0, 0, PW, 88).fill(hex(COLOR.nearBlack));

        // Gold accent bar
        doc.rect(ML, 20, 4, 48).fill(hex(COLOR.gold));

        // Company / app name
        doc.fillColor(hex(COLOR.gold)).fontSize(9).font('Helvetica-Bold')
            .text('ACCELEREP CRM', ML + 14, 22, { characterSpacing: 1.5 });

        // Quote name
        doc.fillColor(hex(COLOR.cream)).fontSize(18).font('Helvetica-Bold')
            .text(quote.name || quote.quoteNumber || 'Sales Quote', ML + 14, 36, { width: CW - 160 });

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
        let y = 100;
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
            doc.fillColor(hex(COLOR.nearBlack)).fontSize(9).font('Helvetica')
                .text(value, x, y + 12, { width: metaW - 8 });
        });

        // Divider
        y += 34;
        doc.moveTo(ML, y).lineTo(MR, y).lineWidth(0.5).strokeColor(hex(COLOR.border)).stroke();
        y += 12;

        // ── LINE ITEMS TABLE ───────────────────────────────────────────────
        // Table header
        const cols = [
            { label: 'Product',    x: ML,       w: 170, align: 'left'  },
            { label: 'Type',       x: ML + 170, w: 72,  align: 'left'  },
            { label: 'Qty',        x: ML + 242, w: 36,  align: 'right' },
            { label: 'Unit Price', x: ML + 278, w: 76,  align: 'right' },
            { label: 'Disc %',     x: ML + 354, w: 52,  align: 'right' },
            { label: 'Total',      x: ML + 406, w: CW - 406, align: 'right' },
        ];

        // Header background
        doc.rect(ML, y, CW, 18).fill(hex(COLOR.stone));
        cols.forEach(col => {
            doc.fillColor(hex(COLOR.muted)).fontSize(7).font('Helvetica-Bold')
                .text(col.label.toUpperCase(), col.x + 4, y + 5, { width: col.w - 4, align: col.align, characterSpacing: 0.6 });
        });
        y += 18;

        // Line rows
        if (lines.length === 0) {
            doc.rect(ML, y, CW, 28).fill(hex(COLOR.white));
            doc.fillColor(hex(COLOR.dimmed)).fontSize(9).font('Helvetica')
                .text('No line items', ML + 4, y + 10, { width: CW - 8, align: 'center' });
            y += 28;
        } else {
            lines.forEach((item, idx) => {
                const rowH = item.productType === 'recurring' ? 28 : 22;
                // Alternating row bg
                doc.rect(ML, y, CW, rowH).fill(hex(idx % 2 === 0 ? COLOR.white : COLOR.stone));

                // Product name
                doc.fillColor(hex(COLOR.nearBlack)).fontSize(8.5).font('Helvetica-Bold')
                    .text(item.productName || '—', cols[0].x + 4, y + 5, { width: cols[0].w - 8 });
                if (item.productType === 'recurring') {
                    doc.fillColor(hex(COLOR.dimmed)).fontSize(7).font('Helvetica')
                        .text('/mo × 12 months', cols[0].x + 4, y + 16, { width: cols[0].w - 8 });
                } else if (item.productType === 'service') {
                    doc.fillColor(hex(COLOR.dimmed)).fontSize(7).font('Helvetica')
                        .text('flat fee', cols[0].x + 4, y + 16, { width: cols[0].w - 8 });
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
        y += 16;

        // ── TOTALS BLOCK ───────────────────────────────────────────────────
        const totalsX = ML + CW - 220;
        const totalsW = 220;

        const totalsRows = [
            { label: 'Subtotal',           value: fmtMoney(subtotal),       bold: false },
        ];
        if (Number(quote.dealDiscount) > 0) {
            totalsRows.push({ label: 'Deal Discount (' + quote.dealDiscount + '%)', value: '−' + fmtMoney(subtotal * Number(quote.dealDiscount) / 100), bold: false, color: COLOR.amber });
        }
        totalsRows.push({ label: 'Total',   value: fmtMoney(totalValue),    bold: true });

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

        // ── KPI STRIP ──────────────────────────────────────────────────────
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
        y += 52;

        // ── NOTES / TERMS ──────────────────────────────────────────────────
        if (quote.notes && quote.notes.trim()) {
            y += 8;
            doc.fillColor(hex(COLOR.muted)).fontSize(7.5).font('Helvetica-Bold')
                .text('NOTES & TERMS', ML, y, { characterSpacing: 0.8 });
            y += 12;
            doc.fillColor(hex(COLOR.nearBlack)).fontSize(8.5).font('Helvetica')
                .text(quote.notes, ML, y, { width: CW, lineGap: 2 });
            y += doc.heightOfString(quote.notes, { width: CW, lineGap: 2 }) + 8;
        }

        // ── FOOTER ─────────────────────────────────────────────────────────
        const footerY = PH - 36;
        doc.rect(0, footerY, PW, 36).fill(hex(COLOR.stone));
        doc.moveTo(0, footerY).lineTo(PW, footerY).lineWidth(0.5).strokeColor(hex(COLOR.border)).stroke();

        doc.fillColor(hex(COLOR.dimmed)).fontSize(7.5).font('Helvetica')
            .text('Generated by Accelerep CRM · ' + new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
                ML, footerY + 12, { width: CW / 2 });

        const qNum = quote.quoteNumber || '';
        const ver  = 'v' + (quote.version || 1);
        doc.fillColor(hex(COLOR.dimmed)).fontSize(7.5).font('Helvetica')
            .text(qNum + ' · ' + ver, MR - CW / 2, footerY + 12, { width: CW / 2, align: 'right' });

        doc.end();
    });
}

// ── Handler ───────────────────────────────────────────────────────────────────
export const handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    // Auth check
    const auth = await verifyAuth(event);
    if (auth.error) {
        return { statusCode: auth.status || 401, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: auth.error }) };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { quote, opportunity, lines } = body;

        if (!quote) {
            return { statusCode: 400, headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'quote is required' }) };
        }

        const pdfBuffer = await buildPDF(quote, opportunity, lines);

        const filename = (quote.quoteNumber || 'quote') + '-v' + (quote.version || 1) + '.pdf';

        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="' + filename + '"',
                'Content-Length': String(pdfBuffer.length),
            },
            body: pdfBuffer.toString('base64'),
            isBase64Encoded: true,
        };
    } catch (err) {
        console.error('quote-pdf error:', err.message);
        return {
            statusCode: 500,
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: err.message }),
        };
    }
};
