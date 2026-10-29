# Batch 3 of OPEN_ITEMS §1 item 1 — CSV import and merge

A pick is saved as the record picked (guide §18b91; Jeff, 11 Oct: "One match
saves, two refuse"). Batch 1 (§0.198) applied that to the CRM's five save
screens and batch 2 (§0.214) to Dispatch. This batch applies it to the CSV
imports (accounts, contacts, deals) and to the account and contact merge.

**Status:** the map was read 29 Oct 2026 over `aeafb2d`, read only, by a
workflow: five mappers, a designer, then three critics (correctness; tenancy,
data and the Undo; proof). Claude re-read the claims the design rests on
(importParents.js:13-45, CsvImportModal.jsx:43-77, accounts.mjs:165-248,
merge.mjs:150-262 and :612-617). No data was read. The critics changed the
design in eight places, marked **(critic)** below. The questions are in §3.
Jeff answered all twelve the same day, each the Recommended, and the census
ran (SELECT counts only, 21:10:23 UTC) — both in ANSWERS.md. Not built.

---

## 1. The map — every place a record is chosen, linked or written by name

The 11 Oct claims (OPEN_ITEMS §4.7, "read 11 Oct over 7e68f26") were checked
one by one: almost all **hold**; four **changed**; two are **gone** (end of §1).

### I1. An imported sub-account's parent — `importParentId` (src/utils/importParents.js:17-28)

- The Parent Account cell takes the FIRST live account whose lower-cased name
  equals it (`unarchived(all).find(...)`, :21), then the first top-level row
  of the file (:23), then the first merged-away account of the name, followed
  to its survivor (:25-27). No refusal: two matches pick one, none gives no
  parent. It reads no `searchKey` ("Acme, Inc." and "Acme Inc" differ) and
  takes any tier, a site included.
- Only the file's TOP-LEVEL rows are offered as parents (:34), so a
  three-level file (Account > Unit > Site) loses its third level, or hangs it
  on an unrelated existing account of that name.
- Nothing of this reaches the receipt (ModalLayer.jsx:548-572): the only
  parent line is for a file parent that failed to save.

### I2. The accounts bulk POST and PUT (netlify/functions/accounts.mjs)

- **POST (:215-248):** only `checkBulkLinks(PARENT_LINK…)` (a live account of
  this org, or a row of the batch). No `placeAccount`: no site check, no
  below-site check, no tier fit. The tier is
  `d.accountTier || (d.parentAccountId ? 'business_unit' : 'account')`
  (:170) — the CSV sends none, so every imported sub-account is a business
  unit, under a unit or under a site alike; an API caller's tier is stored as
  any string.
- **PUT (:293-337):** checks a new parent the same way and skips the single
  PUT's placement, tier re-fit and D22 lift (:397-422), and its rename
  cascade to deals and contacts (:424-434).
- **No self or loop check** on either (src/utils/linkIds.js:148-166 has no
  `notSelf`; the single path's has, :111-113).
- **The union rule:** `partialRows` writes the union of keys across a batch
  (_sanitize.mjs:64-90), so in a mixed API PUT a row that sent no
  `parentAccountId` is un-parented.

### I3. The account import's conflicts — `detectDuplicates` (src/components/modals/CsvImportModal.jsx:63-68)

- The conflict is the FIRST existing account of the same name (trim, lower
  case), over the whole list, merged-away rows included (THE GUARD files it,
  tests/merged-away-lists.test.mjs:610-612). Overwrite writes onto that one
  — a hidden merged-away row too.
- The row shows the incoming name and phone, and the existing record's name
  only (:973-986): twins, and a merged-away match, look alike.
- Nothing dedupes within the file: two new rows of one name both insert; two
  rows hitting one existing account both overwrite it.
- An Overwrite sends the CSV's spelling, so it can respell an account
  ("Shell" → "SHELL") with no cascade; and it drops the Parent Account cell
  with no word (ModalLayer.jsx:577).
- A Sales Rep can run the import (roles.js:48), over their own and unassigned
  accounts only (accounts.mjs:192-208).

### I4. The contact import (src/components/layout/ModalLayer.jsx:449-530)

- **No contact is ever linked to an account.** Phase 2 posts the mapped row,
  which has no `accountId` (:496-506) — even when the Company names exactly
  one live account, or one Phase 1 just made.
- **New companies:** "not in the list" is a lower-case compare over the whole
  list, merged-away accounts included (:474-477), and the new names are
  deduped by exact spelling ("Acme" and "ACME" make two accounts), posted
  with no parent.
- **Overwrite:** sends the CSV's `company` and no `accountId` — the text
  changes, the stored link stays (contacts.mjs:147-187). The two can then
  disagree.
- **Conflicts:** the first contact of the same email, else the first of the
  same first and last name (company compared only when the row has one),
  over the whole list (CsvImportModal.jsx:43-62).

### I5. The deal import (src/utils/importRows.js, ModalLayer.jsx:590-650)

- A deal is sent with its Account as **text only** (importRows.js:52-54,
  :73-78, :110-134), stored with `accountId` null — every imported deal is
  id-less.
- A row with only an Opportunity Name imports with no account
  (csvMapping.js:94 keeps a row with ANY required field).
- **Conflict:** the first deal of the same name and the same account TEXT
  (CsvImportModal.jsx:69-77).
- **Overwrite** of a changed Account with no id unlinks the deal
  (dealAccount.js:147-157).
- **The deals bulk paths** (opportunities.mjs:222-231) ask only that an id is
  this org's: a merged-away id is stored as is, a site is taken. The single
  path follows the merge and refuses a site (`accountLink`, :187-209).
- **Owners by name:** a deal's Sales Rep is resolved by name on the server
  (_lib.mjs:373-475); ambiguous and unmatched names come back
  (`ambiguousOwners`, `unmatchedOwners`) and no screen reads them. A blank
  Sales Rep is filled with the importer's NAME (importRows.js:114).

### I6. The account merge (netlify/functions/merge.mjs)

- **Contacts' `accountId` never moves** (idTargets, :155-163, has no
  contacts); their `company` is renamed by name alone, org-wide (:187,
  :240) — a twin's contacts linked by id to the OTHER twin are renamed too.
  The comment at :615-616 still says contacts have "no account FK".
- **SPIFF claims' `account`** is renamed by name alone, org-wide (:186,
  :239); claims have no account id.
