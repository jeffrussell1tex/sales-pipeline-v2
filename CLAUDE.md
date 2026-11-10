# CLAUDE.md

Standing instructions for every Claude session in this repo. This file is the
index; the three living docs are the encyclopedia. When this file and a doc
disagree, flag it — do not silently pick one.

## What this is

AcceleRep (`sales-pipeline-v2`): multi-tenant B2B SaaS CRM + field-service
dispatch. Sole developer/owner: Jeff, who is learning to code — Claude writes,
verifies, and explains; Jeff runs tests and commits results. Target is a
commercially deployable product with paying customers. Stack: React/Vite
(inline styles, `T.*` tokens), Netlify Functions (ESM `.mjs`), Drizzle ORM,
Neon Postgres (dev and prod SHARE the `main` branch), Clerk Organizations.

## Session start — always, before any code

1. Read `docs/SESSION_HANDOFF.md`. Verify its claims against the repo,
   including its own staleness fingerprints for
   `docs/ACCELEREP_CURRENT_STATE.md` and `docs/ACCELEREP_CODING_GUIDE.md`.
2. `npm run check:handoff` — root and `docs/` handoff copies byte-identical.
3. `git status` — a dirty tree at session start is a finding, not noise.
4. Read `docs/OPEN_ITEMS.md` — the one list of everything still open.

"Delivered is not committed. The repo's copy is the only committed truth."

## Hard rules

- **Never guess.** Fully understand the problem and read every relevant file
  before writing code. State only what has been read; label anything
  unverified as an open question, never as a likely cause. Jeff explicitly
  does not care about round trips or session length — only accuracy.
