# SESSION_HANDOFF.md

**Session of 28 August 2026.** Repo root. Read this first, then verify every claim
in it against the live repo before acting — **including the claims in this file**.

**Fast staleness check:** does `docs/ACCELEREP_CODING_GUIDE.md` have **§18b24**, and
does `docs/ACCELEREP_CURRENT_STATE.md` have **§0.52**? If not, you are looking at a
copy that predates this session. Check section numbers, never dates.

**State at close:** five commits on `dev`, all shipped, gated and browser-verified;
`master` fast-forwarded to the same tip at close and production eyeballed. Nothing
is half-done. The next session starts from a clean tree plus the untracked patch
scripts in the repo root, which are disposable.

---

## 1. What shipped — `e10e1a1` → `f90634a`, dev and master

**`e10e1a1` — the server became the boundary on reads.** `accounts.mjs`,
`contacts.mjs`, `tasks.mjs` and `activities.mjs` GETs gained the rep predicate
(`!r.ownerId || r.ownerId === callerId`, `canSeeAll` bypasses) that opportunities
and leads already had. Same commit: the six doc corrections owed since `77e119c`,
the §22 back-record of that commit (state doc §0.48–0.50), and the handoff
replacement (see §2). Verified: six gates, 276 tests, 26 integration, **80/80
mutations on a printed green baseline**.

**`1ceb13c` — dev after-counts recorded.** Karen 144/1533/25/22 against a
144/1534/28/23 baseline; Admin exactly at baseline; the predicate applied
client-side over the full Admin dataset reproduced Karen's four numbers exactly —
right rows, not merely fewer. (§0.50)

**`521e5d7` — the client stopped re-implementing the boundary (Tasks).** Mine/Team
became **Mine/All**; the scope filter keys on `it.ownerId === currentUserId` (the
first consumer of `currentUserId`); scope persists to `tab:tasks:scope` with a
validated read; the inline activities author filter died; **`isRepVisible`'s rep
branch returns `true`** — and its **Manager branch was kept deliberately**, see §2.
(§0.51)

**`b7a78aa` — production verified.** Different Clerk instance, org and data.
Admin control 663/1506/48/30 unchanged; rep (`usr_449739ff-…`) received
663/61/0/2; the predicate over the Admin dataset reproduced those numbers
exactly. Prod scoping does visible work: 61 of 1,506 contacts, 0 of 48 tasks.
(§0.50)

**`f90634a` — Mine/All on Accounts, Contacts and Pipeline.** One aliased
destructure + one memoised derivation per tab
(`visibleX: allVisibleX` → scoped `visibleX`), so chips, counts, presets, saved
views and exports follow the scope with zero downstream edits. Keys
`tab:accounts:scope` / `tab:contacts:scope` / `tab:pipeline:scope`. **Default is
Mine everywhere — Jeff's decision, reaffirmed after seeing it as Admin.** (§0.52)

Browser-verified on dev as Karen AND as Admin: all four tabs show Mine/All,
toggle, persist per tab across reload, nothing owned missing. Merged to `master`
at close; production eyeballed on all four tabs.

**Karen's Mine equals her All, and that is BY CONSTRUCTION** — the server sends a
rep only own + unassigned, and Mine can only hide rows owned by others. The
toggle is meaningful for Admins and Managers today. Making Mine strictly-mine
(hide unassigned too) is a recorded one-line product option, not a defect.

---

## 2. Corrections to the previous handoff

- **The repo never had the 27-Aug handoff.** `docs/SESSION_HANDOFF.md` on `dev`
  was the 26-Aug version; the 27-Aug handoff only ever existed in Jeff's temp
  folder as a delivery. The doc patch's anchor assert caught it (0 matches, wrote
  nothing) and the file was replaced wholesale. **Delivered is not committed. The
  repo's copy is the only committed truth — diff against IT, not against another
  delivery.**