- **Deals moved by id** (:235) keep their old `account` text unless it was
  one of the two names (:238). Id-less deals are renamed by name alone, a
  twin's included (:183, :238). The merge never rewrites a deal's Site Name.
- **Sub-accounts** are re-parented onto the survivor with no parent rule and
  no tier re-fit (:173-175, :236); only each direct child's tier is logged.
- **A merge into a grandchild or below** of the record merged away closes a
  loop (:236 moves the children; :249 lifts the survivor only from directly
  under it).
- **`accountTier`** is in the server's `ACCOUNT_FIELDS` (:25) and written
  unchecked (:246). No screen sends it — the modal never had it.
- **D22's "no other account has the name"** (:216-218) counts accounts merged
  away earlier.
- **The Undo** reads the survivor's deals by id alone (`dealsOn`,
  mergeUndo.js:159-161): a deal by name alone does not keep it off a site.

### I7. The contact merge (merge.mjs:612-740; ContactMergeReviewModal.jsx)

- The Company is a text field: picking the archived contact's, or filling an
  empty one, writes the text alone. `accountId` is not in `CONTACT_FIELDS`
  (:32-38), so the survivor keeps its own link or none.

### I8. The merge screens (src/components/modals/MergeReviewModal.jsx, src/Tabs/DuplicateScanView.jsx; netlify/functions/duplicates.mjs)

