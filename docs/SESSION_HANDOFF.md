# SESSION_HANDOFF.md

**Session of 1 September 2026, third session (the date-pattern audit becomes
the read side of the date contract, the lost isoLocal queue is found and
swept, the bundle hash exposes ten unmounted components and they are
deleted, Jeff's verification finds the label beside the sort and a task no
list could show, the profile panel stops overflowing — all shipped to dev
and observed), FINAL.** Repo root. Read this first, then verify every claim
in it against the live repo before acting — **including the claims in this
file**.

**Fast staleness check:** does `docs/ACCELEREP_CURRENT_STATE.md` contain
`### 0.62` with a paragraph beginning **"Dev landing, observed by Jeff"**,
and does `docs/ACCELEREP_CODING_GUIDE.md` carry **`## 18b26`** with a bullet
beginning **"A bug is live only in a component that is MOUNTED"**? If not,
you are looking at a copy that predates this handoff. Check section content,
never dates.

**On dates:** §0.58, §0.59 and the previous handoff say "2 Sep". Git carries
every one of their commits at 1 Sep -0500, the same day as §0.56/§0.57 and
as this session. §0.60 uses the day git records and flags theirs; renaming
their headers is Jeff's call, not done.

---

## 1. What shipped — everything is on `dev`, deploy-verified, observed

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

## 4. Verified state at close (all observed 1 Sep, third session)

Five gates green on 133 files · **317/317 unit** · **105/105 mutations,
printed green baseline** (run alone after every source change) · build
**2,482 kB JS**, guard OK, `dist/` and `node_modules/.vite` cleared · **79
integration not re-run** (no endpoint changed all session) · `dev` ==
`origin/dev`; `master` == `13f9ffe` (one docs commit behind dev after this
ship note) · panel wrap observed in the
pane with an injected 220px chip (Sign out y 102 → 164, no overflow).

## 5. Next — start here

1. **Ritual:** this file, `check:handoff`, `git status`. Expect `dev` and
   `origin/dev` to agree at the handoff commit.
2. **DONE — prod runs `13f9ffe`, and Jeff observed the profile panel fit on
   the Dispatch Demo Group account** ("the dispatch demo fits"). User-visible on prod: Tasks calendar keys, quarter tabs and report
   cutoffs follow the user's clock; imported US-format close dates become
   real dates; dateless tasks appear in "No due date"; the deal timeline
   labels never read "Invalid Date"; the profile panel fits a two-org
   account with a long org name (Jeff's original prod report).
3. **Still unobserved:** as Admin after 7pm Central, a coaching note carries
   today's date; as Admin, a CSV with a `9/15/2026` close date imports as
   `2026-09-15`. Both hold by unit test; neither has been seen live.
4. **DONE (fourth session, 1 Sep):** the guide bullet owed from §3 — "grep
   the FILE for every other reader of the value" — is now the closing bullet
   of §18b26; state doc §0.62 no longer says "not yet written".
5. **Open question from the importer:** an unrecognisable date cell passes
   through as written; 18b16 says report it — refuse or flag at Preview.
6. Cosmetic: App.jsx still carries stale default imports for components
   that ARE rendered elsewhere (CsvImportModal, LeadImportModal,
   OutlookImportModal, LostReasonModal, OpportunityModal, UserModal,
   FunnelView, KanbanView, QuotaRepCard).
7. Smaller carried: the MFA known-ON green dot (still unsighted); the
   opportunities Manager `managedReps` branch stays name-based by intent;
   picker-format replication as surfaces get touched.
8. Session quirks: inline `node -e` and Bash heredocs mangled `\\` in
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

A one-line queue item — "~20 sites" — was off sevenfold, and counting it
turned an audit into two rules, a rewrite of the importer, a sweep a lost
list had been waiting on for weeks, and four thousand lines of code no user
had seen. Then Jeff ran the checks and found the label beside the sort in
one screenshot and a task no list could show in the next; both fixed and
shipped within the hour, and the panel he reported on prod fixed with them.
Observed, then written, then committed, in that order, including the
corrections — three of them this time.
