# Sales tax on quotes: options and decisions (synthesis, 10 Nov 2026)

This combines three research reports (capabilities, pricing, data and privacy). I re-checked the claims the decision depends on today, 10 Nov 2026, on the vendors' own pages: the Zip-Tax pricing and agreement, the Zip-Tax API reference, Stripe Tax pricing and the TaxJar terms. Only general queries were sent and no customer or company data left the machine. "[3rd-party]" means the claim comes from a competitor or aggregator. "UNVERIFIED" means no vendor page confirmed it.

## 1. Viable options

| Option | Address lookup | Taxability (services, labor) | Account model across many client businesses | Price now (vendor page) | Data handling |
|---|---|---|---|---|---|
| **Zip-Tax (zip.tax, "part of TaxCloud")**, rate lookup only | Street address, lat/lng or ZIP. A street address needs a plan with geocoding (`geo_enabled`); without it the API returns code 107. **Which plans include geocoding is not stated** | Per location only: `service.taxable` Y / N / L (L: "Services are not taxable, but the labor portion is taxable"). No per-item engine. Breakdown in `baseRates[]` (state, county, city, district) | **The only vendor that markets one platform account for many businesses.** A merchant is "A business on your platform that you add in Ziptax". Pro is "For platforms in production, with as many merchants as you have". **Conflict:** the agreement (updated 28 May 2025) bars "resell or sublicense" (§8.2), and §4.2 says keys are "for your internal use only". It has no caching clause | **Starter $0:** 100 calls/mo, 10 req/min, up to 3 merchants; the page states no commercial-use limit. **Pro $39/mo:** 1,500 to 250,000 calls, 500 req/min, $0.0325 per call over the tier, unlimited merchants | "AS IS", liability capped at 12 months of fees. **No DPA, SOC 2 report or subprocessor list found** |
| **Stripe Tax**, full engine | Full address, rooftop matching. Uses only the 5-digit part of a ZIP+4. Stripe recommends against ZIP-only in 19 states | `txcd_` codes exist for field-service work: repairs to real property, installation, landscaping, cleaning. Breakdown per line item | **One Connect connected account per org**, each with its own head office, tax code and registrations. Without a registration in the customer's location it "returns zero tax", so it is not a plain rate lookup | **Tax Basic:** 50¢ per transaction "where you're registered"; each transaction includes 10 calculation calls; 5¢ per call beyond that; "no recurring fees". A quote never invoiced still costs 5¢ per calculation. A calculation expires after 90 days | DPA updated 28 Sep 2026, SOC 1 and SOC 2, US hosting. The terms treat Stripe Tax data as "Stripe Data", which counsel should read |
| **Avalara AvaTax**, full engine | Full address with an address resolver | Full tax codes. Exemption certificates are a separate product | **Each org brings its own account** (account ID and license key), the pattern ServiceTitan uses for estimates and invoices. OEM and reseller terms are not published | **Select:** $79 per state per month (3-state minimum), or $69 per state per month with SST services (no minimum), per legal entity. API access on these plans is unconfirmed; a September 2026 article says custom APIs need the unpriced Custom plan [3rd-party]. 90-day trial | DPA v3.2 (2 Jun 2025), SOC 1 and SOC 2 Type 2, ISO 27001. Indemnity excludes tax-authority accuracy claims |
| **TaxJar** (Stripe-owned) | Full address ("Rooftop Accuracy") | Product categories; `nexus_addresses[]` on each request | **Poor fit:** the ToS (14 May 2026) bars "make the Service available to any third party". The API licence bars use "on behalf of any third party" and bars you to "cache or otherwise store any Content". **Storing the rate on a quote likely breaches that** | API only on Professional, $99/mo (200 orders); each call counts as 1/10 of an order | DPA, SOC 2 Type II |
| **TaxCloud** | Address verification (Premium) | Product codes (TICs), certificates | ToS: "solely for your internal business purposes"; §5.2 bars service-bureau use. **Not a platform option** | API on Premium only; price not shown on its page (about $79 [3rd-party, UNVERIFIED]) | No DPA or SOC 2 found. Free filing in SST states as a Certified Service Provider |
| State sources (WA DOR, CA CDTFA, SST files) | WA and CA by address; SST by ZIP+4 | None | Public | Free | **One state each, or SST states only.** No free national source exists |

Not viable: **API Ninjas** works by ZIP or city only, and its free plan allows no commercial use. **Avalara's old "free" TaxRates endpoint** is now described as "approximate … may not yield precise results" and its free status is UNVERIFIED. **Anrok** targets SaaS sellers, with no stated field-service coverage. **Vertex** is enterprise and sales-led.

## 2. Decisions you need to make

1. **Who holds the tax account?**
   - (a) AcceleRep holds one account that serves every org.
   - (b) Each org signs up with Avalara or Stripe and links its own account.
   - **Recommend (a) to start, with Zip-Tax, built so (b) can be added later.**
   - Why (a): it is the only model that costs a small business nothing to set up, and Zip-Tax is the only vendor that advertises it.
   - Why (b) too: Avalara and Stripe only work per org, so leave room for an org that already pays for one.
   - Every vendor's account is separate from org data, so isolation between orgs is unaffected.
2. **A rate lookup only, or a full tax engine?**
   - **Recommend rate lookup only for now.**
   - Each org sets the states it collects in, and each quote line gets a "taxable" checkbox (labor or parts).
   - Zip-Tax's `service.taxable` flag is shown as a hint, never applied on its own.
   - A full engine (Stripe or Avalara) costs per transaction or per state, and requires every org to set up its tax registrations first.