- The account merge window counts contacts by `company === name` (:69) and
  says it "re-links" them (:171, :238), which it does not; its words leave out
  Dispatch, SPIFF claims and the D22 lift.
- The duplicate scan offers every identical-name pair as "Likely duplicate —
  safe to merge" before any hierarchy test (`classifyPair`, duplicates.mjs:
  85-95): a parent and child, siblings, a grandparent and grandchild.
- A merge is Admin-only on screen (Settings; App.jsx:753) and Admin or
  Manager on the server (merge.mjs:75-77). A Sales Rep never reaches it.

### Checked against 11 Oct

- **Changed:** the survivor's People list now shows contacts still on a
  merged-away id (`standsFor`, AccountRail.jsx:274-276, since §0.209), though
  their data has not moved; `accountTier` is the server's whitelist, never
  the modal's; the conflict row shows the existing record's name only; the
  conflict lists include merged-away rows (THE GUARD names them).
- **Gone:** "The accounts / contacts bulk POST is unbatched" and
  "`onConflictDoNothing()` can never fire" (OPEN_ITEMS §4.7) — `bulkInsert`
  chunks at 400 with bisection, and `onConflictDoNothing` was removed
  (_bulk.mjs:18, :31-37, :57-100). Nothing dedupes by name at insert, which
  this design's conflict rule covers.

---

## 2. The proposed design

**The one rule.** A name in a CSV cell, or a name a merge rewrites, is one
record or a refusal — never the first of a name. A new pure module,
`src/utils/importLinks.js`, holds it for the import; it builds on the single
saves' resolvers and writes no matcher of its own (`resolveLink`,
`resolveDealAccount`, `contactCompany`, `parentProblem` / `placeAccount`,
`parentLabel`, `mergedInto` / `survivorOf`, `searchKey`).

1. **Matching:** by `searchKey`, over the caller's whole list (merged-away
   rows only to name a survivor). One match saves as that record's id with
   its own spelling; two or more refuse, naming each by its parent
   ("site of Shell") or a deal's account and stage; none refuses, except
   where the kind has a Create today (the contact import's companies, made
   once per `searchKey` in the file). Punctuation alone matches nothing.
2. **What each cell may name:** a Parent Account — a live account that is no
   site and not the row itself (`parentProblem`); a deal's Account — what the
   deal window keeps (`dealKeeps`): a site typed in full saves as its parent
   account with the site as its Site Name; a contact's Company — any record
   (`anyRecord`, as the rail).
3. **The file's own new rows count:** a Parent cell can name a new row at any
   depth (passes run by depth, so Account > Unit > Site lands; a loop within
   the file is refused). An existing account and a new row of one name are
   two matches — refused.
4. **A name only merged-away records have** is refused, naming the record it
   was merged into (§18b91 rule 3).
5. **Refused rows are shown at Preview**, before anything is written — row,
   field, the cell, and the records it matched — the shape an unreadable date
   already has (csvMapping.js:94-107); the receipt repeats them (Q1).
6. **Conflicts read the same rule**, from a pure `.js` util, never from the
   `.jsx` **(critic: the unit runner cannot import JSX)**: one match is the
   conflict; two refuse; the row shows what tells records apart (an
   account's parent and tier; a contact's company and email; a deal's account
   and stage). A deal's conflict is the same deal name on the same account
   **as `accountOfDeal` reads it — by id, or by text for an id-less deal
   (critic: every deal imported so far is id-less, so an id-only match would
   duplicate them on a re-import).**
7. **Every Overwrite row sends whole pairs** **(critic: the union rule wipes
   an omitted key whenever another row of the batch sends it)**: an account's
   stored spelling when the cell reads as it; a contact's stored
   `company` + `accountId` when its Company cell is blank; a deal's `site` on
   every row (the resolved one, or the stored one).
