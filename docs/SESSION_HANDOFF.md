# SESSION_HANDOFF.md

**Session of 31 August 2026.** Repo root. Read this first, then verify every claim
in it against the live repo before acting — **including the claims in this file**.

**Fast staleness check:** does `docs/ACCELEREP_CODING_GUIDE.md` have **§18b25**, and
does `docs/ACCELEREP_CURRENT_STATE.md` have **§0.53**? If not, you are looking at a
copy that predates this session. Check section numbers, never dates.

**State at close:** one commit on `dev` carrying the whole Leads-visibility batch —
code, tests, harness, and these three docs (§22); `netlify.toml` and `index.html`
are untouched (see the environmental note below). If you are reading this file
from the repo, that commit happened; if a delivered copy claims more than the
repo shows, the repo wins. NOT yet merged to `master` — dev deploy smoke test
comes first (see §4). Untracked patch scripts in the repo root and `scripts/`
(`add-lead-visibility.mjs`, `patch-guide-053.mjs`, `patch-state-053.mjs`) are
disposable.

---

## 1. What shipped — the Leads scoping session, plus what it surfaced

**The toggle.** `settings.extra.unassignedLeadsVisibleToReps` (default `true`;
absent key = the standing policy, so the deploy changes nothing for any
unconfigured org) gates the unassigned half of the rep predicate in `leads.mjs`
GET — leads only; the other five entities keep the fixed predicate. The strict
branch is `!!l.ownerId && l.ownerId === callerId`, and the `!!` guard is
load-bearing: bare `=== callerId` matches `null === null` and hands an
unresolvable caller exactly the rows the toggle hides (18b22). The config read
throws to the handler's 500 rather than copying `getLeadScoring`'s
swallow-and-default — a visibility boundary must not silently pick a fail
direction. **Write policy deliberately unchanged** (visibility ≠ authorization;
recorded as a decision). Both `settings.mjs` halves carry the key.
`LeadVisibilityDetail.jsx` under `settings/salesProcess/`, four-step wiring,
live badge on the card.

**Mine/All on Leads** — the §0.52 pattern; `norm()` gained an `ownerId`
passthrough because the normalized shape carried only the display name, and the
scope keys on the id, never the name. Key `tab:leads:scope`, default Mine,
control on the right of the Triage/Cockpit strip.

**Tests.** Five integration tests — `leads.mjs`'s FIRST rep-role coverage
(§0.33/§0.50 debt): default, strict, Admin-bypass, stored-true≡absent, and the
unresolvable-caller-under-strict case asserting exactly zero rows. Two
permanent unit guards in `ownership-registry.test.mjs`: the null-null-collision
SHAPE guard scanning all six endpoints, and 18b12-as-a-test for this key.
Harness: anchor #14 repointed, five new mutations. **Verified: six gates green
(143 tdz, 278 tests, build 2,465 kB), 31/31 integration, 85/85 mutations on a
printed green baseline, zero STALE.**

**Browser-verified on LOCAL dev, both roles, row-level.** Admin 23 in both
toggle states; badge round-trip; Mine/All persisting. Karen 4 (strict) / 23
(permissive), reconciled against an authorized fetch: exactly 4 rows carry her
`usr_…`, 19 are `ownerId: null`, zero foreign owners. Thirteen of the 19 are
the ZZFX pattern in real data — stale `assignedTo` names on null-owner rows —
see §4 hygiene.

**`netlify dev` was broken locally and is fixed — environmental, no code
change.** Module URLs (`/src/main.jsx`, `/@vite/client`) came back as typeless
200s with Netlify's own headers; `nosniff` blocked them; React never mounted;
the static crawler landing in `index.html` stayed on screen. A stale `dist/`
was present and the documented cleanup (`rm -rf node_modules/.vite dist`,
restart) fixed it — with the `[dev]` proxy block in place, so the fallback can
bite even then. A toml-catch-all hypothesis was drafted into a redirect-move
fix that was NEVER APPLIED (see §2); it is recorded as unproven, and
`netlify.toml` is untouched. Recognise the symptom: "Rewrote URL to
/index.html" dev-log lines; `curl -sI` on :8888 vs :5173 separates the CLI
from Vite. Guide §19 carries the note.

**The itest namespace collision → guide §18b25.** Seeding
`(itest_org_A, u_itest_org_A)` collided with the accounts suite's per-test
re-seed of the identical pair (three concurrent processes, one DB, one unique
constraint): accounts died on duplicate-key in its hooks; the leads rep tests
failed on caller resolution nowhere near the cause. The leads suite now owns
`itest_leads_A/B`. One org prefix per suite that seeds constrained shared
tables.

## 2. Errors made this session, recorded

