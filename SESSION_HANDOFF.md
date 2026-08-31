# SESSION_HANDOFF.md

**Session of 31 August 2026 (third session — the seventh gate, CLAUDE.md,
the CI blind spot, and the doc-ordering rule), FINAL.** Repo root. Read this
first, then verify every claim in it against the live repo before acting —
**including the claims in this file**.

**Fast staleness check:** does `docs/ACCELEREP_CURRENT_STATE.md` contain a
`### 0.55` section whose overwrite audit reads **"FOUR for four"**, and does
`docs/ACCELEREP_CODING_GUIDE.md` §22 carry the subsection **"Doc changes
land when they are known"**? If not, you are looking at a copy that predates
this handoff. Check section content, never dates.

---

## 1. What shipped

**A docs-and-process session; no endpoint code changed.** Eleven commits on
`dev` at write time — nine from the working session (`695c97a` → `bd06bb2`)
plus the two doc commits this handoff follows (`887a595` state §0.55,
`679974b` guide entries; this file's own commit lands after both copies are
verified identical).

**The prior session's tail, closed first.** The UKG prod Leads-tab eyeball
PASSED (no visible change — the pass condition). The docs-only `master`
fast-forward was found ALREADY DONE: `9c03db7` verified on `master` via
`git branch -a --contains`. The previous session's closing lesson ("when git
says nothing to commit, consider that it might simply be true") paid out on
its first morning.

**THE SEVENTH GATE, end to end** (`06ddbe1`, completed by `02c663a` /
`9c373fb` / `4b044a7`). The handoff dual-copy pair had drifted a THIRD time
— the FINAL rewrite existed only in the uncommitted root copy while `docs/`
on `master` carried the pre-FINAL draft. Synced and committed (`695c97a`),
then the queued candidate fix became real: `scripts/check-handoff.mjs`
byte-compares the root and `docs/` copies, classifies EOL vs whitespace vs
content divergence, names the first differing line, and takes two positional
paths for fixture mode. Wired: `package.json` `check:handoff`, guide §19
("run all seven" + history note), CI gates-job step between dbfetch and
build. Proven: four committed fixtures, three behavioral tests, meta-test
registration — 279 → **282** unit tests.

**The §0.54 amendment had never actually run.** `patch-state-054-shipped.mjs`
existed but had never executed with `--apply`; the state doc lacked the
"Shipping status at close" block the FINAL handoff's staleness fingerprint
demanded — the fingerprint check catching exactly what it was built to
catch. Applied, verified from disk (8 insertions), committed (`babdf7f`).

**CLAUDE.md created at repo root** (`b526ade` +132 — commit message reads
just "repo"; `b9c6764` +11, the multi-tenancy isolation hard rule).
Standing-rules layer only: session-start ritual, hard rules, the seven-gate
chain, identity/ownership invariants, environment facts. No session state,
deliberately — that lives here, and changes every session.

**The CI unit-job blind spot, FOUND AND FIXED** (`bd06bb2`). The unit job
ran `node --test` with no `npm install`; `scanners.test.mjs` spawns gate
scripts that import `@babel/parser`, so the job died ERR_MODULE_NOT_FOUND
in ~8s on every clean runner — suspected red since the scanner suite landed
(NOT verified against older runs; recorded as suspected). Per-job read on
`4b044a7`: gates ✓, integration ✓, unit ✗ — the green jobs are how the red
runs hid. **`bd06bb2`'s run is OBSERVED all three jobs green** (run
33445015533, read via the Actions API at the start of the doc session —
last session's "check FIRST" item, now fact).

