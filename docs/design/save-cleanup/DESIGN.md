<!-- The save cleanup batch (Jeff, 10 Nov: "Cleanup batch" — from the items state §0.241 filed): the design, 10 Nov 2026, over bb0c88e. Read by four read-only mappers (the products endpoint and the PUT class; day labels from a timestamp; percents a write takes unchecked; refusals nobody is told) and a designer with a critic (three load-bearing claims re-read). Questions answered 10 Nov (ANSWERS.md): Parts 1-4 now, Parts 5-6 the next batch; every other answer the Recommended. The maps are in the session transcript; their findings are cited below by file:line. -->

# Design: a save writes only what it names, in range, and says when it is refused; a day shown is the member's day

## The batch

**Parts 1-4 built 10 Nov** (state §0.242; guide §18b125; NOT committed; harness deferred) as answered (ANSWERS.md), with two changes at build: the products POST stamps the caller's name, not `auth.userId` (the column's stored values, read 10 Nov, were names: 6 of 18 rows, the rest none), and the itest is tests/integration/save-cleanup.itest.mjs; `products.custom_price` applied 10 Nov on Jeff's go to the test and app databases. Parts 5 and 6 are the next batch (OPEN_ITEMS §1 item 6).

### Part 1: Products (server, Price Book, refusal)

**1a. products.mjs PUT becomes a strict update.**
- Read the row in the caller's org. If there is none, answer 404 (Q1) and write nothing.
- Use `db.update(products).set(changes).where(id AND orgId).returning()`, where `changes` holds only the keys the body names. Never `createdBy`, `orgId` or `createdAt`.
- `minPrice` is written only when the body names it; `''` or null becomes null.
- `listPrice` is checked only when named. Null, blank or not a number is a 400 `{error, field:'listPrice'}`, unless custom price is on (Q2 option A).
- `name`, when named, must not be blank: 400 `field:'name'`.
- `taxable` keeps its refusal as it is today.
- Audit `product.updated` only on a real update.
- This removes the 500 a partial body hits on the insert's NOT NULL check (see CRITIC 1), the unknown-id create, and the `minPrice` wipe.

**1b. products.mjs POST.**
- `createdBy` becomes `auth.userId`; the body's value is dropped.
- `listPrice` that is not a number is a 400.
- An id that already exists becomes `onConflictDoNothing` and a 409 "That id is already in use", as in the accounts §0.199 pattern. Today an id held by another org is a primary-key 500.

**1c. Custom / Variable Price (Q2).**
- Recommended option A: add a nullable boolean column `products.custom_price`. It is additive and nullable, applied by `db/apply-product-custom-price.mjs` (checks only without `--apply`, with a `--test` path, as `db/apply-sales-tax.mjs` does) on Jeff's go, since dev and prod share Neon main.
- `customPrice` goes into ALLOWED_FIELDS. A custom-price product stores `listPrice '0'`.
- The readers already exist (QuotesTab :620/623/693/764/1284/1292, quoteTemplates.js :65/68). Today they always read false.
- `tests/integration/_schema-guard.mjs` adds the column.

**1d. The Price Book sends only what changed.**
- New pure helper `productChanges(stored, form)` in `src/utils/productChanges.js`, in the memberSave.js pattern. A new product sends the whole form.
- Then a blank description or category no longer writes `''` over NULL (census: 2 rows hold `''`), and no form key the server drops (`customPrice` today) is sent unseen.
- Test: RUN cases for unchanged, changed, `''` over null, and the custom-price switch.

**1e. A refused product save is said (§18b123 rule 4).**
- `useQuotes.handleSaveProduct` returns `{ok:false, error}` with the server's words, falling back to "The server returned N." It returns `{ok:false, quiet:true}` when the org changed.
- `handleSaveProductLocal` throws on `!ok && !quiet`.
- CatalogTab's `handleSave` calls `cancel()` only on success. Its catch already draws `error` at :1218, which stays until Cancel.
- Remove the dead `productModalError` and `productModalSaving` state and their App.jsx wiring at :971-972 and :1945-1946. App.jsx is CRLF.
- This also covers the always-refused case: "+ Add product" with Custom ticked, under Q2 option C or until option A ships.

**Files:** netlify/functions/products.mjs, db/schema.ts, db/apply-product-custom-price.mjs (new), src/Tabs/QuotesTab.jsx (CatalogTab), src/hooks/useQuotes.js, src/App.jsx, src/utils/productChanges.js (new).

