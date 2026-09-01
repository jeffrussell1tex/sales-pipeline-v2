# SESSION_HANDOFF.md

**Session of 1 September 2026, third session (the date-pattern audit becomes
the read side of the date contract, the lost isoLocal queue is found and
swept, the bundle hash exposes ten unmounted components and they are
deleted, dev is shipped, and the Karen pass runs), FINAL.** Repo root. Read
this first, then verify every claim in it against the live repo before
acting — **including the claims in this file**.

**Fast staleness check:** does `docs/ACCELEREP_CURRENT_STATE.md` contain
`### 0.61` with a paragraph beginning **"Browser pass, Karen on localhost"**,
and does `docs/ACCELEREP_CODING_GUIDE.md` carry **`## 18b26`** with a bullet
beginning **"A bug is live only in a component that is MOUNTED"**? If not,
you are looking at a copy that predates this handoff. Check section content,
never dates.

**On dates:** §0.58, §0.59 and the previous handoff say "2 Sep". Git carries
every one of their commits at 1 Sep -0500, the same day as §0.56/§0.57 and
as this session. §0.60 uses the day git records and flags theirs; renaming
their headers is Jeff's call, not done.

---

## 1. What shipped

**Pushed to `dev` and deploy-verified (`c435ee4` → `35c4f12`).** The read
side of the date contract — `parseLocalDate` / `toLocalDay` in
`dateLocal.js`, three live NaN sites fixed (deal-timeline task sort,
ReportsTab speed-to-lead / velocity / `avgDaysForStage`, print `closeDate`),
**the CSV importer normalising Close Date and Created Date** (`9/15/2026`
had landed verbatim and made an Invalid Date of that deal everywhere
downstream), and **the isoLocal sweep** — 45 wall-calendar-day sites built
via `toISOString`, 37 rewritten across 12 files, 8 named exceptions, pinned
by a `src/` scan in `tests/date-local.test.mjs` so the list cannot be lost a
second time (the first list was: 4 of 29 fixed, 24 "triaged into a
handoff" that was overwritten). CI SUCCESS on `7a84aeb`;
accelerep.netlify.app serves `index-Ba_0HcTB.js`, byte-identical to the
local gate build (md5 `e55b7734bcff`).

**Local, UNPUSHED (`0b31842`, `16f0f43`).** Jeff: "lets do 2 and 3." **The
ten unmounted components are DELETED** — ViewingContact/Account/TaskPanel,
Account/Task/ActivityModal, TaskItem, AnalyticsDashboard,
PipelinesSettingsPanel, LeadForm: 4,160 lines plus twelve stale import
lines, every reference re-verified as a comment or nothing; gates green on
133 files, **317/317 unit**, **105/105 mutations, printed green baseline**,
build guard OK at the identical 2,534.93 kB (different hash — fewer imports
reorder Rollup's emission; the unchanged size is the proof the code was
never in the bundle). **The `documents` re-probe is CLOSED:** 401 JSON on
Jeff's fresh `netlify dev`, `leads` 401 as control. **The Karen browser pass
ran** on the post-deletion tree (below). `.claude/launch.json` gains a
`netlify-dev` entry (unused this session — Jeff's own server held 8888).

## 2. The lesson: the hash said what reading did not

After two panel edits the build carried the same hash and byte-identical
content with the edit stashed and applied. A content hash cannot do that
unless the edited code is not in the bundle — and it was not: `TaskItem`,
"fixed as live" an hour earlier, renders nowhere. §0.60 was corrected to
three live sites before the next commit; guide §18b26 now says: a bug is
live only in a component that is MOUNTED — grep for `<Name` outside its own
file before writing "live". Two smaller ones: the scan written to pin the
sweep found two sites the hand count missed on its first run (45, not 43),
and "~20 other call sites" in a queue item was ~140 — count before you
queue.

## 3. The Karen pass — observed and not observed

Pane-driven at 17:13 CDT, UTC still Sep 1: the 7pm rollover the sweep
targets was not active, so the pass verifies RENDERING; the zone edge is
held by the Chicago/Tokyo child processes in the unit suite. **OBSERVED:**
Home "Tuesday, Sep 1"; Tasks "TODAY IS TUE, SEP 1" with the calendar week
strip Sun 30 → Sat 5; Pipeline quarter groups "Q4 2026 · CURRENT · Jul 1 –
Sep 30"; deal modal "DEAL AGE 106d · IN STAGE 11d"; Reports → Leads **"AVG
SPEED-TO-LEAD 157d"** (the fixed `firstTouchDate` path, a number where it
was unguarded); Performance "SALES CYCLE 167d"; zero `NaN`, zero `Invalid
Date`, zero console errors beyond the pre-sign-in 401s. **NOT OBSERVED —
Jeff, on your own screen:** (a) a deal's History timeline after adding a
task WITHOUT a due date to it (none exists in either Karen org; the modal's
tab row sat off-canvas in the narrow pane); (b) as Admin, a coaching note
saved after 7pm Central carries today's date; (c) as Admin, a CSV with a
`9/15/2026` close date imports as `2026-09-15`.

## 4. Verified state at close (all observed 1 Sep, third session)

Five gates green on 133 files · **317/317 unit** · **105/105 mutations,
printed green baseline** · build **2,480 kB JS**, guard OK, `dist/` and
`node_modules/.vite` cleared · **79 integration not re-run** (no endpoint
changed all session) · `dev` **ahead of origin by 2** (`0b31842`,
`16f0f43`) plus this handoff · `master`/prod unchanged — still the
§0.58+§0.59 set.

## 5. Next — start here

1. **Ritual:** this file, `check:handoff`, `git status`. Expect `dev` ahead
   of `origin/dev` by three commits unless Jeff pushed.
2. **Push `dev`** (Jeff's call): CI + deploy marker — expect a NEW hash on
   accelerep.netlify.app (the deletion reordered emission; size unchanged).
3. **The three NOT OBSERVED checks in §3** — two minutes on Jeff's screen.
4. **The `master` fast-forward** when Jeff has lived with the date changes
   and the deletion on dev. User-visible on prod: Tasks calendar keys,
   quarter tabs and report cutoffs follow the user's clock; imported
   US-format close dates become real dates; the timeline sorts dateless
   tasks.
5. **Open question from the importer:** an unrecognisable date cell passes
   through as written. 18b16 says a value the importer cannot use should be
   reported, not carried — refuse or flag it at Preview.
6. Cosmetic: App.jsx still carries stale default imports for components
   that ARE rendered elsewhere (CsvImportModal, LeadImportModal,
   OutlookImportModal, LostReasonModal, OpportunityModal, UserModal,
   FunnelView, KanbanView, QuotaRepCard) — dead imports of live files.
7. Smaller carried: the MFA known-ON green dot (still unsighted); the
   opportunities Manager `managedReps` branch stays name-based by intent;
   picker-format replication as surfaces get touched.
8. Session quirks: inline `node -e` and Bash heredocs mangled `\\` in
   regexes three times — write scripts with the Write tool and run the file;
   a scratchpad script cannot resolve the repo's packages — copy it into
   the repo root, run, delete (tree checked clean after); `mutate-import`
   still runs alone; the Browser pane is ~620px wide and the deal modal's
   tab row is off-canvas there.

## 6. The thread

A one-line queue item — "audit the `+'T12:00:00'` pattern, ~20 sites" — was
off sevenfold, and counting it turned an audit into two rules, one rewrite
of the importer, a sweep that a lost list had been waiting on for weeks, and
four thousand lines of code no user had seen, found not by reading but by a
hash that refused to change. Every fix was pinned before the next was
started, and the pins paid immediately. Then the session corrected its own
record twice — three live sites, not four; 45, not 43 — before anything was
pushed. Observed, then written, then committed, in that order, including
the corrections.
