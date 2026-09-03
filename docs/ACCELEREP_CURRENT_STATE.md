# ACCELEREP — Current State
**Updated:** September 1, 2026
**Verified at:** five gates green · **317 tests** (+9 date-local read side, +5 import-rows date cells, +2 the sweep scan and its self-check — §0.60) · **79 integration** (observed with §0.59; not re-run since — no endpoint changed) · **105/105 mutations, printed green baseline** (+6, §0.60) · build **2,480 kB JS**, bundle guard OK, local `dist/` cleared after every gate build (the §19 self-arming rule) · **rep-path browser pass COMPLETE** (Karen, localhost, 1 Sep): picker renders/anchors/lists the roster; Mine-strict OBSERVED — All 23 / Mine 5, the predicted 5-owned + 18-unassigned split to the digit; one lead assigned through the picker, Mine 5 → 6, and the assignment HOLDS AFTER A HARD REFRESH. The picker's save path is proven end-to-end on the detail-rail entry point; the other four share the same component and handler. `master` and prod run the §0.58+§0.59 set (`d5254b8`, both deploys marker-verified); **§0.60–§0.62 SHIPPED TO PROD** (Jeff: "Lets push these") — `master` fast-forwarded `d5254b8` → `13f9ffe`, CI SUCCESS, salespipelinetracker.com serving `index-NO9RJhjS.js`: `pk_live_` inlined, the panel wrap and No-due-date markers present, three export-filename UTC shapes left, the deleted components absent, byte-size identical to dev's `index-Bo6oAQ7_.js`.
**Batch:** **the ten unmounted components are DELETED** (Jeff: "lets do 2 and 3") — 4,160 lines and twelve stale import lines gone, every reference re-verified as a comment or nothing; gates green, 317/317, 105/105, build guard OK at the identical 2,534.93 kB (a different hash: fewer imports reorder Rollup's module emission, the size proves the code was never in the bundle) · **`documents` re-probe CLOSED** — 401 JSON on a fresh `netlify dev`, the R2 dependency fix verified locally, sibling `leads` 401 as control (§0.61)
**Prior batch:** **the date-pattern audit** — the `+'T12:00:00'` shape counted at ~140 sites, not the ~20 queued; four live-or-unguarded NaN sites fixed (deal-timeline task sort, speed-to-lead/velocity on the varchar(30) lead dates, avgDaysForStage's never-written `changedAt` fallback, TaskItem's UTC-midnight `Due:` and 7pm-Central overdue — and TaskItem turned out to be UNMOUNTED, so three live, not four) · `parseLocalDate`/`toLocalDay` — the READ side of the date contract, guide **§18b26** · **the CSV importer normalises Close/Created Date** (both passed through as written: "9/15/2026" made an Invalid Date of that deal everywhere downstream — never-stale, undated quarter) · **the isoLocal queue was LOST with an overwritten handoff — found and SWEPT the same session**: 45 UTC-truncated day sites (43 hand-counted; the pinning scan found two more on its first run), 37 rewritten to `isoLocal`/`todayLocal` across 12 files, 8 named exceptions, and the scan in `date-local.test.mjs` is the list that cannot be lost · **ten component files are imported by App.jsx and rendered NOWHERE** (4,160 lines — the three Viewing panels, Account/Task/Activity modals, TaskItem, AnalyticsDashboard, PipelinesSettingsPanel, LeadForm), proven by the bundle being byte-identical with and without an edit to two of them; deletion is Jeff's call, chip spawned (§0.60)
**Prior batch:** **the request flow shipped end to end** (§0.58) and **the SettingsTab cleanup + honest Security surfaces** (§0.59); both on prod, deploy-verified. Their headers say "2 Sep"; git carries every one of their commits at 1 Sep -0500 — flagged in §0.60, not rewritten
**Prior batch:** **the dbfetch scanner's third class (a Response captured in a VARIABLE and read as JSON) built scanner-FIRST, and its first run found SIX live sites, not the four known** — the TasksTab complete/snooze/saveContacts handlers that REVERTED their optimistic update on every successful save, plus two ReportsTab report-saves that showed "Saved" on a rejected write without ever checking `res.ok`; all six fixed with the canonical `res.ok` → `res.json()` → adopt-server-row shape, scanner 6 → 0 · pinned by a new catch fixture, two safe-fixture additions, and a scanners.test.mjs case · **the assignee picker retires all five free-text `window.prompt` assign sites in LeadsTab** (`RepPickerPopover`, module-scope, `getBoundingClientRect` + `position:fixed`, name-keyed payloads — the server stays the resolver) · **the §0.54 case question ANSWERED**: `resolveOwnerId` lowercases both sides — spelling was the risk, not case (§0.57)
**Prior batch:** **the opportunities and tasks PUT overwrite paths are closed — the sanitize-then-upsert audit's third and fourth faces** — both single-record PUTs now `sanitize({ ...existing, ...data })` (field-present semantics; `ownerIdForUpdate` still fed the RAW body per 18b13); opportunities previously wiped stageHistory/comments and reset pipelineId, tasks additionally UN-COMPLETED itself via `completed ?? false` · **severity settled by reading every sender FIRST: no current client sends a partial PUT** to either endpoint (all spread the full row) — a loaded gun, not a live wipe; external API-key writers remain an UNREAD open question · held closed the leads way ×2: source-assertion guards, mutation entries, and the two first-ever integration suites (`itest_opps_*` / `itest_tasks_*` namespaces per §18b25) · **found while reading, NOT fixed: four TasksTab sites read `data?.task` off a raw Response** — complete/snooze there revert the optimistic update on SUCCESS (UI flicker-back, data saved); `check:dbfetch` misses the shape — scanner false-negative class, fix + fixture queued (§0.56)
**Prior batch:** **the SEVENTH GATE ships** — `scripts/check-handoff.mjs` byte-compares the root and `docs/` handoff copies (the pair drifted a third time: the FINAL rewrite was committed to one copy only), classifies EOL/whitespace/content divergence, names the first differing line; wired into `check:handoff`, guide §19 and the CI gates job, proven with 4 committed fixtures + 3 behavioral tests · **CLAUDE.md created at repo root** (132 + 11 lines — standing rules only, no session state; the multi-tenancy isolation hard rule in its own commit) · **the CI unit-job blind spot fixed** — `node --test` ran with no `npm install`, so `scanners.test.mjs`'s babel-dependent gate spawns died ERR_MODULE_NOT_FOUND on every clean runner (suspected red since the scanner suite landed; NOT verified against old runs) · **`.gitignore`'s unanchored `fixtures/` swallowed `tests/fixtures/`** — a fixture commit shipped 3 of 7 files with the refusal hint lost between CRLF warnings; anchored to `/fixtures/` · **the doc-ordering rule** (Jeff's call, guide §22): doc changes applied/verified/committed when known, never end-of-session patch scripts, handoff written LAST — origin: the §0.54 amendment script that had never actually run with `--apply` · **the sanitize-then-upsert audit is now FOUR for four**: `opportunities.mjs` single-record PUT and `tasks.mjs` PUT both run raw `sanitize(data)` (tasks also un-completes via `completed ?? false`); diagnosed, NOT fixed — next session's opening batch (§0.55)
**Prior batch:** **the leads PUT overwrite path is closed** — `saveLead` has always sent `{ id, ...patch }` while `sanitize()` rebuilt the whole row, so a two-key status change nulled every other column (the client's local merge masked it until reload); the PUT now sanitizes the payload OVERLAID ON THE STORED ROW (`sanitize({ ...existing, ...data })`, the users.mjs `mergeForUpdate` pattern minus the blob flatten), with `ownerIdForUpdate` still fed the RAW body so 18b13's mentioned-assignedTo detection is untouched · held closed three ways: integration test (partial PUT preserves nine fields; explicit null still clears), a SOURCE-ASSERTION guard in `tests/partial-sanitize.test.mjs` (the harness runs unit suites only), and mutation #86 · **unassigned-ness keys on `ownerId` across LeadsTab** — both chips, both filters, the triage lane, the Distribute pool/count and the subtitle (they undercounted 6 vs 19 by counting names); Distribute load bars count `l.ownerId === id` via a `reps` `{id, name}` roster (settings.users carries the usr_ id for every role); the assignment payload stays NAME-keyed on purpose — the server resolves it and 409s ambiguity · **13 stale `assignedTo` ghosts cleared on dev** via `scripts/clear-stale-assigned-names.mjs` — dry-run reviewed, `--apply --org --expect` pinned, post-verified zero remain · **prod roles cleanup CLOSED both sides** (morning, commits `92386aa`+`34a3f94`): Clerk held ONE refused value (`"Sales Rep"` on the live.com user — the label-as-value seed), fixed via the UI and re-run clean; the mirror's `member` ×4 were UKG rows fixed through the `user-role` path after a single-subject validation with three controls, both locations (column + frozen blob) healing per save; two read-only verifiers added (`check-mirror-roles.mjs`, `list-clerk-members.mjs`) · **a prod `sk_live_` Clerk key was committed locally** (`93571f4`, sole-file commit), caught pre-push by `ls-files`/`check-ignore` disagreeing, reset out — the key never left the machine; `.env.clerk-prod` ignore rule added (§0.54)
**Prior batch:** **the unassigned half of the leads read policy is now an admin toggle** — `settings.extra.unassignedLeadsVisibleToReps` (default true; absent key = standing policy), enforced in `leads.mjs` GET with an explicit `!!l.ownerId` null-collision guard (18b22) · new `LeadVisibilityDetail` panel, four-step wiring, live policy badge · **Mine/All on Leads** keyed on `ownerId` (norm() gains the passthrough; never the display name) · **first rep-role integration coverage for `leads.mjs`** — 5 tests incl. the unresolvable-caller-under-strict-policy case asserting ZERO rows · two permanent unit guards: the null-null-collision SHAPE guard across all six endpoints, and 18b12-as-a-test for this key · the itest **org-namespace collision** found and fixed (guide §18b25) · harness anchor #14 repointed, +5 mutations, **85/85** · **local `netlify dev` failure root-caused to a stale `dist/`** (typeless module responses; the documented cleanup fixed it — guide §19 gains the recognition note; a toml-redirect hypothesis recorded as UNPROVEN, not shipped) · guide **§18b25** (§0.53)
**Prior batch:** **the server is now the boundary on reads** — `accounts`, `contacts`, `tasks` and `activities` GETs were `db.select().where(eq(orgId))` and nothing else, EVERY row in the org to every caller, with only the client filter narrowing them · all four now rep-scoped on `ownerId` (own + unassigned; Admin/Manager bypass), the identical predicate `opportunities.mjs` and `leads.mjs` already used · **commit `77e119c` recorded: `currentUser` comes from the roster row, not Clerk** (§0.26 closed — recorded only in the handoff until now) · the doc corrections owed since that commit · guide §17 rewritten for id-based ownership + the read-side policy · guide §19 branches/env-var corrected · **the client stops re-implementing the boundary** (§0.51) · **Mine/All on Accounts, Contacts and Pipeline** (§0.52)
**Prior batch:** **the role vocabulary was eight lists and only one was enforced** · **`requireWrite` was a BLOCKLIST** — it denied exactly `ReadOnly` and `Technician` by string and permitted every other value, so `readonly`, `Sales Rep` or any typo carried full write access to ~28 endpoints · **role changes had been impossible since the Phase 1 identity split**: `user-role.mjs` used one parameter in two identity spaces, so the UI's app id 404'd at Clerk and a Clerk id would have matched zero mirror rows silently · **the Users UI read a role copy frozen in the profile blob** — `flatten()` spread it last, and nothing ever updated it, which is the whole of §0.40's symptom · the invite screen seeded rows with the display LABEL `'Sales Rep'` and wrote it into Clerk · three role `<select>`s presented **Admin** for any unrecognised value, making a one-click escalation out of a display bug · 262 → 276 tests, 73 → **80** mutations · guide **§18b24**
**Prior batch:** **object-level authorization centralised — the last nine hand-rolled checks are gone** (eight single-record + two bulk `ownerColumn:` literals; earlier docs said "nine", the real count was ten sites — verified by reading, §0.29) · **THREE LIVE DEFECTS FOUND, all one shape: a display name compared to a Clerk id** · **§0.28 shipped with two rep-path GET filters broken — every rep saw only UNASSIGNED opportunities and leads, none of their own**, silently, because the query succeeded and returned no row · `getRepUser()` was unscoped and returns an EMAIL ADDRESS that deal names and ARR are sent to — a cross-tenant delivery path · a self-notification guard compared a name to a Clerk id and so had **never suppressed a single email** · **`tests/ownership-registry.test.mjs` was absent from `SUITES`** — every guard in it had ZERO mutation coverage while the count read 55/55 · 250 → 255 tests, 55 → **65** mutations · guide **§18b21**
**Prior batch:** **identity split — `users.id` is app-owned and permanent, Clerk's id moved to `clerk_user_id`** (the PK was being OVERWRITTEN at invite acceptance) · **`users.email` was GLOBALLY unique, so one address could exist in exactly ONE organization across every customer** — now unique per org · **`bulkUpsert` failed OPEN for an unidentifiable caller** — `callerName === null` meant both "Admin, skip the check" and "cannot identify", and a unit test asserted the permissive reading was correct · caller lookup now org-scoped and keyed on `clerkUserId` · **name sync from Clerk SUSPENDED** — it detached every record a renamed user owned · 244 → 250 tests, 50 → 55 mutations
**Prior batch:** **the delete gate RAN and passed — first time in four sessions** · **the leads CSV import had never written a single row** (client sent an array, endpoint had no array branch, 400 every time, error rendered on a step the user never sees) · **two ownership columns that do not exist** — `contacts.createdBy` and `activities.repName` — producing four hard 500s on rep paths and one SILENT ORG-WIDE WRITE BYPASS · **object-level authorization centralised** into `_ownership.mjs` with a registry checked against the real schema by `npm test` — the guard found the second bad column on its first run · **the integration suite had been dead at import** since `requireWrite` landed, so every cross-tenant isolation test including the post-wipe `clear=true` guard was dormant · **the test database schema had drifted** and `drizzle-kit push` had never been run against it · **`currentUser` comes from Clerk and disagrees with `users.name`**, so a rep with no Clerk profile name is identified by EMAIL and sees only unowned records · `GET /users` was Admin-only, so every user picker rendered empty for reps · **child promotion runs BEFORE the Admin gate — CONFIRMED: a refused delete still orphans every sub-account, permanently, with no audit record** · 232 → 244 tests, 0 → **26** integration tests (this line read `0 → 21` until 25 Aug; it was written before the five accounts child-promotion tests landed and never updated — §0.24's own text says 26)
**Prior batch:** **seven defects, four of them in code written this session; every one of those four found by running the app, not by a gate** · delete was never gated and never audited on any entity · import stage clock · **the CSV overwrite was still destroying data — server-side** (`sanitize()` is a builder, not a filter; the previous fix was caller-side and 18b13 said so) · **the importer now reports what the server said** — counts stopped travelling as prose · `saveBulk` threw from inside its own loop · **the opportunities overwrite bypassed chunking entirely and discarded every count the server returned** · overwrite state applied from `appliedIds` on **three** paths, not the two recorded · silent row drops surfaced at Preview · **the stage clock shipped in §0.17 wiped the rows it did not touch** — a deal lost its clock AND its whole stage history because a DIFFERENT deal in the same file moved · **`37/37 mutations` was never reproducible** — CRLF vs `\n` anchors meant 8 of them had never run · Home showed the wrong fiscal quarter · `toISOString` was building local dates in 29 places · **89 → 232 tests, 0 → 50 mutations**
**Prior batch:** **bulk INSERT chunked with per-row isolation (3 endpoints)** · `check:dbfetch` was blind to aliases AND concise arrow bodies · **opportunities CSV overwrite had never worked** · **an overwrite wiped stage history, comments and contact links** · contacts import was ~500 round-trips · undated deals invisible in the Pipeline list · 69 → 89 tests · **confirmed on dev, not just in CI**
**Prior batch:** **`dbFetch` remediation 78 → 0, `check:dbfetch` promoted to the fifth gate** · **Clerk advisories cleared — Production migration unblocked** · three of four gates had false-negative classes, all now fixture-tested · `users.mjs` PUT was replacing rows · 4 `settings.extra` keys never whitelisted · settings autosave cached rejected writes forever · build guard · 19 → 69 tests
**Prior batch:** SalesManagerTab hoist, SPIFF persistence & claim plumbing
**Prior batch:** inline-component audit — **the backlog named the wrong three files**; 81 raw findings triaged to 5 user-visible, 3 fixed · new `check:inline` scanner
**Prior batch:** calendar disconnect (endpoint already existed — client wiring only) · personal email signature, escaped server-side · record-number generators moved from full-table scan to indexed `MAX` · **`mobile` was being wiped on every profile save**
**Prior batch:** `planWeek` crew + equipment constraints · settings navigation guard · **14 panel saves fixed (4 were silently discarding failed saves)** · PersonalView mocks deleted · calendar visibility (avatar tab + Home strip) · `check-tdz.mjs` widened to function declarations, finding 4 pre-existing crash bugs
**Prior batch:** Dispatch customers redesign · property types org-configurable · Won→Dispatch bridge template-driven · quote numbers server-side · quote versioning fixes · record-number unique indexes + retry · template "Applies when" two-axis matching · unsaved-changes prompt · **two production incidents (§0PB.20, §0PB.21)**  
**Prior session:** service plans (B) · plan recurrence & Service Due (C) · production TDZ incident · `preferredTechId` circular-score fix · job template picker · two uneditable template inputs · **Vehicles & Equipment converged onto the DB tables (blobs retired as source of truth)** · equipment as a scheduling constraint (unit-level) · **vehicle-class requirement (`required_vehicle_type`, schema change)** · template Edit action · dispatch customer segmentation  
**Prior session:** SVR-2 actually shipped (`a9ed408`) — BYOK plaintext-key exposure + settings authorization · **audit-record correction** · **SVR-3 uniform role-gate sweep (11 files)** · **Dispatch module: job create rebuilt, Customers + Technicians views** · **technician consolidation, licence levels, crew scheduling persisted + audited, board date ranges** · **job editing, job categories/types, mass-schedule, technician availability (shift patterns + time off)** · **Technician role + scoping, role management (roles never reached Clerk)** · **technician frontend, settings save errors surfaced, job numbers** · **user/Clerk drift root-caused, drift detection, user delete fixed** · **settings duplicate-row fix + unique index**  
**Prior session:** UI features · task-completion bug · users-wipe incident + recovery · branch-drift reconciliation

---

## 0. Latest Batch — The Server Becomes The Boundary On Reads

> Four GETs sent every row in the org to every caller, and the browser hid them.
> That is not the same as protecting them. This batch gives accounts, contacts,
> tasks and activities the same rep scoping opportunities and leads already had,
> and back-records the commit that made the client's identity real.

### 0.48 What shipped

- **Rep scoping on the four unscoped GETs.** `accounts.mjs`, `contacts.mjs`,
  `tasks.mjs` and `activities.mjs` each ran
  `db.select().from(t).where(eq(t.orgId, orgId))` and nothing else. Each now
  applies the identical predicate `opportunities.mjs` uses:
  `!r.ownerId || r.ownerId === callerId`, with `canSeeAll(userRole)` returning
  before the filter — Admin and Manager are untouched; only the rep path changes.
- **Unassigned stays visible to everyone** — Jeff's explicit call, matching the
  write policy (`mayMutate`: unowned records are mutable by any writer). Note the
  `ZZFX Other Rep` fixture rows carry `ownerId: null` (the name matched no roster
  row at backfill, §0.38), so they are unassigned-and-visible by policy — an
  after-count that does not drop as far as intuition expects is not a failure.
- **A caller that cannot be resolved sees only unassigned rows** — a null
  `getCallerId` fails closed, the same direction `mayMutate()` takes on writes.
- **No manager branch, deliberately.** The `managedReps` filter in
  `opportunities.mjs` is name-based (§0.39); copying it here would need
  `ownerNameKeyFor(entity)`, and `_ownership.mjs` maps `account → accountOwner`
  alone while the Edit Account modal writes `assignedRep` — a manager would
  silently lose those accounts. It moves with the name-based migration, not here.
- Two import lines gained a word: `canSeeAll` into `tasks.mjs`, `getCallerId`
  into `tasks.mjs` and `activities.mjs`. The function-import graph check inside
  `npm test` is the only gate that proves those edges resolve (§0.11).

### 0.49 Commit `77e119c`, recorded — `currentUser` comes from the roster row

Shipped 26 Aug and recorded only in `SESSION_HANDOFF.md` until now — a §22
violation, owed and paid here. `App.jsx:95` derived `currentUser` from Clerk's
`firstName + lastName`, falling through to the EMAIL ADDRESS when both were
blank, while every ownership column stores `users.name` — §0.26's split
identity. Now: `currentUser = myProfile?.name || clerkName` and
`currentUserId = myProfile?.id || null`, from the `?me=true` roster row that
already self-heals drift; the Clerk derivation survives only as the fallback for
a user with no roster row. `currentUserId` rides `appContextValue` and nothing
consumes it yet. Verified in the browser as Karen: `window.clerkCurrentUser` →
`'Karen Russell'`, `window.clerkCurrentUserId` → `'usr_e7e09733-…'`. Does NOT
fix duplicate names (§0.37) — only ids close that.

### 0.50 Verified — and what still is not

All six gates green · 276 tests · 26 integration tests · **80/80 mutations
caught on a printed green baseline** · build 2,459 kB. Two greens carry the
batch: the §18b23 class guard (`callerId` is only ever compared against
`.ownerId`) passes over the four new filter lines, and the function-import test
proves the three new edges — the one failure mode that passes every other gate
and dies at the Netlify deploy.

Before-counts captured on dev, BOTH roles, before deploy — Karen AND Admin each
received the full org: **accounts 144 · contacts 1534 · tasks 28 ·
activities 23**. Identical numbers for a rep and an Admin is what "no scoping"
looks like, and is the baseline the after-check compares against.

**After-counts verified on dev, 28 Aug, deploy `e10e1a1`.** Karen:
**144 · 1533 · 25 · 22**. Admin: **144 · 1534 · 28 · 23** — the baseline
exactly, digit for digit, so `canSeeAll` still bypasses. The drops are proven
to be the RIGHT rows, not merely fewer: applying the predicate client-side over
the full Admin dataset with Karen's id
(`!r.ownerId || r.ownerId === ’usr_e7e09733-…’`) yields
**144 · 1533 · 25 · 22** — identical to her scoped GETs on all four entities.
Incidentally derivable: every account in the org is unassigned or Karen's
(144 = 144), and exactly 1 contact, 3 tasks and 1 activity are owned by someone
else — which is why the drops are small, per the unassigned-majority in §0.38.
The GET scoping still lands with no automated rep-role coverage for these four
endpoints (the §0.33 test debt stands); this browser check is the runtime
evidence, recorded here.

**Production verified the same way, 28 Aug, `master` at `1ceb13c`** — a
different Clerk instance, org and dataset. Admin control: **663 · 1506 ·
48 · 30**, unchanged across runs. Rep path (`usr_449739ff-…`, the
`jeffrussell1@live.com` account) received **663 · 61 · 0 · 2**, and the
predicate applied over the full Admin dataset yields the identical four
numbers — no leaks, nothing missing. Unlike dev, prod shows the boundary
doing visible work: 61 of 1,506 contacts, 0 of 48 tasks. Found in passing:
five of six prod roster rows carry refused role values in the mirror
(`member` ×4, `Sales Rep` ×1 — invite-era values predating the vocab
batch), so those accounts likely cannot write on prod until re-set via the
Users UI, and `check-clerk-roles.mjs` against the prod Clerk instance is
concretely due.

### 0.51 The client stops re-implementing the boundary (same session)

With the server scoping reads, the client's name-based visibility filters
changed from redundant to hazardous: a row whose `ownerId` is the rep's but
whose stale name-string no longer matches would be SENT by the server and
HIDDEN by the client — §18b22's shape, on the read path. Shipped:

- **`isRepVisible`'s rep branch returns `true`.** The server is the boundary.
  The Manager branch stays untouched and is LOAD-BEARING: server-side
  `canSeeAll` hands Managers the whole org on five of six entities, so the
  client's `managedReps` narrowing is the only Manager scoping that exists
  (§0.39). Deleting the function wholesale — as the handoff proposed — would
  have silently widened every Manager's view to org-wide.
- **TasksTab's Mine/Team control is now Mine/All**, honest at every role: for
  a rep, All is everything the server grants (own + unassigned). “Team” could
  never show a rep their teammates' tasks again and read as if it would.
- **The scope filter keys on `it.ownerId === currentUserId`**, not the display
  name — the first consumer of `currentUserId` (§0.49 said “consumed in the
  next commit”; this is that commit). A null `currentUserId` during the
  `?me=true` load window fails closed, matching `getCallerId`.
- **Scope persists** to `localStorage` (`tab:tasks:scope`), the sub-tab
  precedent. Preference only, never data; an unrecognised stored value renders
  as Mine rather than leaving the control stateless (§16's unmatched-select
  rule).
- **The inline activities author filter died** (`TasksTab:1147`) — the same
  class as the rep branch, able only to hide server-granted rows.

Accounts, Contacts and Pipeline chip rows get the same toggle in follow-up
batches, one file-read at a time. No new tests — client-only; the six gates
plus a browser pass as Karen (Mine/All toggles and persists across reload;
nothing she owns missing on Tasks) are the verification.

Verified in the browser on dev, 28 Aug, deploy `521e5d7`: as Karen — the
control reads Mine/All, toggles, and the choice survives a reload; nothing
she owns missing under Mine. As Admin — unchanged. Karen’s Mine equals her
All, WHICH IS EXPECTED AND BY CONSTRUCTION: the server sends a rep only
own + unassigned, Mine hides only rows owned by others, and there are none
to hide — the identical property the old Mine/Team control had. The toggle
is meaningful for Admins and Managers today; making Mine strictly-mine
(hiding unassigned too) is a one-line product option if reps should get a
real distinction.

### 0.52 Mine/All on Accounts, Contacts and Pipeline (same session)

The §0.51 pattern, applied to the remaining three tabs. Each tab takes
`currentUserId` from context, aliases its context list at the destructure
(`visibleAccounts` / `visibleContacts` / `visibleOpportunities` →
`allVisible…`) and re-derives the original name scoped:

```js
const visibleAccounts = useMemo(() => scope === 'mine'
    ? allVisibleAccounts.filter(r => !r.ownerId || r.ownerId === currentUserId)
    : allVisibleAccounts, [scope, allVisibleAccounts, currentUserId]);
```

One edit at the source; every downstream reference — warmth chips and their
counts, smart presets, saved views, exports, KPI strips — follows the scope
automatically. The derivation is memoised so the `mine` branch does not mint a
new array identity per render and defeat every downstream memo. Each tab
persists to its own key (`tab:accounts:scope`, `tab:contacts:scope`,
`tab:pipeline:scope`), validated on read like §0.51. Placement: Accounts — the
chip row, between the view tabs and the warmth chips; Contacts — the header
button row, before search; Pipeline — the view-switcher row, after the view
tabs. Unassigned rows remain visible under Mine. Default is Mine everywhere
(the handoff's recorded design) — note this is the first scoping an Admin sees
on these tabs, so an Admin’s first load shows own + unassigned until they
click All once; the choice then persists. No new tests — the six gates plus a
browser pass per tab are the verification.

---

### 0.53 Lead visibility toggle, Mine/All on Leads, and the first rep-role leads tests (31 Aug)

The Leads scoping session the last two handoffs deferred — the admin toggle,
the `settings.extra` key, both halves of `settings.mjs` and the filter change,
landed together. Plus everything the session surfaced on the way.

**The toggle.** `settings.extra.unassignedLeadsVisibleToReps`, default `true`,
absent key = the standing policy so the deploy changes nothing for any
existing org. `leads.mjs` GET (leads ONLY) branches the rep predicate:

```js
results = unassignedVisible
    ? results.filter(l => !l.ownerId || l.ownerId === callerId)
    : results.filter(l => !!l.ownerId && l.ownerId === callerId);
```

The `!!l.ownerId` guard is the load-bearing character: bare `=== callerId`
matches `null === null`, handing an UNRESOLVABLE caller exactly the unassigned
rows the toggle hides (18b22 — two absences comparing equal in the permissive
direction). The config read throws to the outer 500 instead of copying
`getLeadScoring`'s swallow-and-default: a visibility boundary must not
silently pick a fail direction. **Write policy deliberately unchanged** — an
unassigned lead stays mutable by any writer who reaches it; visibility ≠
authorization, recorded as a decision. Panel: `LeadVisibilityDetail.jsx`
(salesProcess), full four-step wiring, live badge on the card
("Unassigned visible to reps" / "Reps see assigned only").

**Mine/All on Leads** — the §0.52 pattern with one Leads-specific finding:
`norm()` carried only the display name (`assignee`), so it gained an
`ownerId` passthrough and the scope keys on that, never the name. Control on
the right of the Triage/Cockpit strip, key `tab:leads:scope`, default Mine.

**Tests — the §0.33/§0.50 leads debt starts getting paid.** Five integration
tests, the endpoint's first rep-role coverage: own+unassigned under the
default; own-only under strict; Admin identical either way; stored `true` ≡
absent; and the unresolvable-caller-under-strict case asserting **exactly
zero rows** — the test that catches the `!!` guard's removal. Roster seeding
follows the cache discipline (`before()` seeds, then `invalidateRoster()` —
the caller cache stores a miss as `{id: null}` for 30s). Two permanent unit
guards in `ownership-registry.test.mjs`: a SHAPE guard requiring every
`x.ownerId === callerId` in every endpoint to decide the null-null collision
explicitly, and 18b12-as-a-test (≥2 hits in `settings.mjs`, `?? true` pinned
in `leads.mjs`). Harness: anchor #14 repointed to the new ternary, five new
mutations (guard dropped, default flipped, helper decorative, each settings
half deleted), **85/85 on a printed green baseline, zero STALE**.

**The itest namespace collision (now guide §18b25).** Seeding
`(itest_org_A, u_itest_org_A)` collided with the accounts suite's per-test
re-seed of the identical pair — three concurrent processes, one DB, one
unique constraint. Accounts died on duplicate-key in its hooks; org A's
caller resolved to whichever row was standing when the 30s cache filled, so
the leads rep tests failed nowhere near the cause. Fix: the leads suite owns
`itest_leads_A/B`. Rule: one org prefix per suite that seeds constrained
shared tables.

**Dev-environment failure, fixed (environmental — no code change rides this
commit for it).** Local `netlify dev` served Vite module URLs
(`/src/main.jsx`, `/@vite/client`) as typeless 200s carrying Netlify's own
headers; `nosniff` blocked them, React never mounted, and the static crawler
landing in `index.html` stayed on screen. A stale `dist/` from earlier
builds was present, and the documented stale-build cleanup
(`rm -rf node_modules/.vite dist` + restart) fixed it — WITH the `[dev]`
proxy block in place, so the toml comment's "falls back to the stale dist"
warning understates when the fallback can bite. A toml-catch-all-redirect
hypothesis was formed and a move-to-`public/_redirects` fix drafted but
NEVER APPLIED — the cleanup had already fixed it, which was only recognised
when `git add public/_redirects` found no file (the truncated-curl error,
handoff §2). Recorded as unproven, not as shipped. Diagnosis chain worth
keeping: "Rewrote URL to /index.html" dev-log lines pairing with the failed
modules; `curl -sI` on :8888 vs :5173 separates the CLI from Vite. Guide
§19 gains the recognition note.

**Browser verification (local dev, 31 Aug).** Admin: 23 leads in BOTH toggle
states; badge round-trip confirmed; Mine/All present and persisting. Karen:
**4 under strict, 23 under permissive** — reconciled at the ROW level via an
authorized fetch: exactly 4 rows carry her `usr_e7e09733-…`, the other 19
are `ownerId: null`, zero foreign owners. Thirteen of the 19 are the ZZFX
pattern live in real data — stale `assignedTo` display names on
`ownerId: null` rows — so the UI shows them "assigned" while policy
(correctly) treats them as unassigned, and the name-based Unassigned
chips/Distribute counts undercount the pool (6 shown vs 19 actual).
**Hygiene item recorded:** clear stale `assignedTo` strings where `ownerId`
is null, and move the Unassigned chips to `ownerId` (the §0.50 remnants
list, one more entry). Also observed on local dev, both pre-existing:
`documents.mjs` 500s locally (likely R2 env, untriaged) and the non-writer
settings auto-PUT 403 noise (the known `useSettings` toast debt).

---

### 0.54 The leads overwrite path, ownerId-keyed unassigned counts, stale-name hygiene, and the prod roles close-out (31 Aug, second session)

**The overwrite path — found by reading, closed the same day.** The queued
hygiene item ("move the Unassigned chips to `ownerId`") sat on top of a live
bug: `saveLead` sends `{ id, ...patch }`, `leads.mjs` PUT fed that straight
into a full-row `sanitize()`, and the upsert wrote the result with
`set: { ...updateData }` — so a two-key status change REPLACED the row,
nulling `firstName`, `lastName`, `company`, `email`, `phone`, `source`,
`notes`, `estimatedARR` and `assignedTo`. Only `firstTouchDate`/`convertedAt`
had preservation. The client's optimistic local merge kept the fields on
screen, so the wipe only ever showed on reload — the users.mjs §0.44 wipe,
same mechanism, different endpoint, and the carried-forward "leads overwrite
path" item located at last. Doing the UI half first would have armed it: an
honest 19-row unassigned pool feeding "Auto-assign all" through a wiping PUT.
So the merge went in first:

```js
const clean = sanitize({ ...existing, ...data });
```

— the `mergeForUpdate` pattern minus the blob flatten (lead rows are flat).
Field-present semantics: a key sent is applied, including an explicit null; a
key omitted keeps its stored value. `ownerIdForUpdate` still receives the RAW
body — merging first would make every PUT look like it mentioned `assignedTo`
and defeat 18b13's change detection. A quiet second fix rode along: partial
PUTs had been re-scoring leads from mostly-null rows.

**Held closed three ways**, because the harness cannot see it directly: the
integration pair (a partial PUT preserves nine asserted fields; an explicit
null still clears — field-present, not field-protection), a source-assertion
guard in `tests/partial-sanitize.test.mjs` (the mutation harness runs UNIT
suites only, so the rule is pinned where the harness can see it: the merged
call present exactly once, the bare `sanitize(data)` absent), and harness
mutation #86 reverting the merge — simulated caught before delivery, CAUGHT
on the real tree. 279 unit / 33 integration / 86-86.

**Unassigned-ness keys on `ownerId`** everywhere it is a PREDICATE: both
status chips, both view filters, the triage "Needs first touch" lane, the
Distribute pool and count, and the subtitle — all previously `!l.assignee`,
undercounting the real pool 6 vs 19 because thirteen ghosts carried names.
The Distribute load bars now count `l.ownerId === id` from a `reps`
`{id, name}` roster (`settings.users` is the users.mjs `flatten()` shape and
carries the usr_ id even in the rep directory read). The assignment payload
stays NAME-keyed deliberately: the server resolves the name and refuses
ambiguity with a 409 rather than the client guessing. The `!lead.assignee`
DISPLAY sites (next-action text, the assignee card) were left alone — showing
a name is what they are for; owner-set/name-null rows exist (single creates
stamp the caller silently) and an ownerId predicate there would render an
avatar with no name.

**The hygiene run.** `scripts/clear-stale-assigned-names.mjs`: dry-run by
default (13 candidates, all in the dev org, the ZZFX fixture among them —
matching §0.53's browser reconciliation to the row; UKG contributed zero);
`--apply` demands `--org` and `--expect=N`, refuses if the live count moved,
detects the physical column spelling from a sample row rather than assuming,
and post-verifies BY RE-SELECTING. Cleared 13, zero remain. Backfilling
`ownerId` FROM the names was rejected explicitly: resolving ownership by
display-name equality is the hazard the id migration removed.

**The morning: prod roles cleanup closed on both sides** (commits `92386aa`,
`34a3f94`). The remembered "five of six mirror rows" resolved cleanly: Clerk
itself held exactly ONE refused value — `"Sales Rep"` on the live.com user,
the invite-label-as-value seed the checker's own header predicts — fixed in
the UI, re-run clean (7 memberships, 0 findings). The `member` ×4 lived only
in the mirror (column AND frozen `profile.userType` blob, both locations),
on four UKG test accounts whose Clerk role is ABSENT — nobody was 403ing.
Fixed through the `user-role` UI path after a single-subject validation
(Andy as subject, three controls held, network capture, row-level re-read);
each save healed column and blob together. One row set to Manager was
DELIBERATE. Two read-only verifiers joined `scripts/`: `check-mirror-roles`
(SELECT-only, both locations, tolerant of column spelling, exit 1 on
findings) and `list-clerk-members` (full membership with Clerk identifiers —
the roster email and the Clerk login can DIVERGE via the display-name link
fallback, which is how the UKG Admin row reads `jeff.russell@ukg.com` while
the account signs in as the yahoo address).

**The key incident, resolved.** `.env.clerk-prod` carrying a live `sk_live_`
was committed locally (`93571f4`, message "1", sole file) BEFORE the ignore
rule existed — which is why `check-ignore` stayed silent through an entire
red-herring chase of the pattern: ignore rules do not apply to tracked
files. `ls-files` (prints it) vs `check-ignore --no-index` (matches) split
the diagnosis in one step. `git reset HEAD~1` dropped the commit; the key
never left the machine (no remote contained the commit); rotation optional.
The ignore rule is committed. Standing lesson: a reflexive `commit -am`
nearly pushed a prod secret — named adds only while secrets sit ignored.

**Found and QUEUED, deliberately untouched** (SettingsTab cleanup pass):
audit `user.updated` events attribute the TARGET as actor (the paired
`user.role.changed` rows attribute correctly — the bug is in the users.mjs
PUT's writeAudit call); the settings autosave fired ~9 junk `settings.updated`
audit events across three role saves (the §0.53 useSettings debt, now shown
polluting the audit trail, not just consoles); the roster's "Out of sync
with Clerk / Reconcile" button is UNREAD code claiming 6-row drift; the user
profile Security card contradicts the list view on MFA/SSO. Dev-org role
drift remains: org_3B8Tg `member` ×2 (both locations), org_3BDQ one blob-only
(`smiller`, self-heals on next write) plus an Admin/Technician blob split on
a valid row.

**Post-commit amendment (same day).** The browser pass and dev smoke ran
AFTER commit `1ec5640` — the docs briefly claimed them unobserved (the prior
session's docs-outran-the-disk error class, repeated; recorded in the
handoff's errors). Both then matched to the digit: local 23/19/19, Karen's
bar 4, James Whitmore assigned → F5 → assignment, CTO title, notes and $310K
all intact, chip 19→18, bar 4→5; deployed smoke 23/18 with the same lead
whole through the production bundle. Five findings from the pass, queued:

- **The assign control is a raw `window.prompt`** — free text, no rep list,
  no typeahead, off-style, at FIVE call sites. Free text into name
  resolution is a ghost factory; replace with a picker fed from the `reps`
  roster. Until then: type names EXACTLY as the Distribute panel renders
  them.
- **`resolveOwnerId` case-sensitivity is UNVERIFIED** — a lowercase name was
  typed into the prompt during the pass and cancelled before OK on exactly
  this doubt. Read the resolver before trusting mixed-case input.
- **"NaNyr ago" in the lead detail Activity timeline** — date formatting
  bug on lead-created/source events.
- **The Distribute panel follows the Mine/All scope** — an Admin in Mine
  sees all-zero load bars (their own leads only). Consistent with §0.53's
  everything-follows-the-scope choice; questionable for a distribution
  tool. UX decision queued, not a defect.
- **The stale-`dist/` failure has a SECOND FACE** — wrong Clerk key in the
  stale bundle → sign-in lands on the WRONG INSTANCE and redirects to
  `salespipelinetracker.com`; the org switcher shows the wrong instance's
  orgs. Same cleanup fixes it; guide §19 now carries the recognition note
  and the read-the-URL-bar-first rule (a prod tab nearly hosted this
  session's browser pass).

**Shipping status at close:** `master` was fast-forwarded to `4df71b6`
earlier in the day (Jeff's move, between messages), so PROD has been
building and serving the `1ec5640` code batch since — the overwrite fix and
ownerId counting are LIVE. A final docs-only fast-forward (`4f32284` +
`9c03db7`, no code delta) and the two-minute UKG Leads-tab eyeball on prod
(no visible change is the pass; UKG's data was always ghost-free) remained
open at session close.

---

### 0.55 The seventh gate ships, CLAUDE.md lands, the CI blind spot, and the doc-ordering rule (31 Aug, third session — docs and process)

**A docs-and-process session; no endpoint code changed.** Nine commits on
`dev`, in true order: `695c97a` (FINAL handoff synced to both copies),
`babdf7f` (§0.54 amendment applied), `06ddbe1` (the seventh gate),
`b526ade` (CLAUDE.md, +132 lines — the commit message reads just "repo";
recorded here because the log will never say what it carried), `b9c6764`
(CLAUDE.md multi-tenancy hard rule, +11), `02c663a` (gate tests, fixtures
refused — see below), `9c373fb` (fixtures force-added), `4b044a7`
(`.gitignore` anchored), `bd06bb2` (CI unit-job `npm install`).

**The prior session's tail, closed first.** The UKG prod Leads-tab eyeball
PASSED — no visible change, which is the pass condition. The docs-only
`master` fast-forward was found ALREADY DONE: `9c03db7` verified on `master`
via `git branch -a --contains`, the §0.54 "nothing to commit was TRUE"
lesson paying out on its first morning.

**The dual-copy drift healed, then gated.** The FINAL handoff rewrite
existed only in the uncommitted ROOT copy; `docs/` on `master` still carried
the pre-FINAL draft — the pair's third divergence in two days. Synced
root→docs and committed, then §0.54's queued candidate fix became THE
SEVENTH GATE: `scripts/check-handoff.mjs` byte-compares the root and `docs/`
copies, classifies the divergence (EOL vs whitespace vs content), names the
first differing line, and accepts two positional paths so fixtures can
exercise it. Wired end to end: `package.json` `check:handoff`, guide §19
("run all seven" plus the history note, per §22 style), and a CI gates-job
step between dbfetch and build. Proven, not just written: four committed
fixtures, three behavioral tests, meta-test registration — 279 → **282**
unit tests.

**The §0.54 amendment had never actually run.** `patch-state-054-shipped.mjs`
existed on disk but had never executed with `--apply` — the state doc lacked
the "Shipping status at close" block that the FINAL handoff's own staleness
fingerprint demanded. The staleness check WORKING as designed: docs claimed
an applied patch the disk did not hold, caught at session start by checking
section content. Applied, verified from disk (8 insertions), committed.
This incident is the origin of the doc-ordering rule below.

**CLAUDE.md created at repo root** — the standing-rules layer only: the
session-start ritual, the hard rules (including the multi-tenancy isolation
rule added in its own commit), the seven-gate chain, identity/ownership
invariants, environment facts. Deliberately NO session state — that stays in
the handoff, which changes every session; CLAUDE.md changes when the rules
change.

**The CI unit-job blind spot, found and fixed.** The unit job ran
`node --test` with no `npm install`; `scanners.test.mjs` spawns the gate
scripts, which import `@babel/parser`, so on a clean runner the job died
ERR_MODULE_NOT_FOUND in ~8 seconds. Suspected red since the scanner suite
landed — NOT verified against older runs; recorded as suspected. The gates
and integration jobs were green throughout (per-job read on `4b044a7`:
gates ✓, integration ✓, unit ✗), which is exactly how overall-red runs hid:
the job that mattered to each change kept passing. Fixed in `bd06bb2` —
and that run was observed ALL THREE JOBS GREEN (run 33445015533, read via
the Actions API at the start of the doc session, the "check FIRST" item).

**The fixture commit that shipped 3 of 7 files.** git's "ignored by
.gitignore" hint for the four fixtures scrolled past between CRLF warnings;
`02c663a` shipped the tests but not the fixtures they load, and CI went red
on it. Caught by reading the commit STAT, healed by force-add, then
root-caused: `.gitignore`'s unanchored `fixtures/` (meant for the repo-root
`fixtures/` directory, which exists) also swallowed `tests/fixtures/`.
Anchored to `/fixtures/`. Lesson: a refused add is a one-line hint in a
noisy stream; the commit stat is the artifact that tells the truth.

**The doc-ordering rule (Jeff's call, now guide §22).** Doc changes are
applied, verified from disk, and committed the moment they are known —
never queued as end-of-session patch scripts. `SESSION_HANDOFF.md` is
written LAST, after everything else is applied and committed, so it only
ever describes observed, committed state.

**Two further errors, recorded.** A spacing fix was prescribed from paste
evidence; `cat -A` proved the file was already correct — the paste channel
strips blank lines, so formatting complaints need a disk read, not a paste
read. The fix script ran, changed nothing, and was deleted. And several
commands ran with their output never reaching the conversation (the
gitignore commit, the unit-install apply) — each time git's "nothing to
commit" was TRUE. Same rule as §0.54's paste incident: interrogate state
before diagnosing messages.

**Found, diagnosed, NOT fixed — the sanitize-then-upsert audit is now FOUR
for four** (users, leads fixed; opportunities, tasks diagnosed):

- `opportunities.mjs` single-record PUT (~line 365): `sanitize(data)` raw.
  A partial PUT nulls `opportunityName`/`account`/`salesRep`/`arr`/`notes`,
  wipes `stageHistory` and `comments` to `[]`, and resets `pipelineId` to
  `'default'`. The BULK branch directly above it was already fixed with
  partialRows; the single path was not.
- `tasks.mjs` PUT (~line 102): same shape, plus `sanitize()`'s
  `completed: d.completed ?? false` — a partial PUT UN-COMPLETES the task
  and nulls `completedDate`.

Fix known, the leads pattern: `sanitize({ ...existing, ...data })`. Both
endpoints already fetch `existing` and already feed `ownerIdForUpdate` the
RAW body, so 18b13's mentioned-assignee detection survives unchanged. Hold
closed the leads way: an integration pair per endpoint (partial PUT
preserves; explicit null still clears), source-assertion guards extending
`tests/partial-sanitize.test.mjs`, mutation entries, and the two missing
integration suites (`opportunities.itest.mjs`, `tasks.itest.mjs` — own org
namespaces per §18b25, wired into `test:int`). OPEN QUESTION, gating the
severity claim: whether the client's `saveOpportunity`/`saveTask` send
partial payloads — read the client save paths before claiming live impact.

**Verified at close:** seven gates green (`check:handoff`: "identical,
12487 bytes") · build 2,466 kB · **282/282** unit · CI gates+integration
green throughout the day, all three jobs green on `bd06bb2` · Netlify dev
deploys green · prod untouched since the morning docs fast-forward —
everything today went to `dev` only. `test:int` and the mutation harness
were NOT run today: nothing endpoint-side changed, and they are recorded as
not-run, not implied.

---

### 0.56 The opportunities and tasks overwrite paths closed — the audit's third and fourth faces (1 Sep)

**The severity question, settled by reading every sender first.** The
handoff's open question — do the clients send partial payloads? — was
answered before the fix: **no current client path sends a partial PUT to
either endpoint.** Every opportunity sender spreads the full row — the edit
modal initializes `formData` from `{ ...opportunity }`, `completeLostSave`
builds on that same form, the Kanban drag and both ReportsTab contact
panels spread `{ ...selectedOpp }`/`{ ...updatedOpp }` from state (and GET
is an unprojected `db.select()`, so state rows carry every column). Every
task sender likewise: TaskModal initializes from `{ ...task }`,
`handleCompleteTask` and all four TasksTab handlers spread the current row.
So the wipe was a LOADED GUN, not a live bug — precisely the leads posture
before `saveLead`'s two-key patch armed it, and the reason the endpoint is
fixed first. Remaining unswept vector: external API-key writers (the
API-docs snippets are GET-only; whether API keys can reach these PUTs at
all is UNREAD — open question, not a claim).

**Both PUTs now merge before sanitizing** — the leads/users pattern,
verbatim: `sanitize({ ...existing, ...data })`, field-present semantics (a
key sent is applied, including an explicit null; a key omitted keeps its
stored value), with `ownerIdForUpdate` still fed the RAW body so 18b13's
mentioned-assignee detection is untouched. `opportunities.mjs` single-record
PUT: previously nulled name/account/rep/arr/notes, emptied `stageHistory`
and `comments`, reset `pipelineId` to `'default'` (the bulk branch above it
was already merged via `partialRows` — the single path was the third face).
`tasks.mjs` PUT: the same wipe plus the sting — `completed ?? false`
UN-COMPLETED the task and nulled `completedDate` (the fourth face).

**Held closed the leads way, times two.** Source-assertion guards in
`tests/partial-sanitize.test.mjs` (merged call exactly once, bare
`const clean = sanitize(data);` absent — per endpoint); mutation entries
reverting each merge (86 → **88**, both CAUGHT on the real tree, printed
green baseline); and the two integration suites this endpoint pair never
had: `opportunities.itest.mjs` and `tasks.itest.mjs` (own org namespaces
`itest_opps_*` / `itest_tasks_*` per §18b25, wired into `test:int`,
33 → **43**). Each suite: read isolation, cross-tenant PUT refusal, the
partial-PUT-preserves regression (opportunities pins stageHistory,
comments, pipelineId, contactIds and ownerId through a stage-only PUT;
tasks pins completed/completedDate through a title-only PUT), the
explicit-null/explicit-false clear, and PUT-of-unknown-id → 404.
282 → **284** unit.

**Found while reading the senders, recorded NOT fixed:** four TasksTab call
sites (snooze ×2, complete, saveContacts — lines ~272/602/619/645) read
`data?.task` off the raw `dbFetch` Response without `.json()`. That
property is always `undefined` on a Response, so the complete and snooze
handlers there fall into their else branch and REVERT the optimistic
update even when the server saved — the row flips back on screen and
corrects itself on reload (saveContacts merely never syncs the server
copy). This is the 18b1/18b3 class, and `check:dbfetch` reports 0 sites —
a scanner FALSE-NEGATIVE class: `const x = await dbFetch(...)` followed by
property reads on `x` with no `.json()` anywhere. Two work items queued:
fix the four sites (route them through `dbWrite` or `.json()`), and teach
`scan-dbfetch.mjs` the property-read-on-Response shape with fixtures per
§18b6. Severity: UI-only flicker-back, data IS saved; not a wipe.

---

### 0.57 The scanner's third class pays on its first run, and the assignee picker retires the prompts (1 Sep, second batch)

**`scan-dbfetch` gains a third finding class: the Response captured in a
VARIABLE and read as JSON.** The §0.56 queue item, done scanner-first to
prove the fix instead of assuming it. `const data = await dbFetch(...)`
followed by `data?.task` is a VariableDeclarator — not an
ExpressionStatement, not a `.then()` callback — so both existing classes
walked past it and the gate reported 0 while the defect sat in four places.
The class is a provable lower bound like the others: the initializer must
unwrap to a bare dbFetch (await/`.catch()`/`.finally()` only — a `.then()`
may transform the value, so it bails), declarators are collected per
enclosing function scope, reads are sought through the whole subtree
(closures legitimately read the outer variable), and only non-Response-member
properties are findings, reported at the declarator line. Pinned by
`dbfetch-var-response-as-json.jsx` (both live shapes) plus two MUST-NOT-CATCH
additions to `dbfetch-safe.jsx` (the canonical `res`/`res.json()` var
pattern, and a `.then(r => r.json())` init), and a scanners.test.mjs case —
284 → **285** unit.

**First run of the new class found SIX sites, not four.** The four known
TasksTab handlers (snooze ×2, complete, saveContacts) — where the else
branch REVERTED the optimistic update on every successful save — plus two
unknown in ReportsTab (`handleSaveReport`, `handleSaveAsReport`): both read
`data?.report` off the Response AND never checked `res.ok`, so a rejected
save showed "Saved" while the report never persisted and the fallback
`|| payload` masked the whole thing. All six fixed with the canonical shape
(`res.ok` check → `res.json()` → adopt server row, revert on failure);
saveContacts additionally rolls back BOTH state copies on a rejected save
where it previously kept optimistic contacts forever. Scanner over `src/`:
6 findings before the fix, 0 after.

**The assignee picker retires the five free-text prompts.** `RepPickerPopover`
— module-scope (the §16-class rule), anchored via
`getBoundingClientRect` + `position: fixed` (the house popover pattern),
warm-stone styled, with a filter input and avatar rows — replaces all five
`window.prompt('Assign to rep…')` sites in LeadsTab: the bulk-selection
Assign, the table-row `+ Assign`, and CockpitDetail's "Do it"/Reassign/
"Assign now" (CockpitDetail gains a `reps` prop from CockpitView; its picker
state is declared BEFORE the empty-state return — hooks on every render
path). The payload stays NAME-keyed on purpose — the server remains the
resolver and still 409s ambiguity. **The §0.54 case question is ANSWERED by
reading the resolver:** `resolveOwnerId` trims and lowercases BOTH sides, so
case was never a risk — misspelling was, and the picker removes it. Out of
scope, still prompts: the bulk status change (a vocabulary, not a roster)
and RolesDetail's rename. No unassign affordance was added — the endpoint
supports explicit-null clears but the UI never offered one; queued as a
product question, not snuck in.

**Verified:** seven gates green (the enhanced dbfetch gate at 0 across
`src/`) · build **2,468 kB** (+2 kB for the picker), bundle guard OK ·
**285/285** unit · **88/88** mutations, printed green baseline · `test:int`
not re-run this batch (no endpoint changed; 43/43 observed earlier today,
§0.56). **NOT yet verified: the browser pass.** The picker is a UI change
and the rep-path browser check (as Karen, per §19 — URL bar read, org count)
has NOT run; it is the outstanding gate before this batch deploys, and this
doc will not claim it until it is observed.

**Same-day addendum: the §19 dev-serving trap fired before the browser pass
could run — and turned out to be SELF-ARMING.** Jeff opened
`localhost:8888` and got the static crawler landing; its "Customer sign in"
link put him on `salespipelinetracker.com` in one click. Root causes, both
read not guessed: the verification chain's own `npm run build` writes
`dist/` (so every gate run re-creates the "stale dist" serving condition —
populated was the point, not stale), and the landing's sign-in anchor was an
absolute prod URL. Fixed: the link is now relative (`/`, identical behavior
on prod, no cross-surface teleport anywhere), the documented cleanup was
applied, and the chain now ends its local build with `rm -rf dist` (Netlify
builds remotely; the local `dist/` exists only for the bundle guard to
read). Guide §19 and CLAUDE.md carry the rule. The picker browser pass
remains outstanding — now on a clean surface.

**Second addendum: the first rep-path pass ran, and Mine went STRICT.**
Jeff's pass as Karen surfaced that Mine and All both showed 23 — correct
under the §0.52 design (Mine = mine + unassigned) in an org where no other
rep owns anything, but not the semantics Jeff wants. His call: **Mine is
strictly owned-by-me.** The filter is now
`!!l.ownerId && l.ownerId === currentUserId` — the `!!` guard is the 18b22
null-collision rule (during the ?me=true load window `currentUserId` is
null, and without the guard every unassigned row would match
`null === null` and render under Mine). Unassigned leads live under All,
the Unassigned chip, and the triage lane. Pinned by
`tests/leads-scope.test.mjs` (three source assertions, registered in
SUITES — no meta-test guards that registration, per the §18b23 lesson it
was added by hand) and two harness mutations (the permissive revert and the
dropped null-guard), 285 → **288** unit, 88 → **90/90** mutations, green
baseline. Consequence accepted with the semantics: a rep in Mine sees an
empty "Needs first touch" lane and a zeroed Unassigned chip — the working
set is All. First-pass observations otherwise: the picker rendered,
anchored, and listed the roster correctly as a rep; the known §0.53
non-writer settings 403 toast and the "NaNyr ago" date bug both showed
(already queued, unchanged). **Jeff's design call, queued:** the
RepPickerPopover format becomes the house pattern for EVERY
person-in-the-org selection control — replicate it wherever a person is
picked (task assignee, opportunity rep, etc.) as those surfaces get
touched. **Pass completed:** All 23 / Mine 5 observed after the fix (the strict
scope matching the dev org's known 5-owned + 18-unassigned split exactly),
then one lead assigned to Karen through the picker — Mine 5 → 6, holding
after a HARD refresh. Persistence confirmed at the browser, on top of the
integration pair that already pinned it at the endpoint. The four picker
entry points not individually clicked share the one module-scope component
and handler with the proven one.

**Third addendum: "Auto-assign all" was exposed to reps — role-gated.**
The pass's last find (Jeff, before signing off): the Distribute panel's
mass-assignment button rendered for Karen. Not cosmetic: the server honors
each individual PUT the button fires — reps may edit UNASSIGNED rows, that
is how claiming works — so one rep click legitimately scatters the whole
unassigned pool across the roster. Because every constituent write is
individually authorized, the gate is necessarily client-side: the button now
renders only when `canSeeAll` (the context's shared Admin/Manager predicate,
`canDistribute` prop through TriageView → DistributePanel). Pinned by a
source assertion in `tests/leads-scope.test.mjs` (gate present exactly once,
keyed on the SHARED predicate, not a re-derived role check) and a harness
mutation (`{canDistribute && (` → `{true && (`). 288 → **289** unit,
90 → **91/91** mutations, green baseline. **OBSERVED: the button is gone
for Karen after a hard refresh** (Jeff, same session). STANDING PRODUCT QUESTION, not
changed today: a rep can still assign an unassigned lead to ANOTHER rep
one-at-a-time through the picker — the server permits it by the same
unassigned-rows-are-editable rule. Whether claiming should be self-only for
reps is a policy decision for Jeff, queued.

**Fourth addendum: the shipping itself found a CI race.** The end-of-day
ship ("do it all") pushed `dev` and fast-forwarded `master` seconds apart —
and BOTH `cf35f51` runs went red on their integration job while gates and
unit stayed green, on a DOCS-ONLY diff whose code was green an hour
earlier. Observed: the two integration jobs started 2 seconds apart against
the one shared test database; the dev job died in 21 seconds; the job logs
are auth-gated (the exact first failing assertion is UNOBSERVED — recorded
as such). The mechanism is structural regardless: fixed org namespaces
isolate suites within a run, not two runs of the SAME suites from each
other — cross-run cleanup deletes the other run's seeds and identical
`(org, clerkUserId)` pairs collide (§18b25, one level up). Fix: the
integration job now carries a repo-wide `concurrency` group
(`integration-shared-test-db`, `cancel-in-progress: false`) so concurrent
runs queue; guide §18b25 gains the corollary and the recognition rule. The
fix's own shipping (another near-simultaneous dev+master push pair) is its
live test. Netlify deploys were never affected — both were content-verified
before this was found.

**Reported at close, NOT diagnosed: "Auto-assign all doesn't seem to
work"** (Jeff, 1 Sep, end of session — no repro details captured). Read the
click path before diagnosing anything. FIRST THING TO RULE OUT (an open
question, not a cause): the button's pool follows the Mine/All scope, and
under the new strict Mine the unassigned pool is empty BY CONSTRUCTION —
`unassigned.length === 0` hits the silent early return and the click does
nothing, with no feedback. If that is the whole story, the fix is a UX
decision (feed Distribute the unscoped list, disable the button with a
count of zero, or surface the early return) — the queued Distribute-in-Mine
question, now with teeth. If it is NOT the story, the candidates in the
click path are `l.raw?.id || l.id` (the scoped rows are norm()-mapped) and
the per-lead `saveLead` fan-out — read, do not guess.

### 0.58 The Distribute panel goes org-wide, and assignment becomes a managed action (2 Sep)

**The "Auto-assign all does nothing" report is DIAGNOSED, by reading — the
§0.57 rule-out was the whole story.** The click path has exactly one silent
exit: `unassigned.length === 0 || reps.length === 0` returns with no
feedback, and the panel received the SCOPE-FILTERED list, whose Mine branch
is `!!l.ownerId && l.ownerId === currentUserId` — an unassigned pool empty
BY CONSTRUCTION. The two named suspects were ruled out in the same reading:
`norm()` keeps `id` and `raw` pointing at the same DB row, so
`l.raw?.id || l.id` cannot diverge, and the `saveLead` fan-out reverts WITH
a visible error toast on any rejected write — in All scope there is no
silent path at all. Scope persistence (`tab:leads:scope` in localStorage)
is what armed it: an Admin who last left the tab in Mine keeps a
dead-looking button across sessions.

**Jeff's three calls (2 Sep, start of session):**

1. **The Distribute panel is a management surface and ignores the Mine/All
   toggle.** It now receives `allLeads` (the un-scoped list) — pool count,
   load bars, and Auto-assign all are org-wide regardless of scope. The
   scoped-list comment at the `leads` memo names the panel as the
   deliberate exception. The button also DISABLES with a visible reason
   ("No unassigned leads in the organization." / "No reps in the roster.")
   when the pool or roster is genuinely empty — the silent early return
   stays as a belt-and-braces guard but can no longer be reached by a
   normal click, and a dead button now says why it is dead.
2. **Lead assignment is Manager/Admin-only — reps do not assign at all,
   not even to themselves.** The §0.57 standing question is answered in the
   stricter direction: the rep-claims-by-editing-unassigned-rows rule is
   retired for the OWNERSHIP field specifically (reps may still edit
   unassigned rows otherwise, and still see them per the §0.53 policy
   toggle). In its place, a REQUEST flow: a rep requests an unassigned
   lead; a Manager/Admin approves (assigning the lead to the requester) or
   denies. Server enforcement plus schema/endpoint/UI land in the batches
   after this one — this entry records the decision.
3. The two-minute signed-in prod eyeball: Jeff runs it himself; result to
   be recorded when reported.

**Batch 1 shipped (this entry):** `DistributePanel` reads `allLeads`
(threaded as a new prop through TriageView), computes the pool once, and
renders the disabled-with-reason state. Client-only; no schema change; no
endpoint change. The `{canDistribute && (` gate and its §0.57 pins are
untouched (the source assertion still matches exactly once). Verified:
five static gates green, build 2,468 kB with bundle guard OK and `dist/`
cleared after (§19), **289/289 unit**, **43/43 integration**, **91/91
mutations, printed green baseline**. Browser pass for the batch is queued
with the rest of this session's UI work — one rep-path pass as Karen after
the request-flow UI lands, covering all of it.

**Batch 2 shipped — the server gate.** `leads.mjs` PUT now refuses any
ownership CHANGE from a non-`canSeeAll` caller: between `ownerIdForUpdate`
and the merge, when the payload mentions `assignedTo`, BOTH halves are
compared — the resolved owner id against `existing.ownerId` AND the
trimmed display-name string against `existing.assignedTo` — and either
differing is a 403. Two halves because they can disagree exactly once: a
name resolving to NOBODY on an unassigned row is `null === null` on the id
side while writing a label that makes the lead LOOK assigned (the spoof
the string half closes). Denied only on an actual change — LeadForm
spreads the stored row, so a rep's ordinary edit carrying an unchanged
`assignedTo` keeps working, as does any partial PUT that never mentions
the key (`change: false`). `assertOwnership` is untouched: it still
governs which ROWS a rep may edit; the gate governs one FIELD on them. The
row-level "unassigned is mutable by any writer" rule is now carved out for
the leads OWNERSHIP field only — noted at `leads.ownerId` in `schema.ts`;
tasks and the other tables are unchanged. POST is deliberately untouched
(a rep creating a lead still owns it via `ownerIdForWrite` — creating is
not assigning); open question recorded: a rep could POST a lead
pre-assigned to a colleague by name, same class as the §0.56 API-key
question. `public-api.mjs` read-checked: leads are GET-only there, no
bypass. Pinned by SEVEN new integration tests (`itest_leads_*`: refused
self-claim, refused assign-to-other, refused spoof label, refused
give-away/clear by the owner, allowed unchanged-spread edit, allowed
no-mention partial, Admin still assigns), two source assertions in
`tests/leads-scope.test.mjs` (whose stale "client-side by necessity"
rationale is rewritten — the client gate is now the UX half), and two
harness mutations (gate dropped, string half dropped). Verified: gates
green, build 2,468 kB + `dist/` cleared, **291/291 unit**, **50/50
integration**, **93/93 mutations, printed green baseline**.

**Batch 3 shipped — the request flow's table and endpoint.**
`lead_claim_requests` (schema.ts, after `leads`): `lcr_`-id PK, `orgId`,
`leadId`, `requesterId` (users.id, NOT NULL), `status`
pending|approved|denied, `note`, `resolvedBy`, `resolvedAt`, timestamps,
org index — additive and self-contained, no column on `leads` changes.
`lead-requests.mjs`: GET (reps their own via `requesterId === callerId` —
NOT NULL vs possibly-null caller can never match, fail closed; canSeeAll
the org's), POST (rep requests an UNASSIGNED lead: requester stamped from
`getCallerId`, NEVER the payload; 409 on owned lead or duplicate pending;
null caller 403), PUT approve/deny (requireRole Admin/Manager; approve
loads the requester row and stamps `ownerId` + `assignedTo` together,
denies sibling pending requests in the same stroke; owned-by-ANOTHER 409s
so the manager denies by hand; owned-by-the-REQUESTER proceeds — approve
is IDEMPOTENT across its own partial failure because the Neon HTTP driver
has no transaction across the two writes, and the lead is assigned FIRST
so a retry finishes the resolve instead of stranding), DELETE (a rep
cancels their OWN pending request; resolved rows are history). Audit
actions `lead.claim_requested` / `approved` / `denied`. The
ownership-registry scans now COVER the new endpoint (`lead-requests` added
to ENDPOINTS) and the `=== callerId` guard allowlists `.requesterId`
alongside `.ownerId` — both sides usr_-space, with the comment saying so.
Pinned by a TWELVE-test integration suite (`itest_lreq_*` namespace, its
own per-§18b25 prefix; registered in `test:int`), THREE source assertions
in `tests/lead-requests.test.mjs` (registered in SUITES by hand — nothing
guards that registration), and two harness mutations (role gate
discarded; requester taken from the payload — the second is caught by the
requesterId-never-read-from-payload assertion, which during development
caught its own trailing comment, working as designed). **Schema
application is SPLIT:** the DDL (idempotent `CREATE TABLE IF NOT EXISTS`
+ `CREATE INDEX IF NOT EXISTS`, mirroring schema.ts exactly — chosen over
`drizzle-kit push` to keep the shared-main drift surface at zero) is
APPLIED AND COLUMN-VERIFIED on the TEST database, but the APP database
(the shared dev+prod Neon main) write was BLOCKED by the session's
permission classifier — correctly treated as Jeff's action, queued: run
the same script (or paste the SQL into the Neon editor) BEFORE any deploy
of this code (§18c: schema per environment before the code that reads
it). Verified: gates green, build 2,468 kB + `dist/` cleared, **294/294
unit**, **62/62 integration**, **95/95 mutations, printed green
baseline**.

**Batch 4 shipped — the request flow's UI, both chairs.** All in
`LeadsTab.jsx`. Main component: `leadRequests` state fetched on mount
(canonical `res.ok → res.json() → adopt`; a failed list read leaves an
empty panel, nothing to revert) plus three server-first actions —
`requestLead` (`lcr_` + crypto.randomUUID, the house mint), 
`cancelRequest`, and `resolveRequest`, which on approve mirrors the
server's three writes locally (lead owner+name, the approved row, sibling
pendings flipped denied). **Rep chair:** the row assignee cell shows
"Request" / "✓ Requested" (toggle cancels) on unassigned leads instead of
"+ Assign"; the bulk-bar Assign entry point is not rendered; CockpitDetail
offers "Request assignment" / "Cancel request", its recommended-next-action
becomes "Request this lead" with a matching button label, and "Reassign"
on an owned lead is gone — a control the server would 403 is not offered
(the §0.57 gate lesson generalized). A rep needs no client-side identity
to find "their" pending request: their GET returns only their own, so any
pending row for the lead is theirs. **Manager chair:** new module-scope
`RequestsPanel` in the triage right rail (canSeeAll only, org-wide like
DistributePanel, hidden when nothing is pending) — requester avatar+name,
lead label, optional note, Approve/Deny. `canAssign={canSeeAll}` is
passed alongside `canDistribute` (same value; the pinned
`canDistribute={canSeeAll}` assertion stays untouched). Verified: gates
green, build 2,474 kB + `dist/` cleared, **294/294 unit**, **95/95
mutations, printed green baseline**. **The browser pass for the whole
§0.58 set is BLOCKED behind the app-DB DDL** (the shared Neon main has no
`lead_claim_requests` yet — Jeff's queued step): on localhost today the
panel GET would 500 into an empty panel and a Request click would toast
an error. One comprehensive two-chair pass (Karen requests → Admin
approves → Mine grows, holding over a hard refresh) is the queued
verification, after the DDL.

**Batch 5 shipped — the pool gets a way IN (Jeff's find, mid-pass).**
Setting up the two-chair pass, Jeff hit the gap: the org had no
unassigned leads and NO WAY TO MAKE ONE — LeadModal round-robins every
new lead to a rep with no unassigned option, and even a blank
`assignedTo` becomes caller-owned on the server (`ownerIdForWrite`'s
caller-owns-what-they-create). Worse, that round-robin ran for REPS,
auto-assigning their new leads to whichever COLLEAGUE had the fewest —
the create-side twin of the §0.58 hole. Four changes, one batch:
**(1) server CREATE gate** — a non-canSeeAll single POST naming anyone
but themselves is 403 (blank stays caller-owned; self-naming allowed);
closes the recorded rep-POSTs-pre-assigned question for the single path
(the bulk/import branch stays ungated, still recorded).
**(2) explicit-blank pool seed** — a canSeeAll POST whose payload
MENTIONS `assignedTo` and leaves it blank creates `ownerId` AND
`assignedTo` null (mention detection mirrors 18b13); an ABSENT key keeps
caller-owns, so API callers never change behavior. Side effect accepted
and preferred: a manager saving with zero reps configured now seeds the
pool instead of silently self-owning. **(3) LeadModal by chair** —
canSeeAll keeps round-robin plus a "◌ Leave unassigned" pick (sentinel
`__unassigned__`, surviving the `manualAssignee || routing` fallback
chain); a rep sees "New leads you create are yours — a manager can
reassign later", no routing, no picker, payload naming themselves.
**(4) RepPickerPopover gains optional `onClear`** — "◌ Unassign — return
to pool" on the row/bulk/Reassign pickers (canSeeAll-only by
construction; explicit blank is the server's 18b13 clear; local patch
nulls `ownerId` so scope and pool recompute without a refetch). Pinned
by FIVE new integration tests (refused colleague-naming, allowed
self-naming, rep blank caller-owned, admin explicit-blank pool seed,
admin absent-key caller-owned), two source assertions, one harness
mutation (CREATE gate dropped). Verified: gates green, build 2,476 kB +
`dist/` cleared, **296/296 unit**, **67/67 integration**, **96/96
mutations, printed green baseline**. The two-chair browser pass is now
actually RUNNABLE and remains the queued verification.

**Batch 6 shipped — what the pass found before it finished (Jeff, from
Karen's chair).** Three findings from the first minutes of the two-chair
pass, all fixed: **(1) THE ROW DELETE WAS A PHANTOM** — TriageView's 🗑
called `setLeads(filter)` and NOTHING ELSE: no server call, lead back on
refresh, the persistent-data rule violated in place, pre-existing and
invisible until someone watched a refresh. And it rendered for everyone
while the server's DELETE is `requireRole(Admin)` — reps and Managers
were offered a button whose real answer is 403. Now: Admin-only render,
and a `deleteLead` action that goes server-first (`dbWrite` DELETE → ok:
drop locally; fail: toast). **(2)** the rep's "Request" button stretched
across the whole Assignee grid column (grid children stretch by
default) — `justifySelf:'start'` pins it to content width. **(3) the
"Request not sent." toast was a DEAD FUNCTION, not a policy refusal** —
Jeff's `netlify dev` predated `lead-requests.mjs`, and the CLI's
functions-serve cache held a half-built bundle (CJS shim parsed as ESM
under `"type":"module"`; deleting the cache dir alone does NOT recover —
the running server keeps a dead registration and 500s ENOENT). Rule for
the guide: **a function added while `netlify dev` runs needs a dev-server
RESTART**, the §19 stale-serve trap's functions-side twin. Also noted:
Jeff's exploratory ↗ click converted the James Whitmore pool lead
(status Converted) — flip back via Change status when the pool test
resumes. Verified: gates green, build + `dist/` cleared, **296/296
unit**, **96/96 mutations, printed green baseline** (endpoints untouched
this batch; integration stands at 67/67 from Batch 5).

**OBSERVED, both chairs (Jeff, mid-session):** after the dev-server
restart the flow WORKS — Karen's Request landed, and Jeff's Admin rail
showed "Karen Russell wants James Whitmore" with Approve/Deny live. The
two screenshots cross-check the org math exactly: Admin sees 24 leads,
Karen sees 11 = her 10 + 1 unassigned — the rep GET filter doing its job
in production posture.

**Batch 7 shipped — three UX calls from Jeff, same session.** (1) The
Distribute panel gains a POOL ROW — dashed ◌ avatar, "Unassigned", count
— visible to reps (strict Mine hides pool leads by design, so this is
the signpost that they exist); clicking it jumps to All scope + the
Unassigned chip, where Request lives (`onShowUnassigned` →
`setStatusFilter` + `showAllScope` from the main component's
`setScopePersist`). (2) The bulk bar's Change status `window.prompt` is
RETIRED for `StatusPickerPopover` — the RepPickerPopover format applied
to `Object.keys(STATUS_STYLES)`, type-ahead filter, status dots; free
text into a status column was the same ghost factory as free text into
name resolution. Jeff's §0.57 house-pattern call now explicitly covers
enumerated choices, not only people. (3) RequestsPanel gains REVIEW —
opens the requested lead in Cockpit, request stays pending — which
surfaced and fixed a dormant bug: `openInCockpit(id)` had always
IGNORED its id (Cockpit opened on the top-scored lead no matter which
row was clicked). The id now rides `tab:leads:cockpitLead` — the exact
key ModalLayer's save-and-open path has been writing into the void —
and CockpitView consumes it once on mount, falling back to top-scored
when absent or not visible. Verified: gates green, build + `dist/`
cleared, **296/296 unit**, **96/96 mutations, printed green baseline**
(client-only; integration stands 67/67).

**THE TWO-CHAIR PASS IS COMPLETE — observed by Jeff, 2 Sep.** "Everything
works as designed and the retest works as well": the Batch 7 controls
verified (pool row, status picker, Review), and the full loop run
end-to-end — Karen requested the pool lead, Jeff approved from the
Admin rail, and the assignment "all processed correctly." That closes
the queued verification for the ENTIRE §0.58 set (Batches 1–7): the
Distribute fix, the server assignment gate, the request table/endpoint,
both chairs of the UI, the pool's ways in, and the pass's own findings.
Every §0.58 code change is now both suite-pinned AND browser-observed.
NOT yet done: the ship itself (eight commits local on `dev`, unpushed —
Jeff's call) and the prod signed-in eyeball carried from 1 Sep.

**SHIPPED, dev only (Jeff's call: "push dev only").** `dev` pushed at
`b61f65a`; the Tests workflow completed SUCCESS (checked via the public
runs API — no `gh` on this machine); accelerep.netlify.app verified
serving the new bundle by three content markers ("Assignment Requests",
"Leave unassigned", "return to pool") in `index-BzyfVzLl.js`. `master`
deliberately held back — prod keeps the old claiming behavior until Jeff
has lived with the request flow on dev. The prod signed-in eyeball stays
carried.

---

### 0.59 The SettingsTab cleanup pass begins — the audit actor, the autosave baseline, and the Reconcile read (2 Sep)

**The §0.54 queue, worked in order.**

**Audit actor attribution FIXED.** `users.mjs`'s local positional
`writeAudit` was fed `result.name` — the TARGET — as the actor name at
every call site (`user.created`, `user.updated`, `user.deleted`; `.cleared`
passed null), so every roster edit read as the subject acting on
themselves. The paired `user.role.changed` rows were always right because
`user-role.mjs` resolves `getCallerName(userId, orgId)` — all four sites
now do the same. Historical rows are left as they are: the log is
evidence, not something to rewrite.

**The autosave baseline CLOSES the §0.53 useSettings debt.** The autosave
effect fired on every settings OBJECT identity change — the load's own
mirror-back, roster refreshes, role saves — PUTting byte-identical
payloads: ~3 junk `settings.updated` audit rows per admin load (the ~9
across three role saves §0.54 observed) and a naked 403 toast for every
non-writer who changed nothing. Now one serializer (`serializeForSave`:
strip users + fiscalYearStart, strip key material, stringify) is used by
BOTH the autosave and a `lastSavedRef` baseline: both load paths adopt
what arrived as the baseline inside their setSettings updaters, the
effect skips when the serialized payload matches, and an accepted PUT
advances the baseline. A non-writer's 403 toast now fires only when they
genuinely edited something org-wide — at which point it is correct
feedback, not noise. (Known edge, accepted: a FAILED settings GET leaves
a null baseline, so the first edit PUTs the full local bootstrap state —
exactly the pre-guard behavior, no regression.)

**The Reconcile button is READ — no defect.** The §0.54 "UNREAD code
claiming 6-row drift": the on-load check POSTs `users-sync?check=true`
(the documented dry run, writes nothing), non-admins' 403 silently shows
no banner, and the banner renders only when created+updated+dbOnly > 0.
The claimed drift is REAL drift — §0.54's recorded dev-org role drift
(org_3B8Tg `member` ×2, the blob-only rows) is exactly what a dry-run
reconcile counts. Clicking Reconcile (or the rows' next writes) heals
it; the tool works as designed. Closed as read-and-verified, no code
change.

Pinned by `tests/settings-hygiene.test.mjs` (four resolved-caller sites
and the target-as-actor shape banned; the no-change guard, BOTH baseline
adoptions — losing one swallows the first post-load edit as baseline —
and the baseline advance), registered in SUITES by hand, plus two
harness mutations (actor reverts to target; guard dropped). Verified:
gates green, build + `dist/` cleared, **298/298 unit**, **67/67
integration**, **98/98 mutations, printed green baseline**. Still queued
from §0.54: the Security surfaces are DEMO-WARE — next entry.

**The Security surfaces are de-fabricated.** What the §0.54 "profile
Security card contradicts the list view" note turned out to cover: the
People surfaces derived "MFA" from `smsNotifications.enabled` — a
notification PREFERENCE exported, filtered, and scored as a security
fact — while the profile card hardcoded `MFA ● On`, `SSO Okta
Workforce ● On`, "Last password change 3 months ago" and "2 sessions —
macOS, iPhone" for EVERY user, the Security page rendered four
fabricated audit events with demo names ("Morgan Reyes") and a score
formula seeded at 70, and SEVEN controls did nothing (Run audit now,
Enforce MFA ×2, Nudge, and the kebab's Reset password / Enforce MFA /
Resend invite). Meanwhile `clerk-mfa-status.mjs` — real, Admin-gated,
live Clerk enrollment — was consumed by exactly one surface (the
security section's MfaDetail, which is the honest model this batch
copies). Now: the endpoint additionally returns `enrolledUsers`
(additive) so absence from BOTH lists is distinguishable as
not-a-Clerk-member; `UsersDetail` fetches it ONCE and derives a
tri-state `mfaByEmail` map (true/false/null-unknown) feeding the list
dots (●/○/dim-dash with titles), the "MFA off" chip and filter (unknown
is NOT "off"), the seats-rail counts, the CSV export column
(On/Off/Unknown), the profile card (real per-user MFA + one
"managed in Clerk" link tile replacing the three fabrications), and the
rebuilt Security page — enrollment ring (percentage or —/UNKNOWN),
three honest tiles, the not-enrolled list from Clerk's own records, and
recent events fetched from the REAL audit log (identity/config actions:
`user.*`, `settings.*`, apikey). Every dead control is REMOVED with a
comment naming the rule: a control that promises an action and does
nothing certifies. Verified: gates green (inline-component check clean —
the new closures render, they don't own controls), build + `dist/`
cleared, **298/298 unit**, **98/98 mutations, printed green baseline**
(client + one additive endpoint field; integration stands 67/67).
Browser pass for the People surfaces queued: as Admin, the list dots
and Security page against the known dev-org enrollment; the §0.53
non-writer toast's absence rides the same pass.

**And the "NaNyr ago" bug is dead** — `relAge` in LeadsTab appended
`'T12:00:00'` unconditionally, so the FULL ISO timestamps `createdAt`
actually carries built an invalid date and every timeline age rendered
NaN. Now: strings already carrying a `T` parse as-is, date-only strings
keep the noon anchor (timezone-roll protection), and an unparseable
input returns null instead of NaN-ing downstream. The same
`+'T12:00:00'` shape exists at ~20 other call sites [§0.60 counted: ~140] (App.jsx,
AccountsTab, FunnelView, …) — those feed DATE-ONLY columns today and are
correct, but nothing guards the assumption; `quarters.js` carries the
defensive `slice(0,10)` variant. Queued as a background sweep, not
chased now. Gates + 298 unit + 98 mutations green on the fix.

**Settings alphabetized (Jeff's call, closing the pass).** The tab row
sorts A→Z with 'All' pinned first (Dispatch, when enabled, sorts into
place instead of being spliced at position 5), and the cards inside
every tab — and search results — sort by name. The sort lives in
AdminView at RENDER time, not in catalogue.js: the catalogue stays
grouped by category for editing (its header now says so), and a new
item lands in the right display position without hand-ordering. Gates +
298 unit + 98 mutations green.

**SHIPPED (Jeff: "push"):** `dev` pushed `b61f65a` → `28a001c` (the
§0.59 set: audit actor, autosave baseline, Security de-fabrication,
NaNyr fix, alphabetization). CI completed SUCCESS on `28a001c`
(watched via the public runs API); accelerep.netlify.app verified on a
NEW bundle hash (`index-CfSKnvfz.js`) carrying this batch's markers
("managed in the Clerk dashboard") alongside the request-flow set's.
`master`/prod still deliberately held at the pre-§0.58 code.

**The dev-org role drift is CLOSED (Jeff + verifier, same session).**
`check-mirror-roles` before: 5 refused values across 3 orgs — the §0.54
residue. The Reconcile banner correctly showed NOTHING for the two
`member` COLUMN rows (`accelerep@yahoo.com`, `jeff.russell@ukg.com` in
org_3B8Tg): Clerk held no role at all for them, so the sync's dry run
had nothing to compare — Reconcile was never going to fix those, and
knowing why is the finding. The validated §0.54 path did: Jeff set both
to Sales Rep through the profile role select; `user-role.mjs` healed
Clerk publicMetadata + mirror column + blob together, VERIFIED by
re-running the read-only checker — 14 rows, **column drift ZERO**, one
finding left: `smiller@test.com`'s frozen blob copy (plus Jeff's
unflagged Admin/Technician blob split), both COSMETIC — nothing
authorizes on the blob (the flatten tests pin column-wins) and both
self-heal on those rows' next real write. Opening a profile and closing
it does NOT heal them (Save renders only when dirty — by design).
**The first two role saves were EATEN by the widened §19 functions
trap:** `user-role` — untouched all session — was serving the broken
ESM shim and 500'd both PUTs; "I saved and nothing changed" was a
serving problem, diagnosed by probing the URL before reading any code
(the guide rule, applied and then widened by this very case). After
the restart all seven relevant endpoints probed clean (user-role's 405
= parsed and executed) and the saves held through a hard refresh.

**Rep-role GET coverage for the §0.48 four — the read-side test debt is
CLOSED.** Twelve new integration tests, three per endpoint (accounts,
contacts, opportunities, tasks — leads got its block earlier this
session): rep sees own + unassigned and NEVER another rep's row; Admin
receives all three seeded rows; an unresolvable caller receives ONLY
unassigned (the 18b22 fail-closed direction — an owned row must not
match null === null). All ownerId-keyed, rows seeded with db.insert so
ownership is the test's input. Suite-specific shapes: contacts is
single-org, so its null caller is a GHOST x-test-user instead of an
org-B caller; tasks gained its FIRST user seed — appended last so every
earlier test still runs with the unresolvable caller it was written
for, `invalidateRoster()` clearing the 30s null-caller cache those
tests fill, and its cleanup now covers `users`; opportunities' Manager
`managedReps` branch is name-based by documented intent and stays
UNCOVERED here (visibility filter, tracked for the Phase-2 id
migration). 67 → **79/79 integration**; gates, **298/298 unit**,
**98/98 mutations, printed green baseline** all green.

**The §0.56 API-key question is CLOSED, in the safe direction, and
PINNED.** Read, not guessed: workspace API keys CANNOT reach any
mutating endpoint. Three facts compose it — (1) `public-api.mjs`, the
only key-authenticated surface, 405s every method but GET BEFORE the
key is even parsed (`spt_live_` + 64 hex, sha256 lookup, revocation
check, rate limit, org from the key row); (2) `verifyAuth` accepts
ONLY Clerk JWTs — no key branch, no fallback, so a key at any Tier-1
endpoint 401s out of `verifyToken`; (3) nothing else consults the
`apiKeys` table. So the overwrite-audit closures and the §0.58
assignment gates face Clerk-authenticated callers only. Pinned by
`tests/api-surface.test.mjs` (method gate strict AND positioned above
key extraction — anchored on the extraction CODE after the JSDoc
header's `spt_live_` mention false-failed the first run; verifyAuth
carries no key/keyHash reference; a directory scan proves only
api-keys.mjs and public-api.mjs touch the table, so a future consumer
fails the suite and forces a deliberate decision) plus one harness
mutation (method gate dropped). 298 → **301/301 unit**, **99/99
mutations, printed green baseline**.

**The two carried small items are CLOSED (session close-out).**
*documents.mjs local 500 — one probe, one install.* The §19-twin probe
rule found it instantly: `Cannot find module '@aws-sdk/client-s3'`. The
file's own header says to install the two R2 client packages; they
never were. Production worked ANYWAY because AWS Lambda's Node 18+
runtime ships SDK v3 — meaning prod rode an unpinned runtime SDK whose
checksum-default change is exactly the breakage the file's R2 NOTES
warn about. Both packages are now real pinned dependencies (^3.1124.0):
local resolves, prod becomes deterministic. Local re-probe rides the
next `netlify dev` restart (the running server's resolution is cached);
metadata CRUD never touches R2, and the r2() client is lazy, so absent
local R2_* env only gates the presign paths.
*The static-landing flash is gone.* The crawler landing lives inside
`#root` and stayed painted until 2.5 MB of bundle mounted. Now the
landing div carries `id="static-landing"`, a PARSER-BLOCKING classic
inline script right after `#root` hides it and shows a minimal
`#boot-splash` (warm-stone wordmark, also inside `#root` so the mount
replaces it) — it runs before first paint, so a JS browser never paints
the landing at all, while no-JS crawlers and categorization engines
never execute it and keep the full readable page. Nothing is removed
from the DOM; display toggles only. VERIFIED live on localhost
(landing/splash both replaced by the mounted login page) and in the
BUILT `dist/index.html` (Vite passes the inline script through — checked
before the §19 `rm -rf dist`). Picker-format replication stays a
standing as-surfaces-get-touched rule, not a queue item.

**FULL SHIP, post-handoff (Jeff: "lets get dev committed and then
commit master").** `dev` pushed `d8665b3` → `d5254b8` (the eight
close-out commits), CI SUCCESS; `master` fast-forwarded `d44a45b` →
`d5254b8` and pushed, CI SUCCESS — the serialized integration group
carried the near-simultaneous pair exactly as designed. BOTH deploys
content-verified: accelerep.netlify.app on `index-W-KRcHo9.js`,
salespipelinetracker.com on `index-uH-tB994.js` with the request-flow,
Security, and pool markers, the boot-splash landing, and `pk_live_`
inlined (the §19 second-face check). **PROD NOW RUNS THE ENTIRE §0.58 +
§0.59 SET: reps no longer claim directly — assignment goes through
managers, by design.**

**THE PROD EYEBALL IS DONE — carried since 1 Sep, retired (Jeff, signed
in as jeffrussell1@yahoo.com, UKG org, same session as the ship).**
URL bar and org switcher read first (§19): salespipelinetracker.com,
two orgs (UKG + Dispatch Demo Group), UKG chosen per the original
queue. Leads: Mine 0 / All 0 / unassigned 0, panel all zeros —
VERIFIED CORRECT by a read-only count (UKG holds 0 lead rows and 15
opportunities; the zeros are truthful emptiness, not a regression).
Settings → Security health, screenshot reviewed: the §0.59 rebuild live
on prod with REAL data — 0/6 enrolled ring, six real members with real
roles (no `member` residue, matching the verifier's clean read of this
org), amber ○ known-off dots throughout, "MFA policy — managed in
Clerk" chip, and Recent security events showing the org's ACTUAL audit
log ("1d ago · Jeff Russell · settings.updated") where the fabricated
demo names used to be. The green known-ON dot remains the one unsighted
tri-state everywhere — no account on either Clerk instance has a second
factor enrolled; Jeff enrolling one would light it.
(Jeff's screenshots, same session): amber ○ known-off dots in every MFA
cell of the test org's list, chip "MFA off · 4", rail "MFA on 0/4 ·
4 off" — real Clerk truth (nobody on the dev pk_test instance has a
second factor; the yahoo account's prod-instance MFA does not carry
over). The unknown state was observed earlier the same hour — dim
dashes and "unknown — Clerk not reachable" — while `clerk-mfa-status`
sat in the broken-shim state, which is also what proved the honest
label works. Known-ON (green ●) is the one state without a live
sighting: no dev-instance account is enrolled to produce it; the
integration path is identical to known-off (same map, same lists).

### 0.60 The date-pattern audit — ~140 sites, not ~20; the read side of the date contract; CSV dates normalised; the lost isoLocal queue found (1 Sep, third session)

**A note on the day.** §0.58, §0.59 and the handoff they closed with say
"2 Sep". Every commit in them — `775bb92` at 11:44 through `d5254b8` at 16:07
— carries a 1 Sep -0500 timestamp, the same calendar day as §0.56/§0.57. The
labels are wrong by one day; this entry uses the day git records and leaves
theirs as written (flagged, not silently corrected — Jeff's call whether to
rename the headers). The handoff's own advice stands: check content, never
dates.

**The audit §0.59 queued, run by reading every site.** The `+'T12:00:00'`
shape sits at ~140 call sites across `src/` and `netlify/functions/`, not the
~20 recorded (OpportunityModal 15, ReportsTab ~50, TasksTab 12, FunnelView 8,
App.jsx 6, KanbanView 4, five server functions 9, the rest spread over the
rails, panels and tabs). The schema settles which are safe: every column they
read is a `varchar(20)` date-only string written by an `<input type="date">`
or a server-side `today` — EXCEPT `leads.convertedAt`/`firstTouchDate`
(`varchar(30)`; the server writes a bare day, `sanitize()` passes a client
value through unvalidated) and the fallback chains that mix a date-only field
with a `createdAt` timestamp. Four sites were live or unguarded, all fixed:

- **The deal timeline** (`OpportunityModal`): a task with no due date fell to
  `t.createdAt` — a timestamp — which the sort noon-appended into an Invalid
  Date, a NaN comparator, and an unspecified order. `completedAt` in that chain
  is not a tasks column (`completedDate` is); the chain now reads
  `dueDate || completedDate || createdAt` through `parseLocalDate`.
- **Speed-to-lead and lead→opp velocity** (`ReportsTab`) on the two
  `varchar(30)` fields: read through `parseLocalDate`, unparseable rows
  contribute no sample. Safe today (the server writes `today`), unguarded
  before.
- **`avgDaysForStage`** read `stageHistory[].date || changedAt`. Nothing has
  ever written `changedAt` — `useOpportunities`, `KanbanView` and
  `_stage.mjs` all write `date` — so a dateless entry became
  `'' + 'T12:00:00'`. The dead fallback is gone; a dateless entry contributes
  no sample rather than a NaN one. The print report's `closeDate` cell read
  `new Date(closeDate)` — UTC midnight.
- **`TaskItem`** rendered `Due:` from `new Date(dueDate)` — UTC midnight, the
  previous evening everywhere west of Greenwich — and compared overdue against
  a `toISOString` "today" that rolls at 7pm Central. Both were named in the
  `dateLocal.js` header as observed damage; neither had been fixed. Now a
  `yyyy-mm-dd` string compare against `todayLocal()` and a
  `parseLocalDate` render. **Corrected in batch 2: `TaskItem` is imported by
  App.jsx and rendered NOWHERE** — the fix is real, no screen shows it, and
  "live" was written before checking the component was mounted (the dead-code
  finding below). Three live sites in this list, not four.

**The read side of the date contract has a home.** `dateLocal.js` gains
`parseLocalDate(v)` — a bare day reads at LOCAL noon, anything carrying a time
reads as-is, and it returns null rather than ever an Invalid Date, so callers
branch instead of propagating NaN — and `toLocalDay(v)`, a day as a CSV cell
might carry it normalised to `yyyy-mm-dd` or null: ISO and US numeric forms
are decoded by hand so a date-time suffix keeps the FILE's day rather than
UTC's, an impossible date (2/30) is refused rather than rolled into March the
way `new Date` would, and a bare run of digits is refused because
`new Date('46000')` is the year 46000, not an Excel serial. The ~130 correct
`+'T12:00:00'` sites are NOT churned — they feed date-only columns and are
right; guide **§18b26** is the rule for new code and for any fallback chain.

**The CSV importer passed dates through as written.** `mapCsvRows` →
`coerceCsvColumns` (`(v) => v || ''`) → `sanitize()` (`|| null`): no
normalisation on either side, so `9/15/2026` or Excel's
`2026-09-15 00:00:00` landed in `forecastedCloseDate`/`createdDate` verbatim
(both fit `varchar(20)`), and every consumer's noon-append made an Invalid
Date of that deal — days-in-stage NaN, `stale = NaN > 14` permanently false
(the never-stale bug arriving through the importer's front door, the exact
shape `_stage.mjs` was written to prevent), the quarter bucket "undated",
every `cd < today` string compare wrong. `importRows.js` now normalises both
cells through `toLocalDay`; an UNRECOGNISABLE cell still passes through
unchanged, because blanking it would erase a real date on overwrite with
nothing in the receipt to say so. **Open question:** refuse or flag it at
Preview (18b16 — a value the importer cannot use should be reported, not
carried). The import's own `today` — stamped on every created deal's
`createdDate` and `stageChangedDate` — was `toISOString`-built; now
`todayLocal()`.

**The lost queue.** The isoLocal batch fixed 4 of 29 `toISOString` local-day
sites and "triaged 24 into the handoff" — a handoff since overwritten, so the
list vanished and nothing carried it. 43 sites remain today. Storing wrong
dates: `SalesManagerTab` coaching notes (tomorrow's date after 7pm Central —
the batch's own worst example), `QuickLogFab` follow-up due dates,
`OutlookImportModal` activity dates, the CSV import's `today` (fixed above).
Comparing on wrong days: `TasksTab`'s calendar strings (`setHours(0)` then
`toISOString` — the previous day ALL DAY east of UTC, not just evenings),
`PipelineTab` quarter and week keys, `ListView`'s current quarter, `App.jsx`
reminder popups, `useCalendarState`, nine `ReportsTab` cutoffs. Correct as
they are: five export filenames (an instant is fine) and `stageClock.backdate`
(a deliberate UTC round trip on a UTC-parsed day).

**The sweep ran in the same session (batch 2).** 37 sites rewritten across 12
files — `SalesManagerTab` (the coaching-note STORE and its `todayStr`),
`QuickLogFab`, `OutlookImportModal`, `App.jsx`, `TasksTab` ×4, `PipelineTab`
×7, `ListView`, `useCalendarState` ×2, `ReportsTab` ×13, and the meeting-prep
"today" in `ViewingAccountPanel`/`ViewingContactPanel` — the last two found
by the pinning scan on its FIRST run, not by the hand count: 45 sites, not
43, which is the whole argument for a scan over a list. Eight remain by name
(five export filenames, `stageClock.backdate`, the `dateLocal.js` header)
and a self-check asserts the scan still matches the shape it guards.
Mutation: the coaching note reverting to a UTC day is caught by the scan.

**Found by the hash, not by reading: ten component files are imported by
App.jsx and rendered nowhere.** The build after the two panel edits carried
the SAME chunk hash and byte-identical content — md5 `e55b7734bcff` with the
edit stashed and with it applied — and a content hash cannot do that unless
the edited code is not in the bundle. It is not: `<ViewingAccountPanel`
appears in no JSX anywhere, and the same check on every default import in
App.jsx finds ten components no file renders — `ViewingContactPanel`,
`ViewingAccountPanel`, `ViewingTaskPanel`, `AccountModal`, `TaskModal`,
`ActivityModal` (rendered only inside the dead contact panel), `TaskItem`,
`AnalyticsDashboard`, `PipelinesSettingsPanel`, `LeadForm` — 4,160 lines,
each with a "replaced by …Rail" comment in ModalLayer or no reference at all.
Rollup tree-shakes them, so no user ever saw them; the gates still scan them
(`check:inline` counts them among its 114 files, the new scan among its
candidates), and this session "fixed" TaskItem before checking it was
mounted. The edits stand — the scan covers every file on disk, and a dead
file with the wrong shape would fail it — but the honest count above is
three live sites. Deleting the ten is Jeff's call (a background-task chip
exists); guide §18b26 gains the rule that came out of it.

Verified (both batches): five gates green · **317/317 unit** (+9 date-local
read side, +5 import-rows date cells, +2 the sweep scan and its self-check) ·
**105/105 mutations, printed green baseline** (+6: the NaNyr revert, the
UTC-midnight read, the 2/30 roll-over, the digit-run passthrough, the importer
passthrough, the coaching-note UTC revert) · build 2,480 kB JS, guard OK,
`dist/` and `node_modules/.vite` cleared · integration not re-run (no
endpoint changed) · a browser pass for the deal-timeline sort, the
coaching-note date and the Tasks calendar day keys is QUEUED (Karen and
Admin, after the next `netlify dev` restart, alongside the `documents`
re-probe).

**Shipped to dev (Jeff: "push dev").** `dev` pushed `56df8e2` → `7a84aeb` (three commits), CI SUCCESS on `7a84aeb`; accelerep.netlify.app serves `index-Ba_0HcTB.js`, downloaded and compared: md5 `e55b7734bcff`, identical to the local gate build, with exactly three UTC-day export-filename sites left in the bundle. `master`/prod unchanged — the fast-forward is the next decision.

### 0.61 The ten unmounted components deleted, and the documents re-probe closed (1 Sep, third session, continued)

**Jeff: "lets do 2 and 3."** The deletion ran in-session rather than through
the chip. Every reference to the ten was re-verified first: across `src/`,
`tests/`, `scripts/` and `netlify/` the only importers were App.jsx (all
ten), ReportsTab (AnalyticsDashboard) and ModalLayer (TaskModal, "kept for
legacy inline usage" — a comment on an import nothing used); no named
exports, no dynamic imports, no test touches them. Twelve import lines
removed, ten files deleted (4,160 lines), each importing file re-read from
disk and checked that the identifier survives only in comments ("TaskModal
replaced by TaskRail"). The edit script's first run refused on exactly that
comment and wrote nothing — the right failure. Gates: 133 files scanned
(was 143), `check:inline` 104 (was 114), **317/317 unit**, **105/105
mutations, printed green baseline**, build guard OK at **2,534.93 kB — the
same size to the hundredth of a kB** as before the deletion, with a
different hash (`index-DL-aftcV.js`): fewer import statements reorder
Rollup's module emission; the unchanged size is the proof the code was never
in the bundle. App.jsx still carries stale default imports for components
that ARE rendered elsewhere (CsvImportModal, the import modals,
OpportunityModal, UserModal, FunnelView, KanbanView, QuotaRepCard) — dead
imports of live files, cosmetic, left alone.

**The `documents` re-probe is CLOSED.** Jeff's fresh `netlify dev` answered
`GET /.netlify/functions/documents` with **401 `{"error":"Unauthorized: no
token"}`** — loaded, parsed, gated — where the previous server had thrown
`Cannot find module '@aws-sdk/client-s3'`. Sibling `leads` 401 as the
control. The §0.59 R2 dependency fix is verified on both sides now.

**Browser pass, Karen on localhost (pane-driven, 17:13 CDT — UTC still Sep 1,
so the 7pm rollover the sweep targets was NOT active; the zone edge is held by
the Chicago/Tokyo child processes in `date-local.test.mjs`, the pass verifies
rendering).** OBSERVED: Home "Tuesday, Sep 1"; Tasks header "TODAY IS TUE, SEP
1" and the calendar week strip Sun 30 → Sat 5 with Tue 1 as today (the swept
`isoLocal` day keys); Pipeline list quarter groups "Q4 2026 · CURRENT · Jul 1 –
Sep 30" (`todayLocal` → `quarterOf`); the deal modal "DEAL AGE 106d · IN STAGE
11d"; Reports → Leads **"AVG SPEED-TO-LEAD 157d · create → first touch"** — the
§0.60 `parseLocalDate` path over `firstTouchDate`, a number where the varchar(30)
read was unguarded — and "LEAD → OPP VELOCITY —" as the honest no-conversions
empty state; Reports → Performance "SALES CYCLE 167d"; zero `NaN`, zero `Invalid
Date`, zero console errors across Home, Tasks, Pipeline, Reports (the only
console errors were the pre-sign-in 401s). NOT OBSERVED, handed to Jeff on his
own screen: the deal modal's History timeline (the modal is wider than the
Browser pane and its tab row sits off-canvas; clicks at the computed position
did not switch tabs — a pane-width limitation, not a product defect; no task
without a due date exists in either Karen org, so the fixed sort branch needs
one created first), the coaching-note date (SalesManagerTab, Admin/Manager),
and the CSV import with a `9/15/2026` close date (Admin, needs a file upload
the pane cannot do). The pass ran on the post-deletion tree: the app booted
with the ten components gone.

### 0.62 Jeff's verification finds the label beside the sort, and a task no list can show (1 Sep, third session, continued)

**Jeff ran check (a) on dev:** a task with no due date on ZZTest Alpha
Renewal, then the History tab. The timeline SORTED — and the label beside the
task read **"Invalid Date"**. Batch 1 fixed the sort at the bottom of the
timeline builder and not the `fmtDate` helper twenty lines above it, which
still appended noon to whatever the item carried; for a dateless task that is
`createdAt`, an instant. The exact defect class §18b26 describes, one helper
away from the fix that named it. Now every date-label helper in
`OpportunityModal` (`fmtBandDate`, both `fmtDate`s, `fmtDateShort`) and the
timeline band (`allDates`, `pct`) read through `parseLocalDate`; the other
three helpers only ever received activity dates and were safe, but unguarded.
Nine `+'T12:00:00'` sites remain in the file, all on date-only columns
(`createdDate`, `stageChangedDate`, activity dates). Gates green, **317/317**,
**105/105, printed green baseline**, build guard OK. Lesson for the guide (written
into §18b26 the fourth session): when a fix names a fallback chain, grep the FILE for every other
reader of the same value before calling it fixed.

**Found by the same check: a task with no due date is invisible on the Tasks
tab.** The list view buckets open tasks into overdue / today / upcoming, all
keyed on `dueDate`; a dateless task matches none and is rendered nowhere
("Caught up. Nothing due." while the task exists and shows on the deal). The
Calendar view has an "Unscheduled" rail, but that is for tasks without a TIME,
not without a date. Pre-existing, not a regression; the form allows saving
without a due date, so the state is reachable. **Product decision, Jeff's:**
a "No due date" section in the list (the natural fix), or require a due date
on the form. Recorded, not changed.

**Jeff: "do option 1."** The list view gains a "No due date" section below
Coming up: `undatedItems` (open tasks with no `dueDate`, oldest first — the
longer one has sat undated, the more it needs a date), rendered in the same
grid as Coming up with "—" in the day column and "no date" where the time
would be, and a header hint "pick a date to schedule". Nothing else moves; the
three dated buckets are untouched. Gates green, **317/317**, **105/105, printed
green baseline**, build guard OK (2,482 kB). Browser: Jeff verifies on his own
account after the push — the dateless task is his, and the pane is signed in as
Karen, whose rep scope cannot see it.

**Also reported by Jeff, pre-existing:** the profile panel's header row
overflows its 420px width when the Clerk org switcher renders a long org
name for a two-org account ("Dispatch Demo Group"), pushing Sign out off the
right edge behind a horizontal scrollbar. `AppHeader.jsx`, untouched since the
email-signature commit. **FIXED (Jeff: "lets fix right after I do these
verifications"):** the header row gets `flexWrap: 'wrap'` and the identity block
`minWidth: 0` + `overflowWrap: 'anywhere'`, so the action group (Log · org
switcher · Sign out) drops to its own line when it does not fit beside the
identity. Verified in the pane on localhost as Karen: no org switcher renders
for her (one Clerk membership on the dev instance), so a 220px chip was injected
into the action group by script — the group wrapped below the identity (Sign out
y 102 → 164), everything inside the panel, `scrollWidth === clientWidth`, then
the chip was removed. Gates green, **317/317**, **105/105**, build guard OK.

**Dev landing, observed by Jeff (`80db3bf`, `index-Bo6TV6SC.js`): "landed
perfect."** Both screenshots: the "No due date" section listing his dateless
tasks (3 in one org, 1 in the other), and the profile panel fitting for the
short-named "Accelerep Test" org — the same panel that overflowed on prod for
"Dispatch Demo Group", which is the whole bug in two pictures.

**PROD SHIP (Jeff: "Lets push these").** `master` fast-forwarded `d5254b8` →
`13f9ffe` (the entire third session: §0.60, §0.61, §0.62), CI SUCCESS on
master; salespipelinetracker.com serves `index-NO9RJhjS.js` — `pk_live_`
inlined (the §19 second-face check), the panel-wrap and "pick a date to
schedule" markers present, exactly three UTC-day export-filename shapes, no
trace of the deleted components, and the same byte size as dev's
`index-Bo6oAQ7_.js` (2,541,310). Reps on prod now see: Tasks calendar keys and
quarter tabs on their own clock, dateless tasks in "No due date", timeline
labels that never read "Invalid Date", US-format CSV close dates as real
dates, and — for Jeff's two-org account — a profile panel that fits.
**Jeff, on prod, the Dispatch Demo Group account: "the dispatch demo fits."**
The bug he reported this morning is observed closed where he reported it.

### 0.63 The nine stale App.jsx imports dropped, and a test CSV for the importer (1–2 Sep, fourth session)

**The owed §18b26 bullet landed first** (`410095e`, docs only): grep the FILE
for every other reader of a value before calling a fix live. Writing it taught
what handoff §5.8 now carries — the worktree is CRLF only by
`core.autocrlf=true`, the index is LF throughout (App.jsx included), and two
scripting traps (a dollar-quote inside a String.replace replacement string; a
heredoc eating doubled backslashes) each corrupted the handoff once before the
re-read from disk caught it.

**Jeff: drop the stale App.jsx imports.** The nine default imports §0.60 left
in `App.jsx` for components that render elsewhere (CsvImportModal,
LeadImportModal, OutlookImportModal, LostReasonModal, OpportunityModal,
UserModal, FunnelView, KanbanView, QuotaRepCard) are removed — nine deletions
and nothing else. The script asserted each import line exactly once and the
identifier ABSENT from the file after removal, so a use hiding in a comment or
a JSX tag would have aborted it; the first version counted the binding and the
path on the same line and read two, which is not proof of anything. Gates
green on 133 files, **317/317**, **105/105, printed green baseline**, build
guard OK (2,482 kB, `index-wHucaxGK.js`), `dist/` and `.vite` cleared. No
rendered component changed, so the deploy is the check, not a browser pass.
**Dev landing (`7f14eb3`):** accelerep.netlify.app serves `index-wHucaxGK.js`, the
same hash as the local gate build. On dates: this session began the evening
of 1 Sep (`410095e`, 18:03 -0500) and finished the morning of 2 Sep
(`7f14eb3`, 10:49 -0500); Jeff's reply came overnight. The first cut of this
entry and of the handoff said "1 Sep" for both, corrected here.

**Test CSV for the unobserved importer check** delivered to Jeff
(`zztest-close-dates.csv`, not tracked): three ZZTest deals under "ZZTest
Import Co" with Close Dates `9/15/2026`, `2026-10-01` and
`2026-11-20 00:00:00`, row 1 also carrying `8/15/2026` as Created Date.
Expected after import: `2026-09-15`, `2026-10-01`, `2026-11-20`, and
created `2026-08-15`. **OBSERVED (Jeff: "imported the file"; read-only SELECT
on the shared DB, 2 Sep):** three rows under Jeff's org, created 2 Sep
21:07Z. Close dates stored `2026-09-15`, `2026-10-01`, `2026-11-20` — the
US-format, the ISO and the Excel-datetime cells all normalised. Row 1's
created_date is `2026-08-15` from its US-format cell; rows 2 and 3, blank in
the file, carry `2026-09-02`, the import day on the local clock. Stage,
account and sales rep (Jeff, the importer) as sent. The importer half of the
"still unobserved" pair is closed; the after-7pm coaching note remains.

### 0.64 Unreadable date cells are refused at Preview, and the engine's year 2001 (2 Sep, fourth session)

**Jeff: "lets do 1" — "refuse option."** The importer's open question from
§0.60 is closed. `mapCsvRows` refuses a row whose `type: 'day'` cell (Close
Date, Created Date — declared on the real field list in `CsvImportModal`,
pinned by a text-scan test because the suites cannot import React) is one
`toLocalDay` cannot read. The row is dropped with `reason: 'date'`, the field
label and the cell verbatim; the Preview banner gains a second sentence naming
each refused row ("row 3: "Sept 15" in Close Date") and the shapes to write
instead; the required-field sentence is byte-identical to before and pinned.
Refused rows reach the receipt as "not sent" through the existing `dropped`
count. The required check runs first, a blank cell is silence and not a bad
date, and only the first bad cell in a row is named. `csvDay`'s pass-through
in `importRows.js` stays as the fallback for any other caller.

**Found on the way, and worse than the open question:** the engine fallback in
`toLocalDay` fills a MISSING year as 2001. "Sept 15", "Oct 1" and "9/15" all
came back as real days in 2001 — plausible-looking, wrong by a quarter century,
and invisible to a refusal that only fires on null. The fallback is now behind
a four-digit-year gate, and the two-digit US shape ("9/15/26", Excel's default
short date, which the engine had been reading as 2026) is decoded by hand to
this century and pinned. Guide §18b26 gains the bullet.

**Verified:** gates green on 133 files, **336/336** (19 new: fifteen for the
mapping and banner, including the ZZTest-file-plus-"Sept 15" regression and
the field-list scan; three for the year gate and the two-digit year),
**114/114 mutations, printed green baseline** (nine new: the pass-through
re-opened, a blank cell refused, every field date-checked, the reason lost,
the cell unnamed, 0-based rows, Close Date no longer a day field, the year
2001 back, the two-digit year refused), build guard OK (2,483 kB,
`index-Bpb-wphy.js`), `dist/` and `.vite` cleared. **Browser, as Karen on
localhost** (the pane attached to the already-running `netlify dev`, which
served the edited source — checked by fetching `csvMapping.js` from it
first): a four-row CSV injected into the file input — Close Dates
`9/15/2026`, `Sept 15`, `9/15/26`, and `2026-10-01` with Created Date
`last week` — auto-mapped and reached Preview reading "2 of 4 rows ready to
import" above the banner **"⚠️ 2 of 4 rows will be refused — a date cannot be
read (row 3: "Sept 15" in Close Date; row 5: "last week" in Created Date).
Write dates as m/d/yyyy or yyyy-mm-dd and try again."**, the two survivors in
the sample table with the `9/15/26` row among them. Nothing was imported; the
page was reloaded at Preview. Jeff, watching the pane: "see it."
**Dev landing (`51202b4`):** accelerep.netlify.app serves `index-Bpb-wphy.js`, the
local gate build's hash.

**PROD SHIP (Jeff: "shipped to prod").** `master` fast-forwarded `13f9ffe` →
`d078c8f` (the whole fourth session: §0.63, §0.64 and their docs);
salespipelinetracker.com serves `index-DvbBtbWW.js` — the inlined key is
`pk_live_` where dev's is `pk_test_` (the §19 second-face check; each
bundle also carries Clerk's own `pk_live_`/`pk_test_` prefix constants once,
which is the one `pk_test_` a grep of prod finds), the refusal banner string
and the four-digit-year gate both present,
and the same byte size as dev's `index-Bpb-wphy.js` (2,542,302). Reps on
prod now see: a CSV row with an unreadable Close or Created Date refused at
Preview by row, field and cell; "Sept 15" no longer imports as 2001; Excel's
"9/15/26" still imports as 2026.

### 0.65 The app ignored Clerk's pending session state, so "Require MFA" did not lock sign-in — observed, then FIXED on both sides (2 Sep, fourth session)

**Jeff: "i enabled MFA on the UKG instance. It is still letting me log in
without it."** His screenshot of the Clerk Dashboard (Sales Pipeline Tracker →
Development → Multi-factor) shows what was enabled: the **SMS verification
code** strategy ON, Authenticator application OFF, Backup codes OFF, and
**"Require multi-factor authentication" OFF**. A strategy toggle makes MFA
available for a user to enrol; only the Require toggle forces it. So Clerk
letting him in is the configured behaviour, not a defect — the pane's Karen
session on the same Development instance reads `session.status` "active",
token `v` 2, `sts` "active", `twoFactorEnabled` false, consistent with an
optional policy and no enrolment.

**But the app could not honour Require if it were on — read in code, not yet
observed.** Clerk enforces Require by giving an un-enrolled sign-in a session
with `status: "pending"` and a `setup-mfa` task; the docs treat pending as
signed-out and the v2 token carries `sts: "pending"`. (1) `App.jsx` gates the
whole app on `useUser().user` (`if (!clerkUser)`), and in the installed SDK
`useUser` returns the raw user regardless of session status — only
`useAuth()` runs Clerk's `resolveAuthState`, which is where
`treatPendingAsSignedOut` turns a pending session into `isSignedIn: false`.
A pending session therefore passes the gate, `<SignIn />` unmounts, and the
`setup-mfa` task the component would render never appears. (2)
`verifyAuth` in `auth.mjs` uses `verifyToken`, which checks signature and
claims and never reads `sts`; Clerk's pending handling lives in
`authenticateRequest`/`getAuthObjectFromJwt`, which the app does not use.
So the API would serve a pending session too. (3) `MfaDetail.jsx` tells
admins "Require MFA in Clerk Dashboard to lock down sign-in" — a promise the
app cannot keep as built — and still carries a dead "Send reminders" button,
an unreachable `EnforceMfaModal` with fabricated counts ("22 users",
"kirim@accelerep.com"), and hardcoded "Allowed factors" tiles that now
contradict the real Development config (tiles say TOTP on / SMS off; Clerk
says SMS on / TOTP off).

**Queued, Jeff's call — do not turn Require on for Production until (1) and
(2) are fixed:** gate on `useAuth().isSignedIn` and keep `<SignIn />` (or
`TaskSetupMFA` / `RedirectToTasks`, both exported by clerk-react 5.61.9)
mounted while pending; refuse `payload.sts === 'pending'` in `verifyAuth`
with a mutant; fix the MfaDetail copy and remove its dead controls. To
observe the bug first: flip Require on the Development instance, sign in
fresh as Karen in the pane, read `Clerk.session.status`.

**OBSERVED (same hour).** Jeff turned on Authenticator application and
**Require multi-factor authentication** for the Development instance (second
screenshot: SMS on, Authenticator on, Backup codes off, Require ON). Karen
was signed out in the pane; the external `netlify dev` had died meanwhile,
so one was started from the launch config and served the current source. Jeff
signed in fresh as Karen: **"loaded straight through."** Read from the page
immediately after: `Clerk.session.status` **"pending"**, `currentTask`
**{ key: "setup-mfa" }**, `twoFactorEnabled` false, a v2 token WAS issued
with `sts: "pending"` and the org claim present, the app shell fully rendered
(nav, Home), and a direct `GET /.netlify/functions/opportunities` with that
token returned **200**. Both halves confirmed: the `useUser` gate lets the
pending session render the app, and `verifyAuth` serves it. Clerk did its
part — the task is there — and the app walked past it.

**FIXED (Jeff: "lets do it").** Three changes, one commit. (1) `App.jsx`:
`useAuth()` now also yields `isSignedIn`, and the user the app trusts is
`isSignedIn ? rawClerkUser : null` — every consumer (the gate, the settings
loader, the role effect) sees a pending session as signed out, and
`<SignIn />` stays mounted so Clerk renders the task inside it. (2)
`auth.mjs`: `pendingSessionRefusal(payload)`, exported and pure, refuses any
`sts` that is not "active" with a 401 naming the pending state; called right
after `verifyToken`, before the user lookup and before the cache; a token
without `sts` (v1) passes. (3) `MfaDetail.jsx` rewritten honest: the
unreachable `EnforceMfaModal` with its fabricated "22 users" /
"kirim@accelerep.com", the handler-less "Send reminders" button and the
hardcoded factor tiles are gone; the copy now says Require holds un-enrolled
users at sign-in "and this app honours that on both the sign-in screen and
the API", and the factors card says the app does not read that configuration.
New `tests/session-status.test.mjs` (six: the refusal on pending / active /
no claim / any other status, and two source scans pinning the wiring in
`verifyAuth` and in `App.jsx`). Gates green on 133 files, **342/342**,
**119/119 mutations, printed green baseline** (five new: the server bypass
back, "not pending" instead of "active or nothing", a v1 token refused, the
helper left uncalled, the client gate trusting `useUser` again), build guard
OK (2,479 kB, `index-Cy6ZeOFD.js`). Guide §18b27.

**Observed — the same pending Karen session, Development, Require on.** After
HMR the page rendered Clerk's **"Set up two-step verification — SMS code /
Authenticator application — Signed in as accelerep@outlook.com"** inside the
sign-in card: `session.status` still "pending", `currentTask` setup-mfa, no
app nav. The pending token against `opportunities`, `settings` and
`clerk-mfa-status` returned **401 "Unauthorized: session pending — finish
sign-in (multi-factor setup) first"** where the same call had returned 200
an hour earlier. Not browser-checked: the rewritten MFA panel itself
(Admin-gated; Karen is a rep) — Jeff eyeballs it as Admin. Carried:
`catalogue.js`'s MFA entry still hardcodes "Optional · not all enrolled" and
"3 months ago".

**Jeff's screenshot while this was being committed — two sightings.** (1)
accelerep.netlify.app at `#/tasks/setup-mfa`, signed in as Jeff (Admin, MFA
dot ○), the Users list fully rendered: Clerk's hash router had sent his
pending session to its task URL and the DEPLOYED dev build — still the code
before this fix — rendered the app over it. The bypass, seen a second way,
on the deployed site, by an Admin. Closed by this commit's deploy. (2)
Karen's row: MFA **●** green, the rail "MFA on 1/4 · 3 off" — Jeff enrolled
her authenticator, and **the known-ON state, unsighted since §0.59, is
observed.** Karen's pane session is therefore no longer pending; the pane is
usable again after a fresh sign-in.

**Dev landing (`ded3271`):** accelerep.netlify.app serves `index-Cy6ZeOFD.js`, the
local gate build's hash, with the pending refusal string in it. From here a
pending sign-in on the deployed dev site is held at Clerk's task card and its
token is refused by the API.

**Jeff's next screenshot — the half-deployed state, and it is evidence.**
accelerep.netlify.app at `#/tasks/setup-mfa`, his still-pending Admin
session, the tab NOT refreshed since the deploy: the OLD client bundle (Send
reminders, factor tiles, the app rendered over a pending session) against the
NEW functions. The MFA panel's error line reads, verbatim, **"Unauthorized:
session pending — finish sign-in (multi-factor setup) first"** — the server
refusal observed on the deployed dev site for a pending Admin. A refresh
loads `index-Cy6ZeOFD.js` and the client gate holds him at the task card.

**Found by the same screenshot, carried:** the red banner **"Database
connection lost — changes may not be saving"** over a 401. `App.jsx`'s
`checkOk` sets `dbOffline` on ANY non-ok response, so an auth refusal is
reported as a database outage — the wrong layer (18b22). Reachable only by
an old client against a new server, or a session that goes pending mid-use;
still a misdiagnosis on the user's screen. Not changed this session.

**Jeff: "I used sms MFA to login."** He refreshed, was held at Clerk's task
card on the deployed dev site, enrolled the SMS factor, and came through as
Admin — the full Require path end to end on accelerep.netlify.app. His
screenshot is the REWRITTEN panel with real numbers: "✓ 2/4 enrolled · 50%",
Enrollment by role Admin 1/1 Complete · User 1/2 · Technician 0/1, Not yet
enrolled listing smiller@test.com and ryanalgie@gmail.com, the info callout
carrying the new sentence "this app honours that on both the sign-in screen
and the API", the warn callout "2 users haven't set up a second factor. Turn
on Require multi-factor authentication in Clerk Dashboard to hold them at
sign-in until they do." with its single Open Clerk Dashboard button, and the
Allowed factors card as prose with a link. No Enforce modal, no Send
reminders, no factor tiles. The URL still reads `#/tasks/setup-mfa`: Clerk's
hash router leaves the task path in place after the task completes; the app
has no hash routing of its own, so it is inert — noted, not changed.

**PROD SHIP (Jeff: "lets ship dev to prod").** `master` fast-forwarded
`d078c8f` → `abb239a` by `git push origin dev:master` (no branch switch;
ancestor check first); salespipelinetracker.com serves `index-kU7R9Yoq.js` —
the inlined key `pk_live_` (dev's is `pk_test_`), the rewritten panel's
copy present, 2,538,098 bytes — the same size as dev's `index-Cy6ZeOFD.js`.
The client gate is in that bundle; the server refusal ships in the same
commit's functions and was NOT probed on prod (it needs a pending prod
token, and Require is off there). Require can go on for the Production
instance — Jeff's call; the first un-enrolled prod sign-in after that is the
live proof. **Jeff: "I marked those deals closed lost — does that show?"** Read-only:
the audit log has four `update` rows by Jeff at 23:45–23:46Z, "Closed Lost:
Timing", for ZZTest Alpha / Bravo / Charlie / Delta — and those four rows are
Closed Lost with `lost_category` "Timing", `lost_date` 2026-09-02,
`lost_reason` null (no free text was typed). Saved correctly. They are NOT
the three CSV deals (ZZTest Close US / ISO / Excel), which are untouched.
**"What instance are they in?"** Resolved by looking each `org_id` up
against the Development Clerk instance with the local `sk_test_` key:
`org_…Tf0LK` = Development, org **"Accelerep Test"** (51 deals; the four
closed ones, Karen's org); `org_…WNwU` = Development, org **"UKG"** (3
deals: the CSV imports; members yahoo, outlook, ukg); `org_…K8UD` = not on
Development, so **Production** (15 deals — the prod UKG org of §0.59). **Two
orgs are named UKG, one per instance**; "the UKG instance" earlier meant the
Development instance's UKG org. The shared database holds all three side by
side, separated only by `org_id`.

**Jeff turned Require on for Production and signed in: "worked in
production."** The Require path is observed on both instances; the server
refusal on prod is implied by the sign-in being held (the app cannot render
without an active session now), not separately probed.

### 0.66 The Win / loss report read the notes instead of the category, and the closing entry instead of the stage it left (2 Sep, fourth session)

**Jeff: "why we lost is important as it is supposed to be feeding this
report."** His screenshot — Reports → Win / loss analysis, Accelerep Test on
dev: "Why we lost · Other · 5 · 100%", "Biggest leak: 100% of losses (other)",
"Losses by stage exited — No stage history data on lost deals". A read-only
SELECT of the same five deals: every one carries `lost_category` (Timing ×4,
Competitor ×1), `lost_reason` null, and a `stage_history` ending in a
Closed Lost entry with `prevStage`. The data was right; the report read the
wrong field, twice.

(1) Three surfaces read `o.lostReason || o.closedLostReason || 'Other'`: the
free-text notes, then a field nothing has ever written (grep: zero writers),
then the default. `completeLostSave` stores the picker in `lostCategory`
and the notes in `lostReason`; notes are usually empty. (2) Two surfaces took
the last history entry's `.stage` as the stage exited and then excluded
'Closed Lost' — but that entry IS the move into Closed Lost; the stage it left
is its `prevStage`. So the table was empty for every org that had losses,
and "Stage changes this week" drew "Closed Lost → Closed Lost". (3) The
exit-stage row order was a hardcoded list with no "Evaluation (Demo)". (4)
Three more displays — Recent losses, and the Activity History timeline's lost
events (two builders) — subtitled with the notes alone.

**Fixed:** `src/utils/lossAnalysis.js`, pure: `lossBucketOf(o, fallback)`
(category, else notes, else the caller's word), `exitStageOf(o)` (the closing
entry's prevStage; a non-closing last entry's stage; no history → the current
stage unless closed), `previousStageOf(o)`, `lostByStageRowsOf(lost,
order)` (ordered by the org's `settings.funnelStages`, else the default
stage list; a stage outside the order still shows, after them). Every reader
in ReportsTab goes through it — eight sites — and a source scan pins that no
bare `o.lostReason ||`, `{o.lostReason}` or `history[…]?.stage` read
remains and that `closedLostReason` is gone. The competitor heuristic ("Lost
to X" parsed from the notes) is unchanged. `tests/loss-analysis.test.mjs`
(15, built on the five real rows: Timing ×4 / Competitor ×1, exit stages
Qualification ×4 / Proposal ×1). Gates green on 134 files, **357/357**,
**125/125 mutations, printed green baseline** (six new), build guard OK
(2,479 kB, `index-CzGO2ggA.js`). **Not browser-checked here:** the five lost
deals are Jeff's, so Karen's rep scope shows none of them; Jeff eyeballs the
report as Admin after the deploy — expected: Timing 4 · 80%, Competitor 1 ·
20%, exit-stage rows Qualification 4 and Proposal 1, and the Performance
tab's "Why deals are lost" the same split.

**Carried, found on the way:** ReportsTab line 78 hardcodes `stages =
['Prospecting','Qualified','Demo','Proposal','Negotiation',…]` for the
Performance tab's "Stage conversion", and the funnel deep-dive falls back to
`['Prospecting','Qualification','Discovery','Proposal','Negotiation','Closing']`
— neither is the app's stage list (Qualification, Discovery, Evaluation
(Demo), Proposal, Negotiation/Review, Contracts). The funnel uses
`settings.funnelStages` when set; the Performance tab never does. Not
changed this session.

**Dev landing (`7c6a432`):** accelerep.netlify.app serves `index-CzGO2ggA.js`,
the local gate build's hash, 55 seconds after the push. Jeff's eyeball as
Admin is the observation.

### 0.67 The Activity report ignored the Rep / Team / Territory slice — "Total activities 23" for every rep (2 Sep, fourth session)

**Jeff: "I noticed activited logged (23) stays the same as I use the filter
to select different reps. This should just reflect all or a specific reps
activities."** His screenshot: Reports → Activity, grouped by Rep, Savannah
Miller selected, Total activities 23, the same as with no rep. In ReportsTab
the slice selectors (`reportsRep` / `reportsTeam` / `reportsTerritory`)
are applied to opportunities through `reportsOpps` — and to nothing else.
`reportsTimedActivities`, which every Activity-tab number is built from,
started from `roleFilteredActivities`, the role gate alone. The Performance
tab's activity mix and the Activity KPI comparison read the same unsliced
list. (The Performance leaderboard already resolved the slice to a set of rep
names through `settings.users`; the activity side never did.)

**Fixed:** `src/utils/reportScope.js`, pure: `activityRepOf(a)` (the
`rep || salesRep || assignedTo || author` chain the reports already use),
`repsForSlice(slice, users)` (rep → that name; team / territory → the names
of the org's users on it; nothing → null), `sliceActivities(activities,
slice, users)` (no slice → the input untouched; under a slice an activity
with no rep belongs to nobody selected). ReportsTab derives
`reportsActivities` from it and `reportsTimedActivities`, the Performance
activity mix and the KPI comparison start there. `tests/report-scope.test.mjs`
(10, including the wiring pinned as text). Gates green on 135 files,
**367/367**, **129/129 mutations, printed green baseline** (four new: the
slice ignored, a team slice selecting every named user, a rep-less activity
passing a slice, the timed set starting from the role-gated list again),
build guard OK (2,480 kB, `index-Dv_RGDzl.js`). **Not browser-checked
here:** the slice selectors are Admin/Manager-only and the pane's Karen is a
rep; Jeff eyeballs after the deploy — expected: Total activities changes as
the rep changes, and "All" restores the full count.

**Dev landing (`e39c57d`):** accelerep.netlify.app serves `index-Dv_RGDzl.js`,
the local gate build's hash, 41 seconds after the push.

### 0.68 The Reports tab audit — the triage list, nothing fixed yet (2 Sep, fourth session)

**Jeff: "would you go through the reports tab and see if you can identify any
other errors."** Six read-only passes over `ReportsTab.jsx` (6,755 lines,
split by range), each briefed with the bug classes §0.66/§0.67 had just
shown (a field read that is never written, a dataset that skips the slice or
the period, a fabricated constant, a hardcoded stage list, a day/instant mix,
a control with no handler). Every item marked **V** below was re-read from
the source by the session before being written here; items marked **R** are
reader findings whose class was confirmed but whose lines were not re-read.
Line numbers are as of `e39c57d`. **This is the list that must not be lost**
(§18b26): fix in the order below, each batch its own commit.

**Tier 1 — the numbers are wrong for everyone, or it crashes / corrupts.**
1. **V** Fiscal period math. `getFiscalQRanges` (L181–198) puts every
   quarter in `baseYear − 1` whenever `startMonth >= fiscalStart`; with the
   app default `fiscalYearStart: 1` that is every quarter, so "FY 2026" and
   Q1–Q4 return **2025** data. The comparison helper `getFQR` (L319–333)
   uses the opposite convention (year of start), so "vs previous quarter /
   year" compares mismatched years and often an empty range. `src/utils/
   quarters.js` (`quarterRange`, `quarterOf`) already implements the house
   convention and is not used here. Fix: one helper, from quarters.js.
2. **V** `comparedOpps` (L370) starts from `roleFilteredOpps`, never the
   slice — every "vs previous" delta on every tab compares one rep's period
   against the whole team's prior period.
3. **V** Pipeline & Forecast quota is the literal **$175,000** (L924):
   `settings.quotaData.quarterlyQuota` is never written, `u.quota` is never
   sent by any UI. Attainment ring, "gap to quota" and "coverage" all follow.
4. **V** "Forecast accuracy" is fabricated: `fc: actual, ac: actual, att: 1.0`
   (L1050) — the two lines coincide and every point reads 100%; the windows
   are rolling 3-month spans labelled as quarters (L1037–1049) and drawn from
   the period-filtered set, so a quarter filter erases the history.
5. **V** Stage conversion funnel's `stageOrder` (L974) is
   `['Prospecting','Qualification','Discovery','Proposal','Negotiation','Closing','Closed Won']`
   — three names that do not exist, three real stages missing; a deal in
   Evaluation (Demo), Negotiation/Review, Contracts or Closed Lost ranks −1
   and is bucketed as "Prospecting" (L985–992). Same class: L84 (`stages`,
   dead print path), L2914 (funnel fallback), L6083 (history track fallback),
   L2708 (`stageColorMap`), L926/928/1377/2741 (commit fallback lists).
6. **V** Deals at risk (L1020–1029): `o.nextStep` is never written (column
   is `nextSteps`) so every open deal is flagged "No next step"; staleness
   reads raw `activities`, bypassing role gate and slice.
7. **V** Pipeline movement, last 7 days: "Lost" is the literal `value:0`
   (L1113); "Slipped" is every past-due open deal ever (L939); "Won" and
   "Carried over" use all-time won revenue (L1106–1112).
8. **V** Performance: annual quota divided into period revenue (L1362–1365;
   a quarter shows ~¼ attainment); activity ratio is all-time activities over
   period-scoped open deals, and a rep with no open deals shows the raw count
   as "340.00×" (L1576–1578); reps with only Q2–Q4 quotas drop (L1359).
9. **V** Activity tab: prior-period activities are `totalActs * 0.91`
   (L1849) — every delta reads ≈ +9.9%; "Per rep" divides by reps who logged
   something (L1776); the heatmap is period-clipped to the last 14 calendar
   days (a past quarter shows all zeros and flags every rep, L1933); the
   coaching flag fires on three zero weekdays and can never name a rep with
   no activity at all (L1794/1933).
10. **V** Leads tab never receives the slice (L268) — the exact §0.67 bug,
    still present for leads; score bands: code buckets Cold <30 / Cool
    30–49 (L2110–2113) while labels read "Cold (0–39)" / "Cool (40–49)"
    (L2333–2336).
11. **V** Saved reports (`SavedReportsTab`) get `reportsOpps` and raw
    `activities` (L2484–2486): no period filter anywhere in six templates,
    and the activity reads bypass the role gate and slice (a User can pick
    any rep in the scorecard and see their activity mix, L3605/3615).
    Win/loss "+3% vs prev period" is a literal (L3497). The competitor parse
    creates the map entry only when `comp.length < 40` but increments it
    whenever `comp` is truthy (L3463–3465) — a long "lost to …" note throws
    and blanks the report. Quota pacing divides gated revenue by the whole
    org's quota (L2607–2612). Quarter buckets end at 00:00 on the last day
    while deals sit at noon, so quarter-end closes fall in no quarter
    (L3220/L3231). "Closing next 30 days" has no lower bound and counts
    every overdue deal (L2623). The funnel's max-stage ignores `prevStage`
    (L2921–2931) — the §0.66 defect, one panel over from where it was fixed.
    All six "+ Save as my report" buttons have no `onClick` (L2779, 3003,
    3273, 3490, 3707, 3991).
12. **V** Create report: the blank builder's preview is
    `[85,72,64,51,38]` bars labelled `$850K…` against real user names
    (L4589–4596); the entry button sets `builderTab('data')` where the tabs
    compare `'Data'` (L4745 vs L4643) so the rail opens blank; "Duplicate"
    lists the four pinned cards as "by {viewer} · updated Today" (L4334);
    the stuck-deals total sums only the top 8 rows (L4383–4387); a rep with
    no open deals renders "NaN%" (L3647–3650).
13. **V** Activity History: `selectedOpp.products.map` on a text column —
    **TypeError for any deal with products** (L6434); the three toolbar
    buttons dereference `selectedOpp` above the `!selectedOpp` guard
    (L6256–6274 vs L6292); "Add contact" PUTs `contacts: mergedNames` — an
    **array into the text column** every other reader splits on commas
    (L6496–6500); won/lost events are dated by `updatedAt` because
    `closedAt`/`closeDate` do not exist (L5416); every activity is "by
    Rep" because `createdBy`/`rep` do not exist and `author` is not read
    (L6100); account linkage compares name fields activities and tasks do
    not have (L5376/5395), so activities logged on an account with no deal
    never appear; the tab receives raw `opportunities`/`activities`/`tasks`
    (L2465–2476).
14. **V** Actions report: `const json = await dbFetch(...); setData(json)`
    (L4817) stores the Response object; `data.summary` is always undefined,
    so it reads "No actions logged yet" forever. The twin of the bug fixed
    at L69–76 of the same file; `check:dbfetch` does not catch an assigned
    Response.

**Tier 2 — misleading labels, fabricated trims, dead controls (R unless
marked).** Pinned-card "LIVE" sparklines are the headline × fixed
coefficients (L2627–2630). "vs previous period" captions with no comparison
(L3018, L3282). Quarterly quotas flattened to annual/4 (L3190, L3677).
"Forecast" in Forecast-vs-actual is the quota (L3226). Cycle time everywhere
is `forecastedCloseDate − createdDate` — the forecast, not the close;
`lostDate` exists and `wonDate` has a column but no client writer (L1381,
1410, 3428, 3631). Territory coverage: "avg per territory" over all deals
while the heatmap counts mapped ones (L3938); `settings.__accountsRef` is
written nowhere (L3944); `o.territory` is shadowed by the rep's territory
(L3898). AI builder: every prompt yields the stuck-deals chart with an
invented interpretation (L4370–4407); Regenerate/Refine inert (L4424).
History: PDF export interpolates notes unescaped into `document.write`
(L5859–5881); "Email to owner" mails a display name (L6265); "Showing N of N"
(L5683); "/ mo avg" divides all-time by 12 (L5979); hardcoded "Active
customer" / "warm" / "Active" status values (L6340, L6610, L5716);
`t.completedAt`/`t.notes` do not exist (L5399/5401). Actions report and
Opportunity picker let a Manager see the whole org (L4807, L6068). Rep list
`repsListSC` unsorted, undeduped, includes ReadOnly (L3605). `.slice(0,8)` /
`.slice(0,10)` / `.slice(0,12)` truncations with no "of N" (L1794, L2428,
L6226). "Team" slice button is a no-op for Managers (L809). Export label
map names sub-tabs that no longer exist (L886). `actPeriod` /
`commissionReportFilter` state nothing reads (L62–63). Lines 451–707 (the
print report) are unreachable: `handlePrintReport` and `ReportBtn` have no
caller; `byStage`, `revenueByQuarter`, `monthlyData`, `topAccounts` feed
only that path.

**Fields read in this file that no writer sets anywhere** (grep of `src/`
and `netlify/`): on opportunities `closeDate`, `closedAt`, `revenue`,
`competitor`, `assignedTo`, `accountOwner`, `name`, `rep`, `nextStep`,
`nextStepDate`, `verticalMarket`; on activities `rep`, `assignedTo`,
`createdBy`, `companyName`, `accountName`, `contact`, `contactName`
(`salesRep` is set client-side by QuickLogFab and dropped by
`activities.mjs`); on tasks `completedAt`, `notes`, `owner`, `salesRep`;
on leads `salesRep`; on accounts `warmthStatus`, `status`, `employees`,
`csm`; on contacts `lastTouch`, `activities`, `engagement`,
`opportunityId`; `settings.quotaData.quarterlyQuota`,
`settings.__accountsRef`, `u.quota`. Reading these is what made every
categorised loss "Other" in §0.66; the same reads are why "by Rep", "No next
step", "Active customer" and "last touch —" are on screen now.

**Recommended order:** (1) period + comparison math via quarters.js, with
tests under two `fiscalYearStart` values; (2) the two crashes, the contacts
array write, the Actions fetch; (3) scoping — `comparedOpps`, leads, both
sub-tabs' raw arrays, the scorecard rep list; (4) every fabricated constant
removed or replaced (175000, 0.91, +3%, att 1.0, builder bars, sparklines,
0.28); (5) stage lists from `settings.funnelStages` with `defaultStages`
fallback, and cycle time from `lostDate` / the closing history entry, with
`wonDate` written on Closed Won; (6) dead controls wired or removed. Each
batch pure-helper + tests + mutants, as §0.66/§0.67 were done.

### 0.69 Audit batch 1 — the period and comparison windows (2 Sep, fourth session)

**Jeff: "please proceed top down."** §0.68 tier 1 items 1 and 2, plus the
UTC-day slice the period filters applied to instants. `src/utils/
reportPeriod.js`, pure, built on `quarters.js` (fiscal year = the calendar
year it ENDS in, the convention the Pipeline list and Home already use):
`currentFiscalYear`, `fiscalRange(fy, 'Q1'..'Q4'|'FY')`, `periodRange`
('all' → null, 'custom' → the user's bounds with open ends allowed),
`priorRange` (previous quarter: Qn → Q(n−1), Q1 → Q4 of the year before, FY
→ the year before, custom → the equal-length window ending the day before;
previous year: the same key a fiscal year earlier, custom shifted a year;
**'All time' → null — no more comparing everything against a 90-day slice**),
`dayOf` (a day as written; an instant on the LOCAL clock via
`parseLocalDate`, not `.slice(0,10)`), `inRange` (inclusive, open ends, an
empty day never inside). ReportsTab's four hand-rolled builders (three
identical period ones and the opposite-convention comparison one) are gone:
`reportRange` and `priorRangeR` are computed once, the deal / activity /
lead sets filter through `dayOf` + `inRange`, and **`comparedOpps` now
starts from `reportsOpps` (the sliced set)**, so a rep's period is compared
with that rep's prior period. `fiscalStart` is `parseInt(settings.
fiscalYearStart) || 10`, the App.jsx / HomeTab convention (the reports used
`|| 10` without parseInt). The period dropdown's "FY" label now names the
fiscal year, not the calendar year.

What a user sees change: under the default January fiscal start, "FY 2026" and
Q1–Q4 show **2026** data (they showed 2025); every "vs previous quarter / year"
delta compares the right years and the right rep; with "All Time" selected the
deltas disappear instead of reading a meaningless large positive number; an
activity logged after ~7pm Central lands in the day it was logged, not the
next.

`tests/report-period.test.mjs` (13, every case under both a January and an
October start — 18b18; the REGRESSION cases are the year-off FY and the Q1 →
prior-year Q4). Gates green on 136 files, **380/380**, **135/135 mutations,
printed green baseline** (seven new: the year named by its start, Q1's prior
quarter in the same year, the fake 90-day baseline, `dayOf` slicing UTC,
`inRange` admitting an empty day — that one SURVIVED the first run because
the test only used a range with a `from`; the open-start case was added and
it is caught — the comparison baseline unsliced, the timed activity set
unsliced), build guard OK (2,478 kB, `index-CprJulHE.js`). One slip on the
way: the span replacement that removed the old deal-period block also
swallowed the `reportsActivities` line between the two markers; the §0.67
scan test caught it before anything ran, and it was restored. **Not
browser-checked here** (the pane's Karen session needs her second factor);
Jeff eyeballs after the deploy: Reports → Pipeline & Forecast with FY 2026
and Q3 selected should show this year's deals, and "All Time" should show no
delta chips.

**Dev landing (`939f7a2`):** accelerep.netlify.app serves `index-CprJulHE.js`,
the local gate build's hash, 41 seconds after the push.

### 0.70 Audit batch 2 — the crashes, the array write, the unparsed fetch (2 Sep, fourth session)

§0.68 tier 1 items 13 and 14, plus the phantom `nextStep` / `nextStepDate`
reads in the same block. `src/utils/oppText.js`, pure: `productsListOf`
(the `products` TEXT column — "Shiftboard, AutoCall" — as a trimmed list; an
array tolerated) and `contactNamesText` (names back to the ", "-joined text
OpportunityModal writes and every reader splits; trimmed, deduped). In
ReportsTab's Opportunity History pane: (1) `selectedOpp.products.map` — a
TypeError for every deal with products, which took the whole pane down — now
reads through `productsListOf`, and the block's `products?.length` test (a
string has a length too, which is how the crash was reached) goes the same
way; (2) the "Next step" chip reads `nextSteps` (the column) instead of
`nextStep` (never written), and the `nextStepDate` badge is removed —
nothing writes that field; (3) the three toolbar buttons rendered ABOVE the
pane's `!selectedOpp` guard — Save as report, Export PDF, Email to owner —
are disabled and short-circuited until a deal is selected (they threw on
`selectedOpp.…` on the pane's default, empty state); (4) both "Add contact"
paths PUT `contacts: contactNamesText(mergedNames)` instead of the array
that landed in a text column as a Postgres array literal. And in the Actions
report, `const json = await dbFetch(…); setData(json)` stored the Response —
`data.summary` was undefined forever, so the report read "No actions logged
yet" over any number of rows; now `if (!res.ok) throw` then
`setData(await res.json())`, the pattern already used at the top of the same
file. `check:dbfetch` did not catch it because the Response was assigned,
not discarded — a scan gap, noted.

`tests/opp-text.test.mjs` (9: both directions of the text columns, a round
trip, and four source scans pinning the products read, the contacts write on
both paths, the `nextSteps` read, the guarded toolbar and the parsed fetch).
Gates green on 137 files, **389/389**, **140/140 mutations, printed green
baseline** (five new), build guard OK (2,478 kB, `index-D3lRwa5m.js`). Not
browser-checked here; Jeff eyeballs after the deploy: Reports → Activity
History → an opportunity with products must render, and Reports' "Actions"
report (reachable only by an older saved sub-tab — §0.68 tier 2) would now
show its rows.

**Dev landing (`d79b888`):** accelerep.netlify.app serves `index-D3lRwa5m.js`,
the local gate build's hash, 40 seconds after the push.

### 0.71 Audit batch 3 — scoping: leads sliced, the sub-tabs gated, rep lists narrowed (2 Sep, fourth session)

§0.68 items 6, 10, 11, 13 (the scoping halves) and tier 2's Manager-wide rep
lists. `reportScope.js` gains `leadRepOf` (a lead's rep is `assignedTo`),
`sliceLeads` (the activities slice, for leads) and `visibleReps(names,
scoped)` (null scope = everyone; else only the names in it — an empty scope
sees nobody). In ReportsTab: (1) `scopedRepNames` is derived once from the
role gate — `myTeamMembers ? [...myTeamMembers] : null` — so a rep LIST and
the DATA behind it come from the same set and cannot disagree; (2) the Leads
tab gets `reportsLeads = sliceLeads(roleFilteredLeads, slice, users)` and its
period set starts there — the §0.67 symptom, for leads, is gone; (3) the
Pipeline tab's deals-at-risk staleness reads `reportsActivities` instead of
the raw `activities`; (4) `SavedReportsTab` receives
`activities={reportsActivities}` (role-gated and sliced) and
`scopedRepNames`; its scorecard rep list and team-average roster go through
`visibleReps` — a User can no longer pick any rep in the org and read that
rep's activity mix; (5) `ActivityHistoryTab` receives `reportsActivities`,
`roleFilteredOpps` and `roleFilteredTasks` instead of the raw context
arrays, and its opportunity picker's owner test drops the phantom `o.rep`;
(6) `RecommendationReport`'s rep dropdown goes through `visibleReps`, so a
Manager sees their team, not the org. The sub-tabs' period behaviour is
unchanged in this batch (§0.68 tier 2, "likely on intent" — the templates
describe their own windows); their role gate is what this batch closes.

**Not changed, Jeff's call:** the leads role gate drops UNASSIGNED leads for
every non-Admin (`leadInScope` tests `myTeamMembers.has('')`), while the
leads endpoint deliberately serves unassigned rows to reps when
`unassignedLeadsVisibleToReps` is on (§0.58). The report contradicts the
server policy; which one is right is a product decision (§0.68 reader
finding L2).

`tests/report-scope.test.mjs` +5 (the leads slice on rep / team /
territory, an unassigned lead under a slice, `leadRepOf`, `visibleReps`
including the empty-scope case, and a source scan pinning every wiring point
above — no sub-tab may receive `activities={activities}`,
`opportunities={opportunities}` or `tasks={tasks}`). Gates green on 137
files, **394/394**, **145/145 mutations, printed green baseline** (five new:
the leads slice ignored, an empty scope seeing everyone, the leads period set
unsliced, `SavedReportsTab` handed raw activities, the scorecard list every
user), build guard OK (2,479 kB, `index-D0ibE8V3.js`). Not browser-checked
here; Jeff eyeballs after the deploy: Reports → Leads with a rep selected
must change its numbers, and Saved reports → Rep scorecard as a rep must
offer only that rep.

**Dev landing (`f40b2c1`):** accelerep.netlify.app serves `index-D0ibE8V3.js`,
the local gate build's hash, 40 seconds after the push.

### 0.72 Audit batch 4a — the Pipeline & Forecast tab's constants, and the Performance quota basis (2 Sep, fourth session)

§0.68 tier 1 items 3, 4, 7 and 8, plus item 6's phantom `nextStep`.
`src/utils/pipelineReport.js`, pure: (1) `userQuotaFor(u, period)` — a
quarter gets the quarter's own figure on a quarterly plan or a quarter of the
annual; a year gets the annual or the four quarters summed — and
`teamQuotaFor(users, period, slice)`, the reps in scope (named, not Admin /
Manager / ReadOnly, narrowed by the slice), **0 when none is set**. The
Pipeline tab's ring, gap and coverage now read that instead of the literal
$175,000 behind two fallbacks nothing writes; with no quota the ring shows "—
/ no quota" and the footer says where quotas are set, instead of measuring
against an invented number. Its label was "commit" while the ring is won vs
quota; it now says "won of quota". The Performance leaderboard's
`getUserQuota` goes through the same helper with the selected period, so a
quarter's revenue is divided by a quarter's quota (it was the full year's —
attainment read ~¼), and a rep with only Q2–Q4 quotas no longer drops from
the roster. (2) `pipelineMovement(opps, { today, days: 7 })` — added (created
in the window), won and lost (close day in the window: `wonDate` /
`lostDate`, else the stage-change day, else the forecast — `closeDayOf`),
slipped (still open, forecast date passed DURING the window), carried (open
now, created before), start (carried + what closed this week and was open
at its start), net. The ribbon is carried | won | lost | added, start + added
wide; slipped is listed but not a segment, because a slipped deal is still
in the pipeline. "Lost" was the literal 0, "Slipped" every past-due deal
ever, "Won" and "Carried over" all-time revenue against a 7-day label; the
dead waterfall computed and never drawn is gone. (3) `closedWonByQuarter`
— the last six COMPLETED fiscal quarters from the sliced set, by the house
convention, labelled "Q2 FY26". The panel was "Forecast accuracy" drawing
forecast === actual with an accuracy hardcoded to 100% and rolling 3-month
windows mislabelled as quarters; it is now "Closed-won by quarter" with a
total, one line, and an empty state that no longer promises a forecast
comparison. And deals-at-risk's "No next step" flag reads `nextSteps` (the
column) — it read `nextStep`, never written, so every open deal was flagged.

**A slip, caught twice by the same scan:** the span that replaced the old
movement derivations also swallowed the stage-conversion funnel and the
deals-at-risk block that sat between the two markers (the same shape as the
§0.69 slip). The §0.71 scope scan failed before anything ran; both blocks
were restored verbatim from HEAD by a script that asserted their absence
before and presence after. Rule for the next span edit: print the span from
git first and list every `const` in it.

`tests/pipeline-report.test.mjs` (14: quotas by plan and period, the team
quota following the slice, movement on a nine-deal fixture — Lost ≠ 0, won by
`wonDate` or stage-change day, slipped only within the window, start and
net — closed-won by quarter under January and October starts with a
last-day-of-quarter close, and the wiring scan). Gates green on 138 files,
**408/408**, **153/153 mutations, printed green baseline** (eight new: a
quarter of an annual plan back to the whole year, the team quota ignoring
the slice, Lost the literal 0, start forgetting the week's closes, slipped
every past-due deal, closed-won bucketed on the forecast date, the current
quarter included, the quota $175,000 again), build guard OK (2,478 kB,
`index-CLXLmsDb.js`). Not browser-checked here; Jeff eyeballs after the
deploy: Reports → Pipeline & Forecast — the ring reads "no quota" or the
real attainment, the movement legend has a Lost figure, and the quarter
panel is titled "Closed-won by quarter".

**Dev landing (`d25b894`):** accelerep.netlify.app serves `index-CLXLmsDb.js`,
the local gate build's hash, 41 seconds after the push.

### 0.73 Audit batch 4b — the last fabricated constants (2 Sep, fourth session)

§0.68 items 9, 11 (the "+3%") and 12, plus tier 2's orphan captions and the
0.28 connect rate. **Activity tab:** the prior period is real —
`comparedActivities` is the same window `comparedOpps` uses, applied to the
sliced activities — where it was `totalActs * 0.91`, a placeholder that made
every delta read about +10% for every org; "Per open opp" has no honest
prior denominator and shows no delta; the comparison is shown when a prior
window exists, not when prior DEALS happen to. "Per rep" divides by the reps
in scope from the roster (`repsInScopeOf`: named, not Admin / Manager /
ReadOnly, narrowed by the slice and the viewer's scope), not by whoever
logged something. The rhythm grid lists every rep in scope, busiest first,
top 8, from the unclipped sliced activities on the local clock (`dayOf`) —
it was clipped to the period, so a past quarter showed all zeros and flagged
everyone — and the coaching flag fires at five or more zero weekdays out of
ten (it was three, a long weekend plus one) and can now name a rep who
logged nothing at all. The never-rendered `connectRate = 0.28` is gone.
**Win / loss:** the WIN RATE card's "+3% vs prev period", a literal in
success green, is now "N won of M closed". **Stage conversion and
forecast-vs-actual templates:** the "vs previous period" caption under four
KPIs and the "vs prior 5 quarters" caption asserted comparisons nothing
computes; both removed. **Report builder:** the preview is real open
pipeline by owner from the scoped deals (`openPipelineByRep`, top 5), titled
as a preview whose dimensions and metrics are not applied yet; it drew five
constant bars ($850K … $380K) against whichever five users came first.
**Pinned cards:** Quota pacing, Pipeline added and Closing next 30 days show
their real headline as the preview; the sparklines were the headline times
fixed coefficients — a guaranteed smooth ramp under a green LIVE badge.

`reportScope.js` +`repsInScopeOf`; `pipelineReport.js` +`openPipelineByRep`;
tests +3 (the roster scope, open pipeline by rep, and the wiring scan that
pins every constant above as absent and every replacement as present). Gates
green on 138 files, **411/411**, **158/158 mutations, printed green baseline**
(five new: the scope ignored, closed deals in the builder's pipeline, the
0.91 back, the grid period-clipped, the threshold back to three), build
guard OK (2,479 kB, `index-BtwmtTXu.js`). The one span edit was asserted to
contain exactly one `const` before it ran (the §0.72 rule). Not
browser-checked here; Jeff eyeballs after the deploy: Reports → Activity
with a period selected and "vs previous period" on — the deltas are real or
absent, never +10%; Saved reports → the four pinned cards show numbers, not
ramps.

**Dev landing (`33e521b`):** accelerep.netlify.app serves `index-BtwmtTXu.js`,
the local gate build's hash, 41 seconds after the push.

### 0.74 Audit batch 5a — stage lists from the org's settings; lost deals ranked by the stage they left (2 Sep, fourth session)

§0.68 item 5 and the funnel half of tier 2. `src/utils/stageOrder.js`, pure:
`openStagesOf(settings)` (the org's `funnelStages` names minus the closes,
else the app's `constants.stages` minus the closes — never a made-up list),
`stagePalette(order)` (a colour per stage by position, plus the two closes,
so a renamed or added stage is still coloured), `commitFallbackStages` (the
last two open stages) and `bestCaseFallbackStages` (the one before). In
ReportsTab, every hardcoded stage list that drove a live number is gone:
the Pipeline tab's `stageOrder` / `stageColors2` (which named Prospecting,
Negotiation and Closing and bucketed Evaluation (Demo), Negotiation/Review,
Contracts and every lost deal as "Prospecting"), the three commit fallback
lists and the best-case one (Pipeline, Performance, Deal review), the
funnel deep-dive's fallback, the three colour maps, and the history track's
fallback. The one remaining `'Prospecting'` literal is the dead print block
at the top of the file (batch 6). Both funnels now rank a lost deal by the
stage it LEFT (`exitStageOf`, the §0.66 helper) and skip a stage outside the
order instead of counting it as the first — the deep-dive's max-stage was
the §0.66 defect one panel over. The history track reads a won deal as
every stage visited and a lost deal at its exit stage; both read −1
("Stages completed 0 of 6"), and the count is clamped to the stage count.

`tests/stage-order.test.mjs` (5: the default order is the real stages, the
org's settings win with closes stripped, colours for every stage including
a renamed one, the fallbacks are the last stages whatever they are called,
and the wiring scan — no hardcoded list left on a live path, both funnels
on `exitStageOf`). Gates green on 139 files, **416/416**, **163/163
mutations, printed green baseline** (five new: settings ignored, closes
uncoloured, the commit fallback one stage, a lost deal ranked first again,
a won deal 0 of N again), build guard OK (2,478 kB, `index-BBGjcEEV.js`).
Not browser-checked here; Jeff eyeballs after the deploy: Reports →
Pipeline & Forecast → Stage conversion lists Qualification through Contracts
and no Prospecting; Activity History → a Closed Won deal reads "Stages
completed 6 of 6".

**Dev landing (`090da10`):** accelerep.netlify.app serves `index-BBGjcEEV.js`,
the local gate build's hash, 41 seconds after the push.

### 0.75 Audit batch 5b — cycle time and quarter buckets from the real close day; wonDate written (2 Sep, fourth session)

§0.68 tier 2's cycle-time and quarter items (P12, F17–F19, A5–A6, A9–A10)
plus the `wonDate` gap found in the audit's ground-truth pass. Every "days
to close", "recent wins / losses" and "won in quarter" on a CLOSED deal read
`forecastedCloseDate` — the rep's prediction — so a deal won three weeks
early reported the forecast-length cycle, a won deal with a stale future
forecast date was a "recent win" forever, and "actual" bookings landed in
the quarter the rep had predicted. `pipelineReport.js` gains
`cycleDaysOf` (createdDate → `closeDayOf`: `wonDate` / `lostDate`, else
the stage-change day, else the forecast; same-day is 0, not "no data"),
`medianOf` (the mean of the two middles on an even count — the old code
took the upper one), `closeDayInRange` (inclusive day strings — the old
quarter loops ended at 00:00 on the last day, so a quarter-end close fell in
no quarter), and `lastQuarters` (the last six fiscal quarters ending with
the current one, from quarters.js, labelled "Q3 FY26"). In ReportsTab: the
Performance leaderboard's per-rep cycle, sparkline months and team average;
the win/loss median cycles; the scorecard's team and rep cycles, its
attainment history (now the rep's quota for THAT quarter — a quarterly
plan's own figure instead of annual/4 — and bars labelled with the fiscal
year), its recent wins and losses (by close day, with an upper bound of
today, dated by close day); the forecast-vs-actual template's six quarters
and per-quarter team quota; and "Closing next 30 days" gets a lower bound
so overdue deals stop counting as closing soon. The four remaining
forecast-date reads are on OPEN deals (deals at risk, closing-next-30) and
the dead print block. **`useOpportunities` writes `wonDate`** on a Closed
Won save (kept across later edits, cleared on reopen); the column existed
and the endpoint passed it through, but nothing had ever set it.

`tests/pipeline-report.test.mjs` +6 (the cycle to the close day and the
stage-change fallback, same-day 0, nulls; the median; inclusive quarter
ends; `lastQuarters` under both starts; and the wiring scan — exactly four
forecast-date reads left, five cycle sites on the helper, no midnight
quarter bounds, `wonDate` written). Gates green on 139 files, **422/422**,
**169/169 mutations, printed green baseline** (six new: cycle to the
forecast again, upper-middle median, end-exclusive quarter, current quarter
skipped, no upper bound on recent wins, `wonDate` not written), build guard
OK (2,477 kB, `index-DZcl2imu.js`). Three span edits, each asserted to hold
exactly the constants it replaced (two first-guess counts were wrong and
aborted cleanly; the printed lists matched intent). Integration suites not
re-run: no endpoint changed (`opportunities.mjs` already accepted
`wonDate`). Not browser-checked here; Jeff eyeballs after the deploy:
Saved reports → Rep scorecard — "Attainment history" bars read "Q3 FY26",
and a deal just marked Closed Won appears under Recent wins dated today.

**Dev landing (`7dbfd6e`):** accelerep.netlify.app serves `index-DZcl2imu.js`,
the local gate build's hash, 41 seconds after the push.

### 0.76 Audit batch 6 — dead controls wired or removed; the unreachable print path gone (2 Sep, fourth session)

§0.68 tier 2's class H (controls that promised an action and did nothing)
plus the dead code the audit found around them. Removed from
`ReportsTab.jsx` (6,544 → 6,188 lines): the print path no button could
reach — `handlePrintReport` / `generateReport` / `ReportBtn` /
`printSection` and the eight feeders that ran on every render
(`revenueByQuarter`, `byStage`, `topAccounts`, `monthlyData`, …), plus
the hardcoded `stages` / `stageColors` at the top of the component (the
last `'Prospecting'` in the file — the org's own stage list has been the
source since §0.74); the dead `getRepQuarterQuota`; and every inert
control — two "⛶ Fullscreen" buttons, "See all →", the "··· Export"
menu, "View all rows", the Refine / "Regenerate" row under the AI
builder, and the "Recent reports" strip that listed four invented views
"last viewed today". Wired: the six **"+ Save as my report"** template
buttons now call `handleSaveReport` with the template's name, source and
`config:{ templateId }` (the button reads Saving… / ✓ Saved / Error —
retry, and `handleSaveReport` passes `config` through to the endpoint,
which already accepted it); a saved card in the library **opens** its
template on click (a builder-made card carries a title saying opening is
not wired yet); **Duplicate** lists the real saved reports (owner, local
day of the last update) and saves a real "(copy)" instead of opening a
blank canvas; **Email to owner** resolves the rep's address from the
roster (`settings.users`) and alerts when there is none — it mailed the
display name; and the Actions sub-tab gets the nav entry it never had (the
export label map now names every real sub-tab and no imaginary one).

`tests/reports-controls.test.mjs` (5 scans: the dead identifiers absent,
every sub-tab in nav and label map, no inert control text, the six wired
Save buttons naming t1–t6 exactly once each, the card opener, Duplicate
and mailto). `pipeline-report.test.mjs`'s forecast-date count drops 4 → 2
(the print block's two reads went with it). Gates green on 139 files,
**427/427**, **174/174 mutations, printed green baseline** (five new:
`config` dropped from the save payload, the card opener a no-op,
Duplicate back to a blank canvas, mailto of the name, the Duplicate row
dated by a UTC slice), build guard OK (2,475 kB, `index-BorndMdE.js`).
The big span edit (316 lines) printed every `const` it held and was
asserted to contain no hook and none of the live neighbours before it
was cut (§0.72's rule).

**Observed (local, Karen):** Reports renders under the new bundle with
the Actions entry; "See all →" and the recent strip are gone; Rep
scorecard → Save posts `201 Created` and the button reads "✓ Saved"; the
library shows the card, and clicking it opens the scorecard (Attainment
history on screen); + Create report → Duplicate lists that one real
report and Duplicate → posts a second `201`. **Found live and fixed
before commit:** the Duplicate row read "updated 2026-09-03" at 7pm on
2 Sep — the row date was `String(createdAt).slice(0,10)`, the UTC slice
of an instant §18b26 forbids; it now reads `dayOf(...)`. **Test data
left in Karen's library on dev:** two saved reports, "Rep scorecard" and
"Rep scorecard (copy)" — delete from the library or keep; Jeff's call.
Not re-checked in the browser: Email to owner (a `mailto:` navigation;
reasoned from code and pinned by scan and mutant).

**Dev landing (`9be3fe8`):** accelerep.netlify.app serves `index-BorndMdE.js`,
the local gate build's hash, 31 seconds after the push.

### 0.77 Audit batch 7 — the History tab reads real columns; PDF export escapes; honest labels (2 Sep, fourth session)

The §0.68 tier 2 remainder. **Activity History** read fields no writer
sets — `t.completedAt` (the column is `completedDate`), `t.notes`
(`description`), `a.rep` / `a.salesRep` / `a.assignedTo` (`author`),
`c.engagement` / `c.lastTouch` / `c.activities` (nothing), `account.status` /
`warmthStatus` / `employees` (nothing; `totalEmployees`) — and linked
activities and tasks to an account or contact by name fields those rows do
not have (`companyName`, `accountName`, `contactName`, `contactSearch`),
so anything logged on an account with no deal never appeared, every done
task sat on its due day, every activity was "by Rep", every contact was
"warm" with "last touch —", and every account was an "Active customer".
New `src/utils/historyFeed.js`: `taskDay`, `linkedToAccount` (a deal of
the account, or the row's own `accountId`), `linkedToContact` (a deal,
`contactId`, `contactIds`, or a task's `contacts` list of `{id}`),
`contactTouch` (last activity day, count, and a recency tier hot ≤ 7 d /
warm ≤ 30 / cool ≤ 90 / stale / none), `monthsSpanned` (the "/ mo avg"
divisor — the period's length, or for all time the span from the earliest
event to today; it divided all-time by 12), and `escapeHtml`. Both PDF
writers now escape every interpolated user value (title, event label,
detail, rep, stage, forecast category — a note containing markup was
written raw into `document.write`). "Showing N of N events" shows the
filtered count of the total. The account glance shows Segment (tier as
fallback) instead of the invented status; the "Tasks Done" card loses its
"still open" caption. **Territory coverage:** a deal's own `territory`
column (CSV import writes it) wins over its rep's, and industry comes from
the deal's `vertical` then the account's `verticalMarket` via a new
`accounts` prop on SavedReportsTab — `settings.__accountsRef` was read and
written nowhere, so every deal was "Other". **Forecast vs actual** says
"quota" where it reads quota. **The AI builder** stops claiming it
interpreted the prompt: the banner says the builder does not interpret
prompts yet and names the built-in stuck-deals view it always shows. The
dead `actPeriod` / `commissionReportFilter` state is gone.

`tests/history-feed.test.mjs` (6 unit + the wiring scan: no phantom
field, both PDF row builders escape every event value, the territory and
industry reads, the quota labels, the honest AI banner, the helper wiring).
`report-scope.test.mjs`'s SavedReportsTab scan admits the `accounts`
prop. Gates green on 140 files, **434/434**, **182/182 mutations, printed
green baseline** (eight new: `<` unescaped, `completedAt` read again,
account-only activity dropped, task contacts list ignored, a
yesterday touch only warm, all-time ÷ 12, the PDF label raw, the empty
filter's bar removed), build guard OK (2,476 kB, `index-AW6mOo3m.js`).

**Observed (local, Karen):** Activity History → Account history → ZZFX
Beacon Metals: "Showing 2 of 2 events", the Activities KPI reads "0 / mo
avg over 6 mo", the glance shows a Segment row and no "Active" anywhere;
**found live and fixed before commit:** choosing the "Activities" filter
with nothing matching removed the filter bar itself — no way back to
"All" — under a message claiming "No events in this period" while two
deals sat under All; the bar now stays and the message names the filter
(one more scan assertion, one more mutant: eight new, **182/182**);
no console error from the app (the HMR 500s in the log are the gate
build's `rm -rf node_modules/.vite` racing the dev server, CLAUDE.md's
stale-build note). Not browser-checked: the PDF writers (a `window.open`
print page — pinned by scan and mutant), the contacts tier column (needs a
deal with contacts and activities on them), the territory template
(Karen's org has no territories).

**Not fixed, by design or deferred:** the Actions report and the
Opportunity picker show a Manager the whole org — CLAUDE.md: server-side
`canSeeAll` hands Managers the org; client `managedReps` narrowing is the
only Manager scoping. `compareLabel3` ("vs previous period") is gated on a
real comparison since §0.69. The "Team" slice button for Managers sets the
manager's own team (the only one they have) — a one-option control, not a
no-op. The blank builder's preview bars (§0.68 item 12) were replaced in
batch 4.

**Dev landing (`e2adc83`):** accelerep.netlify.app serves `index-AW6mOo3m.js`,
the local gate build's hash, 31 seconds after the push.

**PROD SHIP (Jeff: "looks great - please ship to production").** `master`
fast-forwarded `abb239a` → `1163eec` (ancestor check first; 27 commits —
the Win / loss and Activity report fixes, §0.66–§0.67, and audit batches
1–7, §0.69–§0.77); salespipelinetracker.com serves `index-Ki3OVxo2.js`
30 seconds after the push — the inlined key `pk_live_` (the bundle's one
`pk_test_` literal is Clerk's own key-type check in
`@clerk/shared/dist/keys.mjs`, present in every build), the batch 7 AI
banner and the batch 6 saved-card title present, 2,535,030 bytes. Nothing
probed on prod beyond the served bundle by the session; **Jeff eyeballed
the Reports tab on prod afterwards: "eyeball work is all confirmed
correct."** Dev and prod share the Neon `main` branch, so the two test saved
reports in Karen's dev library (§0.76) are the same rows prod would show
her. Jeff deleted them, and the ZZTest deals, after the prod eyeball, and
noted that deleting a saved report asks through the browser's native
`confirm()` rather than the app's own confirmation modal — carried in the
handoff (§5 item 13).

### 0.78 A 401 is a sign-in problem, not an outage; the MFA catalogue card reads Clerk (2 Sep, fourth session)

Two carried items, Jeff: "fix them both please". **The banner.** Every
loader — the five promise-chain hooks, `useDocuments`, `useQuotes` and
App.jsx's `checkOk` — called `setDbOffline(true)` on ANY non-ok response,
so a 401 (a pending or expired session) or a 403 (a revoked role) lit the
red "Database connection lost" banner: an auth refusal reported as a
database outage, the wrong layer (18b22). The pending case stopped
happening when the client gate landed (§0.65), but the mapping was intact.
New `src/utils/fetchStatus.js`: `dbStatusOf(res)` → `false` (ok),
`'auth'` (401/403), `true` (any other non-ok); `bannerCopyOf(state)` —
the auth state reads "Your sign-in is no longer valid — refresh the page
and sign in again. Changes are not being saved." in amber, the outage
state keeps the red sentence. `dbOffline` is now `false | 'auth' | true`
(every existing truthy check still works); all eight callers report
through `dbStatusOf`, none sets the flag bare. **The card.** Settings →
Security's "Multi-factor auth" tile was hand-typed in `catalogue.js`:
status "partial", "Optional · not all enrolled", "Edited 3 months ago by
Admin", attention and new flags — none read from anywhere (the detail
panel behind it has been live from Clerk since §0.65). AdminView's
mount-time live-counts fetch now includes `clerk-mfa-status` (Admin-only;
a 403 leaves the card blank, never the old text); `mfaCardOf({ enrolled,
total })` gives the chip (`ok` when everyone is enrolled, `partial`
otherwise), the detail "2/4 enrolled · 50%", and the attention flag only
while someone is unenrolled. The card's status chip and "Needs attention"
read the computed values, and a card with `managedIn:'Clerk'` shows
"Managed in Clerk" in place of an invented edit history. The catalogue row
keeps only what is deterministic.

`tests/fetch-status.test.mjs` (3 unit + 2 scans: every loader through
`dbStatusOf`, no bare `setDbOffline(true)`, the banner copy from state,
the catalogue row free of hand-typed text, AdminView fetching and reading
the live card). Gates green on 141 files, **439/439**, **188/188
mutations, printed green baseline** (six new: 401 as outage, auth banner
with the outage sentence, card complete with anyone unenrolled, attention
never, `checkOk` bare again, the card ignoring live data), build guard OK
(2,477 kB, `index-CSnSB6MZ.js`). **Not observed in the browser:** the
Security list is Admin-only and the pane is signed in as Karen (User); the
auth banner needs a revoked or expired session to fire. Jeff eyeballs on
dev: Settings → Security → the Multi-factor auth tile reads "2/4 enrolled ·
50%" with "Managed in Clerk" and "Needs attention", matching the panel.

**Dev landing (`71d68e3`):** accelerep.netlify.app serves `index-CSnSB6MZ.js`,
the local gate build's hash, 30 seconds after the push. The pane's Karen
session had expired by then: the app sat at Clerk's sign-in card with 401s
from two non-hook calls (spiff-claims, calendar-events) in the console and
no banner — right, the gate holds the app before any loader runs.

**PROD SHIP (Jeff: "ship to prod").** `master` fast-forwarded `1163eec` →
`d63644f` by `git push origin dev:master` (ancestor check first; six
commits — §0.78 and the docs commits around it); salespipelinetracker.com
serves `index-DrRd6S0A.js` 30 seconds after the push — `pk_live_` inlined,
the sign-in banner copy and the "Managed in" line present, 2,535,963
bytes. `master` == `dev` == `d63644f`.

**Observed by Jeff (screenshot, Settings → Security list as Admin):** the
Multi-factor auth tile reads "◐ 2/4 enrolled · 50%", "Needs attention",
footer "Managed in Clerk" — matching the panel behind it. **The same
screenshot shows the rest of the class, carried (handoff §5 item 15):**
every other card's footer ("Edited 2 months ago by Admin", "Edited just
now by System", "Never changed") is hand-typed in `catalogue.js` — 46
cards carry an `updatedBy`, with `updatedAt` values like "2 months ago"
that never move; and the Workspace Health tile's "4 of 8 checks passing ·
50%" comes from `healthChecks` in AdminView (~line 673) where "MFA
enforced" is `ok:false` unconditionally (enrolment is live one card
over), "Backups running", "Session policy set" and "Quote branding
configured" are `ok:true` unconditionally, and the sentence "Set up SSO
and enforce MFA to reach 90%+" is static. Only the webhooks, pipeline and
team-assignment checks read anything.

**Notice reworded (Jeff: "please reword the policy settings dialogue").**
The panel's amber callout said "Turn on Require multi-factor
authentication in Clerk Dashboard to hold them at sign-in until they do"
— Require has been ON on both instances since §0.65, and the app cannot
read that setting (`clerk-mfa-status` reports per-user enrolment only).
It now reads "With Require multi-factor authentication on in Clerk, they
are held at sign-in until they enrol. This app cannot read that setting —
check it in Clerk Dashboard." One scan in `fetch-status.test.mjs`, one
mutant (the old sentence back). Gates green, **440/440**, **189/189,
printed green baseline**, build guard OK (2,477 kB, `index-ylwf4HZI.js`).
Not browser-observed (Admin-only panel; the pane is Karen).

---

## 0P0. Prior Batch — One Role Vocabulary, And A Gate That Allows Instead Of Denies

> Five roles. Eight lists. One of them enforced. The other seven disagreed with it
> and with each other, and the disagreements were load-bearing.

### 0.41 What shipped

- **`APP_ROLES` + `isAppRole()` in `auth.mjs`** — frozen, exported, and the only
  enumeration. `user-role.mjs`'s `VALID_ROLES` is gone; invite, admin create and
  the `?me=true` link path all validate before a role reaches Clerk or the mirror.
- **`requireWrite` is an allowlist.** `Admin | Manager | User`; `Technician` only
  via the existing `allowTechnician` opt-in; everything else refused with a THIRD,
  distinguishable message naming the value in the log.
- **`user-role.mjs` uses one identity space per use.** `targetUserId` is the app
  id, asserted with `isAppUserId`; the Clerk id is resolved from the roster row;
  the self-demotion check compares in Clerk space; the mirror update counts rows
  instead of trusting a `try` that a zero-row UPDATE never enters.
- **`users-sync.mjs` no longer derives an app role from Clerk's ORG membership
  role.** Unknown roles normalise to `User` and are reported as `roleDrift`,
  exactly as `nameDrift` is reported rather than applied.
- **`flatten()` spreads `profile` FIRST**, so `users.role` wins over the frozen
  `profile.userType` copy. `userType` survives as an alias; both now resolve to
  the column, and the blob self-heals on the next write of each row.
- **`RoleSelect`** (module scope) renders an unmatched value as itself, disabled.
  `RolePill` keys on stored values, with unknown roles in red and a tooltip.
  `permMap` gains Technician. The seat breakdown counts the column and shows an
  `Unrecognised` bucket.
- **`invalidateRoster(orgId)` is called** — it was exported and had no callers —
  at every `users` write, and it now drops the **caller** cache for that org too.
  That second cache is the one with teeth: it caches a MISS as `{id: null}`, which
  fails closed, so a freshly linked user owned nothing for up to 30s.
- **`scripts/check-clerk-roles.mjs`** — read-only. Lists Clerk members holding a
  role no gate recognises. Not verified against a live Clerk instance.

### 0.42 Role changes had been impossible, and no gate could have said so

`user-role.mjs` passed `targetUserId` to three Clerk calls **and** compared it to
`users.id`. Before the Phase 1 identity split those were the same string. After it,
neither input is correct for both uses:

| what the client sends | Clerk calls | mirror update |
|---|---|---|
| `users.id` (what it actually sent) | 404 — "User not found." | never reached |
| `clerkUserId` | fine | matches **zero rows, silently** |

A drizzle UPDATE matching nothing does not throw, so the `try/catch` around it
proved nothing. This is §18b22 inside a single function body, and the
`ownership-registry` guard that forbids `eq(users.id, userId)` did not see it:
**that guard reads the six entity endpoints as text, and this is not one of them.**

### 0.43 The badge and the authorization were never the same field

§0.40 hypothesised that `canSeeAll()` being case-sensitive meant a user the UI
calls an admin has rep access. It labelled itself unverified, and the hypothesis
does not hold: `canSeeAll` **is** case-sensitive, but it reads Clerk
`publicMetadata.role`, and nothing wrote `admin`/`member` there — `users-sync`
wrote them to the mirror's `profile.userType`, which is a different field in a
different store that no gate reads.

Nor does "saving that page writes `Admin` to a member" hold as written: the select
is controlled, so the first option is only *displayed*, and `priorRole ===
form.userType` short-circuits the role call. **But** the control was live and
presented `Admin` as the current value, so opening it and clicking what looked
correct sent a real change. That failed with the 404 above — which means fixing
§0.42 alone would have ARMED a one-click escalation. Both are in this commit for
that reason.

### 0.44 Eight lists

`auth.mjs` · `user-role.mjs` `VALID_ROLES` · Clerk org membership via
`users-sync:105` · `RolePill`'s colour map (`Sales Manager`, `CS`, `Finance` —
values this app has never stored, so four roles rendered identically grey) · the
invite seeds (`'Sales Rep'`, the label) · `UserModal`'s options (no Technician) ·
`permMap` (no Technician, so a Technician's summary showed a rep's permissions) ·
the `schema.ts` comment.

§0PP-e recorded the `'Sales Rep'` vs `'User'` mismatch as fixed once already. It
was live again on the creation path, which is the argument for one exported list
rather than seven corrected copies.

### 0.45 Verified in the browser, as a rep

The three checks no gate can perform, run on dev after deploy:

| Check | What it proves |
|---|---|
| a rep can still save a record | the allowlist admits `'User'` — the inversion did not lock out the roles it was meant to keep |
| the Users list reads Admin / Manager / Sales Rep, not `member` | `flatten()` resolves to the column, and the sync no longer imports Clerk's org vocabulary |
| an Admin changes a role and the badge updates | `user-role.mjs` reaches Clerk AND the mirror — the path that had been dead since the Phase 1 identity split |

The third is the one with no other evidence behind it. It was failing with a 404
that read like a legitimate "user not found", and the mirror half would have
failed silently even once the Clerk half worked, because a drizzle UPDATE that
matches nothing does not throw.

**Admin skips every `!canSeeAll` branch**, which is why this is done signed in as
a rep. Repeat it after any change to roles, ownership or visibility.

### 0.46 The test count in the previous header was off by one

§0's header read **261 tests** at the close of the previous batch. Adding this
batch's 14 gave 275; `npm test` reported **276**. So the real figure was 262 and
the header had drifted by one — too small to notice, which is the only reason it
is worth writing down: a count nobody reconciles is a count that can be wrong by
any amount. Corrected to 276 from observation, not arithmetic.

### 0.47 Also found, not fixed here

- **`UserModal`'s role select did nothing on edit.** `users.mjs` PUT deliberately
  preserves the stored role, so the control accepted a choice and discarded it.
  Now disabled on edit with a pointer to Settings → People & Teams; wiring it to
  `user-role.mjs` properly is a separate decision.
- **`sanitize()` still writes `profile.userType` from the request body.** Harmless
  now that `flatten()` prefers the column, and it is what lets the blob self-heal,
  but it is still a second stored answer to a question with one.
- **No live users, all test data** (confirmed 26 Aug), so the `requireWrite`
  inversion needed no migration — but test accounts invited with `'Sales Rep'`
  will 403 on writes until their role is reset. `check-clerk-roles.mjs` names them.

---
## 0PA0. Prior Batch — Ownership Keys On Ids, And Three Guards That Were Not Guarding

> Phase 2 proper. `ownerId` on the six Tier 1 tables, the server stamps it on
> create, and `_ownership.mjs` compares ids. **A display name can no longer confer
> ownership: only a real roster user can own anything.**
>
> Three separate things that read as working were not. Each is recorded below
> because each was green at the moment it was wrong.

### 0.34 What shipped

- `ownerId text` + `(orgId, ownerId)` index on accounts, contacts, opportunities,
  tasks, leads, activities.
- `_ownership.mjs` rewritten: `OWNER_ID_COLUMNS` is the policy registry;
  `OWNER_NAME_COLUMNS` is retained for RENDERING AND RESOLUTION ONLY. **There is
  deliberately no name-based policy function** — if one existed something would
  eventually call it, and the two policies would drift the way `bulkUpsert` and
  `_ownership` drifted (§18b20).
- `_lib.mjs`: `getCallerId`, `resolveOwnerId` (refuses ambiguity with a 409 naming
  both roster rows), `ownerIdForWrite`, `stampOwnerId`, `stampOwnerIds`,
  `ownerIdForUpdate`, `ambiguousOwnerResponse`.
- `bulkUpsert` takes `callerId`, not `callerName`.
- All six endpoints stamp on create and re-key on reassign; the two rep GET
  filters key on `ownerId`.
- `scripts/migrate-owner-ids.mjs` — additive DDL plus a name→id backfill that
  **refuses ambiguity rather than guessing**.

**Single create defaults to the caller; BULK create does not.** Creating a deal in
the UI means you own it. Importing three hundred rows of someone else's
spreadsheet does not make you the owner of all of them — and stamping the importer
is exactly what `importRows.js:103` did, which is why an unassigned opportunity
could not be created by import at all. **That item is now closed.**

### 0.35 `ownerId` already meant two things in this schema

`documents.ownerId` holds a **Clerk** userId — the schema comment says so.
`savedReports.ownerId` is notNull and undocumented. Adding six more `ownerId`
columns holding `usr_<uuid>` would have made three identity spaces sharing one
property name, all `text`, all comparing without error and never matching.

§0.28 recorded both as *"already correct — leave alone"* because they were
id-first. **True about the shape, wrong about the space.**

`isAppUserId()` now asserts the space and `mayMutate()` refuses a wrong-space value
LOUDLY. A registry tripwire keeps `document` and `savedReport` out of the ownership
policy until their columns are migrated. Guide **§18b22**.

### 0.36 Three things that were green and wrong

**1. The mutation score was vacuous.** The harness judges CAUGHT by non-zero exit.
`tests/bulk-upsert.test.mjs` was RED — three security assertions about bulk
ownership — so every mutation exited non-zero and it printed **73/73 twice** over
code it never tested. A green baseline is now proven before anything is graded.

**2. `bulkUpsert` failed OPEN on a projection miss.** `prior.ownerId` was
`undefined` (column not projected) and that read as `null` (genuinely unowned), so
every owned row in every batch became writable. Now throws.

**3. A guard covered the instances, not the class.** Five source-level guards were
written for the name-vs-id defects found in the previous batch. A sixth instance
then SURVIVED the harness:

```js
results.filter(l => !l.assignedTo || l.assignedTo === callerId)
```

The write-path policy could not save it — **visibility filters compare in the
endpoint and never reach `mayMutate()`**. The sixth guard describes the class:
anything compared against `callerId` must end in `.ownerId`. Guide **§18b23**.

### 0.37 The collision is real, and it was in the data

The backfill's ambiguity check found **two roster rows named "Jeff Russell" in the
UKG org** — `jeff.russell@ukg.com` and `jeffrussell1@yahoo.com`. Under name-based
ownership those two accounts owned each other's records and every gate agreed it
was fine. Not a hypothetical from the design note; live in dev data.

Resolved by renaming the member row. **Renaming before the backfill would have
silently reassigned the admin's records to the member** — §5's "renaming a user
detaches every record they own", live. The correct row was renamed instead.

Also visible in the plan: `activities.author` contains **`jeffrussell1@live.com`
and `jeffrussell1@yahoo.com`** — email addresses in an owner column, the
`importRows.js:103` contamination, in data rather than inferred from code.

### 0.38 Migration APPLIED, and the rep path verified by hand

`accounts` 813 rows / 5 owned · `contacts` 3038 / 1445 · `opportunities` 66 / 34 ·
`tasks` 74 / 51 · `leads` 25 / 4 · `activities` 53 / 30.

**1,569 set. 2,408 genuinely unowned. 92 rows name someone who is on no roster**
(Dana Holloway, Carlos Mendez, Marcus Webb, Lauren Xu and other demo-seed reps,
plus `ZZFX Other Rep` — a test fixture name that reached dev data). Those stay
unassigned, and **unassigned means editable org-wide** — the policy, not a gap,
but it is what it means for roughly 61% of dev rows.

**Every applied count matched the dry run exactly.** Worth stating: a plan that
does not predict its own apply is not a plan, and this file has recorded two
migrations that surprised their operator.

**Verified in the browser, signed in as a REP rather than an Admin.** Own contact
visible and editable; someone else's refused with the OWNERSHIP message rather
than the role one; a self-created contact came back owned by the creator. Those
three map to the GET filter keying on `ownerId`, `assertOwnership` firing with the
two 403s still distinguishable, and the server stamping from the JWT.

**No gate can perform this check**, and Admin skips every `!canSeeAll` branch,
which is exactly how §0.24, §0.30 and §0.36 shipped green. Repeat it after any
change to ownership or visibility.

### 0.39 Still name-based, deliberately

`opportunities.mjs` manager visibility filters on `managedReps`, which lives in
Clerk `publicMetadata` as an array of DISPLAY NAMES. It cannot move to ids until
that list does, and it carries the Phase 2 hazards in full — rename a managed rep
and they drop out of their manager's view silently. Commented in place. It is a
visibility filter, not an authorization gate.

### 0.40 Open, found this batch, not yet fixed

**The role vocabulary is two vocabularies.** The Users list shows badges reading
`member`, `Admin`, `member`, `User` — Clerk's role names (`member`/`admin`) mixed
with the app's (`Admin`/`Manager`/`User`/`Technician`). The seat counter read
**Admins 0** with a lowercase `admin` and **Admins 1** after it became `Admin`, so
the comparison is case-sensitive. If `canSeeAll()` compares the same way, **a user
the UI calls an admin has rep access**.

Worse, the user-detail ROLE select showed `Admin` for a user whose header and
effective-permissions summary both said `member` — consistent with `member` not
being in the option list, so the browser renders the first option. **Saving that
page would write `Admin` to a member.** Not verified against `auth.mjs`; own commit.

**`invalidateRoster(orgId)` is exported and never called.** `resolveOwnerId`
caches the roster for 30s, so inviting a user and immediately assigning them a
record can resolve stale and stamp NULL. Needs a call after any `users` write.

---

## 0PA. Prior Batch — Centralising the Gate, and Three Names Compared to Ids

> Phase 2 step 3, pulled forward and done first: the nine remaining hand-rolled
> ownership checks are now `assertOwnership()`. Pure refactor by intent — no
> schema change, nothing near Neon — which is what makes the id flip a change to
> ONE file instead of ten. Reading those ten sites to move them surfaced three
> live defects that all five gates were green over, and **two of them were
> introduced by the identity split in §0.28 and had been live on dev since.**

### 0.29 The count was ten, not nine

Eight single-record checks (accounts PUT/DELETE, opportunities PUT/DELETE, leads
PUT/DELETE, tasks PUT/DELETE) plus two bulk `ownerColumn:` literals naming a
column directly. Contacts and activities were already centralised — they were the
two whose columns did not exist (§0.24).

`ACCELEREP_CURRENT_STATE.md` and `SESSION_HANDOFF.md` both said **nine**. Neither
was wrong about the single-record checks; both omitted the bulk literals, which
are the MORE dangerous half — `bulkUpsert` does `if (ownerColumn)`, so a wrong
name there is a silent org-wide write bypass rather than a 500. Counted by
reading, not by trusting the figure.

**Ordering preserved deliberately.** On accounts, opportunities and leads the
ownership check runs BEFORE the Admin role gate, and must keep doing so: both
refusals are 403 and the BODY is the only way to tell them apart, so a non-owner
gets the ownership message and an owner gets the role message. FIXTURE_MANIFEST's
delete gate asserts exactly that split. Each site now carries a comment saying so.
Tasks has no role gate after it — a rep may delete a task they own — and that
asymmetry is preserved.

### 0.30 Three live defects, one shape: a name compared to an id

**1. Two GET filters — reps could not see their own records.**
`opportunities.mjs:152` and `leads.mjs:72` each hand-rolled:

```js
const [repRow] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
```

`userId` is Clerk's; `users.id` became `usr_<uuid>` in §0.28. The match resolves
nothing, `repDisplayName` falls to null, and the predicate collapses to
`!o.salesRep || o.salesRep === null` — **only unassigned records**. Every rep lost
sight of their own pipeline and their own leads.

**Silent, not merely wrong.** The query SUCCEEDS and returns no row, so the
`try/catch` wrapped around it never fired. Neither was org-scoped either.

This is §0.26 inverted. Before the split the server was right and the client
wrong; after it, both were wrong. **§0.28 shipped this and it went undetected
because the session verified as Admin**, which skips the `!canSeeAll` branch —
the identical reason §0.24 survived.

**2. `getRepUser()` was unscoped** (`opportunities.mjs:28`). It matches a display
name against `users` with no `orgId`, and its result is an **email address** that
`maybeEmail` sends deal names, ARR and stage transitions to. Two orgs each
employing a "John Smith" means one tenant's pipeline activity delivered to the
other tenant's employee. Same class as §18b20.3, still open in a second place.

**3. A guard that could never fire.** `opportunities.mjs:206` read
`inserted.salesRep !== userId` — display name against Clerk id, never equal — so
"notify the assigned rep only if someone else created it" has **never** suppressed
anything. Every rep has always been emailed about every deal they created for
themselves. Pre-existing, unrelated to the split, fixed in the same pass.

**Why the Phase 1 sweep missed all three.** It rewrote CALL SITES of
`getCallerName`. These are inline queries that REIMPLEMENT it. A textual sweep
finds callers and cannot find code that duplicates the callee. After a sweep,
search for the behaviour, not the function name.

### 0.31 The guard suite was not in SUITES

`tests/ownership-registry.test.mjs` shipped in §0.28 and was never added to
`SUITES` in `scripts/mutate-import.mjs`. The registry, `mayMutate`, and both
fail-closed throws — every object-level authorization decision in the app — had
**zero mutation coverage**. The count read 55/55 throughout, because the single
ownership mutation targets `_bulk.mjs` and is caught by `bulk-upsert.test.mjs`.

This is §18b20's own closing paragraph, recurring in the file it is about, one
session later.

Now in `SUITES`, with ten mutations. **All ten cover guards that already
existed** — 55 → 65 is not new coverage, it is coverage that was being counted
without being tested.

### 0.32 Five new guards, all mutation-verified

Source-level, in the default suite, reading the six endpoint files as text:

| Guard | Catches |
|---|---|
| no `!== callerName` / `db.select({ owner:` | an endpoint re-rolling the comparison |
| `ownerColumn:` must start `ownerColumnOf(` | a column named at the call site |
| every `assertOwnership` result is returned | **a gate computed and discarded** |
| no `eq(users.id, userId)` | §0.30 defect 1 returning |
| every `.from(users)` filters `orgId` | §0.30 defect 2 returning |

Each was mutated and confirmed to fail before being trusted. Guide **§18b21**.

### 0.33 What is proven, and what is not

Worth stating precisely, because the gates being green means less here than usual.

**Proven at runtime.** The accounts delete-gate 403 split — both the ROLE-refused
and OWNERSHIP-refused regressions pass in `accounts.itest.mjs`. That was the main
risk of moving ten call sites.

**NOT proven at runtime:**
- `opportunities.mjs` and `tasks.mjs` have **no integration file at all**.
- `leads.itest.mjs` covers isolation and bulk, but has **no rep-role ownership
  tests**.
- `contacts.itest.mjs` has the full rep suite — and contacts was UNCHANGED by this
  batch, so it proves nothing about it.
- **Both GET filter fixes have no runtime coverage whatsoever.** They are guarded
  source-level only, and they are the user-visible half of the batch.

The ownership reorder in opportunities, leads and tasks rests on the accounts
tests passing plus the same pattern being applied identically. Reasonable; not
proof. **A rep-role integration file for opportunities and tasks is the highest-
value test debt in the repo** — it is the same gap that let §0.23, §0.24 and
§0.30 all ship.

---

## 0PB2. Prior Batch — The Delete Gate Ran, and the Rep Path Had Never Been Executed

> The delete gate finally ran end to end: six 403s splitting correctly across the
> ownership check and the Admin role gate, three 200s, the Admin half clean, and
> the child-promotion defect confirmed with before/after evidence. Getting there
> surfaced six further defects, every one of them on the REP path — a path that
> no unit test, no integration stub (all hard-coded Admin) and no manual session
> had ever executed. All six gates were green before each fix and after it.

### 0.23 The Leads Import Had Never Written A Single Row

Found by running the delete-gate fixture through it. The mapping flow completed,
Preview showed 6 rows, Import was pressed, and nothing arrived — with no error
on screen.

**Three defects, stacked.**

**1. The client sent a shape the endpoint refuses.** `ModalLayer.jsx` posted the
whole array in one request; `leads.mjs` POST began `if (!data.id) return 400`.
An array has no `.id`. Unlike accounts, contacts and opportunities — all of which
gained an `Array.isArray(data)` branch under 18b8 — leads never did. **Every
leads CSV import returned 400 before touching the database**, in every deploy the
feature has existed.

**2. The response key was wrong too, independently.** The handler read
`data.leads`; the single-insert branch returns `{ lead: inserted }`. Two mistakes
on one call, each sufficient alone.

**3. The failure was invisible, which is why it survived.** `doImport` caught the
error into `setParseError`, but `parseError` rendered only inside the
`step === 'upload'` block. The request fires from the **preview** step, which had
no error surface. The modal absorbed a 400 and sat there looking idle.

**Fixes.** Bulk branch added to `leads.mjs`, mirroring accounts/contacts: empty
array short-circuits, every row must carry an id, scoring config read once per
batch, then `bulkInsert` for chunking and per-row isolation. Scoring on the bulk
path calls `scoreLead` directly rather than `scoreColumns` — the latter queries
`activities` by `leadId`, and these ids are freshly minted client-side, so it was
one guaranteed-empty round-trip per lead. No `lead.created` webhook or automation
on the bulk path (N inline dispatches would exceed the same budget `bulkInsert`
is bounded by); the single-insert branch still dispatches. `ModalLayer.jsx` now
uses `bulk.postNew`, committing `landed` before raising (18b15).
`LeadImportModal.jsx` renders `parseError` on the preview step and clears it on
retry.

---

### 0.24 Two Ownership Columns That Do Not Exist

`contacts.mjs` performed object-level authorization against
`contacts.createdBy`. **That property is not on the contacts table and never has
been** — the column is `assignedRep`. Drizzle resolves a missing property to
`undefined` rather than throwing, and `undefined` then meant two different things
in two different callers:

| Site | Effect for a rep |
|---|---|
| single PUT (`:115`) | `db.select({ owner: undefined })` **threw → 500** |
| single DELETE (`:147`) | same → **500** |
| bulk PUT `ownerColumn` (`:106`) | `if (ownerColumn)` false → owner never projected → **no row could be forbidden** |

So contact edit and contact delete were hard 500s for every rep, and the bulk
overwrite path **failed open**: any rep could overwrite every contact in the org.
Two hard errors and one silent authorization bypass, from one wrong name.

It survived because every unit test, every integration stub and every manual
session authenticated as **Admin**, which returns early from `canSeeAll` and
skips the ownership branch entirely. The rep path had never executed.

**The fix is the class, not the instance.** `netlify/functions/_ownership.mjs`
now holds a registry — entity → owner property — plus the policy as a pure
predicate. `assertOwnership()` in `_lib.mjs` is the query half, returning a ready
403 or null. An unregistered entity throws; a registered-but-missing property
throws **by name** rather than degrading to `undefined`.

`tests/ownership-registry.test.mjs` checks every registered property against the
real table by reading `db/schema.ts` as text — deliberately source-level so it
runs in the **default** suite with no database.

**The guard found a second instance on its first run.** `activities.mjs` selected
`activities.repName`; that column does not exist either — it is `author`. Two
more sites, both 500s for a rep. Delete-gate step 14 would have failed exactly as
step 12 did, and the second instance would have looked like the first bug
recurring rather than a different wrong column.

**Policy decisions, recorded deliberately:**
- **Fail closed** when `getCallerName` returns null — no resolvable name owns
  nothing, so owned records are refused rather than treated as unowned.
- **Unassigned records stay mutable** by any writer. That is how a rep picks up
  unowned work, and the delete-gate fixture depends on it.
- Contacts point at `assignedRep` rather than gaining a `createdBy` column: no
  migration, and nothing touches the Neon `main` branch dev and production share.

**Ownership only bites where the column is populated.** Existing contacts with a
null `assignedRep` remain deletable by any rep. That is the intended policy, but
on current data it means most contacts are effectively unowned. Backfilling is a
separate, deliberate data decision.

`tests/integration/contacts.itest.mjs` adds nine rep-role tests, including the
fail-open one asserting `forbidden: ['ct_bulk_other']` with the row untouched.

### The child-promotion defect is CLOSED

Confirmed on dev with before/after evidence (FIXTURE_MANIFEST step 15), then
fixed: `accounts.mjs` now runs the promotion `UPDATE` **after** `requireRole` and
**after** the delete has confirmed a row was actually removed. Promotion is a
consequence of a deletion, not of an attempt — a 403 and a 404 both return before
reaching it. Ordering after the delete is safe because `parentAccountId` has no
foreign key, so nothing fires in the window between the two statements. The audit
entry and the response now both carry the number of sub-accounts detached; a
deletion that silently restructured other rows is the shape this defect had.

Five integration tests pin it (`tests/integration/accounts.itest.mjs`): refused by
the role gate, refused by the ownership check, Admin success, unknown id, and
org-scoping. **The second assertion in each is the point** — the 403s and the 404
were already correct, so asserting only those would pass just as happily against
the broken ordering.

One of those tests initially passed while swallowing a 500: it tried to create a
parent in org B carrying org A's id, which is impossible because `accounts.id` is
a **global** primary key rather than unique-per-org. The insert failed, the test
passed anyway because its assertion did not depend on that row. Corrected, and
every seed in the file now asserts a 201. Integration tests 21 → 26.

**Still hand-rolled:** nine ownership checks across accounts, opportunities,
leads and tasks. Their columns are correctly named — the guard confirms it — so
they are not broken, merely not yet centralised.

---

### 0.25 The Integration Suite Had Been Dead At Import

`npm run test:int` failed before a single test ran:

```
SyntaxError: The requested module './auth.mjs' does not provide an export named 'isReadOnly'
```

`mock.module` **replaces** a module wholesale, so the stub must export every name
the endpoint imports. It exported two — `verifyAuth` and `canSeeAll` — while the
endpoints had since grown `isReadOnly`, `requireRole` and `requireWrite`.

**Nothing in either integration file had run since `requireWrite` was added.**
That includes the whole cross-tenant isolation suite: org read leakage,
cross-tenant upsert, and the `clear=true` regression guard written after the user
wipe. All present, all dormant, all reading as coverage. It was invisible because
`test:int` is not part of `npm test`, so a broken stub only fails when somebody
runs it — and nobody had.

**Underneath that, a second dormancy: the test database schema had drifted.**
Once the stub was repaired, every contacts insert failed with
`column "account_id" does not exist` (42703). `drizzle-kit push` had never been
run against `DATABASE_URL_TEST`.

**Fixes.** Both stubs now export all five names, and reimplement `requireRole`
and `requireWrite` faithfully rather than stubbing them open — a stub that always
allows makes every authorization test a tautology. `verifyAuth` reads an optional
`x-test-role` header, defaulting to Admin so pre-existing tests are unchanged.
`drizzle.test.config.ts` targets `DATABASE_URL_TEST` only, with a host guard that
refuses to run against the shared app database; it also loads `.env` in-process
because under MINGW64 the node wrapper reports "stdout is not a tty" and writes
nothing to a pipe, so `export VAR="$(node -p ...)"` silently captures an empty
string.

**`x-test-role` makes the delete gate itself automatable.** The manual procedure
in `FIXTURE_MANIFEST.md` — assert the ownership 403 and the role 403 are
distinguishable by message — can now be written as assertions instead of run by
hand each time.

**Two guards worth adding, neither written yet:**
1. A unit test asserting each integration stub's `namedExports` cover every name
   its target endpoint imports from `auth.mjs`. No database; runs in the default
   suite; would have caught this the day `requireWrite` landed.
2. A `before()` hook asserting a recently-added column exists, failing with
   "run drizzle-kit push against DATABASE_URL_TEST" instead of a wall of SQL.

---

### 0.26 Identity Is Stored In Two Places And They Disagree

Surfaced during delete-gate step 13. A task created by a rep, assigned to
`Karen Russell` from the roster picker, did not appear in that same rep's own
task list.

```
clientCurrentUser : "accelerep@outlook.com"
taskAssignedTo    : "Karen Russell"
```

`App.jsx:95` derives `currentUser` from **Clerk's** `firstName + lastName`, with
the email address as fallback when both are blank. Every ownership column in the
database stores **`users.name`**. Nothing keeps the two equal, and this rep's
Clerk profile had no name set, so the client called her by her email while the
server called her by her name.

**The blast radius is not just the task list.**
- `isRepVisible` (`App.jsx:569`) is `!repName || repName === currentUser`, so in
  the UI she saw only *unowned* records. Her eight opportunities were visible via
  the console only because that filtering happens server-side against
  `users.name`.
- Anything she creates is stamped with the client value —
  `useActivities.js:123` sets `author: currentUser`. An activity logged by that
  rep would carry the email, and the server's ownership check would refuse the
  delete with a **403 that looks exactly like the gate working correctly**.

**Resolved for now** by setting first and last name in Clerk, after which
`currentUser` matched and the tasks appeared.

**Not fixed.** `currentUser` should not be derived from Clerk when every
ownership column stores `users.name`. It should come from the `?me=true` roster
row, which `users.mjs` already serves and already self-heals id/name drift, with
the Clerk name only as a fallback for a user with no roster row. One source, and
the email fallback stops being reachable. Small edit, wide reach — `currentUser`
feeds visibility on every tab — so it wants its own batch and its own
verification. **Any invited user whose Clerk profile has no name hits this.**

**Related, same session:** `GET /users` was Admin-only, and
`useSettings.js:196` swallowed the 403, leaving `settings.users` as `[]` for
every rep. Every user picker in the app rendered an empty typeahead — the
Assigned To field on a task looked broken when it simply had nothing to offer,
and a rep could not assign a task even to themselves. `users.mjs` now answers a
GET from any org member with a **directory read** (`id`, `name`, `active`, plus
`directory: true`); email, role, quota, team, territory and the profile blob stay
Admin-only, and all writes stay behind the existing gate. Names were never secret
here — ownership is stored and displayed as display names throughout the UI.

---

### 0.28 Identity Split — `users.id` Is Ours, Clerk's Id Is An Attribute

**All data was test data and there were no live customers**, which is the only
reason this was done as one migration rather than a phased dual-write. That
window is now closed for anything similar.

**What changed.**

| Before | After |
|---|---|
| `users.id` = Clerk userId, or `pending_…` **overwritten at acceptance** | `usr_<uuid>`, generated by us, never reassigned |
| Clerk identity IS the primary key | `clerk_user_id` column, NULL until acceptance |
| `users.email` **globally unique** — one address, one org, forever | `uniqueIndex(orgId, email)` |
| Caller looked up by `users.id`, **unscoped** | by `(clerkUserId, orgId)`, `orgId` required or throws |
| `getCallerName(userId)` | `resolveCaller(clerkUserId, orgId)` → `{ id, name }` |
| Sync **rewrote** `users.name` from Clerk | drift REPORTED as `nameDrift`, never applied |

Ten rows migrated across two orgs, all ten linked to Clerk, zero unlinked.
Verified three ways: row contents, `pg_indexes` names, and `indisunique`.

**Why the email constraint mattered more than it looked.** `users.mjs:430` checks
for an existing row *scoped to the org*, finds nothing, inserts, and the global
constraint rejects it — returning "A user with that email address already
exists." Customer B is told they cannot invite their own employee, and the
message confirms that person exists somewhere else in the system. A hard blocker
for any consultant or partner working with two customers, plus a cross-tenant
disclosure. It had been worked around in development with three separate email
addresses for one person.

**The fail-open bulk path.** Found only because an integration fixture was left
seeding the OLD identity. `bulkUpsert` treated a null `callerName` as the
canSeeAll signal, and the caller resolver returns null when it cannot identify
anyone. Unreachable while every caller resolved to a name; the identity split
made it reachable — any unlinked user — and on the bulk path that is unrestricted
write access to every record in the org. Fixed by an explicit `canSeeAll`
parameter defaulting to `false`, routed through `mayMutate()` so the bulk and
single-record paths share one policy. See guide **§18b20**.

**A test was certifying it.** `a null callerName may edit everything` did not
merely miss the bug — it asserted the bug was correct, and would have survived
mutation testing while doing so. Replaced by three tests: the Admin bypass, the
unidentified-caller refusal, and the default direction. The pairing is the point;
closing the hole is trivial if you are willing to refuse Admins too.

**And one of the new guards was scenery.** The schema test asserted the STRING
`users_org_email_uq` appeared in `db/schema.ts`. Changing `uniqueIndex(` to
`index(` leaves the name intact, enforces nothing, and the test still passed.
Reported SURVIVED by the mutation harness and fixed to assert the constructor.
Written by someone who had flagged that same trap during the migration an hour
before — which is the argument for mutation testing in one sentence.

**Found in passing, not fixed:**

- `documents.mjs:244` sets `ownerName: auth.userName || data.ownerName || 'Unknown'`.
  `verifyAuth` **never returns `userName`** (`auth.mjs:74`). So document owner
  names come from the client's request body, or are literally "Unknown". Same
  shape as §0.24 — a property name that names nothing.
- `schema.ts:637` says `dispatchTechnicians.userId` is `// FK → users.id`, but
  `dispatch-technicians.mjs:60` compares it against the **Clerk** id. Nothing
  breaks — that subsystem compares Clerk id to Clerk id and never joins — but the
  comment now asserts the opposite of the adjacent code.
- **Renaming a user detaches every record they own.** Ownership columns store
  display names. Nothing in the code prevents the rename, and nothing warns. The
  automatic path (`users-sync.mjs`) is suspended; the manual path through the
  Users panel is not. This is what Phase 2 exists to end.
- **`users.name` has no unique constraint.** Two people with the same name in one
  org would share ownership of each other's records, and every gate would agree
  it was fine. Not observed in the current data; not prevented either.

**Deferred deliberately:** the Users settings panel does not yet surface the
`nameDrift` list the sync response now returns.

---

### 0.27 What This Batch Says About the Gates

Every defect above was found by running the app as a **rep**. All six gates were
green before each fix and after it. They could not see any of it:

- §0.23 lived *between* the client and the endpoint, each internally coherent.
- §0.24 was a valid JavaScript identifier that happened to name nothing.
- §0.25 was a test suite that is not part of `npm test`.
- §0.26 is two stores of one string with no invariant between them.

The common thread is not carelessness — it is that **the rep path had never been
executed by anything**: not the unit tests, not the integration stubs (Admin
hard-coded), not manual testing. A role matrix over the mutating endpoints is
worth more than any additional gate.

---

## 0PB. Prior Batch — The Importer Reports What Landed, and Three Rules Composed Wrongly

> Four backlog items turned out to be one defect with four faces. The importer's
> Results screen reported numbers that were never derived from what the server
> said: some were parsed back out of an error sentence, some were the count the
> CLIENT decided to send, and one path threw the server's answer away without
> reading it. Every one of them failed in the reassuring direction.

### 0.1 Counts travelled as prose

`CsvImportModal` recovered its Results figures by regex-parsing the thrown error
message:

```js
const isPartial = msg.includes('of') && msg.includes('failed to save');
const m = msg.match(/(\d+)\s+of\s+(\d+)/);
```

So the numbers a user saw depended on the wording of a string thrown in another
module. The accounts phase of a contacts import throws about **companies** — "2
of 3 new companies failed to save" on a 5-contact file rendered **"1 of 5 records
saved"**: a number describing companies, presented as contacts, against a total it
did not come from. Both figures wrong, both reassuring.

Replaced by a **receipt** — `src/utils/importReceipt.js`. Numbers come off the
response, travel as fields, and prose is generated FROM them at the very end by
`describeReceipt()`. Nothing parses a sentence back into a number. `ImportError`
carries the receipt; `receiptFromError()` returns `null` for anything else, so a
`TypeError` in a handler is no longer rendered as a counted partial failure.

The invariant `attempted === created + updated + failed` is asserted directly.
`skipped` and `dropped` sit deliberately outside it — neither was ever sent, and
folding them into `failed` is how "6 rows in, 0 out" came to render as success.

### 0.2 `saveBulk` threw from inside its own loop

§18b15 states the rule and names `postNew` as the compliant example — an early
chunk that succeeded has to reach state before the failure is reported. `saveBulk`
sat twenty lines above `postNew` in the same file and violated it: a failure on
chunk 3 discarded the accumulated `updated` / `notFound` / `forbidden` from chunks
1 and 2, rows already written server-side.

It was inert only because the overwrite paths wrote state optimistically **before**
the request — §0.5 masked it. Fixing §0.5 alone would have made it live. Same shape
as §0A0000.1: a correctness fix turning a latent defect reachable. The rule that
predicted it was committed in the same commit as the code that broke it.

### 0.3 The opportunities overwrite bypassed chunking entirely

`ModalLayer.jsx:664` called `dbFetch` directly with the whole array and read the
body **only when the response was not ok**. Contacts and accounts both went
through `saveBulk`. Consequences, in order of severity:

- `updated`, `notFound` and `forbidden` were **discarded**. An overwrite matching
  zero ids returns `200 {updated: 0}`, and the Results tile rendered
  "3 overwritten" — `overwriteCount`, the number the client chose to send.
- No client-side chunking, so one request body for the entire file. `bulkUpsert`
  chunks server-side, so this was a payload/timeout risk rather than a bind-param
  crash — but it is the one path §18b8 did not reach.

**§0A0000.10 recorded this check as passing, and it did** — on the refresh, not on
the tile. The tile would have read "3 overwritten" if the server had matched
nothing. Checking the write landed rather than that the call returned is the only
reason that row was evidence.

### 0.4 Both transport helpers extracted and made testable

`postNew` and `saveBulk` lived at module scope in `ModalLayer.jsx`, which imports
React — so neither was reachable by `node --test`, and chunk size, cross-chunk
accumulation and the never-throw contract are all invisible in the return value.
Same argument as `_bulk.mjs`, `quarters.js` and `csvAutoMap.js`.

They are now `src/utils/bulkClient.js`, behind `makeBulkClient(fetchFn)`. The
injected fetch is the same seam `bulkInsert` uses for its db client: the recording
stub goes in through the front door, no module mocks, no `--experimental` flag, no
`window`.

### 0.5 Overwrite state applies from what the server accepted — three paths

`putBulk` returns **`appliedIds`**: `(sent − notFound − forbidden)`, derived per
chunk. `bulkUpsert` partitions each chunk into exactly those three groups, so this
is exact rather than inferred. A chunk whose derivation disagrees with the
server's own `updated` count contributes **no** ids and is counted as a
`discrepancy` — applying an ambiguous set is precisely how the UI came to show
records that were never written, and the honest answer is that a refresh will
settle it.

The handoff and §0A0000.6 both said two paths. It was **three**: contacts at
`ModalLayer.jsx:519` had the identical shape.

### 0.6 The importer no longer congratulates you on importing nothing

`getMappedData()` ended in a silent `.filter()`. An accounts CSV run through the
Contacts importer maps neither required field, so every row failed it: six rows
in, zero out, green tick, *"Import Complete!"*.

Now `src/utils/csvMapping.js`. The drop **rule** is preserved exactly — `.some`,
not `.every`, so a mononym still imports and the required marks mean "at least one
of these". The **silence** is not. `mapCsvRows` returns `dropped[]` with row
numbers counted as the user sees them in Excel (header is row 1), and
`unmappedRequired` names the cause rather than the symptom: *"No column is mapped
to First Name or Last Name."*

Surfaced at **Preview**, the last step where the mapping can still be fixed, and
the primary button is disabled when nothing is importable. Results is too late.

Also fixed there: the tile labelled **"imported"** rendered `total`
(`newRecords.length + overwriteCount`), so an overwrite-only run read
"3 imported · 3 overwritten" when nothing was created. Tiles are now `created`,
`overwritten`, `skipped`, `not sent` and `failed`, each a receipt field, each
hidden at zero.

### 0.7 Tests 89 → 140, and 14 mutations

| Suite | Pins |
|---|---|
| `bulk-client.test.mjs` (18) | chunk size, never-throw, cross-chunk accumulation, `appliedIds` derivation, discrepancy exclusion, progress offsets, POST/PUT methods |
| `import-receipt.test.mjs` (18) | the `attempted` invariant, unsent-chunk accounting, merge precedence, `isClean`/`isPartial`, receipt-not-message |
| `csv-mapping.test.mjs` (15) | the `.some` rule, drop numbering, cause diagnosis, the accounts-in-contacts regression and its control |

`scripts/mutate-import.mjs` breaks each rule in turn and asserts the suites go
red — **14/14 caught**, including both original defects (`putBulk` throwing
in-loop; drops going silent) and the `.some` → `.every` tightening. Files are saved
and restored in memory, never via `git checkout`, which has reverted unrelated
fixes mid-session before.

### 0.8 Confirmed on dev — and check 1 failed

Run against `accelerep.netlify.app` with `ZZTest` opportunities. §18b8 is explicit
that generation proving out is not execution proving out, and this is what that
buys you.

| Check | Result |
|---|---|
| A comment survives a CSV overwrite | **FAILED** — Team Notes, the linked contact and the stage history were all erased. Root-caused to the endpoint; see §0.9 |
| Deals themselves survive | Pass — the three deals persisted, reverted to their seeded field values |
| Accounts CSV into the Contacts importer blocks at Preview | not yet run |
| An overwrite of deleted records reports failure, not success | not yet run — same path as §0.9, retest after that ships |
| Overwrite counts survive a hard refresh and match the tiles | not yet run |
| Avatar timezone PUT fires once (carried from §0A0000.10) | not yet run |

**No production exposure.** Nobody is running Accelerep in production; every
affected row was dev `ZZTest` data. This is a bug, not an incident.

### 0.9 The overwrite was still destructive, and the fix was in the wrong file

`sanitize()` in all three endpoints is a **full-row builder, not a filter**. It
does not narrow a payload; it expands one, emitting every column with a default:

```js
stageHistory:     data.stageHistory     || [],
comments:         data.comments         || [],
contactIds:       data.contactIds       || [],
pipelineId:       data.pipelineId       || 'default',
createdBy:        data.createdBy        || null,
```

That is correct for POST, where the row does not exist. The bulk PUT branches ran
`rows: data.map(d => sanitize(d))`, and `bulkUpsert` derives its `SET` clause from
the keys supplied — which after `sanitize()` is **every** key. A seven-column CSV
overwrite wrote roughly forty columns.

**§0A0000.1 fixed this in the caller.** `buildOpp` stopped sending `stageHistory`
/ `comments` / `contactIds`; `sanitize()` put them straight back. The client-side
fix was correct and completely ineffective — and §18b13 already said, in as many
words, that a partial PUT fix belongs in the endpoint and not the caller. The rule
was right, committed, and not applied to the file it was about.

It is also why §0A0000.10 recorded the opportunities overwrite as passing. It did
pass, on stage and ARR — both CSV columns, both genuinely written. Every field the
CSV did *not* carry was being destroyed in the same request, and no check looked
at one until now.

**Fix:** `netlify/functions/_sanitize.mjs`. `partialRows(rows, sanitize)` narrows
each sanitized row to the columns the payload actually supplied, as a union across
the batch so the multi-row INSERT keeps one shape. Wired into the bulk PUT branch
of `opportunities.mjs`, `contacts.mjs` and `accounts.mjs` — accounts and contacts
had the identical shape and had been destructive a session longer.

The distinction the old code could not make: **a column not mapped in the CSV
never appears and is never written; a column mapped and left empty appears in
every row and is written empty.** `sanitize()` made both look supplied.

Pure and dependency-free for the usual reason — all three endpoints import
`db/index.js`, which is TypeScript, so anything defined in them loads only under
`tsx` and never runs in the gates.

**Tests 140 → 151, mutations 14 → 17.** `tests/partial-sanitize.test.mjs` pins the
narrowing, the batch union in both directions, the coercion surviving on kept
columns, and the exact regression — the CSV overwrite shape asserted not to carry
`stageHistory`, `comments`, `contactIds`, `createdBy`, `createdDate`,
`stageChangedDate` or `pipelineId`.

One clause was written and then deleted: an `ALWAYS_KEEP = ['id']` guard. The
mutation harness survived its removal, because every bulk branch 400s on a row
without an id, so it could never fire. Removed rather than given a contrived test
— §0A0000.3, a clause that cannot fire is worse than none.

**Not yet confirmed on dev.** Retest check 1 in full after deploy, then check 4,
which exercises the same path.

### 0.10 The fix in §0.9 then 500'd, for the reason §0.9 exists

Retested on dev. The overwrite no longer destroyed anything — it failed outright:
*"Nothing was saved. 3 did not save. Internal server error."*

`opportunities.pipelineId` is `.notNull()` with no database default.
`INSERT ... ON CONFLICT DO UPDATE` **is an INSERT first**: Postgres forms the
candidate tuple and checks its constraints BEFORE resolving the conflict and
switching to the update. So every NOT NULL column without a default must be
present in the values — even for a row that already exists and will only ever be
updated.

`partialRows` correctly stopped sending `pipelineId`, because a CSV does not
describe which pipeline a deal is in. Correct narrowing, incompatible upsert.

**Fix:** `bulkUpsert` now backfills NOT NULL-without-default columns **from the
row that already exists**, and keeps them out of the SET clause. The tuple can
form; the update still writes only what the caller supplied. The backfilled value
is never invented — the old `sanitize()` default of `'default'` would have moved
every overwritten deal into another pipeline.

Required columns are detected generically off Drizzle's own `notNull` /
`hasDefault`, so a future NOT NULL column is covered without anyone remembering.

**`bulkUpsert` moved from `_lib.mjs` to `_bulk.mjs`,** injected client, same as
`bulkInsert`. It shipped a 500 that a test would have caught in one line, and it
could not be tested at all where it lived. `tests/bulk-upsert.test.mjs` (14) pins
both properties that are in tension — omitted columns are never written (18b13),
NOT NULL columns still reach the INSERT arm — because fixing either alone
reintroduces the other bug.

**Tests 151 → 165, mutations 17 → 21.** One mutation initially survived: the
fixture omitted `updatedAt`, so "does not backfill defaulted columns" had nothing
to catch. A fixture that omits a column cannot prove the code declined to copy it;
it proves only there was nothing to copy.

**Worth recording:** the Results screen behaved exactly as designed. It said
*"Nothing Was Imported"*, showed `3 failed`, and printed the requestId. The
previous UI would have shown a green tick and "3 overwritten". §0.1–§0.6 are what
turned an opaque 500 into a diagnosis.

**Still not confirmed.** Retest check 1 in full after deploy.

### 0.11 The deploy failed on a tree where all five gates were green

```
✘ No matching export in "netlify/functions/_lib.mjs" for import "bulkUpsert"
✘ No matching export in "netlify/functions/_lib.mjs" for import "bulkInsert"
```

Moving `bulkUpsert` out of `_lib.mjs` deleted the span between two anchors, and
`export const bulkInsert` sat inside it. The follow-up replace that was meant to
re-add the binding matched text that no longer existed, so it was a silent no-op.

**Every gate passed. Every one of 165 tests passed.** The unit tests import from
`_bulk.mjs` directly, so nothing exercised the edge that broke.

The reason is structural, not a slip: **`npm run build` runs vite, and vite bundles
`src/`. The Netlify functions are bundled separately by esbuild at deploy time.**
No gate had ever resolved an import edge between two function files. An entire
class of error — the one esbuild exists to catch — was invisible to CI and visible
only in a deploy log. That is a gate gap by §18b11's own definition.

**Closed:** `tests/function-imports.test.mjs`. Parses every `netlify/functions/*.mjs`,
resolves each relative import against the target's actual exports, and fails with
esbuild's own wording. A file that will not parse is its own failure rather than a
quiet skip (§18b6).

Proven both directions before being trusted: with the two export lines removed it
names `accounts.mjs:5`, `contacts.mjs:5` and `opportunities.mjs:8` — the same file
and line Netlify reported — while `check:tdz`, `check:dbfetch` and the build guard
all stay green on that same tree.

Also run directly now as a belt-and-braces check: `esbuild --bundle` over the three
changed functions, which is what Netlify actually does.

**Tests 165 → 167, mutations 21 → 23.**

**The pattern, for the third time in one session.** A correct fix broke something
downstream that nothing was watching: the client fix was undone by the server
(§0.9), the server fix was rejected by the upsert (§0.10), and the extraction that
made the upsert testable broke the import graph (§0.11). Each was caught one layer
later than the last — unit test, dev check, deploy log. The gate added here pulls
the last of those three back into CI.

### 0.12 Check 1 run: three of four probes survived, and the fourth found the other half

| Probe | Result |
|---|---|
| 💬 Team Notes (`comments`) | **survived** |
| Linked contacts (`contactIds`) | **survived** — all three |
| Stage history (`stageHistory`) | **survived** |
| Description / Background (`notes`) — positive control | **changed** to the OVERWRITTEN text, so the overwrite genuinely ran |
| **Next Steps (`nextSteps`)** | **BLANKED** |

The three that survived are not in the importer's field list at all. Next Steps
is. That is the entire difference, and it is the tell.

`mapCsvRows` wrote `''` for **unmapped** fields as well as empty ones:

```js
record[field.key] = isMapped(colIdx) ? (row[colIdx] || '') : '';
```

So a CSV with no Next Steps column still sent `nextSteps: ''`. `partialRows` saw a
supplied column, `sanitize()` coerced it to null, and the overwrite blanked it.
**Server-side narrowing is necessary and not sufficient** — it can only omit what
the client did not send, and the client was sending everything.

`_sanitize.mjs` carried the claim *"a column NOT MAPPED in the CSV never appears in
any row"*. It was never verified, and it was false. Both files now carry the
contract explicitly and each points at the other: **unmapped is omitted; mapped is
present even when the cell is empty.**

New records are unaffected — `buildOpp` and the account/contact mappers all
coalesce with `|| ''`, so an absent key still lands as empty. Every downstream
consumer of a mapped record was already undefined-safe (`?.`, `|| ''`,
`filter(Boolean)`, `norm()`), checked one by one.

**A test asserted the wrong behaviour, confidently.** `an unmapped field is present
and empty, never undefined` had a plausible rationale about `undefined` vs `''` and
was exactly backwards. It is inverted now, with the reasoning recorded, plus a
regression pinning an overwrite payload to the file's columns only. Mutation
testing does not catch a test that encodes the wrong rule — only running the thing
does.

**Tests 167 → 169, mutations 23 → 25.** Both directions of the contract are
mutation-covered: emitting `''` for unmapped fields again, and dropping
mapped-but-empty columns.

**Still not confirmed.** Re-run check 1 with all four probes.

### 0.13 Next Steps was still blanked — `buildOpp` re-materialised every column

Re-ran check 1 with §0.12 deployed. Same result: three probes survived, Next Steps
blanked, control fired.

`mapCsvRows` was omitting unmapped fields correctly. `buildOpp` put them all back:

```js
salesRep:           o.salesRep           || currentUser,
implementationCost: parseFloat(o.implementationCost) || 0,
nextSteps:          o.nextSteps          || '',
```

Thirteen columns, built unconditionally, whatever the file contained. Narrowing at
the mapper and narrowing at the endpoint were both defeated by the step between
them.

**And Next Steps was the least of it.** Every overwrite also:
- **reassigned the deal** — `salesRep || currentUser` took ownership for whoever
  ran the import
- **zeroed `implementationCost`** — `parseFloat(undefined) || 0`
- blanked `products`, `territory`, `vertical`

Nobody noticed because Next Steps was the field being watched. The other three
probes survived only because Team Notes, contacts and stage history are **not in
the importer's field list at all**, so nothing existed to re-materialise them.

**The comment directly above the code said the opposite:** *"an overwrite now
sends only the columns the CSV actually describes and the server merges the
rest."* Written in §0A0000.1, describing an intent the code beneath it never
implemented. Third false comment of this shape in one session — §0.9's
`sanitize()`, §0.12's `_sanitize.mjs`, and this.

**Fix:** `src/utils/importRows.js`. `buildOpportunityRow` coerces only keys the
record actually carries (`hasOwnProperty`, so a mapped-but-empty column still
asserts empty), and the create and overwrite paths are now structurally distinct
rather than one shape with a branch. `createdDate` is dropped from an overwrite
entirely — provenance is not content, and a file carrying a Created Date column
must not rewrite when the deal was created.

Contacts and accounts were already correct once §0.12 landed — both overwrite
mappers are pure spreads of the mapped record. Only opportunities had a builder.

**Tests 169 → 185, mutations 25 → 29.**

**Three narrowing points, and all three had to be right.** `mapCsvRows` decides
what the file described; `buildOpportunityRow` must not add to it;
`partialRows` narrows the sanitized row back down to it. Each was fixed in turn
and each time the next one downstream undid it.

**CONFIRMED ON DEV.** Check 1 passed after a hard refresh, third attempt:

| Probe | Result |
|---|---|
| Next Steps (`nextSteps`) — unmapped column | **survived** |
| 💬 Team Notes (`comments`) | **survived** |
| Linked contacts (`contactIds`) — all three | **survived** |
| Stage history (`stageHistory`) | **survived** |
| Sales rep | **not reassigned** |
| Description / Background — positive control | **changed**, so the overwrite ran |
| Stage / Revenue | Proposal, $44,000 |

Three attempts, three distinct defects: the server re-expanded the payload
(§0.9), the endpoint then rejected the narrowed row (§0.10), the mapper emitted
`''` for unmapped columns (§0.12), and the builder put every column back (§0.13).


### 0.14 Two columns the importer can write and nothing else can

Raised by Jeff during check 1: **Products and Territory have no input on an
opportunity.**

- **Products** — the picker (`toggleProduct`, `setProductRevenue`) was deleted in
  `4bab072`, 23 Apr 2026, *"remove ARR term and replace with ARR"*. Product line
  items moved to the Quotes tab, which the modal still says under Revenue.
  Intentional; the column was not retired with it.
- **Territory** — `handleChange('territory')` has **never existed** in
  `OpportunityModal` across all 1,161 commits. The only territory inputs are on
  users (`UsersDetail`, `UserModal`).

Both are still READ, and one will crash.

**`ReportsTab:6405` treats `products` as an array:**

```js
{selectedOpp.products?.length > 0 && <>
    {selectedOpp.products.map((p,i) => (
```

The schema is `text('products')`. A non-empty string passes `.length > 0` and then
`.map is not a function` — **TypeError, and the Reports panel goes behind the error
boundary.** Same shape as the ReportsTab TDZ incident in §0A000.1.

Nothing can populate `products` through the UI any more — **but the CSV importer
still can, and it writes a string.** Latent since April, reachable only through the
importer, which means it became reachable again the moment CSV overwrite started
working (§0A0000.1).

`territory` is read at `ReportsTab:3883`, driving a territory grid that filters
`o => o.territory` and buckets pipeline by it. No crash, but the visualisation can
only ever be fed by CSV import — the §0.7 shape one table over: a feature whose
input has no author.

**Decide, do not drift:** fix the ReportsTab consumer to accept a string (safer —
existing rows may already hold one), or drop `products` from the importer's field
list so nothing can write one. Territory is the same call as handoff item 2.

### 0.15 An import-driven stage change is not recorded

Noticed while confirming check 1. The overwrite moved the deal to Proposal, and:

- `stageChangedDate` was **not** updated — correctly, in that the client does not
  send it, but it means "0 days in Proposal" is measured from the deal's creation
  rather than from the stage change. A deal moved by import can therefore read as
  fresh indefinitely, which is the **inverse of the `NaN > 14` never-stale bug in
  §0A0000.8** and has the same consequence.
- `stageHistory` gained **no entry**, so an import-driven stage change is invisible
  in the History tab.

§0A0000.1 established that an import must not WIPE stage history. Whether it should
APPEND to it is a separate, unanswered question. The client cannot answer it — it
does not know the prior stage. The endpoint does: `bulkUpsert` already selects the
existing rows. **Product decision, not a bug fix.** Left as a decision rather than
quietly implemented.

### 0.16 Delete was never gated, and was never audited anywhere

Raised as a feature request — "Admins should be able to delete deals". The
endpoint already existed, and the gap was the opposite of that.

**All six entities had the same shape:** `clear=true` (org-wide wipe) was
Admin-gated AND audited; the per-id delete beneath it was ownership-checked only
and **audited nothing**. So:

- The rule *"reps cannot delete deals, they close them Won or Lost"* was **design
  intent only**. `canSeeAll` is false for a rep, so the ownership check passed on
  their own records — **a rep could delete their own deals through the API.**
- **Six endpoints, six single-record deletes, zero audit records.** A deal,
  account, lead, contact, task or activity could be removed leaving no trace.
- An unknown id returned `success: true` having deleted nothing.
- `useOpportunities.js:67` already called the endpoint with no UI surfacing it —
  the §18b7 shape, wiring without a feature.

**Now:** `requireRole(auth, ['Admin'])` on the per-id delete for **opportunities,
accounts and leads**; contacts, tasks and activities keep the rep-level ownership
check, per Jeff's call. All six capture the row with `.returning()` and write an
audit record built by `netlify/functions/_audit.mjs`, and all six 404 on an
unknown id.

A hard delete destroys the audit trail's subject, so the record carries a
**snapshot** — name plus the fields that identify it. An `entityId` alone cannot
be resolved back to a name once the row is gone.

**Still to build: the Admin-only UI.** `handleDelete` in `useOpportunities.js` is
wired to nothing. Deliberately not half-built here — the backend is verified and
the UI is a clean separate piece.

### 0.17 Import: stage clock and history

Per Jeff: an imported deal should sit at the stage the file says, and days-in-stage
should be importable, defaulting to zero.

**`stageChangedDate = importDate − daysInStage`.** No new concept and no schema
change — days-in-stage is a back-dated write to a column that already exists, so
stall detection, the funnel and "0 days in Proposal" all work unchanged.

The unconditional version of this rule is a trap and was rejected. Re-importing
the same file is normal here, so stamping `importDate` on every overwrite would
reset every deal's stage clock on every refresh and **nothing would ever flag as
stalled again** — while looking entirely plausible. The clock therefore moves only
when the stage actually changed, or when the file explicitly asserts a value,
which is the same mapped-is-an-assertion contract as §0.12/§0.13:

| stage changed | daysInStage mapped | stageChangedDate |
|---|---|---|
| yes | yes | `importDate − days` |
| yes | no  | `importDate` |
| no  | yes | `importDate − days` — asserted |
| no  | no  | **untouched** |

A stage change also appends `{ prevStage, stage, date, source: 'import' }` to
history, **built server-side from the array already in the database.** The client
never sends a `stageHistory` array — that is what wiped history in §0A0000.1, and
this is the one place the field legitimately re-enters a write. The entry carries
the DERIVED date, or History would contradict the header.

Guards: a negative value is clamped to zero (a future `stageChangedDate` makes
`days > 14` permanently false — the never-stale bug through the front door), a
non-numeric value is treated as unmapped rather than guessed, and anything over
ten years is ignored rather than dating a deal to 1753.

Only the server can resolve this — the client does not know a deal's prior stage —
so it runs in `opportunities.mjs` with **one** SELECT for the batch. The create
path has no prior stage, so it derives the date in the browser; the two pure date
helpers live in `src/utils/stageClock.js` and `_stage.mjs` re-exports them, because
two implementations of one date rule is how they drift.

One audit record per batch, not per deal: a 500-row import moving 200 deals is one
action by one person. No per-deal emails.

**Tests 185 → 209, mutations 29 → 36.** A second unreachable clause was written and
deleted — an outer cap on the audit snapshot that could never fire because values
are already truncated at 60 and there are at most five fields. Same call as
`ALWAYS_KEEP` in §0.10, same reason (§0A0000.3).

**Not confirmed on dev.** Nothing here has been exercised.

### 0.18 Session close — what is confirmed and what is not

**Confirmed on dev, by running it:**

| | |
|---|---|
| Check 1 — CSV overwrite preserves Team Notes, contacts, stage history, Next Steps | passed, hard-refreshed, third attempt |
| Receipt reports created vs overwritten accurately | passed — "2 created, 1 overwritten" matched the list exactly |
| Admin delete + audit | passed — five deletions, audit records written |
| 404 on an unknown delete id | passed — a placeholder id returned 404 where the old code returned `success: true` |
| Partial PUT on `dispatch-technicians` | verified by reading it — `if (f in data)`, id from the query param. **Clean.** The pattern `_sanitize.mjs` exists to impose on the bulk endpoints |

**Committed, gated, and NOT exercised on dev:**

- The delete sweep across all six entities — in particular the **Admin gate**. The
  sharpest test is running a delete from a Technician or User account and getting
  **403**. Never run.
- The import stage clock (§0.17) in every one of its four cases.
- **Days in Stage** as a mapped column.
- Dev checks 3 (accounts CSV blocked at Preview), 4 (`notFound`), 5 (avatar timezone).

Check 4 was attempted twice and **never reached `notFound`** either time. Conflict
detection matches against deals that currently exist, so deleting them first makes
them new records rather than missing targets. Reaching it needs the modal held at
the Conflicts step while the deletes run — a genuine race, and a fair thing to
defer.

### 0.19 Field evidence of §0.9, found by accident

Three ZZTest deals from the 14 August session carried **`createdDate: null`**.
That is §0.9's `sanitize()` expansion, visible in real rows: `createdDate ||
null` was written over real provenance by the overwrite. §0A0000.10 recorded that
check as passing, and it did — on stage and ARR. Nobody looked at provenance.

`dealAge` handles the null correctly and renders —, so there was no `NaNd`. The
data was simply gone, quietly, and the UI told the truth about not knowing.

### 0.20 Technician linkage — a live instance of Clerk ID drift

`dispatch_technicians.userId` for Savannah Miller held
`user_3HaqZL0cu6O6NIpRDG0YvweJs0g`. Karen, the account it was supposed to link, is
`user_3BieCZ9auTtufcerK0lH1FmV9js`. Same org, different user — so
`resolveTechnicianId` found nothing and `dispatch-jobs.mjs:173` returned 403 with
*"No technician record is linked to your account."* That fail-closed path is
correct and worked exactly as designed.

**The orphan id was never identified.** If it is absent from the org's user list it
came from the production Clerk instance — both environments share one Neon `main`
branch while user and org ids differ per instance. **That is the Clerk Production
migration's org-ID sweep, visible in a single row, before cutover.** Worth chasing.

Resolved: Savannah unlinked (`userId: null`, confirmed from the response body),
Karen moved Technician → User and verified server-side (`opportunities` 200 on her
own token — a Technician is denied there by default, so 200 is proof the Clerk
metadata changed and not just the Settings mirror).

**Two UI gaps found in passing, neither fixed:**

- A Technician with no linked record sees a bare `Dispatch data failed to load:
  jobs (403)` and a one-tab nav. The endpoint's message is already good; the client
  drops it. Same class as the importer congratulating you on importing nothing —
  the information existed and the UI discarded it.
- `dbFetch` logs `DB error 403` for a response the caller **deliberately expects**
  (`useSettings.js:196`, `// 403 for reps — don't touch users array`). Harmless,
  but it trains you to ignore console errors, which is a poor habit in a product
  that produced four silent-failure bugs in one day.

### 0.21 The pattern this session actually established

Seven defects. **Four were in code written during this session**, and every one of
those four was caught by Jeff running the app — none by a gate, a test, or a
review.

The chain, in order, each one exposed only by fixing the last:

1. `sanitize()` re-expanded the payload server-side (§0.9)
2. narrowing it made the upsert's INSERT arm fail NOT NULL (§0.10)
3. extracting `bulkUpsert` to make that testable broke the import graph (§0.11)
4. `mapCsvRows` emitted `''` for unmapped columns (§0.12)
5. `buildOpp` re-materialised all thirteen columns anyway (§0.13)

**Three false comments were found, all written by a previous session, all claiming
the behaviour the reader wanted to be true:**

- `sanitize()` — presented as a filter, was a builder
- `_sanitize.mjs` — *"a column not mapped in the CSV never appears in any row"*,
  which was never verified and was false
- `buildOpp` — *"an overwrite now sends only the columns the CSV actually
  describes"*, contradicted by the ten lines beneath it

**And a test that encoded the wrong rule, confidently.** `an unmapped field is
present and empty, never undefined` cited 18b13 correctly and drew the opposite
conclusion. It passed, it was mutation-tested, and it certified the bug as
correct. **Mutation testing cannot catch a test that encodes the wrong rule** — it
only proves the test notices when the code stops matching it. Only running the
thing catches that.

Carry forward: **read the next step, do not assert it in a comment.** Every one of
these was a claim about adjacent code that nobody checked.

### 0.22 Three Rules, Each Correct, Composed Wrongly

Three defects this session. None was a wrong rule. Each was a correct rule meeting
another correct rule at a seam neither owned.

#### The stage clock, batched

`applyStageChanges` derives `stageChangedDate` and `stageHistory` PER ROW. A deal
that did not move, in a file asserting no `daysInStage`, gets an EMPTY patch, so
its stored clock survives. That rule is right and the suite proved it.

`partialRows` keeps the UNION of supplied keys across the batch, because
`bulkUpsert` hands one chunk to ONE multi-row INSERT and the rows must share a
shape. That rule is also right, and its reasoning — "if any row in the file
supplies a column, that column is part of what this import describes" — is sound
for CSV columns, where mapped-or-not is a property of the file.

These two keys are not CSV columns. They are derived, per row, after the mapping
step. So one deal moving stage put both into the union for the whole batch, and
every row without a patch went through `sanitize()`, which emitted
`stageChangedDate: null` and `stageHistory: []`, and `bulkUpsert` wrote them.

Observed on dev. A two-row overwrite where Charlie moved and Alpha did not:

| ZZTest Alpha | before | after |
|---|---|---|
| stageChangedDate | `2026-08-06` | `null` |
| stageHistory | 1 entry | `[]` |

Alpha was not mentioned by the file in any way that should have touched those
columns. It lost its clock and its entire stage history because a DIFFERENT deal
in the same import moved stage. In a 500-row import where 200 deals move, the
other 300 are wiped.

**Why 211 tests and 29 live mutations passed over it.** Every existing fixture was
single-row. Delta imported alone would have passed — the defect does not exist in a
batch of one. The fix's tests are all multi-row for that reason.

**The fix.** Two passes. Compute patches first; then, for each derived key that
some row in the batch actually acquired, backfill the rows that did not from the
STORED row rather than from `sanitize()`'s invented default. The shape stays
uniform, so union reason #1 still holds, and the write becomes a no-op instead of
an erasure. Same move as backfilling NOT NULL columns from the stored row in the
`bulkUpsert` INSERT arm.

This required `stageChangedDate` in the priors SELECT in `opportunities.mjs`. It
was not there. Without it the backfill writes null with complete confidence, and
no unit test of `_stage.mjs` can see the endpoint's query — so that dependency is
pinned by a source assertion in `tests/stage-batch.test.mjs`.

#### 37/37 was never true

`scripts/mutate-import.mjs` matched anchors with `\n`. The working tree is CRLF.
Every multi-line anchor therefore never matched, was reported `SKIP`, and its
mutation never ran.

Eight of them. Every single-line anchor caught; every multi-line one skipped. That
is not drift — those eight had never executed on any CRLF checkout, while the docs
recorded 37/37. The harness was reporting coverage it did not have, which is the
failure mode it exists to prevent, one level up.

Anchors are now matched EOL-agnostically and the replacement is rewritten to the
target file's convention. `SKIP` became `STALE ... this mutation DID NOT RUN`, with
a summary line, because the old wording read like a neutral omission rather than an
absence of evidence printed beside genuine passes. It always exited non-zero; that
part was already right.

Now 50 mutations, all caught, no stale anchors.

#### The fiscal quarter, and dates that are not days

`HomeTab` computed `Math.floor(now.getMonth() / 3) + 1` — a calendar quarter that
never read `fiscalYearStart`. Under an October fiscal year, August rendered as Q3
when it is Q4. `getQuarter` was already destructured from `useApp()` at the top of
the file and used correctly 140 lines below for the quota card: the fiscal rule was
in scope and simply not called.

That is the same shape as the stage clock — one rule, two implementations. There
are SEVEN implementations of fiscal-quarter maths in this codebase. Only
`ListView.jsx` imports the tested helper.

Underneath it, a second and wider defect. `toISOString().split('T')[0]` converts to
UTC before truncating, so it returns a date the user is not looking at: tomorrow's
all evening west of Greenwich, yesterday's all morning east of it. Twenty-nine
sites in `src/`. The worst STORES a wrong date on a coaching note; `TaskItem` turns
tasks due today red as overdue from 7pm Central; and HomeTab's previous-week window
ended on a boundary that landed on the wrong side of midnight in EVERY zone tested,
so "last week" included today and the week-over-week delta was skewed.

`src/utils/dateLocal.js` now holds `isoLocal` and `todayLocal`. Four sites fixed;
24 triaged and listed in the handoff.

#### What the tests taught, which is the part worth keeping

The first draft of `tests/date-local.test.mjs` was 10 tests, green in five
timezones. Mutation testing then showed that reverting `isoLocal` to `toISOString`
**SURVIVED at UTC** — not because the assertions were weak, but because at UTC the
two functions are identical and no assertion on output can distinguish them
anywhere. A CI container at UTC would have run that suite green forever.

A second mutation, `todayLocal` bypassing `isoLocal`, survived in Chicago too —
only because the suite happened to run at midday, when the two agree. A test that
works after 7pm and not before is worse than no test.

Both closed: a source assertion that the module contains no `toISOString` at all,
which holds in every zone; and a child process spawned with `TZ` set, so the suite
can exercise Chicago and Tokyo regardless of where it runs. The child reports the
zone it actually adopted and skips with a reason if the platform ignored `TZ`,
rather than passing vacuously. Confirmed working on Windows.

The through-line across all three defects: **a rule can be correct, tested, and
mutation-proven, and still be wrong where it meets the next component.** The stage
clock was invisible to every single-row fixture. The date rule is invisible at UTC.
The harness was blind to every multi-line anchor. In each case the missing thing
was not a better assertion but a second setting of an ambient condition. That is
now §18b18 in the guide.
---

## 0A0000. Prior Batch — Bulk Insert, and Three Paths That Had Never Run

> This started as two handoff items and turned into six, because each fix exposed
> the next. Last session the pattern was code that *looked* finished. This session
> it was **code that had never run at all**: a PUT branch that 400'd on every call
> ever made, a dedupe clause that could not fire, a territory rule with no UI to
> author it, and a scanner walking past the one line it existed to catch.

### 0.1 The one that matters most: fixing a 400 created a data-loss path

`opportunities.mjs` PUT had **no array branch**. `ModalLayer` sends an array, so
`!data.id` on an Array returned 400 — **CSV overwrite of opportunities had never
once worked.** Adding the branch was three lines.

Then `buildOpp` turned out to build ONE shape for both new deals and overwrites,
ending in `stageHistory: []`, `comments: []`, `contactIds: []`. `bulkUpsert`
derives its `SET` clause from the keys supplied, so an overwrite wrote those empty
arrays over real data — **erasing the deal's stage history, every comment on it,
and its contact links.**

That was inert only while the branch 400'd. **Fixing the 400 converted a dead path
into a destructive one, in the same commit that made it reachable.** Guide §18b15
carries the rule: when you make a broken write path work, re-read what it writes —
it has never been exercised, so nothing about it has been proven.

### 0.2 Bulk INSERT — three endpoints, not the two the handoff named

`accounts.mjs`, `contacts.mjs` **and `opportunities.mjs`** each did
`db.insert(t).values(allRows)` — one statement for the entire import. Above ~1,872
accounts that breaks the 65,535 bind-parameter ceiling, and being one statement it
is atomic: one over-length field rolled back the whole file with nothing saved and
no indication which row was at fault.

`bulkInsert` chunks at 400 and **isolates by bisection**, not row by row. One bad
row in 400 costs ~9 extra statements instead of 400 — and 400 round-trips at ~30ms
is 12s against a 10s function timeout, so the obvious "safe" fallback would itself
have been the outage. A 7.5s wall-clock budget bounds every path; whatever landed
is reported and the rest comes back as failed-not-attempted.

It lives in **`netlify/functions/_bulk.mjs`, not `_lib.mjs`**, and takes an injected
client. `_lib.mjs` imports `db/index.js`, which is TypeScript, so anything there
loads only under `tsx` — outside the gates job. Chunk size, bisection depth and the
deadline are invisible in the return value, so if they cannot be asserted in CI they
are not enforced.

### 0.3 `onConflictDoNothing()` could never fire — removed, not replaced

All three carried it with a comment claiming it "skips duplicates instead of
erroring". The only unique constraint is the `id` primary key and every id is a
fresh `crypto.randomUUID()`, so it never triggered once. Name-based dedupe at insert
time would fight the smart-merge tooling that already owns that decision. A clause
that cannot fire is worse than none — it reads as protection that was never there.

### 0.4 `check:dbfetch` had TWO blind spots on one line

`AppHeader.jsx:444` discarded a Response into an empty catch, and the gate reported
0 across the whole tree:

```js
import('../../utils/storage').then(({ dbFetch: df }) =>
    df('/.netlify/functions/users?me=true', { … }).catch(() => {}));
```

The alias is the obvious one — the scanner matched the callee name `dbFetch`. The
second is structural: `x => df(…)` is a **concise arrow body**, so there is no
`ExpressionStatement` anywhere for `findStatements` to find. Alias resolution alone
would still have missed it. Same shape as the concise-arrow bug that hit
`check-tdz` (§0A000.1).

Both fixed, with a catch fixture and an aliased-but-checked false-positive guard.
Mutation-tested independently: disabling alias resolution drops the fixture 3 → 0;
disabling concise bodies drops it 3 → 2.

The call site now routes through the existing `saveProfile`, which also fixes a bug
nobody had noticed — it never updated `myProfile`, so the PUT **re-fired on every
avatar click** for the rest of the session. The pointless dynamic import went with
it (~80 modules import `storage.js` statically; rollup inlined it and warned on
every build).

### 0.5 Contacts import never used the bulk endpoint at all

One POST per record at concurrency 3, with per-record retries and a 100ms pause
every 50 rows — ~500 round-trips for a 1,500-row file, against the same array
endpoint the accounts importer had been using all along. Now 4 requests. ~40 lines
of `saveOne`/`saveAll` deleted.

### 0.6 State applied from what landed (§18b15)

Every import handler wrote `setX(prev => [...prev, ...rows])` **before** the request
and never rolled back. Rolling back is the wrong fix — on a partial failure the
client cannot know which rows to remove. The server now returns `insertedIds`, so
state is applied from the server's answer after the write.

**Still outstanding:** the accounts and opportunities OVERWRITE paths keep the old
optimistic shape. Only the new-record paths were converted.

> **Correction (§0.5 below).** That is an undercount, and the same undercount
> §0.2 above is named after: it was **three** paths. `ModalLayer.jsx:519` did it for
> contacts too. Whatever produced the original two-of-three miss produced it again
> four sections later, in the same document. All three are converted now.

### 0.7 Bulk accounts POST skipped territory assignment

`resolveTerritory()` ran on the single-record path only, so every CSV-imported
account landed unassigned while an identical account created through the UI got a
territory — which reads as the rules being broken rather than as an import gap.
Split into `loadTerritoryRules` + `applyTerritoryRules` so the batch reads settings
once rather than per row. **Cannot be verified by clicking** — see §0.10.

### 0.8 Deals with no close date were invisible in the Pipeline list

`groupByQuarter` dropped them with a bare `if (!qk) continue`, so the header read
"3 open deals · $73K" directly above a table saying "No deals closing this quarter",
while Funnel, Kanban and Forecast showed the same deals because they group by stage.
A rep who saved a deal without a close date would reasonably conclude it had not
saved. They now get an explicit bucket, sorted last, labelled *No close date ·
Not scheduled*.

Also `NaNd` in the funnel: `days` was computed from `stageChangedDate` with no guard
at **two** sites, while the stage-summary calculation in the same file guarded it.
The display was the visible half — the real problem is `stale = NaN > 14` being
permanently false, so such a deal **could never flag as stalled**. Imported deals now
get `stageChangedDate` set on create.

Quarter helpers extracted to `src/utils/quarters.js`: `ListView.jsx` imports React
and `useApp`, so nothing inside it is reachable by `node --test`. Same reasoning as
`csvAutoMap.js`. A fix for a silent drop should not itself be untestable.

### 0.9 Tests 69 → 89, every new rule mutation-tested

| Suite | Pins |
|---|---|
| `bulk-insert.test.mjs` (9) | chunk size, bind ceiling, bisection cost, per-row isolation, deadline, orgId stamping |
| `quarters.test.mjs` (10) | undated bucket, deal-count conservation, sort order, fiscal-year offsets |
| `scanners.test.mjs` (+1) | aliased + concise-body dbFetch |

`bulk-insert` asserts on the **shape of the traffic** — statement count, chunk size,
which rows were isolated — because none of that is visible in the return value: a
single statement and four chunked ones respond identically.

Mutations run: kill chunking → 3 fail · kill bisection → 4 · kill the deadline → 1 ·
make `orgId` overridable → 1 · restore the silent `continue` → 5 · sort undated
first → 1 · fiscal year off by one → 2.

### 0.10 Confirmed on dev, which is the part that counts

§18b8 is explicit that generation proving out is not execution proving out. Run
against `accelerep.netlify.app` with throwaway `ZZTest` data:

| Check | Result |
|---|---|
| 6-row accounts import, one 64-char ZIP against `varchar(20)` | **5 saved, 1 failed, named.** Search confirms 8 ZZTest accounts and **no Row03** — isolated, not merely uncounted |
| Count survives a hard refresh | **133 before and after** — §18b15 holds |
| Contacts import, 3 new companies | 1519 → 1524, companies auto-created |
| Opportunities overwrite | **3 overwritten, Proposal at 25/31/17K, persisted through refresh** — a path that had never once succeeded |
| Territory rules on bulk import | **BLOCKED** — nothing writes territory-shaped rules, so the rule cannot be authored. Verify by test instead |
| Avatar timezone PUT fires once | **not yet run** |
| Comment survives a CSV overwrite | **not yet run** — covers §0.1, the one thing a commit made worse before it was fixed |

**Two false alarms worth recording**, both instructive:

- An accounts CSV run through the CONTACTS importer reported *"Import Complete!"*
  with a green tick and **0 imported**. `getMappedData()` drops every row lacking a
  required field, silently — six rows in, zero out, and the UI congratulates you.
- The first runbook named files but never named the tab. Instructions that assume
  context are how a correct fix gets reported as a failure.

---

## 0A000. Prior Batch — Gate Audit, Build Guard, CSV Import Hardening, Hooks Remediation

> Every real bug this session was code that *looked* finished. **So were three of the four gates** — `check-tdz`, `check-inline` and `scan-dbfetch` each had a false-negative class, each reported clean over a live defect, and every one was found by a bug reaching production first rather than by reviewing the scanner. All four now have fixture suites proving they catch what they claim.

### 0.1 The gates had blind spots — this is the headline

| Gate | Blind spot | What shipped behind it |
|---|---|---|
| `check-tdz` | `/^[A-Z_]+$/` treated `T` as an imported SCREAMING_CASE constant, so the single most-used styling identifier was never checked | `EntitySelector` in `ReportsTab` read `T` from a scope it lost on hoist. **Whole Reports tab down** behind the error boundary. Gate printed "No render-time TDZ issues in 135 file(s)". |
| `check-inline` | `riskOf()` inspects only a component's own body, so a wrapper rendering `{children}` scored harmless | `FL` in `AddDestinationModal` remounted the caller's `<input>`. Focus lost after one character; the escaped keypress hit App.jsx's global hotkey and opened the New Task rail. Gate reported **0 user-visible**. |
| `scan-dbfetch` | peels `.then(r => { if (!r.ok) … })` off to find the `dbFetch` underneath | **59% false positives in the hooks — 10 of 17**, well above the 17% already documented. Acting on the list unreviewed would have rewritten a working data layer. |

Fixed, and **`tests/scanners.test.mjs` + `tests/fixtures/scanners/` now pin all four.** Each fixture is a real bug that shipped and says which; each scanner also gets a `-safe`/`-clean` fixture it must stay quiet on. The suite fails if a `check:` script exists in `package.json` with no fixture. Mutation-tested: restoring each original blind spot fails the suite. See coding guide §18b11.

**`check-inline`'s fix resolves risk from call sites, not guesswork.** Flagging every children-wrapper took the codebase 0 → 13 user-visible, but 12 were presentational `<Panel>`s in `ReportsTab` wrapping charts — failing CI on those is how a gate stops being trusted. It now checks what the call sites actually pass.

### 0.2 Build guard — a hollow bundle can no longer deploy

`scripts/check-bundle.mjs`, chained into `npm run build`. Two findings beyond the backlog's description: **the CSS asset is byte-identical between a real and a hollow build** (same content hash), so any "were assets emitted" check passes; and `index.html` ships static crawler-readable copy inside `#root`, so a hollow deploy renders a plausible landing page rather than a white screen.

Proven both directions on Jeff's machine. **The documented gate command changed** — `npx vite build` bypasses the guard; use `npm run build`. See §18b4.

### 0.3 `check:dupes` gate + 9 duplicate keys/attributes fixed

Nine findings, matching esbuild's nine warnings exactly. Four were duplicate `style` attributes in `CsvImportModal` where React discarded the base button style entirely — **both primary CTAs and both bulk actions in the CSV flow rendered as raw browser buttons**. The rest were dead values in `DispatchTab:5080`, `TasksTab:1295`, `DispatchSkillsDetail` ×3. See §18b9.

### 0.4 CSV import: auto-mapping, conflicts, bulk PUT

**Auto-mapping rewritten** — `src/utils/csvAutoMap.js`, 13 tests. Order-dependent `findIndex` substring matching replaced with weighted aliases, deny rules and global one-to-one assignment. Against a real Outlook export the old matcher put a phone number in Company, an email in Address, the home phone in Business Phone, and the honorific in Job Title — and scored all four 0.85, rendering **green**. Confirmed in practice; Jeff had corrected "a lot" of dropdowns by hand.

**Conflicts step** — paged at 100 (a same-file re-import rendered 1,504 `<select>`s and froze the tab). "Skip all" appeared dead because every conflict is born `action: 'skip'`; it is now a segmented toggle reporting `mixed` once any row is set by hand.

**Bulk PUT** — `bulkUpsert` in `_lib.mjs`, array branch on `contacts.mjs` and `accounts.mjs`. Overwrites went from **~500 sequential round-trips to 4**. SQL generation verified via `.toSQL()` before building on it, then verified against the real database. No schema change. See §18b8.

**CRLF damage repaired** in `CsvImportModal.jsx` — 848 lone CRs (`\r\r\n`), the signature of a patch script written without `newline=''`. Proven content-neutral: emitted bundle byte-identical, same md5.

### 0.5 Audit-log streaming persisted nothing

`streamingDestinations` and `streamingGlobals` appeared **only in `AuditDetail.jsx`** — in neither the GET nor the PUT of `settings.mjs`. The PUT rebuilds `extra` from an explicit whitelist, so both keys were dropped **and the endpoint still returned 200**. Add, remove, pause, globals: all appeared to work and reverted on reload.

**No amount of `res.ok` checking would have caught this** — the response was 200. Both keys added to both halves. Verified working.

### 0.6 Hooks remediation — 6 real sites of 17 flagged

Ten were false positives (§0.1). The six real ones:

- **`useOpportunities` Closed Lost, both branches — the worst.** `.catch(console.error)` never sees a 403/500, and `addAudit()` was called unconditionally. A rejected save left the pipeline showing Closed Lost, **the audit log asserting it**, and the row still open. Closed Lost feeds revenue reporting. Now awaited, checked, rolled back, and **no audit entry is written for a save that did not land**. `completeLostSave` became async; all three call sites ignore the return value.
- **Three undo-restores** (`useActivities`, `useTasks`, `useContacts`) — a failed restore left the row visible but gone from the database. Now removed again and reported.
- Two `fireMentionSms` sites are deliberate fire-and-forget; left alone.

**New `dbWrite()` in `src/utils/storage.js`** — returns `{ ok, status, error }`, never throws, surfaces the `requestId`. 9 tests, mutation-tested. See §18b1.

### 0.7 Housekeeping

- **`drizzle-orm` 0.45.1 → 0.45.2** — SQL identifier injection. Zero `sql.raw` call sites, so exposure was nil.
- **CI now runs the gates.** New `gates` job: check:tdz, check:inline, check:dupes, and a build with a dummy key. **Previously none ran in CI.**
- Test count **66 passing**, up from 19 at session start.

### 0.8 `dbFetch` remediation — 78 → 0, and `check:dbfetch` is now a gate

Hand-triaged and fixed across nine passes. **The original handoff's blocked item is
closed.**

| Cluster | Sites | Real |
|---|---|---|
| Hooks (4 files) | 17 | 6 |
| `PipelinesDetail` | 9 | 9 |
| `settings/people` | 8 | 8 |
| `CompanyCalendarDetail` | 4 | 4 |
| Remaining `settings/` | 12 | 12 |
| `ContactsTab` + `AccountsTab` | 6 | 6 |
| `App.jsx` | 4 | 0 |
| Final sweep (9 files) | 12 | 9 |

**The pattern was strongly categorical.** Settings panels ran **33/33 real** — they
are fire-and-forget writes to an Admin-only endpoint, so every one silently 403s for
a non-admin. Hooks ran 6/17 — mostly loads and deletes that were already correct.
*Where* a site is predicted whether it was real far better than the scanner did.

**The worst single find was `useSettings`'s global autosave.** It wrote localStorage
**before** the PUT and then discarded the Response, so a non-admin's 403 left the
change cached locally forever: the UI showed it, a reload re-read it from cache, and
nothing ever reached the database. A failure that masked itself indefinitely on one
machine while nobody else saw the change. Now DB-first, cache only on success, error
surfaced through the toast.

**The scanner itself was the blocker.** It reported a 59% false-positive rate on the
hooks because it unwrapped `.then()` chains without reading the callbacks, and it
could not even be pointed at a file — it ignored its arguments and always walked
`src/`, which is why the error rate went unmeasured for two sessions. Both fixed,
behaviour pinned by fixtures, then promoted: **`npm run check:dbfetch`**, exit
non-zero on any finding, in CI. Deliberate fire-and-forget opts out with a
`dbfetch-ignore:` comment at the call site — three sites qualify.

It also gained a second finding class, **Response read as if it were JSON** (§18b3),
which immediately found `ReportsTab`'s saved-reports list calling
`.then(data => data?.reports)` on a Response with no `.json()` in the chain. Always
undefined — the list had never loaded.

New shared helper **`dbWrite()`** in `src/utils/storage.js` — `{ ok, status, error }`,
never throws, surfaces the `requestId`. 9 tests, mutation-tested. `putSettings()`
remains the template for settings panels.

**Five gates now, all in CI, all fixture-tested** — up from two that ran only by hand
at session start. 69 tests, up from 19.

### 0.9 Two failures no client-side handling could ever catch

**`settings.extra` keys missing from the whitelist — four keys, three features.**
`streamingDestinations`/`streamingGlobals` (audit streaming), `connectedApps`/`slackConfig`
(Connected Apps), `importPresets` (import presets). The PUT rebuilds `extra` from an
explicit list, so unknown keys are dropped **and the endpoint still returns 200**.
Connected Apps even read its keys back on mount — a complete round-trip persisting
nothing. All now whitelisted in both halves. See guide §18b12.

**`users.mjs` PUT was replacing rows, not updating them.** `sanitize()` rebuilds
every column and the whole `profile` jsonb from the body; `upsertUser` writes it
with `set: { ...updateData }`. Five cascade sites sent
`{ id, team, territory, vertical, teamId }`, which produced `name: "Unnamed User"`,
`email: "<id>@placeholder.local"`, `quota: null` and **31 of 35 profile fields
null** — wiping names, emails, phones, signatures and quotas. Every one sat in
`catch(e) {}`. Fixed with `mergeForUpdate()` **in the endpoint**, so every caller
inherits it. Test data only; no production damage. See §18b13.

### 0.10 Clerk advisories cleared — Production migration unblocked

Patched with **`npm audit fix`** (never `--force`): `@clerk/backend` 3.0.1 →
3.16.5, `@clerk/clerk-react` 5.61.3 → 5.61.9. **`package.json` did not change** —
the existing carets already permitted both, so only `package-lock.json` moved.

`@clerk/shared` resolves to two nested copies, which is correct and not a conflict:
`3.47.8` under clerk-react and `4.29.0` under backend. Both are above their patched
thresholds (3.47.4 / 4.8.1).

**Three advisories, not the two the handoff listed. None applied — and the reason
matters more than the verdict:**

| Advisory | Severity | Why not affected |
|---|---|---|
| `GHSA-vqx2-fgx2-5wq9` (CVE-2026-41248) | Critical, 9.1 | The flaw is `createRouteMatcher` in `@clerk/nextjs`/`nuxt`/`astro`. None installed, zero references. `@clerk/shared` is flagged only because it hosts the code. |
| `GHSA-w24r-5266-9c3c` (CVE-2026-42349) | High, 7.6 | Bypass in Clerk's `has()` / `auth.protect()` when combining reverification with role, permission, plan or feature checks. Neither is used. The only `has()` in the codebase is a local `(v) => String(v ?? '').trim() !== ''` in the two merge modals. |
| `GHSA-gjxx-92w9-8v8f` | High | SSRF in the opt-in `clerkFrontendApiProxy`. Not enabled; no `proxyUrl` anywhere. |

**The handoff missed `GHSA-w24r`, and it was the one most worth checking** — it is
specifically about *organization* checks, and this app is org-scoped throughout. It
does not apply only because authorization is the homegrown `requireRole()` over
`verifyToken`, never Clerk's `has()`. That is the load-bearing fact; "not affected"
without it is an assertion, not a finding.

Also checked and not applicable: `GHSA-9mp4-77wg-rwx9` (Clerk webhook
verification). The only webhook verification here is Resend/Svix HMAC in
`email-inbound.mjs`.

**`payload.o.id` is unaffected by the SDK bump.** `verifyToken` calls `decodeJwt`
and returns claims unmodified, so the claim shape is set by Clerk's *server-side*
token format, not the SDK version. `auth.mjs` also falls back through `org_id` and
`active_organization_id`.

Verified: 69 tests, all five gates, build clean, and the Clerk APIs the app calls
(`verifyToken`, `createClerkClient`, `users.getUser`, `users.getUserList`,
`organizations.getOrganization`) all still resolve. Manually tested on dev — sign
in, org switch, org scoping, and a non-admin still receiving 403s.

---

### Open — found this session, not fixed

**Accounts/contacts bulk POST is unbatched.** One statement for every row; breaks above ~1,872 rows (35 columns against the 65,535 bind-parameter ceiling), and one bad row kills the whole batch. The overwrite path was fixed; the insert path was not. **Do this before the CSV Import + Export rollout**, which multiplies the files pushed through it.

**`onConflictDoNothing()` is decorative.** POST bulk branch of `accounts.mjs` and `contacts.mjs`. The only unique constraint is the `id` primary key and every id is a fresh `crypto.randomUUID()`, so it can never fire. The comment claims it "skips duplicates instead of erroring". **Nothing dedupes by name at insert time.**

**Optimistic local write before the request.** `ModalLayer` calls `setAccounts`/`setContacts` *before* the POST, so a failure leaves the UI showing records never saved. The `res.ok` check is correct — this is a write applied optimistically and never rolled back. (The equivalent in `ContactsTab`/`AccountsTab` delete paths **is** fixed; the CSV import path is not.)

**`importPresets` is written but never read.** Whitelisted now so the write lands, but nothing loads a saved preset, and the write replaces the array rather than appending because `SavePresetModal` cannot see existing settings. Needs a load path and a merge before it is a usable feature.

**An unexplained 500 on accounts bulk POST.** Reproduced once with a wrong-shaped payload. The POST path still discards the `requestId`; `saveBulk` surfaces it on the overwrite path only. Log entry never pulled.

**`anyModalOpen` in `App.jsx` does not know about settings-level modals.** They hold local state in their own components, so any settings modal that drops focus is exposed to the global-hotkey escape. `FL` is fixed; the structural gap is not.

**`storage.js` dynamic import buys nothing.** Dynamically imported by `AppHeader.jsx` but statically imported by ~80 modules, so rollup inlines it and warns every build. Dead intent; one-line fix.

### Doc drift found this session

- Handoff referenced `scripts/triage-dbfetch.mjs`; the file is `scripts/scan-dbfetch.mjs`.
- Handoff's gate command bypassed the bundle guard (`npx vite build`).
- Handoff claimed **24** blind `PUT settings` in `AuditDetail.jsx`; there are **4**. It also said 65 sites; the committed scanner reports 78 raw (65 = 78 minus 13 hand-triaged false positives).
- Project-knowledge copies of both docs were behind the live ones — no §18b3–§18b7. **Worth moving both docs into `sales-pipeline-v2/docs/`** so they travel with the code and appear in diffs; this has now cost time twice.

---

## 0A00. Prior Batch — SalesManagerTab Hoist, SPIFF Persistence & Claim Plumbing

> The SPIFF module looked finished and was not connected to anything. Admin config never persisted, the claim modal could not be opened by any code path, and its submit reported success on a 403. Also found: `vite build` was emitting a bundle **with no application in it**, exit 0.

### 0.1 The two inline components are gone — `check:inline` reports 0 user-visible

`ForecastTab` (9 props) and `AdminTab` (18 props) hoisted to module scope in `src/Tabs/SalesManagerTab.jsx`. The prop lists were derived by AST scope analysis rather than by eye, then cross-checked against the backlog entry — they matched exactly.

Two corrections to what the backlog said:
- `ForecastTab` is **~152 lines** (241–392), not 548. The 548 figure was the distance from `ForecastTab` to `AdminTab`, spanning `TeamTab` and `AuditTab`.
- `SalesManagerTab.jsx` is **LF**, not CRLF. The CRLF rule is about `App.jsx`; applying it here would have rewritten all 1,091 lines.

Two provably dead declarations removed from `AdminTab`: `calcCommission` and `inputStAdmin` (one occurrence each — their own declaration).

`SubTabs`, `TeamTab`, `AuditTab` remain inline. Churn-only, deliberately left.

### 0.2 The SPIFF Board never persisted anything

Three independent failures stacked:

- The editor called `setSettings` only — **no `dbFetch` at all**
- `spiffs` appeared **nowhere** in `settings.mjs` — not in GET, not in PUT
- There is **no global settings autosave** in `App.jsx`; every persisted panel PUTs explicitly

So every SPIFF an admin defined vanished on refresh. Commission tiers had the same shape but milder: `quotaData` *is* in both halves, only the save call was missing.

Fixed: `spiffs` added to both halves of `settings.mjs` (`extra` is `jsonb`, so **no schema change and no `drizzle-kit push`**), and every control now persists — text fields on blur, structural changes immediately.

`settings` PUT is `requireRole(['Admin'])` but `SalesManagerTab` renders for Admin **or** Manager, so a Manager editing these panels would have 403'd forever. Mutating controls are now gated to `isAdmin` with a read-only notice.

### 0.3 The claim modal was unreachable, and its submit faked success

`setSpiffClaimContext` was **never called anywhere**. The only two `setShowSpiffClaimModal` calls were both `(false)`. The state was fully plumbed — `useModalState` → `App.jsx` → `appContextValue` → destructured by `PipelineTab`, `ViewingContactPanel`, `ViewingAccountPanel` — and then never used. Wiring complete up to the button that was never built.

The submit was worse than unreachable:

```js
const result = await dbFetch(...POST...);
setSpiffClaims(prev => [...prev, result.spiffClaim || newClaim]);
} catch { setSpiffClaims(prev => [...prev, newClaim]); }  // "optimistic fallback"
```

`dbFetch` returns a `Response`, so `result.spiffClaim` was **always** undefined and the fallback ran on success too. No `res.ok`. The catch added the claim anyway. A 403 looked identical to a success.

Fixed: real `res.ok` check, real JSON parse, server error surfaced, submitting state to prevent double-fire. Error state lives on `ModalLayer` because the modal is an **IIFE, not a component**, and cannot own hooks.

### 0.4 Trigger design — not gated on the stage having just changed

The prompt fires when **stage is Closed Won AND an active SPIFF is still unclaimed for that deal**. Deliberately *not* `stageChanged`, because there is no row menu to hang a manual "Claim" button on (the `⋯` at `PipelineTab.jsx:613` is another unwired stub), so gating on the transition would leave every already-closed deal permanently unclaimable. Re-saving a Closed Won deal re-prompts; the prompt stops once everything is claimed.

Trade-off accepted: a rep who deliberately skips a claim is re-prompted on each save of that deal. Revisit with a dismissal flag only if it actually annoys someone.

Both write paths trigger it. The Kanban drag is a **separate PUT** and would otherwise have skipped the prompt silently; it also had a bare `.catch(console.error)`, so a failed stage change looked successful.

### 0.5 `vite build` was shipping a bundle with no app in it

`npx vite build` without `VITE_CLERK_PUBLISHABLE_KEY` produced a **212 kB bundle containing no application** — no tabs, no `SalesManagerTab`, nothing. Exit 0, green log, `✓ built in 8s`.

`main.jsx` does `if (!PUBLISHABLE_KEY) throw new Error(...)`. Vite inlines the missing env var as statically false, Rollup marks everything after the `throw` unreachable, and tree-shakes `createRoot(...).render(<App/>)` away. The bundle literally ends on that `throw`.

With the var set: **2,498 kB**. Confirmed pre-existing by stashing all changes and rebuilding at `c44e7e3` — byte-identical hollow bundle.

**Netlify sets the var, so production was never affected.** But a local "build passes" proved nothing, and if that var is ever renamed or dropped in Netlify's UI the build stays green and deploys a blank site.

### 0.6 `@babel/parser` was never a declared dependency

Both scanners import it; it resolved only transitively via `@vitejs/plugin-react → @babel/core`. A plugin bump that restructured deps would have silently broken both gates. Now an explicit devDependency.

npm installed **8.0.4** while `@babel/core` pins `^7.29.0`. Tested: both scanners produce **byte-identical** output under 7 and 8, including the full 76-entry churn listing. Both also fail loudly on a parse error (`check-tdz` prints `PARSE FAIL`; `check-inline` throws), so neither silently drops a file.

### 0.7 `dbFetch` triage — 65 sites, not 78

A first-pass scanner reported 78 discarded-`Response` call sites. **13 were false positives**: `.then(r => { if (!r.ok) … })` handles the Response, but the scanner peeled the `.then` off to find the `dbFetch` underneath and called it discarded. Verified against `useAccounts.js:12` and `App.jsx:349`. Acting on that list would have meant rewriting the entire data-loading layer.

Corrected triage — **65 sites**:

| Class | Count | Meaning |
|---|---|---|
| READ-DISCARD | 3 | a GET whose Response goes nowhere |
| BLIND-WRITE | 37 | mutation, no `res.ok`, no `.catch` |
| SWALLOWED | 25 | has `.catch`, so it *looks* handled — still cannot see a 403 |

62 of 65 are writes. **24 of the 37 blind writes are `PUT settings` in `AuditDetail.jsx`**; 5 more are `PUT users` across `TeamsDetail` / `TerritoriesDetail`. Not 65 scattered fixes — a handful of files with repeated patterns.

### 0.8 SPIFF home panel + modal restyle

`SpiffPanel` added at module scope in `HomeTab.jsx`, right column under `QuotaBar`. Shows active SPIFFs (name, rate, description) and the signed-in user's own claims with status. Gated to `User` / `Manager` / `Admin`; returns `null` when there is nothing to show.

Status values are `pending` / `approved` / **`rejected`** / `paid` — the label is "Rejected", matching the data, not "Denied".

The claim modal was restyled from its slate/purple palette to the warm stone/ink language per `accelerep-style-guide.md` §2/§5/§8/§9. The ⚡ emoji was replaced with the gold-tan left bar used on tab headers.

`condition` is now editable in the SPIFF Board as "Description" — it was already in the object shape and already rendered by the claim modal, but had no input anywhere.

---

## 0A0. Prior Batch — Inline-Component Audit

> The backlog item named three files. **All three were already clean.** The problem was real but lived elsewhere, and 81 raw hits triaged down to 5 that actually mattered.

### 0.33 The audit item was wrong about where the problem was

`TasksTab`, `LeadsTab` and `PipelineTab` — the three files the backlog named — have **zero** inline components between them. That entry had been describing a problem that was not there, and would have consumed a session confirming nothing.

Scanning all of `src/` instead: **81 components declared inside another component and used as a JSX element type.** Concentrated in `ReportsTab` (55) and `AccountsTab` (7).

### 0.34 Most of the 81 do not matter — the triage that made this tractable

A remount is only USER-VISIBLE when the component owns something lost on unmount: focus in a form control, its own hook state, or a DOM ref. A stateless `<HBar>` or `<SecHdr>` wrapper remounts too, but nothing observable changes — that is churn, not a bug.

**On that basis: 5 of 81 were user-visible.** Without the distinction this reads as an 81-item rewrite of two enormous files; with it, it is five targeted fixes.

Three fixed:

| Component | Symptom |
|---|---|
| `ContactSearchField` (ContactModal) | Text input setting **parent** state — focus lost after every character. The textbook case. |
| `EntitySelector` (ReportsTab) | Search input; `autoFocus` masked outright focus loss, but the caret jumped to the end mid-word. |
| `SSelect` (AuditDetail) | Changing one setting remounted every `<select>` in the popover, closing open dropdowns mid-choice. |

`check-tdz.mjs` was run after each hoist and confirmed no dangling closure reads — which is exactly what it exists for, given hoisting-without-re-parenting caused six crashes in earlier batches. `ContactSearchField` needed three props threaded (`allContacts`, `handleChange`, `openNestedNewContact`); the other two were already fully prop-driven.

**Two deliberately left**, both in `SalesManagerTab`: `ForecastTab` (548 lines, 9 props to thread, **owns `useState` that is discarded on every parent render**) and `AdminTab` (~300 lines, 18 props). Large moves where a mistake is expensive; they want a dedicated pass, not the tail of a long session.

### 0.35 New tool — `scripts/check-inline-components.mjs`

`npm run check:inline`. Reports only components declared inline **and** used as a JSX element type — a capitalised helper that is merely CALLED is correctly ignored. Each finding is tagged `USER-VISIBLE` or `churn only`.

Validated against a fixture with a known answer before its output was trusted, including the merely-called case and a nested two-deep declaration.

**Output design matters more than it sounds.** The first version printed a line for every one of ~120 files, burying the two real findings under 410 lines of "no inline components". Now:

| Command | Lines |
|---|---|
| `npm run check:inline` | user-visible only — **5** |
| `-- --churn` | plus stateless wrappers — 98 |
| `-- --all` | plus clean files — 410 |
| `-- --help` | what the two severities mean |

Exit code is `1` only for the user-visible class. Churn is worth fixing eventually but must not fail a check that might one day gate a commit.

**Two bugs in the tool itself, both caught by running it rather than reasoning about it:** every argument was treated as a file path, so `--all` was opened as a filename and died with `ENOENT`; and the default output was too noisy to be useful. A checker whose signal is hard to find stops being run.

---

## 0A. Prior Batch — Calendar Disconnect, Email Signatures, Record-Number Query Performance

> Three contained features, and three incidental bugs found while building them — a wiped profile field, a TDZ in my own first draft, and a lexicographic-`MAX` trap that would have reissued live record numbers. Details in 0.31.

### 0A.29 Calendar disconnect — the endpoint already existed

`calendar-connections.mjs` had a working `DELETE` all along, correctly authorised (a user can only delete their own; org connections are Admin-only). **This was purely client wiring** — no new function. Worth checking before building; the assumption going in was that an endpoint would be needed.

The avatar Calendar tab now shows **which** account is connected (`calendarEmail`) and since when (`connectedAt`), not just that one is. The connection record loads **lazily, only when the tab is opened** — this panel renders on every screen, so an eager fetch would cost a request per page load for a tab most users never touch.

After a successful delete it **re-fetches rather than assuming**: `fetchCalendarEvents` sees `connected: false`, which clears app-wide state so the tab, Home's status strip and the plate all revert together without a reload. Five paths tested; the failure ones matter most — a 403, 404 or unparseable 500 all leave `connected` untouched and surface the server's own message.

**Deliberate wording:** *"Disconnecting removes the stored connection and stops syncing. To revoke Accelerep's access on Google's side as well, remove it from your Google account permissions."* Deleting the row stops us reading the calendar but does **not** revoke the OAuth grant; claiming otherwise would overstate what the button does.

### 0A.30 Personal email signature

**No schema change** — `users.profile` is already a jsonb blob holding `firstName`/`phone`/`title`, so `emailSignature` lives alongside them.

**Plain text, escaped server-side.** A signature is user-authored content that lands in a *customer's* inbox, so a rich-text field would be an injection path into every recipient's mail client. Escaping happens before newline conversion — doing it the other way round would turn the `<br>` tags into literal text. Tested against `<script>`, `<img onerror>`, attribute-breaking quotes and bare ampersands; line breaks survive via `white-space: pre-line`.

**Read server-side from the sender's own row, never accepted from the request body** — otherwise a client could put arbitrary text out under someone else's name.

It replaces the quote email's *"This quote was prepared for you by your account representative"*, a line that carried no sender identity at all. With no signature set, that generic line still shows, so nothing degrades for users who skip it. A failed lookup is caught and logged; it never blocks the quote going out.

### 0A.31 Record-number generators — full scan → indexed MAX

All three (`nextCustomerNumber`, `nextJobNumber`, `nextQuoteNumber`) selected **every row in the org** and found the maximum in JS, on every single create.

**The obvious fix is wrong.** `MAX(customer_number)` is one indexed lookup, and it would reissue numbers already in use — zero-padding only preserves ordering while the digit count is constant:

```
rows: CUST-9999, CUST-10000, CUST-10001
MAX(text)    -> CUST-9999    <- collides with live numbers
MAX(numeric) -> CUST-10001   <- correct
```

The unique indexes from the prior batch would *catch* that collision, but only as something to retry — and every retry would propose the same losing number. **Quote numbers pad to three digits**, so that fuse is shortest: the bug appears at 1000 quotes in a year, not 10000.

So the numeric part is extracted and `MAX`'d as an integer, with the year prefix narrowing the scan further on jobs and quotes.

**Verified rather than assumed:**
- SQL validity, by parsing both query shapes with `pglast` (a real PostgreSQL parser) rather than trusting that Drizzle's `sql` template emitted something valid.
- Behavioural equivalence, by running the old JS against the new SQL semantics over ten row sets — gaps, nulls, hand-edited garbage, only-garbage, past-4-digits, lowercase prefix.

**One genuine divergence found and fixed.** The old customer code called `.trim()`; the SQL regex did not. A stored `"  CUST-0007  "` would have been ignored and its number reissued. `TRIM()` is now applied in both the filter and the extraction, on **all three** — jobs and quotes never trimmed, but erring toward *counting* a number is the safe direction for a generator.

### 0A.32 Incidental bugs found

- **`mobile` was wiped on every profile save.** The Save Profile button sent it, but the load only seeded firstName/lastName/email/phone/title — so the field rendered blank and each save overwrote a stored mobile number with `''`. Nobody would report this: it looks like the field was simply never filled in. Found because the signature field would have hit the identical trap.
- **A TDZ in my own first draft of the signature work** — the lookup was placed after the template literal that consumed it (`emailHtml` at line 141, `signatureHtml` at 204). Caught by reading the line numbers back before delivery, not by a tool: `check-tdz.mjs` covers component scope, not the inside of a Netlify handler.

---

## 0B. Prior Batch — planWeek Constraints, Settings Save Integrity, Personal-Preferences Consolidation, Calendar Visibility

> **The scanner earned its keep three more times.** `scripts/check-tdz.mjs` was widened twice in this batch, and each widening immediately found real crash bugs in code it had previously been blind to — including four in files it had never inspected at all. Full history in §0B.28.

### 0B.24 `planWeek` — crew size and equipment

Mass-scheduling ignored three things, each producing proposals the single-job scheduler would have refused:

1. **`crewSize`** — one technician assigned regardless, so a job needing three was silently under-crewed.
2. **`equipCategories`** — availability never checked, so two jobs in one run could both claim the last unit.
3. **Placements made EARLIER IN THE SAME RUN were invisible** to equipment checks. Technician load already had a running `busy` ledger; equipment needed the same, or the first two proposals each looked fine in isolation.

**Ordering decision that matters:** a crew must work the SAME hour, so the slot is chosen first and the crew assembled from whoever is free then — not the reverse. Picking the three best-scoring techs and then hunting for a common slot succeeds far less often, because top scorers are exactly the people most likely to be busy.

**Partial crews are skipped, not proposed.** A job that looks scheduled but is two techs short is worse than one still visibly in the queue. Skip reasons distinguish causes that need different fixes: *"only 2 available"* (hire / reduce crew) vs *"no common slot"* (scheduling) vs *"equipment not free"*.

Also found while wiring it: the apply loop hardcoded `coTechIds: []` and the optimistic update used `[pr.tech.id]` — so even a correctly computed crew would have been **written and displayed as a one-tech job**.

### 0B.25 Settings navigation guard + save integrity

**The dirty flag was not dead** — `App.jsx` has a working nav guard for top-level tab clicks, and 13 panels report dirty correctly. But it covered the *least likely* exit. **`onBack` cleared the flag and left with no prompt**, and "← Back to settings" is how people actually leave a panel. Opening a different panel while dirty was equally unguarded.

`settingsSaveRef` was populated by every dirty panel and **called by nothing**, so "Save changes and continue" is now a real option rather than a manual round trip.

**Then the panel saves themselves turned out to be worse than "doesn't rethrow".** Four of them — Company Profile, Fiscal Year, Buyer Personas, and the generic FlatListDetail — did this:

```js
} catch(e) { console.error('save fiscal year', e); }
setDirty(false);        // OUTSIDE the try
```

Two failures compounding: `dbFetch` never throws on 4xx (§18b1) so a 403 never reached the catch, and `setDirty(false)` ran regardless. **Those four have been discarding failed saves silently**, and FlatListDetail is generic so the bug applied to every settings key rendered through it. None had any error surface at all.

All 14 registered saves now use the existing `putSettings` helper (written for exactly this and never adopted), surface errors, and rethrow. `DetailPageChrome` gained an `error` prop to match `CategoryDetailChrome`. The timing-based workaround in the nav guard — polling `settingsSaveRef` after a delay — was deleted.

**Self-inflicted bug caught before delivery:** the first pass put `throw e` in the catch, which skips the `setSaving(false)` after the try — the panel would have sat on "Saving…" for the rest of the session.

### 0B.26 Personal preferences consolidated to the avatar menu

Settings is Admin-only (`App.jsx` gates it at both the nav button and the render), which made two things in `SettingsTab` unreachable: the `canAdmin` Manager path, and the entire `PersonalView` fallback. Personal preferences were therefore inaccessible to non-admins while Admins had two routes to them.

**Investigating what to migrate found there was nothing to migrate.** All three Personal-scope panels were mockups:

| Panel | Reality |
|---|---|
| Calendar sync | Connect/Disconnect button had **no `onClick`**. Four sync toggles in local state, saved nowhere, read by nothing. |
| Email signature | **Hardcoded fake signature** — invented job title, made-up `@accelerep.com` address, invented quote. Three templates with **fabricated stats** (42 uses, 38% open rate). Every button dead. |
| My API tokens | "+ Generate token" did nothing. Permanently empty. |

Fabricated metrics presented as the user's own data are worse than an empty state. `PersonalView.jsx` (262 lines), the Workspace/Personal scope toggle, and the four `scope:'personal'` catalogue entries are deleted.

### 0B.27 Calendar visibility — connected was indistinguishable from absent

The only calendar control in the app was the Home prompt, gated on `!calendarConnected`. **The moment a user connected, every trace of the calendar vanished** — and because meetings are folded into "ON YOUR PLATE" rather than shown as a calendar, a connected calendar with no events produced nothing anywhere. No confirmation, no way to reconnect after revoking access in Google.

Two fixes:
- **Calendar tab in the avatar panel** (Profile · Notifications · Calendar): status, event count, Connect/Reconnect, Refresh. Reuses the same `calendar-oauth-start` flow HomeTab calls — one flow, not a second implementation that can drift.
- **Home strip always states which it is**: the connect prompt when disconnected, or *"N meetings today"* / *"Calendar connected — no meetings today"* with the next upcoming event.

Deliberately **no sync-option toggles** — that was the mock being deleted. **Disconnect deferred**: it needs an endpoint to revoke the token and clear the credential; the tab says to revoke via Google account permissions meanwhile.

### 0B.28 ⚠️ `check-tdz.mjs` was blind to whole files

Adding the Home strip needed `calendarLoading`, which was not destructured — and **the scanner did not catch it**. `checkUndefined` only inspected `const X = () => …` arrow components. `HomeTab` is `export default function HomeTab()`, so **the entire file had never been scanned**.

Widened to cover function declarations and default exports. It immediately found **four pre-existing crash bugs** in files it had never inspected:

| Component | Reads | Effect |
|---|---|---|
| `RecommendationReport` | `isMobile` | throws on render |
| `ActivityHistoryTab` | `setViewingAccount` | throws when opening an account |
| `PipelinesSettingsPanel` | `showConfirm` | **deleting a pipeline with opportunities threw instead of confirming** |
| `ViewingContactPanel` | `setContacts` | throws on that path |

All four are the §0PB.21 shape — a component reading a value from a scope it does not have — and all four were fixed by pulling from `useApp`, which already exposed each one.

**Scanner history, worth keeping because the pattern is consistent.** Five corrections, each one a false positive that would have sent us rewriting working code:

1. Counted **object property keys** as references (`{ equipCategories: [] }`).
2. Missed `OptionalMemberExpression` — `settings?.industries` is a different AST node type.
3. Ignored **nested scope** — an IIFE's own `const now` read as an outer reference.
4. Crashed on **concise arrow bodies** (`() => expr` has no `body.body`).
5. Missing **browser globals** — `Blob`, `FileReader`, `prompt`, `catch` params.

Each widening found real bugs immediately, and each needed verification against a known-good case first. Current state: **134 files, 0 issues.**

---

## 0PC. Earlier Batch — Customers Redesign, Won→Dispatch Bridge, Quotes Hardening, Record-Number Integrity, Template Axes

> **Two production incidents this session, both mine, both invisible to every existing gate.** A quote-save regression from an allowlist change, and a Dispatch crash from hoisting a component out of its parent. Babel passed and `vite build` passed on both. The tooling response — `scripts/check-tdz.mjs` extended to catch undefined references — then found a *third* instance I had not been looking for. §0PB.20 and §0PB.21.

### 0PB.13 Dispatch customers — three-column redesign

Rebuilt `CustomersView` from a Claude Design handoff: facet rail · list · service-customer record. Every design token mapped 1:1 onto the existing `T`, including `serif`, so nothing new was introduced.

**The design assumed four fixed contract tiers with hardcoded rank, colour, SLA and PM text.** Accelerep has arbitrary `dispatch_service_plans` rows, so all of that is **derived** instead: plans ordered by annualised value, coloured from a fixed palette by rank, "No plan" always last. Adding a fifth plan needs no code change.

- **Contract value is annualised** — `price` × billing period, `per_visit` multiplied by `visitsPerYear`. That is what makes the rail's ledger column and the header total summable across plans on different billing cycles.
- **Facet counts exclude their own group**, so a chip's number answers "what would I get if I clicked this" rather than collapsing to zero once two filters combine.
- **Multi-select within a group (OR), AND across groups.**
- The edit form was preserved verbatim and hoisted to module scope behind an "Edit details" button — the design's record pane is read-only, and replacing the form outright would have lost every field.

**Equipment count deliberately not built.** The design's "14 assets" implies customer-site serviceable equipment (rooftop units, chillers). `dispatch_equipment` is the org's own tool inventory with serial numbers, calibration and checkout. Different entities that share a word. Substituted **Overdue PM** and visit counts rather than render a number with nothing behind it. Jeff reviewed and agreed: **no `dispatch_customer_assets` table** — adding `customerId` to `dispatch_equipment` would collapse "cart checked out to Morgan today" and "chiller #3 on the roof" into one table with half the columns null in each case.

### 0PB.14 Property types are now org-configurable

Was `CUSTOMER_TYPES`, a hardcoded four-value array. Now `settings.dispatchPropertyTypes`, seeded with the same four, edited at **Settings → Dispatch → Property types**.

**Ids are load-bearing.** `dispatch_customers.customer_type` stores the id, so the seeded ids must stay `commercial | residential | industrial | government`. Labels are freely editable; the id is shown read-only with a tooltip. New types get a slug from the label, previewed before adding.

- A type **in use cannot be deleted** — live "N in use" count, × disabled until zero.
- A type that disappears anyway is **merged back in as `(unlisted)`** from the values still on customer records, so its customers stay filterable.
- The edit select emits an explicit `Unlisted type (x)` option rather than falling through to the first entry and silently reassigning the customer.

Note this is a **third** customer-type vocabulary and deliberately so: CRM account tier (`customerTypeTiers`), premises segment (`dispatchPropertyTypes`), coverage tier (`dispatch_service_plans`).

### 0PB.15 Closed Won → Dispatch bridge, template-driven

The synthetic `auto_`-prefixed rows for won opportunities were built **inside the mount-only loader effect** (`[]` deps). Templates come from `settings`, so resolving them there froze against whatever settings held at mount. Moved to a `useMemo`; creating the real job now makes the placeholder vanish on the same render.

**Fabricated defaults removed.** Was hardcoded `crewSize: 1, durationHrs: 4, minLicense: 'Journeyman'` — numbers that looked like decisions. Now template-derived, and **null when nothing matches**, so the UI says "unset" instead of inventing.

**Two dead ends closed.** The placeholders were reachable but not actionable: scheduling one PUTs to `dispatch-jobs?id=auto_…` which 404s. The crew builder now refuses with a reason, `planWeek` excludes placeholders entirely, and a banner offers **Create job** — pre-filled, carrying `opportunityId` so the placeholder self-retires on save.

**On the module-toggle question.** Because the bridge computes rather than writes, a CRM-only org (`settings.dispatchEnabled` false) needs no special handling: the tab does not render, the memo never runs, no rows exist, and toggling the flag either way cannot strand data. **If auto-create is ever moved server-side — a webhook or scheduled function that WRITES on stage change — it must check the flag first.** That is the one place it becomes load-bearing rather than cosmetic, and it is recorded in the file.

### 0PB.16 Quote numbers moved server-side

`quotes.quote_number` was generated **in the browser** (`useQuotes.js`) from whatever quotes that user had loaded, and sat in the PUT allowlist — so it was both collision-prone and editable, on the one document customers actually see.

Now issued in `quotes.mjs` and immutable. The wrinkle: **v2 of Q-2026-004 must stay Q-2026-004**, so a blind "new number per POST" would have broken versioning. `resolveQuoteNumber` treats a client-supplied number as a **reference to verify, never a value to store** — the row must already exist in this org on that opportunity. A client cannot set or steal a number by any route.

### 0PB.17 Quote versioning — three latent bugs

Found while investigating why a new version came back empty (the real cause was §0PB.20). All three were real:

1. **It cloned the quote being VIEWED, not the latest.** The new version is numbered `maxV + 1`, so sitting on v1 with a v2 present produced a "v3" carrying v1's contents — silently discarding v2's work.
2. **`dealDiscount` was never copied**, so a deal-level discount reset to 0% on every version.
3. **Shallow copy shared item objects** — editing a quantity on the new version mutated the old one in local state until reload.

Also: the **3-version cap was removed** (hardcoded in two places, nothing server-side enforced it), and **empty states added** to both read paths — `lines.map()` over an empty array rendered a void under the column headers, making "no products" visually identical to "save silently failed".

### 0PB.18 Record-number integrity

Unique indexes plus retry, closing the read-max-then-add-one race on all three generators.

**The catch: quote versions SHARE a number by design.** A `(org_id, quote_number)` index would have made versioning impossible. Scoped `(org_id, quote_number, version)` instead. The dispatch columns are nullable and Postgres treats NULLs as distinct, so pre-numbering rows are unaffected.

**An index alone converts a silent duplicate into a 500 the user sees**, so `withNumberRetry` in `_lib.mjs` is the other half. Two details that matter: the number is issued **inside** the retry (reissuing outside would retry with the same losing number forever), and **only 23505 is retried** — a NOT NULL violation must surface at once, not be retried into a timeout.

`db/check-duplicate-numbers.sql` is the pre-flight: a unique index cannot be created over data that already violates it. Read-only, run per environment before `drizzle-kit push`. Came back clean on dev.

### 0PB.19 Template "Applies when" — the ctype axis, decided

The template tied to ONE value from `settings.customerTypes`. Two problems: one value could not express "applies to prospect AND customer AND partner"; and the axis was arguably wrong, since a new install needs the same crew, hours and licence whatever the relationship — what varies it is the **premises**.

**Resolved as both axes, both optional multi-selects, empty meaning "any".** Field relabelled **Applies when**.

Matching uses **specificity**: both axes beats one axis beats catch-all, so a general "Install" template coexists with a "Residential install" override without fighting. **Ambiguity is refused, not guessed** — two equally specific matches yield no template, because a wrong template silently supplies wrong crew, hours and licence, which is worse than supplying none. **Missing data is a miss**: an account with no type set does not match a tier-restricted template.

Legacy `ctype: 'X'` migrates to `ctypes: ['X']` and matches exactly as before. The old "Customer type linked" sanity check was decorative (`ok: true` unconditionally); it now flags a real hazard — more than one catch-all template makes matching arbitrary.

### 0PB.20 ⚠️ INCIDENT — every quote save failed in production

Removing `quoteNumber` from `ALLOWED_FIELDS` (§0PB.16) was right in intent. **But PUT is implemented as an upsert:**

```js
.insert(quotes).values({ ...payload, createdAt })
.onConflictDoUpdate({ ... })
```

`quote_number` is `NOT NULL`. **Postgres validates NOT NULL while building the tuple — BEFORE `ON CONFLICT` can divert to the update** — so the statement failed even though the row existed. Every quote PUT errored: line-item saves, status changes, everything.

**It presented as a display bug.** `handleSaveQuote` returns `null` on failure rather than throwing, so `handleSaveLineItems` awaited it, ignored the result, and the editor closed as though saved. A rejected write with no error anywhere — the "controls that appear to work" pattern, from this project's own rules.

Fix: supply the existing `quoteNumber` to the insert half while keeping it out of `set` so it stays immutable; and convert the null return into a throw so the editor stays open and says why.

**Lesson: removing a field from an allowlist is a WRITE-PATH change.** Every write path that touches the column must be traced, and an upsert counts as an insert. Tracing only the readers is what caused this.

### 0PB.21 ⚠️ INCIDENT — Dispatch tab crashed, `linkedAccount is not defined`

Hoisting the customer edit form to module scope was correct — it was remounting on every keystroke — but it still read **three** things from the parent's closure: `linkedAccount`, `save`, and `copyFromAccount`, the last of which **never existed anywhere in the codebase**.

`check-tdz.mjs` could not catch this: it checked *ordering*, not whether a binding exists at all. Extended to detect undefined references, and it immediately found a **pre-existing instance of the same bug**: `ActionEditor` in `AutomationsDetail.jsx` was hoisted without its `sel`/`inp` style objects, so Settings → Automations would crash on adding an action.

**The scanner needed two corrections before it could be trusted** — it crashed on concise arrow bodies, and produced 19 false positives from missing browser globals and unrecognised `catch` params. Final state: **135 files, 2 real bugs, 0 false positives.** It then caught a *third* real case later the same session, when a signature edit of mine was rolled back and `confirmDiscard` was passed but never destructured.

### 0PB.22 State-machine audit — CustomersView and TechniciansView

After three bugs from one rebuild, audited the view's state by transcribing it into an executable model — **including the real dependency arrays**, which turned out to decide the answer.

Two of the first three "failures" were harness artifacts: the model ran effects on every transition, where React runs them only when deps change. Same trap as the scanner — a checker that reports wrongly is worse than none.

**Real bug found (CustomersView): `list` is the FILTERED list.** Editing a customer and then clicking a facet that excludes them dropped them from the list, re-pointed `selectedId` at someone else, and loaded that customer over the in-progress edit. Fixed: the auto-select effect no longer re-points while the form is open.

**Real bug found (TechniciansView), worse:** it has no `editing` flag and one effect on `[selectedId]`. `startNew` clears `selectedId` first, so with a technician selected, **"+ New" produced no form at all**. Guarded on `draft._isNew`.

### 0PB.23 Unsaved-changes prompt

Reuses the app-wide `showConfirm` — already in context, DispatchTab simply was not consuming it. **Every path that abandons a draft routes through one `guarded()` function** rather than a confirm bolted onto each call site, which is how one path ends up missing it. Covers switching rows, "+ New", and Cancel in both Dispatch views.

`draftIsDirty` compares **field-by-field, not by JSON string**: drafts carry UI keys (`_isNew`) and records carry server keys (`updatedAt`), so a whole-object compare would report every open form as dirty. Defaults like `commercial`/`active` do not count as edits; typing a name or picking a plan does.

**Not extended to Settings panels** — they use a different mechanism (`setSettingsDirty` + `CategoryDetailChrome`), and whether that flag actually blocks navigation anywhere is unaudited. See §9.

---

## 0X. Historical — Service Plans, Recurrence, Fleet Convergence, Customer Segmentation

> **Theme of the session.** Every item below started as "add a small feature" and turned out to be a correctness problem wearing a feature's clothes. Four separate cases of a value that was *displayed* but never *set*, *scored* but never *reached*, or *edited* in one place and *read* from another. The pattern from the prior session held: **when something looks fine, check that the write actually landed and the gate actually gates.**

### 0X.1 `preferredTechId` — a circular score, not a missing field

The horizon entry said the field was unsettable and the backend needed building. **Both halves were wrong.** The column existed on `dispatch_customers`, and `dispatch-customers.mjs` already normalised it on read, accepted it on POST, and listed it in the PUT allowlist. Only a `<select>` was missing.

The real defect was in the client normaliser:

```js
preferredTechId: j.assignedTechId || null,   // WRONG
```

`dispatch_jobs` has no `preferredTechId` column, so the job's "preferred tech" was synthesised from whoever was **already assigned**. The crew-builder rule was therefore circular:

- On an **unassigned** job — the only case the crew builder runs on — it was always `null`, so the +7 preference bonus **never fired**.
- On an **assigned** job it awarded the bonus to the tech already on it, and the detail panel rendered that back as "Preferred", which is why it always looked correct.

Fixed to resolve from the customer record (`cust?.preferredTechId`).

**Roster vs. filtered pool.** `CrewBuilderView` receives `techs={filteredTechs}` — filtered by the dispatcher's skill/vehicle/licence/team controls. Resolving a preference against that pool would report a *filtered-out* tech as "no longer on the roster". It now takes `allTechs` separately: candidates respect the filter, preference resolution uses the full roster.

**The preference note distinguishes five states** rather than collapsing them: not on roster · hidden by the current filter · blocked (names the blockers) · below the shortlist cutoff (`score >= 50`, top 5) · simply out-scored. The score stays soft at +7 and never blocks — a customer preference must not be able to strand a job.

### 0X.2 Job template picker in New Job

`applyJobTemplate(form, tmpl, cfg)` at module scope — pure, testable, returns `{ next, applied, skipped }`.

**Values that no longer exist in the org's vocabulary are reported as skipped, never written.** A `minLicense` the org has since renamed would otherwise fall through to the first `<option>` and silently downgrade the job's requirement from Master to Apprentice — the same silent-fallthrough class as the dangling-select bug in 0.1.

**Fill-empty would have been a no-op.** Every template-owned field already has a non-empty default (`crewSize:1`, `durationHrs:2`, `minLicense:'Journeyman'`, `priority:'normal'`), so the modal's existing "only fill where empty" convention would have applied nothing. Applying a template has to overwrite.

**Compounding guard.** `appliedTemplate.prevForm` holds the form as it stood before the template was applied. Switching from template A to B re-applies from that baseline rather than stacking; Undo restores the same baseline. Without it, applying two templates leaves a form matching neither.

### 0X.3 Two uneditable inputs in the templates panel

Both coerced inside `onChange`, which fights the keystroke:

- **Crew size** — `value={selected.crew||1}` with `parseInt(e.target.value)||1`. Backspace → `''` → `NaN` → `|| 1`, so the field rewrote itself to `1` before the next keystroke landed. It could never be empty, so it could never be replaced.
- **Default duration** — worse. Its value was the *derived string* `hrs + ' hours'`. Every keystroke was parsed back to a number and re-rendered as `"2 hours"`, pinning the caret. Completely locked.

Fixed by holding raw text while typing and coercing on blur (`commitNumber`), with the same guard in `handleSave` so a field left mid-edit can't reach the blob. Duration is now a real number input and the label carries the unit.

### 0X.4 ⚠️ Vehicles & Equipment — two sources of truth, wrong one being edited

The largest piece of the session, and the one worth remembering.

| Consumer | Was reading |
|---|---|
| Settings → Vehicles & equipment | `settings.dispatchVehicles` (blob) |
| Settings → Crews | `settings.dispatchVehicles` (blob) |
| **Dispatch board vehicle filter** | `dispatch_vehicles` **table** |
| **Technician "Assigned vehicle"** | `dispatch_vehicles` **table** |

Adding a van in Settings made it appear **nowhere** a dispatcher would look. Equipment had the same split with the table having no UI at all.

**Resolved onto the tables.** Both blob keys are **retained, not deleted** — they are the only way to translate legacy template ids during migration, and deleting live data to tidy up is not worth the risk. Nothing reads them for decisions any more.

**The modelling decision that drove everything: one equipment row = one physical unit.** "Two pressure testers" is two rows sharing a `category`, not a `qty` field. That forces requirements to name a **category** — a job needs *a* pressure tester, not asset #A-1042.

A quantity cannot express "one of the two is in the shop". Rows can:

| Scenario | Blob (`qty: 2`) | Table (2 rows) |
|---|---|---|
| Two units, one rival job | clear | clear |
| Two units, two rivals | blocked | blocked |
| **One unit in maintenance, one rival** | **clear — wrong** | **blocked** |
| Both units out of service | clear — wrong | blocked, names why |
| Category with no units | — | reported, not silent |

`checked_out` units still count as capacity; the overlap test decides whether they are free at that hour. Only `maintenance` and `out_of_service` remove capacity.

**`dispatch_jobs.equipment_ids` was free to repurpose.** No client had ever written it (every POST sent `[]`), and checkout is tracked the other way round on `dispatch_equipment.checkedOutJobId`. So it now stores required **categories** with no migration and no schema change.

**New panel is table-backed with no "Save changes" button** — each record writes on its own save, because a whole-blob PUT clobbers concurrent edits and equipment state changes when a tech checks something out.

**Idempotent import.** A card appears only while un-migrated blob entries exist, states exactly what it will create, deletes nothing, and derives row ids from the blob ids. Because the POST upserts on `id`, **re-running cannot duplicate**. `qty: 3` becomes three units sharing one category.

### 0X.5 Equipment as a scheduling constraint

`equipmentConflicts(job, allJobs, units, dateStr, probe)` — a job is blocked when every usable unit of a required category is committed to an **overlapping** job that day.

Overlap uses the same hour-window test as technician double-booking, so there is one notion of "at the same time" in the file. **A rival job with no start time is treated as holding the item all day** — it cannot be overlap-tested, and assuming no clash would be a fabrication.

**Two surfaces, deliberately.** A crew-builder banner while the dispatcher is still choosing a date, and a hard gate in `handleSchedule` once the start time that defines the window exists. Equipment is job-level: putting it in `scoreTech` would stamp an identical blocker on all five candidates.

### 0X.6 Vehicle class requirement — the opposite placement

**Schema change:** `dispatch_jobs.required_vehicle_type varchar(50)`, nullable, additive only. Ran `drizzle-kit push` per environment **before** deploying code (§18c).

A vehicle attaches to a **technician** (`dispatch_vehicles.assignedTechId`), so "needs a bucket truck" filters *who can serve the job* — a per-technician blocker in `scoreTech`. This is the mirror image of equipment, and the distinction is the point:

- **Equipment** → job-level shortage → gates in `handleSchedule`
- **Vehicle** → per-technician capability → blocks in `scoreTech`

Replaces `if (tech.vehicle) score += 3`, which rewarded owning *any* vehicle and never told a bucket truck from a hatchback. Now blocks with a named reason: wrong class, no vehicle assigned, or their vehicle in maintenance. Threaded through all four `scoreTech` call sites, including both inside `planWeek`.

Requirable classes are **derived from the fleet**, so a class nobody owns cannot be required.

### 0X.7 Job templates — Edit action was missing

The ⋯ menu offered Duplicate / auto-create toggle / Delete and **no Edit**. The row *was* clickable but nothing said so. Added Edit as the first menu item, and the template name now renders as a dotted-underline link.

### 0X.8 Dispatch customer segmentation (plan step "A")

No schema change. `CustomersView` now receives `jobs` and derives service history — **a denormalised `jobCount` would need maintaining on every job write and would be wrong the moment one was deleted.**

- Four filter axes: service plan · customer type · service history (`never` / `once` / `repeat` / `active`) · agreement expiry (`expired` / `renewing within 60 days`)
- Chip counts are computed against the search but **independent of the other filters**, so a chip's number tells you what you would actually get by clicking it
- Grouping by plan, type, or history with sticky headers and per-group counts
- Service summary strip in the detail pane: jobs completed, last served with day gap, upcoming with next date, plan, renewal warning

Cancelled jobs are excluded from service history — a cancelled job is not service rendered.

**Bug found while building it:** `agreementExpiry` has existed on the table since creation **with no control anywhere to set it**, so every renewal warning was unreachable and the field could only ever be null. Added a date input, disabled unless a plan is selected. The endpoint already accepted it on POST and PUT.

### 0X.10 Service plans as a first-class entity (plan step "B")

`serviceAgreement` was a varchar label with nothing behind it: no definition, no covered scope, no cadence, no price, no link to work performed. Now a `dispatch_service_plans` row.

**Schema:** new table + `dispatch_customers.service_plan_id` and `.plan_start_date`.

**Scope decision — plan per CUSTOMER**, not per location. `dispatch_service_locations` exists and per-site coverage is a real case (a property manager with different terms per building); if it is ever needed the migration is a nullable `location_id` on the join, not a reshape. That is recorded in the table comment.

**A plan carries no staffing.** No crew size, duration, skills or licence — it references a job template via `visitTemplateId`. Plan = *what is covered, how often, on what terms*. Template = *how a visit gets staffed*. Duplicating crew rules onto the plan would give two places to change them and one to forget.

**One field is authoritative, the other derived.** The first version let `visitsPerYear` be overridden independently; testing showed `quarterly` + an override of 6 kept `intervalDays: 91`, so recurrence would schedule 4 while the plan promised 6. Now:

| Cadence | Authoritative | Derived |
|---|---|---|
| annual / semiannual / quarterly / monthly | the cadence | interval **and** visits |
| custom | `intervalDays` | `visits = round(365 / interval)` |

A supplied visit count is **ignored, not merged**, and the form shows the derived value read-only rather than offering an input the server discards. A cadence change on PUT recomputes both.

**`coverageOf()` resolves four states** so the two eras coexist honestly: on a plan · on a *deleted* plan (`plan deleted` badge, not silently "no plan") · legacy label only (`Premium · unmapped`) · uncovered. `serviceAgreement` is **retained** — it is the only record of pre-plan coverage.

**Deleting a plan in use returns 409** with the customer count, since `service_plan_id` has no cascade; `active: false` is the retire path. Seeding from legacy labels creates one plan per label with ids derived from the label, so re-running cannot duplicate — and it deliberately does **not** reassign customers.

### 0X.11 Plan recurrence and the Service Due queue (plan step "C")

**Visits are COMPUTED, not generated.** Nothing is written until a dispatcher acts. A plan running five years costs one pass over that customer's plan jobs rather than a table of speculative future rows. This was the open design question, and `leadDays` settled it: if the admin controls when work becomes visible, there is no reason to materialise it early.

**Schema:** `dispatch_service_plans.lead_days` (default 14) + `.anchor_mode`; `dispatch_jobs.service_plan_id` + `.plan_due_date`.

**`planDueDate` is the load-bearing idea.** It records WHICH occurrence a job satisfies, separately from when the job actually runs. A visit due 16 July but performed 20 August still retires the July occurrence. Inferring that from proximity breaks the moment anything runs late.

**Only a COMPLETED job retires an occurrence.** The first version treated any non-cancelled job as retiring one, so a visit already *scheduled* advanced the pointer and the queue showed the occurrence after it — hiding the visit about to happen. Caught by the test table, not by inspection.

**`anchorMode` — the difference only appears once a visit runs late, then compounds:**
- `fixed` (default) — occurrences sit on `planStartDate + n x intervalDays` whatever happened. Contract compliance: four visits a year stay four, and missed ones are **counted and reported**, not skipped.
- `rolling` — next visit is `intervalDays` after the last **completed** one. Equipment intervals, where elapsed time since actual service is what matters.

**Coverage end stops the sequence** (`customer.agreementExpiry`) — a plan that ended in June does not keep producing due visits in September.

**`planStartDate` is now load-bearing and fails silently.** Without it a customer is simply absent from Service Due — no error, just nothing. The field shows a warn border and an explicit "no visit will ever come due" message when a plan is assigned without one.

### 0X.12 ⚠️ INCIDENT — production TDZ crash, whole Dispatch tab failed to mount

`0914b14` shipped C and the Dispatch tab died on load: `ReferenceError: Cannot access 'Ve' before initialization`, caught by the ErrorBoundary.

**Cause.** The recurrence block was placed immediately after `appliedTemplate` at line 3768. `visitQueue` is a `useMemo`, so it **evaluates during render**, and it read `jobs` (3805), `servicePlans` (3818) and `customers` (3819) — all in their temporal dead zone. `'Ve'` was one of them, minified.

**Why every existing gate missed it:**
- **Babel validation proves a file PARSES, not that it RUNS.** TDZ is legal syntax.
- **`vite build` succeeded.** Rollup emits TDZ violations happily; it is a runtime error.
- Dev tolerates it entirely — Vite's unminified dev bundle does not reorder, so the tab worked locally.

This is the *second* time this exact trap has been hit (see §8, "Temporal dead zone in production"), which is why it is now a scripted check rather than a written rule.

**Fix.** The block moved below `vehicleTypes`, the last of its dependencies, with a comment explaining why it must stay there.

**New tool: `scripts/check-tdz.mjs`** — walks each function body, finds initializers that evaluate during render (`useMemo` / `useCallback` dependency arrays, plain expressions; deferred arrow bodies are skipped) and flags any identifier declared later in the same scope. Also scans module scope. Run it before delivering any file with new hooks.

**Worth recording: the scanner needed three rounds before it could be trusted.** Each version confidently reported violations that were not violations:

1. Counted **object property keys** as references — `{ equipCategories: [] }` inside `EMPTY_JOB` read as a use of a variable of that name, pointing at innocent code in the previous commit.
2. Missed `OptionalMemberExpression` — `settings?.industries` is a *different AST node type* from `settings.industries`, so the property name fell through to the generic walk and was reported as a variable read. Two files flagged, both fine.
3. Ignored **nested scope**. An IIFE declaring `const now = new Date()` was treated as reading an outer `now` declared 250 lines later. Four hits in `ReportsTab`, all fine.

Final state: catches the real production bug (3 hits, exit 1), catches a synthetic violation, and reports **zero** across all 134 files in `src/`. Verifying a new diagnostic against a case whose answer you already know is not optional — the first two versions would each have sent us rewriting working code.

### 0X.9 Findings raised, not yet actioned

- **`autojob` / template auto-create does not exist.** It appears nowhere outside the settings panel. The "Tied to customer type" selector feeds a mechanism that was never built, and the panel's subtitle describes behaviour that does not happen.
- **The `ctype` axis is probably wrong.** The template ties to `settings.customerTypeTiers` (CRM tier: SMB / Mid-Market / Enterprise / Strategic / Partner) while `dispatch_customers.customerType` is a premises segment (commercial / residential / industrial / government). These are different *concepts*, not two copies of one list. A new HVAC install needs the same crew, hours, licence and equipment whether the account is a prospect or a partner; what varies it is the premises segment. Multi-select is requested and correct as a mechanic — the open question is which axis (or both).
- **`share` (shared vs per-van)** is displayed in tooltips but not modelled; per-van items are counted against total units like shared ones.
- **Two stale vocabulary mismatches** — see §9.

---

## 0PP. Earlier Session — SVR-2 Actually Shipped (BYOK key exposure + settings authorization)

> **Record correction.** The previous state doc recorded Critical 2 / SVR-2 as FIXED.
> **It was not in the repo.** At the start of this session `settings.mjs` was verified
> unpatched and **byte-identical on `dev` and `master`** — no role gate on PUT, plaintext
> key in the GET body. A full-history search across all four branches confirms no commit
> ever introduced `anthropicApiKeySet` before this session's `a9ed408`, and the audit
> actions the old entry described (`settings.apiKeySet` / `settings.apiKeyCleared`) appear
> in **no commit, on any branch, ever**. The most likely cause is the `dev` →
> `reset --hard origin/master` branch-drift reconcile in §0b, but no commit survives to
> confirm it. SVR-1 by contrast was verified genuinely live (`requireRole`, `writeAudit`,
> `getCallerName` all present).
>
> **Process rule: verify the live repo, not the state doc, before marking an audit item closed.**

**Shipped as `a9ed408` "sev fix set 2"** — 4 files, 322 insertions / 65 deletions, on **both `dev` and `master`**.

### The real leak was wider than the audit described
The audit flagged `extra.anthropicApiKey` (the encrypted field), and the old doc entry
claimed "no client code ever read or wrote the field — the BYOK entry UI was never built."
**Both were wrong.** The BYOK UI existed in `FeaturesDetail.jsx` and bound its key input to
**`aiSettings.byokProvider`** — a plain field in the `aiSettings` blob. Consequences:

- Key stored **unencrypted** as JSONB. The `encrypt()` path keys off `data.anthropicApiKey`, which the UI never sent.
- `aiSettings` is returned to **every org member** on GET — gating `anthropicApiKey` alone would have fixed nothing.
- Key rendered in **plaintext** in the BYOK card description (`Active · ${byokProvider}`).
- `useSettings.js` mirrored it into **localStorage** on every settings change.
- "Export config" wrote it to a **downloadable JSON file**.
- `ai-score.mjs` reads `extra.anthropicApiKey`, so a key entered via that UI was **never used** — BYOK was functionally dead while leaking the secret.
- The panel's own copy claimed "encrypted with AES-256-GCM", false for that path.

### What shipped

**`netlify/functions/settings.mjs`**
- **PUT is Admin-only** — `requireRole(auth, ['Admin'], headers)` on the whole branch. See the design note below.
- **GET never returns plaintext.** All members get `anthropicApiKeySet` (boolean); Admins additionally get `anthropicApiKeyLast4`. Non-admins never trigger a decrypt at all.
- `scrubAiSettings()` strips key material from `aiSettings` on **both read and write** — plaintext self-heals out of the DB on the first admin save.
- `extractLegacyKey()` does a **one-time migration** of an existing plaintext key into the encrypted field — which also makes BYOK functional for the first time.
- Corrupt ciphertext degrades the last-4 hint instead of 500-ing settings load for the whole org.
- `writeAudit()` on every successful PUT — records *that* the key changed, never the value.
- Catch block switched to `serverErrorBody(err, 'settings')` (it still returned raw `err.message`).

**`src/Tabs/settings/data/FeaturesDetail.jsx`** — key input is **write-only** (always empty on load; `keyAction` state so an untouched box never clears a stored key), shows `✓ Key installed · ••••1234`, adds **Remove key** with undo, `byokProvider` reverted to a provider **label**, export config scrubs key-shaped values, 403 surfaces as a readable "you need Admin" message.

**`src/hooks/useSettings.js`** — `stripKeyMaterial()` removes key material from the localStorage bootstrap **and** from both the cache write and the auto-save PUT body. Bootstrap **self-heals** a pre-fix plaintext cache immediately.

**`src/Tabs/PersonalView.jsx`** — "Save preferences" was PUTting `{...settings}` to `/settings` **from a non-admin view** (the SVR-2 integrity vector verbatim), and `notificationPreferences` was in neither the GET nor PUT of `settings.mjs`, so it silently did nothing. Rerouted to `/users?me=true` → `profile.notificationPrefs` (already in the sanitize whitelist — **no schema change**), spreading the full flattened profile so the server's `sanitize()` rebuild doesn't wipe other profile fields.

### ⚠️ Design change vs. what the old doc described
The superseded entry described non-admin PUTs having the secret field **silently stripped, not 403'd**, reasoning that the settings auto-save round-trips the whole object. **Shipped behaviour is the opposite: the entire PUT is Admin-gated.**

Rationale: SVR-2's stated impact is *"(b) Integrity/DoS — any user rewrites shared config that every other user depends on"*, and its prescribed fix is "Require isAdmin for PUT." Field-stripping closes the secret leak but leaves any member able to rewrite `stages` / `fieldVisibility` org-wide.

**Consequence to watch:** any legitimate non-admin write through the settings auto-save now 403s. One existed (`PersonalView` notification prefs) and was rerouted; every other settings writer sits under `AdminView`. Believed zero blast radius — confirm as reps exercise dev. If the strip-don't-403 behaviour is ever preferred, the Admin gate must stay on non-secret fields too or SVR-2(b) reopens.

### Audit actions emitted
`settings.updated`, `settings.apikey.set`, `settings.apikey.cleared`, `settings.apikey.migrated`. **No schema change.**

### Open item raised
- **`PUT /users?me=true` accepts a self-supplied `role`** — `sanitize()` takes `data.userType || data.role`, and the `me` branch only checks id match. Server authorization reads Clerk `publicMetadata`, so not real privilege escalation, but it flips client-side gates and pollutes the roster. Needs its own audit item.

---


---

## 0PP-a. Prior Session (cont.) — SVR-3: Uniform Role Enforcement Sweep

### SVR-3 as written was already CLOSED
All six core entity endpoints already had the gates (ReadOnly block on POST/PUT/DELETE before the try, ownership checks on PUT and DELETE-by-id, Admin gate on `?clear=true`) — shipped in the SVR-1 Highs batch. The audit's own line numbers give it away: it cites `opportunities.mjs:154/202/315`, but POST/PUT/DELETE now sit at **160/208/333**, shifted by exactly the inserted gate code. The finding was written against a pre-remediation snapshot.

**But its fix instruction — "define the role→capability matrix once and apply it uniformly" — was only half applied.** Six endpoints had it; nine did not. A full sweep of all 29 mutating functions found the following, all now fixed.

### CRITICAL — `audit-log.mjs` forgeable audit trail (higher severity than SVR-3 itself)
POST had **no role check** and wrote client-supplied `action`, `userId`, `userName`, and `timestamp` straight to the table. `App.jsx` sends `userId: currentUser` — a *display name*, fully attacker-controlled. Any authenticated member could forge entries attributing arbitrary actions to any user at any timestamp, or flood the log. **This undermined the audit trails shipped for SVR-1 and SVR-2** — a log anyone can write to is not evidence.
- Actor and time are now **derived server-side** (`auth.userId` + `getCallerName()`); client values are ignored.
- POST gated with `requireWrite`; **GET gated to Admin/Manager** (reading the org activity trail is privileged; both callers are admin-only UI).
- Display is unaffected — `AdminView` renders `e.userName || e.userId`, and `userName` is still a real display name.

### Other real gaps closed
- **Dispatch x 5** (`jobs`, `customers`, `equipment`, `technicians`, `vehicles`) — **20 mutating branches, zero role references.** Any authenticated user including ReadOnly had full CRUD over the entire field-service module. Now `requireWrite` at handler top (placed before the sub-resource branches in `dispatch-jobs`, so `?resource=lineitems|history` is covered too). **Policy: any non-ReadOnly may write Dispatch** (Admin/Manager/Sales Rep) — Jeff's call.
- **`saved-reports.mjs`** — DELETE was scoped to `orgId` only, so any member could delete anyone's report. Create already stamped `ownerId`; it was simply unused. Added `requireWrite` + an `assertOwner()` helper gating PUT and DELETE to **owner-or-Admin** (unknown ids still fall through to existing upsert/no-op behaviour).
- **`documents.mjs`** — `userRole` was referenced but only for read visibility, and `canSee()` has the role param commented out of its own signature. Mutations were ungated. Added `requireWrite`.
- **`recommendation-log.mjs`** — POST/PUT ungated. Added `requireWrite`.
- **`spiff-claims.mjs`** — approve/reject and delete were gated, but **POST (claim submission) had no check at all**. Added `requireWrite`.

### New shared helper — `requireWrite(auth, event, headers)` in `auth.mjs`
The "define once" piece SVR-3 asks for. ReadOnly is the only role with no write capability at all, so this encodes that half of the matrix in one place. Non-mutating methods pass straight through, so it is safe to call **once at the top of a handler** rather than per branch. Returns a ready-to-return 403 or `null`.

### Verified-correct, no change needed
- **`dashboard-configs.mjs`** — the only mutating endpoint left without a role gate, **deliberately**. PUT writes to a self-scoped id (`'dash_' + userId + '_' + orgId`), so a user can only ever write their own dashboard layout. Personal preference, same class as `/users?me=true`.
- Already gated with **local** helpers: `automations` (`canWrite`), `webhooks` / `export-schedules` / `export-dsr` / `api-keys` (`requireAdmin`), `backup` / `export-runs` (inline), `products` / `quotes` / `calendar-connections` (local `isAdmin` consts).

### Remaining uniformity work (deferred — not a vulnerability)
Those local helpers all work; they are just not the shared ones. Migrating them to `requireWrite` / `requireRole` is mechanical but was **kept out of this deploy on purpose**: mixing "close a hole" with "rename a working helper" makes rollback harder if something breaks. Note also that `products` / `quotes` / `spiff-claims` / `calendar-connections` declare local `isAdmin` / `isManager` / `isReadOnly` consts that **shadow the imported helpers of the same name** — a real footgun worth cleaning up in that same pass.

**Coverage after this sweep: 29 of 29 mutating functions gated** (28 by role, 1 self-scoped by construction).

## 0PP-b. Prior Session (cont.) — Dispatch Module: Job Create, Customers, Technicians

Triggered by testing SVR-3 as a Sales Rep: creating a dispatch job returned `id, customerId, title required`. That was a **400, not a 403** — the role gate passed and the rep was correctly authorised. The bug was pre-existing and unrelated.

### New Job create had never worked, for any role
`handleSaveNewJob` sent `{ title, jobType, priority, status, durationMinutes, scheduledDate, opportunityId }`. The server requires `id`, `customerId`, **and** `title`. Two of three were never sent, so the feature had never once succeeded. Underneath that:

- **No `id`** — simply missing (codebase rule is client-generated `'<prefix>' + crypto.randomUUID()`).
- **No `customerId`, and no way to produce one.** The Customer field was free text, but `dispatch_jobs.customerId` is `notNull` and an FK to `dispatch_customers`.
- **No Title field existed** — `title` was set to the customer name.
- **Address / crew size / min licence / skills were collected and dropped**, living only in optimistic local state and vanishing on refresh (the no-local-only-state rule).

### Schema additions (4 columns, all nullable, additive only)
| Table | Column | Purpose |
|---|---|---|
| `dispatch_customers` | `customer_number varchar(50)` | `CUST-0001` — human-readable, **server-assigned, immutable** |
| `dispatch_jobs` | `crew_size integer` | techs required on site |
| `dispatch_jobs` | `min_license varchar(50)` | Apprentice / Journeyman / Master |
| `dispatch_jobs` | `need_skills jsonb DEFAULT '[]'` | required skill ids |

Applied via the **Neon SQL editor**, not `drizzle-kit push` (four `ADD COLUMN IF NOT EXISTS` plus a re-runnable backfill). Because dev and production share the Neon `main` branch, one run covered both — production therefore has the columns while `master` still runs code that does not read them. Harmless *because* they are nullable and additive; this is exactly why additive-only matters.

### Customer numbering
`nextCustomerNumber(orgId)` scans existing numbers per org and returns `CUST-` + zero-padded max+1. **Assigned server-side only** — two reps creating customers simultaneously would collide client-side. **Immutable**: POST is an upsert and reuses any existing value; the PUT whitelist deliberately omits `customerNumber`; the client save handler also strips it. Backfilled 8 existing customers in `CUST-0001`–`0008` by `created_at`.

### Create flow — three writes in dependency order
1. **Customer** — only when the typeahead did not resolve to an existing one.
2. **Service location** — only when an address was entered. `dispatch_jobs` has **no address column**; the address lives on `dispatch_service_locations` (whose `address` *and* `city` are `notNull`, which is why City became required) and the job points at it via `locationId`.
3. **Job** — carrying `customerId`, `locationId`, `accountId`, and every collected field.

Not transactional: if step 2 fails, the customer from step 1 already exists. Retrying finds them in the typeahead rather than duplicating, but state is not rolled back.

### Two enum-vocabulary bugs found
- **Priority** — the form offered Low/Medium/High/Urgent and `.toLowerCase()`'d it, producing `medium`/`urgent`. The schema documents `low|normal|high|emergency`; `prioColor`/`prioColor2` were written against a *third* set (`urgent|standard|low`). New jobs now store schema-valid values and both colour maps accept either. **This is a band-aid — see the normalization item in §9.**
- **`jobType: 'service'`** — not in the documented set. Now `'repair'` (the schema default). Safe because create had never succeeded, so no rows carried `'service'` from this path.

### Customer typeahead spans two tables
`dispatch_customers` and CRM `accounts` are separate tables (see §8). The typeahead shows two labelled groups: existing dispatch customers with their `CUST-` numbers, and **CRM accounts not yet in Dispatch**. Picking an account creates the dispatch customer on save with `accountId` set, and prefills address/city/state/zip from the account — but only into fields left empty, never overwriting typed input. Already-linked accounts are filtered out by `accountId` *and* by case-insensitive name, so companies present in both tables but never formally linked are still hidden from group two.

### New: Dispatch → Customers view
Nothing in the app could previously list, create, or edit dispatch customers — `dispatch-customers` was referenced in exactly one file and only by new code. The 8 existing rows had been seeded directly and were invisible.

List + detail: `CUST-` number, linked/unlinked badge, do-not-service badge; editor covers linked CRM account (with a manual **copy address** action), customer type, service agreement, contacts, service address, notes, do-not-service + reason. **Deliberately no delete** — `dispatch_jobs.customerId` is an FK with no cascade, so deleting a customer with jobs would orphan them. "Do not service" is the retirement path.

### New: Dispatch → Technicians view
Three disconnected stores existed for technician data:
1. **`dispatch_technicians` table** — what the board actually reads.
2. **`settings.users[].dispatch*`** — what the Settings → People panel edited, and what `DispatchTechDetail` reads.
3. **`settings.extra.dispatchTechProfiles`** — persisted by `settings.mjs`, **read by nothing**. Dead key.

Store 2 was a **no-op twice over**: it PUT `{ users: [...] }` to `/settings`, but `settings.mjs` has no `users` key in its whitelist (users live in their own table), and the handler never called `setSettings`. So skills, certs, licence, vehicle, hours cap and the active-tech toggle had **never persisted anything, for anyone**.

`dispatch_technicians` is now the source of truth. New view covers names, **linked app user**, contact details, employment type, status, home zip, skills, certifications, labour/overtime rates, assigned vehicle, notes. Skills and certifications render **always**, with an empty-state pointing at Settings → Dispatch, rather than being hidden when the catalogue is empty.

`normaliseTech` was hoisted from inside the load effect to module scope, and a `techsRaw` state added — the board's mapping intentionally drops `userId`, rates and notes, so the editor works off raw rows while the board keeps its expected shape.

**`UsersDetail` dispatch card replaced with a pointer.** It had been gated on the *org-wide* `settings.dispatchEnabled`, so every user in a dispatch-licensed org appeared to be a technician. ~80 lines of dead UI removed.

### `DispatchSkillsDetail` — malformed JSX shipped to production
Both `{addingSkill ? (` and `{addingCert ? (` heads were missing, so the add-forms rendered unconditionally and the orphaned `) : (` / `)}` leaked onto the page as literal text. **Babel rejected the file; Vite shipped it anyway** — esbuild tolerates a stray `}` in JSX text where Babel errors. A swept check of every `.jsx` in `src/` found no others. See §8.

### Dispatch data lives under a different org
Dev session org is `org_3BDQEH7sxrZ43ydOkMGI00Tf0LK`; all 8 dispatch customers and all 11 jobs sit under `org_3Cwnbl…`. Dev and production run **separate Clerk instances against the same Neon database**, so the dev org correctly sees none of it. The jobs visible on the dev board are `auto_<opportunityId>` placeholders synthesized client-side from Closed Won opportunities — not database rows, not editable.

### Also fixed
`DispatchTab`'s load never checked `res.ok`, so a 500 or 403 parsed to `{error}`, fell through `|| []`, and rendered as "no customers yet" — an endpoint failure was indistinguishable from an empty table. Now reports `Dispatch data failed to load: customers (500)…`.

---

## 0PP-c. Prior Session (cont.) — Technician Model Consolidation, Licences, Scheduling & Board Ranges

Follow-on from §0a2. Closes step 3 of the technician plan, makes scheduling actually persist, and adds date-ranged board views.

### Step 3 — the old technician stores retired
No migration was needed: `users.mjs` has **zero** `dispatch*` references, so `settings.users[].dispatch*` was never persisted to the users table at all. Those fields lived only in memory.

- **`DispatchTechDetail` unwired and deleted** — catalogue entry (`dsp-techs`), `AdminView` import, id-map entry and route all removed.
- **`settings.extra.dispatchTechProfiles` removed** from `settings.mjs` GET + PUT and the `useSettings` defaults. Dead key, read by nothing. Note the key now drops out of the stored `extra` blob on the next admin save — intended, and harmless since it held an empty array.
- **`DispatchCrewsDetail` had the same bug** and was not on the list: its crew-member picker read `settings.users.filter(u => u.dispatchEnabled)`, a flag nothing sets any more, so you could create a crew but never add anyone to it. It now fetches `dispatch_technicians` directly, filters out `inactive`, and keeps the existing `u.id || u.name` matching so legacy name-based members still resolve.

### Technician licence level — a fabricated value driving real decisions
`dispatch_technicians` had **no licence column**, yet the board's crew-matching compared `LICENSE_ORDER[tech.license]` against `job.minLicense`. `normaliseTech` invented the value: subcontractor → Journeyman, has-any-skill → Journeyman, else Apprentice. So a tech with one skill was silently promoted and a real Master with none was blocked. The crews panel had its own fallback (`u.dispatchLicense || 'Apprentice'`), which is why every member rendered "Apprentice".

- **New column** `dispatch_technicians.license_level varchar(50)` (nullable, additive) + normaliser, POST row and PUT whitelist.
- **Licence select** in the Technicians editor, sourced from `settings.dispatchLicenses` so it stays admin-configurable. Unset is a real option; technicians without one get a red **no license** badge in the list.
- **Unset blocks.** `if (job.minLicense && !tech.license)` pushes `License not set · job needs X`. Unset now scores `-1` rather than defaulting to `1` — previously it passed as Journeyman-equivalent, which was the dangerous half of the bug. The whole licence check is now conditional on the job actually specifying a minimum.

### Blockers were advisory — the Add button ignored them
`const canAdd = c.score >= 70;` gated eligibility on **score**, not blockers. A tech scoring 70 from cert currency, hours and distance got the normal **+ Add** button while carrying a hard blocker. This applied to `Missing skill`, `Expired cert`, `Over-hours` and `Double-booked` too, not just licence.

- `canAdd = c.blockers.length === 0 && c.score >= 70`.
- **Blocked candidates sort below every clean one** regardless of score.
- **Override now confirms**, listing every blocker by name, with Cancel / "Override and assign".

### `Schedule & notify` was a stub
Its entire handler was `onClick={() => setSaving(true)}` — no persistence, no SMS, and `saving` never reset. `Save draft` and `Notify techs (SMS)` had no `onClick` at all. Nothing anywhere wrote `assignedTechId` / `coTechIds`, so **crew assignment had never persisted**, same class as job create.

- **`handleSchedule`** PUTs `assignedTechId` (lead = first added), `coTechIds`, `status:'scheduled'`, `scheduledDate`, `scheduledStart`, `scheduledEnd` (derived from duration), `timeSlot:'exact'`.
- **Date + Start fields** added to the crew-builder footer; both required. Start uses the shared `TimeDropdown` (`components/ui/`), not a native `<input type="time">`.
- **Audit on schedule** — `dispatch.schedule`, or `dispatch.schedule.override` when a blocked tech was assigned, with every ignored blocker named. Actor/timestamp are server-derived (the `audit-log` fix from §0a).
- **`SMS` deliberately stubbed** and visibly disabled until the Twilio A2P campaign clears.
- **Scope bug caught pre-delivery:** `handleSchedule` lives in `CrewBuilderView` but `setJobs` / `addAudit` / `setSelectedJobId` belong to `DispatchTab`. Babel passes that; it would have been a runtime `ReferenceError`. Now delegated via an `onScheduled` callback.

### Three more hardcoded read mappings
The job normaliser discarded stored columns: `minLicense: 'Journeyman'` (a literal — so the licence blocker was comparing against a **constant**, and only looked right because `EMPTY_JOB` defaults to Journeyman), `needSkills: []`, and `crewSize` derived from assigned techs rather than the stored value. All three now read from the row.

### Board date ranges — Today / This week / This month
The board **never filtered by date**; "Today" was a label, so a job scheduled for next week appeared on today's timeline.

- **Today** — existing hour timeline, now filtered to the anchor date.
- **This week** — technician rows x 7 day columns, with each tech's weekly hours against cap (red when over).
- **This month** — calendar grid; clicking a day drops into that day's Today view.
- Arrow navigation by day/week/month, a **Today** reset button, and the header subtitle follows the range.
- **Unassigned tray stays unfiltered** by design — an unscheduled job has no date to filter on, so filtering would make it unreachable.
- **Week gained a "Needs a crew" row.** Week renders jobs inside technician rows, so a job with a date but no crew was invisible there while still showing in the month grid — the two views disagreed about the same data.
- **Timezone trap avoided:** `new Date('2026-08-12')` parses as UTC and shifts a day in negative-offset zones, which would land jobs on the wrong column. All date construction goes through `fromYmd` (local parts); comparison is on the `'YYYY-MM-DD'` strings directly.

### "Add" reads as a commit — three times in one session
Settings skills (Add vs **Save changes**), and the crew builder twice (**+ Add** builds a draft crew; nothing persists until **Schedule crew**). Two jobs sat dated-but-uncrewed because of it. Mitigated in the crew builder: the footer now says "n/n added — not scheduled yet" whenever anyone is added, and the button reads "Schedule crew (n)". The settings panels still have the same shape — see §9.

---

## 0PP-d. Prior Session (cont.) — Dispatch Operations: Job Editing, Categories, Scheduling & Availability

Follow-on from §0a3. Everything here is frontend plus one new endpoint; **no schema change** — every column and table used already existed and was unreferenced.

### Job editing did not exist
The only job writes in the whole tab were POST (create) and the scheduling PUT. Clicking a job routed to the Queue and showed it read-only, so once created, priority, address, title, duration, crew size, min licence and skills were frozen. The PUT endpoint supported all of them; nothing had ever called it.

**New Jobs sub-tab** — searchable list with status filter, priority colour bar, editable detail. Address editing writes to `dispatch_service_locations` (the job only holds `locationId`), so saving is create-or-update on that row before the job PUT; the panel states that other jobs sharing the location will see the change. **Customer is deliberately read-only** — changing it would orphan the location and invalidate any assigned crew.

### Job categories & types (`trade` / `jobType`)
Both columns existed, were hardcoded (`'hvac'` / `'repair'`), and nothing branched on either. Now admin-configurable via **Settings → Dispatch → Job categories & types**, with `dispatchTrades` and `dispatchJobTypes` in `settings.extra`.

- **Types are scoped to a category**; a type with no `categoryId` shows under every category, so partially-categorised lists degrade gracefully.
- Changing category clears a type that does not belong to the new one.
- Starter list seeds HVAC / Electrical / Plumbing / Solar plus sixteen types.
- Both columns are `notNull` with legacy defaults, so an explicit "none" would have silently stored `'hvac'`/`'repair'`. POST and the normaliser now use `''`.

### Priority vocabulary normalized
Three incompatible vocabularies had coexisted. Now one canonical set — `low | normal | high | emergency` — with `PRIORITY_ALIASES` translating legacy values **at the read boundary only**. The job read mapping had been translating *forward* into the legacy set (`'emergency' → 'urgent'`), which is what kept it alive. `prioColor2` collapsed to an alias of `prioColor`. The board legend showed three levels against four stored values, so **High had a colour with no key**. Migration SQL is optional cleanup, not a prerequisite.

### Crew-builder blockers were advisory
`const canAdd = c.score >= 70;` gated eligibility on **score**, not blockers — a tech scoring 70 from cert currency, hours and distance got the normal **+ Add** button while carrying a hard blocker. Applied to missing skills, expired certs, over-hours and double-booking, not just licence.
- `canAdd = c.blockers.length === 0 && c.score >= 70`.
- Blocked candidates sort below every clean one regardless of score.
- Override opens a confirmation naming every blocker.

### `Schedule & notify` was a stub
Its entire handler was `onClick={() => setSaving(true)}`. Nothing wrote `assignedTechId` / `coTechIds`, so **crew assignment had never persisted**. Now PUTs the crew, status, date, start and derived end; Date and Start fields added (Start uses the shared `TimeDropdown`); audits as `dispatch.schedule` or `dispatch.schedule.override` with the ignored blockers named. SMS left visibly disabled pending Twilio A2P.

**Scope bug caught pre-delivery:** `handleSchedule` lives in `CrewBuilderView` but `setJobs` / `addAudit` / `setSelectedJobId` belong to `DispatchTab`. Babel passes that; it would have been a runtime `ReferenceError`. Delegated via an `onScheduled` callback.

### Board date ranges + Jobs/Schedule sub-tabs
The board **never filtered by date** — "Today" was a label. Added Today / This week / This month with arrow navigation. Week is technician rows x 7 days; Month is a calendar grid that drills into a day. Week gained a **Needs a crew** row because it renders jobs inside technician rows, so a dated-but-uncrewed job was invisible there while showing in the month grid.

Sub-tabs restyled from pill buttons to the underline treatment used by Quotes/Reports/Sales Manager, and now persist to `localStorage` (`tab:dispatch:subView`).

### Mass-schedule: propose, review, confirm
Was unwired. Now reuses `scoreTech`, so bulk assignment ranks and blocks identically to the crew builder. Urgent jobs first; only zero-blocker candidates; running per-tech load so work is not stacked on the best technician; slot search inside each tech's own shift. Nothing is written until confirmed. Jobs with no eligible tech are **skipped and listed with the reason**. One PUT per job so a single failure does not abandon the rest; audits as `dispatch.schedule.bulk`.

**Known limitation:** assigns a single tech per job, ignoring `crewSize`.

### Technician availability (two layers, both previously dead)
`dispatch_technicians.workingHours` (jsonb, recurring weekly pattern) and the entire `dispatch_schedule_blocks` table (dated exceptions) existed in `schema.ts` and were **completely unreferenced** — the table had no endpoint at all.

- **New `dispatch-schedule-blocks.mjs`** — full CRUD, `requireWrite`-gated, `?techId=` / `?from=` / `?to=` filters. Overlap is `start <= to AND end >= from` so a block spanning the window is returned. `createdBy` server-derived.
- **`dispatchBlockTypes`** settings list (admin-managed, colour per type), seeded server-side with PTO / Sick / Holiday / Training / Jury duty / Bereavement / Other.
- **Schedule sub-tab** — tech rows x 7 days, shift hours per day, click a cell to mark someone out (date ranges, partial days), per-tech shift pattern editor.
- **Enforcement** — `scoreTech` gained `Not rostered on {Day}` and `Off · {type}` blockers; the planner's slot search runs inside each tech's shift and avoids partial-day blocks; `handleSchedule` validates the chosen start against shift bounds and partial blocks (the only point a time exists).
- **`hoursCap` derived** from the shift pattern instead of the hardcoded 40 — another fabricated value driving a real blocker.
- **Time off renders on both boards** — badge plus shaded hour cells on the day board, coloured chips on the week grid.
- **Conflict flow:** marking someone out over work they are committed to now lists the affected jobs and offers **Reject** or **Accept & re-crew** — which saves the block, unassigns those jobs back to the queue, audits `dispatch.timeoff.unassign`, and drops the dispatcher into the Queue with the first freed job selected.

### More hardcoded read mappings found
`minLicense: 'Journeyman'` and `needSkills: []` were literals in the job normaliser, so **the licence blocker was comparing against a constant** — it only looked correct because `EMPTY_JOB` also defaults to Journeyman. `crewSize` was derived from assigned techs rather than the stored value. Also the technician licence itself: `normaliseTech` invented one from employment type and skill count.

### Process failure worth recording
A patch script reported two edits applied, then aborted before writing. Both were silently lost: the sub-tab `localStorage` persistence, and the pill-toggle removal. The missing removal was later mis-diagnosed as "a second toggle the earlier patch missed" — it was the only one, never removed. **Verify by grepping the file after every patch, not only after a reported failure.**

---

## 0PP-e. Prior Session (cont.) — Technician Role, Scoping & Role Management

The fifth role, and the last piece before a technician mobile app. **No schema change.**

### Why the role and its scoping had to land together
`requireWrite` denied only ReadOnly. Adding a `Technician` role to Clerk *before* this work would have granted full write access to every dispatch endpoint — and, as the build revealed, to nine others as well.

**`requireWrite` is now deny-by-default for Technician**, with a single explicit opt-in:

```js
requireWrite(auth, event, headers)                          // denies ReadOnly AND Technician
requireWrite(auth, event, headers, { allowTechnician: true }) // dispatch-jobs.mjs ONLY
```

The point is that a new role must never inherit write access simply by not being ReadOnly. One caller opts in and then applies its own ownership check and per-field whitelist.

### Nine endpoints a Technician would have been able to write to
Neither of these was visible from the role definition itself — both were found by sweeping call sites after adding the role.

- **All six core CRM endpoints** (`opportunities`, `accounts`, `contacts`, `tasks`, `activities`, `leads`) gated on `isReadOnly(userRole) && [...].includes(method)` — a bare ReadOnly check, not the shared helper. A Technician passed it. All six migrated to `requireWrite`.
- **`quotes.mjs`** declared a **local** `const isReadOnly = userRole === 'ReadOnly'` that shadowed the imported helper (the footgun already on the horizon list from SVR-3) and gated quote create/update. A Technician passed it. Now routed through `requireWrite`; the shadowing const is gone.

### Technician capabilities
| | |
|---|---|
| **Read** | Only jobs where they are `assignedTechId` or in `coTechIds`. Only their own `dispatch_technicians` row (the roster carries colleagues' pay rates, phones, home zips). |
| **Write** | `status`, `techNotes`, `completionNotes`, `photosCount`, `customerSignature` — on their own jobs only. |
| **Status transitions** | `en_route`, `on_site`, `paused`, `completed`. **Not** cancel or unschedule — both dispatch decisions. |
| **Denied** | Job create/delete, everything CRM, customers, other technicians, scheduling, vehicles, settings. |

- **Resolution is by technician row, not user.** `dispatch_jobs.assignedTechId` FKs `dispatch_technicians.id`, so `resolveTechnicianId(orgId, userId)` maps the caller's Clerk id to their technician row first.
- **Fails closed.** Technician role but no linked technician row → 403, "No technician record is linked to your account." They own nothing, so there is nothing legitimate to return. The alternative default — falling back to "show everything" — would be a silent data leak.
- **404, not 403, on someone else's job**, so a technician cannot enumerate which job ids exist.
- **Illegal fields are rejected by name**, not silently dropped, so a mis-scoped mobile client fails loudly rather than appearing to succeed.
- Status changes go through the existing `recordStatusChange` helper into `dispatch_job_status_history`.

### Role changes never reached Clerk
`auth.mjs` derives `userRole` from Clerk `publicMetadata` on every request; the `users` table is only a mirror. **Nothing anywhere wrote a role change back to Clerk** — `invite-user.mjs` set it at invite time and that was all. Editing a role in Settings → Users updated the mirror alone, so server-side authorization did not change. Same class as `saveDispatchProfile`: a control that looked like it worked and changed nothing that mattered.

**New `netlify/functions/user-role.mjs`** (Admin-only, `PUT`):
- Writes Clerk `publicMetadata` (merged, not replaced — it also carries `name`), then updates the mirror best-effort. Clerk is authoritative, so a mirror failure is a stale roster row, not a failed permission change.
- **Verifies org membership first.** Clerk user ids are global, so without that check an Admin of one tenant could rewrite a role in another.
- **Refuses self-demotion from Admin** — an admin removing their own rights can lock the org out of its own settings.
- Audits `user.role.changed` with before → after.

### `'Sales Rep'` vs `'User'` — a mismatch that failed open
`UsersDetail` had **two** role lists that disagreed (`'Sales Rep'` at one site, `'User'` at another) plus a third in `FlsDetail`. `'Sales Rep'` worked only because `auth.mjs` treats any unrecognised role as a rep — it failed *open*. Consolidated into one `ROLE_OPTIONS` with a value/label split: stored `'User'`, displayed "Sales Rep". Technician added to all three.

### Still outstanding
- **Frontend gating.** A Technician currently lands on the full dispatcher UI (Board, Queue, Customers, Schedule, "+ New job", "Mass-schedule") and the server refuses most of it. Not a security hole, but it obscures real failures. Settings and Sales Manager already hide correctly, so the mechanism exists — Dispatch simply is not wired into it. This is effectively the start of the mobile surface: my jobs, my schedule, my profile.
- **Dispatch load errors show only the status.** `Dispatch data failed to load: jobs (403)` while the server sent a clear explanation in the body. Surface the message.

---

## 0PP-f. Prior Session (cont.) — Technician Frontend, Settings Save Errors, Job Numbers

Closes out the Technician work and clears the contained items from the backlog. **No schema change.**

### Technician frontend
The server scoped everything, but a Technician still landed on the full dispatcher UI and the tabs simply failed. Not a security hole — the API refused them — but it hid real failures behind expected ones.

- **`AppHeader`** — a Technician gets one tab, **My Jobs**, instead of the ten CRM tabs. Plus a redirect effect: `activeTab` defaults to `'home'`, which a Technician has no tab for, so without it they land on a blank page behind a one-item nav.
- **`TechnicianView`** in `DispatchTab` bypasses the dispatcher chrome entirely — no Board, Queue, Customers, Technicians, Schedule, "+ New job" or "Mass-schedule". Sections: Overdue (only when non-empty), Today, Coming up, their own upcoming time off, last five completed.
- **Status buttons follow the transitions the server permits**, and nothing else: `scheduled → Start travel`, `en_route → Arrived on site`, `on_site → Pause | Complete job`, `paused → Resume`. Completed jobs show "contact dispatch if this needs reopening" rather than a control that would 403.
- `jobsRaw` / `techsRaw` are already server-scoped, so the view renders what the API returned rather than filtering client-side. `myTech = techsRaw[0]` is a deliberate coupling to that scoping.
- **Three `\u` escapes were sitting in JSX text and attribute positions**, where they render literally rather than as characters (JSX does not process them the way string literals do). Same class as the `DispatchSkillsDetail` bug, and Babel passes it.

### Settings panels: the save bug was worse than "swallowed"
Every settings panel used this shape:

```js
try { await dbFetch('/.netlify/functions/settings', {...}); }
catch (e) { console.error('save x', e); }
setSaving(false); setDirty(false);
```

**`dbFetch` resolves for any response**, so a 403 never reached the `catch` — nothing was logged at all, contrary to the assumption that failures were merely going to the console. Then `setDirty(false)` ran unconditionally. Since SVR-2 made `PUT /settings` Admin-only, **a non-admin's settings save has been silently doing nothing while the panel reported success.**

- New **`settings/shared/saveSettings.js`** exporting `putSettings(payload)`, which throws a readable Error on non-2xx (403 → "You need the Admin role to change these settings").
- **`CategoryDetailChrome` gained an `error` prop**, rendered as a banner above the panel body.
- **13 panels converted**; on failure they keep `dirty` true so the change is neither lost nor mistaken for saved.

Not converted (different shapes, no shared chrome, or being retired): `PipelinesDetail`, `AuditDetail`, `CompanyProfileDetail`, `FiscalYearDetail`, `CompanyCalendarDetail`, `PriceBookDetail`, `SsoDetail`, `EditBrandModal`, `TeamsDetail`, `TerritoriesDetail`, `UsersDetail`, `BuyerPersonasDetail`, `FlatListDetail`, `DispatchTechDetail`.

### Human-readable job numbers
`JOB-2026-0001` on `dispatch_jobs.jobNumber` — a column that had always existed and was never populated. Follows the `customerNumber` rules from §12c: **server-assigned only**, immutable (POST is an upsert and reuses any existing value; the PUT whitelist omits it), sequential **per org per year**. The Jobs view already displayed and searched it, so no client change was needed. Backfilled with one re-runnable `UPDATE`.

### Job template `name` split from `ctype`
The "Template name" input and the customer-type select both called `updateTemplate('ctype', ...)` — the same field — so templates had no distinct name and the list rendered customer types as names. Now separate, with existing rows migrated on read (`name = name ?? ctype`), which is lossless since `ctype` held whatever was last typed into either control. **This unblocks making templates selectable in the New Job modal.**

### `export-runs.mjs` — a real Technician gap
Its POST blocked only `userRole === 'ReadOnly'`, so a Technician passed and could **trigger an ad-hoc export of whole tables** — someone scoped to their own jobs everywhere else. Now uses `requireWrite`.

### Deliberately not done: the cosmetic helper renames
`automations` (`canWrite`), `webhooks` / `export-schedules` / `export-dsr` / `api-keys` (`requireAdmin`) and `backup` (inline) all gate to **Admin or Admin+Manager**, so Technician is already denied. Migrating them to the shared helpers is a rename with no behaviour change and non-zero risk. Recorded as tidying, not a fix — the only member of that group that mattered was `export-runs`, which is fixed above.

---

## 0PP-g. Prior Session (cont.) — User/Clerk Drift: Root Cause, Detection & Delete

The persistent disagreement between the Accelerep user list and Clerk had three separate causes, all silent. **No schema change.**

### Cause 1 — a profile save could silently demote you
`sanitize()` in `users.mjs` contained `role: data.userType || data.role || 'User'`, and it ran on **every** write to the users table — including `PUT ?me=true`, the self-service profile endpoint.

So any self-service save that did not happen to include `userType` — a timezone change from the header, notification preferences — rewrote the caller's roster role to `'User'`. It looked random because it depended on which screen someone last saved from. **This is the long-standing drift irritant.**

### Cause 2 — admin role edits never reached Clerk
`PUT /users` wrote `role` to the mirror only. `auth.mjs` reads Clerk `publicMetadata` on every request, so the roster showed the new role while authorization kept using the old one. No error, no warning. (`user-role.mjs`, added in \u00a70a5, is the correct path.)

### Cause 3 — drift was invisible
`users-sync.mjs` could reconcile, but only when someone thought to run it.

### The fix: the mirror can no longer decide a role
- **`role` removed from `sanitize()` entirely.** Every caller now passes it explicitly via a new `withRole(clean, known)` helper, and `roleOf(id)` reads the stored value so an update that carries no role cannot blank it.
- Only three paths set a role: **invite** (which sends the same role to Clerk with the invitation), **admin create** (the row does not exist yet), and **`user-role.mjs`** (writes Clerk first). Both update paths preserve what is stored.
- **`users-sync?check=true`** \u2014 dry run. Same reconciliation, writes nothing, no audit row. Settings \u2192 Users runs it on load and shows an amber **"Out of sync with Clerk"** banner with counts and a **Reconcile** button. Non-admins get a 403 and simply see no banner.

### Found live while testing
The signed-in Admin appeared **absent** from the user list, and the roster read **Admins \u00b7 0** while Settings worked normally. The row was present all along \u2014 it was the gmail account, showing as `Technician` in the mirror and `Admin` in Clerk. Exactly the drift above, caught in the direction the fix prevents. Reconcile corrected it.

Also surfaced: ten `@test.com` rows from earlier seed data exist in the mirror and in no Clerk account. The new banner reports them correctly as "in Accelerep not in Clerk".

### Deleting a user did nothing (and said it worked)
The user-list kebab sent the id in the request **body**; `users.mjs` DELETE reads it from the **query string**. The server returned `400 id is required`, the client never checked `res.ok`, and it removed the row from local state anyway \u2014 so deleted users reappeared on refresh. The profile-page call site sent `?id=` correctly; the two had drifted apart.

Both controls were also **labelled "Deactivate" while performing a permanent delete**, with confirm copy ("lose access") that read as reversible.

- **Deactivate** \u2014 now `PUT active:false`. Reversible, keeps the record; the existing "Deactivated" filter tab finally has content.
- **Delete user** \u2014 permanent, red, honest copy, and states that the Clerk account is unaffected.
- Both check `res.ok` and surface failures in a banner instead of mutating local state on failure.

**No undo toast on user delete, deliberately.** The other deletes are soft (flag + toast + clear); this is a hard `db.delete`, so an "undo" would re-insert a reconstructed row \u2014 new id, new `createdAt` \u2014 not restore one. An undo that cannot undo invites careless deletion. The real safety net is that **Sync from Clerk rebuilds any Clerk-backed user**, which is how the roster was recovered after the wipe incident; phantom rows with no Clerk account are intentionally unrecoverable. Deactivate is the reversible path.

---

## 0PP-h. Prior Session (cont.) — Settings Duplicate Row, Lead Scoring v1.5 (already done), Dispatch Labels

### Lead Scoring v1.5 was already complete — the horizon entry was stale
Investigated to build it; found every piece already shipped:
- `activities.lead_id` exists in the DB **and** `schema.ts`, with index `activities_org_id_lead_idx`.
- `LeadsTab.jsx` sets `leadId` when logging against a lead; `ActivityModal` accepts it via `initialContext`.
- `activities.mjs` persists it and calls `rescoreLead` on **POST, PUT and DELETE**.
- `leads.mjs` and `score-leads-batch.mjs` both pass `events` into `scoreLead`.
- `DEFAULT_LEAD_SCORING` ships five `op:'event'` rules — Demo 35, Meeting 28, Schedule 18, Call 15, Email 6, each with its own decay half-life.
- Verified live: every org with a saved `leadScoring` config has **10** engagement rules (5 status/recency + 5 event); orgs without one fall back to the default, which also has 10.

**The entry had been stale for some time** — completed in a session whose notes never reached these docs. Same class as SVR-2 being recorded as fixed when it was not, in the opposite direction. **Verify against the code before building from a horizon item.**

### Settings had a cross-tenant duplicate row
`SELECT org_id, COUNT(*) FROM settings` showed `org_3Cwn…` twice. The second row was:

```
id     = org_3B8Tg9OtNKHYGXXSRa0mpA9WNwU
org_id = org_3CwnbloUXZQl0e6KtDhXFXRK8UD
```

An `id` belonging to one org carrying another org's `org_id` — **a surviving artifact of the cross-tenant upsert bug fixed in §0e** (`onConflictDoUpdate` keyed on `id` alone, before `setWhere` was added). A save from `org_3Cwn…` landed on `org_3B8Tg9…`'s row and rewrote its `org_id`, leaving that org with no settings row at all. The `setWhere` fix stopped recurrence but never cleaned up the damage.

**Why it mattered:** `settings.id` defaults to `'default'` and nothing enforced one row per org. Both GET and PUT read `WHERE org_id = ?` and took `rows[0]` **with no ORDER BY**, so with a duplicate an org could read one config and write another — settings appearing to revert at random, with nothing in the logs. Current code writes `id: orgId`, so each org owns one row; the duplicate was legacy.

**Fixed:**
- Stale row deleted (all test data — nothing to recover).
- **`CREATE UNIQUE INDEX settings_org_id_uniq ON settings (org_id)`** — a second row per org now fails loudly at insert instead of creating an ambiguous read.
- `settings.mjs` GET and PUT reads gained `.orderBy(desc(settings.updatedAt))` as belt-and-braces. **`desc` had to be added to the drizzle import** — without it every settings request would have crashed, which `node --check` does not catch.

**Follow-up worth doing before production data exists:** the same upsert bug could have touched other tables in that window. A one-off audit for rows whose `id` prefix does not match their `org_id` would confirm.

### Dispatch sub-tab labels
**Board → Job Board**, **Schedule → Work Schedules**. Labels only — the `id` values key the `localStorage` sub-tab persistence (`tab:dispatch:subView`) and every render branch, so renaming those would reset saved tabs and break the switch.

---

## 0b. Prior Session — UI Features, Task-Completion Bug, Users-Wipe Incident & Recovery

### ⚠️ INCIDENT + RECOVERY: users table wiped via a "test" DELETE (resolved)
While verifying the SVR-1 `users?clear=true` Admin gate, Claude suggested running the **live DELETE as a "test"** from the Admin session. As Admin, it succeeded (200 is correct for Admin) and **wiped the org's `users` roster.** Root learning captured as a permanent rule (memory + §below): **never advise a destructive command against live/production data, even to verify a gate** — use read-only checks, a throwaway/non-admin account, or reason from code.

**Recovery — full, no permanent loss:**
- **Record assignments were never at risk.** Ownership fields (`salesRep`, `accountOwner`, `assignedTo`, `repName`, `createdBy`) are name-**strings on each entity row**, not FKs into `users`. Wiping the roster left every deal/account/task assignment intact.
- **Clerk is the source of truth** for identity/email/role/org-membership; the `users` table is a mirror. Invites *failed* to re-add people because they were still Clerk org members (Clerk rejects inviting an existing member) — the missing piece was a roster rebuild, not an invite.
- **Built `users-sync.mjs` + a "⟳ Sync from Clerk" button** (Settings → Users) as the recovery tool AND a permanent admin feature. One click rebuilt the whole roster. See "New feature" below.
- **Quota is the one DB-only field** not mirrored to Clerk — may need manual re-key or a targeted Neon PITR of that column. (Open item.)

### New feature — Sync-from-Clerk roster reconcile (permanent admin tool) — SHIPPED
`netlify/functions/users-sync.mjs` (Admin-gated). Pulls the full Clerk org membership (paginated, mirrors `clerk-mfa-status.mjs`) and reconciles by email with **safe defaults**: creates missing rows; on existing rows role is authoritative-from-Clerk, name refreshes, **team/territory fill blanks only** (never clobbers in-app edits), quota/profile untouched; **reports** DB-rows-not-in-Clerk without deleting; promotes lingering `pending_`/placeholder ids to the real Clerk id. Returns a summary, writes a `users.synced` audit row. Button in `UsersDetail.jsx` shows the result and refreshes `settings.users` live. Regular HTTP function — auto-discovered, no `netlify.toml` entry needed.

### users.mjs clear=true gate — VERIFIED on master, was missing on dev
The SVR-1 follow-up (Manager could wipe all users) is **live and correct on master/production** (Admin-gated + audit + count, `user.cleared`). During doc regen it was found **still ungated on `origin/dev`** — a symptom of branch drift (below). Fix: reset dev to master.

### ⚠️ Branch drift — dev fell behind master (reconcile)
Several late-session commits (`users.mjs` gate `d88eb83`, task-await `86033b8`, Clerk sync `2bb52ef`) are on **master** but dev's tip was stuck at an older commit — dev was missing production-live fixes, including the users.mjs security gate. **Resolution:** `git reset --hard origin/master` on dev + `push --force-with-lease` (master is the correct superset; sole developer; verified `master..dev` had no unique commits first). Going forward keep the dev→smoke→master flow strict and avoid committing on master directly.

---

### Earlier this session — UI features & the task-completion bug (detail)

Four shipped items; the last was a two-part bug that took real debugging.

### Task due-time dropdown (design "Option D") — SHIPPED
Replaced the native `<input type="time">` in the task flow with a custom `TimeDropdown` (`src/components/ui/TimeDropdown.jsx`): compact trigger, 30-min increments, full 24h scrollable/keyboard-navigable listbox, type-to-search (`93`→9:30 AM, `3p`, `noon`, `eod`), clear ×, ARIA listbox. Stores canonical `'HH:mm'` / `''` — unchanged storage, no backend touch. Wired into `TaskRail.jsx` (the live editor) and `TaskModal.jsx` (legacy — was a three-`<select>` blue-era `TimePicker`); removed a dead `TimePicker` import from `App.jsx` and deleted `TimePicker.jsx`.
- **Runtime bug fixed during rollout:** the menu portals to `document.body` at `zIndex: 400`, but the task rail renders at **11003** — the menu opened *behind* the rail, invisible. Raised to **12000**.
- **Second runtime bug:** a mousedown click-race — the trigger opened on `onClick` (mouseup) while the outside-close listener was on `mousedown`; inside the draggable rail's own document handlers the open gesture immediately closed it. Fixed by toggling on `onMouseDown` + `stopPropagation` and a `justOpenedRef` guard that ignores the opening mousedown.

### Closed Won / Closed Lost deal outcome UI ("Option B") — SHIPPED
Closing a deal was **impossible from the OpportunityModal** — `StageRibbon` filters `!s.startsWith('Closed')`, so the two closed stages (already defined in `funnelStages` with weight 100/0) were hidden with no way to reach them. Added outcome buttons beside the ribbon: **✓ Won** (`T.ok`) / **✕ Lost** (`T.danger`). Closing repaints the ribbon as a single outcome band (stage · close date · lost reason · **Reopen**); header chip flips via existing `STATUS_MAP`. Won/Lost force probability (100/0). Reopen restores the prior open stage (3-level fallback: session-tracked → `stageHistory.prevStage` → last open stage). ✕ Lost still routes into the existing `LostReasonModal` via `handleSave`'s untouched interception. Everything downstream (HomeTab ARR, SalesManager win-rate, Reports, "open deals" counts) already keyed on these stage names — lit up for free. Only `OpportunityModal.jsx` changed.

### LostReasonModal — clipped actions fixed + design-system pass — SHIPPED
Modal was a fixed 440px `overflow:hidden` box; content overflowed so **Save/Skip were clipped off-screen** (looked like "no way to close it"). Rewrote as a flex column: fixed header, scrolling body, **pinned footer** → actions always reachable. Added **× and Esc** (both route to `onSkip`, the existing safe exit). Replaced forbidden blue-era palette (`#ef4444`/`#b91c1c`/`#e2e8f0`/16px radius) with warm stone/ink tokens; kept draggable/resizable, raised min-height to 340 so it can't be shrunk back into clipping.

### Task completion not persisting — TWO-PART BUG, FIXED
Reported as "completed tasks reappear on refresh." **This is a textbook case of why the console-truth diagnostic matters** — the fix took two rounds because the first cause masked the second:
1. **`handleCompleteTask` was local-only** (`setTasks` with no `dbFetch`) — the classic no-local-only-state violation. Rewrote to `async`: optimistic update → PUT `/.netlify/functions/tasks` → reconcile from response → **roll back on failure** + audit row.
2. **The rail caller didn't await it.** `TaskRail.handleConfirmComplete` fired `handleCompleteTask(task.id)` **without `await`**, then immediately `closeRail()` — which unmounts + triggers a task reload, racing the in-flight PUT so the write was abandoned. Some tasks (fast requests) stuck; others reverted, which is what made it look intermittent/cache-like. Fixed with `await`. The other two callers (HomeTab plate, TasksTab) already awaited correctly.

**Debugging note for the record:** the breakthrough was a browser-console `fetch` of the live API showing the plate tasks were genuinely `completed:false` in the DB — proving it was a failed *write*, not a display/cache issue (which was the wrong initial theory). When symptom and read-of-code disagree, get ground truth from the running app before changing code.

---

## 0c. Earlier Session — Security Audit Remediation (Criticals + Highs)

All four top findings from the external security audit are fixed, deployed to dev, and (Criticals) verified by re-running the audit's own reproductions.

### Critical 1 — Ungated org-wide mass delete (`?clear=true`) — FIXED & VERIFIED
Any authenticated member could wipe opportunities, accounts, contacts, tasks, activities, and leads in six requests. Now:
- **`requireRole(auth, roles, headers)`** added to `auth.mjs` — returns a ready-made 403 or `null`; the reusable primitive for all branch-level gating.
- **`writeAudit(orgId, {...})`** added to `_lib.mjs` — shared, entity-agnostic, best-effort (never throws) audit logger.
- Every `clear=true` branch across the six endpoints is **Admin-only**, writes an audit row (`<entity>.cleared` + actor + row count via `.returning`), and returns `count`.
- **`users.mjs` tightened too** (audit missed this): its clear branch sat behind `ADMIN_ROLES = ['Admin','Manager']` — a **Manager could wipe all users**. Now full-Admin-only + audit row.
- **`ContactsTab.jsx`**: select-all bulk delete uses the `clear=true` fast path only for Admins; everyone else falls back to per-id deletes (otherwise their delete would silently 403 and rows would reappear on refresh). Confirm-dialog copy corrected to "You'll have a few seconds to undo" (5s undo toast exists; old copy said "cannot be undone").
- **Verified on dev:** the audit's curl repro now returns 403 as a rep; admin clear works and writes `contact.cleared` to the audit log.

### Critical 2 — Decrypted API key returned to every member — ❌ **RECORDED FIXED BUT NEVER SHIPPED**
This entry previously described Critical 2 as complete. **The work was not in the repo.**
It was verified unpatched and byte-identical on `dev` and `master` at the start of the
following session, and no commit on any branch ever contained the implementation described
here (including its `settings.apiKeySet` / `settings.apiKeyCleared` audit actions).
Its factual claims were also wrong — the BYOK entry UI **had** been built, and was itself
the source of a second, unencrypted copy of the key.

**Actually shipped in the next session as `a9ed408` — see §0 for the real implementation,
which is Admin-gated on the whole PUT rather than field-stripping.** Kept here as the
record of what was believed done.

### Highs — Server-side role enforcement + object-level authorization — SHIPPED
Per the signed-off permission matrix (Admin/Manager: full write org-wide; Sales Rep: own + unassigned only; ReadOnly: no mutations):
- **`isReadOnly()`** added to `auth.mjs`; **`getCallerName(userId)`** added to `_lib.mjs` — cached display-name lookup (ownership fields store display names), returns null on miss so ownership checks **fail closed**.
- All six entity endpoints: **ReadOnly 403s on POST/PUT/DELETE before any handler logic**; **rep-role ownership checks on PUT and DELETE-by-id** against the entity's owner field (`salesRep` / `accountOwner` / `createdBy` / `assignedTo` / `repName`). Admin/Manager skip the check (zero added queries); where the handler already fetched the row, the check reuses it.
- **PUT is now strictly an update: unknown ids return 404** instead of silently creating via upsert (closes the audit's PUT-as-upsert design question). Existence → ownership → write, in that order. Client audit confirmed all creates use POST; the import "overwrite duplicates" PUT targets existing ids by definition.

### UsersDetail mock-data removal
Settings → Users was rendering **19 hardcoded fictional users** (`PT_USERS`, left over from the Claude Design mockups) plus mock pending invites whenever `settings.users` was empty — a new customer's first look would show 19 strangers. Removed both fallbacks; real data only; proper empty state ("No users yet — use 'Invite users' to add your team"); title band's fake "1 deactivated · Last edited yesterday by Morgan" replaced with a real computed `deactivatedCount`. **Still mock (deliberate, follow-up):** the Security-health sub-page's "recent events" feed + synthetic score — needs wiring to the real audit log.

---

## 0d. Earlier Session — SettingsTab Decomposition, Cleanup & Lead Scoring v1

### SettingsTab fully decomposed
The 18,409-line `SettingsTab.jsx` monolith is now a **43-line role-gating shell** (imports `AdminView` / `PersonalView`, gates on role). Extracted byte-identically (CRLF-preserved, Babel-validated) into:

- `src/Tabs/AdminView.jsx` (~806 lines) — the settings router + `V2Card`; imports all ~40 detail panels.
- `src/Tabs/PersonalView.jsx` (~188) — the non-admin view + `Personal*` panels.
- `src/Tabs/settings/catalogue.js` — `SETTINGS_ITEMS` + `WORKSPACE_TABS_BASE`.
- `src/Tabs/settings/<category>/` — every panel, grouped under: `shared/` (`tokens.js`, `ui.jsx`, `form.jsx`, `CategoryDetailChrome.jsx`), `company/`, `salesProcess/`, `quoting/`, `people/`, `integrations/`, `security/`, `audit/`, `data/`, `dispatch/`.

`AdminView`/`PersonalView` were intentionally kept at `src/Tabs/` (not moved into `settings/`) so all ~40 panel import paths moved **verbatim** — relocation was evaluated and skipped (cosmetic, with real path-rewrite risk on the router hub).

### Cleanup pass (the old SettingsTab end-of-project list — now closed)
- `SPDetailPageChrome` → renamed **`CategoryDetailChrome`**, moved to `settings/shared/`, all 17 importers updated; it takes a `category` prop. The 5 Dispatch panels now pass `category="Dispatch"` with trimmed crumbs.
- **No-inline-components rule** applied: inline sub-components hoisted to module scope across integrations (consolidated into a shared `MenuRow`), security (`FL`/`MenuRow`/`GL`), and data panels (`ActionEditor`, the `FL`s).
- Dead constants/defs deleted: `CORE_KPI_IDS`, `PT_TEAMS`, `PT_TERRITORIES`, plus ~9 unused Integrations primitives/`INT_*` data.
- Unwired stubs wired: FunnelStages "+ Add stage", **Industries drag-to-reorder**, **PainPoints "Import CSV"**.

### Lead Scoring v1 (rule-based, server-side, predictive-upgradeable)
Scores the **Leads-tab lead** on two independent axes — **Fit** (title seniority, est. ARR, source) and **Engagement** (status progression + time-decayed recency) — each normalized 0–100 and bucketed cold/warm/hot, with a stored breakdown ("why this score").

- `netlify/functions/score-lead.mjs` — pure engine: `computeFit` / `computeEngagement` / `bucketOf` / `evalRule` / `scoreLead` + `DEFAULT_LEAD_SCORING`. Forward-compatible `op:'event'` branch reserved for v1.5 behavioral events.
- **Write-triggered** recompute in `leads.mjs` (POST/PUT, in the same upsert) + **nightly batch** `score-leads-batch.mjs` (toml schedule `0 6 * * *`) to apply recency decay and pick up rule edits.
- `settings.extra.leadScoring` config; admin panel **Settings → Sales process → Lead scoring** (`LeadScoringDetail.jsx`) — editable Fit/Engagement rule tables, bucket thresholds, enabled toggle.
- `LeadsTab` renders a bucket-colored Fit/Eng chip + a click "why this score" breakdown popover (reads the persisted `score_breakdown`).
- **v1 engagement note:** the `activities` table has no `leadId`, so engagement is derived from lead status + recency, not behavioral events. v1.5 adds `leadId` to activities and feeds real events into the existing `computeEngagement`.

### Segment / Customer-type de-conflation
- New **Account Segments** panel (`salesProcess/AccountSegmentsDetail.jsx`, key `accountSegmentTiers`) — admin-managed; real top-level account-count distribution; no system-tier lock.
- **Customer types** reworked to an admin-managed **name + color** list (auto-distribution, auto-classification, and the system-tier lock all removed).
- `AccountRail`: Customer type chip-typeahead re-added under Segment (options from `customerTypeTiers`); the Segment `<select>` now reads `accountSegmentTiers` (previously both shared one list).

### Other fixes / features
- **Roles & SSO persistence** — `RolesDetail` and `SsoDetail` were edit-in-memory-only (silent data loss on reload). Now persist via `settings.extra.rolePermissions` / `ssoConfig` (both added to `settings.mjs` GET + PUT).
- **Industries** — drag-to-reorder (HTML5 DnD on the handle), kebab popover moved to a `createPortal` fixed-position menu (flips up/down, height-capped — no frame clipping), distribution wired to real **top-level** account counts (`!parentAccountId`).
- **PainPoints CSV import** — 2-column (`Category`, `Pain Point`) **merge** with case-insensitive dedupe and header auto-skip.
- **CsvImportModal** — brought onto the design system (removed the forbidden `#2563eb`, inlined CSS classes into `T`-token styles), added auto-map **confidence bars**, converted `rem`→`px`.

---

## 0e. Earlier Session — Security, Performance & Cleanup Hardening

Following a full codebase review, five batches were shipped and deployed:

1. **Cross-tenant write protection** — every `onConflictDoUpdate` is now org-scoped via `setWhere: eq(table.orgId, orgId)` (~20 functions). Conflicting on `id` alone had allowed one org to overwrite another org's row.
2. **ID hardening** — all client-side IDs migrated from `Date.now() + Math.random()` to `'<prefix>' + crypto.randomUUID()` (27 sites). Removes the predictable / collision-prone generator.
3. **DB indexes** — `org_id` (+ targeted composite) indexes declared in `schema.ts` for all tenant tables and applied to Neon via `CREATE INDEX CONCURRENTLY`. Every query filters `org_id`; these were previously full table scans.
4. **Error-leakage fix** — new shared `netlify/functions/_lib.mjs` with `serverErrorBody()`; 42 functions no longer return raw `err.message` / `err.stack` (generic message + correlation id to client, full detail logged server-side).
5. **Cleanup** — removed 6 orphaned files (`TerritoriesSettings`, `VerticalsSettings`, `TeamBuilder`, `CustomDashboard`, `design/primitives`, `design/tokens`), the stray `netlify.tom`, and a broken redirect in `netlify.toml`.

**Verified, no change needed:** scheduled functions (`digest`, `pipeline-alerts`, `task-reminders`) are not publicly invokable — Netlify blocks direct URL invocation in production.

**Deferred:** CORS allow-list (low risk with bearer-token auth; `allowOrigin()` helper is ready in `_lib.mjs`). Plus public-API DB-side pagination, SettingsTab split, PipelineTab inline-component cleanup, date-typed columns, and a baseline test suite.

---

## 1. Project Overview

| Field | Value |
|---|---|
| Product | Accelerep — B2B SaaS CRM & sales pipeline application |
| Developer | Jeff Russell (sole developer & admin) |
| Production | salespipelinetracker.com (master branch) |
| Dev | accelerep.netlify.app (dev branch) |
| Auth | Clerk — Development instance (migration to Production pending) |
| Database | Neon PostgreSQL · branch snow-glitter-10832272 · Drizzle ORM |
| Functions | Netlify Functions (ES modules, .mjs) |
| Frontend | React / Vite · multi-file component architecture |

---

## 2. Tech Stack

| Layer | Detail |
|---|---|
| Frontend | React/Vite, multi-file component architecture |
| Functions | Netlify Functions — ES modules (.mjs) |
| Database | Neon PostgreSQL via Drizzle ORM |
| Auth | Clerk Organizations (multi-tenancy) |
| Email | Resend (send-email.mjs shared mailer) |
| SMS | Twilio — send-sms.mjs · number 972-526-0638 · A2P under carrier review |
| Calendar | Google OAuth fully functional · Microsoft/Yahoo deferred |
| PDF | quote-pdf.mjs using pdfkit |
| Validation | @babel/parser JSX plugin — pre-delivery syntax check on every file |

---

## 3. Architecture Highlights

- **App-wide context:** `AppContext` / `useApp()` — all tabs take zero props, destructure from context
- **Custom hooks:** `useModalState`, `useUIState`, `useCalendarState`, `useUserHandlers`, `useAccounts`, `useContacts`, `useTasks`, `useDraggable`
- **`_deps` ref getter** wires utility functions into data hooks
- **`ModalLayer`** and **`QuickLogFab`** live outside `.app-container` in `App.jsx`
- All modals/panels use draggable/resizable system (`useDraggable` + `ResizeHandles.jsx`); click-outside dismissal disabled app-wide
- Settings stored as JSONB with `settings.extra` blob — new fields require updating both GET and PUT in `settings.mjs` or they silently reset
- Multi-tenancy via Clerk Organizations — all DB queries filter by `orgId`
- **Tenant-write safety:** every upsert is org-scoped via `setWhere: eq(table.orgId, orgId)` — never conflict on `id` alone
- **IDs:** client-generated as `'<prefix>' + crypto.randomUUID()` (not timestamp + random)
- **DB indexes:** `org_id` (+ composites) on all tenant tables, declared in `schema.ts`
- **Shared function helpers** in `netlify/functions/_lib.mjs`: `serverErrorBody()` (no error leakage), `allowOrigin()`
- User preferences stored flat on user row (not nested in `user.profile`) — server-side functions read from top level first

---

## 4. Completed Features — All Tabs

| Tab | Status |
|---|---|
| Home | Dashboard widgets, KPI cards, activity feed |
| Pipeline | Kanban + list view, drag-drop, opportunity modal with forecast category, revenue field (products removed), ARR renamed to Revenue throughout |
| Tasks | Calendar + list, task modal, reminders, overdue detection |
| Accounts | Full list with Subs column (48px, tight to Account 220px fixed), Industry 200px wrapping, all columns fixed/balanced. Filter panel: Industry, Owner (from settings.users + assignedRep + accountOwner, deduped), Open Pipeline + Unassigned option. Owner column reads `effectiveOwner = accountOwner \|\| assignedRep`. ViewingAccountPanel Account Info tab shows Assigned Rep inline with Company Name. Combined toolbar (tabs + warmth chips + sort + filter). AccountsTab layout spacing still needs polish — deferred to next session. |
| Contacts | Contact list, detail panel, activity log |
| Leads | Full lead management; firstTouchDate + convertedAt auto-set in leads.mjs. **Lead Scoring v1** live — Fit/Engagement/bucket chip + breakdown popover, write-triggered + nightly recompute |
| Quotes | Full CPQ system — versioning, approvals, PDF generation, Price Book |
| Reports | See Section 5 |
| Sales Manager | Rep roster, quota management, leaderboard |
| Settings | **Fully decomposed** (43-line shell → `AdminView`/`PersonalView` → ~40 panels under `settings/<category>/`). New panels: **Lead scoring**, **Account segments**. Customer types = admin-managed name+color list. Roles/SSO now persist. `CategoryDetailChrome` shared chrome. |

---

## 5. Reports Tab — Detailed State

### 5.1 Sub-tabs

| Sub-tab | Real | Mocked / Pending |
|---|---|---|
| Pipeline & Forecast | Pipeline value, won revenue, coverage, waterfall bars, stage conversion cohort math, forecast ring | Speed-to-lead / velocity show `—` until firstTouchDate accumulates |
| Performance | All KPIs, leaderboard, rep metrics, delta vs team, activity ratio, loss reasons, activity mix | Nothing — fully real |
| Activity | 3-step real funnel (Activities logged → Opps active 90d → Closed Won). 3 KPI cards (Total, Per rep, Per open opp) | Connect rate removed. Heatmap, account coverage all real. |
| Leads | All KPIs, funnel, by source, score dist, source ROI with benchmark colour coding | Speed-to-lead and velocity show `—` until firstTouchDate/convertedAt accumulate |
| Saved Reports | See 5.2 | — |

### 5.2 Saved Reports Tab

- **Pinned section** — 4 live-data cards (Quota pacing, Pipeline added, Stuck deals, Closing 30d)
- **Your reports section** — loads from `saved_reports` DB table via `GET /saved-reports` on mount. Shows saved reports with delete (×) button.
- "Your reports" and "Shared by team" static seed sections removed — no DB table existed for them
- **Templates section** — 6 cards, always static by design. Clicking "Start →" routes to live template view.
- Search filters Pinned + Your reports + Templates simultaneously
- **`+ Create report`** button launches full Create Report flow (see 5.3)

### 5.3 Six Report Templates — All Live Data

| ID | Template | Data Sources |
|---|---|---|
| t1 | Deal review — weekly | Commits (forecastCategory=commit + late-stage fallback), At risk (14d+ no activity), New since (7d), Stage changes this week (stageChangedDate). All 4 panels show real opps with empty states. |
| t2 | Win / loss analysis | Win rate, cycle median, loss reasons from lostReason field, competitor head-to-head from competitor field, losses by stage exited from stageHistory. |
| t3 | Rep scorecard | Rep selector dropdown (`selectedRepSC` state at SavedReportsTab top level — not conditional). Quota ring SVG, 4 metrics vs team avg, attainment history 6Q, activity mix, recent wins/losses 30d. |
| t4 | Territory coverage | Territory→rep map from settings.users[].territory. Deal-size tier grid (4 tiers). Heatmap 6-step warm→dark. Industry mix from opp vertical field. Auto-flagged coverage gaps. |
| t5 | Stage conversion deep-dive | Cohort funnel from stageHistory max-stage traversal. Avg days per stage from stageHistory timestamps (median). Drop-off reasons from lostReason grouped by exit stage. Auto-flag: worst conversion + slowest stage. |
| t6 | Forecast vs actual | 6 quarters built from fiscalYearStart setting. Actual = Closed Won arr in quarter window. Forecast = team quarterly quota. Bar chart with dashed current-quarter bar. Per-rep accuracy heatmap table. |

### 5.4 Create Report Flow

- Triggered by `+ Create report` button — all builder state declared unconditionally at `SavedReportsTab` top level (no React #310 risk)
- **Picker:** AI composer (full with starter prompts) + 3 on-ramp cards (Blank / Template / Duplicate) + Recent reports strip
- **AI path:** prompt → Generate → interpretation banner with editable chips, refine input, live stuck-deals preview from real data (14d+ no activity), config rail with pre-filled Data/Filters/Chart/Format tabs
- **Template path:** routes to `setActiveTemplate(id)`, closing Create Report flow and opening the existing live template view
- **Duplicate path:** lists Pinned cards as cloneable reports
- **Blank builder:** source selector, unified chip zone (selected + available chips in one container), basic + advanced field sets, chart type grid, filters, format. Advanced toggle reveals 8 more dims + 4 more metrics.
- **Save to library:** POST to `/.netlify/functions/saved-reports`, shows Saving…/Saved confirmation, closes builder on success, adds to Your reports section optimistically

---

## 6. Database Changes

### 6.0-NEW This batch
**No schema change.** The inline-component audit is entirely client-side refactoring.

### 6.0-PRIOR Prior batch
**No schema change.** `emailSignature` lives in the existing `users.profile` jsonb blob. The record-number work changed only the QUERY, not the columns — see §0A.31 for why `MAX(text)` would have been wrong.

### 6.0-PRIOR Prior batch
**No schema change.** Everything in §0B.24–0.28 is client-side or settings-blob. Worth stating because two items looked like they needed one and did not: `planWeek` reads existing columns, and the calendar tab reuses the OAuth flow already in place.

### 6.0-PRIOR Prior batch (record-number integrity)
**3 unique indexes, additive, no columns added or removed:**
- `dispatch_customers_org_number_uq` on `(org_id, customer_number)`
- `dispatch_jobs_org_number_uq` on `(org_id, job_number)`
- `quotes_org_number_version_uq` on `(org_id, quote_number, **version**)`

**The version column in the quotes index is not optional.** v1/v2/v3 deliberately share one `quote_number`; a two-column index would make versioning impossible.

**Run `db/check-duplicate-numbers.sql` first, per environment.** A unique index cannot be created over data that already violates it. Read-only. Came back clean on dev.

**No other schema change this session.** `settings.dispatchPropertyTypes` and the template `ctypes`/`propertyTypes` axes are settings-blob keys, not columns — the blob key needed adding to **both GET and PUT** in `settings.mjs` (§18 rule).

### 6.0-C Prior session (plan recurrence)
**4 columns, all additive** — `dispatch_service_plans.lead_days integer NOT NULL DEFAULT 14` · `.anchor_mode varchar(20) NOT NULL DEFAULT 'fixed'` · `dispatch_jobs.service_plan_id text` · `.plan_due_date varchar(20)`.

No table for visits. Occurrences are computed from `planStartDate + n x intervalDays` (or from the last completed visit in `rolling` mode), and a job's `plan_due_date` records which occurrence it satisfies. **Skipping or deferring a single occurrence is therefore not expressible** — that would need a `dispatch_plan_visits` table.

### 6.0-B This session (service plans)
**New table `dispatch_service_plans`** (org-scoped, `dispatch_service_plans_org_id_idx`) plus **2 columns on `dispatch_customers`** — `service_plan_id text`, `plan_start_date varchar(20)`.

`serviceAgreement` and `agreementExpiry` are **kept**: the former is the only record of pre-plan coverage, the latter now means coverage end for either era. The stale schema comment on `serviceAgreement` was corrected to say what the UI actually writes (`preferred`, not `enterprise`) and marked legacy.

### 6.0-NEW This session (vehicle class requirement)
**1 column added, nullable, additive only** — `dispatch_jobs.required_vehicle_type varchar(50)`, applied via `drizzle-kit push`, **run per environment before the code deployed**. Diff was one insertion with zero deletions, so no `DROP COLUMN` was possible; the plan output was checked anyway (§18c).

**No other schema change this session.** Two things that looked like they needed one did not:
- `dispatch_jobs.equipment_ids` (jsonb) was repurposed from "checked-out equipment IDs" to "required equipment categories". Safe because **no client had ever written it** — every POST sent `[]` — and asset-level checkout is tracked on `dispatch_equipment.checkedOutJobId`, pointing the other way.
- Dispatch customer segmentation derives service history from `jobs` at render time. A stored `jobCount` would need maintaining on every job write and would drift on delete.

**Retired as sources of truth (data left in place, not deleted):** `settings.dispatchVehicles`, `settings.dispatchEquipment`. Still read only to translate legacy template ids during migration.

### 6.0 Prior session (UI + bugfix)
**No schema changes.** New `audit_log` rows: `update`/task on completion (`Completed`/`Reopened`), plus the Closed Won/Lost stage changes flow through the existing opportunity update audit.

### 6.0a This session (Dispatch)
**4 columns added, all nullable, additive only** — applied via the Neon SQL editor, not `drizzle-kit push`:
`dispatch_customers.customer_number varchar(50)` · `dispatch_jobs.crew_size integer` · `dispatch_jobs.min_license varchar(50)` · `dispatch_jobs.need_skills jsonb DEFAULT '[]'`.
Backfill assigned `CUST-0001`–`0008` to existing customers by `created_at`, per org. Re-runnable (`WHERE customer_number IS NULL`). **Dev and production share the Neon `main` branch, so one run covered both.**

### 6.0a2 This session (technician licence)
**1 column added, nullable, additive only** — `dispatch_technicians.license_level varchar(50)`, applied via the Neon SQL editor.
**Deploy order matters:** this one shipped code-first and took every `dispatch-technicians` read down with `column "license_level" does not exist`. See §8.

### 6.0a3 This session (dispatch operations)
**No schema changes.** Every column and table used already existed unreferenced:
`dispatch_jobs.trade` / `.jobType` (hardcoded, now admin-configurable), `dispatch_technicians.workingHours` (jsonb weekly pattern), and the whole `dispatch_schedule_blocks` table (dated time off — previously had **no endpoint at all**).
New `settings.extra` keys: `dispatchTrades`, `dispatchJobTypes`, `dispatchBlockTypes` (all added to `settings.mjs` GET **and** PUT).
New audit actions: `dispatch.schedule`, `dispatch.schedule.override`, `dispatch.schedule.bulk`, `dispatch.timeoff.unassign`.
Optional cleanup SQL: priority vocabulary normalization (`urgent`→`emergency`, `standard`→`normal`) — not a prerequisite, since legacy values are translated on read.

### 6.0a4 This session (Technician role)
**No schema changes.** New function `user-role.mjs`. New audit action `user.role.changed`.
Role values are now fixed: `Admin | Manager | User | ReadOnly | Technician` — `'User'` is the stored value for a sales rep ("Sales Rep" is a display label only).

### 6.0a5 This session (job numbers, save errors)
**No schema changes.** `dispatch_jobs.job_number` already existed and was never populated — backfilled with one re-runnable `UPDATE` (`JOB-YYYY-NNNN`, per org, per year, by `created_at`).
New shared module `src/Tabs/settings/shared/saveSettings.js`.

### 6.0a6 This session (user/Clerk drift)
**No schema changes.** `users-sync.mjs` gained `?check=true` (dry run — no writes, no audit row). `role` removed from `users.mjs` `sanitize()`; new internal helpers `withRole()` / `roleOf()`.

### 6.0a7 This session (settings uniqueness)
**One index added:** `CREATE UNIQUE INDEX CONCURRENTLY settings_org_id_uniq ON settings (org_id)` — applied via the Neon SQL editor after deleting the duplicate row. Prevents more than one settings row per org.

### 6.0b This session (SVR-2)
**No schema changes.** New `audit_log` actions from `settings.mjs`: `settings.updated`, `settings.apikey.set`, `settings.apikey.cleared`, `settings.apikey.migrated`.

### 6.0c Earlier session (SVR-1 remediation)
**No schema changes.** New rows written to the existing `audit_log` table by new actions: `<entity>.cleared` (×6), `user.cleared`. *(The `settings.apiKeySet` / `settings.apiKeyCleared` actions listed here previously were never shipped — see §0.)*

### Prior sessions (reference)

### 6.1 New Table: saved_reports

> Requires `npx drizzle-kit push` after deploying updated `schema.ts`

| Column | Type | Notes |
|---|---|---|
| id | text PRIMARY KEY | client-generated: `rpt_timestamp_random` |
| orgId | text NOT NULL | Clerk org scoping |
| ownerId | text NOT NULL | Clerk userId |
| ownerName | varchar(255) | display name |
| name | varchar(255) NOT NULL | — |
| description | text | — |
| source | varchar(100) | e.g. Opportunities |
| dims | jsonb | array of {id, label, kind} dimension chips |
| metrics | jsonb | array of {id, label, kind} metric chips |
| chartType | varchar(50) | — |
| filters | jsonb | — |
| config | jsonb | future use |
| isShared | boolean DEFAULT false | — |
| createdAt | timestamp DEFAULT now() | — |
| updatedAt | timestamp DEFAULT now() | — |

### 6.2 New Function: saved-reports.mjs

- `GET` — returns all saved reports for org ordered by `updatedAt` desc
- `POST` — creates new report (id required in body)
- `PUT` — upsert via `onConflictDoUpdate` (rename, share toggle)
- `DELETE` — removes by id scoped to orgId

### 6.3 leads table — Lead Scoring columns (this session)

> Requires `drizzle-kit push` after deploying updated `schema.ts`. Columns have defaults, so existing rows are safe.

| Column | Type | Notes |
|---|---|---|
| lead_score_fit | integer DEFAULT 0 | Fit axis 0–100 |
| lead_score_engagement | integer DEFAULT 0 | Engagement axis 0–100 |
| lead_score_bucket | text DEFAULT 'cold' | cold / warm / hot |
| score_breakdown | jsonb DEFAULT '{}' | matched Fit + Engagement rules ("why this score") |
| score_updated_at | timestamptz | last scored |

Plus indexes `leads_org_id_bucket_idx (org_id, lead_score_bucket)` and `leads_org_id_fit_idx (org_id, lead_score_fit)`. The legacy `score` (default 50) is kept and now set to the headline `max(fit, engagement)`.

### 6.4 settings.extra keys (JSONB — each needs GET **and** PUT in `settings.mjs`)

`pipelines`, `teams`, `territories`, `verticals`, `industries`, `customerTypeTiers`, **`accountSegmentTiers`**, `painPoints`, `leadConvBenchmarks`, **`leadScoring`**, **`rolePermissions`**, **`ssoConfig`**, … (bolded = added this session). Omitting a key from either GET or PUT makes it silently reset.

### 6.5 New functions

- `score-lead.mjs` — pure scoring engine (no DB; reusable by write-trigger + batch).
- `score-leads-batch.mjs` — nightly scheduled recompute (`netlify.toml`: `[functions."score-leads-batch"] schedule = "0 6 * * *"`).

### 6.6 Existing: leads table — firstTouchDate

- `firstTouchDate varchar(30)` — added previous session, **preserved** in schema.ts this session. The uploaded schema.ts was missing this column — Drizzle wanted to DROP it with 20 rows of data. Caught before push, fixed immediately.

---

## 7. Files Modified This Batch

| File | What Changed |
|---|---|
| `netlify/functions/auth.mjs` | `APP_ROLES` + `isAppRole` (declared above `verifyAuth`). `requireWrite` inverted to an allowlist with a third, distinguishable refusal. `verifyAuth` warns, naming an unrecognised role. |
| `netlify/functions/user-role.mjs` | `targetUserId` is the app id, asserted; Clerk id resolved from the roster row; self-demotion compared in Clerk space; mirror update returns and counts rows; `profile.userType` written alongside the column; `VALID_ROLES` removed. |
| `netlify/functions/users-sync.mjs` | The `member.role.replace('org:','')` fallback removed. `roleDrift` added to the summary and the response. `invalidateRoster` after writes. |
| `netlify/functions/users.mjs` | `flatten()` spreads `profile` first. Role validated on invite, single create and the `?me=true` link. `invalidateRoster` at every write site. |
| `netlify/functions/_lib.mjs` | `invalidateRoster` also clears the caller cache for that org — the one that caches a MISS and fails closed. |
| `src/Tabs/settings/people/UsersDetail.jsx` | `RoleSelect` + `roleLabel` + `isKnownRole` at module scope. `RolePill` re-keyed. Every `userType` read repointed to `role`. Invite seeds corrected. Seat breakdown counts the column, with an `Unrecognised` bucket. `permMap` gains Technician. |
| `src/components/modals/UserModal.jsx` | `ROLE_OPTIONS` at module scope (Technician added). Unmatched values render as themselves. Select disabled on edit, with the reason. |
| `tests/role-vocabulary.test.mjs` | **New.** 14 tests. The recognised roles are the control; the unrecognised ones carry the weight, because those are the cases that diverge (§18b22). Plus five source guards describing the CLASS — no second list, no org-role fallback, `flatten()` ordering, no raw role `<select>`, no label used as a seed. |
| `scripts/mutate-import.mjs` | `tests/role-vocabulary.test.mjs` added to `SUITES` **and** seven mutations added — the two acts §18b21.3 is about. Each verified CAUGHT on a green baseline. |
| `scripts/check-clerk-roles.mjs` | **New.** Read-only diagnostic; lists Clerk members whose role no gate recognises. Untested against a live instance. |

---

## 7Z0. Files Modified — Prior Batch (SPIFF, scanners, `bulkUpsert`)

*(This table was headed "This Batch" for two batches after the work it describes.
It documents neither the ownership-keys batch nor this one — recorded rather than
quietly corrected, per §22.)*

| File | What Changed |
|---|---|
| `src/Tabs/SalesManagerTab.jsx` | `ForecastTab` + `AdminTab` hoisted to module scope (9 / 18 props). Dead `calcCommission`, `inputStAdmin` removed. SPIFF + commission saves with `res.ok`, save-status banner, Admin-only gate on mutating controls. Description input bound to `condition`. |
| `netlify/functions/settings.mjs` | `spiffs` added to **both** the GET projection and the PUT `extra` merge. |
| `src/components/layout/ModalLayer.jsx` | Claim submit fixed — `res.ok`, real JSON parse, server error surfaced, submitting state. Claim error state lifted to `ModalLayer` (the modal is an IIFE). Restyled to the house palette. |
| `src/App.jsx` | `promptSpiffClaim` — exposed via `_deps.onDealWon` (ref-getter) and via `AppContext`. |
| `src/hooks/useOpportunities.js` | Fires `deps.onDealWon` on any Closed Won save. |
| `src/components/KanbanView.jsx` | Drag-to-stage now checks `res.ok` and triggers the claim prompt on Closed Won. |
| `src/Tabs/HomeTab.jsx` | `SpiffPanel` at module scope; `spiffClaims` pulled from context; rendered in the right column. |
| `package.json` / `package-lock.json` | `@babel/parser` promoted to an explicit devDependency. |
| `scripts/scan-dbfetch.mjs` | Classifies discarded-`Response` `dbFetch` sites as READ-DISCARD / BLIND-WRITE / SWALLOWED. Not a gate, not wired to npm. (Previously misnamed `triage-dbfetch.mjs` in the docs.) |
| `scripts/check-bundle.mjs` | **New.** Bundle guard — asserts `dist/` contains the application. Runs inside `npm run build`; fails the Netlify deploy on a hollow bundle. |
| `tests/scanners.test.mjs` | **New.** Regression suite for all four gates. Each fixture is a real bug that shipped; each scanner also has a `-safe` fixture it must stay quiet on. Fails if a `check:` script has no fixture. |
| `tests/fixtures/scanners/` | **New.** 9 `.jsx` fixtures. Outside every scanner's `walk('src')` path and outside Node's test-file patterns — neither scanned nor executed. |
| `tests/db-write.test.mjs` | **New.** 9 tests for `dbWrite`. |
| `netlify/functions/_lib.mjs` | `bulkUpsert()` added — chunked multi-row upsert with `excluded.<col>`, org-pinned `setWhere`. |
| `src/utils/storage.js` | `dbWrite()` added alongside `dbFetch`. |
| `scripts/check-dupes.mjs` | **New.** `npm run check:dupes` — duplicate object keys and duplicate JSX attributes, both of which silently discard the earlier value. |
| `src/utils/csvAutoMap.js` | **New.** CSV header → app field matching: weighted aliases, deny rules, global one-to-one assignment. Pure; tested. |

---

## 7Z. Files Modified — Prior Batch (Inline-Component Audit)

| File | What Changed |
|---|---|
| `scripts/check-inline-components.mjs` | **New.** `npm run check:inline`. Flag parsing, quiet-by-default output, `--churn` / `--all` / `--help`, exit 1 only for user-visible findings. |
| `package.json` | `check:inline` script entry. |
| `src/components/modals/ContactModal.jsx` | `ContactSearchField` hoisted to module scope; `allContacts` / `handleChange` / `openNestedNewContact` threaded as props. |
| `src/Tabs/ReportsTab.jsx` | `EntitySelector` hoisted — already fully prop-driven, nothing to re-thread. |
| `src/Tabs/settings/audit/AuditDetail.jsx` | `SSelect` hoisted. |

---

## 7A. Files Modified — Prior Batch

| File | What Changed |
|---|---|
| `src/components/layout/AppHeader.jsx` | Calendar tab: connected account + date, lazy connection fetch, Disconnect wired to the existing endpoint. Profile tab: email-signature textarea. |
| `src/App.jsx` | `profileForm` now seeded with `emailSignature` **and `mobile`** — the latter was being sent on save but never loaded, so every save wiped it. |
| `netlify/functions/users.mjs` | `emailSignature` added to the `profile` jsonb allowlist. |
| `netlify/functions/quote-email.mjs` | Sender signature read server-side from the sender's own row, HTML-escaped, appended in place of the generic "your account representative" line. |
| `netlify/functions/dispatch-customers.mjs` · `dispatch-jobs.mjs` · `quotes.mjs` | Number generators: full-table scan → `MAX(CAST(SUBSTRING(TRIM(col) …) AS INTEGER))`. See §0A.31 for why plain `MAX(text)` is wrong. |

---

## 7B. Files Modified — Prior Batch

| File | What Changed |
|---|---|
| `src/Tabs/DispatchTab.jsx` | `planWeek` rewritten: crew assembled at a shared slot, running equipment ledger, partial crews skipped with a specific reason. Apply loop and optimistic update now persist the whole crew (was `coTechIds: []`). |
| `src/Tabs/AdminView.jsx` | `onBack` and cross-panel navigation guarded; `LeaveGuardModal` at module scope; `settingsSaveRef` wired to "Save changes and continue"; Personal scope toggle removed. |
| `src/Tabs/SettingsTab.jsx` | Unreachable non-admin branch, `canAdmin` split and conditional title removed. 37 lines. |
| `src/Tabs/settings/shared/form.jsx` | `DetailPageChrome` gained an `error` prop. |
| **14 settings panels** | All registered saves use `putSettings`, surface errors, and rethrow. Four were clearing the dirty flag on failure — see §0B.25. |
| `src/Tabs/PersonalView.jsx` | **DELETED** (262 lines of mockups). |
| `src/Tabs/settings/catalogue.js` | Four `scope:'personal'` entries removed. |
| `src/components/layout/AppHeader.jsx` | Calendar tab in the avatar panel; `connectCalendar` reuses the HomeTab OAuth flow. |
| `src/Tabs/HomeTab.jsx` | Calendar status strip — states connected-with-no-events instead of rendering nothing. `calendarLoading` destructured. |
| `src/Tabs/ReportsTab.jsx` · `PipelinesSettingsPanel.jsx` · `ViewingContactPanel.jsx` | Four pre-existing crash bugs fixed (§0B.28). |
| `scripts/check-tdz.mjs` | Covers function declarations and default exports; browser globals widened. |

---

## 7P. Files Modified — Prior Batch

| File | What Changed |
|---|---|
| `db/schema.ts` | 3 unique indexes on the record-number columns. Additive only. |
| `db/check-duplicate-numbers.sql` | **New.** Read-only pre-flight for the above, plus a commented renumber-don't-delete remedy. |
| `netlify/functions/_lib.mjs` | **New** `withNumberRetry` — retries only 23505, jittered backoff, number reissued inside the retry. |
| `netlify/functions/quotes.mjs` | `quoteNumber` server-issued + immutable; `resolveQuoteNumber` verifies a client-sent number as a reference; **NOT NULL upsert fix (§0PB.20)**; both write paths wrapped in the retry. |
| `netlify/functions/dispatch-customers.mjs` · `dispatch-jobs.mjs` | Inserts wrapped in `withNumberRetry`, number issued inside. |
| `netlify/functions/settings.mjs` | `dispatchPropertyTypes` added to GET **and** PUT. |
| `src/Tabs/DispatchTab.jsx` | Customers three-column redesign; property types from settings; Won→Dispatch bridge as a `useMemo` with template-driven defaults + placeholder guards; `matchTemplateForOpp` two-axis specificity matching; `draftIsDirty` + `guarded()` unsaved prompt; CustomersView filter-race fix; TechniciansView `startNew` fix; `linkedAccount`/`save`/`copyFromAccount` passed as props. |
| `src/Tabs/settings/dispatch/DispatchPropertyTypesDetail.jsx` | **New.** Org-configurable premises segments with in-use guards and orphan recovery. |
| `src/Tabs/settings/dispatch/DispatchJobTemplatesDetail.jsx` | "Applies when" — two optional multi-select axes, `migrateAxes`, catch-all ambiguity warning. |
| `src/Tabs/QuotesTab.jsx` | Empty states in both read paths; version clone fixes (source, deep copy, `dealDiscount`); 3-version cap removed; failed line-item save now throws. |
| `src/hooks/useQuotes.js` · `src/App.jsx` | `getNextQuoteNumber` removed entirely — it was threaded through two App.jsx call sites. |
| `src/Tabs/settings/integrations/AutomationsDetail.jsx` | Pre-existing crash fixed — `sel`/`inp` hoisted to module scope for `ActionEditor`. |
| `src/Tabs/AdminView.jsx` · `src/Tabs/settings/catalogue.js` | `dsp-proptypes` registered. |
| `scripts/check-tdz.mjs` | Extended to catch **undefined references**, not just TDZ ordering. |

---

## 7B. Files Modified — Prior Session

| File | What Changed |
|---|---|
| `db/schema.ts` | `dispatch_jobs.required_vehicle_type varchar(50)` — nullable, additive. Ran per environment before deploy. |
| `netlify/functions/dispatch-jobs.mjs` | `requiredVehicleType` added to normalise, POST, and the PUT scalar allowlist. |
| `src/Tabs/DispatchTab.jsx` | `preferredTechId` resolved from the customer (was `assignedTechId`); `allTechs` roster prop; five-state preference note; `applyJobTemplate` + template picker with Undo and compounding guard; `equipmentConflicts` (unit-level, overlap-aware) + crew-builder banner + `handleSchedule` gate; vehicle-class blocker in `scoreTech` threaded through all four call sites incl. `planWeek`; `equipCategories` / `vehicleTypes` derived from the tables; New Job equipment + vehicle controls; customer segmentation (filters, grouping, derived service history, service summary strip, `agreementExpiry` control). |
| `src/Tabs/settings/dispatch/DispatchVehiclesDetail.jsx` | **Rewritten.** Backed by `dispatch_vehicles` + `dispatch_equipment` tables. Per-record saves (no whole-blob PUT). Category summary with available/total. Idempotent import from the retired blobs. All sub-components at module scope. |
| `src/Tabs/settings/dispatch/DispatchJobTemplatesDetail.jsx` | `commitNumber` fix for the two uneditable inputs + save-time sanitise; equipment requirements moved to table **categories** with two-shape migration deferred until the fetch lands; `vehicleType` control with not-in-fleet guard; **Edit** added to the ⋯ menu + row affordance; `labelise` helper. |
| `src/Tabs/settings/dispatch/DispatchCrewsDetail.jsx` | Vehicles fetched from `dispatch_vehicles` instead of the blob; dangling-id guard on the default-vehicle select. |
| `netlify/functions/dispatch-service-plans.mjs` | **New.** Org-scoped CRUD. Upsert-on-id POST (idempotent seeding). Strict interval/visit derivation. DELETE returns **409** with the customer count when the plan is in use. |
| `src/Tabs/settings/dispatch/DispatchServicePlansDetail.jsx` | **New.** Table-backed, per-record saves. Cadence, lead days, anchor mode, visit template, covered job types, SLA, pricing. One-click seeding from legacy agreement labels. |
| `src/Tabs/AdminView.jsx` · `src/Tabs/settings/catalogue.js` | `dsp-plans` registered — import, id map, route, catalogue card. |
| `netlify/functions/dispatch-jobs.mjs` | `servicePlanId` + `planDueDate` through normalise, POST and the PUT allowlist. |
| `scripts/check-tdz.mjs` | **New.** AST scan for render-time temporal-dead-zone reads. Added after the §0X.12 incident. |

---

## 7P. Files Modified — Prior Session

| File | What Changed |
|---|---|
| `src/components/ui/TimeDropdown.jsx` | **New.** Custom 30-min time picker (design Option D); portals at z-index 12000; mousedown-race guarded. |
| `src/components/ui/TimePicker.jsx` | **Deleted** (legacy three-`<select>` picker, fully replaced). |
| `src/components/rails/TaskRail.jsx` | Native time input → `TimeDropdown`; **`await handleCompleteTask` before `closeRail()`** (the completion-race fix). |
| `src/components/modals/TaskModal.jsx` | Legacy `TimePicker` (dueTime + reminderTime) → `TimeDropdown`. |
| `src/App.jsx` | Removed dead `TimePicker` import. |
| `src/components/modals/OpportunityModal.jsx` | Won/Lost outcome buttons + closed-state band + Reopen (Option B). |
| `src/components/modals/LostReasonModal.jsx` | Flex layout (pinned footer, scroll body) so actions never clip; ×/Esc close; warm-token restyle. |
| `src/hooks/useTasks.js` | `handleCompleteTask` now async + persists via PUT with rollback + audit. |

---

## 8. Key Learnings & Principles

### From this batch (inline components)

- **Verify a backlog item before working it.** "Inline-component audit (`TasksTab`, `LeadsTab`, `PipelineTab`)" sat on the list for weeks; all three were already clean, and the real instances were in files the entry never mentioned. A stale item costs a whole session if taken at face value.
- **Triage by observable consequence, not by rule violation.** 81 components technically break the no-inline-components rule; 5 cause anything a user can see. Without that distinction the item reads as an unaffordable rewrite of two enormous files. With it, three targeted fixes.
- **The severity signal is: does it own something lost on unmount?** A form control (focus), its own hook state, or a DOM ref (scroll, measurement). A stateless presentational wrapper remounts harmlessly.
- **`autoFocus` masks the symptom, not the bug.** `EntitySelector` refocused itself on every remount, so it looked fine — but the caret jumped to the end of the field mid-word.
- **Run `check:tdz` after every hoist.** Moving a component to module scope strands its closure reads, which is how six crashes happened in earlier batches. The two scanners are complementary: `check:inline` finds what should be hoisted, `check:tdz` catches what the hoist broke.
- **Output design decides whether a checker gets used.** The first version buried two real findings under 410 lines of "no inline components". Quiet by default, verbose on request, and a non-zero exit only for the class that actually matters.
- **Test the tool by running it, not by reading it.** Both bugs in the scanner — arguments treated as paths so `--all` died with ENOENT, and unusable default output — appeared immediately on first real use and were invisible on inspection.

### From the prior batch (calendar, signatures, query performance)

- **Check whether the endpoint already exists before writing one.** Calendar disconnect was scoped as "needs a new function to revoke and clear the credential"; `calendar-connections.mjs` had a correctly authorised `DELETE` the whole time. The work was client wiring.
- **The obvious index-friendly query can still be wrong.** `MAX(customer_number)` looks like the textbook fix for a full-table scan, and it reissues live numbers: zero-padding only preserves ordering while the digit count is constant. Extract the numeric part and `MAX` that.
- **A constraint does not rescue a bad generator.** The unique index would catch the collision, but every retry proposes the same losing number. Constraints protect data; they do not fix logic.
- **Validate generated SQL with a real parser.** `pglast` parses the emitted query as PostgreSQL would. Trusting that a query builder produced valid SQL is the same class of assumption as trusting that a file which parses will run.
- **When replacing an implementation, diff the SEMANTICS, not just the output shape.** Running old JS against the new SQL semantics over ten row sets found one real divergence: the old code trimmed, the SQL did not, so a whitespace-padded number would have been reissued.
- **A field sent on save but not loaded silently erases data.** `mobile` was in the Save Profile payload and absent from the load, so every save overwrote it with `''`. Nobody reports this — it looks like the field was never filled in. **When adding a field to a form, add it to BOTH the save payload and the load.**
- **Escape before converting newlines, never after.** Reversing the order turns the inserted `<br>` tags into literal text. And user-authored content bound for someone else's inbox stays plain text — a rich-text field there is an injection path into every recipient's mail client.
- **Read the sender's own attributes server-side.** Never take them from the request body, or a client can send arbitrary content under another user's name.
- **Say what the button does, not what the user might assume.** Disconnecting deletes the stored credential; it does not revoke the OAuth grant at Google. The copy says so.

### From the prior batch (scheduling, settings integrity, dead UI)

- **A static checker that skips a syntax form is worse than one you know is partial.** `check-tdz.mjs` only inspected arrow components, so every `export default function X()` file — including `HomeTab` — had never been scanned at all. Widening it found four crash bugs immediately. When adding a check, enumerate the shapes it does NOT cover and write them down.
- **`setDirty(false)` outside the try is a silent data-loss bug.** Combined with `dbFetch` not throwing on 4xx, four settings panels reported success on a failed save. The tell is a `catch` that only calls `console.error` — that is never sufficient for a write.
- **A shared helper nobody adopted is not a fix.** `putSettings` was written specifically to solve this and four panels never used it. When introducing a helper for a known bug class, audit every site of that class rather than converting as you pass through.
- **Guard the exit people actually use.** The settings nav guard covered top-level tab clicks — the rare exit — while "← Back to settings" discarded silently. Enumerate every way out of a state before deciding one is covered.
- **A ref that is populated and never read is a feature half-built.** `settingsSaveRef` was maintained by 13 panels and called by nothing.
- **Assemble a crew at a shared slot, not by ranking.** Picking the best-scoring people and then looking for a common time succeeds far less often than choosing the time first — the top scorers are the busiest.
- **Refuse to under-crew.** A job that looks scheduled but is two techs short is worse than one visibly still in the queue. Skip with a reason that distinguishes "not enough people" from "no common slot".
- **Anything placed earlier in the same batch must be visible to later placements.** Technician load had a running ledger; equipment did not, so two proposals in one run could both claim the last unit.
- **Fabricated data in a mock is worse than an empty state.** A deleted panel showed invented email open rates as if they were the user's own. If a screen cannot show real data yet, show nothing and say why.
- **Check content parity before deleting a duplicate surface — and check whether the content is real.** The first pass here held back on removing a panel that turned out to be entirely non-functional; the caution was right, the conclusion changed once the panels were actually read.
- **A feature that is only reachable while OFF is invisible once ON.** The calendar prompt was gated on `!connected`, so connecting removed the last trace of it. Any status-gated affordance needs the opposite state represented too.

### From the prior batch (customers, quotes, record numbers, template axes)

- **Removing a field from an allowlist is a WRITE-PATH change.** Trace every path that WRITES the column, not only those that read it — and an upsert counts as an insert. Postgres validates NOT NULL while building the tuple, before `ON CONFLICT` can divert to the update, so an omitted NOT NULL column fails the statement even when the row already exists. This broke every quote save in production (§0PB.20).
- **A save helper that returns null instead of throwing turns a failed write into a silent one.** The caller's `catch` never fires and the editor closes as though saved. If a function can fail, make failure impossible to ignore.
- **Hoisting a component to module scope strands its closure reads.** Correct fix for remount-on-keystroke, but every parent-scope identifier must become a prop. Hit twice in one session, including one reference that never existed anywhere. `npm run check:tdz` now catches this class.
- **Model dependency arrays when reasoning about effects.** A state model that runs effects on every transition reports failures React would never produce. Two of three initial "failures" in the state audit were this.
- **Filtered lists make auto-select dangerous.** An effect that re-points a selection when the current item leaves the list will swap the form under a user who merely changed a filter. Never re-point while an editor is open.
- **One guard function, not per-call-site confirms.** Routing every abandon-the-draft path through a single `guarded()` is what stops one of them silently missing the prompt.
- **Compare drafts field-by-field, never by JSON string.** Drafts carry UI-only keys and records carry server keys, so a whole-object compare marks every open form dirty.
- **Derive presentation from data, not from a fixed design.** The customers design assumed four hardcoded tiers; deriving rank, colour and value from the plan rows means adding a fifth plan needs no code change.
- **Refuse ambiguity rather than guessing it.** Two equally specific template matches yield no template. A wrong template silently supplies wrong crew, hours and licence — worse than supplying none, and much harder to notice.
- **Treat missing data as a miss, not a pass.** An account with no type set must not match a type-restricted template; otherwise unconfigured records quietly inherit rules meant for someone else.
- **Two entities that share a word are still two entities.** Tool inventory vs. customer-site assets; CRM account vs. dispatch customer. Merging them leaves half the columns null in each case.
- **A constraint without a retry converts a silent bug into a visible error.** That is an improvement, but only half the fix — the loser of the race should take the next number, not see a 500.

### From the prior session (fleet, templates, segmentation, plans)

- **Babel-validating a JSX file proves it PARSES. It does not prove it RUNS.** `vite build` succeeding does not either — TDZ is a runtime error and rollup emits it happily. Both gates passed on code that killed the Dispatch tab in production (§0X.12). Declaration order is now a scripted check, `scripts/check-tdz.mjs`.
- **A `useMemo` evaluates during render.** Every const it closes over must be declared **above** it in the same scope. Dev tolerates a violation because the unminified bundle does not reorder; production throws `Cannot access 'X' before initialization` and the component never mounts.
- **Compute, do not generate, when the visibility window is configurable.** Once `leadDays` decides when work surfaces, there is no reason to materialise future visits: the queue is a derivation over existing jobs, and a five-year plan costs one pass instead of a table of speculative rows. The cost is that a single occurrence cannot be skipped or deferred — nothing exists to annotate.
- **Record which occurrence a job satisfies, not just when it ran.** `planDueDate` separate from `scheduledDate` is what lets a visit performed five weeks late retire the right occurrence. Inferring it from proximity breaks on the first late visit.
- **Only a terminal state retires an obligation.** A *scheduled* visit is in hand but still outstanding; treating it as done advanced the pointer and hid the visit about to happen.
- **When two fields can contradict, make one authoritative and derive the other.** `intervalDays` and `visitsPerYear` were independently editable, so a plan could read "quarterly, 6 visits a year" — scheduling 4 and promising 6. Ignore the supplied value rather than merging it, and show the derived one read-only so the form does not offer an input the server discards.
- **A checker that cries wolf is worse than none.** The first TDZ scanner counted object property keys as variable references and pointed at innocent code in the previous commit. Verify a new diagnostic against a case you already know the answer to before acting on it.
- **When a required field fails silently, say so loudly at the point of entry.** A plan with no `planStartDate` produces no error and no visits — the customer is just absent from the queue. The field warns inline rather than leaving it to be discovered weeks later.

- **Two stores for one concept means one of them is wrong — find out which is read.** Vehicles were edited in settings and read from the table. The test is not "which list is bigger" but **"which one does the operational surface consume?"** Whatever the board, the scorer, or the scheduler reads is the source of truth; everything else is a parallel copy waiting to disagree.
- **Model the unit, not the count.** One equipment row per physical unit beats a `qty` field, because a quantity cannot express "one of the two is in the shop". Any capacity model built on a number instead of records will silently over-report availability the moment a single unit goes out of service.
- **Separate the requirement from the asset.** A job needs *a* pressure tester (a category); checkout binds *asset #A-1042* (a row). Collapsing the two puts blob ids into an FK column. The same split applies to vehicles: the job requires a **class**, the technician is assigned a **specific** vehicle.
- **Where a constraint is enforced follows what it attaches to.** Equipment attaches to nothing, so a shortage is job-level and gates at `handleSchedule`. A vehicle attaches to a technician, so it is a per-technician blocker in `scoreTech`. Putting a job-level constraint in the per-tech scorer stamps the identical blocker on every candidate; putting a per-tech constraint at the job gate loses the ability to rank.
- **Derive service history; never denormalise it.** A stored `jobCount` needs maintaining on every job write and is wrong the moment one is deleted. Derive at render, memoise on both inputs.
- **Coercing inside `onChange` makes a controlled input uneditable.** `parseInt('') || 1` rewrites the field before the next keystroke lands, and a value derived as `` `${n} hours` `` re-formats on every keypress and pins the caret. **Hold raw text while typing, coerce on blur, and sanitise again at save** in case the field never blurred.
- **A `<select>` whose value matches no option silently renders the first one.** That reads as "None" and clears a real setting on the next save. Always emit an explicit `Unknown (id)` / `Not in fleet (x)` option for an unresolved value. This bit three separate fields this session (preferred tech, crew default vehicle, template vehicle class).
- **Do not migrate against an async vocabulary before it arrives.** Template equipment migration gated on the fetch completing — running it against an empty category list would have filed every requirement as unmatched and then persisted that on the next save.
- **Resolve display names at render, not inside a `[]`-deps effect.** Names resolved inside the mount-only loader are frozen against whatever `settings` held at mount. Store ids; resolve where they are shown.
- **Filter counts should be independent of the other active filters.** A count computed against every filter collapses to zero as soon as two are combined, so the number stops telling you what clicking it would give you.
- **Reported-and-kept beats silently-dropped.** Unmatched legacy equipment fragments, licence levels no longer in the vocabulary, and skipped template fields are all surfaced rather than discarded. A dropped requirement is invisible; a reported one gets fixed.
- **An idempotent import is worth designing for.** Deriving imported row ids from the source ids means the upsert-on-id POST makes re-running harmless — which in turn means the import can be a visible button the admin clicks rather than a script run against live data.

### From the Dispatch session
- **Verify a horizon item against the code before building it.** Lead Scoring v1.5 was fully shipped while the docs still listed it as outstanding. Stale entries cut both ways — SVR-2 was recorded done when it was not.
- **A fixed vulnerability can leave live damage behind.** The cross-tenant upsert bug was closed in §0e by adding `setWhere`, but the rows it had already corrupted stayed. Closing a hole and cleaning up after it are two separate jobs.
- **"One row per X" needs a constraint, not a convention.** `settings` had no unique index on `org_id`, and reads took `rows[0]` unordered — so a duplicate produced non-deterministic config, not an error. If the code assumes one row, make the database enforce it.
- **A mirror must never be able to decide the value it mirrors.** `sanitize()` took `role` from the request body on every write, so a self-service profile save that omitted `userType` silently demoted the user to `'User'`. Mirrors should copy from the authority (Clerk) or preserve what is stored — never accept the field from a client.
- **Divergence between two systems needs a detector, not just a reconciler.** `users-sync` could fix the drift for months before anyone ran it. A cheap dry-run check on page load turns an invisible problem into a visible one.
- **Two call sites for one operation will drift.** User delete sent the id in the body from the list and in the query string from the profile page; the server only read the query string. Combined with no `res.ok` check, the row vanished from the screen and came back on refresh.
- **A destructive action must be labelled as one.** Both delete controls said "Deactivate" with confirm copy about "losing access". Reversible and irreversible actions need different names, different colours, and honest copy about what is and is not recoverable.
- **`dbFetch` resolves for ANY response — a `catch` block does not see a 403.** Every settings panel wrapped its save in `try/catch` and cleared the dirty flag afterwards, so a failed PUT was indistinguishable from a success *and produced no console output at all*. Always check `res.ok`; never clear dirty state outside the success path.
- **A permission change can silently break an unrelated feature.** Making `PUT /settings` Admin-only (SVR-2) turned every non-admin settings save into a no-op that reported success, because of the bug above. When a gate is added, walk the callers that were previously succeeding.
- **JSX does not process `\u` escapes in text or attribute positions.** They render literally. Only string and template literals interpret them — an easy mistake when generating JSX programmatically, and Babel passes it.
- **Not every inconsistency is worth fixing.** Six endpoints use local role helpers rather than the shared ones. All gate to Admin, so the new role was already denied; renaming them is churn with real regression risk. Fix what changes behaviour, record the rest as tidying.
- **A new role must never inherit capability by default.** `requireWrite` denied only ReadOnly, so adding `Technician` would have granted write access everywhere. Deny the new role in the shared helper and add one explicit opt-in; anything else means auditing every call site by hand and hoping.
- **Adding a role is a security audit of every gate.** Nine endpoints would have accepted Technician writes — six core CRM handlers checking `isReadOnly` directly instead of the shared helper, and `quotes.mjs` with a local const shadowing the imported one. Neither was visible from the role definition. **Grep every gate when the role set changes.**
- **Clerk is the source of truth for roles; the `users` table is a mirror.** Nothing wrote role changes back to Clerk, so the Settings role selector changed nothing the server enforced. When a control drives authorization, verify it writes to the system that authorization actually reads.
- **A mismatch that fails open is invisible.** Two role lists disagreed (`'Sales Rep'` vs `'User'`) and nobody noticed, because `auth.mjs` treats any unrecognised role as a rep. Prefer explicit value/label pairs over strings that happen to work.
- **Compute-and-display is not gate-and-block.** The crew builder rendered blockers in red then gated its Add button on `score >= 70`, so a blocked technician was assignable. When a rule is shown, check that the control performing the action reads the same rule — and give an explicit override path rather than leaving the gate open.
- **A plausible default is worse than a visible gap.** Licence level, `hoursCap`, `minLicense` and `needSkills` were all fabricated or hardcoded while real decisions were made against them. Store the value, default to unset, make unset fail safe.
- **Views over the same data must agree.** The week board rendered jobs inside technician rows, so a dated-but-uncrewed job vanished there while showing in the month grid. When two views read one dataset, check the intersection each one drops.
- **Verify every patch by re-reading the file.** A patch script reported two edits applied and then aborted before writing; both were lost, and the missing one was later mis-diagnosed as a different bug. Grep after every patch, not only after a reported failure.
- **Additive columns are only safe in one direction.** DB-then-code is harmless — nothing reads the new column yet. **Code-then-DB is an outage** on every read of that table, because Drizzle's `db.select()` with no projection expands to the full column list declared in `schema.ts`. The four job/customer columns went DB-first and were fine; `license_level` went code-first and 500'd every `dispatch-technicians` request.
- **A fabricated value will quietly drive real decisions.** `normaliseTech` invented a licence level from employment type and skill count, and the board matched job eligibility against it. Derive nothing that a user is supposed to enter — store it, default to unset, and make unset fail safe.
- **Advisory warnings are not enforcement.** The crew builder computed and displayed blockers, then gated the Add button on `score >= 70`. Compute-and-display is not the same as gate-and-block; check the thing that actually guards the action.
- **"Add" reads as a commit.** Three separate surfaces this session had an Add button that only mutates local draft state, with the real persist behind a second button. If a click looks like it saved, users will treat it as saved.
- **A CRM account and an operational entity are different things.** `dispatch_customers` stays separate from `accounts` because it carries ten fields that have no business on a sales account (`serviceAgreement`, `preferredTechId`, `doNotService`, `taxExempt`, `creditLimit`, `paymentMethod`…), because residential customers would wreck account segments / lead scoring / pipeline reporting, and because Dispatch is a licensed module that not every org has. Same reasoning for `dispatch_technicians` vs `users`. **Link by nullable FK; never merge the tables.**
- **Nullable `userId` on `dispatch_technicians` is load-bearing.** It lets a subcontractor be schedulable without consuming a Clerk seat, while an employee tech who needs the (future) mobile app gets one. Identity (can log in, has a role) and operational record (schedulable, skills, rates) are separate concerns — collapsing "technician" into a user role breaks the subcontractor case.
- **No delete where an FK has no cascade.** `dispatch_jobs.customerId` and `.assignedTechId` would orphan. Provide a retire/deactivate flag (`doNotService`, `status`) instead.
- **Never gate a per-record feature on an org-wide flag.** The `UsersDetail` tech profile used `settings.dispatchEnabled` (org) where `user.dispatchEnabled` (per user) was meant, so every user looked like a technician.
- **A write to a key the server does not whitelist fails silently.** `PUT /settings { users: [...] }` was discarded because `settings.mjs` has no `users` key — users live in their own table. Combined with a missing `setSettings`, the panel had never persisted anything. **Check the server whitelist before assuming a save works.**
- **Always check `res.ok` before parsing.** A 500 that parses to `{error}` and falls through `|| []` renders as "no data yet" — endpoint failure and empty table become indistinguishable. This bit both the dispatch load and the settings save (`catch(e) { console.error(...) }` swallows a 403 and still clears the dirty flag).
- **Babel is stricter than the build.** `DispatchSkillsDetail.jsx` had malformed JSX that Babel rejected and Vite/esbuild shipped anyway (esbuild tolerates a stray `}` in JSX text). **Run the Babel parse across all of `src/` in CI**, not just on files under edit.
- **Enum vocabularies drift when they are not enforced.** Priority existed in three incompatible forms across schema, UI colour maps, and form options. Every new consumer picks one at random — which is how the bug arose.
- **Dev and production share one Neon database but separate Clerk instances.** Data seeded under one org is correctly invisible to the other. Before concluding a feature is broken, confirm the caller's org: `JSON.parse(atob(t.split('.')[1])).o.id` (Clerk puts the org at `payload.o.id`).

### Earlier

### React Rules
- **React error #310** = `useState` called conditionally. ALL `useState` must be at component top level, never inside `if (activeTemplate === ...)` blocks.
- **Context chain rule:** when a feature silently does nothing, trace `useModalState` → `App.jsx` (appContextValue) → consuming component destructure.
- `waitForToken()` pattern required for any on-mount DB call.

### Data / DB Rules
- **Settings JSONB read-then-merge:** PUT must read existing and merge, never rebuild from payload alone.
- **Undo restore must write to DB** — local-only restores cause data loss on refresh.
- `dbFetch` returns parsed JSON directly — no `.json()` call needed.
- **Netlify fire-and-forget kills async:** all email/SMS calls must use `await`, not `.then()` chains.
- **ACCELEREP RULE — No local-only state for persistent data:** any data that should survive refresh MUST be saved to DB via `dbFetch` immediately after state update.
- **Schema safety:** always verify `schema.ts` has ALL current DB columns before running `drizzle-kit push` — an outdated upload can cause DROP COLUMN warnings with live data.

### Security / Hardening Rules
- **Org-scope every upsert:** `onConflictDoUpdate({ target: table.id, setWhere: eq(table.orgId, orgId), set })`. Conflict on `id` alone allows cross-tenant overwrite.
- **IDs use `crypto.randomUUID()`** with a per-entity prefix — never `Date.now() + Math.random()`.
- **Never leak errors:** 500 responses use `serverErrorBody(err, label)` from `_lib.mjs` (generic message + correlation id); full detail logged server-side only. Intentional 4xx messages are fine.
- **Index changes to prod:** apply via `CREATE INDEX CONCURRENTLY` in the Neon console — never `drizzle-kit push` against production (push diffs the whole schema and can act on unrelated drift).

### CSS / Layout Rules
- `transform: translate` conflicts with modal CSS animations — use `position: relative` + `left/top` for drag positioning.
- Fractional (`fr`) grid columns scale with viewport — use fixed `px` widths when columns must stay close together. Use `1fr` on one column to absorb remaining space.
- `whiteSpace: nowrap` + `textOverflow: ellipsis` prevents wrapping — remove both when a column should wrap within a fixed width.
- CRLF/LF mismatch can cause git to report "nothing to commit" even after real changes.
- Clerk JWT org ID lives at `payload.o.id`, not `payload.org_id`.

### Settings Module / Decomposition Conventions
- **Settings panels** live under `src/Tabs/settings/<category>/`; the shell (`SettingsTab.jsx`) → `AdminView`/`PersonalView` (at `src/Tabs/`) → panels. To add a panel: (1) `catalogue.js` `SETTINGS_ITEMS` entry, (2) `AdminView.jsx` import + id-map + route, (3) a `settings.extra` key in `settings.mjs` GET **and** PUT, (4) `dbFetch` save in the panel.
- **Shared chrome** = `CategoryDetailChrome` (`settings/shared/`, was `SPDetailPageChrome`) with a `category` prop. Tokens/`ui`/`form` primitives live in `settings/shared/`. Import paths from a panel: `../shared/...`, `../../../AppContext`, `../../../utils/storage`, sibling panels via `./`.
- **No inline sub-components** — never `const Foo = () => …` inside a parent component; React sees a new type each render → unmount/remount → focus loss / scroll jumps / stale closures. Define at module scope, pass data as props. (Tabs still to audit: `TasksTab`, `LeadsTab`, `PipelineTab`.)
- **Cross-section dependency check** — when extracting/moving code, grep its identifiers against **all still-resident code**, not just the section's own panels. A missed reuse (e.g. Audit using Security's `SecCrumb`/dropdowns) becomes a runtime `ReferenceError`.

### CSS / Design-System Rules (the warm "stone/ink" system)
- Each file declares its own `const T = { bg:'#f0ece4', surface:'#fbf8f3', surface2:'#f5efe3', border:'#e6ddd0', borderStrong:'#d4c8b4', ink:'#2a2622', inkMid:'#5a544c', inkMuted:'#8a8378', gold:'#c8b99a', goldInk:'#7a6a48', danger:'#9c3a2e', warn:'#b87333', ok:'#4d6b3d', info:'#3a5a7a', sans:'"Plus Jakarta Sans", system-ui, sans-serif', r:3 }`.
- **No generic Tailwind-style colors** — `#2563eb` and other off-brand blues/grays are forbidden; use `T.*`. Pills use `borderRadius: 999`; dark drag-handle headers use `#1c1917`.
- **Inline styles only** — no CSS classes like `btn`/`btn-secondary`/`modal-actions`; define inline style objects.
- **Popovers/menus inside scroll/overflow containers must use `ReactDOM.createPortal` to `document.body`** with `position:fixed` (compute coords from the trigger's `getBoundingClientRect()`, flip up/down by viewport space, cap `maxHeight`). Close on outside-click / scroll / resize — but **ignore events whose target is inside the menu** (`menuRef.current.contains(e.target)`), or the menu's own scrollbar closes it.
- A `transform` on a panel container traps `position:fixed` children in a new stacking context — portal out to escape.

### Account / Data Rules
- **Accounts include sub-accounts as rows** (`parentAccountId` set). For "account counts" (distributions, totals) filter to **top-level** (`!a.parentAccountId`) — counting all rows over-inflates (e.g. 661 rows for ~83 accounts).
- **Account industry** = `account.verticalMarket || account.industry` (two fields; verticalMarket first).

### Lead Scoring Rules
- Engine is `score-lead.mjs` (pure). Compute **server-side and persist** (write-trigger in `leads.mjs` + nightly batch); the frontend reads the stored columns.
- `scoredEntity` is the **lead**, not accounts/opportunities. Fit reads lead fields (`title`/`estimatedARR`/`source`/`status`); Engagement (v1) = status + recency decay (no `leadId` on activities yet).
- Rule ops: `equals` / `notEquals` / `in` / `gte` / `lte` / `contains` / `matchesAny` / `exists` (+ `recency` and reserved `event`).

### Field Naming
- Accounts have TWO owner fields: `accountOwner` (older) and `assignedRep` (what Edit Account modal saves to). All owner logic must check both: `effectiveOwner = accountOwner || assignedRep`.

---

### Async persistence & the await-before-close rule (this session)
- **Any handler that persists to the DB must be `async` and awaited by callers that close a modal/rail or trigger a reload afterward.** `TaskRail` fired an async completion without `await` then called `closeRail()` (which reloads tasks) — the reload raced and abandoned the in-flight PUT, silently dropping the write. Sibling of the no-local-only-state rule: it's not enough to *have* a save; the caller must not race it.
- **Persist-with-rollback for optimistic toggles:** optimistic `setTasks` → `await dbFetch` PUT → reconcile from response; on failure, restore the pre-change row so local state can't drift from the DB.
- **Debugging discipline:** when a symptom in the browser contradicts what the code says should happen, get ground truth from the running app (console `fetch` of the live API) *before* editing code. Twice this session the real cause was invisible from reading the repo (stale branch, uncommitted file, then a genuine race); the console `fetch` showing `completed:false` in the DB is what finally located the write failure vs. a cache red-herring.

### Portal z-index & mousedown-race (this session — for any new portaled popover)
- Portaled menus/popovers must clear the **z-index of their host surface**: the task rail is `11003`, so the `TimeDropdown` menu sits at **12000**. `400` rendered it invisibly behind the rail. Check the host's z-index, don't assume a low value clears it.
- Inside a **draggable** container (which attaches its own document `mousedown` handlers), a trigger that opens on `onClick` can be closed by the same gesture's `mousedown` reaching the outside-close listener. Toggle on `onMouseDown` + `stopPropagation`, and guard the close listener with a `justOpenedRef` that swallows the opening mousedown.

### Security enforcement patterns (this session — use these, don't reinvent)
- **Branch-level role gate:** `const forbidden = requireRole(auth, ['Admin'], headers); if (forbidden) return forbidden;`
- **Audit destructive/privileged actions:** `await writeAudit(orgId, { action, entityType, entityId, entityName, detail, userId });` — best-effort, never let it fail the operation.
- **ReadOnly mutation gate** goes immediately after the auth destructure, before any handler logic.
- **Object-level checks fail closed:** `getCallerName()` returning null means the caller matches no assigned record; unassigned (null-owner) records remain rep-editable by design.
- **PUT is strictly an update** — unknown ids 404; creation is POST-only. Check existence → ownership → write, in that order.
- **Secrets are write-only:** GET returns presence booleans (`anthropicApiKeySet`), never values — a masked hint (last-4) is Admin-only. Client key inputs are write-only: always empty on load, with explicit intent state so an untouched field never clears a stored key.
- **A secret must live in exactly one place.** The SVR-2 leak was not the encrypted field — it was a *second, plaintext copy* the UI wrote into a general-purpose blob (`aiSettings.byokProvider`) that GET returns to every member. When auditing secret handling, grep the UI for where the value is actually bound, not just the field the audit names.
- **`PUT /settings` is Admin-only (whole branch, not per-field).** Settings are org-wide; letting members write non-secret fields leaves SVR-2(b) integrity/DoS open. Consequence: non-admin settings auto-saves 403 — personal preferences must therefore go to `/users?me=true`, never the settings blob.
- **Verify the live repo, not the state doc, before marking an audit item closed.** SVR-2 was recorded as fixed for a full session while the vulnerable code was live on production.
- **Auth cache caveat:** `verifyAuth` caches role ~30s — a just-demoted admin can act for up to 30s. Accepted; documented in `auth.mjs`.

---

## 9. On the Horizon

### From the delete-gate batch (24 Aug)

**Settings auto-save fires for users who can never save.** `useSettings.js:223`
PUTs on every change to `settings`, and `/settings` PUT is Admin-only. For a rep,
`settings` changes once during load — the roster arrives at `:201` — the effect
fires, the server refuses, and a "Settings not saved — You do not have permission
to make this change" toast appears for a write the user never requested. The
surfacing is correct (the comment above the write documents a real past bug where
a swallowed 403 cached a change locally forever); the redundant write is not.
`users` is stripped from the payload anyway, so this PUT sends a body identical
to what was just loaded — a no-op write that can only fail. Skip the effect when
the stripped payload is unchanged from what was loaded; that fixes it for Admins
too, who are also making this write on every load.

**Restyle `LeadImportModal` onto `CsvImportModal`'s chrome.** It predates the
design language — blue `#2563eb` primaries where the guide says `#1c1917`, its
own header, step indicators and drop zone. It also carries its own copy of the
superseded column matcher (`:63–76`): first-match-wins substring matching in both
directions, with no confidence reporting, which `csvAutoMap.js` was written to
replace. Porting it retires the matcher in the same pass rather than restyling
around it.

**`currentUser` from the roster, not Clerk.** See §0.26. Highest-value item here:
it is a live correctness bug for any user without a Clerk profile name.

~~**Centralise the nine remaining ownership checks**~~ **DONE** — closed by
§0.29/§0.34, which also corrected the count: it was ten, verified by reading.

~~**`tasks.mjs` GET has no rep scoping**~~ **DONE** — decided and closed by the
GET-scoping batch (§0.48): accounts, contacts, tasks and activities are all
rep-scoped on `ownerId` now, the same predicate as leads and opportunities.
Unassigned rows stay visible to everyone — the policy, not a gap.

**Bulk-import notification for leads.** The new bulk branch deliberately fires no
`lead.created` webhook or automation. If either matters for imported leads, it
needs a batched or deferred dispatch, not an inline loop.

**End-to-end importer test.** §0.23 is the fourth cross-layer import defect. One
test running a fixture CSV through all six modules — `csvAutoMap` → `csvMapping`
→ `importRows` → `bulkInsert`/`bulkUpsert` → `_sanitize` → `_stage` — asserting
the final row shape for create and overwrite, is what closes the class.

**Stray scanner fixture.** `tests/fixtures/scanners/dupes-jsx-attribute - Copy.jsx`
is byte-identical to `dupes-jsx-attribute.jsx` and referenced by no test — a
Windows Explorer duplicate that got committed. One-line delete.

---

### Next up

> Build guard and the `drizzle-orm` bump both **shipped** — see §0.1 and §0.7.

~~**The remaining `dbFetch` sites.**~~ **DONE.** 78 → 0. `check:dbfetch` is the
fifth gate, exits non-zero on any finding, and runs in CI. Deliberate
fire-and-forget opts out with a `dbfetch-ignore:` comment at the call site — three
sites qualify (`addAudit`, two `fireMentionSms`). See guide §18b6.

**Accounts / contacts bulk POST is unbatched.** One statement for every row; breaks above ~1,872 rows against the 65,535 bind-parameter ceiling, and one bad row kills the whole batch. The overwrite path was fixed this session (`bulkUpsert`); the insert path was not. Do this **before** the CSV Import + Export rollout below, since that multiplies the number of files pushed through it.

**`onConflictDoNothing()` in the POST bulk branch can never fire.** Fresh `crypto.randomUUID()` ids against an `id`-only unique constraint. Nothing dedupes by name at insert, so a repeated import inserts a complete new set. Decide whether insert-time name dedupe belongs here or stays with the smart-merge tooling.

~~**Clerk advisories.**~~ **DONE — the Production migration is unblocked.** See §0.10.

**Never `npm audit fix --force`** — it installs `vite@8`, a breaking change, to fix
a dev-server-only issue. Five advisories remain after the Clerk fix, all in
`vite`/`esbuild`/`drizzle-kit` dev tooling. The one high among them is
Windows-specific (`server.fs.deny` bypass on alternate paths, NTLMv2 hash
disclosure via UNC handling) and dev-server only — relevant to this machine, but
it requires something reaching a localhost-bound dev server.

**SPIFF panel on mobile.** The entire HomeTab right column is `{!isMobile && …}`, so the panel is desktop-only. Pre-existing pattern; reps are often on phones. Needs a deliberate decision about placement in the mobile stack.

### Then

**CSV Import + Export** for Pipeline, Contacts, Accounts. Reuse the `Settings → Data` approach; per-tab columns differ.

**Layer 3 E2E (Playwright).** Thin happy-path suite. Main hurdle remains automating Clerk login.

**Skip / defer a single plan occurrence.** Not expressible in the computed recurrence model — nothing to annotate. Needs a `dispatch_plan_visits` table. Worth doing when real use demands it.

**76 churn-only inline components** (`npm run check:inline -- --churn`). Stateless wrappers, mostly in `ReportsTab` (55) and `AccountsTab` (7). They remount harmlessly. Worth cleaning opportunistically when already editing those files; not worth a dedicated pass.

### Open design questions

- **Version sprawl in quotes** — the 3-version cap is gone, but Build still compares only *current vs immediately previous*.
- **CRM entity numbering** — accounts are the strongest candidate; only pays off if searchable, on documents, and surviving export.
- **`share` (shared vs per-van)** on equipment is displayed in tooltips but not modelled.
- **`planWeek` is greedy, not globally optimal.**
- **Email signatures appear on quote emails only.** `send-email.mjs` is the shared choke point if other outbound mail should carry them, but each caller has a different notion of "who is sending".

### Resolved this batch

- ~~Inline-component audit (`TasksTab`, `LeadsTab`, `PipelineTab`)~~ — §0.33. **Those three were already clean.** Replaced by the two real items above.

### Unwired stubs (buttons that render and do nothing)

- **"Test auto-create"** — `DispatchJobTemplatesDetail`.
- **"Manual pick"** — `DispatchTab` / `CrewBuilderView`.
- FunnelStages "+ Add stage" · LeadConversion "Recompute from history" (needs a new Netlify function) + "Save changes" · PainPoints "Import CSV" · CustomerTypes auto-classification "Edit" · Industries drag handles.

### Tooling — what the two scanners cover

| | Finds | Command |
|---|---|---|
| `check-tdz.mjs` | Reads before declaration, and references defined in NO scope | `npm run check:tdz` |
| `check-inline-components.mjs` | Components declared inline and used as a JSX element type | `npm run check:inline` |

**Neither covers:** the inside of Netlify handlers (a TDZ was caught there by reading, §0A.32); the *"renders and silently does nothing"* class; a field sent on save but missing from the load (§0A.32); or a prop threaded from the wrong place. Those are still found by reading, or by a user reporting them.

### Each a session on its own — do not batch

- **13 settings panels not on `putSettings`** — a DIFFERENT list from the 14 save handlers fixed in §0B.25; these are panels whose whole persistence shape differs.

- **Twilio SMS activation** after A2P carrier approval (972-526-0638)
- **Clerk Production instance migration** (ON HOLD — needs a dedicated block of time, not a mid-session task). Currently running Development instance keys on **both** sites.
  - **The user export/import is the easy half.** The trap is that a Clerk **Production instance is a separate instance**: new users, new organizations, and therefore **new organization IDs**. All **40 org-scoped tables** derive `org_id` from the JWT (`payload.o.id`), so the moment production switches to Production keys you sign in to a new org id and **every existing row becomes invisible** — not deleted, orphaned. Accounts, opportunities, contacts, quotes, dispatch, settings, all of it.
  - Recoverable via an `UPDATE ... SET org_id = <new>` sweep across all 40 tables, but that must be **planned before the cutover**, not discovered during it.
  - **Decide first: does the existing production data matter?** Evidence so far says most of it is seed/demo (the 8 dispatch customers and 11 jobs were seeded directly; the `@test.com` users exist in no Clerk account; the dispatch board was rendering synthesized `auto_` placeholders). If none of it is real, the migration is far simpler — switch keys and start clean, no `org_id` rewrite.
  - **Second open question: should dev and production keep sharing one Neon branch?** They do today, which is why `org_3BDQ…` (dev) and `org_3Cwn…` (prod) sit in the same database. Post-migration both Clerk instances would still write to the same tables. Separating them is a bigger change but much cheaper now than later.
  - No code change needed for the keys themselves: only `VITE_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are referenced, and `authorizedParties` in `auth.mjs` is domain-based, not instance-based. Add the `clerk.salespipelinetracker.com` CNAME, swap env vars on both Netlify sites, redeploy, verify.
  - Sequence the cutover with a rollback at each step and an explicit check that you cannot lock yourself out of Admin.
- **Microsoft Azure OAuth** and Yahoo Calendar (both deferred)
- **New customer onboarding flow**
- **Billing integration**
- **Error boundaries** — added to tab components, broader coverage outstanding
- **Saved reports:** sharing, scheduling (email/Slack cadence), pin-to-dashboard
- **Report builder:** actual query execution against live DB (currently preview is illustrative)
- **AccountsTab layout** — column balance and toolbar spacing polish (deferred from this session)
- ~~**Lead Scoring v1.5**~~ **DONE** (verified live, §0a8) — `activities.lead_id`, lead-touch logging, rescore on activity write, and five `op:'event'` rules are all shipped.
- **Lead Scoring Phase 2** — per-org predictive scoring (logistic regression, license-gated like Dispatch) once an org crosses a closed-deal threshold; source-disposition learning (won-conversion rate per source feeds the score). `predictive` block already stubbed in `leadScoring` config.
- **Hardening backlog (from codebase review):** public-API DB-side pagination; date-typed columns (several dates are `varchar`); baseline test suite; CORS allow-list (parked — low risk with bearer-token auth). *(SettingsTab split — DONE this session.)*
- **Inline-component audit** — `TasksTab`, `LeadsTab`, `PipelineTab` still contain inline sub-components to hoist.
- **This session's follow-ups:** Kanban view (PipelineTab) — verify closed deals leave the board correctly now that closing is reachable; sweep other modals (`components/modals/`) still on blue-era palette / missing Esc + overflow handling (LostReasonModal was one of a likely cohort); consider exempting task completion from the rep ownership gate, or allowing the assignee specifically (a rep completing a teammate's task currently 403s → rollback reverts the checkbox — correct per matrix, maybe wrong for workflow); align other tabs' delete-confirm copy with the soft-delete undo reality (done for ContactsTab).
- **Dispatch — technician model.** Step 3 **DONE** (old stores retired, crews repointed). Remaining — Step 4: migrate any real `settings.users[].dispatch*` data into `dispatch_technicians`, then retire those fields, the dead `settings.extra.dispatchTechProfiles` key, and `DispatchTechDetail` (it filters on `u.dispatchEnabled`, which nothing sets any more, so it now always renders empty). Step 4: **`Technician` role + scoping** for mobile — add `isTechnician()`, resolve `userId → dispatch_technicians.id` server-side (jobs FK the technician row, *not* the user), filter to `assignedTechId` or membership in `coTechIds`, and apply a **per-field write whitelist**: job status transitions, `techNotes`, `completionNotes`, `photosCount`, `customerSignature` — and nothing else (no reassignment, scheduling, or customer edits). Note `requireWrite` currently treats every non-ReadOnly role as fully write-capable, so the role and its scoping must land together.
- **Priority vocabulary normalization** to `low|normal|high|emergency` everywhere. Surface is small: the `priority:'standard'` literal in the "New template" button, the `autoJobs` synthesiser in `DispatchTab`, a settings-blob pass over `dispatchJobTemplates`, and one additive `UPDATE` on `dispatch_jobs`. Then collapse the dual-accept `prioColor`/`prioColor2` maps back to one. **Do as its own commit** — not bundled with feature work. Store `emergency`, label it "Emergency".
- **`DispatchJobTemplatesDetail` bug:** the "Template name" input and the customer-type select both write `updateTemplate('ctype', ...)` — the same field — so templates have no distinct name and the list renders customer types as names. Split `name` from `ctype` (migrate by copying `ctype` → `name`). **Blocks** making templates selectable in the New Job modal.
- **`dispatchJobTypes` + `dispatchTrades` settings panels** — `jobType` and `trade` are hardcoded; nothing branches on either, so admin-configurable lists are safe. Seed from the schema's documented set.
- **Add-vs-commit across settings panels.** Every settings panel has an "Add" that only mutates local state, with the real persist behind "Save changes". This caused three separate false "it didn't save" reports in one session. Consider auto-saving on Add, or making the dirty state unmissable.
- **Role-gate helper tidying (cosmetic, no behaviour change).** `automations`, `webhooks`, `export-schedules`, `export-dsr`, `api-keys`, `backup` use local `canWrite`/`requireAdmin`/inline checks. All Admin-gated, so Technician is denied — migrating them to the shared helpers is style only. Also rename the local `isAdmin`/`isManager` consts in `products` / `spiff-claims` / `calendar-connections` that shadow the imported helpers.
- **Settings panels not yet converted to `putSettings`** (different shapes / no shared chrome): `PipelinesDetail`, `AuditDetail`, `CompanyProfileDetail`, `FiscalYearDetail`, `CompanyCalendarDetail`, `PriceBookDetail`, `SsoDetail`, `EditBrandModal`, `TeamsDetail`, `TerritoriesDetail`, `UsersDetail`, `BuyerPersonasDetail`, `FlatListDetail`.
- **Job templates selectable in New Job** — now unblocked by the `name`/`ctype` split.
- ~~Technician frontend gating~~ **DONE**. Remaining from that item: surface the server's message on dispatch load errors instead of only the status code.
- **Dispatch smaller gaps:** `jobNumber` is never assigned (the `nextCustomerNumber` pattern would drop straight in as `JOB-2026-0042`); `preferredTechId` is scored and displayed but cannot be set anywhere; `dispatch_equipment` has an endpoint and no UI; mass-schedule assigns a single tech per job, ignoring `crewSize`.
- **Dispatch board follow-ups:** drag-to-reschedule on the week grid; `Save draft` in the crew builder is still inert; SMS notify is stubbed pending Twilio A2P approval.
- **Settings panels swallow save errors** — `catch(e) { console.error(...) }` clears the dirty flag whether or not the PUT succeeded. Surface failures (a 403 from the SVR-2 Admin gate currently looks like success). Also consider making Add-then-Save clearer across settings panels; "Add" reads as a commit.
- **Non-transactional dispatch job create** — if the service-location write fails, the customer from step 1 already exists. Retry finds them rather than duplicating, but state is not rolled back.
- **Role-gate uniformity pass (deferred from SVR-3):** migrate the local `requireAdmin` / `canWrite` / inline role checks in `automations`, `webhooks`, `export-schedules`, `export-dsr`, `api-keys`, `backup`, `export-runs` to the shared `requireWrite` / `requireRole`; and rename the local `isAdmin`/`isManager`/`isReadOnly` consts in `products`, `quotes`, `spiff-claims`, `calendar-connections` that shadow the imported helpers of the same name.
- **Seed data cleanup:** ten `@test.com` users exist in the `users` mirror and in no Clerk account. Harmless but they inflate seat usage, appear in owner dropdowns, and will keep triggering the drift banner. Delete before production.
- **Security follow-ups:** **`PUT /users?me=true` accepts a self-supplied `role`** (`sanitize()` takes `data.userType || data.role`; the `me` branch only checks id match — not real escalation since server gates read Clerk `publicMetadata`, but it flips client gates and pollutes the roster); non-admin settings auto-save now 403s (harmless, already `.catch`-ed — silencing needs `userRole` threaded into `useSettings()`, which touches `App.jsx`); role/ownership sweep of `documents.mjs` (DELETE has `ownerId` but no gate) + all `dispatch-*` endpoints + `products`/`saved-reports`; Netlify env-var & source-map audit item (dashboard config); Security-health sub-page — wire mock events feed + score to the real audit log; migrate name-based ownership to `ownerId` userId columns (post-launch); Manager **team-scoped** writes (Phase 2 — full org-wide write in v1 by design); align delete-confirm copy on other tabs with the soft-delete undo reality; client skips `GET /users` for non-admin roles (currently eats an expected 403 with console noise each load).
- **Manager-scoped settings permissions (design question, not a bug).** `PUT /settings` is currently a blanket Admin-only role check (SVR-2). If Managers should ever make *limited* settings changes, a wider role check is the wrong tool — it would hand back the whole org config, reopening SVR-2(b). The right shape is **per-section permissions**: classify each `settings.extra` key by sensitivity, and gate the PUT per key rather than per request. Sketch:
  - Tier the keys — e.g. **Admin-only** (`anthropicApiKey`, `rolePermissions`, `ssoConfig`, `featureFlags`, `fieldVisibility`, `dispatchEnabled`/licensing) vs **Manager-allowed** (candidates: `painPoints`, `competitors`, `reasonsWon`/`reasonsLost`, `industries`, `buyerPersonas`, `kpiTargets`/`kpiThresholds`, `leadScoring` rules — Jeff to decide the actual split).
  - PUT keeps the auth gate but moves it per-field: build `extra` from only the keys the caller's role may write, and either drop or 403 the rest. The read-then-merge pattern already isolates each key, so this is a filter over the existing merge block, not a rewrite.
  - Reuse the existing `settings.extra.rolePermissions` blob (already persisted by `RolesDetail`) as the source of truth so the split is configurable per org rather than hard-coded.
  - Audit rows should record the caller's role and which keys were accepted vs rejected.
  - `AdminView` gating needs a matching change or Managers still won't see the panels.
  - Related: the `useSettings` auto-save PUTs the whole settings object, so per-key filtering (drop, don't 403) is likely the friendlier server behaviour once more than one role can write — revisit the drop-vs-403 call at that point.
- **Legacy `LeadConvBenchmarks` panel** — kept (feeds Reports color-coding) with dead header stubs removed; could be retired if confirmed unused by Reports.

---

## 10. Session Workflow

- Jeff uploads current file batches (including state doc, coding guide, style guide) at session start
- Claude reads state doc before making any changes — impact analysis before implementation for large features
- Files are delivered as they are generated, not batched at session end (Jeff's standing directive, 26 Aug 2026)
- Updated `ACCELEREP_CURRENT_STATE.md` delivered for manual replacement
- Jeff never makes manual code edits — deploys complete output files via git
- Iterative deploy: dev branch → smoke test → merge to master → production
- UI decisions: Jeff prefers mockup options before implementation to avoid wasted effort
- All files Babel-validated with `@babel/parser` JSX plugin before delivery