**Tests:**
- tests/products-write.test.mjs (new): WIRING. The PUT has no `.insert(` or `onConflictDoUpdate`, reads in the org before writing, and never names createdBy; the POST stamps `auth.userId`. RUN for productChanges.
- tests/integration/products.itest.mjs (new): `PUT {id, active:false}` keeps name and min_price; an unknown id is a 404 with no row written; another org's id is a 404; `listPrice:null` without custom is a 400; a POST of an existing id is a 409. It needs the DATABASE_URL_TEST refusal and redirect before its first run (memory: itest-db-guard-first), and `tests/itest-targets-test-db.test.mjs` runs first.
- tests/integration/sales-tax.itest.mjs:362/384 keep passing, because they send name and listPrice.

### Part 2: A PUT that writes columns the body left out (the class)

**2a. export-schedules.mjs PUT.**
- Read the row in the org; none is a 404. Build `sanitize({...existing, ...data})` and write it as an update.
- `createdBy` is the stored one, never the body's. POST stamps `auth.userId` if it does not already; check this at build.

**2b. export-dsr.mjs PUT.**
- The same merge and 404.
- `completedAt` is set when the status moves into 'completed' and cleared when it moves out.
- The SLA is never recomputed on update.

**2c. backup.mjs schedule PUT.**
- It stays an upsert on the per-org singleton `sched_${orgId}`, but each field becomes `k in body ? clean(body[k]) : existing?.[k] ?? default`.
- So a body that leaves out `notifyOnFailure` no longer blanks UKG's address. UKG's row is the only row and is real data.
- An explicit `''` still clears it.

**2d. THE GUARD, tests/put-upserts.test.mjs (new).**
- It scans every `httpMethod === 'PUT'|'PATCH'` block in netlify/functions. Any `onConflictDoUpdate` must be named with its reason.
- Today the list is: accounts, activities, backup (schedule), contacts, dashboard-configs, export-dsr, export-schedules, leads, opportunities, products, settings, tasks, users.
- After the batch, products, export-dsr and export-schedules are gone (they become updates). The rest stay named as "merged over the stored row read in the org", with `backup` named as the singleton per-field merge.
- A second list names every POST that upserts: dispatch-customers ×2, dispatch-equipment, dispatch-jobs ×2, dispatch-plan-visits, dispatch-schedule-blocks, dispatch-service-plans, dispatch-technicians, dispatch-vehicles. These are designed upserts (§0.201) and are filed (OUT). Any new one fails until named.
- A self-test proves the scan still matches the shape.

**Files:** export-schedules.mjs, export-dsr.mjs, backup.mjs, tests/put-upserts.test.mjs.

### Part 3: Percents a write takes without a range check

**3a. Deal discount.**
- `cleanDealDiscount(v)` in src/utils/quoteTotals.js, beside `cleanTaxRate`: rateLike, 0-100, `roundCents`; `null` or `''` becomes 0; anything else is null (refused).
- quotes.mjs `dealDiscountRefused(data)` answers `400 {error:'dealDiscount must be a number from 0 to 100', field:'dealDiscount'}`.
  - POST: beside :332.
  - PUT: beside :399, before the merge, so before `syncToOpportunity` (:488). That closes the partial write in scenario d.
- Then `merged.dealDiscount = cleaned` before `quoteTermsChanged` and `calcTotals`; store `String(cleaned)`.
- Following §0.204, a PUT naming the stored value is never refused. The census found 0 out of range and 0 non-zero, so nothing stored trips it.

**3b. Quote line `discountPct`.**
- Server: a line whose discountPct is not blank and not 0-100 is a 400 `field:'lineItems'`, beside `linesMalformed`, on POST and PUT. The census found 0 bad lines.
- Builder (QuotesTab :783): per Q4.

**3c. The org default `quoteDefaults.taxRate`.**
- The settings PUT refuses a named rate that is not blank and not 0-100, via `cleanTaxRate`: 400 `field:'quoteDefaults'`. Today it is stored as sent (settings.mjs:449).
- `defaultTaxRateOf` keeps its clamp.

**3d. Service plan `discountPercent`.**
- dispatch-service-plans.mjs POST (:149) and PUT (:191) answer 400 `field:'discountPercent'` unless the value is null, blank or 0-100 and named anew.

