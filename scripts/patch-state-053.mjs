// patch-state-053.mjs — state doc edits for the 31 Aug Leads-visibility batch.
// Dry-run by default; pass --apply to write. Refuses on any anchor mismatch.
// Run from repo root: node scripts/patch-state-053.mjs [--apply]
import { readFileSync, writeFileSync } from 'fs';

const p = 'docs/ACCELEREP_CURRENT_STATE.md';
const apply = process.argv.includes('--apply');
let src = readFileSync(p, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
const L = (...lines) => lines.join('\n');

const edits = [];
const edit = (name, from, to) => edits.push({ name, from, to });

// 1. Header date
edit('header date',
  '**Updated:** August 28, 2026',
  '**Updated:** August 31, 2026');

// 2. Verified-at line — full replacement
edit('verified-at line',
  '**Verified at:** all six gates green · **276 tests** · **26 integration tests** · **80/80 mutations caught, ON A VERIFIED GREEN BASELINE** · build 2,459 kB · **after-counts verified on dev, both roles, 28 Aug** — Karen 144/1533/25/22, exactly matching the predicate applied over the Admin dataset; Admin unchanged at baseline (§0.50) · **prod rep-path verified, both roles, 28 Aug** (§0.50)',
  '**Verified at:** all six gates green (143 tdz files) · **278 tests** · **31 integration tests** · **85/85 mutations caught, ON A VERIFIED GREEN BASELINE, zero STALE** · build 2,465 kB · **toggle browser-verified on LOCAL dev, both roles, 31 Aug** — Karen 4 (strict) / 23 (permissive), reconciled ROW-LEVEL against `ownerId` (4 × her `usr_…`, 19 × null, zero foreign owners); Admin 23 in both states; badge round-trip and Mine/All persistence confirmed (§0.53). The 28-Aug dev/prod after-counts (§0.50) still stand for the fixed predicate.');

// 3. New Batch line; current Batch demotes to Prior batch
edit('batch demotion + new batch line',
  '**Batch:** **the server is now the boundary on reads**',
  L('**Batch:** **the unassigned half of the leads read policy is now an admin toggle** — `settings.extra.unassignedLeadsVisibleToReps` (default true; absent key = standing policy), enforced in `leads.mjs` GET with an explicit `!!l.ownerId` null-collision guard (18b22) · new `LeadVisibilityDetail` panel, four-step wiring, live policy badge · **Mine/All on Leads** keyed on `ownerId` (norm() gains the passthrough; never the display name) · **first rep-role integration coverage for `leads.mjs`** — 5 tests incl. the unresolvable-caller-under-strict-policy case asserting ZERO rows · two permanent unit guards: the null-null-collision SHAPE guard across all six endpoints, and 18b12-as-a-test for this key · the itest **org-namespace collision** found and fixed (guide §18b25) · harness anchor #14 repointed, +5 mutations, **85/85** · **local `netlify dev` failure root-caused to a stale `dist/`** (typeless module responses; the documented cleanup fixed it — guide §19 gains the recognition note; a toml-redirect hypothesis recorded as UNPROVEN, not shipped) · guide **§18b25** (§0.53)',
    '**Prior batch:** **the server is now the boundary on reads**'));

// 4. New §0.53 after §0.52
edit('insert §0.53',
  L('tabs. Unassigned rows remain visible under Mine. Default is Mine everywhere',
    '(the handoff\'s recorded design) — note this is the first scoping an Admin sees',
    'on these tabs, so an Admin’s first load shows own + unassigned until they',
    'click All once; the choice then persists. No new tests — the six gates plus a',
    'browser pass per tab are the verification.',
    '',
    '---'),
  L('tabs. Unassigned rows remain visible under Mine. Default is Mine everywhere',
    '(the handoff\'s recorded design) — note this is the first scoping an Admin sees',
    'on these tabs, so an Admin’s first load shows own + unassigned until they',
    'click All once; the choice then persists. No new tests — the six gates plus a',
    'browser pass per tab are the verification.',
    '',
    '---',
    '',
    '### 0.53 Lead visibility toggle, Mine/All on Leads, and the first rep-role leads tests (31 Aug)',
    '',
    'The Leads scoping session the last two handoffs deferred — the admin toggle,',
    'the `settings.extra` key, both halves of `settings.mjs` and the filter change,',
    'landed together. Plus everything the session surfaced on the way.',
    '',
    '**The toggle.** `settings.extra.unassignedLeadsVisibleToReps`, default `true`,',
    'absent key = the standing policy so the deploy changes nothing for any',
    'existing org. `leads.mjs` GET (leads ONLY) branches the rep predicate:',
    '',
    '```js',
    'results = unassignedVisible',
    '    ? results.filter(l => !l.ownerId || l.ownerId === callerId)',
    '    : results.filter(l => !!l.ownerId && l.ownerId === callerId);',
    '```',
    '',
    'The `!!l.ownerId` guard is the load-bearing character: bare `=== callerId`',
    'matches `null === null`, handing an UNRESOLVABLE caller exactly the unassigned',
    'rows the toggle hides (18b22 — two absences comparing equal in the permissive',
    'direction). The config read throws to the outer 500 instead of copying',
    '`getLeadScoring`\'s swallow-and-default: a visibility boundary must not',
    'silently pick a fail direction. **Write policy deliberately unchanged** — an',
    'unassigned lead stays mutable by any writer who reaches it; visibility ≠',
    'authorization, recorded as a decision. Panel: `LeadVisibilityDetail.jsx`',
    '(salesProcess), full four-step wiring, live badge on the card',
    '("Unassigned visible to reps" / "Reps see assigned only").',
    '',
    '**Mine/All on Leads** — the §0.52 pattern with one Leads-specific finding:',
    '`norm()` carried only the display name (`assignee`), so it gained an',
    '`ownerId` passthrough and the scope keys on that, never the name. Control on',
    'the right of the Triage/Cockpit strip, key `tab:leads:scope`, default Mine.',
    '',
    '**Tests — the §0.33/§0.50 leads debt starts getting paid.** Five integration',
    'tests, the endpoint\'s first rep-role coverage: own+unassigned under the',
    'default; own-only under strict; Admin identical either way; stored `true` ≡',
    'absent; and the unresolvable-caller-under-strict case asserting **exactly',
    'zero rows** — the test that catches the `!!` guard\'s removal. Roster seeding',
    'follows the cache discipline (`before()` seeds, then `invalidateRoster()` —',
    'the caller cache stores a miss as `{id: null}` for 30s). Two permanent unit',
    'guards in `ownership-registry.test.mjs`: a SHAPE guard requiring every',
    '`x.ownerId === callerId` in every endpoint to decide the null-null collision',
    'explicitly, and 18b12-as-a-test (≥2 hits in `settings.mjs`, `?? true` pinned',
    'in `leads.mjs`). Harness: anchor #14 repointed to the new ternary, five new',
    'mutations (guard dropped, default flipped, helper decorative, each settings',
    'half deleted), **85/85 on a printed green baseline, zero STALE**.',
    '',
    '**The itest namespace collision (now guide §18b25).** Seeding',
    '`(itest_org_A, u_itest_org_A)` collided with the accounts suite\'s per-test',
    're-seed of the identical pair — three concurrent processes, one DB, one',
    'unique constraint. Accounts died on duplicate-key in its hooks; org A\'s',
    'caller resolved to whichever row was standing when the 30s cache filled, so',
    'the leads rep tests failed nowhere near the cause. Fix: the leads suite owns',
    '`itest_leads_A/B`. Rule: one org prefix per suite that seeds constrained',
    'shared tables.',
    '',
    '**Dev-environment failure, fixed (environmental — no code change rides this',
    'commit for it).** Local `netlify dev` served Vite module URLs',
    '(`/src/main.jsx`, `/@vite/client`) as typeless 200s carrying Netlify\'s own',
    'headers; `nosniff` blocked them, React never mounted, and the static crawler',
    'landing in `index.html` stayed on screen. A stale `dist/` from earlier',
    'builds was present, and the documented stale-build cleanup',
    '(`rm -rf node_modules/.vite dist` + restart) fixed it — WITH the `[dev]`',
    'proxy block in place, so the toml comment\'s "falls back to the stale dist"',
    'warning understates when the fallback can bite. A toml-catch-all-redirect',
    'hypothesis was formed and a move-to-`public/_redirects` fix drafted but',
    'NEVER APPLIED — the cleanup had already fixed it, which was only recognised',
    'when `git add public/_redirects` found no file (the truncated-curl error,',
    'handoff §2). Recorded as unproven, not as shipped. Diagnosis chain worth',
    'keeping: "Rewrote URL to /index.html" dev-log lines pairing with the failed',
    'modules; `curl -sI` on :8888 vs :5173 separates the CLI from Vite. Guide',
    '§19 gains the recognition note.',
    '',
    '**Browser verification (local dev, 31 Aug).** Admin: 23 leads in BOTH toggle',
    'states; badge round-trip confirmed; Mine/All present and persisting. Karen:',
    '**4 under strict, 23 under permissive** — reconciled at the ROW level via an',
    'authorized fetch: exactly 4 rows carry her `usr_e7e09733-…`, the other 19',
    'are `ownerId: null`, zero foreign owners. Thirteen of the 19 are the ZZFX',
    'pattern live in real data — stale `assignedTo` display names on',
    '`ownerId: null` rows — so the UI shows them "assigned" while policy',
    '(correctly) treats them as unassigned, and the name-based Unassigned',
    'chips/Distribute counts undercount the pool (6 shown vs 19 actual).',
    '**Hygiene item recorded:** clear stale `assignedTo` strings where `ownerId`',
    'is null, and move the Unassigned chips to `ownerId` (the §0.50 remnants',
    'list, one more entry). Also observed on local dev, both pre-existing:',
    '`documents.mjs` 500s locally (likely R2 env, untriaged) and the non-writer',
    'settings auto-PUT 403 noise (the known `useSettings` toast debt).',
    '',
    '---'));

// ── Assert, apply, verify ─────────────────────────────────────────────────────
let bad = 0;
for (const e of edits) {
  const from = e.from.split('\n').join(eol);
  const hits = src.split(from).length - 1;
  if (hits !== 1) { console.error(`REFUSING [${e.name}]: anchor matched ${hits}×, expected exactly 1`); bad++; }
}
if (bad) process.exit(1);
if (!apply) { console.log(`DRY RUN — all ${edits.length} anchors match exactly once. Re-run with --apply.`); process.exit(0); }

for (const e of edits) {
  const from = e.from.split('\n').join(eol);
  const to = e.to.split('\n').join(eol);
  src = src.replace(from, to);
}
writeFileSync(p, src);

const back = readFileSync(p, 'utf8');
const checks = [
  ['### 0.53 Lead visibility toggle', 1],
  ['**278 tests**', 1],
  ['85/85', 2],                        // verified-at + §0.53 body
  ['itest_leads_A', 1],
];
let fail = 0;
for (const [needle, n] of checks) {
  const c = back.split(needle).length - 1;
  if (c < n) { console.error(`POST-CHECK FAILED: '${needle}' found ${c}×, expected ≥${n}`); fail++; }
}
console.log(fail ? 'FAILED' : `OK — ${edits.length} edits applied, verified from disk`);
process.exit(fail ? 1 : 0);
