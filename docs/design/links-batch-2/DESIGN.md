# Batch 2 of OPEN_ITEMS §1 item 1 — Dispatch, quote → job and the header search

A pick is saved as the record picked (guide §18b91; Jeff, 11 Oct: "One match
saves, two refuse"). Batch 1 (§0.198) applied that to the CRM's five save
screens; this batch applies it to Dispatch's customer, quote → job and the
header search's account rows.

**Status:** the map was read 28 Oct 2026 over `7b97754`, read only. Claude
read every line cited below; no data was read. The questions are in §3. Jeff
answered them the same day, and the census is in ANSWERS.md. Nothing is built.

---

## 1. The map — every place that takes the first of a name

### M1. A won deal's job placeholder — `buildWonBridgeJobs` (src/Tabs/DispatchTab.jsx:2065-2112)

- **The account** (:2070): `accounts.find(a => a.id === o.accountId || a.name === o.account)`.
  This is one `find` with two tests, so the FIRST account in list order that
  passes either test wins. A same-named account earlier in the list beats the
  deal's own id. It also matches a merged-away account (there's no
  `unarchived`) and compares names case-sensitively.
- **The customer** (:2073-2075): the first customer that is linked to that
  account, or the first whose name (trimmed, lower-cased) equals the deal's
  `account` text. This is also one `find` in list order, so a name match
  earlier in the list beats the customer linked by id.
- **What the placeholder carries:** `customerId`, `accountId` and the template
  match (`matchTemplateForOpp`, :2076, which reads the account's
  `customerTypes`). A wrong account therefore also picks the wrong template.
- **What the save does:** `startBridgeJob` (:5534-5560) copies `customerId` and
  `accountId` into New Job. If the placeholder found a customer, Save sends it
  as the customer; if it found none, Save creates a customer named `row.customer`.

### M2. Quote → job — `resolveCustomerForOpp` (src/utils/invoices.js:290-299), called by netlify/functions/quote-to-job.mjs:114-134

- **The id step:** the first customer whose `accountId` is the deal's
  `accountId`. The customers come from an UNORDERED org read (:114-115), so
  when two customers link one account, which one comes back is not defined.
  That happens when a merge moves a merged-away account's customer onto a
  survivor that already has one (merge.mjs:233); no index stops two customers
  linking one account (db/schema.ts:1013-1018).
- **The name step** (runs when the id step finds nothing): the first customer
  whose trimmed, lower-cased name equals the deal's `account`, from the same
  unordered list.
  - It runs even when the deal HAS an account id, so it can take a customer
    that is linked to a DIFFERENT account of the same name (UKG's twin
    "Shell - Port Allen", a unit and a site) and put the job on the wrong
    customer.
  - It does not ignore punctuation (`searchKey` does elsewhere), so
    "Acme, Inc." and "Acme Inc" do not match. The server then creates a
    second customer.
- **When nothing matches** (:118-134): the server creates a customer named
  from the deal's `account`, linked to the deal's `accountId`.
- **Tests:** tests/invoices.test.mjs:248-258 pins the current rule, including
  "the first name match" at :255.

### M3. New Job's customer field — `CustomerTypeahead` (DispatchTab.jsx:334-431) and `handleSaveNewJob` (:5774-5904)

- **Hiding accounts by name** (:346-349): an account is left out of "CRM
  accounts — not yet in Dispatch" when a customer is linked to its id, OR when
  any customer has its name (raw lower case). So once a customer is linked to
  one twin, the other twin vanishes from the list too, and an unlinked
  customer of the same name hides the account.
- **Text typed but never picked** (:6730 clears `customerId` and `accountId`
  on every keystroke):
  - If the text equals an existing customer's or account's name, `exact` is
    true (:351-353) and the list offers no Create row.
  - But Save (:5793-5808) still POSTs a NEW customer with the typed name and
    no account. So "Acme Corp" typed in full beside a saved customer
    "Acme Corp" makes a second "Acme Corp".
  - "Acme Inc" typed beside "Acme, Inc." makes a second customer as well, and
    is offered Create.
- **The one typed-name rule here already:** `mergedAwayName` (:321-326,
  §0.209). It refuses a name that only a merged-away account has.
- **A refused save makes the customer twice** (OPEN_ITEMS §4.4, "A New Job
  save refused after it made the customer…"). The customer created at :5805
  lives only in a local variable, so a retry after a failed location or job
  POST creates it again.
- **Account rows** (:409-419) show the city and state, never the parent, so
  twins can't be told apart.

### M4. The customer form's "Linked CRM account" select (DispatchTab.jsx:2674-2682)

- It lists `unarchived(accounts)` by bare name (:2680), so twins show as two
  identical options.
- A link the list leaves out shows as itself, disabled (`heldAccountOption`,
  §0.209). That part is already right.

### M5. The header search's account rows (src/components/layout/AppHeader.jsx:462, :478)

- **No parent shown:** a row shows only the account owner and an open-deal
  count, so twins can't be told apart.
- **The open-deal count:**
  - A deal with an `accountId` counts on that id alone. A deal still standing
    on a merged-away id is not counted on the survivor (`standsFor` exists for
    this, pickLink.js:234). Batch 1 has the merge move deals, so this is only
    a stale case.
  - A deal with no `accountId` counts by its raw lower-cased name, so it
    counts on BOTH twins.
  - The count is shown only when the account has an owner (`a.accountOwner ?
    … : undefined`). An account with no owner never shows its open deals.

### Checked and found clean

- **dispatch-automations.mjs:65-72 `repEmail`** matches a member by name, but
  it already refuses two matches or none.
- **The other Dispatch name compares** (DispatchTab.jsx:6877) are vehicle
  types, not links.
- **The server's customer create** (dispatch-customers.mjs:237-302) checks
  the account link with `checkLinks` (§0.199). It has no rule against a
  second customer for one account, or a second customer of one name.

---

## 2. The proposed design

**The one rule.** A new pure module, `src/utils/dispatchCustomer.js`, holds the
rule that every Dispatch customer lookup reads. It is imported by the
placeholder, New Job's field and Save, and the quote-to-job function (which
imports invoices.js today; `resolveCustomerForOpp` becomes a call to it).