**3e. Out-of-range answer (Q3).** The recommendation is to refuse. Readers keep their existing clamps; no new clamps are added.

**Files:** src/utils/quoteTotals.js, quotes.mjs, src/Tabs/QuotesTab.jsx (line editor), settings.mjs, dispatch-service-plans.mjs.

**Tests:**
- tests/percent-ranges.test.mjs (new): RUN for `cleanDealDiscount` (−1, 100.001, 'abc', true, [], 1e999 refused; '', null → 0; 12.345 → 12.35); WIRING that each refusal sits before `calcTotals` and `syncToOpportunity`.
- tests/sales-tax.test.mjs :96 and :109 pin `calcTotals(lineItems, data.dealDiscount || 0, …)` and `merged.dealDiscount || 0`. Both are repointed to the cleaned value, and the batch's state section names the repoint.
- tests/approval-routing.test.mjs:118 is unchanged while `merged` stays.
- Integration: a PUT of −50 on an Approved quote writes nothing, and the deal's arr is unchanged.

### Part 4: Day labels from a timestamp's UTC day (src)

**4a. The seven label sites.** `dayOf` already exists in src/utils/reportPeriod.js; import it, no move needed.
1. QuotesTab:2003 → `dayOf(q.updatedAt || q.createdAt).slice(5,10)`.
2. QuotesTab:1487 → `dayOf(d.at) || '—'`.
3. ReportsTab:5789 → `dayOf(selectedAccount.createdAt)`.
4. ReportsTab:5850 → `dayOf(selectedContact.createdAt)`.
5. ReportsTab:5676 → `parseLocalDate(e.date)?.toLocaleDateString(…) || '—'`. Today every row prints the day before in the Americas, all day.
6. ReportsTab:6180 → `parseLocalDate(openedRaw)?.toLocaleDateString(…)`. Today it reads "Invalid Date" when createdDate is empty.
7. BackupDetail:377 → drop `timeZone:'UTC'`.

The shapes stay as they are (Q5).

**4b. DispatchTab:5812.** `new Date(j.scheduledDate)` → `fromYmd(j.scheduledDate)`. Today a job this Sunday drops out of "hours this week".

**4c. Delete dead code** of the same shape: TasksTab.jsx:64-75 `groupByDay` and ReportsTab.jsx `byRep3` with `repActRows3`. Confirm at build that nothing calls them.

**4d. Export filenames (Q6).** Under option A, the five named exceptions in the current guard use `todayLocal()`.

**4e. THE GUARD, tests/date-local.test.mjs, extended.**
- New INSTANT_SLICE scan: `.slice(0,10)`, `.slice(5,10)`, `.substring(0,10)` or `.split('T')[0]` on a member ending At, at, timestamp or dateTime.
- New DAY_AS_UTC scan: `new Date(x.date|dueDate|completedDate|scheduledDate|…)` followed by toLocale*.
- A third pattern: `timeZone: 'UTC'` inside a toLocale* call.
- My trial regex over src today hits exactly items 1-5 plus seven calendar sites: App.jsx:1277, MeetingPrepPanel:28, HomeTab:269/283/289, TasksTab:607/612. Those seven are named exceptions with the reason "the Outlook question, OPEN_ITEMS" (OUT).
- A self-test proves each pattern still matches its shape.

**Files:** QuotesTab.jsx, ReportsTab.jsx, BackupDetail.jsx, DispatchTab.jsx, TasksTab.jsx, plus the five filename files if Q6 is A; tests/date-local.test.mjs.

### Part 5: Refusals the member is never told about (the scan-able part)

**5a. Thirteen `throw new Error(x.error)` with no fallback words:**
- ExportDetail :138, :205, :259, :270
- ApiKeysDetail :427, :484
- AutomationsDetail :358, :375, :385
- WebhooksDetail :164, :179, :189

Each becomes `(await res.json().catch(() => ({}))).error || \`The server returned ${res.status}.\``.

ModalLayer:810 (`res.error` from a hook result) and QuoteTemplatesDetail:1089 (words of its own) are named exceptions.

**5b. BackupDetail downloads (:414-429, :646-659).** Check `dlRes.ok`. On a refusal, save no file and say why. Today the error JSON is saved to disk as `<id>.json`, which looks like a backup.

