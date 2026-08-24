# SESSION_HANDOFF.md

**Session of 24 August 2026.** Repo root. Read this first, then verify every claim
in it against the live repo before acting — including the claims in this file.
Three claims in `docs/FIXTURE_MANIFEST.md` were written last session from reading
one side of a call chain, and all three were wrong. They are marked
**CORRECTED 24 Aug** in that file rather than quietly rewritten, because the
failure mode is worth seeing.

**Fast staleness check:** does `docs/ACCELEREP_CODING_GUIDE.md` have **§18b19**,
and does `docs/ACCELEREP_CURRENT_STATE.md` have **§0.27**? If not, you are looking
at a copy that predates this session. Check section numbers, never dates.

**State at close:** 244 tests, 26 integration tests, 50/50 mutations, six gates
green.

---

## 1. The delete gate ran, and passed

Four sessions blocked; done. `docs/FIXTURE_MANIFEST.md` holds the full procedure
and the recorded results.

| Steps | Subject | Result |
|---|---|---|
| 6, 8, 9, 10 | Rep-owned opp / account / lead, plus an unassigned account | **403 · `insufficient role`** |
| 7, 11 | Another rep's opportunity and lead | **403 · `your own or unassigned records`** |
| 12, 13, 14 | Contact, task, activity | **200** |
| 15 | Account parent with two children | **403 — children orphaned anyway, no audit record** |
| 16 | Admin deletes ×3, then an unknown id | **200 ×3, then 404**, audit rows carry name snapshots |

**Why the pairing matters.** Both refusals are 403 and the BODY is the only
discriminator. Steps 7 and 11 stop at the ownership check and never reach the role
gate; 6/8/9/10 pass ownership and are refused by `requireRole`. Had every subject
belonged to someone else — which the old ZZTest data forced — all six would have
read `your own or unassigned` and the Admin gate would have gone untested while
appearing fully verified. That false pass is what the fixture exists to prevent.

**The fixture is spent.** Step 15 is one-way and steps 12–16 deleted their own
subjects. Regenerate into a clean org before re-running:
`node scripts/make-fixtures.mjs --rep="<exact users.name>"` (the script refuses
without `--rep`).

---

## 2. Six defects found getting there — all on the rep path

Full write-ups in §0.23–§0.27. Every one was invisible to all six gates, which
were green before each fix and after it.

**§0.23 — the leads CSV import had never written a row.** The client posted an
array; `leads.mjs` had no `Array.isArray` branch, so `if (!data.id)` returned 400
every time. The handler also read `data.leads` while the endpoint returns
`{ lead }`. And `parseError` rendered only on the upload step while the request
fires from preview — so the failure was completely silent. Fixed: bulk branch
added, `bulk.postNew` on the client, error surfaced on preview.

**§0.24 — two ownership columns that do not exist.** `contacts.createdBy` (the
column is `assignedRep`) and `activities.repName` (it is `author`). Drizzle
resolves a missing property to `undefined`, which threw a **500** in
`db.select({ owner: undefined })` and **failed OPEN** in
`bulkUpsert({ ownerColumn: undefined })` — any rep could overwrite every contact
in the org. Fixed by centralising into `netlify/functions/_ownership.mjs`
(registry + pure policy) and `assertOwnership()` in `_lib.mjs`. See guide
**§18b19**.

**The guard found the second bad column on its first run.**
`tests/ownership-registry.test.mjs` checks every registered column against
`db/schema.ts` and caught `activities.repName` before the manual test reached it.

**§0.25 — the integration suite had been dead at import.** `mock.module` replaces
a module wholesale; the auth stub exported two names while the endpoints had grown
five. Nothing in either file had run since `requireWrite` landed — including the
`clear=true` guard written after the user wipe. Underneath that, the test database
schema had drifted and `drizzle-kit push` had never been run against it.

**§0.26 — identity is stored in two places and they disagree.** `App.jsx:95`
derives `currentUser` from Clerk's first + last name, falling back to **email**
when blank; every ownership column stores `users.name`. A rep whose Clerk profile
had no name was identified by email, saw only unowned records in the UI, and would
have authored records the server refused to let her delete — a 403 that looks
exactly like the gate working. Resolved for that user by setting the Clerk name.
**Not fixed.**

