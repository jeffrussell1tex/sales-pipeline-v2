# SESSION_HANDOFF.md

**Session of 31 August 2026 (second session — the roles close-out, the
overwrite path, and the verification tail).** Repo root. Read this first, then
verify every claim in it against the live repo before acting — **including the
claims in this file**.

**Fast staleness check:** does `docs/ACCELEREP_CURRENT_STATE.md` §0.54 contain
the **"Post-commit amendment"** block, and does `docs/ACCELEREP_CODING_GUIDE.md`
§19 carry **"SECOND FACE of the same failure"** in its stale-dist bullet? If
not, you are looking at a copy that predates this handoff. Check section
content, never dates.

---

## 1. What shipped

**Prod roles cleanup: CLOSED, both sides** (morning; commits `92386aa` ignore
rule, `34a3f94` verifiers). The remembered "five of six mirror rows" split
cleanly: Clerk held ONE refused value (`"Sales Rep"` on the live.com user — the
invite label-as-value seed), fixed via the UI, checker re-run clean (7
memberships, 0 findings). The `member` ×4 were mirror-only (column AND frozen
`profile.userType` blob), on UKG test accounts whose Clerk role is ABSENT — so
nobody was 403ing; drift, not breakage. Fixed through the `user-role` UI path
after a single-subject validation (one row changed, three controls held,
network capture, row-level re-read); each save healed both locations. One row
set to Manager was DELIBERATE. Two read-only verifiers now in `scripts/`:
`check-mirror-roles.mjs` (SELECT-only, both role locations, column-spelling
tolerant, exit 1 on findings) and `list-clerk-members.mjs` (full membership
with Clerk identifiers). Finding worth keeping: the roster email and the Clerk
login DIVERGE on the UKG Admin row — the display-name link fallback attached
the yahoo Clerk account to a `jeff.russell@ukg.com` roster row. By design of
the fallback; recorded, not fixed.

**The `.env.clerk-prod` incident, resolved.** A live `sk_live_` key was
committed locally (`93571f4`, message "1", sole file) BEFORE the ignore rule
existed — which is why `check-ignore` stayed silent through a whole red-herring
chase of the gitignore pattern: **ignore rules do not apply to tracked files**.
`git ls-files` (prints it) vs `check-ignore --no-index` (matches) split the
diagnosis in one step. `git reset HEAD~1` dropped the commit; no remote ever
contained it; the key never left the machine; rotation optional. Named adds
only while secrets sit ignored — a reflexive `commit -am` is what created this.

**The leads overwrite path: CLOSED** (afternoon; commit `1ec5640`). The queued
"chips to ownerId" item sat on a live bug: `saveLead` sends `{ id, ...patch }`,
the PUT fed it to a full-row `sanitize()`, and a two-key status change
REPLACED the row — every absent column nulled, masked on screen by the
client's optimistic merge, visible only on reload. The carried-forward "leads
overwrite path" item, located precisely. Fixing the UI first would have armed
it (an honest 19-row pool feeding Auto-assign through a wiping PUT), so the
merge went in first: `sanitize({ ...existing, ...data })` — the users.mjs
mergeForUpdate pattern minus the blob flatten — with `ownerIdForUpdate` still
fed the RAW body so 18b13's mentioned-assignedTo detection survives. Held
closed three ways: the integration pair (partial PUT preserves nine fields;
explicit null still clears), a source-assertion guard in
`tests/partial-sanitize.test.mjs` (the harness runs UNIT suites only, so the
rule is pinned where it can see it), and harness mutation #86 (simulated
caught before delivery, CAUGHT on the real tree).