**5c. QuotesTab `handleNewQuoteForOpp` (:1689-1709).** `if (!saved) return;` before `openConfigurator`, as handleNewVersion already does.

**5d. `docsError` (useDocuments.js:64).** Draw it in the Documents library as a read failure ("couldn't be opened… reload", §18b123 rule 4). The draw site is not yet read: read it at build.

**5e. THE GUARD, tests/refusals-said.test.mjs (new).**
- (i) Every useState whose name matches /error|refus/i is read somewhere other than its own setter line, or is named.
- (ii) No `throw new Error(<id>.error)` without `||` fallback words, unless named.
- Self-tests for both.

**Files:** the four settings panels above, BackupDetail.jsx, QuotesTab.jsx, useDocuments.js and its drawing component, tests/refusals-said.test.mjs.

### Part 6: The legacy dispatch import (a live trap on org_3BDQEH7s, demo data)

**Q7 option A.**
- DispatchVehiclesDetail's plan leaves out every `imp_` id already in the loaded `vehicles` and `equipment`.
- The card's count is what is still pending, so the card goes once everything is in.
- `runImport` refuses to run while `loadError` is set, because an empty failed load would count everything as pending.
- The words "Re-running is safe" go.
- A refusal says the server's words, not "HTTP 409".

This stops a re-press from nulling the make, VIN or service dates and clearing an equipment check-out.

**File:** DispatchVehiclesDetail.jsx. **Tests:** RUN for the plan filter over loaded ids.

### Guide §18b125 (proposed rules)
1. A save writes only the columns it names. A PUT reads the stored row in the org and updates it; an id the org does not hold is a 404 and nothing is written. A PUT that upserts is named in THE GUARD (tests/put-upserts.test.mjs) with its reason.
2. A value the row keeps from its making (who created it) is the server's.
3. A percent a request names anew is a number 0-100, or it is refused naming the field and nothing is written. That covers a quote's deal discount and line discounts, the org default tax rate and a service plan's discount. A value the row already holds is never asked again.
4. A day shown for an instant is the member's local day (`dayOf`, `parseLocalDate`). A stored day is read at local noon, never as UTC midnight (THE GUARD: date-local's three scans).
5. A refusal reaches the member in the server's words or in fallback words. A form closes only on success. An error state nobody draws is a guard failure (tests/refusals-said.test.mjs).

### Batch size
- About 28 files: about 22 changed, plus 5 new tests and 1 apply script.
- Six parts, one schema apply (if Q2 is A), two itest suites.
- This is comparable to §0.241. If Jeff wants it smaller, split Part 5 and Part 6 into §0.243. Parts 1-4 are the core.
- Commit marked "harness deferred". Do the stale check against the anchors this batch moves (quotes.mjs :338/349/418/498, products.mjs, sales-tax.test.mjs :96/109).

### Pre-build checks (SELECT-only census, counts by org prefix)
- Settings rows whose `quoteDefaults.taxRate` is outside 0-100.
- `dispatch_service_plans.discount_percent` outside 0-100.
- Rows of export_schedules created_by: already 0 rows.

## OUT (filed, each with its OPEN_ITEMS home)
- **The POST-upsert sub-class.** The seven dispatch POSTs overwrite with defaults on a re-POST; F in the products map. Upserts are designed there (§0.201: "The create is an upsert"), and DispatchTab re-sends drafts. A 409 change needs its own design. The Part 2d guard lists them.
- **Deal probability.** No range check; import "0" becomes null; the stage-default copies funnel weight unclamped. It needs a census of probabilities and funnel weights first, because a deal window that re-sends a stored 150 would be blocked, and the import Preview needs per-row refusals. Fold into the filed prob/weight item (Medium).
- SPIFF percent and claim amount (filed), commission tiers (no reader), KPI thresholds, lead conversion benchmarks, lead score `?? 50`.
- **Inactive products vanish** (App.jsx:512 `loadProducts()` with no `includeInactive`). Each product reader must filter `active` first: QuotesTab:597 does; the others are not read.
- **Outlook calendar times and days.** Graph default UTC, no Prefer header, no isAllDay. App.jsx:1277 STORES the day. Needs a live check of an Outlook connection.
- **Server days and labels**: §4.2 already. _quotePdf.mjs:390 date line, digest "Week of", stamped days in opportunities, leads, email-inbound, invoices and _coaching, and the UTC year in record numbers. These need the member's day or timezone.
- **The local-dev timestamp shift.** @netlify/neon CJS and drizzle's ESM `types` are separate instances, so TZ applies locally. A fix in db/index.ts changes the prod driver import, so it needs its own probe. Until then, a local pane pass cannot verify any afternoon or evening day label.
- **Day words from rounded 24 h spans** (AdminView, AuditDetail, BackupDetail fmtWhen, ExportDetail, ApiKeysDetail, TasksTab fmtAgo).
- DispatchTab cert `expiresAt` format (not read). HomeTab:478 instant-vs-day week count.
- **The rest of the refusal sweep**, filed in §0.243 shape:
  - Kanban stage drag with no rollback (worst: wrong display).
  - Task complete and snooze un-ticking silently (TasksTab, HomeTab PlateRow).
  - ReportsTab deal contact add, remove and persona.
  - Calendar adds that only console.warn.
  - ExportDetail toggles; its delete error replaces the page; `window.alert`.
  - Report save timers (4 s and 3 s).
  - Holiday sync's 6 s timer.
  - coaching-note network rejects.
  - `saveBlock` unassign failures.
  - Quote PDF silent fallback.