**Also:** `GET /users` was Admin-only and `useSettings.js:196` swallowed the 403,
so `settings.users` stayed `[]` and every user picker rendered empty for reps — a
rep could not assign a task even to themselves. `users.mjs` now serves a directory
read (`id`, `name`, `active`) to any org member; writes unchanged.

---

## 3. Shipped at the end of this session — child promotion

`accounts.mjs` ran the child-promotion `UPDATE` **above** the Admin role gate, so
an ATTEMPT was destructive on its own: a rep who could not delete an account still
detached every sub-account under it, permanently, with no audit record. Confirmed
on dev with before/after evidence, then fixed.

The `UPDATE` now runs after `requireRole` and after the delete has confirmed a row
was removed — promotion is a consequence of a deletion, not of an attempt. The
audit entry and the response carry the number of sub-accounts detached.

Five tests in `tests/integration/accounts.itest.mjs`: refused by role, refused by
ownership, Admin success, unknown id, org-scoping. **The second assertion in each
is the point** — the 403s and 404 were already correct under the broken ordering.

One of them initially passed while swallowing a 500 (it tried to create a row in
org B carrying org A's id; `accounts.id` is a global primary key, so the insert
failed and the assertion did not depend on it). Corrected; every seed now asserts
a 201. **Read that as a live example of the failure mode this suite exists to
catch.**

---

## 4. CSV import is NOT finished — what is still open

Asked directly at the end of this session whether CSV import is now completely
fixed. It is not. Four sessions have each fixed a different layer and each
believed it was done; this list is written so the fifth does not have to
rediscover it.

**1. `importRows.js:103` — and §0.26 makes it worse.** On create,
`merged.salesRep = merged.salesRep || currentUser`. `currentUser` can be an EMAIL
ADDRESS (§0.26), so an import run by a user with no Clerk profile name stamps
every blank Sales Rep with something that matches no `users.name`. Those deals are
invisible to the rep in the UI **and** refused by server-side ownership — nobody
owns them and nobody can fix them without a database edit. Two survivable defects
compounding into an unrecoverable one. Also still true: **an unassigned
opportunity cannot be created by import at all.** Highest-severity item in this
file.

**2. `LeadImportModal.jsx:63–76` still runs the superseded matcher.**
First-match-wins substring matching in both directions, no confidence reporting —
the exact fault `csvAutoMap.js` was written to eliminate, still live in one of the
four importers. The ZZFX lead headers were verified against THAT matcher
specifically, so the fixture is safe and an arbitrary customer file is not.

**3. Leads has no overwrite path.** Accounts, contacts and opportunities all have
conflict detection and an overwrite flow. Leads dedupes by email and **skips** —
there is no bulk PUT branch and no `partialRows`. A customer re-importing an
updated lead list gets nothing updated, silently and with no indication.

**4. The end-to-end test still does not exist.** 0.23 was the fourth cross-layer
import defect. This session added integration coverage for the leads bulk
ENDPOINT, which is real but narrow. Nothing yet runs a CSV from text through
`csvAutoMap` → `csvMapping` → `importRows` → `bulkInsert`/`bulkUpsert` →
`_sanitize` → `_stage` and asserts the final row shape for create AND overwrite.
That is the test that would have failed in session one.

**Not checked, so do not read the list as exhaustive.** The accounts, contacts and
opportunities overwrite paths were read this session but not exercised. The
Outlook import modal was not opened. `csvAutoMap` has never been run against a
real customer export — only against fixtures written to suit it, which is a weaker
claim than it looks.

---

## 5. Then, in priority order

**`currentUser` from the roster, not Clerk (§0.26).** A live correctness bug for
any invited user whose Clerk profile has no name — and the multiplier behind
item 1 of section 4, since the same value is stamped onto every imported deal
with a blank Sales Rep. Fixing this defuses that one too. It should come from the
`?me=true` row — `users.mjs` already serves it and already self-heals id/name
drift — with the Clerk name only as a fallback for a user with no roster row.
Small edit, wide reach: `currentUser` feeds visibility on every tab. Its own batch,
its own verification.

**Settings auto-save fires for users who can never save.**
`useSettings.js:223` PUTs on every change to `settings`; `/settings` PUT is
Admin-only. For a rep, `settings` changes once during load (the roster arrives at
`:201`), the server refuses, and a "Settings not saved — You do not have
permission" toast appears for a write the user never requested. `users` is
stripped from the payload anyway, so the body is identical to what was just
loaded — a no-op write that can only fail. Skip the effect when the stripped
payload is unchanged; that fixes it for Admins too, who make the same redundant
write on every load.