8. **The server checks every id per row by the single save's rules**
   (§18b92): a bulk account's parent through `placeAccount` over the org's
   accounts plus the batch, its tier fitted, `notSelf`; a bulk deal's account
   through `accountLink` (a merge followed, a site refused, the account's own
   name stored).
9. **A merge writes by id, never by name alone:** contacts' `accountId` moves
   as deals' does, the company paired; the contact, deal and SPIFF-claim
   renames are scoped to the merged pair (as `dealsOfMerge` already scopes
   deals); a deal moved by id takes the survivor's name in the same statement.

**Each path:**

- **Account import (I1, I3):** `importParentId` replaced by the rule's
  resolver; passes by depth; refusals at Preview and on the receipt;
  conflicts by the util over `unarchived`; within the file, two new rows of
  one name and one Parent cell refused (Q6); an Overwrite's Parent cell still
  dropped, and now said (Q5).
- **Accounts bulk POST (I2):** `placeAccount` and the tier fit per row,
  `notSelf`, `UNKNOWN_TIER` for a tier the rule does not know.
  **(critic: this lands in the same step as the screen's resolver — on its
  own it would refuse whole requests the screen still sends, a site parent
  failing every sub-account in its chunk.)**
- **Accounts bulk PUT (I2):** a row naming a parent is refused (Q9);
  `accountTier` stripped; a name that differs from the stored one by
  `searchKey` refused too **(critic: a bulk rename cascade would rename the
  deals and contacts of accounts the caller was refused — bulkUpsert returns
  no landed ids)**.
- **Contact import (I4):** each Company resolved; one match sends the pair;
  Phase 1's new accounts made once per `searchKey` and their ids sent with
  the contacts; Overwrite resolves a non-blank cell (Q4) and sends the stored
  pair for a blank one.
- **Deal import (I5):** each Account resolved; the pair (and a site) sent;
  no match refused (Q3); an empty Account refused; the receipt reads the
  server's owner names; a blank Sales Rep sends the importer's id, not their
  name (Q11).
- **Deals bulk POST/PUT (I5):** `accountLink` per row for a new or changed
  id; an id the row holds is not asked again (§18b92 rule 3).
