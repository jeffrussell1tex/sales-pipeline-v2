# SESSION_HANDOFF.md

**Session of 25 August 2026.** Repo root. Read this first, then verify every claim
in it against the live repo before acting — **including the claims in this file**.
Two of the previous session's handoff claims were written from reading one side of
a call chain, and two of mine this session were too. Both are recorded below
rather than quietly corrected, because the failure mode is worth seeing.

**Fast staleness check:** does `docs/ACCELEREP_CODING_GUIDE.md` have **§18b20**,
and does `docs/ACCELEREP_CURRENT_STATE.md` have **§0.28**? If not, you are looking
at a copy that predates this session. Check section numbers, never dates.

**State at close:** 250 tests, 26 integration tests, **55/55 mutations**, six gates
green. Phase 1 of the identity migration shipped and is live on dev.

---

## 1. What shipped: identity is a value we own

`users.id` used to hold the Clerk userId, and an invited row carried a
`pending_...` placeholder that was **overwritten with the real Clerk id when the
user accepted**. A primary key that changes at the moment someone starts being
assigned work is not a primary key.

| Before | After |
|---|---|
| `users.id` = Clerk userId, rewritten at acceptance | `usr_<uuid>`, ours, never reassigned |
| Clerk identity IS the PK | `clerk_user_id` column, NULL until acceptance |
| `users.email` **globally unique** | `uniqueIndex(orgId, email)` |
| Caller looked up by `users.id`, unscoped | by `(clerkUserId, orgId)`, `orgId` required |
| Sync **rewrote** `users.name` from Clerk | drift REPORTED, never applied |

Ten rows migrated across two orgs, all ten linked, zero unlinked. Verified three
ways: row contents, index names, and `indisunique` — because a plain index with a
unique-sounding name is indistinguishable from a real one in `pg_indexes`.

`scripts/migrate-user-identity.mjs` is re-runnable and dry-run by default. It
talks to Neon directly rather than through `db/index.js`, which only resolves
under Netlify's bundler (`.js` → `.ts`) and cannot be loaded by plain node.

**Why now.** All data was test data and there were no live customers. That is the
only reason this was one migration rather than a phased dual-write with a
backfill and a reconciliation pass. **That window is now closed** for anything of
this shape.

---

## 2. The defect that was found by a broken fixture

`bulkUpsert` encoded "Admin, skip the ownership check" as `callerName === null`.
The caller resolver also returns null when it **cannot identify the caller**. One
value, two opposite meanings, and the permissive one won — an unidentifiable
caller could overwrite every owned row in the org.

Unreachable while every caller resolved to a name. The identity split made it
reachable: any user not yet linked to Clerk resolves to null.

It surfaced because two integration fixtures still seeded the old identity shape,
so the rep resolved to nobody and one test reported `[]` where it expected
`['ct_bulk_other']`. **Had the fixture been correct, that test would have gone
green and the hole would have shipped.** That is a thin thread.

**A unit test was asserting the bug was correct.** `a null callerName may edit
everything` sat green in `bulk-upsert.test.mjs` while `_ownership.mjs` asserted
`FAIL CLOSED when the caller has no resolvable name` for the same input. Two
files, opposite rules, nothing comparing them. Now three tests: the Admin bypass,
the unidentified-caller refusal, and the default direction.

Fixed with an explicit `canSeeAll` parameter defaulting to `false`, routed
through `mayMutate()` so the bulk and single-record paths share one policy and
cannot drift apart again. Guide **§18b20** generalises §18b19 from `ownerColumn`
to any value feeding an authorization decision.

---

## 3. One of the new guards was scenery

The schema test asserted the string `users_org_email_uq` appeared in
`db/schema.ts`. Changing `uniqueIndex(` to `index(` leaves the name untouched,
enforces nothing, and the test still passes.

The mutation harness reported **SURVIVED**. Nothing else would have.

Worth stating plainly: that test was written by the same party that, an hour
earlier, had insisted on checking `indisunique` in the Neon console *precisely
because* a plain index with a unique-sounding name is indistinguishable from a
real one. The trap was known and the assertion fell into it anyway.

**Adding a test does not add a mutation.** A new suite must be added to `SUITES`
in `scripts/mutate-import.mjs` and given at least one mutation, or the count keeps
reading green while the guard checks nothing.

---

## 4. Errors made this session, recorded

- **The migration imported `db/index.js`.** Netlify's bundler resolves that to
  `.ts`; plain node cannot. The guide already said the schema loads only under
  `tsx`. Read the import, inferred the file. Rewritten against the Neon driver.
- **A test that asserted a name instead of a constructor.** Section 3.
- **Ordering.** `2d520fe` was committed before `test:int` had run, which is how the
  `drizzle-kit push` surprise happened — the schema file was already updated, so
  push compared against it and applied changes rather than reporting none. The
  guide asks for one commit per **verified** batch for exactly this reason.

---

## 5. Phase 2 — ownership keys on ids, not names

**This is the actual fix.** Phase 1 made identity stable; ownership still compares
display-name strings, which means:

- **Renaming a user detaches every record they own.** No warning, no audit entry.
  The automatic path (`users-sync.mjs`) is suspended; the manual path through the
  Users panel is not.
- **Two people with the same name in one org share ownership of each other's
  records**, and every gate agrees it is fine. `users.name` has no unique
  constraint. Not observed in current data; not prevented either.

**Tier 1 — authorization (6 columns).** `accounts.accountOwner`,
`contacts.assignedRep`, `opportunities.salesRep`, `tasks.assignedTo`,
`leads.assignedTo`, `activities.author`.

