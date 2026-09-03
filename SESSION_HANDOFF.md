# SESSION_HANDOFF.md

**Session of 1–2 September 2026, fourth session (the owed §18b26 bullet
written, the nine stale App.jsx imports dropped, the importer's 9/15/2026
check observed live, unreadable date cells REFUSED at Preview and the
engine's year-2001 default gated — all on dev, then SHIPPED to prod; after the
ship, Clerk's pending-session bypass found, observed and FIXED on dev, then
shipped; the Win / loss report made to read the category it was never
reading; the Activity report made to honour the rep slice; the Reports
audit's §0.68 list fixed through batch 7, then SHIPPED to prod; the 401
banner and the MFA catalogue card made honest; every native confirm/prompt
replaced by house dialogs and coaching notes persisted; guide §18b28
written), FINAL.** Repo
root. Read this first, then verify every claim
in it against the live repo before acting — **including the claims in this
file**.

**Fast staleness check:** does `docs/ACCELEREP_CURRENT_STATE.md` contain
`### 0.79` with a paragraph beginning **"Native dialogs replaced:"**, and
does `docs/ACCELEREP_CODING_GUIDE.md` carry **`## 18b28`** with a bullet
beginning **"Never `window.confirm`"**? If not,
you are looking at a copy that predates this handoff. Check section content,
never dates.

**On dates:** §0.58, §0.59 and the previous handoff say "2 Sep". Git carries
every one of their commits at 1 Sep -0500, the same day as §0.56/§0.57 and
as this session. §0.60 uses the day git records and flags theirs; renaming
their headers is Jeff's call, not done.

---

## 1. What shipped — everything is on `dev`, deploy-verified, observed

