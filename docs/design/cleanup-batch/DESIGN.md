<!-- The cleanup batch (OPEN_ITEMS §1, "Next, merged-away records leave every other list"): the design after three critiques and a revision (§10 lists every critique finding and its disposition). Written 18 Oct 2026 in the twenty-first session, read only, over 7ee14fe — file:line references are as of 7ee14fe and may have moved; verify every one before building. Step G (§0.208, THE GUARD class-wide) is DONE; steps A (§0.209, the screens) and B (§0.210, the public API, the quote email and the numbers) are next. The read-only maps it cites (map-*.md, critique-*.md) were scratch files and are not kept. -->

# Design (final): merged-away records leave every other list, count, picker and answer — the cleanup batch (proposed state §0.208-§0.210; guide §18b101)

Read only, 18 Oct 2026. The tree is `dev` at `7ee14fe`; `git status --short` shows ` M deno.lock` only (as at the
session's start; not touched). This is design.md revised against its three critiques (critique-correctness.md,
critique-completeness.md, critique-proof.md). Every finding was checked by opening the cited lines on this tree; the
disposition of each is §10. Nothing was run but greps and line reads. The census numbers (UKG: 3 accounts and 5
contacts merged away; no NULL `merge_archived`; one used API key, in an org with no merged-away row; 10 'merged' logs
against 8 rows; no activity, task, contact or deal naming a merged-away record by id) are the orchestrator's, quoted,
not re-run. Anything not verified is labelled.

Line endings on disk (design.md's reading, node; Git Bash's grep for `\r` lies — memory): **CRLF** AppHeader.jsx,
ReportsTab.jsx, AccountSegmentsDetail.jsx, IndustriesDetail.jsx, BuyerPersonasDetail.jsx, DocumentLinkPicker.jsx,
RecordDocuments.jsx, DispatchTab.jsx, MergeReviewModal.jsx, ContactMergeReviewModal.jsx, ContactRail.jsx,
AccountRail.jsx, useAccounts.js, public-api.mjs, quote-email.mjs, App.jsx, HomeTab.jsx, tests/history-feed.test.mjs,
scripts/mutate-import.mjs, package.json, the three docs, CLAUDE.md. **LF** pickLink.js, reportQuery.js,
MeetingPrepPanel.jsx, tests/merged-away-lists.test.mjs, search-match, document-link-names, sales-links, roles,
report-query tests. Not re-read by this reviser: rail-links.test.mjs's ending (read at build time). Every edit script
is EOL-aware, dry-run first, asserted counts, re-read from disk.

Paths in short: the Settings panels are `src/Tabs/settings/salesProcess/{AccountSegmentsDetail,IndustriesDetail,
BuyerPersonasDetail}.jsx`; MeetingPrepPanel is `src/components/layout/MeetingPrepPanel.jsx`; RecordDocuments and
DocumentLinkPicker are under `src/components/documents/`; the merge windows under `src/components/modals/`.

---

## 0. The batch in one screen

- **The rule.** A record merged into another (`isMergeArchived`: `mergeArchived === true`, pickLink.js:44-46) is
  drawn, counted, offered or answered nowhere. The filter is only where a screen, count, picker or API answer reads
  the list. The app's `accounts` and `contacts`, both loads and both GETs keep every row (guide §18b99 rule 2; T6 pins
  them): links, create-guards, the import, the one-request clear and the merge machinery read through them. Every
  client filter is at the point of drawing (render, or a memo keyed on the app's list), so an Undo's reload brings
  the record straight back. No fix writes a survivor's id into a stored link.
- **What stays reachable (Q2).** Hiding the old record closes the last screen routes to what still names it: an
  activity's `contactIds` and a task's chips (a contact merge moves `contactId` only, merge.mjs:657-669), a
  document's link (no merge moves one: merge.mjs:2-5 imports no documents table), and a contact whose `accountId`
  names the merged-away account (an account merge renames `company` only, merge.mjs:238-240). The design's way:
  **the surviving record shows them** (a new pure helper, `standsFor`, reads the merge marks on screen; nothing is
  written; an Undo takes them off again).
- **Five new pure helpers in pickLink.js** (§3): `standsFor`, `mergedInto`, `mergedSearchWords`, `accountOfDeal`,
  `heldAccountOption`.
- **THE GUARD becomes class-wide** (§4): every `src` file that imports `useApp`, every component holding it, every
  component a list is handed to — by shape rules, a module-checked resolver list and named reads with reasons; App.jsx
  and the hooks pinned; a server-side scan (T10) of every function reading either table.
- **Three steps, in a row, before the profile page (Q1, Recommended)** — Jeff, 16 Oct: "One cleanup batch next";
  17 Oct: "Undo, cleanup, profile". As one batch it is ~20 source files, a guard rewrite, ~75 harness entries and two
  real merges with Undos in the pane; §0.206 (4 source files, 36 entries) took from 421bde9 (16 Oct 18:24) to 5273c25
  (17 Oct 13:19), §0.207 from b1c6ad2 (17 Oct 13:19) to 61ca21a (18 Oct 15:46). Split by what each step needs to prove:
  - **G — the guard (§0.208), tests only:** T8 class-wide, T9 grown, T10 new; every whole-list read on today's tree
    named, the ones A and B fix named "until §0.209 / §0.210". No source change, no pane, no deploy change.
  - **A — the screens (§0.209), bundle only:** the header search, Reports' Activity History lists, its add-contacts
    panel and account panel, the document link picker (with the links it holds), Dispatch's two account pickers and
    its New Job save, the meeting prep panel, the survivor reach (contact rail, account rail, Documents tab). No
    function changes: no stale functions cache, no integration suite.
  - **B — the server answers and the numbers (§0.210), one functions deploy:** the public API, the quote email's
    fallback recipient, "# of accounts" in the report engine (Home, the builder, Send now, scheduled email/Slack),
    Settings' Segments/Industries/Buyer Personas counts and the dead "View accounts" items, the merge windows' and the
    delete warning's counts, Reports' industry chart; the integration suite.

---

## 1. Scope — every place, numbered

Tags: **G**, **A**, **B** (the step), **Q#** (Jeff decides; the recommendation is written in), **D#** (decided without
asking, §8.2 — Jeff can veto), **FILED** (a later batch — which and why). "Filed list" = OPEN_ITEMS §1 :290-311 and
§4.7 :2313-2399. "New" = found by the maps or the critiques (named), not on the filed list.