- **Dead handlers**: useUserHandlers.handleDeleteUser, useQuotes delete handlers, App Log-from-calendar.
- webhooks.mjs:241 update without orgId (rule breach, not a leak).
- coaching-notes readBy rebuilt whole. user-role.mjs writes the whole profile.
- No runner for exportSchedules (scheduled exports may never run). Open question.
- CatalogTab `MiniBar` and `BarCell` (QuotesTab :1102-1127) and ReportsTab :2651-2658 are defined inside a parent component. This breaks the CLAUDE.md frontend rule.
- PipelinesDetail.jsx:535-537 shows made-up "Default prob.", "Avg days" and "Open" figures.
- public/api-docs.html: :902 says the quotes PUT "Upserts by id"; :826's status list is stale; :832 documents dealDiscount 0-100 (true once Part 3 ships).
- OPEN_ITEMS:2173's claim that "no screen meets" the minPrice wipe is wrong: every Price Book edit wipes it. Correct the item in the batch's doc patch.

## QUESTIONS FOR JEFF (member- or API-visible behaviour only)

**Q1. A products PUT naming an id this org does not hold.**
- **A (Recommended):** 404, nothing written, as quotes (§0.155) and spiff claims (§0.204) already do. An API caller must POST to create.
- **B:** keep creating. A PUT keeps making a product past the POST's checks, and the audit row reads "updated" for a product that was created.

**Q2. "Custom / Variable Price" in the Price Book.**
- **A (Recommended):** add a nullable `custom_price` column (additive; applied on your go). A custom product saves with a $0 list price and comes back ticked, so the quote builder's "Custom price — enter below" finally works.
- **B:** remove the checkbox and the builder's custom-price branches. No schema change; the feature is gone, though it has never worked.
- **C:** keep it as is, but say the refusal. The form stays open with "listPrice is required", and the box can never be saved.

**Q3. A percent out of range in a request (deal discount, line discount, default tax rate, service plan discount).**
- **A (Recommended):** refuse with a 400 naming the field; nothing is written. This is the house rule from tax rates (§18b124 rule 4). Today no screen sends a bad value, so only hand-made requests ever see it.
- **B:** clamp silently to 0-100. The request succeeds, but a stored value differs from what was sent without a word, and −50 becomes 0.
- **C:** refuse, and also clamp in the readers (quoteTotals `dd`, quoteMoneyRows). Same as A for members, plus a second line of defence for rows landed by a backup restore. It hides any bad row that does land.

**Q4. A rep types a line discount above 100 or below 0 in the quote builder.**
- **A (Recommended):** Save is refused in words naming the line ("Line 2: discount must be 0-100"), and the typed value stays to fix. This matches §18b124 rule 5 (a typed rate is refused, never rounded).
- **B:** clamp as typed, as the deal window's probability box does. 150 silently becomes 100.

**Q5. How the corrected date labels read.**
- **A (Recommended):** keep each label's shape and correct only the day. "Customer since 2026-11-10", the version timeline "11-10", the approvals "2026-11-10", the PDF "Nov 10, 2026".
- **B:** one shape everywhere, "Nov 10, 2026" (timeline "Nov 10"). More consistent, but every one of these labels changes how it looks.

