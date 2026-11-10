# Sales tax on quotes — Jeff's answers (10 Nov 2026)

The design: DESIGN.md beside this file (over 2769fd8). Asked 10 Nov in the dialog, each question standing on its own. The rate's source took a second round, after a web research pass on the US sales-tax rate services (docs/design/sales-tax/RESEARCH.md — sources dated 10 Nov 2026).

| # | Asked | Answer |
|---|---|---|
| Q1 | Where a quote's tax rate comes from | **"By customer location"** — the rate looked up from the customer's address (not the Recommended org default) |
| Q2 | Which lines are taxed | **"Per product, per line (Recommended)"** — a Taxable switch on each product (on by default), copied onto a line when added and switchable on the quote; older lines read as taxable |
| Q3 | Tax-exempt customers | **"Quote switch, prefilled (Recommended)"** — a "Tax exempt" switch on the quote, on for a new quote when the deal's linked Dispatch customer is marked exempt |
| Q4 | Tax carried to the job's invoice | **"Carry it (Recommended)"** — the job keeps each line's taxable flag; the invoice's rate defaults to the quote's (0 if exempt), editable there |
| Q5 | Phasing the lookup | **"Tax now, lookup next (Recommended)"** — batch A builds tax on quotes with an org default rate the rep can change per quote; batch B adds the address lookup once Zip-Tax confirms multi-business use, street-address lookups and a data agreement in writing |
| Q6 | Whose account calls the tax service | **"One app account (Recommended)"** — AcceleRep holds one Zip-Tax account for every org (only the address is sent), built so an org could later link its own Avalara or Stripe account |
| Q7 | Which address decides the rate | **"Deal's account address (Recommended)"** — with a per-quote override for a job at another site |
| Q8 | No usable address, or the lookup fails | **"Org default, marked (Recommended)"** — the org's default rate, shown as "default rate (no address)", editable; the quote still saves and sends |

Still Jeff's: Zip-Tax's three written answers (batch B's gate); the schema apply when batch A is built.