**Two dormancy guards, neither written.**
1. A unit test asserting each integration stub's `namedExports` cover every name
   its endpoint imports from `auth.mjs`. No database, runs in `npm test`, would
   have caught §0.25 the day `requireWrite` landed.
2. A `before()` hook asserting a recently-added column exists, failing with "run
   drizzle-kit push against DATABASE_URL_TEST" rather than a wall of SQL.

**Centralise the nine remaining ownership checks** in accounts, opportunities,
leads and tasks onto `assertOwnership`. Their columns are correctly named — the
registry guard confirms it — so they are not broken, merely nine more chances to
name the wrong one.

**Restyle `LeadImportModal`** onto `CsvImportModal`'s chrome. It predates the
design language (blue `#2563eb` primaries against the guide's `#1c1917`, its own
header, step indicators, drop zone) and carries its own copy of the superseded
column matcher at `:63–76`. Porting retires the matcher in the same pass.

**Scoping questions to settle, not bugs.** `tasks.mjs` GET selects by `orgId`
alone — every rep sees every task in the org (13 distinct owners were visible to
one rep). Contacts GET is likewise unscoped. Mutation is gated in both cases, so
this is visibility. Decide whether either is intended.

**Bulk-import notification for leads.** The new bulk branch deliberately fires no
`lead.created` webhook or automation — N inline dispatches would exceed the budget
`bulkInsert` is bounded by. Needs batched or deferred dispatch if it matters.

**End-to-end importer test.** §0.23 is the fourth cross-layer import defect. One
test running a fixture CSV through all six modules — `csvAutoMap` → `csvMapping` →
`importRows` → `bulkInsert`/`bulkUpsert` → `_sanitize` → `_stage` — asserting the
final row shape for create and overwrite is what closes the class.

**Stray scanner fixture.** `tests/fixtures/scanners/dupes-jsx-attribute - Copy.jsx`
is byte-identical to `dupes-jsx-attribute.jsx` and referenced by no test. One-line
delete.

---

## 6. Environment notes earned the hard way

**`test:int` needs a database and is not part of `npm test`.** It targets
`DATABASE_URL_TEST` — a **different Neon endpoint** from the app's (which is the
`main` branch dev and production share). Confirmed distinct this session.

**Pushing schema to the test database:**

```bash
npx drizzle-kit push --config=drizzle.test.config.ts
```

That config exists because it cannot be done from the shell here. Under MINGW64
the node wrapper reports "stdout is not a tty" and writes nothing to a pipe, so
`export NETLIFY_DATABASE_URL="$(node --env-file=.env -p '…')"` captures an **empty
string** and drizzle-kit reports `url: ''` while appearing to have been
overridden. The config loads `.env` in-process and refuses to run against the app
database by host.

**Never `set -a; source .env`.** `.env` has a space after one `=`, so bash executes
the value and echoes it. That printed a Clerk secret key and two Neon passwords to
the terminal this session. Use `node --env-file=.env` instead.

**`npm run build` needs `VITE_CLERK_PUBLISHABLE_KEY` exported**, or `main.jsx`
short-circuits, rollup tree-shakes the app to ~200 kB and the build guard fails
with five findings. That is §18b4 working, not a repo defect.

**`git status` may show nothing while files are untracked.** This repo has
`status.showUntrackedFiles` behaving that way; it cost two rounds of false
diagnosis. Use `git ls-files`, `git diff --cached --stat` and `git log --oneline`
to establish what is really there.

---

## 7. The thread running through this session

Every defect above was found by running the app **as a rep**, and every one was
invisible to the six gates.

- §0.23 lived *between* the client and the endpoint, each internally coherent.
- §0.24 was a valid JavaScript identifier that happened to name nothing.
- §0.25 was a test suite that is not part of `npm test`.
- §0.26 is two stores of one string with no invariant between them.

The common cause is not carelessness. **The rep path had never been executed by
anything** — not the unit tests, not the integration stubs (Admin hard-coded), not
manual testing, which has always been done from an Admin account. A role matrix
over the mutating endpoints is worth more than another gate.

Related: three claims in the manifest, and two of mine in-session, came from
reading one side of a call chain and inferring the other. The endpoint was read;
the caller was not. That is the same shape as the bugs.
