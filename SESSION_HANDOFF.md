# SESSION_HANDOFF.md

**Session of 1 September 2026, third session (the date-pattern audit becomes
the read side of the date contract, the lost isoLocal queue is found and
swept, and the bundle hash exposes ten unmounted components), FINAL.** Repo
root. Read this first, then verify every claim in it against the live repo
before acting — **including the claims in this file**.

**Fast staleness check:** does `docs/ACCELEREP_CURRENT_STATE.md` contain
`### 0.60` with a paragraph beginning **"Found by the hash, not by
reading"**, and does `docs/ACCELEREP_CODING_GUIDE.md` carry **`## 18b26`**
with a bullet beginning **"A bug is live only in a component that is
MOUNTED"**? If not, you are looking at a copy that predates this handoff.
Check section content, never dates.

**On dates:** §0.58, §0.59 and the previous handoff say "2 Sep". Git carries
every one of their commits at 1 Sep -0500, the same day as §0.56/§0.57 and
as this session. §0.60 uses the day git records and flags theirs; renaming
their headers is Jeff's call, not done.

---

## 1. What shipped — three commits, PUSHED to dev and deploy-verified

**`c435ee4` — the read side of the date contract.** The §0.59 audit item
("~20 other call sites") was run by reading every site: the `+'T12:00:00'`
shape is at ~140 sites, not ~20. The schema settles them — every column they
read is a `varchar(20)` date-only string EXCEPT `leads.convertedAt` /
`firstTouchDate` (`varchar(30)`, client values unvalidated) and the fallback
chains that mix a date-only field with a `createdAt` timestamp. Fixed: the
deal-timeline task sort in `OpportunityModal` (`createdAt` noon-appended into
NaN; `completedAt` in that chain is not a tasks column), ReportsTab
speed-to-lead / velocity and `avgDaysForStage` (`changedAt` has never been
written by anything) and the print `closeDate`, and TaskItem's `Due:` —
which the next commit found to be UNMOUNTED. `dateLocal.js` gains
`parseLocalDate` (day → local noon, instant → as-is, null never an Invalid
Date) and `toLocalDay` (a CSV cell → `yyyy-mm-dd`; ISO and US forms decoded
by hand, 2/30 refused, digit runs refused). **The CSV importer passed Close
Date and Created Date through as written** — `9/15/2026` landed verbatim and
made an Invalid Date of that deal everywhere downstream (never-stale, undated
quarter); `importRows.js` now normalises both, unrecognisable cells still
pass through unchanged (refusing at Preview is the open question). The ~130
correct `+'T12:00:00'` sites are deliberately NOT churned; guide **§18b26** is
the rule for new code.