3. **Full street address or ZIP?**
   - **Recommend the full address.** A ZIP alone can under-collect local tax; Stripe warns against it in 19 states, including TX, CA, IL and CO.
   - This depends on Zip-Tax's Pro plan including geocoding (open question 2 below).
   - Store with the quote how precise the match was (address or ZIP).
4. **When to look the rate up?**
   - **Recommend looking it up when the quote is saved with an address, and storing a snapshot:** the rate, the breakdown, the precision, the date and the vendor.
   - When an invoice is made from the quote, look the rate up again only if the address changed or the quote is older than a set number of days (your choice, for example 30).
   - Always allow a manual override, recorded as such.
5. **Who pays the $39 per month?**
   - **Recommend AcceleRep absorbs it at first.** At $0.0325 per call, one lookup per quote costs pennies per org.
   - Decide later whether to charge for it as a feature.
6. **Data and liability.**
   - **Recommend sending the address only:** never the customer's name, email or line items.
   - Add Zip-Tax to the subprocessor list and ask Zip-Tax for a DPA, since none was found.
   - Print a line on quotes and invoices saying the rate was looked up on a stated date and the org is responsible for its tax.
   - Every vendor disclaims accuracy, so responsibility for the tax stays with the org.

## 3. Recommended default

- **Develop on Zip-Tax Starter**, which is free (100 calls a month, 3 merchants).
- **Go live on Zip-Tax Pro ($39 a month) under one AcceleRep account.**
- Look up by full street address, and store the rate, the jurisdiction lines, the precision, the date and the vendor on the quote.
- Each org sets its own collect-in states and default taxability for each line.
- Hide the vendor behind one small server-side interface, so an org's own Avalara or Stripe account can be plugged in later.

**Before you commit to this, get three things from Zip-Tax in writing:**

1. **Multi-business use:** that one account serving many client businesses ("merchants") is allowed despite the agreement's no-resale and internal-use clauses (§8.2, §4.2).
2. **Address lookups on Pro:** that Pro includes geocoded street-address lookups (`geo_enabled`), and whether the free Starter plan does too.
3. **Data terms:** a DPA, and their position on storing the looked-up rates on quotes.

If Zip-Tax says no to the first point, the fallback is decision 1(b): each org links its own Avalara account. TaxJar and TaxCloud are ruled out by their terms.

## 4. Sources (all read 10 Nov 2026 unless noted)

- Zip-Tax pricing (re-checked): https://www.zip.tax/pricing
- Zip-Tax Customer Agreement, updated 28 May 2025 (re-checked): https://www.zip.tax/customer-agreement
- Zip-Tax API reference (geocoding and code 107, `service.taxable`; re-checked): https://docs.zip.tax/api-reference
- Zip-Tax home page ("part of TaxCloud"): https://www.zip.tax/
- Stripe Tax pricing (re-checked): https://stripe.com/tax/pricing
- Stripe pay-as-you-go examples: https://support.stripe.com/questions/stripe-tax-api-pay-as-you-go-pricing-examples
- Stripe off-Stripe use and registration gate: https://docs.stripe.com/tax/off-stripe and https://docs.stripe.com/tax/custom
- Stripe Tax for platforms: https://docs.stripe.com/tax/tax-for-platforms
- Stripe customer locations (ZIP-only warning in 19 states): https://docs.stripe.com/tax/customer-locations
- Stripe tax codes: https://docs.stripe.com/tax/tax-codes
- Stripe DPA, 28 Sep 2026: https://stripe.com/legal/dpa
- TaxJar ToS and API licence, updated 14 May 2026 (re-checked): https://www.taxjar.com/terms-of-service
- TaxJar pricing: https://www.taxjar.com/pricing
- Avalara pricing: https://www.avalara.com/us/en/products/sales-and-use-tax/pricing.html
- Avalara Select blog, 19 Aug 2026: https://www.avalara.com/us/en/blog/avalara-select-sales-tax-pricing-small-businesses.html
- Avalara DPA, 2 Jun 2025: https://legal.avalara.com/dpa
- Avalara custom-API plan claim [3rd-party, Sep 2026]: https://zamp.com/article/avalara-pricing
- ServiceTitan's Avalara guide (per-customer keys), updated 15 Oct 2026: https://help.servicetitan.com/construction/docs/avalara-integration-guide.md
- Avalara JS SDK (TaxRates described as "approximate"): https://raw.githubusercontent.com/avadev/AvaTax-REST-V2-JS-SDK/master/lib/AvaTaxClient.ts
- TaxCloud ToS, March 2025: https://taxcloud.com/legal/tos/
- TaxCloud pricing: https://taxcloud.com/taxcloud-pricing
- API Ninjas pricing: https://api-ninjas.com/pricing
- WA DOR lookup: https://dor.wa.gov/wa-sales-tax-rate-lookup-url-interface
- CA CDTFA API: https://services.maps.cdtfa.ca.gov/
- SST rate and boundary files: https://www.streamlinedsalestax.org/quick-links/r-b-files

Older than 2025, kept only for context: Avalara's 2015 TaxRates launch blog (now a 404), the TaxJar order-counting article (5 Jun 2024), and the TaxJar guarantee article (26 Jul 2022).

A web search for Zip-Tax's geocoding plan (10 Nov 2026) returned no zip.tax page, so that point stays open.