- **Two wrong predictions, both caught by verifiers.** "Expect 1" for a grep
  that correctly returns 2 (the guard's own name plus its offender message);
  and a patch-script post-check written as ≥3 for a key that appears twice.
  Predictions are not evidence; outputs are — the verifiers were right both
  times.
- **The delivered-vs-placed gap, three times, one file.** `catalogue.js` was
  believed placed and wasn't (an honest wrong belief — the repo copy's Aug 12
  mtime settled it), a `/tmp` heredoc was believed run and wasn't. The rule
  that ended it: **grep the destination after every placement** — verify the
  effect, never the memory of the action. Same provenance rule §22 applies to
  commits, applied to file moves.
- **A patch script double-converted EOLs** (multi-line anchors built with CRLF,
  then converted again → `\r\r\n`, zero matches). The refuse-on-zero-match
  behavior caught it before any write. Keep anchors in `\n` and convert
  exactly once.
- **A diagnosis was declared from a truncated curl and the docs briefly outran
  the disk.** The post-cleanup probe was read through `head -3`, which cut the
  `Content-Type` line off; the stale-`dist/` cleanup had ALREADY fixed the
  module serving, but a toml-redirect fix was prescribed anyway, never run —
  and then documented as shipped. `git add public/_redirects` failing on a
  file that did not exist is what caught it; all three docs were corrected
  before the commit. Two lessons: head the line you are ruling on, not the top
  of the headers; and a doc claim about a change is verified the same way as
  the change — against the disk.

## 3. Observed on local dev, pre-existing, untriaged

- `documents.mjs` GET returns 500 locally (suspect R2 env vars in `netlify
  dev`; not investigated — do not diagnose blind).
- The non-writer settings auto-PUT 403 noise in Karen's console — the known
  `useSettings` toast debt, now seen live.
- The static landing in `index.html` works as designed (crawlers see content;
  React replaces it). Jeff wants humans to never see even the flash —
  **queued as its own standalone pass**; it touches the bootstrap path and must
  not ride with policy changes.

## 4. Next — start here

**Merge discipline:** smoke-test `accelerep.netlify.app` after the dev deploy
(Sales process should count 15; the toggle round-trip as Admin; Karen's counts)
before fast-forwarding `master`. The prod "before" is recorded: Sales process
14, no card.

**Prod roles cleanup, still concretely due** (unchanged): five of six prod
roster rows carry refused role values (`member` ×4, `Sales Rep` ×1). Run
`scripts/check-clerk-roles.mjs` against the prod Clerk instance — read-only,
never yet run live.

**Data hygiene, new:** clear stale `assignedTo` strings where `ownerId` is
null (13 such rows on dev today), and move the name-based Unassigned
chips/Distribute counts in `LeadsTab.jsx` to `ownerId` — they undercount the
pool 6 vs 19. Two implementations of one policy, again.

**Test debt, still the highest-value item:** `opportunities.mjs` and
`tasks.mjs` have no integration file; the four §0.48 endpoints
(`accounts`/`contacts`/`tasks`/`activities`) still have zero automated
rep-role GET coverage — the leads pattern from this session (own roster seed,
own org namespace, `invalidateRoster()` after seeding) is the template.

**Carried forward, unchanged:** SettingsTab deferred cleanup (standalone
pass); CSV import/export for Pipeline/Contacts/Accounts; Lead Scoring v1.5;
E2E Layer 3; `LeadImportModal.jsx:63–76` superseded matcher; leads overwrite
path; six-module import E2E; bulk-import lead notification; the stray dupes
fixture; `users.mjs` callerCache create window (§0.47); quotes name-based and
off-registry; `TasksTab.jsx:1129` toISOString; the §0.50 client visibility
remnants (`App.jsx:672/639/642/646/657`, `ModalLayer.jsx:1069`,
`TasksTab.jsx:564`).

## 5. The thread

The last handoff closed on: once the server is the boundary, every client-side
copy of the policy flips from redundant to hazardous. This session adds the
next clause: **once the boundary exists, it can become configurable** — the
predicate stopped being a constant and became policy an admin sets, and the
interesting work was everything that guards a policy: the absent-key default
that makes the deploy a no-op, the fail direction chosen loudly instead of
silently, the null-collision the strict branch would have shipped without its
`!!`, and the guards that now scan every endpoint for the next one.

And the session's second thread was provenance, again, at smaller scale than
ever: a file believed placed, a script believed run, a count believed known.
Every one settled the same way — read the disk, not the memory. The verifiers
that refused to write on a zero-match, the post-check that failed its own
author's prediction, the mtime that outed a copy that never happened: trust
the refusal; it has been right every time.