- **Account merge, links (I6):** contacts on the archived id move to the
  survivor, each logged with its own old `accountId` and `company`, and the
  Undo puts back each one's own text while it still holds what the merge
  wrote **(critic: an id rewrite logs no per-row values, so the Undo could
  only write the account's current name)**; the contact and claim renames
  scoped to the pair (Q12); a deal moved by id paired with the survivor's
  name; the stale comment rewritten; the window counts contacts as the rail
  does and names Dispatch, SPIFF claims and the D22 lift.
- **Account merge, placement (I6, I8):** before the batch, the moved children
  and the survivor are placed by `placeAccount` over the accounts as they
  will stand. A merge that would put anything below a site, that would need
  any moved account's tier changed, or whose survivor stands two or more
  levels under the record merged away, is **refused, nothing written,
  naming what to move first** (Q7, Q8). **(critic: the Undo can put back
  neither a re-fitted tier deeper than the direct children nor the deals
  lifted off a child made a site — a re-fit would make the merge
  un-undoable.)** `accountTier` leaves `ACCOUNT_FIELDS`. D22's `named` reads
  live accounts only. The Undo's `dealsOn` also reads the survivor's id-less
  deals by its name, where no other live account has it (§4.7's first shape;
  the second stays filed).
- **Duplicate scan (I8):** a same-name pair in one hierarchy is still offered,
  marked, with each record's parent and tier; "safe to merge" is not said of
  it.
- **Contact merge (I7):** `company` travels with its contact's `accountId`;
  the archived contact's link is checked by `checkLinks` before it is
  carried (a merged-away account followed, a dead one refused — the merge is
  then refused, naming it) **(critic: a link a write names anew must be
  checked)**; the Undo restores the pair together, as it pairs the owner
  **(critic: `survivorRestore` pairs only the owner today)**.

**Steps** — each its own verified commit, gates, scoped harness and browser
check, its doc patch in the same commit:

- **3a — the account import, screen and server together:** `importLinks.js`,
  the conflict util, Preview refusals, passes by depth, the receipt; the
  accounts bulk POST's placement and `notSelf`; the bulk PUT's refusals.
- **3b — the contact and deal imports:** their resolvers, pairs and
  conflicts; the deals bulk `accountLink`; the owner lines.
- **3c — the merge's links:** contacts by id with per-row logs, the scoped
  renames, the deal pairing, the contact merge's pair, the window's words.
- **3d — the merge's placement:** the refusals, `accountTier` out, D22's
  namesakes, the Undo's by-name `dealsOn`, the scan's marks.

The census (Q10), if run, comes before 3a. 3c and 3d touch the Undo (51
harness entries on mergeUndo.js, 72 on merge.mjs).

**What does not change:** no backfill — id-less contacts and deals stay so,
existing twins stay, contacts left on a merged-away account by past merges
stay (Jeff's data decision after the census); the single saves (reused, not
altered); held links never asked again; merged-away rows stay in the app's
lists and both GETs; `bulkInsert` / `bulkUpsert`'s chunking, ownership and
org stamping; the merge's role gate, lock, `undoRefusal` and Past merges; the
lead import (leads have no account column); no schema change.

**Left filed, each with its reason** (OPEN_ITEMS keeps them): a merge never
rewrites deals' Site Name (one fix with §4.2's "D22's edges"); a contact
merge's activities' `contactIds`, tasks' chips and the legacy deal `contacts`
text (a contact-reference batch of its own); documents and invoices not moved
by a merge (waits on Jeff's invoice call); a merge making two Dispatch
customers for one account (batch 2's §4.4 leftovers); two concurrent merges,
the audit's double count and Past merges' busy mark (small, unrelated — they
could ride 3c if Jeff likes); a rep's narrowed list (Q2); the lead import's
restyle; an end-to-end importer test (after 3b).

**Guard and proof, as each batch:**

- **Unit:** `importLinks` and the conflict util on UKG-shaped twins (two live
  "Shell - Port Allen", a unit and a site), each failing first on the old
  code — a twin refused naming both, a site parent refused, a site in a
  deal's Account saved on its parent, a merged-away-only name naming its
  survivor, "Acme, Inc." and "Acme Inc" read as one, a three-level file, a
  loop in the file, a mixed Overwrite batch keeping every row's pair;
  text pins on ModalLayer's and CsvImportModal's wiring **(critic: nothing
  pins the screen's wiring today)**; a text pin for every server branch the
  harness grades **(critic: the harness runs unit suites only, so an
  itest-only branch is never caught)**; the 11 Oct pins rewritten on purpose
  (import-parents.test.mjs:31-47, deal-account.test.mjs:536-551).
- **Integration:** a new suite (`itest_imp3_A/B`) for the bulk endpoints and
  merge-undo.itest.mjs for the merge — every case with org B holding
  same-named records that are never chosen, renamed or changed, and A's ids
  refused when sent as B; a rep's bulk PUT of an account she does not own
  forbidden, its deals' and contacts' names unchanged; a merge-and-Undo
  restoring each contact's own company.
- **Harness:** the entries this batch breaks re-anchored first, an entry per
  new branch, then `node scripts/mutate-scope.mjs` after "Baseline: green.";
  import-parents.test.mjs and merged-away-lists.test.mjs traced by hand.
- **THE GUARD:** the whole-list reads at merged-away-lists.test.mjs:610-616
  become `unarchived` reads or named reasons; the server read counts
  (:1462-1478) brought to the new reads, with reasons.
- **Browser check** in Accelerep QA: as Jeff, each import's refusals and
  conflicts with the parent named, a three-level file, a contact linked by
  id, a site in a deal's Account; as Karen (a Sales Rep can import) the
  contact and deal imports over her own list. A rep never reaches a merge,
  so the merge steps are Jeff's alone — and a real merge and its Undo are
  archive writes beyond the standing QA go, so they wait on his word at the
  time **(critic)**.

---

## 3. Questions for Jeff

- **Q1. A refused row** (two matches, a merged-away-only name, or none with
  no Create). Recommended: that row only is refused, listed at Preview with
  its row, field, cell and matches; the rest import; the receipt repeats it.
  Alternatives: block the whole file until fixed; or import the row
  unlinked with a receipt line (today's silent null, said aloud).
- **Q2. A Sales Rep's import sees only her own and unassigned accounts**, so
  it can make a twin of another rep's account. Recommended: leave it in this
  batch — the import reads the caller's list as the pickers do — and decide
  it once with §4.8's "Twins are still easy to make". Alternative: the server
  refuses a new account whose name a live account of the org already has
  ("one you can't open") — which tells a rep a name exists in another book.
- **Q3. A deal whose Account names no saved account.** Recommended: refused
  at Preview ("import or create the account first"). Alternative: make the
  account, as the contact import makes companies (top level, no owner).
- **Q4. An Overwrite whose Company or Account names a different record than
  the stored link.** Recommended: re-link it — the record's id with its name,
  as the rail and the deal window save; a blank cell keeps the stored pair.
  Alternative: write the text only and keep the old link (today: the two
  then disagree).
- **Q5. An account Overwrite's Parent Account cell** (dropped today, unsaid).
  Recommended: keep dropping it, and say so on the receipt ("move each
  account on its own page"). Alternative: move accounts from the file by the
  single save's whole rule per row (placement, re-fit, D22 lift).
- **Q6. Two new rows of one name in one file.** Recommended: same name and
  same Parent cell — both refused as duplicates; same name under different
  parents — both import (UKG's twins are real), and a Parent cell naming that
  name is then refused as two. Alternatives: refuse every repeated name; or
  import the first (the rule this batch ends).
- **Q7. A merge whose survivor stands two or more levels under the record
  merged away** (today a loop). Recommended: refused, naming the chain ("“Y”
  stands under “C”, which stands under “X” — move “Y” first"). Alternative:
  lift the survivor to the merged-away record's parent.
- **Q8. A merge that would put anything below a site, or change a moved
  account's tier.** Recommended: refused, nothing written, naming what to
  move first — so every merge stays exactly undoable. Alternative: re-fit the
  tiers in the merge, with a new Undo log for every account re-fitted and for
  deals lifted off a child made a site (a larger 3d).
- **Q9. An API bulk PUT naming a parent, or renaming an account** (no screen
  sends either). Recommended: refused ("move or rename an account on its own
  page"); a tier sent is ignored. Alternative: run the single PUT's whole
  move and rename per row.
- **Q10. A read-only census before building** (SELECT counts only, no names,
  per org, UKG as counts only): twin names; accounts under a site; tiers that
  do not rank below their parent; loops; id-less contacts and deals by how
  many accounts their text matches (1 / 2+ / 0 / merged-away only);
  contacts and deals on a merged-away or site account; contacts and deals
  and SPIFF claims whose text is not their link's name; same-name pairs in
  one hierarchy. Recommended: yes, on your go. It sizes a backfill decision
  (yours, not in this batch) and does not change the design.
- **Q11. A deal with a blank Sales Rep** is filled with the importer's name,
  then resolved by name. Recommended: keep the fill, sent as the importer's
  id; show the server's unmatched and ambiguous owners on the receipt.
  Alternative: leave a blank owner unassigned, as the server's comment
  intends.
- **Q12. A merge renames SPIFF claims' account org-wide by name** (a twin's
  claims too; claims have no account id). Recommended: fold it in — rename
  only claims whose deal is a deal of the merge, and claims with no deal by
  name. Alternative: leave it filed.