- **Never run or advise a destructive command against live/production data**
  (DELETE, `clear=true`, drop, truncate, mass-delete) — not even as a test.
  Verify destructive paths with read-only checks, throwaway accounts, or by
  reasoning from code. (Origin: an Admin `users?clear=true` "test" wiped a
  real org's users table.)
- **Doc ordering (31 Aug 2026):** doc changes are applied, verified from
  disk, and committed the moment they are known — never queued as
  end-of-session patch scripts. `docs/SESSION_HANDOFF.md` is written LAST,
  after everything else is applied and committed, so it only describes
  observed, committed state. Doc edits ride the same commit as the code they
  describe (guide §22).
- **Deliver files as generated**, not batched at session end.
- **Proactively flag** better approaches, cleaner code, or improvements seen
  while working — Jeff decides whether to act.
- **This is multi-tenant SaaS, sold and licensed to multiple organizations.
  Treat every coding decision accordingly.** An organization's data must be
  isolated to that organization: every query, endpoint, cache key, and
  background job is org-scoped — no read or write path may ever return or
  touch another org's rows, and no org's configuration (settings, roles,
  feature toggles, scoring models, templates) may affect another org's
  behavior. Nothing tenant-visible is global unless deliberately designed as
  a product-wide default that per-org config overrides. New features are
  designed org-scoped from the first line, not retrofitted; any test of
  isolation seeds its own org namespace and proves the other org sees
  nothing.
- Dev and prod share one Neon `main` branch: schema changes must be additive
  and nullable; account for both environments in every schema decision.

## Verification chain — in order, before any commit

```
npm run check:tdz
npm run check:inline
npm run check:dupes
npm run check:dbfetch
npm run check:fnscope     # every name a function file reads is bound (§0.107)
npm run check:handoff
npm run build            # never `npx vite build` — bypasses the bundle guard
npm test                 # load-bearing for deploy: function-import graph
```

Then: `npm run test:int` (targets `DATABASE_URL_TEST`, not the app DB).
Then: the harness, deferred (Jeff, 4 Nov 2026: "do not run the full harness
until we are committing to dev" — "Before each push to dev"; guide §18b23
part 4). Never start a harness run while building or committing a batch:
the batch runs the stale check, `node scripts/mutate-scope.mjs --list`
(it runs nothing), proves its own new and repointed entries caught by hand
in the harness copy, names in its state section every test it weakened (a
lowered floor, a loosened pin), and commits marked "harness deferred".
Before each push to dev: one scoped run, `node scripts/mutate-scope.mjs
--base <last green-scoped commit>`, over every batch since — from the
harness copy, so it may run in the background while the next batch is
built; it never holds a commit, and it must print `Baseline: green.` first
(a red baseline reports a false 100% caught) and exit 0 before the push; a
survivor is fixed in its own commit first. Before each prod ship: the full
run, `node scripts/mutate-import.mjs`, every entry, about 9 h.
Then: rep-path browser check signed in as Karen (`accelerep@outlook.com`,
role `User`) — Admin skips every ownership and role branch, so an Admin-only
pass proves nothing. Read the URL bar and count the orgs before any browser
verification (guide §19).
One commit per verified batch; doc patch in the same commit.

## Identity, ownership, auth

- `users.id` is app-owned `usr_<uuid>`; Clerk identity is `clerk_user_id`.
  Separate identity spaces — never mix. The one exception (§0.222, Jeff's
  J1 "Allow, read only"): a team list's entry that holds a member's Clerk
  id (stored before members had app ids — UKG's team) is READ as that
  member (`teamMembership.js` holdsMember/namesMember) — never written
  where none was, never as a manager (guide §18b112 rule 5).
- Ownership auth uses `ownerId` on all six Tier 1 tables via
  `assertOwnership()` / `ownerColumnOf()`. `resolveOwnerId` 409s on ambiguity.
- The `null === null` collision: an unresolvable caller and an unassigned row
  both read `null` — guard with `!!row.ownerId` wherever it matters.
- Role gate is an allowlist (`APP_ROLES` / `isAppRole`); unrecognised values
  are denied. Stored role `'User'` displays as "Sales Rep" — never conflate.
- Managers: server-side `canSeeAll` hands them the whole org; client
  `managedReps` narrowing is the only Manager scoping. Do not delete the
  Manager branch of `isRepVisible`.
- A member's save never carries the login link, status or access: the
  server keeps the stored ones, and `active` changes only by the
  `{ id, active }` request; a Manager's save reaches only a Sales Rep's
  row; a save naming no member of this org is a 404. Nor the member's
  pins: of the saves, only their own (`?me`, the Pin) writes them — an
  Admin's or Manager's save keeps the stored ones on the row it builds,
  never by dropping the key (that makes `{ id, active, pinnedReports }`
  a Deactivate); an Admin's restore lands a restored member's as filed,
  cleared of any naming no saved report here (`users.mjs`, guide
  §18b95, §18b98). The member profile page (Settings → Users) sends only
  the fields it edits that changed — a Full name with First and Last
  cleared, a team by its id with its name, a manager by their id with
  their name, the teams' lists moved by id straight after, the role last
  and alone — and holds the member as stored after a save
  (`memberSave.js`, guide §18b102). A member's manager is who they report
  to — `profile.managerId`, a member of this org, never themselves, and
  never a team's `managerId` (the Teams page sets that); an Admin's or
  Manager's save sets it, never their own (`?me`), and the server keeps
  its name and id paired (guide §18b102 rule 9).

## Endpoint and data invariants

- `sanitize()` is a full-row builder: a partial PUT payload wipes absent
  columns unless the endpoint merges first —
  `sanitize({ ...existing, ...data })` (the users/leads pattern). Check this
  shape on every endpoint before trusting its PUT; it has been wrong three
  times (the third: `saved-reports`, 14 Sep 2026 — state §0.135). The
  accounts, contacts and deals bulk PUTs hand `partialRows` the stored rows,
  read whole in the org: a key
  one row leaves out and another sends is filled from its stored row,
  never written empty — an import's Overwrite sends only the cells the
  file fills (`filledCells`; guide §18b106 rule 8).
- `bulkUpsert` must fail closed: `undefined` reads as `null` and can treat
  every owned row as unassigned.
- Every `settings.extra` key must appear in BOTH the GET response object and
  the PUT's `const extra = {` list in `settings.mjs`, and in `REV_KEYS`
  (`src/utils/settingsRevs.js`; tests/settings-revs.test.mjs R2) — missing
  any silently resets. Two keys are the server's, never written from a body:
  `integrationRequests` (both halves; the PUT keeps the stored one) and
  `revs` (the GET only). Since §0.224 a writer of the settings row writes
  only its own keys, merged in SQL with a revision token each — never a
  whole `extra` from a read (`_settingsRevs.mjs`; guide §18b114); a save
  naming the tokens it loaded (`ifRevs`) whose token moved is a 409
  `code: 'stale'`, nothing written, no member renamed. Since §0.225 the
  people screens send each list's token through one sender
  (`saveSettings.js`; a stale refusal reads the latest and says so —
  guide §18b114 rule 9). Since §0.226 every draft panel of Settings sends
  the tokens it opened with (`usePanelRevs`); a stale refusal shows the
  panel again on the latest and says so (guide §18b114 rule 10);
  since §0.228 Pipelines, Calendar, Edit brand and the Sales Manager too
  — one save at a time, a draft's token taken when it begins (rule 11);
  since §0.229 Connected apps too, reading the settings prop — no settings
  screen loads its own copy (rule 12). Every settings screen names its
  tokens.
- Persistent data rule: anything that must survive a refresh is saved via
  `dbFetch` immediately after the local state update. `setState` alone is
  never sufficient.
- `dbFetch` returns the raw `Response` — caller must `.json()`.
- A list a row holds is added to on the server, never written back whole from a
  screen's copy (guide §18b119): a deal's team note is one operation
  (`{ id, note: { op } }`, `src/utils/dealNotes.js`) applied by compare-and-set,
  the author and time the server's, only the author editing or deleting; a
  body naming `comments` is refused; a stage move is appended to the stored
  history in the write (`_stage.mjs` stageMoveOf); a deal's save sends
  `dealBody(...)` (THE GUARD, tests/deal-data.test.mjs). A delete's Undo
  keeps the stored owner by id (`restoredOwner`), never the caller.
  Since §0.239 a deal's close-date moves too (guide §18b122): each move
  decided and appended in the write's own SQL from the date as stored
  (`closeDatesWith`; an import's stage moves likewise, `importStagesWith`),
  with the member's name and id; no body names the list (refused); a save
  not naming the date keeps it; the deal window sends it only when changed
  there and opens an undated deal empty; a restore keeps the histories
  entry by entry, by shape (`src/utils/dealHistory.js`).
- A link a message to a member carries is built by `appLink` and read by
  App.jsx's one reader (`takeAppLink`, src/utils/appLinks.js, guide §18b120):
  a record's link names it and its org; the reader opens it from the
  member's own list, switching to the org where they belong, and says what
  they cannot open; never `?deal=`, `?tab=` or `/settings` by hand (THE
  GUARD, tests/app-links.test.mjs).
- An AI request asks the model the Admin chose, read through one list
  (`src/utils/aiModels.js` modelOf — an id off it runs as the default),
  once more on the fallback when the first answer is busy, missing,
  refused or unreadable (`src/utils/aiCall.js`), and only for a role
  "Available to" names (`mayUseAi`; before the key and any cached score);
  one audit row each way, never the key; no model id written anywhere
  else (THE GUARD, tests/ai-models.test.mjs; guide §18b121).
- A Sales Rep's quota is a plan per fiscal year (`profile.quotaPlans`):
  `PUT /users?quotas=true` is its one writer; every other save keeps it
  (`storedQuota`, and `keepQuotaPlans` on any write of a member's whole
  profile); every reader names its year. A company's fiscal start is read
  only through `fiscalStartOf`, January when none (guide §18b96).
- A link a write stores (an account, contact, deal, lead, customer or
  location id; Dispatch's technician, vehicle, equipment unit, service
  plan or job id; a SPIFF claim's deal and SPIFF (an entry of the org's
  SPIFF list), a quote line's product, an automation's task assignee (a
  member); a member's team (an entry of the org's teams list), manager (a
  member of the org, never themselves) and pinned reports (saved reports
  of the org)) must name a live row of the org
  when the write names it anew: `checkLinks` / `checkBulkLinks`
  (`_links.mjs`, guide §18b92, §18b94, §18b97, §18b98, §18b102). An id the row
  already holds is never asked again; a screen that
  copies a link leaves off one the server refuses (`saveDroppingRefused`) —
  never a quote's lines, whose null would wipe every line: a New version
  whose copied line names no product of this org is refused whole.
  A technician's login is a member of THIS org, stored as their Clerk id
  (`techLogin.js`) — never the app id the picker sends.
  Since §0.221 the ids inside settings lists too — a team's manager and
  reps, a territory's owner and reps, a crew's members, lead and vehicle,
  a quote template's products: refused naming the list, the stored list's
  ids held anywhere, each list of records a list with ids of its own; a
  restore cleans the settings row it lands (`checkSettingsLinks`, guide
  §18b111). Since §0.222 a team is one record: the server pairs a
  member's team name with its id (`teamPaired`); a rename renames every
  holder by id in the save's transaction; no new duplicate team name; a
  removed member's ids, app and Clerk, leave every team's and territory's
  lists in the same request (`removeWithLists`), each screen applying the
  answer after its org check (guide §18b112). Since §0.223 a service
  plan's visit template and covered job types: entries of the org's job
  templates and job types lists, as stored, the covered types stored as a
  list (guide §18b113).
- An account CSV import's names are each one record or the row is refused,
  at Preview, by the file's row (`src/utils/importLinks.js`
  planAccountImport): its own name one live account (the conflict) or none,
  its Parent Account one account of the caller's list or one new row of the
  file; rows sent by depth (`importParents.js` sendLevels); an overwrite
  sends neither the name nor the Parent Account. The accounts bulk POST
  places every new row by the parent rule (`accountParent.js` placeBulkRows);
  the bulk PUT moves and renames nothing (guide §18b105). The contact and
  deal imports likewise (planContactImport, planDealImport): a contact's
  Company one account (linked by id) or a new company made once, a deal's
  Account one account the deal window takes (a site typed in full its
  Site Name), a duplicate one contact or one deal; the deals bulk paths
  link each row by the single save's rule (`dealAccount.js`
  dealLinkDecided); a new deal's blank Sales Rep, and every new contact,
  is the importer's by id — one rule, `_lib.mjs importerOwners` over
  `importerOwner.js` — and an Overwrite's blank keeps the stored owner
  (guide §18b106, §18b107).
