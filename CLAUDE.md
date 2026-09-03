# CLAUDE.md

Standing instructions for every Claude session in this repo. This file is the
index; the three living docs are the encyclopedia. When this file and a doc
disagree, flag it — do not silently pick one.

## What this is

AcceleRep (`sales-pipeline-v2`): multi-tenant B2B SaaS CRM + field-service
dispatch. Sole developer/owner: Jeff, who is learning to code — Claude writes,
verifies, and explains; Jeff runs tests and commits results. Target is a
commercially deployable product with paying customers. Stack: React/Vite
(inline styles, `T.*` tokens), Netlify Functions (ESM `.mjs`), Drizzle ORM,
Neon Postgres (dev and prod SHARE the `main` branch), Clerk Organizations.

## Session start — always, before any code

1. Read `docs/SESSION_HANDOFF.md`. Verify its claims against the repo,
   including its own staleness fingerprints for
   `docs/ACCELEREP_CURRENT_STATE.md` and `docs/ACCELEREP_CODING_GUIDE.md`.
2. `npm run check:handoff` — root and `docs/` handoff copies byte-identical.
3. `git status` — a dirty tree at session start is a finding, not noise.

"Delivered is not committed. The repo's copy is the only committed truth."

## Hard rules

- **Never guess.** Fully understand the problem and read every relevant file
  before writing code. State only what has been read; label anything
  unverified as an open question, never as a likely cause. Jeff explicitly
  does not care about round trips or session length — only accuracy.
