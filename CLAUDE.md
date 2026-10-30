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
Then: the harness, scoped to the batch: `node scripts/mutate-scope.mjs` —
the stale check over every entry, then the batch's own entries, every older
entry on a file it changed and every entry on a file a SUITES test it edited
reads, imports or runs; it must print `Baseline: green.` first (a red baseline
reports a false 100% caught). Before each prod ship: the full run,
`node scripts/mutate-import.mjs`, every entry, about 4 h (guide §18b23
part 4; Jeff, 27 Oct 2026).
Then: rep-path browser check signed in as Karen (`accelerep@outlook.com`,
role `User`) — Admin skips every ownership and role branch, so an Admin-only
pass proves nothing. Read the URL bar and count the orgs before any browser
verification (guide §19).
One commit per verified batch; doc patch in the same commit.

## Identity, ownership, auth

- `users.id` is app-owned `usr_<uuid>`; Clerk identity is `clerk_user_id`.
  Separate identity spaces — never mix.
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
  times (the third: `saved-reports`, 14 Sep 2026 — state §0.135).
- `bulkUpsert` must fail closed: `undefined` reads as `null` and can treat
  every owned row as unassigned.
- Every `settings.extra` key must appear in BOTH the GET response object and
  the PUT read-then-merge in `settings.mjs` — missing either silently resets.
- Persistent data rule: anything that must survive a refresh is saved via
  `dbFetch` immediately after the local state update. `setState` alone is
  never sufficient.
- `dbFetch` returns the raw `Response` — caller must `.json()`.
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
- An account CSV import's names are each one record or the row is refused,
  at Preview, by the file's row (`src/utils/importLinks.js`
  planAccountImport): its own name one live account (the conflict) or none,
  its Parent Account one account of the caller's list or one new row of the
  file; rows sent by depth (`importParents.js` sendLevels); an overwrite
  sends neither the name nor the Parent Account. The accounts bulk POST
  places every new row by the parent rule (`accountParent.js` placeBulkRows);
  the bulk PUT moves and renames nothing (guide §18b105).
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
  the batch unless they wrote their row (guide §18b100).

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