- **"Delete `isRepVisible` and its five call sites" was wrong as written.** The
  rep branch was redundant-and-hazardous (a stale name-string would HIDE rows the
  server granted) and is gone. But the **Manager branch is load-bearing**:
  server-side `canSeeAll` hands Managers the whole org on five of six entities,
  so the client's `managedReps` narrowing is the only Manager scoping that
  exists (§0.39). Deleting the function wholesale would have silently widened
  every Manager's view to org-wide. The comment in `App.jsx` now says so.

## 3. Errors made this session, recorded

- **Two temp-folder copies of the handoff were diffed against each other** and
  declared "identical to the repo." They were identical to each other; neither
  was the repo's file. Provenance of a comparison matters as much as its result.
- **A delivered patch briefly carried a stale self-assertion** — the `canSeeAll`
  destructure edit changed after its `expectPresent` was written. The script's
  own on-disk verification caught it before it reached Jeff's machine;
  regenerated. The verifier verifying the generator is the system working.
- **git autocrlf flipped the state doc to CRLF mid-session**, exactly as its
  warning promised. Patches since detect EOL at runtime; the hardcoded-EOL ones
  would have failed loudly. Keep the runtime-detect pattern for every doc patch.
- A predicted gate number (145 files on tdz) was wrong — the patch edited three
  files and created none; still 142. Predictions are not evidence; outputs are.

## 4. Next — start here

**Leads gets its own session** (unchanged from last handoff): the admin toggle
for unassigned-lead visibility, the `settings.extra` key, both halves of
`settings.mjs` and the filter change land together or not at all.

**Prod roles cleanup, now concretely due.** Five of six prod roster rows carry
refused role values in the mirror (`member` ×4, `Sales Rep` ×1 — invite-era
values). Those accounts likely cannot write on prod until re-set via the Users
UI. Run `scripts/check-clerk-roles.mjs` against the prod Clerk instance first —
still never run against a live instance.

**Client visibility remnants, found earlier and still standing:** `App.jsx:672`'s
activities rule (linked-opp `salesRep`, everything unlinked visible) still
exists; the dead `assignedTo` clauses at `App.jsx:639/642/646` and
`ModalLayer.jsx:1069` still match nothing; `App.jsx:657` still filters accounts
on `accountOwner` alone. All are convenience-layer now, not boundaries, but they
are still two implementations of one policy. `TasksTab.jsx:564` still renders an
unassigned task as assigned to whoever is looking.

**Test debt, still the highest-value item:** `opportunities.mjs` and `tasks.mjs`
have no integration file; `leads.itest.mjs` has no rep-role ownership tests; the
GET scoping on all four patched endpoints has **zero automated rep-role
coverage** — the browser checks recorded in §0.50 are the only runtime evidence.

**Carried forward, unchanged:** `LeadImportModal.jsx:63–76` superseded matcher;
leads has no overwrite path; no end-to-end test across the six import modules;
bulk-import lead notification; the stray `dupes-jsx-attribute - Copy.jsx`
fixture; the `users.mjs` callerCache create window (§0.47); the `useSettings`
toast for non-writers; quotes is name-based and off-registry; `TasksTab.jsx:1129`
`toISOString` (the triaged-24 UTC class).

## 5. The thread

Yesterday's close said the end state is the one every mature CRM has: the server
filters, the client renders what it receives. **That state now exists, on both
environments, verified from both sides** — no leaks (the rep's rows all pass the
predicate) and no gaps (the predicate over the Admin dataset reproduces the
rep's rows exactly).

What this session adds: **once the server is the boundary, every client-side
copy of the policy flips from redundant to hazardous** — a name-based filter can
no longer protect anything, but it can still HIDE what the server granted. The
rep-path filters died for that reason; the Manager branch survived because for
Managers the client filter still IS the policy, which is its own §0.39-shaped
debt.

And a smaller thread, twice today: **a claim's provenance is part of the claim.**
A handoff that was delivered but never committed, a diff between two copies of
the wrong file — both read as "verified" until the anchor assert said otherwise.
The patch scripts refuse to write on a zero-match for exactly this reason. Trust
the refusal; it has been right every time.