**Fifth session (3 Sep) — SHIPPED TO PROD as the sixth ship (Jeff: "ship to
production"): `master` fast-forwarded `d513b0e` → `bdb0f3c`,
salespipelinetracker.com serves `index-CIR6aj2A.js` (20 seconds after the
push, `pk_live_` inlined, all four new strings present, the coaching-notes
function 401 unauthenticated); state §0.82 last paragraph. Left for Jeff on
prod: the Admin "Import N legacy notes" button, once.** Third batch:
`aef4b4b` (coaching notes addressed to people or a team, their own table),
state §0.82; docs `38b7d55`. Deploy-verified: accelerep.netlify.app served
`index-Kg6gw2rZ.js` 41 seconds after the push; the deployed
`coaching-notes` function answers 401 unauthenticated. **The DDL is in both
databases already.** **OBSERVED by Jeff as Admin and as Karen (3 Sep):
"all cleared and worked as planned"** — dialog, listing, legacy import,
Home block, bell, Mark read (state §0.82, last paragraph). Second batch:
`59212ec` (the Settings catalogue and its panel headers carry no invented
text; Workspace Health counts only what it can read), state §0.81; docs
`6bb4d49`. Deploy-verified: accelerep.netlify.app served
`index-CsUn53YS.js` (the local gate build's hash) 20 seconds after the
push. **OBSERVED by Jeff as Admin (3 Sep): footers empty except MFA,
Workspace Health accurate, Webhooks accurate, Pipelines header without
"Last edited"** (state §0.81, last paragraph). First batch: `1e15e45`
(Sales Manager header on the org's fiscal quarter, weeks remaining never
0) and `327ce8f` (totals quarter-to-date, Administration bar FY-to-date,
three inert header buttons removed), state §0.80; docs `b673aa2`,
`49ca620`. Deploy-verified: accelerep.netlify.app served
`index-ByAdikgx.js` (the local gate build's hash) 21 seconds after the
push. **OBSERVED by Jeff as Admin (3 Sep): header, Forecast and
Administration all good** (state §0.80, last paragraph). Not yet shipped
to prod; prod stays at `d513b0e` — the ship is Jeff's call.

**Fourth session, on top of everything below:** `410095e` (the owed guide
bullet, docs only); `7f14eb3` (nine unused default imports removed from
App.jsx, state §0.63; deploy-verified, accelerep.netlify.app served
`index-wHucaxGK.js`); `aa82d21` (the 9/15/2026 CSV check observed live);
and the commit this handoff rides in — **unreadable date cells refused at
Preview and the engine's year-2001 default gated** (state §0.64, guide
§18b26's last bullet) — `51202b4`, **deploy-verified:** accelerep.netlify.app
serves `index-Bpb-wphy.js`, the local gate build's hash. **PROD SHIPPED
(Jeff):** `master` fast-forwarded `13f9ffe` → `d078c8f`;
salespipelinetracker.com serves `index-DvbBtbWW.js`, `pk_live_` inlined,
refusal string and year gate present, same byte size as dev's bundle (state
§0.64). The session began the evening of 1 Sep and finished 2 Sep.

**After the prod ship — the pending-session bypass, FIXED on dev (state
§0.65, guide §18b27), the commit this handoff rides in.** Jeff turned on
Clerk's "Require multi-factor authentication" for the Development instance
and a fresh Karen sign-in loaded straight through: `App.jsx` gated on
`useUser().user` (populated while pending) and `verifyAuth` never read the
token's `sts`. Now the app trusts the user only while `useAuth().isSignedIn`,
and `pendingSessionRefusal` 401s any non-active `sts` before the user lookup
and the cache. Observed on the same pending session: Clerk's "Set up two-step
verification" card where the app used to render, and 401 from three endpoints
where one had answered 200. MfaDetail rewritten honest. `ded3271`,
**deploy-verified:** accelerep.netlify.app serves `index-Cy6ZeOFD.js`, the local
gate build's hash, refusal string present. **PROD SHIPPED (Jeff: "lets ship
dev to prod"):** `master` fast-forwarded `d078c8f` → `abb239a`,
salespipelinetracker.com serves `index-kU7R9Yoq.js`, `pk_live_` inlined, panel
copy present, same byte size as dev (state §0.65). The server refusal was
not probed on prod (needs a pending prod token). **Require multi-factor
authentication is now ON for Production too** (Jeff: "worked in
production"). Every prod user without a second factor is held at Clerk's
setup card on their next sign-in — expected, and the point.

**After the second ship — the Win / loss report (state §0.66), the commit
this handoff rides in.** Jeff marked four deals Closed Lost with a category
and the report said "Other · 5 · 100%" and "No stage history data": it read
the free-text notes instead of `lostCategory`, and the closing history
entry's own stage instead of its `prevStage`. Eight readers in ReportsTab now
go through `src/utils/lossAnalysis.js`; 15 tests on the five real rows, six
mutants. `7c6a432`, **deploy-verified:** accelerep.netlify.app serves
`index-CzGO2ggA.js`, the local gate build's hash. `master` does NOT have
it — ship dev to prod when Jeff has eyeballed the report.

**Then the Activity report (state §0.67), the commit this handoff rides in:**
the Rep / Team / Territory slice was applied to opportunities and never to
activities, so "Total activities" read 23 for every rep. `reportsActivities`
now comes from `sliceActivities` in `src/utils/reportScope.js`; ten tests,
four mutants. `e39c57d`, **deploy-verified:** accelerep.netlify.app serves
`index-Dv_RGDzl.js`, the local gate build's hash. `master` has neither
report fix — ship dev to prod once Jeff has eyeballed both.

**Then the audit, top down (Jeff: "please proceed top down") — batch 1, the
commit this handoff rides in (state §0.69):** the four hand-rolled fiscal
builders replaced by `src/utils/reportPeriod.js` on top of `quarters.js`;
FY/Q1–Q4 now the right year under a January start, the comparison baseline
the right year AND the sliced set, "All time" with no fake baseline, instants
read on the local clock. 13 tests under two fiscal starts, 7 mutants.
`939f7a2`, **deploy-verified:** accelerep.netlify.app serves
`index-CprJulHE.js`, the local gate build's hash.

**Batch 2, the commit this handoff rides in (state §0.70):** the
`products.map` crash, the toolbar above the null guard, the contacts array
written into a text column (both paths), the phantom `nextStep(Date)`
reads, and the Actions report storing a Response as data. `src/utils/
oppText.js`, 9 tests, 5 mutants. `d79b888`, **deploy-verified:**
accelerep.netlify.app serves `index-D3lRwa5m.js`, the local gate build's
hash.

**Batch 3, the commit this handoff rides in (state §0.71):** scoping — the
Leads tab sliced, deals-at-risk on the sliced activities, `SavedReportsTab`
and `ActivityHistoryTab` handed the gated sets instead of the raw context
arrays, rep lists in the scorecard / Actions report / history picker
narrowed to the viewer's scope. 5 tests, 5 mutants. `f40b2c1`,
**deploy-verified:** accelerep.netlify.app serves `index-D0ibE8V3.js`, the
local gate build's hash. Open for Jeff: the report's leads gate
drops unassigned leads for non-Admins while the server can serve them.

**Batch 4a, the commit this handoff rides in (state §0.72):** the Pipeline &
Forecast tab's constants — the $175,000 quota replaced by the reps'
configured quotas for the period and slice (and the Performance
leaderboard's quota basis made period-scoped), the fabricated
forecast-accuracy chart replaced by closed-won by completed fiscal quarter,
the 7-day movement built from real won / lost / added / slipped flows, and
the "No next step" flag reading the real column. `src/utils/
pipelineReport.js`, 14 tests, 8 mutants. `d25b894`, **deploy-verified:**
accelerep.netlify.app serves `index-CLXLmsDb.js`, the local gate build's
hash.

**Batch 4b, the commit this handoff rides in (state §0.73):** the last
constants — the Activity tab's 0.91 prior period replaced by real
prior-period activities, "Per rep" and the rhythm grid on the roster in
scope with a five-zero-weekday flag, the win/loss "+3%" and two orphan
"vs previous period" captions removed, the builder preview and the pinned
cards on real numbers. 3 tests, 5 mutants. `33e521b`, **deploy-verified:**
accelerep.netlify.app serves `index-BtwmtTXu.js`, the local gate build's
hash.

**Batch 5a, the commit this handoff rides in (state §0.74):** every
hardcoded stage list on a live path replaced by the org's funnel settings
(else the app defaults) through `src/utils/stageOrder.js`; both funnels
rank a lost deal by the stage it left; the history track reads a won deal
as all stages visited. 5 tests, 5 mutants. `090da10`, **deploy-verified:**
accelerep.netlify.app serves `index-BBGjcEEV.js`, the local gate build's
hash.

**Batch 5b (state §0.75):** cycle time,
recent wins / losses and quarter buckets on closed deals read the real
close day (`closeDayOf` — `wonDate` / `lostDate`, else the stage-change
day), quarters are inclusive day ranges from quarters.js, the scorecard's
attainment history uses each quarter's own quota, and Closed Won now
writes `wonDate`. 6 tests, 6 mutants. `7dbfd6e`, **deploy-verified:**
accelerep.netlify.app serves `index-DZcl2imu.js`, the local gate build's
hash.

**Batch 6 (state §0.76):** the
unreachable print path and its feeders, the hardcoded stage list, the
dead `getRepQuarterQuota` and every inert control removed (356 lines);
the six "Save as my report" buttons save a real report carrying its
`templateId`, a saved card opens its template, Duplicate copies a real
report, Email to owner mails the roster address, the Actions sub-tab has
a nav entry. 5 tests, 5 mutants. Observed locally as Karen (Save → 201,
card opens, Duplicate → 201); two test saved reports left in her dev
library. `9be3fe8`, **deploy-verified:** accelerep.netlify.app serves
`index-BorndMdE.js`, the local gate build's hash.

**Batch 7, the commit this handoff rides in (state §0.77):** the History
tab reads the columns that exist (`completedDate`, `description`,
`author`, `accountId` / `contactId` / `contactIds` / task `contacts`)
and links rows by id, contacts get a derived last touch and recency tier,
"/ mo avg" divides by the real span, "Showing N of N" is the filtered
count, the account glance shows Segment instead of an invented status,
both PDF writers escape user text, territory coverage honours a deal's own
territory and reads industry from the accounts prop, forecast-vs-actual
says quota, the AI builder banner is honest, dead state gone. New
`src/utils/historyFeed.js`, 7 tests, 8 mutants. Observed locally as
Karen on the Beacon Metals account. `e2adc83`, **deploy-verified:**
accelerep.netlify.app serves `index-AW6mOo3m.js`, the local gate build's
hash.

**PROD SHIPPED (Jeff: "looks great - please ship to production"):**
`master` fast-forwarded `abb239a` → `1163eec`, 27 commits (§0.66–§0.77);
salespipelinetracker.com serves `index-Ki3OVxo2.js`, `pk_live_` inlined,
batch 6 and 7 strings present (state §0.77). `master` == `1163eec`; dev
is ahead only by the docs commits. **Jeff eyeballed the Reports tab on
prod: "eyeball work is all confirmed correct."**

**After the ship, the commit this handoff rides in (state §0.78; Jeff:
"fix them both please"):** a 401/403 is no longer reported as a database
outage — `dbStatusOf` in new `src/utils/fetchStatus.js` maps it to an
amber "sign in again" banner, all eight loaders report through it — and
the Settings → Security "Multi-factor auth" tile reads live Clerk
enrolment through AdminView's live-counts fetch instead of hand-typed
"Optional · not all enrolled · 3 months ago". 5 tests, 6 mutants. Not
browser-observed (Admin-only list; the pane is Karen). `71d68e3`,
**deploy-verified:** accelerep.netlify.app serves `index-CSnSB6MZ.js`, the
local gate build's hash. **PROD SHIPPED (Jeff: "ship to prod"):** `master`
fast-forwarded `1163eec` → `d63644f`; salespipelinetracker.com serves
`index-DrRd6S0A.js`, `pk_live_` inlined, the banner copy and "Managed in"
present (state §0.78). `master` == `dev` == `d63644f` at the time of this
commit; dev is ahead only by this docs commit. **Then (state §0.78, last
paragraph; Jeff: "please reword the policy settings dialogue"):** the MFA
panel's callout no longer tells the Admin to turn on Require MFA (on since
§0.65, unreadable by the app); 1 scan, 1 mutant. `b26c74c`,
**deploy-verified:** accelerep.netlify.app serves `index-ylwf4HZI.js`.

**Items 13 + 14, the commit this handoff rides in (state §0.79; Jeff: "do
13 and 14 together as well"):** every native `confirm()` / `prompt()`
under src/ replaced by the house `showConfirm` and a new `showPrompt`
dialog (promptModal in useModalState → App.jsx → ModalLayer); coaching
notes persisted — `coachingNotes` in both halves of settings.mjs and a
Manager may write that key alone. 6 tests, 6 mutants (+1 repointed),
79/79 integration. **Observed afterwards in the pane as Jeff/Admin:** the
house prompt saves a coaching note that survives a reload (PUT 200); the
saved-report × opens the Confirm dialog and Delete removes the card
(DELETE 200) — state §0.79's observed paragraph, which also records the
test note left in the dev org (Jeff: leave it) and the Enter key as
unobserved; Jeff then saved a second note through the house prompt on
the deployed dev site as Admin (a stale tab had shown the old browser
dialog first — hard refresh). CLAUDE.md gained a "Stale local FUNCTION" bullet for the
`.netlify/functions-serve` cache (Jeff: "update the md with the notes").
`147e5f4`, **deploy-verified:** accelerep.netlify.app serves
`index-B0b_2Pd3.js`, the local gate build's hash. **PROD SHIPPED (Jeff:
"ship to prod"):** `master` fast-forwarded `d63644f` → `d513b0e`, eight
commits; salespipelinetracker.com serves `index-C61hseh3.js`, `pk_live_`
inlined, the notice, prompt and confirm strings present (state §0.79).
`master` == `dev` == `d513b0e` at the time of this commit; dev is ahead
only by this docs commit.

**Three pushes, all CI green, all served bundles byte-matched to the local
gate build.** (1) `c435ee4`→`35c4f12`: the read side of the date contract
(`parseLocalDate` / `toLocalDay`), the CSV importer normalising Close and
Created Date, the isoLocal sweep (37 sites, pinned by a `src/` scan).
(2) `0b31842`→`80db3bf`: the ten unmounted components DELETED (4,160 lines),
the `documents` re-probe closed at 401, the Karen pass recorded, the
OpportunityModal date LABELS fixed (§3), and the Tasks list's **"No due
date" section** (Jeff: "do option 1"). (3) `d60fa10`: the profile panel
header wraps instead of overflowing. accelerep.netlify.app serves
`index-Bo6oAQ7_.js`; Jeff's own screenshots of `80db3bf` on dev: "landed
perfect" — the dateless tasks listed, the History label a real date.

**`master`/prod SHIPPED after the handoff was first written** (Jeff: "Lets
push these"): fast-forwarded `d5254b8` → `13f9ffe`, CI SUCCESS,
salespipelinetracker.com serving `index-NO9RJhjS.js` — `pk_live_` inlined,
every marker present, byte-size identical to dev's bundle.

## 2. The lesson: the hash said what reading did not

After two panel edits the build carried the same hash and byte-identical
content with the edit stashed and applied. A content hash cannot do that
unless the edited code is not in the bundle — and it was not: `TaskItem`,
"fixed as live" an hour earlier, rendered nowhere. Ten components were in
that state; all deleted. Guide §18b26: a bug is live only in a component that
is MOUNTED — grep for `<Name` outside its own file before writing "live".
Smaller: the scan written to pin the sweep found two sites the hand count
missed (45, not 43); "~20 other call sites" in a queue item was ~140.

## 3. The lesson Jeff's verification taught

Check (a) — a task with no due date on a deal, then the History tab — showed
the timeline SORTED and the label beside it reading **"Invalid Date"**. Batch
1 fixed the sort at the bottom of the timeline builder and not the `fmtDate`
helper twenty lines above it. Now every date-label helper in the modal reads
through `parseLocalDate`. Not yet in the guide, worth a bullet: when a fix
names a fallback chain, grep the FILE for every other reader of the same
value before calling it fixed. The same check found the dateless task
invisible on the Tasks tab (three buckets keyed on `dueDate`, no home for
none) — now the "No due date" section, oldest first.

## 4. Verified state at close (all observed 2 Sep, fourth session)

Five gates green on 142 files · **446/446 unit** (6 in
`house-dialogs.test.mjs`, 6 in `fetch-status.test.mjs`, 7 in `history-feed.test.mjs`, 5 in `reports-controls.test.mjs`, 5 in
`stage-order.test.mjs`, 23 in `pipeline-report.test.mjs`, 9 in
`opp-text.test.mjs`, 13 in `report-period.test.mjs`, 15 in
`report-scope.test.mjs`, 15 in `loss-analysis.test.mjs`, 6 in
`session-status.test.mjs`) · **195/195 mutations, printed green baseline**
(82 new this session; run alone) · build
**2,479 kB JS**, `index-B0b_2Pd3.js` (items 13/14; dev deploy observed
serving it for `147e5f4`), guard OK, `dist/` cleared · **79/79 integration**
(re-run at §0.79 — settings.mjs changed) · **browser pass as Karen on
localhost, Development, Require ON:** the pending session
held at Clerk's MFA setup card and 401 from three endpoints (state §0.65);
earlier the same session, the CSV refusal banner (state §0.64) · dev deploy
observed serving `index-Cy6ZeOFD.js` for `ded3271` · `master` ==
`d513b0e`, prod serving `index-C61hseh3.js` (fifth ship, §1), Require MFA
ON on both Clerk instances · dev is ahead of master only by the prod-ship
docs commit · the session's `netlify dev` stopped at close (pane server
`1071f888`), `node_modules/.vite` and `dist` cleared after the last gate
build, `.netlify/functions-serve` cleared once mid-session (CLAUDE.md).

## 5. Next — start here

**Next session prep, in order (Jeff: "update the next session prep"):**
- **Ritual first** (item 1), then `git log --oneline origin/master..dev` —
  expect only docs commits after `d513b0e`; anything else is unshipped code
  and a finding.
- **Karen's role: back to User** (Jeff, 2 Sep close: "already done"). She
  was a Manager only to observe the coaching-note Manager path.
- **Item 16 DONE (3 Sep, `1e15e45` + `327ce8f`, state §0.80):** header on
  the fiscal quarter; totals quarter-to-date; Administration board
  FY-to-date; three inert header buttons gone. **OBSERVED by Jeff as
  Admin on deployed dev** — header "Q4 FY2026 · 4 weeks remaining",
  Forecast good, Administration "FY attainment" 9.5% for Karen against
  $1,000,000 while Today reads 27% of her $350K Q4 — the same wins, two
  windows, consistent. Unshipped; prod at `d513b0e`.
- **Item 15 DONE (3 Sep, `59212ec`, state §0.81):** footers gone, statuses
  and attention computed, health tile counts only readable checks, 16
  panel headers' typed "Last edited" removed. **OBSERVED by Jeff as Admin
  on deployed dev:** all four checks good. Unshipped; prod at `d513b0e`.
- **Items 21 and 22 are new** (found reading for 15): four Security / Data
  panels are mockups in depth; the remaining hand-typed card counts and the
  16 never-expiring NEW badges. Both are Jeff's calls before code.
- **Item 17 DONE (3 Sep, `aef4b4b`, state §0.82)** — coaching notes in
  their own table, addressed to people or a team. **The DDL is already in
  BOTH databases** (test and the shared app database), so the code may
  deploy in any order (§18c satisfied). **Jeff eyeballs on deployed dev:**
  as Admin, Sales Manager → Team → "+ Add coaching note" opens the dialog
  and a note to Karen lists with her name; as Karen, Home shows "Notes from
  your manager" unread, the bell counts it, "Mark read" clears both; the
  "Import 2 legacy notes" button moves the two test notes and disappears.
  **OBSERVED by Jeff (3 Sep): "all cleared and worked as planned."**
  **SHIPPED TO PROD (`bdb0f3c`, `index-CIR6aj2A.js`).** Left for Jeff on
  prod: the Admin "Import N legacy notes" button on Sales Manager → Team, once.
- **Items 18 and 19 are new** (found reading for 16): the Forecast ledger's
  Commit is never stored; "Coach →" is inert; Home's quota card is annual
  ÷ 4; the tab has no export at all.
- **Then item 15** (catalogue footers, Workspace Health constants): the
  same honesty class as §0.78; `liveCounts` already carries the MFA
  numbers.
- **Item 17 is a design first**, not code: its own table (guide §18c
  ordering), the two visibility decisions recorded in the item, and the
  team-join date question, answered by Jeff before the schema is written.
- Two test coaching notes sit in the dev org's list by Jeff's choice; the
  saved-reports library is empty.

1. **Ritual:** this file, `check:handoff`, `git status`. Expect `dev` and
   `origin/dev` to agree at the handoff commit.
2. **DONE — prod ran `13f9ffe` from the morning ship (now `abb239a`, §1),
   and Jeff observed the profile panel fit on
   the Dispatch Demo Group account** ("the dispatch demo fits"). User-visible on prod: Tasks calendar keys, quarter tabs and report
   cutoffs follow the user's clock; imported US-format close dates become
   real dates; dateless tasks appear in "No due date"; the deal timeline
   labels never read "Invalid Date"; the profile panel fits a two-org
   account with a long org name (Jeff's original prod report).
3. **OBSERVED (2 Sep, after 7pm Central):** coaching notes saved through
   the house prompt by Jeff and by Karen both carried Sep 2 while UTC was
   3 Sep (state §0.79). Was: **Still unobserved:** as Admin after 7pm Central, a coaching note carries
   today's date (Jeff: "I will have to check the time tonight"). **Half
   observed after 7pm on 2 Sep:** Jeff's Home header read "Good evening,
   Jeff. Wednesday, Sep 2 · Q4 · Week 10" while UTC was already 3 Sep —
   the header's day is local. The note itself is the Sales Manager tab's
   "+ Add coaching note" button, which stamps `date: todayLocal()`
   (SalesManagerTab.jsx ~line 838) — the same local-day helper, so the
   same result is expected; not yet observed. **Found reading that code,
   carried as item 14:** the note is added through the browser's native
   `prompt()` and kept only in `setSettings` — no `dbFetch` follows and
   `settings.mjs` has no `coachingNotes` key in GET or PUT, so a coaching
   note vanishes on refresh (persistent-data rule; guide §18b1). **The CSV
   half is OBSERVED:** Jeff imported `zztest-close-dates.csv`; a read-only
   SELECT shows `9/15/2026` stored as `2026-09-15` and the ISO and
   Excel-datetime rows as expected (state §0.63). The three ZZTest Close
   deals sit in the Development instance's org named "UKG" (not the prod
   UKG — two orgs share the name, one per instance; state §0.65) and are
   still open, Jeff's to delete. The four older ZZTest deals he marked
   Closed Lost are in "Accelerep Test" and saved correctly.
4. **DONE (fourth session, 1 Sep evening):** the guide bullet owed from §3 — "grep
   the FILE for every other reader of the value" — is now the closing bullet
   of §18b26; state doc §0.62 no longer says "not yet written".
5. **DONE (fourth session, Jeff: "refuse option"):** an unrecognisable date
   cell now refuses its row at Preview with the cell named; and the engine's
   year-2001 default for a yearless cell is gated (state §0.64).
6. **DONE (fourth session):** the nine stale App.jsx default imports are
   removed (state §0.63).
7. **DONE — the pending-session bypass is FIXED (state §0.65, guide
   §18b27)** and observed on Development with Require ON. Left for Jeff:
   (a) DONE while committing — Jeff enrolled Karen's authenticator; her MFA
   dot is green ● (1/4), **the known-ON state sighted at last**; the pane
   needs a fresh Karen sign-in (with her second factor) to be useful again.
   (b) DONE — Jeff enrolled SMS MFA through Clerk's task card on the
   deployed dev site and eyeballed the rewritten panel as Admin: 2/4
   enrolled, real per-role rows, no Enforce modal, no Send reminders, no
   factor tiles (state §0.65). The stale `#/tasks/setup-mfa` hash Clerk
   leaves in the URL is inert; noted. (c) DONE — state §0.78: the
   `catalogue.js` MFA entry's hand-typed "Optional · not all enrolled" /
   "3 months ago" is gone; the card reads live Clerk enrolment. (d) DONE — shipped, and Require is ON for Production (Jeff: "worked in
   production"). (e) Integration suites
   mock `verifyAuth`, so the `sts` refusal is covered by unit + mutation
   only; the live 401 was observed in the pane AND on the deployed dev site
   (Jeff's un-refreshed Admin tab showed the server message verbatim).
   (f) **Carried:** `checkOk` in App.jsx sets `dbOffline` on any non-ok
   response, so that 401 rendered as "Database connection lost" — an auth
   refusal reported as a database outage (state §0.65, last paragraph).
   **Jeff, after the prod ship: "401 dbase lost is no longer showing."**
   Expected, not fixed: the client gate (§18b27) stops the app calling the
   API while a session is pending, so the 401 that lit the banner no
   longer happens; `checkOk` (App.jsx line ~399) is unchanged and still
   maps ANY non-ok status to `dbOffline`, so an expired session or a
   revoked user would light it again. **DONE (Jeff: "fix them both
   please") — state §0.78:** `dbStatusOf` maps 401/403 to an amber
   sign-in banner; the red outage banner is for everything else.
8. **DONE (Jeff: "why we lost is important…"):** the Win / loss report
   reads `lostCategory` and the exit stage's `prevStage` (state §0.66).
   **Jeff eyeballs after the deploy, as Admin, Reports → Win / loss
   analysis:** expected Timing 4 · 80%, Competitor 1 · 20%, exit-stage rows
   Qualification 4 and Proposal 1. **Carried from it:** the Performance
   tab's hardcoded stage list (ReportsTab line 78) and the funnel's fallback
   list are not the app's stages.
9. **DONE (Jeff: "activities logged stays the same as I use the filter"):**
   the Activity report honours the Rep / Team / Territory slice (state
   §0.67). **Jeff eyeballs after the deploy, as Admin, Reports → Activity:**
   Total activities must change as the rep changes and "All" restore it.
10. **THE REPORTS AUDIT — nothing fixed yet, Jeff's order to set (state
   §0.68, the triage list).** Six read-only passes over ReportsTab found,
   verified from source: fiscal-period math a year off under the default
   January start and a comparison helper on the opposite convention;
   `comparedOpps` unsliced; a literal $175,000 quota; a forecast-accuracy
   chart that is always 100%; fabricated stage lists that bucket real
   stages as "Prospecting"; the leads tab never sliced; two crashes
   (`products.map` on a text column, toolbar buttons above the null
   guard); a contacts array written into a text column; the Actions report
   storing a Response as data; six "Save as my report" buttons with no
   handler; a report-builder preview made of constants. Recommended order
   is in §0.68. Do not start on it without reading §0.68 first. **Batch 1
   (period + comparison, tier 1 items 1–2) is DONE — state §0.69. Batch 2
   (the crashes, the contacts array write, the Actions fetch, tier 1 items
   13–14) is DONE — state §0.70. Batch 3 (scoping) is DONE — state
   §0.71. Batch 4a (the Pipeline & Forecast constants + the Performance
   quota basis, items 3, 4, 7, 8, and item 6's nextStep) is DONE — state
   §0.72. Batch 4b (the last constants, item 9, the "+3%", item 12, the
   orphan captions) is DONE — state §0.73. Batch 5a (stage lists from the
   org's settings, item 5) is DONE — state §0.74. Batch 5b (close day
   for cycle time and quarters; `wonDate` written) is DONE — state
   §0.75. Batch 6 (dead controls wired or removed, the print path gone)
   is DONE — state §0.76. Batch 7 (the History tab on real columns, PDF
   escaping, honest labels) is DONE — state §0.77; §0.77 lists what was
   left by design. SHIPPED to prod as `1163eec` (§1).** The §0.68 list is
   closed; Jeff eyeballed the Reports tab on prod and confirmed it. The
   401 banner (item 7f) and the MFA card (item 7c) are DONE — state §0.78.
   SHIPPED to prod as `d63644f` (§1); Jeff's screenshot of the Security
   list confirms the tile ("2/4 enrolled · 50%", "Needs attention",
   "Managed in Clerk"). Items 13 and 14 are DONE and observed as Admin —
   state §0.79. SHIPPED to prod as `d513b0e` (§1). The Manager path of
   the coaching note is OBSERVED: Jeff promoted Karen to Manager, signed
   in as her, saved a note, hard-refreshed — "it all works" (state §0.79).
   Karen was set back to User at the session close (Jeff: "already done"). Next: items 15 and 16;
   the coaching-note half of item 3 is now observed too (a note saved
   after 7pm Central carried Sep 2).
11. Smaller carried: the
   opportunities Manager `managedReps` branch stays name-based by intent;
   picker-format replication as surfaces get touched.
12. Session quirks: `netlify dev` caches compiled functions under
   `.netlify/functions-serve`; after many reloads one served a stale
   CommonJS copy ("module is not defined in ES module scope", 500 on every
   call) — stop the server, `rm -rf .netlify/functions-serve`, restart
   (state §0.79). Inline `node -e` and Bash heredocs mangled `\\` in
   regexes — write scripts with the Write tool and run the file; a
   scratchpad script cannot resolve the repo's packages — copy into the repo
   root, run, delete (tree checked clean after); `mutate-import` runs alone
   and never while the Browser pane is being read (it rewrites source under
   HMR); the pane is ~620px wide and the deal modal's tab row is off-canvas
   there — Jeff verifies modal tabs on his own screen. Line endings: the
   worktree is CRLF only because `core.autocrlf=true` — every index blob is
   LF (`git ls-files --eol`), App.jsx included. An edit script must match
   the worktree's CRLF and git normalises on commit; MSYS grep strips CR on
   output, so count endings with Node. Two traps cost this session three
   round trips: a replacement string holding dollar-quote made
   String.replace splice the rest of the file in after the match (use a
   function replacer), and a heredoc turned a doubled backslash into a bare
   CR byte that made git treat the handoff as `-text` and diff it whole.
13. **DONE — state §0.79 (Jeff: "do 13 and 14 together as well"), the
   whole sweep.** Was: **Carried (Jeff, after the prod eyeball): the saved-report delete asks
   through the browser's native `confirm('Delete this report?')`**
   (`ReportsTab.jsx`, the saved-card ✕ handler) — "just gives the windows
   confirmation, not an application look and feel process". The app has a
   house confirmation modal already: `confirmModal` / `setConfirmModal` in
   `useModalState.js`, rendered by `ModalLayer.jsx` with the ⚠ tile and
   `danger` styling, reached through `showConfirm` in the app context.
   Route the report delete through it; ReportsTab reads the context
   already. The same native `confirm()` survives in DocumentRail.jsx,
   DocumentsTab.jsx, EditBrandModal.jsx and PriceBookDetail.jsx (three) —
   same fix, same batch, if Jeff wants the sweep. Jeff deleted the ZZTest
   deals and the two test saved reports himself after the prod eyeball.
14. **DONE — state §0.79.** Was: **Carried (found during item 3): coaching notes do not persist.**
   SalesManagerTab's "+ Add coaching note" takes the text through a native
   `prompt()` and writes `settings.coachingNotes` with `setSettings` only;
   no `dbFetch` follows, and `settings.mjs` neither returns nor merges a
   `coachingNotes` key, so the note is gone on refresh and never reaches
   another Manager. Fix: a house modal for the text (the same
   `confirmModal`-class dialog as item 13, or a small form), then save
   through `settings` PUT with `coachingNotes` added to BOTH the GET
   response and the read-then-merge (CLAUDE.md's `settings.extra` rule),
   org-scoped like every other settings key.
15. **DONE — state §0.81, commit `59212ec` (3 Sep; Jeff: "lets proceed
   with item 15").** `src/utils/settingsCards.js` (pure): `cardStateOf`
   (the card component's enrichment block moved out verbatim + three
   rules: webhooks status/attention from live counts; sso and apps claim
   nothing; ok-with-null-detail → 'none'), `healthChecksOf` (only what
   can be read: MFA fully enrolled / Webhooks / Backups once their fetch
   answered, plus pipeline, team assignment, quote branding — SSO and
   Session policy dropped), `healthSummaryOf` (a sentence naming what
   failed). Catalogue: 48 footer pairs and two `attention:true` removed,
   six no-data cards `status:'none'`. Two shared headers render "Last
   edited" only when both values are real; 16 panels' typed values and
   SsoDetail's "Morgan" removed. 13 tests + 8 mutations (212/212).
   **OBSERVED by Jeff as Admin on deployed dev (3 Sep): footers, health
   tile, Webhooks chip, Pipelines header — all good.** Was: **Carried (Jeff's Security-list screenshot, state §0.78 last
   paragraph): the rest of the Settings catalogue's invented text.** 46
   cards carry hand-typed footers — `updatedAt:'2 months ago'` / `'just
   now'` / `'3 weeks ago'` and an `updatedBy` that never changes — and
   the Workspace Health tile's "N of 8 checks passing" is built from
   `healthChecks` in AdminView.jsx (~line 673) with four constants: "MFA
   enforced" always false (enrolment is live one card over —
   `liveCounts.mfa`), "Backups running" / "Session policy set" / "Quote
   branding configured" always true; its sentence "Set up SSO and enforce
   MFA to reach 90%+" is static. Honest minimum: footers show "Managed in
   X" or nothing (the audit log knows real edit times per entity if a
   footer is wanted), health checks that cannot be read are dropped from
   the denominator, "MFA enforced" becomes "MFA fully enrolled" from
   `liveCounts.mfa`, and the sentence names only the checks that failed.
16. **Header DONE — state §0.80, commit `1e15e45` (3 Sep; Jeff: "All
   quarters showing should run off the fiscal year set in the settings
   area … UKG … fiscal ends on 9/30 so they are currently in Q4").**
   `currentQuarter(fiscalStart)` in quarters.js; the header reads
   "Q4 FY2026 · 4 weeks remaining" for an October year; weeks count today
   and are never 0 (the Gap tile divided by 0 on a quarter's last day).
   **The audit found the totals on NO quarter:** `closedArr` is every
   Closed Won deal ever, `quota` the annual figure (or four quarterlies
   summed); attainment, health score, "Team to quota", the Team cards'
   bar and the Administration board's bar all divide those two.
   **Jeff's decisions (3 Sep): quarter-to-date** — Closed = won in the
   current fiscal quarter by close day (`closeDayInRange`, §0.75), Quota =
   `userQuotaFor(u, 'Qn')` (a quarterly plan's own figure, else annual ÷
   4); the Administration board keeps the annual quota with a
   fiscal-year-to-date bar; **and the header's three inert buttons (This
   quarter / All reps / Export) are removed.** **DONE — commit `327ce8f`,
   state §0.80 second half:** `buildRepStats(…, period)` with `wonInQ` /
   `closeDayInRange` and `userQuotaFor(rep, 'Qn')`; `fyRange` prop into
   AdminTab, both `rWon` sums FY-windowed, column "FY attainment"; the
   quarter block moved above the memo, deps carry `curQ.key`; 13 tests,
   204/204 mutations. Health labels on Forecast / Team / Today change: a
   rep whose wins were all in earlier quarters now reads 0% / AT RISK
   there (the Team tab's win-rate flag stays all-time by design). Was: **Carried (seen in the pane during the §0.79 check): the Sales Manager
   tab's quarter is the CALENDAR quarter.** Header "Team forecast · Q3
   2026 · 4 weeks remaining" beside Home's "Q4 · Week 10" on 2 Sep.
   SalesManagerTab.jsx ~line 769: `qNum = Math.floor(now.getMonth()/3)+1`,
   `qEnd` the calendar quarter's last day, `weeksLeft` from it; no read of
   `fiscalYearStart` anywhere in the file.
17. **DONE — state §0.82, commit `aef4b4b` (3 Sep; Jeff: "lets do item 17
   and then we will ship to prod").** Two decisions taken by Jeff before the
   schema was written: **first day = the team-join date** (new nullable
   `users.team_joined_at`, stamped by users.mjs on a team change, falling
   back to `created_at`), and **the old blob notes migrate through an
   Admin import button** (idempotent). Built: `coaching_notes` table (DDL
   applied to test and app databases first), `_coaching.mjs` (pure
   visibility: author / recipients / Admins for a people note — never
   another manager; team manager + members from their first day for a team
   note), `coaching-notes.mjs` (GET filtered server-side, POST Admin |
   Manager with author stamped from the caller, PUT read, DELETE
   author-or-Admin, legacy POST Admin-only and upsert-on-id),
   `CoachingNoteDialog` with a rep/team picker, the Team tab on the table,
   Home's "Notes from your manager", unread notes in the bell, the
   settings Manager carve-out retired. 16 unit + 8 integration tests, 9
   mutations (218/218). **OBSERVED by Jeff as Admin and as Karen on
   deployed dev (3 Sep): "all cleared and worked as planned."** Was: **Product (Jeff, 2 Sep, after observing §0.79): coaching notes should
   be ADDRESSED — a manager sends a note to a specific person, several
   people, or the whole team.** What exists today, read from code: a
   note is `{ id, rep, text, date, author }` in the org's
   `settings.coachingNotes` blob; it is rendered only on the Sales
   Manager tab's Team view (Admins and Managers), the "rep" is a free-text
   name parsed from "rep: text", and a rep never sees a note written
   about them — there is no recipient, no team, no read state, no
   delivery. The org-wide settings blob is the wrong home for addressed,
   per-person content: it is one JSON column every Admin PUT rewrites,
   and the §0.79 Manager exception is a stopgap for exactly that. Design
   from the first line as its own org-scoped table (guide §18c, additive:
   `coaching_notes` — id, orgId, authorId, recipients (user ids) or
   team, text, date, createdAt, readAt per recipient) with its own
   function and visibility rules (author, Admins, managers of a
   recipient, the recipient), a picker of reps / teams in the house
   prompt instead of a typed name, a rep-side surface (Home "on your
   plate" or a notes panel) and a notification; then migrate the blob's
   existing notes and retire the settings key and the Manager exception.
   **Two decisions from Jeff (2 Sep):** (a) a rep who joins the team
   later sees team notes only from their first day — so a team note is
   resolved against membership at READ time with a date floor, not
   expanded into per-user rows at write time; the table needs the note's
   date and the rep's join date (users.createdAt, or the date they were
   added to the team, which the users row does not record today — the
   team assignment carries no timestamp; decide which before the schema
   is written). (b) Managers cannot see each other's private notes — a
   note addressed to people is visible to its author, its recipients,
   and Admins; NOT to other managers, not even a recipient's own manager
   unless they wrote it. Team notes are visible to the team's members
   (from their first day) and its managers. Not started.
18. **Carried (found reading for item 16, state §0.80): the Forecast
   ledger's editable Commit is never stored.** Clicking a rep's Commit
   cell calls `updateRepField(rep.id, 'commit', n)` → `saveUser` → users
   PUT, and `users.mjs` `sanitize()` carries neither `commit` nor
   `bestCase` in a column or in the profile blob — the typed commit is 0
   again on refresh (persistent-data rule, guide §18b1). `bestCase` is
   never editable anywhere and falls back to 60% of open pipeline. Fix:
   add both to the profile blob in `sanitize()` (additive), and decide
   whether a commit is per quarter (it should be — it is a quarter's
   call, so a key per fiscal quarter, not one number that never resets).
19. **Carried, same read:** the Forecast ledger's per-row "Coach →" button
   has no handler (the batch-6 class; Jeff removed the header's three,
   this one was found after the question was asked). HomeTab's quota card
   is `annualQuota / 4` (HomeTab.jsx ~351) — a quarterly-plan user sees a
   $0 quota there; `userQuotaFor(u, 'Qn')` is the helper — and its
   closed-this-quarter buckets won deals by `forecastedCloseDate`, not
   the close day (§0.75's rule, applied to Reports only so far). **The
   Sales Manager tab has no export:** `exportToCSV` is destructured from
   the context there and never called; the only "Export" was the dead
   header button, now gone (Claude told Jeff the Team/Admin tabs had their
   own working Export when asking about the buttons — that was unverified
   and wrong; corrected the same session).
20. **Product (Jeff, 3 Sep, while eyeballing the Forecast tab): Reports →
   Performance → the single-rep view should have a section listing that
   rep's won and lost deals, with totals.** Not started; not read. What
   exists to build on: the Performance leaderboard already slices by rep
   (`repsForSlice`), `closeDayOf` / `closeDayInRange` give the close day
   and period window, and the History tab (§0.77) lists deals on real
   columns — the list wants the same row shape and the period filter the
   report already carries.
21. **Carried (found reading for item 15, state §0.81 last paragraph):
   four Settings panels are design mockups in depth.** SsoDetail's
   `SEC_SSO` (Okta URLs, "Active · 412 logins / 30d", verified domain
   `acme-corp.com`; the panel saves `settings.ssoConfig`, which nothing
   in sign-in reads); SessionDetail's badge "Strong policy · 8h idle ·
   90-day rotation" (typed; the policy it saves is real); AuditDetail's
   "Streaming to Splunk · 2 alerts triggered today · retention 13 months";
   ImportDetail's whole `DATA_IMPORT` constant (a history by
   `morgan@accelerep.com`, a fake Salesforce file) — the real importer is
   the CSV modal, not this panel. Jeff decides per panel: remove, reduce
   to what is real, or build the feature. Not started.
22. **Carried, same read: the hand-typed card COUNTS and the NEW badges.**
   Where no settings key is read the catalogue's typed detail still
   shows: KPI thresholds "12 KPIs configured", Pain points "23", Customer
   types / Account segments "5 tiers", Industries "14 · 47 sub-types",
   Lead conversion "8 sources configured", Price book "15 products · 3
   bundles", Field-level visibility "6 rules", Fiscal year "Q1 starts Feb
   1" (readable from `fiscalYearStart` — the one clear fix), Company
   profile "Complete"; and the `&& settings?.x` guards fall back to a
   typed count when the key is absent ("18 custom fields", "8 stages", "8
   territories", "5 roles", "4 templates", "3 tiers", "12 holidays"). Each
   needs its panel's settings key read first. The 16 `isNew:true` badges
   never expire (dsp-* are months old). Not started.

## 6. The thread

A session that began by writing one owed sentence into the guide ended with
multi-factor authentication enforced in production. Between: the importer
stopped passing unreadable dates through, and the probe written to prove it
found the engine turning "Sept 15" into a day in 2001; a screenshot of a
Clerk toggle led to the app walking past a pending session on both the
client and the API; Jeff flipped Require on Development, signed in, watched
the bypass, and an hour later watched the fix hold him at the task card —
then did it again on prod. Five prod ships, each verified by bundle hash. The
handoff was corrupted twice by edit scripts and restored from git both times
before anything was committed. Observed, then written, then committed, and
re-read from disk between every step.

The evening ran on Jeff's screenshots. Each one — the MFA panel, the
Security list, the Home header at 7pm, a grey "accelerep.netlify.app says"
box — was read against the code before anything was written, and each
found something the code had been saying that was not true of the product:
a policy the app could not read, footers typed by hand, a browser dialog
where the app owned a modal, notes that vanished on refresh. Seven batches
closed the Reports audit; three more closed the carried items; every one
was gated, mutated, deployed, hash-checked, and the last two were observed
by Jeff signed in as a Manager he had just made. What is left is written
down with what exists and what was decided, and nothing in this file
describes a state that was not seen.
