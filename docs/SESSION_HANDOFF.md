# SESSION_HANDOFF.md

**Session of 26 August 2026.** Repo root. Read this first, then verify every claim
in it against the live repo before acting — **including the claims in this file**.
Last session's handoff got a count wrong (nine vs ten) and this one may too.

**Fast staleness check:** does `docs/ACCELEREP_CODING_GUIDE.md` have **§18b21**,
and does `docs/ACCELEREP_CURRENT_STATE.md` have **§0.33**? If not, you are looking
at a copy that predates this session. Check section numbers, never dates.

**State at close:** 255 tests, 26 integration tests, **65/65 mutations**, six gates
green. Commit 1 of Phase 2 shipped: object-level authorization is centralised.

---

## 1. What shipped

**The last nine hand-rolled ownership checks are gone.** All ten sites — eight
single-record plus two bulk `ownerColumn:` literals — now go through
`assertOwnership()` / `ownerColumnOf()`. Twelve call sites, one policy.

No schema change. Nothing touched Neon. That was the point: **the id flip in
Commit 2 is now a change to `_ownership.mjs` alone rather than to ten sites in
four files while also changing their semantics.**

Files: `accounts.mjs`, `opportunities.mjs`, `leads.mjs`, `tasks.mjs`,
`tests/ownership-registry.test.mjs`, `scripts/mutate-import.mjs`.

**Ordering is load-bearing and is commented at each site.** On accounts,
opportunities and leads the ownership check runs BEFORE the Admin role gate. Both
refusals are 403; only the body distinguishes them. Reordering them silently
collapses six delete-gate outcomes into one. Tasks deliberately has no role gate
after it.

---

## 2. Three live defects, all one shape

**A display name compared to a Clerk id.** Found by reading the ten sites, not by
any gate.

1. **Two GET filters — every rep saw only unassigned records.**
   `eq(users.id, userId)` where `userId` is Clerk's and `users.id` is now
   `usr_<uuid>`. Resolves nothing → rep name null → predicate collapses to "only
   unassigned". Reps lost sight of their own pipeline and leads. **Silent** — the
   query succeeds and returns no row, so the `try/catch` never fires.
   **This shipped in §0.28 and had been live on dev since**, undetected because
   that session verified as Admin, which skips the branch entirely.
2. **`getRepUser()` unscoped.** Returns an EMAIL ADDRESS that deal names and ARR
   are sent to. Two orgs with a "John Smith" = cross-tenant delivery.
3. **A guard that could never fire.** `inserted.salesRep !== userId` — never
   equal, so a rep has always been emailed about their own new deals.

**The lesson worth carrying.** The Phase 1 sweep rewrote CALL SITES of
`getCallerName`. These are inline queries that REIMPLEMENT it. A textual sweep
finds callers; it cannot find code that duplicates the callee. **After a sweep,
search for the behaviour, not the function name.**

---

## 3. The guard suite was not in SUITES

`tests/ownership-registry.test.mjs` shipped last session and was never added to
`SUITES` in `scripts/mutate-import.mjs`. The registry, `mayMutate` and both
fail-closed throws had **zero mutation coverage** while the count read 55/55.

That is §18b20's closing paragraph recurring in the file it is about, one session
later. **55 → 65 is not new coverage. It is coverage that was being counted
without being tested.**

---

## 4. Errors and gaps recorded

- **A regex was the wrong tool** for threading `orgId` through five multi-line
  `maybeEmail` calls; the object literals' own braces defeated it. It reported two
  call sites unpatched and refused to write — which is the only reason it was not
  a silent half-patch. Rewritten with paren balancing. **Every patch script in
  this session verified its own result and exited non-zero rather than writing.**
- **The docs said nine checks; there were ten.** The two bulk literals were
  omitted, and they are the more dangerous half.
- **Three `netlify/functions/` files are CRLF** — `_bulk.mjs`,
  `opportunities.mjs`, `tasks.mjs` — against the LF rule for that directory.
  Preserved, not normalised, so this diff stayed readable. Worth its own commit.