- **Never run or advise a destructive command against live/production data**
  (DELETE, `clear=true`, drop, truncate, mass-delete) — not even as a test.
  Verify destructive paths with read-only checks, throwaway accounts, or by
  reasoning from code. (Origin: an Admin `users?clear=true` "test" wiped a
  real org's users table.)
- **Doc ordering (31 Aug 2026):** doc changes are applied, verified from
  disk, and committed the moment they are known — never queued as
  end-of-session patch scripts. `docs/SESSION_HANDOFF.md` is written LAST,
  after everything else is applied and committed, so it only describes
  observed, committed state. Doc edits ride the same commit as the code they
  describe (guide §22).
- **Deliver files as generated**, not batched at session end.
- **Proactively flag** better approaches, cleaner code, or improvements seen
  while working — Jeff decides whether to act.
- **This is multi-tenant SaaS, sold and licensed to multiple organizations.
  Treat every coding decision accordingly.** An organization's data must be
  isolated to that organization: every query, endpoint, cache key, and
  background job is org-scoped — no read or write path may ever return or
  touch another org's rows, and no org's configuration (settings, roles,
  feature toggles, scoring models, templates) may affect another org's
  behavior. Nothing tenant-visible is global unless deliberately designed as
  a product-wide default that per-org config overrides. New features are
  designed org-scoped from the first line, not retrofitted; any test of
  isolation seeds its own org namespace and proves the other org sees
  nothing.
- Dev and prod share one Neon `main` branch: schema changes must be additive
  and nullable; account for both environments in every schema decision.

## Verification chain — in order, before any commit

```
npm run check:tdz
npm run check:inline
npm run check:dupes
npm run check:dbfetch
npm run check:handoff
npm run build            # never `npx vite build` — bypasses the bundle guard
npm test                 # load-bearing for deploy: function-import graph
```

Then: `npm run test:int` (targets `DATABASE_URL_TEST`, not the app DB).
Then: `node scripts/mutate-import.mjs` — must print `Baseline: green.` first;
a red baseline reports a false 100% caught.
Then: rep-path browser check signed in as Karen (`accelerep@outlook.com`,
role `User`) — Admin skips every ownership and role branch, so an Admin-only
pass proves nothing. Read the URL bar and count the orgs before any browser
verification (guide §19).
One commit per verified batch; doc patch in the same commit.

## Identity, ownership, auth

- `users.id` is app-owned `usr_<uuid>`; Clerk identity is `clerk_user_id`.
  Separate identity spaces — never mix.
- Ownership auth uses `ownerId` on all six Tier 1 tables via
  `assertOwnership()` / `ownerColumnOf()`. `resolveOwnerId` 409s on ambiguity.
- The `null === null` collision: an unresolvable caller and an unassigned row
  both read `null` — guard with `!!row.ownerId` wherever it matters.
- Role gate is an allowlist (`APP_ROLES` / `isAppRole`); unrecognised values
  are denied. Stored role `'User'` displays as "Sales Rep" — never conflate.
- Managers: server-side `canSeeAll` hands them the whole org; client
  `managedReps` narrowing is the only Manager scoping. Do not delete the
  Manager branch of `isRepVisible`.

## Endpoint and data invariants

- `sanitize()` is a full-row builder: a partial PUT payload wipes absent
  columns unless the endpoint merges first —
  `sanitize({ ...existing, ...data })` (the users/leads pattern). Check this
  shape on every endpoint before trusting its PUT; it has been wrong twice.
- `bulkUpsert` must fail closed: `undefined` reads as `null` and can treat
  every owned row as unassigned.
- Every `settings.extra` key must appear in BOTH the GET response object and
  the PUT read-then-merge in `settings.mjs` — missing either silently resets.
- Persistent data rule: anything that must survive a refresh is saved via
  `dbFetch` immediately after the local state update. `setState` alone is
  never sufficient.
- `dbFetch` returns the raw `Response` — caller must `.json()`.

## Frontend conventions

- Never define sub-components inside a parent component function — module
  scope only, data as props (root cause of repeated focus-loss/scroll bugs).
- Settings detail panels read the `settings` prop from AdminView; never
  self-fetch.
- New modal state: `useModalState.js` → destructure in `App.jsx` → add to
  `appContextValue`. The wiring file is `App.jsx`, not `AppContext.jsx`.
- Popovers: `getBoundingClientRect()` + `position: fixed`.
- UI follows `docs/`-adjacent style guide (warm stone palette, Plus Jakarta
  Sans, near-black buttons, red only for delete).

## Environment and tooling

- Windows, Git Bash. `node --env-file=.env` (never `set -a; source .env`).
- No Python on this machine; no `sed`. Multi-line edits: Node script with
  asserted occurrence counts, dry-run default, `--apply` flag, write once,
  re-read FROM DISK to verify. `App.jsx` is CRLF — preserve it.
- `npm run build` requires `VITE_CLERK_PUBLISHABLE_KEY` exported.
- DB env var is `NETLIFY_DATABASE_URL`; integration tests use
  `DATABASE_URL_TEST`.
- Stale local build: stop `netlify dev`, `rm -rf node_modules/.vite dist`,
  restart, hard-refresh — suspect this before diagnosing code. The gate
  chain's own `npm run build` writes `dist/` and re-arms this every run:
  `rm -rf dist` after any local gate build, before any browser pass.
- Stale local FUNCTION: `netlify dev` also caches compiled functions under
  `.netlify/functions-serve`. A 500 from one endpoint with "module is not
  defined in ES module scope" in the server log is that cache serving a
  stale CommonJS copy, not the code — stop the server,
  `rm -rf .netlify/functions-serve`, restart (state §0.79).
- Dev: `accelerep.netlify.app` (branch `dev`, Clerk `pk_test_`). Prod:
  `salespipelinetracker.com` (branch `master`). No `main` branch.
- Integration suites that seed `users` use their own org namespace prefix
  (e.g. `itest_leads_A/B`) to avoid cross-suite collisions.

## The living docs

- `docs/ACCELEREP_CODING_GUIDE.md` — rules and their origins
- `docs/ACCELEREP_CURRENT_STATE.md` — what exists and why
- `docs/SESSION_HANDOFF.md` (synced copy at repo root) — last session's
  observed state; written last, read first
