# SESSION_HANDOFF.md

**Session of 26 August 2026 (second batch).** Repo root. Read this first, then
verify every claim in it against the live repo before acting — **including the
claims in this file**.

**Fast staleness check:** does `docs/ACCELEREP_CODING_GUIDE.md` have **§18b23**,
and does `docs/ACCELEREP_CURRENT_STATE.md` have **§0.40**? If not, you are looking
at a copy that predates this session. Check section numbers, never dates.

**State at close:** 261 tests, 26 integration tests, **73/73 mutations on a
verified green baseline**, six gates green. **Migration applied. Rep path verified
in the browser.** Commit 2 is complete — code, docs, database and a human check.

---

## 1. Commit 2 is DONE, including the parts no gate can prove

**The backfill is applied.** 1,569 `owner_id`s set across the six tables, and every
count matched the dry run exactly — `accounts` 5, `contacts` 1445,
`opportunities` 34, `tasks` 51, `leads` 4, `activities` 30. A plan that does not
predict its own apply is not a plan; this one did.

**The rep path was verified in the app, signed in as a rep rather than an Admin.**
Three checks, each mapping to a defect that shipped GREEN earlier the same day:

| Check | What it proves |
|---|---|
| Karen sees and edits her own contact | the GET filter keys on `ownerId`, and the backfill landed |
| someone else's contact returns the OWNERSHIP message, not the role one | `assertOwnership` fires, and the two 403s are still distinguishable |
| a contact she creates comes back owned by her | the server stamps from the JWT — this is what closed `importRows.js:103` |

**Admin skips every `!canSeeAll` branch.** That is how §0.24, §0.30 and §0.36 all
shipped green, and it is why this check is worth more than the six gates put
together. Do it again after any change to ownership or visibility.

**2,408 rows are genuinely unowned and 92 name someone who is on no roster**, so
roughly 61% of dev data is editable org-wide. That is the policy working, not a
gap — but it means a rep seeing MOST records is expected, and the meaningful
signal is one of the 1,569 owned rows.

---

## 2. What shipped

Ownership keys on `users.id`. `ownerId` + `(orgId, ownerId)` index on the six Tier
1 tables; the server stamps on create; `_ownership.mjs` compares ids; both rep GET
filters key on `ownerId`; `bulkUpsert` takes `callerId`.

**A display name can no longer confer ownership. Only a real roster user can own
anything.** A name resolving to nobody stamps NULL — unassigned, mutable by any
writer. That is the policy and it is also what broke four integration tests, whose
fixtures owned records to bare strings like `'Someone Else'`.

**`importRows.js:103` is CLOSED.** Single create defaults to the caller; BULK
create leaves a blank owner unassigned. Importing someone else's spreadsheet does
not make you the owner of all of it.

`resolveOwnerId` **refuses ambiguity** with a 409 naming both roster rows. Picking
one would write the Phase 2 defect permanently into the id column, where — unlike
a name — nobody would ever re-examine it.

---

## 3. Three things that were green and wrong

Recorded because each looked correct at the moment it was not.

1. **The mutation score was vacuous.** The harness judges CAUGHT by non-zero exit;
   `bulk-upsert.test.mjs` was RED, so every mutation exited non-zero. It printed
   **73/73 twice** over code it never tested. A green baseline is now proven first.
   **Never trust a score without the `Baseline: green.` line.**
2. **`bulkUpsert` failed OPEN on a projection miss.** `undefined` (column not
   projected) read identically to `null` (genuinely unowned). Now throws.
3. **A guard covered the instances, not the class.** Five guards for name-vs-id
   defects; a sixth instance survived — `l.assignedTo === callerId` in a
   visibility filter. **Visibility filters compare in the endpoint and never reach
   `mayMutate()`.** Reads need their own guards.

---

## 4. `ownerId` already meant two things

`documents.ownerId` holds a **Clerk** userId; `savedReports.ownerId` is notNull and
undocumented. §0.28 called both "already correct" — true about the shape, wrong
about the space. `isAppUserId()` asserts it, `mayMutate()` refuses a wrong space
LOUDLY, and a registry tripwire keeps both entities out of the policy. §18b22.

---

## 5. Errors made this session, recorded

- **The migration used the wrong Neon call style.** `sql(text, params)` throws;
  `@neondatabase/serverless` requires `sql.query()` for non-tagged calls. Every
  statement interpolates a table identifier, which a tagged template cannot carry.
  Died at the backfill, wrote nothing.
- **A regex could not thread `orgId` through five multi-line calls.** It reported
  two sites unpatched and refused to write, which is the only reason it was not a
  silent half-patch. Rewritten with paren balancing.
- **A retracted claim about line endings.** Three files looked CRLF against the
  LF rule; the same files arrived with DIFFERENT endings in a later upload.
  `core.autocrlf=true`, so git normalises and **line endings in this repo are a
  non-issue**. The earlier note was wrong; ignore it.
- **"It's you" without naming the org.** The duplicate "Jeff Russell" was in UKG,
  not the current org. Say which scope.

---

## 6. Next — start here

**Role vocabulary — own commit, and the only item with a live security edge.** Badges read `member`, `Admin`,
`member`, `User`: Clerk's names mixed with the app's. The seat counter reads
**Admins 0** for lowercase `admin` and **1** for `Admin`, so the comparison is
case-sensitive. If `canSeeAll()` compares the same way, **a user the UI calls an
admin has rep access**. And the ROLE select showed `Admin` for a user whose header
and permissions summary both said `member` — consistent with `member` missing from
the option list, so **saving that page writes `Admin` to a member.** Needs
`auth.mjs`, `users-sync.mjs`, and the component rendering that select.

**`invalidateRoster(orgId)` is exported and never called.** The roster caches 30s,
so inviting a user and immediately assigning them a record can stamp NULL. Needs a
call after any `users` write in `users.mjs`.

**Commit 3 — finish Phase 2.** Client visibility (`isRepVisible` → `currentUserId`,
`App.jsx:95`); importer name→id with a real error on ambiguity; `managedReps` off
display names; collapse `accounts.assignedRep` (deferred — it has live write paths
through `applyTerritoryRules()`); decide the fate of the name columns.

**Test debt, unchanged and still the highest-value item:** `opportunities.mjs` and
`tasks.mjs` have **no integration file at all**, and `leads.itest.mjs` has no
rep-role ownership tests. That absence is what let §0.23, §0.24, §0.30 and §0.36
all ship.

**Carried forward:** `LeadImportModal.jsx:63–76` superseded matcher; leads has no
overwrite path; no end-to-end test across the six import modules; settings
auto-save fires for users who can never save (`useSettings.js:223`); `tasks.mjs`
and contacts GET have no rep scoping; bulk-import lead notification; the stray
`dupes-jsx-attribute - Copy.jsx` fixture.

---

## 7. The thread

Last batch: *a rule is not a guard, a guard is not a mutation, a mutation is not in
SUITES.* This one goes one layer further:

**Every measuring instrument in this repo was, at some point today, reporting on
itself rather than on the code.**

The mutation score measured that node exits 1. A security test measured that two
unequal strings are unequal. A guard measured the instance it was written from. A
projection measured a key nobody was writing.

All four were green. All four were wrong. And the defect underneath was the same
one as always — **two things that are not the same being compared as though they
were**: a Clerk id and an app id, `undefined` and `null`, a display name and a user
id, a red suite and a caught mutation.

The defence that keeps working: **ask what would be DIFFERENT if the code were
wrong, and assert that.** Not the outcome you expect — the outcome that diverges.
