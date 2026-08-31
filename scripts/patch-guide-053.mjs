// patch-guide-053.mjs — guide edits for the 31 Aug Leads-visibility batch.
// Dry-run by default; pass --apply to write. Refuses on any anchor mismatch.
// Run from repo root: node scripts/patch-guide-053.mjs [--apply]
import { readFileSync, writeFileSync } from 'fs';

const p = 'docs/ACCELEREP_CODING_GUIDE.md';
const apply = process.argv.includes('--apply');
let src = readFileSync(p, 'utf8');
const eol = src.includes('\r\n') ? '\r\n' : '\n';
const L = (...lines) => lines.join('\n');

const edits = [];
const edit = (name, from, to) => edits.push({ name, from, to });

// 1. Header: current-through bump
edit('header current-through',
  '**Updated:** August 28, 2026 · rules current through **§18b24**.',
  '**Updated:** August 31, 2026 · rules current through **§18b25**.');

// 2. §17 read-side bullet gains the toggle
edit('§17 read-side toggle paragraph',
  'Manager narrowing to `managedReps` remains client-side and load-bearing.',
  L('Manager narrowing to `managedReps` remains client-side and load-bearing.',
    '  Since 31 Aug the UNASSIGNED half of the rep predicate is an org policy on',
    '  `leads.mjs` (leads only — the other five keep the fixed predicate):',
    '  `settings.extra.unassignedLeadsVisibleToReps`, default `true`, where an',
    '  absent key reproduces the standing policy so a deploy changes nothing for',
    '  any unconfigured org. Off, the strict branch is',
    '  `!!l.ownerId && l.ownerId === callerId` — the `!!` guard is load-bearing:',
    '  a bare `=== callerId` matches `null === null` and hands an UNRESOLVABLE',
    '  caller exactly the unassigned rows the toggle hides (18b22); with the',
    '  guard, a null caller under the strict policy receives nothing. The config',
    '  read deliberately does NOT copy `getLeadScoring`\'s swallow-and-default',
    '  shape: a failed read throws to the handler\'s 500 instead of silently',
    '  picking a fail direction, because visibility is a boundary, not scoring.',
    '  This is a VISIBILITY policy only — write policy is deliberately unchanged',
    '  (an unassigned lead stays mutable by any writer who reaches it, recorded',
    '  as a decision, not an oversight). Admin UI: Settings → Sales process →',
    '  Lead visibility, with a live policy badge on the card. Every',
    '  `x.ownerId === callerId` comparison in every endpoint must now decide the',
    '  null-null collision explicitly (`!x.ownerId ||` or `!!x.ownerId &&`) —',
    '  enforced by a shape guard in `tests/ownership-registry.test.mjs` that',
    '  scans all six, so the next entity that grows a strict branch is covered',
    '  before it is written.'));

// 3. §18b12 gains the automated-guard note
edit('§18b12 automated guard note',
  L('- A key that is written but **never read** is not a feature. `importPresets` is',
    '  whitelisted so the write lands, but nothing loads it and the write replaces the',
    '  array rather than appending. Recorded as incomplete rather than treated as done.'),
  L('- A key that is written but **never read** is not a feature. `importPresets` is',
    '  whitelisted so the write lands, but nothing loads it and the write replaces the',
    '  array rather than appending. Recorded as incomplete rather than treated as done.',
    '- Since 31 Aug the manual grep is also a PERMANENT TEST for',
    '  `unassignedLeadsVisibleToReps`: `tests/ownership-registry.test.mjs` asserts',
    '  the key appears ≥2× in `settings.mjs` (GET + PUT) and that `leads.mjs`',
    '  reads it with its `?? true` default pinned, and the mutation harness',
    '  drops each half to prove the guard bites. This key does not get to be the',
    '  fifth shipping of this bug. New `settings.extra` keys with a server-side',
    '  consumer should extend that guard rather than rely on the grep.'));

