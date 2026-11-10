<!-- Sales tax on quotes (OPEN_ITEMS §3.2; Jeff, 9 Nov: "add sales tax calculation to quotes to our to do list"; 10 Nov: "…then sales tax on quotes"): the design, 10 Nov 2026, over 2769fd8. Read by five read-only mappers (the quote's money paths, the invoice tax pattern, customer documents, products and customers, a SELECT-only census) and a critic (load-bearing claims confirmed; five corrected, below). Questions: §5 — answered 10 Nov (ANSWERS.md): the rate by customer location, built in two batches (§6); the rest each the Recommended. Research on the rate services: RESEARCH.md. -->

# Design: a quote carries sales tax — a rate stored on the quote, taxable lines, an exempt switch — kept out of the deal's revenue and carried to the job's invoice

## 1. What is there today (read 10 Nov over 2769fd8)

- **A quote carries no tax anywhere.** `quotes` (db/schema.ts:622-658) stores `subtotal`, `deal_discount`, `total_value`, `recurring_value`, `one_time_value`; lines are jsonb `{ productId, productName, productType, unit, listPrice, quantity, discountPct, customPrice }`; `products` has no taxable field. The census: **no quote, product or settings row holds any tax data in any org** — nothing to migrate.
- **Dispatch invoices do:** `invoices.tax_rate` numeric(5,2) and `tax_amount` (schema.ts:687-688), a `taxable` flag per line (default true), `invoiceTotals` (src/utils/invoices.js:188 — tax on taxable lines, the rate clamped 0-100). One invoice in the whole database has a non-zero rate (8.25). A new invoice's rate is the request's or 0 (invoices.mjs:152); nothing defaults it. `dispatch_customers.tax_exempt` exists (schema.ts:1007) and nothing but its own endpoint reads it.
- **The quote's money is computed five times** (the critic): the server's `calcTotals` (quotes.mjs:120 — stored, recomputed on every save), the screens' `calcLineTotals` (QuotesTab.jsx:96 — which ignores the deal discount), the PDF's (_quotePdf.mjs:60 — from the request body), the email's line rows, and the QA seed's (scripts/qa-seed-plan.mjs:32); the job line a sixth (`quoteLineToJobItem`, invoices.js:258). `invoiceTotals` cannot be reused as is: quote lines carry `listPrice` and `discountPct`, no `unitPrice` (it would read every quote line as 0), and a quantity of 0 reads 0 there, 1 on a quote.
- **The deal's revenue is the quote's total.** Accepting a quote writes `opportunities.arr = totalValue` (`syncToOpportunity`, quotes.mjs:190-195, :448-453). **Tax must never enter `totalValue`**, or a taxed quote raises pipeline revenue.
- **Every save recomputes the totals**, status moves included (quotes.mjs:382, :459): a rate read live from settings would reprice Sent and Accepted quotes when an Admin changes the default. **The rate must be stored on the quote.**
- **The edit lock** (`QUOTE_TERMS_FIELDS`, quoteRules.js:41; `quoteTermsChanged`, :246-277) must hold the rate, the exempt switch and each line's flag — with the rate compared as a number (the database answers `"8.25"`) and a line with no flag read as taxable (else every older quote reads "changed": an Approved one falls to Draft, a Sent one's save is refused — the critic's correction).
- **Found on the way, not tax:** the quote email's line rows read `li.qty` and `li.unitPrice` (quote-email.mjs:161-163), which no line carries — every row shows Qty 1 at list price, not adding up to the Total; a quote's deal discount never reaches its job or invoice (quote-to-job.mjs:184-200); the quote PDF prints the request body with only a sign-in check (quote-pdf.mjs:41-54) — no deal-access check, the client's numbers on a customer document; the screens round money to whole dollars (QuotesTab.jsx:25-32, _quotePdf.mjs:52), so a tax row to the cent would not add up.

## 2. The design (the recommendations; §5 asks the choices)

**R1 — One quote money function** (`src/utils/quoteTotals.js`, pure): per line the net price and line total; the subtotal; the deal discount; the taxable base (taxable lines, after the deal discount, pro rata); the tax to the cent; `totalValue` (pre-tax, as today); `grandTotal` (with tax); recurring and one-time as today. The server, the screens, the PDF, the email and the seed all call it — the five copies go.

**R2 — The quote stores its tax**: `quotes.tax_rate` numeric(5,2), `quotes.tax_amount` numeric(12,2), `quotes.tax_exempt` boolean — additive, nullable (Jeff's go, an apply script, the test database first). A new quote is filled with the org's default rate (R3); the server recomputes `tax_amount` on every save from the stored rate; `totalValue` stays pre-tax, so the deal's revenue and every revenue report are unchanged. The rate, the exempt switch and each line's `taxable` join the edit lock; a new version copies them.

**R3 — The org's default rate**: in Settings → Quotes (the defaults the panel already keeps, `quoteDefaults`, read through one clamped reader — the blob is stored unvalidated today), 0-100, two places.

**R4 — Taxable lines**: a product carries `taxable` (new nullable column; none = taxable); a line copies it when added and may be switched per line; a line with no flag reads taxable.

**R5 — Exempt**: a quote-level "Tax exempt" switch (no tax, said on the documents), filled on a new quote from the deal's linked dispatch customer's `tax_exempt` where there is one.

**R6 — The documents**: the preview, the PDF, the print copy and the email show Subtotal, Deal discount (where set), Tax (rate%) or "Tax exempt", and Total — money to the cent in that block; the PDF row bounded (§18b118 rule 3).

**R7 — To the job's invoice**: the job's lines keep each line's taxable flag; the invoice's rate defaults to the quote's (0 when exempt), still editable on the invoice; the deal discount carries as a discount line (the found gap).

## 3. What is out

Tax by location through an outside service (an address leaves the app — Jeff's privacy call, a batch of its own). Multiple taxes per line (state + county). A CRM account exemption field (guide §12b keeps tax data off the CRM record). Currency.

## 4. Schema

`quotes.tax_rate numeric(5,2)`, `quotes.tax_amount numeric(12,2)`, `quotes.tax_exempt boolean`, `products.taxable boolean` — each nullable, no default rewrite; `ALTER TABLE … ADD COLUMN IF NOT EXISTS`, read back; the test database, then the app database (shared by dev and prod; prod's code never names them) — Jeff's go when built.

## 5. Questions

Asked in the dialog, each with its Recommended first; answered 10 Nov — ANSWERS.md.

## 6. Two batches (Jeff, 10 Nov: "Tax now, lookup next")

**Batch A — tax on quotes (now):** R1-R7 above, the rate from the org's default (R3) and changeable on each quote. Every quote stores its rate (R2), so batch B only changes where a new rate comes from. Also: the quote email's line rows read through R1 (the found row bug), the deal discount carried to the job (R7), and the quote PDF reading the stored quote by id in the org with the deal-access check, so the tax a customer sees is the server's figure.

**Batch A built 10 Nov** (state §0.241; guide §18b124; NOT committed; harness deferred): R1-R7 and the three found items above; the four columns applied 10 Nov on Jeff's go ("Apply it now (Recommended)") to the test and app databases. Two answers of 10 Nov, asked after its second review (ANSWERS.md Q9, Q10): each line's net price rounded to the cent, then times its quantity ("Round each line (Recommended)"), and a taxable credit lowering the tax, below 0 too ("Credit lowers tax (Recommended)") — so the job's invoice is the quote to the cent. A rate with three decimal places (8.875%) cannot be stored (numeric(5,2)) — batch B's to decide (OPEN_ITEMS §3.2).

**Batch B — the rate by the customer's location (next; gated on Zip-Tax's written answers):** one AcceleRep Zip-Tax account for every org (Q6), only the address sent; the deal's account address with a per-quote override (Q7); on no usable address or a failed lookup the org's default, marked "default rate (no address)" (Q8); a snapshot stored on the quote (rate, jurisdiction lines, precision, date, vendor), looked up again for an invoice only when the address changed; a manual override recorded as one; the vendor behind one server-side interface so an org's own Avalara or Stripe account can plug in later. Before it is built Jeff gets from Zip-Tax in writing: (1) one account serving many client businesses is allowed (their agreement §8.2 no-resale, §4.2 internal use); (2) the paid plan includes street-address lookups; (3) a data processing agreement, and their position on storing the looked-up rates (RESEARCH.md).