**`75bc7b1` — the isoLocal sweep.** The earlier isoLocal batch fixed 4 of 29
`toISOString` local-day sites and "triaged 24 into the handoff" — a handoff
since overwritten, so the list vanished and the two sites it named as worst
stayed live. 45 sites today (43 by hand; the new scan found two more on its
first run), 37 rewritten to `isoLocal`/`todayLocal` across 12 files:
SalesManagerTab coaching notes (STORED tomorrow's date after 7pm Central),
QuickLogFab, OutlookImportModal, App.jsx reminders, TasksTab calendar keys
(`setHours(0)` then `toISOString` — the previous day ALL DAY east of UTC),
PipelineTab, ListView, useCalendarState, nine ReportsTab cutoffs. Eight named
exceptions remain (five export filenames, `stageClock.backdate`, the
`dateLocal.js` header). **`tests/date-local.test.mjs` now scans `src/`** so
the list cannot be lost a second time, with a self-check that the scan still
matches the shape it guards.

## 2. The lesson: the hash said what reading did not

After the two panel edits the build carried the SAME chunk hash and
byte-identical content — md5 `e55b7734bcff` with the edit stashed and with
it applied. A content hash cannot do that unless the edited code is not in
the bundle. It is not: **ten components are imported by App.jsx and rendered
nowhere** — the three Viewing panels, Account/Task/Activity modals, TaskItem,
AnalyticsDashboard, PipelinesSettingsPanel, LeadForm — 4,160 lines that
Rollup tree-shakes, that the gates still scan, and that this session "fixed"
(TaskItem) before checking it was mounted. §0.60 is corrected to three live
sites, guide §18b26 gains the mounted-component rule, and **a background-task
chip exists for the deletion** (Jeff's call: the files carry "replaced by
…Rail" comments in ModalLayer, and nothing else references them).

## 3. Found and flagged, not changed

- The day labels (above). The `**Updated:**` header line was already right.
- App.jsx also carries stale default imports for components that ARE
  rendered elsewhere (CsvImportModal, the import modals, LostReasonModal,
  OpportunityModal, UserModal, FunnelView, KanbanView, QuotaRepCard) — dead
  imports, live files; cosmetic, rides the deletion chip.
- TaskItem.jsx is LF in a CRLF tree (pre-existing; git warns on touch).
- `master` is two docs-only commits behind `dev` from the previous session
  (`d4a26b8`, `56df8e2`) plus today's two — no code difference until today's
  are pushed.

## 4. Verified state at close (all observed 1 Sep, third session)

Five gates green · **317/317 unit** (301 → 315 → 317) · **105/105
mutations, printed green baseline** (99 → 104 → 105; every new entry caught
on first run) · build **2,480 kB JS**, guard OK, `dist/` AND
`node_modules/.vite` cleared after every gate build · **79 integration not
re-run** — no endpoint changed (`importRows.js` is client-side; the server
`sanitize()` paths are untouched) · no browser pass this session (no dev
server was running; Jeff signs in) · `dev` is **ahead of origin by 2**;
then PUSHED after the handoff was written: CI SUCCESS on `7a84aeb`, accelerep.netlify.app serving `index-Ba_0HcTB.js`, byte-identical to the local gate build (md5 `e55b7734bcff`).

## 5. Next — start here

1. **Ritual:** this file, `check:handoff`, `git status`. `dev` and
   `origin/dev` should agree at the ship-note docs commit.
2. **The `master` fast-forward** when Jeff has lived with it on dev (prod
   still runs the pre-§0.60 set). The behavioural changes users can
   notice: the Tasks calendar day keys, quarter tabs and report cutoffs now
   follow the user's clock rather than UTC; imported US-format close dates
   become real dates.
3. **Browser pass, queued (Karen + Admin, after the next `netlify dev`
   restart):** the deal timeline sorts tasks without due dates; a coaching
   note saved after 7pm Central carries today's date; the Tasks calendar
   "Today" column matches the wall clock; a CSV with `9/15/2026` close dates
   imports as `2026-09-15`. Same restart: **re-probe `documents`** (expect
   401 — the last unverified inch of the R2 dependency fix; no server was up
   this session so it is still open).
4. **The deletion chip** for the ten unmounted components — one click, its
   own worktree, then the full chain; expect the bundle hash unchanged.
5. **Open question from the importer:** an unrecognisable date cell passes
   through as written. 18b16 says a value the importer cannot use should be
   reported, not carried — refuse or flag it at Preview.
6. Smaller carried: the MFA known-ON green dot (still unsighted — enrol a
   second factor on an account to light it); the opportunities Manager
   `managedReps` branch stays name-based by documented intent; picker-format
   replication as surfaces get touched.
7. Session quirks: an inline `node -e` or a Bash heredoc mangled `\\` in a
   regex twice — write scripts to the scratchpad with the Write tool and run
   the file. `mutate-import` still must run alone (it rewrites source
   mid-run; never alongside a build).

## 6. The thread

A one-line queue item — "audit the `+'T12:00:00'` pattern, ~20 sites" — was
off by sevenfold, and counting it was what turned an audit into two rules
(read a date the way it was written; a triage list lives in a test, never
only in a handoff). Every fix was pinned before the next was started, and
the pin paid immediately: the scan written to hold the sweep found two sites
the hand count had missed on its first run, and the bundle hash — not any
reading — exposed four thousand lines of code no user has seen. The session
then corrected its own record rather than let "four live sites" stand.
Observed, then written, then committed, in that order, including the
correction.