// 4. §19: append the stale-dist-under-dev recognition note
edit('§19 stale-dist note',
  '- The `netlify.toml` configures redirects so all routes serve `index.html` (SPA routing)',
  L('- The `netlify.toml` configures redirects so all routes serve `index.html` (SPA routing)',
    '- **Under `netlify dev`, a stale `dist/` can hijack serving even with the',
    '  `[dev]` proxy block present** — the 31 Aug symptom: `/src/main.jsx` and',
    '  `/@vite/client` returned 200 with Netlify headers and NO `Content-Type`,',
    '  `nosniff` blocked them, React never mounted, and the static crawler',
    '  landing in `index.html` just stayed on screen. Fix is the documented',
    '  stale-build cleanup (`rm -rf node_modules/.vite dist`, restart). Diagnose',
    '  with `curl -sI` on :8888 vs :5173: the port serving',
    '  `Content-Type: text/javascript` is healthy; typeless on :8888 while :5173',
    '  is fine means the CLI answered instead of proxying. Whether the toml',
    '  catch-all also participates under dev was NOT isolated (the cleanup fixed',
    '  it before a redirect-move experiment ran); if the symptom returns on a',
    '  clean tree, that is the next variable to test.'));

// 5. New §18b25 at EOF
edit('append §18b25',
  L('§0.40 labelled itself unverified and was right to. The lesson is not that the note',
    'was wrong — it is that **"these two disagree" almost never means one of them is',
    'miscomparing; it usually means they are not the same field.** Find the two',
    'sources before theorising about the comparison.'),
  L('§0.40 labelled itself unverified and was right to. The lesson is not that the note',
    'was wrong — it is that **"these two disagree" almost never means one of them is',
    'miscomparing; it usually means they are not the same field.** Find the two',
    'sources before theorising about the comparison.',
    '',
    '---',
    '',
    '## 18b25. An Integration Suite Owns Its Org Namespace (hard rule)',
    '',
    'The integration files run as CONCURRENT processes against ONE shared test',
    'database (`node --test` spawns one process per file). Any suite that writes',
    'to a table with a uniqueness constraint spanning org-scoped values —',
    '`users_org_clerk_uq` is the live example — must therefore use org ids no',
    'other suite touches (`itest_leads_A`, not the communal `itest_org_A`).',
    '',
    'How this was learned: the leads suite began seeding a roster row for',
    '`(itest_org_A, u_itest_org_A)` — the same pair the accounts suite re-seeds',
    'in a per-test hook. Result, nondeterministically interleaved: accounts\'',
    'hooks died on duplicate-key for all nine of its tests, and org A\'s caller',
    'resolved to whichever suite\'s row was standing when the 30s caller cache',
    'first filled — so the leads rep tests failed on "a rep must receive their',
    'own lead" with no error anywhere near the actual cause.',
    '',
    '### Rules',
    '',
    '- **One org-id prefix per suite file** (`itest_<entity>_A/B`). A suite that',
    '  starts seeding `users` (or any other constrained shared table) takes its',
    '  own prefix at the same moment.',
    '- **Seed roster rows in `before()`, then call `invalidateRoster()`** — the',
    '  caller cache stores a MISS as `{id: null}` for 30s, so a resolution racing',
    '  the seed leaves the caller owning nothing for the rest of the run, failing',
    '  closed with no error (§0.41 grew the invalidation for production; tests',
    '  need it for the same reason).',
    '- **Exact-count assertions on "sees nothing" tests must state their premise',
    '  in a comment** (the leads null-caller test asserts zero rows and says why',
    '  every org-B row is unassigned by construction). An unstated premise is the',
    '  next suite\'s mystery failure.',
    '- Cross-file collisions present as HOOK failures in the OTHER suite —',
    '  duplicate keys in a file you did not edit after adding seeding to one you',
    '  did is this rule being violated, not that suite\'s bug.'));

// ── Assert every anchor exactly once, then apply ──────────────────────────────
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

// Verify FROM DISK
const back = readFileSync(p, 'utf8');
const checks = [
  ['current through **§18b25**', 1],
  ['## 18b25. An Integration Suite Owns Its Org Namespace', 1],
  ['unassignedLeadsVisibleToReps', 2],   // §17 + §18b12 (the §19 note does not name the key)
  ['a stale `dist/` can hijack serving', 1],
];
let fail = 0;
for (const [needle, n] of checks) {
  const c = back.split(needle).length - 1;
  if (c < n) { console.error(`POST-CHECK FAILED: '${needle}' found ${c}×, expected ≥${n}`); fail++; }
}
console.log(fail ? 'FAILED' : `OK — ${edits.length} edits applied, verified from disk`);
process.exit(fail ? 1 : 0);