**Unassigned-ness keys on `ownerId`** everywhere it is a predicate: both
chips, both filters, the triage lane, the Distribute pool/count, the subtitle
(previously `!l.assignee`, undercounting 6 vs 19). Distribute load bars count
`l.ownerId === id` from a `reps` `{id, name}` roster (settings.users carries
the usr_ id in every role's read). Assignment payloads stay NAME-keyed on
purpose — the server resolves and 409s ambiguity. The `!lead.assignee` DISPLAY
sites were left alone: owner-set/name-null rows exist, and a predicate swap
there renders an avatar with no name.

**Stale-name hygiene: applied.** `scripts/clear-stale-assigned-names.mjs` —
dry-run default; `--apply` demands `--org` AND `--expect=N`, refuses a moved
count, detects column spelling from a sample row, post-verifies by
re-selecting. 13 candidates, all dev-org (ZZFX among them; UKG zero), cleared,
zero remain. Backfilling ownerId FROM names was rejected: name-equality
ownership is the hazard the id migration removed.

**Verified — every claim now OBSERVED:** six gates green (143 tdz) ·
**279 tests** · **33 integration** · **86/86 mutations, printed green
baseline, zero STALE** · build 2,466 kB · hygiene post-verified · both prod
role checkers exit clean · **browser pass on local dev as Admin, matched to
the digit** — All scope 23/3 hot/19 unassigned, chip 19, Distribute 19 with
Karen's bar at her true 4 and zero ghost names anywhere, James Whitmore
assigned to Karen → F5 → assignment, CTO title, notes and $310K all intact,
chip 19→18, bar 4→5 · **dev-deploy smoke on accelerep.netlify.app passed** —
23/18 (shared DB, post-assignment) with the same lead whole through the
deployed bundle. `master` fast-forward is READY and not yet confirmed run —
`git merge --ff-only dev` from master, push, then eyeball UKG's Leads tab on
prod (its data was always ghost-free; no visible change is the pass).

## 2. Errors made this session, recorded

- **The docs outran the observations — committed, this time.** `1ec5640`'s
  Verified-at line claimed the browser pass before it ran; the pass was the
  stated gate and the patches applied anyway. The observations then matched
  to the digit, so the docs happened to be true — verification-after-the-fact,
  not process. The §0.54 amendment records it; the rule stands: observed,
  then written, then committed.
- **A prod tab nearly hosted the browser pass.** The org switcher showed the
  PROD instance's pair ("Dispatch Demo Group" + UKG) and the test almost ran
  against `salespipelinetracker.com`. Read the URL bar and count the orgs
  before any browser verification — now in guide §19.
- **A doc-patch anchor was written from memory and refused.** The §0.54
  closing-paragraph anchor guessed the line wrap instead of reading the file;
  the count-assert refused before any write, twice (the second time because a
  shell-inline edit mangled backticks — heredocs with quoted EOF for script
  edits, never `node -e` with template-adjacent text). Read the destination
  lines FIRST, then write the anchor.
- **A lowercase rep name was typed into the assign prompt** and cancelled
  before OK on the case-sensitivity doubt — the free-text prompt invites
  exactly the ghost class this session cleaned. Finding, not damage.
- **Delivered-vs-placed, four more times** (v2 mirror script ran as the old
  file; the members lister never saved anywhere; a placement-gate count
  predicted wrong and caught by running the gate against the artifact first).
  The gate number is itself a claim about a file; verify the verifier.
- **Paste truncation, repeatedly**: one command per paste when an output is
  load-bearing.

## 3. Observed, recorded, deliberately untouched

**New this session (detail in §0.54 + its amendment):**
- Assign control is a raw `window.prompt` — five call sites, free text into
  name resolution. Replace with a picker fed from the `reps` roster.
- `resolveOwnerId` case-sensitivity UNVERIFIED — read it before trusting
  mixed-case input, and before building the picker.
- "NaNyr ago" in the lead detail Activity timeline — date bug.
- Distribute panel follows the Mine/All scope — Admin-in-Mine sees all-zero
  bars. Consistent by §0.53's design; queued as a UX question.
- Audit `user.updated` events attribute the TARGET as actor (the paired
  `user.role.changed` rows attribute correctly — bug is in users.mjs PUT's
  writeAudit call).
- The settings autosave flood is AUDIT-VISIBLE: ~9 junk `settings.updated`
  events across three role saves. Priority raised.
- The roster "Out of sync with Clerk / Reconcile" button is UNREAD code
  claiming 6-row drift. Do not press before reading.
- The user profile Security card contradicts the list view on MFA/SSO.

**Carried:** dev-org role drift (org_3B8Tg `member` ×2 both locations;
org_3BDQ `smiller` blob-only, self-heals) — five minutes of warm-procedure UI
clicks, `check-mirror-roles` verifies. `documents.mjs` local 500 (do not
diagnose blind). The static-landing flash pass. Everything in the prior
carried list.

## 4. Next — start here

**`master` fast-forward, if not already done** — then the prod eyeball.

**Test debt remains the highest-value item**: `opportunities.mjs` and
`tasks.mjs` have no integration file; the four §0.48 endpoints still have zero
automated rep-role GET coverage. The leads suite is the template (own org
namespace per §18b25, own roster seed, `invalidateRoster()` after seeding).
**Read `opportunities.mjs` PUT for the overwrite shape FIRST** — the guide's
sanitize-then-upsert check has been cashed twice (users, leads) and found an
instance both times; opportunities is the explicit third candidate.

**The assignee picker** is a natural small pass: read `resolveOwnerId` (the
case question), then replace the five `window.prompt` sites with one
module-scope picker component fed from `reps` — which also retires the
free-text ghost risk permanently.

**Then the SettingsTab cleanup pass**, which now holds: audit actor
attribution, the autosave flood, Reconcile (read first), the Security card,
and the original deferred stubs.

## 5. The thread

Two sessions ago the boundary moved to the server; last session it became
policy; this session the write path joined the boundary — a read policy
counting `ownerId` honestly is worthless if the write path wipes the row it
passes through, and the one-line UI item turned out to be gated on an endpoint
fix nobody had queued. The guide's sanitize-then-upsert check is now two for
two; it goes in front of every new suite from here.

And provenance ran through everything, smallest scale yet: a gate count
predicted instead of measured, a file believed saved that no filesystem held,
a silent check-ignore that was a tracked file telling the truth, docs
committed a few hours ahead of the observations that made them true, and a
browser pass nearly run against the wrong product entirely. Every one settled
the same way — read the disk, read the URL bar, run the gate against the
artifact. The verifiers refused four times this session and were right all
four. Trust the refusal; verify the verifier.