- **`isReadOnly` is an unused import in all six endpoints**, pre-existing since
  `requireWrite` replaced it. `activities.mjs` also has dead `canSeeAll` and
  `getCallerName`.

---

## 5. What is NOT proven — read before trusting the green

**Proven at runtime:** the accounts delete-gate 403 split. Both regressions pass.

**Not proven at runtime:**
- `opportunities.mjs` and `tasks.mjs` have **no integration file at all**.
- `leads.itest.mjs` has **no rep-role ownership tests**.
- `contacts.itest.mjs` has the full rep suite — but contacts was UNCHANGED.
- **Both GET filter fixes have no runtime coverage whatsoever.**

**Do this before trusting Commit 1:** sign in on dev **as a rep, not Admin**, and
confirm Opportunities and Leads show records assigned to that rep rather than only
unassigned ones. No gate can see this.

**Highest-value test debt in the repo:** a rep-role integration file for
opportunities and tasks. The absence of one is what let §0.23, §0.24 and §0.30 all
ship.

---

## 6. Commit 2 — ownership onto ids

Scope agreed with Jeff: **no live users, no real data, so no backfill and no
dual-write.** That also means the handoff's original step 1 ("id columns alongside
the names") is the WRONG shape — six tables each holding two columns that mean the
same thing, with nothing enforcing agreement, is the defect this codebase has hit
four times running. Ids end this commit as the only authorization truth.

1. `ownerId` columns on the six Tier 1 tables, nullable. Collapse
   `accounts.assignedRep` — confirmed a leftover duplicate of `accountOwner`.
2. **Server stamps `ownerId` on create** from `resolveCaller().id`; client stops
   sending it. `resolveCaller` ALREADY returns the id, so this is nearly free.
   **This closes `importRows.js:103`, open five sessions.**
3. Flip `_ownership.mjs` to the id columns. One file, because of Commit 1.
4. Fix the client: `isRepVisible` onto ids, introduce `currentUserId`.
5. Add `[table, owner_id]` pairs to `_schema-guard.mjs` `REQUIRED`.

**Ordering (§18c):** `drizzle-kit push` against the app DB **and**
`drizzle.test.config.ts` BEFORE the code that reads the columns, or `test:int`
dies in a wall of 42703s.

```bash
npx drizzle-kit push --config=drizzle.test.config.ts
```

**Deferred to Commit 3:** importer name→id resolution with a real error on
ambiguity; dropping the name columns.

---

## 7. Still open, carried forward unchanged

**CSV import — four items.** `importRows.js:103` (closes in Commit 2 step 2);
`LeadImportModal.jsx:63–76` superseded matcher; leads has no overwrite path; no
end-to-end test spanning all six import modules.

**`currentUser` still derives from Clerk** (`App.jsx:95`). Commit 2 step 4.

**Settings auto-save fires for users who can never save** (`useSettings.js:223`).

**`tasks.mjs` GET has no rep scoping** — every rep sees every task. Contacts GET
likewise. Mutation is gated in both. Decide whether the visibility is intended.
**Note this interacts with Commit 2**: the two GET filters that WERE scoped are
now correct, which makes the two that are not more conspicuous.

**Bulk-import notification for leads** — the bulk branch fires no webhook.

**Stray scanner fixture** — `tests/fixtures/scanners/dupes-jsx-attribute - Copy.jsx`,
byte-identical to its sibling, referenced by no test. One-line delete.

---

## 8. The thread running through this session

Last session's was *every defect was a value that meant two things*. This one is
narrower:

**A rule is not a guard. A guard is not a mutation. A mutation is not in SUITES.**

§18b19 put the policy in one place and could not tell whether anyone used it.
The registry test proved a registered column existed and could not tell whether an
endpoint used the registry. The suite holding both had never been mutated because
nobody added it to a list in a different file.

Each layer looked like the layer below it was covered. **Every one of them was
green while nine endpoints ignored the whole apparatus.**

The defence is mechanical: guard the CALL SITE, assert the result is USED, and
prove each guard fails before believing it. That is §18b21.
