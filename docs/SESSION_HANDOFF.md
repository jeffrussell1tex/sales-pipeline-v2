# SESSION_HANDOFF.md

**Session of 26 August 2026 (third batch).** Repo root. Read this first, then
verify every claim in it against the live repo before acting — **including the
claims in this file**.

**Fast staleness check:** does `docs/ACCELEREP_CODING_GUIDE.md` have **§18b24**,
and does `docs/ACCELEREP_CURRENT_STATE.md` have **§0.46**? If not, you are looking
at a copy that predates this session. Check section numbers, never dates.

**State at close:** role vocabulary unified. **Six gates green, 276 tests,
26 integration tests, 80/80 mutations caught on a proven green baseline** — all
observed, not predicted.

**One thing was NOT done and is not claimed: the rep-path browser check.** No gate
can perform it, and Admin skips every branch this batch touches — which is exactly
how §0.24, §0.30 and §0.36 all shipped green.

---

## 1. What shipped

One list (`APP_ROLES` in `auth.mjs`), one gate direction (allowlist), one identity
space per use in `user-role.mjs`, one field answering "what is this user's role"
(`users.role`, via a `flatten()` spread order).

Three defects underneath, each recorded in §0.41–§0.45:

1. **`requireWrite` was a blocklist.** It denied `ReadOnly` and `Technician` by
   exact string and permitted everything else, so any unrecognised value — and
   the invite screen was minting one — carried full write access to ~28
   endpoints.
2. **Role changes had been impossible since the Phase 1 identity split.**
   `user-role.mjs` used `targetUserId` as both a Clerk id and an app id. The UI
   sent the app id, so every Clerk call 404'd. With a Clerk id the mirror update
   would have matched zero rows silently, because a drizzle UPDATE that matches
   nothing does not throw.
3. **The Users UI read a frozen copy of the role.** `profile.userType` was
   written once at row creation, never updated by any role change, and `flatten()`
   spread the blob last so it overrode the column. Badges, both seat counters,
   the header, the permissions summary and the select all read it.

**The ordering mattered.** Fixing (2) without fixing the selects would have armed
a one-click Admin grant: three `<select>`s presented **Admin** for any unmatched
value, and the control was live. Both are in this commit for that reason.

## 2. Corrections to the previous handoff

§0.40's headline hypothesis does not hold, and it said so itself ("Not verified
against `auth.mjs`"). `canSeeAll` **is** case-sensitive, but it reads Clerk
`publicMetadata.role` while the badge read the mirror's `profile.userType`. They
disagreed because they were **different fields in different stores**, not because
either was miscomparing.

The generalisation is in §18b24.5: *"these two disagree" almost never means one of
them is miscomparing; it usually means they are not the same field.* Find both
sources before theorising about the comparison.

## 3. Errors made this session, recorded

- **Two patch anchors were written from memory rather than from the file.** The
  invite screen's default-role `<select>` was assumed to cascade to the rows (it
  does not), and `UserModal`'s options were assumed to use `&mdash;` (they use a
  literal em dash). Both failed loudly at the assert, wrote nothing, and cost one
  round trip each — which is the patch script working as intended (§18b2).
- **The first source guard was too broad.** It banned the string `'Sales Rep'`
  anywhere in `UsersDetail.jsx`, which fails on the two places it is correctly a
  *label*. A guard that fails on legitimate code gets deleted, so it was narrowed
  to the two seeds. §18b23.2 cuts both ways: guard the class, but the class has
  to be the actual class.
- **A session opened by rewriting a labelled hypothesis as a "correction" and
  proposing a new module, a normalizer layer and a new guide section for what was
  fifteen lines of bug.** Called out by Jeff, and rightly. The docs' register —
  every session has an "errors made" section — makes architecture-scale proposals
  feel proportionate to defect-scale problems. They are not.

## 4. Next — start here

**Finish verifying this batch.** Gates, unit suite, integration suite and the
mutation harness are all done and green. One thing is not:

**The rep-path browser check (§0.38).** Sign in as a REP, not an Admin — Admin
skips every branch this touches, which is how §0.24, §0.30 and §0.36 all shipped
green. Confirm: a rep can still save a record; the Users list shows real role
labels rather than `member`; an Admin can change someone's role and the badge
updates. **No gate can perform this check.**

**Then run `scripts/check-clerk-roles.mjs`** (read-only, untested against a live
Clerk instance) — it names any test account whose Clerk role the new allowlist
will refuse. There are no live users, so this is a diagnostic, not a migration.
If a role change from the UI 403s or 400s, that script tells you why.

**`invalidateRoster` is now called** — that item is closed.

**Carried forward, unchanged:** `LeadImportModal.jsx:63–76` superseded matcher;
leads has no overwrite path; no end-to-end test across the six import modules;
settings auto-save fires for users who can never save (`useSettings.js:223`);
`tasks.mjs` and contacts GET have no rep scoping; bulk-import lead notification;
the stray `dupes-jsx-attribute - Copy.jsx` fixture.

**Test debt, still the highest-value item:** `opportunities.mjs` and `tasks.mjs`
have **no integration file at all**, and `leads.itest.mjs` has no rep-role
ownership tests.

**Commit 3 — finish Phase 2.** Client visibility (`isRepVisible` →
`currentUserId`, `App.jsx:95`); importer name→id with a real error on ambiguity;
`managedReps` off display names; collapse `accounts.assignedRep`; decide the fate
of the name columns.

**Raised, not decided:** `UserModal`'s role select is disabled on edit rather than
wired to `user-role.mjs`. `sanitize()` still writes `profile.userType` from the
body — harmless now that `flatten()` prefers the column, and it is what lets the
blob self-heal, but it is still a second stored answer.

## 5. The thread

Last batch: *every measuring instrument was, at some point, reporting on itself
rather than on the code.* This one is narrower and older:

**A string enum is a schema, and this repo had eight versions of one schema.**

Not eight bugs — eight copies, each correct on the day it was written. The blocklist
permitted what nobody had named. The select chose a value nobody picked. The blob
answered a question the column had already answered. Every one of them was a place
where **something unnamed was given a default, and the default was permissive**.

The defence is the same as §18b20's: enumerate what you allow, refuse the rest,
and say out loud which value you refused.