**Q6. Export filenames (Accounts, Contacts, Audit, Users and Pipelines exports).**
- **A (Recommended):** name the file by the member's day. An export at 8pm CST on 10 Nov is named …-2026-11-10, and five guard exceptions go.
- **B:** keep the UTC day. After 6pm CST the file is named tomorrow, as today.

**Q7. The "Import from the old settings list" card (Dispatch → Vehicles & equipment).**
- **A (Recommended):** count and send only entries not yet in the tables. The card disappears once all are imported, and a re-press can never overwrite an edited vehicle or a checked-out unit. A vehicle deleted after import reappears in the card's count and would be recreated if pressed.
- **B:** after a clean import, empty the old settings lists. The card is gone for good, but the old lists leave the settings row (backups keep them).

## CRITIC (the three most load-bearing claims, re-read)

**1. "A products PUT without name or listPrice is a 500, and the Price Book's custom-price edit hits it."**
- Re-read products.mjs:88-98. `listPrice: data.listPrice != null ? String(...) : undefined` goes into `.insert(products).values({...payload, createdAt})`.
- schema.ts:605 shows `list_price` is `.notNull()` with no default, and `name` is `.notNull()`.
- Drizzle sends an undefined insert value as DEFAULT, which here is NULL. Postgres checks NOT NULL (ExecConstraints) before the ON CONFLICT arbiter, and spiff-claims.mjs:136-138 records the same failure in this repo.
- Status: REASONED, NOT RUN. The Part 1 itest pins it.
- Correction to the refusal map: it says an edit switched to custom "saves (listPrice undefined means kept)". By this reading it is a 500. Either way the member sees the form close with nothing said, because `productModalError` is never drawn, so Part 1e covers both. The maps disagree only on the cause.
- Confirmed separately: line 92 writes `minPrice: null` into both the insert and the `set` whenever the body leaves it out, and the form never sends it (QuotesTab:1094). So every Price Book edit wipes min_price today. org_3BDQEH7s's 2 values are at risk until this ships, so avoid editing those two products there.

**2. "The deal discount is unchecked and can partially write the deal before the 500."**
- Re-read quotes.mjs. POST :338 and :349 use `data.dealDiscount || 0` with no check. PUT :407 merges, :418 calcTotals, then :498 `String(merged.dealDiscount || 0)`. The only refusals before the merge are lines and taxRate (:396-399).
- So a refusal placed beside :399 precedes `syncToOpportunity`. I did not re-read :488's exact line; the map's line number is taken as given.
- No correction needed. One addition: the tests that pin the changed lines are sales-tax.test.mjs:96 and :109 (verified by grep). approval-routing.test.mjs:118 is untouched.

**3. "The current date guard cannot see these offenders, and a widened scan finds exactly the label sites plus the calendar sites."**
- Re-read date-local.test.mjs:259. UTC_DAY matches only `toISOString().split/slice`. Confirmed.
- My trial regex over src hit QuotesTab:1487, QuotesTab:2003, ReportsTab:5676, :5789, :5850, and the seven calendar lines. No false positives.
- Correction: it does NOT catch ReportsTab:6180 (a noon-append on an instant) or BackupDetail:377 (`timeZone:'UTC'`). Hence the third `timeZone:'UTC'` pattern in Part 4e. The 6180 shape (`x + 'T12:00:00'` where x may be an instant) is not reliably scannable: fix it by hand and name it in the state section as unguarded.
- `dayOf` is confirmed at src/utils/reportPeriod.js:29, so no move into dateLocal.js is needed.
- Also re-read the class list for the Part 2d guard against my scan. The PUT upserts are exactly the 13 named there, and the POST upserts the 10 named. That matches the products map's section 3, plus dashboard-configs (single-purpose) and dispatch-plan-visits (by design).
- Open question, not checked: whether the "correct" PUT upserts (accounts, contacts, leads, tasks, activities, opportunities, users) still CREATE on an unknown id. The guard names them; it does not prove that.

Scratch files: none written by this designer. The mappers' scripts are in C:\Users\jeffr\AppData\Local\Temp\claude\425e9ec54693703e\46fcfd24-045b-498c-a27d-18279e024b8a\scratchpad\ (census.mjs, census-discount.mjs, tsprobe.mjs, errscan.mjs, writescan.mjs).