**Tier 2 — money and reporting (4).** `spiffClaims.repName` (notNull) and
`approvedBy`, `recommendationLog.repName` (notNull), and `accounts.assignedRep`
— **confirmed with Jeff as a leftover duplicate of `accountOwner`**, same meaning,
so it collapses rather than migrating.

**Tier 3 — provenance only (~12).** Every `createdBy` / `dispatchedBy` /
`triggeredBy`. Displayed, never authorizing. Convert opportunistically.

**Already correct — leave alone.** `documents`, `savedReports`,
`dashboardConfigs`, `userCalendarConnections`, `dispatchTechnicians`, and all of
Dispatch, which was built id-first (`assignedTechId`, `customerId`, `coTechIds`).
The pattern already exists in this schema four times; Phase 2 brings the older
CRM core up to it rather than inventing anything.

**Sequence:**

1. Owner id columns on the six Tier 1 tables, nullable, alongside the names.
2. Switch `_ownership.mjs` and the nine hand-rolled checks to ids. **This closes
   the same-name authorization hole.**
3. **Server stamps the owner on create; the client stops sending it.** Every
   endpoint already knows the caller from the JWT. This kills the class that
   produced `importRows.js:103`, and it removes the need for the client to have
   resolved its own identity before a record can be created.
4. Client visibility (`isRepVisible`) onto ids; introduce `currentUserId`.
5. Importer resolves names → ids with a real error on ambiguity. Customer CSVs
   will always contain names; this is where that stops being a silent string copy.
6. Regenerate fixtures, re-run the delete gate. **The fixture is spent** — step 15
   is one-way and steps 12–16 deleted their own subjects.
7. Decide the fate of the name columns. Recommendation: drop them. The browser
   already holds the roster in `settings.users`, so it can render a name from an
   id for free with nothing to go stale. Server-side exports and scheduled reports
   need a lookup — two or three places, not forty.

---

## 6. Still open from the previous session

**CSV import is NOT finished.** Four items carry forward unchanged:

1. `importRows.js:103` — `merged.salesRep = merged.salesRep || currentUser`.
   Phase 1 defused the worst of this (identity no longer resolves to an email),
   but **an unassigned opportunity still cannot be created by import at all**.
   Phase 2 step 3 is where it closes properly.
2. `LeadImportModal.jsx:63–76` still runs the superseded column matcher.
3. Leads has no overwrite path — dedupes by email and silently skips.
4. No end-to-end test spans `csvAutoMap` → `csvMapping` → `importRows` →
   `bulkInsert`/`bulkUpsert` → `_sanitize` → `_stage`.

**`currentUser` still derives from Clerk** (`App.jsx:95`). Phase 1 fixed the
SERVER's view of identity; the client's is unchanged. This is Phase 2 step 4, and
it is smaller than it looks now that the server stamps ownership — the async gap
stops being able to corrupt data.

**Settings auto-save fires for users who can never save.** `useSettings.js:223`
PUTs on every change; `/settings` PUT is Admin-only. A rep gets a "not saved"
toast for a write they never requested, and the body is identical to what was
just loaded. Skip the effect when the stripped payload is unchanged — that fixes
it for Admins too.

**Centralise the nine remaining ownership checks** onto `assertOwnership`. Their
columns are correctly named; they are nine more chances to name the wrong one.

**Restyle `LeadImportModal`** onto `CsvImportModal`'s chrome — retires the
superseded matcher in the same pass.

**Scoping questions, not bugs.** `tasks.mjs` GET selects by `orgId` alone; every
rep sees every task. Contacts GET likewise. Mutation is gated in both cases.
Decide whether the visibility is intended.

**Bulk-import notification for leads** — the bulk branch fires no webhook.

**Stray scanner fixture** — `tests/fixtures/scanners/dupes-jsx-attribute - Copy.jsx`
is byte-identical to its sibling and referenced by no test. One-line delete.

---

## 7. Environment notes

**`test:int` needs a database and is not in `npm test`.** It targets
`DATABASE_URL_TEST` — a **different Neon endpoint** from the app's. It has now
drifted twice in two sessions. `tests/integration/_schema-guard.mjs` now fails one
readable line instead of eighteen stack traces; **add a `[table, column]` pair to
its `REQUIRED` list whenever a schema change lands that the suites depend on.**

```bash
npx drizzle-kit push --config=drizzle.test.config.ts
```

**Never `set -a; source .env`.** A space after one `=` makes bash execute the
value; that printed a Clerk secret and two Neon passwords to a terminal last
session. Use `node --env-file=.env`.

**`npm run build` needs `VITE_CLERK_PUBLISHABLE_KEY` exported**, or rollup
tree-shakes the app to ~200 kB and the build guard fails with five findings. That
is §18b4 working.

**`npm test` prints two BUILD GUARD FAILED blocks and they are healthy.** They
come from the `hollow-` and `stale-` temp fixtures the check-bundle tests
deliberately feed it. The three tests around them pass.

**`git status` may hide untracked files** in this repo. Use `git ls-files`,
`git status --short`, `git --no-pager diff --stat`.

---

## 8. The thread running through this session

Last session's thread was that **the rep path had never been executed by
anything**. This session's is narrower and sharper:

**Every defect was a value that meant two things.**

- `users.id` meant both "our row" and "Clerk's user".
- `callerName === null` meant both "trusted Admin" and "cannot identify".
- `users.email` unique meant both "one row per person" and "one org per person".
- `users_org_email_uq` meant both "unique index" and "a name that says unique".

Each was survivable in isolation. Each became dangerous when something else moved
and made the second meaning reachable. And in every case both meanings were
documented, tested, and green — the two readings simply lived in different files,
and nothing compared them.

The generalisable defence is not another gate. It is: **when a value can be
absent, say what absence means at the point of use, and make the safe reading the
default.** That is §18b20.
