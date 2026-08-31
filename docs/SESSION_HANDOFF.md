# SESSION_HANDOFF.md

**Session of 31 August 2026 (second session — the roles close-out and the
overwrite path).** Repo root. Read this first, then verify every claim in it
against the live repo before acting — **including the claims in this file**.

**Fast staleness check:** does `docs/ACCELEREP_CURRENT_STATE.md` have **§0.54**,
and does `docs/ACCELEREP_CODING_GUIDE.md` carry the leads-merge addendum in its
mergeForUpdate section ("found its second instance (31 Aug)")? If not, you are
looking at a copy that predates this session. Check section content, never dates.

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

**The leads overwrite path: CLOSED** (afternoon; this batch). The queued
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

**Verified:** six gates green (143 tdz) · **279 tests** · **33 integration** ·
**86/86 mutations, printed green baseline, zero STALE** · build 2,466 kB ·
hygiene post-verified · both prod role checkers exit clean · browser pass as
Admin on local dev (chip/Distribute 19, owned-only load bars, assignment
round-trip surviving reload).

## 2. Errors made this session, recorded

- **Delivered-vs-placed, four more times** — the v2 mirror script (ran the old
  file, caught because the ERROR was the old import), the members lister
  (never saved anywhere; an empty Downloads settled it), and a wrong
  occurrence-count prediction in a placement gate CAUGHT BY RUNNING THE GATE
  AGAINST THE ARTIFACT BEFORE HANDING IT OVER (`getOrganizationMembershipList`
  appears once, not the predicted twice). The gate number must itself be
  verified from the file, not predicted.
- **The gitignore red herring.** Two probes (control match on `.env`, `cat -A`
  showing the appended line clean) chased a pattern problem that never
  existed. The file was TRACKED; check-ignore is silent for tracked paths no
  matter what the pattern says. Probe order lesson: `git ls-files` before
  byte-level forensics when check-ignore is silent.
- **A sequencing instruction was skipped** — the data-fix apply ran before the
  code batch was committed/deployed. Every guard held and the ordering turned
  out not to matter (clearing names makes even the OLD counting honest), but
  it worked by luck of the specific change, not by process.
- **Paste truncation, repeatedly**: multi-command paste blocks dropped the
  last command's output twice and mangled several. One command per paste when
  an output is load-bearing.

## 3. Observed, recorded, deliberately untouched

- **Audit misattribution**: `user.updated` events attribute the TARGET as
  actor; the paired `user.role.changed` events attribute correctly. The bug
  is in the users.mjs PUT's writeAudit call. Cleanup pass.
- **The settings autosave flood is audit-visible**: ~9 junk `settings.updated`
  events across three role saves — the §0.53 useSettings debt now polluting
  the audit trail, not just consoles. Cleanup pass, priority raised.
- **The roster "Out of sync with Clerk / Reconcile" button is UNREAD code**
  claiming 6-row drift (all six rows, including clean ones — it compares more
  than roles). Do not press it before reading it.
- **The user profile Security card contradicts the list view** (MFA on/off,
  SSO configured/not). SettingsTab stub territory.
- **Dev-org role drift remains**: org_3B8Tg `member` ×2 (both locations),
  org_3BDQ `smiller` blob-only (self-heals on next write) plus an
  Admin/Technician blob split on a valid row. Five minutes of UI clicks with
  the proven procedure; `check-mirror-roles` verifies.
- Carried unchanged: `documents.mjs` local 500 (do not diagnose blind); the
  static-landing flash pass; everything in the prior handoff's carried list.

## 4. Next — start here

**Test debt remains the highest-value item**: `opportunities.mjs` and
`tasks.mjs` have no integration file; the four §0.48 endpoints still have zero
automated rep-role GET coverage. The leads suite is the template (own org
namespace per §18b25, own roster seed, `invalidateRoster()` after seeding).
Note: opportunities PUT should be READ for the same overwrite shape before its
suite is written — the guide addendum says check every sanitize-then-upsert
endpoint, and only leads and users have been checked.

**Dev-org role clicks** (five minutes, procedure warm). Then the SettingsTab
cleanup pass has four new tenants: audit actor attribution, the autosave
flood, Reconcile (read first), the Security card.

**Merge discipline**: dev deploy → smoke on accelerep.netlify.app (Unassigned
counts at 19 pre-hygiene-parity; assignment round-trip) → fast-forward master.
The hygiene apply already ran against the shared DB, so dev and prod see
cleared names immediately regardless of deploy state.

## 5. The thread

Two sessions ago the boundary moved to the server; last session it became
policy. This session the thread ran underneath both: **the write path is part
of the boundary too**. A read policy counting `ownerId` honestly is worthless
if the write path wipes the row it passes through — and the queued one-line UI
fix turned out to be gated on an endpoint fix nobody had queued. The check the
guide asked for ("any endpoint that sanitizes-then-upserts") had been cashed
exactly once, for users.mjs; cashing it for leads.mjs found the second
instance in the first file read. Opportunities is the third candidate and it
is explicitly queued this time.

And provenance, again, smaller still: a gate number predicted instead of
measured, a file believed saved that no filesystem held, a silent check-ignore
read as a broken pattern when it was a tracked file telling the truth. Every
one settled by the same move as always — read the disk. The new clause this
session adds: **verify the verifier** — a placement gate's expected count is
itself a claim about a file, and it gets checked against the artifact before
it ships.