1. **The account a deal stands on** is its `accountId`'s, or the one live
   account it was merged into: the shared `accountOfDeal` (pickLink.js:277).
   A deal with no account id falls back to its name, per `accountOfDeal`.
   The name never overrides the id.
2. **The customer for an account** is the one customer linked to that account
   by id.
   - Two or more linked: none is chosen. The answer says "more than one", and
     names them.
3. **Only when the deal has no account id** is a customer found by name: the
   customer whose `searchKey` reads as the deal's `account`, and only if
   exactly one does and it is not linked to another account.
   - Two or more: "more than one", as in 2.
   - None: "none".
4. **A typed name in New Job** is decided in this order:
   - the one customer whose name reads as the text (`searchKey`);
   - else the one live account not yet in Dispatch whose name reads as it;
   - else, with no record of the name, a new customer, as now.
   - Two or more customers, or two or more such accounts: refused in the
     field's words ("More than one dispatch customer is named “X” — pick the
     one you mean from the list; each row names its number and account.").
   - A name only a merged-away account has: refused, as now (§0.209).
5. **Rows that tell twins apart:**
   - account rows (New Job's list, the header search and the Linked CRM
     account select) name the parent with `parentLabel` ("site of Shell");
   - customer rows name their number (as now) and their linked account.
6. **The list hides accounts by id only.** An account is "in Dispatch" when a
   customer links to it by id, not when a customer has its name.

**Each screen and endpoint:**

- **Placeholder (M1):** rules 1-3.
  - With no single customer, it carries none.
  - With "more than one", New Job opens with the field showing the deal's
    account name and the refusal under it, so the dispatcher picks.
- **Quote → job (M2):** rules 1-3 on the server.
  - With "none", it creates the customer, as now.
  - With "more than one", it answers 409 and writes nothing. The message
    names the customers, e.g. "More than one dispatch customer stands for
    “Acme” (#C-1001, #C-1007). Link the right one to the account, then convert
    again." (Q2)
  - A deal with an account id no longer falls through to the name step.
- **New Job Save (M3):** rule 4.
  - A refused save keeps the customer (and location) it made, written into
    the form, so a retry reuses them (the §4.4 item; Q5).
- **The server's customer create:** answers 409 for a second customer on an
  account that already has one (Q3), naming it. A stale screen can then no
  longer make twins.
- **Header search (M5):** the parent on each row; the count by `standsFor`
  (deals on a merged-away id count on the survivor); a deal with no account id
  counts only when exactly one live account has its name; the count shown with
  or without an owner (Q4).

**What does not change:** a customer already linked keeps its link; nothing
re-links or renames existing rows. Existing twins (if any) are Jeff's data
decision after the census (Q6).

**Guard and proof, as each batch:**
- unit tests for `dispatchCustomer.js` on UKG-shaped twins;
- integration tests for quote-to-job's 409 and the create's 409
  (`itest_dlinks_A/B`, org B seeing nothing of A);
- tests/invoices.test.mjs:255's pin rewritten to the new rule;
- harness entries for each new branch;
- the browser check in Accelerep QA as Jeff, then as Karen (if QA lets reps
  use Dispatch — to read first).

---

## 3. Questions for Jeff

- **Q1. The placeholder with two customers for its account or name.**
  Recommended: carry no customer, and open New Job with the name filled in and
  "more than one" said under it, so the dispatcher picks. Alternative: hide
  the placeholder until it is fixed by hand.
- **Q2. Quote → job with two customers.** Recommended: refuse (409, nothing
  written), naming both customers by number. Alternatives: create a third
  customer; take the oldest.
- **Q3. A second customer for one CRM account.** Recommended: the server
  refuses it (409, naming the one already linked); New Job's list already
  steers to the linked customer. Alternative: allow it (a business with two
  service sites under one account would then need two accounts or locations).
  Note: a customer already has service locations (`?resource=locations`), so
  one customer per account still allows many sites.
- **Q4. The header search's open-deal count.** Recommended: count by
  `standsFor`; count a deal with no account id only when one live account has
  its name; show the count whether or not the account has an owner.
- **Q5. Fold in "a refused New Job save makes the customer twice"** (§4.4),
  since it is the same Save. Recommended: yes.
- **Q6. A read-only census, counts only, before building** (OPEN_ITEMS §4.4,
  P35): per org, how many accounts two or more customers link; how many
  customer names repeat (by `searchKey`); how many Closed Won deals and
  accepted quotes have no account id. Only SELECT counts are run, and no names
  are printed. Recommended: yes, on your go. UKG is included as counts only.