- A customer's document — a quote's preview, PDF, print copy and email,
  the dispatch customer emails and SMS, the status page, the web form —
  names the org that sent it by one rule (`src/utils/orgIdentity.js`:
  the Company profile, else the org's name in Clerk), read by the
  caller's org and never from a body; never the app's name or a link
  into the app (THE GUARD, tests/customer-docs.test.mjs). It is sent as
  the org and replies to the org — a quote to the rep, a visit email to
  the support email; the members' emails keep the app's (guide §18b117).
  pdfkit stays outside the quote PDF's bundle (netlify.toml). The quote PDF
  lays out its own pages (`_quotePdf.mjs`): nothing of the body below its
  floor, every text placed by position bounded to its lines (guide §18b118).
- A dispatch customer is found by one rule, on the screen and the server
  (`src/utils/dispatchCustomer.js`, guide §18b104): the deal's account by
  its link (`accountForDeal`), then the one customer linked to it — never
  the first of a name; a name typed in New Job is one customer or account,
  or a refusal — or, when no record has the name, a new customer; two
  customers for a deal are refused, naming both (quote ->
  job a 409 that writes nothing). One customer for one CRM account: the
  customer create and edit refuse an account another customer holds.
  New Job's list holds every record its refusal names, first, by id
  (`refusalLeads`); a won deal two customers stand for makes no new
  customer while New Job carries it — a keystroke clears its words, never
  that (`dealHolds`; Jeff, 29 Oct: "No new customer"; guide §18b104 rules
  9-10).
- A merge's Undo (`merge.mjs`; the rule in `src/utils/mergeUndo.js`) puts
  back only what still holds what the merge wrote — a deal's account id
  and name together, the survivor's restored name cascaded by account id
  as the accounts PUT does — and an account's place only where the house
  parent rule puts it back (`undoPlaces`, as a delete's Undo meets it).
  It puts no deal on a site by its id: a survivor that would go back a
  site while a deal would still stand on it by id once the Undo is done
  keeps its level (`dealsOn`, `noDealOn` — by id alone), and no deal
  goes back to a record merged away that is a site — by its id, its
  lift, or its name where the merge renamed it from that record's
  (`notASite`). What it leaves is kept and counted — except a deal with
  no account id, which can still end on a site by its name, not counted:
  on a survivor that goes back a site, or on the site merged away once
  the survivor's own name goes back after a merge that gave it that
  site's name (Jeff, 18 Oct: "Ship as is, file the edge"; OPEN_ITEMS
  §4.7, batch 3; guide §18b100 rule 5). It is refused (409, nothing
  written) when the merge was undone, either record was deleted, the
  survivor was merged into another record since, or the record merged
  away is no longer merged into it; its claim and un-archive each abort
  the batch unless they wrote their row (guide §18b100). Since §0.218 a
  merge writes by link: the record merged away's contacts move by id and
  its Undo puts each back with its own company while on the survivor;
  renames stay within the pair, a record with no id renamed only where no
  third live account has the name; a SPIFF claim follows its deal; a
  contact merge's Company and account id travel together, the link
  checked; a merge's batch opens with a claim on both records, live and
  as read, so two merges at once never both land (`mergeLinks.js`,
  guide §18b108). Since §0.219 a merge keeps the parent rule: refused
  (409, nothing written, saying what to move first) where it would close
  a loop, put an account under a site or change a moved sub-account's
  tier — live rows only, the rows it judged asserted in its batch
  (`mergePlacement`); it resolves no tier; its Undo reads the survivor's
  deals with no id by its name too (`dealsByNameOn`, guide §18b109).
  Since §0.220 its words read two records of one name apart — the two
  merged by their cards' tags (survivor, archive), any other by its level,
  else its place (`namesApart`, guide §18b110).

## Frontend conventions

- Never define sub-components inside a parent component function — module
  scope only, data as props (root cause of repeated focus-loss/scroll bugs).
- Settings detail panels read the `settings` prop from AdminView; never
  self-fetch.
- New modal state: `useModalState.js` → destructure in `App.jsx` → add to
  `appContextValue`. The wiring file is `App.jsx`, not `AppContext.jsx`.
- Popovers: `getBoundingClientRect()` + `position: fixed`, rendered through
  `createPortal(…, document.body)` — an ancestor with a `transform` (a hover
  lift) traps a fixed box inside it (guide §16, the menu rule; state §0.128).
  A close the resize shares reads the event's target only under
  `e.target instanceof Node` — a resize's target is the window, which
  `contains` refuses (state §0.212; tests/resize-targets.test.mjs).
- A box rounded 6 px or more never scrolls itself: it clips
  (`overflow: 'hidden'`) and a box inside it scrolls, fitting the box — in a
  flex column one that can shrink (never `flex: 'none'`, a shrink of 0 or a
  min height), in
  a block one with a height or a max height of its own; a rounded textarea
  sits in a clipping box with no border or radius of its own; `.modal` and
  `.table-container` clip, and each use holds a box that scrolls (guide
  §18b103, state §0.213; tests/rounded-scrollers.test.mjs). Under 6 px the
  corner stands.
- A task alert (a popup, the bell) interrupts only the member it is for:
  their own task or one nobody owns, by owner id, once the profile is known,
  from the active org's lists (`src/utils/taskAlerts.js`, guide §18b93).
- A merged-away account or contact (`mergeArchived`) leaves the lists the
  screens draw — the Accounts and Contacts tabs, Sub-Accounts, an account's
  People and the contact counts — through `unarchived` / `getSubAccounts`;
  the app's `accounts` and `contacts`, their loads and both GETs keep the
  merged-away rows (links name the survivor through them; the one-request
  contacts clear compares the whole list). A new read of the app's whole
  lists in any file that imports `useApp`, or in any component a list is
  handed to, fails THE GUARD (tests/merged-away-lists.test.mjs) unless it
  is a shape the guard names or is named with its reason; App.jsx's own
  reads are named, only the two list hooks fetch the lists, and utils are
  not scanned. Since §0.209 (guide §18b101) every list, picker and search
  a screen draws offers only live records (lookups by name or email can
  still land on a merged-away one — OPEN_ITEMS §4.7); the record a merge
  kept shows what still names the one merged into it (`standsFor`); a
  name only a merged-away record has names its survivor (`mergedInto`); a held link the options leave out
  shows as itself (`heldAccountOption`); a deal's account is its link
  (`accountOfDeal`). Since §0.210 the numbers and the server's answers
  too: "# of accounts" and the report engine (a deal on a merged-away
  account counts on its survivor), the industry chart, Settings' counts
  (a persona's by its name or its id; "View accounts" reads "Not
  available yet"), the merge windows' counts and the delete warning, the
  public API (`is not true` in its SQL) and the quote email's fallback
  recipient; Settings → Data's export runs and the backups keep every
  row, and each tab's Export follows its list (guide §18b99, §18b101).
- A day count a member sees is whole calendar days — `calendarDays` /
  `daysSince` (`src/utils/dateLocal.js`), never a stored day read at noon
  or as UTC midnight and divided against now; a close date of today reads
  "today" (THE GUARD, tests/date-local.test.mjs's count scan; guide §18b123).
  A refusal is said as an error kept until closed, never under the undo
  toast's ✓; a message names who acted by member name, never a Clerk id,
  and a member is not told of their own act (by owner id). A deal's
  created date is the server's once it exists; its won date follows the
  stage (§0.240).
- UI follows `docs/`-adjacent style guide (warm stone palette, Plus Jakarta
  Sans, near-black buttons, red only for delete).

## Environment and tooling

- Windows, Git Bash. `node --env-file=.env` (never `set -a; source .env`).
- No Python on this machine; no `sed`. Multi-line edits: Node script with
  asserted occurrence counts, dry-run default, `--apply` flag, write once,
  re-read FROM DISK to verify. `App.jsx` is CRLF — preserve it.
- `npm run build` requires `VITE_CLERK_PUBLISHABLE_KEY` exported.
- DB env var is `NETLIFY_DATABASE_URL`; integration tests use
  `DATABASE_URL_TEST`.
- Stale local build: stop `netlify dev`, `rm -rf node_modules/.vite dist`,
  restart, hard-refresh — suspect this before diagnosing code. The gate
  chain's own `npm run build` writes `dist/` and re-arms this every run:
  `rm -rf dist` after any local gate build, before any browser pass.
- Stale local FUNCTION: `netlify dev` also caches compiled functions under
  `.netlify/functions-serve`. A 500 from one endpoint with "module is not
  defined in ES module scope" in the server log is that cache serving a
  stale CommonJS copy, not the code — stop the server,
  `rm -rf .netlify/functions-serve`, restart (state §0.79).
- Dev: `accelerep.netlify.app` (branch `dev`, Clerk `pk_test_`). Prod:
  `salespipelinetracker.com` (branch `master`). No `main` branch.
- Integration suites that seed `users` use their own org namespace prefix
  (e.g. `itest_leads_A/B`) to avoid cross-suite collisions.

## The living docs

- `docs/ACCELEREP_CODING_GUIDE.md` — rules and their origins
- `docs/ACCELEREP_CURRENT_STATE.md` — what exists and why
- `docs/SESSION_HANDOFF.md` (synced copy at repo root) — last session's
  observed state; written last, read first
