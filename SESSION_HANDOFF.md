# SESSION_HANDOFF.md

**Session of 1–2 September 2026, fourth session (the owed §18b26 bullet
written, the nine stale App.jsx imports dropped, the importer's 9/15/2026
check observed live, unreadable date cells REFUSED at Preview and the
engine's year-2001 default gated — all on dev, then SHIPPED to prod; after the
ship, Clerk's pending-session bypass found, observed and FIXED on dev, then
shipped; the Win / loss report made to read the category it was never
reading; the Activity report made to honour the rep slice; the Reports
audit's §0.68 list fixed through batch 6), FINAL.** Repo
root. Read this first, then verify every claim
in it against the live repo before acting — **including the claims in this
file**.

**Fast staleness check:** does `docs/ACCELEREP_CURRENT_STATE.md` contain
`### 0.76` with a paragraph beginning **"Observed (local, Karen):"**, and
does `docs/ACCELEREP_CODING_GUIDE.md` carry **`## 18b27`** with a bullet
beginning **"Client: gate on"**? If not,
you are looking at a copy that predates this handoff. Check section content,
never dates.

**On dates:** §0.58, §0.59 and the previous handoff say "2 Sep". Git carries
every one of their commits at 1 Sep -0500, the same day as §0.56/§0.57 and
as this session. §0.60 uses the day git records and flags theirs; renaming
their headers is Jeff's call, not done.

---

## 1. What shipped — everything is on `dev`, deploy-verified, observed

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

**Batch 6, the commit this handoff rides in (state §0.76):** the
unreachable print path and its feeders, the hardcoded stage list, the
dead `getRepQuarterQuota` and every inert control removed (356 lines);
the six "Save as my report" buttons save a real report carrying its
`templateId`, a saved card opens its template, Duplicate copies a real
report, Email to owner mails the roster address, the Actions sub-tab has
a nav entry. 5 tests, 5 mutants. Observed locally as Karen (Save → 201,
card opens, Duplicate → 201); two test saved reports left in her dev
library. Deploy check recorded in §4 by a follow-up docs commit.

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

Five gates green on 139 files · **427/427 unit** (5 in
`reports-controls.test.mjs`, 5 in
`stage-order.test.mjs`, 23 in `pipeline-report.test.mjs`, 9 in
`opp-text.test.mjs`, 13 in `report-period.test.mjs`, 15 in
`report-scope.test.mjs`, 15 in `loss-analysis.test.mjs`, 6 in
`session-status.test.mjs`) · **174/174 mutations, printed green baseline**
(61 new this session; run alone) · build
**2,475 kB JS**, `index-BorndMdE.js` (audit batch 6; deploy check pending
at the time this was written; `index-DZcl2imu.js` observed for `7dbfd6e`),
guard OK, `dist/` cleared · **79 integration not
re-run** (`verifyAuth` changed, but the suites mock it — see §5) · **browser
pass as Karen on localhost, Development, Require ON:** the pending session
held at Clerk's MFA setup card and 401 from three endpoints (state §0.65);
earlier the same session, the CSV refusal banner (state §0.64) · dev deploy
observed serving `index-Cy6ZeOFD.js` for `ded3271` · `master` ==
`abb239a`, prod serving `index-kU7R9Yoq.js`, Require MFA ON on both Clerk
instances (see §1) · dev is ahead of master by the report fix and its docs
(state §0.66) · the session's `netlify dev` stopped and `node_modules/.vite`
cleared at close.

## 5. Next — start here

1. **Ritual:** this file, `check:handoff`, `git status`. Expect `dev` and
   `origin/dev` to agree at the handoff commit.
2. **DONE — prod ran `13f9ffe` from the morning ship (now `abb239a`, §1),
   and Jeff observed the profile panel fit on
   the Dispatch Demo Group account** ("the dispatch demo fits"). User-visible on prod: Tasks calendar keys, quarter tabs and report
   cutoffs follow the user's clock; imported US-format close dates become
   real dates; dateless tasks appear in "No due date"; the deal timeline
   labels never read "Invalid Date"; the profile panel fits a two-org
   account with a long org name (Jeff's original prod report).
3. **Still unobserved:** as Admin after 7pm Central, a coaching note carries
   today's date (Jeff: "I will have to check the time tonight"). **The CSV
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
   leaves in the URL is inert; noted. (c) `catalogue.js`'s MFA entry still
   hardcodes "Optional · not all enrolled" / "3 months ago". (d) DONE — shipped, and Require is ON for Production (Jeff: "worked in
   production"). (e) Integration suites
   mock `verifyAuth`, so the `sts` refusal is covered by unit + mutation
   only; the live 401 was observed in the pane AND on the deployed dev site
   (Jeff's un-refreshed Admin tab showed the server message verbatim).
   (f) **Carried:** `checkOk` in App.jsx sets `dbOffline` on any non-ok
   response, so that 401 rendered as "Database connection lost" — an auth
   refusal reported as a database outage (state §0.65, last paragraph).
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
   is DONE — state §0.76.** Next: the tier 2 remainder in §0.68 — labels
   and captions that name a period the figure does not use, the 12-of-N
   truncations without a count, and whatever the ground-truth pass left
   unticked; then ship dev → prod (prod is at `abb239a`, before every
   report fix — Jeff eyeballs the reports on dev first). §0.68's line
   numbers have shifted; grep, don't trust them.
11. Smaller carried: the
   opportunities Manager `managedReps` branch stays name-based by intent;
   picker-format replication as surfaces get touched.
12. Session quirks: inline `node -e` and Bash heredocs mangled `\\` in
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

## 6. The thread

A session that began by writing one owed sentence into the guide ended with
multi-factor authentication enforced in production. Between: the importer
stopped passing unreadable dates through, and the probe written to prove it
found the engine turning "Sept 15" into a day in 2001; a screenshot of a
Clerk toggle led to the app walking past a pending session on both the
client and the API; Jeff flipped Require on Development, signed in, watched
the bypass, and an hour later watched the fix hold him at the task card —
then did it again on prod. Two prod ships, each verified by bundle hash. The
handoff was corrupted twice by edit scripts and restored from git both times
before anything was committed. Observed, then written, then committed, and
re-read from disk between every step.