| P | Place (file:line on 7ee14fe) | Source | Tag |
|---|---|---|---|
| P1 | Header search, accounts and contacts groups — AppHeader.jsx:440-441, its "No results" gate :443, its group gates :457-458; `GH`/`RR` declared inside the render (:444-454) | filed (16 Oct); `GH`/`RR` new (search-reports §11.7) | A, Q3 |
| P2 | Reports → Activity History → Account history's list — ReportsTab.jsx:5078-5092 (`ActivityHistoryTab`, handed `accounts={accounts}` at :2089) | filed (16 Oct) | A |
| P3 | Reports → Activity History → Contact history's list :5095-5108, and its history (`contactEvents` :5213-5271, `conOpps` :5296-5300) | filed (17 Oct) + "keep a way" (OPEN_ITEMS :2290-2304) | A, Q2 |
| P4 | Reports → Opportunity history → "Select contacts to add to this deal" — `AddContactToOppPanel` :4871-4890, handed every contact at :6244 | filed (16 Oct) | A, D2 |
| P5 | "# of accounts" — reportQuery.js `runReport`'s Accounts source :331-332, read by Home (HomeTab.jsx:192), the builder (ReportsTab.jsx:2390-2391, :2442, :2474, its line "N of M accounts" :4377), Send now (saved-reports.mjs:118) and the scheduled email/Slack (report-deliveries.mjs:65-80, :98-100) — coupled with `byName` reportQuery.js:294-296 | filed (16 Oct); `byName` filed with it; the coupling, Send now and :4377 new (counts §(a), §(e)) | B, D5, D6 |
| P6 | Settings → Account segments counts — AccountSegmentsDetail.jsx:97-113 (drawn :199, :279-292) | filed (16 Oct) | B |
| P7 | Settings → Industries counts — IndustriesDetail.jsx:153-169 (drawn :350-367) | filed (16 Oct) | B |
| P8 | "View accounts" in a segment's menu (AccountSegmentsDetail.jsx:230-236) and an industry's (IndustriesDetail.jsx:283) — **dead since 85cc230 (7 May 2026)**: `setAccountsDeepFilter` appears in neither App.jsx nor AppContext.jsx, so it is undefined at SettingsTab.jsx:30, and AccountsTab reads no deep filter (App.jsx:2110 `<AccountsTab />`) | filed (17 Oct, segment, added by Jeff believing it opened a shorter list — OPEN_ITEMS :2338-2341; industry filed with it) | B, Q6 |
| P9 | Settings → Buyer Personas counts and Delete gate — BuyerPersonasDetail.jsx:98-106, :220, :250, :298, :306-316; the count's name/id split (Reports writes a persona's id, ReportsTab.jsx:4846 → :6334) | filed (17 Oct); split new (counts N2) | B, D7 |
| P10 | Document link picker — DocumentLinkPicker.jsx:55 accounts, :57 contacts; and the links the document holds that the offer leaves out — seeded at :36-45, counted in "N linked" (:143), never drawn (:151-178) | filed (16 Oct); the held links new (pickers (a)(4); completeness F4) | A, D2, D3 |
| P11 | Dispatch → New Job → Customer typeahead — DispatchTab.jsx:335-336; its Create (`exact` :338-340, row :403-408), its hint "New customer — will be created on save" (:366-370), and the save that makes a customer of typed text (handleSaveNewJob :5748-5779) | filed (16 Oct); the Create check new (sweep NEW-3, pickers B1); the hint and save new (correctness #2, #3) | A, D4 |
| P12 | Dispatch → customer form → "Linked CRM account" select — DispatchTab.jsx:2657-2660, its address line and "copy address" (:2661-2666, fed `linkedAccount={draftAccount}` at :3225), and the record view's chip "Linked to account · …" (:3039, :3261-3267) | filed (16 Oct); the escape gap new (pickers NEW-3); address and chip new (correctness #6, completeness F8c) | A, D3 |
| P13 | Meeting prep panel's contacts — MeetingPrepPanel.jsx:41-44 | filed (17 Oct) | A, D2 |
| P14 | Account merge window's counts — MergeReviewModal.jsx:60 deals by name, :61 contacts by company, :63 sub-accounts | :63 filed (17 Oct, Jeff); :60-61 filed with it | B, Q5 |
| P15 | Contact merge window's org-links count — ContactMergeReviewModal.jsx:68-72 (counts merged-away colleagues and the pair's other record); `countsFor`'s deps :74 | new (pickers NEW-5, sweep B13, tests N1); deps new (correctness #1) | B, Q5 |
| P16 | Accounts tab's delete warning, "N sub-accounts will move to the top level" — useAccounts.js:76 (kept whole on purpose in §0.206: guide §18b99 rule 2, T3) | new — the same count as P14's :63 (gaps G3) | B, Q5 |
| P17 | Public API, accounts and contacts — public-api.mjs:197-243, :246-291 | contacts filed (17 Oct, Jeff), accounts filed with it | B, Q4 |
| P18 | Reports' industry chart's account by name — ReportsTab.jsx:3945-3947 (`acctByName`, the later twin) | filed with the batch | B, D5 |
| P19 | Reports → Opportunity history's account panel and "Open account panel ↗" — ReportsTab.jsx:5842 (the first twin), :6074-6107, :6089 | filed with the batch | A, D5 |
| P20 | A contact's rail, Activity History — ContactRail.jsx:267-274 (misses an activity naming a contact merged into it) | new as an enabler (search-reports §8, sweep NEW-2) | A, Q2 |
| P21 | An account's or contact's Documents tab — RecordDocuments.jsx:34-37, `unlinkHere` :69-72 (misses a document linked to a record merged into it) | new (pickers NEW-1, server §2.10, merge-kinds (7)2) | A, Q2 |
| P22 | Stale comments: tests/merged-away-lists.test.mjs :5-9, :13-16, :26-32, :280-281, :411-413 (G); AccountRail.jsx:286-289 (A) | filed (17 Oct) + made untrue by this batch | G, A |
| P23 | merge.mjs:259 "reports filter mergeArchived=false" — untrue (no report reads the mark) | filed (OPEN_ITEMS :2602-2610) | B (comment only) |
| P24 | THE GUARD (tests/merged-away-lists.test.mjs T8) scans two tabs only | filed (17 Oct) | G |
| P25 | Header search's "N open deals" beside an account counts deals by NAME — AppHeader.jsx:457 (the line P1 edits) | new (search-reports §11.1) | Q7 (A) |
| P26 | Reports → Account history's deals by NAME — ReportsTab.jsx:5135-5137, :5290-5294 (per the map, UKG's "Shell - Port Allen" unit and site each show both's deals; not re-read in data) | new (search-reports §11.2) | Q7 (A) |
| P27 | A quote with no billing email goes to the FIRST contact of the deal's first name, merged-away included — quote-email.mjs:120-131 | new (server §2.12; gaps #11) | B, D8 |
| P28 | A merged-away record's rail says nothing of the merge (filed :2423-2426) | filed | FILED — "the merged-away rail", **after the profile page** (Jeff's order: "Undo, cleanup, profile"). After A, a merged-away ACCOUNT rail still opens from four routes: the Contacts tab's company card "Open account" (the first account of the name over every account, ContactsTab.jsx:365-368, button :521-528 — UKG's twin sites); the account rail's "Open existing" (`checkDuplicate`, AccountRail.jsx:311-334); a chip's designed fallback (railLinks.js:87, a rep holding the merged-away account but not its survivor); ← Back after `openAccountRail` (App.jsx:1706) pushes `a.parentAccountId` — a live account under a merged-away parent (P45) opens that parent |
| P29 | A merged-away contact's rail prefills itself into Log/Email/Call and "+ Add task" (ContactRail.jsx:435, :1005; railLinks.js:97-107) — guide §18b91 rule 5 breach | new (merge-kinds NEW 1; gaps #15) | FILED with P28 — after A no read opener reaches a merged-away contact's rail (App.jsx:1705, AppHeader:458, ContactsTab :207, :290, :562, :615 shown lists, AccountRail :949 `shownContacts`, ContactRail :627 server probe — completeness F7); ← Back unverified |
| P30 | documents.mjs `resolveLinks` follows no merge (:160-190) | server half filed :1573-1575 | FILED (the client half is P10's held rows, A) |
| P31 | A merge moves no `document_links` (merge.mjs:2-5), nor `invoices.accountId` (schema.ts:675), nor contacts' `accountId`, activities' `contactIds`, tasks' chips; moving `document_links` must de-duplicate (schema.ts:1342 unique index — gaps G2) | new (server, merge-kinds, gaps G2) | FILED — batch 3 (merge.mjs; a data write; past merges need a backfill — Jeff's decision) |
| P32 | D22's "no other account has the name" counts merged-away namesakes — accounts.mjs:86-89 → accountParent.js:378; merge.mjs:216-223 | new (gaps G1) | FILED — batch 3 |
| P33 | email-inbound.mjs:332-337 (contact, first of an unordered read) and :387 (its `accountId`, unchecked) | filed (:2409-2410) + new half (server §2.11) | FILED — the matched-by-name item / batch 3 |
| P34 | The "matched by name or email" item: Contacts tab company card (ContactsTab.jsx:365-368, :521-528), meeting prep's account (MeetingPrepPanel.jsx:47-49), AccountRail `checkDuplicate` (:311-334), CSV import (CsvImportModal.jsx:49-59, :66; ModalLayer.jsx:469-472), lead duplicate (LeadModal.jsx:102-106), Dispatch's won-deal jobs (DispatchTab.jsx:2052) | filed (:2400-2422) | FILED — its own batch ("each matches live records first") |
| P35 | Dispatch: a dispatch customer may already have been made for a survivor under a merged-away name (DispatchTab.jsx:6702-6713 → :5764-5779) | new (pickers NEW-2) | FILED — a read-only census first (Jeff's go), then a data decision |
| P36 | The account merge window's words omit Dispatch customers/jobs (merge.mjs:233-234), SPIFF claims (:239) and where lifted deals go (:210-225, :243) | new (pickers NEW-4) | FILED — the merge window's copy, with batch 3 |
| P37 | Reports' add-contact keeps its own ids (`setLocalContactIds(mergedIds)`, ReportsTab.jsx:6267-6269), never updates the app's deal, says nothing on a refusal | new (search-reports §4; guide §18b15's class) | FILED |
| P38 | Persona Delete has no server check (settings.mjs:397) | new (counts N3) | FILED |
| P39 | public/api-docs.html documents the Clerk endpoints with an API key (refused 401), wrong limits and read/write claims; the key dialog's curl names `api.accelerep.com/v1` (ApiKeysDetail.jsx:159-160) | new (server §1.5) | FILED — its own item |
| P40 | Not about merges (flag only): a rep's emailed report omits unassigned rows (report-deliveries.mjs:69 vs accounts.mjs:208); a Manager's `managedReps` does not narrow the header search, Home reports or Reports' lists; Reports' rep filter by display name (ReportsTab.jsx:5082-5091); the builder's "slice applies first" (:4478) untrue for the Accounts source; Territories' stored `accounts: 0` (TerritoriesDetail.jsx:34, :212); Industries' "Removes tag from all accounts" (:310 vs :137-140); dead code — App.jsx:1104 `allContacts`, :990/:1019 handlers, ReportsTab.jsx:5930 `c.opportunityId`, ReportsTab.jsx:55-56 and PipelineTab.jsx:329 destructures; ActivityHistoryTab's eight components declared inside it (:5357-5688); Dispatch's sibling escape options are enabled ("Unlisted type" :2675-2677, "Deleted plan" :2686-2688, "Unknown technician" :2759) where §18b24.3 says disabled (guide §16's own example, :802, is enabled) | maps; completeness F8d | FILED (OPEN_ITEMS, each a line) |
| P41 | UKG: 10 'merged' logs vs 8 merged-away rows | census | FILED — a read-only count of the logs (Jeff's go) before batch 3 |
| P42 | Docs corrections: the dead "View accounts" premise (OPEN_ITEMS :2338-2341, :2348-2350; §1 :301, :304; guide §18b99 rule 5 :4230, :4234); guide §19 "Gates -- run all seven" (:1259) vs CLAUDE.md's eight with `check:fnscope`; CI's gates job (.github/workflows/test.yml) runs no `check:fnscope` either — `npm test` runs only the scanner's fixtures and wiring (tests/check-fnscope.test.mjs:98-107) | maps; completeness F8g | IN (with the commit that touches each) — the §19 line and CI are **flagged** to Jeff (CLAUDE.md: flag, do not silently pick); proposed: eight, as CLAUDE.md, and a CI step |
| P43 | An account's rail: People, CONTACTS and the Activity tab's rollup miss a contact whose `accountId` names an account merged into this one — AccountRail.jsx:271-273 (`c.accountId ? c.accountId === account?.id : …`), :292 | new (correctness #5, completeness F1) | A, Q2 |
| P44 | Reports → Opportunity history's "Contacts on this deal" last touch (`contactTouch`, historyFeed.js:63, ReportsTab.jsx:6303) counts by `contactId`/`contactIds` alone, so a survivor's touch leaves out what P20 lists | new (correctness #5) | FILED — batch 3's move of activities' `contactIds` closes it |
| P45 | A restore can land a live account under a merged-away parent (OPEN_ITEMS §4.7 :2427-2446); the account rail's parent chip and ReadRow (AccountRail.jsx:686, :771) then name that parent as live | filed (§18b99 rule 5 :4234); the chip/ReadRow new (sweep §4; completeness F8a) | FILED — with the restore item (a functions batch) |
| P46 | Reports' "Contacts on this deal" reads raw ids (ReportsTab.jsx:5928-5932); a stale whole-row save that writes a merged-away contact's id back draws it | new (sweep NEW-4, tests N2; completeness F8b) | FILED — with the stale-write item (OPEN_ITEMS :2284-2287) |
| P47 | The deals bulk paths accept a merged-away account id (opportunities.mjs:222-231 `accountIdsNotInOrg`) | completeness F8e | FILED already — OPEN_ITEMS :2581-2586 ("they still take a site, or an account merged away") |

The Dispatch Create for a punctuation variant ("resinall inc" while "Resinall, Inc." is merged away) is now closed by
D4 (the `merged` rule reads `searchKey`). A typed name that matches a LIVE dispatch customer or account without being
picked still makes a new customer at Save — the filed item "A new job's customer is made from typed text" (OPEN_ITEMS
:1744-1753), unchanged; the `exact` check stays pinned "as it was" (tests/search-match.test.mjs:496-498).

**If Jeff picks two steps (Q1 B):** G and A are §0.208, B is §0.209. **One batch (Q1 C):** all of it is §0.208, one
commit, one harness run.

---

## 2. Each IN place

Roles: the lists come from the GETs (accounts.mjs:187-209, contacts.mjs:75-97): Admin, Manager, Dispatcher read
every row of the org; a Sales Rep ("User") and ReadOnly read their own and the unassigned; a Technician none.
**None of these places has a Mine/All switch** (only the Accounts and Contacts tabs do, unchanged here). A merged-away
row keeps its owner (merge.mjs:260 accounts, :725 contacts), so a rep sees a merged-away record they own.

**Undo, for every client place:** the Undo's reload (useMerge.js:49-55 `refreshAfter`: an account Undo reloads
accounts, contacts, deals, tasks, activities; a contact Undo all but accounts) sets `mergeArchived: false,
mergedIntoId: null` (merge.mjs:491-493) on the row; each place filters at render or in a memo keyed on the app's
list, so the record is drawn again on that reload. No place caches a filtered LIST in state or a ref. One result is
held in state, as for every data change today: the report builder's `builderResult` (ReportsTab.jsx:2383, set at
:2442, :2474) shows pre-merge or pre-Undo numbers until the report is run again.

**Org scoping, for every client place:** in-memory over the active org's lists (emptied on a switch, App.jsx:487-490;
loads drop another org's answer, useAccounts.js:22-27). No place adds a fetch. The rail opens stay
`requestOrg()/stillOrg()`-guarded as today.

### Step G — the guard (§0.208): §4. Tests and docs only.

### Step A — the screens (§0.209)

#### P1. The header search (AppHeader.jsx, CRLF) — Q3 (recommended: hide, plus a "merged into" line)

Before (:440-441, :443):
```js
const { shown: mA, more: moreA } = matchSearch(accounts, globalSearch, { text: a => a.name, also: a => [a.accountOwner], limit: 5 });
const { shown: mC, more: moreC } = matchSearch(contacts, globalSearch, { text: c => (c.firstName||'')+' '+(c.lastName||''), also: c => [c.company, c.email], limit: 5 });
if (!mA.length && !mC.length && !mO.length) return <div …>No results found</div>;
```
After:
```js
const { shown: mA, more: moreA } = matchSearch(unarchived(accounts), globalSearch, { text: a => a.name, also: a => [a.accountOwner], limit: 5 });
const { shown: mC, more: moreC } = matchSearch(unarchived(contacts), globalSearch, { text: c => (c.firstName||'')+' '+(c.lastName||''), also: c => [c.company, c.email], limit: 5 });
// A name typed in full that only a record merged into another has (state §0.209): one line naming the record it was
// merged into, which opens it — never the merged-away record (pickLink.js mergedInto; the account picker's rule).
const gA = mergedInto(globalSearch, accounts);
const gC = mergedInto(globalSearch, contacts, c => `${c.firstName || ''} ${c.lastName || ''}`);
const lineA = gA && !mA.some(a => a.id === gA.into?.id) ? gA : null;
const lineC = gC && !mC.some(c => c.id === gC.into?.id) ? gC : null;
// What decides each group and the empty answer, named so each is run and pinned (C2).
const noHits = !mA.length && !mC.length && !mO.length && !lineA && !lineC;
const showA = mA.length > 0 || !!lineA;
const showC = mC.length > 0 || !!lineC;
```
(`mO`'s line stays between the contacts line and `gA`, byte-identical; the four `g`/`line` lines and three gate
lines follow it.) :443 → `if (noHits) return …No results found…` (words unchanged).
- Import, a line of its own after :9 (tests/search-match.test.mjs:460 pins :9):
  `import { unarchived, mergedInto, mergedSearchWords } from '../../utils/pickLink.js';`
- :444-454 `GH` and `RR` move to module scope above `export default function AppHeader` (:31), as `SearchGroup` and
  `SearchRow` (same JSX, same `T` tokens), plus a module-scope `MergedSearchLine({ line, noun, onOpen })`: with
  `line.into`, a `SearchRow` (primary `line.into`'s name, secondary `mergedSearchWords(line, noun)`, meta
  "Account"/"Contact", `onClick={onOpen}`); without, one muted, unclickable line of `mergedSearchWords(line, noun)`.
  CLAUDE.md: never define sub-components inside a parent — these lines are edited, so they are hoisted; no input
  inside them, so this is churn, not a focus bug.
- :457: `{mA.length > 0 && <div><GH …/>…` → `{showA && <div><SearchGroup label="Accounts"/>{mA.map(… <SearchRow …/> …)}{lineA && <MergedSearchLine line={lineA} noun="account" onOpen={() => { setGlobalSearch(''); setShowSearchResults(false); setActiveTab('accounts'); { const askedOrg = requestOrg(); setTimeout(() => { if (stillOrg(askedOrg)) setViewingAccount(lineA.into); }, 100); } }}/>}{moreA > 0 && …}</div>}`
  — the row's own `onClick` text (`if (stillOrg(askedOrg)) setViewingAccount(a);`, tests/open-states.test.mjs:207)
  and the `{moreA > 0 && …}` text (harness "header search: the accounts group cuts silently again") kept
  byte-identical. :458 the same for contacts (`showC`, `setViewingContact(lineC.into)`, Contacts tab). If Q7 is A,
  :457's `od` is P25's (below).
- **What the user sees** (UKG's "Resinall, Inc." merged into "Resinall"): typing "Resinall" lists "Resinall" once
  (today: "Resinall" and "Resinall, Inc.", the second opening a record that reads as live, with Edit). Typing
  "Resinall, Inc." in full (any case or punctuation — `searchKey`) shows one row: **Resinall** — "“Resinall, Inc.”
  was merged into this account" (the merged-away record's own name, not what was typed — correctness #10), which
  opens Resinall's rail. Two contacts of one name, one merged into the other: the name lists once (the live one
  matches, so no line). Admin, Manager, Dispatcher: every merged-away row of the org leaves. Sales Rep: their own and
  unassigned leave; one whose survivor is another rep's reads "“X” was merged into another account." with no click
  (the survivor is not in their list). Technician: unchanged (no lists).
- **Keeps the whole list:** `mergedInto` reads the whole list (only merged-away rows can answer 'merged'; the
  survivor is found through it).
- **Undo:** the record is live again on the reload → `unarchived` lists it, `mergedInto` returns null.
- **Risk:** the old name no longer opens the merged-away record — intended; what it held is reached on the survivor
  (Q2). The matcher's relay set (tests/search-match.test.mjs:720, `['peopleMatching']`) is untouched — `mergedInto`
  returns no `{ shown, more }`.

#### P2. Reports → Account history's list (ReportsTab.jsx, CRLF)
- :5079 `const all = accounts || [];` → `const all = unarchived(accounts);`. The two `if (seesAllRecords) return all;`
  lines (tests/roles.test.mjs:186-187) are kept.
- Import, a new line after :23: `import { unarchived, standsFor, accountOfDeal } from '../utils/pickLink.js';`
- **Sees:** the account picker ("Type to search accounts…", :5709-5720) no longer lists merged-away accounts — every
  tier. Admin/Manager/Dispatcher: the org's; Sales Rep: those of their team by name (:5082-5091, unchanged). "No
  accounts available." (:5760) counts the live ones. A selection that becomes merged away falls back to "Select an
  account…" (:5112, :5758-5761).

#### P3. Reports → Contact history's list and its history (ReportsTab.jsx) — Q2
- :5096 `const all = contacts || [];` → `const all = unarchived(contacts);`
- `contactEvents` (:5213-5271): :5215 `const cId = selectedContact.id;` → (comment, then)
  ```js
  // Every contact merged into this one too (state §0.209): a contact merge moves activities' and tasks' contactId, not
  // their contactIds or chips (OPEN_ITEMS §4.7), so what still names the merged-away contact is this one's history.
  const cIds = [...standsFor(selectedContact, contacts)];
  ```
  :5221 `return ids.includes(cId);` → `return ids.some(id => cIds.includes(id));`; :5228
  `if (!linkedToContact(a, cId, conOppIds)) return;` → `if (!cIds.some(id => linkedToContact(a, id, conOppIds))) return;`;
  :5244 the same for `t`; :5271 deps gain `contacts`.
- `conOpps` (:5296-5300), a DISTINCT line so each is pinned once and a harness anchor finds one (proof #7):
  `const conIds = standsFor(selectedContact, contacts);` and `o.contactIds.some(id => conIds.has(id))`; deps gain
  `contacts`.
- **Sees:** one row per person in the contact picker; picking the survivor lists the activities and tasks that still
  name the contact merged into it, and the deals that do; its KPIs count them (with an Undo, they leave again).
  Admin/Manager/Dispatcher: all; Rep: their team's by name, and only activities in their own name (`actInScope`,
  :150-154) — unchanged. Reports' Export PDF prints this screen (`[data-rpt]`, ReportsTab.jsx:445-458), so it shows
  the same (D9).
- **Risk:** a rep whose list lacks a merged-away contact another rep owns cannot see that contact's activities under
  the survivor — they could not reach them before either. `historyFeed.js` is unchanged (its harness entries hold).

#### P4. Reports → "Select contacts to add to this deal" (ReportsTab.jsx) — D2
- :6244 `allContacts={contacts || []}` → `allContacts={unarchived(contacts)}`. `contacts` stays whole for :6253 and
  :6313 (names by id) and :5929 (the deal's people by id).
- **Sees:** a merged-away contact is no longer offered; "All contacts are already on this deal." (:4919) counts live
  ones. Who: anyone who can pick a deal there (`visibleOpps` :5830-5836).

#### P10. The document link picker (DocumentLinkPicker.jsx, CRLF) — D2, D3
- :25 `accounts = [], contacts = [], opportunities = [], …` → `accounts: allAccounts = [], contacts: allContacts = [], opportunities = [], tasks = [], activities = [],`
- New, above the `candidates` memo (:53 — above the early return :85, hooks order and check:tdz):
  ```js
  // The records a link can name anew: none merged into another (guide §18b91 rule 5; state §0.209). A document
  // already linked to one keeps that link (seeded from currentLinks, above); the app's lists keep every row (§18b99).
  const accounts = useMemo(() => unarchived(allAccounts), [allAccounts]);
  const contacts = useMemo(() => unarchived(allContacts), [allContacts]);
  ```
  The builder :53-61 stays byte-identical, so tests/document-link-names.test.mjs's `pickerReads` (:74-85, :120) and its
  run of the builder (:144-176) hold.
- **The links it holds that the offer leaves out** (completeness F4; guide §18b91 rule 4, §16): today a rep's link to
  a record outside their list is counted in "N linked" (:143) and never drawn, so it cannot be unticked here; after
  the line above, every role's link to a merged-away record would be the same. New, after the `candidates` memo:
  ```js
  // A link the document holds that the offer leaves out — a record merged into another, or one the caller's list does
  // not hold — is drawn, ticked, so it can be removed here; never only counted (§18b91 rule 4; state §0.209).
  const heldRows = useMemo(() => {
      const offered = new Set(candidates.map((c) => c.key));
      return (ctx.currentLinks || [])
          .map((l) => ({ key: `${l.type}:${l.recordId}`, type: l.type, recordId: l.recordId, name: l.name, sub: heldLinkSub(l, allAccounts, allContacts) }))
          .filter((x) => x.recordId && !offered.has(x.key));
  }, [docLinkPickerContext, candidates, allAccounts, allContacts]);
  ```
  `heldLinkSub(link, accounts, contacts)` is a module-scope pure function in the file: an account or contact found in
  the whole list and merged away → "Merged into “<survivor>”" (`survivorOf`), or "Merged into another account" /
  "…contact" when the list does not hold the survivor; a record the whole list does not hold → `HIDDEN_ACCOUNT`
  ("An account you can't open"), `HIDDEN_DEAL`, or "A contact you can't open" / "A task you can't open" / "An activity
  you can't open". The results (:151-178) gain, above the groups, an "Already linked" group (the existing group
  header style) drawing `heldRows` with the existing row JSX — ticked while `selected[key]`, a click toggles it; not
  narrowed by the search or the type pills (a few rows). `name` is the name the link stores (`l.name`), or the words
  above when it has none. Done unlinks an unticked one as it does today (:100-110). Import after :14:
  `import { unarchived, survivorOf, isMergeArchived, HIDDEN_ACCOUNT, HIDDEN_DEAL } from '../../utils/pickLink.js';`
- **Sees:** "Link this document to…" no longer offers merged-away accounts or contacts. A document attached to
  "Resinall, Inc." shows, at the top, "Resinall, Inc." — "Merged into “Resinall”", ticked; unticking and Done removes
  that link. Who: whoever may write CRM records (`canEditCrm`: Admin, Manager, Sales Rep); a rep also sees a link to a
  record outside their list said, not hidden.
- **Keeps whole:** the held links come from `currentLinks` (:36-45); `heldLinkSub` reads the whole lists.

#### P11. Dispatch → New Job → Customer (DispatchTab.jsx, CRLF) — D4
- Import, a line of its own after :17: `import { isMergeArchived, resolveLink, linkRefusal, unarchived, heldAccountOption } from '../utils/pickLink.js';`
  and `import { searchKey } from '../utils/searchMatch.js';` on its own line (:17's matchSearch import untouched;
  checked against the pins before the edit).
- A module-scope pure function (above `CustomerTypeahead`, :321), the one rule for the field and its save:
  ```js
  // A name only an account merged into another has — and no dispatch customer has (state §0.209): the account picker's
  // refusal ("“X” was merged into “Y” — pick “Y”."), never a new customer of that name. A customer already named so
  // (one made before the merge, which a merge re-links but never renames — merge.mjs:233) is that customer's to pick.
  const mergedAwayName = (text, customers, accounts) => {
      const r = resolveLink({ text, records: accounts || [] });
      if (r.refusal !== 'merged') return null;
      const key = searchKey(text);
      return (customers || []).some((c) => searchKey(c.name || '') === key) ? null : r;
  };
  ```
- In `CustomerTypeahead`: :336 `.filter(a => !linkedAccountIds.has(a.id) && …)` → `.filter(a => !isMergeArchived(a) && !linkedAccountIds.has(a.id) && …)`
  (:335 byte-identical — pinned prefix, tests/search-match.test.mjs:490); `exact` and `showCreate` (:338-340)
  unchanged (pinned :496-498); after :340 `const merged = q ? mergedAwayName(query, customers, accounts) : null;`;
  the hint (:366-370) shows `{merged ? linkRefusal(merged) : 'New customer — will be created on save'}`; the Create
  row :403 `{showCreate && (` → `{showCreate && !merged && (`.
- In `handleSaveNewJob`, after :5755:
  ```js
  // A name only an account merged into another has makes no customer (state §0.209): refused in the field's words.
  const gone = !newJobForm.customerId && !newJobForm.accountId ? mergedAwayName(custName, customers, accounts) : null;
  if (gone) { setNewJobError(linkRefusal(gone)); return; }
  ```
  (`accounts` is DispatchTab's, :5309; `customers` its state.)
- **Sees:** typing "Resinall, Inc." (or "resinall inc") lists no "CRM accounts — not yet in Dispatch" row for it,
  offers no Create, and the line under the field reads "“Resinall, Inc.” was merged into “Resinall” — pick
  “Resinall”." (the typed text, as the account picker words it — linkRefusal's house wording, pickLink.js:155-176);
  Save Job says the same and writes nothing. If a dispatch customer named "Resinall, Inc." already exists, it is
  listed under "Dispatch customers" and no line shows (correctness #3: the survivor "Resinall" is hidden there,
  `linkedAccountIds`, :333). Who: Admin, Manager, Dispatcher; a Sales Rep only where `repsCanUseDispatch` is on
  (roles.js:103-110).
- **Why decided, not asked (completeness F12):** Dispatch's Create makes a dispatch customer, not a CRM account
  (:318-320), so §18b91 rule 3 does not apply word for word; the reason is its own — a new customer named after a
  merged-away account would be a second customer for the survivor (pickers NEW-2), the duplicate the merge removed.
- **Keeps whole:** `exact`, `resolveLink` read every account.
- **Undo:** `accounts` reloads; Dispatch's own `customers` do not (guide §18b100 rule 6, filed) — harmless here.

#### P12. Dispatch → customer form and record view (DispatchTab.jsx) — D3
- Host (CustomersView): `const draftHeld = draft ? heldAccountOption(draft.accountId, accounts) : null;` and
  `const selHeld = selected ? heldAccountOption(selected.accountId, accounts) : null;` beside :3039/:3043; at :3223
  `heldLink={draftHeld}`, and :3225 `linkedAccount={draftAccount && !isMergeArchived(draftAccount) ? draftAccount : null}`
  (no retired record's address, no "copy address" from it). CustomerEditForm (:2649) takes `heldLink`.
- :2657-2660 after:
  ```jsx
  <select value={draft.accountId || ''} onChange={e => set('accountId', e.target.value)} style={custInput}>
      <option value="">— Not linked —</option>
      {/* A link the options leave out — an account merged into another, one you can't open, one deleted — shows as
          itself, disabled, never as "— Not linked —" (guide §16, §18b24.3); an untouched Save keeps it (state §0.209). */}
      {heldLink && <option value={draft.accountId} disabled>{heldLink.label}</option>}
      {unarchived(accounts).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
  </select>
  {heldLink?.note && <div style={{ marginTop: 5, fontSize: 11, color: T.inkMuted, fontFamily: T.sans }}>{heldLink.note}</div>}
  ```
- The record view's chip (:3261-3267): `{(linkedAccount || selHeld) && (… Linked to account · {selHeld ? selHeld.label : linkedAccount.name})}`.
- **Sees:** merged-away accounts are not offered. A customer that holds one (a stale screen, a link made between a
  merge's read and its batch, a pre-merge restore — merge.mjs:233 re-links the rest) shows "Resinall, Inc. (merged
  into Resinall)", greyed, with the note, and its chip says the same; one outside a rep's list or deleted shows "An
  account you can't open" (today the select shows "— Not linked —" and the chip nothing). **Today's harm, corrected
  (correctness #6):** React's controlled select keeps the held id in state and the save sends `draft.accountId`
  (:3006), so an untouched Save does NOT send ""; the harm is that "— Not linked —" is shown, and a user may pick it
  believing it is the current value (§18b24.3).
- **No survivor id is written:** the select is never re-pointed (merge-kinds (c): a re-point would outlive an Undo).
  An untouched Save sends the held id; the PUT keeps it (`checkLinks` with the stored row as `held`,
  dispatch-customers.mjs:313-318).
- **Keeps whole:** `heldAccountOption`, `draftAccount`, `linkedAccount` read every account by id.

#### P13. The meeting prep panel's contacts (MeetingPrepPanel.jsx, LF) — D2
- :42 `? (contacts || []).filter(c => …)` → `? unarchived(contacts).filter(c => …)`; import after :12. After the early
  return (:23), so a plain call, no hook. Still an equality filter, so search-match G1 reads it as "not a search"
  (tests/search-match.test.mjs:707).
- **Sees:** the five contacts are live — a merged-away duplicate no longer takes a slot. `matchedAccount` (:47-49) is
  P34 (filed).

#### P19. Reports → Opportunity history's account (ReportsTab.jsx) — D5
- :5842 → `const selectedAccount = selectedOpp ? accountOfDeal(selectedOpp, accounts) : null;`
- **Sees:** the Account section (:6074-6107) and "Open account panel ↗" (:6088-6092) are the deal's own account by
  its id — one merged away is shown as the account it was merged into — never a merged-away twin, nor another live
  twin of the name. A deal with no account id: the LATER live account of its name (D5, the tie the engine and the
  industry chart use today — correctness #7). A deal whose account the caller's list does not hold: no panel.

#### P20. A contact's rail, Activity History (ContactRail.jsx, CRLF) — Q2
- Import on a line of its own after :14 (tests/rail-links.test.mjs:349 pins :14 whole — proof #4):
  `import { standsFor } from '../../utils/pickLink.js';`
- :267-274 after:
  ```js
  // Activities linked to this contact — by direct contactId or via involved opportunities — or to a contact merged into
  // it (state §0.209): a contact merge moves an activity's contactId, not its contactIds (OPEN_ITEMS §4.7), so one
  // naming the merged-away contact further down its list is listed here; an Undo, the lists read again, takes it off.
  const ownIds = standsFor(contact, contacts);
  const contactActivities = (activities || []).filter(a => {
      if (!contact) return false;
      if (a.contactId && ownIds.has(a.contactId)) return true;
      if (Array.isArray(a.contactIds) && a.contactIds.some(id => ownIds.has(id))) return true;
      const involvedOppIds = openOpps.map(o => o.id);
      return a.opportunityId && involvedOppIds.includes(a.opportunityId);
  }).sort((a, b) => new Date(b.date || '2000') - new Date(a.date || '2000'));
  ```
  :265 (`openOpps`, a harness anchor) untouched.
- **Sees:** the survivor's "Activity History (N)" lists and opens (:983) the activity that still names the contact
  merged into it. **Risk:** a stale whole-row save can still write the merged-away id back into `contactId` (filed
  :2284-2287) — it stays listed here either way.

#### P43. An account's rail: People, CONTACTS and its Activity tab (AccountRail.jsx, CRLF) — Q2 (correctness #5, completeness F1)
- Import on a line of its own after :13 (account-parent.test.mjs:566 and merged-away-lists.test.mjs:261 pin :13
  whole): `import { standsFor } from '../../utils/pickLink.js';`
- :272 (the predicate; :271 `const accountContacts = (contacts || []).filter(c =>` byte-identical — a harness anchor):
  `c.accountId ? standsFor(account, accounts).has(c.accountId) : (c.company === account?.name)`, with a comment line
  above :271: "a contact linked by id to an account merged into this one too (state §0.209): an account merge renames
  contacts' company, not their accountId (OPEN_ITEMS §4.7)".
- **Sees:** a contact still linked by id to "Resinall, Inc." is in Resinall's People list and CONTACTS (live ones,
  `shownContacts` :277 unchanged), and their activities roll up to Resinall's Activity tab (`acctContactIds` :292).
  An Undo: "Resinall, Inc." stands for itself again, and the contact goes back to its People.
- **Re-anchored:** merged-away-lists.test.mjs:251 (RAIL_CONTACTS' second line) and T4's run of it (handed `standsFor`
  and `accounts`). The census found no such contact in UKG today; this is for the next merge.

#### P21. An account's or contact's Documents tab (RecordDocuments.jsx, CRLF) — Q2
- :15-20 destructure gains `accounts = [], contacts = [],`; import `import { standsFor } from '../../utils/pickLink.js';`.
- :34-37 becomes:
  ```js
  // The records this one stands for (state §0.209): its own id — and on an account or a contact, every record merged
  // into it, whose documents a merge leaves linked where they were (OPEN_ITEMS §4.7): listed here, unlinked here.
  const ids = useMemo(() => {
      if (recordType === 'account') return new Set([recordId, ...standsFor(accounts.find((a) => a.id === recordId), accounts)]);
      if (recordType === 'contact') return new Set([recordId, ...standsFor(contacts.find((c) => c.id === recordId), contacts)]);
      return new Set([recordId]);
  }, [recordType, recordId, accounts, contacts]);
  const docs = useMemo(
      () => documents.filter((d) => (d.links || []).some((l) => l.type === recordType && ids.has(l.recordId))),
      [documents, recordType, ids],
  );
  ```
  `unlinkHere` (:69-72) removes every link of the document to these ids, stopping at a refusal:
  ```js
  const unlinkHere = async (doc) => {
      for (const l of (doc.links || []).filter((x) => x.type === recordType && ids.has(x.recordId))) {
          if (l.id && unlinkDocument && !(await unlinkDocument(doc.id, l.id)).ok) return;
      }
  };
  ```
  Upload, drop and Link existing still name the record itself (`recordLink`, :32). The hosts (AccountRail.jsx:968,
  ContactRail.jsx:952, OpportunityModal.jsx:1481) are unchanged.
- **Sees:** Resinall's Documents tab lists a document attached to "Resinall, Inc." before the merge; its Unlink takes
  it off Resinall AND off "Resinall, Inc." — and an Undo does not put that link back ("Keep later edits"; Q2 says so in
  plain words — correctness #11, completeness F6). The library (Documents tab) is unchanged.

#### P22 (A part). AccountRail.jsx:286-289 → "a contact of this account — the People list's, one merged away, and one
linked by id to an account merged into this one (accountContacts, :271-273; OPEN_ITEMS §4.7)". A whole-line comment,
so `count(rail, 'accountContacts') === 3` (merged-away-lists.test.mjs:294) still counts code only.

#### P25 / P26 (if Q7 A; ride with A — they sit on lines A edits, completeness F11)
- AppHeader.jsx:457's `od` → `opportunities.filter(o => (o.accountId ? o.accountId === a.id : (o.account||'').toLowerCase() === (a.name||'').toLowerCase()) && o.stage !== 'Closed Won' && o.stage !== 'Closed Lost').length`
  (the house read rule — AccountRail.jsx:282, merge.mjs:183).
- ReportsTab.jsx:5135-5137 (`accountEvents`) and :5290-5294 (`accOpps`): `const accIds = standsFor(selectedAccount, accounts);`
  … `o.accountId ? accIds.has(o.accountId) : (o.account || o.accountName || '').toLowerCase() === accName`; **both
  memos' deps gain `accounts`** (:5210, :5294 — correctness #9).
- **Sees:** a deal is counted on the account it is linked to; UKG's "Shell - Port Allen" unit and site each show their
  own deals and KPIs.

### Step B — the server answers and the numbers (§0.210)

#### P17. The public API (public-api.mjs, CRLF) — Q4 (recommended: leave them out)
- :199-200 after:
  ```js
  const conds = [eq(accounts.orgId, orgId)];
  // A merged-away account is answered nowhere, as no screen lists it (state §0.210); NULL reads as not merged.
  conds.push(sql`${accounts.mergeArchived} is not true`);
  if (params.tier) conds.push(eq(accounts.accountTier, params.tier));
  ```
  :248-249 the same with `contacts`. In `conds`, so `total` (:203, :252), the page (:208, :257), `totalPages` and
  `hasNextPage` agree. The column is named through drizzle (tests/audit-close.test.mjs:128-148 sees a column).
  `is not true` = merge.mjs:495-496's `or(isNull(…), eq(…, false))`; no import added (`sql` is :22's).
- Header comment, after :12: ` * accounts and contacts leave out a record merged into another (Find & merge); total counts what is listed.`
- **Sees:** an outside app gets only live rows; `?company=Resinall` no longer answers a merged-away contact whose
  company a merge renamed (merge.mjs:240). The key reads the whole org (:106). Today no answer changes (the one org
  with a used key holds no merged-away row; UKG holds no key). **Undo:** read per request — back at once.
- **Risk / trade (completeness F5):** a syncing app that already copied "Resinall, Inc." sees it vanish with no sign
  it was merged (no merge webhook, no single read — server §1.2(3)); Settings → Data's export runs keep merged-away
  rows with `mergeArchived`/`mergedIntoId` (export-runs.mjs:29, :33, :97-100). A switch to ask for them
  (`include_merged=true`, with a `merged_into_id` field) is additive later.

#### P27. The quote's fallback recipient (quote-email.mjs, CRLF) — D8
- :126-128 → `allContacts.find(c => c.mergeArchived !== true && \`${c.firstName || ''} ${c.lastName || ''}\`.trim() === primaryName)`
  (the house JS form, opportunities.mjs:202; NULL reads live). :121 untouched (tests/deal-engagement.test.mjs:336-344
  counts one `contacts…split(` there).
- **Sees:** a quote emailed with no billing email goes to the live contact of the deal's first name, never a
  merged-away duplicate's old address; a name only a merged-away contact has answers the existing 422 "No customer
  email found…" (:140-147). **Org:** :125 reads `eq(contacts.orgId, orgId)`. **Undo:** read per send.

#### P5. "# of accounts" — the report engine (reportQuery.js, LF) — D5, D6
- Imports (:30-36) gain `import { unarchived, isMergeArchived, survivorOf } from './pickLink.js';` — pickLink.js is
  pure and server-safe (it imports only ./searchMatch.js, tests/pick-link.test.mjs:376-380). It joins the bundles of
  report-deliveries.mjs, saved-reports.mjs (Send now) and report-prompt.mjs (`_reportPromptShape.mjs:7`) — a
  functions deploy; tests/function-imports.test.mjs must stay green.
- :293-300 after:
  ```js
  const oppsByAccount = new Map();
  // A deal's money goes to the account it stands on (state §0.210): by its id — one merged into another, the account it
  // was merged into (survivorOf, through the accounts given) — else, for a deal with no id, the live account of its name
  // (the later of two, as before). A merged-away account is no row of a report, so no deal is counted on one.
  const accts = Array.isArray(data?.accounts) ? data.accounts.filter(Boolean) : [];
  const accountById = new Map(accts.map(a => [a.id, a]));
  const byName = new Map(unarchived(accts).map(a => [str(a.name).toLowerCase(), a.id]));
  for (const o of opps) {
      const held = o.accountId ? accountById.get(o.accountId) : null;
      const id = held && isMergeArchived(held) ? survivorOf(held, accts)?.id : (o.accountId || byName.get(str(o.account).toLowerCase()));
      …(unchanged)
  ```
- :332 `const scanned = …` → `const scanned = source === 'Accounts' ? unarchived(rowsAll) : Array.isArray(rowsAll) ? rowsAll.filter(Boolean) : [];`
  with a comment line above. The name stays (:338 is the harness anchor "report builder: the period is ignored").
- **Sees:** a report on the Accounts source — Home's pinned reports, the builder's preview and its line "N of M
  accounts in the period…" (:4377), a saved report opened, Send now, the scheduled email and Slack post — counts and
  lists no merged-away account; a deal that pointed at one is counted on its survivor (D6), so no money leaves
  "Revenue (won)", "Open pipeline" or "# of deals". Admin/Manager: the org; Sales Rep: own + unassigned on screen, own
  only in the email (P40, filed). **Undo:** the screens' lists reload (an open builder needs a re-run, §2 above); the
  server reads per run. **Org:** the server's `loadReportData` reads `eq(table.orgId, orgId)` (report-deliveries.mjs:67-69).
- **Risk:** a deal whose merged-away account's survivor is outside a rep's list is counted in no row of that rep's
  report — the edge only (a merge moves deals' `accountId`, merge.mjs:235).

#### P6 / P7. Settings → Segments and Industries counts (CRLF; Admin only, App.jsx:2161)
- AccountSegmentsDetail.jsx:97-111:
  ```js
  const { accounts = [] } = useApp();
  // The live accounts (state §0.210): one merged into another is counted nowhere, as no list shows it.
  const live = useMemo(() => unarchived(accounts), [accounts]);
  const segCounts = useMemo(() => { … for (const a of live) { … } … }, [live, tiers]);
  …
  const topLevelCount = live.filter(a => !a.parentAccountId).length;
  ```
  IndustriesDetail.jsx:153-166 the same (`counts`, `topLevelCount`). Imports `import { unarchived } from '../../../utils/pickLink.js';`.
  tests/connected-apps.test.mjs:138-139's pins hold. (The top-level rule reads `parentAccountId` only, as today: no
  row carries a legacy `parentId` — db/schema.ts has no such column, accounts.mjs:169.)
- **Sees (Admin):** each tier's and industry's count, the bars, the %s and "X of Y accounts assigned a segment" /
  "…matched to a primary industry" leave out merged-away top-level accounts.

#### P8. "View accounts" — Q6 (recommended: grey it out, file making it work)
- AccountSegmentsDetail.jsx:230-236 → `{ label:'View accounts', note:'Not available yet', disabled:true, action: () => setOpenTierKebab(null) },`
  (the menu's own disabled style, :240-245). IndustriesDetail.jsx:283 → `{ label:'View accounts', sub:'Not available yet', action:() => setOpenIndKebab(null), muted:true },`
  (as "Reassign accounts…" beside it). The dead prop chain (useUIState.js:73, :125; SettingsTab.jsx:30; AdminView.jsx:95,
  :454, :466; CustomerTypesDetail.jsx:20) is filed with the re-wire.

#### P9. Buyer Personas — D7
- :98-104 → `unarchived(contacts).forEach(c => { if (c.buyerPersona) … })`; a function
  `countOf(p) => (contactCounts[p.name] || 0) + (p.id && p.id !== p.name ? contactCounts[p.id] || 0 : 0)` replaces
  `contactCounts[p.name] || 0` at :220, :298, :309-311, :314. `totalContacts` (:106) sums the live counts.
- **Sees (Admin):** the Contacts column, the preview's counts and the Distribution count live contacts, those given a
  persona from Reports included (today uncounted, so Delete was allowed while in use); a persona only merged-away
  contacts hold reads 0 and its Delete is enabled (the problem Jeff named, OPEN_ITEMS :2341-2345).
- **Undo:** a merge undone after its persona was deleted brings back a contact whose persona the rail shows as plain
  text (ContactRail.jsx:861) and Reports as "—" (:6305).

#### P14 / P15 / P16. The merge windows' and the delete warning's counts — Q5 (recommended: count what you can see)
- MergeReviewModal.jsx:60 → `const opps = (opportunities || []).filter(o => o.accountId ? o.accountId === acc.id : o.account === acc.name).length;`
  (merge.mjs:183; AccountRail.jsx:282; useAccounts.js:59-60); :61 → `unarchived(contacts).filter(c => c.company === acc.name).length`;
  :63 → `unarchived(accounts).filter(x => (x.parentAccountId) === acc.id).length`. Import added.
- ContactMergeReviewModal.jsx:68-69 → `const orgChart = unarchived(contacts).filter(other =>` / `other.id !== aId && other.id !== bId && (`
  — by the ids the window was opened on, never `cA`/`cB`, which `countsFor` does not depend on: the modal is always
  mounted (ModalLayer.jsx:1230), so `countsFor` would keep the nulls of the first render (correctness #1). :74's deps
  → `[opportunities, activities, tasks, contacts, aId, bId]`. Import added.
- useAccounts.js:76 → `const children = accounts.filter(a => goingIds.includes(parentOf(a)) && !goingIds.includes(a.id) && !isMergeArchived(a));`
  (`isMergeArchived` already imported, :6). The server still lifts merged-away children; the delete's Undo puts back
  what the server answers (unchanged).
- **Sees (Admin):** "N linked", the cards' "opps / contacts / activities / subs", the summary "Merging re-links …" and
  "N sub-accounts will move to the top level" count what the lists show. The default survivor is chosen from these
  counts once per opening (§0.207, T19).
- **Risk:** reverses §0.206's choice for the delete warning (guide §18b99 rule 2, T3, tests/account-parent.test.mjs:635,
  harness entry "the delete's confirm leaves out a merged-away sub-account the server lifts", mutate-import.mjs:13082
  — retired in B, §5.4).

#### P18. Reports' industry chart (ReportsTab.jsx) — D5
- :3945-3947 → drop `acctByName`; `const ind = o.vertical || accountOfDeal(o, accounts)?.verticalMarket || 'Other';`
  with the comment as P19. **Sees:** "Industry mix" counts a deal under its own account's industry. For an id-less
  deal with two live twins, the later one, as today. tests/history-feed.test.mjs:94 re-anchored.

#### P23. merge.mjs:259 (comment only, CRLF): `// Soft-archive the loser (kept for its Undo; no screen, report or public-API answer lists a merged-away row — guide §18b101).`
No test or harness entry quotes the line (grep). OPEN_ITEMS :2602-2610 closed.

---

## 3. The shared helpers (src/utils/pickLink.js, LF; pure — tests/pick-link.test.mjs:376-380 still holds)

Reused as they are: `isMergeArchived` (:44-46), `unarchived` (:50-52), `survivorOf` (:64-75), `resolveLink` (:104-148),
`linkRefusal` (:164-180), `HIDDEN_ACCOUNT`, `HIDDEN_DEAL` (:40-41). New, each exported, its contract in a comment
(step A):

```js
// The ids a record stands for (state §0.209): its own, and every record of `records` merged into it — directly or
// through later merges (survivorOf, MERGE_HOPS) — so a screen that finds what names a record also finds what still
// names one merged into it (a merge moves no activity's contactIds, task's chips, document's link or contact's
// accountId). A record merged away stands for itself alone. An Undo un-archives the record merged away: it stands for
// itself again, not the survivor. A Set of ids; empty for no record.
export function standsFor(record, records) { … }

// A name typed in full that only records merged into another have (resolveLink's 'merged', over the whole list), for
// a box that lists the live ones: { text, name, into } — `name` the merged-away record's own name when one has it, else
// the text as typed; `into` the one live record of `records` they were merged into, null when the list holds none or
// more than one. null when a live record has the name, or none does.
export function mergedInto(text, records, labelOf = (r) => r.name) { … }

// The words of the header search's merged line (state §0.209): with `into`, "“<name>” was merged into this <noun>";
// without, linkRefusal's "“<name>” was merged into another <noun>."
export function mergedSearchWords(line, noun = 'account') { … }

// The account a deal stands on, for a screen that shows it (state §0.209): its accountId's — one merged into another,
// the account it was merged into when the list holds it live (survivorOf), else none — and, for a deal with no account
// id, the LATER live account of its name (lower case, as Reports reads names; the tie the report engine and the
// industry chart use). An id the list does not hold: none.
export function accountOfDeal(deal, accounts) { … }

// What an account <select> or chip shows for the link it holds when the options (the live accounts) leave it out —
// itself, disabled (guide §16, §18b24.3): { label, note }. One merged away: "<name> (merged into <survivor>)" and the
// note naming what to pick; one the list does not hold: HIDDEN_ACCOUNT, no note. null when the options hold it, or none.
export function heldAccountOption(id, accounts) { … }
```

Bodies: `standsFor` — `new Set([idOf(record.id), …list.filter(r => isMergeArchived(r) && idOf(survivorOf(r, list)?.id) === idOf(record.id)).map(r => idOf(r.id))])`;
`mergedInto` — `resolveLink({ text, records: list, labelOf })`, then `matches`' survivors de-duplicated by id, and
`name = matches.length === 1 ? labelOf(matches[0]) : r.text`; `accountOfDeal` — by id (`find`, then `survivorOf` when
merged away), else the last of `unarchived(list).filter(a => (a.name||'').toLowerCase() === (deal.account||'').toLowerCase())`;
`heldAccountOption` — `find` by id over the whole list; live → null; missing → `{ label: HIDDEN_ACCOUNT, note: '' }`;
merged away → label and note from `survivorOf` (words §7). Each walks the list once; `survivorOf` runs only for
merged-away rows (8 in UKG today).

reportQuery.js keeps its own maps (P5) because it runs per deal over the whole org on the server; its rule is
`accountOfDeal`'s, the same later-of-two tie (C1 and C15 pin both on one fixture). DocumentLinkPicker's `heldLinkSub`
and DispatchTab's `mergedAwayName` are module-scope in their files (each reads its own screen's shape).

---

## 4. The class-wide guard (step G: tests/merged-away-lists.test.mjs T8, T9; new T10)

**Choice: the hybrid** — shape rules, props followed, a module-checked resolver list, named reads with reasons
(map-tests §A5). Why not an entry per read (~98): every reformat of any of 108 reads in 25 files would fail it, and it
still could not see props, containers or helpers. Why not by-shape over `useApp()` alone: ActivityHistoryTab,
SavedReportsTab, AddContactToOppPanel, CustomerTypeahead, CustomerEditForm and the deal window's tabs receive the
lists as props — the very places this batch fixes.

**T8, class-wide.**
1. **Files, by parse:** every `src/**/*.{js,jsx}` that imports `useApp` from a relative path ending `AppContext`
   (`(?:\.\.?\/)+AppContext(?:\.jsx)?`); an aliased import (`useApp as x`) is refused. Floor: **57** files (one more
   file, src/hooks/useDocuments.js, names `useApp()` in a comment only, :5 — map-tests' 58 counted text), and reads of
   each of the four keys found. Never `useContext(AppContext)` (QuotesTab.jsx:61's own context passes).
2. **Components:** a function's name is its own id, or the `VariableDeclarator` an arrow/function expression is bound
   to (`export const BuyerPersonasDetail = (…) => {`). Every component holding `useApp()` is found — the file's own,
   or a `*Host` (ActivityDetailDialog.jsx:93 `ActivityDetailDialogHost`, CoachingNoteDialog.jsx:136
   `CoachingNoteDialogHost`).
3. **A destructure of `useApp()`:** each key read under its own name, an alias and a default followed; a rest element
   or a **computed key** refused (today's helper drops computed keys, merged-away-lists.test.mjs:499).
4. **A whole-context binding (`const x = useApp()`, or `useApp().key`):** `x.key` and `x?.key` read `key`; a bare
   truthiness test of the binding (`x &&`, `if (x)`, `x ? … : …`) is no read; any other use (passed on, spread,
   destructured later) is refused, except the named hand-offs `WHOLE_CONTEXT = { file: [[exact call text, reason]] }`
   — today one: AutomationsDetail.jsx:433 `recordName(run, lists)` ("reads opportunities, leads and tasks by id to name
   a run's record, :325-332; no account or contact"). LeaveGuardModal.jsx:20-21 (`app && app.escapeBlocked ? …`) and
   AutomationsDetail.jsx:131 (`useApp().settings`) pass (correctness #8, proof #3).
5. **Shapes that need no entry** (each in a `SHAPES` comment with its reason):
   - **live** — the argument of `unarchived(…)`;
   - **deps** — an element of a hook's dependency array (`useMemo`, `useEffect`, `useCallback`, `React.*`);
   - **byId** — `<list>.find(p => p.id === X)` or `X === p.id`, the receiver the list or `(list || [])`: exactly one
     `===` with the predicate's own parameter's `.id` on one side, no `||`/`&&` chain. **Its limit, said in the
     comment (proof #5):** a byId resolves a link by id and may return a merged-away row where a merge left the link
     on it (contacts' `accountId`, invoices', documents' — P31); a new byId whose result is DRAWN should go through
     `linkedAccount` / `survivorOf` / `heldAccountOption` — a reviewer's question, which no parse can answer;
   - **liveOnly** — `<list>.filter(p => …)` (or `(list || []).filter`) whose predicate's top-level `&&` chain holds
     `!isMergeArchived(p)` on the predicate's OWN parameter (ActivityRail.jsx:78, TaskRail.jsx:703, DispatchTab.jsx:336);
   - **resolver** — anywhere inside the arguments of a call to a name in `RESOLVERS = { name: [module, reason, test] }`,
     where the callee is bound by an import from that module (a same-named local function never launders a read).
     Entries: pickLink.js — resolveLink, standsFor, mergedInto, accountOfDeal, heldAccountOption, siteLine (a link or a
     name resolved through the whole list, a merged-away one named as its survivor); railLinks.js — linkedAccount,
     outOfList, contactCompany, activitySeed, activityLinks, companyAfterDealPick; taskLinks.js — taskSeed, taskLinks,
     chipLabel; dealAccount.js — resolveDealAccount, isHiddenAccount, sitesOf (lists live only); accountParent.js —
     parentChoices, parentLeftOut, typedParentRefusal; importParents.js — importPasses; dealEngagement.js —
     contactIndex, dealCommittee, engagedContacts, onDealOf (tests/deal-engagement.test.mjs:84-101); buyingCommittee.js —
     contactsToAdd. Each entry names the test label that runs it on a merged-away row; one with none found at build
     time leaves RESOLVERS for WHOLE_READS with its reason. `survivorOf` and `dealCompany` are not entries (no scanned
     read calls them — proof #8); TasksTab.jsx's `resolveAccountName`, `resolveActivityAccount`, `applyFilters` (local,
     :75, :97, :300) are named reads ("by id; the merge moves the ids they read — tasks', activities', deals'
     `accountId`; a stale write is the filed edge"). A name in RESOLVERS that no scanned read uses fails as stale.
   - **followed** — a JSX attribute whose value is a tracked name (or `name || []`, `name ?? []`) handed to a component
     defined in the same file or reached by one relative import: a receiver whose first parameter is an
     ObjectPattern maps the prop to the key (an alias and a default followed; a rest element or `{...props}` of a
     tracked binding refused); a receiver whose first parameter is an Identifier (`function P(props)`) is followed
     through `props.<prop>` / `props?.<prop>` member reads and a later `const { prop } = props`, and any other use of
     `props` is refused (proof #2). Its body is scanned under the same rules. A receiver the guard cannot find fails.
     Today's 17 hand-offs all resolve to destructured receivers (proof's prototype): ReportsTab.jsx:2089-2090 →
     `ActivityHistoryTab` (:5021), :2108 → `SavedReportsTab` (:2358), :6244 → `AddContactToOppPanel` (:4871);
     DispatchTab.jsx:6696 → `CustomerTypeahead` (:321), :6558 → `CustomersView` → :3223 `CustomerEditForm` (:2649);
     ContactsTab.jsx:921 → `CompanyTwoPane` (:317); ActivityRail.jsx:363 → `ContactMultiSelect` (:71);
     ModalLayer.jsx:192-193 → OpportunityModal.jsx (:992) → its tabs (:1458, :1464, :1478, :2217);
     ModalLayer.jsx:447-448 → CsvImportModal.jsx:105.
6. **Everything else is a named read:** `WHOLE_READS[file] = [[key, exact trimmed line, times, reason, fate]]`, each
   read exactly `times` (a moved line fails: "take it out of the list"). The lists, written now (proof #9; the after-A
   list is the proof critic's prototype run over the tree with A applied in memory, 27 reads on 25 lines; the G list
   adds A's own reads from the lines this design edits — the G commit's first run must print exactly the G list; a
   line it prints that is not here is read and classified, never named because the run printed it):
   - **Stay (after B, 16 lines, 18 reads):** ContactDuplicateScanView.jsx:124 ×2 and DuplicateScanView.jsx:122 ×2
     (the scan key — merge machinery, §0.207); DispatchTab.jsx:338 `exact` (the create-guard, D4); HomeTab.jsx:192 and
     ReportsTab.jsx:2390 (the report data — "handed whole to runReport, which leaves merged-away rows out (C15)" from B;
     "counted until §0.210" before); ReportsTab.jsx:5929 (the deal's people by their ids — a contact merge rewrites a
     deal's contactIds, merge.mjs:671-682; P46 filed); AccountRail.jsx:266 (`accountsById`, an index by id for the
     Parent field), :271 (`accountContacts`, whole on purpose — T4, P43); and the matched-by-name item's (P34, filed):
     ContactsTab.jsx:367 (CompanyTwoPane), MeetingPrepPanel.jsx:48, AccountRail.jsx:314 (`checkDuplicate`),
     CsvImportModal.jsx:308, :309, ModalLayer.jsx:469, LeadModal.jsx:312, DispatchTab.jsx:5413 (`buildWonBridgeJobs`).
   - **Fixed in B (named "until §0.210" in G and A):** ReportsTab.jsx:3945 (P18); AccountSegmentsDetail.jsx:101, :111
     (P6); IndustriesDetail.jsx:157, :166 (P7); BuyerPersonasDetail.jsx:100 (P9); MergeReviewModal.jsx:61, :63 (P14);
     ContactMergeReviewModal.jsx:68 (P15).
   - **Fixed in A (named "until §0.209" in G):** AppHeader.jsx:440, :441 (P1); ReportsTab.jsx:5079, :5096 (P2, P3, via
     the hand-off), :5842 (P19), the `AddContactToOppPanel` body's read of `allContacts` (:4880-4890, via :6244 — P4);
     DocumentLinkPicker.jsx:55, :57 (P10); DispatchTab.jsx:336 (P11), :2659 (P12, via CustomersView → CustomerEditForm);
     MeetingPrepPanel.jsx:42 (P13). (Estimated from the lines; the first G run settles it, by the rule above.)
7. **App.jsx and the hooks are outside the scan, pinned instead (completeness F9, proof #11):** App.jsx hands no list
   as a JSX prop (0 today — pinned as 0), and its whole-list reads are named: :839-842 (the context's
   `visibleAccounts`/`visibleContacts`, which the tabs pass through `unarchived`), :1104 (`allContacts`, dead — P40).
   Only useAccounts.js:24 and useContacts.js:21 GET the list endpoints (a GET of either outside them fails: a screen
   that self-fetches a list is outside the guard). useAccounts.js:76 (P16) is pinned by T3 as today. Utils are not
   scanned; the engine (P5) is held by C15.
8. **The existing assertions stay:** every read named or shaped; each named read counted; no shadowing (a tracked name
   declared again in a scanned body, a followed receiver's included). The five lines today's T8 alone guards (the
   Accounts tab's Signal sort and "Needs attention" lane, the Contacts tab's Company view, name-sorted rows and header
   count — mutate-import.mjs:13154-13170) stay caught (proof's prototype). AccountsTab's and ContactsTab's six entries
   (:420-427) become shapes, except CompanyTwoPane's matchedAccount (followed, named).

**T9 grows** (made-up components; each rule shown seeing a read and refusing a hiding shape): an arrow component named
from its const; a `*Host` component; a deeper `'../../AppContext'` import; an aliased `useApp as x` refused; a
computed key refused; a whole-context binding (`app.contacts.length` and `app?.contacts` reads, `app.settings` none,
`if (app)` / `app && app.x` no read, `fn(app)` refused unless named); a same-file prop hop
(`<Pane rows={contacts}/>`, `function Pane({ rows: list = [] })`, `list.map(…)` read at its line under `contacts`); an
identifier-parameter hop (`function P(props) { return props.rows.length; }` a read; `function P(props) { return use(props); }`
refused); a hop through a relative import (a made-up two-file map); `{...props}` of a tracked name refused; each shape
— `unarchived(x)` and deps not reads; `x.find(r => r.id === id)` none, but `x.find(r => r.name === n)` and
`x.find(a => a.id === i || a.name === n)` reads; `x.filter(r => a && !isMergeArchived(r))` none, but
`x.filter(r => isMergeArchived(r))` and `x.filter(r => !isMergeArchived(other) && a)` reads; `resolveLink({ records: x })`
imported from pickLink none, but the same call to a local `function resolveLink` a read, and `other({ records: x })` a read.

**T10 — the server's reads (new).** Every `netlify/functions/*.mjs` that imports `accounts` or `contacts` from the
schema, or selects through a generic `from(table)` (14 today, proof #12: accounts, ai-score, backup, contacts,
duplicates, documents, export-runs, email-inbound, merge, opportunities, quote-email, public-api, report-deliveries,
_links) is named in `SERVER_READS = { file: [reason, selects] }`, and **each file's count of selects from either table
is pinned** (`.from(accounts)` / `.from(contacts)` and the generic callers' table arguments), so a new select in a
named file fails until classified (proof #12). Reasons: keep whole — the GETs and the clear, backup, export runs,
merge, _links; filter in JS — duplicates.mjs:227, :264, quote-email.mjs (B); follow to the survivor — ai-score,
opportunities' `accountLink`; filter in SQL — public-api (B: and its two `conds` lines pinned verbatim, `is not true`,
between `const conds = [eq(<table>.orgId, orgId)];` and `const whereExpr = and(...conds);`); the engine —
report-deliveries → reportQuery.js (B); filed — documents, email-inbound. A function newly reading either table fails
until named.

**Floors:** the suite's self-pin (T7) stays. A's new suite adds one: tests/sales-links.test.mjs:783's floor rises 15 →
16, and guide §18b100 rule 9's count with it.

---

## 5. Tests

**Gate order (CLAUDE.md), each step:** check:tdz, check:inline, check:dupes, check:dbfetch, check:fnscope,
check:handoff, `npm run build` (then `rm -rf dist`), `npm test`; then `npm run test:int`; then the stale-anchor and
uniqueness pre-check (every harness anchor parsed against THIS step's tree, and each its file's only match — memory),
then `node scripts/mutate-import.mjs` (baseline green first; never with `netlify dev` up; never stopped; `git status`
after); then the pane (A, B).

**Re-cut from Jeff's answers before the build (proof #15):** the C-tests, harness entries and pane steps below follow
the recommended answers. Each answer that differs removes or adds its own (e.g. Q3 B removes `mergedInto`,
`mergedSearchWords`, C2's merged-line runs and three harness entries; Q2 B removes P20, P21, P43 and C11-C13).

### 5.1 New unit suite (step A, grown in B): `tests/merged-away-cleanup.test.mjs` (LF), titles labelled C1…, added to SUITES

Made-up rows in Jeff's shapes, as merged-away-lists.test.mjs:78-97 (Resinall / "Resinall, Inc."; Evonik's Lafayette
twins; a NULL-marked row; an undone merge; Lee Ng and his merged-away twin), plus: `act_orphan` (contactIds
`['con_ana', 'con_lee_dup']`, contactId `con_ana`, no deal), `task_chip` (contacts `[{ id: 'con_lee_dup' }]`), a
document linked to `acc_resinall_inc`, a contact `con_tia` with `accountId: 'acc_resinall_inc'`, a won $50k deal on
`acc_resinall_inc` (a stale id), an id-less open deal "Evonik - Lafayette", two live twins "Shell - Port Allen" (unit,
site), Lee's merged-away twin holding persona "Champion" and Ana holding persona id `champion`. **Fixture order is
stated per test** (proof #10): C6's has the merged-away Lafayette twin FIRST (so the old `.find` by name takes it);
C15's keeps it later (so the old `Map` takes it). Every screen line is read from its file, pinned as whole lines in
order (`order`, `once`), and **run as written** (`new Function`, the T1 pattern, merged-away-lists.test.mjs:119-160);
a memo is run WHOLE by AST-slicing its callback (as tests/document-link-names.test.mjs:144-156 does), its free names
handed in; **the lines as they stand on 7ee14fe** (`OLD_*`) run once on the same rows, each asserting the old answer
holds the merged-away row (or the wrong count). Where a line reads the merge mark, an **Undo run** repeats it with the
row's mark false and `mergedIntoId` null.

Step A:
- **C1 pickLink helpers** — `standsFor` (Resinall: itself and "Resinall, Inc."; a chain A→B→C: C for all three; a
  merged-away record: itself; an undone row: itself; none → empty); `mergedInto` ("Resinall, Inc." → into Resinall,
  name "Resinall, Inc."; "resinall inc" → the same, name "Resinall, Inc."; "Evonik - Lafayette" → null, a live twin;
  a survivor outside the list → into null; '' → null); `mergedSearchWords` (both forms); `accountOfDeal` (id;
  merged-away id → survivor; id outside the list → null; id-less → the later live twin, never the merged-away one —
  the same tie as C15); `heldAccountOption` (live → null; merged away → label and note; missing → HIDDEN_ACCOUNT;
  '' → null). Undo runs.
- **C2 header search** — the two matcher lines, the four `gA/gC/lineA/lineC` lines and the three gate lines (`noHits`,
  `showA`, `showC`) run with the real `matchSearch`/`unarchived`/`mergedInto`: "Resinall" lists Resinall only;
  "Resinall, Inc." → `mA` empty, `lineA` names Resinall, `noHits` false, `showA` true; "nothing" → `noHits` true; OLD
  :440 lists "Resinall, Inc.". The `if (noHits)` line, both group openings (`{showA && <div>`, `{showC && <div>`) and
  the row and merged-line click texts pinned once (proof #6); `SearchGroup`, `SearchRow`, `MergedSearchLine` at module
  scope (no `const GH =` inside the IIFE).
- **C3 Reports lists** — :5078-5108 run for an Admin and a rep (with `settings.users`): no merged-away row; OLD once.
- **C4 Reports contact history** — the `contactEvents` and `conOpps` memos AST-sliced and run whole (handed
  `linkedToContact`, `standsFor`, `inPeriod`, `taskDay` and whatever else the slice's own parse names free — proof #7):
  Lee's history holds `act_orphan` and `task_chip`, his deals the twin's; OLD does not; Undo run: Lee's does not.
- **C5 add panel** — the `allContacts={…}` attribute expression AST-sliced from :6244 and evaluated, then fed to
  `available` (:4880-4890): no twin; OLD (`contacts || []`) once (proof #10).
- **C6 Opportunity history account** — :5842 run on the twin-first rows: the deal's own account; an id-less deal on
  the Shell twins → the later; OLD takes the merged-away twin.
- **C7 document link picker** — the two memos, then the builder (sliced as document-link-names.test.mjs:150-156): no
  merged-away candidate; `heldRows` and `heldLinkSub` run: a held link to "Resinall, Inc." → "Merged into “Resinall”";
  a held link the whole list lacks → "An account you can't open"; a held live link → not a held row; OLD (the builder
  on the whole lists) has the merged-away candidates.
- **C8 Dispatch typeahead and save** — :335-336 run with `matchSearch` (real); `mergedAwayName` run: "Resinall, Inc."
  and "resinall inc" → the refusal; with a dispatch customer named "Resinall, Inc." → null (correctness #3); a live
  name → null. The hint line, the `{showCreate && !merged && (` line and handleSaveNewJob's two refusal lines pinned
  once, and the refusal lines run with stubs (`setNewJobError` recorded, nothing else called). OLD :336 offers the row.
- **C9 Dispatch select and chip** — the host lines `draftHeld`/`selHeld` run; `heldAccountOption` on a held
  merged-away id, a missing id, a live id; the `linkedAccount={…}` hand-off expression run (merged away → null); the
  option order pinned (`— Not linked —`, the escape `disabled`, then `unarchived(accounts)`), the chip's label
  expression run. OLD: a pin only (that the old select had no escape) — what the browser draws is not a run.
- **C10 meeting prep** — :41-44 run: the five live; OLD gives the twin a slot.
- **C11 contact rail** — :267-274 run: `act_orphan` listed on Lee; OLD not; Undo run: not.
- **C12 RecordDocuments** — the `ids` and `docs` memos and `unlinkHere` run, with a stub `unlinkDocument` answering
  `{ ok }` as the real one does (useDocuments.js:172-179) and recording calls: Resinall's tab lists the "Resinall,
  Inc." document; Unlink removes both links of a doc linked to both, and stops at a refusal; OLD (:34-37, by
  `recordId`) does not list it; Undo run: does not; a rep whose list lacks "Resinall, Inc." → own links only.
- **C13 account rail reach** — RAIL_CONTACTS (as re-anchored) run with `standsFor` and `accounts`: `con_tia` in
  Resinall's `accountContacts` and `shownContacts`; OLD not; Undo run: not.
- **C14 riders (Q7 A)** — :457's `od` and the two Account-history filters run on the Shell twins: each its own deals;
  the deps lines with `accounts` pinned; OLD once.
- **C-self** — "the suites: this file is graded by the harness": the exact self-pin line and `SUITES_PARSE`
  (tests/sales-links.test.mjs:768-788).

Step B:
- **C15 report engine** — `runReport` (imported) on the rows: "# of accounts" counts live rows (the NULL-marked
  counted); "Revenue (won)" $50k on Resinall; the id-less Lafayette deal on the live site; the Shell id-less deal on
  the later twin (C1's tie); `scanned` and `count` exclude merged-away; OLD :294 and :332 run once (the twin counted;
  the deal on the merged-away row). tests/report-query.test.mjs:136-142 stays green unchanged.
- **C16 Settings counts and "View accounts"** — both panels' `live`/count/`topLevelCount` lines run: "Resinall, Inc."
  (top level, a segment, an industry) not counted; OLD counted. Both "View accounts" items pinned whole (disabled /
  muted, "Not available yet") (proof #10).
- **C17 personas** — the count lines and `countOf` run: Champion 0 (only the merged-away twin), Ana counted by id;
  OLD: Champion 1, Ana 0.
- **C18 merge windows and the delete warning** — `countsFor` (both windows) and the `children` line run: live only,
  deals by id; ContactMergeReviewModal's deps line pinned with `aId, bId` and the orgChart predicate reading `aId`/`bId`
  (correctness #1: a `new Function` run cannot see a stale closure — the pin is the proof); the default survivor run
  on a pair whose old counts would have chosen the other; OLD once.
- **C19 industry chart** — on the twins; OLD once.
- **C20 public API** — both blocks' merge lines pinned verbatim, after the org line and before `whereExpr`: `is not
  true`, not `= false` (T10 holds the class).
- **C21 quote email** — quote-email.mjs's `find` run on `[con_lee_dup (old@), con_lee (new@)]`: the live address; OLD
  the merged-away one's.

### 5.2 Re-anchored existing pins (each changed in its step's commit, its message kept true)
- **G:** tests/merged-away-lists.test.mjs T8 rewritten, T9 grown, T10 new, comments (P22: :5-9, :13-16, :26-32,
  :280-281, :411-413).
- **A:** tests/search-match.test.mjs:470, :472 (the header's two matcher lines, whole); tests/history-feed.test.mjs:114-115
  (the two `linkedToContact` calls → the `cIds.some(…)` lines); merged-away-lists.test.mjs:251 (RAIL_CONTACTS' second
  line) and T4's run of it (P43); WHOLE_READS' A entries out; tests/sales-links.test.mjs:783 floor 15 → 16, "sixteen
  since §0.209". Held by design (checked): tests/rail-links.test.mjs:349 (ContactRail :14 untouched — `standsFor` on
  its own line, proof #4); account-parent.test.mjs:566 and merged-away-lists.test.mjs:261 (AccountRail :13 untouched).
- **B:** tests/history-feed.test.mjs:94 (the industry line → the `accountOfDeal` line); merged-away-lists.test.mjs T3's
  `CHILDREN` (:212) and its assertion → the live count (Q5 A); tests/account-parent.test.mjs:635 (the same
  `children` line); WHOLE_READS' B entries out, HomeTab:192/ReportsTab:2390 reasons rewritten; package.json
  `test:int` gains the new integration file.
- **Unchanged by design (checked):** tests/roles.test.mjs:186-187; tests/report-scope.test.mjs:134-135 (the hand-offs
  keep `accounts={accounts}` / `contacts={contacts}`); tests/open-states.test.mjs:207; tests/document-link-names.test.mjs
  (builder byte-identical); tests/connected-apps.test.mjs:138-139; tests/audit-close.test.mjs:128-148;
  tests/report-delivery.test.mjs:168-186 (report-deliveries.mjs not edited); tests/quota-plan.test.mjs:297-299;
  tests/deal-engagement.test.mjs:336-344 (quote-email.mjs:121 untouched); tests/pick-link.test.mjs:376-380;
  tests/search-match.test.mjs:490, :496-498 (Dispatch's pinned prefix, `exact`, `showCreate`).

### 5.3 Integration (step B): `tests/integration/merged-away-cleanup.itest.mjs` (LF; letters and hyphens only — tests/itest-targets-test-db.test.mjs:37-41)
- `// ORG NAMESPACE: this file owns 'itest_cleanup_*'.` `A = 'itest_cleanup_A'`, `B = 'itest_cleanup_B'`; the
  `DATABASE_URL_TEST` refusal and the `NETLIFY_DATABASE_URL` redirect before the first import; `assertTestSchema(db)`
  first; cleanup by `inArray(t.orgId, ORGS)` before and after; the auth mock as audit-close.itest.mjs:34-49.
- **API keys unique to this file** (proof #13 — public-api takes the first row of a hash, :94-97, and `key_hash` is a
  plain index, schema.ts:571; audit-close.itest.mjs:116 uses `'spt_live_' + 'ab'.repeat(32)`):
  `'spt_live_' + 'c1'.repeat(32)` (A) and `'c2'.repeat(32)` (B); a unit assertion that no other itest file holds
  either text.
- Seeds, **in both orgs with the same names** (B's all live — guide §18b100 rule 9): accounts Resinall, "Resinall,
  Inc." (A: `mergeArchived: true`, `mergedIntoId` Resinall), "Open Co" (`merge_archived` NULL, written explicitly),
  "Undone Co" (A: `mergeArchived: false`, `mergedIntoId: null` — an undone merge), Evonik + its two "Evonik -
  Lafayette" sites (A: one merged into the other); contacts Lee Ng ×2 (A: one merged away, company "Resinall") and Ana
  (NULL); deals in A: a won $50k on "Resinall, Inc."'s id, an id-less open "Evonik - Lafayette"; users: an Admin and a
  rep owner in A.
- **I1 (accounts)** A's key: ids = live + NULL-marked + "Undone Co", no merged-away; `meta.total` equals them;
  `limit=1` → `totalPages` = total; `tier=site` → the live site only.
- **I2 (contacts)** the same; `company=Resinall` → the live Lee only.
- **I3 (isolation)** B's key: B's rows only — "Resinall, Inc." live there — none of A's; A's key: none of B's.
- **I4 (engine)** `loadReportData(A, admin)` → `runReport` (Accounts; `# of accounts`, `Revenue (won)`): the live count,
  $50k on Resinall, the Lafayette deal on the live site; `loadReportData(A, rep)` → the rep's own rows; B's never.
- **I5 (quote email)** `send-email.mjs` mocked (recording); B's "Lee Ng" inserted FIRST with another address; in A a
  quote with status `'Approved'` (quoteRules.js:203-204: Approved → Sent to Customer needs no approval check), no
  billing contact, on a deal whose first contact is "Lee Ng", the merged-away twin inserted before the live one: sent
  to A's live Lee's address — never the twin's, never B's.

### 5.4 The harness (scripts/mutate-import.mjs, CRLF) — each entry named by its break, its anchor its file's only match on that step's tree, pre-run against the full SUITES after a green baseline, caught by the new suite or THE GUARD

**Existing entries this batch touches (correctness #4, proof #1):** none in G or A (checked: "header search: a group
draws fifty" anchors `also: a => [a.accountOwner], limit: 5 });`, kept; "the accounts group cuts silently again"
anchors the `moreA` text, kept; "report builder: the period is ignored" anchors reportQuery.js:338, kept; "history: a
task linked through its contacts list does not count" anchors historyFeed.js:47, unedited; the account rail's
"accountContacts at their source" anchors AccountRail.jsx:271's opening, kept; DocumentLinkPicker's, RecordDocuments',
MeetingPrepPanel's, quote-email's and public-api's entries anchor other lines — the pre-check confirms). In **B**,
three: entry :13082 ("the delete's confirm leaves out a merged-away sub-account the server lifts — it under-counts")
is RETIRED — its anchor `&& !goingIds.includes(a.id));` disappears and its mutant is P16's after-line; B's own entry
"delete warning: merged-away children counted" replaces it, anchored on `!goingIds.includes(a.id) && !isMergeArchived(a));`
(unique); entry :13078's anchor ` && !isMergeArchived(a));` (which P16 makes appear twice) is lengthened to
`=== accountId && !isMergeArchived(a));`.

New, under `// ── §0.208 …`, `§0.209 …`, `§0.210 …`:
- **G** (the guard, no source edit): an entry for each existing guarded shape in a NEWLY scanned file that today's
  suites miss — found by pre-running candidates (each existing `unarchived(` / `!isMergeArchived(` / live hand-off in
  the newly scanned files dropped) against the SUITES on the baseline, keeping those only the new T8 catches.
  Estimated ≤ 10.
- **A:** "header search: a merged-away account is listed again"; "… a merged-away contact is listed again"; "header
  search: a name only a merged-away record has finds nothing" (`gA` → null); "header search: the merged line opens
  the record merged away"; "header search: "No results found" over a merged line" (`noHits` loses `&& !lineA`);
  "header search: the accounts group hides its merged line" (`showA` → `mA.length > 0`); the same for contacts;
  "header search: the merged line quotes what was typed" (`name` → `r.text`); "Reports: Account history lists
  merged-away accounts again"; "… Contact history lists merged-away contacts again"; "Reports: a survivor's history
  misses what names a contact merged into it" (`cIds` → `[selectedContact.id]`); "Reports: a survivor's deals miss the
  ones naming a contact merged into it" (`conIds`); "Reports: the add panel offers merged-away contacts"; "Reports:
  Opportunity history takes a twin by name"; "document picker: merged-away accounts offered" / "… contacts offered";
  "document picker: a held merged-away link is counted, not drawn" (`heldRows` → []); "document picker: a held link
  reads as live" (`heldLinkSub` → ''); "Dispatch: the customer field offers a merged-away account"; "Dispatch: a name
  only a merged-away account has offers Create" (`!merged` dropped); "Dispatch: … says "New customer — will be
  created on save"" (the hint's condition); "Dispatch: Save Job makes a customer of a merged-away name" (the refusal
  dropped); "Dispatch: the merged line names an account a customer already holds" (the customer check dropped);
  "Dispatch: a held merged-away link reads "— Not linked —"" (escape removed); "Dispatch: the escape option can be
  chosen" (`disabled` removed); "Dispatch: the Linked CRM account offers merged-away accounts"; "Dispatch: a retired
  account's address offered to copy" (the hand-off's guard dropped); "Dispatch: the record view names a merged-away
  link as live" (`selHeld` → null); "meeting prep: a merged-away contact takes a slot"; "contact rail: a survivor
  misses an activity naming a contact merged into it"; "account rail: a survivor misses a contact linked by id to an
  account merged into it"; "documents: a survivor's tab misses a document of a record merged into it"; "documents:
  Unlink leaves the merged-away record's link"; the helpers' breaks ("standsFor: a chain's first record left out",
  "mergedInto: answers when a live record has the name", "accountOfDeal: a merged-away twin by name", "accountOfDeal:
  the first twin, not the later", "heldAccountOption: a live account read as held"); riders (Q7 A) "header: open deals
  by name", "Account history: deals by name", "Account history: an Undo leaves the old deals" (deps lose `accounts`).
  About 42.
- **B:** "public API: merged-away accounts listed again" / "… contacts …"; "public API: NULL-marked rows dropped (=
  false)"; "quote-email: a quote goes to a merged-away contact's address"; "report engine: merged-away accounts are
  rows again"; "… a deal on a merged-away account is counted in no row"; "… an id-less deal lands on a merged-away
  twin"; "Settings: segments count merged-away accounts" / "… industries …" (×2 each: the loop and `topLevelCount`);
  "Settings: "View accounts" offered again (segments)" / "(industries)" (proof #10); "personas: merged-away contacts
  counted" / "… a persona set from Reports not counted"; "merge window: sub-accounts / contacts counted merged away",
  "… deals by name"; "contact merge window: org links count the pair"; "contact merge window: counts keep the window's
  first pair" (the deps lose `aId, bId` — caught by C18's pin); "delete warning: merged-away children counted";
  "industry chart: a twin by name". About 21.
- Counts: after G ≈ 3,139 + ≤10; after A ≈ +42; after B ≈ +21 − 1 retired. The summary must read `N/N`, 0 stale; a red
  exit is read from the log's own summary line, never a wrapper's echo (memory).

---

## 6. The browser check (Accelerep QA only — `org_3K6LqEB6kPE9p4t96GBfsX9VNyb`) — two passes, A and B (G has none)

**Each pass, before:** stop `netlify dev`, `rm -rf dist node_modules/.vite .netlify/functions-serve`, restart, wait
(~2 min, poll with curl), hard refresh; read the URL bar and count the orgs in the switcher (guide §19); B also
probes `public-api` and `saved-reports` (401 JSON = loaded and gated). Dismiss the overdue reminder after each load.
**Jeff signs in each time the role changes** (MFA is on; Claude never types credentials) — about three switches a
pass. **Never UKG, never another org.** Writes only TEST records in QA (the standing go, memory), each reported; **the
real merges and their Undos only on Jeff's explicit go at the moment** (the §0.207 precedent). A **write-holding pane
guard** (a page-level fetch wrapper that answers every non-GET with a held 503 and records it, taking `URL` objects —
memory) is on for every made-up answer step. Read back with a SELECT (counts only) before and after each pass.

**Pass A** (after A ships to dev). Records, on the §0.207 TEST set (all live today — b13/browser-0207.txt): "TEST Undo
Co", "TEST Undo, Inc." and "TEST Elsewhere" (Karen's), two "Tess Undoer" on "TEST Undo Co", the TEST task. Added as
Karen, before the merge: "Tara Other" (TEST contact); "Tia Linked" (TEST contact, Company picked as "TEST Undo, Inc." —
linked by id); one TEST activity naming Tara first and the Tess to be merged away second, on no deal; a tiny TEST
document on "TEST Undo, Inc."'s Documents tab — **Jeff uploads it** (the pane has no file-upload tool; unverified
whether a page-made file can go through the app's upload call); a TEST deal on "TEST Undo Co". Then, on Jeff's go:
merge "TEST Undo, Inc." into "TEST Undo Co", and that Tess into the other.
As Karen (Sales Rep), after a reload:
1. Header search "TEST Undo" → "TEST Undo Co" (no "TEST Undo, Inc."); "TEST Undo, Inc." in full → one row "TEST Undo
   Co — “TEST Undo, Inc.” was merged into this account", which opens TEST Undo Co; "test undo inc" → the same words
   (the record's own name); "Tess Undoer" → one row.
2. Tess's rail → Activity History lists the TEST activity; a click opens it. TEST Undo Co → People lists Tia; its
   Activity tab rolls up Tia's; Documents lists the TEST document.
3. Reports → Activity History: Account history's picker has no "TEST Undo, Inc."; Contact history lists Tess once,
   and (All time) her history holds the TEST activity; "+ Contact to opp" offers Tess once. (Opportunity history's
   account panel is proved by C6 only: here the twin has another name, so the old line also shows "TEST Undo Co" —
   the step cannot tell old from new — proof #14.)
4. TEST Undo Co's rail → Prep → the panel's contacts: Tess once.
5. The TEST document's rail → Link → no "TEST Undo, Inc." offered; "Already linked: TEST Undo, Inc. — Merged into
   “TEST Undo Co”", ticked; closed with × (nothing changed).
6. **The rep-only line, with a made-up answer:** the write-holding guard drops "TEST Undo Co" from Karen's accounts
   GET answer; reload; header search "TEST Undo, Inc." → "“TEST Undo, Inc.” was merged into another account.", no
   click. Guard off, reload.
As Jeff (Admin):
7. Dispatch — if QA has it on (unverified, §9.1; turning it on is a settings change, Jeff's go, else this step is
   units only), with the write-holding guard on: New Job → Customer "TEST Undo, Inc." → no row, no Create, the line
   "“TEST Undo, Inc.” was merged into “TEST Undo Co” — pick “TEST Undo Co”."; Save Job with a title → the same words,
   no request sent (network log); a customer's form → the Linked CRM account options lack it; the escape option with
   a made-up dispatch-customers GET answer (one TEST row holding "TEST Undo, Inc."'s id) → "TEST Undo, Inc. (merged
   into TEST Undo Co)", greyed, its note, no address line; the record view's chip says the same. Guard off.
8. The header search as Admin (step 1).
Undo (Jeff's go, both, from Past merges through the confirm), then as Karen after a reload: "TEST Undo, Inc." is its
own row again in the search, Reports and the picker; Tess twice; the TEST activity leaves the survivor's rail (it names
the restored Tess, whose rail lists it); Tia back on "TEST Undo, Inc."'s People; the document leaves TEST Undo Co's tab.
Read back: QA's counts as before plus the TEST records; the two logs `reversed`; no other org touched.

**Pass B** (after B ships to dev). Records: B reuses Pass A's pair (live again) and adds, as Jeff: segment "SMB" and an
industry on "TEST Undo, Inc."; a TEST persona set on the Tess to be merged away; a TEST won deal on "TEST Undo, Inc.".
**Before-readings, written down:** Settings → Account segments' SMB count and "X of Y"; Industries' count and "X of
Y"; Buyer Personas' TEST persona count and its Delete state; the builder's Accounts / "# of accounts" line "N of M
accounts" and "Revenue (won)" by account, as Jeff and as Karen. Then, on Jeff's go, merge the pair and the Tess pair
again. As Jeff: 9. Segments / Industries: counts and "X of Y" one lower; "View accounts" greyed, "Not available yet",
nothing happens. 10. Buyer Personas: the TEST persona 0, Delete enabled — **not pressed**. 11. Find & merge: open the
window for another TEST pair (no merge) and read its counts against the lists. 12. The builder: "N of M" one lower, the
TEST won deal's revenue on "TEST Undo Co". As Karen: 13. the builder line (her scope). Undo (Jeff's go) → every
reading back to its before value. Read back by SELECT.

**Left in QA afterwards (both passes):** Tara Other, Tia Linked, the TEST activity, the TEST document, the TEST deals,
the SMB segment and industry on "TEST Undo, Inc.", the TEST persona and its assignment — each named in the state doc.

---

## 7. The words (every new or changed piece of text on screen)

- Header search, a merged line with its record: primary "Resinall" · secondary **"“Resinall, Inc.” was merged into
  this account"** (the merged-away record's own name) · meta "Account"; contacts: **"“<name>” was merged into this
  contact"** · "Contact".
- Header search, no record the user can open: **"“Resinall, Inc.” was merged into another account."** / **"… into
  another contact."** (linkRefusal's words, pickLink.js:176).
- Dispatch Customer field, the line under it (replacing "New customer — will be created on save") and Save Job's
  refusal: **"“Resinall, Inc.” was merged into “Resinall” — pick “Resinall”."** (linkRefusal, as the account picker:
  the text as typed); without a survivor in the list: "“Resinall, Inc.” was merged into another account."
- Dispatch Linked CRM account, the held option and the record view's chip: **"Resinall, Inc. (merged into Resinall)"**
  / **"Resinall, Inc. (merged into another account)"** / **"An account you can't open"** (HIDDEN_ACCOUNT); the form's
  note: **"“Resinall, Inc.” was merged into “Resinall” — pick “Resinall”, or “— Not linked —”, and save."** /
  **"“Resinall, Inc.” was merged into another account — pick another, or “— Not linked —”, and save."**
- Document link picker: group header **"Already linked"**; a held row's line **"Merged into “Resinall”"** / **"Merged
  into another account"** / **"… another contact"** / **"An account you can't open"** / **"A deal you can't open"** /
  **"A contact you can't open"** / **"A task you can't open"** / **"An activity you can't open"**.
- Settings "View accounts" (Q6 A): label unchanged, its line **"Not available yet"** (replacing "Filter Accounts tab
  by this tier" and "Open in Accounts, filtered").
- Unchanged words, changed numbers: "N of M accounts in the period…", "X of Y accounts assigned a segment", "…matched
  to a primary industry", personas' "N contacts still use this" / "No contacts use this persona", "Merging re-links …",
  "N sub-accounts will move to the top level.", "Contacts on this deal (N)", "Activity History (N)", "Contacts (N)",
  "Documents · N files". No colour beyond `T.inkMuted`; nothing red (only Delete is).

---

## 8. Questions for Jeff (plain words; most consequential first; Recommended first)

**Q1 — Batches.** You said "One cleanup batch next". Built as one, it is about 20 files, a rewrite of the automatic
check that stops hidden records sneaking back onto screens, about 75 new mutation-test entries, and two real merges
and Undos in the browser — more than one sitting (the smaller first merged-records batch took about a day from design
to commit). Whatever you pick, all of it comes before the member profile page ("Undo, cleanup, profile").
- **(A) Three steps in a row — 1) the automatic check alone (nothing you see changes), 2) everything you see on
  screens, 3) the API for outside apps, the quote email and the numbers. — Recommended:** each fits a sitting, the
  check guards the other two while they are built, and the numbers come last so you can compare before and after.
- (B) Two steps — screens and the check first, then the API, the quote email and the numbers.
- (C) One batch, as you said.

**Q2 — Things still filed under the old record.** A merge moves most links, but not all: a call logged with two people
keeps the second person's old (merged-away) contact; a document attached to "Resinall, Inc." stays attached to it; a
person whose record is linked to "Resinall, Inc." stays linked there. Today you reach those only by opening the old
record from the search — which this batch hides.
- **(A) The surviving record shows them: Resinall's Documents tab lists the document, its People list the person, and
  the surviving contact's Activity History (and Reports' Contact history) the call. Nothing in your data moves, and
  undoing the merge takes them off again. One catch: Unlink on Resinall's Documents tab also unlinks the document from
  "Resinall, Inc.", and undoing the merge does not bring that link back. — Recommended:** hiding the old record then
  loses nothing you could reach before.
- (B) Accept the loss: the document stays findable in the Documents tab, the person in the Contacts tab, the call on
  its deal and by its title.
(Moving these links in the data itself is the merge clean-up batch's — "batch 3" — and stays filed.)

**Q3 — The search at the top of the page.** It will list "Resinall" only (today it also lists "Resinall, Inc.", which
opens the old record as if it were live). What should typing the old name in full, "Resinall, Inc.", show?
- **(A) One row — "Resinall — “Resinall, Inc.” was merged into this account" — that opens Resinall. — Recommended:**
  an old name still leads you to the right record, in the words the account picker already uses.
- (B) Nothing — "No results found".

**Q4 — The API for outside apps.** It lists every account and contact, merged-away ones too, with nothing marking
them. No answer would change today: the one company with an API key in use has no merged records, and UKG has no key.
Settings → Data's exports keep merged-away rows, marked.
- **(A) Leave them out, as every screen will; totals count only what is listed. — Recommended:** it is what "merged"
  means everywhere else and no app is affected today; the catch is that an app that had already copied "Resinall,
  Inc." would see it disappear with no sign it was merged — a way to ask for them can be added later without breaking
  anything.
- (B) Keep them, and add a "merged into" field to every account and contact.
- (C) Leave them out unless the app asks for them (`include_merged=true`), and then mark them "merged into".

**Q5 — Counts that include records you can't see.** The merge window and the Accounts tab's delete warning count
merged-away records. Merging can say "2 sub-accounts" when Resinall's Sub-Accounts list shows 1; deleting can warn "2
sub-accounts will move to the top level" when you will see 1 move (the hidden one moves too, out of sight).
- **(A) Count what you can see: live records only, and deals by their account link (by name only for an old deal with
  none). — Recommended:** a preview should match what you see afterwards.
- (B) Count everything and say how many are hidden ("2 sub-accounts, 1 of them merged away").
- (C) Live counts in the merge windows; the delete warning as today (it counts everything the delete moves).

**Q6 — "View accounts" in Settings → Account segments (and Industries).** You added it to this batch because the
Accounts tab it opens could list fewer accounts than the card counts. It turns out it opens nothing at all: since a 7
May change, the click only closes the menu.
- **(A) Grey it out with "Not available yet" (like "Reassign accounts…" beside it), and file making it work as its own
  feature. — Recommended:** honest now, and the batch stays about merged records.
- (B) Make it work in this batch: it opens the Accounts tab filtered to that segment or industry, in All, matching the
  card's count — a new feature, one more screen to build and check.
- (C) Remove it.

**Q7 — Deals matched by name (found on the way; not about merges).** Two places match deals to an account by its name
instead of its link: the search's "N open deals" beside an account, and Reports → Activity History → Account history.
UKG's two "Shell - Port Allen" (a business unit and a site) each show both's deals and totals.
- **(A) Fix both in the screens step, by the deal's account link (by name only for an old deal with none). —
  Recommended:** the batch already edits those exact lines, and the house rule elsewhere is the link.
- (B) File them for later.

### 8.2 Decided without asking (Jeff can veto any of these)
- **D1 Hide everywhere** — merged-away accounts and contacts leave every list, count, picker and answer that reads the
  list (Jeff: "Hide them", "Hide contacts too"; guide §18b99 rule 5). The data, the loads and Settings → Data's exports
  keep every row.
- **D2 Pickers offer live records only** (guide §18b91 rule 5): the document link picker, Dispatch's two account
  pickers, Reports' "add contacts" panel, the meeting prep panel's contacts.
- **D3 A link a picker no longer offers is shown, not dropped** (guide §16, §18b24.3, §18b91 rule 4): Dispatch's
  Linked CRM account shows "Resinall, Inc. (merged into Resinall)", greyed, with a note, and no longer offers to copy
  the old record's address; its record view says the same; the document link picker draws such a link under "Already
  linked", ticked, so it can be removed.
- **D4 Dispatch's New Job** offers no Create for a name only a merged-away account has, says "“Resinall, Inc.” was
  merged into “Resinall” — pick “Resinall”." under the field, and Save Job refuses it in the same words — a new
  customer of that name would be a second customer for Resinall.
- **D5 A deal's account is its link** — Reports' Opportunity history panel, its industry chart and the report engine;
  an old deal with no link: the later of two same-named live accounts, the rule two of those three already use.
- **D6 "# of accounts"**: a deal still pointing at a merged-away account is counted on the account it was merged into
  — no money leaves "Revenue (won)" or "Open pipeline"; it is read fresh each time, so an Undo reverses it.
- **D7 Buyer personas** count live contacts, by the persona's name or its id — you flagged that a merged-away contact
  kept a persona's Delete disabled; and Reports saves a persona's id, which today is not counted at all. If a merge is
  undone after its persona was deleted, that contact shows the old persona as plain text.
- **D8 The quote email** sent with no billing email goes to the live contact of the deal's first name, never a
  merged-away duplicate's old address.
- **D9 Reports' Export PDF prints the screen**, so it follows each list ("Export follows the list").
- **D10 What is filed** (a merged-away record's own rail, the matched-by-name item, batch 3's data moves) **comes after
  the profile page**, in your order "Undo, cleanup, profile".
- **Flagged, not picked** (CLAUDE.md: a doc that disagrees is flagged): guide §19 says "run all seven" gates and omits
  `check:fnscope`; CLAUDE.md lists eight; and CI's gate job does not run `check:fnscope` either. Proposed: the guide
  lists eight, and CI gains the step — on your nod.

---

## 9. Docs — in the same commit as the code they describe (guide §22; SESSION_HANDOFF last)

All CRLF; each edit a node script with asserted occurrence counts, dry-run first, re-read from disk.

**docs/ACCELEREP_CURRENT_STATE.md** — one block per step after §0.207's (:7015+): **§0.208** (G: the guard, what it
names and why, T8-T10, the harness N/N), **§0.209** (A), **§0.210** (B): what it was, Jeff's decisions quoted, what
changed (every place, file:line), the words, what keeps the whole list and why, the tests (counts), the harness (N/N),
integration (B), the pane (observed), Found-not-changed (P28-P47), the TEST records left in QA. Header :2 Updated, :4
Verified at, :5 Batch, :6 Prior batch — **anchored swaps only, never assigning the line** (memory).

**docs/ACCELEREP_CODING_GUIDE.md**
- **G:** §18b99 rule 4 → "every screen file and every component a list is handed to is read by THE GUARD (§18b101)";
  rule 6 the guard's T8-T10.
- **A:** new **§18b101** after §18b100 (:4237-4255): "A merged-away record leaves every list, count, picker and answer;
  the surviving record shows what still names it; a deal's account is its id's; THE GUARD reads every screen" —
  rules: the class (screens, the engine, the API — `is not true` in SQL, in `conds`); the survivor reach (`standsFor`;
  nothing written; Undo-safe; its limit: a byId read may return a merged-away row where a merge left the link — P31);
  a name typed that only a merged-away record has names its survivor (`mergedInto`; Dispatch's New Job refuses it); a
  select or a picker holding a link its options leave out shows it (`heldAccountOption`, the document picker's held
  rows); a deal's account by id, the later twin for none (`accountOfDeal`); the guard (shapes, RESOLVERS by module,
  props followed, named reads, App.jsx and the hooks pinned, T10). §18b91 rule 5 (:4109): "(the last four pickers
  since §0.209)". §18b100 rule 9 (:4255) "fifteen" → "sixteen".
- **B:** §18b101 grows: the engine, the API, the counts (Q5's answer), personas, the quote email. §18b99 rule 2's
  delete-warning sentence (:4221) per Q5; rule 5 (:4224-4234) → done (§0.208-§0.210), the "View accounts" links named
  as dead since 85cc230, not as opening a shorter list.
- §19 (:1259-1269) "run all seven" → eight — only with Jeff's nod (flagged).

**docs/OPEN_ITEMS.md**
- §1 :290-311: the sub-item → done in §0.208-§0.210, with what is filed beside it.
- §4.7 :2278-2304 (the contact-merge item): since §0.209 the survivor's rail and Reports' Contact history list such an
  activity, and the account rail a contact linked by id to the record merged away; the data move stays batch 3's.
- §4.7 :2313-2399 (the map): replaced by what is left — P28-P47 not done, each one line with file:line — and the
  corrections (the dead "View accounts"; "# of accounts" read by Send now and the builder's line; `byName` coupled;
  Reports' lists are `ActivityHistoryTab`'s, reached by props).
- :2400-2422 (matched by name): note the Contacts tab card, meeting prep's account and the rail's "Open existing" stay
  there, and that they are routes to a merged-away rail (P28).
- :2423-2426 (the rail says nothing): the four account routes left after §0.209 (P28); slotted after the profile page.
- :2602-2610 (merge.mjs:259's comment): closed by §0.210 (P23).
- §2.1 (Jeff's checks): the read-only censuses of §9.1.
- New filed lines P35-P46 where their sections are (Dispatch :1738-1753; Settings; Reports; the API); P47 already at
  :2581-2586.

**CLAUDE.md** (Frontend conventions, the merged-away bullet; with A, then B): "leaves the lists the screens draw — the
Accounts and Contacts tabs, Sub-Accounts, an account's People and the contact counts" → "leaves every list, count,
picker and answer (guide §18b99, §18b101)"; add "the surviving record shows what still names a record merged into it
(`standsFor`)"; "A new read of the app's whole lists in the Accounts or Contacts tab fails THE GUARD (…; no other
screen is scanned). Not yet: …" → "A new read of the app's whole lists in any file that imports `useApp`, or in any
component a list is handed to, fails THE GUARD (tests/merged-away-lists.test.mjs) unless it is a shape the guard names
or is named with its reason; App.jsx and the list hooks are pinned, utils are not scanned. Filed: a merged-away
record's rail (OPEN_ITEMS §4.7)." (After A: "Not yet: the numbers and the API (§0.210)".)

**tests and code comments:** P22 (G, A), P23 (B).

**SESSION_HANDOFF** (both copies, byte-identical, `npm run check:handoff`): written last, after each step's commit
and ship are observed.

### 9.1 Open questions (not verified here)
- Whether QA has Dispatch on (`settings.dispatchEnabled`) — decides Pass A step 7.
- How many activities' `contactIds`, tasks' chips, `document_links` and contacts' `accountId` name a merged-away record
  in UKG today (the census read none of the arrays or the links; it found no contact naming one by id) — the size of
  what Q2 brings back. Read-only, counts only, Jeff's go.
- For the numbers (completeness F8h), read-only, Jeff's go: merged-away top-level accounts holding a segment or an
  industry; merged-away contacts holding a persona; contacts holding a persona id; deals with no account id whose name
  a live and a merged-away account share.
- Why UKG holds 10 'merged' logs for 8 merged-away rows (P41).
- Whether a dispatch customer was made under a merged-away name (P35).
- The exact G named-read list (§4.6 — the first G run must equal it; a difference is read, not named).
- Whether a page-made file can go through the app's upload (Pass A's document); Jeff uploads otherwise.
- Whether `T.inkMuted` text on the Dispatch hint and the picker's held rows meets contrast in dark mode — not read (the
  existing "N more" lines use the same).
- The UKG "Shell - Port Allen" deals Q7 names are the map's reading (search-reports §11.2), not re-read in data.

---

## 10. Critique dispositions — every finding, checked against the code on 7ee14fe

Correctness = critique-correctness.md §A #1-#12; Completeness = critique-completeness.md F1-F12; Proof =
critique-proof.md #1-#15.

| Finding | What it said | Checked | Disposition |
|---|---|---|---|
| Correctness #1 (HIGH) | P15's `cA`/`cB` are not in `countsFor`'s deps; the always-mounted modal keeps the first render's nulls; C18 cannot see it | ContactMergeReviewModal.jsx:60-74 (deps `[opportunities, activities, tasks, contacts]`); ModalLayer.jsx:1230 unconditional; early return :100 | **ACCEPTED** — compare by `aId`/`bId`, deps gain them (P15); C18 pins the deps line; harness entry "counts keep the window's first pair" |
| Correctness #2 (MED) | Dispatch still makes the duplicate at Save, and shows "New customer — will be created on save" | DispatchTab.jsx:366-370 hint; :5764-5778 POSTs `custName` with `accountId: null` whenever no customer is picked | **ACCEPTED** — the hint names the survivor, Create hidden when `merged`, Save refused (P11, D4); words in §1/§2/§4 corrected |
| Correctness #3 (MED) | The new line says "pick Resinall" when Resinall is hidden because a customer links it | merge.mjs:233 re-links dispatch customers, :184-188/:238-240 rename only deals, SPIFF claims, contacts; DispatchTab.jsx:333, :336 | **ACCEPTED** — `mergedAwayName` returns null when a dispatch customer's name reads as the text; C8 case; Pass A step 7 |
| Correctness #4 (MED) | Batch B makes entry :13082 stale and its mutant is P16's line; :13078's anchor stops being unique | mutate-import.mjs:13078-13085; useAccounts.js:34, :76 | **ACCEPTED** — retired and replaced with a unique anchor; :13078 lengthened; §5.4 corrected; pre-check on each step's tree |
| Correctness #5 (MED) | Q2's "loses nothing" is false for contacts linked by id to the merged-away account; `contactTouch` gap | AccountRail.jsx:271-273, :292; merge.mjs:229-240 (contacts renamed, not re-linked); historyFeed.js:63-71; ReportsTab.jsx:6303 | **ACCEPTED** — P43 (A): the account rail matches by `standsFor`; Q2 names the person; `contactTouch` FILED as P44 (batch 3 closes it) |
| Correctness #6 (LOW/MED) | P12 overstates the harm; the address/copy line and the view chip still name the merged-away account | DispatchTab.jsx:3006 (`draft.accountId || null`), :2657-2666, :3039, :3225, :3261-3267; dispatch-customers.mjs:313-318 | **ACCEPTED** — claim corrected; `linkedAccount` null for a merged-away link; chip via `heldAccountOption`; PUT cited |
| Correctness #7 (LOW) | `byName` keeps the later twin, `accountOfDeal` the first — screens disagree | reportQuery.js:294 (Map: later wins); ReportsTab.jsx:3945 (Map: later), :5842 (`find`: first) | **ACCEPTED** — one tie: the later live twin (two of three places today); `accountOfDeal` takes the last; C1 and C15 pin it (D5) |
| Correctness #8 (LOW) | Guard rule 4 would refuse AutomationsDetail and LeaveGuardModal | AutomationsDetail.jsx:342, :433, :325-332; LeaveGuardModal.jsx:20-21 | **ACCEPTED** — truthiness tests no read, `x?.key` a read, AutomationsDetail's hand-off named (§4 item 4); T9 shows each |
| Correctness #9 (LOW) | P26's memos miss `accounts` in deps | ReportsTab.jsx:5210, :5294 deps | **ACCEPTED** — both gain `accounts`; C14 pins; harness entry |
| Correctness #10 (LOW) | The header line quotes what was typed, not the record's name | pickLink.js:107, :145 (`text: typed`) | **ACCEPTED** for the header search — `mergedInto` returns the record's own name when one matches; the pickers (Dispatch) keep linkRefusal's typed text, the house wording (pickLink.js:155-156) |
| Correctness #11 (LOW) | Q2 says nothing changes, but Unlink deletes the merged-away record's link | RecordDocuments.jsx:69-72; documents.mjs DELETE | **ACCEPTED** — Q2 (A) says it in plain words; behaviour kept ("Keep later edits") |
| Correctness #12 (LOW) | `unlinkHere` is :69-72; the PUT is :313-318; `builderResult` is held in state | RecordDocuments.jsx:69-72; dispatch-customers.mjs:249 (POST), :313-318 (PUT); ReportsTab.jsx:2383, :2442, :2474 | **ACCEPTED** — citations fixed; one line in §2's Undo note and P5 |
| Completeness F1 (HIGH) | = Correctness #5 | as above | **ACCEPTED** (P43) |
| Completeness F2 (HIGH) | Batch A does not fit a sitting; split guard / screens / server+numbers | git log: 421bde9 16 Oct 18:24 → 5273c25 17 Oct 13:19; b1c6ad2 17 Oct 13:19 → 61ca21a 18 Oct 15:46 | **ACCEPTED** — three steps G/A/B, recommended in Q1 with the precedent |
| Completeness F3 (MED) | Q4 omits "One cleanup batch next" and the profile batch; P28 jumps ahead of the profile page | OPEN_ITEMS :291, :1671-1673; state :7001 | **ACCEPTED** — Q1 quotes him and says the profile page follows; P28 slotted after the profile page (D10) |
| Completeness F4 (MED) | P10 makes held links undrawable for every role | DocumentLinkPicker.jsx:36-45, :143, :151-178; guide §18b91 rule 4 (:4108) | **ACCEPTED** — "Already linked" rows (P10, D3), C7, two harness entries; the server half stays filed (P30) |
| Completeness F5 (MED) | Q3 (API) ignores the export-runs precedent | OPEN_ITEMS :210-212, :722-723, :2346-2347; public-api.mjs:217-237 (no merge fields) | **PARTLY** — Q4 now names the precedent and the trade; Recommended stays (A): no consumer is affected today and a switch is additive later. The Export PDF statement added (D9) |
| Completeness F6 (MED) | = Correctness #11 | as above | **ACCEPTED** — Q2 says it; showing inherited rows differently not taken (the Unlink matches the user's intent; the words make the catch plain) |
| Completeness F7 (MED) | P28 lists two account routes, there are four | ContactsTab.jsx:365-368, :521-528; AccountRail.jsx:311-334; railLinks.js:83-89; App.jsx:1706 | **ACCEPTED** — P28 lists all four; P29's contact openers recorded |
| Completeness F8a (LOW) | Restore under a merged-away parent; the parent chip/ReadRow | OPEN_ITEMS :2427-2446; AccountRail.jsx:686, :771 | **ACCEPTED** — FILED row P45 |
| Completeness F8b | "Contacts on this deal" raw ids | ReportsTab.jsx:5928-5932 | **ACCEPTED** — FILED row P46 |
| Completeness F8c | The record view's chip | DispatchTab.jsx:3261-3267 | **ACCEPTED** — IN (P12) |
| Completeness F8d | Sibling escape options are enabled | DispatchTab.jsx:2675-2677, :2686-2688; guide :802 (§16's own example enabled) vs §18b24.3 | **PARTLY** — FILED in P40 (pre-existing, not about merges; the two rules disagree, so changing them is its own item) |
| Completeness F8e | Bulk deal paths accept a merged-away id | opportunities.mjs:222-231 | **PARTLY** — already filed at OPEN_ITEMS :2581-2586 (the critic's grep missed it); row P47 points there |
| Completeness F8f | Settings counts treat legacy `parentId` rows as top level | db/schema.ts (no `parentId` column — grep); accounts.mjs:169 ("no legacy `parentId`") | **REJECTED** — no server row carries `parentId`, so P6/P7's top-level rule is unaffected; noted in P6/P7 |
| Completeness F8g | CI runs no `check:fnscope` | .github/workflows/test.yml gates job; tests/check-fnscope.test.mjs:98-107 tests fixtures and wiring only | **ACCEPTED** — flagged beside P42 / §8.2 |
| Completeness F8h | The numbers' census is missing | map-counts (g) Q1 | **ACCEPTED** — §9.1 |
| Completeness F9 (LOW-MED) | The guard is not as class-wide as claimed; HomeTab:192 / ReportsTab:2390 stay named | HomeTab.jsx:192, ReportsTab.jsx:2390 (an object literal, not a call argument) | **ACCEPTED** — §4 item 7 names and pins App.jsx and the hooks; utils unscanned said; the two lines stay named with a B reason; CLAUDE.md's sentence narrowed |
| Completeness F10 (LOW) | P5's survivor money decided silently | reportQuery.js:293-300 | **ACCEPTED** — D6 |
| Completeness F11 (LOW) | Q1 (C) / Q2 (C) reverse "Hide them"; Q8 must say Jeff added it believing it worked; riders sit on A's code; Q5 bundles three | OPEN_ITEMS :204, :2338-2341; AppHeader.jsx:457; ReportsTab.jsx:5135, :5290 | **ACCEPTED** — those options dropped; Q6 says it; the riders are Q7 and ride with A; the quote email decided (D8) |
| Completeness F12 (LOW) | P11's house rule is an analogy | DispatchTab.jsx:318-320 | **ACCEPTED** — the reason is now the duplicate dispatch customer (P11) |
| Proof #1 (HIGH) | = Correctness #4, plus B's new entry would mutate :34 | useAccounts.js:34, :76 | **ACCEPTED** — §5.4 |
| Proof #2 (HIGH) | A hand-off to a `props` parameter passes | §4 rule 5 as written | **ACCEPTED** — identifier parameters followed through `props.<prop>`, other uses refused; T9 cases |
| Proof #3 (MED) | = Correctness #8, and `x?.key` | AutomationsDetail.jsx:329-331 | **ACCEPTED** |
| Proof #4 (MED) | rail-links.test.mjs:349 pins ContactRail :14 | tests/rail-links.test.mjs:349 | **ACCEPTED** — `standsFor` on its own import line; :14 untouched; §5.2 |
| Proof #5 (MED) | byId can draw a merged-away record through a link a merge does not move | merge.mjs:231-243 | **PARTLY** — the limit is said in the SHAPES comment, T9 and §18b101; no restriction (a parse cannot tell which links a merge re-points) |
| Proof #6 (MED) | The gates that decide whether the new lines show are neither run nor mutated | AppHeader.jsx:443, :457-458; DispatchTab.jsx:371 | **ACCEPTED** — header gates hoisted to `noHits`/`showA`/`showC`, run (C2), pinned, mutated; Dispatch's line moved to the always-shown hint (no dropdown gate), pinned and mutated |
| Proof #7 (MED) | C4 runs three lines; the `cIds` line is duplicated | ReportsTab.jsx:5213-5300 | **ACCEPTED** — memos AST-sliced and run whole; `conIds` distinct; a conOpps entry |
| Proof #8 (MED) | RESOLVERS by bare name; two stale names; untested resolvers | TasksTab.jsx:75, :97, :300; no scanned call of `survivorOf`/`dealCompany` (grep) | **ACCEPTED** — keyed by module and import-checked; the two dropped; TasksTab's trio named reads; each entry names its test |
| Proof #9 (MED) | The named-read list is an estimate; B leaves stale reasons | spot-checked HomeTab:192, ReportsTab:2390, MergeReviewModal:61/:63, ContactMergeReviewModal:68, ModalLayer:469, LeadModal:312, CsvImportModal:308-309, scan views :122/:124, DispatchTab:5413, BuyerPersonasDetail:100, IndustriesDetail:157/:166 | **ACCEPTED** — lists written in §4.6 with reasons and fates (16 lines stay after B); the run-equals-list rule |
| Proof #10 (MED) | Run-as-written gaps (C5, C12, C11, C6 order, C18 deps, C9, P8, the merged words), citation | each cited line | **ACCEPTED** — each fixed in §5.1; the words in `mergedSearchWords` |
| Proof #11 (LOW-MED) | Floor 57; `*Host` components; aliased import; computed keys; exact byId/liveOnly; App.jsx and hooks | src/hooks/useDocuments.js:5 (comment only); ActivityDetailDialog.jsx:93, CoachingNoteDialog.jsx:136; merged-away-lists.test.mjs:499; useAccounts.js:24, useContacts.js:21 | **ACCEPTED** — §4 items 1-3, 5, 7 |
| Proof #12 (LOW-MED) | T10 is file-granular | the 14 files | **ACCEPTED** — per-file select counts pinned |
| Proof #13 (MED) | API key collision; I5 proves no isolation; no undone row | public-api.mjs:94-97; schema.ts:571; audit-close.itest.mjs:116; quoteRules.js:188-207 | **ACCEPTED** — unique keys and a no-reuse assertion; B's Lee first; "Undone Co"; quote status 'Approved' |
| Proof #14 (MED) | The pane plan mixes batches; Karen's branch unseen; step 3 cannot tell; the document upload; sign-ins; step 6's guard; leftovers | b13/browser-0207.txt (all TEST records Karen's); ReportsTab.jsx:5842; the pane's tool list (no file upload) | **ACCEPTED** — two passes with their own readings, merges and Undos; a made-up answer for Karen's line; step relies on C6, said; Jeff uploads; Jeff signs in; the write-holding guard; leftovers listed |
| Proof #15 (LOW) | The test plan assumes the recommended answers | §5 | **ACCEPTED** — the re-cut line in §5 |