**NEW PROCESS RULE (Jeff's call), now guide §22:** doc changes are applied,
verified from disk, and committed the moment they are known — never queued
as end-of-session patch scripts. The handoff is written LAST, after
everything else is committed, both copies together, `check:handoff` before
the commit. This session's docs were produced under the rule: state doc
committed, guide committed, then this file.

## 2. Errors made this session, recorded

- **The docs claimed a patch had run that never ran** — the §0.54 amendment,
  delivered as an end-of-session script and recorded as applied. The exact
  docs-outran-the-disk class, this time with a delay fuse; caught by the
  staleness fingerprint working. Origin of the doc-ordering rule.
- **A spacing fix was prescribed from paste evidence**; `cat -A` proved the
  file was already correct — the paste channel strips blank lines. The fix
  script ran, changed nothing, was deleted. Formatting complaints need a
  disk read, not a paste read.
- **The fixture commit shipped 3 of 7 files.** git's "ignored by .gitignore"
  hint scrolled past between CRLF warnings; CI went red on `02c663a`.
  Caught by reading the commit STAT, healed next commit. Root cause: the
  unanchored `fixtures/` rule (meant for the repo-root `fixtures/` dir,
  which exists) also swallowed `tests/fixtures/`. Anchored to `/fixtures/`
  (`4b044a7`); lesson in guide §19.
- **Several commands ran with output never reaching the conversation** (the
  gitignore commit, the unit-install apply) — each time git's "nothing to
  commit" was TRUE. Interrogate state before diagnosing messages.
- **The session brief's commit list had the order wrong** — it placed the
  CLAUDE.md commits before the seventh-gate commit; `git log` has the gate
  first (`06ddbe1` → `b526ade` → `b9c6764`). Caught by the verify-the-brief
  pass; the repo won, the discrepancy was flagged, and §0.55 cites true
  order.

## 3. Found, diagnosed, NOT FIXED — next session's opening batch

**The sanitize-then-upsert audit is now FOUR for four** (users and leads
fixed; opportunities and tasks diagnosed, detail in §0.55):

- `opportunities.mjs` single-record PUT (~line 365): raw `sanitize(data)` —
  a partial PUT nulls `opportunityName`/`account`/`salesRep`/`arr`/`notes`,
  wipes `stageHistory` and `comments` to `[]`, resets `pipelineId` to
  `'default'`. The bulk branch above it already uses partialRows; the
  single path does not.
- `tasks.mjs` PUT (~line 102): same shape, plus `completed: d.completed ??
  false` — a partial PUT UN-COMPLETES the task and nulls `completedDate`.

Fix known — the leads pattern: `sanitize({ ...existing, ...data })`. Both
endpoints already fetch `existing` and already feed `ownerIdForUpdate` the
RAW body, so 18b13 survives unchanged. Hold closed the leads way: an
integration pair per endpoint (partial-PUT-preserves + explicit-null-still-
clears), source-assertion guards extending `tests/partial-sanitize.test.mjs`,
mutation entries, and the two missing integration suites
(`opportunities.itest.mjs`, `tasks.itest.mjs` — own org namespaces per
§18b25, wired into `test:int`). **OPEN QUESTION gating severity:** do the
client's `saveOpportunity`/`saveTask` send partial payloads? Read the client
save paths before claiming live impact.

**Carried, unchanged from last session:** the assignee picker (read
`resolveOwnerId` for the case question first; five `window.prompt` sites →
one module-scope picker fed from `reps`); the SettingsTab cleanup pass
(audit actor attribution, autosave flood, the UNREAD Reconcile button, the
Security card); "NaNyr ago" in the lead Activity timeline; the
Distribute-follows-Mine/All UX question; dev-org role drift (org_3B8Tg
`member` ×2, org_3BDQ `smiller` blob-only); `documents.mjs` local 500 (do
not diagnose blind); the static-landing flash; zero automated rep-role GET
coverage on the four §0.48 endpoints.

## 4. Verified state at close

Seven gates green (`check:handoff`: "identical" — byte count is of the
PREVIOUS handoff; this file changes it) · build 2,466 kB, bundle guard OK ·
**282/282 unit** (re-run before each doc commit today) · CI: gates +
integration green all day, **all three jobs green on `bd06bb2`** (observed)
· Netlify dev deploys green · prod untouched since the morning docs
fast-forward — everything today went to `dev` only.

**NOT run today, recorded as such, not implied:** `npm run test:int` (last
observed 33/33, §0.54 close) and the mutation harness (last observed 86/86,
green baseline) — nothing endpoint-side changed. The next session that
touches an endpoint runs both.

## 5. Next — start here

1. **Session ritual:** this file, `check:handoff`, `git status`. Then check
   the Actions run for the handoff commit itself.
2. **The overwrite batch** (§3 above) — read the client save paths FIRST to
   settle the severity question, then fix opportunities and tasks the leads
   way, then the hold-closed set. This was the highest-value item two
   sessions running; it is now fully diagnosed and has nowhere left to hide.
3. The assignee picker rides naturally behind it (same files, same roster).

## 6. The thread

Last session the write path joined the boundary; this session the DOCS
joined the verification chain. The handoff pair had drifted three times in
two days on memory and good intentions — now a gate byte-compares it, CI
runs the gate, fixtures prove the gate, and a meta-test proves the fixtures
are registered. The same day exposed the inverse hole: the unit job in CI
had likely been red for days and nobody read past the run badge, because a
blind spot in the checker looks exactly like noise in the checked. And the
doc-ordering rule closes the loop the §0.54 amendment opened — a doc queued
is a doc lying about the future. The system's shape at close: every claim
either has a gate, or is labeled with the date it was last observed. The
two endpoints still wiping rows on partial PUTs are diagnosed, not fixed —
and the diagnosis is committed, which is the only place a diagnosis counts.
